// @doors: 1
// Door 2 N/A: initTrustScore is a pure function (no disk/db state).
// Door 3 N/A: no subprocess spawn.
// Door 4 N/A: no NDJSON log.
// Door 5 N/A: no message-queue interaction.
//
// Tests for Task 151.6 — the trust_score INIT function (ADR-0016 §20.2).
// trust_score is a float in the REBUILDABLE INDEX (not committed frontmatter,
// D-218). On (re)index it is initialised from the fact's source: a user-attested
// write (user-explicit / manual-edit) starts HIGHER than a machine-derived one
// (auto-extract / compressor) at the same trust enum (memory-os source-based
// init). 151.7 adds the event-driven update rule; 151.8 wires the passive signals.
// This file pins ONLY the init contract.

import { describe, it, expect } from 'vitest';
import {
  initTrustScore,
  updateTrustScore,
  REINFORCE_DELTA,
  DAMPEN_DELTA,
  TRUST_SCORE_FLOOR,
  TRUST_SCORE_CEIL,
} from '../packages/cli/src/trust-score.mjs';

describe('Task 151.6 — initTrustScore (source-based init)', () => {
  it('a user-attested source starts HIGHER than a machine-derived one at the same trust enum', () => {
    const explicit = initTrustScore({ trust: 'high', writeSource: 'user-explicit' });
    const auto = initTrustScore({ trust: 'high', writeSource: 'auto-extract' });
    expect(explicit).toBeGreaterThan(auto); // the design's "user-explicit > auto-extract"
  });

  it('higher trust enum → higher score (high > medium > low) at the same source', () => {
    const high = initTrustScore({ trust: 'high', writeSource: 'auto-extract' });
    const medium = initTrustScore({ trust: 'medium', writeSource: 'auto-extract' });
    const low = initTrustScore({ trust: 'low', writeSource: 'auto-extract' });
    expect(high).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(low);
  });

  it('every result is clamped to [FLOOR, CEIL] — never 0, never 1 (headroom for reinforcement)', () => {
    for (const trust of ['high', 'medium', 'low']) {
      for (const writeSource of ['user-explicit', 'auto-extract', 'compressor', 'manual-edit', 'imported']) {
        const s = initTrustScore({ trust, writeSource });
        expect(s).toBeGreaterThanOrEqual(TRUST_SCORE_FLOOR);
        expect(s).toBeLessThanOrEqual(TRUST_SCORE_CEIL);
      }
    }
  });

  it('an unknown/garbage trust or source does not throw and stays in range (defensive)', () => {
    const a = initTrustScore({ trust: 'weird', writeSource: 'nope' });
    expect(a).toBeGreaterThanOrEqual(TRUST_SCORE_FLOOR);
    expect(a).toBeLessThanOrEqual(TRUST_SCORE_CEIL);
    const b = initTrustScore({});
    expect(b).toBeGreaterThanOrEqual(TRUST_SCORE_FLOOR);
    expect(b).toBeLessThanOrEqual(TRUST_SCORE_CEIL);
  });

  it('is deterministic — same inputs give the same score', () => {
    const a = initTrustScore({ trust: 'medium', writeSource: 'user-explicit' });
    const b = initTrustScore({ trust: 'medium', writeSource: 'user-explicit' });
    expect(a).toBe(b);
  });

  // -- 151.8 (research fix): recurrence is a DURABLE TERM in the seed, not an
  //    overlay event. MemoryOS/MemOS/honcho all make the count a score term —
  //    so a re-stated fact seeds higher, and it SURVIVES every reindex because
  //    it's reconstructed from the committed recurrence_count (151.1).
  it('a higher recurrence_count seeds a HIGHER trust_score (restatement = durable reinforcement)', () => {
    const once = initTrustScore({ trust: 'medium', writeSource: 'auto-extract', recurrenceCount: 1 });
    const thrice = initTrustScore({ trust: 'medium', writeSource: 'auto-extract', recurrenceCount: 3 });
    const many = initTrustScore({ trust: 'medium', writeSource: 'auto-extract', recurrenceCount: 12 });
    expect(thrice).toBeGreaterThan(once);
    expect(many).toBeGreaterThan(thrice);
  });

  it('the recurrence contribution is CAPPED — recurrence is a tie-breaker, never a runaway driver', () => {
    // Past the cap, more recurrence adds nothing (MemOS min(count·w, ceiling)).
    const big = initTrustScore({ trust: 'low', writeSource: 'auto-extract', recurrenceCount: 50 });
    const huge = initTrustScore({ trust: 'low', writeSource: 'auto-extract', recurrenceCount: 5000 });
    expect(huge).toBe(big); // capped — no further rise
    // And a high recurrence on a LOW-trust fact must NOT outrank a once-stated
    // HIGH-trust fact (the cap keeps the enum dominant — MemOS lesson).
    const lowButRecurred = initTrustScore({ trust: 'low', writeSource: 'auto-extract', recurrenceCount: 5000 });
    const highOnce = initTrustScore({ trust: 'high', writeSource: 'user-explicit', recurrenceCount: 1 });
    expect(highOnce).toBeGreaterThan(lowButRecurred);
  });

  it('missing/1 recurrenceCount is the baseline (back-compat — pre-151 facts unchanged)', () => {
    const noField = initTrustScore({ trust: 'medium', writeSource: 'auto-extract' });
    const explicitOne = initTrustScore({ trust: 'medium', writeSource: 'auto-extract', recurrenceCount: 1 });
    expect(noField).toBe(explicitOne);
  });
});

// ===========================================================================
// Task 151.7 — the trust UPDATE rule (ADR-0016 §20.2; memclaw _adjust_weights).
//
// Asymmetric, clamped, floored, EVENT-driven (NOT clock-driven): a reinforce
// raises trust by +0.1, a dampen lowers it by −0.15 (failures sink faster than
// successes rise — the conservative fail-loud posture). Floor 0.05 is load-
// bearing: trust never reaches zero → a fact is never auto-deleted by trust
// decay (demote-not-evict, §20.3). NO time-decay of the STORED value (recency
// decay is a search-ranking concern, computed at read — not here). Pure.
// 151.8 maps the 3 passive signals onto reinforce/dampen.
// ===========================================================================

describe('Task 151.7 — updateTrustScore (asymmetric, clamped, floored)', () => {
  it('reinforce RAISES trust by +0.1', () => {
    expect(updateTrustScore(0.5, 'reinforce')).toBeCloseTo(0.6, 10);
  });

  it('dampen LOWERS trust by −0.15', () => {
    expect(updateTrustScore(0.5, 'dampen')).toBeCloseTo(0.35, 10);
  });

  it('the rule is ASYMMETRIC — a dampen moves more than a reinforce (failures sink faster)', () => {
    expect(Math.abs(DAMPEN_DELTA)).toBeGreaterThan(Math.abs(REINFORCE_DELTA));
    // One reinforce then one dampen nets NEGATIVE (a fail outweighs a success).
    const after = updateTrustScore(updateTrustScore(0.5, 'reinforce'), 'dampen');
    expect(after).toBeLessThan(0.5);
  });

  it('FLOOR holds at 0.05 — repeated dampens never reach zero (never auto-deleted)', () => {
    let s = 0.2;
    for (let i = 0; i < 20; i++) s = updateTrustScore(s, 'dampen');
    expect(s).toBe(TRUST_SCORE_FLOOR);
    expect(s).toBeGreaterThan(0); // never zero
  });

  it('CEIL holds — repeated reinforces never exceed the ceiling', () => {
    let s = 0.8;
    for (let i = 0; i < 20; i++) s = updateTrustScore(s, 'reinforce');
    expect(s).toBe(TRUST_SCORE_CEIL);
  });

  it('NO time-decay — the same event on the same score always yields the same result (event-driven, not clock-driven)', () => {
    expect(updateTrustScore(0.42, 'reinforce')).toBe(updateTrustScore(0.42, 'reinforce'));
  });

  it('an unknown event is a no-op (defensive — returns the input clamped, no throw)', () => {
    expect(updateTrustScore(0.5, 'nonsense')).toBe(0.5);
    expect(updateTrustScore(0.5)).toBe(0.5);
  });

  it('a garbage current score clamps into range rather than throwing', () => {
    const r = updateTrustScore(NaN, 'reinforce');
    expect(r).toBeGreaterThanOrEqual(TRUST_SCORE_FLOOR);
    expect(r).toBeLessThanOrEqual(TRUST_SCORE_CEIL);
  });

  it('composes with initTrustScore — a freshly-seeded fact can be reinforced/dampened', () => {
    const seed = initTrustScore({ trust: 'medium', writeSource: 'auto-extract' });
    const up = updateTrustScore(seed, 'reinforce');
    const down = updateTrustScore(seed, 'dampen');
    expect(up).toBeGreaterThan(seed);
    expect(down).toBeLessThan(seed);
  });
});
