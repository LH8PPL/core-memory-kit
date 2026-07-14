// @doors: 1, 2, 4
// Door 3 N/A: mutateAgentConfig does no subprocess spawn — it reads + writes a
//   local config file atomically. No external-call boundary at this surface.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50 — `mutateAgentConfig`, the shared per-agent config-write
// primitive (design: cross-agent adapter seam research note 2026-06-20 / D-180).
//
// The seam the whole cross-agent install rests on: ONE tested primitive that
// writes the kit's entry into ANY agent's config file (MCP registration, hook
// entry) WITHOUT clobbering the user's other keys. The D-180 finding: do NOT
// build a per-agent Installer base class; build this primitive + per-agent DATA.
//
// Invariants under test (the claude-mem rigor-drift bug class, inverted into
// guarantees the kit enforces):
//   - touch-only-our-keys: sibling entries are byte-preserved (over-mutation guard)
//   - refuse-to-clobber-on-parse-error: a corrupt target is NEVER overwritten
//   - idempotent: re-applying the same entry reports changed:false, no rewrite
//   - atomic: a write either fully lands or not at all (tmp + rename)
//   - merge vs replace: documented modes
//   - create: a missing target file is created with just our key

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mutateAgentConfig, renameWithRetry } from '../packages/cli/src/mutate-agent-config.mjs';

let sandbox;
let cfgPath;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-mutate-cfg-'));
  cfgPath = join(sandbox, '.kiro', 'settings', 'mcp.json');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

const KIT_ENTRY = {
  command: 'node',
  args: ['/abs/path/to/mcp-server.mjs'],
};

describe('Task 50 — mutateAgentConfig (JSON)', () => {
  describe('create — missing target file', () => {
    it('creates the file (and parent dirs) with ONLY our key', () => {
      const r = mutateAgentConfig({
        path: cfgPath,
        format: 'json',
        keyPath: ['mcpServers', 'core-memory-kit'],
        entry: KIT_ENTRY,
      });

      // Door 1 — Response
      expect(r.action).toBe('created');
      expect(r.changed).toBe(true);
      expect(r.path).toBe(cfgPath);

      // Door 2 — State
      expect(existsSync(cfgPath)).toBe(true);
      const written = JSON.parse(readFileSync(cfgPath, 'utf8'));
      expect(written).toEqual({
        mcpServers: { 'core-memory-kit': KIT_ENTRY },
      });
    });
  });

  describe('touch-only-our-keys — sibling preservation (over-mutation guard)', () => {
    it('seeds N sibling servers, adds ours, asserts the N siblings are untouched', () => {
      // seed a config with 3 unrelated servers + an unrelated top-level key
      const seeded = {
        mcpServers: {
          'some-other-server': { command: 'foo', args: ['a'] },
          'another-server': { command: 'bar' },
          'third-server': { command: 'baz', env: { X: '1' } },
        },
        unrelatedTopLevel: { keepMe: true },
      };
      mkSeed(cfgPath, seeded);

      const r = mutateAgentConfig({
        path: cfgPath,
        format: 'json',
        keyPath: ['mcpServers', 'core-memory-kit'],
        entry: KIT_ENTRY,
      });

      expect(r.action).toBe('updated');
      expect(r.changed).toBe(true);

      const written = JSON.parse(readFileSync(cfgPath, 'utf8'));
      // our key landed
      expect(written.mcpServers['core-memory-kit']).toEqual(KIT_ENTRY);
      // all 3 siblings byte-identical
      expect(written.mcpServers['some-other-server']).toEqual(seeded.mcpServers['some-other-server']);
      expect(written.mcpServers['another-server']).toEqual(seeded.mcpServers['another-server']);
      expect(written.mcpServers['third-server']).toEqual(seeded.mcpServers['third-server']);
      // unrelated top-level key preserved
      expect(written.unrelatedTopLevel).toEqual({ keepMe: true });
      // exactly N+1 servers, nothing dropped or added
      expect(Object.keys(written.mcpServers)).toHaveLength(4);
    });
  });

  describe('refuse-to-clobber-on-parse-error', () => {
    it('returns an error and does NOT overwrite a corrupt target', () => {
      const corrupt = '{ this is not: valid json,,, ';
      mkSeed(cfgPath, corrupt, /* raw */ true);

      const r = mutateAgentConfig({
        path: cfgPath,
        format: 'json',
        keyPath: ['mcpServers', 'core-memory-kit'],
        entry: KIT_ENTRY,
      });

      // Door 1 — Response: error, not a silent recreate
      expect(r.action).toBe('error');
      expect(r.changed).toBe(false);
      expect(r.errorCategory).toBe('config_parse');

      // Door 2 — State: the corrupt bytes are UNTOUCHED (never clobbered)
      expect(readFileSync(cfgPath, 'utf8')).toBe(corrupt);
    });
  });

  describe('idempotent — re-apply the same entry', () => {
    it('reports changed:false and does not rewrite when the entry already matches', () => {
      mkSeed(cfgPath, { mcpServers: { 'core-memory-kit': KIT_ENTRY } });

      const r = mutateAgentConfig({
        path: cfgPath,
        format: 'json',
        keyPath: ['mcpServers', 'core-memory-kit'],
        entry: KIT_ENTRY,
      });

      expect(r.action).toBe('skipped');
      expect(r.changed).toBe(false);
    });
  });

  describe('replace vs merge mode on an existing key', () => {
    it('merge (default) deep-merges into the existing entry', () => {
      mkSeed(cfgPath, {
        mcpServers: { 'core-memory-kit': { command: 'old', extra: 'keep' } },
      });

      const r = mutateAgentConfig({
        path: cfgPath,
        format: 'json',
        keyPath: ['mcpServers', 'core-memory-kit'],
        entry: { command: 'node', args: ['x'] },
        mode: 'merge',
      });

      expect(r.changed).toBe(true);
      const written = JSON.parse(readFileSync(cfgPath, 'utf8'));
      // updated fields applied, pre-existing unrelated field kept
      expect(written.mcpServers['core-memory-kit']).toEqual({
        command: 'node',
        args: ['x'],
        extra: 'keep',
      });
    });

    it('replace overwrites the entry wholesale', () => {
      mkSeed(cfgPath, {
        mcpServers: { 'core-memory-kit': { command: 'old', extra: 'gone' } },
      });

      const r = mutateAgentConfig({
        path: cfgPath,
        format: 'json',
        keyPath: ['mcpServers', 'core-memory-kit'],
        entry: { command: 'node', args: ['x'] },
        mode: 'replace',
      });

      expect(r.changed).toBe(true);
      const written = JSON.parse(readFileSync(cfgPath, 'utf8'));
      expect(written.mcpServers['core-memory-kit']).toEqual({
        command: 'node',
        args: ['x'],
      });
      expect(written.mcpServers['core-memory-kit'].extra).toBeUndefined();
    });
  });

  describe('atomic write — no partial/temp leftovers', () => {
    it('leaves no .tmp sibling after a successful write', () => {
      mkSeed(cfgPath, { mcpServers: {} });
      mutateAgentConfig({
        path: cfgPath,
        format: 'json',
        keyPath: ['mcpServers', 'core-memory-kit'],
        entry: KIT_ENTRY,
      });
      const dir = cfgPath.replace(/[/\\][^/\\]+$/, '');
      const leftovers = readdirSync(dir).filter((f) => f.includes('.tmp'));
      expect(leftovers).toEqual([]);
    });
  });

  describe('renameWithRetry — the Windows-EPERM hardening (the real Task-50 stress bug)', () => {
    // The bug: renameSync(tmp, target) throws EPERM on Windows when the target is
    // briefly locked (AV/indexer/another handle) under parallel FS load — surfaced
    // by the 5x stress run, NOT a flake. Same hazard persona-portability already
    // documents; the fix is a bounded retry. `rename` is injected so the policy is
    // tested without mocking the node:fs namespace.
    const epermErr = () => Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });

    const noSleep = () => {}; // inject a no-op sleep so tests don't actually wait

    it('retries on a transient EPERM and succeeds once the lock clears', () => {
      let calls = 0;
      const flakyRename = () => {
        calls += 1;
        if (calls < 3) throw epermErr(); // locked for the first 2 attempts
        // 3rd attempt succeeds (no-op fake)
      };
      expect(() => renameWithRetry('a', 'b', 5, flakyRename, noSleep)).not.toThrow();
      expect(calls).toBe(3);
    });

    it('backs off between attempts (sleeps when the lock persists)', () => {
      let calls = 0;
      const sleeps = [];
      const alwaysLocked = () => { calls += 1; throw epermErr(); };
      expect(() => renameWithRetry('a', 'b', 4, alwaysLocked, (ms) => sleeps.push(ms))).toThrow(/EPERM/);
      // slept between attempts (one fewer sleep than attempts — no sleep after the last)
      expect(sleeps.length).toBe(3);
      expect(sleeps[0]).toBeLessThan(sleeps[2]); // exponential backoff
    });

    it('gives up after the attempt budget and throws the last transient error', () => {
      let calls = 0;
      const alwaysLocked = () => { calls += 1; throw epermErr(); };
      expect(() => renameWithRetry('a', 'b', 4, alwaysLocked, noSleep)).toThrow(/EPERM/);
      expect(calls).toBe(4); // exactly the budget, no more
    });

    it('does NOT retry-mask a non-transient error (ENOENT reraises immediately)', () => {
      let calls = 0;
      const enoent = () => { calls += 1; throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); };
      expect(() => renameWithRetry('a', 'b', 5, enoent, noSleep)).toThrow(/ENOENT/);
      expect(calls).toBe(1); // no retry on a real error
    });
  });

  describe('input validation', () => {
    it('errors with schema category on an unsupported format', () => {
      const r = mutateAgentConfig({
        path: cfgPath,
        format: 'toml', // deferred for v0.4.0
        keyPath: ['mcpServers', 'core-memory-kit'],
        entry: KIT_ENTRY,
      });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('errors with schema category on an empty keyPath', () => {
      const r = mutateAgentConfig({
        path: cfgPath,
        format: 'json',
        keyPath: [],
        entry: KIT_ENTRY,
      });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });
  });
});

// ── helpers ────────────────────────────────────────────────────────────
import { mkdirSync } from 'node:fs';

function mkSeed(filePath, content, raw = false) {
  const dir = filePath.replace(/[/\\][^/\\]+$/, '');
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, raw ? content : JSON.stringify(content, null, 2), 'utf8');
}
