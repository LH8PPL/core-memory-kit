#!/usr/bin/env node
// extract-trend.mjs — the live-test trend gate (Task 137.5; the D-122 class).
//
// The dedup self-poisoning bug suppressed organic capture for ~10 releases
// because every per-turn outcome looked individually plausible: a single
// `nothing_durable` skip is normal, 90%+ of substantive turns skipping is
// the fingerprint of a systemic suppressor. Lenient per-turn pass-bars
// tolerate stochastic masking — only the TREND exposes it.
//
// This script reads a directory of `*.extract.log` NDJSON files (the
// per-date logs auto-extract writes), computes the nothing_durable rate
// over EXTRACT-phase entries, and fails above the threshold. Substantive
// is implicit: capture-turn skips short turns before extraction ever runs,
// so every extract-phase entry IS a substantive turn. Non-judgment skips
// (concurrent_run etc.) say nothing about extraction quality and are
// excluded from the denominator.
//
// Usage (the cut-gate live-test step + ad-hoc diagnosis):
//   npm run trend:extract -- <dir-with-extract-logs> [--threshold 0.8] [--min-sample 5]
//   (default dir: ./context/sessions — auto-extract's EXTRACT_LOG_DIR_RELATIVE;
//   the first live run of this script pointed at transcripts/ and came back
//   empty — the default is now pinned by the live-test below, not assumed)
//
// NOT wired into the npm-test prerun: the trend is a property of a LIVE
// RUN's accumulated log, not of the source tree.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_THRESHOLD = 0.8;
const DEFAULT_MIN_SAMPLE = 5;

/**
 * Pure trend analysis over parsed NDJSON entries.
 *
 * @param {Array<object>} entries - parsed extract.log lines (any phase).
 * @param {object} [opts] - { threshold = 0.8, minSample = 5 }.
 * @returns {{substantive: number, nothingDurable: number, rate: number, pass: boolean, inconclusive?: boolean}}
 */
export function analyzeExtractTrend(entries, { threshold = DEFAULT_THRESHOLD, minSample = DEFAULT_MIN_SAMPLE } = {}) {
  // Extract-phase only (spawn-phase entries are a different surface); the
  // pre-D2b convention: entries WITHOUT a phase field are extract-phase.
  const extractEntries = entries.filter((e) => (e?.phase ?? 'extract') === 'extract');
  // The denominator: turns where the MODEL made a judgment. Mechanical
  // skips (lock contention, oversized turn) and ERROR entries (timeouts,
  // spawn trouble — success:false, no judgment happened) are excluded;
  // counting errors would dilute the rate exactly when capture is sickest.
  const judged = extractEntries.filter(
    (e) => e.success === true && (!e.skipped_reason || e.skipped_reason === 'nothing_durable'),
  );
  const nothingDurable = judged.filter((e) => e.skipped_reason === 'nothing_durable').length;
  const substantive = judged.length;
  if (substantive < minSample) {
    return { substantive, nothingDurable, rate: substantive ? nothingDurable / substantive : 0, pass: true, inconclusive: true };
  }
  const rate = nothingDurable / substantive;
  // >= threshold fails: the threshold IS the fingerprint line, not a free pass.
  return { substantive, nothingDurable, rate, pass: rate < threshold };
}

/**
 * Read every *.extract.log in a directory and run the trend analysis.
 * Returns the analysis result; logs a human-readable report.
 *
 * @param {object} opts - { dir, threshold?, minSample?, log? }.
 */
export function runExtractTrend({ dir, threshold = DEFAULT_THRESHOLD, minSample = DEFAULT_MIN_SAMPLE, log = console.log } = {}) {
  const entries = [];
  let files = [];
  if (existsSync(dir)) {
    files = readdirSync(dir).filter((n) => n.endsWith('.extract.log'));
    for (const name of files) {
      for (const line of readFileSync(join(dir, name), 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line));
        } catch {
          // a torn/partial NDJSON line (concurrent writer) — skip, never crash
        }
      }
    }
  }
  if (files.length === 0) {
    log(`extract-trend: inconclusive — no extract.log files found under ${dir}`);
    return { substantive: 0, nothingDurable: 0, rate: 0, pass: true, inconclusive: true };
  }
  const r = analyzeExtractTrend(entries, { threshold, minSample });
  const pct = (r.rate * 100).toFixed(0);
  if (r.inconclusive) {
    log(
      `extract-trend: inconclusive — only ${r.substantive} judged turn(s) (< ${minSample} min sample); ` +
        `nothing_durable rate so far ${pct}%`,
    );
  } else if (r.pass) {
    log(
      `extract-trend: OK — nothing_durable rate ${pct}% over ${r.substantive} judged turn(s) (threshold ${threshold * 100}%)`,
    );
  } else {
    log(
      `extract-trend: FAIL — nothing_durable rate ${pct}% over ${r.substantive} judged turn(s) ` +
        `(>= ${threshold * 100}% is the D-122 systemic-suppressor fingerprint; check the dedup context + the extraction prompt before trusting this build's capture)`,
    );
  }
  return r;
}

function runCli() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith('--'));
  const flag = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
  };
  const dir = resolve(positional[0] ?? join(process.cwd(), 'context', 'sessions'));
  const r = runExtractTrend({
    dir,
    threshold: flag('threshold', DEFAULT_THRESHOLD),
    minSample: flag('min-sample', DEFAULT_MIN_SAMPLE),
  });
  process.exit(r.pass ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli();
}
