// @doors: 1, 2, 3, 4
// Door 3: post-Task-150 the module spawns `git status` (the commit-proposal
//   detection) — the Task 150 tests exercise the REAL git binary in sandboxes;
//   the bash bin wrapper spawn is tested in cli-hooks-scaffold.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 18 — cmk-inject-context SessionStart hook (T-015).
// Per tasks.md 18.7:
//   - Test on a 3-tier fixture project: output is valid JSON with the
//     documented shape
//   - Test assembled snapshot is ≤10 KB on the fixture
//   - Test hook completes within 500 ms (timer assertion)
//   - Test duplicate ID across project + user tier: project version wins;
//     shadowed_by.log has the user-tier shadowing
//   - Test oversized snapshot scenario: output truncated; lowest-tier-
//     oldest dropped first; truncation event logged
//   - Test fact with `private: true` containing sentinel
//     __PRIVATE_FACT_SENTINEL__: sentinel does NOT appear in emitted
//     additionalContext (grep)
//
// Boundary-test discipline:
//   - Test the injectContext() public contract — given a 3-tier
//     filesystem and (cwd, userDir, capBytes) inputs, what JSON does it
//     emit and what log files does it write? Do NOT assert internal
//     traversal order, intermediate buffer shapes, or which helper
//     function processes which tier.
//   - The bin/cmk-inject-context script is also tested at its public
//     boundary (spawn, JSON parse, exit code) — its internals (bash vs
//     node, how it locates the module) are implementation details.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  injectContext,
  lazyCompressSpawnDescriptor,
  resolveCompressLazyPath,
  AUTHORITATIVE_MEMORY_PREAMBLE,
} from '../packages/cli/src/inject-context.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const BIN_PATH = join(REPO_ROOT, 'plugin', 'bin', 'cmk-inject-context' + '.mjs');

function makeFixture() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-inject-test-'));
  const projectRoot = join(sandbox, 'proj');
  const userDir = join(sandbox, 'user');
  return { sandbox, projectRoot, userDir };
}

function writeFile(absPath, content) {
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, 'utf8');
}

// Build a minimal 3-tier project. Each tier gets its allowed
// scratchpads (per SCRATCHPADS_BY_TIER) with a few-line body — enough
// to assert tier-section ordering without bumping into the cap.
function seedThreeTierFixture({ projectRoot, userDir }) {
  // Project tier
  writeFile(
    join(projectRoot, 'context', 'SOUL.md'),
    '# SOUL\n\n## Tone\nproject-soul-marker\n',
  );
  writeFile(
    join(projectRoot, 'context', 'MEMORY.md'),
    '# MEMORY\n\n## Active Threads\nproject-memory-marker\n',
  );
  writeFile(
    join(projectRoot, 'context', 'memory', 'INDEX.md'),
    '# INDEX\n\n| ID | Type | Title |\n|---|---|---|\nproject-index-marker\n',
  );

  // Local tier
  writeFile(
    join(projectRoot, 'context.local', 'machine-paths.md'),
    '# machine-paths\n\n## Tool Paths\nlocal-paths-marker\n',
  );
  writeFile(
    join(projectRoot, 'context.local', 'overrides.md'),
    '# overrides\n\n## Tool Overrides\nlocal-overrides-marker\n',
  );

  // User tier
  writeFile(
    join(userDir, 'USER.md'),
    '# USER\n\n## About\nuser-about-marker\n',
  );
  writeFile(
    join(userDir, 'HABITS.md'),
    '# HABITS\n\n## Iteration Cadence\nuser-habits-marker\n',
  );
  writeFile(
    join(userDir, 'LESSONS.md'),
    '# LESSONS\n\n## Tooling Lessons\nuser-lessons-marker\n',
  );
}

describe('Task 18 — injectContext() boundary', () => {
  let sandbox;
  let projectRoot;
  let userDir;

  beforeEach(() => {
    const f = makeFixture();
    sandbox = f.sandbox;
    projectRoot = f.projectRoot;
    userDir = f.userDir;
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('happy path — 3-tier fixture', () => {
    it('returns hookOutput with the documented Anthropic shape', () => {
      seedThreeTierFixture({ projectRoot, userDir });
      const r = injectContext({ cwd: projectRoot, userDir });
      expect(r.hookOutput).toMatchObject({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: expect.any(String),
        },
      });
    });

    it("hookOutput.additionalContext equals the assembled snapshot", () => {
      seedThreeTierFixture({ projectRoot, userDir });
      const r = injectContext({ cwd: projectRoot, userDir });
      expect(r.hookOutput.hookSpecificOutput.additionalContext).toBe(r.snapshot);
    });

    it('snapshot contains content from all 3 tiers when all 3 exist', () => {
      seedThreeTierFixture({ projectRoot, userDir });
      const r = injectContext({ cwd: projectRoot, userDir });
      expect(r.snapshot).toContain('local-paths-marker');
      expect(r.snapshot).toContain('project-memory-marker');
      expect(r.snapshot).toContain('user-about-marker');
    });

    it('snapshot orders tiers local → project → user (per design §7.1: highest-priority first)', () => {
      seedThreeTierFixture({ projectRoot, userDir });
      const r = injectContext({ cwd: projectRoot, userDir });
      const iLocal = r.snapshot.indexOf('local-paths-marker');
      const iProject = r.snapshot.indexOf('project-memory-marker');
      const iUser = r.snapshot.indexOf('user-about-marker');
      expect(iLocal).toBeGreaterThanOrEqual(0);
      expect(iProject).toBeGreaterThan(iLocal);
      expect(iUser).toBeGreaterThan(iProject);
    });

    it('snapshot is ≤ DEFAULT_CAP_BYTES (13 KB) on the small fixture', () => {
      // PR-B (2026-05-26) raised the snapshot cap from 10240 to 13000
      // to compose correctly with per-file caps (Σ = 12275). The test
      // pins the new default cap.
      seedThreeTierFixture({ projectRoot, userDir });
      const r = injectContext({ cwd: projectRoot, userDir });
      expect(Buffer.byteLength(r.snapshot, 'utf8')).toBeLessThanOrEqual(13000);
    });

    it('reports bytes count matching the snapshot byte length', () => {
      seedThreeTierFixture({ projectRoot, userDir });
      const r = injectContext({ cwd: projectRoot, userDir });
      expect(r.bytes).toBe(Buffer.byteLength(r.snapshot, 'utf8'));
    });

    it('completes within the 500ms NFR-1 budget on a small fixture', () => {
      seedThreeTierFixture({ projectRoot, userDir });
      const t0 = Date.now();
      injectContext({ cwd: projectRoot, userDir });
      const elapsed = Date.now() - t0;
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('tier path discovery', () => {
    it('walks up from a subdirectory under projectRoot to find context/', () => {
      seedThreeTierFixture({ projectRoot, userDir });
      const deepCwd = join(projectRoot, 'packages', 'something', 'src');
      mkdirSync(deepCwd, { recursive: true });
      const r = injectContext({ cwd: deepCwd, userDir });
      expect(r.snapshot).toContain('project-memory-marker');
    });

    it('honors MEMORY_KIT_USER_DIR env when userDir arg is undefined', () => {
      seedThreeTierFixture({ projectRoot, userDir });
      const saved = process.env.MEMORY_KIT_USER_DIR;
      process.env.MEMORY_KIT_USER_DIR = userDir;
      try {
        const r = injectContext({ cwd: projectRoot });
        expect(r.snapshot).toContain('user-about-marker');
      } finally {
        if (saved === undefined) delete process.env.MEMORY_KIT_USER_DIR;
        else process.env.MEMORY_KIT_USER_DIR = saved;
      }
    });

    it('emits empty snapshot when no tiers exist; hookOutput shape still valid', () => {
      // No fixture writes — every tier absent.
      const r = injectContext({ cwd: projectRoot, userDir });
      expect(r.snapshot).toBe('');
      expect(r.hookOutput.hookSpecificOutput.hookEventName).toBe('SessionStart');
      expect(r.hookOutput.hookSpecificOutput.additionalContext).toBe('');
    });

    it('skips a tier when its directory is absent (does not throw)', () => {
      // Only project tier present
      writeFile(
        join(projectRoot, 'context', 'MEMORY.md'),
        'project-only-marker\n',
      );
      const r = injectContext({ cwd: projectRoot, userDir });
      expect(r.snapshot).toContain('project-only-marker');
      expect(r.snapshot).not.toContain('user-about-marker');
    });
  });

  describe('cross-tier ID shadowing (18.3)', () => {
    it('duplicate ID across project + user tier: project wins; user is logged as shadowed', () => {
      // Project MEMORY has bullet (P-S79MJHFN) "project-wins-text"
      writeFile(
        join(projectRoot, 'context', 'MEMORY.md'),
        '# MEMORY\n\n## Active Threads\n- (P-S79MJHFN) project-wins-text\n  <!-- source: x, source_line: 1, sha1: a, write: user-explicit, trust: high, at: 2026-05-25T10:00:00Z -->\n',
      );
      // User LESSONS has bullet with same id but different body
      writeFile(
        join(userDir, 'LESSONS.md'),
        '# LESSONS\n\n## Tooling Lessons\n- (P-S79MJHFN) USER_SHADOWED_TEXT\n  <!-- source: y, source_line: 2, sha1: b, write: user-explicit, trust: high, at: 2026-05-24T09:00:00Z -->\n',
      );

      const r = injectContext({ cwd: projectRoot, userDir });
      expect(r.snapshot).toContain('project-wins-text');
      expect(r.snapshot).not.toContain('USER_SHADOWED_TEXT');

      // shadowed_by.log written under project tier's .locks/
      const shadowLog = join(projectRoot, 'context', '.locks', 'shadowed_by.log');
      expect(existsSync(shadowLog)).toBe(true);
      const lines = readFileSync(shadowLog, 'utf8').split('\n').filter(Boolean);
      const matched = lines
        .map((l) => JSON.parse(l))
        .find((e) => e.id === 'P-S79MJHFN');
      expect(matched).toBeDefined();
      expect(matched.winner_tier).toBe('P');
      expect(matched.shadowed_tiers).toContain('U');

      // Also exposed via the return value for programmatic callers
      expect(
        r.shadowedEvents.some(
          (e) => e.id === 'P-S79MJHFN' && e.winner_tier === 'P',
        ),
      ).toBe(true);
    });

    it('triple-tier collision: local wins; project + user both logged as shadowed', () => {
      writeFile(
        join(projectRoot, 'context.local', 'overrides.md'),
        '- (P-WJCLLKH6) local-wins\n  <!-- source: x, source_line: 1, sha1: a, write: user-explicit, trust: high, at: 2026-05-25T10:00:00Z -->\n',
      );
      writeFile(
        join(projectRoot, 'context', 'MEMORY.md'),
        '- (P-WJCLLKH6) project-loses\n  <!-- source: y, source_line: 1, sha1: b, write: user-explicit, trust: high, at: 2026-05-25T10:00:00Z -->\n',
      );
      writeFile(
        join(userDir, 'HABITS.md'),
        '- (P-WJCLLKH6) user-loses\n  <!-- source: z, source_line: 1, sha1: c, write: user-explicit, trust: high, at: 2026-05-25T10:00:00Z -->\n',
      );

      const r = injectContext({ cwd: projectRoot, userDir });
      expect(r.snapshot).toContain('local-wins');
      expect(r.snapshot).not.toContain('project-loses');
      expect(r.snapshot).not.toContain('user-loses');

      const ev = r.shadowedEvents.find((e) => e.id === 'P-WJCLLKH6');
      expect(ev.winner_tier).toBe('L');
      expect(ev.shadowed_tiers.sort()).toEqual(['P', 'U']);
    });

    it('no duplicates → no shadow events, no shadowed_by.log writes', () => {
      seedThreeTierFixture({ projectRoot, userDir });
      const r = injectContext({ cwd: projectRoot, userDir });
      expect(r.shadowedEvents).toEqual([]);
      // .locks/shadowed_by.log may not exist at all on a clean run
      const shadowLog = join(projectRoot, 'context', '.locks', 'shadowed_by.log');
      if (existsSync(shadowLog)) {
        expect(readFileSync(shadowLog, 'utf8').trim()).toBe('');
      }
    });
  });

  describe('private:true exclusion (18.4)', () => {
    it('private fact body sentinel NEVER appears in additionalContext', () => {
      // Set up a non-empty fixture so the snapshot isn't trivially empty
      seedThreeTierFixture({ projectRoot, userDir });
      // Drop a per-fact archive file with private:true containing the sentinel
      writeFile(
        join(projectRoot, 'context', 'memory', 'feedback_private-thing.md'),
        '---\nid: P-WJCLLKH6\nprivate: true\n---\n\n# title\n\n__PRIVATE_FACT_SENTINEL__\n',
      );
      const r = injectContext({ cwd: projectRoot, userDir });
      expect(r.snapshot).not.toContain('__PRIVATE_FACT_SENTINEL__');
      // Also doesn't leak the sentinel via INDEX (the INDEX *id* may
      // appear; the body text never should).
    });

    it('non-private fact body CAN appear when something explicitly reads it (regression guard)', () => {
      seedThreeTierFixture({ projectRoot, userDir });
      writeFile(
        join(projectRoot, 'context', 'memory', 'feedback_public-thing.md'),
        '---\nid: P-S79MJHFN\nprivate: false\n---\n\n# title\n\nPUBLIC_BODY_TEXT\n',
      );
      const r = injectContext({ cwd: projectRoot, userDir });
      // We do NOT assert PUBLIC_BODY_TEXT appears — per design §1.4 the
      // current snapshot composition deliberately skips fact bodies. The
      // important contract is the negative one (private bodies never
      // leak); this test just documents that the absence of PUBLIC body
      // text is by design, not an accidental over-filter.
      expect(r.snapshot).not.toContain('__PRIVATE_FACT_SENTINEL__');
    });
  });

  describe('snapshot cleaning — strip template noise so real facts surface (#R, 2026-05-30)', () => {
    // Self-test finding #R: the injected snapshot was ~70% template-comment
    // noise + placeholder seed bullets, with real captured facts buried
    // behind them — so the agent read a wall of scaffolding and concluded
    // "no real facts populated yet." injectContext must inject ONLY real
    // captured facts: strip <!-- --> format/provenance comments, drop seed
    // bullets (all-zero sha1 sentinel or `(example)` marker), and exclude
    // tiers that become empty after cleaning.

    // A realistic template-shaped MEMORY.md: a multi-line format-explanation
    // comment header + a real auto-extract bullet (real sha1) + empty
    // trailing sections.
    const realMemoryMd = [
      '<!-- Cap: 2500 chars · Last distilled: {{TODAY}} -->',
      '',
      '<!--',
      'MEMORY.md is the working scratchpad. Consolidation triggers at >95%.',
      'Bullet+provenance format (universal across all scratchpads):',
      '- (P-XXXXXXXX) the bullet text on one line',
      '-->',
      '',
      '# Working Memory',
      '',
      '## Active Threads',
      '',
      '- (P-B2MAHQ2L) Never install Python packages globally; use .venv on Python 3.13 only',
      '  <!-- source: auto-extract-session, source_line: 1, sha1: 52dd2873ba037c7c9e913817f69650708b5810df, write: auto-extract, trust: high, at: 2026-05-29T22:14:22Z -->',
      '',
      '## Environment Notes',
      '',
      '## Pending Decisions',
      '',
    ].join('\n');

    // A template-shaped local tier that is ALL placeholder seed bullets
    // (all-zero sha1 + `(example)` marker) — never populated with real facts.
    const seedOnlyMachinePaths = [
      '<!--',
      'machine-paths.md = absolute paths specific to THIS machine for THIS project.',
      'Local tier (gitignored — never committed).',
      '-->',
      '',
      '# Machine paths (local tier)',
      '',
      '## Tool Paths',
      '',
      '<!-- Tool/binary paths. -->',
      '',
      '- (L-aVFaHNDV) (example) node binary at /usr/local/bin/node',
      '  <!-- source: machine-paths.md, source_line: 19, sha1: 0000000000000000000000000000000000000000, write: manual-edit, trust: medium, at: 2020-01-01T00:00:00Z -->',
      '',
    ].join('\n');

    function seedTemplateLikeFixture() {
      writeFile(join(projectRoot, 'context', 'MEMORY.md'), realMemoryMd);
      writeFile(join(projectRoot, 'context.local', 'machine-paths.md'), seedOnlyMachinePaths);
    }

    it('strips the multi-line <!-- format-explanation --> header from the snapshot', () => {
      seedTemplateLikeFixture();
      const r = injectContext({ cwd: projectRoot, userDir });
      expect(r.snapshot).not.toContain('MEMORY.md is the working scratchpad');
      expect(r.snapshot).not.toContain('Bullet+provenance format');
    });

    it('drops placeholder seed bullets (all-zero sha1 / (example) marker) and their content', () => {
      seedTemplateLikeFixture();
      const r = injectContext({ cwd: projectRoot, userDir });
      expect(r.snapshot).not.toContain('(example)');
      expect(r.snapshot).not.toContain('node binary at /usr/local/bin/node');
    });

    it('strips per-bullet provenance comments (sha1/source/trust) — only the fact + id remain', () => {
      seedTemplateLikeFixture();
      const r = injectContext({ cwd: projectRoot, userDir });
      expect(r.snapshot).not.toContain('sha1: 52dd2873');
      expect(r.snapshot).not.toContain('write: auto-extract');
    });

    it('KEEPS real captured facts (real sha1) verbatim with their citation id', () => {
      seedTemplateLikeFixture();
      const r = injectContext({ cwd: projectRoot, userDir });
      expect(r.snapshot).toContain('Never install Python packages globally');
      expect(r.snapshot).toContain('(P-B2MAHQ2L)');
    });

    it('excludes a tier whose content is entirely seed/placeholder after cleaning', () => {
      seedTemplateLikeFixture();
      const r = injectContext({ cwd: projectRoot, userDir });
      // The local tier was 100% seeds → no tier header, no content from it.
      expect(r.snapshot).not.toContain('cmk: local tier');
      expect(r.snapshot).not.toContain('Machine paths (local tier)');
      // The project tier (real facts) survives.
      expect(r.snapshot).toContain('cmk: project tier');
    });

    it('shrinks the snapshot to mostly real content (noise no longer dominates)', () => {
      seedTemplateLikeFixture();
      const r = injectContext({ cwd: projectRoot, userDir });
      // Before the fix this fixture injected ~1KB+ of comments/seeds with the
      // real fact buried; after, the snapshot is small and the real fact is
      // near the front. Offsets are PREAMBLE-RELATIVE since Task 75.0: the
      // fixed authoritative-memory preamble now leads every snapshot, so the
      // "near the top / small" contract applies to the body after it.
      const preambleLen = AUTHORITATIVE_MEMORY_PREAMBLE.length + 2; // + '\n\n'
      const idxFact = r.snapshot.indexOf('Never install Python packages globally');
      expect(idxFact).toBeGreaterThanOrEqual(0);
      expect(idxFact - preambleLen).toBeLessThan(200); // real fact near the top of the BODY
      expect(
        Buffer.byteLength(r.snapshot, 'utf8') -
          Buffer.byteLength(AUTHORITATIVE_MEMORY_PREAMBLE, 'utf8') - 2,
      ).toBeLessThan(600);
    });
  });

  describe('cap enforcement + truncation (18.5)', () => {
    it('oversized fixture: snapshot ≤ capBytes; truncation event logged; lowest-tier dropped first', () => {
      // Build a fixture deliberately over 1 KB cap by stuffing each tier
      // with bulk content. With cap=1024, the user tier should be the
      // first to be dropped (lowest-priority).
      const bulk = (marker) => `# ${marker}\n\n` + 'x'.repeat(800) + `\n${marker}-end\n`;
      writeFile(
        join(projectRoot, 'context.local', 'machine-paths.md'),
        bulk('local-bulk-marker'),
      );
      writeFile(
        join(projectRoot, 'context', 'MEMORY.md'),
        bulk('project-bulk-marker'),
      );
      writeFile(
        join(userDir, 'LESSONS.md'),
        bulk('user-bulk-marker'),
      );

      const r = injectContext({ cwd: projectRoot, userDir, capBytes: 1024 });
      expect(Buffer.byteLength(r.snapshot, 'utf8')).toBeLessThanOrEqual(1024);
      // Lowest-priority tier was dropped first
      expect(r.snapshot).not.toContain('user-bulk-marker-end');
      // Truncation event recorded
      expect(r.truncationEvents.length).toBeGreaterThanOrEqual(1);
      const evt = r.truncationEvents[0];
      expect(evt).toMatchObject({ ts: expect.any(String), capBytes: 1024 });
      expect(Array.isArray(evt.dropped_tiers)).toBe(true);
      expect(evt.dropped_tiers).toContain('U');

      // And the log file landed
      const truncLog = join(projectRoot, 'context', '.locks', 'truncation.log');
      expect(existsSync(truncLog)).toBe(true);
    });

    it('within-cap fixture: no truncation event', () => {
      seedThreeTierFixture({ projectRoot, userDir });
      const r = injectContext({ cwd: projectRoot, userDir, capBytes: 10240 });
      expect(r.truncationEvents).toEqual([]);
    });
  });

  // -------------------------------------------------------------------
  // Per-tier byte budgets (design §7.1.1, 2026-05-26 amendment).
  // Each tier truncates section-by-section to its own budget BEFORE the
  // snapshot-cap drop step runs. This protects the user tier from being
  // squeezed out when the project tier grows over time — the bug
  // surfaced by live-test scenario 4.
  // -------------------------------------------------------------------
  describe('per-tier budgets (design §7.1.1)', () => {
    // Helper: build a 3-section scratchpad whose total size exceeds the
    // tier's budget. Each section is ~bulkBytes large so truncation
    // can drop 1-2 sections to fit. Section headings match the design
    // §2.1 fixed names so the section-granular truncator finds them.
    function buildOversizedScratchpad(sectionNames, bulkBytes) {
      const sections = sectionNames.map(
        (name, i) =>
          `## ${name}\n\n` +
          `bullet-${i}-marker\n` +
          'x'.repeat(bulkBytes) +
          `\nsection-${i}-tail-marker\n`,
      );
      return `# Title\n\n` + sections.join('\n');
    }

    it('user tier > U-budget → drops user-tier sections from end; PROJECT + LOCAL untouched', () => {
      // Build a user-tier scratchpad with 3 sections, each ~2500 bytes
      // (total ~7.5KB > 4975 U-budget). Should drop the last 1-2 sections.
      writeFile(
        join(userDir, 'LESSONS.md'),
        buildOversizedScratchpad(
          ['Tooling Lessons', 'Process Lessons', 'Anti-patterns'],
          2500,
        ),
      );
      // Project + local: small seed content (well under budgets).
      writeFile(
        join(projectRoot, 'context', 'MEMORY.md'),
        '# MEMORY\n\n## Active Threads\n\nproject-bullet-marker\n',
      );
      writeFile(
        join(projectRoot, 'context.local', 'machine-paths.md'),
        '# machine-paths\n\n## Tool Paths\n\nlocal-bullet-marker\n',
      );

      const r = injectContext({ cwd: projectRoot, userDir, capBytes: 13000 });
      // Local + project survived intact.
      expect(r.snapshot).toContain('local-bullet-marker');
      expect(r.snapshot).toContain('project-bullet-marker');
      // User tier's first section survived (it fits within budget after dropping the others).
      expect(r.snapshot).toContain('bullet-0-marker'); // Tooling Lessons retained
      // At least one section dropped from the user tier.
      expect(r.snapshot).not.toContain('section-2-tail-marker'); // Anti-patterns dropped
      // tier_truncated_to_budget event emitted with shape from §7.1.
      const tierEvt = r.truncationEvents.find(
        (e) => e.event === 'tier_truncated_to_budget' && e.tier === 'U',
      );
      expect(tierEvt).toBeDefined();
      expect(tierEvt).toMatchObject({
        ts: expect.any(String),
        event: 'tier_truncated_to_budget',
        tier: 'U',
        budget: 4975, // Σ USER.md 1375 + HABITS.md 1800 + LESSONS.md 1800
        pre_bytes: expect.any(Number),
        post_bytes: expect.any(Number),
        sections_dropped: expect.any(Number),
      });
      expect(tierEvt.pre_bytes).toBeGreaterThan(tierEvt.post_bytes);
      expect(tierEvt.post_bytes).toBeLessThanOrEqual(4975);
      expect(tierEvt.sections_dropped).toBeGreaterThanOrEqual(1);
    });

    // -- Task 151.5 — sweep ORDER on the INJECT surface (ADR-0016 §20.3) --------
    // The cap-relief sweep must drop the LOW-trust section first and NEVER evict a
    // high-trust persona trait — the value-ordered invariant (vs the MemoryOS-LFU /
    // MemOS-top-N value-BLIND sweeps the research flags as the Task-151 bug). The
    // existing per-tier test above drops by FILE ORDER (no trust variance); this one
    // varies TRUST so the importance-ordering (§19.3 maxTrust-first) is pinned.
    it('151.5: under U-budget pressure the LOW-trust section drops FIRST; the high-trust trait survives', () => {
      // Two oversized LESSONS.md sections that together blow the U-budget so only
      // ONE survives. The LATER section (file order) holds the HIGH-trust bullet —
      // so a value-BLIND tail-drop would wrongly evict it. Importance-ordering must
      // instead drop the EARLIER low-trust section and keep the high-trust one.
      // Both sections share the same `at` ON PURPOSE — that neutralizes the
      // recency (maxAtMs) tiebreak so the drop decision rides purely on TRUST,
      // isolating the §19.3 trust axis this test is meant to pin.
      const bulk = 'x'.repeat(2600);
      const lowFirst =
        '## Tooling Lessons\n\n' +
        '- (U-LWAAAAAA) a low-value tooling note that can go first\n' +
        '  <!-- source: s/1.md, source_line: 1, sha1: ' + 'a'.repeat(40) + ', write: auto-extract, trust: low, at: 2026-05-20T00:00:00Z -->\n' +
        `${bulk}\nlow-trust-tail-marker\n`;
      const highSecond =
        '## Process Lessons\n\n' +
        '- (U-HGHAAAAA) a durable high-trust cross-project rule that must survive\n' +
        '  <!-- source: s/2.md, source_line: 1, sha1: ' + 'b'.repeat(40) + ', write: user-explicit, trust: high, at: 2026-05-20T00:00:00Z -->\n' +
        `${bulk}\nhigh-trust-tail-marker\n`;
      writeFile(join(userDir, 'LESSONS.md'), `# Lessons\n\n${lowFirst}\n${highSecond}`);

      const r = injectContext({ cwd: projectRoot, userDir, capBytes: 13000 });

      // The high-trust trait SURVIVED (value-ordered eviction protected it)...
      expect(r.snapshot).toContain('high-trust-tail-marker');
      expect(r.snapshot).toContain('U-HGHAAAAA');
      // ...and the LOW-trust section was the one dropped (not the tail-order one).
      expect(r.snapshot).not.toContain('low-trust-tail-marker');
      // Door 4: the truncation event names the dropped LOW-trust section.
      const evt = r.truncationEvents.find((e) => e.event === 'tier_truncated_to_budget' && e.tier === 'U');
      expect(evt).toBeDefined();
      const dropped = evt.dropped_sections ?? [];
      expect(dropped.some((s) => s.max_trust === 'low')).toBe(true);
      expect(dropped.some((s) => s.max_trust === 'high')).toBe(false);
    });

    it('151.5: with 3 trust tiers over budget, drop order is LOW → MEDIUM → (high only if forced)', () => {
      // Symmetry with the write-side ordering test: when more than one section
      // must go, the LOW section drops before the MEDIUM, and HIGH survives
      // longest. Equal `at` across all three isolates the trust axis (no recency
      // tiebreak). Budget is tuned so exactly the low + medium sections must drop.
      const at = '2026-05-20T00:00:00Z';
      const sha = (c) => c.repeat(40);
      const bulk = 'x'.repeat(2600);
      const mk = (heading, id, trust, marker, shaC) =>
        `## ${heading}\n\n- (${id}) a ${trust}-trust bullet\n` +
        `  <!-- source: s.md, source_line: 1, sha1: ${sha(shaC)}, write: ${trust === 'high' ? 'user-explicit' : 'auto-extract'}, trust: ${trust}, at: ${at} -->\n` +
        `${bulk}\n${marker}\n`;
      writeFile(
        join(userDir, 'LESSONS.md'),
        '# Lessons\n\n' +
          mk('Tooling Lessons', 'U-LWBBBBBB', 'low', 'low-marker', 'a') +
          '\n' + mk('Process Lessons', 'U-MEDBBBBB', 'medium', 'med-marker', 'b') +
          '\n' + mk('Anti-patterns', 'U-HGHBBBBB', 'high', 'high-marker', 'c'),
      );

      const r = injectContext({ cwd: projectRoot, userDir, capBytes: 13000 });

      // High survives; low + medium dropped (low cheapest, medium next).
      expect(r.snapshot).toContain('high-marker');
      expect(r.snapshot).not.toContain('low-marker');
      expect(r.snapshot).not.toContain('med-marker');
      const evt = r.truncationEvents.find((e) => e.event === 'tier_truncated_to_budget' && e.tier === 'U');
      const droppedTrusts = (evt.dropped_sections ?? []).map((s) => s.max_trust);
      expect(droppedTrusts).toContain('low');
      expect(droppedTrusts).toContain('medium');
      expect(droppedTrusts).not.toContain('high');
    });

    // -- Task 151.13 CUT-GATE: Hole-B end-to-end (the literal Done-when) ---------
    // The Hole-B Done-when is "promote N high-trust traits past cap → the snapshot
    // STILL injects them next cold-open." The 151.4 tests assert the bullets stay in
    // the FILE; this asserts the OTHER half — injectContext (the cold-open path)
    // actually re-injects them. A high-trust persona that grew past its inject
    // budget must survive into the snapshot (never stranded in an un-injected store).
    it('151.13 CUT-GATE (Hole B): a high-trust persona over its inject budget STILL injects at cold-open', () => {
      const at = '2026-05-20T00:00:00Z';
      // Many high-trust HABITS bullets — a real promoted persona that outgrew budget.
      const bullets = [];
      for (let i = 0; i < 12; i++) {
        const id = `U-HAB${String(i).replace(/[0-9]/g, (d) => 'ABCDEFGHJK'[Number(d)]).padStart(5, 'A')}`;
        bullets.push(
          `- (${id}) durable cross-project habit ${i} — must survive the cold-open snapshot\n` +
          `  <!-- source: persona/${i}.md, source_line: 1, sha1: ${'a'.repeat(40)}, write: user-explicit, trust: high, at: ${at} -->`,
        );
      }
      writeFile(
        join(userDir, 'HABITS.md'),
        '# Habits\n\n## Iteration Cadence\n\n' + bullets.join('\n') + '\n',
      );

      const r = injectContext({ cwd: projectRoot, userDir });

      // The high-trust traits ARE in the cold-open snapshot (not stranded/dropped).
      // At minimum the first trait survives; high-trust is never evicted before
      // lower-value content, so the persona reaches the next session.
      expect(r.snapshot).toContain('durable cross-project habit 0');
      expect(r.snapshot).toContain('## Iteration Cadence');
      // The whole persona was high-trust, so NO high-trust section was dropped.
      const evt = r.truncationEvents.find((e) => e.event === 'tier_truncated_to_budget' && e.tier === 'U');
      if (evt) {
        expect((evt.dropped_sections ?? []).some((s) => s.max_trust === 'high')).toBe(false);
      }
    });

    // -- Task 74 — injectContext is SOURCE-AGNOSTIC (post-compaction re-inject) --
    // The SessionStart hook is matcher-less (cli-install-hooks pins that), and
    // injectContext never reads the hook `source` field — so a SessionStart fired
    // with source:"compact" runs the SAME path and re-injects the frozen snapshot.
    // This pins the inject half of the compact-survival contract (D-218): memory
    // returns regardless of WHY SessionStart fired.
    it('74: injectContext builds the same snapshot regardless of trigger source (so a compact-fired SessionStart re-injects)', () => {
      seedThreeTierFixture({ projectRoot, userDir });
      const r = injectContext({ cwd: projectRoot, userDir });
      // The frozen memory is present + IS the additionalContext — exactly what a
      // post-compact SessionStart re-injects (no `source` gate anywhere).
      expect(r.hookOutput.hookSpecificOutput.additionalContext).toBe(r.snapshot);
      expect(r.snapshot.length).toBeGreaterThan(0);
      expect(r.snapshot).toContain('user-about-marker'); // a real injected fact is back
    });

    it('default install (seeds only) injects NO placeholder seed bullets or scaffolding (#R)', async () => {
      // Decision-trail (CLAUDE.md "Decision-trail preservation"):
      //
      // **Original plan (PR-25, 2026-05-26)**: this test asserted that the
      // frozen user-tier SEED bullets (U-PRNQKRaC / U-CEKUY3H4 / U-RDBNQSL7)
      // REACH Claude on a default install — a regression guard against the
      // user tier being dropped wholesale by cap miscomposition.
      //
      // **Revision 2026-05-30 (self-test finding #R)**: the live self-test
      // proved that injecting those very seed bullets is what made a fresh
      // session report "no real facts populated yet" — the placeholder
      // scaffolding crowded out / masked the real captured facts. So the
      // CORRECT contract flipped: a default install (which has NO real
      // captured facts yet) must inject ~nothing — never the placeholder
      // seeds. PR-25's REAL concern (cap composition; no wholesale tier
      // drop of genuine content) is preserved by the other budget tests in
      // this describe block, which use non-seed markers.
      const { install } = await import('../packages/cli/src/install.mjs');
      await install({ projectRoot, userTier: userDir });

      const r = injectContext({ cwd: projectRoot, userDir });

      // No placeholder seed bullets reach Claude (any tier).
      for (const seedId of [
        'U-PRNQKRaC', // USER.md About
        'U-CEKUY3H4', // HABITS.md Iteration Cadence
        'U-RDBNQSL7', // LESSONS.md Tooling Lessons
        'P-T6M95JXF', // MEMORY.md Active Threads (example)
        'L-aVFaHNDV', // machine-paths.md (example)
      ]) {
        expect(r.snapshot).not.toContain(seedId);
      }
      // No `(example)` markers and no all-zero seed sha1 leak through.
      expect(r.snapshot).not.toContain('(example)');
      expect(r.snapshot).not.toContain(
        'sha1: 0000000000000000000000000000000000000000',
      );
      // No format-explanation comment headers reach Claude.
      expect(r.snapshot).not.toContain('MEMORY.md is the working scratchpad');
      // A seeds-only install injects essentially nothing (honest: the kit
      // doesn't know you yet). Real facts appear only once captured.
      expect(Buffer.byteLength(r.snapshot, 'utf8')).toBeLessThan(200);

      // PR-B contract preserved: NO legacy whole-tier drops.
      const wholeDrops = r.truncationEvents.filter((e) => e.dropped_tiers);
      expect(wholeDrops).toEqual([]);
    });

    it('local tier > L-budget → local-tier sections drop; user + project untouched', () => {
      // Each section ~1500 bytes × 3 = 4500 > 3000 L-budget (PR-B).
      writeFile(
        join(projectRoot, 'context.local', 'machine-paths.md'),
        buildOversizedScratchpad(['Tool Paths', 'Project Paths', 'Misc Paths'], 1500),
      );
      writeFile(
        join(userDir, 'USER.md'),
        '# USER\n\n## About\n\nuser-survives-marker\n',
      );

      const r = injectContext({ cwd: projectRoot, userDir, capBytes: 13000 });
      // User tier survives intact.
      expect(r.snapshot).toContain('user-survives-marker');
      // Local tier truncated.
      const tierEvt = r.truncationEvents.find(
        (e) => e.event === 'tier_truncated_to_budget' && e.tier === 'L',
      );
      expect(tierEvt).toBeDefined();
      expect(tierEvt.budget).toBe(3000); // PR-B: Σ machine-paths.md 1500 + overrides.md 1500
      expect(tierEvt.post_bytes).toBeLessThanOrEqual(3000);
    });

    it('tier_truncated_to_budget events land in truncation.log as NDJSON', () => {
      // Task 168: seed a `context/` marker so discoverProjectRoot anchors on THIS
      // projectRoot (the truncation.log is written under <discoveredRoot>/context/
      // .locks/). Without a tier marker, discovery walks up into an ancestor and
      // the log lands elsewhere — the real-world bug fixed in discoverProjectRoot,
      // but the test must also reflect that a real project HAS a context/ dir.
      writeFile(
        join(projectRoot, 'context', 'MEMORY.md'),
        '# MEMORY\n\n## Active Threads\nproject-memory-marker\n',
      );
      // 3 × 2500 = 7500 > 4975 U-budget → truncation fires.
      writeFile(
        join(userDir, 'HABITS.md'),
        buildOversizedScratchpad(
          ['Iteration Cadence', 'Destructive Operations', 'Communication Style'],
          2500,
        ),
      );

      injectContext({ cwd: projectRoot, userDir, capBytes: 13000 });

      const truncLog = join(projectRoot, 'context', '.locks', 'truncation.log');
      expect(existsSync(truncLog)).toBe(true);
      const lines = readFileSync(truncLog, 'utf8').split('\n').filter(Boolean);
      const parsed = lines.map((l) => JSON.parse(l));
      const tierEvt = parsed.find(
        (e) => e.event === 'tier_truncated_to_budget' && e.tier === 'U',
      );
      expect(tierEvt).toBeDefined();
      expect(tierEvt).toHaveProperty('pre_bytes');
      expect(tierEvt).toHaveProperty('post_bytes');
      expect(tierEvt).toHaveProperty('sections_dropped');
    });

    it('per-tier truncation runs BEFORE total-cap fallback (configuration safety)', () => {
      // Set the snapshot cap WAY below the sum of budgets (1500+4500+
      // 4000 = 10000 > 1024). After per-tier truncation, the kept
      // blocks still exceed the snapshot cap, so the dropped_tiers
      // fallback fires. Verifies both paths can be active.
      writeFile(
        join(userDir, 'LESSONS.md'),
        buildOversizedScratchpad(['Tooling Lessons', 'Process Lessons', 'Anti-patterns'], 1000),
      );
      writeFile(
        join(projectRoot, 'context', 'MEMORY.md'),
        '# MEMORY\n\n## Active Threads\n\nproject-bullet-marker\n',
      );

      const r = injectContext({ cwd: projectRoot, userDir, capBytes: 1024 });
      // Both event types can coexist in extreme overflow.
      expect(Buffer.byteLength(r.snapshot, 'utf8')).toBeLessThanOrEqual(1024);
      // The dropped_tiers fallback must have fired since per-tier
      // truncation alone (4KB U budget) can't fit a 1KB total cap.
      const dropEvt = r.truncationEvents.find((e) => e.dropped_tiers);
      expect(dropEvt).toBeDefined();
    });
  });

  // Task 93 / design §19.3 — inject eviction is IMPORTANCE-aware, not tail-order.
  // When a tier exceeds its budget, the LOWEST-value section is dropped first,
  // regardless of where it sits in the file. This is the inject-side half of the
  // §19 memory-retention architecture (94.4).
  describe('importance-aware inject eviction (Task 93 / §19.3)', () => {
    // A section padded to ~bulkBytes whose single bullet carries REAL provenance
    // (non-zero sha1, so it survives seed-stripping) of the given trust + `at`.
    // The padding is a plain filler line (kept by cleaning, no id → no value).
    function valuedSection(heading, id, trust, at, bulkBytes) {
      return (
        `## ${heading}\n` +
        `- (${id}) ${trust}-trust lesson marker ${id}\n` +
        `  <!-- source: s.md, source_line: 1, sha1: ${'a'.repeat(40)}, write: manual-edit, trust: ${trust}, at: ${at} -->\n` +
        `${'x'.repeat(bulkBytes)}\n`
      );
    }

    it('drops the LOW-trust section and KEEPS the high-trust one — even when high sits in the LAST section', () => {
      // Two ~2900B sections (total ~5.8KB > 4975 U-budget): LOW in the FIRST
      // section, HIGH in the LAST. Tail-order would drop the HIGH (last) one;
      // importance-order must drop the LOW (first) one instead.
      writeFile(
        join(userDir, 'LESSONS.md'),
        `# LESSONS\n\n` +
          valuedSection('Tooling Lessons', 'U-LMNPQRST', 'low', '2026-06-01T00:00:00Z', 2800) +
          '\n' +
          valuedSection('Process Lessons', 'U-VWXYZABC', 'high', '2026-06-01T00:00:00Z', 2800),
      );

      const r = injectContext({ cwd: projectRoot, userDir, capBytes: 13000 });

      // The HIGH-trust bullet survived; the LOW-trust one was evicted.
      expect(r.snapshot).toContain('U-VWXYZABC');
      expect(r.snapshot).not.toContain('U-LMNPQRST');

      // Door 4: the event names the dropped section + its aggregate trust + ids.
      const evt = r.truncationEvents.find(
        (e) => e.event === 'tier_truncated_to_budget' && e.tier === 'U',
      );
      expect(evt).toBeDefined();
      expect(evt.strategy).toBe('importance-ordered');
      expect(evt.post_bytes).toBeLessThanOrEqual(4975);
      expect(evt.dropped_sections).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ max_trust: 'low', ids: expect.arrayContaining(['U-LMNPQRST']) }),
        ]),
      );
      // The high-trust section is NOT in the dropped list.
      expect(
        evt.dropped_sections.some((s) => s.ids.includes('U-VWXYZABC')),
      ).toBe(false);
    });

    it('protects a MIXED section as a unit — a high-trust bullet shields the low-trust bullet beside it (section-granularity, intentional)', () => {
      // §19.3 invariant is enforced at SECTION granularity (MAX-aggregate): a
      // section holding a high-trust bullet is protected wholesale, so a LOW-trust
      // bullet bundled with it survives while a standalone MEDIUM section is
      // dropped. This locks that accepted approximation as a deliberate contract
      // (vs. a future bullet-granular refactor). Two ~2900B sections:
      //   - "Mixed" = high + low bullets → maxTrust high → protected
      //   - "Solo"  = a single medium bullet → dropped first
      const mixed =
        `## Mixed Bag\n` +
        `- (U-QRSTUVWX) high-trust keeper marker U-QRSTUVWX\n` +
        `  <!-- source: s.md, source_line: 1, sha1: ${'a'.repeat(40)}, write: manual-edit, trust: high, at: 2026-06-01T00:00:00Z -->\n` +
        `- (U-RSTUVWXY) low-trust rider marker U-RSTUVWXY\n` +
        `  <!-- source: s.md, source_line: 2, sha1: ${'b'.repeat(40)}, write: manual-edit, trust: low, at: 2026-06-01T00:00:00Z -->\n` +
        `${'x'.repeat(2700)}\n`;
      writeFile(
        join(userDir, 'USER.md'),
        `# USER\n\n` +
          mixed +
          '\n' +
          valuedSection('Preferences', 'U-STUVWXYZ', 'medium', '2026-06-01T00:00:00Z', 2800),
      );

      const r = injectContext({ cwd: projectRoot, userDir, capBytes: 13000 });

      // The mixed section survives WHOLE — including its low-trust rider...
      expect(r.snapshot).toContain('U-QRSTUVWX');
      expect(r.snapshot).toContain('U-RSTUVWXY');
      // ...while the standalone medium section is the one evicted.
      expect(r.snapshot).not.toContain('U-STUVWXYZ');
    });

    it('breaks trust ties by recency — drops the OLDER same-trust section first', () => {
      // Two MEDIUM sections; importance-order falls back to recency, so the
      // OLDER one (Jan) is dropped and the NEWER one (Jun) is kept.
      writeFile(
        join(userDir, 'HABITS.md'),
        `# HABITS\n\n` +
          valuedSection('Iteration Cadence', 'U-MNPQRSTU', 'medium', '2026-01-01T00:00:00Z', 2800) +
          '\n' +
          valuedSection('Communication Style', 'U-NPQRSTUV', 'medium', '2026-06-01T00:00:00Z', 2800),
      );

      const r = injectContext({ cwd: projectRoot, userDir, capBytes: 13000 });

      expect(r.snapshot).toContain('U-NPQRSTUV'); // newer kept
      expect(r.snapshot).not.toContain('U-MNPQRSTU'); // older dropped
      const evt = r.truncationEvents.find(
        (e) => e.event === 'tier_truncated_to_budget' && e.tier === 'U',
      );
      expect(evt.dropped_sections.some((s) => s.ids.includes('U-MNPQRSTU'))).toBe(true);
    });
  });
});

describe('Task 66.4 — temporal-supersede mention (the contradiction-catch demo surface, D-259)', () => {
  let f;
  beforeEach(() => {
    f = makeFixture();
    seedThreeTierFixture(f);
  });
  afterEach(() => rmSync(f.sandbox, { recursive: true, force: true }));

  function seedSupersedeAudit({ ts, title = 'v9.9 cut-gate in progress' }) {
    // The archived older fact (title source for the mention).
    const archivePath = join(
      f.projectRoot, 'context', 'memory', 'archive', 'superseded', 'P-TEMPA2B3.md',
    );
    writeFile(
      archivePath,
      `---\nid: P-TEMPA2B3\ntype: project\ntitle: ${title}\nended_at: 2026-07-01T18:00:00Z\nstatus: completed\nsuperseded_by: P-TEMPC4D5\n---\n\nOld state.\n`,
    );
    writeFile(
      join(f.projectRoot, 'context', '.locks', 'audit.log'),
      JSON.stringify({
        ts,
        action: 'temporal_supersede',
        tier: 'P',
        id: 'P-TEMPA2B3',
        paths: { archive: archivePath },
        extra: { supersededBy: 'P-TEMPC4D5', endedAt: '2026-07-01T18:00:00Z', judgedBy: 'temporal-sweep' },
      }) + '\n',
    );
  }

  it('a recent temporal_supersede → ONE mention line after the preamble, naming the closed fact', () => {
    seedSupersedeAudit({ ts: '2026-07-01T18:00:00Z' });
    const r = injectContext({ cwd: f.projectRoot, userDir: f.userDir, now: '2026-07-02T12:00:00Z' });
    expect(r.snapshot).toMatch(/state fact.*superseded/i);
    expect(r.snapshot).toContain('v9.9 cut-gate in progress');
    // Placement: after the preamble, before the tier body.
    const mentionIdx = r.snapshot.indexOf('superseded');
    const bodyIdx = r.snapshot.indexOf('project-soul-marker');
    expect(mentionIdx).toBeGreaterThan(-1);
    expect(mentionIdx).toBeLessThan(bodyIdx);
  });

  it('an entry older than 7 days → no mention', () => {
    seedSupersedeAudit({ ts: '2026-06-20T18:00:00Z' });
    const r = injectContext({ cwd: f.projectRoot, userDir: f.userDir, now: '2026-07-02T12:00:00Z' });
    expect(r.snapshot).not.toMatch(/auto-superseded/i);
  });

  it('no temporal entries → snapshot identical to the pre-66.4 shape (no mention machinery visible)', () => {
    const r = injectContext({ cwd: f.projectRoot, userDir: f.userDir, now: '2026-07-02T12:00:00Z' });
    expect(r.snapshot).not.toMatch(/auto-superseded/i);
  });

  it('cap composition: the mention is reserved OUT of the cap — snapshot ≤ capBytes EXACTLY (the §7.1.2 contract)', () => {
    seedSupersedeAudit({ ts: '2026-07-01T18:00:00Z' });
    // Big enough that the reserves (preamble ~611B + mention ~250B) leave room
    // for at least one tier block — the composition case under test is
    // "mention present AND body present", not the all-dropped empty snapshot.
    const cap = 2000;
    const r = injectContext({
      cwd: f.projectRoot, userDir: f.userDir, now: '2026-07-02T12:00:00Z', capBytes: cap,
    });
    expect(r.snapshot).not.toBe('');
    expect(r.snapshot).toContain('v9.9 cut-gate in progress');
    // Reserves are SUBTRACTED from the cap handed to truncation, so the final
    // snapshot honors capBytes exactly — a loose `cap + slack` bound here
    // would keep passing even if a reserve were deleted (skill-review I3).
    expect(Buffer.byteLength(r.snapshot, 'utf8')).toBeLessThanOrEqual(cap);
  });
});

describe('Task 150 — the memory-commit proposal line (ADR-0018: propose-and-approve, never kit-run git)', () => {
  let f;
  beforeEach(() => {
    f = makeFixture();
    seedThreeTierFixture(f);
  });
  afterEach(() => rmSync(f.sandbox, { recursive: true, force: true }));

  function gitInit() {
    // Skill-review I5: generous timeout (a warm commit measured 12s of the
    // old 15s budget on a loaded machine), HARD status assertion (a silently
    // failed setup commit produces a baffling downstream mismatch), and
    // --no-gpg-sign on commits (a runner with global commit.gpgsign=true
    // would hang the sandbox commit).
    const run = (args) => {
      const r = spawnSync('git', args, { cwd: f.projectRoot, windowsHide: true, timeout: 60000 });
      expect(r.status).toBe(0);
      return r;
    };
    run(['init', '-q']);
    run(['config', 'user.email', 'test@example.com']);
    run(['config', 'user.name', 'Test']);
    return run;
  }

  it('a git repo with UNCOMMITTED context/ files → ONE model-facing proposal line with the count', () => {
    gitInit();
    // seedThreeTierFixture already wrote context/ files; none are committed.
    // testGitTimeoutMs: under 5x-suite stress load a real git exceeds the
    // 400ms production leash and the line CORRECTLY degrades to silence —
    // presence-asserting tests inject a generous timeout (stress-run catch).
    const r = injectContext({
      cwd: f.projectRoot, userDir: f.userDir, now: '2026-07-02T12:00:00Z', testGitTimeoutMs: 30000,
    });
    expect(r.snapshot).toMatch(/uncommitted/i);
    expect(r.snapshot).toMatch(/offer the user a one-tap commit/i);
    // The kit proposes; it never instructs an unconditional commit.
    expect(r.snapshot).toMatch(/only act on their yes/i);
  });

  it('a git repo with context/ fully committed → NO proposal line', () => {
    const run = gitInit();
    run(['add', '.']);
    run(['commit', '-q', '--no-gpg-sign', '-m', 'seed']);
    const r = injectContext({ cwd: f.projectRoot, userDir: f.userDir, now: '2026-07-02T12:00:00Z' });
    expect(r.snapshot).not.toMatch(/one-tap commit/i);
  });

  it('a NON-git project → no proposal line (the .git gate returns before any spawn — which also makes this immune to a parent repo above tmpdir)', () => {
    const r = injectContext({ cwd: f.projectRoot, userDir: f.userDir, now: '2026-07-02T12:00:00Z' });
    expect(r.snapshot).not.toMatch(/one-tap commit/i);
  });

  it('context.local/ changes alone do NOT trigger the proposal (gitignored tier is not commit material)', () => {
    // NOTE (skill-review M3): the dirty context.local is BOTH gitignored AND
    // outside the `context/` pathspec — this pins the realistic install
    // shape; the pathspec exclusion alone is additionally guaranteed by the
    // spawn args (`-- context/`).
    const run = gitInit();
    // Commit context/ but leave context.local dirty — and gitignore it, as
    // cmk install does.
    writeFile(join(f.projectRoot, '.gitignore'), 'context.local/\n');
    run(['add', '.']);
    run(['commit', '-q', '--no-gpg-sign', '-m', 'seed']);
    writeFile(join(f.projectRoot, 'context.local', 'machine-paths.md'), '# changed\n\nnew line\n');
    const r = injectContext({ cwd: f.projectRoot, userDir: f.userDir, now: '2026-07-02T12:00:00Z' });
    expect(r.snapshot).not.toMatch(/one-tap commit/i);
  });

  it('cap composition: the proposal line is reserved OUT of the cap — snapshot ≤ capBytes EXACTLY', () => {
    gitInit();
    const cap = 2000;
    const r = injectContext({
      cwd: f.projectRoot, userDir: f.userDir, now: '2026-07-02T12:00:00Z', capBytes: cap,
      testGitTimeoutMs: 30000,
    });
    expect(r.snapshot).toMatch(/one-tap commit/i);
    expect(Buffer.byteLength(r.snapshot, 'utf8')).toBeLessThanOrEqual(cap);
  });

  it('THREE-reserve joint composition: preamble + temporal mention + commit proposal together, snapshot ≤ capBytes (skill-review I3)', () => {
    // The composition case no per-feature test sees: both volatile lines
    // present at once. Seed a recent temporal_supersede AND a dirty git repo.
    gitInit();
    const archivePath = join(
      f.projectRoot, 'context', 'memory', 'archive', 'superseded', 'P-TEMPA2B3.md',
    );
    writeFile(
      archivePath,
      '---\nid: P-TEMPA2B3\ntype: project\ntitle: v9.9 cut-gate in progress\nended_at: 2026-07-01T18:00:00Z\nstatus: completed\nsuperseded_by: P-TEMPC4D5\n---\n\nOld state.\n',
    );
    writeFile(
      join(f.projectRoot, 'context', '.locks', 'audit.log'),
      JSON.stringify({
        ts: '2026-07-01T18:00:00Z',
        action: 'temporal_supersede',
        tier: 'P',
        id: 'P-TEMPA2B3',
        paths: { archive: archivePath },
        extra: { supersededBy: 'P-TEMPC4D5', endedAt: '2026-07-01T18:00:00Z', judgedBy: 'temporal-sweep' },
      }) + '\n',
    );
    const cap = 2600; // room for all three reserves + at least one tier block
    const r = injectContext({
      cwd: f.projectRoot, userDir: f.userDir, now: '2026-07-02T12:00:00Z', capBytes: cap,
      testGitTimeoutMs: 30000,
    });
    expect(r.snapshot).toContain('v9.9 cut-gate in progress'); // the mention
    expect(r.snapshot).toMatch(/one-tap commit/i); // the proposal
    expect(r.snapshot).not.toBe('');
    expect(Buffer.byteLength(r.snapshot, 'utf8')).toBeLessThanOrEqual(cap);
  });
});

describe('Task 18 — bin/cmk-inject-context (hook handler — node bin)', () => {
  let sandbox;
  let projectRoot;
  let userDir;

  beforeEach(() => {
    const f = makeFixture();
    sandbox = f.sandbox;
    projectRoot = f.projectRoot;
    userDir = f.userDir;
    seedThreeTierFixture({ projectRoot, userDir });
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('exits 0 and stdout parses as the documented hookOutput JSON', () => {
    const r = spawnSync(process.execPath, [BIN_PATH], {
      input: JSON.stringify({ hook_event_name: 'SessionStart' }),
      encoding: 'utf8',
      cwd: projectRoot,
      env: { ...process.env, MEMORY_KIT_USER_DIR: userDir },
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed).toMatchObject({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: expect.any(String),
      },
    });
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      'project-memory-marker',
    );
  });

  // Note: the in-process injectContext() timing test above asserts the
  // NFR-1 500ms budget for the work the kit owns. We deliberately do NOT
  // assert a tight wall-clock budget on this bash + node wrapper path
  // because bash startup + node cold-start is a per-invocation overhead
  // the kit does not own (varies with disk warm-state, node binary, and
  // on Windows the bash provider — observed 500-2500ms variance during
  // development). Production hook timeout per design §5.1 is 30s, which
  // accommodates the cold-start envelope. If the wrapper ever started
  // looping or doing real work, the JSON-shape test above would catch
  // it long before a wall-clock budget would.
});

describe('Task 81 — lazy-compress spawn descriptor (Windows console-popup fix)', () => {
  it('with a present .mjs path → `node <path>` directly, windowsHide, NO shell (the popup fix)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cmk-lz-'));
    const mjs = join(tmp, 'cmk-compress-lazy.mjs');
    writeFileSync(mjs, '// stub\n');
    const d = lazyCompressSpawnDescriptor('/proj', mjs);
    // node binary, not the npm `.cmd` shim → no cmd.exe → no leaked console.
    expect(d.command).toBe(process.execPath);
    expect(d.args).toEqual([mjs]);
    expect(d.options.windowsHide).toBe(true);
    // shell:true is the popup cause — it MUST be absent on the direct path.
    expect(d.options.shell).toBeUndefined();
    expect(d.options.detached).toBe(true);
    expect(d.options.stdio).toBe('ignore');
    rmSync(tmp, { recursive: true, force: true });
  });

  it('with no/absent path → graceful shell:true bin fallback (corrupt install)', () => {
    const dNull = lazyCompressSpawnDescriptor('/proj', null);
    expect(dNull.command).toBe('cmk-compress-lazy');
    expect(dNull.options.shell).toBe(true);
    expect(dNull.options.windowsHide).toBe(true);
    // A path that doesn't exist also falls back (not just null).
    const dMissing = lazyCompressSpawnDescriptor('/proj', '/no/such/cmk-compress-lazy.mjs');
    expect(dMissing.command).toBe('cmk-compress-lazy');
    expect(dMissing.options.shell).toBe(true);
  });

  // The cross-agent console-popup fix (cut-gate-kiro live find): the no-popup
  // path only kicks in when injectContext gets a real compressLazyPath. The
  // Claude bin passed it; the Kiro `cmk hook agentSpawn` path did NOT → it hit
  // the shell:true `.cmd` shim that flashes a `node` console on Windows. The fix
  // moves resolution INTO injectContext (resolveCompressLazyPath), so every
  // caller — including the Kiro hook — gets the node-direct, no-popup descriptor.
  it('resolveCompressLazyPath() finds the real bin/cmk-compress-lazy.mjs', () => {
    const p = resolveCompressLazyPath();
    expect(p).toBeTruthy();
    expect(p.replace(/\\/g, '/')).toMatch(/bin\/cmk-compress-lazy\.mjs$/);
    expect(existsSync(p)).toBe(true);
  });

  it('the resolved default → a node-direct (NO shell) descriptor — the Kiro-path popup is gone', () => {
    // exactly what injectContext now uses by default when a caller (Kiro hook)
    // passes no compressLazyPath: resolve it, then build the descriptor.
    const d = lazyCompressSpawnDescriptor('/proj', resolveCompressLazyPath());
    expect(d.command).toBe(process.execPath); // node directly, not the .cmd shim
    expect(d.options.shell).toBeUndefined(); // shell:true is the popup cause
    expect(d.options.windowsHide).toBe(true);
  });

  it('respects $CMK_COMPRESS_LAZY_PATH override', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cmk-lzenv-'));
    const mjs = join(tmp, 'cmk-compress-lazy.mjs');
    writeFileSync(mjs, '// stub\n');
    const prev = process.env.CMK_COMPRESS_LAZY_PATH;
    process.env.CMK_COMPRESS_LAZY_PATH = mjs;
    try {
      expect(resolveCompressLazyPath()).toBe(mjs);
    } finally {
      if (prev === undefined) delete process.env.CMK_COMPRESS_LAZY_PATH;
      else process.env.CMK_COMPRESS_LAZY_PATH = prev;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('Task 75.0 — authoritative-memory preamble (D-64 / memory-os Ground Truth)', () => {
  let sandbox;
  let projectRoot;
  let userDir;

  beforeEach(() => {
    const f = makeFixture();
    sandbox = f.sandbox;
    projectRoot = f.projectRoot;
    userDir = f.userDir;
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('non-empty snapshot opens with the authoritative-memory preamble', () => {
    seedThreeTierFixture({ projectRoot, userDir });
    const r = injectContext({ cwd: projectRoot, userDir });
    // The preamble leads the snapshot — before any tier block.
    expect(r.snapshot.startsWith(AUTHORITATIVE_MEMORY_PREAMBLE)).toBe(true);
    const iPreamble = r.snapshot.indexOf('injected memory wins');
    const iFirstTier = r.snapshot.indexOf('local-paths-marker');
    expect(iPreamble).toBeGreaterThanOrEqual(0);
    expect(iFirstTier).toBeGreaterThan(iPreamble);
  });

  it('preamble carries the ranked ground-truth hierarchy + the key authority line', () => {
    // The memory-os Layer-07 near-verbatim core (D-73): ranking + "wins" + "novel".
    expect(AUTHORITATIVE_MEMORY_PREAMBLE).toContain('cmk search');
    expect(AUTHORITATIVE_MEMORY_PREAMBLE).toContain(
      'When injected memory contradicts your assumptions, injected memory wins',
    );
    expect(AUTHORITATIVE_MEMORY_PREAMBLE).toContain(
      'never treat a question as novel when the answer is already in your prompt',
    );
  });

  it('empty snapshot stays empty — no preamble without memory behind it', () => {
    // No tiers seeded at all.
    const r = injectContext({ cwd: projectRoot, userDir });
    expect(r.snapshot).toBe('');
    expect(r.hookOutput.hookSpecificOutput.additionalContext).toBe('');
  });

  it('preamble fits the §7.1 cap slack (Σ tier budgets 12,275 + preamble ≤ 13,000)', () => {
    // Composition guard: DEFAULT_CAP_BYTES(13000) − Σ TIER_BUDGETS(12275) = 725
    // bytes of slack. The preamble must fit inside it (with margin) so the
    // per-tier budget table never composes past the snapshot cap.
    expect(Buffer.byteLength(AUTHORITATIVE_MEMORY_PREAMBLE, 'utf8')).toBeLessThanOrEqual(700);
  });

  it('total snapshot (preamble + tiers) honors a custom capBytes', () => {
    seedThreeTierFixture({ projectRoot, userDir });
    const cap = 2000;
    const r = injectContext({ cwd: projectRoot, userDir, capBytes: cap });
    expect(r.bytes).toBeLessThanOrEqual(cap);
    expect(Buffer.byteLength(r.snapshot, 'utf8')).toBeLessThanOrEqual(cap);
  });

  it('over-mutation guard: tier content + dedup/truncation behavior unchanged by the preamble', () => {
    seedThreeTierFixture({ projectRoot, userDir });
    const r = injectContext({ cwd: projectRoot, userDir });
    // All three tier markers still present, still in L → P → U order.
    const iLocal = r.snapshot.indexOf('local-paths-marker');
    const iProject = r.snapshot.indexOf('project-memory-marker');
    const iUser = r.snapshot.indexOf('user-about-marker');
    expect(iLocal).toBeGreaterThan(-1);
    expect(iProject).toBeGreaterThan(iLocal);
    expect(iUser).toBeGreaterThan(iProject);
    // additionalContext still equals the snapshot (hook contract).
    expect(r.hookOutput.hookSpecificOutput.additionalContext).toBe(r.snapshot);
  });
});
