// @doors: 1, 2, 4
// Door 3 N/A: importClaudeMd is pure-file-IO; no subprocess.
// Door 5 N/A: no message-queue.

// Tests for Task 142 — cmk import-claude-md (D-130).
//
// One command parses an existing rules file (CLAUDE.md / .cursorrules / any
// path) into TYPED granular facts through the kit's safe write path:
// writeFact() gives Poison_Guard screening, home-path sanitization,
// content-addressed dedup, INDEX reindex, and audit — the import never
// re-implements any of those (CLAUDE.md "Shared modules" rule; the D-125
// hand-rolled-provenance bug is the precedent this composition avoids).
//
// Contract under test:
//   importClaudeMd({projectRoot, file?, dryRun?, acceptAll?})
//     → {action, mode?, reason?, proposals, accepted, skipped, rejected,
//        errors, sourcePath, duration_ms}
//   - default file: <projectRoot>/CLAUDE.md
//   - proposals carry {text, line, heading, type, id}
//   - fact type inferred from the nearest heading (user/feedback/reference,
//     default project)
//   - the kit's own managed block + code fences are never proposed
//   - apply requires explicit acceptAll (--yes); dry-run previews

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  mkdtempSync,
  writeFileSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importClaudeMd, parseRulesFile, inferFactType } from '../packages/cli/src/import-claude-md.mjs';
import { runImportClaudeMd } from '../packages/cli/src/subcommands.mjs';
import { readAuditLog } from '../packages/cli/src/audit-log.mjs';
import { install } from '../packages/cli/src/install.mjs';

let sandbox;
let projectRoot;
let userDir;

async function makeFixture() {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-import-claude-md-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
}

function seedRulesFile(content, name = 'CLAUDE.md') {
  const p = join(projectRoot, name);
  writeFileSync(p, content, 'utf8');
  return p;
}

function factDir() {
  return join(projectRoot, 'context', 'memory');
}

function readFactFiles() {
  if (!existsSync(factDir())) return [];
  return readdirSync(factDir())
    .filter((n) => n.endsWith('.md') && n !== 'INDEX.md')
    .map((n) => ({ name: n, text: readFileSync(join(factDir(), n), 'utf8') }));
}

beforeEach(makeFixture);
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

describe('Task 142 — importClaudeMd validation + missing source (Door 1)', () => {
  it('rejects missing projectRoot', async () => {
    const r = await importClaudeMd({});
    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('missing_project_root');
  });

  it('returns completed with reason:no-source when the rules file is absent', async () => {
    // install() scaffolds a CLAUDE.md; remove it to exercise the absent path
    rmSync(join(projectRoot, 'CLAUDE.md'), { force: true });
    const r = await importClaudeMd({ projectRoot });
    expect(r.action).toBe('completed');
    expect(r.reason).toBe('no-source');
    expect(r.accepted).toBe(0);
    expect(r.proposals).toEqual([]);
    expect(r.sourcePath).toContain('CLAUDE.md');
  });
});

describe('Task 142 — parseRulesFile (the typed parse)', () => {
  it('extracts bullets with line numbers and the nearest heading', () => {
    const md = [
      '# My rules',
      '',
      '## Preferences',
      '- terse answers, no filler',
      '',
      '## Engineering rules',
      '- tests first, always',
      '  - nested: boundary tests only',
    ].join('\n');
    const items = parseRulesFile(md);
    expect(items.map((i) => i.text)).toEqual([
      'terse answers, no filler',
      'tests first, always',
      'nested: boundary tests only',
    ]);
    expect(items[0].heading).toBe('Preferences');
    expect(items[0].line).toBe(4);
    expect(items[1].heading).toBe('Engineering rules');
  });

  it('skips code fences and the kit managed block', () => {
    const md = [
      '## Rules',
      '- a real rule worth importing',
      '```bash',
      '- not a rule, a shell example',
      '```',
      '<!-- claude-memory-kit:start v0.3.0 -->',
      '- kit boilerplate that must never import',
      '<!-- claude-memory-kit:end -->',
      '- another real rule after the block',
    ].join('\n');
    const items = parseRulesFile(md);
    expect(items.map((i) => i.text)).toEqual([
      'a real rule worth importing',
      'another real rule after the block',
    ]);
  });

  it('falls back to plain non-empty lines when the file has no list markers (.cursorrules shape)', () => {
    const txt = [
      'Always use TypeScript strict mode.',
      '',
      'Prefer composition over inheritance.',
    ].join('\n');
    const items = parseRulesFile(txt);
    expect(items.map((i) => i.text)).toEqual([
      'Always use TypeScript strict mode.',
      'Prefer composition over inheritance.',
    ]);
  });
});

describe('Task 142 — type inference from heading', () => {
  it('maps preference/profile headings to user, rule headings to feedback, link headings to reference, default project', () => {
    expect(inferFactType('Preferences')).toBe('user');
    expect(inferFactType('About me')).toBe('user');
    expect(inferFactType('Code review rules')).toBe('feedback');
    expect(inferFactType('Working style')).toBe('feedback');
    expect(inferFactType('Links')).toBe('reference');
    expect(inferFactType('External references')).toBe('reference');
    expect(inferFactType('Architecture')).toBe('project');
    expect(inferFactType(null)).toBe('project');
  });
});

describe('Task 142 — dry-run previews without writing (Doors 1+2)', () => {
  it('lists typed proposals; no fact file created, MEMORY.md untouched', async () => {
    seedRulesFile([
      '## Preferences',
      '- the user reads answers on a small screen',
      '## Rules',
      '- never commit without running the linter',
    ].join('\n'));
    const memPath = join(projectRoot, 'context', 'MEMORY.md');
    const mtimeBefore = statSync(memPath).mtimeMs;
    const factsBefore = readFactFiles().length;

    const r = await importClaudeMd({ projectRoot, dryRun: true });
    expect(r.action).toBe('completed');
    expect(r.mode).toBe('dry-run');
    expect(r.proposals.length).toBe(2);
    expect(r.proposals[0].type).toBe('user');
    expect(r.proposals[1].type).toBe('feedback');
    expect(r.accepted).toBe(0);
    // State (Door 2): nothing written
    expect(readFactFiles().length).toBe(factsBefore);
    expect(statSync(memPath).mtimeMs).toBe(mtimeBefore);
  });
});

describe('Task 142 — default mode requires explicit --yes', () => {
  it('returns requires-confirmation and writes nothing', async () => {
    seedRulesFile('- a candidate rule that needs confirmation\n');
    const factsBefore = readFactFiles().length;
    const r = await importClaudeMd({ projectRoot });
    expect(r.mode).toBe('requires-confirmation');
    expect(r.accepted).toBe(0);
    expect(r.proposals.length).toBe(1);
    expect(readFactFiles().length).toBe(factsBefore);
  });
});

describe('Task 142 — apply writes typed facts through writeFact (Doors 1+2+4)', () => {
  it('creates granular fact files with imported provenance + audits import-applied', async () => {
    seedRulesFile([
      '## Preferences',
      '- the user prefers tabs over spaces everywhere',
      '## Rules',
      '- every module must export one public boundary',
    ].join('\n'));
    const r = await importClaudeMd({ projectRoot, acceptAll: true });
    expect(r.action).toBe('completed');
    expect(r.mode).toBe('apply');
    expect(r.accepted).toBe(2);
    expect(r.rejected).toBe(0);

    const facts = readFactFiles();
    const userFact = facts.find((f) => f.name.startsWith('user_'));
    const feedbackFact = facts.find((f) => f.name.startsWith('feedback_'));
    expect(userFact).toBeTruthy();
    expect(feedbackFact).toBeTruthy();
    expect(userFact.text).toContain('write_source: imported');
    expect(userFact.text).toContain('trust: medium');
    expect(userFact.text).toContain('source_file: CLAUDE.md');
    expect(userFact.text).toContain('tabs over spaces');
    // source_line points at the real bullet line in the rules file
    expect(userFact.text).toMatch(/source_line: 2/);

    // INDEX.md is current (writeFact owns the derived view)
    const index = readFileSync(join(factDir(), 'INDEX.md'), 'utf8');
    expect(index).toContain('tabs over spaces');

    // Observability (Door 4): canonical audit entries
    const entries = readAuditLog(join(projectRoot, 'context'));
    const applied = entries.filter((e) => e.reasonCode === 'import-applied');
    expect(applied.length).toBe(2);
    expect(applied[0].action).toBe('import');
    expect(applied[0].tier).toBe('P');
    expect(applied[0].extra?.source).toBe('claude-md');
    expect(applied[0].extra?.write_source).toBe('imported');
    expect(applied[0].extra?.trust).toBe('medium');
  });

  it('honors a custom file argument and records it as source_file', async () => {
    seedRulesFile('Always pin dependency versions in lockfiles.\n', '.cursorrules');
    const r = await importClaudeMd({ projectRoot, file: '.cursorrules', acceptAll: true });
    expect(r.accepted).toBe(1);
    const facts = readFactFiles();
    const fact = facts.find((f) => f.text.includes('pin dependency versions'));
    expect(fact).toBeTruthy();
    expect(fact.text).toContain('source_file: .cursorrules');
  });
});

describe('Task 142 — dedup against existing memory (Doors 1+2+4)', () => {
  it('re-running the import skips everything and leaves first-run facts untouched (over-mutation guard)', async () => {
    seedRulesFile([
      '- rule alpha stays exactly the same',
      '- rule beta stays exactly the same too',
    ].join('\n'));
    const r1 = await importClaudeMd({ projectRoot, acceptAll: true });
    expect(r1.accepted).toBe(2);
    const after1 = readFactFiles();

    const r2 = await importClaudeMd({ projectRoot, acceptAll: true });
    expect(r2.accepted).toBe(0);
    expect(r2.skipped).toBe(2);

    // Over-mutation guard: same files, byte-identical content
    const after2 = readFactFiles();
    expect(after2.length).toBe(after1.length);
    for (const f of after1) {
      const again = after2.find((g) => g.name === f.name);
      expect(again).toBeTruthy();
      expect(again.text).toBe(f.text);
    }
  });

  it('a candidate canonicalize-equal to an existing MEMORY.md bullet is skipped + audited', async () => {
    const memPath = join(projectRoot, 'context', 'MEMORY.md');
    const existing = readFileSync(memPath, 'utf8');
    writeFileSync(memPath, existing + '\n- Shared decision lives here already\n', 'utf8');

    seedRulesFile([
      '- shared decision lives here already',
      '- a genuinely new rule to import',
    ].join('\n'));
    const r = await importClaudeMd({ projectRoot, acceptAll: true });
    expect(r.skipped).toBe(1);
    expect(r.accepted).toBe(1);

    const entries = readAuditLog(join(projectRoot, 'context'));
    const dup = entries.find((e) => e.reasonCode === 'import-skipped-duplicate');
    expect(dup).toBeTruthy();
    expect(dup.action).toBe('import');
    expect(dup.extra?.source).toBe('claude-md');
  });
});

describe('Task 142 — Poison_Guard screens every candidate (Doors 1+2+4)', () => {
  it('a secret-bearing bullet is rejected, logged, and never written; clean bullets still import', async () => {
    seedRulesFile([
      '- deploy key is AKIAABCDEFGHJKLMNPQR',
      '- a perfectly clean rule that should import',
    ].join('\n'));
    const r = await importClaudeMd({ projectRoot, acceptAll: true });
    expect(r.rejected).toBe(1);
    expect(r.accepted).toBe(1);

    // State (Door 2): the secret never lands in any fact file
    for (const f of readFactFiles()) {
      expect(f.text).not.toContain('AKIA');
    }

    // Observability (Door 4): poison-guard.log has the rejection
    const guardLog = join(projectRoot, 'context', '.locks', 'poison-guard.log');
    expect(existsSync(guardLog)).toBe(true);
    const guardEntries = readFileSync(guardLog, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const rejection = guardEntries.find((e) => e.action === 'rejected');
    expect(rejection).toBeTruthy();
    expect(rejection.pattern_id).toBeTruthy();
  });
});

describe('Task 142 — within-run slug collisions de-collide (Door 2)', () => {
  it('two rules sharing a 60-char slug prefix both land as facts', async () => {
    const prefix = 'always run the integration suite against the staging environment before';
    seedRulesFile([
      `- ${prefix} merging anything`,
      `- ${prefix} tagging a release`,
    ].join('\n'));
    const r = await importClaudeMd({ projectRoot, acceptAll: true });
    expect(r.accepted).toBe(2);
    expect(r.errors).toBe(0);
    const bodies = readFactFiles().map((f) => f.text).join('\n');
    expect(bodies).toContain('merging anything');
    expect(bodies).toContain('tagging a release');
  });
});

describe('Task 142 — an absolute file argument never leaks a username into source_file (Door 2)', () => {
  it('source_file is home-path sanitized', async () => {
    const abs = seedRulesFile('- a rule imported via an absolute file path\n', 'my-rules.md');
    const r = await importClaudeMd({ projectRoot, file: abs, acceptAll: true });
    expect(r.accepted).toBe(1);
    const fact = readFactFiles().find((f) => f.text.includes('absolute file path'));
    expect(fact).toBeTruthy();
    const { sanitizeHomePaths } = await import('../packages/cli/src/sanitize.mjs');
    const { parse } = await import('../packages/cli/src/frontmatter.mjs');
    const { frontmatter } = parse(fact.text);
    expect(frontmatter.source_file).toBe(sanitizeHomePaths(abs));
  });
});

describe('Task 142 — home-path sanitization rides writeFact (Door 2)', () => {
  it('absolute home paths in an imported rule land abstracted to ~', async () => {
    seedRulesFile('- config lives at /home/someone/app-config\n');
    const r = await importClaudeMd({ projectRoot, acceptAll: true });
    expect(r.accepted).toBe(1);
    const fact = readFactFiles().find((f) => f.text.includes('app-config'));
    expect(fact).toBeTruthy();
    expect(fact.text).not.toContain('someone');
  });
});

describe('Task 142 (D-125 pin) — imported facts compose with reindex + search', () => {
  it('import then reindexFull succeeds; write_source lands as imported', async () => {
    seedRulesFile('- the staging cluster deploys from the release branch\n');
    const r = await importClaudeMd({ projectRoot, acceptAll: true });
    expect(r.accepted).toBe(1);
    const { reindexFull } = await import('../packages/cli/src/index-rebuild.mjs');
    const { openIndexDb } = await import('../packages/cli/src/index-db.mjs');
    const db = openIndexDb({ projectRoot });
    try {
      expect(() => reindexFull({ projectRoot, userDir, db })).not.toThrow();
      const row = db
        .prepare("SELECT write_source FROM observations WHERE body LIKE '%staging cluster deploys%'")
        .get();
      expect(row).toBeTruthy();
      expect(row.write_source).toBe('imported');
    } finally {
      db.close();
    }
  });
});

describe('Task 142 — runImportClaudeMd CLI wrapper', () => {
  it('applied: end-to-end with --yes, reports counts', async () => {
    seedRulesFile('- the API gateway terminates TLS at the edge\n');
    const out = [];
    const r = await runImportClaudeMd(undefined, {
      projectRoot,
      yes: true,
      log: (m) => out.push(String(m)),
      logError: (m) => out.push(String(m)),
    });
    expect(r.accepted).toBe(1);
    expect(out.join('\n')).toContain('applied 1 fact');
  });

  it('no-source: reports cleanly', async () => {
    rmSync(join(projectRoot, 'CLAUDE.md'), { force: true });
    const out = [];
    const r = await runImportClaudeMd(undefined, {
      projectRoot,
      log: (m) => out.push(String(m)),
      logError: () => {},
    });
    expect(r.reason).toBe('no-source');
    expect(out.join('\n')).toContain('no rules file found');
  });

  it('dry-run: previews typed proposals without applying', async () => {
    seedRulesFile('## Preferences\n- short answers only\n');
    const out = [];
    const r = await runImportClaudeMd(undefined, {
      projectRoot,
      dryRun: true,
      log: (m) => out.push(String(m)),
      logError: () => {},
    });
    expect(r.mode).toBe('dry-run');
    expect(out.join('\n')).toContain('dry-run');
    expect(out.join('\n')).toContain('[user]');
  });

  it('requires-confirmation: nudges toward --yes / --dry-run', async () => {
    seedRulesFile('- confirm me first please\n');
    const out = [];
    const r = await runImportClaudeMd(undefined, {
      projectRoot,
      log: (m) => out.push(String(m)),
      logError: () => {},
    });
    expect(r.mode).toBe('requires-confirmation');
    expect(out.join('\n')).toContain('--yes');
  });

  it('error path: reports + sets exit code via the importFn seam', async () => {
    const errs = [];
    const r = await runImportClaudeMd(undefined, {
      projectRoot,
      log: () => {},
      logError: (m) => errs.push(String(m)),
      importFn: async () => ({ action: 'error', errors: ['boom'] }),
    });
    expect(r.action).toBe('error');
    expect(errs.join('\n')).toContain('boom');
    process.exitCode = 0;
  });
});
