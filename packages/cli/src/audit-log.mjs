// Canonical audit-log writer for every kit module that mutates state.
// Per the Layer-2 review's I4 finding, the three writers (writeFact-skipped,
// forget, merge-facts) had been writing to the same <tierRoot>/.locks/audit.log
// in three different schemas — `path` vs `originalPath` vs `newPath`; `reason`
// overloaded as enum vs free-text; `tier` missing from writeFact entries.
//
// This module is the single sanctioned audit-log writer. New writers (Task 24
// memory-write, Task 15 trust override, etc.) MUST import appendAuditEntry
// from here. See CLAUDE.md "Shared modules" rule.
//
// Schema v1 (canonical):
//   {
//     ts: ISO 8601 UTC,
//     schema: 1,
//     action: enum string,
//     tier: 'P' | 'L' | 'U',
//     id: citation ID of the affected fact,
//     reasonCode: enum string (machine-parseable),
//     reasonText?: free-form string (human-readable, optional),
//     paths?: { before?, after?, archive? } where each value is string|string[],
//     extra?: object (action-specific extension fields)
//   }

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const AUDIT_LOG_SCHEMA_VERSION = 1;

// Enum of reasonCode values seen in v0.1. New writers may add codes here as
// they come online; the rule is one canonical machine-parseable token per
// kind of audit event (not a free-text reason field).
export const REASON_CODES = Object.freeze({
  FACT_CREATED: 'fact-created', // writeFact: a new fact file was written (Task 123.A — the default create audit; callers emitting a richer code opt out via audit:false)
  DUPLICATE: 'duplicate', // writeFact: same path + same id
  DUPLICATE_ELSEWHERE: 'duplicate-elsewhere', // writeFact: different path + same id
  RECURRENCE: 'recurrence', // writeFact: a duplicate write = the same canonical fact re-surfaced → recurrence_count bumped (Task 151.1, ADR-0016 — the capped-recurrence promotion signal)
  INDEX_REBUILD_FAILED: 'index-rebuild-failed', // writeFact: the fact landed on disk but the best-effort INDEX.md rebuild threw (e.g. a detached auto-extract child killed mid-rebuild). Surfaces what was previously a SILENTLY swallowed catch (D-152) so a lagging committed INDEX is diagnosable; the next reindex/cmk reindex self-heals.
  USER_REQUESTED: 'user-requested', // forget: user-initiated tombstone
  CURATED_MERGE: 'curated-merge', // mergeFacts: explicit merge of A + B → C
  TEMPORAL_SUPERSEDE: 'temporal-supersede', // validity-window: a newer fact superseded an older CURRENT-STATE claim → window closed at the newer created_at (Task 66.2, D-259)
  SCRATCHPAD_APPEND: 'scratchpad-append', // scratchpad: appendScratchpadBullet (Task 12)
  SCRATCHPAD_GRADUATED: 'scratchpad-graduated', // graduation: high-trust bullet moved out to a fact file under cap pressure (Task 91.1)
  SCRATCHPAD_EVICTED: 'scratchpad-evicted', // consolidate: stale low/medium bullet dropped under cap pressure, archived to memory/archive/evicted-bullets.md (Task 91.2)
  TRUST_CHANGE: 'trust-change', // trust: overrideTrust (Task 15)
  TRUST_SIGNAL_REINFORCE: 'reinforce', // trust-signal: a screened passive reinforce applied a trust_score delta (Task 193)
  TRUST_SIGNAL_DAMPEN: 'dampen', // trust-signal: a screened passive dampen applied a trust_score delta (Task 193)
  CONFLICT_QUEUED: 'conflict-queued', // conflict-queue: new write contradicts existing higher-trust fact, routed to queues/conflicts.md (Task 25, design §6.8)
  CONFLICT_RESOLVED: 'conflict-resolved', // conflict-queue: user resolved a pending conflict via cmk queue conflicts (keep-old / keep-new / merge-both)
  REVIEW_PROMOTED: 'review-promoted', // review-queue: user promoted a medium-trust auto-extract to MEMORY.md (Task 26, design §6.2)
  REVIEW_DISCARDED: 'review-discarded', // review-queue: user discarded a medium-trust auto-extract via cmk queue review
  IMPORT_APPLIED: 'import-applied', // import-anthropic-memory: bullet applied to project MEMORY.md with write_source:imported (Task 38)
  IMPORT_SKIPPED_DUPLICATE: 'import-skipped-duplicate', // import-anthropic-memory: candidate canonicalize-matched existing fact, skipped (Task 38)
  IMPORT_SCREENED: 'import-screened', // import-sessions: a session's summary was rejected by screenBeforeCommittedWrite — recorded (ledger status:screened) so re-runs don't re-buy the summary (Task 225)
  IMPORT_SKIPPED_EMPTY: 'import-skipped-empty', // import-sessions: session had zero text turns after the extract filter; ledgered so re-runs skip it without a backend call (Task 225)
  REPAIR_HOOKS_APPLIED: 'repair-hooks-applied', // cmk repair --hooks: settings.json updated with canonical kit hooks (Task 39)
  REPAIR_HOOKS_NOOP: 'repair-hooks-noop', // cmk repair --hooks: settings.json already canonical, no-op (Task 39)
  INSTALL_HOOKS_WIRED: 'install-hooks-wired', // cmk install: settings.json wired with npm-route hooks (Task 49). NOTE: no NOOP counterpart — install audits only on change, to keep re-runs byte-idempotent (the audit.log is append-only).
  REPAIR_LOCK_REMOVED: 'repair-lock-removed', // cmk repair --locks: stale lock unlinked (Task 39)
  PERSONA_PROMOTED: 'persona-promoted', // auto-persona: cross-project doctrine auto-promoted into a user-tier scratchpad at trust:medium (Task 45, design §16.16)
  PERSONA_SUPERSEDED: 'persona-superseded', // auto-persona: a promoted persona fact auto-superseded a contradicting existing one (Task 45.6, reuses Task 25 conflict detection)
  PERSONA_SECTION_CREATED: 'persona-section-created', // auto-persona: a new `## ` section was created on a user-tier scratchpad to land a candidate (Task 64 / F2)
  PERSONA_IMPORTED: 'persona-imported', // persona-portability: a user-tier persona bundle was imported onto this machine (Task 72)
  POISON_GUARD_REJECTED: 'poison-guard-rejected', // Task 216 (D-320): a durable write was dropped by screenBeforeCommittedWrite at a site with no project-scoped poison-guard.log (e.g. the user-tier persona-review queue) — the redacted audit entry is the observability trail so the drop is never silent
});

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function auditLogPath(tierRoot) {
  return join(tierRoot, '.locks', 'audit.log');
}

export function appendAuditEntry(tierRoot, entry) {
  // Required-field validation. Throw immediately on caller error; this catches
  // schema drift at write time rather than at log-parse time later.
  for (const field of ['action', 'tier', 'id', 'reasonCode']) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
      throw new Error(
        `audit-log: missing required field "${field}" in entry ${JSON.stringify(entry)}`,
      );
    }
  }

  const canonical = {
    ts: entry.ts ?? nowIso(),
    schema: AUDIT_LOG_SCHEMA_VERSION,
    action: entry.action,
    tier: entry.tier,
    id: entry.id,
    reasonCode: entry.reasonCode,
  };
  if (entry.reasonText !== undefined) canonical.reasonText = entry.reasonText;
  if (entry.paths !== undefined) canonical.paths = entry.paths;
  // Field name is `extra` (singular). Caller convention across the kit
  // (memory-write, conflict-queue, etc.); plural `extras` is a common
  // typo — caught in tests but worth naming here so future modules
  // pick the right key.
  if (entry.extra !== undefined) canonical.extra = entry.extra;

  const locksDir = join(tierRoot, '.locks');
  mkdirSync(locksDir, { recursive: true });
  appendFileSync(
    auditLogPath(tierRoot),
    JSON.stringify(canonical) + '\n',
    'utf8',
  );
}

// Convenience reader, useful for tests + future cmk doctor + cmk queue
// commands. Returns [] if the log doesn't exist yet.
export function readAuditLog(tierRoot) {
  const path = auditLogPath(tierRoot);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}
