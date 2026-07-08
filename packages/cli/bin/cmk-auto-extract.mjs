#!/usr/bin/env node
// Auto-extract subagent entrypoint — npm-route bin (Task 49, T-037).
//
// De-plugin-ified twin of plugin/bin/cmk-auto-extract.mjs (Task 23).
// NOT declared in package.json `bin` (it's not invoked by Claude Code
// directly) — it ships in bin/ so the sibling cmk-capture-turn.mjs can
// spawn it by absolute path. Only the src module paths differ from the
// plugin copy (../src/ vs ../../packages/cli/src/).
//
// Spawned detached by the Stop hook (cmk-capture-turn.mjs):
//   node <thisfile> <turnFile>
// argv[2] is the turn buffer file path; cwd / CMK_PROJECT_DIR env gives
// the project root. Never throws to the parent (the spawn is detached);
// every error path writes an extract.log entry and exits 0.

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const turnFile = process.argv[2];
const projectRoot = process.env.CMK_PROJECT_DIR ?? process.cwd();

if (!turnFile) {
  process.stderr.write('cmk-auto-extract: missing turnFile argv[2]\n');
  process.exit(0);
}

const autoExtractModulePath = join(__dirname, '..', 'src', 'auto-extract.mjs');
const makeBackendModulePath = join(__dirname, '..', 'src', 'make-backend.mjs');
const tierPathsModulePath = join(__dirname, '..', 'src', 'tier-paths.mjs');

let runAutoExtract;
let makeBackend;
let resolveTierRoot;
try {
  ({ runAutoExtract } = await import(pathToFileURL(autoExtractModulePath).href));
  ({ makeBackend } = await import(pathToFileURL(makeBackendModulePath).href));
  ({ resolveTierRoot } = await import(pathToFileURL(tierPathsModulePath).href));
} catch (err) {
  process.stderr.write(
    `cmk-auto-extract: failed to load modules: ${err?.message ?? err}\n`,
  );
  process.exit(0);
}

// Task 61 — inline cross-project promotion: pass the user-tier dir so
// cross-project doctrine promotes immediately. Resolve the base via the
// shared tier-paths resolver (never re-derive ~/.claude-memory-kit inline —
// CLAUDE.md shared-modules rule).
//
// Wedge-from-empty (D-262): pass userDir UNCONDITIONALLY — do NOT gate on
// existsSync. A brand-new user has no ~/.claude-memory-kit/ yet, and the whole
// point of the wedge (B3/B4) is to fill it from EMPTY on the first cross-project
// rule. The old `existsSync ? base : undefined` guard dropped that first rule
// silently, so the persona could never bootstrap. The promote path
// (promoteCandidatesToUserTier) now scaffolds the tier on first GATED promote —
// i.e. only when a real durable cross-project fact is actually landing, never
// speculatively — so passing the path unconditionally here is safe: a turn with
// no cross-project doctrine simply never touches the user tier.
const userDir = resolveTierRoot({ tier: 'U' });

try {
  // Task 200: agent-relative backend — the factory picks the CLI of the agent
  // this project was installed for (or the backend.agent override), so a
  // Cursor-only / Kiro-only user's auto-extract actually runs (D-270).
  const haikuBackend = makeBackend({ projectRoot, userDir });
  const r = await runAutoExtract({
    turnFile,
    projectRoot,
    haikuBackend,
    sessionId: process.env.CMK_SESSION_ID,
    userDir,
  });
  process.stderr.write(
    `cmk-auto-extract: ${r.action} (observations: ${r.observation_count ?? 0}, ms: ${r.duration_ms ?? 0})\n`,
  );

  // Task 148.3 (ADR-0019, design §6.10): promote pending live-buffer
  // transcript entries through the L3 privacy judge into the committed
  // transcript. Rides this detached child (zero hot-path cost); best-effort —
  // a failed promote defers to the next turn / SessionEnd (fail-closed).
  try {
    const { promotePendingTranscripts } = await import(
      pathToFileURL(join(__dirname, '..', 'src', 'transcript-screen.mjs')).href
    );
    const p = await promotePendingTranscripts({ projectRoot, backend: haikuBackend });
    if (p.action !== 'noop') {
      process.stderr.write(
        `cmk-auto-extract: transcript-promote ${p.action} (promoted: ${p.promoted ?? 0}, deferred: ${p.deferred ?? 0})\n`,
      );
    }
  } catch {
    /* promote must never break the child; the backlog retries next turn */
  }
} catch (err) {
  process.stderr.write(
    `cmk-auto-extract: unexpected error: ${err?.message ?? err}\n`,
  );
}

process.exit(0);
