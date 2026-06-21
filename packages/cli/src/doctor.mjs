// `cmk doctor` — health checks HC-1..HC-9 (Task 37, T-031; memsearch HC-1/HC-7 removed in Task 120; HC-8 native bindings added in Task 141a; HC-9 version-drift/update-path added in Task 162 / D-176).
//
// Public boundary:
//   async runDoctor({projectRoot, userDir, now, promptUser?, ...overrides})
//     → {action: 'completed' | 'error', checks: [HCResult], duration_ms}
//
// HCResult shape:
//   {
//     id: 'HC-1' | ... | 'HC-7',
//     name: string,
//     status: 'pass' | 'fail' | 'skip',
//     message: string,
//     recoveryCommand?: string,   // surfaced on fail
//     requiresInstall?: boolean,  // if true, caller must promptUser first
//   }
//
// Per design §14. Composes on:
//   - cooldown.mjs (HC-2 distill freshness via cooldown marker mtime is
//     NOT used — we read recent.md mtime directly, more accurate)
//   - lazy-compress.mjs::cronSentinelPath (HC-5 cron registration check)
//   - lock-discipline.mjs::detectStaleLocks (HC-7)
//   - platform-commands.mjs — cross-platform repair command emission
//
// Critical rule per design §14 + tasks.md 37.5: any repair requiring
// `pip install` / `npm install` / system-level changes MUST ASK the
// user first. (I1 fix 2026-05-28: previously cited NFR-9 which is
// actually "Memory poisoning defense baseline" per requirements-revisions-proposed.md
// — the ask-before-install rule has no FR/NFR backing today; promoting
// it is a v0.1.x candidate.) runDoctor records `requiresInstall: true`
// on those HCResults and the CLI handler surfaces the command without
// auto-invoking it.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { nowIso } from './audit-log.mjs';
import { detectStaleLocks } from './lock-discipline.mjs';
import { cronSentinelPath } from './lazy-compress.mjs';
import { getNativeAutoMemoryState } from './native-memory.mjs';
import { checkKitBinding, checkEmbedderBinding } from './native-binding.mjs';
import { resolveDefaultSearchMode } from './semantic-backend.mjs';
import { checkVersionDrift } from './version-drift.mjs';
import { getKitVersion } from './install.mjs';

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const TRANSCRIPTS_REL = ['context', 'transcripts'];
const SESSIONS_REL = ['context', 'sessions'];
const RECENT_MD_REL = ['context', 'sessions', 'recent.md'];
const MEMORY_INDEX_REL = ['context', 'memory', 'INDEX.md'];
const MEMORY_DIR_REL = ['context', 'memory'];
const LOCKS_REL = ['context', '.locks'];
const NATIVE_MEMORY_LOG_REL = ['context', '.locks', 'native-memory-status.log'];

// Which agent was this project installed for? A `--ide kiro` install wires
// .kiro/hooks/*.kiro.hook (+ .kiro/settings/mcp.json); a Claude Code install
// wires .claude/settings.json. HC-1 must check the RIGHT surface — before
// v0.4.0 it hard-checked .claude/settings.json and false-FAILed on every Kiro
// install (the cut-gate-kiro live-test find, Task 50). Detection: an existing
// .claude/settings.json means Claude Code; otherwise a .kiro/ dir means Kiro.
// (A project with neither defaults to Claude Code — the historical behavior,
// so a not-yet-installed project still reports the Claude-shaped repair hint.)
function detectInstallKind(projectRoot) {
  if (existsSync(join(projectRoot, '.claude', 'settings.json'))) return 'claude-code';
  if (existsSync(join(projectRoot, '.kiro'))) return 'kiro';
  return 'claude-code';
}

// --- HC-1: Stop + SessionStart hooks registered -----------------------
function hc1Hooks({ projectRoot }) {
  // Agent-aware (v0.4.0): a Kiro install keeps its hooks in .kiro/hooks/, so
  // route to the Kiro check rather than false-failing on a missing
  // .claude/settings.json with a Claude-Code repair hint.
  if (detectInstallKind(projectRoot) === 'kiro') {
    return hc1KiroHooks({ projectRoot });
  }
  // Per design §5 — the Claude Code hooks live in .claude/settings.json
  // alongside its plugin manifest. Required for auto-extract +
  // session-end compression to fire.
  const settingsPath = join(projectRoot, '.claude', 'settings.json');
  if (!existsSync(settingsPath)) {
    return {
      id: 'HC-1',
      name: 'Stop + SessionStart hooks registered',
      status: 'fail',
      message: '.claude/settings.json missing — hooks not wired',
      recoveryCommand: 'cmk repair --hooks',
    };
  }
  let settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch (err) {
    return {
      id: 'HC-1',
      name: 'Stop + SessionStart hooks registered',
      status: 'fail',
      message: `.claude/settings.json parse error: ${err?.message ?? err}`,
      recoveryCommand: 'cmk repair --hooks',
    };
  }
  // B1 fix (skill-review 2026-05-28): walk the actual hooks.<Event>[].command
  // structure instead of substring-matching against JSON.stringify(settings).
  // Substring-match false-positives on ANY occurrence (description text,
  // env value, stale TODO comment) and doesn't verify each hook is wired
  // to its CORRECT event array. The walk pins both contracts: hook
  // present + hook in the right event.
  const required = [
    { event: 'SessionStart', command: 'cmk-inject-context' },
    { event: 'Stop', command: 'cmk-capture-turn' },
    { event: 'SessionEnd', command: 'cmk-compress-session' },
  ];
  const hooks = settings?.hooks ?? {};
  const missing = [];
  for (const { event, command } of required) {
    const entries = Array.isArray(hooks[event]) ? hooks[event] : [];
    // An entry may be (a) a bare string command, (b) a flat object
    // {command: '...'}, or (c) the canonical Anthropic / kit nested shape
    // {hooks: [{type, command}, ...]}. The kit's own writers (cmk install
    // + cmk repair --hooks via settings-hooks.mjs) emit form (c), so HC-2
    // MUST traverse the nested hooks[] array — otherwise `cmk install`
    // followed by `cmk doctor` reports HC-2 fail on hooks the kit itself
    // just wrote (a separately-correct-jointly-broken composition bug
    // caught while shipping Task 49; pre-Task-49 the doctor test only ever
    // fed form (b), so the gap stayed latent).
    const found = entries.some((e) => {
      if (typeof e === 'string') return e.includes(command);
      if (e && typeof e === 'object') {
        if (typeof e.command === 'string' && e.command.includes(command)) return true;
        if (Array.isArray(e.hooks)) {
          return e.hooks.some(
            (h) => h && typeof h.command === 'string' && h.command.includes(command),
          );
        }
      }
      return false;
    });
    if (!found) missing.push(`${event}.${command}`);
  }
  if (missing.length > 0) {
    return {
      id: 'HC-1',
      name: 'Stop + SessionStart hooks registered',
      status: 'fail',
      message: `missing hook references: ${missing.join(', ')}`,
      recoveryCommand: 'cmk repair --hooks',
    };
  }
  return {
    id: 'HC-1',
    name: 'Stop + SessionStart hooks registered',
    status: 'pass',
    message: 'all kit hooks wired to their correct event arrays in .claude/settings.json',
  };
}

// --- HC-1 (Kiro variant): the .kiro/hooks/*.kiro.hook capture + inject hooks ---
// A `--ide kiro` install wires two IDE hooks: cmk-capture.kiro.hook (agentStop →
// capture) and cmk-inject.kiro.hook (promptSubmit → inject). Both must be present
// for automatic memory to fire. The repair is a re-install (`cmk install --ide
// kiro`), NOT the Claude-Code `cmk repair --hooks`.
function hc1KiroHooks({ projectRoot }) {
  const hooksDir = join(projectRoot, '.kiro', 'hooks');
  const required = ['cmk-capture.kiro.hook', 'cmk-inject.kiro.hook'];
  const missing = required.filter((f) => !existsSync(join(hooksDir, f)));
  if (missing.length > 0) {
    return {
      id: 'HC-1',
      name: 'Stop + SessionStart hooks registered',
      status: 'fail',
      message: `Kiro install: missing IDE hook(s) ${missing.join(', ')} in .kiro/hooks/`,
      recoveryCommand: 'cmk install --ide kiro',
    };
  }
  return {
    id: 'HC-1',
    name: 'Stop + SessionStart hooks registered',
    status: 'pass',
    message: 'Kiro IDE hooks wired (.kiro/hooks/cmk-capture + cmk-inject)',
  };
}

// --- HC-2: distill freshness (≤2 days) --------------------------------
function hc2DistillFreshness({ projectRoot, now }) {
  const recentPath = join(projectRoot, ...RECENT_MD_REL);
  if (!existsSync(recentPath)) {
    // Not a failure: on a fresh project there's nothing distilled yet, and
    // when there is, the lazy-on-read path runs the distill at SessionStart
    // (or `cmk daily-distill`). "Stale recent.md" below IS a real fail; a
    // never-built one is just "not yet" — mirror HC-5's skip-on-fresh.
    return {
      id: 'HC-2',
      name: 'Daily distill is fresh (≤2 days)',
      status: 'skip',
      message: 'recent.md not built yet — nothing to distill. Runs automatically (lazy-on-read at SessionStart, or `cmk daily-distill`) once there is session content.',
    };
  }
  let mtimeMs;
  try {
    mtimeMs = statSync(recentPath).mtimeMs;
  } catch (err) {
    return {
      id: 'HC-2',
      name: 'Daily distill is fresh (≤2 days)',
      status: 'fail',
      message: `recent.md stat error: ${err?.message ?? err}`,
      recoveryCommand: 'cmk daily-distill',
    };
  }
  const nowMs = new Date(now ?? nowIso()).getTime();
  const ageMs = nowMs - mtimeMs;
  if (ageMs > TWO_DAYS_MS) {
    return {
      id: 'HC-2',
      name: 'Daily distill is fresh (≤2 days)',
      status: 'fail',
      message: `recent.md ${Math.round(ageMs / (24 * 60 * 60 * 1000))}d old (cutoff: 2d)`,
      recoveryCommand: 'cmk daily-distill',
    };
  }
  return {
    id: 'HC-2',
    name: 'Daily distill is fresh (≤2 days)',
    status: 'pass',
    message: `recent.md ${Math.round(ageMs / (60 * 60 * 1000))}h old`,
  };
}

// --- HC-3: transcripts firing (≤3 days) -------------------------------
function hc3Transcripts({ projectRoot, now }) {
  const transcriptsDir = join(projectRoot, ...TRANSCRIPTS_REL);
  if (!existsSync(transcriptsDir)) {
    // Fresh project, never had a Claude Code session here → nothing to fire
    // yet. Skip, don't fail (the dir + first transcript appear on the first turn).
    return {
      id: 'HC-3',
      name: 'Transcripts firing (≤3 days)',
      status: 'skip',
      message: 'no transcripts yet — they appear after your first Claude Code turn in this project.',
    };
  }
  const nowMs = new Date(now ?? nowIso()).getTime();
  const cutoffMs = nowMs - THREE_DAYS_MS;
  let totalCount = 0;
  let recentCount = 0;
  for (const name of readdirSync(transcriptsDir)) {
    if (!/\.md$/.test(name)) continue;
    totalCount += 1;
    try {
      const mtimeMs = statSync(join(transcriptsDir, name)).mtimeMs;
      if (mtimeMs >= cutoffMs) recentCount += 1;
    } catch {
      // skip unreadable
    }
  }
  if (totalCount === 0) {
    // Dir exists (scaffolded) but no transcripts captured yet → still "not
    // yet", not a failure.
    return {
      id: 'HC-3',
      name: 'Transcripts firing (≤3 days)',
      status: 'skip',
      message: 'no transcripts yet — they appear after your first Claude Code turn in this project.',
    };
  }
  if (recentCount === 0) {
    // Transcripts EXIST but none recent → the kit was capturing and stopped.
    // That IS a real signal (the Stop hook may not be firing here).
    return {
      id: 'HC-3',
      name: 'Transcripts firing (≤3 days)',
      status: 'fail',
      message: 'transcripts exist but none within 3 days — the Stop hook may have stopped firing (is this project Claude Code\'s primary cwd?)',
      recoveryCommand: 'reopen this project as the primary cwd in Claude Code',
    };
  }
  return {
    id: 'HC-3',
    name: 'Transcripts firing (≤3 days)',
    status: 'pass',
    message: `${recentCount} transcript(s) within 3 days`,
  };
}

// --- HC-4: INDEX.md matches context/memory/ ---------------------------
function hc4IndexConsistency({ projectRoot }) {
  const memoryDir = join(projectRoot, ...MEMORY_DIR_REL);
  const indexPath = join(projectRoot, ...MEMORY_INDEX_REL);
  if (!existsSync(memoryDir)) {
    return {
      id: 'HC-4',
      name: 'INDEX.md matches context/memory/ files',
      status: 'skip',
      message: 'context/memory/ missing — no granular facts to index yet',
    };
  }
  if (!existsSync(indexPath)) {
    return {
      id: 'HC-4',
      name: 'INDEX.md matches context/memory/ files',
      status: 'fail',
      message: 'context/memory/INDEX.md missing',
      recoveryCommand: 'cmk reindex',
    };
  }
  // Count fact files (*.md excluding INDEX.md itself).
  let factFiles;
  try {
    factFiles = readdirSync(memoryDir).filter(
      (n) => /\.md$/.test(n) && n !== 'INDEX.md',
    );
  } catch (err) {
    return {
      id: 'HC-4',
      name: 'INDEX.md matches context/memory/ files',
      status: 'fail',
      message: `readdir error: ${err?.message ?? err}`,
      recoveryCommand: 'cmk reindex',
    };
  }
  // Read INDEX.md and count entries that look like file references.
  // We expect lines like `- [Description](file.md)` or `- file.md`.
  let indexText;
  try {
    indexText = readFileSync(indexPath, 'utf8');
  } catch (err) {
    return {
      id: 'HC-4',
      name: 'INDEX.md matches context/memory/ files',
      status: 'fail',
      message: `INDEX.md read error: ${err?.message ?? err}`,
      recoveryCommand: 'cmk reindex',
    };
  }
  // Fact-file references in INDEX.md are markdown LINK TARGETS whose filename
  // follows the kit's `<type>_<slug>.md` convention (e.g. feedback_layered.md) —
  // that's what `cmk reindex`'s formatIndexLine writes: `[slug](type_slug.md)`.
  // Match the link target's *.md basename, THEN keep only fact-file-shaped names.
  //
  // Two false-positives this must avoid (both real):
  //   1. id-shaped names — the pre-Task-85 regex matched `[PUL]-XXXXXXXX.md`,
  //      which the kit NEVER generates, so HC-5 false-FAILED "missing" on every
  //      real fact the moment one existed (live-test-7 2026-06-03).
  //   2. non-fact links — a broad `](...md)` match also catches the scaffold's
  //      own example `- [type] [Title](filename.md)` (inside an HTML comment) and
  //      any prose link like `(design.md)`, which would false-FAIL "stale" on a
  //      FRESH install (skill-review 2026-06-03). The `<type>_<slug>` shape
  //      (a `type_` underscore prefix) excludes `filename.md` / `design.md` /
  //      `0001.md` while matching every real fact file.
  const FACT_FILE_RE = /^[a-z]+_[a-z0-9][a-z0-9-]*\.md$/i;
  const indexEntries = new Set();
  const re = /\]\(([^)]+\.md)\)/g;
  let m;
  while ((m = re.exec(indexText)) !== null) {
    const fname = m[1].split(/[\\/]/).pop(); // basename, tolerate ./ or path-prefixed links
    if (fname && fname !== 'INDEX.md' && FACT_FILE_RE.test(fname)) indexEntries.add(fname);
  }
  const factSet = new Set(factFiles);
  const inFactsNotIndex = [...factSet].filter((f) => !indexEntries.has(f));
  const inIndexNotFacts = [...indexEntries].filter((f) => !factSet.has(f));
  if (inFactsNotIndex.length === 0 && inIndexNotFacts.length === 0) {
    return {
      id: 'HC-4',
      name: 'INDEX.md matches context/memory/ files',
      status: 'pass',
      message: `${factFiles.length} fact file(s); INDEX in sync`,
    };
  }
  const parts = [];
  if (inFactsNotIndex.length > 0) parts.push(`missing from INDEX: ${inFactsNotIndex.length}`);
  if (inIndexNotFacts.length > 0) parts.push(`stale in INDEX: ${inIndexNotFacts.length}`);
  return {
    id: 'HC-4',
    name: 'INDEX.md matches context/memory/ files',
    status: 'fail',
    message: parts.join('; '),
    recoveryCommand: 'cmk reindex',
  };
}

// --- HC-5: Cron jobs registered with host scheduler -------------------
function hc5CronRegistered({ projectRoot }) {
  if (existsSync(cronSentinelPath(projectRoot))) {
    return {
      id: 'HC-5',
      name: 'Cron jobs registered with host scheduler',
      status: 'pass',
      message: 'cron-registered sentinel present',
    };
  }
  // Cron is OPTIONAL by design (README + design §… the lazy-on-read fallback
  // compresses at SessionStart without any scheduler). Absence is therefore a
  // SKIP, not a FAIL — flagging an optional, working-by-fallback feature as a
  // failure made a healthy fresh install read as broken.
  return {
    id: 'HC-5',
    name: 'Cron jobs registered with host scheduler',
    status: 'skip',
    message: 'cron not registered (optional) — using the lazy-on-read fallback (compresses at SessionStart). Run `cmk register-crons` for scheduled background compression.',
  };
}

// --- HC-6: Native Anthropic Auto Memory status -----------------------
function hc6NativeAutoMemory({ projectRoot, now }) {
  // Per ADR-0011 — detect whether Anthropic's native Auto Memory is
  // also active for this project. Non-fatal; informational. Log the
  // result to context/.locks/native-memory-status.log so users can
  // see whether the kit is supplementing or substituting.
  const ts = now ?? nowIso();
  // Anthropic uses the slug pattern `re.sub(r'[^a-zA-Z0-9]', '-', project_dir)`
  // per claude-remember research (SOURCES.md). We approximate that here
  // without invoking Python regex semantics.
  const slug = projectRoot.replace(/[^a-zA-Z0-9]/g, '-');
  const anthropicMemoryDir = join(homedir(), '.claude', 'projects', slug, 'memory');
  let entry;
  if (!existsSync(anthropicMemoryDir)) {
    entry = { ts, active: false, last_modified: null, file_count: 0 };
  } else {
    let files = [];
    try {
      files = readdirSync(anthropicMemoryDir).filter((n) => /\.md$/.test(n));
    } catch {
      // unreadable → treat as unknown
      entry = { ts, active: 'unknown', last_modified: null, file_count: 0, reason: 'unreadable' };
    }
    if (!entry) {
      let lastMtime = 0;
      for (const f of files) {
        try {
          const m = statSync(join(anthropicMemoryDir, f)).mtimeMs;
          if (m > lastMtime) lastMtime = m;
        } catch {
          // skip unreadable
        }
      }
      entry = {
        ts,
        active: files.length > 0,
        last_modified: lastMtime > 0 ? new Date(lastMtime).toISOString() : null,
        file_count: files.length,
      };
    }
  }
  // Write the current-state SNAPSHOT (single line, overwritten each
  // run). I2 fix (skill-review 2026-05-28): clarified — earlier
  // comment said "Append the audit entry" but the code uses
  // writeFileSync (overwrite). Snapshot semantics is the right v0.1.0
  // contract because `cmk doctor` is intended for "what's true RIGHT
  // NOW" checks, not trend analysis. Trend logging is a v0.1.x
  // candidate (would require append + rotation or a separate
  // history.ndjson file).
  // ADR-0011 / Task 60: the project's committable `autoMemoryEnabled` setting
  // is what actually governs native memory going forward. Fold it into both
  // the snapshot log (Door 4 observability) and the message so the
  // `cmk disable-native-memory` opt-in is DISCOVERABLE here, not just at install.
  const { state: settingState } = getNativeAutoMemoryState({ projectRoot });
  entry.setting_state = settingState;

  const logPath = join(projectRoot, ...NATIVE_MEMORY_LOG_REL);
  try {
    mkdirSync(join(projectRoot, ...LOCKS_REL), { recursive: true });
    writeFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // best-effort
  }

  let message;
  if (settingState === 'disabled') {
    // The user opted out — native won't write here regardless of any old files.
    message = 'Anthropic auto-memory DISABLED for this project via .claude/settings.json — the kit is the sole memory layer.';
  } else if (entry.active === true) {
    // Native is writing AND not disabled → both layers run (context bloat).
    // Surface the one-command opt-out (the coexistence choice, discoverable late).
    message = `Anthropic auto-memory ACTIVE (${entry.file_count} files; last: ${entry.last_modified ?? 'unknown'}) — running ALONGSIDE the kit (both inject at session start). Run \`cmk disable-native-memory\` to use one lean layer.`;
  } else if (entry.active === false) {
    message = 'Anthropic auto-memory not active for this project (kit is the sole memory source).';
  } else {
    message = 'Anthropic auto-memory state unknown (directory unreadable).';
  }

  return {
    id: 'HC-6',
    name: 'Native Anthropic Auto Memory status detected',
    status: 'pass',
    message,
  };
}

// --- HC-7: Stale lock files -------------------------------------------
function hc7StaleLocks({ projectRoot, userDir }) {
  const stale = detectStaleLocks(projectRoot, { userDir }).filter((r) => r.stale);
  if (stale.length === 0) {
    return {
      id: 'HC-7',
      name: 'No stale lock files',
      status: 'pass',
      message: 'all locks healthy',
    };
  }
  // Surface the first lock's recoveryCommand. M4 fix (skill-review
  // 2026-05-28): when more than one stale lock exists, the message
  // calls out the remaining count so the user knows to re-run.
  const first = stale[0];
  const moreNote = stale.length > 1
    ? ` (+ ${stale.length - 1} more — re-run after cleaning to surface)`
    : '';
  return {
    id: 'HC-7',
    name: 'No stale lock files',
    status: 'fail',
    message: `${stale.length} stale lock(s); first: ${first.path} (${first.reason})${moreNote}`,
    recoveryCommand: first.recoveryCommand,
  };
}

// --- HC-8: native bindings present (npm 12 readiness, Task 141a) -------
// The BACKSTOP, not the primary UX: `cmk install` probes + asks inline
// (the user's 2026-06-12 steer); HC-8 catches the after-the-fact states
// (npm upgraded later, package reinstalled without the allow flag).
// The repair is an `npm install -g` → requiresInstall per the design §14
// ask-before-install rule.
async function hc8NativeBindings({ projectRoot, kitBindingProbe, embedderBindingProbe }) {
  const kitProbe = kitBindingProbe ?? checkKitBinding;
  const kit = kitProbe();
  if (!kit.ok) {
    return {
      id: 'HC-8',
      name: 'Native bindings present (npm 12 readiness)',
      status: 'fail',
      message: `better-sqlite3 native binding unavailable (${kit.reason}) — most common cause: npm 12 blocks dependency install scripts by default, so a fresh install skips the binding build (a Node major upgrade is the other); search/reindex will crash until it is rebuilt`,
      recoveryCommand: kit.remedy,
      requiresInstall: true,
    };
  }
  // The embedder matters only when this project actually defaults to it.
  const mode = resolveDefaultSearchMode({ projectRoot });
  if (mode === 'keyword') {
    return {
      id: 'HC-8',
      name: 'Native bindings present (npm 12 readiness)',
      status: 'pass',
      message: 'better-sqlite3 binding healthy (semantic not configured — embedder not checked)',
    };
  }
  const embedderProbe = embedderBindingProbe ?? checkEmbedderBinding;
  const embedder = await embedderProbe();
  if (!embedder.ok) {
    const state = embedder.installed
      ? `installed but its native binding failed (${embedder.reason}) — npm 12 blocks onnxruntime-node's install script by default`
      : `not installed, but search.default_mode is '${mode}'`;
    return {
      id: 'HC-8',
      name: 'Native bindings present (npm 12 readiness)',
      status: 'fail',
      message: `semantic embedder ${state}; searches degrade to keyword until fixed`,
      recoveryCommand: embedder.remedy,
      requiresInstall: true,
    };
  }
  return {
    id: 'HC-8',
    name: 'Native bindings present (npm 12 readiness)',
    status: 'pass',
    message: `better-sqlite3 binding healthy; embedder import OK (default mode: ${mode}; the deep pipeline check runs at --with-semantic warm)`,
  };
}

/**
 * Run the full 8-check health audit.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {string} [opts.userDir]
 * @param {string} [opts.now]
 * @param {Function} [opts.kitBindingProbe] - HC-8 test seam.
 * @param {Function} [opts.embedderBindingProbe] - HC-8 test seam.
 * @returns {Promise<{action, checks, duration_ms}>}
 *
 * Note: M3 fix (skill-review 2026-05-28) dropped the v0.1.0 `promptUser`
 * forward-compat parameter. It was destructured-then-void-discarded; no
 * caller passes it. When auto-repair with consent ships (v0.1.x), the
 * parameter lands at that PR alongside the actual consent flow — not
 * pre-empted in v0.1.0 to avoid the "forward-compat hooks rot" pattern.
 */
// --- HC-9: project scaffold version matches the installed cmk (Task 162 / D-176) ---
// After `npm i -g @latest`, a project's version-stamped scaffold stays at the OLD
// version until `cmk install` re-runs there (the easily-forgotten per-project step).
// HC-9 reads the project's CLAUDE.md managed-block version + the installed binary
// version and tells the user to re-run `cmk install` when the project is behind.
function hc9VersionDrift({ projectRoot, kitVersion }) {
  const claudeMdPath = join(projectRoot, 'CLAUDE.md');
  let claudeMdText = null;
  try {
    if (existsSync(claudeMdPath)) claudeMdText = readFileSync(claudeMdPath, 'utf8');
  } catch {
    claudeMdText = null; // unreadable → skip (treated as not-installed)
  }
  return checkVersionDrift({ claudeMdText, kitVersion });
}

export async function runDoctor({
  projectRoot,
  userDir,
  now,
  kitVersion,
  kitBindingProbe,
  embedderBindingProbe,
} = {}) {
  const t0 = Date.now();
  if (!projectRoot) {
    return {
      action: 'error',
      checks: [],
      errors: ['projectRoot is required'],
      duration_ms: Date.now() - t0,
    };
  }
  const ts = now ?? nowIso();
  const resolvedUserDir = userDir ?? join(homedir(), '.claude-memory-kit');

  // Run all checks in order.
  const c1 = hc1Hooks({ projectRoot });
  const c2 = hc2DistillFreshness({ projectRoot, now: ts });
  const c3 = hc3Transcripts({ projectRoot, now: ts });
  const c4 = hc4IndexConsistency({ projectRoot });
  const c5 = hc5CronRegistered({ projectRoot });
  const c6 = hc6NativeAutoMemory({ projectRoot, now: ts });
  const c7 = hc7StaleLocks({ projectRoot, userDir: resolvedUserDir });
  const c8 = await hc8NativeBindings({ projectRoot, kitBindingProbe, embedderBindingProbe });
  // HC-9: kitVersion injectable for tests; defaults to the installed binary's version.
  const c9 = hc9VersionDrift({ projectRoot, kitVersion: kitVersion ?? getKitVersion() });

  return {
    action: 'completed',
    checks: [c1, c2, c3, c4, c5, c6, c7, c8, c9],
    duration_ms: Date.now() - t0,
  };
}
