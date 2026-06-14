// @doors: 1, 2, 4
// Door 1: writeFact still returns action:'created' even when the INDEX rebuild fails.
// Door 2: the fact FILE is durably on disk regardless (best-effort reindex preserved).
// Door 4: a failed INDEX rebuild now emits an audit entry (INDEX_REBUILD_FAILED)
//   instead of being SILENTLY swallowed — the D-152 gap (a committed INDEX could
//   lag with zero trace after an auto-extract write whose detached reindex was
//   killed/errored; nothing surfaced it).
// Door 3 N/A: in-process; no subprocess spawn.
// Door 5 N/A: no message-queue surface.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFact } from '../packages/cli/src/write-fact.mjs';
import { readAuditLog } from '../packages/cli/src/audit-log.mjs';
import { resolveTierRoot } from '../packages/cli/src/tier-paths.mjs';

let sandbox;
let projectRoot;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-reindex-fail-'));
  projectRoot = join(sandbox, 'proj');
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

const baseOpts = (over = {}) => ({
  tier: 'P',
  type: 'project',
  slug: 'a-fact',
  title: 'a fact',
  body: 'the body of a durable fact',
  writeSource: 'auto-extract',
  trust: 'high',
  sourceFile: 'test',
  sourceLine: 1,
  sourceSha1: 'a'.repeat(64),
  projectRoot,
  ...over,
});

describe('writeFact — INDEX rebuild failure is observable, not swallowed (D-152)', () => {
  it('a thrown reindex still creates the fact AND records the failure in the audit log', () => {
    const boom = () => {
      throw new Error('simulated detached-child reindex kill');
    };
    const r = writeFact(baseOpts({ _reindexFn: boom }));

    // Door 1 — the write still succeeds (best-effort reindex preserved).
    expect(r.action).toBe('created');

    // Door 2 — the fact file is durably on disk despite the failed rebuild.
    const factDir = join(projectRoot, 'context', 'memory');
    const files = readdirSync(factDir).filter((n) => n.endsWith('.md') && n !== 'INDEX.md');
    expect(files).toContain('project_a-fact.md');

    // Door 4 — the failure left a trace (the D-152 gap: it used to be silent).
    const tierRoot = resolveTierRoot({ tier: 'P', projectRoot });
    const log = readAuditLog(tierRoot);
    const failEntry = log.find((e) => e.reasonCode === 'index-rebuild-failed');
    expect(failEntry).toBeTruthy();
    expect(failEntry.id).toBe(r.id);
  });

  it('a successful reindex does NOT emit a failure entry (no false alarms)', () => {
    const r = writeFact(baseOpts());
    expect(r.action).toBe('created');
    const tierRoot = resolveTierRoot({ tier: 'P', projectRoot });
    const log = readAuditLog(tierRoot);
    expect(log.find((e) => e.reasonCode === 'index-rebuild-failed')).toBeFalsy();
    // And the INDEX.md was actually written (the happy path still holds).
    expect(existsSync(join(projectRoot, 'context', 'memory', 'INDEX.md'))).toBe(true);
    expect(readFileSync(join(projectRoot, 'context', 'memory', 'INDEX.md'), 'utf8')).toContain('a-fact');
  });

  // The self-heal contract (D-152, the user's "users won't run cmk reindex" point):
  // INDEX.md is best-effort, so it CAN lag if a rebuild is interrupted. But the
  // recovery is automatic, not manual — because reindex() rebuilds INDEX WHOLESALE
  // from every fact file (not append-only), the NEXT successful writeFact fully
  // heals any prior drift with no `cmk reindex` command. This pins that as a
  // guarantee (previously incidental: nothing asserted it).
  it('a later successful write fully rebuilds a drifted INDEX — no manual reindex (D-152 self-heal)', () => {
    const factDir = join(projectRoot, 'context', 'memory');
    const indexPath = join(factDir, 'INDEX.md');

    // 1. Write fact A normally — INDEX lists it.
    const a = writeFact(baseOpts({ slug: 'fact-a', title: 'fact a', body: 'alpha body one' }));
    expect(a.action).toBe('created');
    expect(readFileSync(indexPath, 'utf8')).toContain('fact-a');

    // 2. Simulate the interrupted-rebuild lag: strip A's line from INDEX.md by
    //    hand (the file on disk for A is untouched — only the derived view drifts).
    const drifted = readFileSync(indexPath, 'utf8')
      .split('\n')
      .filter((l) => !l.includes('fact-a'))
      .join('\n');
    writeFileSync(indexPath, drifted, 'utf8');
    expect(readFileSync(indexPath, 'utf8')).not.toContain('fact-a'); // drift confirmed

    // 3. A later normal capture (fact B) heals it: INDEX now lists BOTH A and B,
    //    because reindex rebuilds from all fact files — the user ran no command.
    const b = writeFact(baseOpts({ slug: 'fact-b', title: 'fact b', body: 'beta body two' }));
    expect(b.action).toBe('created');
    const healed = readFileSync(indexPath, 'utf8');
    expect(healed).toContain('fact-a'); // the drifted entry is back — self-healed
    expect(healed).toContain('fact-b'); // and the new one is there too
  });
});
