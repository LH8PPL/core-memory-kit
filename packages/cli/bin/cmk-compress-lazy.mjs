#!/usr/bin/env node
// Lazy compress bin wrapper (Task 35, T-030). Invoked detached from
// inject-context.mjs (SessionStart hook) when staleness is detected
// and cron is NOT active. Humans normally don't invoke this directly;
// the documented user-facing entry point is `cmk compress --lazy`.
//
// Protocol: one-shot process; exits when done. No stdin payload.
// Project root from CMK_PROJECT_DIR env or cwd.
//
// Composes on runLazyCompress() per design §8.2.2. Always exits 0 —
// a crashed lazy-compress should never propagate back to the
// SessionStart hook that spawned it (detached posture); the kit's
// lazy-compress.log NDJSON + cooldown marker are the load-bearing
// observability surfaces.

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const lazyCompressModulePath = join(__dirname, '..', 'src', 'lazy-compress.mjs');
const compressorModulePath = join(__dirname, '..', 'src', 'compressor.mjs');

let runLazyCompress;
let HaikuViaAnthropicApi;
try {
  ({ runLazyCompress } = await import(pathToFileURL(lazyCompressModulePath).href));
  ({ HaikuViaAnthropicApi } = await import(pathToFileURL(compressorModulePath).href));
} catch (err) {
  process.stderr.write(
    `cmk-compress-lazy: failed to load modules: ${err?.message ?? err}\n`,
  );
  process.exit(0);
}

// Task 36 B1 fix: accept projectRoot via argv[2]. Inject-context.mjs's
// detached spawn passes CMK_PROJECT_DIR via env; accepting argv[2]
// keeps the bin uniform with cmk-daily-distill / cmk-weekly-curate
// and makes manual debugging (`node cmk-compress-lazy.mjs /path`) work.
const argvRoot = process.argv[2] && process.argv[2].length > 0 ? process.argv[2] : null;
const envRoot = process.env.CMK_PROJECT_DIR && process.env.CMK_PROJECT_DIR.length > 0
  ? process.env.CMK_PROJECT_DIR
  : null;
const projectRoot = argvRoot ?? envRoot ?? process.cwd();

try {
  const backend = new HaikuViaAnthropicApi();
  const r = await runLazyCompress({ projectRoot, backend });
  process.stderr.write(
    `cmk-compress-lazy: ${r.action}${r.reason ? ` (${r.reason})` : ''}${r.delegatedTo ? ` → ${r.delegatedTo}` : ''} ms: ${r.duration_ms ?? 0}\n`,
  );
} catch (err) {
  process.stderr.write(
    `cmk-compress-lazy: unexpected error: ${err?.message ?? err}\n`,
  );
}

process.exit(0);
