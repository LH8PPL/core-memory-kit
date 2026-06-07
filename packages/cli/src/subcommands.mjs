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
import { openIndexDb } from './index-db.mjs';
import { reindexBoot, reindexFull } from './index-rebuild.mjs';
import { search as searchAction, SEARCH_MODES } from './search.mjs';
import { memoryWrite } from './memory-write.mjs';
import { runMcpServer } from './mcp-server.mjs';
import { dailyDistill } from './daily-distill.mjs';
import { weeklyCurate } from './weekly-curate.mjs';
import { autoPersona } from './auto-persona.mjs';
import { exportPersona, importPersona } from './persona-portability.mjs';
import { setNativeAutoMemory, nativeMemoryInstallNote } from './native-memory.mjs';
import { writeFact } from './write-fact.mjs';
import { buildRichFactBody, slugifyFact } from './rich-fact.mjs';
import { readHookStdin } from './read-hook-stdin.mjs';
import { createHash } from 'node:crypto';
import { runLazyCompress } from './lazy-compress.mjs';
import { runDoctor } from './doctor.mjs';
import { importAnthropicMemory } from './import-anthropic-memory.mjs';
import { extractTranscript, discoverSessions } from './transcripts.mjs';
import { runRepair } from './repair.mjs';
import { runRoll, ROLL_SCOPES } from './roll.mjs';
import { lessonsPromote } from './lessons-promote.mjs';
import {
  markCronRegistered,
  unmarkCronRegistered,
} from './lazy-compress.mjs';
import {
  registerCron,
  unregisterCron,
  CRON_ENTRY_NAME,
  WEEKLY_ENTRY_NAME,
  DEFAULT_WEEKLY_SCHEDULE,
} from './register-crons.mjs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readFileSync } from 'node:fs';

const __filename_subcommands = fileURLToPath(import.meta.url);
const __dirname_subcommands = dirname(__filename_subcommands);
import { homedir } from 'node:os';
import { forget as forgetAction } from './forget.mjs';
import { overrideTrust as overrideTrustAction } from './trust.mjs';
import { resolveConflictQueue, mergeScratchpadBullets } from './conflict-queue.mjs';
import { resolveReviewQueue } from './review-queue.mjs';
import { createInterface } from 'node:readline';
import { resolve as resolvePath, join, basename } from 'node:path';

const NOTICE_PREFIX = 'not yet implemented in v0.1.0';

/**
 * Real `cmk install` action — wired in Task 3, extended in Task 4 with
 * --force passed through to the CLAUDE.md downgrade guard. Reads CLI
 * options/flags, dispatches to the install module, prints a one-line
 * summary, and reports the CLAUDE.md action (created / appended /
 * replaced / upgraded / downgrade-blocked / forced-downgrade / unchanged).
 */
async function runInstall(options /* , command */) {
  // commander maps `--no-hooks` to options.hooks === false.
  const noHooks = !!(options && options.hooks === false);
  const verbose = !!(options && options.verbose);
  const result = await installAction({ force: !!(options && options.force), noHooks });

  // Outcome over inventory (self-test UX finding): state the resulting state +
  // next action, not a file tally. The old "scaffolded 5, skipped 4 existing"
  // read like a problem on a FRESH folder — the "skipped" are the cross-project
  // user tier at ~/.claude-memory-kit/ (OUTSIDE this folder), already on disk.
  // The full per-tier breakdown is --verbose only.
  const projectName = basename(resolvePath(process.cwd()));
  const wired =
    result.hooks.action === 'wired' || result.hooks.action === 'unchanged';
  const broughtSomethingNew =
    result.created.length > 0 ||
    result.gitignore.action === 'created' ||
    result.claudeMd.action === 'created';

  if (broughtSomethingNew) {
    console.log(
      `cmk install: ${projectName} ready — context/ scaffolded${
        wired ? ', hooks wired' : ''
      }.`,
    );
  } else {
    console.log(
      `cmk install: ${projectName} already set up (your edits preserved)${
        wired ? ', hooks refreshed' : ''
      }.`,
    );
  }
  if (wired) {
    console.log(
      '  Restart Claude Code to activate. Complete install — no separate /plugin step needed.',
    );
  }
  // Task 60 / ADR-0011 heads-up: the kit coexists with Claude Code's native
  // Auto Memory by default; surface the one-command opt-out (null when already
  // opted out, so we don't nag).
  const nativeNote = nativeMemoryInstallNote(result.projectRoot);
  if (nativeNote) console.log(nativeNote);
  if (verbose) {
    console.log(
      `  files: ${result.created.length} created, ${result.skipped.length} already present` +
        (result.skipped.length
          ? ' (incl. the cross-project user tier at ~/.claude-memory-kit/, outside this folder)'
          : ''),
    );
    console.log(
      `  .gitignore=${result.gitignore.action} · CLAUDE.md=${result.claudeMd.action} · hooks=${result.hooks.action}`,
    );
  }

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
 * `cmk lessons promote <id> [--to <file>] [--section <title>]` — Task 76.
 *
 * The explicit half of the wedge: carry a project observation across ALL your
 * projects. Routes through the safe promote path (home-path sanitization,
 * Poison_Guard, dedup, audit trail) — never hand-edits the user-tier files.
 */
function runLessonsPromote(id, options = {}) {
  const projectRoot = resolvePath(process.cwd());
  const userDir =
    process.env.MEMORY_KIT_USER_DIR ?? join(homedir(), '.claude-memory-kit');
  const result = lessonsPromote({
    id,
    projectRoot,
    userDir,
    to: options.to,
    section: options.section,
  });
  if (result.action === 'promoted') {
    console.log(`cmk lessons promote: ${result.id} → ${result.target} § ${result.section}`);
    return;
  }
  if (result.action === 'queued') {
    // Exit 3 (not 2): the fact is durably SAVED to the review queue — it didn't
    // fail, it just needs a `cmk queue review` to land in the persona. Distinct
    // from the genuine-error exits (2) so scripts can tell them apart.
    console.error(
      `cmk lessons promote: saved to the user-tier review queue (${result.reason}) — run \`cmk queue review\` to land it`,
    );
    process.exitCode = 3;
    return;
  }
  if (result.action === 'not-found') {
    console.error(`cmk lessons promote: ${result.errors[0]}`);
    process.exitCode = 2;
    return;
  }
  if (result.action === 'error') {
    for (const e of result.errors) console.error(`cmk lessons promote: ${e}`);
    process.exitCode = 2;
  }
}

/**
 * `cmk search` — Task 30. Hybrid keyword + optional semantic.
 *
 * v0.1.0 ships the keyword backend (FTS5 BM25 over the observations
 * index). Semantic + hybrid modes require the Layer 5b memsearch+Milvus
 * install which isn't bundled in v0.1.0; both error with exit code 2
 * and a clear "memsearch not installed" hint per tasks.md 30.2.
 *
 * Filter flags (per tasks.md 30.4):
 *   --mode <keyword|semantic|hybrid>   (default keyword)
 *   --min-trust <low|medium|high>
 *   --tier <U|P|L>
 *   --since <ISO date>
 *   --limit <N>                        (default 20)
 *   --include-tombstoned               (default false)
 */
function runSearch(queryParts, options) {
  const projectRoot = resolvePath(process.cwd());
  const userDir =
    process.env.MEMORY_KIT_USER_DIR ?? join(homedir(), '.claude-memory-kit');
  const query = Array.isArray(queryParts) ? queryParts.join(' ') : queryParts;
  const db = openIndexDb({ projectRoot });
  try {
    // Refresh the index before querying. On a fresh install the FTS5 index
    // is empty (auto-extract writes facts to MEMORY.md but doesn't reindex,
    // and the runtime chokidar watcher isn't running for a one-shot CLI
    // call), so without this `cmk search` returns "no results" for facts
    // that are sitting right there in the scratchpads (self-test finding
    // #0). reindexBoot is incremental — mtime/sha1 diff, only changed files
    // — so it's cheap to run on every search. Degrade gracefully: a reindex
    // failure falls back to whatever's already indexed rather than crashing
    // the query.
    try {
      reindexBoot({ projectRoot, userDir, db });
    } catch (err) {
      console.error(
        `cmk search: index refresh failed (${err?.message ?? err}); ` +
          'searching the existing index. Run `cmk reindex --full` if results look stale.',
      );
    }
    const r = searchAction({
      db,
      query,
      mode: options?.mode ?? SEARCH_MODES.KEYWORD,
      minTrust: options?.minTrust,
      tier: options?.tier,
      since: options?.since,
      limit: options?.limit !== undefined ? Number(options.limit) : undefined,
      includeTombstoned: options?.includeTombstoned === true,
    });
    if (r.action === 'error') {
      for (const e of r.errors) console.error(`cmk search: ${e}`);
      // Exit 2 per tasks.md 30.2 contract for semantic-unavailable; schema
      // errors are exit 2 by general kit convention too.
      process.exitCode = 2;
      return;
    }
    if (r.results.length === 0) {
      console.log('cmk search: no results');
      return;
    }
    for (const hit of r.results) {
      // Plain-text output suitable for terminal piping. Snippet uses
      // FTS5's <b>...</b> markers; preserved as-is so callers can pipe
      // to a TUI that renders them OR strip via sed.
      console.log(
        `${hit.id}\t${hit.tier}/${hit.trust}\t${hit.source_file}:${hit.source_line}\t${hit.snippet}`,
      );
    }
    console.log(
      `\ncmk search: ${r.results.length} result(s) (mode=${r.mode})`,
    );
  } finally {
    db.close();
  }
}

/**
 * `cmk reindex` — three modes.
 *
 *   no flag    Markdown INDEX.md rebuild only (Task 8 behavior). Backward-
 *              compat for callers that haven't adopted the SQLite layer.
 *   --boot     Same as no-flag PLUS SQLite boot diff (Task 29). Reindexes
 *              only the source files whose sha1 differs from the `files`
 *              checkpoint table. Fast on a warm cache.
 *   --full    Same as no-flag PLUS SQLite full rebuild (Task 29). DROPs
 *              observations / observations_fts / files; walks every source
 *              and rebuilds. Recovery path for a corrupted index.
 *
 * Flag semantics per tasks.md 29.1 + 29.3. Markdown INDEX runs in every
 * mode because (a) it's cheap (milliseconds to milliseconds-low-thousands),
 * (b) keeping it always-current avoids users having to think about which
 * index to rebuild when.
 */
/**
 * `cmk remember <text...>` — explicit durable capture (write-path fix #0b).
 *
 * Writes a provenance-tracked bullet to MEMORY.md (the session-start-recalled
 * layer) through the SAME hardened path as auto-extract: Poison_Guard +
 * home-path abstraction (#1) + conflict detection + dedup. This is the entry
 * the scaffolded CLAUDE.md points the agent at INSTEAD of freehand-writing
 * fact files — which produced wrong-schema, unindexable, username-leaking
 * files in the self-test. Guaranteed-correct because it never touches raw
 * frontmatter.
 *
 * Tier: v0.1.0 writes tier P (project MEMORY.md). U/L need per-tier scratchpad
 * routing (same deferral as mk_remember, design §16) — the always-on home-path
 * abstraction is the privacy net regardless of tier.
 */
// Task 63 (F1): a slug derived from the title — lowercased, non-alphanumerics
// collapsed to '-', trimmed, capped. Always passes writeFact's SLUG_PATTERN.
/**
 * `cmk remember --why … --how … --type … --title …` (Task 63 / F1) — RICH
 * capture. Writes a real granular fact file (frontmatter + Why/How/links) via
 * writeFact(), which ALREADY runs home-path sanitization + Poison_Guard + the
 * correct schema. Restores v0.1.1 richness through v0.1.2's safe path. `deps`
 * carries injection seams for testing.
 */
export function runRememberRich(text, options = {}, deps = {}) {
  const projectRoot = deps.projectRoot ?? resolvePath(process.cwd());
  const log = deps.log ?? console.log;
  const logError = deps.logError ?? console.error;
  const write = deps.writeFact ?? writeFact;

  // M2: rich capture writes the project tier (P) in v0.1.x — same deferral as
  // the terse path + mk_remember (U/L need per-tier scratchpad routing, design
  // §16). Terse mode ERRORS on a non-P --tier; rich mode notes it and proceeds
  // (a no-write surprise is worse than a captured-to-P note). Surface it so the
  // divergence isn't silent.
  if (options.tier && options.tier !== 'P') {
    log(
      `cmk remember: --tier '${options.tier}' is v0.1.x — rich capture writes the project tier (P) for now.`,
    );
  }

  const headline = String(text).trim();
  const title = (options.title && String(options.title).trim()) || headline.split('\n')[0].slice(0, 80);
  const body = buildRichFactBody({ text: headline, why: options.why, how: options.how });
  const related = options.links
    ? String(options.links).split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  const r = write({
    tier: 'P',
    type: options.type ?? 'feedback',
    slug: slugifyFact(title),
    title,
    body,
    writeSource: 'user-explicit',
    trust: options.trust ?? 'high',
    sourceFile: 'user-explicit',
    sourceLine: 1,
    // Content fingerprint for provenance/dedup — NOT a security context.
    // Matches the kit's sha1-of-content convention (memory-write.mjs,
    // index-rebuild.mjs); writeFact dedups by content-addressed id, this is
    // just the source_sha1 provenance field. // NOSONAR
    sourceSha1: createHash('sha1').update(body).digest('hex'), // NOSONAR

    related,
    projectRoot,
  });

  if (r.action === 'error') {
    // M1: a collision means a fact file with this title (→ slug) already exists
    // but with different content (different id). Give an actionable hint rather
    // than the raw "refusing overwrite" — the user almost certainly wants to
    // edit the existing fact or pick a new --title.
    if (r.errorCategory === 'collision') {
      logError(
        `cmk remember: a fact titled "${title}" already exists with different content. ` +
          `Edit it directly, or capture under a new --title.`,
      );
      return r;
    }
    logError(`cmk remember: ${(r.errors ?? [r.errorCategory ?? 'error']).join('; ')}`);
    return r;
  }
  if (r.action === 'skipped') {
    log(`cmk remember: already captured (${r.skipReason})${r.id ? ` [${r.id}]` : ''}`);
    return r;
  }
  log(`cmk remember: saved rich fact → ${r.path}${r.id ? ` [${r.id}]` : ''}`);
  return r;
}

/**
 * Task 108.2 (108a) — parse a structured fact from the off-shell input channel
 * (`--from-file <path>` or `--json` stdin). PURE + dependency-injected (the CLI
 * passes real fs readers; tests pass fakes) so every parse/validate/allowlist
 * branch is covered IN-PROCESS — the real-binary subprocess tests prove the CLI
 * wiring but don't contribute line coverage.
 *
 * @param {object} options - subcommand options (fromFile/json + the rich flags).
 * @param {object} deps
 * @param {(path:string)=>string} deps.readFile - read a file to a string (throws on error).
 * @param {()=>string} deps.readStdin - read stdin to a string ('' for TTY/empty).
 * @returns {{ok:true,channel:string,fields:object,ignored:string[]}
 *          | {ok:false,channel:string,error:string,ignored:string[]}}
 */
export function parseFactInput(options, { readFile, readStdin } = {}) {
  const channel = options.fromFile ? '--from-file' : '--json';
  // --from-file/--json are self-contained (the JSON is the whole fact); rich /
  // terse flags passed alongside are ignored — surfaced so they aren't dropped silently.
  const ignored = ['why', 'how', 'type', 'title', 'links', 'tier', 'trust', 'section']
    .filter((k) => options[k] != null)
    .map((k) => '--' + k);
  const fail = (error) => ({ ok: false, channel, error, ignored });

  let raw;
  if (options.fromFile) {
    try {
      raw = readFile(options.fromFile);
    } catch (e) {
      return fail(`${channel} could not read ${options.fromFile}: ${e.message}`);
    }
  } else {
    // '' = interactive TTY or empty pipe (read-hook-stdin returns '' for a TTY).
    raw = readStdin();
    if (!raw || !raw.trim()) {
      return fail('--json expects a JSON object on stdin (pipe it in, or use --from-file).');
    }
  }

  // Bound the input so a pathological file can't burn Poison_Guard regex time
  // (the M1 concern that capped mk_remember). 64 KB is generous for one fact.
  const MAX_INPUT_BYTES = 64 * 1024;
  if (Buffer.byteLength(raw, 'utf8') > MAX_INPUT_BYTES) {
    return fail(`${channel} fact is too large (max ${MAX_INPUT_BYTES / 1024} KB). Split it into smaller facts.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return fail(`${channel} could not parse JSON: ${e.message}`);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    typeof parsed.text !== 'string' ||
    !parsed.text.trim()
  ) {
    return fail(`${channel} JSON must be an object with a non-empty "text" field.`);
  }

  // Allowlist the honored fields — NEVER forward the raw parsed object. A crafted
  // JSON must not reach a field runRememberRich might read; provenance
  // (write_source / source_file) stays hardcoded user-explicit in runRememberRich.
  return {
    ok: true,
    channel,
    ignored,
    fields: {
      text: parsed.text,
      why: parsed.why,
      how: parsed.how,
      type: parsed.type,
      title: parsed.title,
      links: parsed.links,
      tier: parsed.tier,
      trust: parsed.trust,
    },
  };
}

export function runRemember(textParts, options, deps = {}) {
  const projectRoot = deps.projectRoot ?? resolvePath(process.cwd());
  const userDir =
    deps.userDir ?? process.env.MEMORY_KIT_USER_DIR ?? join(homedir(), '.claude-memory-kit');
  const log = deps.log ?? console.log;
  const logError = deps.logError ?? console.error;

  // Task 108.2 (108a) — structured off-shell input. `--from-file`/`--json` carry
  // the fact as a JSON object from a FILE or STDIN, so rich content (backticks,
  // $(), quotes, newlines) never rides the shell command line — the D-81 fix.
  // The parse/validate/allowlist lives in the pure parseFactInput() helper.
  if (options?.fromFile || options?.json) {
    const parsed = parseFactInput(options, {
      readFile: (p) => readFileSync(p, 'utf8'),
      readStdin: () => readHookStdin({ isTTY: process.stdin.isTTY }),
    });
    if (parsed.ignored.length) {
      logError(
        `cmk remember: ${parsed.channel} is self-contained — ignoring ${parsed.ignored.join(', ')} (put these in the JSON instead).`,
      );
    }
    if (!parsed.ok) {
      logError(`cmk remember: ${parsed.error}`);
      process.exitCode = 2;
      return;
    }
    runRememberRich(parsed.fields.text, parsed.fields, { projectRoot, log, logError });
    return;
  }

  const text = Array.isArray(textParts) ? textParts.join(' ') : textParts;
  // Bare `cmk remember` — no positional text and no input channel. The positional
  // arg is optional now (for --from-file/--json), so guard explicitly instead of
  // falling through to a vague empty-text write error.
  if (!text || !String(text).trim()) {
    logError(
      'cmk remember: provide a fact to remember, or use --from-file <json> / --json (stdin).',
    );
    process.exitCode = 2;
    return;
  }
  // Rich mode: any of --why/--how/--type/--title/--links → write a real fact
  // file (the F1 fix) instead of a terse MEMORY.md bullet. M3: --trust and
  // --section are intentionally NOT triggers — --trust is shared by both forms
  // (rich reads it too), and --section is terse-only (a MEMORY.md heading, no
  // meaning for a granular fact file). So `--trust high` alone stays terse.
  if (options?.why || options?.how || options?.type || options?.title || options?.links) {
    runRememberRich(text, options, { projectRoot });
    return;
  }
  const tier = options?.tier ?? 'P';
  if (tier !== 'P') {
    console.error(
      `cmk remember: tier '${tier}' not yet supported — v0.1.0 writes the project tier (P). ` +
        'For machine-only config, edit context.local/machine-paths.md directly (v0.1.x will add --tier routing).',
    );
    process.exitCode = 2;
    return;
  }
  const trust = options?.trust ?? 'high';
  const section = options?.section ?? 'Active Threads';
  const r = memoryWrite({
    action: 'add',
    text,
    tier,
    scratchpad: 'MEMORY.md',
    section,
    trust,
    source: 'user-explicit',
    projectRoot,
    userDir,
  });
  if (r.action === 'error') {
    for (const e of r.errors ?? [`error (${r.errorCategory})`]) {
      console.error(`cmk remember: ${e}`);
    }
    process.exitCode = 2;
    return;
  }
  if (r.action === 'queued') {
    console.log(
      `cmk remember: queued for review — a higher-trust fact already covers this. ` +
        `Resolve with \`cmk queue conflicts\` (${r.path}).`,
    );
    return;
  }
  console.log(
    `cmk remember: saved to P/MEMORY.md (${section})${r.id ? ` [${r.id}]` : ''}`,
  );
}

function runReindex(options /* , command */) {
  const projectRoot = resolvePath(process.cwd());
  const userDir = join(homedir(), '.claude-memory-kit');
  const result = reindexAction({ tier: 'P', projectRoot });
  console.log(
    `cmk reindex: tier=${result.tier} facts=${result.factCount} bytes=${result.bytes} (${result.indexPath})`,
  );
  const useBoot = options?.boot === true;
  const useFull = options?.full === true;
  if (!useBoot && !useFull) return;
  if (useBoot && useFull) {
    console.error('cmk reindex: --boot and --full are mutually exclusive');
    process.exitCode = 2;
    return;
  }
  const db = openIndexDb({ projectRoot });
  try {
    const r = useFull
      ? reindexFull({ projectRoot, userDir, db })
      : reindexBoot({ projectRoot, userDir, db });
    if (useFull) {
      console.log(
        `cmk reindex --full: scanned=${r.filesScanned} observations=${r.observationsAffected} duration=${r.durationMs}ms`,
      );
    } else {
      console.log(
        `cmk reindex --boot: scanned=${r.filesScanned} reindexed=${r.filesReindexed} observations=${r.observationsAffected} duration=${r.durationMs}ms`,
      );
    }
    if (r.skipped && r.skipped.length > 0) {
      for (const s of r.skipped) {
        console.error(`  skipped ${s.path}: ${s.reason}`);
      }
    }
  } finally {
    db.close();
  }
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
/**
 * `cmk mcp <child>` dispatcher (Task 31). Currently one child:
 *   - 'serve' → start the stdio MCP server. Invoked by Claude Code as
 *               a subprocess; runs until stdin closes.
 */
/**
 * `cmk daily-distill` (Task 33) — runs the daily-distill pipeline once.
 * Designed to be invoked by the host scheduler (cron / launchd /
 * schtasks) registered via `cmk register-crons`. Humans normally don't
 * call this directly; they run register-crons once at install time.
 *
 * Always exits 0 — same posture as cmk-compress-session per design §8.6.1.
 */
async function runDailyDistill(/* options */) {
  const projectRoot = resolvePath(process.cwd());
  // Lazy-load HaikuViaAnthropicApi (avoids the dep when running unit tests).
  const { HaikuViaAnthropicApi } = await import('./compressor.mjs');
  try {
    const backend = new HaikuViaAnthropicApi();
    const r = await dailyDistill({ projectRoot, backend });
    if (r.action === 'error') {
      console.error(
        `cmk daily-distill: error (${r.error_category ?? 'unknown'})${r.errorMessage ? `: ${r.errorMessage}` : ''}`,
      );
    } else {
      console.log(
        `cmk daily-distill: ${r.action}${r.reason ? ` (${r.reason})` : ''}${r.bytesIn ? ` (in: ${r.bytesIn}b, out: ${r.bytesOut}b, days: ${r.sourceDays})` : ''}`,
      );
    }
  } catch (err) {
    console.error(`cmk daily-distill: unexpected error: ${err?.message ?? err}`);
  }
}

/**
 * `cmk weekly-curate` (Task 34) — runs the weekly-curate pipeline once.
 * Designed to be invoked by the host scheduler registered via
 * `cmk register-crons` (which registers both daily + weekly entries
 * by default). Humans normally don't invoke this directly.
 */
async function runWeeklyCurate(/* options */) {
  const projectRoot = resolvePath(process.cwd());
  const { HaikuViaAnthropicApi } = await import('./compressor.mjs');
  try {
    const backend = new HaikuViaAnthropicApi();
    const r = await weeklyCurate({ projectRoot, backend });
    if (r.action === 'error') {
      console.error(
        `cmk weekly-curate: error (${r.errorCategory ?? 'unknown'})${(r.errors && r.errors.length) ? `: ${r.errors.join('; ')}` : ''}`,
      );
    } else {
      console.log(
        `cmk weekly-curate: ${r.action}${r.reason ? ` (${r.reason})` : ''}${r.archivedDays ? ` (archived: ${r.archivedDays}d, current: ${r.currentDays}d, in: ${r.bytesIn}b, out: ${r.bytesOut}b)` : ''}`,
      );
    }
  } catch (err) {
    console.error(`cmk weekly-curate: unexpected error: ${err?.message ?? err}`);
  }
}

/**
 * `cmk persona generate` (Task 45 follow-up) — run cross-project persona
 * synthesis ON DEMAND. Classifies this project's captured facts, auto-promotes
 * the high-confidence cross-project doctrine into the user tier (trust:medium),
 * and saves the low/medium-confidence candidates to
 * <userDir>/queues/persona-review.md. Same pipeline weekly-curate runs
 * automatically — this is the manual trigger (a deterministic hook for the
 * fresh-session live test, and for users who want to fill the user tier now).
 */
// `opts` is the Commander options object in production (no relevant keys →
// every field falls back to its default). The injection seams (projectRoot,
// userDir, backend, log, logError) keep the wrapper unit-testable without a
// live `claude --print` spawn — see cli-auto-persona.test.js.
export async function runPersonaGenerate(opts = {}) {
  const projectRoot = opts.projectRoot ?? resolvePath(process.cwd());
  const userDir =
    opts.userDir ?? process.env.MEMORY_KIT_USER_DIR ?? join(homedir(), '.claude-memory-kit');
  const log = opts.log ?? console.log;
  const logError = opts.logError ?? console.error;
  try {
    const backend =
      opts.backend ?? new (await import('./compressor.mjs')).HaikuViaAnthropicApi();
    const r = await autoPersona({ projectRoot, userDir, backend });
    if (r.action === 'error') {
      logError(
        `cmk persona generate: error (${r.errorCategory ?? 'unknown'})${(r.errors && r.errors.length) ? `: ${r.errors.join('; ')}` : ''}`,
      );
      return;
    }
    const promoted = r.promoted?.length ?? 0;
    const superseded = r.superseded?.length ?? 0;
    const queued = r.queued?.length ?? 0;
    const conflicts = r.conflicts?.length ?? 0;
    log(
      `cmk persona generate: ${r.action}${r.reason ? ` (${r.reason})` : ''} — promoted: ${promoted}, superseded: ${superseded}, queued: ${queued}, conflicts: ${conflicts}`,
    );
    if (queued > 0 && r.reviewQueuePath) {
      log(`  ${queued} lower-confidence candidate(s) saved for review → ${r.reviewQueuePath}`);
    }
  } catch (err) {
    logError(`cmk persona generate: unexpected error: ${err?.message ?? err}`);
  }
}

function resolveUserDir() {
  return process.env.MEMORY_KIT_USER_DIR ?? join(homedir(), '.claude-memory-kit');
}

/**
 * `cmk persona export <file>` (Task 72) — bundle the user-tier persona into one
 * portable file to carry to another of YOUR machines.
 */
export function runPersonaExport(file, options = {}) {
  const outFile = file ?? options.out;
  if (!outFile) {
    console.error('cmk persona export: give an output file, e.g. `cmk persona export persona-bundle.json`');
    process.exitCode = 2;
    return;
  }
  const r = exportPersona({ userDir: resolveUserDir(), outFile });
  if (r.action === 'error') {
    console.error(`cmk persona export: ${r.errors?.join('; ') || r.errorCategory}`);
    process.exitCode = 2;
    return;
  }
  console.log(`cmk persona export: ${r.fileCount} files → ${r.path} (${r.bytes} B)`);
  console.log('  Carry it via your own private channel (USB / private git repo / Dropbox), then `cmk persona import` on the other machine.');
}

/**
 * `cmk persona import <file>` (Task 72) — apply a persona bundle to this
 * machine's user tier. Overwrites; any replaced file is backed up first.
 */
export function runPersonaImport(file, options = {}) {
  const inFile = file ?? options.from;
  if (!inFile) {
    console.error('cmk persona import: give a bundle file, e.g. `cmk persona import persona-bundle.json`');
    process.exitCode = 2;
    return;
  }
  const r = importPersona({ userDir: resolveUserDir(), inFile });
  if (r.action === 'error') {
    console.error(`cmk persona import: ${r.errors?.join('; ') || r.errorCategory}`);
    process.exitCode = 2;
    return;
  }
  const bkp = r.backedUp > 0 ? ` (backed up ${r.backedUp} existing file(s) → ${r.backupPath})` : '';
  console.log(`cmk persona import: ${r.fileCount} files → ${resolveUserDir()}${bkp}${r.reindexed ? ' · search reindexed' : ''}`);
}

/**
 * `cmk disable-native-memory` / `cmk enable-native-memory` (Task 60, ADR-0011)
 * — write `autoMemoryEnabled` into the project's committable
 * `.claude/settings.json`. Default install does NOT touch it (coexist); this
 * is the one-command opt-in/out. `opts` carries injection seams for testing.
 */
export function runSetNativeMemory(enabled, opts = {}) {
  const projectRoot = opts.projectRoot ?? resolvePath(process.cwd());
  const log = opts.log ?? console.log;
  const logError = opts.logError ?? console.error;
  const cmd = enabled ? 'enable-native-memory' : 'disable-native-memory';
  const r = setNativeAutoMemory({ projectRoot, enabled });
  if (r.action === 'error') {
    logError(`cmk ${cmd}: ${(r.errors && r.errors.join('; ')) || 'could not update settings.json'}`);
    return r;
  }
  const verb = enabled ? 'enabled' : 'disabled';
  if (r.action === 'unchanged') {
    log(`cmk ${cmd}: Anthropic native Auto Memory already ${verb} for this project (no change).`);
  } else if (enabled) {
    log('Anthropic native Auto Memory re-enabled for this project — native + kit memory will coexist again.');
    log(`  → ${r.settingsPath}  (reverse with \`cmk disable-native-memory\`)`);
  } else {
    log('Anthropic native Auto Memory disabled for this project — the kit is now the sole memory layer (one lean snapshot at session start).');
    log(`  → ${r.settingsPath}  (committable: travels with \`git clone\`; reverse with \`cmk enable-native-memory\`)`);
  }
  return r;
}

/**
 * `cmk register-crons [--dry-run] [--unregister]` (Task 33) — register
 * the daily-distill cron entry on the current platform.
 *
 * Per design §8.6.2 cross-platform mapping. `--dry-run` prints the
 * command without executing — recommended first run so the user
 * sees what host-config will change before granting permissions.
 */
function runRegisterCrons(options /* , command */) {
  const dryRun = options?.dryRun === true;
  const unregister = options?.unregister === true;
  // Task 36 B1+B2 fix: emit the FULL cron command as
  //   "<absolute-node-path>" "<absolute-bin-script-path>" "<absolute-project-root>"
  // Rationale (from the layer-wide review):
  //   B1 — Cron / launchd / schtasks have non-kit default cwd ($HOME, /,
  //   C:\Windows\System32). The bin needs projectRoot resolved AT
  //   registration time, not via cwd at fire time.
  //   B2 — Bare bin names ('cmk-daily-distill') don't PATH-resolve under
  //   the scheduler's restricted PATH (/usr/bin:/bin for launchd; varies
  //   for cron). Emitting absolute paths sidesteps PATH entirely.
  // This also bypasses the npm-installed bin shim (.cmd on Windows;
  // symlink on POSIX) — `node <abs-script>` works directly on every
  // platform regardless of how the kit was installed (npm global,
  // npm link, vendored).
  const nodePath = process.execPath;
  const binDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'bin');
  const projectRoot = resolvePath(process.cwd());

  // Helper: quote a path for the platform's cron-line shell.
  // Linux + macOS: double-quote (the cron line is single-quoted around the
  // whole `echo '...'`; double-quotes inside are safe).
  // Windows: the schtasks /TR value is already double-quoted by registerCron,
  // with `\"` escaping for inner quotes — registerCron's existing
  // escapedCommand handles this.
  const quote = (s) => `"${s}"`;

  const jobs = [
    {
      label: 'daily-distill',
      command: `${quote(nodePath)} ${quote(join(binDir, 'cmk-daily-distill.mjs'))} ${quote(projectRoot)}`,
      entryName: CRON_ENTRY_NAME,
      schedule: undefined, // registerCron default = daily 23:00
    },
    {
      label: 'weekly-curate',
      command: `${quote(nodePath)} ${quote(join(binDir, 'cmk-weekly-curate.mjs'))} ${quote(projectRoot)}`,
      entryName: WEEKLY_ENTRY_NAME,
      schedule: DEFAULT_WEEKLY_SCHEDULE,
    },
  ];
  let anyError = false;
  let anySuccess = false;
  for (const job of jobs) {
    const r = unregister
      ? unregisterCron({ entryName: job.entryName, dryRun })
      : registerCron({
          command: job.command,
          entryName: job.entryName,
          schedule: job.schedule,
          dryRun,
        });
    if (r.action === 'error') {
      anyError = true;
      console.error(
        `cmk register-crons (${job.label}): error — ${(r.errors ?? []).join('; ')}`,
      );
      if (r.error) console.error(`  ${r.error}`);
      if (r.output) console.error(r.output);
      continue;
    }
    anySuccess = true;
    console.log(`cmk register-crons (${job.label}): ${r.action} on ${r.platform}`);
    console.log(`  command: ${r.command}`);
    if (r.output) console.log(`  output: ${r.output.trim()}`);
  }
  // Task 35.3: maintain the cron-registered sentinel so lazy-compress
  // can short-circuit when cron is active. Skip on --dry-run (no
  // host-scheduler state changed, so kit state shouldn't either).
  //
  // M3 fix (skill-review 2026-05-28): anySuccess gates the sentinel
  // write even on PARTIAL failure (one job registered, the other
  // errored). Correct: at least one cron entry is now active, so
  // detectStaleness SHOULD short-circuit to 'cron-active'. The
  // partial failure surfaces to the user via process.exitCode=2 below
  // — kit state (sentinel) and host-scheduler state (the registered
  // job) stay coherent.
  if (!dryRun) {
    const projectRoot = resolvePath(process.cwd());
    if (unregister) {
      unmarkCronRegistered({ projectRoot });
    } else if (anySuccess) {
      markCronRegistered({ projectRoot });
    }
  }
  if (anyError) process.exitCode = 2;
}

/**
 * `cmk compress --lazy` (Task 35) — runs the lazy-compress pipeline once.
 * Designed to be invoked as a detached subprocess from inject-context.mjs
 * (SessionStart hook) when staleness is detected and cron is NOT active.
 * Humans normally don't invoke this directly.
 */
/**
 * `cmk doctor` (Task 37) — runs the 9 health checks and prints a
 * structured report with repair commands. Per design §14 + tasks.md 37.3.
 *
 * Per NFR-9 + tasks.md 37.5: any recoveryCommand whose underlying
 * action requires a system-level install (pip install / npm install /
 * docker compose up etc.) must NOT be auto-invoked. v0.1.0 surfaces
 * the command to stdout — the user runs it themselves. Auto-repair
 * with --yes is a v0.1.x candidate (design §16).
 */
async function runDoctorCli(/* options */) {
  const projectRoot = resolvePath(process.cwd());
  const userDir = join(homedir(), '.claude-memory-kit');
  try {
    const r = await runDoctor({ projectRoot, userDir });
    if (r.action === 'error') {
      console.error(`cmk doctor: error — ${(r.errors ?? []).join('; ')}`);
      process.exitCode = 2;
      return;
    }
    // Structured report: one line per check
    const counts = { pass: 0, fail: 0, skip: 0 };
    for (const c of r.checks) {
      counts[c.status] += 1;
      const statusLabel = c.status.toUpperCase().padEnd(4);
      console.log(`[${statusLabel}] ${c.id}: ${c.name}`);
      console.log(`         ${c.message}`);
      if (c.status === 'fail' && c.recoveryCommand) {
        // Repair-command surfaced for the user. Per 37.5 + NFR-9, we
        // do NOT auto-invoke install-requiring repairs — the user
        // copies the command.
        const installNote = c.requiresInstall
          ? ' (REQUIRES INSTALL — review before running)'
          : '';
        console.log(`         → repair: ${c.recoveryCommand}${installNote}`);
      }
    }
    console.log('');
    console.log(
      `Summary: ${counts.pass} pass · ${counts.fail} fail · ${counts.skip} skip (${r.duration_ms}ms)`,
    );
    if (counts.fail > 0) process.exitCode = 1;
  } catch (err) {
    console.error(`cmk doctor: unexpected error: ${err?.message ?? err}`);
    process.exitCode = 2;
  }
}

async function runRepairCli(options /* , command */) {
  const projectRoot = resolvePath(process.cwd());
  const userDir = join(homedir(), '.claude-memory-kit');
  // Scope flags: --hooks / --locks / --index → run that one only.
  // --all OR no flag → run all three.
  let scope;
  if (options?.hooks && !options?.locks && !options?.index) scope = 'hooks';
  else if (options?.locks && !options?.hooks && !options?.index) scope = 'locks';
  else if (options?.index && !options?.hooks && !options?.locks) scope = 'index';
  else scope = 'all';

  try {
    const r = await runRepair({ projectRoot, userDir, scope });
    if (r.action === 'error') {
      console.error(`cmk repair: error — ${(r.errors ?? []).join('; ')}`);
      process.exitCode = 2;
      return;
    }
    for (const repair of r.repairs) {
      if (repair.error) {
        console.error(`cmk repair (${repair.kind}): error — ${repair.error}`);
        continue;
      }
      const status = repair.changed ? 'fixed' : 'no-op';
      console.log(`cmk repair (${repair.kind}): ${status}`);
      if (repair.kind === 'hooks' && repair.changed) {
        console.log(`  → updated ${repair.settingsPath}`);
        console.log(`  events: ${repair.events.join(', ')}`);
      }
      if (repair.kind === 'locks') {
        if (repair.removed && repair.removed.length > 0) {
          for (const l of repair.removed) console.log(`  removed: ${l.path} (${l.reason})`);
        }
        if (repair.preserved && repair.preserved.length > 0) {
          for (const l of repair.preserved) console.log(`  preserved: ${l.path} (${l.reason})`);
        }
      }
      if (repair.kind === 'index' && repair.changed) {
        console.log(`  → reindex completed`);
      }
    }
    if (r.errors > 0) process.exitCode = 1;
  } catch (err) {
    console.error(`cmk repair: unexpected error: ${err?.message ?? err}`);
    process.exitCode = 2;
  }
}

async function runRollCli(options /* , command */) {
  const projectRoot = resolvePath(process.cwd());
  const scope = options?.scope ?? ROLL_SCOPES.NOW;
  // I2 fix (Task 39 skill-review 2026-05-28): dropped unused userDir
  // computation. runRoll's underlying pipelines (compress-session,
  // daily-distill, weekly-curate) all operate purely on projectRoot —
  // none take userDir. Same forward-compat-rot anti-pattern Task 37 M3
  // + Task 38 I1 already removed.
  const { HaikuViaAnthropicApi } = await import('./compressor.mjs');
  try {
    const backend = new HaikuViaAnthropicApi();
    const r = await runRoll({ projectRoot, scope, backend });
    if (r.action === 'error') {
      console.error(`cmk roll: error — ${(r.errors ?? []).join('; ')}`);
      process.exitCode = 2;
      return;
    }
    const inner = r.result;
    console.log(`cmk roll --scope ${scope} → ${r.delegatedTo}: ${inner?.action ?? 'unknown'}${inner?.reason ? ` (${inner.reason})` : ''}`);
  } catch (err) {
    console.error(`cmk roll: unexpected error: ${err?.message ?? err}`);
    process.exitCode = 2;
  }
}

async function runImportAnthropicMemory(options /* , command */) {
  const projectRoot = resolvePath(process.cwd());
  const dryRun = options?.dryRun === true;
  const acceptAll = options?.yes === true;
  try {
    // I1 fix (skill-review 2026-05-28): userDir was unused, dropped.
    const r = await importAnthropicMemory({ projectRoot, dryRun, acceptAll });
    if (r.action === 'error') {
      console.error(`cmk import-anthropic-memory: error — ${(r.errors ?? []).join('; ')}`);
      process.exitCode = 2;
      return;
    }
    if (r.reason === 'no-source') {
      console.log(`cmk import-anthropic-memory: no Anthropic auto-memory found at ${r.sourcePath}`);
      return;
    }
    if (r.mode === 'dry-run') {
      console.log(`cmk import-anthropic-memory: dry-run — ${r.proposals.length} proposal(s), ${r.skipped} duplicate(s) skipped`);
      for (const p of r.proposals) {
        console.log(`  + ${p.id}: ${p.text}`);
      }
      return;
    }
    if (r.mode === 'requires-confirmation') {
      console.log(`cmk import-anthropic-memory: ${r.proposals.length} proposal(s) ready to apply.`);
      console.log('  Re-run with --yes to apply, or --dry-run to inspect.');
      for (const p of r.proposals) {
        console.log(`  + ${p.id}: ${p.text}`);
      }
      return;
    }
    console.log(`cmk import-anthropic-memory: applied ${r.accepted} proposal(s), skipped ${r.skipped} duplicate(s)`);
  } catch (err) {
    console.error(`cmk import-anthropic-memory: unexpected error: ${err?.message ?? err}`);
    process.exitCode = 2;
  }
}

async function runTranscriptsDispatch(childName, options) {
  if (childName === 'extract') {
    return runTranscriptsExtract(options);
  }
  console.error(`cmk transcripts: ${NOTICE_PREFIX} (unknown sub-verb '${childName}')`);
  process.exitCode = 2;
}

async function runTranscriptsExtract(options) {
  // Discover sessions per the flags + extract each into the output dir.
  const projectRoot = resolvePath(process.cwd());
  const outputDir = options?.output
    ? resolvePath(options.output)
    : join(projectRoot, 'transcripts-extracted');
  const includeThinking = options?.includeThinking === true;
  let sessions;
  try {
    sessions = discoverSessions({
      slug: options?.slug,
      sessionUuidSuffix: options?.session,
      sinceIso: options?.since,
    });
  } catch (err) {
    console.error(`cmk transcripts extract: discovery error: ${err?.message ?? err}`);
    process.exitCode = 2;
    return;
  }
  if (sessions.length === 0) {
    // S1 fix (Task 38 skill-review 2026-05-28): specialize the message
    // for --session-not-found so the user sees the filter that failed.
    if (options?.session) {
      console.error(
        `cmk transcripts extract: no session matching --session ${options.session}`,
      );
      process.exitCode = 2;
      return;
    }
    console.log('cmk transcripts extract: no sessions found matching filter');
    return;
  }
  if (options?.session && sessions.length > 1) {
    console.error(`cmk transcripts extract: ambiguous --session match (${sessions.length} candidates):`);
    for (const s of sessions.slice(0, 10)) {
      console.error(`  ${s.slug}/${s.sessionId}.jsonl`);
    }
    process.exitCode = 2;
    return;
  }
  let totalTurns = 0;
  let totalBytes = 0;
  for (const s of sessions) {
    const outputPath = join(outputDir, s.slug, `${s.sessionId}.md`);
    try {
      const r = extractTranscript({
        inputPath: s.jsonlPath,
        outputPath,
        includeThinking,
      });
      if (r.action === 'error') {
        console.error(`  ${s.sessionId}: error — ${(r.errors ?? []).join('; ')}`);
        continue;
      }
      totalTurns += r.turnsKept;
      totalBytes += r.outputSize;
      console.log(`  ${s.slug}/${s.sessionId}: ${r.turnsKept} turn(s) → ${outputPath}`);
    } catch (err) {
      console.error(`  ${s.sessionId}: unexpected error: ${err?.message ?? err}`);
    }
  }
  console.log(`cmk transcripts extract: processed ${sessions.length} session(s); ${totalTurns} total turns; ${(totalBytes / 1024 / 1024).toFixed(2)} MB written`);
}

async function runCompress(options /* , command */) {
  const lazy = options?.lazy === true;
  if (!lazy) {
    // S1 fix (skill-review 2026-05-28): exit 2 on missing --lazy so
    // scripts can distinguish "command ran" from "command rejected its
    // input". Matches NOTICE_PREFIX convention elsewhere in v0.1.0.
    console.error(
      `cmk compress: ${NOTICE_PREFIX} (the --lazy flag is required for v0.1.0; bare \`cmk compress\` is a v0.1.x candidate — see design §16)`,
    );
    process.exitCode = 2;
    return;
  }
  const projectRoot = resolvePath(process.cwd());
  const { HaikuViaAnthropicApi } = await import('./compressor.mjs');
  try {
    const backend = new HaikuViaAnthropicApi();
    const r = await runLazyCompress({ projectRoot, backend });
    if (r.action === 'error') {
      console.error(
        `cmk compress --lazy: error (${r.errorCategory ?? 'unknown'})${(r.errors && r.errors.length) ? `: ${r.errors.join('; ')}` : ''}`,
      );
    } else {
      console.log(
        `cmk compress --lazy: ${r.action}${r.reason ? ` (${r.reason})` : ''}${r.delegatedTo ? ` → ${r.delegatedTo}` : ''}`,
      );
    }
  } catch (err) {
    console.error(`cmk compress --lazy: unexpected error: ${err?.message ?? err}`);
  }
}

async function runMcpDispatch(childName) {
  if (childName === 'serve') {
    const projectRoot = resolvePath(process.cwd());
    const userDir = join(homedir(), '.claude-memory-kit');
    // ALL logs to stderr per design §10.1; stdout is reserved for
    // JSON-RPC messages handled by the SDK's StdioServerTransport.
    // Don't console.log() anything before/during the server's run.
    try {
      await runMcpServer({ projectRoot, userDir });
    } catch (err) {
      console.error(`cmk mcp serve: fatal — ${err?.message ?? err}`);
      process.exitCode = 2;
    }
    return;
  }
  console.error(`cmk mcp: ${NOTICE_PREFIX} (unknown sub-verb '${childName}')`);
  process.exitCode = 2;
}

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
  // scratchpad (MEMORY.md under `context/`). Section discovery: the
  // queue entry written by `writeConflictEntry` does NOT capture the
  // existing bullet's section heading — the merger receives `section`
  // here as undefined from `resolveConflictQueue` (it doesn't pass
  // through), and `mergeScratchpadBullets` falls back to
  // `discoverSectionAt(lines, matchA.bulletIdx)` to find the heading
  // by walking back from the existing bullet's position. That fallback
  // is the documented contract for v0.1.0. Per-candidate section
  // capture in `writeConflictEntry`'s queue entry is a v0.1.x
  // candidate — see design §6.8 + §16.x notes for the trade-off.
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
    description: 'cross-OS one-shot install — scaffold 3-tier dirs + inject .gitignore + drop kit CLAUDE.md block + wire Claude Code hooks',
    milestone: 3,
    optionSpec: [
      { flags: '--force', description: 'allow downgrade of an existing newer-version CLAUDE.md block' },
      { flags: '--no-hooks', description: 'scaffold only; do NOT wire hooks into .claude/settings.json' },
      { flags: '--verbose', description: 'show the per-tier created/skipped file breakdown' },
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
    name: 'remember',
    description: 'capture a durable fact (Poison_Guard + home-path abstraction). Terse → a MEMORY.md bullet; RICH (--why/--how/--type) → a granular fact file with rationale (the safe way to capture richly).',
    milestone: 24,
    argSpec: [{ flags: '[text...]', description: 'the fact to remember (omit when using --from-file)' }],
    optionSpec: [
      { flags: '--tier <tier>', description: 'P (default; U/L are v0.1.x)' },
      { flags: '--trust <level>', description: 'high | medium | low (default: high)' },
      { flags: '--section <name>', description: 'MEMORY.md section for the terse form (default: Active Threads)' },
      // Rich mode (Task 63 / F1): any of these → write a granular fact file.
      { flags: '--why <text>', description: 'rich: the rationale (becomes the **Why:** block)' },
      { flags: '--how <text>', description: 'rich: how to apply it (becomes the **How to apply:** block)' },
      { flags: '--type <type>', description: 'rich: feedback | project | reference | user (default: feedback)' },
      { flags: '--title <text>', description: 'rich: a short title (also the fact-file slug)' },
      { flags: '--links <a,b>', description: 'rich: related fact names for [[cross-links]]' },
      { flags: '--from-file <path>', description: 'rich: read the fact as a JSON object from a file — shell-safe (content never touches argv; the safe way to capture backtick/quote-heavy Why/How). JSON keys: text (required), why, how, type, title, links. Self-contained — other flags are ignored.' },
      { flags: '--json', description: 'rich: read the fact as a JSON object from stdin (pipe-safe, shell-safe) — same JSON keys as --from-file' },
    ],
    action: runRemember,
  },
  {
    name: 'search',
    description: 'search memory — hybrid keyword + optional semantic',
    milestone: 30,
    argSpec: [{ flags: '<query...>', description: 'query terms' }],
    optionSpec: [
      { flags: '--mode <mode>', description: 'keyword | semantic | hybrid (default: keyword; semantic+hybrid need memsearch — Layer 5b install, not in v0.1.0)' },
      { flags: '--min-trust <level>', description: 'low | medium | high' },
      { flags: '--tier <tier>', description: 'U | P | L (filter to a single tier)' },
      { flags: '--since <date>', description: 'ISO date — exclude observations older than this' },
      { flags: '--limit <n>', description: 'max results (default: 20)' },
      { flags: '--include-tombstoned', description: 'include deleted observations in results' },
    ],
    action: runSearch,
  },
  {
    name: 'reindex',
    description: 'rebuild the markdown INDEX.md pointer index for the project tier',
    milestone: 8,
    optionSpec: [
      { flags: '--boot', description: 'incremental — re-index only changed files' },
      { flags: '--full', description: 'drop the cache and rebuild from scratch' },
    ],
    action: runReindex,
  },
  {
    name: 'doctor',
    description: 'run health checks HC-1..HC-9; print structured report with self-repair commands',
    milestone: 37,
    action: runDoctorCli,
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
    optionSpec: [
      { flags: '--dry-run', description: 'print proposed additions without modifying files' },
      { flags: '--yes', description: 'apply every proposal without prompting (v0.1.0 requires explicit --yes; interactive y/N is v0.1.x)' },
    ],
    action: runImportAnthropicMemory,
  },
  {
    name: 'transcripts',
    description: "extract clean markdown transcripts from Claude Code session jsonls under ~/.claude/projects/",
    milestone: 38,
    children: [
      {
        name: 'extract',
        description: 'extract one or more session jsonls into clean markdown',
        optionSpec: [
          { flags: '--session <uuid-suffix>', description: 'extract a specific session by uuid suffix (substring match across all slugs)' },
          { flags: '--slug <slug>', description: 'extract all sessions under a specific Anthropic slug' },
          { flags: '--since <YYYY-MM-DD>', description: 'extract only sessions with mtime >= this date' },
          { flags: '--output <dir>', description: 'output directory (default: <cwd>/transcripts-extracted/)' },
          { flags: '--include-thinking', description: 'retain the agent\'s [thinking] blocks (omitted by default)' },
        ],
        action: (options) => runTranscriptsDispatch('extract', options),
      },
    ],
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
    description: 'promote a project-tier observation to the user tier (carry it across all your projects)',
    milestone: 76,
    children: [
      {
        name: 'promote',
        description: 'move a project observation to the user tier through the safe promote path',
        argSpec: [{ flags: '<id>', description: 'citation ID (e.g. P-S79MJHFN)' }],
        optionSpec: [
          { flags: '--to <file>', description: 'target user-tier file: LESSONS.md (default) | HABITS.md | USER.md' },
          { flags: '--section <title>', description: 'landing section (default per-target)' },
        ],
        action: (id, options) => runLessonsPromote(id, options),
      },
    ],
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
    optionSpec: [{ flags: '--scope <scope>', description: 'now (default — task 22 compress-session) | today (task 33 daily-distill) | recent (task 34 weekly-curate)' }],
    action: runRollCli,
  },
  {
    name: 'repair',
    description: 'idempotent self-repair — re-register hooks, reset stale locks, rebuild index',
    milestone: 39,
    optionSpec: [
      { flags: '--hooks', description: 're-register hooks from template (merges kit hooks into .claude/settings.json)' },
      { flags: '--locks', description: 'clear stale locks (>1h old by default)' },
      { flags: '--index', description: 'invoke `cmk reindex --full`' },
      { flags: '--all', description: 'run all three repairs in order (default if no scope flag given)' },
    ],
    action: runRepairCli,
  },
  {
    name: 'daily-distill',
    description: 'run the daily-distill pipeline once (invoked by host scheduler; humans normally use `cmk register-crons`)',
    milestone: 33,
    action: runDailyDistill,
  },
  {
    name: 'weekly-curate',
    description: 'run the weekly-curate pipeline once: archive today-*.md older than 7 days, dedup bullets, rebuild recent.md (invoked by host scheduler)',
    milestone: 34,
    action: runWeeklyCurate,
  },
  {
    name: 'persona',
    description: 'cross-project persona — synthesize "how you work everywhere" into the user tier, and carry it across YOUR machines',
    milestone: 45,
    children: [
      {
        name: 'generate',
        description: 'synthesize cross-project doctrine from this project\'s captured facts now: auto-promote high-confidence to the user tier, save the rest to queues/persona-review.md',
        action: runPersonaGenerate,
      },
      {
        name: 'export',
        description: 'export your cross-project persona (the user tier) to one portable bundle file, to carry to another of YOUR machines (the persona stays private — never committed to a project)',
        milestone: 72,
        argSpec: [{ flags: '<file>', description: 'output bundle path, e.g. persona-bundle.json' }],
        action: (file, options) => runPersonaExport(file, options),
      },
      {
        name: 'import',
        description: 'import a persona bundle (from `cmk persona export`) into this machine\'s user tier; any file it replaces is backed up first',
        milestone: 72,
        argSpec: [{ flags: '<file>', description: 'bundle path produced by `cmk persona export`' }],
        action: (file, options) => runPersonaImport(file, options),
      },
    ],
  },
  {
    name: 'disable-native-memory',
    description: 'opt out of Anthropic\'s native Auto Memory for THIS project (writes autoMemoryEnabled:false to the committable .claude/settings.json) so only the kit\'s memory runs — avoids the both-layers context bloat (ADR-0011)',
    milestone: 60,
    action: () => runSetNativeMemory(false),
  },
  {
    name: 'enable-native-memory',
    description: 're-enable Anthropic\'s native Auto Memory for this project (reverses cmk disable-native-memory)',
    milestone: 60,
    action: () => runSetNativeMemory(true),
  },
  {
    name: 'compress',
    description: 'lazy-on-read compression fallback for no-cron environments. Use `--lazy` to delegate to daily-distill or weekly-curate based on staleness (typically invoked detached from the SessionStart hook).',
    milestone: 35,
    optionSpec: [
      { flags: '--lazy', description: 'run the lazy-compress cycle (the v0.1.0 supported invocation)' },
    ],
    action: runCompress,
  },
  {
    name: 'register-crons',
    description: 'register both daily-distill (23:00) and weekly-curate (Sun 09:00) cron jobs with the host scheduler',
    milestone: 33,
    optionSpec: [
      { flags: '--dry-run', description: 'print the platform-detected command without executing' },
      { flags: '--unregister', description: 'remove both daily-distill and weekly-curate entries instead of adding them' },
    ],
    action: runRegisterCrons,
  },
  {
    name: 'mcp',
    description: 'run the MCP server over stdio (invoked by Claude Code, not by humans)',
    milestone: 31,
    children: [{ name: 'serve', description: 'start the stdio MCP server; JSON-RPC on stdin/stdout' }],
    action: runMcpDispatch,
  },
  {
    name: 'version',
    description: 'print the cmk version (alias for --version)',
    milestone: 'always',
    action: function action() {
      // Print the same bare version string as `cmk --version`, resolved from
      // package.json (the single source). Was a v0.1.0 stub that punted to
      // `cmk --version`; the live test surfaced that as unhelpful friction.
      const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
      const { version } = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
      console.log(version);
    },
  },
];

/** Names list — handy for tests + help-output assertions. */
export const subcommandNames = subcommands.map((s) => s.name);

/** Notice string — exposed so tests can assert it appears in every stub output. */
export const STUB_NOTICE_PREFIX = NOTICE_PREFIX;
