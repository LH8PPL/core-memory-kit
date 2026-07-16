// @doors: 1, 2
// Door 3 N/A: in-process install()/runDoctor() — the real-binary install path
//   is covered by the standing install/doctor suites; this file pins the
//   refresh CONTRACT at the module boundary.
// Door 4 N/A: no message queue.
// Door 5 N/A: install reports via its return value (created/skipped/refreshed),
//   not an NDJSON log; asserted at Door 1.

// Tests for Task 230 (D-343) — `cmk install` refreshes KIT-OWNED scaffold.
//
// The bug: installTier skipped ANY existing file. That rule was written for
// memory safety ("if MEMORY.md already has user edits, skip it") — correct for
// user data — but the same blanket skip applied to `.claude/skills/`, which is
// kit-authored code. A kit update that changed a shipped skill NEVER propagated
// to an existing install (proven live in the v0.5.4 rename: the template got
// the new `[core-memory-kit]` recall trigger; every update-in-place install
// kept the dead `[claude-memory-kit]` one, and HC-9 stayed green over it).
//
// The contract pinned here (the user's requirement, verbatim intent: "if I
// change anything in the next versions and re-install on a project, I want it
// to update to the current version — the only thing it should not overwrite
// is the memory"):
//   - kit-owned dirs (.claude/skills/) REFRESH to the template on install;
//   - user-data tiers (context/, context.local/, user tier) keep
//     skip-if-exists — a user's memory is NEVER overwritten;
//   - refresh is idempotent (byte-identical content is not rewritten);
//   - HC-9 detects a stale kit-owned scaffold file even when install has not
//     been re-run (content-compare vs the installed binary's template).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../packages/cli/src/install.mjs';
import { runDoctor } from '../packages/cli/src/doctor.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const TEMPLATE_SKILL = join(
  REPO_ROOT, 'template', '.claude', 'skills', 'memory-search', 'SKILL.md',
);

let sandbox;
let projectRoot;
let userDir;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-install-refresh-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

const skillPath = () =>
  join(projectRoot, '.claude', 'skills', 'memory-search', 'SKILL.md');
const memoryMdPath = () => join(projectRoot, 'context', 'MEMORY.md');

describe('kit-owned scaffold REFRESHES on re-install (the D-343 update-in-place case)', () => {
  it('a stale scaffolded skill is refreshed to the template by a re-run install', async () => {
    await install({ projectRoot, userTier: userDir });
    const templateContent = readFileSync(TEMPLATE_SKILL, 'utf8');
    expect(readFileSync(skillPath(), 'utf8')).toBe(templateContent);

    // Staleify — simulate the pre-rename skill an update-in-place user has.
    const stale = templateContent
      .replaceAll('[core-memory-kit] Memory available', '[claude-memory-kit] Memory available')
      + '\n<!-- STALE-MARKER -->\n';
    writeFileSync(skillPath(), stale);

    const r = await install({ projectRoot, userTier: userDir });

    const after = readFileSync(skillPath(), 'utf8');
    expect(after).toBe(templateContent); // refreshed, stale marker gone
    expect(after).not.toContain('STALE-MARKER');
    // The refresh is REPORTED, not silent.
    expect((r.refreshed ?? []).some((p) => p.endsWith('SKILL.md'))).toBe(true);
  });

  it('refresh is idempotent — a byte-identical skill is NOT rewritten (no refreshed entry)', async () => {
    await install({ projectRoot, userTier: userDir });
    const r = await install({ projectRoot, userTier: userDir });
    expect(r.refreshed ?? []).toEqual([]);
  });

  it('fresh install still reports skills under created (contract unchanged for the first run)', async () => {
    const r = await install({ projectRoot, userTier: userDir });
    expect(r.created.some((p) => p.endsWith('SKILL.md'))).toBe(true);
    expect(r.refreshed ?? []).toEqual([]);
  });
});

describe('user-data tiers are NEVER overwritten (the over-mutation guard — the rule the old skip existed for)', () => {
  it('a user-edited MEMORY.md and a user fact file survive a re-install byte-identical', async () => {
    await install({ projectRoot, userTier: userDir });

    // The user's memory: an edited scratchpad + a fact file.
    const edited = readFileSync(memoryMdPath(), 'utf8')
      + '\n- (P-TESTFACT) a durable fact the user added by hand\n';
    writeFileSync(memoryMdPath(), edited);
    const factPath = join(projectRoot, 'context', 'memory', 'project_user-fact.md');
    writeFileSync(factPath, '---\nid: P-TESTFACT\n---\n\nthe user fact body\n');
    const userMdPath = join(userDir, 'USER.md');
    const editedUser = readFileSync(userMdPath, 'utf8') + '\n- a persona line the user added\n';
    writeFileSync(userMdPath, editedUser);

    await install({ projectRoot, userTier: userDir });

    expect(readFileSync(memoryMdPath(), 'utf8')).toBe(edited);
    expect(readFileSync(factPath, 'utf8')).toContain('the user fact body');
    expect(readFileSync(userMdPath, 'utf8')).toBe(editedUser);
  });
});

describe('HC-9 detects a stale kit-owned scaffold even when install has NOT re-run (the silent-drift half)', () => {
  it('HC-9 fails on a drifted skill, names it, and recovers to pass after cmk install', async () => {
    await install({ projectRoot, userTier: userDir });

    // Drift the skill without touching the CLAUDE.md marker — the exact
    // false-green D-343 hit: marker matches the binary, skill is stale.
    const stale = readFileSync(skillPath(), 'utf8').replaceAll(
      '[core-memory-kit] Memory available',
      '[claude-memory-kit] Memory available',
    );
    writeFileSync(skillPath(), stale);

    const before = await runDoctor({ projectRoot, userDir });
    const hc9Before = before.checks.find((c) => c.id === 'HC-9');
    expect(hc9Before.status).toBe('fail');
    expect(hc9Before.message).toContain('SKILL.md');

    await install({ projectRoot, userTier: userDir });

    const after = await runDoctor({ projectRoot, userDir });
    const hc9After = after.checks.find((c) => c.id === 'HC-9');
    expect(hc9After.status).toBe('pass');
  });

  it('HC-9 stays pass on a project with no skills dir (a Kiro-style install is not drift)', async () => {
    await install({ projectRoot, userTier: userDir, skipClaudeFiles: true });
    expect(existsSync(skillPath())).toBe(false);
    const r = await runDoctor({ projectRoot, userDir });
    const hc9 = r.checks.find((c) => c.id === 'HC-9');
    // No CLAUDE.md marker either on a skipClaudeFiles install — HC-9's
    // existing not-installed semantics apply; the point is: no crash, and no
    // skill-drift fail on a project that legitimately has no skills.
    expect(hc9.message ?? '').not.toContain('SKILL.md');
  });
});

describe('the BENIGN-DOWNGRADE contract holds (skill-review Blocking — a newer scaffold is not drift, and install must not silently downgrade it)', () => {
  const bumpMarkerTo = (v) => {
    const p = join(projectRoot, 'CLAUDE.md');
    writeFileSync(
      p,
      readFileSync(p, 'utf8').replace(/core-memory-kit:start v[0-9.]+/, `core-memory-kit:start v${v}`),
    );
  };

  it('HC-9 stays PASS when the project scaffold is NEWER than the binary, even with a differing skill (no false alarm)', async () => {
    await install({ projectRoot, userTier: userDir });
    // Simulate machine-B: the project was scaffolded by a NEWER kit — marker
    // ahead of this binary, and the newer kit shipped a changed skill.
    bumpMarkerTo('99.0.0');
    writeFileSync(skillPath(), readFileSync(skillPath(), 'utf8') + '\n<!-- from the newer kit -->\n');

    const r = await runDoctor({ projectRoot, userDir });
    const hc9 = r.checks.find((c) => c.id === 'HC-9');
    expect(hc9.status).toBe('pass'); // benign downgrade — checkVersionDrift's own contract
    expect(hc9.message).not.toContain('SKILL.md');
  });

  it('install does NOT overwrite skills on a downgrade (mirror of the CLAUDE.md --force rule)', async () => {
    await install({ projectRoot, userTier: userDir });
    bumpMarkerTo('99.0.0');
    const newer = readFileSync(skillPath(), 'utf8') + '\n<!-- from the newer kit -->\n';
    writeFileSync(skillPath(), newer);

    const r = await install({ projectRoot, userTier: userDir });

    expect(readFileSync(skillPath(), 'utf8')).toBe(newer); // NOT downgraded
    expect((r.refreshed ?? []).some((p) => p.endsWith('SKILL.md'))).toBe(false);
  });
});

describe('CRLF is not drift (skill-review Important — the D-126 class on the compare)', () => {
  it('a CRLF checkout of an otherwise-identical skill: no HC-9 fail, no per-install rewrite flap', async () => {
    await install({ projectRoot, userTier: userDir });
    // Simulate a Windows autocrlf checkout: same bytes, CRLF line endings.
    const lf = readFileSync(skillPath(), 'utf8');
    writeFileSync(skillPath(), lf.replace(/\n/g, '\r\n'));

    const d = await runDoctor({ projectRoot, userDir });
    const hc9 = d.checks.find((c) => c.id === 'HC-9');
    expect(hc9.status).toBe('pass'); // EOL-only difference is not content drift

    const r = await install({ projectRoot, userTier: userDir });
    expect(r.refreshed ?? []).toEqual([]); // and install does not rewrite-flap on it
  });
});

describe('structural guard — skill templates stay placeholder-free (the vars-parity pin, skill-review Minor 4)', () => {
  it('template/.claude/skills contains no {{ tokens (a {{TODAY}} would make install and the drift check disagree across days)', () => {
    const skillsRoot = join(REPO_ROOT, 'template', '.claude', 'skills');
    const walk = (dir) => {
      const out = [];
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else out.push(p);
      }
      return out;
    };
    for (const f of walk(skillsRoot)) {
      expect(readFileSync(f, 'utf8'), `${f} must not carry template placeholders`).not.toContain('{{');
    }
  });
});
