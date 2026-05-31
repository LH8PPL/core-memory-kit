// @doors: 1, 2
// Door 3 N/A: the single Haiku call is mocked here; the "no second LLM call"
//   guarantee (Door 3) is pinned in the main cli-auto-extract spawn-smoke when
//   Task 61 lands — see tasks.md 61.4.
// Door 4 N/A: extract.log observability for the inline promotion is added with
//   the implementation (61.4); this file pins the routing contract (Doors 1+2).
// Door 5 N/A: no message queue.
//
// TDD CONTRACT for Task 61 — inline cross-project promotion (auto-persona fires
// at capture time, not weekly). This test is RED until Task 61 is implemented;
// that is intentional (test-first). The contract it locks:
//
//   When auto-extract's backend emits a `PERSONA CANDIDATE | target=… | …` line
//   (the exact format auto-persona.mjs already parses) alongside the normal
//   TRUST_X lines, AND runAutoExtract is given a `userDir`, the cross-project
//   fact is promoted to the USER tier THIS RUN — while project-specific facts
//   still route to the project MEMORY.md, and existing user-tier facts are
//   left untouched (over-mutation guard).
//
// Design + sub-tasks: specs/v0.1.0/tasks.md Task 61. Reuses auto-persona's
// buildClassifierInstructions + PERSONA_CANDIDATE_RE + promote-to-user-tier path.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAutoExtract } from '../packages/cli/src/auto-extract.mjs';
import { install } from '../packages/cli/src/install.mjs';

// Mirrors the mockBackend in cli-auto-extract.test.js: compress() returns the
// given lines verbatim as outputText so we control exactly what Haiku "emits".
function mockBackend(...lines) {
  return { modelId: () => 'mock', async compress() { return { outputText: lines.join('\n') }; } };
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

describe('Task 61 — inline cross-project promotion (TDD: RED until implemented)', () => {
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

    const r = await runAutoExtract({
      turnFile,
      projectRoot,
      userDir, // ← Task 61: runAutoExtract must accept userDir
      haikuBackend: mockBackend(
        'TRUST_HIGH user:this project uses Postgres',
        'PERSONA CANDIDATE | target=HABITS.md | section=Communication Style | confidence=high | Always uses pnpm, never npm',
      ),
      now: '2026-05-31T10:00:00Z',
    });

    // Door 1 — the run reports a promotion happened.
    expect(r.action).toBe('extracted');

    // Door 2a — project-specific fact landed in the PROJECT tier.
    const projMemory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(projMemory).toContain('Postgres');

    // Door 2b — the cross-project doctrine landed in the USER tier, THIS run
    // (not waiting for the weekly pass). This is the whole point of Task 61.
    expect(treeContains(userDir, 'pnpm')).toBe(true);

    // Over-mutation guard — the project MEMORY.md must NOT contain the
    // cross-project bullet (it went to the user tier, not duplicated here).
    expect(projMemory).not.toContain('pnpm');
  });
});
