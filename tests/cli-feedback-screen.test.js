// Task 193 — FEEDBACK-SCREEN: Poison_Guard for the loop (ADR-0017 Phase 1d;
// D-252). Feedback is a second unscreened input channel: Poison_Guard screens
// WRITES; nothing screened UTILITY MUTATIONS until this. A systemically-wrong
// judge (a broken test suite reddening everything for a week) or a
// manufactured failure-signal could dampen GOOD memories without touching a
// file. No utility-mutating signal ships without this screen.
//
// Boundary under test: applyTrustSignal (trust-signal.mjs) — the ONE
// trust_score mutation gate (verified: 4 callers, zero bypass writers) — now
// screened: per-fact-per-day rate limit, burst-hold quarantine, audit-logged
// deltas, floor preserved.
//
// @doors: 1, 2, 5
// Door 3 N/A: no subprocess — SQLite + file appends only.
// Door 4 N/A: no message queue.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyTrustSignal } from '../packages/cli/src/trust-signal.mjs';
import { readSignalLog, signalLogPath, RATE_LIMIT_PER_FACT_PER_DAY, BURST_MIN_SIGNALS, BURST_NEGATIVE_FRACTION } from '../packages/cli/src/feedback-screen.mjs';
import { TRUST_SCORE_FLOOR } from '../packages/cli/src/trust-score.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';

let sandbox;
let projectRoot;
let db;

function seedFact(db, id, trust_score = 0.5) {
  db.prepare(`
    INSERT INTO observations
      (id, tier, source_file, source_line, source_sha1, heading_path, body,
       write_source, trust, created_at, superseded_by, deleted_at, expires_at, trust_score)
    VALUES (?, 'P', 'MEMORY.md', 1, ?, 'MEMORY.md > Active Threads', ?, 'user-explicit', 'high', ?, NULL, NULL, NULL, ?)
  `).run(id, 'a'.repeat(40), `body of ${id}`, Date.parse('2026-07-01T10:00:00Z'), trust_score);
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-feedback-screen-'));
  projectRoot = join(sandbox, 'proj');
  mkdirSync(join(projectRoot, 'context'), { recursive: true });
  db = openIndexDb({ projectRoot, dbPath: join(sandbox, 'memory.db') });
});

afterEach(() => {
  db?.close();
  rmSync(sandbox, { recursive: true, force: true });
});

function score(id) {
  return db.prepare('SELECT trust_score FROM observations WHERE id = ?').get(id)?.trust_score;
}

describe('Task 193 — screened applyTrustSignal', () => {
  it('a normal signal still applies, and the delta is audit-logged + signal-logged', () => {
    seedFact(db, 'P-9LXBA3ZK', 0.5);
    const before = score('P-9LXBA3ZK');

    const r = applyTrustSignal({ projectRoot, id: 'P-9LXBA3ZK', event: 'dampen', db });
    expect(r.action).toBe('updated');
    expect(score('P-9LXBA3ZK')).toBeLessThan(before);

    // Door 4a: the signal log records the applied delta.
    const sig = readSignalLog(projectRoot);
    expect(sig).toHaveLength(1);
    expect(sig[0]).toMatchObject({ id: 'P-9LXBA3ZK', event: 'dampen', applied: true });

    // Door 4b: the canonical audit trail carries the mutation (provenance per Δ).
    const audit = readFileSync(join(projectRoot, 'context', '.locks', 'audit.log'), 'utf8');
    expect(audit).toContain('trust-signal');
    expect(audit).toContain('P-9LXBA3ZK');
  });

  it(`rate-limit: signal ${'#'}N+1 for the same fact in one day is SKIPPED (score frozen)`, () => {
    seedFact(db, 'P-9LXBA3ZK', 0.9);

    for (let i = 0; i < RATE_LIMIT_PER_FACT_PER_DAY; i++) {
      expect(applyTrustSignal({ projectRoot, id: 'P-9LXBA3ZK', event: 'dampen', db }).action).toBe('updated');
    }
    const atLimit = score('P-9LXBA3ZK');

    const over = applyTrustSignal({ projectRoot, id: 'P-9LXBA3ZK', event: 'dampen', db });
    expect(over.action).toBe('rate-limited');
    expect(score('P-9LXBA3ZK')).toBe(atLimit); // frozen — no further Δ today

    // The refusal is itself logged (applied:false, reason).
    const held = readSignalLog(projectRoot).filter((e) => e.applied === false);
    expect(held).toHaveLength(1);
    expect(held[0].reason).toBe('rate-limit');
  });

  it('rate-limit is PER FACT — a different fact is unaffected (over-mutation guard)', () => {
    seedFact(db, 'P-9LXBA3ZK', 0.9);
    seedFact(db, 'U-CVGYFKW2', 0.9);
    for (let i = 0; i < RATE_LIMIT_PER_FACT_PER_DAY + 1; i++) {
      applyTrustSignal({ projectRoot, id: 'P-9LXBA3ZK', event: 'dampen', db });
    }
    const r = applyTrustSignal({ projectRoot, id: 'U-CVGYFKW2', event: 'dampen', db });
    expect(r.action).toBe('updated');
  });

  it('burst-hold: a negative storm quarantines further dampens; good memories untouched (the over-mutation guard at loop scale)', () => {
    // Seed enough DISTINCT facts to cross the burst threshold without
    // tripping any single fact's rate limit (alphabet-safe generated ids).
    const ids = Array.from({ length: BURST_MIN_SIGNALS }, (_, i) =>
      `P-${'ABCDEFGHJK'[i]}${'ABCDEFGHJK'[i]}AAAA22`,
    );
    for (const id of ids) seedFact(db, id, 0.5);
    seedFact(db, 'U-CVGYFKW2', 0.9);

    // The storm: BURST_MIN_SIGNALS dampens across distinct facts (all applied —
    // each under its own per-fact limit), pushing today's negative fraction to 1.0.
    for (const id of ids) {
      applyTrustSignal({ projectRoot, id, event: 'dampen', db });
    }

    // The NEXT dampen — against a good memory — must be QUARANTINED, not applied.
    const before = score('U-CVGYFKW2');
    const r = applyTrustSignal({ projectRoot, id: 'U-CVGYFKW2', event: 'dampen', db });
    expect(r.action).toBe('quarantined');
    expect(score('U-CVGYFKW2')).toBe(before); // untouched — the guard held

    const held = readSignalLog(projectRoot).filter((e) => e.reason === 'burst-hold');
    expect(held.length).toBeGreaterThanOrEqual(1);
  });

  it('burst-hold does NOT block reinforce (positive signals are not the attack surface)', () => {
    const ids = Array.from({ length: BURST_MIN_SIGNALS }, (_, i) =>
      `P-${'ABCDEFGHJK'[i]}${'ABCDEFGHJK'[i]}AAAA22`,
    );
    for (const id of ids) seedFact(db, id, 0.5);
    for (const id of ids) applyTrustSignal({ projectRoot, id, event: 'dampen', db });

    seedFact(db, 'U-CVGYFKW2', 0.5);
    const r = applyTrustSignal({ projectRoot, id: 'U-CVGYFKW2', event: 'reinforce', db });
    expect(r.action).toBe('updated');
  });

  it('floor preserved through the screen: a fact never decays below TRUST_SCORE_FLOOR (demote-not-evict)', () => {
    seedFact(db, 'P-9LXBA3ZK', TRUST_SCORE_FLOOR + 0.01);
    applyTrustSignal({ projectRoot, id: 'P-9LXBA3ZK', event: 'dampen', db });
    applyTrustSignal({ projectRoot, id: 'P-9LXBA3ZK', event: 'dampen', db });
    expect(score('P-9LXBA3ZK')).toBeGreaterThanOrEqual(TRUST_SCORE_FLOOR);
  });

  it('composition: a caller passing ONLY projectRoot (no shared db) routes through the same screen', () => {
    // memory-write.mjs style call — applyTrustSignal opens its own handle at
    // the DEFAULT index path, so the fixture must seed THERE (not a custom
    // dbPath the internal open can't see).
    const defaultDb = openIndexDb({ projectRoot });
    seedFact(defaultDb, 'P-9LXBA3ZK', 0.9);
    defaultDb.close();
    for (let i = 0; i < RATE_LIMIT_PER_FACT_PER_DAY; i++) {
      expect(applyTrustSignal({ projectRoot, id: 'P-9LXBA3ZK', event: 'dampen' }).action).toBe('updated');
    }
    const over = applyTrustSignal({ projectRoot, id: 'P-9LXBA3ZK', event: 'dampen' });
    expect(over.action).toBe('rate-limited');
  });

  it('screen state failure degrades OPEN (signal applies) — a broken diagnostic must not break writes', () => {
    // No context/ dir at all → the log can't be read/written; the signal
    // still applies (best-effort posture, same as the pre-193 contract).
    const bareRoot = join(sandbox, 'bare');
    mkdirSync(bareRoot, { recursive: true });
    const bdb = openIndexDb({ projectRoot: bareRoot, dbPath: join(sandbox, 'bare.db') });
    seedFact(bdb, 'P-9LXBA3ZK', 0.5);
    const r = applyTrustSignal({ projectRoot: bareRoot, id: 'P-9LXBA3ZK', event: 'dampen', db: bdb });
    expect(r.action).toBe('updated');
    bdb.close();
    // And the logger must NOT scaffold context/ into a non-kit project
    // (skill-review M8 — the same gate as the recall-log's inject side).
    expect(existsSync(join(bareRoot, 'context'))).toBe(false);
  });

  it('burst-hold UNDER threshold: 9 applied dampens do not trip the hold (budget under-cap edge)', () => {
    const ids = Array.from({ length: BURST_MIN_SIGNALS - 1 }, (_, i) =>
      `P-${'ABCDEFGHJK'[i]}${'ABCDEFGHJK'[i]}AAAA22`,
    );
    for (const id of ids) seedFact(db, id, 0.5);
    for (const id of ids) applyTrustSignal({ projectRoot, id, event: 'dampen', db });

    seedFact(db, 'U-CVGYFKW2', 0.9);
    const r = applyTrustSignal({ projectRoot, id: 'U-CVGYFKW2', event: 'dampen', db });
    expect(r.action).toBe('updated'); // 9 applied < BURST_MIN_SIGNALS — no hold
  });

  it('burst-hold fraction boundary: EXACTLY 80% negative does not trip (strict >, budget at-cap edge)', () => {
    // 8 dampens + 2 reinforces = 10 applied, fraction exactly 0.8 — the hold
    // requires STRICTLY MORE than BURST_NEGATIVE_FRACTION.
    const dampenIds = Array.from({ length: 8 }, (_, i) =>
      `P-${'ABCDEFGHJK'[i]}${'ABCDEFGHJK'[i]}AAAA22`,
    );
    const reinforceIds = ['P-RRAAAA22', 'P-QQAAAA22'];
    for (const id of [...dampenIds, ...reinforceIds]) seedFact(db, id, 0.5);
    for (const id of dampenIds) applyTrustSignal({ projectRoot, id, event: 'dampen', db });
    for (const id of reinforceIds) applyTrustSignal({ projectRoot, id, event: 'reinforce', db });

    seedFact(db, 'U-CVGYFKW2', 0.9);
    const r = applyTrustSignal({ projectRoot, id: 'U-CVGYFKW2', event: 'dampen', db });
    expect(r.action).toBe('updated'); // 0.8 is NOT > 0.8
  });

  it('unknown events are inert: no rate budget consumed, no logs, no audit (skill-review M7)', () => {
    seedFact(db, 'P-9LXBA3ZK', 0.5);
    const r = applyTrustSignal({ projectRoot, id: 'P-9LXBA3ZK', event: 'bogus-event', db });
    expect(r.action).toBe('skipped');
    expect(readSignalLog(projectRoot)).toHaveLength(0);
    expect(existsSync(join(projectRoot, 'context', '.locks', 'audit.log'))).toBe(false);
  });

  it('a stray null NDJSON line does not disable the screen (skill-review M4)', () => {
    seedFact(db, 'P-9LXBA3ZK', 0.9);
    // Poison the state file with a parseable-but-not-object line.
    mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });
    appendFileSync(signalLogPath(projectRoot), 'null\n', 'utf8');
    for (let i = 0; i < RATE_LIMIT_PER_FACT_PER_DAY; i++) {
      applyTrustSignal({ projectRoot, id: 'P-9LXBA3ZK', event: 'dampen', db });
    }
    // The screen still works: the rate limit trips despite the junk line.
    const over = applyTrustSignal({ projectRoot, id: 'P-9LXBA3ZK', event: 'dampen', db });
    expect(over.action).toBe('rate-limited');
  });
});
