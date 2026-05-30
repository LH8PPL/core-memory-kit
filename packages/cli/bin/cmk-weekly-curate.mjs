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
import { homedir } from 'node:os';
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

// Task 36 B1 fix: accept projectRoot via argv[2] (the registered cron
// emits an absolute path here). Env var + cwd remain as fallbacks.
// See cmk-daily-distill.mjs for rationale.
const argvRoot = process.argv[2] && process.argv[2].length > 0 ? process.argv[2] : null;
const envRoot = process.env.CMK_PROJECT_DIR && process.env.CMK_PROJECT_DIR.length > 0
  ? process.env.CMK_PROJECT_DIR
  : null;
const projectRoot = argvRoot ?? envRoot ?? process.cwd();

// User tier (cross-project) lives at ~/.claude-memory-kit. Passing it
// activates the Design-B auto-persona hook (Task 45): the weekly cycle
// synthesizes cross-project doctrine from the project's fact archive and
// auto-promotes it into the user tier. Without userDir the curate runs
// project-only (backward-compatible).
const userDir = join(homedir(), '.claude-memory-kit');

try {
  const backend = new HaikuViaAnthropicApi();
  const r = await weeklyCurate({ projectRoot, userDir, backend });
  const p = r.persona;
  const personaNote = p
    ? ` | persona: ${p.action}${p.promoted?.length ? ` (+${p.promoted.length})` : ''}${p.superseded?.length ? ` (~${p.superseded.length})` : ''}`
    : '';
  process.stderr.write(
    `cmk-weekly-curate: ${r.action}${r.reason ? ` (${r.reason})` : ''}${r.archivedDays ? ` (archived: ${r.archivedDays}d, current: ${r.currentDays}d, in: ${r.bytesIn}b, out: ${r.bytesOut}b)` : ''}${personaNote} ms: ${r.duration_ms ?? 0}\n`,
  );
} catch (err) {
  process.stderr.write(
    `cmk-weekly-curate: unexpected error: ${err?.message ?? err}\n`,
  );
}

process.exit(0);
