#!/usr/bin/env node
// validate-spawn-discipline.mjs — every subprocess spawn in production
// code (`packages/cli/src/` + `plugin/bin/`) has an enforced timeout +
// cleanup contract OR is explicitly suppressed with a documented reason.
//
// Source rule: composition-verification instance #4 from PR-A — no
// inner subprocess timeout meant the outer hook ceiling killed the
// parent without running catch + finally + log-write. The remediation
// was design §8.5 (subprocess timeout + cleanup contract). This
// validator structurally enforces the rule going forward.
//
// What this validator does
// ------------------------
//
//   1. Walks every `*.mjs` file under `packages/cli/src/` and
//      `plugin/bin/`. Test files (`tests/`) and dev tooling
//      (`scripts/`) are skipped — they're not kit runtime.
//   2. For each line matching a spawn call (`spawn(`, `spawnSync(`,
//      `exec(`, `execSync(`, `execFile(`, `execFileSync(`), checks
//      a "discipline window" of the call site + the following ~25
//      lines (the options object + any caller-managed timeout setup).
//   3. The window must contain ONE of:
//      - `timeout:` or `timeoutMs:` (Node's native options OR caller-
//        managed setTimeout reference)
//      - A `// spawn-discipline: ignore <reason>` marker on the call
//        line or the line above (for detached fire-and-forget where
//        parent-side timeout is incorrect by design)
//      - A `// spawn-discipline: caller-managed <ref>` marker on
//        the call line or the line above (for spawns whose timeout
//        lives in a separately-tested helper, e.g.,
//        `terminateSubprocess` in compressor.mjs)
//
// What this validator does NOT do
// -------------------------------
//
// Verify the timeout VALUE is appropriate, or that the kill chain
// actually fires on timeout. That's the unit test's job (see the
// composition rule from CLAUDE.md). This validator pins the
// PROCEDURAL discipline (every spawn has SOMETHING resembling a
// timeout contract); test files prove the SUBSTANTIVE correctness.
//
// Suppression-marker rationale: the kit has exactly two production
// spawn sites today (HaikuViaAnthropicApi.compress + capture-turn.mjs
// spawnAutoExtract). One uses caller-managed timeout via a separate
// helper; the other is detached fire-and-forget. Both legitimate.
// New spawn sites must declare which case they fall under.
//
// Run: `node scripts/validate-spawn-discipline.mjs`
// Wired into `npm test` as a pre-test step.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SCAN_DIRS = ['packages/cli/src', 'plugin/bin'];
// Match subprocess-spawning calls. Two patterns:
//   - Direct imports: `spawn(`, `exec(`, etc. — negative lookbehind for
//     `.` or word-character excludes regex.exec() / array.exec() /
//     this.exec(if-not-_-prefixed) etc.
//   - Kit wrapper convention: `._spawn(`, `._exec(`, etc. — the
//     dependency-injection seam used in compressor.mjs (the wrapper
//     IS the real child_process.spawn call at runtime, just injectable
//     for tests).
const SPAWN_CALL_RE = /(?<![\w.])(spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(/;
const WRAPPER_CALL_RE = /\.(_spawn|_spawnSync|_exec|_execSync|_execFile|_execFileSync)\s*\(/;
const TIMEOUT_RE = /\btimeout(Ms)?\s*:/;
const IGNORE_MARKER = /\/\/\s*spawn-discipline:\s*ignore\s+(.+)/;
const CALLER_MANAGED_MARKER = /\/\/\s*spawn-discipline:\s*caller-managed\s+(.+)/;
const DISCIPLINE_WINDOW_LINES = 25;

function scan(dir, results) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // dir doesn't exist; skip
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(path, results);
      continue;
    }
    if (!entry.name.endsWith('.mjs')) continue;
    results.push(path);
  }
}

const violations = [];
const sites = []; // {file, line, kind, status, reason}

for (const dir of SCAN_DIRS) {
  const files = [];
  try {
    statSync(dir);
  } catch {
    continue; // skip missing dir
  }
  scan(dir, files);
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip lines that LOOK like spawn calls but are actually comments
      // or string literals. Cheap heuristic: skip lines whose entire
      // content before the spawn match is `//` or starts with `*` (jsdoc).
      let m = line.match(SPAWN_CALL_RE);
      let isWrapper = false;
      if (!m) {
        // Also try the wrapper-convention pattern (kit's `._spawn(` etc.)
        m = line.match(WRAPPER_CALL_RE);
        if (!m) continue;
        isWrapper = true;
      }
      const beforeMatch = line.slice(0, m.index);
      if (/^\s*(\/\/|\*|\*\/)/.test(beforeMatch) || /['"`].*$/.test(beforeMatch)) continue;
      // ALSO skip the import line that brings spawn() into scope.
      if (/^\s*import\s/.test(line) || /\bfrom\s+['"]node:child_process/.test(line)) continue;
      // Skip wrapper METHOD DEFINITIONS (e.g., `_spawn(bin, args, opts) {`)
      // — these are just the wrapper's own definition, not the call site.
      // The call site is `this._spawn(...)` invocations elsewhere.
      // Heuristic: if the line ends with `{` after the `(`-args, it's
      // probably a method definition; if it ends with `)` or `,` it's
      // probably a call. Look for the closing-paren-then-brace pattern
      // OR the `function` keyword.
      if (isWrapper && /^\s*_\w+\s*\(/.test(line)) {
        // Line starts with `_name(` — that's the method definition signature
        continue;
      }
      if (/\bfunction\s+\w*\s*$/.test(beforeMatch)) continue;

      const kind = m[1];
      const lineNum = i + 1;

      // Build the discipline window: this line + next N lines.
      const windowEnd = Math.min(lines.length, i + DISCIPLINE_WINDOW_LINES);
      const windowLines = lines.slice(i, windowEnd).join('\n');

      // Check for suppression / caller-managed markers on this line
      // OR the line above (sometimes the marker goes on the preceding
      // explanatory comment line).
      const aboveLine = i > 0 ? lines[i - 1] : '';
      const markerHaystack = aboveLine + '\n' + line;
      const ignoreMatch = markerHaystack.match(IGNORE_MARKER);
      const callerManagedMatch = markerHaystack.match(CALLER_MANAGED_MARKER);
      const windowHasTimeout = TIMEOUT_RE.test(windowLines);

      if (ignoreMatch) {
        sites.push({ file: path, line: lineNum, kind, status: 'ignored', reason: ignoreMatch[1].trim() });
        continue;
      }
      if (callerManagedMatch) {
        sites.push({ file: path, line: lineNum, kind, status: 'caller-managed', reason: callerManagedMatch[1].trim() });
        continue;
      }
      if (windowHasTimeout) {
        sites.push({ file: path, line: lineNum, kind, status: 'native-timeout', reason: 'options object includes timeout:/timeoutMs:' });
        continue;
      }

      violations.push(
        `${path}:${lineNum}: ${kind}() call has no \`timeout:\`/\`timeoutMs:\` in its options object, no \`// spawn-discipline: ignore <reason>\` marker, and no \`// spawn-discipline: caller-managed <ref>\` marker on this line or the line above. Per design §8.5, every production subprocess spawn must declare its timeout contract.`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error(`validate-spawn-discipline: FAIL — ${violations.length} undeclared spawn site(s)`);
  for (const v of violations) console.error('  ' + v);
  console.error('');
  console.error('  Fix options on each line:');
  console.error('    1. Add `timeout:` or `timeoutMs:` to the spawn options object (Node\'s native).');
  console.error('    2. Add `// spawn-discipline: caller-managed <ref>` if a separate helper handles the kill chain (e.g., terminateSubprocess).');
  console.error('    3. Add `// spawn-discipline: ignore <reason>` for detached fire-and-forget where parent-side timeout is incorrect.');
  process.exit(1);
}

const byStatus = sites.reduce((acc, s) => {
  acc[s.status] = (acc[s.status] || 0) + 1;
  return acc;
}, {});
const statusSummary = Object.entries(byStatus)
  .map(([k, v]) => `${v} ${k}`)
  .join(', ');

console.log(
  `validate-spawn-discipline: OK — ${sites.length} spawn site(s) scanned across ${SCAN_DIRS.join(' + ')}; ${statusSummary || 'none'}`,
);
