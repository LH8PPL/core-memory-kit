// @doors: 1
// Door 2 N/A: pure decision functions — no disk writes, no state mutation.
// Door 3 N/A: no subprocess (the bin wrapper spawns nothing; it reads stdin).
// Door 4 N/A: no NDJSON/audit surface.
// Door 5 N/A: no message-queue.

// Tests for guard-memory.mjs — the memory delete-guardrail (D-192).
//
// The incident: a `cd` that silently failed left `rm -f context/sessions/*
// context/transcripts/*` running in the wrong repo, deleting gitignored
// (non-recoverable) memory. This guardrail blocks a destructive command aimed
// at a memory path BEFORE it runs. Broad by intent: a false block is
// recoverable; a false allow is the data loss we prevent.

import { describe, it, expect } from 'vitest';
import {
  isDestructive,
  touchesMemory,
  decideGuard,
  evaluatePayload,
} from '../packages/cli/src/guard-memory.mjs';

describe('guard-memory — BLOCK a destructive command on a memory path', () => {
  const blocked = [
    'rm -f context/sessions/* context/transcripts/*', // the exact incident
    'rm -rf context/sessions',
    'rm context/MEMORY.md',
    'rm -rf context/memory',
    'rm -rf context.local',
    'Remove-Item context/memory -Recurse',
    'Remove-Item context\\sessions -Force',
    'rm -rf ~/.claude-memory-kit',
    'rm context/DECISIONS.md',
    'git clean -fd context/',
    'git reset --hard && rm -rf context/sessions',
    // B1 (skill-review): an EXEMPT verb in FRONT must NOT launder a chained
    // delete. These all start with echo/grep/cat/git-commit/git-log but chain a
    // real memory delete — every one MUST block (per-segment evaluation).
    'echo "cleaning up" && rm -rf context/sessions',
    'echo x; rm -rf context/transcripts',
    'cat foo && rm -rf context/memory',
    'grep x package.json && rm -rf context/memory',
    'git commit -m "x" && rm -rf context/memory',
    'git log --oneline; rm -rf context/sessions',
    'echo done && Remove-Item context/memory',
    // I1: a delete inside a command substitution in an exempt command's arg.
    'git commit -m "$(rm -rf context/memory)"',
    'echo `rm -rf context/sessions`',
    // I2: delete mechanisms with NO `rm` verb.
    'find context/memory -delete',
    'find context/memory -type f -delete',
    'truncate -s0 context/MEMORY.md',
    '> context/MEMORY.md',
    ': > context/MEMORY.md',
  ];
  for (const cmd of blocked) {
    it(`blocks: ${cmd}`, () => {
      expect(decideGuard(cmd).block).toBe(true);
      expect(decideGuard(cmd).reason).toMatch(/delete-guardrail/);
    });
  }
});

describe('guard-memory — ALLOW (no false positives)', () => {
  const allowed = [
    'rm lh8ppl-claude-memory-kit-0.4.0.tgz', // a tarball (not a memory path)
    'rm -rf node_modules',
    'rm -rf /c/tmp/popup-test', // a throwaway temp dir
    'rm contextual.md', // the WORD "context" mid-word, not the dir
    "echo 'building context for the test'", // "context" as prose
    'grep -rn context packages/cli/src', // searching, not deleting
    'ls context/sessions/', // reading memory is fine
    'cat context/MEMORY.md', // reading a memory file is fine
    'git status',
    'npm test',
    'node scripts/validate-references.mjs',
    // EXEMPT: destructive verbs + memory tokens appear in the TEXT but nothing
    // is deleted (a commit message / echo / grep ABOUT a delete). The local
    // guardrail blocked its own feature commit on this — the false-positive fix.
    'git commit -m "remove rm from context/sessions cleanup"',
    'git log --oneline context/MEMORY.md',
    "echo 'we ran rm -rf context/memory by accident'",
    'grep -rn "rm -rf context" docs/',
  ];
  for (const cmd of allowed) {
    it(`allows: ${cmd}`, () => {
      expect(decideGuard(cmd).block).toBe(false);
    });
  }
});

describe('guard-memory — predicate units', () => {
  it('isDestructive detects the delete verbs, not read verbs', () => {
    expect(isDestructive('rm x')).toBe(true);
    expect(isDestructive('Remove-Item x')).toBe(true);
    expect(isDestructive('git clean -fd .')).toBe(true);
    expect(isDestructive('cat x')).toBe(false);
    expect(isDestructive('ls x')).toBe(false);
  });
  it('touchesMemory needs a path-ish boundary (no mid-word false positive)', () => {
    expect(touchesMemory('rm context/sessions')).toBe(true);
    expect(touchesMemory('rm ./context')).toBe(true);
    expect(touchesMemory('git clean -fd context')).toBe(true);
    expect(touchesMemory('rm contextual.md')).toBe(false); // "context" mid-word
    expect(touchesMemory('echo context here')).toBe(true); // a bare token — destructive gate still guards
    expect(touchesMemory('rm node_modules')).toBe(false);
  });
});

describe('guard-memory — evaluatePayload (the PreToolUse contract)', () => {
  it('blocks a Bash payload deleting memory', () => {
    const r = evaluatePayload({ tool_name: 'Bash', tool_input: { command: 'rm -rf context/memory' } });
    expect(r.block).toBe(true);
  });
  it('blocks a PowerShell payload deleting memory', () => {
    const r = evaluatePayload({ tool_name: 'PowerShell', tool_input: { command: 'Remove-Item context\\sessions' } });
    expect(r.block).toBe(true);
  });
  it('blocks a Kiro execute_bash payload deleting memory (same stdin shape as Claude Code, verified from oh-my-kiro/vibekit)', () => {
    const r = evaluatePayload({ tool_name: 'execute_bash', tool_input: { command: 'rm -rf context/sessions' } });
    expect(r.block).toBe(true);
  });
  it('ignores non-shell tools (Read/Edit/Write never blocked)', () => {
    expect(evaluatePayload({ tool_name: 'Read', tool_input: { file_path: 'context/MEMORY.md' } }).block).toBe(false);
    expect(evaluatePayload({ tool_name: 'Edit', tool_input: {} }).block).toBe(false);
  });
  it('fail-open on a malformed / empty payload (a broken guard must not wedge)', () => {
    expect(evaluatePayload({}).block).toBe(false);
    expect(evaluatePayload({ tool_name: 'Bash' }).block).toBe(false);
    expect(evaluatePayload({ tool_name: 'Bash', tool_input: { command: '' } }).block).toBe(false);
    expect(evaluatePayload(null).block).toBe(false);
  });
});
