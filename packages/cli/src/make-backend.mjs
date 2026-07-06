// make-backend.mjs — the agent-relative CompressorBackend factory (Task 200,
// D-270/D-277/D-278).
//
// The kit's automatic engine (auto-extract / compression / persona / temporal-
// sweep / daily-distill / weekly-curate) used to hard-construct
// `new HaikuViaAnthropicApi()` at ~11 sites — all shelling out to `claude`. So a
// Cursor-only / Kiro-only user got a silent no-op (D-270). This factory picks the
// RIGHT backend for the agent, so the automatic engine works Claude-free.
//
// Resolution order (resolveBackendAgent):
//   1. the `backend.agent` config OVERRIDE — the split-brain feature (Task 201):
//      code in agent X, run the background memory chore through agent Y. Built in
//      NOW so 201 is a config-key + docs task, not a factory rewrite. An INVALID
//      override is ignored (falls through) — never construct a broken backend.
//   2. else detectInstallKind — the agent the project was `cmk install`-ed for.
//   → the matching backend:
//        claude  → HaikuViaAnthropicApi  (unchanged; `claude --print`)
//        kiro    → KiroCliBackend        (`kiro-cli chat`)
//        cursor  → CursorAgentBackend    (`cursor-agent -p`)
//
// D-278 latency note: CursorAgentBackend is SLOW (30–83s, full agent loop even in
// -p) — it carries its own large default timeout, and callers on the 60s
// SessionEnd hook ceiling must route it through the detached/ceiling-free paths.
// The factory just SELECTS; the timeout composition lives in the backend + the
// caller (design §16.50.x).

import { detectInstallKind } from './install-kind.mjs';
import { configGet } from './config-core.mjs';
import { KNOWN_BACKEND_AGENTS } from './agent-cli.mjs';
import { HaikuViaAnthropicApi } from './compressor.mjs';
import { KiroCliBackend } from './kiro-backend.mjs';
import { CursorAgentBackend } from './cursor-backend.mjs';

function normalizeAgent(kind) {
  return kind === 'claude-code' ? 'claude' : kind;
}

/**
 * Which agent should run the background LLM call, and why.
 * @returns {{agent: 'claude'|'kiro'|'cursor', source: 'override'|'install'}}
 */
export function resolveBackendAgent({ projectRoot, userDir } = {}) {
  // 1. the config override (split-brain). Ignore an unknown value.
  const override = configGet('backend.agent', { projectRoot, userDir });
  if (override.found) {
    const agent = normalizeAgent(String(override.value));
    if (KNOWN_BACKEND_AGENTS.includes(agent)) {
      return { agent, source: 'override' };
    }
    // else: invalid override → fall through to the install kind (don't build a
    // broken backend from a typo'd config value).
  }
  // 2. the agent the project was installed for.
  return { agent: normalizeAgent(detectInstallKind(projectRoot)), source: 'install' };
}

/**
 * Construct the CompressorBackend for the project's active backend agent.
 * Extra opts (e.g. `spawnFn`, `model`) pass through to the backend constructor —
 * the backends accept an injectable spawn for tests.
 *
 * @param {{projectRoot?: string, userDir?: string, [k: string]: *}} opts
 * @returns {import('./compressor.mjs').CompressorBackend}
 */
export function makeBackend({ projectRoot, userDir, ...ctorOpts } = {}) {
  const { agent } = resolveBackendAgent({ projectRoot, userDir });
  switch (agent) {
    case 'kiro':
      return new KiroCliBackend(ctorOpts);
    case 'cursor':
      return new CursorAgentBackend(ctorOpts);
    case 'claude':
    default:
      return new HaikuViaAnthropicApi(ctorOpts);
  }
}
