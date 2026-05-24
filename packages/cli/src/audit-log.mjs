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
  DUPLICATE: 'duplicate', // writeFact: same path + same id
  DUPLICATE_ELSEWHERE: 'duplicate-elsewhere', // writeFact: different path + same id
  USER_REQUESTED: 'user-requested', // forget: user-initiated tombstone
  CURATED_MERGE: 'curated-merge', // mergeFacts: explicit merge of A + B → C
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
