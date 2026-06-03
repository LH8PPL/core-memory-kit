// `cmk doctor` — health checks HC-1..HC-9 (Task 37, T-031).
//
// Public boundary:
//   async runDoctor({projectRoot, userDir, now, promptUser?, ...overrides})
//     → {action: 'completed' | 'error', checks: [HCResult], duration_ms}
//
// HCResult shape:
//   {
//     id: 'HC-1' | ... | 'HC-9',
//     name: string,
//     status: 'pass' | 'fail' | 'skip',
//     message: string,
//     recoveryCommand?: string,   // surfaced on fail
//     requiresInstall?: boolean,  // if true, caller must promptUser first
//   }
//
// Per design §14. Composes on:
//   - cooldown.mjs (HC-3 distill freshness via cooldown marker mtime is
//     NOT used — we read recent.md mtime directly, more accurate)
//   - lazy-compress.mjs::cronSentinelPath (HC-6 cron registration check)
//   - lock-discipline.mjs::detectStaleLocks (HC-9)
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
import { spawnBinSync } from './spawn-bin.mjs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { nowIso } from './audit-log.mjs';
import { detectStaleLocks } from './lock-discipline.mjs';
import { cronSentinelPath } from './lazy-compress.mjs';
import { getNativeAutoMemoryState } from './native-memory.mjs';

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const TRANSCRIPTS_REL = ['context', 'transcripts'];
const SESSIONS_REL = ['context', 'sessions'];
const RECENT_MD_REL = ['context', 'sessions', 'recent.md'];
const MEMORY_INDEX_REL = ['context', 'memory', 'INDEX.md'];
const MEMORY_DIR_REL = ['context', 'memory'];
const LOCKS_REL = ['context', '.locks'];
const NATIVE_MEMORY_LOG_REL = ['context', '.locks', 'native-memory-status.log'];

// --- HC-1: memsearch installed ----------------------------------------
async function hc1Memsearch() {
  // Layer 5b (semantic search) is OPTIONAL per ADR-0008. Missing
  // memsearch → skip (not fail). The kit ships keyword-only as v0.1.0;
  // semantic requires a separate `pip install memsearch[onnx]`.
  // `requiresInstall: true` so the CLI prompts before auto-installing.
  try {
    // spawnBinSync resolves the Windows .cmd shim without `shell:true`+args
    // (no DEP0190; #4). memsearch's only arg is `--version` (no spaces), so
    // the quoting is a no-op here — the win is dropping the deprecated combo.
    const r = spawnBinSync('memsearch', ['--version'], {
      encoding: 'utf8',
      // M1 fix (skill-review 2026-05-28): 3.5s tolerates Windows
      // cold-Python startup (AV scan + .pyc generation on first hit
      // can push past 2s for a healthy install). HC-2..9 are file-
      // system ops that complete in ≪100ms total, so HC-1 + the rest
      // still fits comfortably inside the 5s NFR budget. Timeout →
      // 'skip' so cmk doctor completes regardless.
      timeout: 3_500,
    });
    if (r.status === 0) {
      return {
        id: 'HC-1',
        name: 'memsearch installed (semantic search backend)',
        status: 'pass',
        message: `memsearch ${(r.stdout || '').trim() || 'detected'}`,
      };
    }
  } catch {
    // fall through to skip
  }
  // Lior 2026-05-28: make the feature impact explicit so users
  // understand WHAT THEY LOSE by skipping the install, not just that
  // a check failed. Matches Lior's directive: "ask before we do
  // anything, explain if they dont install they dont get certain
  // features".
  return {
    id: 'HC-1',
    name: 'memsearch installed (semantic search backend)',
    status: 'skip',
    message:
      'memsearch not on PATH — Layer 5b semantic backend disabled. Features unavailable: `cmk search --mode=semantic` (will error), `cmk search --mode=hybrid` (will error). Keyword search (`cmk search --mode=keyword`, default) still works fully.',
    recoveryCommand: 'python -m pip install "memsearch[onnx]"',
    requiresInstall: true,
  };
}

// --- HC-2: Stop + SessionStart hooks registered -----------------------
function hc2Hooks({ projectRoot }) {
  // Per design §5 — the kit's hooks live in .claude/settings.json
  // alongside its plugin manifest. Required for auto-extract +
  // session-end compression to fire.
  const settingsPath = join(projectRoot, '.claude', 'settings.json');
  if (!existsSync(settingsPath)) {
    return {
      id: 'HC-2',
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
      id: 'HC-2',
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
      id: 'HC-2',
      name: 'Stop + SessionStart hooks registered',
      status: 'fail',
      message: `missing hook references: ${missing.join(', ')}`,
      recoveryCommand: 'cmk repair --hooks',
    };
  }
  return {
    id: 'HC-2',
    name: 'Stop + SessionStart hooks registered',
    status: 'pass',
    message: 'all kit hooks wired to their correct event arrays in .claude/settings.json',
  };
}

// --- HC-3: distill freshness (≤2 days) --------------------------------
function hc3DistillFreshness({ projectRoot, now }) {
  const recentPath = join(projectRoot, ...RECENT_MD_REL);
  if (!existsSync(recentPath)) {
    // Not a failure: on a fresh project there's nothing distilled yet, and
    // when there is, the lazy-on-read path runs the distill at SessionStart
    // (or `cmk daily-distill`). "Stale recent.md" below IS a real fail; a
    // never-built one is just "not yet" — mirror HC-5's skip-on-fresh.
    return {
      id: 'HC-3',
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
      id: 'HC-3',
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
      id: 'HC-3',
      name: 'Daily distill is fresh (≤2 days)',
      status: 'fail',
      message: `recent.md ${Math.round(ageMs / (24 * 60 * 60 * 1000))}d old (cutoff: 2d)`,
      recoveryCommand: 'cmk daily-distill',
    };
  }
  return {
    id: 'HC-3',
    name: 'Daily distill is fresh (≤2 days)',
    status: 'pass',
    message: `recent.md ${Math.round(ageMs / (60 * 60 * 1000))}h old`,
  };
}

// --- HC-4: transcripts firing (≤3 days) -------------------------------
function hc4Transcripts({ projectRoot, now }) {
  const transcriptsDir = join(projectRoot, ...TRANSCRIPTS_REL);
  if (!existsSync(transcriptsDir)) {
    // Fresh project, never had a Claude Code session here → nothing to fire
    // yet. Skip, don't fail (the dir + first transcript appear on the first turn).
    return {
      id: 'HC-4',
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
      id: 'HC-4',
      name: 'Transcripts firing (≤3 days)',
      status: 'skip',
      message: 'no transcripts yet — they appear after your first Claude Code turn in this project.',
    };
  }
  if (recentCount === 0) {
    // Transcripts EXIST but none recent → the kit was capturing and stopped.
    // That IS a real signal (the Stop hook may not be firing here).
    return {
      id: 'HC-4',
      name: 'Transcripts firing (≤3 days)',
      status: 'fail',
      message: 'transcripts exist but none within 3 days — the Stop hook may have stopped firing (is this project Claude Code\'s primary cwd?)',
      recoveryCommand: 'reopen this project as the primary cwd in Claude Code',
    };
  }
  return {
    id: 'HC-4',
    name: 'Transcripts firing (≤3 days)',
    status: 'pass',
    message: `${recentCount} transcript(s) within 3 days`,
  };
}

// --- HC-5: INDEX.md matches context/memory/ ---------------------------
function hc5IndexConsistency({ projectRoot }) {
  const memoryDir = join(projectRoot, ...MEMORY_DIR_REL);
  const indexPath = join(projectRoot, ...MEMORY_INDEX_REL);
  if (!existsSync(memoryDir)) {
    return {
      id: 'HC-5',
      name: 'INDEX.md matches context/memory/ files',
      status: 'skip',
      message: 'context/memory/ missing — no granular facts to index yet',
    };
  }
  if (!existsSync(indexPath)) {
    return {
      id: 'HC-5',
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
      id: 'HC-5',
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
      id: 'HC-5',
      name: 'INDEX.md matches context/memory/ files',
      status: 'fail',
      message: `INDEX.md read error: ${err?.message ?? err}`,
      recoveryCommand: 'cmk reindex',
    };
  }
  // Fact-file references in INDEX.md are markdown LINK TARGETS: the kit names
  // fact files `<type>_<slug>.md` (e.g. feedback_layered.md), NOT `<id>.md`, and
  // `cmk reindex`'s formatIndexLine writes `[slug](type_slug.md)`. Match the link
  // target's *.md basename. (Task 85 fix: the earlier regex matched an id-shaped
  // `[PUL]-XXXXXXXX.md` filename the kit NEVER generates, so HC-5 false-failed on
  // every real fact file the moment one existed — surfaced lior-test-7 2026-06-03.
  // Restricting to `](...)` link targets keeps the original intent of not
  // false-positiving on bare prose mentions like "see also design.md".)
  const indexEntries = new Set();
  const re = /\]\(([^)]+\.md)\)/g;
  let m;
  while ((m = re.exec(indexText)) !== null) {
    const fname = m[1].split(/[\\/]/).pop(); // basename, tolerate ./ or path-prefixed links
    if (fname && fname !== 'INDEX.md') indexEntries.add(fname);
  }
  const factSet = new Set(factFiles);
  const inFactsNotIndex = [...factSet].filter((f) => !indexEntries.has(f));
  const inIndexNotFacts = [...indexEntries].filter((f) => !factSet.has(f));
  if (inFactsNotIndex.length === 0 && inIndexNotFacts.length === 0) {
    return {
      id: 'HC-5',
      name: 'INDEX.md matches context/memory/ files',
      status: 'pass',
      message: `${factFiles.length} fact file(s); INDEX in sync`,
    };
  }
  const parts = [];
  if (inFactsNotIndex.length > 0) parts.push(`missing from INDEX: ${inFactsNotIndex.length}`);
  if (inIndexNotFacts.length > 0) parts.push(`stale in INDEX: ${inIndexNotFacts.length}`);
  return {
    id: 'HC-5',
    name: 'INDEX.md matches context/memory/ files',
    status: 'fail',
    message: parts.join('; '),
    recoveryCommand: 'cmk reindex',
  };
}

// --- HC-6: Cron jobs registered with host scheduler -------------------
function hc6CronRegistered({ projectRoot }) {
  if (existsSync(cronSentinelPath(projectRoot))) {
    return {
      id: 'HC-6',
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
    id: 'HC-6',
    name: 'Cron jobs registered with host scheduler',
    status: 'skip',
    message: 'cron not registered (optional) — using the lazy-on-read fallback (compresses at SessionStart). Run `cmk register-crons` for scheduled background compression.',
  };
}

// --- HC-7: memsearch backend reachable --------------------------------
function hc7MemsearchReachable(hc1Result) {
  // Only relevant if HC-1 passed. Skip when memsearch isn't installed.
  if (hc1Result.status !== 'pass') {
    return {
      id: 'HC-7',
      name: 'memsearch backend reachable',
      status: 'skip',
      message: 'depends on HC-1 (memsearch installed) — skipped',
    };
  }
  // HC-1 already proves memsearch --version succeeds. For HC-7 the
  // additional check would be milvus reachability — out of scope for
  // v0.1.0's keyword-only ship (Layer 5b is v0.1.x). Treat HC-7 as
  // pass when HC-1 passes.
  return {
    id: 'HC-7',
    name: 'memsearch backend reachable',
    status: 'pass',
    message: 'memsearch responds to --version (milvus reachability is Layer 5b / v0.1.x)',
  };
}

// --- HC-8: Native Anthropic Auto Memory status -----------------------
function hc8NativeAutoMemory({ projectRoot, now }) {
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
    id: 'HC-8',
    name: 'Native Anthropic Auto Memory status detected',
    status: 'pass',
    message,
  };
}

// --- HC-9: Stale lock files -------------------------------------------
function hc9StaleLocks({ projectRoot, userDir }) {
  const stale = detectStaleLocks(projectRoot, { userDir }).filter((r) => r.stale);
  if (stale.length === 0) {
    return {
      id: 'HC-9',
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
    id: 'HC-9',
    name: 'No stale lock files',
    status: 'fail',
    message: `${stale.length} stale lock(s); first: ${first.path} (${first.reason})${moreNote}`,
    recoveryCommand: first.recoveryCommand,
  };
}

/**
 * Run the full 9-check health audit.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {string} [opts.userDir]
 * @param {string} [opts.now]
 * @returns {Promise<{action, checks, duration_ms}>}
 *
 * Note: M3 fix (skill-review 2026-05-28) dropped the v0.1.0 `promptUser`
 * forward-compat parameter. It was destructured-then-void-discarded; no
 * caller passes it. When auto-repair with consent ships (v0.1.x), the
 * parameter lands at that PR alongside the actual consent flow — not
 * pre-empted in v0.1.0 to avoid the "forward-compat hooks rot" pattern.
 */
export async function runDoctor({
  projectRoot,
  userDir,
  now,
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

  // Run in order. HC-7 depends on HC-1's verdict.
  const c1 = await hc1Memsearch();
  const c2 = hc2Hooks({ projectRoot });
  const c3 = hc3DistillFreshness({ projectRoot, now: ts });
  const c4 = hc4Transcripts({ projectRoot, now: ts });
  const c5 = hc5IndexConsistency({ projectRoot });
  const c6 = hc6CronRegistered({ projectRoot });
  const c7 = hc7MemsearchReachable(c1);
  const c8 = hc8NativeAutoMemory({ projectRoot, now: ts });
  const c9 = hc9StaleLocks({ projectRoot, userDir: resolvedUserDir });

  return {
    action: 'completed',
    checks: [c1, c2, c3, c4, c5, c6, c7, c8, c9],
    duration_ms: Date.now() - t0,
  };
}
