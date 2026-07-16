// @doors: 1, 2, 5
// Door 3 N/A: no subprocess — dailyDistill is exercised in-process with a mock
//   backend (the spawn chain is cli-daily-distill.test.js's surface).
// Door 4 N/A: no message-queue interaction.

// Tests for Task 210 — deletion-propagation guarantee (D-308, the Always-On
// survey's #1 field gap): a tombstoned fact must be VERIFIABLY gone from every
// derived surface (SQLite/FTS index, recent.md, archive.md, today-*.md), with
// the survey's AOEP two-sided discipline:
//   - OBLIGATION pass: forget a fact → assert it actually disappeared (and
//     that the fixture SURFACED it first — a check that never saw the fact
//     proves nothing).
//   - NEGATIVE-INVARIANT pass: an empty memory dir must not pass silently as
//     if verified — a vacuous result is LABELED vacuous.
// Plus the forward path: a freshly-distilled summary never INCLUDES content
// from an already-tombstoned fact (closes the window going forward; old
// summaries are the HC's report-first territory, scrub routes to Task 96).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../packages/cli/src/install.mjs';
import {
  checkDeletionPropagation,
  screenTombstonedContent,
  readTombstoneFacts,
} from '../packages/cli/src/deletion-propagation.mjs';
import { forget } from '../packages/cli/src/forget.mjs';
import { reindex } from '../packages/cli/src/reindex.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import { reindexBoot } from '../packages/cli/src/index-rebuild.mjs';
import { dailyDistill } from '../packages/cli/src/daily-distill.mjs';
import { runDoctor } from '../packages/cli/src/doctor.mjs';

let sandbox;
let projectRoot;
let userDir;

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-delprop-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

const factDir = () => join(projectRoot, 'context', 'memory');
const sessionsDir = () => join(projectRoot, 'context', 'sessions');

// Distinctive content: unique enough that a survival match is meaningful.
const NEEDLE = 'the bastion rotates its ephemeral quorum key every fourth cycle';

function seedFact({ id = 'P-DPRQAAAA', slug = 'quorum-fact' } = {}) {
  const p = join(factDir(), `project_${slug}.md`);
  // write_source is REQUIRED by the boot indexer (parseSource skips without it)
  writeFileSync(
    p,
    `---\nid: ${id}\ntype: project\ntitle: quorum key rotation\ntrust: medium\ncreated_at: 2026-01-01T00:00:00Z\nwrite_source: user-explicit\n---\n\n${NEEDLE}\n`,
  );
  return { id, path: p };
}

// Index the fact into BOTH index layers (INDEX.md + SQLite), the real way.
function indexAll() {
  reindex({ tier: 'P', projectRoot, userDir, warn: () => {} });
  const db = openIndexDb({ projectRoot });
  try {
    reindexBoot({ projectRoot, userDir, db });
  } finally {
    db.close();
  }
}

function dbHasFact(id) {
  const db = openIndexDb({ projectRoot });
  try {
    return db.prepare('SELECT COUNT(*) AS n FROM observations WHERE id = ?').get(id).n > 0;
  } finally {
    db.close();
  }
}

describe('checkDeletionPropagation — the derived-surface cascade check (Task 210)', () => {
  it('OBLIGATION pass: forget cascades out of the index, and a stale summary survival is FLAGGED with its location', () => {
    const { id } = seedFact();
    indexAll();
    // a summary distilled BEFORE the forget still carries the content
    mkdirSync(sessionsDir(), { recursive: true });
    const recentPath = join(sessionsDir(), 'recent.md');
    writeFileSync(recentPath, `## 2026-01-02\n\n- ${NEEDLE} (${id})\n`);

    // the fixture actually surfaced the fact FIRST — without this, the
    // post-forget assertions prove nothing (the AOEP anti-vacuity guard)
    expect(dbHasFact(id)).toBe(true);
    expect(readFileSync(recentPath, 'utf8')).toContain(NEEDLE);

    const f = forget({ idOrQuery: id, projectRoot, userDir, yes: true });
    expect(f.action).toBe('tombstoned');

    // half the cascade is DONE by forget (index row gone)…
    expect(dbHasFact(id)).toBe(false);

    // …and the check reports the half that ISN'T (the stale summary)
    const r = checkDeletionPropagation({ projectRoot });
    expect(r.vacuous).toBe(false);
    expect(r.checked).toBeGreaterThanOrEqual(1);
    const survival = r.survivals.find((s) => s.path.endsWith('recent.md'));
    expect(survival).toBeTruthy();
    expect(survival.id).toBe(id);
    // no false survival reported for the index
    expect(r.survivals.filter((s) => s.surface === 'index')).toEqual([]);
  });

  it('flags an INDEX survival when the row outlived the tombstone (the cascade half forget owns)', () => {
    const { id } = seedFact({ id: 'P-DPRQBBBB', slug: 'index-survivor' });
    indexAll();
    expect(dbHasFact(id)).toBe(true);
    // simulate the pre-Task-110 world: tombstone WITHOUT the reindex — move
    // the file by hand so the index row is orphaned
    const tombDir = join(factDir(), 'archive', 'tombstones');
    mkdirSync(tombDir, { recursive: true });
    const raw = readFileSync(join(factDir(), 'project_index-survivor.md'), 'utf8');
    writeFileSync(
      join(tombDir, `${id}.md`),
      raw.replace('---\n\n', 'deleted_at: 2026-01-03T00:00:00Z\n---\n\n'),
    );
    rmSync(join(factDir(), 'project_index-survivor.md'));

    const r = checkDeletionPropagation({ projectRoot });
    const indexSurvival = r.survivals.find((s) => s.surface === 'index');
    expect(indexSurvival).toBeTruthy();
    expect(indexSurvival.id).toBe(id);
  });

  it('NEGATIVE-INVARIANT pass: no tombstones → the result is LABELED vacuous, never silently "verified"', () => {
    const r = checkDeletionPropagation({ projectRoot });
    expect(r.vacuous).toBe(true);
    expect(r.checked).toBe(0);
    expect(r.survivals).toEqual([]);
  });

  it('clean cascade → zero survivals, not vacuous (the real pass state)', () => {
    const { id } = seedFact({ id: 'P-DPRQCCCC', slug: 'clean-cascade' });
    indexAll();
    const f = forget({ idOrQuery: id, projectRoot, userDir, yes: true });
    expect(f.action).toBe('tombstoned');

    const r = checkDeletionPropagation({ projectRoot });
    expect(r.vacuous).toBe(false);
    expect(r.survivals).toEqual([]);
  });

  it('a RAW today-*.md source is NOT a derived surface — never flagged (skill-review Important #5)', () => {
    const { id } = seedFact({ id: 'P-DPRQRAW9', slug: 'raw-source' });
    indexAll();
    mkdirSync(sessionsDir(), { recursive: true });
    // the content sits in the RAW session buffer (a source, not derived) …
    writeFileSync(join(sessionsDir(), 'today-2026-01-02.md'), `## 2026-01-02\n\n- ${NEEDLE} (${id})\n`);
    // … and in a DERIVED artifact (this one SHOULD flag)
    writeFileSync(join(sessionsDir(), 'today-2026-01-02.distilled.md'), `## 2026-01-02\n\n- ${NEEDLE}\n`);
    forget({ idOrQuery: id, projectRoot, userDir, yes: true });

    const r = checkDeletionPropagation({ projectRoot });
    // the raw source is never a survival surface (no working scrub reaches it)
    expect(r.survivals.some((s) => s.path.endsWith('today-2026-01-02.md'))).toBe(false);
    // the derived artifact IS flagged
    expect(r.survivals.some((s) => s.path.endsWith('.distilled.md'))).toBe(true);
  });
});

describe('screenTombstonedContent — the forward-path filter', () => {
  function tombstoneFact(id, body) {
    const tombDir = join(factDir(), 'archive', 'tombstones');
    mkdirSync(tombDir, { recursive: true });
    writeFileSync(
      tombDir + `/${id}.md`,
      `---\nid: ${id}\ntype: project\ntitle: gone fact\ndeleted_at: 2026-01-03T00:00:00Z\n---\n\n${body}\n`,
    );
  }

  it('SPAN-replaces tombstoned content + id with [deleted]; other lines byte-identical (over-mutation guard)', () => {
    tombstoneFact('P-DPRQDDDD', NEEDLE);
    const input = `## Decisions\n- keep: unrelated durable choice\n- ${NEEDLE} still here\n- cited (P-DPRQDDDD) via id only\n-   keep: whitespace   preserved  exactly\n`;
    const r = screenTombstonedContent(input, { projectRoot });
    expect(r.dropped.length).toBe(2);
    expect(r.text).not.toContain(NEEDLE);
    expect(r.text).not.toContain('P-DPRQDDDD');
    expect(r.text).toContain('[deleted]');
    expect(r.text).toContain('- keep: unrelated durable choice');
    expect(r.text).toContain('-   keep: whitespace   preserved  exactly');
  });

  it('span-replace PRESERVES live facts + citations sharing a bullet with a tombstoned needle (skill-review Blocking)', () => {
    tombstoneFact('P-DPRQBLK9', NEEDLE);
    // one consolidated bullet: a tombstoned span AND a live fact + its citation
    const input = `## Decisions\n- ${NEEDLE}, and separately we shipped rollback (P-LVEFACTZ) — keep this\n`;
    const r = screenTombstonedContent(input, { projectRoot });
    expect(r.text).not.toContain(NEEDLE); // tombstoned span gone
    expect(r.text).toContain('we shipped rollback'); // live fact SURVIVES
    expect(r.text).toContain('P-LVEFACTZ'); // live citation SURVIVES
    expect(r.text).toContain('[deleted]'); // the removed span is marked
  });

  it('a redaction MARKER never becomes a needle (batch-scrub facts share it — skill-review Important)', () => {
    // a tombstone whose body is JUST a Task-96 redact marker (no distinctive content)
    tombstoneFact('P-DPRQMRK9', '[redacted: compliance 2026-01-01]');
    const input = `## Decisions\n- unrelated LIVE fact: [redacted: compliance 2026-01-01] scrubbed here — keep\n`;
    const r = screenTombstonedContent(input, { projectRoot });
    // the marker is boilerplate — it must NOT drop the unrelated live line
    expect(r.dropped.length).toBe(0);
    expect(r.text).toBe(input);
  });

  it('accepts a pre-read facts set (M2 — caller reads the archive once)', () => {
    // pre-read facts passed directly: screen without touching the archive
    const input = `- ${NEEDLE}\n- keep me\n`;
    const r = screenTombstonedContent(input, {
      facts: [{ id: 'P-DPRQPRE9', needles: [NEEDLE.toLowerCase()] }],
    });
    expect(r.text).not.toContain(NEEDLE);
    expect(r.text).toContain('keep me');
  });

  it('readTombstoneFacts reads the archive once → the facts feed screenTombstonedContent', () => {
    tombstoneFact('P-DPRQPRE7', NEEDLE);
    const tomb = readTombstoneFacts({ projectRoot });
    expect(tomb.facts.length).toBe(1);
    expect(tomb.facts[0].id).toBe('P-DPRQPRE7');
    const r = screenTombstonedContent(`- ${NEEDLE}\n- keep\n`, { facts: tomb.facts, truncated: tomb.truncated });
    expect(r.text).not.toContain(NEEDLE);
    expect(r.text).toContain('keep');
  });

  it('no tombstones → input returned untouched (byte-identical)', () => {
    const input = `## Decisions\n- anything at all\n`;
    const r = screenTombstonedContent(input, { projectRoot });
    expect(r.text).toBe(input);
    expect(r.dropped).toEqual([]);
  });

  it('dailyDistill never BANKS already-tombstoned content, and the distill log records the drop (Door 5)', async () => {
    tombstoneFact('P-DPRQEEEE', NEEDLE);
    const now = '2026-05-28T23:00:00Z';
    mkdirSync(sessionsDir(), { recursive: true });
    writeFileSync(
      join(sessionsDir(), 'today-2026-05-28.md'),
      `## 2026-05-28\n\n- some session activity\n`,
    );
    // a backend that echoes the tombstoned content into the summary — the
    // exact leak path: the day file predates the forget, Haiku reproduces it
    const backend = {
      modelId: () => 'mock',
      estimatedCostPerCall: () => 0,
      async compress() {
        return {
          outputText: `## Decisions\n- durable: ship the feature\n- ${NEEDLE}\n`,
          inputTokens: 10,
          outputTokens: 5,
          costUSD: 0,
          preservedIds: [],
        };
      },
    };
    const r = await dailyDistill({ projectRoot, backend, now });
    expect(r.action).toBe('distilled');

    const recent = readFileSync(join(sessionsDir(), 'recent.md'), 'utf8');
    expect(recent).toContain('durable: ship the feature');
    expect(recent).not.toContain(NEEDLE);
    // the banked per-day artifact is clean too (it feeds every future assembly)
    const artifact = readFileSync(join(sessionsDir(), 'today-2026-05-28.distilled.md'), 'utf8');
    expect(artifact).not.toContain(NEEDLE);
    // observability: the drop is recorded, never silent
    const logPath = join(sessionsDir(), '2026-05-28.distill.log');
    const lastLine = readFileSync(logPath, 'utf8').trim().split('\n').pop();
    expect(JSON.parse(lastLine).tombstone_dropped).toBeGreaterThanOrEqual(1);
  });

  // Self-review window (2026-07-16): the bank-time screen only catches a forget
  // that happened BEFORE a day was distilled. A forget AFTER a clean day was
  // banked leaves the content in that .distilled.md artifact — assembleRecent
  // must re-screen so the deletion still propagates to recent.md on the next run.
  it('re-screens at ASSEMBLY: a fact forgotten AFTER its day was banked is dropped from recent.md on the next run', async () => {
    const now = '2026-05-28T23:00:00Z';
    mkdirSync(sessionsDir(), { recursive: true });
    // a day banked CLEAN (no tombstone existed at distill time)
    writeFileSync(
      join(sessionsDir(), 'today-2026-05-28.distilled.md'),
      `## 2026-05-28\n\n- durable: keep this\n- ${NEEDLE}\n`,
    );
    writeFileSync(join(sessionsDir(), 'today-2026-05-28.md'), `## 2026-05-28\n\n- source\n`);
    // NOW the fact is forgotten (after the bank)
    const tombDir = join(factDir(), 'archive', 'tombstones');
    mkdirSync(tombDir, { recursive: true });
    writeFileSync(
      join(tombDir, 'P-DPRQHHHH.md'),
      `---\nid: P-DPRQHHHH\ntype: project\ntitle: gone\ndeleted_at: 2026-05-28T20:00:00Z\n---\n\n${NEEDLE}\n`,
    );
    // a no-op backend: the already-banked artifact is resumed (dayNeedsDistill
    // sees a fresh artifact), so ONLY the assembly re-screen can catch it
    const backend = {
      modelId: () => 'mock',
      estimatedCostPerCall: () => 0,
      async compress() {
        return { outputText: '', inputTokens: 0, outputTokens: 0, costUSD: 0, preservedIds: [] };
      },
    };
    await dailyDistill({ projectRoot, backend, now });
    const recent = readFileSync(join(sessionsDir(), 'recent.md'), 'utf8');
    expect(recent).toContain('durable: keep this'); // live content survives (span-replace)
    expect(recent).not.toContain(NEEDLE); // tombstoned content gone
    // I2: the assembly-time drop is NOT silent — it lands in the distill log
    const logPath = join(sessionsDir(), '2026-05-28.distill.log');
    const lastLine = readFileSync(logPath, 'utf8').trim().split('\n').pop();
    expect(JSON.parse(lastLine).tombstone_dropped).toBeGreaterThanOrEqual(1);
  });
});

describe('HC-12 — deletion propagation in cmk doctor', () => {
  it('FAILs naming the surviving file + fact id when a stale summary carries tombstoned content', async () => {
    const { id } = seedFact({ id: 'P-DPRQFFFF', slug: 'doctor-survivor' });
    indexAll();
    mkdirSync(sessionsDir(), { recursive: true });
    writeFileSync(join(sessionsDir(), 'archive.md'), `- old summary: ${NEEDLE}\n`);
    forget({ idOrQuery: id, projectRoot, userDir, yes: true });

    const r = await runDoctor({ projectRoot, userDir });
    const hc12 = r.checks.find((c) => c.id === 'HC-12');
    expect(hc12).toBeTruthy();
    expect(hc12.status).toBe('fail');
    expect(hc12.message).toContain('archive.md');
    expect(hc12.message).toContain(id);
  });

  it('SKIPs as explicitly vacuous when there are no tombstoned facts', async () => {
    const r = await runDoctor({ projectRoot, userDir });
    const hc12 = r.checks.find((c) => c.id === 'HC-12');
    expect(hc12).toBeTruthy();
    expect(hc12.status).toBe('skip');
    expect(hc12.message.toLowerCase()).toContain('vacuous');
  });

  it('PASSes when every tombstone verifiably cascaded', async () => {
    const { id } = seedFact({ id: 'P-DPRQGGGG', slug: 'clean-doctor' });
    indexAll();
    forget({ idOrQuery: id, projectRoot, userDir, yes: true });

    const r = await runDoctor({ projectRoot, userDir });
    const hc12 = r.checks.find((c) => c.id === 'HC-12');
    expect(hc12.status).toBe('pass');
  });
});
