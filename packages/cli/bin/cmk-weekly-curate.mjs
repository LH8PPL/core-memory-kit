#!/usr/bin/env node
// Weekly curate bin wrapper (Task 34, T-029). Invoked by the host
// scheduler (cron / launchd / Task Scheduler) registered via
// `cmk register-crons --weekly` per design §8.7.
//
// Protocol: one-shot process; exits when done. No stdin payload
// expected. Project root from CMK_PROJECT_DIR env or cwd.
//
// Composes on weeklyCurate() per design §8.7.1. Always exits 0 — a
// crashed cron job rotates noise into the scheduler logs without any
// recovery affordance for the user; the kit's curate.log NDJSON +
// cooldown marker are the load-bearing observability surfaces.

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const weeklyCurateModulePath = join(__dirname, '..', 'src', 'weekly-curate.mjs');
const compressorModulePath = join(__dirname, '..', 'src', 'compressor.mjs');

let weeklyCurate;
let HaikuViaAnthropicApi;
try {
  ({ weeklyCurate } = await import(pathToFileURL(weeklyCurateModulePath).href));
  ({ HaikuViaAnthropicApi } = await import(pathToFileURL(compressorModulePath).href));
} catch (err) {
  process.stderr.write(
    `cmk-weekly-curate: failed to load modules: ${err?.message ?? err}\n`,
  );
  process.exit(0);
}

const projectRoot = process.env.CMK_PROJECT_DIR ?? process.cwd();

try {
  const backend = new HaikuViaAnthropicApi();
  const r = await weeklyCurate({ projectRoot, backend });
  process.stderr.write(
    `cmk-weekly-curate: ${r.action}${r.reason ? ` (${r.reason})` : ''}${r.archivedDays ? ` (archived: ${r.archivedDays}d, current: ${r.currentDays}d, in: ${r.bytesIn}b, out: ${r.bytesOut}b)` : ''} ms: ${r.duration_ms ?? 0}\n`,
  );
} catch (err) {
  process.stderr.write(
    `cmk-weekly-curate: unexpected error: ${err?.message ?? err}\n`,
  );
}

process.exit(0);
