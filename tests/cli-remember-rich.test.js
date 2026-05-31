// @doors: 1, 2
// Door 3 N/A: no subprocess. Door 4: writeFact's audit entry is covered by
//   cli-write-fact.test.js. Door 5 N/A.
//
// Task 63 (F1) — restore RICH capture through the safe path. The v0.1.2 fix
// routed all captures through `cmk remember` → terse one-line MEMORY.md bullets
// (to stop the v0.1.1 username-leak + wrong-schema fact files). This lost the
// rich, agent-authored fact files (Why/How/links) that made the kit better
// than native. The fix: `cmk remember` rich mode writes a real granular fact
// file via writeFact() — which ALREADY sanitizes home paths + runs Poison_Guard
// + uses the correct schema. Best of both: v0.1.1 richness, v0.1.2 safety.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { runRememberRich } from '../packages/cli/src/subcommands.mjs';

function factFiles(projectRoot) {
  const dir = join(projectRoot, 'context', 'memory');
  return readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'INDEX.md');
}

describe('Task 63 — cmk remember rich mode (restore rich capture through the safe path)', () => {
  let root, projectRoot;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cmk-remember-rich-'));
    projectRoot = join(root, 'proj');
    mkdirSync(join(projectRoot, 'context', 'memory'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('writes a granular FACT FILE with Why + How (not a terse MEMORY.md bullet)', () => {
    const out = [];
    const r = runRememberRich(
      'FastAPI is the delivery layer; thin routes, business logic in services, data access in repositories',
      {
        type: 'feedback',
        title: 'layered-backend-architecture',
        why: 'pay the structure cost up front rather than fight a tangled app later',
        how: 'default to app/{api,services,repositories,schemas}; push logic out of routes',
      },
      { projectRoot, log: (m) => out.push(m), logError: (m) => out.push('ERR: ' + m) },
    );

    // Door 1 — created, surfaced to the user.
    expect(r.action).toBe('created');
    expect(out.join('\n')).toMatch(/saved rich fact/i);

    // Door 2 — a real fact file landed under context/memory/ with the v0.1.1 shape.
    const files = factFiles(projectRoot);
    expect(files).toHaveLength(1);
    const content = readFileSync(join(projectRoot, 'context', 'memory', files[0]), 'utf8');
    expect(content).toMatch(/type: feedback/);
    expect(content).toMatch(/trust: high/);
    expect(content).toContain('**Why:**');
    expect(content).toContain('**How to apply:**');
    expect(content).toContain('business logic in services');
  });

  it('sanitizes home paths in the rich fact — the v0.1.2 leak guard still holds', () => {
    const home = homedir();
    runRememberRich(
      `always invoke the interpreter at ${join(home, 'proj', '.venv', 'Scripts', 'python.exe')}`,
      { type: 'feedback', title: 'venv-python', why: 'pip and python were split across interpreters' },
      { projectRoot, log: () => {}, logError: () => {} },
    );
    const content = readFileSync(join(projectRoot, 'context', 'memory', factFiles(projectRoot)[0]), 'utf8');
    expect(content).not.toContain(home); // abstracted to ~
    expect(content).toContain('~');
  });

  it('errors (no file) when Poison_Guard rejects a secret', () => {
    const out = [];
    const r = runRememberRich(
      'the prod key is sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      { type: 'reference', title: 'prod-key' },
      { projectRoot, log: () => {}, logError: (m) => out.push(m) },
    );
    expect(r.action).toBe('error');
    expect(factFiles(projectRoot)).toHaveLength(0);
    expect(out.join('\n')).toMatch(/cmk remember:/);
  });
});
