// @doors: 1
// Door 1 (Response): the pure extract/check functions return claims + errors.
// Door 2 N/A: a validator reads; it writes nothing to disk.
// Door 3 N/A: no subprocess — the family imports the live registries directly.
// Door 4 N/A: no message-queue surface.
// Door 5 N/A: reporting is the validator's stdout/exit code, asserted by the
//   `--only counts` smoke in scripts-validate-docs.test.js, not an NDJSON log.
//
// Task 236 (D-364) — the `counts` family: prose count-claims can't drift.
//
// THE DRIFT CLASS: sentences like "12 MCP tools" / "41 CLI verbs" are
// hand-maintained numbers about collections the code owns. We have hand-fixed
// them ~6 times across v0.4–v0.6, always after someone noticed.
//
// WHY A GENERIC SCAN, NOT A LOCATION LIST (the prior-art finding, D-375 triage):
// ECC ships this exact gate — and it hand-enumerates 40 doc locations, each with
// its own file + regex. Their `WORKING-CONTEXT.md` is in NONE of them, which is
// precisely the file measured 4 months stale (claiming 47/79/181 while their
// tree held 67/94/278). Their gate runs green in CI and the staleness ships
// anyway: it checked 40 places and the drift happened in the 41st. Drift lands
// wherever you did not enumerate — so we SCAN, and a new doc is covered the day
// it is written rather than the day someone remembers to register it.

import { describe, it, expect } from 'vitest';
import {
  extractCountClaims,
  checkCounts,
  COUNT_COLLECTIONS,
} from '../scripts/validate-docs.mjs';

describe('Task 236 — extracting count claims from prose', () => {
  it('finds a digit claim about a kit-owned collection', () => {
    const got = extractCountClaims('The kit ships 12 MCP tools today.');
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ n: 12, collection: 'mcpTools' });
  });

  it('finds a spelled-out claim (the mcp-server.mjs header says "Twelve tools")', () => {
    const got = extractCountClaims('Twelve MCP tools are registered.');
    expect(got[0]).toMatchObject({ n: 12, collection: 'mcpTools' });
  });

  it('recognises every collection the kit owns', () => {
    const text = [
      'there are 41 CLI verbs',
      'the 12 health checks run in order',
      'we ship 5 agent profiles',
    ].join('\n');
    const found = extractCountClaims(text).map((c) => c.collection).sort();
    expect(found).toEqual(['agentProfiles', 'cliVerbs', 'healthChecks']);
  });

  it('reports the LINE of each claim so a failure is navigable', () => {
    const got = extractCountClaims('intro\n\nthe kit has 12 MCP tools\n');
    expect(got[0].line).toBe(3);
  });

  it('ignores numbers that are not about a kit collection (no false positives)', () => {
    const text = [
      'the 60s hook ceiling',
      'we cloned 14 repos',
      'a 10 KB snapshot',
      '3 tiers of memory',
      'Node 20 and Node 24',
    ].join('\n');
    expect(extractCountClaims(text)).toEqual([]);
  });

  it('does not fire on a VERSION that happens to precede a collection word', () => {
    // "v0.6.0 adds MCP tools" has no count — the number is a version.
    expect(extractCountClaims('v0.6.0 adds MCP tools')).toEqual([]);
  });

  it('does not fire on IDENTIFIER-shaped numbers (found by running it for real)', () => {
    // Every one of these is from the kit's own corpus. A task/issue/PR number
    // adjacent to a collection noun is an identifier, not a count — and this
    // class produced absurd readings like "5873 MCP tools" before it was fixed.
    const text = [
      'Task 108 added MCP tools to the surface',
      'kirodotdev/Kiro#5873 for MCP tools is closed',
      'issue 4672 covers MCP tools',
      'PR 313 touched 0 CLI verbs',           // "PR 313" is an id; "0 CLI verbs" is real
      'see #226 for MCP tools',
    ].join('\n');
    const claims = extractCountClaims(text);
    expect(claims.map((c) => c.n)).not.toContain(108);
    expect(claims.map((c) => c.n)).not.toContain(5873);
    expect(claims.map((c) => c.n)).not.toContain(4672);
    expect(claims.map((c) => c.n)).not.toContain(226);
  });
});

describe('Task 236 — the gate BITES (the load-bearing half)', () => {
  const live = { mcpTools: 12, cliVerbs: 41, healthChecks: 12, agentProfiles: 5 };

  it('FAILS on a stale count — a wrong number is an error, not a warning', () => {
    const docs = [{ path: 'README.md', text: 'the kit ships 9 MCP tools' }];
    const errors = checkCounts({ docs, live });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/README\.md/);
    expect(errors[0]).toMatch(/9/);
    expect(errors[0]).toMatch(/12/);
  });

  it('PASSES a correct count', () => {
    const docs = [{ path: 'README.md', text: 'the kit ships 12 MCP tools' }];
    expect(checkCounts({ docs, live })).toEqual([]);
  });

  it('catches drift in a doc NOBODY registered — the ECC failure mode', () => {
    // The whole point of scanning: this doc is not on any hand-maintained list.
    const docs = [{ path: 'docs/SOME-NEW-DOC.md', text: 'all 7 health checks pass' }];
    const errors = checkCounts({ docs, live });
    expect(errors, 'a doc nobody enumerated must still be checked').toHaveLength(1);
    expect(errors[0]).toMatch(/SOME-NEW-DOC/);
  });

  it('reports EVERY drifted claim, not just the first', () => {
    const docs = [
      { path: 'README.md', text: 'we have 9 MCP tools and 3 agent profiles' },
    ];
    expect(checkCounts({ docs, live })).toHaveLength(2);
  });
});

describe('Task 236 — frozen records are exempt (history is not drift)', () => {
  const live = { mcpTools: 12, cliVerbs: 41, healthChecks: 12, agentProfiles: 5 };

  it('a release note legitimately naming an OLD count does NOT fail', () => {
    // CHANGELOG / DECISION-LOG / research notes / ADRs record a moment in time.
    // "Updating" them to match today's code would be a bug (the D-249 rule).
    const docs = [
      { path: 'CHANGELOG.md', text: 'v0.4.0 shipped 9 MCP tools' },
      { path: 'docs/journey/DECISION-LOG.md', text: 'at the time there were 8 CLI verbs' },
      { path: 'docs/research/2026-01-01-note.md', text: 'the kit had 4 health checks then' },
      { path: 'docs/adr/0001-something.md', text: '3 agent profiles existed' },
    ];
    expect(checkCounts({ docs, live })).toEqual([]);
  });

  it('the MEMORY TIER is a frozen record too — captured facts are history', () => {
    // Found by running the family for real: `context/` is the kit's own memory,
    // and a fact saying "v0.3.5 verified all 9 health checks pass" is CORRECTLY
    // recorded history. Editing one to match today's code would corrupt the
    // memory the kit exists to keep — the same reason docs/research is exempt.
    const docs = [
      { path: 'context/memory/project_v0-3-5-verified.md', text: 'all 9 health checks pass' },
      { path: 'context/DECISIONS.md', text: 'shipped with 11 MCP tools' },
      { path: 'context/transcripts/2026-06-15.md', text: 'the 31 CLI verbs today' },
      { path: 'context.local/machine-paths.md', text: '3 agent profiles here' },
    ];
    expect(checkCounts({ docs, live })).toEqual([]);
  });

  it('the external-project catalog is exempt — those counts are somebody else\'s', () => {
    // Also found by running it for real: the collection nouns are not
    // kit-exclusive. Every count in SOURCES.md describes another project's
    // surface ("14 MCP tools" = theirs), so the doc can only produce noise.
    const docs = [{
      path: 'docs/SOURCES.md',
      text: '- **someproject** — a server exposing 14 MCP tools and ~40 CLI verbs',
    }];
    expect(checkCounts({ docs, live })).toEqual([]);
  });

  it('an inline suppression marker exempts one deliberate line', () => {
    const docs = [{
      path: 'README.md',
      text: 'historically 9 MCP tools <!-- validate-docs: ignore -->',
    }];
    expect(checkCounts({ docs, live })).toEqual([]);
  });
});

describe('Task 236 — the collection registry', () => {
  it('every collection declares how to resolve its LIVE count', () => {
    for (const [name, cfg] of Object.entries(COUNT_COLLECTIONS)) {
      expect(Array.isArray(cfg.nouns), `${name} needs nouns`).toBe(true);
      expect(cfg.nouns.length, `${name} needs at least one noun`).toBeGreaterThan(0);
    }
  });

  it('covers the four collections the kit hand-maintains counts for', () => {
    expect(Object.keys(COUNT_COLLECTIONS).sort()).toEqual([
      'agentProfiles', 'cliVerbs', 'healthChecks', 'mcpTools',
    ]);
  });
});
