#!/usr/bin/env node
// SessionStart hook handler — npm-route bin (Task 49, T-037).
//
// De-plugin-ified twin of plugin/bin/cmk-inject-context.mjs (Task 18).
// This copy lives in the published @lh8ppl/claude-memory-kit npm package
// (declared in package.json `bin`), so `cmk install` can wire a
// PATH-resolved `cmk-inject-context` hook command into settings.json
// WITHOUT the plugin's `${CLAUDE_PLUGIN_ROOT}` / bash dependency. The
// only difference from the plugin copy is the src module path: here it
// resolves ../src/ (bin/ → src/), not ../../packages/cli/src/.
//
// Protocol: payload arrives on stdin as JSON (drained, not consumed).
// Emit the Anthropic SessionStart hookOutput JSON on stdout. Exit 0
// unconditionally — a throwing SessionStart hook would interrupt
// session start, worse than an empty additionalContext.

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
const modulePath = join(__dirname, '..', 'src', 'inject-context.mjs');

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
