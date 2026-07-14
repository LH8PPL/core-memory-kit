// Cross-platform host-scheduler registration (Task 33.2, T-028).
//
// Composes the platform-native scheduler primitive on each OS so the
// daily-distill bin wrapper runs at 23:00 local time without users
// learning crontab / launchd / schtasks themselves.
//
// Per design §8.6.2:
//   Linux  → crontab pipe pattern (idempotent via grep -v + re-add)
//   macOS  → launchd plist + launchctl bootstrap
//   Windows → schtasks /Create /F (force-overwrite for idempotency)
//
// Per design §8.6.3:
//   Node, not Python. The kit is already Node-only; adding Python means
//   new test infra + install dep. spawnSync to the platform-native
//   scheduler binary is the established kit pattern (compressor.mjs,
//   capture-turn.mjs).
//
// Public boundary:
//   registerCron({command, options?}) → {action, platform, command,
//                                         executed, output, error?}
//   unregisterCron({options?})        → same shape
//   detectPlatform()                  → 'linux' | 'darwin' | 'win32'
//
// `options.dryRun: true` returns the platform-detected command WITHOUT
// executing — used by tests + by users who want to inspect before
// granting host permissions. Per the kit's autopilot stop boundary
// (CLAUDE.md Workflow): "anything that touches the user's system beyond
// the repo" requires user input. Defaults to dryRun=false; tests
// always pass dryRun=true.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';

// Canonical entry name across platforms. Used as the grep filter on
// Linux, the LaunchAgent label on macOS, the Task Scheduler name on
// Windows. Single source of truth — never construct ad-hoc names.
export const CRON_ENTRY_NAME = 'cmk-daily-distill';

// Task 34: second entry for weekly curate. Same naming convention.
export const WEEKLY_ENTRY_NAME = 'cmk-weekly-curate';

// Default schedule: 23:00 local time. Matches design §1.4 ("Daily 23:00
// scripts/run-daily-distill.sh") + tasks.md 33.
export const DEFAULT_SCHEDULE = { hour: 23, minute: 0 };

// Default weekly schedule: Sunday 09:00 local time. Matches design §1.4
// + tasks.md 34. dayOfWeek: 0=Sunday, 1=Monday, ..., 6=Saturday (cron + launchd convention).
export const DEFAULT_WEEKLY_SCHEDULE = { hour: 9, minute: 0, dayOfWeek: 0 };

// Map dayOfWeek (0-6, Sun=0) to schtasks /D abbreviation.
const WIN_DAY_MAP = { 0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT' };

export function detectPlatform() {
  return process.platform; // 'linux' | 'darwin' | 'win32' (other: bsd etc.)
}

function buildLinuxCronLine({ command, entryName, hour, minute, dayOfWeek }) {
  // Standard 5-field cron syntax: minute hour day-of-month month day-of-week
  // The trailing `# <entry-name>` comment is what makes the entry
  // grep-able for idempotency + unregistration.
  // Task 34: dayOfWeek (0-6, Sun=0) optional. When set, restricts the
  // job to that weekday; when omitted, runs every day (`*`).
  const dow = dayOfWeek === undefined || dayOfWeek === null ? '*' : String(dayOfWeek);
  return `${minute} ${hour} * * ${dow} ${command} # ${entryName}`;
}

function macOsPlistPath(entryName) {
  return join(homedir(), 'Library', 'LaunchAgents', `com.cmk.${entryName}.plist`);
}

function buildMacOsPlist({ command, entryName, hour, minute, dayOfWeek }) {
  // Split command on whitespace for the ProgramArguments array.
  // launchd doesn't honor shell quoting — each arg is its own element.
  // Strip the surrounding double-quotes the caller wraps each path in (the
  // command is `"<node>" "<script>" "<projectRoot>"`): launchd execs the arg
  // LITERALLY, so a `<string>"/path/node"</string>` with quotes baked in is a
  // path that starts with `"` → ENOENT (Task 109: the macOS sibling of the
  // Windows D-83 bug). Each split token is one quoted path; drop the wrapping
  // quotes to get the clean path. (A path that itself contains a space is the
  // remaining edge — rare for node/project paths — and needs the argv-array
  // refactor noted in the Task 109 follow-up.)
  const args = command
    .split(/\s+/)
    .filter(Boolean)
    .map((a) => a.replace(/^"(.*)"$/, '$1'));
  const argXml = args
    .map((a) => `    <string>${escapeXml(a)}</string>`)
    .join('\n');
  const calendarLines = [
    `    <key>Hour</key><integer>${hour}</integer>`,
    `    <key>Minute</key><integer>${minute}</integer>`,
  ];
  if (dayOfWeek !== undefined && dayOfWeek !== null) {
    // launchd Weekday: 0=Sunday, 1=Monday, ..., 6=Saturday (same as cron).
    calendarLines.push(`    <key>Weekday</key><integer>${dayOfWeek}</integer>`);
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyLists-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key><string>com.cmk.${entryName}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    argXml,
    '  </array>',
    '  <key>StartCalendarInterval</key>',
    '  <dict>',
    ...calendarLines,
    '  </dict>',
    '  <key>RunAtLoad</key><false/>',
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Task 215 (D-311): the VBS content that runs `command` with a HIDDEN window.
 * Task Scheduler launches a console binary (node.exe) in the interactive
 * session with a VISIBLE console window for the run's duration — a black box
 * popping over the user's screen nightly (verified: the real cmk-daily-distill
 * task registered LogonType=Interactive, Hidden=False). `wscript.exe` running
 * this VBS with WshShell.Run(cmd, 0, True) launches the command windowStyle=0
 * (hidden) and BLOCKS until it exits (True) — proven zero-flash on a real run
 * (2026-07-11 probe). No admin needed (S4U/session-0 requires elevation — a UAC
 * prompt we won't force), no per-install password.
 *
 * The command is embedded as a VBS double-quoted string literal ("" escapes a
 * quote inside VBS). command is kit-generated (node path + script + projectRoot,
 * each already quoted) — not user free-text — but we still escape defensively.
 */
export function buildWindowlessShim(command) {
  const vbsEscaped = String(command).replace(/"/g, '""');
  return [
    "' core-memory-kit — windowless launcher for the nightly memory-distill",
    "' scheduled task (Task 215 / D-311). Runs the distill with NO visible",
    "' console window. Safe to ignore; regenerated by `cmk register-crons`.",
    'Set sh = CreateObject("WScript.Shell")',
    `sh.Run "${vbsEscaped}", 0, True`,
    '',
  ].join('\r\n');
}

export function buildWindowsSchtasks({ command, entryName, hour, minute, dayOfWeek, shimPath }) {
  // Returns the schtasks.exe ARGV ARRAY (not a shell string). The /TR value — the
  // command to run, `"<node>" "<script>" "<projectRoot>"` with its own quotes
  // around each spaced path — is ONE array element, delivered to schtasks.exe
  // verbatim via CreateProcess (Node's Windows arg-quoting), with NO cmd.exe
  // re-parse at registration time.
  //
  // This is the D-83 fix. The old `/TR "${command}"` shell-string form double-
  // wrapped the inner quotes (schtasks AND cmd.exe both tried to parse them) and
  // the registerCron guard then rejected the inner `"` outright — so cron could
  // NEVER register on Windows. Array-exec sidesteps the nesting entirely: Task
  // Scheduler stores the /TR value and cmd.exe parses the quoted paths only when
  // the task FIRES. (No `\"`-escaping needed → no CodeQL js/incomplete-
  // sanitization, no path-corrupting backslash-doubling.)
  //
  // /ST is HH:mm; /F forces re-create for idempotency; /RL LIMITED (not HIGHEST)
  // because distill needs no admin. Task 34: /SC WEEKLY /D <SUN|...> for weekly.
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  let scheduleArgs;
  if (dayOfWeek !== undefined && dayOfWeek !== null) {
    const day = WIN_DAY_MAP[dayOfWeek];
    if (!day) {
      throw new Error(`buildWindowsSchtasks: invalid dayOfWeek ${dayOfWeek}`);
    }
    scheduleArgs = ['/SC', 'WEEKLY', '/D', day];
  } else {
    scheduleArgs = ['/SC', 'DAILY'];
  }
  // Task 215 (D-311): when a windowless shim path is provided, the /TR runs
  // `wscript.exe //B //Nologo "<shim>"` (batch mode, no logo) instead of node
  // directly — the shim launches the real command hidden, so no console window
  // ever appears. //B suppresses script errors/prompts to the console. Fallback:
  // no shim (macOS/Linux, or a shim-write failure) → the old direct command.
  const runTarget = shimPath
    ? `wscript.exe //B //Nologo ${quoteWinArg(shimPath)}`
    : command;
  return ['/Create', '/TN', entryName, ...scheduleArgs, '/ST', time, '/TR', runTarget, '/RL', 'LIMITED', '/F'];
}

/** Quote a Windows path for a /TR command string (wrap in double-quotes). */
function quoteWinArg(p) {
  return `"${String(p)}"`;
}

/**
 * Register a cron entry on the current platform.
 *
 * @param {object} opts
 * @param {string} opts.command  the command to run (typically a PATH-resolved bin name)
 * @param {string} [opts.entryName]  the entry identifier — defaults to CRON_ENTRY_NAME ('cmk-daily-distill')
 * @param {object} [opts.schedule]  {hour, minute, dayOfWeek?} — defaults to {23,0}; dayOfWeek (0-6, Sun=0) restricts to that weekday
 * @param {boolean} [opts.dryRun]  if true, return the command(s) without executing
 * @returns {object} {action, platform, executed, command, output, error?}
 */
export function registerCron(opts = {}) {
  const errors = [];
  if (!opts.command || typeof opts.command !== 'string') {
    errors.push('command: required, non-empty string');
  } else if (opts.command.includes("'")) {
    // Task 33 I1 fix — the Linux cron line interpolates `command`
    // into a single-quoted shell string (`echo '...'`). A command
    // with an embedded single quote would break the quoting + open
    // a shell-injection vector. Reject at the boundary; document
    // the contract. Future caller wanting single quotes in their
    // cron command needs to either escape POSIX-style ('\'') or
    // we extend this helper with a sanitizer (v0.1.x candidate).
    errors.push("command: must not contain single quotes (Linux cron-line shell-quoting contract)");
  }
  // NOTE (Task 109 / D-83): there is deliberately NO double-quote rejection. The
  // Windows command legitimately CONTAINS double-quotes — it's the quoted path
  // triple `"<node>" "<script>" "<projectRoot>"` (Task 36 B1/B2). The earlier
  // guard rejected `"` because the old `/TR "${command}"` SHELL form double-
  // wrapped them; that made cron un-registerable on Windows (the whole D-83 bug).
  // The win32 branch now execs schtasks with an ARGS ARRAY (no shell), so the
  // /TR value is delivered verbatim and the inner quotes never need escaping.
  // macOS XML-escapes them in the plist; Linux nests them inside its single-quote
  // `echo '...'` — so `"` is safe on every platform.
  const entryName = opts.entryName ?? CRON_ENTRY_NAME;
  if (!entryName || typeof entryName !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(entryName)) {
    errors.push("entryName: must match /^[a-zA-Z0-9_.-]+$/ (used in shell + plist + schtasks identifiers)");
  }
  const {
    hour = DEFAULT_SCHEDULE.hour,
    minute = DEFAULT_SCHEDULE.minute,
    dayOfWeek,
  } = opts.schedule ?? {};
  if (
    !Number.isInteger(hour) || hour < 0 || hour > 23 ||
    !Number.isInteger(minute) || minute < 0 || minute > 59
  ) {
    errors.push('schedule: {hour: 0-23, minute: 0-59}');
  }
  if (dayOfWeek !== undefined && dayOfWeek !== null) {
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      errors.push('schedule.dayOfWeek: must be integer 0-6 (Sun=0)');
    }
  }
  if (errors.length > 0) {
    return errorResult({ category: ERROR_CATEGORIES.SCHEMA, errors });
  }

  // opts.platform is a test seam (detectPlatform() reads process.platform, which
  // can't vary on a single CI host) — production never passes it.
  const platform = opts.platform ?? detectPlatform();
  const dryRun = opts.dryRun === true;

  if (platform === 'linux') {
    const line = buildLinuxCronLine({ command: opts.command, entryName, hour, minute, dayOfWeek });
    // Idempotent: list current crontab, strip any pre-existing entry
    // by name, append the new line, pipe back.
    const shellCmd = `(crontab -l 2>/dev/null | grep -v '${entryName}' ; echo '${line}') | crontab -`;
    if (dryRun) {
      return {
        action: 'dry-run',
        platform,
        executed: false,
        command: shellCmd,
        output: '',
      };
    }
    // timeout: 10s — scheduler operations are fast; a hung crontab
    // command points at a broken host config and should fail loud.
    const r = spawnSync('bash', ['-c', shellCmd], { encoding: 'utf8', timeout: 10_000 });
    return {
      action: r.status === 0 ? 'registered' : 'error',
      platform,
      executed: true,
      command: shellCmd,
      output: (r.stdout || '') + (r.stderr || ''),
      ...(r.status === 0 ? {} : { error: `crontab exit ${r.status}` }),
    };
  }

  if (platform === 'darwin') {
    const plistPath = macOsPlistPath(entryName);
    const plistContent = buildMacOsPlist({ command: opts.command, entryName, hour, minute, dayOfWeek });
    if (dryRun) {
      return {
        action: 'dry-run',
        platform,
        executed: false,
        command: `write ${plistPath} (${plistContent.length} bytes) + launchctl bootstrap gui/$UID ${plistPath}`,
        output: plistContent,
      };
    }
    mkdirSync(dirname(plistPath), { recursive: true });
    writeFileSync(plistPath, plistContent, 'utf8');
    // bootout first (in case a stale entry exists), then bootstrap.
    // bootout exit code is non-zero if no entry is loaded — that's
    // fine, we ignore it.
    spawnSync('launchctl', ['bootout', `gui/${process.getuid?.() ?? ''}/com.cmk.${entryName}`], { encoding: 'utf8', timeout: 10_000 });
    const r = spawnSync('launchctl', ['bootstrap', `gui/${process.getuid?.() ?? ''}`, plistPath], { encoding: 'utf8', timeout: 10_000 });
    return {
      action: r.status === 0 ? 'registered' : 'error',
      platform,
      executed: true,
      command: `launchctl bootstrap gui/$UID ${plistPath}`,
      output: (r.stdout || '') + (r.stderr || ''),
      ...(r.status === 0 ? {} : { error: `launchctl exit ${r.status}` }),
    };
  }

  if (platform === 'win32') {
    // Task 215 (D-311): write a windowless VBS shim so the nightly task runs
    // with NO visible console window. Best-effort — if the shim can't be written
    // (no projectRoot, read-only dir), fall back to the direct command (the old
    // visible-window behavior) rather than fail registration. The shim lives in
    // context/.locks/ (gitignored, machine-local runtime plumbing).
    let shimPath;
    if (opts.projectRoot && opts.writeShim !== false) {
      try {
        const locksDir = join(opts.projectRoot, 'context', '.locks');
        mkdirSync(locksDir, { recursive: true });
        shimPath = join(locksDir, `${entryName}-run.vbs`);
        (opts.writeFile ?? writeFileSync)(shimPath, buildWindowlessShim(opts.command), 'utf8');
      } catch {
        shimPath = undefined; // fall back to the direct (visible) command
      }
    }
    const argv = buildWindowsSchtasks({ command: opts.command, entryName, hour, minute, dayOfWeek, shimPath });
    const displayCmd = `schtasks ${argv.join(' ')}`; // informational (dry-run + result.command)
    if (dryRun) {
      return {
        action: 'dry-run',
        platform,
        executed: false,
        command: displayCmd,
        output: '',
      };
    }
    // Exec schtasks.exe with the ARGS ARRAY — NOT shell:true. This delivers the
    // /TR value's inner quotes to schtasks verbatim (CreateProcess arg-quoting),
    // never re-parsed by cmd.exe at registration time (the D-83 fix). Task
    // Scheduler stores the command; cmd.exe parses the quoted paths at fire time.
    // Resolve the ABSOLUTE System32 path rather than relying on PATH: schtasks
    // creates a scheduled task, so a PATH-hijacked `schtasks.exe` in a writable
    // dir would be a privilege-escalation vector (Sonar S4036). %SystemRoot% is
    // a fixed, unwriteable system directory.
    const schtasksExe = join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'schtasks.exe');
    // opts.spawn is a test seam (defaults to spawnSync): the real schtasks exec
    // can't run on a non-Windows CI host, so a fake lets the exec branch be
    // covered in-process AND asserts WHAT gets spawned (Door 3: the absolute
    // schtasks path + the verbatim argv). Production never passes it.
    const spawn = opts.spawn ?? spawnSync;
    const r = spawn(schtasksExe, argv, { encoding: 'utf8', windowsHide: true, timeout: 10_000 });

    // Task 167.E (D-207) + Task 203 (D-298): set StartWhenAvailable AND WakeToRun
    // so a missed nightly run isn't silently dropped — and so the distill actually
    // COMPLETES instead of being killed mid-run.
    //   - StartWhenAvailable (167.E): a run missed while the machine was OFF runs
    //     on next wake (catch-up).
    //   - WakeToRun (203/D-298): the machine WAKES from sleep at 23:00 to run the
    //     job, so a laptop asleep at 23:00 doesn't kill the distill at minute 3
    //     (the exact starvation bug — the cron fired + heartbeated, then died
    //     before finishing, five nights running). Together with the resumable
    //     distill (Task 204, which banks partial progress) this closes the
    //     starvation from both ends: wake to run it, and if still cut short,
    //     resume next time.
    // schtasks /Create has NO CLI flag for either (verified — not in the help);
    // they're settable only via XML or PowerShell. We use a follow-up PowerShell
    // Set-ScheduledTask, BEST-EFFORT: a failure here never fails registration —
    // the lazy roll (167.A/D) + resumable distill (204) are the guarantees; this
    // is an OPTIMIZATION. NB: WakeToRun waking a sleeping laptop nightly is a mild
    // power tradeoff; it's the standard Task Scheduler mechanism for "this job
    // must run on schedule even if asleep," appropriate for a once-a-day 23:00
    // maintenance task.
    if (r.status === 0) {
      const psExe = join(
        process.env.SystemRoot || process.env.windir || 'C:\\Windows',
        'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe',
      );
      const psScript =
        `try { Set-ScheduledTask -TaskName '${entryName}' ` +
        `-Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun) ` +
        `-ErrorAction Stop | Out-Null } catch { exit 1 }`;
      try {
        spawn(psExe, ['-NoProfile', '-NonInteractive', '-Command', psScript], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 10_000,
        });
        // We intentionally ignore the PS exit status — registration already
        // succeeded; catch-up is best-effort.
      } catch {
        // never let the catch-up call abort a successful registration
      }
    }

    return {
      action: r.status === 0 ? 'registered' : 'error',
      platform,
      executed: true,
      command: displayCmd,
      output: (r.stdout || '') + (r.stderr || ''),
      ...(r.status === 0 ? {} : { error: `schtasks exit ${r.status}` }),
    };
  }

  return errorResult({
    category: ERROR_CATEGORIES.SCHEMA,
    errors: [`unsupported platform: ${platform}`],
  });
}

/**
 * Remove a cron entry on the current platform.
 *
 * @param {object} [opts]
 * @param {string} [opts.entryName]  the entry to remove — defaults to CRON_ENTRY_NAME
 * @param {boolean} [opts.dryRun]
 */
export function unregisterCron(opts = {}) {
  const entryName = opts.entryName ?? CRON_ENTRY_NAME;
  if (!entryName || typeof entryName !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(entryName)) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: ["entryName: must match /^[a-zA-Z0-9_.-]+$/"],
    });
  }
  const platform = detectPlatform();
  const dryRun = opts.dryRun === true;

  if (platform === 'linux') {
    const shellCmd = `(crontab -l 2>/dev/null | grep -v '${entryName}') | crontab -`;
    if (dryRun) {
      return { action: 'dry-run', platform, executed: false, command: shellCmd, output: '' };
    }
    // timeout: 10s — scheduler operations are fast; a hung crontab
    // command points at a broken host config and should fail loud.
    const r = spawnSync('bash', ['-c', shellCmd], { encoding: 'utf8', timeout: 10_000 });
    return {
      action: r.status === 0 ? 'unregistered' : 'error',
      platform, executed: true, command: shellCmd,
      output: (r.stdout || '') + (r.stderr || ''),
      ...(r.status === 0 ? {} : { error: `crontab exit ${r.status}` }),
    };
  }

  if (platform === 'darwin') {
    const plistPath = macOsPlistPath(entryName);
    if (dryRun) {
      return {
        action: 'dry-run', platform, executed: false,
        command: `launchctl bootout + rm ${plistPath}`, output: '',
      };
    }
    spawnSync('launchctl', ['bootout', `gui/${process.getuid?.() ?? ''}/com.cmk.${entryName}`], { encoding: 'utf8', timeout: 10_000 });
    if (existsSync(plistPath)) {
      try { unlinkSync(plistPath); } catch { /* best-effort */ }
    }
    return {
      action: 'unregistered', platform, executed: true,
      command: `launchctl bootout + rm`, output: '',
    };
  }

  if (platform === 'win32') {
    const cmd = `schtasks /Delete /TN "${entryName}" /F`;
    if (dryRun) {
      return { action: 'dry-run', platform, executed: false, command: cmd, output: '' };
    }
    const r = spawnSync(cmd, { shell: true, encoding: 'utf8', windowsHide: true, timeout: 10_000 });
    return {
      // schtasks /Delete returns non-zero if the task didn't exist;
      // we treat that as "already unregistered" (idempotent) since
      // unregistering a non-existent entry is the intended end-state.
      action: 'unregistered',
      platform, executed: true, command: cmd,
      output: (r.stdout || '') + (r.stderr || ''),
    };
  }

  return errorResult({
    category: ERROR_CATEGORIES.SCHEMA,
    errors: [`unsupported platform: ${platform}`],
  });
}
