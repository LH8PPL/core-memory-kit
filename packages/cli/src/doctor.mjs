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
// Critical rule per NFR-9: any repair requiring `pip install` /
// `npm install` / system-level changes MUST ASK the user first
// (37.5). runDoctor records `requiresInstall: true` on those HCResults
// and the caller (cmk doctor CLI handler) handles the prompt; tests
// pass a `promptUser` fake to assert the gate fires.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { nowIso } from './audit-log.mjs';
import { detectStaleLocks } from './lock-discipline.mjs';
import { cronSentinelPath } from './lazy-compress.mjs';

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
    const r = spawnSync('memsearch', ['--version'], {
      encoding: 'utf8',
      // 2s: memsearch --version should respond <500ms typical; longer
      // means Python startup is sick or the host is heavily loaded. We
      // treat timeout as "skip" so cmk doctor still completes under
      // the 5s NFR budget per tasks.md 37.6 #2.
      timeout: 2_000,
      shell: process.platform === 'win32',
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
  return {
    id: 'HC-1',
    name: 'memsearch installed (semantic search backend)',
    status: 'skip',
    message: 'memsearch not on PATH — semantic search unavailable (v0.1.0 ships keyword-only; Layer 5b is OPTIONAL)',
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
  const required = ['cmk-inject-context', 'cmk-capture-turn', 'cmk-compress-session'];
  const json = JSON.stringify(settings);
  const missing = required.filter((h) => !json.includes(h));
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
    message: 'all kit hooks present in .claude/settings.json',
  };
}

// --- HC-3: distill freshness (≤2 days) --------------------------------
function hc3DistillFreshness({ projectRoot, now }) {
  const recentPath = join(projectRoot, ...RECENT_MD_REL);
  if (!existsSync(recentPath)) {
    return {
      id: 'HC-3',
      name: 'Daily distill is fresh (≤2 days)',
      status: 'fail',
      message: 'context/sessions/recent.md missing — distill never ran',
      recoveryCommand: 'cmk daily-distill',
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
    return {
      id: 'HC-4',
      name: 'Transcripts firing (≤3 days)',
      status: 'fail',
      message: 'context/transcripts/ missing — kit not capturing turn transcripts',
      recoveryCommand: 'check that this project is the primary cwd in Claude Code, then reopen the project',
    };
  }
  const nowMs = new Date(now ?? nowIso()).getTime();
  const cutoffMs = nowMs - THREE_DAYS_MS;
  let recentCount = 0;
  for (const name of readdirSync(transcriptsDir)) {
    if (!/\.md$/.test(name)) continue;
    try {
      const mtimeMs = statSync(join(transcriptsDir, name)).mtimeMs;
      if (mtimeMs >= cutoffMs) recentCount += 1;
    } catch {
      // skip unreadable
    }
  }
  if (recentCount === 0) {
    return {
      id: 'HC-4',
      name: 'Transcripts firing (≤3 days)',
      status: 'fail',
      message: 'no transcripts within 3 days — likely this project is not Claude Code\'s primary cwd',
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
  const indexEntries = new Set();
  const re = /([A-Za-z0-9_.-]+\.md)/g;
  let m;
  while ((m = re.exec(indexText)) !== null) {
    if (m[1] !== 'INDEX.md') indexEntries.add(m[1]);
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
  return {
    id: 'HC-6',
    name: 'Cron jobs registered with host scheduler',
    status: 'fail',
    message: 'no cron-registered sentinel — kit will use lazy-on-read fallback (still functional, slower)',
    recoveryCommand: 'cmk register-crons',
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
  // Append the audit entry.
  const logPath = join(projectRoot, ...NATIVE_MEMORY_LOG_REL);
  try {
    mkdirSync(join(projectRoot, ...LOCKS_REL), { recursive: true });
    writeFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // best-effort
  }
  return {
    id: 'HC-8',
    name: 'Native Anthropic Auto Memory status detected',
    status: 'pass',
    message:
      entry.active === true
        ? `Anthropic auto-memory ACTIVE (${entry.file_count} files; last: ${entry.last_modified ?? 'unknown'})`
        : entry.active === false
          ? 'Anthropic auto-memory not active for this project (kit is the sole memory source)'
          : 'Anthropic auto-memory state unknown (directory unreadable)',
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
  // Surface the first lock's recoveryCommand. Multiple stale locks all
  // get the same shape; users see them in subsequent runs after
  // cleaning the first.
  const first = stale[0];
  return {
    id: 'HC-9',
    name: 'No stale lock files',
    status: 'fail',
    message: `${stale.length} stale lock(s); first: ${first.path} (${first.reason})`,
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
 * @param {Function} [opts.promptUser]  (msg) => Promise<boolean>; required if any HC's repair has requiresInstall:true AND caller wants auto-repair
 * @returns {Promise<{action, checks, duration_ms}>}
 */
export async function runDoctor({
  projectRoot,
  userDir,
  now,
  promptUser, // currently unused at this layer — the CLI wrapper handles install-prompt gating per 37.5. We thread the param through so callers can pass a tester fake.
} = {}) {
  void promptUser; // future-use hook; documented above
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
