// @doors: 1, 2
// Door 2: get/timeline/recent-activity open + refresh (reindex) the index before
//   querying (state read of the on-disk fact store) — these tests write a REAL
//   fact via the shared core, then assert the verb finds it through the full
//   withReadDb open→reindex→query path.
// Door 3 N/A: dep-injected, in-process (no subprocess). The real-binary dispatch
//   wiring (argv → action) is covered by the subcommand-registration tests in
//   cli-scaffold; here we cover the action LOGIC in-process (the D-86 lesson —
//   real-binary subprocess tests don't contribute line coverage).
// Door 4 N/A: no message-queue surface on the read path.
// Door 5 N/A: read verbs write no NDJSON/audit-log (stderr only on error).
//
// Task 108b — CLI read-verb parity with the MCP read tools. The verbs and the
// MCP tools call the same read cores (read-core.mjs), so this also pins that the
// CLI surface returns the same data the model gets via mk_get / mk_timeline /
// mk_cite / mk_recent_activity.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../packages/cli/src/install.mjs';
import { rememberRich } from '../packages/cli/src/remember-core.mjs';
import {
  runGet,
  runCite,
  runTimeline,
  runRecentActivity,
  runLinks,
} from '../packages/cli/src/subcommands.mjs';

let sandbox, projectRoot, userDir, out, err;

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-readverb-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
  out = [];
  err = [];
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
  process.exitCode = 0; // the verbs set it on error paths — don't leak to the runner
});

const deps = () => ({ projectRoot, userDir, log: (m) => out.push(m), logError: (m) => err.push(m) });
const writeFact = (title, text) => rememberRich(text, { title, type: 'feedback', why: 'w', how: 'h' }, { projectRoot });

describe('cmk read verbs — CLI parity with the MCP read tools (108b)', () => {
  it('cmk get returns a real fact (full open→reindex→query path)', () => {
    const r = writeFact('lb', 'layered backend: routes thin, logic in services');
    runGet([r.id], {}, undefined, deps());
    const rows = JSON.parse(out.join('\n'));
    expect(rows[0].id).toBe(r.id);
    expect(rows[0].body).toMatch(/layered backend/);
  });

  it('cmk get on an unknown id → {error:"not found"} + exit 2', () => {
    runGet(['P-ZZZZZZZZ'], {}, undefined, deps());
    expect(JSON.parse(out.join('\n'))[0]).toEqual({ id: 'P-ZZZZZZZZ', error: 'not found' });
    expect(process.exitCode).toBe(2);
  });

  it('cmk cite formats a valid link (pure); a bad id → stderr + exit 2', () => {
    runCite('P-AAAAAAAA', {}, undefined, deps());
    expect(out[0]).toBe('[#P-AAAAAAAA](memkit://obs/P-AAAAAAAA)');
    runCite('nope', {}, undefined, deps());
    expect(err.join(' ')).toMatch(/ID_PATTERN/);
    expect(process.exitCode).toBe(2);
  });

  it('cmk timeline anchors on a real fact', () => {
    const r = writeFact('af', 'anchor fact body');
    runTimeline(r.id, {}, undefined, deps());
    expect(JSON.parse(out.join('\n')).map((o) => o.id)).toContain(r.id);
  });

  it('cmk timeline on a bad anchor → stderr + exit 2 (exercises withReadDb open path)', () => {
    runTimeline('bad-anchor', {}, undefined, deps());
    expect(err.join(' ')).toMatch(/valid kit ID/);
    expect(process.exitCode).toBe(2);
  });

  // Task 232 — `cmk links`: the relational adjacency axis, full open→reindex
  // (with edge rebuild)→query path over REAL facts written via the shared core.
  it('cmk links surfaces a real out-link (related) + its backlink', () => {
    const target = writeFact('linked-target', 'the fact being pointed at');
    // rememberRich maps `links` → the fact's `related:` frontmatter (bare slugs).
    const source = rememberRich('the fact that references the target',
      { title: 'linking-source', type: 'feedback', why: 'w', how: 'h', links: ['linked-target'] },
      { projectRoot });

    runLinks(source.id, {}, undefined, deps());
    const outLinks = JSON.parse(out.join('\n'));
    expect(outLinks.found).toBe(true);
    expect(outLinks.out.map((e) => e.to)).toContain(target.id);

    out.length = 0;
    runLinks(target.id, { direction: 'in' }, undefined, deps());
    const backlinks = JSON.parse(out.join('\n'));
    expect(backlinks.backlinks.map((e) => e.from)).toContain(source.id);
  });

  it('cmk links on a bad id → stderr + exit 2', () => {
    runLinks('bad-id', {}, undefined, deps());
    expect(err.join(' ')).toMatch(/valid kit ID/);
    expect(process.exitCode).toBe(2);
  });

  it('cmk links rejects an invalid --direction', () => {
    runLinks('P-AAAAAAAA', { direction: 'sideways' }, undefined, deps());
    expect(err.join(' ')).toMatch(/direction must be/);
    expect(process.exitCode).toBe(2);
  });

  it('cmk recent-activity lists a freshly written fact; a bad window → exit 2', () => {
    const r = writeFact('rt', 'recent thing body');
    runRecentActivity({ window: '7d' }, undefined, deps());
    expect(JSON.parse(out.join('\n')).map((o) => o.id)).toContain(r.id);

    out.length = 0;
    runRecentActivity({ window: '99y' }, undefined, deps());
    expect(err.join(' ')).toMatch(/window must be/);
    expect(process.exitCode).toBe(2);
  });
});
