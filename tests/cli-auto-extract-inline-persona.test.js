// @doors: 1, 2, 4
// Door 3 N/A: the single Haiku call is mocked here; the "no second LLM call"
//   guarantee (Door 3 — exactly ONE backend.compress) is asserted via the
//   mock's call count below, and the real-binary side stays in the main
//   cli-auto-extract spawn-smoke.
// Door 5 N/A: no message queue.
//
// CONTRACT for Task 61 — inline cross-project promotion (auto-persona fires
// at capture time, not weekly). Written test-first (was RED until 61.2/61.3
// landed). The contract it locks:
//
//   When auto-extract's backend emits a `PERSONA CANDIDATE | target=… | …` line
//   (the exact format auto-persona.mjs already parses) alongside the normal
//   TRUST_X lines, AND runAutoExtract is given a `userDir`, the cross-project
//   fact is promoted to the USER tier THIS RUN — while project-specific facts
//   still route to the project MEMORY.md, and existing user-tier facts are
//   left untouched (over-mutation guard).
//
// Design + sub-tasks: specs/tasks.md Task 61. Reuses auto-persona's
// buildClassifierInstructions + PERSONA_CANDIDATE_RE + promote-to-user-tier path.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAutoExtract, buildExtractionInstructions } from '../packages/cli/src/auto-extract.mjs';
import { buildClassifierInstructions, PERSONA_CONFIDENCE_RULE } from '../packages/cli/src/auto-persona.mjs';
import { install } from '../packages/cli/src/install.mjs';

// Mirrors the mockBackend in cli-auto-extract.test.js: compress() returns the
// given lines verbatim as outputText so we control exactly what Haiku "emits".
// `.calls` counts invocations — Door 3 guarantee that inline promotion reuses
// the SAME Haiku call (no second LLM round-trip).
function mockBackend(...lines) {
  const backend = {
    calls: 0,
    modelId: () => 'mock',
    async compress() { backend.calls++; return { outputText: lines.join('\n') }; },
  };
  return backend;
}

// Read all NDJSON extract.log entries for the given ISO date under projectRoot.
function readExtractLog(projectRoot, date) {
  const p = join(projectRoot, 'context', 'sessions', `${date}.extract.log`);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function writeTurnFile(projectRoot, content) {
  const p = join(projectRoot, 'context', 'transcripts', `.extract-${Date.now()}.tmp`);
  writeFileSync(p, content, 'utf8');
  return p;
}

// Recursively check whether any markdown file under `dir` contains `needle`.
function treeContains(dir, needle) {
  if (!existsSync(dir)) return false;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (treeContains(p, needle)) return true; }
    else if (e.name.endsWith('.md') && readFileSync(p, 'utf8').includes(needle)) return true;
  }
  return false;
}

describe('Task 61 — inline cross-project promotion', () => {
  let sandbox, projectRoot, userDir;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-inline-persona-'));
    projectRoot = join(sandbox, 'proj');
    userDir = join(sandbox, 'user');
    // Scaffold the project tier from the kit's own installer.
    install({ projectRoot, userDir });
    // Scaffold the user-tier scratchpads with their real section headings
    // (the promotion targets a section that must exist) — mirrors the
    // cli-auto-persona.test.js setup.
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, 'USER.md'), '# User\n\n## About\n\n## Preferences\n\n## Working Style\n', 'utf8');
    writeFileSync(join(userDir, 'HABITS.md'), '# Habits\n\n## Iteration Cadence\n\n## Destructive Operations\n\n## Communication Style\n', 'utf8');
    writeFileSync(join(userDir, 'LESSONS.md'), '# Lessons\n\n## Tooling Lessons\n\n## Process Lessons\n\n## Anti-patterns\n', 'utf8');
  });
  afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

  it('promotes a cross-project PERSONA CANDIDATE to the user tier THIS run; project fact stays in project tier', async () => {
    const turnFile = writeTurnFile(
      projectRoot,
      'USER_TURN:\nwe use Postgres here, and btw I always use pnpm not npm in every project\n\nASSISTANT_TURN:\nnoted',
    );

    const backend = mockBackend(
      'TRUST_HIGH user:this project uses Postgres',
      'PERSONA CANDIDATE | target=HABITS.md | section=Communication Style | confidence=high | Always uses pnpm, never npm',
    );
    const r = await runAutoExtract({
      turnFile,
      projectRoot,
      userDir, // ← Task 61: runAutoExtract must accept userDir
      haikuBackend: backend,
      now: '2026-05-31T10:00:00Z',
    });

    // Door 1 — the run reports a promotion happened, and surfaces the
    // user-tier persona result on the return struct.
    expect(r.action).toBe('extracted');
    expect(r.persona).toBeTruthy();
    expect(r.persona.promoted.map((p) => p.text)).toContain('Always uses pnpm, never npm');

    // Door 3 — exactly ONE Haiku call: the inline persona promotion reuses
    // the same extraction output, no second LLM round-trip.
    expect(backend.calls).toBe(1);

    // Door 2a — project-specific fact landed in the PROJECT tier.
    const projMemory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(projMemory).toContain('Postgres');

    // Door 2b — the cross-project doctrine landed in the USER tier, THIS run
    // (not waiting for the weekly pass). This is the whole point of Task 61.
    expect(treeContains(userDir, 'pnpm')).toBe(true);

    // Over-mutation guard — the project MEMORY.md must NOT contain the
    // cross-project bullet (it went to the user tier, not duplicated here).
    expect(projMemory).not.toContain('pnpm');

    // Door 4 — the extract.log entry records the inline promotion count.
    const entries = readExtractLog(projectRoot, '2026-05-31');
    const extracted = entries.find((e) => e.observation_count >= 1);
    expect(extracted).toBeTruthy();
    expect(extracted.persona_promoted).toBe(1);
  });

  it('persona-only turn: no project fact, but cross-project doctrine still promotes this run (action=extracted, persona surfaced)', async () => {
    const turnFile = writeTurnFile(
      projectRoot,
      'USER_TURN:\nfrom now on, in every project, always run the linter before committing\n\nASSISTANT_TURN:\nunderstood',
    );

    const backend = mockBackend(
      'SKIP',
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=high | Always run the linter before committing, in every project',
    );
    const r = await runAutoExtract({
      turnFile,
      projectRoot,
      userDir,
      haikuBackend: backend,
      now: '2026-05-31T11:00:00Z',
    });

    // Door 1 — even with zero project candidates, a landed persona promotion
    // is a durable extraction (NOT skipped/nothing_durable).
    expect(r.action).toBe('extracted');
    expect(r.observation_count).toBe(0);
    expect(r.persona.promoted).toHaveLength(1);

    // Door 2 — it reached the user tier.
    expect(treeContains(userDir, 'linter before committing')).toBe(true);

    // Door 4 — log entry reflects the promotion.
    const entries = readExtractLog(projectRoot, '2026-05-31');
    const withPersona = entries.find((e) => e.persona_promoted === 1);
    expect(withPersona).toBeTruthy();
  });

  it('no userDir → no inline promotion attempted (back-compat: project extraction unaffected)', async () => {
    const turnFile = writeTurnFile(
      projectRoot,
      'USER_TURN:\nwe use Postgres here, and I always use pnpm everywhere\n\nASSISTANT_TURN:\nnoted',
    );
    const r = await runAutoExtract({
      turnFile,
      projectRoot,
      // no userDir
      haikuBackend: mockBackend(
        'TRUST_HIGH user:this project uses Postgres',
        'PERSONA CANDIDATE | target=HABITS.md | section=Communication Style | confidence=high | Always uses pnpm, never npm',
      ),
      now: '2026-05-31T12:00:00Z',
    });

    expect(r.action).toBe('extracted');
    expect(r.persona).toBeNull();
    const projMemory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(projMemory).toContain('Postgres');
    // Nothing promoted to the user tier (no userDir given this run).
    expect(treeContains(userDir, 'pnpm')).toBe(false);
  });

  // --- Task 78 — the wedge's AUTO half: explicit (high) promotes durably; ----
  // --- inferred (medium) queues for review. -----------------------------------

  it('both persona prompts carry the SAME explicit-vs-inferred grading rule (drift guard, Task 78)', () => {
    // The grading rule lives in ONE shared constant so the inline (auto-extract)
    // and weekly (classifier) prompts can't drift. Both prompts must include it,
    // and it must actually encode the stated-vs-observed distinction (the D-30
    // fix: an explicitly-stated rule grades high → promotes; inferred → medium).
    expect(PERSONA_CONFIDENCE_RULE).toMatch(/EXPLICITLY STATED/);
    expect(PERSONA_CONFIDENCE_RULE).toMatch(/INFERRING/);
    expect(buildClassifierInstructions()).toContain(PERSONA_CONFIDENCE_RULE);
    expect(buildExtractionInstructions()).toContain(PERSONA_CONFIDENCE_RULE);
  });

  it('the extraction prompt directs capture of the ENV/config-fact CLASS by its recall property, not by example (Task 80 / 80b)', () => {
    // lior-test-5: env/config facts (the port, the SDK version) were never
    // captured (Environment Notes stayed empty), so Session-2 recall re-read
    // config.py. The trigger must name the CLASS — concrete config the next
    // session would otherwise re-read the code to recover — and direct capture
    // from the WORK, not only stated preferences.
    //
    // 80b / D-36: assert the general DIRECTIVE, not a literal example value.
    // The old test matched /port 8000/ — tautological (it only checked the
    // example string I typed was still present, asserting nothing about
    // behavior) AND it anchored the prompt on the scenario's own values. The
    // prompt now defines the class by property and names NO example values, so
    // the scenario's literals must be ABSENT.
    const prompt = buildExtractionInstructions();
    expect(prompt).toMatch(/setup \/ configuration facts/i); // the class is named
    expect(prompt).toMatch(/re-derive/i);                    // defined by recall property
    expect(prompt).toMatch(/from the WORK/i);                // capture-from-work directive
    // No scenario-specific example values leaked back in (the over-fit guard):
    expect(prompt).not.toMatch(/port 8000/);
    expect(prompt).not.toMatch(/claude-agent-sdk/);
    expect(prompt).not.toMatch(/Python 3\.13/);
    // Domain-neutral: the kit serves non-coding work too — no "code" assumption (D-36).
    expect(prompt).not.toMatch(/re-read the code|code re-read/i);
  });

  it('the persona-candidate instruction is REQUIRED + PER-FACT (Task 86 — multi-rule turns must emit one line per rule)', () => {
    // lior-test-8: a turn bundling several universal rules ("type hints AND
    // tests first", "uv, ruff, secrets") promoted ZERO to the persona — Haiku
    // dropped the trailing singular "emit one ADDITIONAL line" addendum under
    // load (extract.log: obs=3 -> persona_promoted:0). The parser + promote
    // path were correct (both loop over all candidates); the prompt was the
    // weak link. The instruction must be REQUIRED and PER-FACT so several rules
    // in one turn each get their own line. Live-verified: the rewritten prompt
    // emits 3/3 candidates for a 3-rule turn across repeated real-Haiku runs.
    const prompt = buildExtractionInstructions();
    expect(prompt).toMatch(/per-fact/i);                       // explicitly per-fact
    expect(prompt).toMatch(/required/i);                       // not an optional addendum
    expect(prompt).toMatch(/for each/i);                       // one per cross-project fact
    expect(prompt).toMatch(/three|never skip|never collapse/i); // multi-rule emphasis
  });

  it('an EXPLICITLY-stated rule (confidence=high) promotes at trust:high — durable, user-attested (Task 78)', async () => {
    const turnFile = writeTurnFile(
      projectRoot,
      'USER_TURN:\nfrom now on, in every project, always squash-merge\n\nASSISTANT_TURN:\nok',
    );
    const backend = mockBackend(
      'PERSONA CANDIDATE | target=HABITS.md | section=Iteration Cadence | confidence=high | Always squash-merge, in every project',
    );
    const r = await runAutoExtract({
      turnFile, projectRoot, userDir, haikuBackend: backend, now: '2026-05-31T13:00:00Z',
    });

    expect(r.action).toBe('extracted');
    expect(r.persona.promoted).toHaveLength(1);

    // Door 2 — the bullet landed in the user tier AND its provenance is
    // trust:high (an explicit statement is user-attested → won't be aged out /
    // clobbered by a later inferred-medium entry). This is the durability the
    // wedge needs: medium would let the persona decay like a guess.
    const habits = readFileSync(join(userDir, 'HABITS.md'), 'utf8');
    expect(habits).toMatch(/Always squash-merge[^\n]*\n\s*<!--[^>]*trust: high/);
    // And the provenance marks it user-explicit (not system-synthesis).
    expect(habits).toMatch(/Always squash-merge[^\n]*\n\s*<!--[^>]*user-explicit/);
  });

  it('an INFERRED preference (confidence=medium) queues for review — does NOT land in the persona scratchpad (Task 78)', async () => {
    const turnFile = writeTurnFile(
      projectRoot,
      'USER_TURN:\n(used tabs throughout the session, never said anything about it)\n\nASSISTANT_TURN:\nok',
    );
    const backend = mockBackend(
      'PERSONA CANDIDATE | target=HABITS.md | section=Communication Style | confidence=medium | Seems to prefer tabs over spaces',
    );
    const r = await runAutoExtract({
      turnFile, projectRoot, userDir, haikuBackend: backend, now: '2026-05-31T14:00:00Z',
    });

    // Door 1 — not promoted; queued for review.
    expect(r.persona.promoted).toHaveLength(0);
    expect(r.persona.queued.length).toBeGreaterThanOrEqual(1);

    // Door 2 — it is durably parked in the review queue, NOT written into the
    // persona scratchpad (an inference must be confirmed before it shapes the
    // cross-project persona).
    const habits = readFileSync(join(userDir, 'HABITS.md'), 'utf8');
    expect(habits).not.toContain('tabs over spaces');
    const reviewQueue = readFileSync(join(userDir, 'queues', 'persona-review.md'), 'utf8');
    expect(reviewQueue).toContain('tabs over spaces');
  });
});
