// Subcommand registry for cmk.
//
// Single source of truth for every verb the CLI accepts. Each entry
// describes one verb + (optionally) its sub-verbs. v0.1.0 implements
// verbs incrementally — each task in tasks.md replaces one stub with
// a real action. Verbs still on stub print a "not yet implemented in
// v0.1.0 milestone N" notice (N = the tasks.md task that lights it up).
//
// The `milestone` field references the tasks.md parent task that will
// implement the subcommand. Use "v0.1.x" for verbs deferred past v0.1
// (per design §12 but not in the v0.1.0 critical path).
//
// Adding a new verb? Append to `subcommands` below — the test suite
// asserts exactly what's exported here, so coverage stays automatic.

import { install as installAction } from './install.mjs';
import { removeClaudeMdBlock } from './claude-md.mjs';
import { resolve as resolvePath } from 'node:path';

const NOTICE_PREFIX = 'not yet implemented in v0.1.0';

/**
 * Real `cmk install` action — wired in Task 3, extended in Task 4 with
 * --force passed through to the CLAUDE.md downgrade guard. Reads CLI
 * options/flags, dispatches to the install module, prints a one-line
 * summary, and reports the CLAUDE.md action (created / appended /
 * replaced / upgraded / downgrade-blocked / forced-downgrade / unchanged).
 */
async function runInstall(options /* , command */) {
  const result = await installAction({ force: !!(options && options.force) });
  const parts = [
    `scaffolded ${result.created.length} file(s)`,
    result.skipped.length ? `skipped ${result.skipped.length} existing` : null,
    `.gitignore=${result.gitignore.action}`,
    `CLAUDE.md=${result.claudeMd.action}`,
  ].filter(Boolean);
  console.log('cmk install: ' + parts.join(', '));

  if (result.claudeMd.action === 'downgrade-blocked') {
    console.error(
      `  warning: CLAUDE.md already has a newer kit block (v${result.claudeMd.oldVersion}). ` +
        `Re-run with --force to downgrade.`
    );
  }

  if (result.errors.length > 0) {
    for (const e of result.errors) console.error(`  error: ${e.path}: ${e.error}`);
    process.exitCode = 1;
  }
}

/**
 * `cmk uninstall` — wired in Task 4. Strips the kit-managed block from
 * the project's CLAUDE.md (if present). Everything outside the markers
 * is byte-preserved. Does NOT touch context/, context.local/, the user
 * tier, or .gitignore — `cmk uninstall` is conservative; users delete
 * those by hand if they really want to.
 */
function runUninstall(/* options, command */) {
  const projectRoot = resolvePath(process.cwd());
  const result = removeClaudeMdBlock({ projectRoot });
  console.log(`cmk uninstall: CLAUDE.md=${result.action} (${result.path})`);
  if (result.action === 'not-found') {
    console.log('  (no kit-managed block found; CLAUDE.md left unchanged)');
  } else if (result.action === 'no-file') {
    console.log('  (no CLAUDE.md to uninstall from)');
  }
}

/** Helper: build a stub action that prints the standard notice + exits 0. */
function stub(name, milestone, extra) {
  return function action(/* args, options */) {
    const tail = milestone === 'v0.1.x' ? `${milestone}` : `milestone ${milestone}`;
    const detail = extra ? ` (${extra})` : '';
    console.log(`cmk ${name}: ${NOTICE_PREFIX} (${tail})${detail}`);
    // commander already returns to its caller; explicit exit not needed for
    // stubs and would prevent the test harness from running multiple cases.
  };
}

/**
 * @typedef {Object} ArgSpec
 * @property {string} flags        - commander argument string, e.g. "<id>" or "[query...]"
 * @property {string} description
 *
 * @typedef {Object} OptionSpec
 * @property {string} flags        - commander option flags, e.g. "--dry-run"
 * @property {string} description
 *
 * @typedef {Object} SubcommandChild
 * @property {string} name
 * @property {string} description
 * @property {ArgSpec[]=}    argSpec
 * @property {OptionSpec[]=} optionSpec
 *
 * @typedef {Object} Subcommand
 * @property {string} name
 * @property {string} description
 * @property {string|number} milestone    - tasks.md task number or "v0.1.x"
 * @property {ArgSpec[]=}    argSpec
 * @property {OptionSpec[]=} optionSpec
 * @property {SubcommandChild[]=} children
 * @property {(name?: string, ...rest: any[]) => void} action
 */

/** @type {Subcommand[]} */
export const subcommands = [
  {
    name: 'install',
    description: 'cross-OS one-shot install — scaffold 3-tier dirs + inject .gitignore (CLAUDE.md block follows in Task 4)',
    milestone: 3,
    optionSpec: [
      { flags: '--force', description: 'allow downgrade of an existing newer-version block (reserved for Task 4)' },
    ],
    action: runInstall,
  },
  {
    name: 'uninstall',
    description: 'remove the CLAUDE.md kit block (preserves everything else byte-for-byte)',
    milestone: 4,
    action: runUninstall,
  },
  {
    name: 'init-user-tier',
    description: 'scaffold ~/.claude-memory-kit/ (honors $MEMORY_KIT_USER_DIR override)',
    milestone: 14,
    action: stub('init-user-tier', 14),
  },
  {
    name: 'search',
    description: 'search memory — hybrid keyword + optional semantic',
    milestone: 30,
    argSpec: [{ flags: '<query...>', description: 'query terms' }],
    optionSpec: [
      { flags: '--mode <mode>', description: 'keyword | semantic | hybrid (default: hybrid if available, else keyword)' },
      { flags: '--min-trust <level>', description: 'low | medium | high' },
      { flags: '--tier <tier>', description: 'U | P | L (filter to a single tier)' },
      { flags: '--since <date>', description: 'ISO date — exclude observations older than this' },
      { flags: '--limit <n>', description: 'max results (default: 20)' },
      { flags: '--include-tombstoned', description: 'include deleted observations in results' },
    ],
    action: stub('search', 30),
  },
  {
    name: 'reindex',
    description: 'rebuild SQLite + FTS5 cache from markdown sources',
    milestone: 29,
    optionSpec: [
      { flags: '--boot', description: 'incremental — re-index only changed files (default)' },
      { flags: '--full', description: 'drop the cache and rebuild from scratch' },
    ],
    action: stub('reindex', 29),
  },
  {
    name: 'doctor',
    description: 'run health checks HC-1..HC-8; print structured report with self-repair commands',
    milestone: 37,
    action: stub('doctor', 37),
  },
  {
    name: 'config',
    description: 'settings access (per design §7.2)',
    milestone: 'v0.1.x',
    optionSpec: [
      { flags: '--show-origin <key>', description: 'print where each value comes from (project / user / local tier)' },
    ],
    children: [
      {
        name: 'get',
        description: 'print the resolved value of a setting',
        argSpec: [{ flags: '<key>', description: 'setting key (dotted path)' }],
      },
      {
        name: 'set',
        description: 'set a setting in the current tier',
        argSpec: [
          { flags: '<key>', description: 'setting key (dotted path)' },
          { flags: '<value>', description: 'new value' },
        ],
      },
    ],
    action: stub('config', 'v0.1.x'),
  },
  {
    name: 'view',
    description: 'open a local markdown viewer at 127.0.0.1:37778',
    milestone: 'v0.1.x',
    optionSpec: [{ flags: '--port <n>', description: 'override default port 37778' }],
    action: stub('view', 'v0.1.x'),
  },
  {
    name: 'import-anthropic-memory',
    description: "merge useful bullets from Anthropic's auto-memory into this project's MEMORY.md",
    milestone: 38,
    optionSpec: [{ flags: '--dry-run', description: 'print proposed additions without modifying files' }],
    action: stub('import-anthropic-memory', 38),
  },
  {
    name: 'trust',
    description: 'manually override the trust level of an observation',
    milestone: 15,
    argSpec: [
      { flags: '<id>', description: 'citation ID (e.g. P-A8FN3MQ2)' },
      { flags: '<level>', description: 'low | medium | high' },
    ],
    action: stub('trust', 15),
  },
  {
    name: 'lessons',
    description: 'promote project-tier observations to the user-tier LESSONS.md',
    milestone: 'v0.1.x',
    children: [
      {
        name: 'promote',
        description: 'move a project observation to ~/.claude-memory-kit/LESSONS.md',
        argSpec: [{ flags: '<id>', description: 'citation ID' }],
      },
    ],
    action: stub('lessons', 'v0.1.x'),
  },
  {
    name: 'queue',
    description: 'review medium-trust auto-extracts and resolve conflicting observations',
    milestone: 26,
    children: [
      { name: 'review', description: 'walk pending medium-trust auto-extracts; promote / discard / skip' },
      { name: 'conflicts', description: 'walk pending conflicts; keep-old / keep-new / merge-both / skip' },
    ],
    action: stub('queue', 26),
  },
  {
    name: 'forget',
    description: 'tombstone an observation (preserves audit trail; never silent delete)',
    milestone: 9,
    argSpec: [{ flags: '<id-or-query>', description: 'citation ID or substring query against canonical text' }],
    optionSpec: [{ flags: '--yes', description: 'skip the interactive confirmation prompt (tests + scripts)' }],
    action: stub('forget', 9),
  },
  {
    name: 'purge',
    description: 'permanent deletion of an observation — rare; bypasses the tombstone audit trail',
    milestone: 'v0.1.x',
    argSpec: [{ flags: '<id>', description: 'citation ID' }],
    optionSpec: [{ flags: '--hard', description: 'required confirmation flag' }],
    action: stub('purge', 'v0.1.x', 'use `cmk forget` for normal deletion; this is for emergencies only'),
  },
  {
    name: 'roll',
    description: 'force-roll the rolling-window pipeline (same internals as SessionEnd / cron)',
    milestone: 39,
    optionSpec: [{ flags: '--scope <scope>', description: 'now (default) | today | recent' }],
    action: stub('roll', 39),
  },
  {
    name: 'repair',
    description: 'idempotent self-repair — re-register hooks, reset stale locks, rebuild index',
    milestone: 39,
    optionSpec: [
      { flags: '--hooks', description: 're-register hooks from template' },
      { flags: '--locks', description: 'clear stale locks (>1h old)' },
      { flags: '--index', description: 'invoke `cmk reindex --full`' },
    ],
    action: stub('repair', 39),
  },
  {
    name: 'mcp',
    description: 'run the MCP server over stdio (invoked by Claude Code, not by humans)',
    milestone: 31,
    children: [{ name: 'serve', description: 'start the stdio MCP server; JSON-RPC on stdin/stdout' }],
    action: stub('mcp', 31),
  },
  {
    name: 'version',
    description: 'print the cmk version (alias for --version)',
    milestone: 'always',
    action: function action() {
      // version is special — never a stub. Print and continue.
      // The shared --version flag is wired in index.mjs; this verb
      // exists for parity with design §12 and prints the same string.
      // Implementation note: we resolve the version from package.json
      // already done at program-build time, so this can simply call into
      // the main flag handler via process.exit after printing.
      // For v0.1.0 stub-only milestone, defer the actual print to the
      // top-level --version handler.
      console.log(`cmk version: see \`cmk --version\``);
    },
  },
];

/** Names list — handy for tests + help-output assertions. */
export const subcommandNames = subcommands.map((s) => s.name);

/** Notice string — exposed so tests can assert it appears in every stub output. */
export const STUB_NOTICE_PREFIX = NOTICE_PREFIX;
