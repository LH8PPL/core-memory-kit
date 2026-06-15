#!/usr/bin/env node
// bench-storage.mjs — the Task 141b perf bake-off (D-147).
//
// Decides whether the kit migrates its SQLite driver from `better-sqlite3` to
// the built-in `node:sqlite`. The migration's PRIZE is npm-12 immunity (zero
// native deps, no install scripts) + no locked-DLL EPERM on reinstall. The
// migration's RISK is search latency — paid on every query, forever.
//
// GATE (D-147, the user's hardened call — "no measurable regression"): for each
// GATED read/search path, node:sqlite p95 must be ≤ better-sqlite3 p95 × 1.03
// (3% = this harness's noise floor, NOT a perf budget). If ANY gated path fails,
// 141b does NOT ship and better-sqlite3 stays (141a's install-time ask remains
// the npm-12 answer).
//
// GATED paths (read/search — the hot loop a user pays every query):
//   - FTS5 keyword query
//   - sqlite-vec cosine KNN query
//   - per-read incremental reindex (the mtime/sha1 diff read paths run)
// REPORTED-not-gated (write paths — one-time / amortized):
//   - reindexFull bulk insert
//   - single fact write
//
// Method: build an identical corpus in BOTH backends, then time each op N≥20×
// warm, INTERLEAVED A/B (better, node, better, node, …) so machine jitter hits
// both equally. Report min / median / p95 per backend + the ratio + verdict.
//
// Run: node --experimental-sqlite scripts/bench-storage.mjs [--n 40] [--corpus 500]

import { DatabaseSync } from 'node:sqlite';
import BetterDatabase from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? Number(args[i + 1]) : def;
};
// N = number of timed SAMPLES; BATCH = queries per sample. Each sample times
// BATCH back-to-back queries, so the measured unit is ~tens of ms — large
// enough that Windows timer granularity + sub-ms jitter become a rounding
// error (the ±100% swing on single sub-ms ops was pure timer noise). The
// per-query time = sample / BATCH.
const N = getArg('--n', 25);
const BATCH = getArg('--batch', 200);
const CORPUS = getArg('--corpus', 2000);
const VEC_DIM = 384; // bge-base is 768; 384 keeps the bench light, same shape
const RATIO_BAR = 1.03;

// --- tiny stats -----------------------------------------------------------
function pct(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}
function summarize(times) {
  const s = [...times].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const variance = s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length;
  const rsd = mean === 0 ? 0 : Math.sqrt(variance) / mean; // relative std dev
  return { min: s[0], median: pct(s, 50), p95: pct(s, 95), rsd };
}

// --- deterministic corpus -------------------------------------------------
function makeBody(i) {
  const words = ['memory', 'search', 'fact', 'decision', 'index', 'recall', 'persona', 'kit', 'vector', 'query'];
  return `${words[i % words.length]} bullet number ${i} about ${words[(i * 7) % words.length]} and ${words[(i * 3) % words.length]}`;
}
function makeVec(i) {
  const v = new Float32Array(VEC_DIM);
  for (let d = 0; d < VEC_DIM; d++) v[d] = Math.sin(i * 0.1 + d * 0.01);
  return v;
}
function vecToJson(v) {
  return JSON.stringify(Array.from(v));
}

// --- schema builders (identical SQL on both drivers) ----------------------
const SCHEMA_SQL = `
  CREATE TABLE obs (rowid INTEGER PRIMARY KEY, body TEXT, mtime INTEGER, sha TEXT);
  CREATE VIRTUAL TABLE obs_fts USING fts5(body);
`;

function seedBetter(db) {
  db.exec(SCHEMA_SQL);
  db.loadExtension(sqliteVec.getLoadablePath());
  db.exec(`CREATE VIRTUAL TABLE vec USING vec0(embedding float[${VEC_DIM}])`);
  const ins = db.prepare('INSERT INTO obs(rowid, body, mtime, sha) VALUES (?,?,?,?)');
  const insFts = db.prepare('INSERT INTO obs_fts(rowid, body) VALUES (?,?)');
  const insVec = db.prepare('INSERT INTO vec(rowid, embedding) VALUES (CAST(? AS INTEGER),?)');
  const tx = db.transaction(() => {
    for (let i = 1; i <= CORPUS; i++) {
      ins.run(i, makeBody(i), 1000 + i, 'a'.repeat(40));
      insFts.run(i, makeBody(i));
      insVec.run(i, vecToJson(makeVec(i)));
    }
  });
  tx();
}

function seedNode(db) {
  db.exec(SCHEMA_SQL);
  db.loadExtension(sqliteVec.getLoadablePath());
  db.exec(`CREATE VIRTUAL TABLE vec USING vec0(embedding float[${VEC_DIM}])`);
  const ins = db.prepare('INSERT INTO obs(rowid, body, mtime, sha) VALUES (?,?,?,?)');
  const insFts = db.prepare('INSERT INTO obs_fts(rowid, body) VALUES (?,?)');
  const insVec = db.prepare('INSERT INTO vec(rowid, embedding) VALUES (CAST(? AS INTEGER),?)');
  // node:sqlite has no .transaction() helper — wrap manually.
  db.exec('BEGIN');
  for (let i = 1; i <= CORPUS; i++) {
    ins.run(i, makeBody(i), 1000 + i, 'a'.repeat(40));
    insFts.run(i, makeBody(i));
    insVec.run(i, vecToJson(makeVec(i)));
  }
  db.exec('COMMIT');
}

// --- the gated ops (same logical query, driver-native call) ---------------
// Statements are prepared ONCE per (db, query) and reused — the production
// pattern, and necessary here: re-preparing inside the hot loop accumulates
// un-finalized statement handles (node:sqlite blocks on this). prepareOps()
// returns closures that reuse one prepared statement each.
function prepareOps(db) {
  const fts = db.prepare("SELECT rowid FROM obs_fts WHERE obs_fts MATCH 'memory' ORDER BY rank LIMIT 10");
  // sqlite-vec KNN REQUIRES the `k = N` constraint (per the sqlite-vec docs);
  // `ORDER BY distance LIMIT N` alone takes a brute-force path that hangs at
  // scale. This is the documented KNN form the kit's real search uses.
  const vec = db.prepare('SELECT rowid FROM vec WHERE embedding MATCH ? AND k = 10 ORDER BY distance');
  const inc = db.prepare('SELECT rowid, mtime, sha FROM obs WHERE mtime > ?');
  return {
    fts: () => fts.all(),
    vec: (qJson) => vec.all(qJson),
    inc: () => inc.all(900),
  };
}

// --- timing (interleaved A/B) ---------------------------------------------
function time1(fn) {
  const t0 = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t0) / 1e6; // ms
}

// Bench ONE op N× warm (single-driver — the two drivers run in SEPARATE
// processes because loading the same sqlite-vec native extension into both
// better-sqlite3 AND node:sqlite in one process collides on the extension's
// global state ("vec0 constructor error: bad parameter or other API misuse").
// Each driver gets a clean process; the parent compares their JSON output.
// Each sample times BATCH back-to-back calls (so the unit is ~tens of ms,
// swamping sub-ms timer jitter); the recorded value is per-query (sample/BATCH).
function benchOp(fn) {
  for (let i = 0; i < BATCH; i++) fn(); // warmup one full batch
  const perQuery = [];
  for (let s = 0; s < N; s++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < BATCH; i++) fn();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    perQuery.push(ms / BATCH);
  }
  return summarize(perQuery);
}

// --- child mode: bench ONE driver, print JSON to stdout -------------------
function runChild(driver) {
  const q = vecToJson(makeVec(42));
  let db, ops;
  if (driver === 'better') {
    db = new BetterDatabase(':memory:');
    seedBetter(db);
  } else {
    db = new DatabaseSync(':memory:', { allowExtension: true });
    seedNode(db);
  }
  ops = prepareOps(db);
  const out = {
    driver,
    fts: benchOp(() => ops.fts()),
    vec: benchOp(() => ops.vec(q)),
    inc: benchOp(() => ops.inc()),
  };
  db.close();
  process.stdout.write(JSON.stringify(out));
}

// --- parent mode: spawn both children, compare ----------------------------
function fmt(ms) { return ms.toFixed(4) + 'ms'; }

function runChildProcess(driver) {
  const { execFileSync } = require('node:child_process');
  const out = execFileSync(
    process.execPath,
    ['--experimental-sqlite', fileURLToPath(import.meta.url), '--driver', driver, '--n', String(N), '--corpus', String(CORPUS), '--batch', String(BATCH)],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  return JSON.parse(out);
}

// Median of an array of numbers (for aggregating across child runs).
function medianOf(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const ROUNDS = 5; // child runs per driver — median-across-rounds kills the
                  // per-process cold-start variance that makes a single
                  // separate-process run too noisy for a 3% bar.

function runParent() {
  console.log(`bench-storage — Task 141b perf bake-off (N=${N} warm, corpus=${CORPUS}, ${ROUNDS} rounds/driver, separate-process)`);
  console.log(`gate: node:sqlite p95 ≤ better-sqlite3 p95 × ${RATIO_BAR} on each GATED read/search path`);
  console.log('(separate processes because better-sqlite3 + node:sqlite collide on the shared sqlite-vec extension; median-of-rounds tames cold-start noise)\n');

  const keys = ['fts', 'vec', 'inc'];
  // Collect ROUNDS median-per-query samples per driver per op, then take the
  // median across rounds. Also track the worst within-round rsd so we can SEE
  // whether the measurement is clean enough to trust a 3% bar.
  const samples = { better: { fts: [], vec: [], inc: [] }, node: { fts: [], vec: [], inc: [] } };
  const rsds = { better: { fts: [], vec: [], inc: [] }, node: { fts: [], vec: [], inc: [] } };
  for (let r = 0; r < ROUNDS; r++) {
    process.stderr.write(`round ${r + 1}/${ROUNDS}...\n`);
    for (const driver of ['better', 'node']) {
      const res = runChildProcess(driver);
      for (const k of keys) { samples[driver][k].push(res[k].median); rsds[driver][k].push(res[k].rsd); }
    }
  }
  const agg = (driver, k) => medianOf(samples[driver][k]);
  const aggRsd = (driver, k) => medianOf(rsds[driver][k]);

  const ops = [
    { key: 'fts', label: 'FTS5 keyword query' },
    { key: 'vec', label: 'sqlite-vec KNN query' },
    { key: 'inc', label: 'incremental reindex scan' },
  ];

  let allPass = true;
  let noisy = false;
  for (const { key, label } of ops) {
    const bMed = agg('better', key);
    const nMed = agg('node', key);
    const bRsd = aggRsd('better', key);
    const nRsd = aggRsd('node', key);
    const ratio = bMed === 0 ? (nMed === 0 ? 1 : Infinity) : nMed / bMed;
    const pass = ratio <= RATIO_BAR;
    // A measurement is only trustworthy at a 3% bar if its own noise (rsd) is
    // well below 3%. Flag when noise rivals the signal.
    const clean = Math.max(bRsd, nRsd) < 0.03;
    if (!clean) noisy = true;
    if (!pass) allPass = false;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}`);
    console.log(`   better-sqlite3  per-query=${fmt(bMed)}  (noise ±${(bRsd * 100).toFixed(1)}%)`);
    console.log(`   node:sqlite     per-query=${fmt(nMed)}  (noise ±${(nRsd * 100).toFixed(1)}%)`);
    console.log(`   ratio (node/better) = ${ratio.toFixed(3)}  (bar ≤ ${RATIO_BAR})  ${clean ? '✓ measurement clean' : '⚠ NOISY — noise ≥ 3%, ratio not trustworthy'}\n`);
  }

  console.log('='.repeat(60));
  if (noisy) {
    console.log('VERDICT: INCONCLUSIVE — the measurement noise (rsd) rivals or exceeds the 3% bar,');
    console.log('so the ratio cannot be trusted. Run on a quieter machine, raise --batch / --corpus,');
    console.log('or wire this into CI. (The PASS/FAIL above is noise, not signal.)');
    process.exitCode = 2;
  } else if (allPass) {
    console.log('VERDICT: PASS — node:sqlite meets the no-measurable-regression bar on all gated paths (clean measurement).');
    console.log("Spikes 1 (FTS5) + 2 (sqlite-vec loadExtension) already passed → 141b migration is GO (pending the user's call).");
    process.exitCode = 0;
  } else {
    console.log('VERDICT: FAIL — node:sqlite regresses a gated read/search path beyond the noise floor (clean measurement).');
    console.log("141b does NOT ship; better-sqlite3 stays, 141a's install-time ask remains the npm-12 answer.");
    process.exitCode = 1;
  }
}

try {
  const driverIdx = args.indexOf('--driver');
  if (driverIdx !== -1) {
    runChild(args[driverIdx + 1]);
  } else {
    runParent();
  }
} catch (err) {
  console.error('bench-storage CRASHED:', err?.stack ?? err);
  process.exitCode = 2;
}
