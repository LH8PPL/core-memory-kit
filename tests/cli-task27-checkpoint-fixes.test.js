// @doors: 1, 2
// Door 3 N/A: these tests use MockHaikuBackend (in-process); no subprocess spawn.
// Door 4 N/A: temp-file IPC (auto-extract's named-exception Door 4 in design §17.1) is exercised by tests/cli-auto-extract.test.js — this file consolidates Task 27 checkpoint fixes that don't add new IPC surface.
// Door 5 N/A: side-effect observability (extract.log entries, audit-log entries) is already pinned by per-module tests — this file's tests target the specific composition contracts the Task 27 review surfaced.

// Tests for Task 27 — Layer 4 checkpoint review fixes.
//
// Each finding from the layer-wide review (subagent report 2026-05-27)
// gets a focused test here. Per-module tests still own the surface
// behavior; these tests pin the cross-module composition contracts
// that the review found were either missing OR latent.
//
// Findings in scope:
//   - I1: auto-extract turn-file cleanup in finally block
//   - I2: classifyHighTrustWrite discriminator pure function
//   - I3: capturePrompt → captureTurn integration (heading-format contract)
//   - B2: auto-extract → cooldown marker → compress-session skip
//   B1 is pinned in tests/cli-memory-write.test.js (errors-field assertion
//   added to the existing Poison_Guard test) since it's a return-shape
//   contract rather than a cross-module composition.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  statSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  runAutoExtract,
  classifyHighTrustWrite,
} from '../packages/cli/src/auto-extract.mjs';
import { compressSession } from '../packages/cli/src/compress-session.mjs';
import { MockHaikuBackend } from '../packages/cli/src/compressor.mjs';
import { install } from '../packages/cli/src/install.mjs';
import { capturePrompt } from '../packages/cli/src/capture-prompt.mjs';
import { captureTurn } from '../packages/cli/src/capture-turn.mjs';

function makeFixture() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-task27-fixes-'));
  const projectRoot = join(sandbox, 'proj');
  return { sandbox, projectRoot };
}

async function installFixture(projectRoot) {
  await install({ projectRoot, userTier: join(projectRoot, '..', 'user') });
}

function writeTurnFile(projectRoot, body) {
  const transcriptsDir = join(projectRoot, 'context', 'transcripts');
  mkdirSync(transcriptsDir, { recursive: true });
  const path = join(
    transcriptsDir,
    `.extract-${Date.now()}-${Math.floor(Math.random() * 100000)}.tmp`,
  );
  writeFileSync(path, body, 'utf8');
  return path;
}

function mockBackend(...lines) {
  return new MockHaikuBackend({
    responses: [
      {
        outputText: lines.join('\n'),
        inputTokens: 100,
        outputTokens: 20,
        costUSD: 0.0001,
        preservedIds: [],
      },
    ],
  });
}

describe('Task 27 — Layer 4 checkpoint review fixes', () => {
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

  describe('I1 — auto-extract turn-file cleanup', () => {
    it('deletes the turn-file after a successful auto-extract', async () => {
      const turnFile = writeTurnFile(
        projectRoot,
        '## ts — assistant\n\nuser standardized on python 3.13 for new projects',
      );
      expect(existsSync(turnFile)).toBe(true);
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user:python 3.13 is the project default'),
        now: '2026-05-27T10:00:00Z',
      });
      expect(r.action).toBe('extracted');
      expect(existsSync(turnFile)).toBe(false);
    });

    it('deletes the turn-file even on the nothing_durable skipped path', async () => {
      const turnFile = writeTurnFile(projectRoot, 'small talk');
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('SKIP'),
        now: '2026-05-27T10:00:01Z',
      });
      expect(r.action).toBe('skipped');
      expect(existsSync(turnFile)).toBe(false);
    });
  });

  describe('I2 — classifyHighTrustWrite discriminator', () => {
    it('returns "memory" for appended', () => {
      expect(classifyHighTrustWrite({ action: 'appended', id: 'P-AAAAAAAA' }))
        .toBe('memory');
    });

    it('returns "conflict" for queued (defensive — currently unreachable from auto-extract)', () => {
      expect(classifyHighTrustWrite({ action: 'queued', id: 'P-AAAAAAAA' }))
        .toBe('conflict');
    });

    it('returns "rejected" for any error / unknown action', () => {
      expect(classifyHighTrustWrite({ action: 'error', errorCategory: 'poison_guard' }))
        .toBe('rejected');
      expect(classifyHighTrustWrite({ action: 'rejected' })).toBe('rejected');
      expect(classifyHighTrustWrite(null)).toBe('rejected');
      expect(classifyHighTrustWrite(undefined)).toBe('rejected');
    });
  });

  describe('I3 — capturePrompt → captureTurn integration', () => {
    it('captureTurn picks up the user prompt captureTurn wrote into the transcript', () => {
      // Per the bi-turn contract (design §6.4): capture-turn reads back
      // the most-recent USER heading from the transcript. The heading
      // format is the contract between capturePrompt and captureTurn.
      // This test pins the integration end-to-end; a future change to
      // either side's heading format breaks here, not at production
      // surface time.
      capturePrompt({
        payload: { prompt: 'I prefer pnpm over npm for new projects' },
        projectRoot,
        now: '2026-05-27T10:00:00Z',
      });
      const r = captureTurn({
        payload: {
          assistant_message: 'Noted — will scaffold new projects with pnpm.',
        },
        projectRoot,
        now: '2026-05-27T10:00:01Z',
      });
      expect(r.action).toBe('captured');
      expect(existsSync(r.turnFile)).toBe(true);
      const body = readFileSync(r.turnFile, 'utf8');
      expect(body).toContain('I prefer pnpm over npm');
      expect(body).toContain('Noted — will scaffold new projects with pnpm.');
    });
  });

  describe('B2 — auto-extract → cooldown → compress-session composition', () => {
    it('auto-extract touches the cooldown marker on success', async () => {
      const turnFile = writeTurnFile(projectRoot, 'a turn');
      await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user:durable fact'),
        now: '2026-05-27T10:00:00Z',
      });
      const marker = join(
        projectRoot,
        'context',
        '.locks',
        'last-haiku-call.ts',
      );
      expect(existsSync(marker)).toBe(true);
      // mtime should be at/near 2026-05-27T10:00:00Z
      const mtimeMs = statSync(marker).mtimeMs;
      const expectedMs = new Date('2026-05-27T10:00:00Z').getTime();
      expect(Math.abs(mtimeMs - expectedMs)).toBeLessThan(5000); // 5s tolerance
    });

    it('compress-session skips when auto-extract just ran within 120s', async () => {
      // Auto-extract runs first; sets the cooldown marker mtime to T0.
      const turnFile = writeTurnFile(projectRoot, 'a turn');
      await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user:auto-extracted fact'),
        now: '2026-05-27T10:00:00Z',
      });
      // Now compress-session fires at T0+10s (within the 120s cooldown).
      writeFileSync(
        join(projectRoot, 'context', 'sessions', 'now.md'),
        '## ts\n\nlive buffer content\n',
        'utf8',
      );
      const r = await compressSession({
        projectRoot,
        backend: mockBackend('## Decisions\n- something'),
        now: '2026-05-27T10:00:10Z',
      });
      expect(r.action).toBe('skipped');
      expect(r.reason).toBe('cooldown');
    });

    it('compress-session DOES run when auto-extract last fired >120s ago', async () => {
      const turnFile = writeTurnFile(projectRoot, 'a turn');
      await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user:auto-extracted fact'),
        now: '2026-05-27T10:00:00Z',
      });
      writeFileSync(
        join(projectRoot, 'context', 'sessions', 'now.md'),
        '## ts\n\nlive buffer content\n',
        'utf8',
      );
      // Fire 200s later (well past the 120s window).
      const r = await compressSession({
        projectRoot,
        backend: mockBackend('## Decisions\n- something'),
        now: '2026-05-27T10:03:20Z',
      });
      expect(r.action).toBe('compressed');
    });

    it('Task 167.F REVERSED: auto-extract does NOT touch the marker on HAIKU_FAILED (a failed call must be free to retry)', async () => {
      // **Original contract (pre-Task-167, preserved as decision-trail):** this
      // test asserted the catch path STILL touched the cooldown on failure, so a
      // failing Haiku blocked compress-session for 120s ("don't re-spend the
      // budget on the broken call").
      // **Task 167.F (D-207, Q5) reverses it:** the cooldown means "I
      // SUCCESSFULLY spent the budget", not "I tried". A FAILED call did not
      // spend it, and blocking the next NEEDED compress for 120s after a
      // *transient* failure was the SECONDARY cause of the 410 KB now.md bloat.
      // Correctness > cost — a failed call leaves the marker untouched so the
      // next compress can retry.
      // Mock a backend that throws (non-timeout).
      const throwingBackend = {
        compress: async () => {
          throw new Error('mock-haiku-fail');
        },
        modelId: () => 'mock-haiku',
      };
      const turnFile = writeTurnFile(projectRoot, 'a turn');
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: throwingBackend,
        now: '2026-05-27T10:00:00Z',
      });
      expect(r.action).toBe('error');
      expect(r.error_category).toBe('haiku_failed');
      const marker = join(
        projectRoot,
        'context',
        '.locks',
        'last-haiku-call.ts',
      );
      // 167.F: the marker is NOT touched on failure → the next compress can retry.
      expect(existsSync(marker)).toBe(false);
    });
  });

  describe('§16.27 honesty check — PostToolUse vs SessionEnd race benign-failure mode', () => {
    // §16.27 (deferred to v0.1.x) documents that a rare race between
    // PostToolUse's async appendFileSync to now.md and SessionEnd's
    // truncateSync(now.md) can leave now.md with leftover post-compress
    // content. The production code at compress-session.mjs:189-193 wraps
    // truncateSync in try/catch and frames the failure as "best-effort"
    // with a benign outcome: "the next session compresses a slightly-
    // larger buffer — not a data-loss event."
    //
    // CLAUDE.md's "lazy-framing hides real bugs" anti-pattern explicitly
    // flags "best-effort" as a framing that can mask real bugs. This
    // test pins the benign-outcome claim: when compress-session sees a
    // now.md buffer that includes already-compressed content (the
    // post-race state), it still produces a structurally valid output
    // and correctly truncates afterward. The kit's behavior degrades to
    // "noisy duplicates in today-{date}.md", NOT to "corruption /
    // malformed archive / crash / data loss".
    //
    // Two tests cover the contract:
    //   1. After-race state → next compressSession produces a valid
    //      today-{date}.md and successfully truncates now.md (the kit
    //      recovers cleanly on the next run; the race-day duplicates
    //      are localized to that one today-{date}.md).
    //   2. The race-day today-{date}.md remains valid Markdown even
    //      after the duplicate-bearing append — `appendFileSync` is
    //      atomic at the line level on both POSIX and NTFS, and the
    //      kit's §8.4 section-heading format doesn't break under
    //      adjacent same-heading appends.
    //
    // If the file-rename fix ever lands per §16.27, these tests should
    // continue to pass — they pin the BENIGN OUTCOME contract, not the
    // current implementation. The fix changes WHEN the race fires, not
    // what the kit does when it does fire.

    it('compress-session tolerates leftover content from a race (no crash, valid output)', async () => {
      // Simulate the post-race state: now.md contains old-session
      // content that was already compressed in a previous SessionEnd
      // (the truncate failed silently per the race) PLUS this
      // session's fresh content.
      const nowMdContent = [
        '## 2026-05-27T10:00:00Z',
        '',
        'Decided to use uv for python project management.',
        'Touched packages/cli/src/install.mjs.',
        '',
        '## 2026-05-27T10:30:00Z',
        '',
        // Fresh content from this session (would normally be the
        // only content in now.md if not for the race):
        'Decided to add a SessionStart hook with 30s timeout.',
        'Touched plugin/hooks/hooks.json.',
        '',
      ].join('\n');
      writeFileSync(
        join(projectRoot, 'context', 'sessions', 'now.md'),
        nowMdContent,
        'utf8',
      );

      // Run compress-session (mock Haiku echoes the §8.4 shape).
      const r = await compressSession({
        projectRoot,
        backend: mockBackend(
          '## Decisions\n- Use uv for python\n- Add SessionStart hook',
          '## Files Touched',
          '- path: packages/cli/src/install.mjs — added',
          '- path: plugin/hooks/hooks.json — updated',
        ),
        now: '2026-05-27T11:00:00Z',
      });

      // The kit completes the compression normally.
      expect(r.action).toBe('compressed');

      // today-{date}.md exists + is non-empty + is valid utf-8.
      const todayPath = join(
        projectRoot,
        'context',
        'sessions',
        'today-2026-05-27.md',
      );
      expect(existsSync(todayPath)).toBe(true);
      const today = readFileSync(todayPath, 'utf8');
      expect(today.length).toBeGreaterThan(0);
      // §8.4 section headings appear (compression structurally honored
      // the prompt despite the larger input buffer).
      expect(today).toMatch(/##\s+Decisions/);

      // now.md carries NO leftover content after the roll. Task 106's file-
      // rename impl claims the buffer (rename → compress → drop), so an
      // uncontended roll leaves now.md ABSENT rather than truncate-to-0-bytes —
      // the honest contract is "no leftover", impl-agnostic (this is exactly the
      // size===0 → empty-or-absent correction §16.27 predicted the honesty tests
      // would need when the rename fix landed).
      const nowMdPath = join(
        projectRoot,
        'context',
        'sessions',
        'now.md',
      );
      const leftover = existsSync(nowMdPath)
        ? readFileSync(nowMdPath, 'utf8').trim()
        : '';
      expect(leftover).toBe('');
    });

    it('two SUCCESSIVE compress-session runs across a (simulated) race day produce structurally valid today-{date}.md', async () => {
      // Round 1: normal compress-session writes today-2026-05-27.md.
      writeFileSync(
        join(projectRoot, 'context', 'sessions', 'now.md'),
        '## 2026-05-27T10:00:00Z\n\nFirst session content.\n',
        'utf8',
      );
      await compressSession({
        projectRoot,
        backend: mockBackend('## Decisions\n- first session'),
        now: '2026-05-27T10:30:00Z',
      });
      const todayPath = join(
        projectRoot,
        'context',
        'sessions',
        'today-2026-05-27.md',
      );
      const sizeAfterFirst = statSync(todayPath).size;
      expect(sizeAfterFirst).toBeGreaterThan(0);

      // Simulate the race: PostToolUse "appended" to now.md after the
      // truncate would have happened (i.e., the truncate failed
      // silently). The next session's content also lands here.
      writeFileSync(
        join(projectRoot, 'context', 'sessions', 'now.md'),
        // Leftover-from-race + fresh second-session content:
        '## 2026-05-27T10:00:00Z\n\nFirst session content.\n\n## 2026-05-27T11:00:00Z\n\nSecond session content.\n',
        'utf8',
      );

      // Round 2: compress-session at T+200s (past the 120s cooldown).
      const r = await compressSession({
        projectRoot,
        backend: mockBackend('## Decisions\n- second session', '## Active Threads\n- still working'),
        now: '2026-05-27T10:33:20Z',
      });
      expect(r.action).toBe('compressed');

      // today-{date}.md grew (the second compression appended).
      const sizeAfterSecond = statSync(todayPath).size;
      expect(sizeAfterSecond).toBeGreaterThan(sizeAfterFirst);

      // today-{date}.md remains valid (no malformed sections, no
      // truncation, no encoding corruption — even though the input
      // buffer in round 2 included leftover content from the race).
      const today = readFileSync(todayPath, 'utf8');
      expect(today).toMatch(/##\s+Decisions/);
      // Both rounds' content is present (the "noisy duplicates"
      // outcome §16.27 documents — but the FILE is still well-formed).
      expect(today).toContain('first session');
      expect(today).toContain('second session');
    });
  });
});

describe('Task 106 — §16.27 race CLOSED via file-rename (concurrent append survives)', () => {
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

  // The race: compressSession reads now.md, spends ~5–10s in Haiku, then clears
  // now.md. A turn the (new) session appends DURING that window must NOT be lost.
  // Task 105 made this likely (the SessionStart lazy roll fires while a new
  // session is actively appending). The fix is the §16.27 file-rename pattern:
  // claim now.md by atomic rename → compress the renamed copy → drop it; the
  // concurrent append lands on a fresh now.md, untouched.
  //
  // We make it deterministic by having the backend append to now.md mid-Haiku
  // (the exact read→clear window). With the OLD truncate impl this test fails
  // (the new turn is truncated away); with file-rename it passes.
  it('a turn appended to now.md DURING the Haiku call is preserved (not dropped)', async () => {
    const nowMdPath = join(projectRoot, 'context', 'sessions', 'now.md');
    writeFileSync(
      nowMdPath,
      '## 2026-05-27T10:00:00Z — user\n\nPRIOR_SESSION_CONTENT to roll\n',
      'utf8',
    );

    const SENTINEL = 'NEW_TURN_APPENDED_DURING_ROLL';
    // A backend that simulates a concurrent session writing a fresh turn to
    // now.md while the roll is mid-flight (between the read and the clear).
    const racingBackend = {
      modelId: () => 'mock-racing',
      estimatedCostPerCall: () => 0,
      async compress() {
        appendFileSync(
          nowMdPath,
          `\n## 2026-05-27T11:00:05Z — user\n\n${SENTINEL}\n`,
          'utf8',
        );
        return {
          outputText: '## Decisions\n- rolled the prior session',
          inputTokens: 20,
          outputTokens: 10,
          costUSD: 0,
          preservedIds: [],
        };
      },
    };

    const r = await compressSession({
      projectRoot,
      backend: racingBackend,
      now: '2026-05-27T11:00:00Z',
    });
    expect(r.action).toBe('compressed');

    // today-*.md got the compressed PRIOR content.
    const today = readFileSync(
      join(projectRoot, 'context', 'sessions', 'today-2026-05-27.md'),
      'utf8',
    );
    expect(today).toContain('rolled the prior session');

    // The crux: the turn appended mid-roll SURVIVES in now.md (was NOT
    // truncated away with the rolled buffer).
    expect(existsSync(nowMdPath)).toBe(true);
    const nowAfter = readFileSync(nowMdPath, 'utf8');
    expect(nowAfter).toContain(SENTINEL);
    // ...and the PRIOR content is gone from now.md (it was rolled, not left behind).
    expect(nowAfter).not.toContain('PRIOR_SESSION_CONTENT');
  });

  it('on Haiku FAILURE the un-rolled buffer is restored to now.md (next roll retries it)', async () => {
    const nowMdPath = join(projectRoot, 'context', 'sessions', 'now.md');
    writeFileSync(nowMdPath, '## t — user\n\nBUFFER_TO_PRESERVE_ON_FAILURE\n', 'utf8');

    const failingBackend = {
      modelId: () => 'mock-fail',
      estimatedCostPerCall: () => 0,
      async compress() {
        throw new Error('simulated Haiku failure');
      },
    };

    const r = await compressSession({
      projectRoot,
      backend: failingBackend,
      now: '2026-05-27T11:00:00Z',
    });
    expect(r.action).toBe('error');
    // The buffer is NOT lost — it's back in now.md for the next roll.
    expect(existsSync(nowMdPath)).toBe(true);
    expect(readFileSync(nowMdPath, 'utf8')).toContain('BUFFER_TO_PRESERVE_ON_FAILURE');
    // No orphaned rolling file left behind.
    const sessionsDir = join(projectRoot, 'context', 'sessions');
    const orphans = readdirSync(sessionsDir).filter((n) => n.includes('.rolling-'));
    expect(orphans).toEqual([]);
  });
});
