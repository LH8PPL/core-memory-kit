// @doors: 1, 2
// Door 3 N/A: in-process; no subprocess spawn.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: classification is pure query-time routing — no NDJSON log of its
//             own (the recall-log entry search() writes is pinned elsewhere).

// Task 211 — the query state-view gate (A-TMA's retrieval-level mechanism;
// the cheap 4-view replacement for §16.18's deferred 7-mode classifier; D-308).
//
// A RULE-BASED classifier (wordlist + negation guard — explicitly NOT an LLM;
// Poison_Guard-tier mechanism cost) tags a search query's requested state view:
//   current | historical | transition | neutral
// and biases retrieval accordingly:
//   current/neutral   → today's behavior, byte-identical (active-only default)
//   historical        → expired rows auto-included + stateful rows bucket-
//                       boosted first (a deterministic PRE-RANK partition,
//                       NOT a score blend — composes with, never touches,
//                       the Task-194 blend; §20.3 untouched)
//   transition        → expired rows auto-included, NO reorder (the answer
//                       needs both states; the Task-209 labels distinguish)
// The detected view surfaces in the result envelope so Claude sees WHY old
// rows appeared. `--state-view` / `state_view` exist only as overrides —
// the automatic path needs no flag.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  classifyQueryStateView,
  STATE_VIEWS,
} from '../packages/cli/src/query-state-view.mjs';
import { search } from '../packages/cli/src/search.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';

const NOW = '2026-07-13T12:00:00Z';

let sandbox;
let db;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-stateview-'));
  db = openIndexDb({ projectRoot: sandbox });
});

afterEach(() => {
  db?.close();
  rmSync(sandbox, { recursive: true, force: true });
});

function seedObservation(db, {
  id, body, tier = 'P', trust = 'high',
  source_line = 1,
  created_at = Date.parse('2026-07-01T10:00:00Z'),
  deleted_at = null, superseded_by = null, expires_at = null,
}) {
  db.prepare(`
    INSERT INTO observations
      (id, tier, source_file, source_line, source_sha1, heading_path, body,
       write_source, trust, created_at, superseded_by, deleted_at, expires_at)
    VALUES (?, ?, 'MEMORY.md', ?, ?, 'MEMORY.md > Active Threads', ?,
            'user-explicit', ?, ?, ?, ?, ?)
  `).run(
    id, tier, source_line, 'a'.repeat(40), body,
    trust, created_at, superseded_by, deleted_at, expires_at,
  );
}

describe('Task 211 — classifyQueryStateView (the rule-based 4-view profiler)', () => {
  // The fixture table (the Done-when contract) — per-view example queries.
  const FIXTURES = [
    // neutral — no temporal hints at all
    ['what deploy target do we use', 'neutral'],
    ['postgres connection settings', 'neutral'],
    ['where do credentials go', 'neutral'],
    // current — explicit present-state hints
    ['what deploy target do we use now', 'current'],
    ['what is the current database', 'current'],
    ['which linter do we use these days', 'current'],
    ['latest decision on the api layer', 'current'],
    // historical — past-state hints
    ['what did we use before postgres', 'historical'],
    ['what was the deploy target previously', 'historical'],
    ['which framework did we originally pick', 'historical'],
    ['what did we reject for the cache layer', 'historical'],
    ['back when we deployed to vercel what was the setup', 'historical'],
    // transition — change/evolution hints (or past+present together)
    ['how did the deploy target change', 'transition'],
    ['when did we switch from npm to pnpm', 'transition'],
    ['what did we migrate the database from', 'transition'],
    ['we used to deploy to vercel so where do we deploy today', 'transition'],
  ];

  for (const [query, expected] of FIXTURES) {
    it(`"${query}" → ${expected}`, () => {
      expect(classifyQueryStateView(query).view).toBe(expected);
    });
  }

  it('negation traps: a negated past-hint reads as CURRENT, not historical', () => {
    // The Done-when trap: "not what we used before" asks for the present.
    expect(classifyQueryStateView('not what we used before').view).toBe('current');
    expect(classifyQueryStateView("i don't want what we used previously").view).toBe('current');
  });

  it('is pure + total: empty/garbage input → neutral, never a throw', () => {
    expect(classifyQueryStateView('').view).toBe('neutral');
    expect(classifyQueryStateView(null).view).toBe('neutral');
    expect(classifyQueryStateView('!!! ??? ###').view).toBe('neutral');
  });

  it('exports the closed view vocabulary', () => {
    expect(Object.values(STATE_VIEWS).sort()).toEqual(['current', 'historical', 'neutral', 'transition']);
  });
});

describe('Task 211 — retrieval bias (facts scope, automatic — no flag)', () => {
  function seedStatePair() {
    seedObservation(db, { id: 'P-CURRDEPL', body: 'deploy target is hetzner for the app', source_line: 1 });
    seedObservation(db, {
      id: 'P-PREVDEPL', body: 'deploy target is vercel for the app',
      superseded_by: 'P-CURRDEPL', source_line: 2,
    });
    seedObservation(db, {
      id: 'P-EXPRDEPL', body: 'deploy target is heroku for the app',
      expires_at: Date.parse('2026-06-01T00:00:00Z'), source_line: 3,
    });
  }

  it('a HISTORICAL query auto-includes expired rows (no --include-expired) and buckets stateful rows FIRST — labeled (the 209 composition)', () => {
    seedStatePair();
    // The hint word ("before") is consumed by the classifier and STRIPPED
    // from the FTS query — view metadata, not subject content (a fact body
    // never contains the asker's temporal adverb).
    const r = search({ db, query: 'deploy target before for the app', now: NOW });
    expect(r.state_view).toBe('historical');
    const ids = r.results.map((x) => x.id);
    // The expired fact surfaced WITHOUT any manual flag…
    expect(ids).toContain('P-EXPRDEPL');
    // …and every stateful row arrives labeled (Task 209) + bucketed before the current one.
    const currIdx = ids.indexOf('P-CURRDEPL');
    for (const staleId of ['P-PREVDEPL', 'P-EXPRDEPL']) {
      expect(ids.indexOf(staleId)).toBeLessThan(currIdx);
      expect(r.results.find((x) => x.id === staleId).state).toBeTruthy();
    }
  });

  it('a TRANSITION query auto-includes expired rows but does NOT reorder (both states, labels distinguish)', () => {
    seedStatePair();
    const r = search({ db, query: 'deploy target change for the app', now: NOW });
    expect(r.state_view).toBe('transition');
    const ids = r.results.map((x) => x.id);
    expect(ids).toContain('P-EXPRDEPL'); // included
    // No bucket partition: order is whatever BM25/blend produced. Pin only
    // that the current row was NOT pushed below by a reorder — the order
    // equals the STRIPPED content query run through the neutral pipeline
    // with includeExpired on.
    const baseline = search({
      db, query: 'deploy target for the app',
      stateView: 'neutral', includeExpired: true, now: NOW,
    });
    expect(ids).toEqual(baseline.results.map((x) => x.id));
  });

  it('a CURRENT/NEUTRAL query is byte-identical to the pre-211 default (regression)', () => {
    seedStatePair();
    const neutral = search({ db, query: 'deploy target for the app', now: NOW });
    // No envelope field on the common path (zero noise)…
    expect('state_view' in neutral).toBe(false);
    // …expired stays hidden, exactly as before.
    expect(neutral.results.map((x) => x.id)).not.toContain('P-EXPRDEPL');
    // …and the results equal an explicit current-view call (the override is a no-op).
    const forced = search({ db, query: 'deploy target for the app', stateView: 'current', now: NOW });
    expect(neutral.results).toEqual(forced.results);
  });

  it('the override wins both ways: stateView=historical on a neutral query; stateView=current on a historical query', () => {
    seedStatePair();
    const forcedHist = search({ db, query: 'deploy target for the app', stateView: 'historical', now: NOW });
    expect(forcedHist.state_view).toBe('historical');
    expect(forcedHist.results.map((x) => x.id)).toContain('P-EXPRDEPL');

    const forcedCurr = search({ db, query: 'what deploy target did we use before for the app', stateView: 'current', now: NOW });
    expect('state_view' in forcedCurr).toBe(false);
    expect(forcedCurr.results.map((x) => x.id)).not.toContain('P-EXPRDEPL');
  });

  it('an explicit includeExpired composes: a neutral query with the flag still reveals expired (pre-211 contract intact)', () => {
    seedStatePair();
    const r = search({ db, query: 'deploy target for the app', includeExpired: true, now: NOW });
    expect(r.results.map((x) => x.id)).toContain('P-EXPRDEPL');
    expect('state_view' in r).toBe(false); // neutral view — no envelope noise
  });

  it('classification never touches the transcripts/decisions scopes (facts-only)', () => {
    // A historical-sounding query against the transcripts scope must not
    // trip fact-side machinery (chunks carry no state; the scope rejects
    // fact filters — the contract stays as-is).
    const r = search({ db, query: 'what did we use before postgres', scope: 'transcripts' });
    expect(r.action).toBe('found');
    expect('state_view' in r).toBe(false);
  });

  it('an invalid stateView override is a schema error (closed enum)', () => {
    const r = search({ db, query: 'anything at all', stateView: 'sideways' });
    expect(r.action).toBe('error');
    expect(r.errors.join(' ')).toMatch(/stateView/);
  });

  it('an explicit stateView on a non-facts scope is rejected (honesty, like the other fact-only filters)', () => {
    const r = search({ db, query: 'anything at all', scope: 'transcripts', stateView: 'historical' });
    expect(r.action).toBe('error');
    expect(r.errors.join(' ')).toMatch(/stateView.*transcripts/);
  });
});
