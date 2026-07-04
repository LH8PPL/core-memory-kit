// SessionEnd orchestrator (Task 86b + D-42). The shared brain behind both
// cmk-compress-session bins (npm: packages/cli/bin/; plugin: plugin/bin/) —
// extracted so the orchestration lives in ONE testable place instead of being
// duplicated across the twin bins (the twin-bin drift hazard CLAUDE.md warns
// about).
//
// What it does: at session end we run TWO independent Haiku passes —
//   1. compressSession — reads sessions/now.md (the session buffer) → writes
//      sessions/today-{date}.md, truncates now.md, appends compress.log.
//   2. autoPersona — reads the context/memory/ fact corpus (written per-turn by
//      auto-extract, NOT by compressSession) → promotes cross-project doctrine
//      into the user-tier persona scratchpads.
//
// They have DISJOINT inputs and DISJOINT outputs (compress touches the project
// sessions/ tree; persona touches the user-tier scratchpads + audit.log; neither
// reads the other's writes; neither takes a lock the other needs). So we run them
// CONCURRENTLY via Promise.allSettled.
//
// Why concurrent, not sequential (the D-42 composition fix): each pass carries a
// 50s inner Haiku timeout, and the SessionEnd hook ceiling is 60s (design §8.5 /
// plugin/hooks/hooks.json). Run sequentially, the worst case is 50s + 50s = 100s
// — well over the ceiling, so the OS would kill the hook mid-persona-write,
// dropping {"continue": true} AND risking a half-written user-tier INDEX (HC-5
// corruption, shared across every project). Run concurrently, the wall-clock is
// max(50s, 50s) ≈ 50s — comfortably inside 60s. compressSession is correct alone
// (50<60); autoPersona is correct alone (50<60); only their SEQUENTIAL composition
// was broken. Concurrency is the composition fix.
//
// allSettled (not all): both passes are best-effort. A failure in one must never
// discard the other's result, and must never reject up into the hook (a thrown
// SessionEnd hook blocks the user from closing their terminal). Each pass gets its
// OWN backend instance (makeBackend factory) so there is zero shared mutable state
// across the two concurrent calls.

import { compressSession } from './compress-session.mjs';
import { autoPersona } from './auto-persona.mjs';
import { graduateAllScratchpads } from './graduate-session.mjs';
import { syncDecisionsJournal } from './decisions-journal.mjs';
import { temporalSweep } from './temporal-sweep.mjs';

/**
 * Run the two independent SessionEnd Haiku passes concurrently.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot - resolved project root (CMK_PROJECT_DIR or cwd).
 * @param {string} opts.userDir - user-tier root (~/.claude-memory-kit or override).
 * @param {() => object} opts.makeBackend - factory returning a fresh CompressorBackend
 *   per call (each concurrent pass gets its own instance — no shared state).
 * @param {string} [opts.now] - ISO timestamp override (tests).
 * @returns {Promise<{compressOutcome: PromiseSettledResult, personaOutcome: PromiseSettledResult, graduationOutcome: PromiseSettledResult, journalOutcome: PromiseSettledResult}>}
 */
export async function runSessionEndTasks({ projectRoot, userDir, makeBackend, now }) {
  const [compressOutcome, personaOutcome, temporalOutcome] = await Promise.allSettled([
    compressSession({ projectRoot, backend: makeBackend(), now }),
    // cooldownMs:0 — compressSession runs concurrently and would otherwise trip the
    // shared 120s Haiku cooldown gate; at SessionEnd we explicitly want persona to run.
    // source:'transcript' (Task 86c / D-44) — classify the RAW recent conversation,
    // where standing-rule statements survive verbatim, NOT the distilled fact corpus
    // (which strips the cross-project signal). This is what makes the cold-open work.
    autoPersona({ projectRoot, userDir, backend: makeBackend(), cooldownMs: 0, now, source: 'transcript' }),
    // Task 198.1 (D-266): the temporal contradiction-catch runs at EVERY Haiku
    // maintenance site, not weekly-only — so a stale-State pair created THIS
    // session is closed by the NEXT session boundary instead of waiting up to a
    // week. It joins the CONCURRENT block (not sequential) for the 60s-ceiling
    // composition (D-92/F-2): a third ~50s-max Haiku call run after the ~50s
    // concurrent block would blow the ceiling; overlapping keeps the wall-clock
    // at max(...), not the sum. DISJOINT from the other two — compress touches
    // sessions/, persona the user-tier scratchpads, the sweep reads the fact
    // corpus + the SQLite index and writes validity windows/audit; none reads
    // another's writes. Best-effort (its own contract never throws for a judge
    // hiccup; allSettled isolates an unexpected crash). Its no-new-facts
    // short-circuit returns BEFORE any Haiku call, so an idle session is ~free.
    temporalSweep({ projectRoot, userDir, backend: makeBackend(), now }),
  ]);

  // Task 94.3: proactive graduation sweep. SEQUENTIAL, AFTER the concurrent block —
  // autoPersona WRITES the user-tier persona scratchpads and graduation READS+
  // rewrites them, so they share inputs and must NOT overlap (the §6.8/§7.1
  // disjoint-input rule). Running it here means the sweep sees the freshly-promoted
  // persona, then trims any overflow so the next session's injected slice stays
  // under its load-cap. Pure local file I/O (no Haiku/network) → adds <<1s, no
  // hook-ceiling risk. Wrapped so a synchronous throw can't reject up into the hook.
  let graduationOutcome;
  try {
    graduationOutcome = {
      status: 'fulfilled',
      value: graduateAllScratchpads({ projectRoot, userDir, now }),
    };
  } catch (err) {
    graduationOutcome = { status: 'rejected', reason: err };
  }

  // Task 159 (D-169): auto-sync the decision journal. This is what makes
  // DECISIONS.md "automatic" (D-164) — Task 147 BUILT the append logic but wired
  // it to ONLY the manual `cmk digest`, so the journal never populated on its own.
  // Same shape as the graduation sweep: SEQUENTIAL, pure local file I/O (reads the
  // type:project fact files auto-extract wrote per-turn → rewrites DECISIONS.md),
  // no Haiku/network (~175ms), no hook-ceiling risk, wrapped so a throw can't reject
  // the hook. DISJOINT from compress (sessions/ tree) + persona (user-tier) +
  // graduation (persona scratchpads) — nothing else in the block touches DECISIONS.md,
  // so no lock contention. Session-end is the natural "this session's decisions
  // landed → render them" boundary (squad's session-end Scribe instinct, made
  // deterministic — the kit's typed-fact substrate needs no LLM to merge).
  // syncDecisionsJournal is already best-effort (its own try/catch returns
  // {written:false,error}); the wrapper here guards the unexpected synchronous throw.
  let journalOutcome;
  try {
    journalOutcome = {
      status: 'fulfilled',
      value: syncDecisionsJournal({ projectRoot, now }),
    };
  } catch (err) {
    journalOutcome = { status: 'rejected', reason: err };
  }

  return { compressOutcome, personaOutcome, temporalOutcome, graduationOutcome, journalOutcome };
}

/**
 * Render the two outcomes into stderr diagnostic lines (shared by both bins so
 * the log shape can't drift between them). Pure — returns an array of lines, each
 * already newline-terminated.
 *
 * @param {{compressOutcome: PromiseSettledResult, personaOutcome: PromiseSettledResult}} outcomes
 * @returns {string[]}
 */
export function summarizeSessionEnd({ compressOutcome, personaOutcome, temporalOutcome, graduationOutcome, journalOutcome }) {
  const lines = [];

  if (compressOutcome.status === 'fulfilled') {
    const r = compressOutcome.value ?? {};
    const reason = r.reason ? ` (${r.reason})` : '';
    const bytes = r.bytesIn ? ` (in: ${r.bytesIn}b, out: ${r.bytesOut}b)` : '';
    lines.push(`cmk-compress-session: ${r.action}${reason}${bytes} ms: ${r.duration_ms ?? 0}\n`);
  } else {
    const e = compressOutcome.reason;
    lines.push(`cmk-compress-session: unexpected error: ${e?.message ?? e}\n`);
  }

  if (personaOutcome.status === 'fulfilled') {
    const p = personaOutcome.value ?? {};
    lines.push(
      `cmk-compress-session: persona ${p.action} (promoted: ${p.promoted?.length ?? 0}, queued: ${p.queued?.length ?? 0})\n`,
    );
  } else {
    const e = personaOutcome.reason;
    lines.push(`cmk-compress-session: persona refresh failed: ${e?.message ?? e}\n`);
  }

  // temporalOutcome is optional (Task 198) — pre-198 callers render no line.
  if (temporalOutcome) {
    if (temporalOutcome.status === 'fulfilled') {
      const t = temporalOutcome.value ?? {};
      const detail = t.reason ? ` (${t.reason})` : ` (superseded: ${t.superseded ?? 0}, duplicates: ${t.duplicates ?? 0})`;
      lines.push(`cmk-compress-session: temporal ${t.action}${detail} pairs: ${t.pairs_judged ?? 0}\n`);
    } else {
      const e = temporalOutcome.reason;
      lines.push(`cmk-compress-session: temporal sweep failed: ${e?.message ?? e}\n`);
    }
  }

  // graduationOutcome is optional so pre-94.3 callers (and the orchestrator tests
  // that pass only the two Haiku outcomes) still render exactly two lines.
  if (graduationOutcome) {
    if (graduationOutcome.status === 'fulfilled') {
      const g = graduationOutcome.value ?? {};
      lines.push(
        `cmk-compress-session: graduation (graduated: ${g.totalGraduated ?? 0}, consolidated: ${g.totalConsolidated ?? 0})\n`,
      );
    } else {
      const e = graduationOutcome.reason;
      lines.push(`cmk-compress-session: graduation failed: ${e?.message ?? e}\n`);
    }
  }

  // journalOutcome is optional (Task 159) — pre-159 callers render no journal line.
  if (journalOutcome) {
    if (journalOutcome.status === 'fulfilled') {
      const j = journalOutcome.value ?? {};
      lines.push(
        `cmk-compress-session: journal (written: ${j.written ?? false}, appended: ${j.appended ?? 0})\n`,
      );
    } else {
      const e = journalOutcome.reason;
      lines.push(`cmk-compress-session: journal sync failed: ${e?.message ?? e}\n`);
    }
  }

  return lines;
}
