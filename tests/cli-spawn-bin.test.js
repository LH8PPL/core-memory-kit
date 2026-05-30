// @doors: 1, 3
// Door 2 N/A: pure call-shaping; no disk/state.
// Door 4 N/A: no NDJSON log.
// Door 5 N/A: no message queue.

// Tests for spawn-bin.mjs — cross-platform bin spawning that avoids the
// `shell:true` + args-array combination (self-test finding #4). That combo
// emits Node's DEP0190 deprecation AND concatenates argv unescaped, so a path
// with a space (C:\Users\First Last\...\empty-mcp.json under tmpdir) is
// re-tokenized by cmd.exe and breaks --mcp-config parsing — silently failing
// auto-extract/compression for any Windows user with a space in their profile.
//
// Boundary: winCommandLine() builds the quoted single command string;
// spawnBin/spawnBinSync pick the right call shape per platform (tested via a
// platform override + a recording spawnImpl so BOTH branches are deterministic).

import { describe, it, expect } from 'vitest';
import {
  winCommandLine,
  spawnBin,
  spawnBinSync,
} from '../packages/cli/src/spawn-bin.mjs';

describe('winCommandLine — cmd.exe-safe single command string (#4)', () => {
  it('quotes only args that need it (spaces); leaves bare flags unquoted', () => {
    expect(
      winCommandLine('claude', ['--print', '--model', 'haiku']),
    ).toBe('claude --print --model haiku');
  });

  it('quotes a path containing spaces so cmd.exe keeps it one token', () => {
    expect(
      winCommandLine('claude', [
        '--mcp-config',
        'C:\\Users\\First Last\\AppData\\Local\\Temp\\cmk-haiku-x\\empty-mcp.json',
      ]),
    ).toBe(
      'claude --mcp-config "C:\\Users\\First Last\\AppData\\Local\\Temp\\cmk-haiku-x\\empty-mcp.json"',
    );
  });

  it('preserves an empty-string arg as an explicit empty token ("")', () => {
    // The compressor passes `--allowed-tools ''`; an unquoted empty arg would
    // vanish and shift the following flag into its value slot.
    expect(winCommandLine('claude', ['--allowed-tools', '', '--max-turns'])).toBe(
      'claude --allowed-tools "" --max-turns',
    );
  });

  it('doubles embedded double-quotes', () => {
    expect(winCommandLine('x', ['a"b'])).toBe('x "a""b"');
  });

  it('doubles a trailing backslash so a quoted dir path does not escape the close quote', () => {
    // "C:\Program Files\" would parse as `C:\Program Files"` — the trailing \
    // escapes the quote. Doubling it (\\) keeps one literal backslash.
    expect(winCommandLine('x', ['C:\\Program Files\\'])).toBe(
      'x "C:\\Program Files\\\\"',
    );
  });
});

describe('spawnBin — platform-correct call shape, never shell:true+args (#4)', () => {
  function recorder() {
    const calls = [];
    const impl = (...a) => {
      calls.push(a);
      return { pid: 1 };
    };
    return { calls, impl };
  }

  it('POSIX: spawns (bin, args, {shell:false}) — Node resolves PATH, args safe', () => {
    const { calls, impl } = recorder();
    spawnBin('claude', ['--print', 'x y'], { cwd: '/tmp' }, {
      spawnImpl: impl,
      platform: 'linux',
    });
    expect(calls).toHaveLength(1);
    const [bin, args, opts] = calls[0];
    expect(bin).toBe('claude');
    expect(args).toEqual(['--print', 'x y']);
    expect(opts.shell).toBe(false);
    expect(opts.cwd).toBe('/tmp');
  });

  it('Windows: spawns (singleCommandString, {shell:true}) — NO args array (clears DEP0190)', () => {
    const { calls, impl } = recorder();
    spawnBin(
      'claude',
      ['--mcp-config', 'C:\\Users\\First Last\\x.json'],
      { windowsHide: true },
      { spawnImpl: impl, platform: 'win32' },
    );
    expect(calls).toHaveLength(1);
    const [cmdline, optsOrArgs, maybeOpts] = calls[0];
    // The SECOND positional must be the options object, NOT an args array —
    // that's the DEP0190 invariant (no args array alongside shell:true).
    expect(Array.isArray(optsOrArgs)).toBe(false);
    expect(cmdline).toBe('claude --mcp-config "C:\\Users\\First Last\\x.json"');
    expect(optsOrArgs.shell).toBe(true);
    expect(optsOrArgs.windowsHide).toBe(true);
    expect(maybeOpts).toBeUndefined();
  });

  it('spawnBinSync mirrors the platform shape', () => {
    // On the real host platform; assert the call doesn't throw and returns a
    // result-shaped object. (Branch correctness is pinned by the spawnBin tests
    // + winCommandLine above; this is a smoke that the sync wrapper is wired.)
    const r = spawnBinSync(process.execPath, ['-e', 'process.exit(0)'], {
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
  });
});
