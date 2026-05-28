// @doors: 1, 2
// Door 3 N/A: transcripts module is pure-file-IO; no subprocess.
// Door 4 N/A: no NDJSON observability — extractTranscript returns its result struct directly (the struct IS the observation). M1 fix (skill-review 2026-05-28): previously Door 4 + Door 5 N/A reasons were conflated; Door 5 = message queues per CLAUDE.md.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 38b — cmk transcripts extract.
// Per tasks.md 38.9 (cases):
//   - Test fixture jsonl (10 turns: user + assistant + tool_use + system_reminder mix) produces expected markdown
//   - --include-thinking retains thinking blocks
//   - discoverSessions filters by slug/uuid/since correctly

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractTranscript,
  discoverSessions,
} from '../packages/cli/src/transcripts.mjs';

let sandbox;

function seedJsonl(filename, lines) {
  const path = join(sandbox, filename);
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
  return path;
}

function makeFixture() {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-transcripts-test-'));
}

beforeEach(() => {
  makeFixture();
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('Task 38b — extractTranscript', () => {
  describe('Validation (Door 1)', () => {
    it('rejects missing inputPath', () => {
      const r = extractTranscript({ outputPath: '/tmp/x.md' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('rejects missing outputPath', () => {
      const r = extractTranscript({ inputPath: '/tmp/x.jsonl' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('returns not-found when input does not exist', () => {
      const r = extractTranscript({
        inputPath: join(sandbox, 'nope.jsonl'),
        outputPath: join(sandbox, 'out.md'),
      });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('not-found');
    });
  });

  describe('filter contract (38.9)', () => {
    it('keeps user + assistant text; drops tool_use, tool_result, system-reminder', () => {
      const inputPath = seedJsonl('session-1.jsonl', [
        {
          type: 'user',
          timestamp: '2026-05-28T10:00:00Z',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Hello assistant <system-reminder>noise</system-reminder>' }],
          },
        },
        {
          type: 'assistant',
          timestamp: '2026-05-28T10:00:05Z',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Here is the answer.' },
              { type: 'tool_use', name: 'Bash', input: { cmd: 'ls' } },
            ],
          },
        },
        {
          type: 'user',
          timestamp: '2026-05-28T10:00:10Z',
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'x', content: 'file1' }],
          },
        },
      ]);
      const outputPath = join(sandbox, 'session-1.md');
      const r = extractTranscript({ inputPath, outputPath });
      expect(r.action).toBe('completed');
      expect(r.turnsKept).toBe(2); // user text + assistant text; tool_result skipped (empty after filter)
      expect(r.rawLines).toBe(3);
      const out = readFileSync(outputPath, 'utf8');
      expect(out).toContain('Hello assistant');
      expect(out).not.toContain('noise');
      expect(out).not.toContain('system-reminder');
      expect(out).toContain('Here is the answer.');
      // Tool_use block dropped (assert the structured contents, not the
      // arg substring "ls" which matches "calls" in the header text).
      expect(out).not.toContain('Bash');
      expect(out).not.toContain('tool_use');
      expect(out).not.toContain('"cmd"');
    });

    it('omits thinking blocks by default', () => {
      const inputPath = seedJsonl('session-2.jsonl', [
        {
          type: 'assistant',
          timestamp: '2026-05-28T10:00:00Z',
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'private reasoning' },
              { type: 'text', text: 'public answer' },
            ],
          },
        },
      ]);
      const outputPath = join(sandbox, 'session-2.md');
      extractTranscript({ inputPath, outputPath });
      const out = readFileSync(outputPath, 'utf8');
      expect(out).toContain('public answer');
      expect(out).not.toContain('private reasoning');
    });

    it('--include-thinking retains thinking blocks', () => {
      const inputPath = seedJsonl('session-3.jsonl', [
        {
          type: 'assistant',
          timestamp: '2026-05-28T10:00:00Z',
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'private reasoning' },
              { type: 'text', text: 'public answer' },
            ],
          },
        },
      ]);
      const outputPath = join(sandbox, 'session-3.md');
      extractTranscript({ inputPath, outputPath, includeThinking: true });
      const out = readFileSync(outputPath, 'utf8');
      expect(out).toContain('private reasoning');
      expect(out).toContain('[thinking]');
    });

    it('strips IDE state + slash-command annotations', () => {
      const inputPath = seedJsonl('session-4.jsonl', [
        {
          type: 'user',
          timestamp: '2026-05-28T10:00:00Z',
          message: {
            role: 'user',
            content: [{ type: 'text', text: '<ide_opened_file>foo.js</ide_opened_file><command-name>/test</command-name>Actual prompt text' }],
          },
        },
      ]);
      const outputPath = join(sandbox, 'session-4.md');
      extractTranscript({ inputPath, outputPath });
      const out = readFileSync(outputPath, 'utf8');
      expect(out).toContain('Actual prompt text');
      expect(out).not.toContain('foo.js');
      expect(out).not.toContain('/test');
    });

    it('handles string content (not array)', () => {
      const inputPath = seedJsonl('session-5.jsonl', [
        {
          type: 'user',
          timestamp: '2026-05-28T10:00:00Z',
          message: { role: 'user', content: 'Just a plain string' },
        },
      ]);
      const outputPath = join(sandbox, 'session-5.md');
      const r = extractTranscript({ inputPath, outputPath });
      expect(r.turnsKept).toBe(1);
      expect(readFileSync(outputPath, 'utf8')).toContain('Just a plain string');
    });

    it('creates output directory if missing', () => {
      const inputPath = seedJsonl('session-6.jsonl', [
        {
          type: 'user',
          timestamp: '2026-05-28T10:00:00Z',
          message: { role: 'user', content: 'x' },
        },
      ]);
      const outputPath = join(sandbox, 'nested', 'dir', 'out.md');
      const r = extractTranscript({ inputPath, outputPath });
      expect(r.action).toBe('completed');
      expect(existsSync(outputPath)).toBe(true);
    });

    it('output header captures session span + turn count', () => {
      const inputPath = seedJsonl('session-7.jsonl', [
        {
          type: 'user',
          timestamp: '2026-05-20T10:00:00Z',
          message: { role: 'user', content: 'first' },
        },
        {
          type: 'assistant',
          timestamp: '2026-05-23T15:30:00Z',
          message: { role: 'assistant', content: 'last' },
        },
      ]);
      const outputPath = join(sandbox, 'session-7.md');
      extractTranscript({ inputPath, outputPath });
      const out = readFileSync(outputPath, 'utf8');
      expect(out).toContain('Turns kept**: 2');
      expect(out).toContain('2026-05-20');
      expect(out).toContain('2026-05-23');
    });
  });
});

describe('Task 38b — discoverSessions', () => {
  function makeHarnessRoot(slugs) {
    const root = join(sandbox, '.claude', 'projects');
    mkdirSync(root, { recursive: true });
    for (const { slug, sessions, agedHours } of slugs) {
      const slugDir = join(root, slug);
      mkdirSync(slugDir, { recursive: true });
      sessions.forEach((sessionId, idx) => {
        const p = join(slugDir, `${sessionId}.jsonl`);
        writeFileSync(p, '{"type":"user","timestamp":"2026-05-28T00:00:00Z","message":{"role":"user","content":"x"}}\n', 'utf8');
        if (agedHours) {
          const t = (Date.now() - agedHours * 60 * 60 * 1000) / 1000;
          utimesSync(p, t, t);
        }
      });
    }
    return root;
  }

  it('returns empty when no slugs exist', () => {
    const root = join(sandbox, '.claude', 'projects');
    expect(discoverSessions({ harnessRoot: root })).toEqual([]);
  });

  it('lists sessions across all slugs by default', () => {
    const root = makeHarnessRoot([
      { slug: 'C--Projects-foo', sessions: ['11111111-1111-1111-1111-111111111111'] },
      { slug: 'C--Projects-bar', sessions: ['22222222-2222-2222-2222-222222222222'] },
    ]);
    const r = discoverSessions({ harnessRoot: root });
    expect(r.length).toBe(2);
  });

  it('filters by slug', () => {
    const root = makeHarnessRoot([
      { slug: 'foo', sessions: ['11111111-1111-1111-1111-111111111111'] },
      { slug: 'bar', sessions: ['22222222-2222-2222-2222-222222222222'] },
    ]);
    const r = discoverSessions({ harnessRoot: root, slug: 'foo' });
    expect(r.length).toBe(1);
    expect(r[0].slug).toBe('foo');
  });

  it('filters by session uuid suffix', () => {
    const root = makeHarnessRoot([
      {
        slug: 'foo',
        sessions: [
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        ],
      },
    ]);
    const r = discoverSessions({ harnessRoot: root, sessionUuidSuffix: 'bbbbbbbb' });
    expect(r.length).toBe(1);
    expect(r[0].sessionId).toMatch(/^bbbbbbbb/);
  });

  it('filters by since (mtime cutoff)', () => {
    const root = makeHarnessRoot([
      {
        slug: 'foo',
        sessions: ['11111111-1111-1111-1111-111111111111'],
        agedHours: 0, // fresh
      },
      {
        slug: 'bar',
        sessions: ['22222222-2222-2222-2222-222222222222'],
        agedHours: 72, // 3 days old
      },
    ]);
    // sinceIso = now - 1 day → fresh kept, aged dropped
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const r = discoverSessions({ harnessRoot: root, sinceIso });
    expect(r.length).toBe(1);
    expect(r[0].slug).toBe('foo');
  });

  it('returns results sorted newest-first', () => {
    const root = makeHarnessRoot([
      {
        slug: 'foo',
        sessions: ['11111111-1111-1111-1111-111111111111'],
        agedHours: 48,
      },
      {
        slug: 'bar',
        sessions: ['22222222-2222-2222-2222-222222222222'],
        agedHours: 1,
      },
    ]);
    const r = discoverSessions({ harnessRoot: root });
    expect(r[0].slug).toBe('bar'); // newer
    expect(r[1].slug).toBe('foo'); // older
  });
});
