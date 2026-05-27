// @doors: 1, 2, 3, 5
// Door 4 N/A: compress-session reads now.md + writes to today's segment; no message-queue IPC.

// Tests for Task 22 — cmk-compress-session SessionEnd hook (T-019).
// Per tasks.md 22.6:
//   - non-empty now.md → mocked backend invoked; output written to
//     today-{date}.md
//   - empty now.md → backend NOT invoked; hook exits 0
//   - existing same-day today-{date}.md → new content appended (not
//     overwriting)
//   - successful compression: now.md truncated to 0 bytes
//   - backend error → now.md untouched; error logged with category;
//     exit 0
//   - cooldown active → backend NOT invoked; `skipped: cooldown`
//     logged
//
// Boundary-test discipline:
//   - compressSession({projectRoot, backend, now, cooldownMs}) is the
//     deep boundary. Tests inject MockHaikuBackend (no real `claude`
//     spawn — the real-binary spawn smoke lives in
//     tests/spawn-smoke-haiku.test.js per design §17). Assert what
//     landed on disk + the return struct.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compressSession } from '../packages/cli/src/compress-session.mjs';
import { MockHaikuBackend } from '../packages/cli/src/compressor.mjs';

function makeFixture() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-compress-session-test-'));
  const projectRoot = join(sandbox, 'proj');
  mkdirSync(join(projectRoot, 'context', 'sessions'), { recursive: true });
  mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });
  return { sandbox, projectRoot };
}

function writeNowMd(projectRoot, body) {
  writeFileSync(
    join(projectRoot, 'context', 'sessions', 'now.md'),
    body,
    'utf8',
  );
}

function readTodayMd(projectRoot, date) {
  const p = join(projectRoot, 'context', 'sessions', `today-${date}.md`);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function readNowMd(projectRoot) {
  const p = join(projectRoot, 'context', 'sessions', 'now.md');
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function readCompressLog(projectRoot, date) {
  const p = join(projectRoot, 'context', 'sessions', `${date}.compress.log`);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function mockBackend(outputText) {
  return new MockHaikuBackend({
    responses: [
      {
        outputText,
        inputTokens: 100,
        outputTokens: 30,
        costUSD: 0.0002,
        preservedIds: [],
      },
    ],
  });
}

describe('Task 22 — compressSession() boundary', () => {
  let sandbox;
  let projectRoot;

  beforeEach(() => {
    const f = makeFixture();
    sandbox = f.sandbox;
    projectRoot = f.projectRoot;
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('happy path — compressed output written + now.md truncated', () => {
    it('non-empty now.md → backend invoked; output written to today-{date}.md', async () => {
      writeNowMd(projectRoot, '## tool call 1\n\nsome live session content\n');
      const backend = mockBackend('## Decisions\n- compressed body here\n');
      const r = await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T10:00:00Z',
      });
      expect(r.action).toBe('compressed');
      expect(r.outputPath).toBe(
        join(projectRoot, 'context', 'sessions', 'today-2026-05-26.md'),
      );
      expect(backend.calls).toHaveLength(1);
      const today = readTodayMd(projectRoot, '2026-05-26');
      expect(today).toContain('## Decisions');
      expect(today).toContain('compressed body here');
    });

    it('successful compression truncates now.md to 0 bytes', async () => {
      writeNowMd(projectRoot, 'some content to compress\n');
      const backend = mockBackend('compressed body\n');
      await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T10:00:00Z',
      });
      expect(readNowMd(projectRoot)).toBe('');
      // File exists but is empty
      expect(statSync(join(projectRoot, 'context', 'sessions', 'now.md')).size).toBe(0);
    });

    it('existing same-day today-{date}.md: new content APPENDED (not overwriting)', async () => {
      // Pre-existing today file from an earlier session-end on the same day
      const todayPath = join(projectRoot, 'context', 'sessions', 'today-2026-05-26.md');
      writeFileSync(todayPath, '## Decisions\n- earlier-session-decision\n\n', 'utf8');

      writeNowMd(projectRoot, 'second session content\n');
      const backend = mockBackend('## Decisions\n- second-session-decision\n');
      await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T15:00:00Z',
      });
      const today = readTodayMd(projectRoot, '2026-05-26');
      // Both decisions present; earlier preserved
      expect(today).toContain('earlier-session-decision');
      expect(today).toContain('second-session-decision');
      // Append order: earlier comes first
      expect(today.indexOf('earlier-session-decision')).toBeLessThan(
        today.indexOf('second-session-decision'),
      );
    });

    it('return struct includes bytesIn / bytesOut / duration_ms', async () => {
      writeNowMd(projectRoot, 'x'.repeat(500));
      const backend = mockBackend('y'.repeat(200));
      const r = await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T10:00:00Z',
      });
      expect(r.bytesIn).toBeGreaterThanOrEqual(500);
      expect(r.bytesOut).toBeGreaterThanOrEqual(200);
      expect(typeof r.duration_ms).toBe('number');
      expect(r.duration_ms).toBeGreaterThanOrEqual(0);
      // Door 4 cross-check: the return struct and the compress.log
      // entry must agree on bytesIn/bytesOut. Separately-correct-
      // jointly-broken risk class (per CLAUDE.md composition rule):
      // the return path could be right while the log records zero
      // or vice versa. Pin them to the SAME values.
      const log = readCompressLog(projectRoot, '2026-05-26');
      expect(log).toHaveLength(1);
      expect(log[0].input_bytes).toBe(r.bytesIn);
      expect(log[0].output_bytes).toBe(r.bytesOut);
    });
  });

  describe('empty / missing now.md (22.1)', () => {
    it('empty now.md → backend NOT invoked; action: skipped, reason: empty', async () => {
      writeNowMd(projectRoot, '');
      const backend = mockBackend('should not be called');
      const r = await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T10:00:00Z',
      });
      expect(r.action).toBe('skipped');
      expect(r.reason).toBe('empty');
      expect(backend.calls).toHaveLength(0);
    });

    it('whitespace-only now.md → skipped:empty', async () => {
      writeNowMd(projectRoot, '   \n\n  \t\n');
      const backend = mockBackend('should not be called');
      const r = await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T10:00:00Z',
      });
      expect(r.action).toBe('skipped');
      expect(r.reason).toBe('empty');
      expect(backend.calls).toHaveLength(0);
    });

    it('missing now.md (no file at all) → skipped:empty', async () => {
      // Don't writeNowMd; just call
      const backend = mockBackend('should not be called');
      const r = await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T10:00:00Z',
      });
      expect(r.action).toBe('skipped');
      expect(r.reason).toBe('empty');
      expect(backend.calls).toHaveLength(0);
    });

    it('door 4: every empty/whitespace/missing skip writes a compress.log entry with skipped_reason=empty', async () => {
      // Pin the observability contract for the no-op skip path.
      // Without this pin, a refactor that silently dropped the log
      // write on empty-input would ship — none of the empty/missing
      // tests above read the log because the contract was unstated.
      // Cover all three trigger paths in one go via successive calls
      // into fresh fixtures.
      // Path A: explicit empty
      writeNowMd(projectRoot, '');
      await compressSession({
        projectRoot,
        backend: mockBackend('unused'),
        now: '2026-05-26T10:00:00Z',
      });
      // Path B: whitespace-only
      writeNowMd(projectRoot, '   \n\n\t');
      await compressSession({
        projectRoot,
        backend: mockBackend('unused'),
        now: '2026-05-26T10:01:00Z',
      });
      const log = readCompressLog(projectRoot, '2026-05-26');
      expect(log).toHaveLength(2);
      expect(log[0].skipped_reason).toBe('empty');
      expect(log[1].skipped_reason).toBe('empty');
      expect(log[0].input_bytes).toBe(0);
      expect(log[1].input_bytes).toBe(0);
      expect(log[0].success).toBe(true);
    });
  });

  describe('120s Haiku cooldown (22.4)', () => {
    it('last-haiku-call.ts mtime within cooldown → skipped:cooldown', async () => {
      writeNowMd(projectRoot, 'content to compress\n');
      // Touch the cooldown marker with a very recent timestamp
      const cooldownPath = join(
        projectRoot,
        'context',
        '.locks',
        'last-haiku-call.ts',
      );
      writeFileSync(cooldownPath, '', 'utf8');
      // Set mtime to NOW (well within 120s cooldown)
      const now = new Date('2026-05-26T10:00:00Z');
      utimesSync(cooldownPath, now, now);

      const backend = mockBackend('should not be called');
      const r = await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T10:00:30Z', // 30s after cooldown touched — within 120s
      });
      expect(r.action).toBe('skipped');
      expect(r.reason).toBe('cooldown');
      expect(backend.calls).toHaveLength(0);
      // now.md should NOT have been touched (cooldown skip preserves
      // the live buffer for the next attempt)
      expect(readNowMd(projectRoot)).toContain('content to compress');
    });

    it('last-haiku-call.ts mtime older than cooldown → backend invoked', async () => {
      writeNowMd(projectRoot, 'content to compress\n');
      // Touch the cooldown marker with a stale timestamp
      const cooldownPath = join(
        projectRoot,
        'context',
        '.locks',
        'last-haiku-call.ts',
      );
      writeFileSync(cooldownPath, '', 'utf8');
      // Set mtime to a few minutes ago — past 120s cooldown
      const stale = new Date('2026-05-26T09:50:00Z');
      utimesSync(cooldownPath, stale, stale);

      const backend = mockBackend('compressed body\n');
      const r = await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T10:00:00Z', // 10 minutes after stale touch
      });
      expect(r.action).toBe('compressed');
      expect(backend.calls).toHaveLength(1);
      // Door 2 (state): the backend was invoked, but did the
      // compressed output actually land on disk? `action:compressed`
      // alone doesn't prove the today-{date}.md write happened —
      // a future regression that returned 'compressed' without
      // appending would still pass without this pin.
      expect(readTodayMd(projectRoot, '2026-05-26')).toContain('compressed body');
    });

    it('no cooldown marker present → backend invoked (first-call case)', async () => {
      writeNowMd(projectRoot, 'content\n');
      const backend = mockBackend('compressed\n');
      const r = await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T10:00:00Z',
      });
      expect(r.action).toBe('compressed');
      // Door 2 (state): same as above — pin today-{date}.md exists.
      expect(readTodayMd(projectRoot, '2026-05-26')).toContain('compressed');
      expect(backend.calls).toHaveLength(1);
    });

    it('successful compression touches last-haiku-call.ts so the next call sees fresh cooldown', async () => {
      writeNowMd(projectRoot, 'content\n');
      const backend = mockBackend('compressed\n');
      const ts = '2026-05-26T10:00:00Z';
      await compressSession({ projectRoot, backend, now: ts });

      const cooldownPath = join(
        projectRoot,
        'context',
        '.locks',
        'last-haiku-call.ts',
      );
      expect(existsSync(cooldownPath)).toBe(true);
      // The mtime should match the now we passed (within 5 seconds tolerance
      // since utimes precision varies by platform)
      const stat = statSync(cooldownPath);
      const expected = new Date(ts).getTime();
      expect(Math.abs(stat.mtimeMs - expected)).toBeLessThan(5000);
    });
  });

  describe('error handling (22.5)', () => {
    it('backend throws → action:error; now.md UNTOUCHED; error_category populated', async () => {
      writeNowMd(projectRoot, 'precious-content-to-preserve\n');
      const backend = new MockHaikuBackend({
        throwError: new Error('Haiku call failed: rate limit'),
      });
      const r = await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T10:00:00Z',
      });
      expect(r.action).toBe('error');
      expect(r.error_category).toBe('compress_failed');
      expect(readNowMd(projectRoot)).toContain('precious-content-to-preserve');
      // today-{date}.md NOT written
      expect(readTodayMd(projectRoot, '2026-05-26')).toBeNull();
    });

    it('error path still writes a compress.log NDJSON entry with success:false', async () => {
      writeNowMd(projectRoot, 'content\n');
      const backend = new MockHaikuBackend({
        throwError: new Error('boom'),
      });
      await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T10:00:00Z',
      });
      const log = readCompressLog(projectRoot, '2026-05-26');
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({
        ts: expect.any(String),
        success: false,
        error_category: 'compress_failed',
      });
    });

    it('backend throws HaikuTimeoutError → error_category: haiku_timeout (Task 23.9 routing)', async () => {
      // Pin the contract that compressSession distinguishes timeout
      // from non-zero-exit at both the return struct AND the
      // compress.log entry. The instanceof check in compress-session.mjs
      // is the load-bearing routing decision; without this test, a
      // regression to string-comparison would silently misroute
      // timeout failures into compress_failed. Per design §8.5.
      const { HaikuTimeoutError } = await import('../packages/cli/src/compressor.mjs');
      writeNowMd(projectRoot, 'content that took too long\n');
      const backend = new MockHaikuBackend({
        throwError: new HaikuTimeoutError('subprocess did not return within 50000ms', { timeoutMs: 50_000 }),
      });
      const r = await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T10:00:00Z',
      });
      // Door 1: return struct carries haiku_timeout.
      expect(r.action).toBe('error');
      expect(r.error_category).toBe('haiku_timeout');
      // Door 2: now.md preserved (timeout case retries on next SessionEnd).
      expect(readNowMd(projectRoot)).toContain('content that took too long');
      expect(readTodayMd(projectRoot, '2026-05-26')).toBeNull();
      // Door 5 cross-check: log entry matches the return struct.
      const log = readCompressLog(projectRoot, '2026-05-26');
      expect(log).toHaveLength(1);
      expect(log[0].error_category).toBe('haiku_timeout');
      expect(log[0].success).toBe(false);
    });
  });

  describe('NDJSON compress.log (design §6.1 schema)', () => {
    it('successful compression writes log entry with documented schema', async () => {
      writeNowMd(projectRoot, 'x'.repeat(1000));
      const backend = mockBackend('compressed\n');
      await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T10:00:00Z',
      });
      const log = readCompressLog(projectRoot, '2026-05-26');
      expect(log).toHaveLength(1);
      const entry = log[0];
      // Schema per design §6.1:
      //   {ts, scope, input_bytes, output_bytes, model_id, cost_usd, duration_ms}
      expect(entry).toHaveProperty('ts');
      expect(entry).toHaveProperty('scope');
      expect(entry).toHaveProperty('input_bytes');
      expect(entry).toHaveProperty('output_bytes');
      expect(entry).toHaveProperty('model_id');
      expect(entry).toHaveProperty('cost_usd');
      expect(entry).toHaveProperty('duration_ms');
      expect(entry.scope).toBe('session-end');
      expect(entry.success).toBe(true);
      expect(entry.input_bytes).toBeGreaterThan(0);
      expect(entry.output_bytes).toBeGreaterThan(0);
    });

    it('cooldown skip writes log entry with skipped_reason populated', async () => {
      writeNowMd(projectRoot, 'content\n');
      const cooldownPath = join(
        projectRoot,
        'context',
        '.locks',
        'last-haiku-call.ts',
      );
      writeFileSync(cooldownPath, '', 'utf8');
      const recent = new Date('2026-05-26T10:00:00Z');
      utimesSync(cooldownPath, recent, recent);

      await compressSession({
        projectRoot,
        backend: mockBackend('nope'),
        now: '2026-05-26T10:00:30Z',
      });
      const log = readCompressLog(projectRoot, '2026-05-26');
      const cooldownEntry = log.find((e) => e.skipped_reason === 'cooldown');
      expect(cooldownEntry).toBeDefined();
    });
  });

  describe('compression prompt (design §8.4) is sent to backend', () => {
    it('backend.compress() receives input + the documented 4-section prompt structure', async () => {
      writeNowMd(projectRoot, 'session content\n');
      const backend = mockBackend('compressed\n');
      await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T10:00:00Z',
      });
      expect(backend.calls).toHaveLength(1);
      const call = backend.calls[0];
      // The compression prompt structure (design §8.4): 4 section
      // headings + the "preserve citation IDs" rule.
      const prompt = (call.instructions ?? '') + '\n' + (call.input ?? '');
      expect(prompt).toContain('## Decisions');
      expect(prompt).toContain('## Open Questions');
      expect(prompt).toContain('## Files Touched');
      expect(prompt).toContain('## Active Threads');
      expect(prompt).toMatch(/preserve.*citation/i);
      // preserveCitationIds flag passed through
      expect(call.preserveCitationIds).toBe(true);
    });

    it('input is wrapped in BEGIN/END SESSION BUFFER delimiters so Haiku has an unambiguous boundary', async () => {
      // Regression test: the earlier prompt phrasing invited Haiku to
      // interpret the directive as a meta-conversation ("OK, ready to
      // compress — send me the buffer") and respond with preamble
      // instead of the compressed Markdown. Surfaced by the live
      // spawn-smoke under full-suite load on 2026-05-25. The fix is
      // delimiter-bracketed input so the model has an explicit marker
      // between directive and buffer.
      const bufferText = 'unique-buffer-marker-9472';
      writeNowMd(projectRoot, bufferText + '\n');
      const backend = mockBackend('compressed\n');
      await compressSession({
        projectRoot,
        backend,
        now: '2026-05-26T10:00:00Z',
      });
      const call = backend.calls[0];
      expect(call.input).toContain('=== BEGIN SESSION BUFFER');
      expect(call.input).toContain('=== END SESSION BUFFER ===');
      expect(call.input).toContain(bufferText);
      // The buffer text appears BETWEEN the markers (not before BEGIN
      // or after END).
      const beginIdx = call.input.indexOf('=== BEGIN SESSION BUFFER');
      const endIdx = call.input.indexOf('=== END SESSION BUFFER ===');
      const bufferIdx = call.input.indexOf(bufferText);
      expect(bufferIdx).toBeGreaterThan(beginIdx);
      expect(bufferIdx).toBeLessThan(endIdx);
    });
  });
});
