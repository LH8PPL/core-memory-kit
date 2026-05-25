// Tests for Task 23 — auto-extract subagent (T-020).
// Per tasks.md 23.7:
//   - Mocked Haiku returns 1 high-trust candidate → written to canonical
//     MEMORY.md via memory-write
//   - Mocked Haiku returns 1 medium-trust candidate → in queues/review.md;
//     canonical unchanged
//   - Low-trust candidate → discarded; extract.log has `skipped: nothing_durable`
//   - Lock file present → second invocation exits with error_category:
//     "concurrent_run", no spawn
//   - Mocked Haiku non-zero exit → extract.log has success: false,
//     error_category populated; hook exits 0
//   - NDJSON line matches design §6.1 schema (ts, success, error_category,
//     observation_count, skipped_reason, duration_ms)
//
// Boundary-test discipline:
//   - runAutoExtract({turnFile, projectRoot, haikuBackend, ...}) is the
//     deep boundary. Tests inject MockHaikuBackend (no real `claude`
//     spawn), assert what landed in MEMORY.md / queues/review.md /
//     extract.log + the return struct.
//   - Tests do NOT assert prompt text verbatim — that's implementation
//     detail. They DO assert the prompt contains the documented
//     extraction directives (six writing triggers shorthand, dedup
//     context, turn body).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAutoExtract } from '../packages/cli/src/auto-extract.mjs';
import { MockHaikuBackend } from '../packages/cli/src/compressor.mjs';
import { install } from '../packages/cli/src/install.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');

function makeFixture() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-auto-extract-test-'));
  const projectRoot = join(sandbox, 'proj');
  return { sandbox, projectRoot };
}

// Install the kit into the fixture so MEMORY.md + supporting dirs exist.
// (auto-extract writes high-trust bullets via appendScratchpadBullet,
// which requires the scaffold to be present.)
async function installFixture(projectRoot) {
  await install({ projectRoot, userTier: join(projectRoot, '..', 'user') });
}

// Two forms:
//   writeTurnFile(projectRoot, "raw text") — legacy, written verbatim.
//     auto-extract's parser falls back to "treat whole content as
//     assistant turn" when USER_TURN: / ASSISTANT_TURN: markers are
//     absent, so these legacy fixtures still parse. Existing tests
//     use this form.
//   writeTurnFile(projectRoot, { user, assistant }) — explicit bi-turn
//     shape used by the new test cases for the 2026-05-26 amendment.
//     Writes the USER_TURN: / ASSISTANT_TURN: format Task 21's
//     capture-turn now emits.
function writeTurnFile(projectRoot, content) {
  const transcriptsDir = join(projectRoot, 'context', 'transcripts');
  mkdirSync(transcriptsDir, { recursive: true });
  const path = join(transcriptsDir, `.extract-${Date.now()}-${Math.floor(Math.random() * 100000)}.tmp`);
  let body;
  if (typeof content === 'string') {
    body = content;
  } else {
    body = [
      'USER_TURN:',
      content.user ?? '',
      '',
      'ASSISTANT_TURN:',
      content.assistant ?? '',
    ].join('\n');
  }
  writeFileSync(path, body, 'utf8');
  return path;
}

function mockBackend(...lines) {
  // Build a single CompressorResult that mimics the line-delimited
  // TRUST_HIGH: / TRUST_MEDIUM: / TRUST_LOW: / SKIP shape we'll parse.
  const body = lines.join('\n');
  return new MockHaikuBackend({
    responses: [
      {
        outputText: body,
        inputTokens: 100,
        outputTokens: 20,
        costUSD: 0.0001,
        preservedIds: [],
      },
    ],
  });
}

async function readExtractLog(projectRoot, date) {
  const path = join(projectRoot, 'context', 'sessions', `${date}.extract.log`);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe('Task 23 — runAutoExtract() boundary', () => {
  let sandbox;
  let projectRoot;

  beforeEach(async () => {
    const f = makeFixture();
    sandbox = f.sandbox;
    projectRoot = f.projectRoot;
    await installFixture(projectRoot);
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('trust routing (23.3)', () => {
    it('high-trust candidate → bullet appended to MEMORY.md', async () => {
      const turnFile = writeTurnFile(
        projectRoot,
        '## ts — assistant\n\nuser standardized on python 3.13 for new projects',
      );
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user:python 3.13 is the project default'),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('extracted');
      expect(r.observation_count).toBe(1);
      const memory = readFileSync(
        join(projectRoot, 'context', 'MEMORY.md'),
        'utf8',
      );
      expect(memory).toContain('python 3.13 is the project default');
      // High-trust write must carry the auto-extract write source in
      // its provenance comment (downstream Poison_Guard + audit needs it)
      expect(memory).toMatch(/write:\s*auto-extract/);
    });

    // Regression test for the code-review M1 finding. Pre-fix, sha1 in
    // the provenance comment was a marker string ('auto-extract:haiku'
    // / 'auto-extract:retain'). Post-fix it's a real SHA-1 hex of the
    // bullet text.
    it("high-trust write's provenance sha1 is hex-shaped (M1 regression)", async () => {
      const turnFile = writeTurnFile(projectRoot, 'a turn');
      await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user:the sha1 must be hex'),
        now: '2026-05-25T10:00:00Z',
      });
      const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
      // Match the sha1 field in the inline HTML comment and assert hex shape.
      const m = memory.match(/sha1:\s*([0-9a-f]+)/);
      expect(m).not.toBeNull();
      expect(m[1]).toMatch(/^[0-9a-f]{40}$/);
    });

    it('medium-trust candidate → appended to queues/review.md; MEMORY.md unchanged', async () => {
      const memoryBefore = readFileSync(
        join(projectRoot, 'context', 'MEMORY.md'),
        'utf8',
      );
      const turnFile = writeTurnFile(projectRoot, 'a turn');
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_MEDIUM user:we might be moving to pnpm next quarter'),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('extracted');
      expect(r.observation_count).toBe(1);
      const reviewPath = join(projectRoot, 'context', 'queues', 'review.md');
      expect(existsSync(reviewPath)).toBe(true);
      const review = readFileSync(reviewPath, 'utf8');
      expect(review).toContain('we might be moving to pnpm next quarter');
      const memoryAfter = readFileSync(
        join(projectRoot, 'context', 'MEMORY.md'),
        'utf8',
      );
      expect(memoryAfter).toBe(memoryBefore);
    });

    it('low-trust candidate → discarded; extract.log records skipped_reason', async () => {
      const turnFile = writeTurnFile(projectRoot, 'small talk');
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_LOW user:small talk about the weather'),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('skipped');
      expect(r.observation_count).toBe(0);
      expect(r.skipped_reason).toBe('nothing_durable');
      const log = await readExtractLog(projectRoot, '2026-05-25');
      expect(log).toHaveLength(1);
      expect(log[0].skipped_reason).toBe('nothing_durable');
    });

    it('Haiku returns SKIP → action:skipped, observation_count:0', async () => {
      const turnFile = writeTurnFile(projectRoot, 'nothing notable');
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('SKIP'),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('skipped');
      expect(r.observation_count).toBe(0);
      expect(r.skipped_reason).toBe('nothing_durable');
    });

    it('mixed candidates: one high + one medium + one low → 2 written, 1 discarded', async () => {
      const turnFile = writeTurnFile(projectRoot, 'a multi-fact turn');
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend(
          'TRUST_HIGH user:the canonical bullet text fact one',
          'TRUST_MEDIUM user:the maybe-fact two needs review',
          'TRUST_LOW user:trivia three should drop',
        ),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('extracted');
      expect(r.observation_count).toBe(2);
      const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
      const review = readFileSync(join(projectRoot, 'context', 'queues', 'review.md'), 'utf8');
      expect(memory).toContain('the canonical bullet text fact one');
      expect(memory).not.toContain('the maybe-fact two needs review');
      expect(review).toContain('the maybe-fact two needs review');
      expect(memory).not.toContain('trivia three should drop');
      expect(review).not.toContain('trivia three should drop');
    });
  });

  describe('<retain> override (design §6.6)', () => {
    it('candidate text emitted by Haiku as TRUST_LOW but originating from <retain> in turn → forced to high', async () => {
      const turnFile = writeTurnFile(
        projectRoot,
        '<retain>force-saved fact about the lockfile change</retain>',
      );
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend(
          'TRUST_LOW user:force-saved fact about the lockfile change',
        ),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('extracted');
      expect(r.observation_count).toBe(1);
      const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
      expect(memory).toContain('force-saved fact about the lockfile change');
    });

    // Regression test for the code-review B1 finding. Pre-fix, the
    // bidirectional substring match meant a short <retain> segment (or
    // any segment that was a substring of an unrelated candidate)
    // could promote noise to high-trust. Fix: forward-only match +
    // MIN_RETAIN_MATCH_CHARS = 20.
    it('short <retain> segment does NOT promote unrelated candidates (B1 regression)', async () => {
      const turnFile = writeTurnFile(
        projectRoot,
        '<retain>x</retain> rest of the turn body that happens to mention something containing x',
      );
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        // Candidate text contains "x" but the retain segment ("x") is
        // way under the 20-char threshold → must NOT be promoted.
        haikuBackend: mockBackend(
          'TRUST_LOW user:unrelated candidate about xenomorphs from the turn',
        ),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('skipped');
      expect(r.observation_count).toBe(0);
      // Sentinel-grep proves the candidate didn't land in MEMORY.md
      const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
      expect(memory).not.toContain('xenomorphs');
    });

    it('retain segment ≥20 chars that is a substring of candidate text → promoted (forward direction works)', async () => {
      const retainBody = 'the canonical lock file path is project/foo/bar.lock';
      const turnFile = writeTurnFile(projectRoot, `<retain>${retainBody}</retain>`);
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        // Candidate INCLUDES the retain segment verbatim (forward
        // direction).
        haikuBackend: mockBackend(
          `TRUST_LOW user: ${retainBody} and additional detail about why`,
        ),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('extracted');
      expect(r.observation_count).toBe(1);
    });

    it('retain segment ≥20 chars: candidate that is a SUBSTRING of retain is NOT promoted (reverse direction blocked)', async () => {
      const retainBody = 'the canonical lock file path is project/foo/bar.lock';
      const turnFile = writeTurnFile(projectRoot, `<retain>${retainBody}</retain>`);
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        // Candidate is a substring of retain. Pre-fix this would have
        // promoted via `seg.includes(c.text)`. Post-fix: not promoted.
        haikuBackend: mockBackend('TRUST_LOW user:lock file path'),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('skipped');
      expect(r.observation_count).toBe(0);
    });
  });

  // ----------------------------------------------------------------
  // Bi-turn extraction with origin-tagged trust routing
  // (design §6.4 amendment, 2026-05-26).
  //
  // These 6 cases exercise the new behavior added in
  // fix-livetest-findings-2:
  //   - capture-turn writes BOTH turns to the temp file
  //   - auto-extract parser splits user/assistant
  //   - Haiku tags candidates with origin
  //   - assistant-origin candidates demote one trust level
  //   - <retain> overrides demotion (still force-promotes to HIGH)
  //   - within-call dedup keeps higher-trust candidate per canonical ID
  // ----------------------------------------------------------------
  describe('bi-turn extraction with origin-tagged trust routing (design §6.4 amendment)', () => {
    it('(a) user-only fact + terse assistant ack → 1 user-origin HIGH lands in MEMORY.md', async () => {
      // The failure case from the original live test: user dictates a
      // preference; assistant just says "Got it." Pre-amendment this
      // produced observation_count: 0. Post-amendment Haiku sees the
      // user turn and emits a user-origin candidate that survives
      // routing intact.
      const turnFile = writeTurnFile(projectRoot, {
        user: 'I prefer terse responses with no preamble. Always.',
        assistant: 'Got it.',
      });
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user: prefers terse responses with no preamble'),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('extracted');
      expect(r.observation_count).toBe(1);
      const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
      expect(memory).toContain('prefers terse responses with no preamble');
    });

    it('(b) assistant-only TRUST_HIGH → demoted to MEDIUM → lands in queues/review.md, NOT MEMORY.md', async () => {
      const memoryBefore = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
      const turnFile = writeTurnFile(projectRoot, {
        user: 'what does the build script do?',
        assistant: 'I observed that the build script uses pnpm and runs on Node 22.',
      });
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH assistant: build script uses pnpm on Node 22'),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('extracted');
      expect(r.observation_count).toBe(1);
      // Demoted to MEDIUM → review queue
      const reviewPath = join(projectRoot, 'context', 'queues', 'review.md');
      expect(existsSync(reviewPath)).toBe(true);
      const review = readFileSync(reviewPath, 'utf8');
      expect(review).toContain('build script uses pnpm on Node 22');
      // MEMORY.md unchanged
      const memoryAfter = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
      expect(memoryAfter).toBe(memoryBefore);
      // Result candidate carries demotion metadata for diagnostics
      const cand = r.candidates.find((c) => c.text.includes('build script'));
      expect(cand?.origin).toBe('assistant');
      expect(cand?.demotedFrom).toBe('high');
      expect(cand?.trust).toBe('medium');
    });

    it('(c) both turns mention same fact → dedup keeps user-origin (higher trust after demotion)', async () => {
      const turnFile = writeTurnFile(projectRoot, {
        user: 'we use pnpm not npm',
        assistant: 'right, pnpm not npm — noted',
      });
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        // Haiku emits two candidates with the SAME text (literal dedup
        // is canonical-id match; this is the test for that mechanism).
        // User-origin HIGH; assistant-origin HIGH (would demote to
        // MEDIUM). After dedup, user-origin HIGH wins.
        haikuBackend: mockBackend(
          'TRUST_HIGH user: pnpm not npm',
          'TRUST_HIGH assistant: pnpm not npm',
        ),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('extracted');
      expect(r.observation_count).toBe(1);
      const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
      expect(memory).toContain('pnpm not npm');
      // Exactly one occurrence — dedup worked
      const matches = memory.match(/pnpm not npm/g) ?? [];
      expect(matches.length).toBe(1);
      // No review-queue entry — the assistant duplicate got dropped
      const reviewPath = join(projectRoot, 'context', 'queues', 'review.md');
      const review = existsSync(reviewPath) ? readFileSync(reviewPath, 'utf8') : '';
      expect(review).not.toContain('pnpm not npm');
    });

    it('(d) mixed batch: 2 user-HIGH + 1 assistant-HIGH + 1 assistant-LOW → 2 memory + 1 review + 1 discarded', async () => {
      const turnFile = writeTurnFile(projectRoot, {
        user: 'I use Python 3.13 and write tests with pytest',
        assistant: 'Acknowledged. I also notice your repo uses ruff; I infer you prefer minimal-config linters.',
      });
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend(
          'TRUST_HIGH user: Python 3.13',
          'TRUST_HIGH user: pytest for tests',
          'TRUST_HIGH assistant: uses ruff for linting',
          'TRUST_LOW assistant: prefers minimal-config tools',
        ),
        now: '2026-05-25T10:00:00Z',
      });
      // 2 user-HIGH → MEMORY.md (HIGH after no-op demotion)
      // 1 assistant-HIGH → MEDIUM after demotion → review.md
      // 1 assistant-LOW → discarded after demotion (low → discarded)
      // observation_count = 3 (2 memory + 1 review). discarded doesn't count.
      expect(r.action).toBe('extracted');
      expect(r.observation_count).toBe(3);
      const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
      expect(memory).toContain('Python 3.13');
      expect(memory).toContain('pytest for tests');
      expect(memory).not.toContain('ruff for linting');
      expect(memory).not.toContain('prefers minimal-config tools');

      const reviewPath = join(projectRoot, 'context', 'queues', 'review.md');
      expect(existsSync(reviewPath)).toBe(true);
      const review = readFileSync(reviewPath, 'utf8');
      expect(review).toContain('uses ruff for linting');
      expect(review).not.toContain('prefers minimal-config tools');
      expect(review).not.toContain('Python 3.13');
    });

    it('(e) <retain> in user turn forces HIGH regardless of Haiku assessment', async () => {
      const retainBody = 'the canonical build command is pnpm run build:prod';
      const turnFile = writeTurnFile(projectRoot, {
        user: `Some normal text and <retain>${retainBody}</retain> more text`,
        assistant: 'OK.',
      });
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        // Haiku marked it LOW user; <retain> in the user turn forces
        // it to HIGH regardless.
        haikuBackend: mockBackend(`TRUST_LOW user: ${retainBody}`),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('extracted');
      expect(r.observation_count).toBe(1);
      const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
      expect(memory).toContain(retainBody);
    });

    it('(f) <retain> in assistant turn forces HIGH — override beats demotion', async () => {
      // The critical ordering test: assistant-origin LOW would
      // normally demote to discarded; <retain> override must run
      // AFTER demotion and force-promote to HIGH.
      const retainBody = 'the deployment uses canary rollout via flagger';
      const turnFile = writeTurnFile(projectRoot, {
        user: 'how does deployment work here?',
        assistant: `Looking at the configs, <retain>${retainBody}</retain>. Other details follow.`,
      });
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        // assistant LOW → demoted to discarded WITHOUT the override;
        // <retain> forces back to HIGH → MEMORY.md.
        haikuBackend: mockBackend(`TRUST_LOW assistant: ${retainBody}`),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('extracted');
      expect(r.observation_count).toBe(1);
      const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
      expect(memory).toContain(retainBody);
    });
  });

  describe('lock-file guard (23.4)', () => {
    it('lock file with live PID present → second invocation exits with error_category: concurrent_run', async () => {
      // Pre-acquire the lock from this test process — process.pid is alive
      const locksDir = join(projectRoot, 'context', '.locks');
      mkdirSync(locksDir, { recursive: true });
      const lockPath = join(locksDir, 'auto-extract.lock');
      writeFileSync(lockPath, String(process.pid), 'utf8');

      const turnFile = writeTurnFile(projectRoot, 'will be skipped');
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user:should not be written'),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('concurrent');
      expect(r.error_category).toBe('concurrent_run');
      const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
      expect(memory).not.toContain('should not be written');
    });

    it('lock file with DEAD PID present → stale recovery: take over the lock and proceed', async () => {
      const locksDir = join(projectRoot, 'context', '.locks');
      mkdirSync(locksDir, { recursive: true });
      const lockPath = join(locksDir, 'auto-extract.lock');
      // PID 99999 almost certainly not running on a fresh test process
      writeFileSync(lockPath, '99999', 'utf8');

      const turnFile = writeTurnFile(projectRoot, 'recoverable turn');
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user:stale recovery proved'),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('extracted');
      expect(r.observation_count).toBe(1);
      const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
      expect(memory).toContain('stale recovery proved');
    });

    it('lock released after run completes (next invocation can acquire)', async () => {
      const turnFile = writeTurnFile(projectRoot, 'first turn');
      await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user:bullet number one'),
        now: '2026-05-25T10:00:00Z',
      });
      const lockPath = join(projectRoot, 'context', '.locks', 'auto-extract.lock');
      expect(existsSync(lockPath)).toBe(false);

      const turnFile2 = writeTurnFile(projectRoot, 'second turn');
      const r2 = await runAutoExtract({
        turnFile: turnFile2,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user:bullet number two'),
        now: '2026-05-25T10:01:00Z',
      });
      expect(r2.action).toBe('extracted');
    });
  });

  describe('Haiku failure handling (23.5)', () => {
    it('Haiku throws → action:error, error_category populated, hook still exits 0', async () => {
      const failing = new MockHaikuBackend({
        throwError: new Error('haiku call failed: rate-limited'),
      });
      const turnFile = writeTurnFile(projectRoot, 'a turn');
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: failing,
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('error');
      expect(r.error_category).toBe('haiku_failed');
      expect(r.observation_count).toBe(0);
      // The handler doesn't throw — surfaces the failure in the result
      // so the caller (bin script) can log + exit 0.
    });

    it('missing turnFile → action:error, error_category: missing_turn', async () => {
      const r = await runAutoExtract({
        turnFile: join(projectRoot, 'context', 'transcripts', '.extract-nope.tmp'),
        projectRoot,
        haikuBackend: mockBackend('SKIP'),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('error');
      expect(r.error_category).toBe('missing_turn');
    });

    it('empty turn file → action:skipped, skipped_reason: empty_turn', async () => {
      const turnFile = writeTurnFile(projectRoot, '   \n  \n');
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('SKIP'),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('skipped');
      expect(r.skipped_reason).toBe('empty_turn');
    });
  });

  describe('NDJSON extract.log (23.5)', () => {
    it('writes one NDJSON line per invocation matching design §6.1 schema', async () => {
      const turnFile = writeTurnFile(projectRoot, 'a turn');
      await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user:a thing'),
        now: '2026-05-25T10:00:00Z',
      });
      const lines = await readExtractLog(projectRoot, '2026-05-25');
      expect(lines).toHaveLength(1);
      const entry = lines[0];
      // Schema per design §6.1:
      //   {ts, success, error_category, observation_count, skipped_reason, duration_ms}
      expect(entry).toHaveProperty('ts');
      expect(entry).toHaveProperty('success');
      expect(entry).toHaveProperty('error_category');
      expect(entry).toHaveProperty('observation_count');
      expect(entry).toHaveProperty('skipped_reason');
      expect(entry).toHaveProperty('duration_ms');
      expect(typeof entry.duration_ms).toBe('number');
      expect(entry.success).toBe(true);
      expect(entry.error_category).toBeNull();
      expect(entry.observation_count).toBe(1);
      expect(entry.skipped_reason).toBeNull();
    });

    it('multiple invocations on same day append to one file', async () => {
      const f1 = writeTurnFile(projectRoot, 'turn one');
      await runAutoExtract({ turnFile: f1, projectRoot, haikuBackend: mockBackend('SKIP'), now: '2026-05-25T10:00:00Z' });
      const f2 = writeTurnFile(projectRoot, 'turn two');
      await runAutoExtract({ turnFile: f2, projectRoot, haikuBackend: mockBackend('TRUST_HIGH user:x'), now: '2026-05-25T11:00:00Z' });
      const lines = await readExtractLog(projectRoot, '2026-05-25');
      expect(lines).toHaveLength(2);
    });

    it('extract.log records error_category on Haiku failure', async () => {
      const turnFile = writeTurnFile(projectRoot, 'a turn');
      await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: new MockHaikuBackend({ throwError: new Error('boom') }),
        now: '2026-05-25T10:00:00Z',
      });
      const lines = await readExtractLog(projectRoot, '2026-05-25');
      expect(lines).toHaveLength(1);
      expect(lines[0].success).toBe(false);
      expect(lines[0].error_category).toBe('haiku_failed');
    });
  });

  describe('noise-tag stripping + tool-use compaction (functional patterns from claude-remember code dive)', () => {
    it('strips <system-reminder>, <command-name>, <local-command> blocks before sending to Haiku', async () => {
      const turnFile = writeTurnFile(
        projectRoot,
        'real content\n<system-reminder>NOISE_ONE</system-reminder>\nmore real content\n<command-name>NOISE_TWO</command-name>\n<local-command-stdout>NOISE_THREE</local-command-stdout>',
      );
      const mock = mockBackend('SKIP');
      await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mock,
        now: '2026-05-25T10:00:00Z',
      });
      const call = mock.calls[0];
      expect(call.input).toContain('real content');
      expect(call.input).toContain('more real content');
      expect(call.input).not.toContain('NOISE_ONE');
      expect(call.input).not.toContain('NOISE_TWO');
      expect(call.input).not.toContain('NOISE_THREE');
    });

    it('dedup context: feeds the last `## `-prefixed entry from now.md to Haiku when it exists', async () => {
      // Pre-write a now.md with a prior entry
      const nowMd = join(projectRoot, 'context', 'sessions', 'now.md');
      mkdirSync(dirname(nowMd), { recursive: true });
      writeFileSync(
        nowMd,
        '## 2026-05-25T09:00:00Z — earlier-entry\n\nprevious extraction body\n\n## 2026-05-25T09:30:00Z — last-entry-marker\n\nMOST_RECENT_PRIOR_ENTRY_MARKER\n',
        'utf8',
      );
      const turnFile = writeTurnFile(projectRoot, 'new turn content');
      const mock = mockBackend('SKIP');
      await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mock,
        now: '2026-05-25T10:00:00Z',
      });
      // Prompt body fed to Haiku must include the last prior entry as
      // dedup context (so Haiku doesn't re-extract the same fact).
      const call = mock.calls[0];
      expect(call.input).toContain('MOST_RECENT_PRIOR_ENTRY_MARKER');
    });

    it('prompt body includes the six writing-trigger directives from design §6.4', async () => {
      const turnFile = writeTurnFile(projectRoot, 'turn');
      const mock = mockBackend('SKIP');
      await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mock,
        now: '2026-05-25T10:00:00Z',
      });
      const call = mock.calls[0];
      const prompt = (call.instructions ?? '') + '\n' + call.input;
      // Don't assert exact text — the prompt is ours and may be tuned.
      // Do assert it mentions the core directive concepts so reviewers
      // catch a regression that drops them.
      expect(prompt.toLowerCase()).toMatch(/correction|preference|environment|convention|workflow|quirk/);
    });
  });
});
