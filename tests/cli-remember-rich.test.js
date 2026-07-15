// @doors: 1, 2
// Door 3 N/A: no subprocess spawned by runRememberRich.
// Door 4 N/A: no message queue at this boundary.
// Door 5 N/A: writeFact's audit-log append is covered by cli-write-fact.test.js.
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
    // Task 231: rich-path errors now set process.exitCode = 2 in-process —
    // reset so a rejection in one test can't leak exit state to the runner
    // or to a later test (the cli-remember-input.test.js convention).
    process.exitCode = 0;
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    process.exitCode = 0;
  });

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

  it('Task 66.1/66.3 — --shape and --expires land in the fact frontmatter (the explicit temporal writer)', () => {
    const r = runRememberRich(
      'demo to the team is scheduled for Friday',
      { title: 'team-demo-friday', shape: 'Plan', expires: '2026-07-04' },
      { projectRoot, log: () => {}, logError: () => {} },
    );
    expect(r.action).toBe('created');
    const content = readFileSync(join(projectRoot, 'context', 'memory', factFiles(projectRoot)[0]), 'utf8');
    expect(content).toMatch(/^shape: Plan$/m);
    expect(content).toMatch(/^expires_at: ["']?2026-07-04["']?$/m);
  });

  it('Task 66.3 — an invalid --expires errors loudly (strict explicit surface), no file written', () => {
    const out = [];
    const r = runRememberRich(
      'demo soon',
      { title: 'demo-soon', expires: 'next tuesday' },
      { projectRoot, log: () => {}, logError: (m) => out.push(m) },
    );
    expect(r.action).toBe('error');
    expect(factFiles(projectRoot)).toHaveLength(0);
    expect(out.join('\n')).toMatch(/expiresAt/);
  });

  it('keeps INDEX.md current on capture — no manual `cmk reindex` needed (Task 85)', () => {
    // Bug A (live-test-7 2026-06-03): cmk remember wrote the fact file but left
    // INDEX.md stale, so `cmk doctor` HC-5 failed until a manual `cmk reindex`.
    // Capture must leave the index consistent from the first write.
    runRememberRich(
      'Pin exact dependency versions; never floating ranges',
      { type: 'feedback', title: 'pin-exact-versions', why: 'reproducible builds', how: 'use == not >=' },
      { projectRoot, log: () => {}, logError: () => {} },
    );
    const files = factFiles(projectRoot);
    expect(files).toHaveLength(1);
    const indexPath = join(projectRoot, 'context', 'memory', 'INDEX.md');
    const index = readFileSync(indexPath, 'utf8');
    // The INDEX must reference the real fact filename as a markdown link target.
    expect(index).toContain(`(${files[0]})`);
    expect(index).toContain('## Files');
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

  it('a non-P --tier notes it and still captures to P (M2 — no silent forcing)', () => {
    const out = [];
    const r = runRememberRich(
      'cross-project preference about terse responses',
      { why: 'reads faster', tier: 'U' },
      { projectRoot, log: (m) => out.push(m), logError: (m) => out.push('ERR: ' + m) },
    );
    expect(r.action).toBe('created'); // captured, not refused
    expect(out.join('\n')).toMatch(/tier 'U' is not a direct write target|promote/); // surfaced, not silent
  });

  it('a second capture of the SAME content is skipped as duplicate (Door 1 + 2)', () => {
    const args = ['we deploy with kamal to hetzner', { type: 'feedback', title: 'deploy-target', why: 'simple + cheap' }];
    const first = runRememberRich(...args, { projectRoot, log: () => {} });
    expect(first.action).toBe('created');
    const out = [];
    const second = runRememberRich(...args, { projectRoot, log: (m) => out.push(m) });
    expect(second.action).toBe('skipped');
    expect(out.join('\n')).toMatch(/already captured/);
    expect(factFiles(projectRoot)).toHaveLength(1); // no duplicate file
  });

  it('same title + DIFFERENT content → collision with an actionable message (M1)', () => {
    runRememberRich('first content', { title: 'shared-title', why: 'a' }, { projectRoot, log: () => {} });
    const out = [];
    const r = runRememberRich(
      'totally different content', { title: 'shared-title', why: 'b' },
      { projectRoot, log: () => {}, logError: (m) => out.push(m) },
    );
    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('collision');
    expect(out.join('\n')).toMatch(/already exists with different content/);
    expect(out.join('\n')).toMatch(/new --title/);
  });

  it('an all-punctuation title falls back to a valid slug (slugifyFact guard)', () => {
    const r = runRememberRich('a fact with a junk title', { title: '!!! @@@ ###', why: 'x' }, { projectRoot, log: () => {} });
    expect(r.action).toBe('created');
    expect(factFiles(projectRoot)).toContain('feedback_fact.md'); // slug fell back to 'fact'
  });

  it('rich capture with neither --why nor --how writes a plain typed fact (no Why/How blocks)', () => {
    runRememberRich('FastAPI on port 8000 for this project', { type: 'project', title: 'env-port' }, { projectRoot, log: () => {} });
    const content = readFileSync(join(projectRoot, 'context', 'memory', 'project_env-port.md'), 'utf8');
    expect(content).toContain('FastAPI on port 8000');
    expect(content).not.toContain('**Why:**');
    expect(content).not.toContain('**How to apply:**');
  });
});
