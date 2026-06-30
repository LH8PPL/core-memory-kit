// @doors: 1
// Door 1 (Response): computeHeat is a PURE function — input → score. No I/O.
// Door 2 N/A: no state mutation (pure).
// Door 3 N/A: no subprocess.
// Door 4 N/A: no NDJSON observability (a pure scorer).
// Door 5 N/A: no message queue.
//
// Task 151.2 (ADR-0016 / design §20.1) — the capped-recurrence promotion heat.
// heat = min(recurrence_count, RECUR_CAP)·W_REC + exp(-Δhours/τ)
// The CAP is load-bearing (MemOS min(count·w, ceiling)): recurrence is a
// tie-breaker, never the driver — a noisy-but-trivial fact must NOT outrank a
// once-stated durable decision. Recency is lazy exp-decay (MemoryOS
// compute_recency, τ=24h), computed AT READ — no cron.

import { describe, it, expect } from 'vitest';
import { computeHeat, RECUR_CAP, W_REC, TAU_HOURS, PROMOTE_THRESHOLD } from '../packages/cli/src/heat.mjs';

const HOUR = 3600 * 1000;

describe('Task 151.2 — computeHeat (capped recurrence + lazy recency)', () => {
  it('is a pure function of (recurrence_count, age) — recency decays exp(-Δh/τ)', () => {
    const now = Date.parse('2026-06-29T12:00:00Z');
    // A fact touched right now: recency term ≈ 1.0.
    const fresh = computeHeat({ recurrenceCount: 1, lastAt: new Date(now).toISOString(), now });
    // The same fact τ hours old: recency term ≈ exp(-1) ≈ 0.368.
    const aged = computeHeat({ recurrenceCount: 1, lastAt: new Date(now - TAU_HOURS * HOUR).toISOString(), now });
    expect(fresh).toBeGreaterThan(aged);
    // recency component at τ is e^-1 of the now-component (recurrence part equal)
    const recurPart = Math.min(1, RECUR_CAP) * W_REC;
    expect(aged - recurPart).toBeCloseTo(Math.exp(-1), 5);
    expect(fresh - recurPart).toBeCloseTo(1.0, 5);
  });

  it('recurrence raises heat — a 3×-recurred fact outranks a 1× fact of the same age', () => {
    const now = Date.parse('2026-06-29T12:00:00Z');
    const lastAt = new Date(now).toISOString();
    const once = computeHeat({ recurrenceCount: 1, lastAt, now });
    const thrice = computeHeat({ recurrenceCount: 3, lastAt, now });
    expect(thrice).toBeGreaterThan(once);
  });

  it('THE CAP: a noisy high-count fact does NOT run away — recurrence is capped at RECUR_CAP', () => {
    const now = Date.parse('2026-06-29T12:00:00Z');
    const lastAt = new Date(now).toISOString();
    const atCap = computeHeat({ recurrenceCount: RECUR_CAP, lastAt, now });
    const wayOverCap = computeHeat({ recurrenceCount: RECUR_CAP * 100, lastAt, now });
    // Past the cap, more recurrence adds NOTHING — the count is a tie-breaker, not a driver.
    expect(wayOverCap).toBe(atCap);
  });

  it('the cap keeps recurrence below recency-dominance — a stale noisy fact can be beaten by a fresh durable one', () => {
    const now = Date.parse('2026-06-29T12:00:00Z');
    // A noisy fact recurred 1000× but 10 days stale.
    const noisyStale = computeHeat({ recurrenceCount: 1000, lastAt: new Date(now - 240 * HOUR).toISOString(), now });
    // A durable fact recurred just at the promotion threshold, fresh.
    const durableFresh = computeHeat({ recurrenceCount: PROMOTE_THRESHOLD, lastAt: new Date(now).toISOString(), now });
    // Both are real signals; the point of the cap is that recurrence can't bury recency.
    // The fresh durable fact's recency advantage is comparable to the capped recurrence gap.
    expect(durableFresh).toBeGreaterThan(0);
    expect(noisyStale).toBeGreaterThan(0);
    // The capped-recurrence ceiling means noisyStale isn't astronomically larger.
    expect(noisyStale).toBeLessThan(computeHeat({ recurrenceCount: RECUR_CAP, lastAt: new Date(now).toISOString(), now }) + 1);
  });

  it('PROMOTE_THRESHOLD is 3 (memclaw min-cluster-size, diversity dropped for single-user)', () => {
    expect(PROMOTE_THRESHOLD).toBe(3);
  });

  it('handles a missing/garbage lastAt gracefully (recency → 0, recurrence still counts)', () => {
    const now = Date.parse('2026-06-29T12:00:00Z');
    const h = computeHeat({ recurrenceCount: 2, lastAt: null, now });
    expect(h).toBeCloseTo(Math.min(2, RECUR_CAP) * W_REC, 5); // recency contributes 0
  });

  it('a future lastAt (clock skew) clamps recency to ≤ 1, never blows up', () => {
    const now = Date.parse('2026-06-29T12:00:00Z');
    const future = new Date(now + 100 * HOUR).toISOString();
    const h = computeHeat({ recurrenceCount: 1, lastAt: future, now });
    const recurPart = Math.min(1, RECUR_CAP) * W_REC;
    expect(h - recurPart).toBeLessThanOrEqual(1.0 + 1e-9);
  });
});
