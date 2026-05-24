// Tests for Task 2 — cmk Node CLI scaffold (T-002).
// Per tasks.md 2.4:
//   - Test `cmk --help` output contains every documented subcommand
//   - Test every subcommand stub exits 0
//   - Test stub message includes the literal "not yet implemented" string
//   - Test `npm install -g` smoke (CI): `cmk version` runs from a clean
//     shell after global install
//
// Boundary-test discipline (per tasks.md "Engineering discipline"):
//   - Test the CLI's PUBLIC contract: what subcommands exist, what they
//     output, what exit codes they return.
//   - Do NOT test how commander internally formats help text — that's
//     an implementation detail that may change. We assert that the
//     subcommand NAME appears in the help output, not that it appears
//     at a particular column or with a particular separator.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { subcommands, subcommandNames, STUB_NOTICE_PREFIX } from '../packages/cli/src/subcommands.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const CMK_BIN = join(REPO_ROOT, 'packages', 'cli', 'bin', 'cmk.mjs');

/**
 * Invoke `cmk` with the given args. Returns { status, stdout, stderr }.
 * Always shells through `node` to dodge the bin-shim-on-Windows quirk.
 */
function runCmk(args, { input } = {}) {
  return spawnSync(process.execPath, [CMK_BIN, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    input,
  });
}

/**
 * Verbs NOT expected to print the standard "not yet implemented" notice.
 * Either real implementations (replaced their stub in a later task) or
 * special-cased actions.
 *
 *   version   → prints version string (Task 2, special case)
 *   install   → real implementation as of Task 3; tested by tests/cli-install.test.js
 *               against tempdir sandboxes (NEVER from this test, which would
 *               write into the repo's cwd and damage the kit)
 *   uninstall → real implementation as of Task 4; tested by tests/cli-claude-md.test.js
 *               against tempdir sandboxes (same rationale as install)
 *   reindex   → real implementation as of Task 8 (markdown INDEX walker; SQLite
 *               cache deferred to Task 29); tested by tests/cli-reindex.test.js
 *               against tempdir sandboxes — never invoked from the repo cwd here
 *               because it would create context/memory/INDEX.md inside the kit
 *   forget    → real implementation as of Task 9 (tombstone + scratchpad scrub);
 *               tested by tests/cli-forget.test.js against tempdir sandboxes —
 *               never invoked from the repo cwd here because the v0.1 CLI requires
 *               --yes anyway and we don't want to maintain an "error-exits-2"
 *               leaf in the scaffold's exit-0 loop
 */
const NON_STUB_VERBS = new Set(['version', 'install', 'uninstall', 'reindex', 'forget', 'init-user-tier', 'trust']);

describe('Task 2 — cmk CLI scaffold', () => {
  describe('Package layout', () => {
    it('packages/cli/package.json exists and declares the cmk bin', () => {
      const pkgPath = join(REPO_ROOT, 'packages', 'cli', 'package.json');
      expect(existsSync(pkgPath)).toBe(true);
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      expect(pkg.name).toBe('@claude-memory-kit/cli');
      expect(pkg.bin).toBeDefined();
      expect(pkg.bin.cmk).toBeTruthy();
    });

    it('the bin shim exists and is non-empty', () => {
      expect(existsSync(CMK_BIN)).toBe(true);
      expect(statSync(CMK_BIN).size).toBeGreaterThan(0);
    });

    it('the bin shim has a Node shebang', () => {
      const first = readFileSync(CMK_BIN, 'utf8').split('\n')[0];
      expect(first).toMatch(/^#!.*node/);
    });
  });

  describe('--help and --version', () => {
    it('--help exits 0', () => {
      const r = runCmk(['--help']);
      expect(r.status).toBe(0);
    });

    it('--version exits 0 and prints a semver-shaped string', () => {
      const r = runCmk(['--version']);
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/);
    });

    it('--help output lists every registered subcommand by name', () => {
      const r = runCmk(['--help']);
      expect(r.status).toBe(0);
      for (const name of subcommandNames) {
        expect(r.stdout, `--help output missing subcommand: ${name}`).toContain(name);
      }
    });

    it('--help output is consistent across both -h and --help', () => {
      const longForm = runCmk(['--help']);
      const shortForm = runCmk(['-h']);
      expect(longForm.status).toBe(0);
      expect(shortForm.status).toBe(0);
      // Same set of subcommand names appear in both
      for (const name of subcommandNames) {
        expect(shortForm.stdout).toContain(name);
      }
    });
  });

  describe('Leaf subcommand stubs (no children)', () => {
    // A "leaf" verb is one that runs an action directly. We test that
    // `cmk <verb>` exits 0 and emits the documented notice. Verbs with
    // children are tested below — invoking the parent without a child
    // correctly prints help + exits non-zero per commander's UX.

    const leaves = subcommands.filter(
      (s) => !s.children && !NON_STUB_VERBS.has(s.name)
    );

    for (const sub of leaves) {
      it(`\`cmk ${sub.name}\` exits 0`, () => {
        const placeholders = (sub.argSpec || []).map((a) =>
          a.flags.includes('...') ? 'foo' : 'placeholder'
        );
        const r = runCmk([sub.name, ...placeholders]);
        expect(
          r.status,
          `cmk ${sub.name} exited ${r.status}; stdout: ${r.stdout}; stderr: ${r.stderr}`
        ).toBe(0);
      });

      it(`\`cmk ${sub.name}\` output contains the documented notice`, () => {
        const placeholders = (sub.argSpec || []).map((a) =>
          a.flags.includes('...') ? 'foo' : 'placeholder'
        );
        const r = runCmk([sub.name, ...placeholders]);
        expect(r.stdout).toContain(STUB_NOTICE_PREFIX);
      });
    }
  });

  describe('Subcommand groups (parents with children)', () => {
    const groups = subcommands.filter((s) => s.children && s.children.length > 0);

    for (const group of groups) {
      it(`\`cmk ${group.name}\` (no child) prints help and exits non-zero`, () => {
        // Commander's documented behavior: a command with sub-verbs but
        // invoked without one prints help on stderr and exits non-zero.
        // This is the UX we want — disambiguates which child the user meant.
        const r = runCmk([group.name]);
        expect(r.status).not.toBe(0);
        expect(r.stdout + r.stderr).toMatch(/help|Usage/i);
      });

      it(`\`cmk ${group.name} --help\` lists every child sub-verb`, () => {
        const r = runCmk([group.name, '--help']);
        expect(r.status).toBe(0);
        for (const child of group.children) {
          const headWord = child.name.split(' ')[0].replace(/[<[].*/, '');
          expect(
            r.stdout + r.stderr,
            `${group.name} --help missing child: ${headWord}`
          ).toContain(headWord);
        }
      });

      for (const child of group.children) {
        const headWord = child.name.split(' ')[0].replace(/[<[].*/, '');
        it(`\`cmk ${group.name} ${headWord}\` exits 0 and emits the notice`, () => {
          const placeholders = (child.argSpec || []).map((a) =>
            a.flags.includes('...') ? 'foo' : 'placeholder'
          );
          const r = runCmk([group.name, headWord, ...placeholders]);
          expect(
            r.status,
            `cmk ${group.name} ${headWord} exited ${r.status}; stdout: ${r.stdout}; stderr: ${r.stderr}`
          ).toBe(0);
          expect(r.stdout).toContain(STUB_NOTICE_PREFIX);
        });
      }
    }
  });

  describe('Unknown subcommand handling', () => {
    it('exits non-zero on an unknown subcommand and mentions the bad name', () => {
      const r = runCmk(['totally-fake-verb-that-should-not-exist']);
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toContain('totally-fake-verb-that-should-not-exist');
    });
  });
});
