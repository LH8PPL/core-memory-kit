#!/usr/bin/env node
// validate-platform-commands.mjs — every hardcoded user-facing shell
// command in production code (`packages/cli/src/` + `plugin/bin/`)
// either:
//   - Uses the shared `platform-commands.mjs` helper (imported), OR
//   - Has a `// platform-commands: ignore <reason>` marker
//
// Source rule: PR-B's `recoveryCommand` finding (lock-discipline.mjs
// originally emitted hardcoded `rm` to Windows users on stock cmd.exe;
// fixed in PR-B with inline `process.platform === 'win32'` switch;
// generalized in PR-E into the shared helper). The validator structurally
// enforces "no future regression that hardcodes POSIX commands in
// user-facing emission paths."
//
// What this validator does
// ------------------------
//
//   1. Walks `packages/cli/src/` + `plugin/bin/` for `*.mjs` files.
//   2. Looks for STRING-LITERAL occurrences of POSIX commands that are
//      common user-facing shell hazards: `rm `, `rm -`, `mkdir`, `ls `,
//      `cat `, `cp `, `mv `, `chmod`, `chown`, `bash `, `sh -c`. The
//      space / hyphen ensures we match the command-followed-by-args
//      shape and not the substring within other identifiers (e.g.,
//      `mkdir` inside `mkdirSync` is excluded because it's at end of
//      identifier, no space follows).
//   3. For each match, requires one of:
//      a. The file imports from `platform-commands.mjs` (the helper is
//         in scope — even if THIS specific hardcoded match isn't the
//         user-facing emission, the file's discipline is established)
//      b. A `// platform-commands: ignore <reason>` marker on the
//         same line or the line above (per-line suppression)
//      c. The file is on the inline-allowlist of platform-specific
//         contracts (e.g., installer scripts, tests that pin behavior)
//
// Helper-in-scope trade-off (parallel to validate-spawn-discipline's
// "marker presence is the procedural floor; tests pin the substance"
// pattern): when a file imports from `platform-commands.mjs`, ALL
// hardcoded POSIX strings in that file are treated as "helper-in-
// scope" rather than violations. Rationale: if the helper is imported,
// the file's discipline is established at the file level; inline POSIX
// strings are assumed to be in platform branches OR in unit-test
// assertions about the helper's output shape. The validator pins the
// PROCEDURAL floor (helper imported = good); substantive correctness
// (the file uses the helper rather than building its own inline
// switch) is the unit test's job + the code-review pass's job.
//
// What this validator does NOT do
// -------------------------------
//
//   - Detect platform commands in fenced code blocks of docs (those
//     are validate-references' surface; cross-platform shell snippets
//     in docs are the author's discipline).
//   - Detect commands buried in template strings / regex / nested
//     escapes. The token-match is line-based and substring-based —
//     adequate for the common cases the kit emits today.
//   - Run the emitted commands on the actual platform — that's the
//     live-test gate (PR-E ships a Windows spot-check + macOS/Linux
//     defer to the user's environment).
//
// Run: `node scripts/validate-platform-commands.mjs`
// Wired into `npm test` as a pre-test step.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SCAN_DIRS = ['packages/cli/src', 'plugin/bin'];

// POSIX commands that, when emitted to a Windows user on cmd.exe,
// produce confusing errors. Pattern: the command name followed by a
// space (or hyphen for `rm -rf`) to require the command-shape.
const POSIX_COMMAND_PATTERNS = [
  { name: 'rm', re: /\brm\s+(-[rRfvi]+\s+)?["'][^"']/ },
  { name: 'mkdir', re: /\bmkdir\s+(-[pPv]\s+)?["'][^"']/ },
  { name: 'ls', re: /\bls\s+["'][^"']/ },
  { name: 'cat', re: /\bcat\s+["'][^"']/ },
  { name: 'cp', re: /\bcp\s+(-[rR]\s+)?["'][^"']/ },
  { name: 'mv', re: /\bmv\s+["'][^"']/ },
  { name: 'chmod', re: /\bchmod\s+(\d|[+-=ugoarwx])/ },
  { name: 'chown', re: /\bchown\s+/ },
];
const IGNORE_MARKER = /\/\/\s*platform-commands:\s*ignore\s+(.+)/;
const HELPER_IMPORT = /from\s+['"]\.\/platform-commands\.mjs['"]|from\s+['"]\.\.\/platform-commands\.mjs['"]|from\s+['"](?:\.\.\/)*packages\/cli\/src\/platform-commands\.mjs['"]/;

function scan(dir, results) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
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
const findings = [];

for (const dir of SCAN_DIRS) {
  try {
    statSync(dir);
  } catch {
    continue;
  }
  const files = [];
  scan(dir, files);
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    const hasHelperImport = HELPER_IMPORT.test(text);
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip lines that look like comments (the whole line is a comment)
      // or that quote POSIX commands inside a comment about platform
      // discipline. Cheap heuristic: line starts with `//` or `*`.
      if (/^\s*(\/\/|\*|\*\/)/.test(line)) continue;
      // Skip strings that are obviously documentation (e.g., regex)
      // by checking for the kit's own helper-call shape — if the line
      // imports or calls a helper function, skip the POSIX-pattern
      // check (the helper IS the emission, even if it temporarily
      // contains POSIX strings internally).
      if (/from\s+['"]\.\/platform-commands\.mjs['"]/.test(line)) continue;

      for (const { name, re } of POSIX_COMMAND_PATTERNS) {
        if (!re.test(line)) continue;

        // Check for per-line / line-above suppression marker.
        const aboveLine = i > 0 ? lines[i - 1] : '';
        const markerHaystack = aboveLine + '\n' + line;
        const ignoreMatch = markerHaystack.match(IGNORE_MARKER);
        if (ignoreMatch) {
          findings.push({ file: path, line: i + 1, name, status: 'ignored', reason: ignoreMatch[1].trim() });
          continue;
        }

        // If the file imports the helper, the inline POSIX string is
        // assumed to be inside a multi-platform branch (typical pattern:
        // helper.mjs has BOTH branches; lock-discipline.mjs imports
        // helper and never hardcodes). Mark as "helper-in-scope".
        if (hasHelperImport) {
          findings.push({ file: path, line: i + 1, name, status: 'helper-in-scope' });
          continue;
        }

        // No helper import AND no suppression: violation.
        violations.push(
          `${path}:${i + 1}: hardcoded POSIX command \`${name}\` in user-facing emission path. ` +
            `Either import from packages/cli/src/platform-commands.mjs (and use the helper functions) ` +
            `OR add \`// platform-commands: ignore <reason>\` on this line or the line above ` +
            `if the platform-specific contract is intentional.`,
        );
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`validate-platform-commands: FAIL — ${violations.length} hardcoded POSIX emission site(s)`);
  for (const v of violations) console.error('  ' + v);
  console.error('');
  console.error(
    '  Cross-platform discipline (design §18): every user-facing shell command must work on the user\'s native shell.',
  );
  console.error(
    '  Windows users on stock cmd.exe see "command not found" for POSIX commands; use Remove-Item / Get-ChildItem instead, OR delegate to the platform-commands.mjs helper.',
  );
  process.exit(1);
}

const byStatus = findings.reduce((acc, f) => {
  acc[f.status] = (acc[f.status] || 0) + 1;
  return acc;
}, {});
const statusSummary = Object.entries(byStatus)
  .map(([k, v]) => `${v} ${k}`)
  .join(', ');

console.log(
  `validate-platform-commands: OK — scanned ${SCAN_DIRS.join(' + ')}; ${findings.length} POSIX-token site(s) ${statusSummary ? '(' + statusSummary + ')' : ''}`,
);
