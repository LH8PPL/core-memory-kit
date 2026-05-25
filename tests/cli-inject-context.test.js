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
import { injectContext } from '../packages/cli/src/inject-context.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const BIN_PATH = join(REPO_ROOT, 'plugin', 'bin', 'cmk-inject-context');

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

    it('default install seed-content fixture → ALL 3 tiers reach the snapshot, no drops', async () => {
      // Use the real install module so we test against the actual
      // seed-template byte sizes shipped in template/ — this pins the
      // "user tier survives default install" contract.
      const { install } = await import('../packages/cli/src/install.mjs');
      await install({ projectRoot, userTier: userDir });

      // No explicit capBytes — exercises the default cap (13000 per
      // PR-B's coordination fix). The contract that matters:
      // - All 3 tier markers present
      // - User-tier seed bullets reach Claude (the load-bearing
      //   regression test for the PR-25 finding)
      // - NO whole-tier drops (no legacy dropped_tiers events)
      //
      // Note: tier_truncated_to_budget events ARE acceptable on the P
      // tier in default install — memory/INDEX.md.template (~1963 bytes
      // of reference documentation) is NOT a per-file-capped scratchpad
      // per Task 12, so it isn't counted in the P=4300 budget. It gets
      // section-truncated from the tail per design §7.1's section-
      // granular truncator, which preserves SOUL.md and MEMORY.md
      // intact. INDEX itself is reference text the user can read on
      // demand if needed; cap pressure on it is acceptable. Future
      // work may move INDEX out of the snapshot composition entirely.
      const r = injectContext({ cwd: projectRoot, userDir });

      // All three tier markers present in the snapshot.
      expect(r.snapshot).toContain('<!-- cmk: local tier (L) -->');
      expect(r.snapshot).toContain('<!-- cmk: project tier (P) -->');
      expect(r.snapshot).toContain('<!-- cmk: user tier (U) -->');

      // Substantive USER-tier content reaches Claude — at least one of
      // the frozen seed bullets from each user-tier scratchpad. This is
      // the PR-25 regression test: pre-PR-25, the user tier was dropped
      // wholesale on every default install.
      expect(r.snapshot).toContain('U-PRNQKRaC'); // USER.md About
      expect(r.snapshot).toContain('U-CEKUY3H4'); // HABITS.md Iteration Cadence
      expect(r.snapshot).toContain('U-RDBNQSL7'); // LESSONS.md Tooling Lessons

      // PR-B contract: NO legacy whole-tier drops on default install.
      // Per-tier section-truncations (graceful degradation) are
      // acceptable on the P tier due to INDEX content; see comment
      // above.
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
});

describe('Task 18 — bin/cmk-inject-context (hook bash wrapper)', () => {
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
    const r = spawnSync('bash', [BIN_PATH], {
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
