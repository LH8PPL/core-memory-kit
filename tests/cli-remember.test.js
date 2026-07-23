// @doors: 1, 2, 3
// Door 4 N/A: cmk remember surfaces its result on stdout; the audit-log NDJSON
//   entry is memoryWrite's responsibility, covered by cli-memory-write.test.js.
// Door 5 N/A: no message queue.

// Tests for `cmk remember` — the explicit durable-capture CLI (write-path fix
// #0b/#1). It routes through memoryWrite (Poison_Guard + home-path
// abstraction + conflict detection), so the agent never freehand-writes
// malformed/leaky fact files. Real-binary integration (Door 3) is the point:
// the self-test bug was that the *agent's own writes* bypassed the safe path.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../packages/cli/src/install.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const CMK_BIN = join(REPO_ROOT, 'packages', 'cli', 'bin', 'cmk.mjs');

let sandbox;
let projectRoot;
let userDir;

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-remember-test-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function cmk(args, input) {
  return spawnSync(process.execPath, [CMK_BIN, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    input,
    env: { ...process.env, MEMORY_KIT_USER_DIR: userDir },
  });
}

function readMemory() {
  return readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
}

describe('cmk remember — durable capture CLI', () => {
  it('saves a fact to MEMORY.md and reports success (Door 1 + 2)', () => {
    const r = cmk(['remember', 'We', 'standardized', 'on', 'pnpm']);
    expect(r.status ?? 0).toBe(0);
    expect(r.stdout).toMatch(/saved to P\/MEMORY\.md/);
    expect(readMemory()).toContain('We standardized on pnpm');
  });

  it('--project <dir> writes to that project, NOT the cwd (the kiro-cli explicit path)', () => {
    // kiro-cli runs `cmk remember "..." --project "<abs>"` (no `cd` — a cd prefix
    // breaks the trust allowlist). The flag must steer the write to the named
    // project regardless of the launch cwd. Run from the SANDBOX (not projectRoot)
    // and assert the fact lands under projectRoot via --project.
    const r = spawnSync(process.execPath, [CMK_BIN, 'remember', 'Routed via --project', '--project', projectRoot], {
      cwd: sandbox, // NOT the project — only --project should route it
      encoding: 'utf8',
      env: { ...process.env, MEMORY_KIT_USER_DIR: userDir },
    });
    expect(r.status ?? 0).toBe(0);
    expect(readMemory()).toContain('Routed via --project'); // landed under projectRoot
    // and NOT under the cwd (sandbox) — no stray context/ created there
    expect(existsSync(join(sandbox, 'context', 'MEMORY.md'))).toBe(false);
  });

  it('abstracts a home-dir path; the username never lands in committed MEMORY.md (#1)', () => {
    const r = cmk([
      'remember',
      'venv at C:\\Users\\someuser\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
    ]);
    expect(r.status ?? 0).toBe(0);
    const mem = readMemory();
    expect(mem).not.toContain('someuser');
    expect(mem).toContain('~\\AppData\\Local\\Programs\\Python\\Python313\\python.exe');
  });

  it('captured fact is then findable via cmk search (remember → search integration)', () => {
    expect(cmk(['remember', 'we deploy with', 'kamal', 'to hetzner']).status ?? 0).toBe(0);
    const s = cmk(['search', 'kamal']);
    expect(s.status ?? 0).toBe(0);
    expect(s.stdout).toContain('kamal');
    expect(s.stdout).not.toContain('no results');
  });

  it('Poison_Guard: a secret is rejected (exit 2) and not written', () => {
    const r = cmk([
      'remember',
      // Allowlisted poison-guard fixture (also in .gitleaks.toml).
      'token ghp_1234567890abcdefghij1234567890abcdef12',
    ]);
    expect(r.status).toBe(2);
    expect(readMemory()).not.toContain('ghp_1234567890');
  });

  it('--tier U captures to the project tier (P) with a promote note (not an error)', () => {
    const r = cmk(['remember', '--tier', 'U', 'cross project pref']);
    expect(r.status).toBe(0); // captured, not refused (D-102 / Task 121)
    expect(`${r.stdout}${r.stderr}`).toMatch(/project tier \(P\)|promote/);
    expect(readMemory()).toContain('cross project pref'); // landed at P
  });

  // Task 63 (F1) — Door 3: the CLI arg-parser must actually wire --why/--how
  // through commander to runRememberRich. The unit tests call runRememberRich
  // directly; only this real-binary path proves the registry optionSpec flags
  // reach it (and that rich mode writes a FACT FILE, not a MEMORY.md bullet).
  function factFiles() {
    return readdirSync(join(projectRoot, 'context', 'memory')).filter(
      (f) => f.endsWith('.md') && f !== 'INDEX.md' && f !== 'MAP.md',
    );
  }

  it('rich mode (--why/--how) writes a granular fact file, not a MEMORY.md bullet', () => {
    const r = cmk([
      'remember',
      'FastAPI is the delivery layer; logic lives in services',
      '--type', 'feedback',
      '--title', 'layered-backend',
      '--why', 'pay the structure cost up front',
      '--how', 'thin routes; push logic into app/services',
    ]);
    expect(r.status ?? 0).toBe(0);
    expect(r.stdout).toMatch(/saved rich fact/);

    const files = factFiles();
    expect(files).toContain('feedback_layered-backend.md');
    const content = readFileSync(
      join(projectRoot, 'context', 'memory', 'feedback_layered-backend.md'),
      'utf8',
    );
    expect(content).toContain('**Why:** pay the structure cost up front');
    expect(content).toContain('**How to apply:** thin routes; push logic into app/services');
    // Routing boundary: rich capture must NOT also drop a terse MEMORY.md bullet.
    expect(readMemory()).not.toContain('FastAPI is the delivery layer');
  });

  it('--links lands as related cross-links in the fact frontmatter', () => {
    const r = cmk([
      'remember', 'use ruff for lint + format',
      '--title', 'ruff-tooling',
      '--why', 'one tool replaces black+isort+flake8',
      '--links', 'python-tooling, uv-package-manager',
    ]);
    expect(r.status ?? 0).toBe(0);
    const content = readFileSync(
      join(projectRoot, 'context', 'memory', 'feedback_ruff-tooling.md'),
      'utf8',
    );
    expect(content).toMatch(/related:/);
    expect(content).toContain('python-tooling');
    expect(content).toContain('uv-package-manager');
  });

  // Task 108.2 (108a) — `cmk remember --from-file <json>`: the D-81 fix.
  // D-81: `cmk remember --how "...`code`..."` THROUGH bash gets its backtick
  // spans eaten by command-substitution → silent corruption (proven in the
  // cut-gate5 run). The fix: pass the fact as a JSON FILE; the content never
  // touches a shell command line, so backticks / $() / quotes / newlines survive
  // byte-perfect. Real-binary path (Door 3) proves the optionSpec wires it AND
  // that writeFact persists the content intact (Door 2).
  it('--from-file: rich content with backticks/$()/quotes/newlines lands byte-perfect (D-81)', () => {
    const richHow =
      'create it (`python -m venv .venv`), then `.\\.venv\\Scripts\\pip install`;\n' +
      'never $(system pip) or "global" installs';
    const fact = {
      text: 'Always use .venv for Python packages',
      type: 'feedback',
      title: 'use-venv-shellsafe',
      why: 'isolate from system Python',
      how: richHow,
    };
    const factPath = join(projectRoot, 'fact.json');
    writeFileSync(factPath, JSON.stringify(fact), 'utf8');

    const r = cmk(['remember', '--from-file', factPath]);
    expect(r.status ?? 0).toBe(0);
    expect(r.stdout).toMatch(/saved rich fact/);

    const content = readFileSync(
      join(projectRoot, 'context', 'memory', 'feedback_use-venv-shellsafe.md'),
      'utf8',
    );
    // The exact backtick spans bash command-substitution destroyed (D-81) survive:
    expect(content).toContain('`python -m venv .venv`');
    expect(content).toContain('`.\\.venv\\Scripts\\pip install`');
    expect(content).toContain('$(system pip)');
    expect(content).toContain('**Why:** isolate from system Python');
  });

  it('--from-file: malformed JSON fails loudly (exit 2), writes nothing (no silent corruption)', () => {
    const factPath = join(projectRoot, 'bad.json');
    writeFileSync(factPath, '{ this is not: json', 'utf8');
    const r = cmk(['remember', '--from-file', factPath]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/json|parse|--from-file/i);
    expect(factFiles()).toHaveLength(0);
  });

  // Task 108.2 (108a) — `--json`: the same structured-JSON channel, read from
  // stdin (pipe-safe). Same off-shell guarantee as --from-file.
  it('--json: reads the structured fact from stdin; backtick content survives', () => {
    const fact = {
      text: 'Run ruff before committing',
      type: 'feedback',
      title: 'ruff-precommit-stdin',
      why: 'catch lint before it lands',
      how: 'run ruff check on `git diff --name-only` and never $(skip it)',
    };
    const r = cmk(['remember', '--json'], JSON.stringify(fact));
    expect(r.status ?? 0).toBe(0);
    expect(r.stdout).toMatch(/saved rich fact/);
    const content = readFileSync(
      join(projectRoot, 'context', 'memory', 'feedback_ruff-precommit-stdin.md'),
      'utf8',
    );
    expect(content).toContain('`git diff --name-only`');
    expect(content).toContain('$(skip it)');
    expect(content).toContain('**Why:** catch lint before it lands');
  });

  // Review I1 — provenance lock: a crafted JSON must NOT be able to forge the
  // write_source / source_file (the user-explicit provenance contract). Fields
  // are allowlisted; provenance is hardcoded in runRememberRich.
  it('--from-file: crafted JSON cannot forge provenance (write_source stays user-explicit)', () => {
    const fact = {
      text: 'a normal fact',
      type: 'feedback',
      title: 'provenance-lock',
      why: 'x',
      writeSource: 'auto-extract',
      write_source: 'auto-extract',
      sourceFile: '/etc/passwd',
      source_file: '/etc/passwd',
    };
    const factPath = join(projectRoot, 'evil.json');
    writeFileSync(factPath, JSON.stringify(fact), 'utf8');
    const r = cmk(['remember', '--from-file', factPath]);
    expect(r.status ?? 0).toBe(0);
    const content = readFileSync(
      join(projectRoot, 'context', 'memory', 'feedback_provenance-lock.md'),
      'utf8',
    );
    expect(content).toMatch(/write_source: user-explicit/);
    expect(content).not.toContain('auto-extract');
    expect(content).not.toContain('/etc/passwd');
  });

  // Review I2 — size cap: an oversized fact is rejected (Poison_Guard DoS guard,
  // matching mk_remember's bounded input).
  it('--from-file: an oversized fact is rejected (exit 2), writes nothing', () => {
    const fact = { text: 'big', why: 'x'.repeat(70 * 1024), type: 'feedback', title: 'too-big' };
    const factPath = join(projectRoot, 'huge.json');
    writeFileSync(factPath, JSON.stringify(fact), 'utf8');
    const r = cmk(['remember', '--from-file', factPath]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/too large|size|limit|KB/i);
    expect(factFiles()).toHaveLength(0);
  });

  // Review M1 — bare `cmk remember` (no text, no channel) gives a clear usage error.
  it('bare `cmk remember` (no text, no channel) → clear usage error (exit 2)', () => {
    const r = cmk(['remember']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/provide|--from-file|--json/i);
    expect(factFiles()).toHaveLength(0);
  });

  // Review M2 — `--from-file`/`--json` are self-contained: rich flags passed
  // alongside are ignored, but say so (don't drop them silently).
  it('--from-file with rich flags warns they are ignored; the JSON fact wins', () => {
    const fact = { text: 'a fact', type: 'feedback', title: 'self-contained', why: 'from the json' };
    const factPath = join(projectRoot, 'sc.json');
    writeFileSync(factPath, JSON.stringify(fact), 'utf8');
    const r = cmk(['remember', '--from-file', factPath, '--why', 'from the flag (ignored)']);
    expect(r.status ?? 0).toBe(0); // a warning, not a failure
    expect(r.stderr).toMatch(/self-contained|ignor/i);
    const content = readFileSync(
      join(projectRoot, 'context', 'memory', 'feedback_self-contained.md'),
      'utf8',
    );
    expect(content).toContain('**Why:** from the json'); // JSON wins
    expect(content).not.toContain('from the flag'); // flag ignored
  });

  // Review M2 — links as a JSON array land as related cross-links.
  it('--from-file: links as a JSON array land as related cross-links', () => {
    const fact = {
      text: 'use ruff for lint + format',
      type: 'feedback',
      title: 'ruff-links',
      why: 'one tool',
      links: ['python-tooling', 'uv-package-manager'],
    };
    const factPath = join(projectRoot, 'links.json');
    writeFileSync(factPath, JSON.stringify(fact), 'utf8');
    const r = cmk(['remember', '--from-file', factPath]);
    expect(r.status ?? 0).toBe(0);
    const content = readFileSync(
      join(projectRoot, 'context', 'memory', 'feedback_ruff-links.md'),
      'utf8',
    );
    expect(content).toMatch(/related:/);
    expect(content).toContain('python-tooling');
    expect(content).toContain('uv-package-manager');
  });
});
