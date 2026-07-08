// redactions-log.mjs — the false-positive recovery surface for the privacy
// screen (Task 148.6, ADR-0019, design §6.10). Every L1/L3 redaction records
// original → placeholder here — the ONE place originals survive.
//
// Shape: NDJSON at <projectRoot>/context/.locks/redactions.log — the .locks
// tier is gitignored (run-time local state, same class as recall.log), so the
// originals are machine-local by construction and never travel with git.
// One line per redaction batch:
//
//   { ts, source, layer: 'L1'|'L3', redactions: [{category, placeholder, original}] }
//
// This is deliberately the INVERSE of the audit posture: audit findings carry
// category+offsets and never the text (design §6.10); THIS log carries the
// text and never ships. Together they give recoverability without leakage —
// the field has no release path at all (the memclaw gap, ADR-0019).
//
// Append is BEST-EFFORT (hook-adjacent paths must never break capture);
// read is corrupt-tolerant (an interrupted append must not poison the log).
// Rotation rides the §16.13 .locks-log posture when it ships.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function redactionsLogPath(projectRoot) {
  return join(projectRoot, 'context', '.locks', 'redactions.log');
}

/**
 * Append one redaction batch. No-op on an empty batch (clean turns are free).
 * Best-effort: returns { ok:false } on any filesystem failure, never throws.
 *
 * @param {string} projectRoot
 * @param {object} entry
 * @param {string} entry.source - where the redaction happened (file/site label).
 * @param {'L1'|'L3'} entry.layer - pattern layer or judge layer.
 * @param {Array<{category:string, placeholder:string, original:string}>} entry.redactions
 * @returns {{ ok: boolean }}
 */
export function appendRedactions(projectRoot, { source, layer, redactions = [] } = {}) {
  if (!Array.isArray(redactions) || redactions.length === 0) return { ok: true };
  try {
    const line = {
      ts: new Date().toISOString(),
      source,
      layer,
      redactions,
    };
    mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });
    appendFileSync(redactionsLogPath(projectRoot), `${JSON.stringify(line)}\n`, 'utf8');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Read the log back, oldest first. Corrupt lines are skipped.
 *
 * @param {string} projectRoot
 * @returns {Array<object>}
 */
export function readRedactionsLog(projectRoot) {
  const path = redactionsLogPath(projectRoot);
  if (!existsSync(path)) return [];
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const entries = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // corrupt/partial line — skip, keep reading.
    }
  }
  return entries;
}
