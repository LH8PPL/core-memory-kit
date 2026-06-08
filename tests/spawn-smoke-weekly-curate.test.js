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

describeMaybe(`spawn-smoke: weeklyCurate archive path (live: ${skipReason ?? 'enabled'})`, () => {
  // ONE real-Haiku archive round-trip. `skipRecentRebuild: true` pins this smoke
  // to the archive call (the F-4 target); the recent.md rebuild is a separate
  // path (its own dailyDistill smoke). 120s timeout: the archive call carries the
  // 50s inner Haiku bound, and weekly-curate may also fire the (usually no-op on a
  // fresh install) persona pass — generous headroom for a slow round-trip.
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

      const r = await weeklyCurate({
        projectRoot,
        userDir,
        now,
        cooldownMs: 0, // force a real run (the cut-gate sweep only ever saw cooldown-skip)
        backend: new HaikuViaAnthropicApi(),
        skipRecentRebuild: true,
      });

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
  }, 120_000);
});
