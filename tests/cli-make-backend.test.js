// @doors: 1
// Door 2 N/A: pure factory — resolves which backend CLASS to construct from the
//   install kind + config override; no disk mutation (reads config + install
//   markers only).
// Door 3 N/A: no external services / subprocess here (the selected backend
//   spawns later, in its own tests).
// Door 4 N/A: no message queues.
// Door 5 N/A: no observability / NDJSON emission at this surface.

// Tests for Task 200 (D-270/D-277) — makeBackend: the factory that picks the
// per-agent CompressorBackend. Resolution order:
//   1. the `backend.agent` config OVERRIDE (Task 201 split-brain — built in now
//      so 201 is a config-key + docs task, no factory rework);
//   2. else detectInstallKind (the agent the project was installed for);
//   3. → the matching backend (claude → HaikuViaAnthropicApi, kiro →
//      KiroCliBackend, cursor → CursorAgentBackend).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeBackend, resolveBackendAgent } from '../packages/cli/src/make-backend.mjs';
import { HaikuViaAnthropicApi } from '../packages/cli/src/compressor.mjs';
import { KiroCliBackend } from '../packages/cli/src/kiro-backend.mjs';
import { CursorAgentBackend } from '../packages/cli/src/cursor-backend.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'cmk-makebackend-'));
}
function markInstall(root, kind) {
  if (kind === 'claude-code') {
    mkdirSync(join(root, '.claude'), { recursive: true });
    writeFileSync(join(root, '.claude', 'settings.json'), '{}', 'utf8');
  } else if (kind === 'kiro') {
    mkdirSync(join(root, '.kiro', 'steering'), { recursive: true });
    writeFileSync(join(root, '.kiro', 'steering', 'cmk.md'), 'x', 'utf8');
  } else if (kind === 'cursor') {
    mkdirSync(join(root, '.cursor', 'rules'), { recursive: true });
    writeFileSync(join(root, '.cursor', 'rules', 'claude-memory-kit.mdc'), 'x', 'utf8');
  }
}
// Write a project-tier settings.json with a backend.agent override.
function setBackendOverride(root, agent) {
  mkdirSync(join(root, 'context'), { recursive: true });
  writeFileSync(join(root, 'context', 'settings.json'), JSON.stringify({ backend: { agent } }), 'utf8');
}

describe('Task 200 — makeBackend factory', () => {
  it('a claude-code install → HaikuViaAnthropicApi (the unchanged default)', () => {
    const root = tmp();
    markInstall(root, 'claude-code');
    expect(makeBackend({ projectRoot: root })).toBeInstanceOf(HaikuViaAnthropicApi);
  });

  it('a kiro install → KiroCliBackend', () => {
    const root = tmp();
    markInstall(root, 'kiro');
    expect(makeBackend({ projectRoot: root })).toBeInstanceOf(KiroCliBackend);
  });

  it('a cursor install → CursorAgentBackend', () => {
    const root = tmp();
    markInstall(root, 'cursor');
    expect(makeBackend({ projectRoot: root })).toBeInstanceOf(CursorAgentBackend);
  });

  it('the backend.agent config OVERRIDE wins over the install kind (Task 201 split-brain)', () => {
    const root = tmp();
    markInstall(root, 'claude-code'); // installed for claude...
    setBackendOverride(root, 'kiro'); // ...but memory routed through kiro-cli
    expect(makeBackend({ projectRoot: root })).toBeInstanceOf(KiroCliBackend);
  });

  it('resolveBackendAgent reports the source (override vs install)', () => {
    const root = tmp();
    markInstall(root, 'cursor');
    expect(resolveBackendAgent({ projectRoot: root })).toMatchObject({ agent: 'cursor', source: 'install' });
    setBackendOverride(root, 'kiro');
    expect(resolveBackendAgent({ projectRoot: root })).toMatchObject({ agent: 'kiro', source: 'override' });
  });

  it('an UNKNOWN override agent falls back to the install kind (never a broken backend)', () => {
    const root = tmp();
    markInstall(root, 'cursor');
    setBackendOverride(root, 'not-a-real-agent');
    // invalid override is ignored → install kind (cursor) wins
    expect(makeBackend({ projectRoot: root })).toBeInstanceOf(CursorAgentBackend);
  });

  it('passes constructor deps through (e.g. an injected spawnFn for tests)', () => {
    const root = tmp();
    markInstall(root, 'kiro');
    const spy = () => {};
    const b = makeBackend({ projectRoot: root, spawnFn: spy });
    expect(b).toBeInstanceOf(KiroCliBackend);
    // the injected spawn should have reached the backend (no throw on construct)
    expect(b.modelId()).toBeTruthy();
  });
});
