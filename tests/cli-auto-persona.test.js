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
import { appendScratchpadBullet } from '../packages/cli/src/scratchpad.mjs';
import { touchCooldownMarker } from '../packages/cli/src/cooldown.mjs';
import { weeklyCurate } from '../packages/cli/src/weekly-curate.mjs';

/** Seed a pre-existing user-tier bullet at a given trust (for conflict tests). */
function seedUserBullet({ scratchpad, section, text, trust }) {
  const r = appendScratchpadBullet({
    tier: 'U',
    scratchpad,
    section,
    text,
    provenance: {
      source: 'seed',
      source_line: 1,
      sha1: 'c'.repeat(40),
      write: trust === 'high' ? 'user-explicit' : 'compressor',
      trust,
      at: '2026-05-29T00:00:00Z',
    },
    userDir,
    now: '2026-05-29T00:00:00Z',
  });
  if (r.action !== 'appended') throw new Error(`seedUserBullet failed: ${JSON.stringify(r)}`);
  return r;
}

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
// Auto-supersede on contradiction + high-trust conflict staging (45.6)
// ---------------------------------------------------------------------------

describe('Task 45 — auto-supersede + conflict staging', () => {
  function countBullets(text) {
    return (text.match(/^- \(/gm) || []).length;
  }

  it('auto-supersedes a same-topic trust:medium persona fact (no duplicate — finding #3 Gap B)', async () => {
    seedUserTier();
    // An existing, system-promoted persona fact about the venv habit.
    seedUserBullet({
      scratchpad: 'HABITS.md',
      section: 'Iteration Cadence',
      text: 'Always uses a Python 3.13 venv across every project',
      trust: 'medium',
    });
    seedFact({
      slug: 'feedback_venv',
      id: 'P-WGQAZFVC',
      type: 'feedback',
      title: 'venv',
      body: 'venv doctrine, updated.',
    });
    // Classifier surfaces an UPDATED, near-identical version (same topic).
    const backend = classifierBackend([
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=high | Always uses a Python 3.13 venv across every project, never the system Python',
    ]);

    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW });

    // Door 1 — the contradiction was resolved by supersede, not coexist.
    expect(r.superseded).toHaveLength(1);
    expect(r.superseded[0]).toMatchObject({ target: 'HABITS.md' });

    // Door 2 / over-mutation guard — exactly ONE venv bullet remains in the
    // Iteration Cadence section (the new one), the stale one is gone.
    const habits = readFileSync(join(userDir, 'HABITS.md'), 'utf8');
    const section = habits.slice(habits.indexOf('## Iteration Cadence'));
    const venvBullets = section.split('\n').filter((l) => /^- \(.*venv/i.test(l) || /venv/i.test(l) && /^- \(/.test(l));
    expect(venvBullets.length).toBe(1);
    expect(habits).toMatch(/never the system Python/);
  });

  it('does NOT overwrite a trust:high hand-curated entry — stages in the conflict queue (45.4 invariant)', async () => {
    seedUserTier();
    const handCurated = 'Prefers terse direct replies with no filler';
    seedUserBullet({
      scratchpad: 'HABITS.md',
      section: 'Communication Style',
      text: handCurated,
      trust: 'high',
    });
    seedFact({
      slug: 'feedback_comms',
      id: 'P-CMMSTYLE',
      type: 'feedback',
      title: 'comms',
      body: 'communication preference.',
    });
    // A medium-trust persona candidate that CONTRADICTS the hand-curated rule.
    const backend = classifierBackend([
      'PERSONA CANDIDATE | target=HABITS.md | section=Communication Style | confidence=high | Prefers terse direct replies with no filler or preamble',
    ]);

    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW });

    // The hand-curated trust:high bullet is untouched.
    const habits = readFileSync(join(userDir, 'HABITS.md'), 'utf8');
    expect(habits).toMatch(/Prefers terse direct replies with no filler\b/);
    expect(habits).toMatch(/trust:\s*high/);

    // The candidate was staged, not promoted.
    expect(r.conflicts).toHaveLength(1);
    expect(r.promoted ?? []).toHaveLength(0);
    const conflictsQueue = join(userDir, 'queues', 'conflicts.md');
    expect(existsSync(conflictsQueue), 'conflict queue file should exist').toBe(true);
    expect(readFileSync(conflictsQueue, 'utf8')).toMatch(/preamble/);
  });
});

// ---------------------------------------------------------------------------
// Cooldown gate (I-3) — shares the 120s Haiku marker with the other backends
// ---------------------------------------------------------------------------

describe('Task 45 — cooldown gate', () => {
  it('skips without calling the backend when the shared cooldown is active', async () => {
    seedUserTier();
    seedFact({ slug: 'feedback_venv', id: 'P-WGQAZFVC', type: 'feedback', title: 'venv', body: 'venv doctrine.' });
    // Another Haiku caller just ran in this project → cooldown is active.
    touchCooldownMarker({ projectRoot, now: NOW });

    let called = false;
    const backend = classifierBackend(
      ['PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=high | x'],
      { onCompress: () => { called = true; } },
    );

    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW });
    expect(r.action).toBe('skipped');
    expect(r.reason).toBe('cooldown');
    expect(called, 'backend.compress must NOT be called during cooldown').toBe(false);
  });

  it('cooldownMs:0 override runs even with an active marker (single-cycle composition, like dailyDistill)', async () => {
    seedUserTier();
    seedFact({ slug: 'feedback_venv', id: 'P-WGQAZFVC', type: 'feedback', title: 'venv', body: 'venv doctrine.' });
    touchCooldownMarker({ projectRoot, now: NOW });
    const backend = classifierBackend([
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=high | Uses a Python 3.13 venv on every project',
    ]);
    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW, cooldownMs: 0 });
    expect(r.action).toBe('promoted');
  });
});

// ---------------------------------------------------------------------------
// Design-B integration — weekly-curate triggers auto-persona (D-14/D-15)
// ---------------------------------------------------------------------------

describe('Task 45 — weekly-curate hook (Design B)', () => {
  // A backend that serves BOTH callers in one weekly cycle: the persona
  // classifier (its prompt says "persona archivist") and the curate
  // consolidator (everything else).
  function dualBackend(personaLines) {
    return {
      modelId: () => 'mock-haiku',
      async compress({ instructions }) {
        if (/persona archivist/i.test(instructions)) {
          return { outputText: personaLines.join('\n'), modelId: 'mock-haiku', costUSD: 0 };
        }
        return { outputText: '## Week of 2026-05-01\n- consolidated archive bullet', modelId: 'mock-haiku', costUSD: 0 };
      },
    };
  }

  it('auto-promotes persona facts to the user tier as part of the weekly cycle', async () => {
    seedUserTier();
    seedFact({
      slug: 'feedback_venv',
      id: 'P-WGQAZFVC',
      type: 'feedback',
      title: 'venv',
      body: 'Across every project I use a Python 3.13 venv.',
    });
    // An old session file (>7 days before NOW) so curate has work to do too.
    const sessionsDir = join(projectRoot, 'context', 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, 'today-2026-05-01.md'), '- did some work on 2026-05-01\n', 'utf8');

    const backend = dualBackend([
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=high | Always uses a Python 3.13 venv on every project',
    ]);

    const r = await weeklyCurate({ projectRoot, userDir, backend, now: NOW });

    // Curate ran (old file archived) AND persona promoted in the same cycle.
    expect(r.action).toBe('curated');
    expect(r.persona).toBeTruthy();
    expect(r.persona.action).toBe('promoted');
    expect(readFileSync(join(userDir, 'HABITS.md'), 'utf8')).toMatch(/Python 3\.13 venv/);
  });

  it('runs persona even when there are no old session files to archive', async () => {
    seedUserTier();
    seedFact({ slug: 'feedback_venv', id: 'P-WGQAZFVC', type: 'feedback', title: 'venv', body: 'Across every project I use a 3.13 venv.' });
    // sessions dir exists but only a CURRENT (not old) file → no-old-files path.
    const sessionsDir = join(projectRoot, 'context', 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, 'today-2026-05-30.md'), '- today\n', 'utf8');

    const backend = dualBackend([
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=high | Always uses a Python 3.13 venv on every project',
    ]);

    const r = await weeklyCurate({ projectRoot, userDir, backend, now: NOW });
    expect(r.action).toBe('skipped');
    expect(r.reason).toBe('no-old-files');
    expect(r.persona?.action).toBe('promoted'); // persona still ran
    expect(readFileSync(join(userDir, 'HABITS.md'), 'utf8')).toMatch(/Python 3\.13 venv/);
  });

  it('creates the user tier if absent, then promotes (friend never ran `cmk init-user-tier`)', async () => {
    // Deliberately do NOT seedUserTier() — simulate a fresh machine where the
    // cross-project tier has never been scaffolded. Before the fix this
    // silently no-op'd (every promotion → NOT_FOUND → queued[]).
    seedFact({ slug: 'feedback_venv', id: 'P-WGQAZFVC', type: 'feedback', title: 'venv', body: 'Across every project I use a 3.13 venv.' });
    const sessionsDir = join(projectRoot, 'context', 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, 'today-2026-05-30.md'), '- today\n', 'utf8');
    expect(existsSync(join(userDir, 'HABITS.md'))).toBe(false); // tier absent

    const backend = dualBackend([
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=high | Always uses a Python 3.13 venv on every project',
    ]);

    const r = await weeklyCurate({ projectRoot, userDir, backend, now: NOW });
    // The hook scaffolded the user tier, then auto-persona promoted into it.
    expect(existsSync(join(userDir, 'HABITS.md'))).toBe(true);
    expect(r.persona?.action).toBe('promoted');
    expect(readFileSync(join(userDir, 'HABITS.md'), 'utf8')).toMatch(/Python 3\.13 venv/);
  });

  it('does not run persona when userDir is absent (project-only callers unaffected)', async () => {
    const sessionsDir = join(projectRoot, 'context', 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, 'today-2026-05-30.md'), '- today\n', 'utf8');
    const backend = dualBackend(['PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=high | x']);
    const r = await weeklyCurate({ projectRoot, backend, now: NOW });
    expect(r.persona).toBeUndefined();
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
