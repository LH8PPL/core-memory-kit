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
import { installAgent } from './install-agent.mjs';
import { installKiro, uninstallKiro } from './install-kiro.mjs';
import { getAgentProfile, listAgentProfiles } from './agent-profiles.mjs';
import { runKiroHook } from './kiro-hook-bin.mjs';
import { readKiroTurn } from './kiro-transcript.mjs';
import { injectContext } from './inject-context.mjs';
import { captureTurn } from './capture-turn.mjs';
import { removeClaudeMdBlock } from './claude-md.mjs';
import { reindex as reindexAction } from './reindex.mjs';
import { openIndexDb } from './index-db.mjs';
import { resolveDefaultSearchMode } from './semantic-backend.mjs';
import { reindexBoot, reindexFull } from './index-rebuild.mjs';
import { search as searchAction, SEARCH_MODES } from './search.mjs';
import { memoryWrite } from './memory-write.mjs';
import { runMcpServer } from './mcp-server.mjs';
import { dailyDistill } from './daily-distill.mjs';
import { weeklyCurate } from './weekly-curate.mjs';
import { autoPersona } from './auto-persona.mjs';
import { exportPersona, importPersona } from './persona-portability.mjs';
import { setNativeAutoMemory, nativeMemoryInstallNote } from './native-memory.mjs';
import { rememberRich, richFactTitle, nonProjectTierNote, prepareNearDupGuard } from './remember-core.mjs';
import { getObservations, citeLink, buildTimeline, recentActivity } from './read-core.mjs';
import { readHookStdin } from './read-hook-stdin.mjs';
import { runLazyCompress } from './lazy-compress.mjs';
import { runDoctor } from './doctor.mjs';
import { importAnthropicMemory } from './import-anthropic-memory.mjs';
import { configGet, configSet, configShowOrigin } from './config-core.mjs';
import { importClaudeMd } from './import-claude-md.mjs';
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
import { spawnSync } from 'node:child_process';
import { checkKitBinding } from './native-binding.mjs';
import { resolve as resolvePath, join, basename } from 'node:path';

const NOTICE_PREFIX = 'not yet implemented';

/**
 * The install summary line for the Task-46 semantic outcome (Task 125.4:
 * pure + exported so the branches are testable without running install).
 * Returns null when there is nothing to print: an `error` action already
 * surfaces through result.errors, and the opt-in tip is suppressed under
 * --no-hooks (scaffold-only installs).
 */
export function formatSemanticSummary(semantic, { noHooks = false } = {}) {
  if (semantic?.action === 'enabled') {
    const w = semantic.warmed;
    return (
      '  Semantic recall ENABLED — `cmk search` now defaults to hybrid here.' +
      (w?.ok
        ? ` Model cached (${Math.round(w.ms / 1000)}s).`
        : ' Model downloads on first search.')
    );
  }
  if (semantic?.action === 'disabled') {
    return '  Semantic recall pinned OFF for this project (search.default_mode=keyword).';
  }
  if (semantic?.action === 'skipped' && !noHooks) {
    return '  Tip: `cmk install --with-semantic` adds local semantic recall (ask in your own words; one-time ~260 MB, no API calls).';
  }
  return null;
}

/**
 * Real `cmk install` action — wired in Task 3, extended in Task 4 with
 * --force passed through to the CLAUDE.md downgrade guard. Reads CLI
 * options/flags, dispatches to the install module, prints a one-line
 * summary, and reports the CLAUDE.md action (created / appended /
 * replaced / upgraded / downgrade-blocked / forced-downgrade / unchanged).
 */
// Task 141a (D-129): the install-time binding ask. npm 12 blocks
// better-sqlite3's binding build on a fresh `npm install -g` — the user's
// 2026-06-12 steer: ask AT INSTALL, never leave it to a secondary command.
// Interactive consent is required because the fix is itself an
// `npm install -g` (the design §14 ask-before-install rule); non-interactive
// runs print the command instead. All deps injectable for tests.
async function offerBindingFix(nativeBinding, options, { log, logError }) {
  if (!nativeBinding || nativeBinding.ok) return;
  const remedy = nativeBinding.remedy;
  logError(
    `  warning: better-sqlite3's native binding is unavailable (${nativeBinding.reason}).`,
  );
  logError(
    '  Most common cause: npm 12 blocks dependency install scripts by default (a Node major upgrade is the other). Search/reindex cannot work until the binding is rebuilt.',
  );
  // An explicit askImpl implies a consent channel exists (the test seam /
  // programmatic caller); only the readline default needs a real TTY.
  const interactive =
    options?.interactive ?? (options?.askImpl ? true : process.stdin.isTTY === true);
  const askFn =
    options?.askImpl ??
    (interactive
      ? (question) =>
          new Promise((resolveAnswer) => {
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            rl.question(question, (answer) => {
              rl.close();
              resolveAnswer(answer);
            });
          })
      : null);
  if (!interactive || !askFn) {
    logError(`  Fix it any time with: ${remedy}`);
    return;
  }
  const answer = String(await askFn(`  Fix it now by running \`${remedy}\`? [Y/n] `))
    .trim()
    .toLowerCase();
  const yes = answer === '' || answer === 'y' || answer === 'yes';
  if (!yes) {
    log(`  Skipped. Fix it any time with: ${remedy}`);
    return;
  }
  const fixRunner =
    options?.fixRunner ??
    ((cmd) =>
      // Constant command under shell:true (npm is npm.cmd on Windows); the
      // 10-min ceiling mirrors buildDefaultNpmRunner's spawn discipline.
      spawnSync(cmd, { stdio: 'inherit', shell: true, timeout: 600_000 }));
  const r = fixRunner(remedy);
  const reProbe = options?.reProbe ?? checkKitBinding;
  const after = r.status === 0 ? reProbe() : { ok: false };
  if (after.ok) {
    log('  Binding rebuilt — search is ready.');
  } else {
    logError(`  The binding is still unavailable — run it manually later: ${remedy}`);
  }
}

// Exported for tests (Task 141a) — dep-injectable (cwd / userTier / log /
// logError / bindingProbe / askImpl / fixRunner / reProbe / interactive) on
// the runImportClaudeMd pattern. Defaults unchanged for production.
export async function runInstall(options /* , command */) {
  const log = options?.log ?? console.log;
  const logError = options?.logError ?? console.error;
  // commander maps `--no-hooks` to options.hooks === false.
  const noHooks = !!(options && options.hooks === false);
  const verbose = !!(options && options.verbose);

  // Task 50.F — cross-agent routing. Default is claude-code (the existing path,
  // untouched). For another agent, scaffold the agent-neutral project tier via
  // installAction with hooks OFF (the Claude-Code hook wiring doesn't apply), then
  // wire THAT agent's legs (hooks + MCP + instruction file) via installAgent.
  const ide = (options && options.ide) || 'claude-code';
  if (ide !== 'claude-code') {
    return runInstallForAgent({ ide, options, log, logError });
  }

  const result = await installAction({
    force: !!(options && options.force),
    noHooks,
    // Task 46: two flags, 3-state semantics (enable / pin-off / untouched).
    // commander maps `--no-semantic` to options.semantic === false (the
    // same negation pattern as --no-hooks above); `--with-semantic` maps
    // to options.withSemantic.
    withSemantic: !!(options && options.withSemantic),
    noSemantic: !!(options && options.semantic === false),
    projectRoot: options?.cwd,
    userTier: options?.userTier,
    bindingProbe: options?.bindingProbe,
  });

  // Outcome over inventory (self-test UX finding): state the resulting state +
  // next action, not a file tally. The old "scaffolded 5, skipped 4 existing"
  // read like a problem on a FRESH folder — the "skipped" are the cross-project
  // user tier at ~/.claude-memory-kit/ (OUTSIDE this folder), already on disk.
  // The full per-tier breakdown is --verbose only.
  const projectName = basename(result.projectRoot);
  const wired =
    result.hooks.action === 'wired' || result.hooks.action === 'unchanged';
  const broughtSomethingNew =
    result.created.length > 0 ||
    result.gitignore.action === 'created' ||
    result.claudeMd.action === 'created';

  if (broughtSomethingNew) {
    log(
      `cmk install: ${projectName} ready — context/ scaffolded${
        wired ? ', hooks wired' : ''
      }.`,
    );
  } else {
    log(
      `cmk install: ${projectName} already set up (your edits preserved)${
        wired ? ', hooks refreshed' : ''
      }.`,
    );
  }
  if (wired) {
    log(
      '  Restart Claude Code to activate. Complete install — no separate /plugin step needed.',
    );
  }
  // Task 60 / ADR-0011 heads-up: the kit coexists with Claude Code's native
  // Auto Memory by default; surface the one-command opt-out (null when already
  // opted out, so we don't nag).
  const nativeNote = nativeMemoryInstallNote(result.projectRoot);
  if (nativeNote) log(nativeNote);
  // Task 46: semantic-recall outcome (pure formatter, Task 125.4 — testable
  // without spawning install; the error case returns null because enableSemantic
  // errors already land in result.errors and print through the error path).
  const semanticLine = formatSemanticSummary(result.semantic, { noHooks });
  if (semanticLine) log(semanticLine);
  if (verbose) {
    log(
      `  files: ${result.created.length} created, ${result.skipped.length} already present` +
        (result.skipped.length
          ? ' (incl. the cross-project user tier at ~/.claude-memory-kit/, outside this folder)'
          : ''),
    );
    log(
      `  .gitignore=${result.gitignore.action} · CLAUDE.md=${result.claudeMd.action} · hooks=${result.hooks.action}`,
    );
  }

  if (result.claudeMd.action === 'downgrade-blocked') {
    logError(
      `  warning: CLAUDE.md already has a newer kit block (v${result.claudeMd.oldVersion}). ` +
        `Re-run with --force to downgrade.`
    );
  }

  if (result.errors.length > 0) {
    for (const e of result.errors) logError(`  error: ${e.path}: ${e.error}`);
    process.exitCode = 1;
  }

  // Task 141a: the binding ask comes LAST — it's the one thing the user may
  // still need to act on, and the tail of install output is what gets read.
  await offerBindingFix(result.nativeBinding, options, { log, logError });
}

/**
 * Task 50.F — `cmk install --ide <agent>` for a non-Claude-Code agent.
 * Scaffolds the agent-neutral project tier (context/, CLAUDE.md block, gitignore —
 * via installAction with hooks off, since the Claude-Code hook wiring doesn't
 * apply), then wires THAT agent's legs (hooks + MCP + instruction file) via
 * installAgent. One step — no second command (the user-friendly criterion).
 */
async function runInstallForAgent({ ide, options, log, logError }) {
  const profile = getAgentProfile(ide);
  if (!profile) {
    const known = listAgentProfiles().map((p) => p.name).join(', ');
    logError(`cmk install: unknown --ide '${ide}'. Supported: ${known}.`);
    process.exitCode = 2;
    return;
  }

  // 1) agent-neutral scaffold (context/ + the kit's own CLAUDE.md block live
  //    regardless of agent). Hooks OFF — the agent's hooks are wired in step 2.
  //    skipClaudeFiles: `.claude/skills/` + `CLAUDE.md` are Claude-Code-specific;
  //    a non-CC agent gets its instructions from its own surface (Kiro →
  //    .kiro/skills/ + .kiro/steering/ + AGENTS.md), so we must not leave dead
  //    Claude files on the project (D-188). An EXISTING Claude install's files
  //    are untouched — we just don't create fresh ones.
  const scaffold = await installAction({
    force: !!(options && options.force),
    noHooks: true,
    withSemantic: !!(options && options.withSemantic),
    noSemantic: !!(options && options.semantic === false),
    projectRoot: options?.cwd,
    userTier: options?.userTier,
    bindingProbe: options?.bindingProbe,
    spawnNpm: options?.spawnNpm,
    warmEmbedder: options?.warmEmbedder,
    skipClaudeFiles: true,
  });

  const projectName = basename(scaffold.projectRoot);

  // 2) wire the agent's surfaces. Kiro has its OWN orchestrator (D-182): five
  //    surfaces (MCP + steering + skills + IDE hooks + the CLI agent-config),
  //    not the generic installAgent's Claude-Code-shaped model.
  if (ide === 'kiro') {
    // awsDir: tests/sandboxes pass $MEMORY_KIT_AWS_DIR via options.awsDir to keep
    // the CLI-agent leg out of the real ~/.aws; production leaves it undefined →
    // the real ~/.aws/amazonq (where kiro-cli actually reads its agents).
    const r = installKiro({ projectRoot: scaffold.projectRoot, awsDir: options?.awsDir });
    if (r.action === 'error') {
      for (const e of r.errors || []) {
        logError(`  error: Kiro ${e.surface}: ${(e.errors || []).join('; ')}`);
      }
      logError(
        `cmk install: ${projectName} scaffolded but Kiro wiring failed (a config file could not be safely written — see above).`,
      );
      process.exitCode = 1;
      return;
    }
    log(
      `cmk install: ${projectName} ready for Kiro — context/ scaffolded; ${r.surfaces.join(' + ')} wired.`,
    );
    log('  Restart Kiro to activate the hooks (steering + skills + MCP are immediate).');
    // The CLI agent-config (kiro-cli) is automatic only when cmk is the default
    // agent. If the user already has a default, surface the one manual step.
    if (r.cliDefaultAgent === 'skipped-existing') {
      log('  Note: you already have a Kiro CLI default agent — the kit installed a `cmk` agent instead.');
      log('        Run `kiro-cli --agent cmk`, or set `chat.defaultAgent` to `cmk`, for automatic CLI memory.');
    }
    if (scaffold.errors.length > 0) {
      for (const e of scaffold.errors) logError(`  error: ${e.path}: ${e.error}`);
      process.exitCode = 1;
    }
    return;
  }

  // Other agents: the generic per-profile installer.
  const wired = installAgent({ projectRoot: scaffold.projectRoot, profile });

  if (wired.action === 'error') {
    for (const e of wired.errors || []) {
      logError(`  error: ${profile.displayName} ${e.leg}: ${(e.errors || []).join('; ')}`);
    }
    // Report which legs DID land (every leg is independently idempotent +
    // touch-only, so a re-run after fixing the flagged file is safe).
    const landed = Object.entries(wired.legs || {})
      .filter(([, action]) => action && action !== 'error')
      .map(([leg]) => leg);
    if (landed.length) {
      logError(`  (${landed.join(' + ')} already wired; re-run after fixing the file above — safe, idempotent.)`);
    }
    logError(
      `cmk install: ${projectName} scaffolded but ${profile.displayName} wiring failed (a config file could not be safely written — see above).`,
    );
    process.exitCode = 1;
    return;
  }

  // Describe what THIS integration type actually wired (instruction-only writes
  // just the instruction file; full agents wire hooks + MCP too).
  const wiredLegs = [
    wired.legs.instruction ? 'instruction file' : null,
    wired.legs.mcp ? 'MCP' : null,
    wired.legs.hooks ? 'hooks' : null,
  ].filter(Boolean);
  log(
    `cmk install: ${projectName} ready for ${profile.displayName} — context/ scaffolded, ${wiredLegs.join(' + ')} wired.`,
  );
  if (profile.integrationType === 'instruction-only') {
    log('  Instruction-file only (no hooks/MCP) — a portable memory-awareness rung for tools that read AGENTS.md.');
  } else {
    log('  Restart the agent to activate. Complete install — one step, no separate command.');
  }

  if (scaffold.errors.length > 0) {
    for (const e of scaffold.errors) logError(`  error: ${e.path}: ${e.error}`);
    process.exitCode = 1;
  }
}

/**
 * Task 50.J/50.L — `cmk hook <event>` — the Kiro hook entrypoint.
 *
 * Kiro's IDE + CLI hooks call `cmk hook <event>` (agentSpawn / promptSubmit /
 * stop). Unlike Claude Code's hook bins (which read a stdin JSON payload), Kiro
 * passes context via argv + env + cwd + its transcript file (probe-verified,
 * P-CJYGTQYR). runKiroHook adapts that to the kit's inject/capture cores.
 *
 * ALWAYS exits 0 (the dispatcher guarantees it) — a crashed hook must never
 * break the Kiro session. Inject output is printed to stdout (Kiro's runCommand
 * adds it to the agent's context).
 */
export function runHook(event, _options = {}, _command, deps = {}) {
  const log = deps.log ?? ((s) => process.stdout.write(s));
  const logError = deps.logError ?? ((s) => process.stderr.write(`${s}\n`));
  const r = runKiroHook({
    argv: [event],
    cwd: deps.cwd ?? process.cwd(),
    env: deps.env ?? process.env,
    deps: {
      readKiroTurn: deps.readKiroTurn ?? readKiroTurn,
      // injectContext returns the assembled context string; normalize to {text}.
      // userDir is passed through so cross-project user-tier memory surfaces on
      // Kiro inject too (injectContext resolves $MEMORY_KIT_USER_DIR when userDir
      // is absent, but pass it explicitly when the caller provides one).
      inject: deps.inject ?? ((args) => {
        const text = injectContext({ cwd: args.cwd, ...(args.userDir ? { userDir: args.userDir } : {}) });
        return { ok: true, text: typeof text === 'string' ? text : text?.text ?? '' };
      }),
      capture: deps.capture ?? ((args) => captureTurn({ payload: args.payload, projectRoot: args.projectRoot })),
    },
  });
  if (r.stdout) log(r.stdout);
  if (r.stderr) logError(r.stderr);
  // I1 (review): make the always-exit-0 invariant EXPLICIT, not incidental — a
  // non-zero exit from a Kiro hook BLOCKS the tool (AWS docs). Pin it so a prior
  // verb's exitCode or a future throw-path can't leak through.
  process.exitCode = 0;
}

/**
 * `cmk uninstall [--ide <agent>]` — remove ONE agent's kit-managed surface,
 * scoped by `--ide` exactly like `cmk install` (D-189). Default (no flag)
 * removes the Claude Code surface (the CLAUDE.md managed block); `--ide kiro`
 * removes the Kiro surface (the .kiro/ managed blocks + skills + IDE hooks + the
 * guarded ~/.aws CLI agent + the AGENTS.md block). BOTH are conservative: they
 * NEVER touch context/, context.local/, the user tier, or .gitignore — the
 * shared brain is sacred. Everything outside the kit's markers is byte-preserved.
 */
export function runUninstall(options /*, command */) {
  const projectRoot = resolvePath((options && options.cwd) || process.cwd());
  const ide = (options && options.ide) || 'claude-code';
  // Injectable log sinks (mirror runInstall) so tests can capture output.
  const log = options?.log ?? console.log;
  const logError = options?.logError ?? console.error;

  if (ide === 'kiro') {
    const r = uninstallKiro({ projectRoot, awsDir: options?.awsDir });
    log(
      `cmk uninstall (kiro): ${r.changed ? 'removed the Kiro managed surface' : 'nothing to remove'} — context/ preserved.`,
    );
    return;
  }
  if (ide !== 'claude-code') {
    logError(`cmk uninstall: unknown --ide '${ide}'. Supported: claude-code, kiro.`);
    process.exitCode = 2;
    return;
  }

  const result = removeClaudeMdBlock({ projectRoot });
  log(`cmk uninstall: CLAUDE.md=${result.action} (${result.path})`);
  if (result.action === 'not-found') {
    log('  (no kit-managed block found; CLAUDE.md left unchanged)');
  } else if (result.action === 'no-file') {
    log('  (no CLAUDE.md to uninstall from)');
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
 * The keyword backend (FTS5 BM25 over the observations index) always
 * ships. Semantic + hybrid modes require the Layer-5b semantic backend,
 * (Task 65: prepared automatically when the optional embedder is installed;
 * absent embedder errors with exit code 2 + an install hint, per the 30.2
 * contract). The `semanticBackend` DI seam
 * is the drop-in point for the future backend.
 *
 * Filter flags (per tasks.md 30.4):
 *   --mode <keyword|semantic|hybrid>   (default keyword)
 *   --min-trust <low|medium|high>
 *   --tier <U|P|L>
 *   --since <ISO date>
 *   --limit <N>                        (default 20)
 *   --include-tombstoned               (default false)
 */
async function runSearch(queryParts, options) {
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
    // Task 65: semantic/hybrid prepare the REAL embedded backend (async —
    // search() itself stays sync; the seam gets a sync closure over the
    // pre-embedded query vector). Task 46: an explicit --mode wins;
    // otherwise the project's configured default (context/settings.json
    // search.default_mode, set by `cmk install --with-semantic`), falling
    // back to keyword. Explicit-but-unavailable → exit 2 + hint (the 30.2
    // contract); configured-but-unavailable → graceful keyword fallback
    // (the default must never break every search).
    const explicitMode = options?.mode;
    let mode = explicitMode ?? resolveDefaultSearchMode({ projectRoot });
    // Task 104.2 — the L3 raw tier: `--scope transcripts` searches the
    // separate transcript-chunk index (synthetic T: ids; no tier/trust).
    // Task 156 — `--scope decisions` scans context/DECISIONS.md (the decision
    // journal) for decision-history / "what did we reject" recall.
    const scope = options?.scope ?? 'facts';
    // Task 156 / v0.3.3 cut-gate-16: the `decisions` scope is keyword-only BY
    // DESIGN — it scans the flat `context/DECISIONS.md` journal, which is NOT
    // embedded (no vec table). So it can never go through the semantic backend.
    // Coerce to keyword BEFORE the semantic block, silently — a user who has the
    // hybrid default (from `--with-semantic`) must not see a scary
    // "unknown-scope:decisions" warning (configured default) or hard exit-2
    // (explicit --mode) for using a real, shipped scope. The recall just works.
    if (scope === 'decisions') {
      mode = SEARCH_MODES.KEYWORD;
    }
    let semanticBackend;
    if (mode === SEARCH_MODES.SEMANTIC || mode === SEARCH_MODES.HYBRID) {
      const { prepareSemanticBackend } = await import('./semantic-backend.mjs');
      const prep = await prepareSemanticBackend({ db, query, scope });
      if (!prep.ok && explicitMode) {
        console.error(
          `cmk search: semantic backend unavailable (${prep.reason}).` +
            (prep.hint ? `\n  ${prep.hint}` : ' Use --mode=keyword.'),
        );
        process.exitCode = 2;
        return;
      }
      if (!prep.ok) {
        console.error(
          `cmk search: semantic default unavailable (${prep.reason}) — falling back to keyword.`,
        );
        mode = SEARCH_MODES.KEYWORD;
      } else {
        semanticBackend = prep.backend;
      }
    }
    const r = searchAction({
      db,
      query,
      mode,
      scope,
      projectRoot, // Task 156: the decisions scope reads context/DECISIONS.md
      minTrust: options?.minTrust,
      tier: options?.tier,
      since: options?.since,
      limit: options?.limit !== undefined ? Number(options.limit) : undefined,
      includeTombstoned: options?.includeTombstoned === true,
      semanticBackend,
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
      // to a TUI that renders them OR strip via sed. Hits with no tier/trust
      // (raw transcript chunks; decision-journal entries) show the scope's
      // label instead — 'transcript' for the L3 raw tier, 'decision' for the
      // journal (Task 156), plus a `(retracted)` marker so the "what did we
      // reject" trail is visible at a glance.
      let provenance;
      if (hit.tier) provenance = `${hit.tier}/${hit.trust}`;
      else if (r.scope === 'decisions') provenance = hit.retracted ? 'decision (retracted)' : 'decision';
      else provenance = 'transcript';
      console.log(
        `${hit.id}\t${provenance}\t${hit.source_file}:${hit.source_line}\t${hit.snippet}`,
      );
    }
    console.log(
      `\ncmk search: ${r.results.length} result(s) (mode=${r.mode}${r.scope && r.scope !== 'facts' ? `, scope=${r.scope}` : ''})`,
    );
  } finally {
    db.close();
  }
}

// --- Read verbs (Task 108b — CLI parity with the MCP read tools) ------
//
// `cmk get` / `timeline` / `cite` / `recent-activity` mirror the MCP tools
// mk_get / mk_timeline / mk_cite / mk_recent_activity by calling the SAME
// shared read cores (read-core.mjs) — identical results from CLI + MCP
// (ADR-0014). cite is pure (no DB); the rest open the index + reindex first
// (same fresh-install freshness guard as `cmk search`).

// `deps` (projectRoot / log / logError) are injection seams: production passes
// nothing (defaults to cwd + console), in-process tests pass a temp projectRoot
// + captured loggers so the glue is covered WITHOUT a subprocess (the D-86
// lesson — real-binary tests don't contribute line coverage). Exported for the
// unit tests.

/** Open the index DB, refresh it (best-effort), run `fn(db)`, always close. */
export function withReadDb(fn, deps = {}) {
  const projectRoot = deps.projectRoot ?? resolvePath(process.cwd());
  const userDir =
    deps.userDir ?? process.env.MEMORY_KIT_USER_DIR ?? join(homedir(), '.claude-memory-kit');
  const logError = deps.logError ?? console.error;
  const db = openIndexDb({ projectRoot });
  try {
    try {
      reindexBoot({ projectRoot, userDir, db });
    } catch (err) {
      logError(`cmk: index refresh failed (${err?.message ?? err}); using the existing index.`);
    }
    return fn(db);
  } finally {
    db.close();
  }
}

export function runGet(ids, options = {}, _command, deps = {}) {
  const log = deps.log ?? console.log;
  const list = Array.isArray(ids) ? ids : [ids];
  // Task 155 (D-163): `--include-tombstoned` is the HUMAN-only recovery opt-in.
  // It's a CLI flag ONLY — the MCP mk_get tool never exposes it, so automatic
  // recall stays tombstone-blind. projectRoot is resolved the same way
  // withReadDb does, so the tombstone-file fallback can find the archive.
  const includeTombstoned = options.includeTombstoned === true;
  const projectRoot = deps.projectRoot ?? resolvePath(process.cwd());
  const rows = withReadDb(
    (db) => getObservations(db, list, { includeTombstoned, projectRoot }),
    deps,
  );
  log(JSON.stringify(rows, null, 2));
  // All-missing/invalid → exit 2 (lets a script tell "nothing matched" from a hit).
  if (rows.length > 0 && rows.every((r) => r.error)) process.exitCode = 2;
}

export function runCite(id, _options = {}, _command, deps = {}) {
  const log = deps.log ?? console.log;
  const logError = deps.logError ?? console.error;
  const r = citeLink(id);
  if (!r.ok) {
    logError(`cmk cite: ${r.error}`);
    process.exitCode = 2;
    return;
  }
  log(r.link);
}

export function runTimeline(anchor, options = {}, _command, deps = {}) {
  const log = deps.log ?? console.log;
  const logError = deps.logError ?? console.error;
  const r = withReadDb(
    (db) =>
      buildTimeline(db, {
        anchor,
        depthBefore: options.before !== undefined ? Number(options.before) : 5,
        depthAfter: options.after !== undefined ? Number(options.after) : 5,
      }),
    deps,
  );
  if (!r.ok) {
    logError(`cmk timeline: ${r.error}`);
    process.exitCode = 2;
    return;
  }
  log(JSON.stringify(r.timeline, null, 2));
}

export function runRecentActivity(options = {}, _command, deps = {}) {
  const log = deps.log ?? console.log;
  const logError = deps.logError ?? console.error;
  const r = withReadDb(
    (db) =>
      recentActivity(db, {
        window: options.window ?? '24h',
        limit: options.limit !== undefined ? Number(options.limit) : 20,
      }),
    deps,
  );
  if (!r.ok) {
    logError(`cmk recent-activity: ${r.error}`);
    process.exitCode = 2;
    return;
  }
  log(JSON.stringify(r.rows, null, 2));
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
  const log = deps.log ?? console.log;
  const logError = deps.logError ?? console.error;

  // Non-P --tier: capture at the project tier (P) + surface the note (don't
  // silently honor it, don't hard-error). ONE shared note across CLI + MCP so
  // the message can't drift (D-102 / Task 121).
  if (options.tier && options.tier !== 'P') {
    log(`cmk remember: ${nonProjectTierNote(options.tier)}`);
  }

  // The write is the shared core (remember-core.rememberRich) — the SAME one the
  // MCP `mk_remember` rich path calls, so both surfaces emit identical fact files
  // (ADR-0014). This wrapper only formats the CLI's messages from the result.
  const r = rememberRich(text, options, deps);

  if (r.action === 'error') {
    if (r.errorCategory === 'collision') {
      // M1: a same-title / different-content collision — actionable hint over
      // the raw "refusing overwrite".
      logError(
        `cmk remember: a fact titled "${richFactTitle(text, options)}" already exists with different content. ` +
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

// Task 143: async since the near-dup guard may embed the incoming text
// (one model call, explicit path only). Commander awaits actions; the
// terse-path tests were updated to await (contract change, intent preserved).
export async function runRemember(textParts, options, deps = {}) {
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
  // Non-P --tier: capture at P + note (consistent with the rich path + the MCP
  // tool — D-102). A fact becomes cross-project via `cmk lessons promote`, not a
  // direct tier write (direct U/L routing is the deferred feature in design §16.40). We do NOT
  // hard-error — losing the capture to an error is worse than landing it at P.
  const requestedTier = options?.tier ?? 'P';
  if (requestedTier !== 'P') {
    log(`cmk remember: ${nonProjectTierNote(requestedTier)}`);
  }
  const tier = 'P';
  const trust = options?.trust ?? 'high';
  const section = options?.section ?? 'Active Threads';
  // Task 143 (D-130): semantic near-dup guard — extra opts only when this
  // project is semantic-configured and the embedder is available; {} keeps
  // the literal pipeline (graceful degradation, never blocks capture).
  const nearDup = await prepareNearDupGuard({ projectRoot, text, ...(deps.nearDupGuard ? { prepareImpl: deps.nearDupGuard.prepareImpl, resolveModeImpl: deps.nearDupGuard.resolveModeImpl } : {}) });
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
    ...nearDup,
  });
  if (r.action === 'error') {
    for (const e of r.errors ?? [`error (${r.errorCategory})`]) {
      logError(`cmk remember: ${e}`);
    }
    process.exitCode = 2;
    return;
  }
  if (r.action === 'queued') {
    log(
      `cmk remember: queued for review — a similar or higher-trust fact already covers this. ` +
        `Resolve with \`cmk queue conflicts\` (${r.path}).`,
    );
    return;
  }
  log(
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
 * `cmk digest` (Task 147) — print a regenerated, readable render of everything
 * the kit currently knows, AND sync the append-only context/DECISIONS.md
 * journal (the permanent decision ledger; D-161). The digest goes to stdout;
 * the journal is a committed file the sync maintains in place.
 */
async function runDigestCli(options) {
  const projectRoot = resolvePath(process.cwd());
  const { digest } = await import('./digest.mjs');
  const { syncDecisionsJournal } = await import('./decisions-journal.mjs');

  // Keep the permanent decision journal current (append-only; best-effort —
  // a journal hiccup must not break the digest render).
  const sync = syncDecisionsJournal({ projectRoot });

  console.log(digest({ projectRoot }));

  if (sync.written) {
    console.log(`\ncontext/DECISIONS.md updated (+${sync.appended} bytes) — the append-only decision journal.`);
  } else if (sync.error) {
    console.error(`\n(decision journal not updated: ${sync.error})`);
  } else {
    console.log('\ncontext/DECISIONS.md is up to date.');
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
    // Pass the resolved userDir (same source as `cmk search`) so forget's
    // in-band reindex covers all three tiers and its orphan-prune fires
    // IMMEDIATELY (Task 110) — without it the prune is skipped here and only
    // self-heals on the next search. Also lets forget tombstone U-tier facts.
    userDir: resolveUserDir(),
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
    // Task 111 (F-2): `cmk persona generate` is an explicit one-shot with NO outer
    // hook ceiling (unlike the 60s-bounded SessionEnd path), so it gives the Haiku
    // classifier generous headroom — the whole-project facts sweep is a heavier
    // call than a session summary, and the user is willing to wait for the command
    // they ran. The corpus is byte-capped (PERSONA_CORPUS_BYTES) so this can't run
    // unbounded. Overridable via opts.timeoutMs.
    const r = await autoPersona({ projectRoot, userDir, backend, timeoutMs: opts.timeoutMs ?? 120_000 });
    if (r.action === 'error') {
      const detail = (r.errors && r.errors.length) ? `: ${r.errors.join('; ')}` : '';
      const hint = /did not return within/.test(detail)
        ? ' — the Haiku classifier timed out; this is usually a transient API slowdown. Re-run `cmk persona generate` (the weekly curate pass also retries it automatically).'
        : '';
      logError(`cmk persona generate: error (${r.errorCategory ?? 'unknown'})${detail}${hint}`);
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
  // Windows: registerCron execs schtasks with an args array (no shell), so this
  // double-quoted /TR value is delivered verbatim — no escaping needed (Task 109
  // / D-83). macOS strips these wrapping quotes before building the plist.
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

    // Task 144 (D-130): the memory-HEALTH section — content quality, not
    // plumbing. Informational only: read-only, never changes the exit code,
    // best-effort (a content-stat hiccup must not fail a healthy doctor).
    try {
      const { analyzeMemoryHealth, formatMemoryHealth } = await import('./memory-health.mjs');
      console.log('');
      console.log(formatMemoryHealth(analyzeMemoryHealth({ projectRoot })));
    } catch {
      // informational section only — stay silent on failure
    }
  } catch (err) {
    console.error(`cmk doctor: unexpected error: ${err?.message ?? err}`);
    process.exitCode = 2;
  }
}

// Task 129 (D-121): `cmk config` — real, replacing the v0.1.0 stub. Dotted-key
// get/set/--show-origin over the per-tier settings.json files. Dep-injectable
// (cwd/userDir/log/logError) on the runImportClaudeMd pattern for testing the
// CLI surface. The pure resolution/mutation lives in config-core.mjs.
const TIER_FLAG_TO_NAME = { local: 'local', project: 'project', user: 'user' };

export function runConfigGet(key, options = {}) {
  const projectRoot = options?.cwd ?? resolvePath(process.cwd());
  const userDir = options?.userDir ?? join(homedir(), '.claude-memory-kit');
  const log = options?.log ?? console.log;
  const logError = options?.logError ?? console.error;
  const r = configGet(key, { projectRoot, userDir });
  if (!r.found) {
    logError(`cmk config get: '${key}' is not set in any tier`);
    process.exitCode = 2;
    return r;
  }
  log(typeof r.value === 'string' ? r.value : JSON.stringify(r.value));
  return r;
}

export function runConfigSet(key, value, options = {}) {
  const projectRoot = options?.cwd ?? resolvePath(process.cwd());
  const userDir = options?.userDir ?? join(homedir(), '.claude-memory-kit');
  const log = options?.log ?? console.log;
  const logError = options?.logError ?? console.error;
  const tier = TIER_FLAG_TO_NAME[options?.tier ?? 'project'] ?? 'project';
  const r = configSet(key, value, { projectRoot, userDir, tier });
  if (!r.ok) {
    logError(`cmk config set: ${r.error}`);
    process.exitCode = 2;
    return r;
  }
  log(`cmk config set: ${key} = ${value} (${r.tier} tier)`);
  return r;
}

export function runConfigShowOrigin(key, options = {}) {
  const projectRoot = options?.cwd ?? resolvePath(process.cwd());
  const userDir = options?.userDir ?? join(homedir(), '.claude-memory-kit');
  const log = options?.log ?? console.log;
  const logError = options?.logError ?? console.error;
  const r = configShowOrigin(key, { projectRoot, userDir });
  if (!r.found) {
    logError(`cmk config --show-origin: '${key}' is not set in any tier`);
    process.exitCode = 2;
    return r;
  }
  for (const e of r.entries) {
    const val = typeof e.value === 'string' ? `"${e.value}"` : JSON.stringify(e.value);
    const note = e.winner ? '' : `   (shadowed by ${e.shadowedBy})`;
    log(`${e.tier.padEnd(8)} ${e.path}   ${val}${note}`);
  }
  return r;
}

// The parent `cmk config` action: handle the --show-origin flag here; the
// get/set children carry their own actions (wired in the registry below).
// Exported for the branch test (the no-subcommand path).
export function runConfigCli(options /* , command */) {
  if (options?.showOrigin) {
    return runConfigShowOrigin(options.showOrigin, options);
  }
  const logError = options?.logError ?? console.error;
  logError(
    'cmk config: specify a subcommand — `get <key>`, `set <key> <value>`, or `--show-origin <key>`.',
  );
  process.exitCode = 2;
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

// Task 114 (F-13): dep-injectable (projectRoot / harnessRoot / log / logError) so
// the real-import CLI path is verifiable on real input WITHOUT touching the user's
// ~/.claude. Defaults are unchanged for production. Returns the core result.
export async function runImportAnthropicMemory(options = {}) {
  const projectRoot = options?.projectRoot ?? resolvePath(process.cwd());
  const log = options?.log ?? console.log;
  const logError = options?.logError ?? console.error;
  const dryRun = options?.dryRun === true;
  const acceptAll = options?.yes === true;
  // options.importFn is a test seam (default = the real core) so the error +
  // catch branches below — unreachable via normal input — are coverable.
  const importFn = options?.importFn ?? importAnthropicMemory;
  try {
    const r = await importFn({ projectRoot, dryRun, acceptAll, harnessRoot: options?.harnessRoot });
    if (r.action === 'error') {
      logError(`cmk import-anthropic-memory: error — ${(r.errors ?? []).join('; ')}`);
      process.exitCode = 2;
      return r;
    }
    if (r.reason === 'no-source') {
      log(`cmk import-anthropic-memory: no Anthropic auto-memory found at ${r.sourcePath}`);
      return r;
    }
    if (r.mode === 'dry-run') {
      log(`cmk import-anthropic-memory: dry-run — ${r.proposals.length} proposal(s), ${r.skipped} duplicate(s) skipped`);
      for (const p of r.proposals) log(`  + ${p.id}: ${p.text}`);
      return r;
    }
    if (r.mode === 'requires-confirmation') {
      log(`cmk import-anthropic-memory: ${r.proposals.length} proposal(s) ready to apply.`);
      log('  Re-run with --yes to apply, or --dry-run to inspect.');
      for (const p of r.proposals) log(`  + ${p.id}: ${p.text}`);
      return r;
    }
    log(`cmk import-anthropic-memory: applied ${r.accepted} proposal(s), skipped ${r.skipped} duplicate(s)`);
    return r;
  } catch (err) {
    logError(`cmk import-anthropic-memory: unexpected error: ${err?.message ?? err}`);
    process.exitCode = 2;
  }
}

// Task 142 (D-130): onboard from an existing rules file. Dep-injectable
// (projectRoot / log / logError / importFn) on the runImportAnthropicMemory
// pattern so the real CLI path is verifiable in a sandbox. `file` is the
// optional positional (commander passes it first), defaulting to CLAUDE.md.
export async function runImportClaudeMd(file, options = {}) {
  const projectRoot = options?.projectRoot ?? resolvePath(process.cwd());
  const log = options?.log ?? console.log;
  const logError = options?.logError ?? console.error;
  const dryRun = options?.dryRun === true;
  const acceptAll = options?.yes === true;
  const importFn = options?.importFn ?? importClaudeMd;
  try {
    const r = await importFn({ projectRoot, file, dryRun, acceptAll });
    if (r.action === 'error') {
      logError(`cmk import-claude-md: error — ${(r.errors ?? []).join('; ')}`);
      process.exitCode = 2;
      return r;
    }
    if (r.reason === 'no-source') {
      log(`cmk import-claude-md: no rules file found at ${r.sourcePath}`);
      return r;
    }
    if (r.reason) {
      // e.g. read-source-failed — completed-with-failure must not print the
      // success-shaped "applied 0" line (skill-review 2026-06-12 finding).
      logError(`cmk import-claude-md: ${r.reason} (${r.sourcePath})`);
      process.exitCode = 2;
      return r;
    }
    const listProposals = () => {
      for (const p of r.proposals) log(`  + [${p.type}] L${p.line}: ${p.text}`);
    };
    if (r.mode === 'dry-run') {
      log(`cmk import-claude-md: dry-run — ${r.proposals.length} proposal(s), ${r.skipped} duplicate(s) skipped`);
      listProposals();
      return r;
    }
    if (r.mode === 'requires-confirmation') {
      log(`cmk import-claude-md: ${r.proposals.length} proposal(s) ready to apply.`);
      log('  Re-run with --yes to apply, or --dry-run to inspect.');
      listProposals();
      return r;
    }
    const rejectedNote = r.rejected > 0 ? `, ${r.rejected} rejected by Poison_Guard` : '';
    const errorNote = r.errors > 0 ? `, ${r.errors} error(s)` : '';
    log(`cmk import-claude-md: applied ${r.accepted} fact(s), skipped ${r.skipped} duplicate(s)${rejectedNote}${errorNote}`);
    return r;
  } catch (err) {
    logError(`cmk import-claude-md: unexpected error: ${err?.message ?? err}`);
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
    // Claude Code sets CLAUDE_PROJECT_DIR in the spawned MCP server's environment
    // to the project root (code.claude.com/docs/en/mcp). Prefer it over cwd so the
    // server indexes the right project even when Claude Code launches it with a
    // different working directory. Falls back to cwd for a manual `cmk mcp serve`.
    const projectRoot = resolvePath(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
    const userDir = process.env.MEMORY_KIT_USER_DIR ?? join(homedir(), '.claude-memory-kit');
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
  // A bare `cmk mcp` (no sub-verb) reaches here post-Task-129 (the parent
  // action is now wired) — commander passes an options object, not a string.
  const verb = typeof childName === 'string' ? childName : '(none)';
  console.error(`cmk mcp: ${NOTICE_PREFIX} (run \`cmk mcp serve\`; got sub-verb '${verb}')`);
  process.exitCode = 2;
}

async function runQueueDispatch(childName) {
  if (childName === 'conflicts') {
    return runQueueConflicts();
  }
  if (childName === 'review') {
    return runQueueReview();
  }
  // A bare `cmk queue` reaches here post-Task-129 (parent action wired);
  // commander passes an options object, not a string sub-verb.
  const verb = typeof childName === 'string' ? childName : '(none)';
  console.log(`cmk queue: ${NOTICE_PREFIX} (run \`cmk queue review\` or \`cmk queue conflicts\`; got '${verb}')`);
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
// Task 113 (F-9): conflict prompter LOGIC extracted as a factory over `ask`
// (see buildReviewPrompter) so it's unit-testable without stdin.
export function buildConflictPrompter({ ask, log }) {
  const VALID = new Set(['keep-old', 'keep-new', 'merge-both', 'skip']);
  return async ({ proposedId, proposedText, proposedTrust, existingId, existingText, existingTrust, similarity }) => {
    log('');
    log('─── pending conflict ──────────────────────────────────────');
    log(`existing  (${existingId}, trust=${existingTrust}): ${existingText}`);
    log(`proposed  (${proposedId}, trust=${proposedTrust}): ${proposedText}`);
    log(`similarity: ${Number(similarity).toFixed(4)}`);
    let decision = '';
    while (!VALID.has(decision)) {
      const answer = await ask(`  [keep-old / keep-new / merge-both / skip]: `);
      decision = String(answer).trim();
      if (!VALID.has(decision)) {
        log(`  unknown answer "${decision}" — please type one of: keep-old, keep-new, merge-both, skip`);
      }
    }
    return decision;
  };
}

// Task 113 (F-9): dep-injectable (see runQueueReview). Defaults unchanged for prod;
// a test injects { projectRoot, prompter, log, logError } to drive a real keep-old
// / keep-new / merge-both resolution end-to-end without stdin. Returns the result.
export async function runQueueConflicts(opts = {}) {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const log = opts.log ?? console.log;
  const logError = opts.logError ?? console.error;

  let rl = null;
  let prompter = opts.prompter;
  if (!prompter) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    const askOnce = (q) =>
      new Promise((resolve) => rl.question(q, (answer) => resolve(answer)));
    prompter = buildConflictPrompter({ ask: askOnce, log });
  }

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
      logError(
        `cmk queue conflicts: merge-both for ${existingId} + ${proposedId} failed: ${result.errors.join('; ')}`,
      );
    } else {
      log(`  merge-both → ${existingId} + ${proposedId} merged into ${result.id}`);
    }
  };

  // opts.resolve test seam (default = the real resolver) — see runQueueReview.
  const resolve = opts.resolve ?? resolveConflictQueue;
  try {
    const result = await resolve({
      tier: 'P',
      projectRoot,
      prompter,
      mergeFn,
    });
    if (result.action === 'error') {
      for (const e of result.errors) logError(`cmk queue conflicts: ${e}`);
      process.exitCode = 2;
      return result;
    }
    log('');
    log(
      `cmk queue conflicts: ${result.resolved} resolved (${result.kept_old} kept-old, ${result.kept_new} kept-new, ${result.merged} merged), ${result.skipped} skipped`,
    );
    return result;
  } finally {
    if (rl) rl.close();
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
// Task 113 (F-9): the interactive prompter LOGIC (formatting + the validate-retry
// loop) extracted as a factory over an injectable `ask`, so it's unit-testable
// without a real readline/stdin — only the 2-line createInterface wrapper in the
// runner stays an uncovered shim.
export function buildReviewPrompter({ ask, log }) {
  const VALID = new Set(['promote', 'discard', 'skip']);
  return async ({ id, text, ts, provenance }) => {
    log('');
    log('─── pending review ────────────────────────────────────────');
    log(`id:   ${id}`);
    log(`ts:   ${ts}`);
    log(`text: ${text}`);
    if (provenance) log(`prov: ${provenance.trim()}`);
    let decision = '';
    while (!VALID.has(decision)) {
      const answer = await ask(`  [promote / discard / skip]: `);
      decision = String(answer).trim();
      if (!VALID.has(decision)) {
        log(`  unknown answer "${decision}" — please type one of: promote, discard, skip`);
      }
    }
    return decision;
  };
}

// Task 113 (F-9): dep-injectable so the CLI resolution path is verifiable on REAL
// queued items. Defaults (readline over stdin + cwd + console) are unchanged for
// production; a test injects { projectRoot, prompter, log, logError } to drive a
// real promote/discard end-to-end without stdin. Returns the resolver result.
export async function runQueueReview(opts = {}) {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const log = opts.log ?? console.log;
  const logError = opts.logError ?? console.error;

  // Build the interactive prompter only when the caller didn't inject one — so a
  // test never opens a real readline on stdin.
  let rl = null;
  let prompter = opts.prompter;
  if (!prompter) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    const askOnce = (q) =>
      new Promise((resolve) => rl.question(q, (answer) => resolve(answer)));
    prompter = buildReviewPrompter({ ask: askOnce, log });
  }

  // opts.resolve is a test seam (default = the real resolver) so the error-
  // handling branches below — unreachable via normal input since tier/prompter
  // are always valid here — are coverable (Task 113).
  const resolve = opts.resolve ?? resolveReviewQueue;
  try {
    const result = await resolve({ tier: 'P', projectRoot, prompter });
    if (result.action === 'error') {
      for (const e of result.errors) logError(`cmk queue review: ${e}`);
      process.exitCode = 2;
      return result;
    }
    log('');
    log(
      `cmk queue review: ${result.promoted} promoted, ${result.discarded} discarded, ${result.skipped} skipped${result.errors && result.errors.length ? `, ${result.errors.length} errored` : ''}`,
    );
    if (result.errors && result.errors.length) {
      for (const err of result.errors) {
        logError(`  error on ${err.id} (${err.decision}): ${err.errors.join('; ')}`);
      }
    }
    return result;
  } finally {
    if (rl) rl.close();
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
      { flags: '--ide <agent>', description: 'target agent: claude-code (default) | kiro — wires that agent\'s hooks + MCP + instruction file' },
      { flags: '--force', description: 'allow downgrade of an existing newer-version CLAUDE.md block' },
      { flags: '--no-hooks', description: 'scaffold only; do NOT wire hooks into .claude/settings.json' },
      { flags: '--with-semantic', description: 'enable semantic recall: install the local embedder (~260 MB once), default search to hybrid, pre-warm the model' },
      { flags: '--no-semantic', description: 'pin keyword-only search for this project (writes search.default_mode=keyword)' },
      { flags: '--verbose', description: 'show the per-tier created/skipped file breakdown' },
    ],
    action: runInstall,
  },
  {
    name: 'hook',
    description: 'Kiro hook entrypoint — `cmk hook <agentSpawn|promptSubmit|stop>` (inject/capture; called by Kiro IDE + CLI hooks, not by users)',
    milestone: 50,
    argSpec: [{ flags: '<event>', description: 'the Kiro lifecycle event: agentSpawn | promptSubmit | stop' }],
    action: runHook,
  },
  {
    name: 'uninstall',
    description: 'remove the kit-managed surface (preserves everything else byte-for-byte; never touches context/)',
    milestone: 4,
    optionSpec: [
      { flags: '--ide <agent>', description: 'which agent to uninstall: claude-code (default) | kiro — removes only THAT agent\'s managed surface' },
    ],
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
      { flags: '--mode <mode>', description: 'keyword | semantic | hybrid (default: keyword; semantic + hybrid use the embedded Layer-5b backend — needs the optional @huggingface/transformers embedder)' },
      { flags: '--scope <scope>', description: 'facts | transcripts (default: facts — curated memory; transcripts = the raw session record, the last-resort recall tier)' },
      { flags: '--min-trust <level>', description: 'low | medium | high' },
      { flags: '--tier <tier>', description: 'U | P | L (filter to a single tier)' },
      { flags: '--since <date>', description: 'ISO date — exclude observations older than this' },
      { flags: '--limit <n>', description: 'max results (default: 20)' },
      { flags: '--include-tombstoned', description: 'include deleted observations in results' },
    ],
    action: runSearch,
  },
  {
    name: 'get',
    description: 'fetch full observation bodies + provenance by ID (parity with the mk_get MCP tool)',
    milestone: 108,
    argSpec: [{ flags: '<ids...>', description: 'one or more citation IDs (e.g. P-S79MJHFN)' }],
    optionSpec: [
      {
        flags: '--include-tombstoned',
        description: 'also recover forgotten (tombstoned) facts from the archive — human-only; the AI never reads tombstones',
      },
    ],
    action: runGet,
  },
  {
    name: 'timeline',
    description: 'sequential context around an anchor observation — N before + N after (mk_timeline parity)',
    milestone: 108,
    argSpec: [{ flags: '<anchor>', description: 'citation ID to anchor the timeline on' }],
    optionSpec: [
      { flags: '--before <n>', description: 'observations before the anchor (default: 5)' },
      { flags: '--after <n>', description: 'observations after the anchor (default: 5)' },
    ],
    action: runTimeline,
  },
  {
    name: 'cite',
    description: 'render the canonical Markdown citation link for an observation (mk_cite parity)',
    milestone: 108,
    argSpec: [{ flags: '<id>', description: 'citation ID' }],
    action: runCite,
  },
  {
    name: 'recent-activity',
    description: 'list recent observation changes within a time window (mk_recent_activity parity)',
    milestone: 108,
    optionSpec: [
      { flags: '--window <w>', description: '1h | 24h | 7d (default: 24h)' },
      { flags: '--limit <n>', description: 'max results (default: 20)' },
    ],
    action: runRecentActivity,
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
    name: 'digest',
    description: 'print a readable digest of everything in memory + sync the append-only DECISIONS.md decision journal',
    milestone: 147,
    action: runDigestCli,
  },
  {
    name: 'config',
    description: 'read/write kit settings (context/settings.json) without hand-editing JSON',
    milestone: 129,
    optionSpec: [
      { flags: '--show-origin <key>', description: 'print every tier that defines a setting (winner + shadowed) — the "where did this come from?" debug surface' },
    ],
    children: [
      {
        name: 'get',
        description: 'print the resolved value of a setting (dotted key; local > project > user)',
        argSpec: [{ flags: '<key>', description: 'setting key (dotted path, e.g. search.default_mode)' }],
        action: (key, options) => runConfigGet(key, options),
      },
      {
        name: 'set',
        description: 'set a setting in the project tier (or --local)',
        argSpec: [
          { flags: '<key>', description: 'setting key (dotted path)' },
          { flags: '<value>', description: 'new value (true/false/number coerced; else string)' },
        ],
        optionSpec: [
          { flags: '--local', description: 'write to the local tier (context.local/, gitignored) instead of project' },
        ],
        action: (key, value, options) => runConfigSet(key, value, { tier: options?.local ? 'local' : 'project' }),
      },
    ],
    action: runConfigCli,
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
    name: 'import-claude-md',
    description: 'onboard from an existing rules file (CLAUDE.md / .cursorrules / AGENTS.md) — parse it into typed facts through the safe write path',
    milestone: 142,
    argSpec: [
      { flags: '[file]', description: 'rules file to import, relative to the project root (default: CLAUDE.md)' },
    ],
    optionSpec: [
      { flags: '--dry-run', description: 'preview the typed proposals without modifying files' },
      { flags: '--yes', description: 'apply every proposal without prompting (apply requires explicit --yes)' },
    ],
    action: runImportClaudeMd,
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
