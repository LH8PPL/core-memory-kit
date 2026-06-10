// @doors: 1, 2, 3
// Door 4 N/A: the weekly-curate NDJSON shape is pinned by the cron-chain smoke + the bin test.
// Door 5 N/A: no message-queue interaction.

// Task 112 (F-4): REAL-backend verification of weekly-curate's 7-day-archive path.
//
// The unit test (tests/cli-weekly-curate.test.js) injects a MockHaikuBackend — it
// pins the rotate / dedup / delete LOGIC but NEVER runs the real `claude --print`
// archivist call. And the v0.2.2 cut-gate sweep only ever saw weekly-curate
// "skipped (cooldown)" or a same-day project with nothing >7d to archive — so the
// LIVE archive→archive.md path shipped UNVERIFIED (D-84: "ran without error on
// trivial input" ≠ "the feature works on real input"). This smoke closes that gap:
// it seeds AGED today-*.md (>7d before `now`) and runs the real
// HaikuViaAnthropicApi, so the consolidation path is proven on REAL input.
//
// What this catches that the mock cannot:
//   - The §8.7 archivist prompt is acceptable to real Haiku (no refusal/error/
//     timeout on a reasonable batch of old daily summaries).
//   - Real Haiku output actually lands in archive.md (non-empty consolidation),
//     the aged today-*.md files are rotated out, and the current week is preserved.
//
// CI portability: same skip protocol as the other spawn-smokes — set
// CMK_SKIP_LIVE_HAIKU=1 or run without `claude` on PATH and it degrades to a skip.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { weeklyCurate } from '../packages/cli/src/weekly-curate.mjs';
import { HaikuViaAnthropicApi } from '../packages/cli/src/compressor.mjs';
import { install } from '../packages/cli/src/install.mjs';

function shouldSkip() {
  if (process.env.CMK_SKIP_LIVE_HAIKU === '1') return 'CMK_SKIP_LIVE_HAIKU=1';
  const lookup = process.platform === 'win32'
    ? spawnSync('where', ['claude'], { encoding: 'utf8' })
    : spawnSync('which', ['claude'], { encoding: 'utf8' });
  if (lookup.status !== 0 || !lookup.stdout.trim()) return 'claude binary not on PATH';
  return null;
}

const skipReason = shouldSkip();
const describeMaybe = skipReason ? describe.skip : describe;

// Task 125.2 (the PR #28-queued retry-on-timeout follow-up, landed on the
// user's "maybe if you waited it will succeed?"): classify an error result
// as the documented live-Haiku jitter set — API timeouts, 5xx, network
// blips. ONLY these get the wait-and-retry; everything else (prompt
// rejection, contract drift, fixture bugs) fails immediately.
function isLiveJitter(r) {
  if (r?.action !== 'error') return false;
  if (r.errorCategory === 'haiku_timeout') return true;
  const text = (r.errors ?? []).join(' ');
  // Named transient signals — phrase/errno matches, safe as-is.
  if (/did not return within|timed?.?out|overloaded|rate.?limit|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network error/i.test(text)) {
    return true;
  }
  // Numeric HTTP codes ONLY with status/error context — a bare /5\d\d/
  // would match "line 543" or "took 500ms" and route a real persistent
  // bug into the contract-assert pass path (skill-review finding).
  return /(?:status|error|code|http|api)\D{0,4}\b(?:429|5\d\d)\b|\b(?:429|5\d\d)\b\D{0,4}(?:error|status)/i.test(text);
}

describeMaybe(`spawn-smoke: weeklyCurate archive path (live: ${skipReason ?? 'enabled'})`, () => {
  // ONE real-Haiku archive round-trip. `skipRecentRebuild: true` pins this smoke
  // to the archive call (the F-4 target); the recent.md rebuild is a separate
  // path (its own dailyDistill smoke).
  //
  // 180s timeout (was 120s pre-retry): the FULL retry composition must fit —
  // sandbox install/seed (~5-15s under stress concurrency) + attempt 1 at the
  // 50s inner Haiku bound + 5s backoff + attempt 2 at up to 50s (a SLOW
  // SUCCESS takes as long as a timeout) + assertions. The original 120s
  // composed only 50+5+50 and was killed by vitest at exactly 120s in the
  // 2026-06-10 stress (the inner-bound-vs-outer-ceiling class, design §8.5,
  // recurring in test budgets). Weekly-curate runs from CRON — this budget is
  // a harness bound, not a production-envelope mirror (unlike the
  // compress-session smoke's 60s = SessionEnd hook ceiling), so raising it
  // loses nothing.
  it('archives aged today-*.md into archive.md via REAL Haiku (F-4 real-input verify)', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'cmk-weekly-smoke-'));
    const projectRoot = join(sandbox, 'proj');
    const userDir = join(sandbox, 'user');
    try {
      await install({ projectRoot, userTier: userDir });
      const sessionsDir = join(projectRoot, 'context', 'sessions');
      mkdirSync(sessionsDir, { recursive: true });

      const now = '2026-05-28T09:00:00Z';
      // Aged (>7d before `now`) → MUST be archived.
      const agedDays = ['2026-05-13', '2026-05-14', '2026-05-15'];
      for (const d of agedDays) {
        writeFileSync(
          join(sessionsDir, `today-${d}.md`),
          `## Decisions\n- On ${d} we chose pnpm over npm for the monorepo.\n\n## Environment\n- Node 20 pinned via .nvmrc on ${d}.\n`,
          'utf8',
        );
      }
      // Current (≤7d) → MUST be preserved.
      writeFileSync(
        join(sessionsDir, 'today-2026-05-27.md'),
        '## Decisions\n- Current-week decision: ship the v0.2.3 fix lane.\n',
        'utf8',
      );

      const runOnce = () =>
        weeklyCurate({
          projectRoot,
          userDir,
          now,
          cooldownMs: 0, // force a real run (the cut-gate sweep only ever saw cooldown-skip)
          backend: new HaikuViaAnthropicApi(),
          skipRecentRebuild: true,
        });

      // Task 125.2 — live-jitter handling, two layers:
      //   1. RETRY once: a jitter-class failure (timeout/5xx/network) usually
      //      clears in seconds — the 2026-06-10 stress 4/5 failure passed on
      //      the very next run. The 180s test budget composes the FULL path
      //      (setup + 50s + 5s + 50s + asserts) — see the timeout note above.
      //   2. If the retry is ALSO jitter: assert the degradation CONTRACT
      //      instead of failing the gate (the compress-session smoke's idiom)
      //      — the error path must leave the aged files + archive state
      //      intact so next week's cron retries naturally.
      // Any NON-jitter error (prompt rejection, contract drift) fails the
      // normal assertions immediately — the retry never masks it.
      let r = await runOnce();
      if (isLiveJitter(r)) {
        console.error(
          `[live-jitter-retry] weekly-curate smoke hit the jitter class (${r.errorCategory}: ${(r.errors ?? []).join('; ')}) — retrying once in 5s`,
        );
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        r = await runOnce();
      }
      if (isLiveJitter(r)) {
        // Persistent API degradation — verify the kit degraded correctly:
        // nothing rotated, no partial archive append, so the next weekly
        // run re-attempts the same aged files.
        console.error(
          '[live-jitter-retry] still jittering after retry — asserting the degradation contract instead',
        );
        for (const d of agedDays) {
          expect(
            existsSync(join(sessionsDir, `today-${d}.md`)),
            `aged today-${d}.md must survive a jitter failure so next week retries`,
          ).toBe(true);
        }
        expect(existsSync(join(sessionsDir, 'archive.md'))).toBe(false);
        return;
      }

      // Door 1 (Response): the archive path actually ran on real input.
      expect(r.action).toBe('curated');
      expect(r.archivedDays).toBe(agedDays.length);

      // Door 2 (State): archive.md written with REAL Haiku content; aged rotated; current kept.
      const archivePath = join(sessionsDir, 'archive.md');
      expect(existsSync(archivePath)).toBe(true);
      expect(readFileSync(archivePath, 'utf8').trim().length).toBeGreaterThan(0);
      for (const d of agedDays) {
        expect(existsSync(join(sessionsDir, `today-${d}.md`))).toBe(false);
      }
      expect(existsSync(join(sessionsDir, 'today-2026-05-27.md'))).toBe(true);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 180_000);
});
