// Proactive SessionEnd graduation sweep (Task 94.3, D-61 / design §19).
//
// The reactive relief inside appendScratchpadBullet only fires when a write
// triggers cap pressure. This sweep runs the same relief OUTSIDE the append path,
// across every fact-bearing scratchpad, so each scratchpad's INJECTED slice stays
// under its load-cap even in a read-only session — and low/medium bullets that
// AGED past the 14-day stale window between sessions get caught.
//
// Composition (the §6.8/§7.1 disjoint-input rule): this is invoked by
// runSessionEndTasks SEQUENTIALLY, AFTER the concurrent compress+persona block —
// because autoPersona WRITES the user-tier persona scratchpads (USER/HABITS/
// LESSONS) and this READS+rewrites them, so the two must not overlap. Running
// after means the sweep sees the freshly-promoted persona, then trims overflow.
// It is pure local file I/O (no Haiku/network), so it adds <<1s on top of the
// ~50s concurrent block — no SessionEnd hook-ceiling risk.

import { sweepScratchpadForCapRelief } from './scratchpad.mjs';

// The fact-bearing scratchpads, per tier. The L tier (machine-paths/overrides) is
// machine-specific config, not durable facts — never graduated (matches the
// `tier === 'P' || tier === 'U'` gate in the reactive path).
const GRADUATION_TARGETS = Object.freeze([
  { tier: 'P', scratchpad: 'MEMORY.md' },
  { tier: 'P', scratchpad: 'SOUL.md' },
  { tier: 'U', scratchpad: 'USER.md' },
  { tier: 'U', scratchpad: 'HABITS.md' },
  { tier: 'U', scratchpad: 'LESSONS.md' },
]);

/**
 * Sweep every fact-bearing scratchpad, graduating overflow so each stays under
 * its load-cap. Best-effort: a failure on one scratchpad is captured as an
 * `error` result and never aborts the rest (a SessionEnd hook must never throw).
 *
 * @param {object} opts
 * @param {string} opts.projectRoot - resolved project root.
 * @param {string} opts.userDir - user-tier root.
 * @param {string} [opts.now] - ISO timestamp override (tests).
 * @param {object} [opts.settings] - test-injected cap override.
 * @returns {{results: object[], totalGraduated: number, totalConsolidated: number}}
 */
export function graduateAllScratchpads({ projectRoot, userDir, now, settings } = {}) {
  const results = [];
  for (const t of GRADUATION_TARGETS) {
    try {
      results.push(
        sweepScratchpadForCapRelief({ ...t, projectRoot, userDir, now, settings }),
      );
    } catch (err) {
      results.push({
        tier: t.tier,
        scratchpad: t.scratchpad,
        action: 'error',
        error: err?.message ?? String(err),
        bulletsConsolidated: 0,
        bulletsGraduated: 0,
        graduatedIds: [],
        bytes: 0,
      });
    }
  }
  const totalGraduated = results.reduce((s, r) => s + (r.bulletsGraduated || 0), 0);
  const totalConsolidated = results.reduce((s, r) => s + (r.bulletsConsolidated || 0), 0);
  return { results, totalGraduated, totalConsolidated };
}
