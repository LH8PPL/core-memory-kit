#!/usr/bin/env node
// PreCompact detached worker (Task 235).
//
// Spawned detached by cmk-precompact.mjs (the PreCompact hook) when the cheap
// gate says a now→today roll is worth doing. Runs the roll on the ceiling-free
// budget and exits. Humans don't invoke this directly.
//
// Like cmk-auto-extract.mjs, this bin is NOT in package.json `bin` — it is
// resolved by path from its sibling hook bin, so it never needs a PATH shim.
//
// Protocol: one-shot; no stdin. Project root from argv[2] or CMK_PROJECT_DIR.
// Always exits 0 — a detached child's failure must never surface anywhere; the
// precompact.log NDJSON is the load-bearing observability surface.

import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const precompactModulePath = join(__dirname, '..', '..', 'packages', 'cli', 'src', 'precompact.mjs');
const makeBackendModulePath = join(__dirname, '..', '..', 'packages', 'cli', 'src', 'make-backend.mjs');

let runPreCompact;
let makeBackend;
try {
  ({ runPreCompact } = await import(pathToFileURL(precompactModulePath).href));
  ({ makeBackend } = await import(pathToFileURL(makeBackendModulePath).href));
} catch (err) {
  process.stderr.write(`cmk-precompact-worker: failed to load modules: ${err?.message ?? err}\n`);
  process.exit(0);
}

const argvRoot = process.argv[2] && process.argv[2].length > 0 ? process.argv[2] : null;
const envRoot = process.env.CMK_PROJECT_DIR && process.env.CMK_PROJECT_DIR.length > 0
  ? process.env.CMK_PROJECT_DIR
  : null;
const projectRoot = argvRoot ?? envRoot ?? process.cwd();
const trigger = process.env.CMK_PRECOMPACT_TRIGGER === 'manual' ? 'manual' : 'auto';

try {
  const userDir = process.env.MEMORY_KIT_USER_DIR ?? join(homedir(), '.core-memory-kit');
  // Agent-relative backend (Task 200): the factory picks the CLI of the agent
  // the project was installed for. Ceiling-free path, so a slow backend is fine.
  const backend = makeBackend({ projectRoot, userDir });
  const r = await runPreCompact({ projectRoot, backend, trigger });
  process.stderr.write(
    `cmk-precompact-worker: ${r?.action ?? 'unknown'}${r?.reason ? ` (${r.reason})` : ''} ms: ${r?.duration_ms ?? 0}\n`,
  );
} catch (err) {
  process.stderr.write(`cmk-precompact-worker: unexpected error: ${err?.message ?? err}\n`);
}

process.exit(0);
