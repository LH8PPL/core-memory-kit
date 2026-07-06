// @doors: 1
// Door 2 N/A: the helper only emits to the log sink — no disk mutation.
// Door 3 N/A: external services / the CLI spawn is behind an injected probe.
// Door 4 N/A: no message queues.
// Door 5 N/A: the "observability" here IS the user-facing log line asserted below.

// Tests for Task 200 (D-272/D-277) — warnMissingBackendCli: the first-touch
// heads-up cmk install prints when the agent's own CLI (which runs the automatic
// engine) isn't on PATH. Honest degrade: file-only surfaces still work; only the
// automatic LLM steps wait on the CLI. Silent on the happy path.

import { describe, it, expect } from 'vitest';
import { warnMissingBackendCli } from '../packages/cli/src/subcommands.mjs';

function captureLog() {
  const lines = [];
  return { log: (m) => lines.push(String(m)), lines, text: () => lines.join('\n') };
}

describe('Task 200 — warnMissingBackendCli (install first-touch)', () => {
  it('prints NOTHING when the backend CLI is present (silent happy path)', () => {
    const cap = captureLog();
    warnMissingBackendCli('cursor', {
      log: cap.log,
      backendCliProbe: () => ({ agent: 'cursor', bin: 'agent.cmd', present: true }),
    });
    expect(cap.lines).toHaveLength(0);
  });

  it('warns with the missing CLI name + the honest degrade when absent', () => {
    const cap = captureLog();
    warnMissingBackendCli('kiro', {
      log: cap.log,
      backendCliProbe: () => ({ agent: 'kiro', bin: 'kiro-cli', present: false, reason: 'kiro-cli not found on PATH' }),
    });
    const text = cap.text();
    expect(text).toMatch(/kiro-cli/); // names the missing bin
    expect(text.toLowerCase()).toMatch(/capture.*search.*recall|still work|file/); // degrade, not failure
    expect(text.toLowerCase()).toMatch(/compression|extraction|persona/); // what's affected
    expect(text.toLowerCase()).toMatch(/install/); // tells the user how to fix it
    // never frames it as broken/fatal
    expect(text.toLowerCase()).not.toMatch(/broken|crashed|fatal|error/);
    // Task 200 doesn't ship --backend (that's Task 201) — must not reference it yet
    expect(text).not.toMatch(/--backend/);
  });

  it('includes the probe reason when one is given', () => {
    const cap = captureLog();
    warnMissingBackendCli('cursor', {
      log: cap.log,
      backendCliProbe: () => ({
        agent: 'cursor',
        bin: 'agent.cmd',
        present: false,
        reason: 'agent.cmd found but --version exited 1 (broken install?)',
      }),
    });
    expect(cap.text()).toMatch(/broken install/);
  });
});
