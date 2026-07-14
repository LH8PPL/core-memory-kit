// @doors: 1, 2, 3
// Door 3: the validator describe spawns the real validate-skill-sources.mjs
//   binary to pin its exit code (the in-process tests cover the file-tree +
//   safety-contract reads).
// Door 4 N/A: skill scaffolding emits no NDJSON observability — install reports
//   created/skipped via its result object (Door 1) and the file tree (Door 2).
// Door 5 N/A: no message-queue interaction.

// Tests for Task 69 — skills as the delivery mechanism.
//   69.0 the rewritten memory-write skill is SAFE (routes through `cmk`,
//        never hand-edits memory, no Edit/Write tools, no dev-repo paths).
//   69.1 `cmk install` scaffolds template/.claude/skills/ into the project's
//        .claude/skills/, idempotently + over-mutation-safe.
//   69.2 ONE canonical source (root template); plugin/skills mirrors it;
//        validate-skill-sources.mjs guards drift + the safety contract.
//
// Boundary-test discipline: assert the install() PUBLIC contract (what skill
// files land where, what the result reports, what re-run does) and the skill's
// public safety contract (frontmatter + hard gate). Not internal copy helpers.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
import { install } from '../packages/cli/src/install.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const CANONICAL_SKILL = join(
  REPO_ROOT,
  'template',
  '.claude',
  'skills',
  'memory-write',
  'SKILL.md',
);
const PLUGIN_SKILL = join(REPO_ROOT, 'plugin', 'skills', 'memory-write', 'SKILL.md');
const VALIDATOR = join(REPO_ROOT, 'scripts', 'validate-skill-sources.mjs');

function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * STRICT-parse the frontmatter YAML (the same thing Kiro does). A naive
 * line-split parser can't read a multi-line block scalar (`description: >-`) and
 * silently returns an empty description — and, worse, it tolerates the invalid
 * `: ` colon-space class Kiro rejects. js-yaml is the contract-accurate parser.
 */
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const data = yaml.load(m[1]);
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

describe('Task 69.0 — the memory-write skill is SAFE (canonical source)', () => {
  const text = readFileSync(CANONICAL_SKILL, 'utf8');
  const fm = frontmatter(text);

  it('frontmatter has name + description (the two required Agent-Skills fields)', () => {
    expect(fm.name, 'missing name:').toBe('memory-write');
    const d = fm.description ?? '';
    expect(d.length, 'description must be non-empty').toBeGreaterThan(0);
    // Anthropic Agent-Skills hard limit: description MAX 1024 chars — over it,
    // the skill SILENTLY fails to load (no error). The cut-gate v0.3.1 recall fix
    // nearly shipped a 1340-char description; this guard is why it can't recur.
    expect(d.length, 'description MUST be <= 1024 chars (Agent-Skills hard limit; over = silent non-load)').toBeLessThanOrEqual(1024);
    // Third-person only (the description is injected into the system prompt;
    // first/second person harms skill discovery — Anthropic best-practices).
    expect(d, 'description must be third-person (no "you"/"your"/"I can")').not.toMatch(/\b(you|your|I can|I will)\b/i);
    // No XML angle brackets (platform security rule — rejected at load).
    expect(d, 'description must not contain XML angle brackets').not.toMatch(/<[a-z/]/i);
  });

  it('allowed-tools grants Bash(cmk ...) but NEVER Edit or Write (the F1 leak class)', () => {
    expect(fm['allowed-tools'], 'missing allowed-tools:').toBeTruthy();
    expect(fm['allowed-tools']).toMatch(/Bash\(cmk /);
    expect(fm['allowed-tools'], 'Edit must not be grantable — bypasses Poison_Guard').not.toMatch(
      /\bEdit\b/,
    );
    expect(fm['allowed-tools'], 'Write must not be grantable — bypasses Poison_Guard').not.toMatch(
      /\bWrite\b/,
    );
  });

  it('carries a MUST/NEVER hard gate against hand-editing memory files', () => {
    expect(text).toMatch(/NEVER/);
    expect(text, 'must name context/memory as off-limits to hand-edits').toMatch(
      /context\/memory/,
    );
  });

  it('routes capture through `cmk remember` and removal through `cmk forget`', () => {
    expect(text).toMatch(/cmk remember/);
    expect(text).toMatch(/cmk forget/);
  });

  it('uses no dev-repo internal paths a user would not have', () => {
    expect(text, 'references kit-internal source path').not.toMatch(/packages\/cli\/src/);
  });

  it('uses forward-slash paths only (cross-platform)', () => {
    // No backslash path separators in the body (e.g. context\\memory).
    expect(text).not.toMatch(/context\\/);
  });
});

// Task 75.1 — the memory-search RECALL skill (the read-only sibling of
// memory-write). Modeled on memsearch's memory-recall + claude-mem's
// mem-search (primary sources, D-71); wraps the kit's existing 3-step
// ladder (search → timeline → get) on both surfaces (MCP + CLI).
const RECALL_SKILL = join(REPO_ROOT, 'template', '.claude', 'skills', 'memory-search', 'SKILL.md');
const RECALL_PLUGIN = join(REPO_ROOT, 'plugin', 'skills', 'memory-search', 'SKILL.md');

describe('Task 75.1 — the memory-search recall skill (canonical source)', () => {
  const text = readFileSync(RECALL_SKILL, 'utf8');
  const fm = frontmatter(text);

  it('frontmatter: name, auto-invoke description leads with a GENERAL intent + skip conditions', () => {
    expect(fm.name).toBe('memory-search');
    const d = fm.description ?? '';
    expect(d).toMatch(/skip/i); // skip conditions embedded (memsearch pattern)
    // Agent-Skills hard limits (over = silent non-load) + best-practices.
    expect(d.length, 'description MUST be <= 1024 chars (silent non-load over it)').toBeLessThanOrEqual(1024);
    expect(d, 'third-person only (system-prompt injection)').not.toMatch(/\b(you|your|I can|I will)\b/i);
    expect(d, 'no XML angle brackets').not.toMatch(/<[a-z/]/i);
  });

  // Cut-gate v0.3.1 (recall-trigger fix, evidence-based — D-153): the recall
  // ladder crawled code on structure/roundabout questions. Research across 9 real
  // memory systems (Anthropic skill-creator ground-truth + memsearch, our
  // inspiration) showed: lead with a GENERAL intent principle (semantic matching
  // generalizes from intent, not a phrase-list), make examples illustrative incl.
  // an OBLIQUE one, and reference the per-prompt hint (memsearch's key move —
  // links our existing UserPromptSubmit nudge to the skill). These pins guard the
  // generality, not specific phrasings.
  it('description leads with a GENERAL intent principle + illustrative (incl. oblique) examples + the hint reference', () => {
    const d = (fm.description ?? '').toLowerCase();
    // the generalizer — fires on the intent class, however phrased (not a checklist)
    expect(d).toMatch(/however the question is phrased|regardless of (how|phrasing)/);
    expect(d).toMatch(/illustrative|not a checklist|not exhaustive/);
    // structure/architecture/where-things-live is in-scope (the recall-hole class)
    expect(d).toMatch(/architecture|where things live|how\/where\/why/);
    // an oblique/roundabout example teaches breadth
    expect(d).toMatch(/spread out|how come|remind me/);
    // memsearch's key move: the skill fires on the per-prompt "Memory available" hint
    expect(d).toMatch(/memory available.*hint|hint.*appears/);
    // skip-clause narrowed to genuinely-live code (not all "current code state")
    expect(d).not.toMatch(/skip when the question is purely about current code state/);
    expect(d).toMatch(/uncommitted|just-edited|live code/);
  });

  it('runs forked (context: fork) so raw recall never pollutes the main context', () => {
    expect(fm.context).toBe('fork');
  });

  it('is READ-ONLY: grants search/get/timeline/recent on both surfaces, never write tools', () => {
    const tools = fm['allowed-tools'] ?? '';
    expect(tools).toMatch(/mk_search/);
    expect(tools).toMatch(/mk_get/);
    expect(tools).toMatch(/mk_timeline/);
    expect(tools).toMatch(/Bash\(cmk search /);
    // The safety contract: recall must not be able to mutate memory.
    expect(tools).not.toMatch(/mk_remember|mk_forget|mk_trust/);
    expect(tools).not.toMatch(/cmk remember|cmk forget|cmk trust/);
    expect(tools).not.toMatch(/\bEdit\b|\bWrite\b/);
  });

  it('every command named in the body is granted in allowed-tools (fork can run what it teaches)', () => {
    const tools = fm['allowed-tools'] ?? '';
    const body = text.slice(text.indexOf('---', 4));
    for (const cmd of ['search', 'get', 'timeline', 'recent-activity']) {
      if (body.includes(`cmk ${cmd}`)) {
        expect(tools, `body teaches \`cmk ${cmd}\` but allowed-tools does not grant it`).toMatch(
          new RegExp(`Bash\\(cmk ${cmd} `),
        );
      }
    }
  });

  it('teaches the 3-step filter-before-fetch ladder and a curated-output contract', () => {
    expect(text).toMatch(/mk_search|cmk search/);
    expect(text).toMatch(/mk_timeline|cmk timeline/);
    expect(text).toMatch(/mk_get|cmk get/);
    expect(text).toMatch(/curated/i);
    expect(text, 'must state the read-only boundary').toMatch(/read-only/i);
  });

  it('uses no dev-repo internal paths and forward slashes only', () => {
    expect(text).not.toMatch(/packages\/cli\/src/);
    expect(text).not.toMatch(/context\\/);
  });
});

describe('Task 75.1 — memory-search scaffolds + mirrors like memory-write', () => {
  it('plugin/skills/memory-search/SKILL.md is byte-identical to the canonical source', () => {
    expect(existsSync(RECALL_PLUGIN)).toBe(true);
    expect(sha(RECALL_PLUGIN)).toBe(sha(RECALL_SKILL));
  });

  it('cmk install scaffolds .claude/skills/memory-search/SKILL.md (Door 2)', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'cmk-recall-scaffold-'));
    try {
      const projectRoot = join(sandbox, 'proj');
      mkdirSync(projectRoot, { recursive: true });
      const result = await install({ projectRoot, userTier: join(sandbox, 'user') });
      expect(result.errors).toEqual([]);
      const target = join(projectRoot, '.claude', 'skills', 'memory-search', 'SKILL.md');
      expect(existsSync(target)).toBe(true);
      expect(sha(target)).toBe(sha(RECALL_SKILL));
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});

describe('Task 69.1 — cmk install scaffolds the skill into <project>/.claude/skills/', () => {
  let sandbox;
  let projectRoot;
  let userTier;
  const SCAFFOLDED = ['.claude', 'skills', 'memory-write', 'SKILL.md'];

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-skill-scaffold-'));
    projectRoot = join(sandbox, 'my-project');
    userTier = join(sandbox, 'fake-home', '.core-memory-kit');
    mkdirSync(projectRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('creates .claude/skills/memory-write/SKILL.md on a fresh install (Door 2)', async () => {
    const result = await install({ projectRoot, userTier });
    expect(result.errors).toEqual([]);
    expect(existsSync(join(projectRoot, ...SCAFFOLDED))).toBe(true);
  });

  it('scaffolds the SAFE skill — the project copy is byte-identical to canonical', async () => {
    await install({ projectRoot, userTier });
    expect(sha(join(projectRoot, ...SCAFFOLDED))).toBe(sha(CANONICAL_SKILL));
  });

  it('reports the scaffolded skill in result.created (Door 1)', async () => {
    const result = await install({ projectRoot, userTier });
    const created = result.created.map((p) => String(p).replace(/\\/g, '/'));
    expect(created.some((p) => p.endsWith('.claude/skills/memory-write/SKILL.md'))).toBe(true);
  });

  it('is idempotent — a second install skips the existing skill, no error', async () => {
    await install({ projectRoot, userTier });
    const result = await install({ projectRoot, userTier });
    expect(result.errors).toEqual([]);
    const skipped = result.skipped.map((p) => String(p).replace(/\\/g, '/'));
    expect(skipped.some((p) => p.endsWith('.claude/skills/memory-write/SKILL.md'))).toBe(true);
  });

  it('over-mutation guard — re-install preserves a hand-edited skill', async () => {
    await install({ projectRoot, userTier });
    const target = join(projectRoot, ...SCAFFOLDED);
    writeFileSync(target, '# my own edits\n', 'utf8');
    const edited = sha(target);
    await install({ projectRoot, userTier });
    expect(sha(target), 'install clobbered a user-edited skill').toBe(edited);
  });
});

describe('Task 69.2 — ONE source: plugin mirrors template, validator guards drift', () => {
  it('plugin/skills/memory-write/SKILL.md is byte-identical to the canonical source', () => {
    expect(existsSync(PLUGIN_SKILL)).toBe(true);
    expect(sha(PLUGIN_SKILL)).toBe(sha(CANONICAL_SKILL));
  });

  it('validate-skill-sources.mjs exits 0 against the canonical repo (Door 3)', () => {
    const r = spawnSync(process.execPath, [VALIDATOR], { encoding: 'utf8' });
    expect(r.status, `validator stderr: ${r.stderr}`).toBe(0);
  });
});

describe('Task 69.2 — the validator GATE actually bites (negative paths)', () => {
  let fixture;
  const SAFE_SKILL = readFileSync(CANONICAL_SKILL, 'utf8');

  // Write a skill into BOTH routes of a fixture repo so only the invariant
  // under test fails (drift vs. safety), not an unrelated one.
  function seed(root, { canonical = SAFE_SKILL, plugin = canonical } = {}) {
    const cDir = join(root, 'template', '.claude', 'skills', 'memory-write');
    const pDir = join(root, 'plugin', 'skills', 'memory-write');
    mkdirSync(cDir, { recursive: true });
    mkdirSync(pDir, { recursive: true });
    writeFileSync(join(cDir, 'SKILL.md'), canonical, 'utf8');
    writeFileSync(join(pDir, 'SKILL.md'), plugin, 'utf8');
  }

  function runValidator(root) {
    return spawnSync(process.execPath, [VALIDATOR, root], { encoding: 'utf8' });
  }

  beforeEach(() => {
    fixture = mkdtempSync(join(tmpdir(), 'cmk-skill-validator-'));
  });
  afterEach(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it('exits 0 when the fixture is well-formed (control)', () => {
    seed(fixture);
    expect(runValidator(fixture).status).toBe(0);
  });

  it('FAILS when the plugin copy has drifted from canonical', () => {
    seed(fixture, { plugin: SAFE_SKILL + '\n<!-- sneaky edit -->\n' });
    const r = runValidator(fixture);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/drifted/);
  });

  it('FAILS when allowed-tools grants Edit (the F1 leak class)', () => {
    const unsafe = SAFE_SKILL.replace(
      /allowed-tools:.*/,
      'allowed-tools: Read Edit Write',
    );
    seed(fixture, { canonical: unsafe }); // plugin mirrors it → only safety fails
    const r = runValidator(fixture);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Edit/);
  });

  it('FAILS when the memory-write hand-edit hard gate is missing', () => {
    const gutted = SAFE_SKILL.replace(/NEVER/g, 'sometimes').replace(
      /context\/memory/g,
      'somewhere',
    );
    seed(fixture, { canonical: gutted });
    const r = runValidator(fixture);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/hard gate/);
  });
});
