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

import { install as installAction, initUserTier as initUserTierAction } from './install.mjs';
import { removeClaudeMdBlock } from './claude-md.mjs';
import { reindex as reindexAction } from './reindex.mjs';
import { forget as forgetAction } from './forget.mjs';
import { overrideTrust as overrideTrustAction } from './trust.mjs';
import { resolveConflictQueue, mergeScratchpadBullets } from './conflict-queue.mjs';
import { resolveReviewQueue } from './review-queue.mjs';
import { createInterface } from 'node:readline';
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

/**
 * `cmk init-user-tier` — wired in Task 14. User-tier-only install.
 * Scaffolds USER.md, HABITS.md, LESSONS.md, fragments/ at the
 * resolved user-tier path. Does NOT touch project/local tier files
 * or .gitignore or CLAUDE.md (call `cmk install` for that).
 */
function runInitUserTier(/* options, command */) {
  const result = initUserTierAction({});
  console.log(
    `cmk init-user-tier: scaffolded ${result.created.length} file(s)` +
      (result.skipped.length ? `, skipped ${result.skipped.length} existing` : '') +
      ` at ${result.userTier}`,
  );
  if (result.errors.length > 0) {
    for (const e of result.errors) console.error(`  error: ${e.path}: ${e.error}`);
    process.exitCode = 1;
  }
}

/**
 * `cmk trust <id> <level>` — wired in Task 15. Updates the `trust:`
 * field in BOTH the matched fact file (YAML frontmatter) AND any
 * scratchpad bullet with the matching id (HTML-comment provenance).
 * Writes a canonical audit-log entry per design §6.1 + spec 15.3.
 */
function runTrust(id, level /* , options, command */) {
  const projectRoot = resolvePath(process.cwd());
  const result = overrideTrustAction({ id, level, projectRoot });
  if (result.action === 'trust-updated') {
    console.log(
      `cmk trust: ${result.id} (${result.tier}) → ${result.level} — updated ${result.updatedLocations.length} location(s)`,
    );
    for (const loc of result.updatedLocations) {
      console.log(`  ${loc.type}: ${loc.path} (was ${loc.priorTrust})`);
    }
    return;
  }
  if (result.action === 'not-found') {
    console.error(`cmk trust: ${result.errors[0]}`);
    process.exitCode = 2;
    return;
  }
  if (result.action === 'error') {
    for (const e of result.errors) console.error(`cmk trust: ${e}`);
    process.exitCode = 2;
  }
}

/**
 * `cmk reindex` — wired in Task 8. Walks the project tier's granular
 * archive (context/memory/*.md), rebuilds INDEX.md as a pointer index
 * per design §2.3. The SQLite + FTS5 cache rebuild (--boot / --full
 * flags) lands in Task 29; for now those flags are declared but no-op.
 */
function runReindex(/* options, command */) {
  const projectRoot = resolvePath(process.cwd());
  const result = reindexAction({ tier: 'P', projectRoot });
  console.log(
    `cmk reindex: tier=${result.tier} facts=${result.factCount} bytes=${result.bytes} (${result.indexPath})`,
  );
  // reindex() already emits warnings to stderr via its `warn` callback default.
}

/**
 * `cmk forget <id-or-query>` — wired in Task 9. Tombstones the matching
 * fact (moves it to <tier>/<memory|fragments>/archive/tombstones/<id>.md
 * with deleted_at/deleted_reason/deleted_by frontmatter) and strips any
 * citing bullets from same-tier scratchpads.
 *
 * v0.1 requires --yes — the interactive confirmation prompt is a v0.1.x
 * follow-up (the boundary's `confirm()` callback path is still tested by
 * cli-forget.test.js; the CLI just doesn't wire stdin readline yet).
 */
function runForget(idOrQuery, options /* , command */) {
  if (!options.yes) {
    console.error(
      'cmk forget: --yes is required in v0.1.0 (interactive confirmation prompt is a v0.1.x follow-up). Re-run with --yes to confirm tombstoning.',
    );
    process.exitCode = 2;
    return;
  }
  const projectRoot = resolvePath(process.cwd());
  const result = forgetAction({
    idOrQuery,
    projectRoot,
    reason: options.reason,
    deletedBy: options.deletedBy,
    yes: true,
  });

  if (result.action === 'tombstoned') {
    console.log(
      `cmk forget: tombstoned ${result.id} (${result.tier}) → ${result.tombstonePath}`,
    );
    if (result.scratchpadEdits.length > 0) {
      const total = result.scratchpadEdits.reduce((n, e) => n + e.removed, 0);
      console.log(
        `  scrubbed ${total} bullet(s) across ${result.scratchpadEdits.length} scratchpad(s)`,
      );
    }
    return;
  }
  if (result.action === 'not-found') {
    console.error(`cmk forget: ${result.errors[0]}`);
    process.exitCode = 2;
    return;
  }
  if (result.action === 'error') {
    for (const e of result.errors) console.error(`cmk forget: ${e}`);
    process.exitCode = 2;
    return;
  }
  // cancelled (won't fire here since we pass yes:true above, but defensive)
  console.log('cmk forget: cancelled');
}

/**
 * Real `cmk queue` dispatcher — Task 25. Routes by sub-verb:
 *   - 'conflicts' → wire to resolveConflictQueue with a readline-based
 *     interactive prompter. merge-both decisions dispatch to mergeFacts.
 *   - 'review' → still stubbed (Task 26 / v0.1.x); print the standard
 *     notice.
 */
async function runQueueDispatch(childName) {
  if (childName === 'conflicts') {
    return runQueueConflicts();
  }
  if (childName === 'review') {
    return runQueueReview();
  }
  console.log(`cmk queue: ${NOTICE_PREFIX} (unknown sub-verb '${childName}')`);
  process.exitCode = 2;
}

/**
 * Interactive resolver for `cmk queue conflicts`. Walks pending
 * entries one-at-a-time, prints existing + proposed text, asks for
 * one of `keep-old` / `keep-new` / `merge-both` / `skip`. Loops
 * until the queue is empty or the user signals end-of-input.
 *
 * For v0.1.0 this resolves the PROJECT tier's conflicts queue (the
 * canonical kit usage). User-tier / language-tier conflicts queues
 * can be added when the kit's CLI gains explicit `--tier` selection.
 */
async function runQueueConflicts() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const askOnce = (q) =>
    new Promise((resolve) => {
      rl.question(q, (answer) => resolve(answer));
    });

  const VALID_DECISIONS = new Set(['keep-old', 'keep-new', 'merge-both', 'skip']);

  const prompter = async ({
    proposedId,
    proposedText,
    proposedTrust,
    existingId,
    existingText,
    existingTrust,
    similarity,
  }) => {
    console.log('');
    console.log('─── pending conflict ──────────────────────────────────────');
    console.log(`existing  (${existingId}, trust=${existingTrust}): ${existingText}`);
    console.log(`proposed  (${proposedId}, trust=${proposedTrust}): ${proposedText}`);
    console.log(`similarity: ${Number(similarity).toFixed(4)}`);
    let decision = '';
    while (!VALID_DECISIONS.has(decision)) {
      const answer = await askOnce(
        `  [keep-old / keep-new / merge-both / skip]: `,
      );
      decision = String(answer).trim();
      if (!VALID_DECISIONS.has(decision)) {
        console.log(
          `  unknown answer "${decision}" — please type one of: keep-old, keep-new, merge-both, skip`,
        );
      }
    }
    return decision;
  };

  // merge-both wiring (Task 25b — closes Task 25's cross-layer
  // composition gap). The proposed bullet from the conflict queue
  // wasn't materialized as a Layer-2 per-fact file (it was routed to
  // `queues/conflicts.md` instead of MEMORY.md). So we DON'T call
  // `mergeFacts` (Layer 2); we call `mergeScratchpadBullets` (Layer 3)
  // which operates directly on the scratchpad: combines the two
  // bullet texts, writes a new merged bullet with a fresh canonical
  // ID + provenance citing both sources, and mutates both originals'
  // provenance to inject `superseded_by: <newId>`.
  //
  // For Task 25b's v0.1.0 ship, the merger assumes the kit's default
  // scratchpad (MEMORY.md under `context/`) and the section in the
  // queue entry's `existing_section` field (currently the merger
  // accepts an explicit `section` arg; the resolver passes the
  // section title from the original conflict so the new bullet lands
  // in the same heading).
  const mergeFn = async ({
    tier,
    projectRoot,
    userDir,
    proposedId,
    proposedText,
    existingId,
    existingText,
    section,
  }) => {
    // Default scratchpad is MEMORY.md at the project tier. Section
    // comes from the queue entry (which captured it at detect time).
    const scratchpadPath = resolvePath(projectRoot, 'context', 'MEMORY.md');
    const result = mergeScratchpadBullets({
      tier,
      projectRoot,
      userDir,
      scratchpadPath,
      section,
      idA: existingId,
      idB: proposedId,
    });
    if (result.action === 'error') {
      console.error(
        `cmk queue conflicts: merge-both for ${existingId} + ${proposedId} failed: ${result.errors.join('; ')}`,
      );
    } else {
      console.log(
        `  merge-both → ${existingId} + ${proposedId} merged into ${result.id}`,
      );
    }
  };

  try {
    const result = await resolveConflictQueue({
      tier: 'P',
      projectRoot: process.cwd(),
      prompter,
      mergeFn,
    });
    if (result.action === 'error') {
      for (const e of result.errors) console.error(`cmk queue conflicts: ${e}`);
      process.exitCode = 2;
      return;
    }
    console.log('');
    console.log(
      `cmk queue conflicts: ${result.resolved} resolved (${result.kept_old} kept-old, ${result.kept_new} kept-new, ${result.merged} merged), ${result.skipped} skipped`,
    );
  } finally {
    rl.close();
  }
}

/**
 * Interactive resolver for `cmk queue review` (Task 26). Walks
 * pending medium-trust auto-extract candidates one-at-a-time, prints
 * the candidate text + provenance, asks for one of `promote` /
 * `discard` / `skip`. Loops until the queue is empty or user signals
 * end-of-input.
 *
 * Resolves the PROJECT tier's review queue (the canonical kit usage).
 */
async function runQueueReview() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const askOnce = (q) =>
    new Promise((resolve) => {
      rl.question(q, (answer) => resolve(answer));
    });

  const VALID_DECISIONS = new Set(['promote', 'discard', 'skip']);

  const prompter = async ({ id, text, ts, provenance }) => {
    console.log('');
    console.log('─── pending review ────────────────────────────────────────');
    console.log(`id:   ${id}`);
    console.log(`ts:   ${ts}`);
    console.log(`text: ${text}`);
    if (provenance) console.log(`prov: ${provenance.trim()}`);
    let decision = '';
    while (!VALID_DECISIONS.has(decision)) {
      const answer = await askOnce(`  [promote / discard / skip]: `);
      decision = String(answer).trim();
      if (!VALID_DECISIONS.has(decision)) {
        console.log(
          `  unknown answer "${decision}" — please type one of: promote, discard, skip`,
        );
      }
    }
    return decision;
  };

  try {
    const result = await resolveReviewQueue({
      tier: 'P',
      projectRoot: process.cwd(),
      prompter,
    });
    if (result.action === 'error') {
      for (const e of result.errors) console.error(`cmk queue review: ${e}`);
      process.exitCode = 2;
      return;
    }
    console.log('');
    console.log(
      `cmk queue review: ${result.promoted} promoted, ${result.discarded} discarded, ${result.skipped} skipped${result.errors && result.errors.length ? `, ${result.errors.length} errored` : ''}`,
    );
    if (result.errors && result.errors.length) {
      for (const err of result.errors) {
        console.error(
          `  error on ${err.id} (${err.decision}): ${err.errors.join('; ')}`,
        );
      }
    }
  } finally {
    rl.close();
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
    action: runInitUserTier,
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
    description: 'rebuild the markdown INDEX.md pointer index for the project tier',
    milestone: 8,
    optionSpec: [
      { flags: '--boot', description: 'incremental — re-index only changed files (Task 29; ignored for now)' },
      { flags: '--full', description: 'drop the cache and rebuild from scratch (Task 29; ignored for now)' },
    ],
    action: runReindex,
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
    description: 'manually override the trust level of an observation (fact file or scratchpad bullet)',
    milestone: 15,
    argSpec: [
      { flags: '<id>', description: 'citation ID (e.g. P-S79MJHFN)' },
      { flags: '<level>', description: 'low | medium | high' },
    ],
    action: runTrust,
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
    milestone: 25,
    children: [
      { name: 'review', description: 'walk pending medium-trust auto-extracts; promote / discard / skip' },
      { name: 'conflicts', description: 'walk pending conflicts; keep-old / keep-new / merge-both / skip' },
    ],
    action: runQueueDispatch,
  },
  {
    name: 'forget',
    description: 'tombstone an observation (preserves audit trail; never silent delete)',
    milestone: 9,
    argSpec: [{ flags: '<id-or-query>', description: 'citation ID or substring query against canonical text' }],
    optionSpec: [
      { flags: '--yes', description: 'skip the interactive confirmation prompt (required in v0.1.0; interactive prompt is a v0.1.x follow-up)' },
      { flags: '--reason <text>', description: 'deletion reason recorded in the tombstone frontmatter' },
      { flags: '--deleted-by <enum>', description: 'who initiated the deletion (default: user-explicit)' },
    ],
    action: runForget,
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
