// @doors: 1, 2
// Door 1 (Response): extractFallbackCandidates returns candidate objects.
// Door 2 (State): the mission-context filter decides what may reach a memory tier.
// Door 3 N/A: the fallback is deliberately LLM-free — no subprocess.
// Door 4 N/A: no message-queue surface.
// Door 5 N/A: the caller writes the extract.log entry, asserted in cli-auto-extract.
//
// Task 242 (D-369) — the deterministic no-LLM fallback.
//
// THE BUG: on ANY extraction failure auto-extract returned observation_count 0
// and candidates [], dropping the turn whole. Measured on this repo's own logs:
// 6/6 haiku_timeout in one session → ZERO captures, silently. And timeouts are
// only 166 of 295 historical failures — concurrent_run (82) and haiku_failed
// (47) are separate modes, so a timeout-only fallback would leave ~44% of
// failures still capturing nothing.
//
// THE CONSTRAINT THAT MAKES THIS SAFE (the user's call): the fallback captures
// MISSION CONTEXT ONLY. It is dumber than the LLM path and will otherwise
// hoover up whatever durable-looking prose is in the turn — which on a
// kit-debugging session is almost entirely kit-failure noise. Kit bugs,
// timeouts, hook errors and our own debugging are BUILD ARTIFACTS whose home is
// DECISION-LOG.md and tasks.md, never a tier injected into every future session.
// Default is EXCLUDE-ON-DOUBT: a missed capture is recoverable (the LLM pass
// retries the turn), a poisoned memory tier is not.

import { describe, it, expect } from 'vitest';
import {
  extractFallbackCandidates,
  isKitOperational,
} from '../packages/cli/src/extract-fallback.mjs';

describe('Task 242 — the mission-context-only filter', () => {
  it('EXCLUDES kit-operational prose (the whole point of the constraint)', () => {
    const kitNoise = [
      'the extractor is timing out again',
      'auto-extract failed with haiku_timeout on 6 of 6 turns',
      'the Stop hook is not firing',
      'cmk doctor reports HC-9 failing',
      'validate-docs went red on main',
      'the test suite is at 3209 passing',
      'I retracted D-365 — the data-loss bug was a false positive',
      'npm test failed on the CI runner',
      'the stress gate flaked at 4/5',
    ];
    for (const line of kitNoise) {
      expect(isKitOperational(line), `should be excluded: "${line}"`).toBe(true);
    }
  });

  it('KEEPS genuine mission context (the user\'s project, decisions, preferences)', () => {
    const mission = [
      'we decided to use Postgres 16 for the staging environment',
      'the team prefers uv over pip for every Python project',
      'the auth service talks to the billing API over gRPC',
      'deploy to staging before prod, always',
      'the customer wants invoices exported as CSV, not PDF',
    ];
    for (const line of mission) {
      expect(isKitOperational(line), `should be KEPT: "${line}"`).toBe(false);
    }
  });

  it('HOSTILE FIXTURE: a kit-debugging turn yields only the genuine project fact', () => {
    // Shaped after a real kit-debugging session (this one): dominated by
    // kit-failure prose with a single real project fact buried in it.
    const turn = [
      'the extractor timed out again, 6 of 6 this session',
      'I was wrong about the data-loss bug — the probe grepped one surface',
      'we decided the payment retry window is 72 hours',
      'cmk doctor should not be the only surface for a silent failure',
      'the validator consolidation dropped us from 21 to 18 scripts',
    ].join('\n');

    const got = extractFallbackCandidates({ userTurn: turn });
    const texts = got.map((c) => c.text.toLowerCase());

    expect(texts.some((t) => t.includes('payment retry window')), 'the real fact must land').toBe(true);
    for (const t of texts) {
      expect(t).not.toMatch(/extractor|timed out|cmk doctor|validator|probe/);
    }
  });

  it('exclude-on-doubt: an ambiguous line is dropped, not captured', () => {
    // "it failed again" has no mission subject — unattributable, so it goes.
    const got = extractFallbackCandidates({ userTurn: 'it failed again\nwe use uv, never pip' });
    expect(got.map((c) => c.text).join(' ')).not.toMatch(/failed again/);
  });
});

describe('Task 242 — the fallback captures rather than dropping the turn', () => {
  it('a turn with a durable user statement yields ≥1 candidate (never zero)', () => {
    const got = extractFallbackCandidates({
      userTurn: 'from now on we deploy on Tuesdays, never Fridays',
    });
    expect(got.length).toBeGreaterThanOrEqual(1);
  });

  it('candidates carry HONEST provenance — not laundered as LLM-extracted', () => {
    const got = extractFallbackCandidates({
      userTurn: 'we decided to standardize on Node 20 across all services',
    });
    expect(got.length).toBeGreaterThan(0);
    for (const c of got) {
      expect(c.write_source, 'must be distinguishable from a real LLM extraction').toBe(
        'auto-extract-fallback',
      );
      // Conservative by construction: never claims high trust.
      expect(['low', 'medium']).toContain(c.trust);
    }
  });

  it('an empty / whitespace / assistant-only turn yields nothing (no fabrication)', () => {
    expect(extractFallbackCandidates({ userTurn: '' })).toEqual([]);
    expect(extractFallbackCandidates({ userTurn: '   \n  \n' })).toEqual([]);
    expect(extractFallbackCandidates({})).toEqual([]);
  });

  it('bounded: a huge turn cannot flood the tier', () => {
    const huge = Array.from({ length: 400 }, (_, i) => `we decided rule number ${i} applies`).join('\n');
    const got = extractFallbackCandidates({ userTurn: huge });
    expect(got.length).toBeLessThanOrEqual(5);
  });

  it('does not capture questions or commands (only durable statements)', () => {
    const got = extractFallbackCandidates({
      userTurn: 'can you run the tests?\nwhat did we decide about caching?\nplease open a PR',
    });
    expect(got).toEqual([]);
  });
});
