// @doors: 1, 2, 3, 4
// @door-3.5: prompt-assertion — pins WHAT reached the classifier (the transcript window in backend.compress's input) + the classifier instructions.
// Door 3 (external calls) is asserted at the INJECTED-backend boundary: the
//   Task 86c tests capture backend.compress's args (via classifierBackend's
//   onCompress) to pin WHAT reached the classifier — the transcript window vs the
//   fact corpus, and the matching framing. The REAL subprocess-spawn Door 3 lives
//   in the compressor's own spawn-smoke + the weekly-curate hook test.
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
import {
  autoPersona,
  promoteCandidatesToUserTier,
  parsePersonaCandidates,
  resolveRecurrenceSum,
  assembleProjectCorpus,
  assembleTranscriptWindow,
  buildClassifierInstructions,
  PERSONA_CONFIDENCE_RULE,
  PERSONA_CORPUS_BYTES,
} from '../packages/cli/src/auto-persona.mjs';
import { PROMOTE_THRESHOLD } from '../packages/cli/src/heat.mjs';
import { runPersonaGenerate } from '../packages/cli/src/subcommands.mjs';
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
function seedFact({ slug, id, type, title, body, recurrenceCount }) {
  const dir = join(projectRoot, 'context', 'memory');
  mkdirSync(dir, { recursive: true });
  const fm = [
    '---',
    `id: ${id}`,
    `type: ${type}`,
    `title: ${title}`,
    // 151.1: recurrence_count is the gate signal for cite-and-sum (151.3).
    // Only written when the test cares — facts without it default to 1.
    ...(recurrenceCount != null ? [`recurrence_count: ${recurrenceCount}`] : []),
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
      body: 'The live-test-1 FastAPI app binds port 8000.',
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
      body: 'The live-test-1 FastAPI app binds port 8000.',
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

// ---------------------------------------------------------------------------
// Task 45 follow-up — low/medium-confidence candidates must be DURABLE, not
// merely returned in the response (the user, 2026-05-31: "response object can get
// lost — i dont like it"). They persist to <userDir>/queues/persona-review.md
// so a later (manual or auto-drain) pass can act on them.
// ---------------------------------------------------------------------------
describe('Task 45 follow-up — low/medium-confidence candidates persist to a review-queue FILE', () => {
  it('writes queued candidates to <userDir>/queues/persona-review.md with provenance; does NOT promote them', async () => {
    seedUserTier();
    seedFact({
      slug: 'feedback_ripgrep',
      id: 'P-WGQAZFVC',
      type: 'feedback',
      title: 'reaches for ripgrep',
      body: 'Tends to reach for ripgrep instead of grep.',
    });
    // confidence=medium → the confidence gate routes it to the review queue,
    // NOT an auto-promotion.
    const backend = classifierBackend([
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=medium | Reaches for ripgrep instead of grep',
    ]);

    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW });

    // Door 1 — surfaced in the response AND the queue-file path is returned.
    expect(r.queued.length).toBeGreaterThanOrEqual(1);
    expect(r.reviewQueuePath).toBeTruthy();

    // Door 2 (State) — the candidate is durable on disk (the "can get lost" fix).
    const queueFile = join(userDir, 'queues', 'persona-review.md');
    expect(existsSync(queueFile)).toBe(true);
    const body = readFileSync(queueFile, 'utf8');
    expect(body).toContain('Reaches for ripgrep instead of grep');
    expect(body).toMatch(/confidence:\s*medium/);
    expect(body).toContain('HABITS.md');

    // Over-mutation — a medium candidate must NOT auto-promote into the scratchpad.
    const habits = readFileSync(join(userDir, 'HABITS.md'), 'utf8');
    expect(habits).not.toContain('Reaches for ripgrep instead of grep');
  });

  it('does not duplicate an already-queued candidate across runs (dedup by id)', async () => {
    seedUserTier();
    seedFact({ slug: 'feedback_rg', id: 'P-WGQAZFVC', type: 'feedback', title: 't', body: 'Reaches for ripgrep.' });
    const mk = () =>
      classifierBackend([
        'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=medium | Reaches for ripgrep instead of grep',
      ]);
    await autoPersona({ projectRoot, userDir, backend: mk(), now: NOW });
    // Second run, cooldown bypassed — must NOT re-append the same candidate.
    await autoPersona({ projectRoot, userDir, backend: mk(), now: NOW, cooldownMs: 0 });

    const body = readFileSync(join(userDir, 'queues', 'persona-review.md'), 'utf8');
    const occurrences = body.split('Reaches for ripgrep instead of grep').length - 1;
    expect(occurrences).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// `cmk persona generate` (runPersonaGenerate) — the manual trigger. Injection
// seams (projectRoot/userDir/backend/log) let us exercise it without a live
// `claude --print` spawn.
// ---------------------------------------------------------------------------
describe('Task 45 follow-up — cmk persona generate (runPersonaGenerate)', () => {
  it('promotes high-confidence to the user tier, queues the rest, and reports counts', async () => {
    seedUserTier();
    seedFact({ slug: 'feedback_venv', id: 'P-WGQAZFVC', type: 'feedback', title: 'venv', body: 'Always a 3.13 venv everywhere.' });
    const backend = classifierBackend([
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=high | Always uses a Python 3.13 venv on every project',
      'PERSONA CANDIDATE | target=LESSONS.md | section=Tooling Lessons | confidence=medium | Reaches for ripgrep over grep',
    ]);
    const out = [];
    await runPersonaGenerate({
      projectRoot,
      userDir,
      backend,
      log: (m) => out.push(m),
      logError: (m) => out.push(`ERR: ${m}`),
    });
    const text = out.join('\n');

    // Door 1 — reports the action + counts (promoted high, queued medium).
    expect(text).toMatch(/cmk persona generate:/);
    expect(text).toMatch(/promoted: 1/);
    expect(text).toMatch(/saved for review/);

    // Door 2 — high-confidence landed in the user tier; medium went to the queue file.
    expect(readFileSync(join(userDir, 'HABITS.md'), 'utf8')).toContain('Python 3.13 venv');
    expect(existsSync(join(userDir, 'queues', 'persona-review.md'))).toBe(true);
  });

  it('reports the error action (logError path) when the backend fails', async () => {
    seedUserTier();
    seedFact({ slug: 'x', id: 'P-WGQAZFVC', type: 'feedback', title: 't', body: 'A cross-project habit.' });
    const backend = { modelId: () => 'mock', async compress() { throw new Error('boom'); } };
    const out = [];
    await runPersonaGenerate({
      projectRoot,
      userDir,
      backend,
      log: (m) => out.push(m),
      logError: (m) => out.push(`ERR: ${m}`),
    });
    expect(out.join('\n')).toMatch(/ERR: cmk persona generate: error/);
  });
});

// ---------------------------------------------------------------------------
// Task 64 (F2) — create the section if missing instead of dropping to the queue
// ---------------------------------------------------------------------------

describe('Task 64 — section-promotion (F2): create the section if it does not pre-exist', () => {
  it('high-confidence candidate to a NEW section → section CREATED + promoted (NOT queued)', () => {
    // The exact live-test failure: Haiku targeted HABITS.md § "Architecture
    // Preferences" — a sane section, but not one of HABITS.md's seeded headings
    // (Iteration Cadence / Destructive Operations / Communication Style). Old
    // behavior: schema error → queued → HABITS.md stayed empty. New: create it.
    seedUserTier();
    const r = promoteCandidatesToUserTier({
      candidates: [{
        target: 'HABITS.md',
        section: 'Architecture Preferences',
        confidence: 'high',
        text: 'Builds every backend in layers: thin routes, services, repositories',
      }],
      userDir,
      now: NOW,
    });

    // Door 1 — Response: promoted, not queued.
    expect(r.promoted).toHaveLength(1);
    expect(r.promoted[0]).toMatchObject({ target: 'HABITS.md', section: 'Architecture Preferences' });
    expect(r.queued).toHaveLength(0);

    // Door 2 — State: the section heading was created AND the bullet landed under it.
    const habits = readFileSync(join(userDir, 'HABITS.md'), 'utf8');
    expect(habits).toMatch(/^## Architecture Preferences$/m);
    const afterHeading = habits.slice(habits.indexOf('## Architecture Preferences'));
    expect(afterHeading).toMatch(/thin routes, services, repositories/);
    // Over-mutation guard: appending a new section must NOT drop the existing
    // headings (seed-N, add-one, assert the originals survive).
    expect(habits).toMatch(/^## Iteration Cadence$/m);
    expect(habits).toMatch(/^## Destructive Operations$/m);
    expect(habits).toMatch(/^## Communication Style$/m);

    // Door 4 (I1) — the structural section-creation is recorded in the audit
    // log, so "why did HABITS.md grow this section?" is answerable.
    const audit = readFileSync(join(userDir, '.locks', 'audit.log'), 'utf8');
    expect(audit).toMatch(/"action":"persona-section-created"/);
    expect(audit).toMatch(/Architecture Preferences/);
  });

  it('no-file (target scratchpad absent) → queued not-promoted-no-file, nothing created', () => {
    // Deliberately do NOT seedUserTier → HABITS.md doesn't exist.
    const r = promoteCandidatesToUserTier({
      candidates: [{ target: 'HABITS.md', section: 'Iteration Cadence', confidence: 'high', text: 'x' }],
      userDir,
      now: NOW,
    });
    expect(r.promoted).toHaveLength(0);
    expect(r.queued).toHaveLength(1);
    expect(r.queued[0].reason).toBe('not-promoted-no-file');
    expect(existsSync(join(userDir, 'HABITS.md'))).toBe(false);
  });

  it('a guard-rejected candidate is persisted to the durable persona-review queue (Door 4)', () => {
    seedUserTier();
    const r = promoteCandidatesToUserTier({
      candidates: [{ target: 'HABITS.md', section: 'bad/../name #', confidence: 'high', text: 'keep me somewhere durable' }],
      userDir,
      now: NOW,
    });
    expect(r.queued).toHaveLength(1);
    // The queued candidate survives past the response object in a durable file.
    const queue = readFileSync(join(userDir, 'queues', 'persona-review.md'), 'utf8');
    expect(queue).toMatch(/keep me somewhere durable/);
  });

  it('a garbage / unsafe section name is NOT created — stays queued (name guard)', () => {
    seedUserTier();
    const r = promoteCandidatesToUserTier({
      candidates: [{
        target: 'HABITS.md',
        section: '../../etc/passwd #!! ',
        confidence: 'high',
        text: 'should not create a junk heading',
      }],
      userDir,
      now: NOW,
    });
    expect(r.promoted).toHaveLength(0);
    expect(r.queued).toHaveLength(1);
    expect(r.queued[0].reason).toMatch(/section/i);
    // No junk heading written.
    expect(readFileSync(join(userDir, 'HABITS.md'), 'utf8')).not.toMatch(/passwd/);
  });

  it('an EXISTING section still promotes without duplicating the heading (no regression)', () => {
    seedUserTier();
    const r = promoteCandidatesToUserTier({
      candidates: [{
        target: 'HABITS.md',
        section: 'Iteration Cadence',
        confidence: 'high',
        text: 'Works tasks strictly in order, one PR per task',
      }],
      userDir,
      now: NOW,
    });
    expect(r.promoted).toHaveLength(1);
    const habits = readFileSync(join(userDir, 'HABITS.md'), 'utf8');
    // Exactly one "## Iteration Cadence" heading (not duplicated by ensure-section).
    expect(habits.match(/^## Iteration Cadence$/gm)).toHaveLength(1);
    expect(habits).toMatch(/one PR per task/);
  });
});

// ---------------------------------------------------------------------------
// Task 86c — classify over the RAW TRANSCRIPT, not the distilled fact corpus
// (D-44). Primary-source: hermes background_review reviews "the conversation
// above"; claude-mem summarize reads transcriptPath. Distilled facts lose the
// cross-project signal ("from now on" → "in this project"); the transcript keeps
// it verbatim, so the SessionEnd persona pass must read the transcript window.
// ---------------------------------------------------------------------------

/** Seed a date-named transcript at context/transcripts/{date}.md */
function seedTranscript({ date = '2026-05-30', body }) {
  const dir = join(projectRoot, 'context', 'transcripts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${date}.md`), body, 'utf8');
}

describe('Task 86c — autoPersona classifies the raw transcript (D-44)', () => {
  it('assembleTranscriptWindow returns the most-recent transcript, tailed to maxBytes at a turn boundary', () => {
    // An OLDER date file must be ignored (only the latest session's transcript).
    seedTranscript({ date: '2026-05-29', body: '## 2026-05-29T09:00:00Z — user\nOLD-CONTENT should be ignored\n' });
    const big = [
      '## 2026-05-30T10:00:00Z — user',
      'EARLY filler turn '.repeat(50),
      '## 2026-05-30T11:00:00Z — user',
      'from now on always use uv in every project',
      '',
    ].join('\n');
    seedTranscript({ date: '2026-05-30', body: big });

    const win = assembleTranscriptWindow({ projectRoot, maxBytes: 120 });
    expect(win).toMatch(/from now on always use uv/); // recent content kept
    expect(win).not.toMatch(/OLD-CONTENT/); // only the latest date file
    expect(win).not.toMatch(/EARLY filler/); // early content tailed off
    expect(win.length).toBeLessThanOrEqual(120);
    expect(win.startsWith('## ')).toBe(true); // window snaps to a turn boundary
  });

  it('assembleTranscriptWindow returns "" when no transcript exists', () => {
    expect(assembleTranscriptWindow({ projectRoot, maxBytes: 1000 })).toBe('');
  });

  it('buildClassifierInstructions("transcript") frames the input as the conversation; default frames it as facts', () => {
    const t = buildClassifierInstructions('transcript');
    expect(t).toMatch(/RECENT CONVERSATION/);
    expect(t).toContain(PERSONA_CONFIDENCE_RULE); // confidence rule shared across both framings
    const f = buildClassifierInstructions();
    expect(f).toMatch(/CAPTURED PROJECT FACTS/);
    expect(f).not.toMatch(/RECENT CONVERSATION/);
  });

  it('151.3: the FACTS prompt instructs the classifier to CITE source_fact_ids (not count)', () => {
    const f = buildClassifierInstructions('facts');
    expect(f).toMatch(/source_fact_ids/); // the citation it must emit
    expect(f).toMatch(/\[P-/); // shows the bracketed-id form it should echo
    // It must tell the model to CITE the facts, never to invent a recurrence COUNT
    // (the whole point of cite-and-sum: the LLM groups, code counts — D-230).
    expect(f.toLowerCase()).toMatch(/cite|the ids|do not (count|invent)/);
    expect(f).not.toMatch(/recurrence=/); // never ask the LLM for a count
  });

  it('151.3: the TRANSCRIPT prompt does NOT ask for source_fact_ids (no citable ids there)', () => {
    const t = buildClassifierInstructions('transcript');
    expect(t).not.toMatch(/source_fact_ids/);
  });

  // -- The Hole-A regression: recurrence gate replaces the form gate ----------

  it('151.3 HOLE A: a DEMONSTRATED (confidence=medium) trait whose cited facts sum ≥ threshold PROMOTES — no "always/never" wording needed', async () => {
    seedUserTier();
    // A philosophy DEMONSTRATED 3× across the project but never DECLARED as a rule.
    // Pre-151.3 this stranded at the form gate (confidence!=='high' → queue).
    seedFact({ slug: 'feedback_a', id: 'P-WGQAZFVC', type: 'feedback', title: 'design-first 1', body: 'Wrote the test before the code here.', recurrenceCount: 2 });
    seedFact({ slug: 'feedback_b', id: 'P-MKTXVWZP', type: 'feedback', title: 'design-first 2', body: 'Wrote the test before the code again.', recurrenceCount: 1 });

    // Classifier emits a MEDIUM candidate (inferred, not stated) that CITES the two
    // facts. Their recurrence sums to 3 (= PROMOTE_THRESHOLD) → must promote.
    const backend = classifierBackend([
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=medium | Works test-first as a matter of course | source_fact_ids=[P-WGQAZFVC, P-MKTXVWZP]',
    ]);

    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW });

    expect(r.action).toBe('promoted'); // Door 1
    expect(r.promoted).toHaveLength(1);
    const habits = readFileSync(join(userDir, 'HABITS.md'), 'utf8'); // Door 2
    expect(habits).toMatch(/test-first/);
    // The citation suffix must NOT leak into the persisted bullet text.
    expect(habits).not.toMatch(/source_fact_ids/);
    expect(habits).not.toMatch(/P-WGQAZFVC/);

    // Door 4 — the audit trail names the recurrence path (via recurrence-N), so a
    // debugger can tell this from the explicit-imperative fast-path.
    const auditLog = join(userDir, '.locks', 'audit.log');
    const entries = readFileSync(auditLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const promo = entries.find((e) => e.action === 'persona-promote');
    expect(promo.reasonText).toMatch(/via recurrence-3/);
  });

  it('151.3: a medium trait whose cited facts sum BELOW threshold still QUEUES (no over-promote)', async () => {
    seedUserTier();
    seedFact({ slug: 'feedback_c', id: 'P-WGQAZFVC', type: 'feedback', title: 'one-off', body: 'Did a thing once.', recurrenceCount: 1 });
    const backend = classifierBackend([
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=medium | A one-off habit | source_fact_ids=[P-WGQAZFVC]',
    ]);

    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW });

    expect(r.promoted).toHaveLength(0); // not promoted
    expect(r.queued.length).toBeGreaterThan(0); // routed to review instead
    const habits = readFileSync(join(userDir, 'HABITS.md'), 'utf8');
    expect(habits).not.toMatch(/one-off habit/); // Door 2: nothing landed
  });

  it('151.3: the explicit-imperative fast-path is preserved — confidence=high promotes even with NO recurrence', async () => {
    seedUserTier();
    // A STATED standing rule, cited from a brand-new (recurrence 1) fact — below
    // the recurrence threshold, but high confidence is its own promotion route.
    seedFact({ slug: 'feedback_d', id: 'P-WGQAZFVC', type: 'feedback', title: 'stated', body: 'From now on, always X.', recurrenceCount: 1 });
    const backend = classifierBackend([
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=high | Always does X in every project | source_fact_ids=[P-WGQAZFVC]',
    ]);

    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW });

    expect(r.action).toBe('promoted'); // high still promotes despite sum < threshold
    expect(r.promoted).toHaveLength(1);
  });

  it('151.3: a medium trait citing a HALLUCINATED id does not promote (the id resolves to 0)', async () => {
    seedUserTier();
    seedFact({ slug: 'feedback_e', id: 'P-WGQAZFVC', type: 'feedback', title: 'real', body: 'A real fact.', recurrenceCount: 9 });
    // Cites an id that is NOT in the corpus → contributes 0 → sum 0 → queue.
    const backend = classifierBackend([
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=medium | Invented trait | source_fact_ids=[P-ZZZZZZZZ]',
    ]);

    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW });

    expect(r.promoted).toHaveLength(0); // hallucinated citation cannot promote
    expect(r.queued.length).toBeGreaterThan(0);
  });

  it('151.3 Door 3: the corpus sent to the classifier carries the citable [P-...] id', async () => {
    // The cite-and-sum contract has TWO halves: the prompt asks for source_fact_ids
    // (pinned in buildClassifierInstructions tests) AND the corpus must actually
    // SHOW the ids so the classifier has something to cite. Pin that the id reaches
    // backend.compress's input on a real run — else a stripped corpus reopens Hole A
    // silently (every candidate cites nothing → recurrenceSum 0 → nothing promotes).
    seedUserTier();
    seedFact({ slug: 'feedback_f', id: 'P-WGQAZFVC', type: 'feedback', title: 'a habit', body: 'Did a thing.', recurrenceCount: 3 });
    let captured;
    const backend = classifierBackend([], { onCompress: (a) => { captured = a; } });
    await autoPersona({ projectRoot, userDir, backend, now: NOW });
    expect(captured.input).toContain('P-WGQAZFVC'); // the citation handle is in the input
  });

  it('151.3 + D-44: a DEMONSTRATED (medium) candidate on the TRANSCRIPT path does NOT promote (no factIndex → no recurrence route)', async () => {
    // The transcript path has no citable fact ids (empty factIndex), so a medium
    // candidate carries recurrenceSum 0 and can ONLY promote via confidence=high.
    // This guards the deliberate asymmetry: transcripts promote STATED rules, never
    // demonstrated ones via recurrence (which would regress D-44's precision).
    seedUserTier();
    seedTranscript({
      date: '2026-05-30',
      body: ['## 2026-05-30T11:00:00Z — user', 'i wrote tests first this whole session', ''].join('\n'),
    });
    const backend = classifierBackend([
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=medium | Works test-first | source_fact_ids=[P-WGQAZFVC]',
    ]);
    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW, source: 'transcript' });
    expect(r.promoted ?? []).toHaveLength(0); // medium + no factIndex → not promoted
  });

  it('source:"transcript" feeds the transcript window to the backend and promotes a high candidate (Door 2 + Door 3)', async () => {
    seedUserTier();
    seedTranscript({
      date: '2026-05-30',
      body: [
        '## 2026-05-30T11:00:00Z — user',
        'i want that from now on create .venv and use uv in every project',
        '',
      ].join('\n'),
    });
    let seen;
    const backend = classifierBackend(
      ['PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=high | Always uses uv + a project .venv, in every project'],
      { onCompress: (args) => { seen = args; } },
    );

    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW, source: 'transcript' });

    // Door 3 — the classifier received the TRANSCRIPT text + the conversation framing
    expect(seen.input).toMatch(/from now on create \.venv/);
    expect(seen.instructions).toMatch(/RECENT CONVERSATION/);
    // Door 1 + Door 2 — promoted, landed in the user tier
    expect(r.action).toBe('promoted');
    const habits = readFileSync(join(userDir, 'HABITS.md'), 'utf8');
    expect(habits).toMatch(/uv \+ a project \.venv/);
  });

  it('source:"transcript" with NO transcript skips cleanly without calling the backend', async () => {
    seedUserTier();
    let called = false;
    const backend = classifierBackend([], { onCompress: () => { called = true; } });
    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW, source: 'transcript' });
    expect(r.action).toBe('skipped');
    expect(r.reason).toBe('no-transcript');
    expect(called).toBe(false);
  });

  it('default source still classifies the fact corpus (backward compat)', async () => {
    seedUserTier();
    seedFact({ slug: 'feedback_x', id: 'P-WGQAZFVC', type: 'feedback', title: 'X', body: 'Across every project: do X.' });
    let seen;
    const backend = classifierBackend(
      ['PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=high | Does X across every project'],
      { onCompress: (args) => { seen = args; } },
    );
    const r = await autoPersona({ projectRoot, userDir, backend, now: NOW }); // no source param
    expect(seen.instructions).toMatch(/CAPTURED PROJECT FACTS/);
    expect(seen.input).toMatch(/do X/);
    expect(r.action).toBe('promoted');
  });
});

describe('Task 111 — facts-corpus cap + caller-supplied timeout (F-2)', () => {
  // Door 3 (external calls): the onCompress hook captures what autoPersona hands
  // the Haiku backend — the input it was bounded to + the timeout it was given.

  it('passes timeoutMs to the backend — 50s default (SessionEnd 60s ceiling), generous override for the ceiling-free CLI', async () => {
    seedFact({ slug: 'feedback_uv', id: 'P-BBBBBBBB', type: 'feedback', title: 'uv', body: 'I always use uv for python everywhere.' });
    let captured;
    const backend = classifierBackend([], { onCompress: (a) => { captured = a; } });
    await autoPersona({ projectRoot, userDir, backend, now: NOW });
    expect(captured.timeoutMs).toBe(50_000); // hook-path default (composes with the 60s ceiling)
    await autoPersona({ projectRoot, userDir, backend, now: NOW, cooldownMs: 0, timeoutMs: 120_000 });
    expect(captured.timeoutMs).toBe(120_000); // CLI / weekly override (no hook ceiling)
  });

  it('caps the facts corpus at PERSONA_CORPUS_BYTES so a large project cannot overload the prompt', async () => {
    // Seed more fact bytes than the cap (5 × ~21KB ≈ 108KB > 60KB).
    const big = 'lorem ipsum '.repeat(1800);
    ['P-BBBBBBBB', 'P-CCCCCCCC', 'P-DDDDDDDD', 'P-FFFFFFFF', 'P-GGGGGGGG'].forEach((id, i) =>
      seedFact({ slug: `feedback_big${i}`, id, type: 'feedback', title: `big ${i}`, body: big }),
    );
    let captured;
    const backend = classifierBackend([], { onCompress: (a) => { captured = a; } });
    await autoPersona({ projectRoot, userDir, backend, now: NOW, cooldownMs: 0 });
    // PERSONA_CORPUS_BYTES is a GUARD RAIL, not a byte-exact contract: the loop
    // keeps the accumulated *content* under budget, then appends the short
    // truncation marker — so the prompt is bounded "around" the cap, not exactly
    // ≤ it. Assert the real invariant: the unbounded ~108KB corpus was cut to
    // roughly the cap (a small marker allowance), and the truncation is marked.
    const bytes = Buffer.byteLength(captured.input, 'utf8');
    expect(bytes).toBeLessThan(PERSONA_CORPUS_BYTES + 1024); // bounded ≈ cap (+marker), NOT the ~108KB raw
    expect(bytes).toBeGreaterThan(PERSONA_CORPUS_BYTES / 2); // and it kept real content, not just the marker
    expect(captured.input).toContain('corpus truncated');
  });

  it('runPersonaGenerate gives the ceiling-free CLI command the generous 120s timeout', async () => {
    seedFact({ slug: 'feedback_uv', id: 'P-BBBBBBBB', type: 'feedback', title: 'uv', body: 'I always use uv.' });
    let captured;
    const backend = classifierBackend([], { onCompress: (a) => { captured = a; } });
    await runPersonaGenerate({ projectRoot, userDir, backend, log: () => {}, logError: () => {} });
    expect(captured.timeoutMs).toBe(120_000);
  });

  it('runPersonaGenerate surfaces a clear timeout hint, not a raw internal error', async () => {
    seedFact({ slug: 'feedback_uv', id: 'P-BBBBBBBB', type: 'feedback', title: 'uv', body: 'I always use uv.' });
    const errs = [];
    const timeoutBackend = {
      async compress() {
        throw new Error('HaikuViaAnthropicApi: claude --print did not return within 120000ms');
      },
    };
    await runPersonaGenerate({ projectRoot, userDir, backend: timeoutBackend, log: () => {}, logError: (m) => errs.push(m) });
    const out = errs.join('\n');
    expect(out).toMatch(/did not return within/); // underlying cause preserved
    expect(out).toMatch(/timed out|Re-run/); // …plus the actionable hint
  });
});

// ===========================================================================
// Task 151.3 — cite-and-sum recurrence gate (ADR-0016, D-230).
//
// The classifier CITES the project facts it synthesized a trait from
// (source_fact_ids=[…]); code resolves those ids against the corpus (rejecting
// hallucinated ids) and SUMS their real recurrence_count. That arithmetic sum
// — NOT phrasing, NOT an LLM count — gates promotion (sum ≥ PROMOTE_THRESHOLD).
// The explicit-imperative (confidence=high) fast-path-to-promote is preserved.
// 5/5 bridge-study systems: arithmetic counts + selects, the LLM never counts.
// ===========================================================================

describe('Task 151.3 — resolveRecurrenceSum (cite-and-sum gate arithmetic)', () => {
  it('sums the recurrence_count of the cited facts', () => {
    const factIndex = new Map([
      ['P-AAAAAAAA', 2],
      ['P-BBBBBBBB', 3],
      ['P-CCCCCCCC', 1],
    ]);
    const r = resolveRecurrenceSum({ sourceFactIds: ['P-AAAAAAAA', 'P-BBBBBBBB'], factIndex });
    expect(r.sum).toBe(5);
    expect(r.resolved).toEqual(['P-AAAAAAAA', 'P-BBBBBBBB']);
    expect(r.rejected).toEqual([]);
  });

  it('REJECTS hallucinated ids (not in the corpus) — they contribute 0', () => {
    const factIndex = new Map([['P-AAAAAAAA', 4]]);
    const r = resolveRecurrenceSum({
      sourceFactIds: ['P-AAAAAAAA', 'P-ZZZZZZZZ'], // second id never existed
      factIndex,
    });
    expect(r.sum).toBe(4); // only the real fact counts
    expect(r.resolved).toEqual(['P-AAAAAAAA']);
    expect(r.rejected).toEqual(['P-ZZZZZZZZ']);
  });

  it('no cited ids → sum 0 (a trait with no citation cannot pass the recurrence gate)', () => {
    const r = resolveRecurrenceSum({ sourceFactIds: [], factIndex: new Map([['P-AAAAAAAA', 9]]) });
    expect(r.sum).toBe(0);
    expect(r.resolved).toEqual([]);
  });

  it('a single fact whose own recurrence_count clears the threshold gates on its own', () => {
    const factIndex = new Map([['P-AAAAAAAA', PROMOTE_THRESHOLD]]);
    const r = resolveRecurrenceSum({ sourceFactIds: ['P-AAAAAAAA'], factIndex });
    expect(r.sum).toBe(PROMOTE_THRESHOLD);
  });

  it('deduplicates a repeated cited id (a fact cited twice is counted once)', () => {
    const factIndex = new Map([['P-AAAAAAAA', 2]]);
    const r = resolveRecurrenceSum({ sourceFactIds: ['P-AAAAAAAA', 'P-AAAAAAAA'], factIndex });
    expect(r.sum).toBe(2); // counted once, not 4
    expect(r.resolved).toEqual(['P-AAAAAAAA']);
  });

  it('resolves a LOWERCASE id echo (canonical ids are uppercase; tolerate sloppy LLM casing)', () => {
    // The classifier was told "copy EXACTLY", but Haiku occasionally lowercases.
    // The parser upper-cases on the way in, so the Map lookup must still hit.
    const out = parsePersonaCandidates(
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=medium | A trait | source_fact_ids=[p-aaaaaaaa]',
    );
    expect(out[0].sourceFactIds).toEqual(['P-AAAAAAAA']); // normalized
    const r = resolveRecurrenceSum({ sourceFactIds: out[0].sourceFactIds, factIndex: new Map([['P-AAAAAAAA', 5]]) });
    expect(r.sum).toBe(5);
  });

  it('tolerates a missing/garbage factIndex (no throw — defensive)', () => {
    expect(resolveRecurrenceSum({ sourceFactIds: ['P-AAAAAAAA'] }).sum).toBe(0);
    expect(resolveRecurrenceSum({}).sum).toBe(0);
  });
});

describe('Task 151.3 — parsePersonaCandidates extracts source_fact_ids', () => {
  it('peels the source_fact_ids citation off the line, leaving clean text', () => {
    const out = parsePersonaCandidates(
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=medium | Batches commits across surveys | source_fact_ids=[P-AAAAAAAA, P-BBBBBBBB]',
    );
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('Batches commits across surveys'); // ids stripped, not in the restatement
    expect(out[0].sourceFactIds).toEqual(['P-AAAAAAAA', 'P-BBBBBBBB']);
    expect(out[0].confidence).toBe('medium');
  });

  it('a line WITHOUT the citation still parses (back-compat) with empty sourceFactIds', () => {
    const out = parsePersonaCandidates(
      'PERSONA CANDIDATE | target=USER.md | section=Preferences | confidence=high | Prefers automation over rituals',
    );
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('Prefers automation over rituals');
    expect(out[0].sourceFactIds).toEqual([]);
  });

  it('handles an empty citation list (source_fact_ids=[]) → empty array, clean text', () => {
    const out = parsePersonaCandidates(
      'PERSONA CANDIDATE | target=LESSONS.md | section=Process Lessons | confidence=medium | Some lesson | source_fact_ids=[]',
    );
    expect(out[0].text).toBe('Some lesson');
    expect(out[0].sourceFactIds).toEqual([]);
  });
});

describe('Task 151.3 — assembleProjectCorpus exposes fact ids + a recurrence index', () => {
  it('returns {corpus, factIndex}; the corpus shows each fact id so the classifier can cite it', () => {
    seedFact({ slug: 'feedback_uv', id: 'P-AAAAAAAA', type: 'feedback', title: 'uv', body: 'I always use uv.', recurrenceCount: 4 });
    seedFact({ slug: 'feedback_terse', id: 'P-BBBBBBBB', type: 'feedback', title: 'terse', body: 'Be terse.', recurrenceCount: 2 });
    const { corpus, factIndex } = assembleProjectCorpus({ projectRoot, userDir });
    // The corpus must surface the citation handle (the id) next to each fact.
    expect(corpus).toContain('P-AAAAAAAA');
    expect(corpus).toContain('P-BBBBBBBB');
    expect(corpus).toContain('I always use uv.'); // body still present
    // The index carries the REAL recurrence_count for cite-and-sum.
    expect(factIndex.get('P-AAAAAAAA')).toBe(4);
    expect(factIndex.get('P-BBBBBBBB')).toBe(2);
  });

  it('a fact with no recurrence_count frontmatter defaults to 1 in the index', () => {
    seedFact({ slug: 'feedback_x', id: 'P-CCCCCCCC', type: 'feedback', title: 'x', body: 'A fact.' }); // no recurrenceCount
    const { factIndex } = assembleProjectCorpus({ projectRoot, userDir });
    expect(factIndex.get('P-CCCCCCCC')).toBe(1);
  });

  it('no facts → empty corpus string + empty index', () => {
    const { corpus, factIndex } = assembleProjectCorpus({ projectRoot, userDir });
    expect(corpus).toBe('');
    expect(factIndex.size).toBe(0);
  });
});
