// @doors: 1, 2
// Door 3 N/A: routing calls installAction + installAgent in-process; no spawn.
// Door 4 N/A: the install summary is logged via injected loggers (asserted via
//   Door 1), no NDJSON/audit surface here.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50.F — `cmk install --ide <agent>` routing (the glue in
// runInstall that dispatches a non-Claude-Code agent to installAgent).
//
// Asserts: default claude-code is unchanged (no .kiro), --ide kiro wires the
// agent's legs end-to-end, and an unknown agent fails friendly (exit 2).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInstall } from '../packages/cli/src/subcommands.mjs';

let sandbox;
let projectRoot;
let userTier;
let logs;
let errs;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-ide-routing-'));
  projectRoot = join(sandbox, 'proj');
  userTier = join(sandbox, 'user');
  mkdirSync(projectRoot, { recursive: true });
  logs = [];
  errs = [];
  process.exitCode = 0;
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
  process.exitCode = 0;
});

const opts = (extra) => ({
  cwd: projectRoot,
  userTier,
  semantic: false, // --no-semantic, keep the test offline + fast
  bindingProbe: () => ({ ok: true }), // skip the native-binding ask
  log: (m) => logs.push(m),
  logError: (m) => errs.push(m),
  ...extra,
});

describe('Task 50.F — cmk install --ide routing', () => {
  it('default (no --ide) takes the claude-code path: no .kiro, context/ scaffolded', async () => {
    await runInstall(opts({ hooks: false }));
    expect(existsSync(join(projectRoot, '.kiro'))).toBe(false);
    expect(existsSync(join(projectRoot, 'context', 'MEMORY.md'))).toBe(true);
  });

  it('--ide kiro wires the agent legs end-to-end in one call', async () => {
    await runInstall(opts({ ide: 'kiro' }));

    // Door 2 — State: all three Kiro legs landed
    expect(existsSync(join(projectRoot, '.kiro', 'settings', 'mcp.json'))).toBe(true);
    expect(existsSync(join(projectRoot, '.kiro', 'agents', 'cmk.json'))).toBe(true);
    expect(existsSync(join(projectRoot, '.kiro', 'steering', 'claude-memory-kit.md'))).toBe(true);
    // the agent-neutral scaffold also ran
    expect(existsSync(join(projectRoot, 'context', 'MEMORY.md'))).toBe(true);

    // Door 1 — Response: success message names the agent
    expect(logs.join('\n')).toMatch(/ready for Kiro/i);
    expect(process.exitCode).not.toBe(1);
  });

  it('an unknown --ide fails friendly with exit 2 and a supported list', async () => {
    await runInstall(opts({ ide: 'made-up-agent' }));
    expect(process.exitCode).toBe(2);
    expect(errs.join('\n')).toMatch(/unknown --ide 'made-up-agent'/);
    expect(errs.join('\n')).toMatch(/claude-code, kiro/);
    // nothing wired
    expect(existsSync(join(projectRoot, '.kiro'))).toBe(false);
  });
});
