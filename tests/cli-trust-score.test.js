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
});
