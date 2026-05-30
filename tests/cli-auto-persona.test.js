// @doors: 1, 2, 4
// Door 3 N/A: autoPersona's backend is an injected CompressorBackend (no
//   real subprocess spawn at this boundary; the live-Haiku spawn smoke
//   lives in the compressor's own tests + the weekly-curate hook test).
// Door 5 N/A: no message-queue surface.
//
// Tests for Task 45 (auto-persona) — v0.2 Phase 2. The optimistic
// auto-promote posture (tasks.md 45.6): cross-project doctrine captured
// in the PROJECT tier is auto-promoted into the USER tier at
// trust:medium, with NO manual accept step. This is the structural fix
// for self-test finding #2 (the empty-user-tier failure §16.16 predicted
// and the 2026-05-30 dogfood reproduced).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { autoPersona } from '../packages/cli/src/auto-persona.mjs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let root; // sandbox holding both projectRoot and userDir
let projectRoot;
let userDir;

const NOW = '2026-05-30T12:00:00Z';

/** Seed a project-tier granular fact file (the autoPersona source corpus). */
function seedFact({ slug, id, type, title, body }) {
  const dir = join(projectRoot, 'context', 'memory');
  mkdirSync(dir, { recursive: true });
  const fm = [
    '---',
    `id: ${id}`,
    `type: ${type}`,
    `title: ${title}`,
    '---',
    '',
    body,
    '',
  ].join('\n');
  writeFileSync(join(dir, `${slug}.md`), fm, 'utf8');
}

/** Scaffold the user-tier scratchpads with their real section headings. */
function seedUserTier() {
  mkdirSync(userDir, { recursive: true });
  writeFileSync(
    join(userDir, 'USER.md'),
    ['# User Profile', '', '## About', '', '## Preferences', '', '## Working Style', ''].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(userDir, 'HABITS.md'),
    ['# Habits (cross-project working style)', '', '## Iteration Cadence', '', '## Destructive Operations', '', '## Communication Style', ''].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(userDir, 'LESSONS.md'),
    ['# Lessons (cross-project)', '', '## Tooling Lessons', '', '## Process Lessons', '', '## Anti-patterns', ''].join('\n'),
    'utf8',
  );
}

/**
 * A CompressorBackend stub that returns a canned persona-classification.
 * The classification contract: one `PERSONA CANDIDATE | k=v | ... | <text>`
 * line per cross-project candidate. `lines` is the array the backend emits.
 */
function classifierBackend(lines, { onCompress } = {}) {
  return {
    modelId: () => 'mock-haiku',
    async compress(args) {
      if (onCompress) onCompress(args);
      return { outputText: lines.join('\n'), modelId: 'mock-haiku', costUSD: 0 };
    },
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cmk-persona-'));
  projectRoot = join(root, 'proj');
  userDir = join(root, 'user');
  mkdirSync(projectRoot, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Headline contract — finding #2 fix
// ---------------------------------------------------------------------------

describe('Task 45 — auto-persona optimistic auto-promote', () => {
  it('auto-promotes cross-project doctrine into the user tier at trust:medium (finding #2)', async () => {
    seedUserTier();
    // A cross-project "how I work everywhere" doctrine + a project-specific fact.
    seedFact({
      slug: 'feedback_python-venv-313-only',
      id: 'P-WGQAZFVC',
      type: 'feedback',
      title: 'Always use a Python 3.13 venv',
      body: 'Across every Python project: create and use a 3.13 venv; never the system 3.10.',
    });
    seedFact({
      slug: 'fact_port-8000',
      id: 'P-MKTXVWZP',
      type: 'project',
      title: 'This API runs on port 8000',
      body: 'The lior-test-1 FastAPI app binds port 8000.',
    });

    // Backend classifies ONLY the venv doctrine as cross-project (high conf);
    // the port fact is project-specific → not surfaced as a candidate.
    const backend = classifierBackend([
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=high | Always uses a Python 3.13 venv across every Python project, never system 3.10',
    ]);

    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW });

    // Door 1 — Response
    expect(r.action).toBe('promoted');
    expect(r.promoted).toHaveLength(1);
    expect(r.promoted[0]).toMatchObject({
      target: 'HABITS.md',
      section: 'Iteration Cadence',
      trust: 'medium',
    });

    // Door 2 — State: the bullet actually landed in the user-tier HABITS.md
    const habits = readFileSync(join(userDir, 'HABITS.md'), 'utf8');
    expect(habits).toMatch(/Python 3\.13 venv/);
    // …under the right section, after the "## Iteration Cadence" heading.
    const idx = habits.indexOf('## Iteration Cadence');
    expect(idx).toBeGreaterThan(-1);
    expect(habits.indexOf('Python 3.13 venv')).toBeGreaterThan(idx);
    // trust:medium recorded in the bullet's provenance comment.
    expect(habits).toMatch(/trust:\s*medium/);

    // Precision: the project-specific port fact did NOT get promoted.
    expect(habits).not.toMatch(/port 8000/);
    const userMd = readFileSync(join(userDir, 'USER.md'), 'utf8');
    const lessons = readFileSync(join(userDir, 'LESSONS.md'), 'utf8');
    expect(userMd).not.toMatch(/port 8000/);
    expect(lessons).not.toMatch(/port 8000/);
  });

  it('writes an audit-log entry naming the promotion + source (Door 4)', async () => {
    seedUserTier();
    seedFact({
      slug: 'feedback_layered-backend',
      id: 'P-LAYRDBCK',
      type: 'feedback',
      title: 'Layered backend architecture',
      body: 'I build every backend in layers: thin routes, service layer, repository layer.',
    });
    const backend = classifierBackend([
      'PERSONA CANDIDATE | target=HABITS.md | section=Communication Style | confidence=high | Builds every backend in layers: thin routes, service, repository',
    ]);

    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW });
    expect(r.action).toBe('promoted');

    // Door 4 — Observability: an audit-log entry exists for the promotion.
    const auditLog = join(userDir, '.locks', 'audit.log');
    expect(existsSync(auditLog), 'user-tier audit.log should exist after a promotion').toBe(true);
    const entries = readFileSync(auditLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const promo = entries.find((e) => /persona/i.test(JSON.stringify(e)));
    expect(promo, 'an audit entry should reference the persona promotion').toBeTruthy();
  });

  it('skips (no error) when there are no cross-project candidates', async () => {
    seedUserTier();
    seedFact({
      slug: 'fact_port-8000',
      id: 'P-MKTXVWZP',
      type: 'project',
      title: 'This API runs on port 8000',
      body: 'The lior-test-1 FastAPI app binds port 8000.',
    });
    const backend = classifierBackend([]); // classifier surfaces nothing

    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW });
    expect(r.action).toBe('skipped');
    expect(r.promoted ?? []).toHaveLength(0);
    // No spurious writes into the user tier.
    expect(readFileSync(join(userDir, 'HABITS.md'), 'utf8')).not.toMatch(/^- \(/m);
  });
});

// ---------------------------------------------------------------------------
// Guard rails
// ---------------------------------------------------------------------------

describe('Task 45 — auto-persona guards', () => {
  it('errors when backend is missing', async () => {
    seedUserTier();
    const r = await autoPersona({ projectRoot, userDir, now: NOW });
    expect(r.action).toBe('error');
    expect(r.errorCategory).toBeTruthy();
  });

  it('errors when userDir is missing (nowhere to promote to)', async () => {
    const backend = classifierBackend([]);
    const r = await autoPersona({ projectRoot, backend, now: NOW });
    expect(r.action).toBe('error');
  });
});
