// cmk CLI — top-level commander wiring.
// Task 2 (T-002) ships ONLY stubs. Each subcommand prints a
// "not yet implemented in v0.1.0 milestone N" message identifying
// the tasks.md task that lights it up. Every stub exits 0 — they are
// valid invocations of a CLI that doesn't do anything yet.
//
// Per tasks.md "Engineering discipline":
//   - Deep modules: the subcommand registry is one module here.
//   - Boundary testing: tests assert what `cmk --help` lists, what
//     stubs output, and that exit codes are 0 — NOT how commander
//     happens to format help text internally.

import { Command, Option } from 'commander';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { subcommands } from './subcommands.mjs';

const __filename = fileURLToPath(import.meta.url);
const PKG_ROOT = join(dirname(__filename), '..');

function readPackageVersion() {
  const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

/**
 * Build the Commander program with every documented subcommand wired in
 * as a stub. Exported separately so tests can introspect the program
 * without invoking it.
 */
export function buildProgram() {
  const program = new Command();

  program
    .name('cmk')
    .description(
      'claude-memory-kit — per-project, in-repo memory system for Claude Code. ' +
        'v0.1.0 is in active development; most subcommands print a "not yet implemented" notice.'
    )
    .version(readPackageVersion(), '-V, --version', 'print the cmk version + exit');

  for (const sub of subcommands) {
    const cmd = program.command(sub.name).description(sub.description);

    // Attach positional + flag declarations if the stub declares them.
    if (sub.argSpec) {
      for (const a of sub.argSpec) cmd.argument(a.flags, a.description);
    }
    if (sub.optionSpec) {
      for (const o of sub.optionSpec) cmd.addOption(new Option(o.flags, o.description));
    }
    if (sub.children) {
      for (const child of sub.children) {
        const childCmd = cmd
          .command(child.name)
          .description(child.description)
          .action(() => sub.action(child.name));
        if (child.argSpec) for (const a of child.argSpec) childCmd.argument(a.flags, a.description);
        if (child.optionSpec) for (const o of child.optionSpec) childCmd.addOption(new Option(o.flags, o.description));
      }
    } else {
      cmd.action((...cmdArgs) => sub.action(...cmdArgs));
    }
  }

  return program;
}

/**
 * Parse argv and dispatch. Returns a Promise that resolves after the
 * matched subcommand action returns. Exits 0 on stub success.
 *
 * @param {string[]} argv - typically process.argv
 */
export async function run(argv) {
  const program = buildProgram();
  await program.parseAsync(argv);
}
