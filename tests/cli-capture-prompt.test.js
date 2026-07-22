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
import {
  capturePrompt,
  buildMemoryHint,
  clearsBm25Floor,
  HINT_BM25_SCORE_FLOOR,
  STATIC_MEMORY_HINT,
} from '../packages/cli/src/capture-prompt.mjs';
import { openIndexDb, getIndexDbPath } from '../packages/cli/src/index-db.mjs';
import { readRecallLog, recallLogPath } from '../packages/cli/src/recall-log.mjs';

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
        join(projectRoot, 'context', 'transcripts', '2026-05-25.live.md'),
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
        existsSync(join(projectRoot, 'context', 'transcripts', '2026-05-25.live.md')),
      ).toBe(true);
      expect(
        existsSync(join(projectRoot, 'context', 'transcripts', '2026-05-26.live.md')),
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
    expect(hint).toMatch(/core-memory-kit/);
    // Cut-gate v0.3.1: the hint also cues STRUCTURE/architecture recall — those
    // questions were re-deriving from code instead of recalling (the recall hole).
    expect(hint).toMatch(/structure|architecture/i);
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

// Task 233 (ADR-0024): the gated cheap-index pointer hint — the static line
// upgrades to a real FTS5 query over the prompt's terms, injecting ≤3 index
// lines (id · title · date, NEVER bodies) when the top hit clears a bm25 score
// floor. Zero LLM. Fail-open: any error → the byte-identical static hint.
describe('Task 233 — buildMemoryHint evidence upgrade (gated cheap-index pointer)', () => {
  let sandbox, projectRoot;
  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-hint-evidence-'));
    projectRoot = join(sandbox, 'proj');
    mkdirSync(join(projectRoot, 'context', 'memory'), { recursive: true });
  });
  afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

  function seedIndexWithEntry() {
    writeFileSync(
      join(projectRoot, 'context', 'memory', 'INDEX.md'),
      '# Granular memory index — project tier\n\n## Files\n\n' +
        '- (P-DEP2ABCD) [project] [Deploy target decision](project_deploy.md) — we chose hetzner\n',
      'utf8',
    );
  }
  function insertObs(db, { id, body, heading = 'H', source_file = 'f.md' }) {
    db.prepare(
      `INSERT INTO observations
        (id, tier, source_file, source_line, source_sha1, heading_path, body,
         write_source, trust, created_at, superseded_by, deleted_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, 'P', source_file, 1, 'a'.repeat(40), heading, body,
      'user-explicit', 'high', Date.parse('2026-05-27T10:00:00Z'), null, null, null,
    );
  }
  // Realistic corpus: bm25 IDF is corpus-dependent (a 2-doc index gives a
  // near-zero score for a common term — the floor is meaningless there). Seed
  // filler docs so a genuine match scores in the production −4..−12 range, well
  // past the −0.5 floor, exactly as it does on a real ~2000-fact corpus.
  const B32 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // kit alphabet (no 0/O/1/l/I/8)
  function fillerId(i) {
    let s = '';
    let n = i + 1000;
    for (let k = 0; k < 8; k++) { s = B32[n % 31] + s; n = Math.floor(n / 31) + 7; }
    return 'P-' + s;
  }
  const FILLERS = [
    'ci pipeline uses github actions', 'the readme documents install steps',
    'semantic backend uses onnx embedder', 'validate docs checks references',
    'cron schedules nightly distill', 'frontmatter yaml parser handles crlf',
    'poison guard screens secrets', 'the mcp server exposes tools',
    'trust score blends into ranking', 'conflict queue resolves duplicates',
  ];
  function seedCorpus(db) {
    for (let i = 0; i < 40; i++) insertObs(db, { id: fillerId(i), body: `${FILLERS[i % FILLERS.length]} number ${i}`, source_file: `f${i}.md` });
  }
  function seedDbFact({
    id = 'P-DEP2ABCD',
    body = 'we chose hetzner as the production deploy target',
    heading = 'Deploy target decision',
    source_file = 'project_deploy.md',
    withCorpus = true,
  } = {}) {
    const db = openIndexDb({ projectRoot });
    if (withCorpus) seedCorpus(db);
    insertObs(db, { id, body, heading, source_file });
    db.close();
  }

  it('injects up to 3 INDEX LINES (id · title · date, never bodies) when the top hit clears the bm25 floor', () => {
    seedIndexWithEntry();
    seedDbFact();
    const hint = buildMemoryHint({
      projectRoot,
      prompt: 'what did we decide about the deploy target for production?',
    });
    expect(hint).toMatch(/P-DEP2ABCD/); // the index line's id
    expect(hint).toMatch(/Deploy target decision/); // the title (from INDEX.md)
    expect(hint).toMatch(/2026-05-27/); // the date (from created_at)
    expect(hint).toMatch(/memory-search/); // still points at the skill
    // NEVER a body — the raw fact body must not leak into the hint.
    expect(hint).not.toContain('we chose hetzner as the production deploy target');
    // header + ≤3 index lines + one pointer line
    expect(hint.split('\n').length).toBeLessThanOrEqual(5);
  });

  it('caps the index lines at 3 even when more hits clear the floor', () => {
    writeFileSync(
      join(projectRoot, 'context', 'memory', 'INDEX.md'),
      '# Granular memory index — project tier\n\n## Files\n\n' +
        '- (P-DEP2ABCD) [project] [Deploy one](f1.md) — x\n' +
        '- (P-DEP2ABCE) [project] [Deploy two](f2.md) — x\n' +
        '- (P-DEP2ABCF) [project] [Deploy three](f3.md) — x\n' +
        '- (P-DEP2ABCG) [project] [Deploy four](f4.md) — x\n',
      'utf8',
    );
    const db = openIndexDb({ projectRoot });
    seedCorpus(db);
    for (const id of ['P-DEP2ABCD', 'P-DEP2ABCE', 'P-DEP2ABCF', 'P-DEP2ABCG']) {
      insertObs(db, { id, body: `deploy target production choice ${id}`, source_file: `${id}.md` });
    }
    db.close();
    const hint = buildMemoryHint({
      projectRoot,
      prompt: 'what did we decide about the deploy target production choice?',
    });
    const idLines = hint.split('\n').filter((l) => /^- P-/.test(l));
    expect(idLines.length).toBeLessThanOrEqual(3);
  });

  it('bm25 floor budget pair: at-cap clears, over-cap (below the bm25 floor) does not', () => {
    // HINT_BM25_SCORE_FLOOR is the WORST acceptable bm25 rank (FTS5 bm25 is
    // negative-better, so a hit clears the floor when score <= FLOOR).
    expect(clearsBm25Floor(HINT_BM25_SCORE_FLOOR)).toBe(true); // at-cap: exactly at the floor qualifies
    expect(clearsBm25Floor(HINT_BM25_SCORE_FLOOR + 0.1)).toBe(false); // over-cap: below the bm25 floor → static hint
    expect(clearsBm25Floor(HINT_BM25_SCORE_FLOOR - 5)).toBe(true); // well past the floor (more relevant)
    expect(clearsBm25Floor(NaN)).toBe(false);
    expect(clearsBm25Floor(undefined)).toBe(false);
  });

  it('falls back to the byte-identical STATIC hint below the ~20-char query gate (10..19 chars)', () => {
    seedIndexWithEntry();
    seedDbFact();
    const hint = buildMemoryHint({ projectRoot, prompt: 'deploy target?' }); // 14 chars: >=10, <20
    expect(hint).toBe(STATIC_MEMORY_HINT);
  });

  it('the STATIC hint text is byte-identical to the pre-233 wording (other surfaces match on it)', () => {
    expect(STATIC_MEMORY_HINT).toBe(
      '[core-memory-kit] Recorded memory available beyond the session snapshot — ' +
        'use the memory-search skill when the answer may already be recorded (prior decisions, history, conventions, ' +
        'project structure/architecture, where things live). Recall it; do not re-read the code to reconstruct it.',
    );
  });

  it('falls back to the static hint when the query has NO qualifying hit', () => {
    seedIndexWithEntry(); // INDEX advertises an archive…
    // …but the only indexed fact does NOT match the query.
    seedDbFact({ id: 'P-UNRELATD', body: 'the CI pipeline uses github actions', source_file: 'ci.md' });
    const hint = buildMemoryHint({
      projectRoot,
      prompt: 'what banana pudding recipe did we settle on for the party?',
    });
    expect(hint).toBe(STATIC_MEMORY_HINT);
  });

  it('fail-open: a corrupt index DB yields the STATIC hint, never a crash, never null', () => {
    seedIndexWithEntry();
    const dbPath = getIndexDbPath(projectRoot);
    mkdirSync(dirname(dbPath), { recursive: true });
    writeFileSync(dbPath, 'this is not a sqlite database', 'utf8');
    let hint;
    expect(() => {
      hint = buildMemoryHint({ projectRoot, prompt: 'what did we decide about the deploy target?' });
    }).not.toThrow();
    expect(hint).toBe(STATIC_MEMORY_HINT);
  });

  it('completes within a tight time budget on a seeded index (hot-path latency guard)', () => {
    seedIndexWithEntry();
    seedDbFact();
    const t0 = Date.now();
    buildMemoryHint({ projectRoot, prompt: 'what did we decide about the deploy target for production?' });
    expect(Date.now() - t0).toBeLessThan(500); // must never blow the prompt-hook budget
  });

  it('Door 5: logs the hint form + ids into the recall log (source:hint, form:evidence)', () => {
    seedIndexWithEntry();
    seedDbFact();
    buildMemoryHint({
      projectRoot,
      prompt: 'what did we decide about the deploy target for production?',
      sessionId: 'sess-hint-1',
    });
    const hintEntries = readRecallLog(projectRoot).filter((e) => e.source === 'hint');
    expect(hintEntries).toHaveLength(1);
    expect(hintEntries[0].form).toBe('evidence');
    expect(hintEntries[0].ids).toContain('P-DEP2ABCD');
    expect(hintEntries[0].session).toBe('sess-hint-1');
    expect(hintEntries[0].query).toMatch(/deploy target/);
    // never a body in the log
    expect(hintEntries[0].body).toBeUndefined();
  });

  it('Door 5: logs form:static on a static fallback (before/after fire-rate is measurable)', () => {
    seedIndexWithEntry();
    buildMemoryHint({ projectRoot, prompt: 'deploy some stuff' }); // 17 chars → static
    const hintEntries = readRecallLog(projectRoot).filter((e) => e.source === 'hint');
    expect(hintEntries).toHaveLength(1);
    expect(hintEntries[0].form).toBe('static');
    expect(hintEntries[0].ids).toEqual([]);
  });

  it('Door 5: does NOT log a hint when none fires (short prompt / no archive)', () => {
    seedIndexWithEntry();
    buildMemoryHint({ projectRoot, prompt: 'go' }); // < 10 chars → null, no fire
    expect(readRecallLog(projectRoot).filter((e) => e.source === 'hint')).toHaveLength(0);
  });

  // BLOCKING regression (reviewer's repro): the RAW prompt must NEVER reach
  // recall.log — private blocks stripped + PII masked BEFORE the query or the
  // log see it (FR-15 / design §6.6). The logged `query` is screened terms only.
  it('PRIVACY: a <private> block in the prompt reaches NEITHER the query NOR the recall log', () => {
    seedIndexWithEntry();
    seedDbFact();
    const SENTINEL = 'SSN987654321SENTINEL';
    buildMemoryHint({
      projectRoot,
      prompt: `what did we decide about <private>${SENTINEL}</private> the deploy target for production?`,
      sessionId: 'sess-priv',
    });
    // The raw recall.log file carries neither the private token nor the raw prompt.
    const raw = readFileSync(recallLogPath(projectRoot), 'utf8');
    expect(raw).not.toContain(SENTINEL);
    expect(raw).not.toContain('<private>');
    // The hint still fired + logged its screened query.
    const [entry] = readRecallLog(projectRoot).filter((e) => e.source === 'hint');
    expect(entry).toBeDefined();
    expect(entry.query).not.toContain(SENTINEL);
    expect(entry.query).toMatch(/deploy|target|production/); // the non-private terms survive
  });

  it('PRIVACY: a PII token (email) in the prompt is masked (maskPii screen) before it can reach disk', () => {
    seedIndexWithEntry();
    seedDbFact();
    // A maskPii-covered email → genuinely verifies the L1 screen ran (not a
    // tokenization coincidence): the local part must not survive as a term.
    buildMemoryHint({
      projectRoot,
      prompt: 'remind me what the deploy target was for bobsecret@corp.io on production',
    });
    const raw = readFileSync(recallLogPath(projectRoot), 'utf8');
    expect(raw).not.toContain('bobsecret'); // the email local part is masked, not logged
    expect(raw).not.toContain('corp.io');
    const [entry] = readRecallLog(projectRoot).filter((e) => e.source === 'hint');
    expect(entry.query).not.toMatch(/bobsecret/);
    expect(entry.query).toMatch(/deploy|target|production/); // non-PII terms survive
  });

  it('PRIVACY/bound: the logged query is capped (a huge prompt cannot write an unbounded NDJSON line)', () => {
    seedIndexWithEntry();
    seedDbFact();
    const huge = 'z'.repeat(4000); // one giant token
    buildMemoryHint({ projectRoot, prompt: `${huge}` });
    const [entry] = readRecallLog(projectRoot).filter((e) => e.source === 'hint');
    expect(entry.query.length).toBeLessThanOrEqual(200);
  });

  it('Door 5: an evidence-query ERROR logs form:static WITH error:true (errored ≠ no-match)', () => {
    seedIndexWithEntry();
    // Corrupt the index so the evidence query throws (openIndexDb close-on-throw).
    const dbPath = getIndexDbPath(projectRoot);
    mkdirSync(dirname(dbPath), { recursive: true });
    writeFileSync(dbPath, 'not a sqlite database', 'utf8');
    const hint = buildMemoryHint({ projectRoot, prompt: 'what did we decide about the deploy target?' });
    expect(hint).toBe(STATIC_MEMORY_HINT); // fail-open
    const [entry] = readRecallLog(projectRoot).filter((e) => e.source === 'hint');
    expect(entry.form).toBe('static');
    expect(entry.error).toBe(true);
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
