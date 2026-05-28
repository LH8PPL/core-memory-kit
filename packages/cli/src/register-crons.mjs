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
  const args = command.split(/\s+/).filter(Boolean);
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

function buildWindowsSchtasks({ command, entryName, hour, minute, dayOfWeek }) {
  // schtasks accepts /ST as HH:mm. /F forces re-create if the task
  // already exists (idempotency primitive). /RL LIMITED (not HIGHEST)
  // because daily distill doesn't need admin.
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  // Escape inner double-quotes per schtasks /TR convention: `\"`.
  // Task 33 B2 fix — pre-fix `/TR "${command}"` produced malformed
  // nested quotes for any command containing `"` (typical when the
  // command points at a Windows path with spaces). Skill-review caught
  // this; the test fixture (cli-register-crons.test.js) didn't surface
  // it because earlier tests only passed `'node bin.mjs'` (no quotes).
  const escapedCommand = command.replace(/"/g, '\\"');
  // Task 34: /SC WEEKLY /D <SUN|MON|...> for weekly cadence; /SC DAILY otherwise.
  let scheduleFlags;
  if (dayOfWeek !== undefined && dayOfWeek !== null) {
    const day = WIN_DAY_MAP[dayOfWeek];
    if (!day) {
      throw new Error(`buildWindowsSchtasks: invalid dayOfWeek ${dayOfWeek}`);
    }
    scheduleFlags = `/SC WEEKLY /D ${day}`;
  } else {
    scheduleFlags = '/SC DAILY';
  }
  return `schtasks /Create /TN "${entryName}" ${scheduleFlags} /ST ${time} /TR "${escapedCommand}" /RL LIMITED /F`;
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

  const platform = detectPlatform();
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
    const cmd = buildWindowsSchtasks({ command: opts.command, entryName, hour, minute, dayOfWeek });
    if (dryRun) {
      return {
        action: 'dry-run',
        platform,
        executed: false,
        command: cmd,
        output: '',
      };
    }
    // schtasks is a .exe; spawnSync handles it directly via shell:true
    // (per the kit's Windows .cmd shim pattern in compressor.mjs).
    const r = spawnSync(cmd, { shell: true, encoding: 'utf8', windowsHide: true, timeout: 10_000 });
    return {
      action: r.status === 0 ? 'registered' : 'error',
      platform,
      executed: true,
      command: cmd,
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
