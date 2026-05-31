#!/usr/bin/env node
// SessionStart hook real handler (Task 18). node-only since Task 62: hooks.json invokes this directly via
// node "${CLAUDE_PLUGIN_ROOT}/bin/cmk-inject-context.mjs" (no bash wrapper).
//
// Protocol: payload arrives on stdin as JSON (we drain it but don't
// currently consume any fields). Emit the Anthropic SessionStart
// hookOutput JSON shape on stdout. Exit 0 unconditionally — a hook
// that throws would interrupt session start, which is worse than
// emitting an empty additionalContext.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Drain stdin so callers blocking on EPIPE don't hang.
try {
  readFileSync(0, 'utf8');
} catch {
  // stdin not connected; fine.
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In the kit's dev layout, this script lives at
//   <repo>/plugin/bin/cmk-inject-context.mjs
// and the injectContext implementation is at
//   <repo>/packages/cli/src/inject-context.mjs
// — two levels up + into packages/. When the plugin is published, the
// packages/ tree will need to be bundled/published alongside; that
// wiring is a release-engineering question, not a Task-18 question.
const modulePath = join(
  __dirname,
  '..',
  '..',
  'packages',
  'cli',
  'src',
  'inject-context.mjs',
);

let injectContext;
try {
  ({ injectContext } = await import(pathToFileURL(modulePath).href));
} catch (err) {
  process.stderr.write(
    `cmk-inject-context: failed to load module at ${modulePath}: ${
      err?.message ?? String(err)
    }\n`,
  );
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: '',
      },
    }),
  );
  process.exit(0);
}

try {
  const r = injectContext({ cwd: process.cwd() });
  process.stdout.write(JSON.stringify(r.hookOutput));
  process.exit(0);
} catch (err) {
  process.stderr.write(
    `cmk-inject-context: handler failed: ${err?.message ?? String(err)}\n`,
  );
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: '',
      },
    }),
  );
  process.exit(0);
}
