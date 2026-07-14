#!/usr/bin/env node
// Auto-extract subagent entrypoint (Task 23, T-020). Spawned detached
// by Task 21's Stop hook (cmk-capture-turn.mjs) via:
//
//   node ${CLAUDE_PLUGIN_ROOT}/bin/cmk-auto-extract.mjs <turnFile>
//
// argv[2] is the turn buffer file path; cwd / CMK_PROJECT_DIR env tells
// us the project root.
//
// This script never throws to the parent — the spawn is detached so
// there's no parent to receive errors, but more importantly: a crashed
// subagent leaves orphan state. Every error path here writes an
// extract.log entry and exits 0.

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

const autoExtractModulePath = join(
  __dirname,
  '..',
  '..',
  'packages',
  'cli',
  'src',
  'auto-extract.mjs',
);
const compressorModulePath = join(
  __dirname,
  '..',
  '..',
  'packages',
  'cli',
  'src',
  'compressor.mjs',
);
const tierPathsModulePath = join(
  __dirname,
  '..',
  '..',
  'packages',
  'cli',
  'src',
  'tier-paths.mjs',
);

let runAutoExtract;
let HaikuViaAnthropicApi;
let resolveTierRoot;
try {
  ({ runAutoExtract } = await import(pathToFileURL(autoExtractModulePath).href));
  ({ HaikuViaAnthropicApi } = await import(pathToFileURL(compressorModulePath).href));
  ({ resolveTierRoot } = await import(pathToFileURL(tierPathsModulePath).href));
} catch (err) {
  process.stderr.write(
    `cmk-auto-extract: failed to load modules: ${err?.message ?? err}\n`,
  );
  process.exit(0);
}

// Task 61 — inline cross-project promotion: pass the user-tier dir so
// cross-project doctrine promotes immediately. Resolve the base via the
// shared tier-paths resolver (never re-derive ~/.core-memory-kit inline —
// CLAUDE.md shared-modules rule).
//
// Wedge-from-empty (D-262): pass userDir UNCONDITIONALLY — the promote path
// scaffolds the user tier on first GATED cross-project promote, so a brand-new
// user's first "from now on…" rule bootstraps the persona from empty instead of
// being silently dropped by an existsSync guard. Mirrors packages/cli/bin.
const userDir = resolveTierRoot({ tier: 'U' });

try {
  const haikuBackend = new HaikuViaAnthropicApi();
  const r = await runAutoExtract({
    turnFile,
    projectRoot,
    haikuBackend,
    sessionId: process.env.CMK_SESSION_ID,
    userDir,
  });
  // Diagnostic log to stderr (parent already exited; nothing reads stdout).
  process.stderr.write(
    `cmk-auto-extract: ${r.action} (observations: ${r.observation_count ?? 0}, ms: ${r.duration_ms ?? 0})\n`,
  );

  // Task 148.3 (ADR-0019, design §6.10): promote pending live-buffer
  // transcript entries through the L3 privacy judge into the committed
  // transcript. Best-effort — a failed promote defers (fail-closed).
  // Mirrors packages/cli/bin (twin lockstep).
  try {
    const { promotePendingTranscripts } = await import(
      pathToFileURL(
        join(__dirname, '..', '..', 'packages', 'cli', 'src', 'transcript-screen.mjs'),
      ).href
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
  // Defensive: runAutoExtract is expected to swallow Haiku errors into
  // the return struct, but any unanticipated throw lands here so it
  // doesn't leave a stale lock or unflushed log entry.
  process.stderr.write(
    `cmk-auto-extract: unexpected error: ${err?.message ?? err}\n`,
  );
}

process.exit(0);
