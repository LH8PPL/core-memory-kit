// Task 205 (D-302) — mcp-procs + half-install: the DLL-lock half-install
// hazard made visible + recoverable.
// @doors: 1,3
// Door 2 N/A: these modules mutate no kit state (a process scan + a message
// builder; stopMcpServers signals OTHER processes, asserted via Door 3).
// Door 4 N/A: no message queues in the kit.
// Door 5 N/A: no NDJSON surface — the preflight prints to the console (CLI
// UX), and the bin boundary prints the recovery; neither writes a log tier.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  isKitMcpCommandLine,
  parseWindowsProcessJson,
  parsePosixProcessList,
  findRunningKitMcpServers,
  stopMcpServers,
} from '../packages/cli/src/mcp-procs.mjs';
import {
  isModuleResolutionError,
  halfInstallRecoveryMessage,
} from '../packages/cli/src/half-install.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('Task 205 — isKitMcpCommandLine', () => {
  it('matches the kit server shapes, rejects everything else', () => {
    expect(isKitMcpCommandLine('node C:\\npm\\cmk.mjs mcp serve')).toBe(true);
    expect(isKitMcpCommandLine('"C:\\Program Files\\nodejs\\node.exe" "…\\bin\\cmk.mjs" mcp serve')).toBe(true);
    expect(isKitMcpCommandLine('node /usr/lib/node_modules/@lh8ppl/core-memory-kit/packages/cli/bin/cmk.mjs mcp serve')).toBe(true);
    // THE REAL WINDOWS PAYLOAD (live-captured 2026-07-11 from a running server —
    // the fixture-corpus discipline): every argument individually quoted. The
    // first matcher version missed exactly this (the D-306 class, caught live).
    expect(isKitMcpCommandLine('"node"   "C:\\Users\\someone\\AppData\\Roaming\\npm\\\\node_modules\\@lh8ppl\\core-memory-kit\\bin\\cmk.mjs" "mcp" "serve"')).toBe(true);
    // NOT ours: other MCP servers, other node procs, a grep of the string.
    expect(isKitMcpCommandLine('node some-other-mcp-server serve')).toBe(false);
    expect(isKitMcpCommandLine('node cmk.mjs search "mcp serve"')).toBe(true); // conservative: contains all tokens — acceptable over-match, the preflight only WARNS
    expect(isKitMcpCommandLine('node index.js')).toBe(false);
    expect(isKitMcpCommandLine('')).toBe(false);
    expect(isKitMcpCommandLine(null)).toBe(false);
  });
});

describe('Task 205 — process-list parsers', () => {
  it('parses PowerShell ConvertTo-Json output: array, single object, garbage, empty', () => {
    const arr = JSON.stringify([
      { ProcessId: 100, CommandLine: 'node cmk.mjs mcp serve' },
      { ProcessId: 200, CommandLine: 'node other.js' },
    ]);
    expect(parseWindowsProcessJson(arr)).toEqual([
      { pid: 100, commandLine: 'node cmk.mjs mcp serve' },
      { pid: 200, commandLine: 'node other.js' },
    ]);
    // Single row → PowerShell emits a bare object, not a 1-array.
    const one = JSON.stringify({ ProcessId: 300, CommandLine: 'node x' });
    expect(parseWindowsProcessJson(one)).toEqual([{ pid: 300, commandLine: 'node x' }]);
    expect(parseWindowsProcessJson('')).toEqual([]);
    expect(parseWindowsProcessJson('not json')).toEqual([]);
    // A row with a null CommandLine (access denied) survives as empty string.
    expect(parseWindowsProcessJson(JSON.stringify({ ProcessId: 5, CommandLine: null }))).toEqual([
      { pid: 5, commandLine: '' },
    ]);
  });

  it('parses `ps -eo pid=,args=` output', () => {
    const out = '  101 node /usr/bin/cmk mcp serve\n  202 bash -lc something\n\n';
    expect(parsePosixProcessList(out)).toEqual([
      { pid: 101, commandLine: 'node /usr/bin/cmk mcp serve' },
      { pid: 202, commandLine: 'bash -lc something' },
    ]);
    expect(parsePosixProcessList('')).toEqual([]);
  });
});

describe('Task 205 — findRunningKitMcpServers (Door 3: what gets spawned)', () => {
  it('win32: spawns the ABSOLUTE System32 powershell with the CIM query; filters to kit servers, excludes self', () => {
    const calls = [];
    const fakeSpawn = (exe, args) => {
      calls.push({ exe, args });
      return {
        status: 0,
        stdout: JSON.stringify([
          { ProcessId: 11, CommandLine: 'node cmk.mjs mcp serve' },
          { ProcessId: 22, CommandLine: 'node unrelated.js' },
          { ProcessId: 33, CommandLine: 'node cmk.mjs mcp serve' }, // self
        ]),
        stderr: '',
      };
    };
    const r = findRunningKitMcpServers({ spawn: fakeSpawn, platform: 'win32', selfPid: 33 });
    expect(r.error).toBeUndefined();
    expect(r.servers).toEqual([{ pid: 11, commandLine: 'node cmk.mjs mcp serve' }]);
    // Door 3: absolute System32 path (the register-crons S4036 precedent), argv array.
    expect(calls).toHaveLength(1);
    expect(calls[0].exe.toLowerCase()).toMatch(/system32[\\/]windowspowershell[\\/]v1\.0[\\/]powershell\.exe$/);
    expect(calls[0].args).toContain('-NoProfile');
    expect(calls[0].args.some((a) => /Get-CimInstance Win32_Process/.test(a))).toBe(true);
  });

  it('posix: spawns ps with pid=,args=; filters + excludes self', () => {
    const calls = [];
    const fakeSpawn = (exe, args) => {
      calls.push({ exe, args });
      return { status: 0, stdout: ' 7 node cmk mcp serve\n 8 node cmk mcp serve\n 9 vim\n', stderr: '' };
    };
    const r = findRunningKitMcpServers({ spawn: fakeSpawn, platform: 'linux', selfPid: 8 });
    expect(r.servers.map((s) => s.pid)).toEqual([7]);
    expect(calls[0].exe).toBe('ps');
    expect(calls[0].args).toEqual(['-eo', 'pid=,args=']);
  });

  it('NEVER throws: a failed scan returns {servers: [], error} (the preflight is an optimization, not a gate)', () => {
    const boom = () => { throw new Error('spawn exploded'); };
    const r1 = findRunningKitMcpServers({ spawn: boom, platform: 'win32', selfPid: 1 });
    expect(r1.servers).toEqual([]);
    expect(r1.error).toContain('spawn exploded');
    const failExit = () => ({ status: 1, stdout: '', stderr: 'denied' });
    const r2 = findRunningKitMcpServers({ spawn: failExit, platform: 'linux', selfPid: 1 });
    expect(r2.servers).toEqual([]);
    expect(r2.error).toBeDefined();
  });
});

describe('Task 205 — stopMcpServers (Door 3)', () => {
  it('win32: taskkill /PID <n> /F per pid via the absolute System32 path', () => {
    const calls = [];
    const fakeSpawn = (exe, args) => { calls.push({ exe, args }); return { status: 0, stdout: '', stderr: '' }; };
    const r = stopMcpServers([11, 22], { spawn: fakeSpawn, platform: 'win32' });
    expect(r).toEqual([{ pid: 11, stopped: true }, { pid: 22, stopped: true }]);
    expect(calls).toHaveLength(2);
    expect(calls[0].exe.toLowerCase()).toMatch(/system32[\\/]taskkill\.exe$/);
    expect(calls[0].args).toEqual(['/PID', '11', '/F']);
  });

  it('posix: kill -TERM; a failed kill reports stopped:false without throwing; invalid pids rejected', () => {
    const fakeSpawn = (exe, args) => (args[1] === '99' ? { status: 1, stdout: '', stderr: 'no such' } : { status: 0, stdout: '', stderr: '' });
    const r = stopMcpServers([5, 99, 'garbage'], { spawn: fakeSpawn, platform: 'linux' });
    expect(r[0]).toEqual({ pid: 5, stopped: true });
    expect(r[1].stopped).toBe(false);
    expect(r[2]).toMatchObject({ stopped: false, error: 'invalid pid' });
  });
});

describe('Task 205 — half-install classifier + recovery message', () => {
  it('classifies module-resolution failures, not ordinary errors', () => {
    expect(isModuleResolutionError(Object.assign(new Error('x'), { code: 'ERR_MODULE_NOT_FOUND' }))).toBe(true);
    expect(isModuleResolutionError(Object.assign(new Error('x'), { code: 'MODULE_NOT_FOUND' }))).toBe(true);
    expect(isModuleResolutionError(new Error("Cannot find module '@modelcontextprotocol/sdk'"))).toBe(true);
    expect(isModuleResolutionError(new Error("Cannot find package 'commander'"))).toBe(true);
    expect(isModuleResolutionError(new Error('ordinary runtime failure'))).toBe(false);
    expect(isModuleResolutionError(null)).toBe(false);
  });

  it('the recovery message names the cause, the 2-step fix, and the data-safety note', () => {
    const msg = halfInstallRecoveryMessage(new Error("Cannot find module '@modelcontextprotocol/sdk'"));
    expect(msg).toContain('HALF-BROKEN');
    expect(msg).toContain('cmk mcp serve');
    expect(msg).toContain('npm install -g @lh8ppl/core-memory-kit');
    expect(msg).toContain('NOT touched');
    expect(msg).toContain('@modelcontextprotocol/sdk'); // the underlying detail surfaces
  });
});

describe('Task 205 — warnRunningMcpServers (the cmk install preflight)', () => {
  function captureLog() {
    const lines = [];
    return { log: (m) => lines.push(String(m)), lines, text: () => lines.join('\n') };
  }

  it('silent on non-Windows (the DLL-lock hazard is win32-only)', async () => {
    const { warnRunningMcpServers } = await import('../packages/cli/src/subcommands.mjs');
    const cap = captureLog();
    await warnRunningMcpServers(
      { mcpProcsPlatform: 'linux', findMcpServers: () => { throw new Error('must not be called'); } },
      { log: cap.log },
    );
    expect(cap.lines).toHaveLength(0);
  });

  it('silent when no servers are running (interactive happy path — the scan runs, finds nothing)', async () => {
    const { warnRunningMcpServers } = await import('../packages/cli/src/subcommands.mjs');
    const cap = captureLog();
    let scanned = false;
    await warnRunningMcpServers(
      {
        mcpProcsPlatform: 'win32',
        askImpl: async () => 'n', // consent channel present → interactive → the scan DOES run
        findMcpServers: () => { scanned = true; return { servers: [] }; },
      },
      { log: cap.log },
    );
    expect(scanned).toBe(true);
    expect(cap.lines).toHaveLength(0);
  });

  it('NON-interactive: fully silent — does not even SCAN (hermetic tests/CI never pay the CIM cost)', async () => {
    const { warnRunningMcpServers } = await import('../packages/cli/src/subcommands.mjs');
    const cap = captureLog();
    let scanned = false;
    await warnRunningMcpServers(
      {
        mcpProcsPlatform: 'win32',
        interactive: false,
        findMcpServers: () => { scanned = true; return { servers: [{ pid: 11 }] }; },
      },
      { log: cap.log },
    );
    expect(scanned).toBe(false);
    expect(cap.lines).toHaveLength(0);
  });

  it('interactive (offerStop): names the servers + the upgrade caveat; declining (n) stops nothing', async () => {
    const { warnRunningMcpServers } = await import('../packages/cli/src/subcommands.mjs');
    const cap = captureLog();
    let stopCalled = false;
    await warnRunningMcpServers(
      {
        mcpProcsPlatform: 'win32',
        offerStop: true, // Task 222: the interactive stop-offer is opt-in
        askImpl: async () => 'n',
        findMcpServers: () => ({ servers: [{ pid: 11, commandLine: 'node cmk mcp serve' }] }),
        stopMcpServers: () => { stopCalled = true; return []; },
      },
      { log: cap.log },
    );
    const text = cap.text();
    expect(text).toContain('pid 11');
    // Informed consent (skill-review D-314): the note shows WHAT each pid is,
    // so a confirmed stop is never blind — the command line appears.
    expect(text).toContain('node cmk mcp serve');
    expect(text).toContain('npm install -g @lh8ppl/core-memory-kit');
    expect(text.toLowerCase()).toContain('fine for normal use'); // not framed as broken
    expect(stopCalled).toBe(false);
  });

  it('interactive YES (offerStop): stops via the injected stopper and reports the count', async () => {
    const { warnRunningMcpServers } = await import('../packages/cli/src/subcommands.mjs');
    const cap = captureLog();
    const stopped = [];
    await warnRunningMcpServers(
      {
        mcpProcsPlatform: 'win32',
        offerStop: true, // Task 222: the interactive stop-offer is opt-in
        askImpl: async () => 'y',
        findMcpServers: () => ({ servers: [{ pid: 11 }, { pid: 22 }] }),
        stopMcpServers: (pids) => { stopped.push(...pids); return pids.map((pid) => ({ pid, stopped: true })); },
      },
      { log: cap.log },
    );
    expect(stopped).toEqual([11, 22]);
    expect(cap.text()).toContain('stopped 2/2');
  });

  it('a foreign askImpl WITHOUT this feature\'s find seam → silent, no scan, no throw (the stress-gate D-315 regression)', async () => {
    // The exact shape that broke under stress: the binding-fix tests pass a
    // THROWING askImpl sentinel ("must not ask when healthy") with no intent to
    // authorize this feature. Pre-fix, the shared askImpl implied interactive →
    // the REAL system scan ran → found the dev machine's genuinely-running
    // server → asked the throwing sentinel → detonated out of runInstall.
    // Post-fix: no findMcpServers seam + no real TTY → never scans, never asks.
    const { warnRunningMcpServers } = await import('../packages/cli/src/subcommands.mjs');
    const cap = (() => { const lines = []; return { log: (m) => lines.push(String(m)), lines }; })();
    await expect(
      warnRunningMcpServers(
        {
          mcpProcsPlatform: 'win32',
          askImpl: async () => { throw new Error('must not ask'); },
          // deliberately NO findMcpServers — the foreign-caller shape
        },
        { log: cap.log },
      ),
    ).resolves.toBeUndefined();
    expect(cap.lines).toHaveLength(0);
  });

  it('even an EXPLODING injected find never breaks the caller (never-throw contract)', async () => {
    const { warnRunningMcpServers } = await import('../packages/cli/src/subcommands.mjs');
    await expect(
      warnRunningMcpServers(
        {
          mcpProcsPlatform: 'win32',
          askImpl: async () => 'y',
          findMcpServers: () => { throw new Error('scan exploded'); },
        },
        { log: () => {} },
      ),
    ).resolves.toBeUndefined();
  });

  it('interactive default (empty answer) = NO — stopping is opt-in', async () => {
    const { warnRunningMcpServers } = await import('../packages/cli/src/subcommands.mjs');
    const cap = captureLog();
    let stopCalled = false;
    await warnRunningMcpServers(
      {
        mcpProcsPlatform: 'win32',
        offerStop: true, // Task 222: the interactive stop is now opt-in per caller
        askImpl: async () => '',
        findMcpServers: () => ({ servers: [{ pid: 11 }] }),
        stopMcpServers: () => { stopCalled = true; return []; },
      },
      { log: cap.log },
    );
    expect(stopCalled).toBe(false);
  });

  // Task 222 (D-302 follow-up, v0.5.1 cut-gate — the user's "why do I need all
  // this bullshit?"): a plain `cmk install` is fully SILENT about running MCP
  // servers. The DLL-lock hazard is `npm install -g`-only (not caused by a
  // project install), the stop's answer is always N, AND the per-PID + lecture
  // output is pure noise on the common path. Nothing prints, nothing asks,
  // nothing stops — the hazard's real safety net is the bin-boundary recovery
  // message if an upgrade ever DOES half-break (Task 205's other half).
  it('default (no offerStop): fully SILENT — no note, no ask, no stop (Task 222)', async () => {
    const { warnRunningMcpServers } = await import('../packages/cli/src/subcommands.mjs');
    const cap = captureLog();
    let asked = false;
    let stopCalled = false;
    await warnRunningMcpServers(
      {
        mcpProcsPlatform: 'win32',
        // interactive scan authorized via the feature's OWN find seam (a real
        // install on a TTY takes this path); NO offerStop.
        findMcpServers: () => ({ servers: [{ pid: 11, commandLine: 'node cmk mcp serve' }] }),
        askImpl: async () => { asked = true; return 'y'; },
        stopMcpServers: () => { stopCalled = true; return []; },
      },
      { log: cap.log },
    );
    // Nothing emitted at all on the plain-install path.
    expect(cap.lines).toHaveLength(0);
    expect(asked).toBe(false);
    expect(stopCalled).toBe(false);
  });

  it('offerStop:true restores the interactive stop-offer (a future upgrade path opts in)', async () => {
    const { warnRunningMcpServers } = await import('../packages/cli/src/subcommands.mjs');
    const cap = captureLog();
    const stopped = [];
    let askedPrompt = null;
    await warnRunningMcpServers(
      {
        mcpProcsPlatform: 'win32',
        offerStop: true,
        askImpl: async (q) => { askedPrompt = String(q); return 'y'; },
        findMcpServers: () => ({ servers: [{ pid: 11 }, { pid: 22 }] }),
        stopMcpServers: (pids) => { stopped.push(...pids); return pids.map((pid) => ({ pid, stopped: true })); },
      },
      { log: cap.log },
    );
    // The stop-offer prompt fired (it rides askImpl, not the log emitter) and
    // the confirmed stop ran — the actionable path the opt-in restores.
    expect(askedPrompt).not.toBeNull();
    expect(askedPrompt.toLowerCase()).toContain('stop them now');
    expect(stopped).toEqual([11, 22]);
    expect(cap.text()).toContain('stopped 2/2');
  });
});

describe('Task 205 — the bin boundary, REAL spawn (a half-install no longer prints a raw stack)', () => {
  it('a bin whose src/index.mjs fails module resolution prints the recovery message, exit 1', () => {
    // Build a minimal broken "install": the real bin file + the real
    // half-install.mjs, and a src/index.mjs whose import cannot resolve —
    // exactly the observed half-install shape (SDK missing → static chain dies).
    const sandbox = mkdtempSync(join(tmpdir(), 'cmk-halfinstall-'));
    try {
      mkdirSync(join(sandbox, 'bin'), { recursive: true });
      mkdirSync(join(sandbox, 'src'), { recursive: true });
      copyFileSync(join(HERE, '..', 'packages', 'cli', 'bin', 'cmk.mjs'), join(sandbox, 'bin', 'cmk.mjs'));
      copyFileSync(join(HERE, '..', 'packages', 'cli', 'src', 'half-install.mjs'), join(sandbox, 'src', 'half-install.mjs'));
      writeFileSync(
        join(sandbox, 'src', 'index.mjs'),
        "import missing from '@nonexistent/half-install-probe-pkg';\nexport function run() { return missing; }\n",
        'utf8',
      );
      const r = spawnSync(process.execPath, [join(sandbox, 'bin', 'cmk.mjs'), '--version'], {
        encoding: 'utf8',
        timeout: 30_000,
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('HALF-BROKEN');
      expect(r.stderr).toContain('npm install -g @lh8ppl/core-memory-kit');
      // The cryptic raw-stack-only failure is gone (the stack may still be
      // absent entirely — the recovery message is the contract).
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('an ORDINARY error still gets the generic handler (no false half-install claim)', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'cmk-ordinary-'));
    try {
      mkdirSync(join(sandbox, 'bin'), { recursive: true });
      mkdirSync(join(sandbox, 'src'), { recursive: true });
      copyFileSync(join(HERE, '..', 'packages', 'cli', 'bin', 'cmk.mjs'), join(sandbox, 'bin', 'cmk.mjs'));
      copyFileSync(join(HERE, '..', 'packages', 'cli', 'src', 'half-install.mjs'), join(sandbox, 'src', 'half-install.mjs'));
      writeFileSync(
        join(sandbox, 'src', 'index.mjs'),
        "export async function run() { throw new Error('ordinary runtime failure'); }\n",
        'utf8',
      );
      const r = spawnSync(process.execPath, [join(sandbox, 'bin', 'cmk.mjs'), '--version'], {
        encoding: 'utf8',
        timeout: 30_000,
      });
      expect(r.status).toBe(1);
      expect(r.stderr).not.toContain('HALF-BROKEN');
      expect(r.stderr).toContain('cmk: unexpected error');
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
