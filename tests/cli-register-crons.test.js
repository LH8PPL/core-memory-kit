// @doors: 1
// Door 2 N/A: dry-run mode (the only mode tests run) makes NO filesystem or scheduler changes. Production registration is dry-run-locked-out from tests per CLAUDE.md autopilot stop rule "anything that touches the user's system beyond the repo" — production paths are exercised manually by the user at install time.
// Door 3 N/A: dry-run mode never calls spawnSync. Production paths shell to crontab/launchctl/schtasks which is platform-tested by the maintainer at install (cross-OS CI matrix is Task 40 / v0.1.x).
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: register-crons returns its result struct rather than emitting NDJSON.

// Tests for Task 33 — register-crons (T-028.2).
// Per tasks.md 33.4 #2:
//   - Test `register-crons` idempotency: re-run adds no duplicate entries (platform-specific check via --dry-run)
//
// Plus boundary tests on platform detection + dry-run output shape.

import { describe, it, expect } from 'vitest';
import {
  registerCron,
  unregisterCron,
  detectPlatform,
  buildWindowsSchtasks,
  buildWindowlessShim,
  CRON_ENTRY_NAME,
  DEFAULT_SCHEDULE,
  WEEKLY_ENTRY_NAME,
} from '../packages/cli/src/register-crons.mjs';

// D-341 (2026-07-18): SonarCloud's A3S context collector constant-folds
// fixture path literals THROUGH the source-under-test's
// `join(projectRoot, 'context', …)` calls (chasing callers into excluded test
// files) and opendir's the derived path on the Linux runner — crashing the
// whole scan with ENOENT. Proven by TWO experiments: the crash path FOLLOWED
// a fixture rename (proj→sandbox), and then followed it AGAIN through a
// map+join builder (sandbox→sbx-root) — the engine fully partial-evaluates
// string construction. So: any projectRoot fixture that flows into a
// dir-join must be a RUNTIME value the engine cannot statically know — a
// real temp dir (below). String-obfuscation alone is insufficient (folded).
// The argv/command-string fixtures keep the builder form (they never flow
// into a dir-join; only the projectRoot did).
const opaqueWinRoot = (...parts) => parts.map((p) => String(p)).join('\\');
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// A REAL directory: statically unknowable to the analyzer, existing at runtime.
const RUNTIME_ROOT = mkdtempSync(join(tmpdir(), 'cmk-cron-fixture-'));

describe('Task 33 — register-crons', () => {
  describe('detectPlatform', () => {
    it('returns process.platform', () => {
      expect(detectPlatform()).toBe(process.platform);
    });
  });

  describe('CRON_ENTRY_NAME constant', () => {
    it('is the single source of truth for the cmk-daily-distill identifier', () => {
      expect(CRON_ENTRY_NAME).toBe('cmk-daily-distill');
    });
  });

  describe('DEFAULT_SCHEDULE constant', () => {
    it('matches design §1.4: Daily 23:00', () => {
      expect(DEFAULT_SCHEDULE).toEqual({ hour: 23, minute: 0 });
    });
  });

  describe('Validation (Door 1)', () => {
    it('rejects missing command', () => {
      const r = registerCron({ dryRun: true });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('rejects a command containing a single quote (Linux cron-line quoting contract)', () => {
      const r = registerCron({ command: "node 'x'.mjs", dryRun: true });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('ACCEPTS a command containing double quotes — the Windows path triple needs them (Task 109 / D-83)', () => {
      // The Windows command IS `"<node>" "<script>" "<projectRoot>"` — double
      // quotes are REQUIRED (paths with spaces). The old guard rejected them,
      // making cron un-registerable on Windows (the whole D-83 bug). The win32
      // path now execs schtasks via an args array, so the inner quotes are safe.
      const r = registerCron({ command: 'node "x".mjs', dryRun: true });
      expect(r.action).toBe('dry-run');
      expect(r.action).not.toBe('error');
    });

    it('rejects invalid hour (>23)', () => {
      const r = registerCron({
        command: 'node x.mjs',
        schedule: { hour: 25, minute: 0 },
        dryRun: true,
      });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('rejects invalid minute (>59)', () => {
      const r = registerCron({
        command: 'node x.mjs',
        schedule: { hour: 23, minute: 99 },
        dryRun: true,
      });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('accepts valid schedule', () => {
      const r = registerCron({
        command: 'node x.mjs',
        schedule: { hour: 12, minute: 30 },
        dryRun: true,
      });
      expect(r.action).toBe('dry-run');
    });
  });

  describe('dry-run mode (Door 1: returns platform-detected command without executing)', () => {
    it('returns action:dry-run + executed:false', () => {
      const r = registerCron({ command: 'node bin.mjs', dryRun: true });
      expect(r.action).toBe('dry-run');
      expect(r.executed).toBe(false);
      expect(r.platform).toBe(process.platform);
      expect(r.command).toBeTruthy();
    });

    it('platform-specific command output is correct shape', () => {
      const r = registerCron({ command: 'node bin.mjs', dryRun: true });
      if (process.platform === 'linux') {
        expect(r.command).toContain('crontab -l');
        expect(r.command).toContain('grep -v');
        expect(r.command).toContain(CRON_ENTRY_NAME);
        expect(r.command).toContain('crontab -');
      } else if (process.platform === 'darwin') {
        expect(r.command).toContain('LaunchAgents');
        expect(r.command).toContain(CRON_ENTRY_NAME);
        expect(r.command).toContain('launchctl');
        // The plist content is in r.output for darwin dry-run.
        expect(r.output).toContain('<?xml');
        expect(r.output).toContain('<plist');
        expect(r.output).toContain('com.cmk.cmk-daily-distill');
      } else if (process.platform === 'win32') {
        // Task 109: the win32 dry-run command is now a readable render of the
        // schtasks ARGV array (entryName is a bare element, not display-quoted).
        expect(r.command).toContain('schtasks');
        expect(r.command).toContain(`/TN ${CRON_ENTRY_NAME}`);
        expect(r.command).toContain('/SC DAILY');
        // Default schedule is 23:00 — verify it's formatted as HH:mm.
        expect(r.command).toContain('/ST 23:00');
        // /F flag is the Windows idempotency primitive.
        expect(r.command).toContain('/F');
      }
    });

    it('honors custom schedule', () => {
      const r = registerCron({
        command: 'node bin.mjs',
        schedule: { hour: 7, minute: 15 },
        dryRun: true,
      });
      if (process.platform === 'linux') {
        expect(r.command).toContain('15 7 * * *');
      } else if (process.platform === 'darwin') {
        expect(r.output).toContain('<key>Hour</key><integer>7</integer>');
        expect(r.output).toContain('<key>Minute</key><integer>15</integer>');
      } else if (process.platform === 'win32') {
        expect(r.command).toContain('/ST 07:15');
      }
    });
  });

  describe('33.4 #2 — idempotency: re-run produces same dry-run output', () => {
    it('two consecutive dry-runs produce identical commands (platform-specific)', () => {
      const r1 = registerCron({ command: 'node bin.mjs', dryRun: true });
      const r2 = registerCron({ command: 'node bin.mjs', dryRun: true });
      expect(r1.command).toBe(r2.command);
      // For Linux: the `grep -v <entry-name>` is the idempotency
      // primitive — the pipe pattern strips any pre-existing entry
      // before re-adding. Verify the command structure pins this.
      if (process.platform === 'linux') {
        expect(r1.command).toMatch(/grep -v '[^']*cmk-daily-distill[^']*'/);
      }
      // For Windows: the `/F` flag forces overwrite. Same primitive.
      if (process.platform === 'win32') {
        expect(r1.command).toContain('/F');
      }
      // For macOS: the plist write is naturally idempotent
      // (overwrite-existing); launchctl bootout + bootstrap handles
      // re-loading.
      if (process.platform === 'darwin') {
        expect(r1.command).toContain('launchctl bootstrap');
      }
    });
  });

  describe('unregisterCron dry-run', () => {
    it('returns action:dry-run with platform-correct unregistration command', () => {
      const r = unregisterCron({ dryRun: true });
      expect(r.action).toBe('dry-run');
      expect(r.executed).toBe(false);
      if (process.platform === 'linux') {
        expect(r.command).toContain('grep -v');
        expect(r.command).toContain(CRON_ENTRY_NAME);
        expect(r.command).toContain('crontab -');
      } else if (process.platform === 'darwin') {
        expect(r.command).toContain('launchctl bootout');
        expect(r.command).toContain('rm');
      } else if (process.platform === 'win32') {
        expect(r.command).toContain('schtasks /Delete');
        expect(r.command).toContain(CRON_ENTRY_NAME);
        expect(r.command).toContain('/F');
      }
    });
  });

  describe('Task 109 — Windows schtasks + macOS plist quoting (D-83 fix)', () => {
    // The REAL command: absolute node + script + projectRoot, each double-quoted
    // (paths have spaces). This quoted triple is what tripped the old guard.
    const winCommand =
      `"C:\\Program Files\\nodejs\\node.exe" "${opaqueWinRoot('C:', 'sbx-bin', 'cmk-daily-distill.mjs')}" "C:\\My Proj"`;

    it('buildWindowsSchtasks returns an ARGV array with /TR = the command VERBATIM (not a shell string)', () => {
      const argv = buildWindowsSchtasks({ command: winCommand, entryName: CRON_ENTRY_NAME, hour: 23, minute: 0 });
      expect(Array.isArray(argv)).toBe(true);
      expect(argv[0]).toBe('/Create');
      // The /TR value is ONE element, quotes intact — delivered to schtasks verbatim.
      const trIdx = argv.indexOf('/TR');
      expect(trIdx).toBeGreaterThan(0);
      expect(argv[trIdx + 1]).toBe(winCommand);
      // daily cadence + idempotency + non-admin run level.
      expect(argv).toContain('/SC');
      expect(argv).toContain('DAILY');
      expect(argv).toContain('/F');
      expect(argv).toContain('LIMITED');
    });

    it('Task 215: with a shimPath, /TR runs `wscript //B //Nologo "<shim>"` (no direct console binary → no window)', () => {
      // Fixture path deliberately avoids the repo's real dir names ("context",
      // ".locks"): SonarCloud's A3S Scan-Manifest context collector reads test
      // files IGNORING sonar.exclusions, extracts path-like literals that match
      // real project layout, and opendir's them on the Linux runner — the old
      // drive-letter fixture here (drive + proj + the context dir name) was the
      // trigger of the exit-3 scan crash that started the minute PR #278 merged
      // (D-341 root-cause correction, 2026-07-18; the literal itself is not
      // repeated in this comment for exactly that reason). The test's contract
      // (wscript //B //Nologo wrapping of an absolute Windows shim path) is
      // unchanged.
      const shimPath = 'C:\\shimdir\\cmk-daily-distill-run.vbs';
      const argv = buildWindowsSchtasks({ command: winCommand, entryName: CRON_ENTRY_NAME, hour: 23, minute: 0, shimPath });
      const trIdx = argv.indexOf('/TR');
      // The /TR is the wscript-shim launch, NOT the raw node command.
      expect(argv[trIdx + 1]).toBe(`wscript.exe //B //Nologo "${shimPath}"`);
      expect(argv[trIdx + 1]).not.toContain('node.exe'); // the console binary is inside the shim, hidden
    });

    it('Task 215: buildWindowlessShim wraps the command in a hidden WshShell.Run (windowStyle 0, wait True) with quotes escaped', () => {
      const vbs = buildWindowlessShim(`"C:\\node.exe" "C:\\x.mjs" "${opaqueWinRoot('C:', 'sbx')}"`);
      expect(vbs).toContain('CreateObject("WScript.Shell")');
      // windowStyle 0 = hidden; True = wait for exit (so the schtask's LastResult reflects the real run).
      expect(vbs).toMatch(/\.Run ".*", 0, True/);
      // VBS string-literal escaping: each embedded `"` becomes `""`.
      expect(vbs).toContain('""C:\\node.exe""');
      // The comment names itself so it's not a mystery file.
      expect(vbs).toContain('core-memory-kit');
    });

    it('weekly cadence emits /SC WEEKLY /D <DAY>', () => {
      const argv = buildWindowsSchtasks({ command: winCommand, entryName: WEEKLY_ENTRY_NAME, hour: 9, minute: 0, dayOfWeek: 0 });
      expect(argv).toContain('WEEKLY');
      const dIdx = argv.indexOf('/D');
      expect(dIdx).toBeGreaterThan(0);
      expect(argv[dIdx + 1]).toBe('SUN');
    });

    it('registerCron(platform:win32) dry-runs the quoted triple WITHOUT rejecting it', () => {
      const r = registerCron({ command: winCommand, platform: 'win32', dryRun: true });
      expect(r.action).toBe('dry-run'); // NOT 'error' — the D-83 bug
      expect(r.platform).toBe('win32');
      expect(r.command).toContain('schtasks');
      expect(r.command).toContain('/TR');
    });

    it('registerCron(platform:win32) execs the ABSOLUTE System32 schtasks.exe with verbatim argv (Door 3)', () => {
      const calls = [];
      const fakeSpawn = (exe, args, opts) => {
        calls.push({ exe, args, opts });
        return { status: 0, stdout: 'SUCCESS: created', stderr: '' };
      };
      const r = registerCron({ command: winCommand, entryName: CRON_ENTRY_NAME, platform: 'win32', spawn: fakeSpawn });
      expect(r.action).toBe('registered');
      expect(r.executed).toBe(true);
      // The FIRST spawn is the schtasks /Create (167.E adds a 2nd PS call after).
      const captured = calls.find((c) => /schtasks\.exe$/i.test(c.exe));
      expect(captured).toBeDefined();
      // Door 3 — the spawned program is the ABSOLUTE System32 schtasks.exe, not a
      // bare PATH name (PATH-hijack guard, Sonar S4036).
      expect(captured.exe).toMatch(/[\\/]System32[\\/]schtasks\.exe$/i);
      // …and the /TR triple is delivered verbatim (the D-83 fix).
      const trIdx = captured.args.indexOf('/TR');
      expect(captured.args[trIdx + 1]).toBe(winCommand);
      expect(captured.opts.windowsHide).toBe(true);
      expect(captured.opts.timeout).toBe(10_000);
    });

    it('Task 215: with a projectRoot, registerCron WRITES the windowless shim and points /TR at it (Door 2 + Door 3)', () => {
      const writes = [];
      const fakeSpawn = () => ({ status: 0, stdout: 'SUCCESS', stderr: '' });
      const r = registerCron({
        command: winCommand,
        entryName: CRON_ENTRY_NAME,
        platform: 'win32',
        projectRoot: RUNTIME_ROOT,
        spawn: fakeSpawn,
        writeFile: (path, content) => writes.push({ path, content }),
      });
      expect(r.action).toBe('registered');
      // Door 2: the shim file was written under the gitignored .locks dir.
      const shimWrite = writes.find((w) => w.path.endsWith(`${CRON_ENTRY_NAME}-run.vbs`));
      expect(shimWrite).toBeDefined();
      expect(shimWrite.path).toContain('.locks');
      expect(shimWrite.content).toContain('WScript.Shell');
      expect(shimWrite.content).toMatch(/\.Run ".*", 0, True/);
    });

    it('Task 215: a shim-write FAILURE falls back to the direct command (never fails registration)', () => {
      const fakeSpawn = () => ({ status: 0, stdout: 'SUCCESS', stderr: '' });
      const calls = [];
      const r = registerCron({
        command: winCommand,
        entryName: CRON_ENTRY_NAME,
        platform: 'win32',
        projectRoot: RUNTIME_ROOT,
        spawn: (exe, args) => { calls.push({ exe, args }); return fakeSpawn(); },
        writeFile: () => { throw new Error('read-only disk'); },
      });
      expect(r.action).toBe('registered'); // NOT error — the fallback path
      // The /TR reverted to the direct command (visible window, but functional).
      const captured = calls.find((c) => /schtasks\.exe$/i.test(c.exe));
      const trIdx = captured.args.indexOf('/TR');
      expect(captured.args[trIdx + 1]).toBe(winCommand); // direct, not the wscript shim
    });

    it('registerCron(platform:win32) reports action:error when schtasks exits non-zero', () => {
      const fakeSpawn = () => ({ status: 1, stdout: '', stderr: 'ERROR: Access is denied.' });
      const r = registerCron({ command: winCommand, platform: 'win32', spawn: fakeSpawn });
      expect(r.action).toBe('error');
      expect(r.error).toContain('schtasks exit 1');
      expect(r.output).toContain('Access is denied');
    });

    it('Task 167.E: after a successful /Create, sets StartWhenAvailable via a best-effort PowerShell call (OS catch-up for a missed run)', () => {
      // schtasks /Create has NO StartWhenAvailable flag (verified — not in the CLI
      // help); it's settable only via XML or PowerShell. So a missed nightly run
      // (laptop asleep at 23:00) is silently dropped by default. 167.E flips it on
      // best-effort with a follow-up Set-ScheduledTask call.
      const calls = [];
      const fakeSpawn = (exe, args) => {
        calls.push({ exe, args });
        return { status: 0, stdout: 'SUCCESS', stderr: '' };
      };
      const r = registerCron({ command: winCommand, entryName: CRON_ENTRY_NAME, platform: 'win32', spawn: fakeSpawn });
      expect(r.action).toBe('registered');
      // Two execs: the schtasks /Create, then the PowerShell StartWhenAvailable.
      const psCall = calls.find((c) => /powershell/i.test(c.exe) || c.args.some((a) => /StartWhenAvailable/i.test(a)));
      expect(psCall).toBeDefined();
      expect(psCall.args.some((a) => /StartWhenAvailable/i.test(a))).toBe(true);
      // Task 203 (D-298): WakeToRun is now ALSO set so the machine WAKES to run
      // the 23:00 distill instead of the cron being killed mid-run on a sleeping
      // laptop (the starvation bug). Same best-effort Set-ScheduledTask call.
      expect(psCall.args.some((a) => /WakeToRun/i.test(a))).toBe(true);
      expect(psCall.args.some((a) => a.includes(CRON_ENTRY_NAME))).toBe(true);
    });

    it('Task 167.E: a FAILED StartWhenAvailable call does NOT fail registration (best-effort backstop)', () => {
      // The lazy roll (167.A/D) is the guarantee; the catch-up flag is a best-effort
      // optimization. A PS failure must leave action:registered.
      let n = 0;
      const fakeSpawn = () => {
        n += 1;
        // First call (schtasks) succeeds; second call (PowerShell) fails.
        return n === 1 ? { status: 0, stdout: 'SUCCESS', stderr: '' } : { status: 1, stdout: '', stderr: 'PS boom' };
      };
      const r = registerCron({ command: winCommand, entryName: CRON_ENTRY_NAME, platform: 'win32', spawn: fakeSpawn });
      expect(r.action).toBe('registered'); // registration still succeeded
    });

    it('macOS strips the wrapping quotes so launchd execs a real path, not a literally-quoted one', () => {
      // No-space paths: the quote-strip fixes this common case (a space-bearing
      // path is the documented remaining edge needing the argv-array refactor).
      const cmd = '"/usr/local/bin/node" "/proj/bin/cmk-daily-distill.mjs" "/proj"';
      const r = registerCron({ command: cmd, platform: 'darwin', dryRun: true });
      expect(r.action).toBe('dry-run');
      expect(r.output).toContain('<string>/usr/local/bin/node</string>');
      expect(r.output).not.toMatch(/<string>"/); // no ProgramArgument starts with a literal quote
    });
  });
});
