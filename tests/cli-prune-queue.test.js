// @doors: 1, 2, 5
// Door 3 N/A: in-process; no subprocess spawn.
// Door 4 N/A: no message-queue interaction.

// Task 194 — the SURVIVAL GATE (ExpeL) + anti-pattern conversion
// (Memento/REMEMBERER/Negative-Knowledge; ADR-0017 Decision #3 + #5; D-252).
//
// A floored + STILL-FAILING fact (an applied dampen lands on a fact already at
// TRUST_SCORE_FLOOR) becomes a prune-CANDIDATE routed to
// context/queues/prune-review.md — NEVER a silent delete. The queue is
// preservational (conflict-queue style: resolved entries stay with a
// `resolution:` marker), which makes the routing idempotent for free.
//
// Resolution actions: 'convert' (→ typed anti-pattern, retained + injected as
// a warning), 'forget' (tombstone via the safe forget() path), 'keep'
// (dismiss — resolved, never re-queued), 'skip' (stays pending).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import { applyTrustSignal } from '../packages/cli/src/trust-signal.mjs';
import { TRUST_SCORE_FLOOR } from '../packages/cli/src/trust-score.mjs';
import {
  routePruneCandidate,
  parsePruneQueue,
  listPruneQueue,
  resolvePruneQueue,
} from '../packages/cli/src/prune-queue.mjs';
import { install } from '../packages/cli/src/install.mjs';
import { memoryWrite } from '../packages/cli/src/memory-write.mjs';
import { writeFact } from '../packages/cli/src/write-fact.mjs';
import { reindexFull } from '../packages/cli/src/index-rebuild.mjs';
import { search } from '../packages/cli/src/search.mjs';
import { parse as parseFrontmatter } from '../packages/cli/src/frontmatter.mjs';

function reindexAll() {
  const db = openIndexDb({ projectRoot: sandbox });
  try {
    reindexFull({ projectRoot: sandbox, userDir, db });
  } finally {
    db.close();
  }
}

let sandbox;
let userDir;

const QUEUE_PATH = () => join(sandbox, 'context', 'queues', 'prune-review.md');
const AUDIT_PATH = () => join(sandbox, 'context', '.locks', 'audit.log');

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-prune-test-'));
  userDir = join(sandbox, 'user-tier');
  install({ projectRoot: sandbox, userDir, silent: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function seedIndexedObservation({ id, body, trust_score = 0.5, signal_count = 0 }) {
  const db = openIndexDb({ projectRoot: sandbox });
  db.prepare(`
    INSERT INTO observations
      (id, tier, source_file, source_line, source_sha1, heading_path, body,
       write_source, trust, trust_score, signal_count, created_at)
    VALUES (?, 'P', 'MEMORY.md', 1, ?, 'MEMORY.md > Active Threads', ?,
            'user-explicit', 'medium', ?, ?, ?)
  `).run(id, 'c'.repeat(40), body, trust_score, signal_count, Date.now());
  db.close();
}

function readAuditActions() {
  if (!existsSync(AUDIT_PATH())) return [];
  return readFileSync(AUDIT_PATH(), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe('Task 194 — the survival gate (floored + still failing → prune candidate)', () => {
  it('an applied dampen on an ALREADY-FLOORED fact routes a prune candidate to the queue', () => {
    seedIndexedObservation({ id: 'P-FLRED222', body: 'flaky assumption that keeps failing', trust_score: TRUST_SCORE_FLOOR, signal_count: 3 });
    const r = applyTrustSignal({ projectRoot: sandbox, id: 'P-FLRED222', event: 'dampen' });
    expect(r.action).toBe('updated');
    expect(existsSync(QUEUE_PATH())).toBe(true);
    const entries = parsePruneQueue(readFileSync(QUEUE_PATH(), 'utf8')).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('P-FLRED222');
    expect(entries[0].resolution).toBe('pending');
    // Door 5: the routing is audit-logged.
    const audit = readAuditActions();
    expect(audit.some((e) => e.action === 'prune-candidate' && e.id === 'P-FLRED222')).toBe(true);
    // NEVER a silent delete: the row survives, floored — not tombstoned.
    const db = openIndexDb({ projectRoot: sandbox });
    const row = db.prepare('SELECT trust_score, deleted_at FROM observations WHERE id = ?').get('P-FLRED222');
    db.close();
    expect(row.deleted_at).toBeNull();
    expect(row.trust_score).toBeCloseTo(TRUST_SCORE_FLOOR, 5);
  });

  it('a dampen on a NOT-yet-floored fact does NOT queue (the gate is floored+still-failing, not just failing)', () => {
    seedIndexedObservation({ id: 'P-SNKNG229', body: 'a fact on its way down', trust_score: 0.5 });
    applyTrustSignal({ projectRoot: sandbox, id: 'P-SNKNG229', event: 'dampen' });
    const text = existsSync(QUEUE_PATH()) ? readFileSync(QUEUE_PATH(), 'utf8') : '';
    expect(text).not.toContain('P-SNKNG229');
  });

  it('routing is idempotent: repeated floored dampens queue the id ONCE', () => {
    seedIndexedObservation({ id: 'P-REPEATR4', body: 'repeatedly failing fact', trust_score: TRUST_SCORE_FLOOR, signal_count: 3 });
    applyTrustSignal({ projectRoot: sandbox, id: 'P-REPEATR4', event: 'dampen' });
    applyTrustSignal({ projectRoot: sandbox, id: 'P-REPEATR4', event: 'dampen' });
    applyTrustSignal({ projectRoot: sandbox, id: 'P-REPEATR4', event: 'dampen' });
    const entries = parsePruneQueue(readFileSync(QUEUE_PATH(), 'utf8')).entries;
    expect(entries.filter((e) => e.id === 'P-REPEATR4')).toHaveLength(1);
  });

  it('a reinforce on a floored fact does not queue (dampens are the failing signal)', () => {
    seedIndexedObservation({ id: 'P-RECVER27', body: 'a floored fact getting reinforced', trust_score: TRUST_SCORE_FLOOR });
    applyTrustSignal({ projectRoot: sandbox, id: 'P-RECVER27', event: 'reinforce' });
    const text = existsSync(QUEUE_PATH()) ? readFileSync(QUEUE_PATH(), 'utf8') : '';
    expect(text).not.toContain('P-RECVER27');
  });
});

describe('Task 194 — routePruneCandidate (direct boundary)', () => {
  it('appends a pending entry with score/evidence provenance and returns queued', () => {
    const r = routePruneCandidate({
      projectRoot: sandbox,
      id: 'P-DRECTQ22',
      text: 'the failing fact body',
      trustScore: TRUST_SCORE_FLOOR,
      signalCount: 4,
    });
    expect(r.action).toBe('queued');
    const entries = parsePruneQueue(readFileSync(QUEUE_PATH(), 'utf8')).entries;
    expect(entries[0]).toMatchObject({
      id: 'P-DRECTQ22',
      text: 'the failing fact body',
      resolution: 'pending',
    });
    expect(entries[0].trustScore).toBeCloseTo(TRUST_SCORE_FLOOR, 5);
    expect(entries[0].signalCount).toBe(4);
  });

  it('a U-tier candidate never persists its body into the COMMITTED queue (tier boundary; live lookup at resolve)', async () => {
    // The persona is machine-local by design — its content must not leak into
    // context/queues/prune-review.md (a committed file). Only the id + a
    // placeholder persist; the resolver shows the live body from the index.
    const db = openIndexDb({ projectRoot: sandbox });
    db.prepare(`
      INSERT INTO observations
        (id, tier, source_file, source_line, source_sha1, heading_path, body,
         write_source, trust, trust_score, signal_count, created_at)
      VALUES ('U-USERSEC9', 'U', 'HABITS.md', 1, ?, 'HABITS.md > Working Style',
              'the maintainer works nights on a private client', 'user-explicit',
              'medium', 0.05, 3, ?)
    `).run('e'.repeat(40), Date.now());
    db.close();

    routePruneCandidate({
      projectRoot: sandbox, id: 'U-USERSEC9',
      text: 'the maintainer works nights on a private client',
      trustScore: 0.05, signalCount: 3,
    });
    const queueText = readFileSync(QUEUE_PATH(), 'utf8');
    expect(queueText).toContain('U-USERSEC9');
    expect(queueText).not.toContain('works nights on a private client');

    // …but the resolver's prompter still SEES the live body (display-only).
    let seen = null;
    await resolvePruneQueue({
      projectRoot: sandbox, userDir,
      prompter: async (e) => {
        if (e.id === 'U-USERSEC9') seen = e.text;
        return 'skip';
      },
    });
    expect(seen).toContain('works nights on a private client');
    // Still not persisted after the resolve pass rewrote the file.
    expect(readFileSync(QUEUE_PATH(), 'utf8')).not.toContain('works nights on a private client');
  });

  it('already-queued id (any resolution state) → action already-queued, file untouched', () => {
    routePruneCandidate({ projectRoot: sandbox, id: 'P-NCENLY29', text: 'queued once', trustScore: 0.05, signalCount: 3 });
    const before = readFileSync(QUEUE_PATH(), 'utf8');
    const r = routePruneCandidate({ projectRoot: sandbox, id: 'P-NCENLY29', text: 'queued once', trustScore: 0.05, signalCount: 4 });
    expect(r.action).toBe('already-queued');
    expect(readFileSync(QUEUE_PATH(), 'utf8')).toBe(before);
  });
});

describe('Task 194 — resolvePruneQueue + anti-pattern conversion', () => {
  it("'convert' on a scratchpad bullet rewrites it in place as a typed AVOID warning (retained + injected)", async () => {
    // A REAL bullet through the safe path, then indexed.
    const w = memoryWrite({
      action: 'add', tier: 'P', scratchpad: 'MEMORY.md', section: 'Active Threads',
      text: 'always deploy with the fast flag enabled', source: 'user-explicit',
      trust: 'medium', projectRoot: sandbox, userDir,
    });
    expect(w.action).toBe('appended');
    reindexAll();
    routePruneCandidate({ projectRoot: sandbox, id: w.id, text: 'always deploy with the fast flag enabled', trustScore: 0.05, signalCount: 4 });

    const r = await resolvePruneQueue({
      projectRoot: sandbox, userDir,
      prompter: async (e) => (e.id === w.id ? 'convert' : 'skip'),
    });
    expect(r.converted).toBe(1);

    // The bullet is REWRITTEN in place (replace path), not deleted: the
    // scratchpad still carries the content, now framed as an anti-pattern —
    // and MEMORY.md is on the inject path, so the warning IS injected.
    const memoryMd = readFileSync(join(sandbox, 'context', 'MEMORY.md'), 'utf8');
    expect(memoryMd).toContain('AVOID');
    expect(memoryMd).toContain('always deploy with the fast flag enabled');

    // The queue entry is PRESERVED with its resolution (never silently gone).
    const entries = parsePruneQueue(readFileSync(QUEUE_PATH(), 'utf8')).entries;
    expect(entries.find((e) => e.id === w.id).resolution).toBe('convert');

    // Door 5: conversion audited.
    const audit = readAuditActions();
    expect(audit.some((e) => e.action === 'anti-pattern-converted' && e.id === w.id)).toBe(true);
  });

  it("'convert' on a granular fact FILE flips type → anti-pattern, prefixes AVOID, keeps it searchable", async () => {
    const f = writeFact({
      projectRoot: sandbox, userDir, tier: 'P', type: 'project',
      title: 'Use the legacy build script', slug: 'use-legacy-build-script',
      body: 'The legacy build script is the reliable way to build.',
      writeSource: 'user-explicit', trust: 'medium',
      sourceFile: 'user-explicit', sourceLine: 1, sourceSha1: 'd'.repeat(40),
    });
    expect(f.action).toBe('created');
    reindexAll();
    routePruneCandidate({ projectRoot: sandbox, id: f.id, text: 'Use the legacy build script', trustScore: 0.05, signalCount: 5 });

    const r = await resolvePruneQueue({
      projectRoot: sandbox, userDir,
      prompter: async (e) => (e.id === f.id ? 'convert' : 'skip'),
    });
    expect(r.converted).toBe(1);

    // The fact FILE is retained + retyped (demote-not-evict extended to the loop).
    const { frontmatter, body } = parseFrontmatter(readFileSync(f.path, 'utf8'));
    expect(frontmatter.type).toBe('anti-pattern');
    expect(frontmatter.title).toMatch(/^AVOID: /);
    expect(body).toContain('ANTI-PATTERN');
    expect(body).toContain('The legacy build script is the reliable way to build.');

    // Still searchable — the retyped fact keeps surfacing (retained, not erased).
    const db = openIndexDb({ projectRoot: sandbox });
    const s = search({ db, query: 'legacy build script' });
    db.close();
    expect(s.results.map((x) => x.id)).toContain(f.id);

    // The warning also lands on the INJECT path: an Anti-patterns bullet in MEMORY.md.
    const memoryMd = readFileSync(join(sandbox, 'context', 'MEMORY.md'), 'utf8');
    expect(memoryMd).toContain('## Anti-patterns');
    expect(memoryMd).toContain('AVOID');
  });

  it("'forget' tombstones through the safe forget() path (audited, reversible via archive) — never a hand-delete", async () => {
    const w = memoryWrite({
      action: 'add', tier: 'P', scratchpad: 'MEMORY.md', section: 'Active Threads',
      text: 'a candidate the user chooses to drop', source: 'user-explicit',
      trust: 'medium', projectRoot: sandbox, userDir,
    });
    reindexAll();
    routePruneCandidate({ projectRoot: sandbox, id: w.id, text: 'a candidate the user chooses to drop', trustScore: 0.05, signalCount: 3 });

    const r = await resolvePruneQueue({
      projectRoot: sandbox, userDir,
      prompter: async (e) => (e.id === w.id ? 'forget' : 'skip'),
    });
    expect(r.forgotten).toBe(1);
    // Gone from the scratchpad; the queue preserves the resolution.
    const memoryMd = readFileSync(join(sandbox, 'context', 'MEMORY.md'), 'utf8');
    expect(memoryMd).not.toContain('a candidate the user chooses to drop');
    const entries = parsePruneQueue(readFileSync(QUEUE_PATH(), 'utf8')).entries;
    expect(entries.find((e) => e.id === w.id).resolution).toBe('forget');
  });

  it("'keep' dismisses (resolution marked; the fact untouched; never re-queued by later dampens)", async () => {
    seedIndexedObservation({ id: 'P-KEEPMEE5', body: 'floored but the user vouches for it', trust_score: TRUST_SCORE_FLOOR, signal_count: 3 });
    routePruneCandidate({ projectRoot: sandbox, id: 'P-KEEPMEE5', text: 'floored but the user vouches for it', trustScore: TRUST_SCORE_FLOOR, signalCount: 3 });

    const r = await resolvePruneQueue({
      projectRoot: sandbox, userDir,
      prompter: async (e) => (e.id === 'P-KEEPMEE5' ? 'keep' : 'skip'),
    });
    expect(r.kept).toBe(1);
    const entries = parsePruneQueue(readFileSync(QUEUE_PATH(), 'utf8')).entries;
    expect(entries.find((e) => e.id === 'P-KEEPMEE5').resolution).toBe('keep');

    // A later floored dampen does NOT re-open the candidacy (preservational
    // queue = idempotency memory).
    applyTrustSignal({ projectRoot: sandbox, id: 'P-KEEPMEE5', event: 'dampen' });
    const after = parsePruneQueue(readFileSync(QUEUE_PATH(), 'utf8')).entries;
    expect(after.filter((e) => e.id === 'P-KEEPMEE5')).toHaveLength(1);
    expect(after.find((e) => e.id === 'P-KEEPMEE5').resolution).toBe('keep');
  });

  it("'skip' leaves the entry pending; over-mutation guard: other entries untouched", async () => {
    routePruneCandidate({ projectRoot: sandbox, id: 'P-SKPPED42', text: 'undecided candidate', trustScore: 0.05, signalCount: 3 });
    routePruneCandidate({ projectRoot: sandbox, id: 'P-THERNE24', text: 'second pending candidate', trustScore: 0.05, signalCount: 3 });
    const r = await resolvePruneQueue({
      projectRoot: sandbox, userDir,
      prompter: async () => 'skip',
    });
    expect(r.skipped).toBe(2);
    const entries = parsePruneQueue(readFileSync(QUEUE_PATH(), 'utf8')).entries;
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.resolution === 'pending')).toBe(true);
  });

  it('listPruneQueue returns only PENDING entries (pure read, file not rewritten)', async () => {
    routePruneCandidate({ projectRoot: sandbox, id: 'P-PENDNG72', text: 'pending one', trustScore: 0.05, signalCount: 3 });
    routePruneCandidate({ projectRoot: sandbox, id: 'P-RESLVD72', text: 'resolved one', trustScore: 0.05, signalCount: 3 });
    await resolvePruneQueue({
      projectRoot: sandbox, userDir,
      prompter: async (e) => (e.id === 'P-RESLVD72' ? 'keep' : 'skip'),
    });
    const before = readFileSync(QUEUE_PATH(), 'utf8');
    const pending = listPruneQueue({ projectRoot: sandbox });
    expect(pending.map((e) => e.id)).toEqual(['P-PENDNG72']);
    expect(readFileSync(QUEUE_PATH(), 'utf8')).toBe(before);
  });
});

describe('Task 194 — the CLI + MCP surfaces (parity)', () => {
  // The Task-113 F-9 pattern: dep-injectable runner, no stdin.
  it('cmk queue prune (runQueuePrune) drives a real keep resolution end-to-end', async () => {
    const { runQueuePrune } = await import('../packages/cli/src/subcommands.mjs');
    routePruneCandidate({ projectRoot: sandbox, id: 'P-CLKEEP22', text: 'cli-surfaced candidate', trustScore: 0.05, signalCount: 3 });
    const logs = [];
    const r = await runQueuePrune({
      projectRoot: sandbox, userDir,
      prompter: async () => 'keep',
      log: (m) => logs.push(m),
      logError: (m) => logs.push(m),
    });
    expect(r.kept).toBe(1);
    expect(logs.join('\n')).toContain('1 kept');
  });

  it('mk_queue_list {queue: prune} lists pending candidates; mk_queue_resolve {action: keep} resolves one', async () => {
    const { buildMcpServer } = await import('../packages/cli/src/mcp-server.mjs');
    routePruneCandidate({ projectRoot: sandbox, id: 'P-MCPCAND6', text: 'mcp-surfaced candidate', trustScore: 0.05, signalCount: 3 });
    const db = openIndexDb({ projectRoot: sandbox });
    try {
      const server = buildMcpServer({ projectRoot: sandbox, userDir, db });
      const tools = server._registeredTools ?? {};
      const list = JSON.parse((await tools.mk_queue_list.handler({ queue: 'prune' }, {})).content[0].text);
      expect(list.pending).toBe(1);
      expect(list.entries[0].id).toBe('P-MCPCAND6');

      const resolve = JSON.parse(
        (await tools.mk_queue_resolve.handler({ queue: 'prune', id: 'P-MCPCAND6', action: 'keep' }, {})).content[0].text,
      );
      expect(resolve.accepted).toBe(true);

      const after = JSON.parse((await tools.mk_queue_list.handler({ queue: 'prune' }, {})).content[0].text);
      expect(after.pending).toBe(0);
    } finally {
      db.close();
    }
  });
});
