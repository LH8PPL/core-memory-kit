// @doors: 1, 2, 3
// Door 4 N/A: capture-prompt writes the user-turn portion of the transcript that capture-turn (Door 4 IPC sender) later reads; THIS test boundary is the transcript writer itself, not the IPC surface. The IPC contract is pinned in cli-capture-turn.test.js + cli-auto-extract.test.js.
// Door 5 N/A: capture-prompt doesn't emit NDJSON observability; the transcript write IS the observability surface for the user-turn capture.

// Tests for Task 19 — cmk-capture-prompt UserPromptSubmit hook (T-016).
// Per tasks.md 19.4:
//   - Test prompt with <private>SENTINEL_STRING</private>: transcript
//     has [private content redacted]; grep for SENTINEL_STRING in
//     context/ returns 0 hits
//   - Test prompt with <retain>important</retain>: transcript preserves
//     the <retain> tags verbatim
//   - Test prompt without privacy tags: transcript contains prompt
//     verbatim with timestamp + role marker
//   - Test hook returns {"continue": true} within 100 ms (timer assertion)
//   - Test malformed stdin JSON: hook exits 0, logs error to stderr
//
// Boundary-test discipline:
//   - capturePrompt({payload, projectRoot, now}) is the deep module
//     boundary — text in, file on disk + result struct out. Tests
//     assert what landed on disk + the return shape, NOT how
//     sanitization is implemented internally.
//   - The bin wrapper is also tested for its observable behavior
//     (stdin handling, exit code, stdout shape).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capturePrompt, buildMemoryHint } from '../packages/cli/src/capture-prompt.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const BIN_PATH = join(REPO_ROOT, 'plugin', 'bin', 'cmk-capture-prompt' + '.mjs');

function walkContextForSentinel(root, needle) {
  const hits = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.isFile()) {
        try {
          const text = readFileSync(p, 'utf8');
          if (text.includes(needle)) hits.push(p);
        } catch {
          // binary/unreadable — ignore
        }
      }
    }
  }
  walk(root);
  return hits;
}

describe('Task 19 — capturePrompt() boundary', () => {
  let sandbox;
  let projectRoot;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-capture-prompt-test-'));
    projectRoot = join(sandbox, 'proj');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('happy path — plain prompt', () => {
    it('returns action: "appended" and a transcript path under context/transcripts/', () => {
      const r = capturePrompt({
        payload: { prompt: 'hello world' },
        projectRoot,
        now: '2026-05-25T10:30:00Z',
      });
      expect(r.action).toBe('appended');
      expect(r.transcriptPath).toBe(
        join(projectRoot, 'context', 'transcripts', '2026-05-25.md'),
      );
      expect(existsSync(r.transcriptPath)).toBe(true);
    });

    it('transcript file contains the prompt verbatim with timestamp + role marker', () => {
      const r = capturePrompt({
        payload: { prompt: 'hello world' },
        projectRoot,
        now: '2026-05-25T10:30:00Z',
      });
      const text = readFileSync(r.transcriptPath, 'utf8');
      expect(text).toContain('hello world');
      expect(text).toContain('2026-05-25T10:30:00Z');
      // Role marker — the format anchors on a heading-shaped marker so
      // downstream readers (auto-extract, viewer) can scan by it.
      expect(text).toMatch(/##\s+\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\s+—\s+user/);
    });

    it('transcript filename uses the date portion of `now` (not local time)', () => {
      capturePrompt({
        payload: { prompt: 'first' },
        projectRoot,
        now: '2026-05-25T23:59:59Z',
      });
      capturePrompt({
        payload: { prompt: 'second' },
        projectRoot,
        now: '2026-05-26T00:00:01Z',
      });
      expect(
        existsSync(join(projectRoot, 'context', 'transcripts', '2026-05-25.md')),
      ).toBe(true);
      expect(
        existsSync(join(projectRoot, 'context', 'transcripts', '2026-05-26.md')),
      ).toBe(true);
    });

    it('multiple prompts on the same day append to one file', () => {
      const r1 = capturePrompt({
        payload: { prompt: 'first' },
        projectRoot,
        now: '2026-05-25T10:00:00Z',
      });
      const r2 = capturePrompt({
        payload: { prompt: 'second' },
        projectRoot,
        now: '2026-05-25T11:00:00Z',
      });
      expect(r1.transcriptPath).toBe(r2.transcriptPath);
      const text = readFileSync(r1.transcriptPath, 'utf8');
      expect(text).toContain('first');
      expect(text).toContain('second');
      // Ordering: first append is above second append
      expect(text.indexOf('first')).toBeLessThan(text.indexOf('second'));
    });
  });

  describe('<private>...</private> stripping (19.1)', () => {
    it('replaces a single <private> block with [private content redacted]', () => {
      const r = capturePrompt({
        payload: {
          prompt:
            'before <private>__PRIVATE_PROMPT_SENTINEL__</private> after',
        },
        projectRoot,
        now: '2026-05-25T10:00:00Z',
      });
      const text = readFileSync(r.transcriptPath, 'utf8');
      expect(text).toContain('before');
      expect(text).toContain('[private content redacted]');
      expect(text).toContain('after');
      expect(text).not.toContain('__PRIVATE_PROMPT_SENTINEL__');
    });

    it('strips MULTIPLE <private> blocks in a single prompt', () => {
      const r = capturePrompt({
        payload: {
          prompt:
            '<private>SECRET_ONE</private> mid <private>SECRET_TWO</private> end',
        },
        projectRoot,
        now: '2026-05-25T10:00:00Z',
      });
      const text = readFileSync(r.transcriptPath, 'utf8');
      expect(text).not.toContain('SECRET_ONE');
      expect(text).not.toContain('SECRET_TWO');
      // Two redacted placeholders, one per stripped block
      const matches = text.match(/\[private content redacted\]/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('private content NEVER touches any file under context/ (recursive grep)', () => {
      capturePrompt({
        payload: {
          prompt: 'wrap <private>__PRIVATE_PROMPT_SENTINEL__</private>',
        },
        projectRoot,
        now: '2026-05-25T10:00:00Z',
      });
      const hits = walkContextForSentinel(
        join(projectRoot, 'context'),
        '__PRIVATE_PROMPT_SENTINEL__',
      );
      expect(hits).toEqual([]);
    });

    it('strips multiline <private> blocks (private content can span lines)', () => {
      const r = capturePrompt({
        payload: {
          prompt:
            'open <private>line one\nline two\nline three</private> close',
        },
        projectRoot,
        now: '2026-05-25T10:00:00Z',
      });
      const text = readFileSync(r.transcriptPath, 'utf8');
      expect(text).not.toContain('line one');
      expect(text).not.toContain('line two');
      expect(text).not.toContain('line three');
      expect(text).toContain('[private content redacted]');
    });
  });

  describe('<retain>...</retain> preservation (19.2)', () => {
    it('preserves <retain> tags verbatim in the transcript', () => {
      const r = capturePrompt({
        payload: { prompt: 'normal <retain>important fact</retain> tail' },
        projectRoot,
        now: '2026-05-25T10:00:00Z',
      });
      const text = readFileSync(r.transcriptPath, 'utf8');
      expect(text).toContain('<retain>important fact</retain>');
    });

    it('preserves <retain> when mixed with stripped <private>', () => {
      const r = capturePrompt({
        payload: {
          prompt:
            '<retain>keep this</retain> and <private>drop this</private>',
        },
        projectRoot,
        now: '2026-05-25T10:00:00Z',
      });
      const text = readFileSync(r.transcriptPath, 'utf8');
      expect(text).toContain('<retain>keep this</retain>');
      expect(text).not.toContain('drop this');
    });
  });

  describe('input validation + safety', () => {
    it('payload without prompt field: action: "noop", no file written', () => {
      const r = capturePrompt({
        payload: { other: 'noise' },
        projectRoot,
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('noop');
      expect(
        existsSync(join(projectRoot, 'context', 'transcripts')),
      ).toBe(false);
    });

    it('empty prompt: action: "noop" (nothing meaningful to capture)', () => {
      const r = capturePrompt({
        payload: { prompt: '' },
        projectRoot,
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('noop');
    });

    it('completes within the NFR-1 500ms in-process budget', () => {
      // Per requirements.md §387 (NFR-1 scope clarification): the
      // 500ms in-process budget applies to capturePrompt() — same
      // class as injectContext / captureTurn / observeEdit. The
      // earlier 100ms threshold was aspirational tightness, not the
      // published SLA, and flaked under Windows full-suite contention
      // with disk I/O. Aligning to the actual contract.
      const t0 = Date.now();
      capturePrompt({
        payload: { prompt: 'a prompt with some content' },
        projectRoot,
        now: '2026-05-25T10:00:00Z',
      });
      const elapsed = Date.now() - t0;
      expect(elapsed).toBeLessThan(500);
    });
  });
});

describe('Task 75.2 — buildMemoryHint (the "memory available" recall nudge)', () => {
  let sandbox, projectRoot;
  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-memory-hint-'));
    projectRoot = join(sandbox, 'proj');
    mkdirSync(join(projectRoot, 'context', 'memory'), { recursive: true });
  });
  afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

  const seedIndex = () =>
    writeFileSync(
      join(projectRoot, 'context', 'memory', 'INDEX.md'),
      '# Granular memory index — project tier\n\n## Files\n\n- (P-AAAAAAAA) [project] [x](project_x.md) — y\n',
      'utf8',
    );

  it('emits a one-line hint naming the memory-search skill when memory exists + prompt is substantive', () => {
    seedIndex();
    const hint = buildMemoryHint({ projectRoot, prompt: 'what did we decide about the deploy target?' });
    expect(hint).toMatch(/memory-search/);
    expect(hint).toMatch(/claude-memory-kit/);
    expect(hint).not.toMatch(/\n/); // ONE line — per-prompt token cost stays tiny
  });

  it('returns null for short prompts (<10 chars — "ok", "go", "yes" must not pay the hint)', () => {
    seedIndex();
    expect(buildMemoryHint({ projectRoot, prompt: 'go' })).toBe(null);
    expect(buildMemoryHint({ projectRoot, prompt: 'ok thanks' })).toBe(null);
  });

  it('returns null when there is no memory archive to recall from (no INDEX.md)', () => {
    expect(
      buildMemoryHint({ projectRoot, prompt: 'what did we decide about the deploy target?' }),
    ).toBe(null);
  });

  it('returns null for a scaffolded-but-EMPTY INDEX.md (fresh install must not advertise memory it does not have)', () => {
    // cmk install scaffolds INDEX.md on every project — existence alone is
    // always true post-install. The hint requires at least one entry.
    writeFileSync(
      join(projectRoot, 'context', 'memory', 'INDEX.md'),
      '# Granular memory index — project tier\n\n## Files\n\n',
      'utf8',
    );
    expect(
      buildMemoryHint({ projectRoot, prompt: 'what did we decide about the deploy target?' }),
    ).toBe(null);
  });

  it('returns null for a missing/empty prompt (never throws)', () => {
    seedIndex();
    expect(buildMemoryHint({ projectRoot, prompt: '' })).toBe(null);
    expect(buildMemoryHint({ projectRoot })).toBe(null);
  });
});

describe('Task 19 — bin/cmk-capture-prompt (hook handler — node bin)', () => {
  let sandbox;
  let projectRoot;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-capture-prompt-bin-test-'));
    projectRoot = join(sandbox, 'proj');
    // cwd: projectRoot below requires the dir to exist before spawn
    mkdirSync(projectRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('exits 0 with continue:true on a valid prompt payload', () => {
    const r = spawnSync(process.execPath, [BIN_PATH], {
      input: JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        prompt: 'bin wrapper test prompt',
      }),
      encoding: 'utf8',
      cwd: projectRoot,
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed).toMatchObject({ continue: true });
  });

  it('writes the transcript to context/transcripts/<today>.md', () => {
    spawnSync(process.execPath, [BIN_PATH], {
      input: JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        prompt: 'wrapper-prompt-marker',
      }),
      encoding: 'utf8',
      cwd: projectRoot,
    });
    const dir = join(projectRoot, 'context', 'transcripts');
    expect(existsSync(dir)).toBe(true);
    const files = readdirSync(dir);
    expect(files.length).toBe(1);
    const text = readFileSync(join(dir, files[0]), 'utf8');
    expect(text).toContain('wrapper-prompt-marker');
  });

  it('malformed stdin JSON: exits 0, logs error to stderr, no file written', () => {
    const r = spawnSync(process.execPath, [BIN_PATH], {
      input: 'not valid json {{{',
      encoding: 'utf8',
      cwd: projectRoot,
    });
    expect(r.status).toBe(0);
    expect(r.stderr.toLowerCase()).toMatch(/cmk-capture-prompt|json|parse/);
    expect(existsSync(join(projectRoot, 'context', 'transcripts'))).toBe(false);
  });

  // Task 75.2 — the bin emits the memory hint as additionalContext (the
  // MODEL-facing field per Anthropic's hooks doc; memsearch's systemMessage
  // is user-display) so Claude stays aware mid-session that the deep
  // archive + memory-search skill exist.
  it('75.2: with a memory archive present, stdout JSON carries hookSpecificOutput.additionalContext (Door 1)', () => {
    mkdirSync(join(projectRoot, 'context', 'memory'), { recursive: true });
    writeFileSync(
      join(projectRoot, 'context', 'memory', 'INDEX.md'),
      '# Granular memory index — project tier\n\n## Files\n\n- (P-AAAAAAAA) [project] [x](project_x.md) — y\n',
      'utf8',
    );
    const r = spawnSync(process.execPath, [BIN_PATH], {
      input: JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        prompt: 'what did we decide about the deploy target last week?',
      }),
      encoding: 'utf8',
      cwd: projectRoot,
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.continue).toBe(true);
    expect(parsed.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit');
    expect(parsed.hookSpecificOutput?.additionalContext).toMatch(/memory-search/);
    // The capture itself still happened (the hint never replaces the job).
    expect(existsSync(join(projectRoot, 'context', 'transcripts'))).toBe(true);
  });

  it('75.2: short prompt → plain continue, no additionalContext (no hint noise on "ok"/"go")', () => {
    mkdirSync(join(projectRoot, 'context', 'memory'), { recursive: true });
    writeFileSync(
      join(projectRoot, 'context', 'memory', 'INDEX.md'),
      '# Granular memory index — project tier\n\n## Files\n\n- (P-AAAAAAAA) [project] [x](project_x.md) — y\n',
      'utf8',
    );
    const r = spawnSync(process.execPath, [BIN_PATH], {
      input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'go' }),
      encoding: 'utf8',
      cwd: projectRoot,
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.continue).toBe(true);
    expect(parsed.hookSpecificOutput).toBeUndefined();
  });
});
