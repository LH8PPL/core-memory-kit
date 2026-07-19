// @doors: 1, 2
// Door 2 is read-only state: expand mutates NOTHING — pinned by the
//   no-mutation assertion in the fact test (file bytes identical after).
// Door 3 N/A: no subprocess and no LLM — expand is a pure file+db read.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: expand writes no NDJSON log (read-only surface, like mk_get).

// Tests for Task 226 — the recall EXPAND rung (D-326): the missing middle
// rung between a search hit and the transcript drill. A hit returns the
// matched chunk; answering "what did we decide and why" often needs the
// hit's NEIGHBORHOOD — the rest of its heading section in the SOURCE file
// (mk_timeline is created_at-adjacent observations, a different axis).
// Bounded by EXPAND_MAX_CHARS — never the whole file.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../packages/cli/src/install.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import { reindexBoot } from '../packages/cli/src/index-rebuild.mjs';
import { search } from '../packages/cli/src/search.mjs';
import { rememberRich } from '../packages/cli/src/remember-core.mjs';
import { memoryWrite } from '../packages/cli/src/memory-write.mjs';
import {
  expandObservation,
  EXPAND_MAX_CHARS,
} from '../packages/cli/src/read-core.mjs';
import { runExpand } from '../packages/cli/src/subcommands.mjs';

let sandbox;
let projectRoot;
let userDir;

function withDb(fn) {
  const db = openIndexDb({ projectRoot });
  try {
    reindexBoot({ projectRoot, userDir, db });
    return fn(db);
  } finally {
    db.close();
  }
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-expand-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user-tier');
  mkdirSync(projectRoot, { recursive: true });
  install({ projectRoot, userTier: userDir, skipClaudeFiles: true, noHooks: true, noSemantic: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('expandObservation — the transcript/sessions surface (T: ids)', () => {
  it('expands a day-file hit to its FULL heading section — the neighboring bullet the chunk did not carry', () => {
    const dayPath = join(projectRoot, 'context', 'sessions', 'today-2026-06-01.md');
    writeFileSync(
      dayPath,
      [
        '## Decisions',
        '- Adopted the retry-backoff policy for the queue consumer',
        '- NEIGHBOR-DETAIL: five attempts max, then dead-letter',
        '',
        '## Open Questions',
        '- Should dead-letter alerts page on-call?',
        '',
      ].join('\n'),
      'utf8',
    );

    withDb((db) => {
      const found = search({ db, query: 'retry-backoff queue consumer', scope: 'transcripts', projectRoot });
      expect(found.results.length).toBeGreaterThan(0);
      const hit = found.results.find((r) => String(r.source_file).includes('today-2026-06-01'));
      expect(hit).toBeTruthy();

      const expanded = expandObservation(db, hit.id, { projectRoot, userDir });
      expect(expanded.error).toBeUndefined();
      expect(expanded.source_file).toContain('today-2026-06-01');
      expect(expanded.heading).toContain('Decisions');
      // The neighborhood: a sibling bullet of the SAME section that was not
      // the matched chunk's line.
      expect(expanded.content).toContain('NEIGHBOR-DETAIL');
      // Bounded: never the whole file — the NEXT section stays out.
      expect(expanded.content).not.toContain('Open Questions');
      expect(expanded.truncated).toBe(false);
    });
  });

  it('at-cap/over-cap (EXPAND_MAX_CHARS budget pair): an oversized section returns a bounded window around the anchor, flagged truncated', () => {
    const filler = [];
    for (let i = 0; i < 400; i++) filler.push(`- filler bullet ${i} ${'x'.repeat(60)}`);
    const dayPath = join(projectRoot, 'context', 'sessions', 'today-2026-06-02.md');
    writeFileSync(
      dayPath,
      ['## Decisions', ...filler.slice(0, 200), '- ANCHOR-FACT: the pivotal middle decision', ...filler.slice(200), ''].join('\n'),
      'utf8',
    );

    withDb((db) => {
      const found = search({ db, query: 'ANCHOR-FACT pivotal middle', scope: 'transcripts', projectRoot });
      const hit = found.results.find((r) => String(r.source_file).includes('today-2026-06-02'));
      expect(hit).toBeTruthy();

      const expanded = expandObservation(db, hit.id, { projectRoot, userDir });
      expect(expanded.truncated).toBe(true);
      expect(expanded.content.length).toBeLessThanOrEqual(EXPAND_MAX_CHARS);
      // Transcript-chunk ids anchor at their SECTION HEADING (chunkTranscript
      // stamps every window of a section with the heading's line), so the
      // bounded window is the section HEAD — heading + its opening content.
      expect(expanded.heading).toContain('Decisions');
      expect(expanded.content).toContain('filler bullet 0');

      // At-cap: a big-enough cap returns the section whole, untruncated —
      // and the whole section includes the deep anchor content.
      const small = expandObservation(db, hit.id, { projectRoot, userDir, maxChars: 10_000_000 });
      expect(small.truncated).toBe(false);
      expect(small.content).toContain('ANCHOR-FACT');
    });
  });
});

describe('expandObservation — the facts surface (fact/scratchpad ids)', () => {
  it('expands a rich fact hit to the full fact-file section (the Why/How the indexed body may not carry), read-only', () => {
    const w = rememberRich(
      'Deploy target is the staging cluster first',
      {
        type: 'project',
        title: 'Deploy target policy',
        why: 'WHY-DETAIL: staging bakes for 24h before prod promotion',
        how: 'Apply by targeting staging in the deploy pipeline first',
      },
      { projectRoot },
    );
    expect(w.id).toBeTruthy();

    withDb((db) => {
      const found = search({ db, query: 'deploy target staging', projectRoot });
      expect(found.results.length).toBeGreaterThan(0);
      const hit = found.results.find((r) => String(r.source_file).includes('memory/'));
      expect(hit).toBeTruthy();

      const factAbs = join(projectRoot, 'context', String(hit.source_file).replace(/^context\//, ''));
      const before = readFileSync(join(projectRoot, hit.source_file), 'utf8');

      const expanded = expandObservation(db, hit.id, { projectRoot, userDir });
      expect(expanded.error).toBeUndefined();
      expect(expanded.content).toContain('WHY-DETAIL');

      // Door 2 — read-only: the source file is byte-identical after.
      expect(readFileSync(join(projectRoot, hit.source_file), 'utf8')).toBe(before);
      expect(factAbs).toBeTruthy(); // path shape sanity
    });
  });

  it('expands a scratchpad bullet to its heading-section siblings', () => {
    // Write both bullets through the kit's REAL scratchpad path (hand-written
    // bullets carry no provenance and deliberately do not index).
    for (const text of [
      'The CI runner pins Node 24',
      'SIBLING-NOTE: the Windows runner needs the long-path opt-in',
    ]) {
      const w = memoryWrite({
        action: 'add',
        tier: 'P',
        scratchpad: 'MEMORY.md',
        section: 'Environment Notes',
        source: 'user-explicit',
        text,
        projectRoot,
      });
      expect(w.action).toBe('appended');
    }

    withDb((db) => {
      const found = search({ db, query: 'CI runner pins Node', projectRoot });
      const hit = found.results.find((r) => String(r.source_file).includes('MEMORY.md'));
      expect(hit).toBeTruthy();
      const expanded = expandObservation(db, hit.id, { projectRoot, userDir });
      expect(expanded.content).toContain('SIBLING-NOTE');
    });
  });
});

describe('expandObservation — edges', () => {
  it('invalid id shape → error; unknown fact id → not found; T: id with a missing file → error', () => {
    withDb((db) => {
      expect(expandObservation(db, 'garbage!!', { projectRoot, userDir }).error).toBeTruthy();
      expect(expandObservation(db, 'P-QQQQQQQQ', { projectRoot, userDir }).error).toBe('not found');
      expect(
        expandObservation(db, 'T:context/sessions/today-1999-01-01.md:3', { projectRoot, userDir }).error,
      ).toBeTruthy();
    });
  });

  it('refuses a path-traversal-shaped T: id (source_file must stay inside the tier roots)', () => {
    withDb((db) => {
      const out = expandObservation(db, 'T:../../outside.md:1', { projectRoot, userDir });
      expect(out.error).toBeTruthy();
    });
  });

  it('SECURITY: a T: id can only reach INDEXED transcript sources — the unscreened surfaces are refused even though they sit inside the project (skill-review Blocking, D-356)', () => {
    // Plant every unscreened surface a crafted mk_expand call could target.
    const locksDir = join(projectRoot, 'context', '.locks');
    mkdirSync(locksDir, { recursive: true });
    writeFileSync(join(locksDir, 'redactions.log'), '{"original":"hunter2-plaintext"}\n', 'utf8');
    const importedDir = join(projectRoot, 'context', 'transcripts', 'imported');
    mkdirSync(importedDir, { recursive: true });
    writeFileSync(join(importedDir, 'raw-secret.md'), 'RAW-UNSCREENED-IMPORT\n', 'utf8');
    const trDir = join(projectRoot, 'context', 'transcripts');
    writeFileSync(join(trDir, '2026-06-01.live.md'), 'UNSCREENED-LIVE-TURN\n', 'utf8');
    writeFileSync(join(projectRoot, 'context', 'sessions', 'now.md'), 'VOLATILE-BUFFER\n', 'utf8');
    // And a legitimately-indexed day file, as the positive control.
    writeFileSync(
      join(projectRoot, 'context', 'sessions', 'today-2026-06-04.md'),
      '## Decisions\n- INDEXED-CONTROL decided\n',
      'utf8',
    );

    withDb((db) => {
      for (const bad of [
        'T:context/.locks/redactions.log:1',
        'T:context/transcripts/imported/raw-secret.md:1',
        'T:context/transcripts/2026-06-01.live.md:1',
        'T:context/sessions/now.md:1',
      ]) {
        const out = expandObservation(db, bad, { projectRoot, userDir });
        expect(out.error, bad).toBe('not an indexed transcript source');
        expect(JSON.stringify(out)).not.toMatch(/hunter2|RAW-UNSCREENED|UNSCREENED-LIVE|VOLATILE/);
      }
      // The positive control: an indexed source still expands.
      const ok = expandObservation(db, 'T:context/sessions/today-2026-06-04.md:1', { projectRoot, userDir });
      expect(ok.error).toBeUndefined();
      expect(ok.content).toContain('INDEXED-CONTROL');
    });
  });

  it('a single anchor line larger than the cap is hard-clamped to maxChars', () => {
    writeFileSync(
      join(projectRoot, 'context', 'sessions', 'today-2026-06-05.md'),
      `## Decisions\n- ${'y'.repeat(9000)}\n`,
      'utf8',
    );
    withDb((db) => {
      const out = expandObservation(db, 'T:context/sessions/today-2026-06-05.md:1', {
        projectRoot,
        userDir,
        maxChars: 500,
      });
      expect(out.truncated).toBe(true);
      expect(out.content.length).toBeLessThanOrEqual(500);
    });
  });
});

describe('runExpand — the CLI verb', () => {
  it('prints the heading + bounded neighborhood for a hit id', async () => {
    const dayPath = join(projectRoot, 'context', 'sessions', 'today-2026-06-03.md');
    writeFileSync(
      dayPath,
      ['## Decisions', '- CLI-EXPAND-TARGET decided', '- CLI-EXPAND-SIBLING context', ''].join('\n'),
      'utf8',
    );
    const hitId = withDb((db) => {
      const found = search({ db, query: 'CLI-EXPAND-TARGET', scope: 'transcripts', projectRoot });
      return found.results[0].id;
    });

    const logs = [];
    runExpand(hitId, {}, undefined, {
      projectRoot,
      userDir,
      log: (m) => logs.push(m),
      logError: (m) => logs.push(m),
    });
    const out = logs.join('\n');
    expect(out).toContain('CLI-EXPAND-SIBLING');
    expect(out).toContain('today-2026-06-03');
  });

  it('exits 2 with the error on a bad id', async () => {
    const errs = [];
    const prevExit = process.exitCode;
    try {
      runExpand('not-an-id', {}, undefined, {
        projectRoot,
        userDir,
        log: () => {},
        logError: (m) => errs.push(m),
      });
      expect(process.exitCode).toBe(2);
      expect(errs.join('\n')).toContain('not-an-id');
    } finally {
      process.exitCode = prevExit;
    }
  });
});
