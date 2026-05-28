#!/usr/bin/env node
// Daily distill bin wrapper (Task 33, T-028). Invoked by the
// host scheduler (cron / launchd / Task Scheduler) registered via
// `cmk register-crons` per design §8.6.2.
//
// Protocol: the wrapper is a one-shot process that exits when done.
// No stdin payload expected (unlike Stop/SessionEnd hooks). The kit's
// project root is read from CMK_PROJECT_DIR env (set by the cron
// command line) or falls back to cwd.
//
// Composes on dailyDistill() per design §8.6.1. Always exits 0 — a
// crashed cron job rotates noise into the scheduler logs without any
// recovery affordance for the user; the kit's distill.log NDJSON
// + cooldown marker are the load-bearing observability surfaces.

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// This bin lives under packages/cli/bin/ (Task 33 B1 fix — was originally
// under plugin/bin/ but that tree isn't in the published @claude-memory-kit/cli
// npm package, so `cmk register-crons` emitted cron commands pointing at
// paths that don't exist in `npm install -g` installs). Paths resolved
// relative to bin/ → ../src/ for both modules.
const dailyDistillModulePath = join(__dirname, '..', 'src', 'daily-distill.mjs');
const compressorModulePath = join(__dirname, '..', 'src', 'compressor.mjs');

let dailyDistill;
let HaikuViaAnthropicApi;
try {
  ({ dailyDistill } = await import(pathToFileURL(dailyDistillModulePath).href));
  ({ HaikuViaAnthropicApi } = await import(pathToFileURL(compressorModulePath).href));
} catch (err) {
  process.stderr.write(
    `cmk-daily-distill: failed to load modules: ${err?.message ?? err}\n`,
  );
  process.exit(0);
}

// Task 36 B1 fix: accept projectRoot via argv[2] (the registered cron
// emits an absolute path here). Env var + cwd remain as fallbacks for
// users invoking the bin manually. Host schedulers (cron / launchd /
// schtasks) all have a non-kit default cwd, so argv-or-env is the
// load-bearing source for cron-emitted invocations.
// Treat empty-string env var as "missing" (?? falls through only on
// null/undefined; empty strings would otherwise become invalid paths).
const argvRoot = process.argv[2] && process.argv[2].length > 0 ? process.argv[2] : null;
const envRoot = process.env.CMK_PROJECT_DIR && process.env.CMK_PROJECT_DIR.length > 0
  ? process.env.CMK_PROJECT_DIR
  : null;
const projectRoot = argvRoot ?? envRoot ?? process.cwd();

try {
  const backend = new HaikuViaAnthropicApi();
  const r = await dailyDistill({ projectRoot, backend });
  process.stderr.write(
    `cmk-daily-distill: ${r.action}${r.reason ? ` (${r.reason})` : ''}${r.bytesIn ? ` (in: ${r.bytesIn}b, out: ${r.bytesOut}b, days: ${r.sourceDays})` : ''} ms: ${r.duration_ms ?? 0}\n`,
  );
} catch (err) {
  process.stderr.write(
    `cmk-daily-distill: unexpected error: ${err?.message ?? err}\n`,
  );
}

process.exit(0);
