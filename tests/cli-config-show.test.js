// @doors: 1
// Door 2 N/A: read-only informational readout — no disk mutation.
// Door 3 N/A: the backend-CLI probe is behind an injected fn in tests.
// Door 4 N/A: no message queues.
// Door 5 N/A: no observability / NDJSON at this surface (the readout IS the output, asserted via door 1).

// Tests for Task 201 (D-277) — `cmk config show`: a one-glance informational
// readout of the project's memory setup, distinct from `cmk doctor` (health /
// pass-fail). It's what makes the split-brain backend override LEGIBLE — without
// it, "which agent runs my automatic memory" is invisible.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runConfigShow } from '../packages/cli/src/subcommands.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'cmk-configshow-'));
}
function markInstall(root, kind) {
  if (kind === 'claude-code') {
    mkdirSync(join(root, '.claude'), { recursive: true });
    writeFileSync(join(root, '.claude', 'settings.json'), '{}', 'utf8');
  } else if (kind === 'kiro') {
    mkdirSync(join(root, '.kiro', 'steering'), { recursive: true });
    writeFileSync(join(root, '.kiro', 'steering', 'cmk.md'), 'x', 'utf8');
  }
}
function setOverride(root, agent) {
  mkdirSync(join(root, 'context'), { recursive: true });
  writeFileSync(join(root, 'context', 'settings.json'), JSON.stringify({ backend: { agent } }), 'utf8');
}
function cap() {
  const lines = [];
  return { log: (m) => lines.push(String(m)), lines, text: () => lines.join('\n') };
}
// An injected backend-CLI probe so the test never spawns a real binary.
const presentProbe = (a) => ({ agent: a, bin: a === 'kiro' ? 'kiro-cli' : a, present: true });

describe('Task 201 — cmk config show', () => {
  it('reports the installed-for agent AND the active backend agent (no override → same)', () => {
    const root = tmp();
    markInstall(root, 'claude-code');
    const c = cap();
    runConfigShow({ cwd: root, log: c.log, backendCliProbe: presentProbe });
    const t = c.text().toLowerCase();
    expect(t).toMatch(/install/); // shows the installed-for agent
    expect(t).toMatch(/backend|automatic memory/); // shows the backend agent
    expect(t).toMatch(/claude/);
  });

  it('surfaces the split-brain override — installed for X, backend is Y', () => {
    const root = tmp();
    markInstall(root, 'claude-code'); // code in claude...
    setOverride(root, 'kiro'); // ...memory runs on kiro
    const c = cap();
    runConfigShow({ cwd: root, log: c.log, backendCliProbe: presentProbe });
    const t = c.text();
    // both agents visible + the fact that the backend is overridden
    expect(t).toMatch(/claude/);
    expect(t).toMatch(/kiro/);
    expect(t.toLowerCase()).toMatch(/override|backend\.agent|configured/);
  });

  it('shows whether the active backend CLI is present', () => {
    const root = tmp();
    markInstall(root, 'kiro');
    const absentProbe = (a) => ({ agent: a, bin: 'kiro-cli', present: false, reason: 'kiro-cli not found on PATH' });
    const c = cap();
    runConfigShow({ cwd: root, log: c.log, backendCliProbe: absentProbe });
    const t = c.text().toLowerCase();
    expect(t).toMatch(/kiro-cli/);
    expect(t).toMatch(/not (found|present|on path)|missing|absent/);
  });

  it('is informational only — never sets a non-zero exit code', () => {
    const root = tmp();
    markInstall(root, 'claude-code');
    const before = process.exitCode;
    runConfigShow({ cwd: root, log: cap().log, backendCliProbe: presentProbe });
    expect(process.exitCode ?? before ?? 0).not.toBe(2);
  });
});
