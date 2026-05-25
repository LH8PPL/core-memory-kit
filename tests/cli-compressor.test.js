// Tests for Task 23.6 — CompressorBackend interface + HaikuViaAnthropicApi
// + MockHaikuBackend (T-020).
//
// Boundary-test discipline:
//   - The CompressorBackend INTERFACE (compress + modelId +
//     estimatedCostPerCall) is the public contract used by Task 22's
//     SessionEnd hook AND by Task 23's auto-extract subagent. Tests
//     pin the interface shape, the result shape, and HaikuViaAnthropicApi's
//     subprocess-spawn behavior via an injectable `spawnFn` (so we can
//     prove the documented `claude --print` invocation without
//     installing the real `claude` binary).
//   - The MockHaikuBackend gives the rest of the test suite (and
//     downstream Task-22 tests) a way to inject canned responses
//     without ever shelling out.

import { describe, it, expect } from 'vitest';
import {
  CompressorBackend,
  HaikuViaAnthropicApi,
  MockHaikuBackend,
} from '../packages/cli/src/compressor.mjs';

describe('Task 23.6 — CompressorBackend interface', () => {
  it('is an abstract class whose compress/modelId/estimatedCostPerCall must be overridden', async () => {
    const base = new CompressorBackend();
    await expect(base.compress({ input: 'x', maxOutputBytes: 100 })).rejects.toThrow(
      /must be implemented/i,
    );
    expect(() => base.modelId()).toThrow(/must be implemented/i);
    expect(() => base.estimatedCostPerCall(1024)).toThrow(/must be implemented/i);
  });

  it('CompressorResult shape: outputText/inputTokens/outputTokens/costUSD/preservedIds', async () => {
    const mock = new MockHaikuBackend({
      responses: [
        {
          outputText: 'compressed body',
          inputTokens: 500,
          outputTokens: 80,
          costUSD: 0.001,
          preservedIds: ['P-S79MJHFN'],
        },
      ],
    });
    const r = await mock.compress({ input: 'in', maxOutputBytes: 1000 });
    expect(r).toMatchObject({
      outputText: expect.any(String),
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
      costUSD: expect.any(Number),
      preservedIds: expect.any(Array),
    });
  });
});

describe('Task 23.6 — MockHaikuBackend', () => {
  it('returns canned responses in order, then throws if exhausted', async () => {
    const mock = new MockHaikuBackend({
      responses: [
        { outputText: 'first', inputTokens: 1, outputTokens: 1, costUSD: 0, preservedIds: [] },
        { outputText: 'second', inputTokens: 1, outputTokens: 1, costUSD: 0, preservedIds: [] },
      ],
    });
    expect((await mock.compress({ input: 'a', maxOutputBytes: 100 })).outputText).toBe('first');
    expect((await mock.compress({ input: 'b', maxOutputBytes: 100 })).outputText).toBe('second');
    await expect(mock.compress({ input: 'c', maxOutputBytes: 100 })).rejects.toThrow(
      /MockHaikuBackend: no more canned responses/i,
    );
  });

  it('throws when configured with throwError on next call', async () => {
    const mock = new MockHaikuBackend({
      throwError: new Error('simulated haiku failure'),
    });
    await expect(mock.compress({ input: 'x', maxOutputBytes: 100 })).rejects.toThrow(
      /simulated haiku failure/,
    );
  });

  it('records every compress call (for spy-style assertions in downstream tests)', async () => {
    const mock = new MockHaikuBackend({
      responses: [{ outputText: 'ok', inputTokens: 1, outputTokens: 1, costUSD: 0, preservedIds: [] }],
    });
    await mock.compress({ input: 'the-input', maxOutputBytes: 999, instructions: 'do-this' });
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]).toMatchObject({
      input: 'the-input',
      maxOutputBytes: 999,
      instructions: 'do-this',
    });
  });

  it('exposes modelId + estimatedCostPerCall', () => {
    const mock = new MockHaikuBackend({ responses: [] });
    expect(mock.modelId()).toMatch(/mock/i);
    expect(typeof mock.estimatedCostPerCall(1024)).toBe('number');
  });
});

describe('Task 23.6 — HaikuViaAnthropicApi', () => {
  it('modelId returns the documented Haiku 4.5 model id', () => {
    const h = new HaikuViaAnthropicApi();
    expect(h.modelId()).toBe('claude-haiku-4-5-20251001');
  });

  it('estimatedCostPerCall returns a positive number scaling with input size', () => {
    const h = new HaikuViaAnthropicApi();
    const small = h.estimatedCostPerCall(1024);
    const big = h.estimatedCostPerCall(1024 * 1024);
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small);
  });

  it('compress spawns claude --print with documented sandbox flags (OS-tmpdir cwd, env -u CLAUDECODE, empty allowedTools, --max-turns 1, MCP via tempfile, stdin, shell:true)', async () => {
    // Capture what spawnFn was called with — the test never invokes
    // a real `claude` binary.
    const spawnCalls = [];
    const { EventEmitter } = await import('node:events');
    const fakeSpawn = (cmd, args, opts) => {
      spawnCalls.push({ cmd, args, opts });
      const child = new EventEmitter();
      child.stdin = {
        write: () => true,
        end: () => {
          // Simulate the child writing a response + exiting cleanly
          setImmediate(() => {
            child.stdout.emit('data', Buffer.from('mock response body\n', 'utf8'));
            child.emit('close', 0);
          });
        },
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      return child;
    };

    const h = new HaikuViaAnthropicApi({ spawnFn: fakeSpawn });
    const r = await h.compress({
      input: 'hello world',
      maxOutputBytes: 500,
      preserveCitationIds: true,
      instructions: 'be terse',
    });

    expect(spawnCalls).toHaveLength(1);
    const { cmd, args, opts } = spawnCalls[0];
    // Bin defaults to `claude.cmd` on Windows, `claude` on POSIX (npm
    // installs CLI binaries as .cmd shims on Windows; spawn won't
    // auto-resolve the extension without help).
    expect(cmd).toBe(process.platform === 'win32' ? 'claude.cmd' : 'claude');
    expect(args).toContain('--print');
    expect(args).toContain('--max-turns');
    expect(args[args.indexOf('--max-turns') + 1]).toBe('1');
    expect(args).toContain('--allowed-tools');
    expect(args[args.indexOf('--allowed-tools') + 1]).toBe(''); // tightened from design §6.1's "Read" to empty per claude-remember pattern
    expect(args).toContain('--mcp-config');
    // MCP config is now passed as a file path (not inline JSON) — see
    // docs/journey/2026-05-26-live-test-findings.md for the cmd.exe
    // quoting issue that drove the change. The path is an absolute
    // file under the OS tmpdir; the file itself contains the
    // `{"mcpServers":{}}` JSON.
    const mcpConfigArg = args[args.indexOf('--mcp-config') + 1];
    expect(mcpConfigArg).not.toBe('{"mcpServers":{}}'); // not inline JSON anymore
    expect(mcpConfigArg).toMatch(/empty-mcp\.json$/);
    expect(args).toContain('--strict-mcp-config');
    expect(args).toContain('--model');
    expect(args[args.indexOf('--model') + 1]).toBe('claude-haiku-4-5-20251001');
    // cwd: OS-native tmpdir (not the bash-style `/tmp` which fails
    // to resolve on Windows). Must be an existing directory.
    expect(typeof opts.cwd).toBe('string');
    expect(opts.cwd.length).toBeGreaterThan(0);
    // env -u CLAUDECODE — env passed without CLAUDECODE
    expect('CLAUDECODE' in (opts.env ?? {})).toBe(false);
    // shell:true required so claude.cmd resolves through cmd.exe on
    // Windows (CVE-2024-27980 hardening prevents node from running
    // .cmd files via plain spawn). No-op on Linux/macOS for our
    // metacharacter-free argv.
    expect(opts.shell).toBe(true);

    expect(r.outputText).toContain('mock response body');
  });

  it('compress accepts an alternate claudeBin path (for testing or custom installs)', async () => {
    const spawnCalls = [];
    const { EventEmitter } = await import('node:events');
    const fakeSpawn = (cmd, args, opts) => {
      spawnCalls.push({ cmd });
      const child = new EventEmitter();
      child.stdin = {
        write: () => true,
        end: () => {
          setImmediate(() => {
            child.stdout.emit('data', Buffer.from('ok', 'utf8'));
            child.emit('close', 0);
          });
        },
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      return child;
    };
    const h = new HaikuViaAnthropicApi({ claudeBin: '/custom/claude', spawnFn: fakeSpawn });
    await h.compress({ input: 'x', maxOutputBytes: 100 });
    expect(spawnCalls[0].cmd).toBe('/custom/claude');
  });

  it('compress rejects on non-zero exit code with stderr captured', async () => {
    const { EventEmitter } = await import('node:events');
    const fakeSpawn = () => {
      const child = new EventEmitter();
      child.stdin = {
        write: () => true,
        end: () => {
          setImmediate(() => {
            child.stderr.emit('data', Buffer.from('haiku CLI failed: rate limit\n', 'utf8'));
            child.emit('close', 1);
          });
        },
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      return child;
    };
    const h = new HaikuViaAnthropicApi({ spawnFn: fakeSpawn });
    await expect(h.compress({ input: 'x', maxOutputBytes: 100 })).rejects.toThrow(
      /exit.*1|rate limit/i,
    );
  });
});
