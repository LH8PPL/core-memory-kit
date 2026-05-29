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
const compressorModulePath = join(__dirname, '..', 'src', 'compressor.mjs');

let runAutoExtract;
let HaikuViaAnthropicApi;
try {
  ({ runAutoExtract } = await import(pathToFileURL(autoExtractModulePath).href));
  ({ HaikuViaAnthropicApi } = await import(pathToFileURL(compressorModulePath).href));
} catch (err) {
  process.stderr.write(
    `cmk-auto-extract: failed to load modules: ${err?.message ?? err}\n`,
  );
  process.exit(0);
}

try {
  const haikuBackend = new HaikuViaAnthropicApi();
  const r = await runAutoExtract({
    turnFile,
    projectRoot,
    haikuBackend,
    sessionId: process.env.CMK_SESSION_ID,
  });
  process.stderr.write(
    `cmk-auto-extract: ${r.action} (observations: ${r.observation_count ?? 0}, ms: ${r.duration_ms ?? 0})\n`,
  );
} catch (err) {
  process.stderr.write(
    `cmk-auto-extract: unexpected error: ${err?.message ?? err}\n`,
  );
}

process.exit(0);
