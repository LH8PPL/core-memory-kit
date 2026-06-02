// @doors: 1, 2, 5
// Door 3 N/A: weeklyCurate uses an injected CompressorBackend (MockHaikuBackend in tests); no subprocess spawn at this boundary. The bin wrapper's real-Haiku spawn is covered by spawn-smoke patterns in their own files (Task 34 spawn-smoke for cmk-weekly-curate is a v0.1.x candidate per design §16).
// Door 4 N/A: no message-queue interaction.

// Tests for Task 34 — Weekly curate cron (T-029).
// Per tasks.md 34.4 (4 cases):
//   1. Fixture with 14 days of files: first 7 moved chronologically to archive.md; originals deleted; recent week untouched
//   2. Bullets across days with similarity > 0.85: merged via task 10's canonicalize primitive; `merged_from` populated correctly
//   3. recent.md rebuilt from current 7 days
//   4. Idempotency: second run is no-op (archive doesn't grow further)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  weeklyCurate,
  dedupBullets,
} from '../packages/cli/src/weekly-curate.mjs';
import { MockHaikuBackend } from '../packages/cli/src/compressor.mjs';
import { install } from '../packages/cli/src/install.mjs';
import { touchCooldownMarker } from '../packages/cli/src/cooldown.mjs';

let sandbox;
let projectRoot;
let userDir;

async function makeFixture() {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-curate-test-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
}

function seedTodayFile(date, body) {
  const dir = join(projectRoot, 'context', 'sessions');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `today-${date}.md`);
  writeFileSync(path, body, 'utf8');
  return path;
}

function listSessions() {
  const dir = join(projectRoot, 'context', 'sessions');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => /^today-\d{4}-\d{2}-\d{2}\.md$/.test(n)).sort();
}

function mockBackend(...outputs) {
  return new MockHaikuBackend({
    responses: outputs.map((outputText) => ({
      outputText,
      inputTokens: 100,
      outputTokens: 50,
      costUSD: 0.0001,
      preservedIds: [],
    })),
  });
}

beforeEach(async () => {
  await makeFixture();
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('Task 34 — weeklyCurate', () => {
  describe('Validation (Door 1)', () => {
    it('rejects missing projectRoot', async () => {
      const r = await weeklyCurate({ backend: mockBackend('archive', 'recent') });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('missing_project_root');
    });

    it('rejects missing backend', async () => {
      const r = await weeklyCurate({ projectRoot });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('missing_backend');
    });

    it('rejects backend without compress() method', async () => {
      const r = await weeklyCurate({ projectRoot, backend: {} });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('missing_backend');
    });
  });

  describe('no-context-dir skip path', () => {
    it('returns skipped:no-context-dir when context/sessions/ is missing', async () => {
      // makeFixture installs the kit; remove sessions/ to exercise the guard
      rmSync(join(projectRoot, 'context', 'sessions'), { recursive: true, force: true });
      const r = await weeklyCurate({
        projectRoot,
        backend: mockBackend('archive', 'recent'),
      });
      expect(r.action).toBe('skipped');
      expect(r.reason).toBe('no-context-dir');
    });
  });

  describe('cooldown gating (composes with shared cooldown.mjs)', () => {
    it('returns skipped:cooldown when shared 120s marker is active', async () => {
      const now = '2026-05-28T09:00:00Z';
      touchCooldownMarker({ projectRoot, now });
      // Seed an OLD file so we know it's the cooldown gate skipping, not no-old-files.
      seedTodayFile('2026-05-10', '## Decisions\n- Old decision\n');
      const r = await weeklyCurate({
        projectRoot,
        backend: mockBackend('archive', 'recent'),
        now,
      });
      expect(r.action).toBe('skipped');
      expect(r.reason).toBe('cooldown');
      // OLD file untouched — cooldown gate fires BEFORE archive work
      expect(existsSync(join(projectRoot, 'context', 'sessions', 'today-2026-05-10.md'))).toBe(true);
    });
  });

  describe('faithfulness/grounding rule (Task 84 / D-36)', () => {
    it('the curate prompt carries the anti-hallucination grounding rule', async () => {
      // weekly-curate is the THIRD compressor layer (compress-session →
      // daily-distill → weekly-curate). The lior-test-6 Flask hallucination
      // only exercised the first two, but this consolidator has the same
      // power to invent facts into archive.md → it gets the same general,
      // example-free grounding rule.
      const now = '2026-05-28T09:00:00Z';
      seedTodayFile('2026-05-10', '## Decisions\n- Old decision #P-A2B2C3D4\n');
      const backend = mockBackend('## Week of 2026-05-04\n- summary', 'recent');
      await weeklyCurate({ projectRoot, backend, now });
      const instructions = backend.calls[0].instructions ?? '';
      expect(instructions).toMatch(/grounded in the daily summaries/i);
      expect(instructions).toMatch(/do not infer or add any fact not explicitly present/i);
    });
  });

  describe('34.4 #1 — 14-day fixture: first 7 moved to archive, last 7 untouched, originals deleted', () => {
    it('archives old today-*.md (>7d) and preserves current week', async () => {
      const now = '2026-05-28T09:00:00Z';
      const oldDays = [
        '2026-05-13', '2026-05-14', '2026-05-15', '2026-05-16',
        '2026-05-17', '2026-05-18', '2026-05-19',
      ];
      const currentDays = [
        '2026-05-22', '2026-05-23', '2026-05-24', '2026-05-25',
        '2026-05-26', '2026-05-27', '2026-05-28',
      ];
      for (const d of oldDays) {
        seedTodayFile(d, `## Decisions\n- Old decision on ${d}\n`);
      }
      for (const d of currentDays) {
        seedTodayFile(d, `## Decisions\n- Current decision on ${d}\n`);
      }

      const archiveOutput = '## Week of 2026-05-11\n\n- Consolidated old decisions\n';
      const recentOutput = '## Decisions\n\n- Current week summary\n';
      const backend = mockBackend(archiveOutput, recentOutput);

      const r = await weeklyCurate({ projectRoot, backend, now });

      // Response (Door 1): action: 'curated', counts populated
      expect(r.action).toBe('curated');
      expect(r.archivedDays).toBe(7);
      expect(r.currentDays).toBe(7);
      expect(r.bytesIn).toBeGreaterThan(0);
      expect(r.bytesOut).toBeGreaterThan(0);

      // State (Door 2): archive.md exists + contains the consolidated output
      const archivePath = join(projectRoot, 'context', 'sessions', 'archive.md');
      expect(existsSync(archivePath)).toBe(true);
      const archive = readFileSync(archivePath, 'utf8');
      expect(archive).toContain('## Week of 2026-05-11');

      // State: OLD files deleted, CURRENT files preserved
      const remaining = listSessions();
      expect(remaining).toEqual(currentDays.map((d) => `today-${d}.md`));

      // State: recent.md rebuilt
      const recentPath = join(projectRoot, 'context', 'sessions', 'recent.md');
      expect(existsSync(recentPath)).toBe(true);
      expect(readFileSync(recentPath, 'utf8')).toContain('Current week summary');
    });

    it('over-mutation guard: archives only OLD files; CURRENT files are untouched', async () => {
      // Seed 7 OLD + 7 CURRENT; assert exactly 7 deletions
      const now = '2026-05-28T09:00:00Z';
      const allDays = [
        // OLD (>7d)
        '2026-05-10', '2026-05-12', '2026-05-15', '2026-05-18',
        '2026-05-19', '2026-05-20', '2026-05-21',
        // CURRENT (≤7d)
        '2026-05-22', '2026-05-24', '2026-05-26', '2026-05-28',
      ];
      const expectedCurrent = ['2026-05-22', '2026-05-24', '2026-05-26', '2026-05-28'];
      for (const d of allDays) {
        seedTodayFile(d, `## Decisions\n- ${d}\n`);
      }
      const backend = mockBackend('## Week of 2026-05-04\n\n- consolidated\n', '## Decisions\n\n- current\n');
      await weeklyCurate({ projectRoot, backend, now });
      const remaining = listSessions();
      expect(remaining).toEqual(expectedCurrent.map((d) => `today-${d}.md`));
    });
  });

  describe('34.4 #2 — bullet dedup via canonicalize primitive: merged_from populated', () => {
    it('collapses canonicalize-equal bullets across days into one with merged_from', async () => {
      // The dedup pass runs on Haiku's output. We feed Haiku an output that
      // contains 3 canonicalize-equal bullets within a single week section;
      // expected: 1 consolidated bullet + 1 merged_from comment line.
      const now = '2026-05-28T09:00:00Z';
      const oldDays = ['2026-05-13', '2026-05-14', '2026-05-15'];
      for (const d of oldDays) {
        seedTodayFile(d, `## Decisions\n- shared decision\n`);
      }
      // Haiku's output: 3 bullets that canonicalize to the same string
      const archiveOutput = [
        '## Week of 2026-05-11',
        '',
        '- Shared decision.',
        '- shared decision',
        '- SHARED DECISION',
        '',
      ].join('\n');
      const backend = mockBackend(archiveOutput, '## Decisions\n- nothing\n');
      const r = await weeklyCurate({ projectRoot, backend, now });
      expect(r.action).toBe('curated');

      const archive = readFileSync(join(projectRoot, 'context', 'sessions', 'archive.md'), 'utf8');
      // Only the FIRST canonical match should appear; the rest collapsed
      // into a merged_from comment line.
      expect(archive).toContain('- Shared decision.');
      expect(archive).not.toContain('- shared decision\n');
      expect(archive).not.toContain('- SHARED DECISION');

      // merged_from comment is on its own line, lists all 3 source dates
      expect(archive).toMatch(/<!-- merged_from: \['2026-05-13', '2026-05-14', '2026-05-15'\] -->/);
    });

    it('preserves canonicalize-distinct bullets (no false merge)', async () => {
      const now = '2026-05-28T09:00:00Z';
      seedTodayFile('2026-05-13', '## Decisions\n- A\n- B\n');
      seedTodayFile('2026-05-14', '## Decisions\n- C\n');
      const archiveOutput = [
        '## Week of 2026-05-11',
        '',
        '- Decision A.',
        '- Decision B.',
        '- Decision C.',
        '',
      ].join('\n');
      const backend = mockBackend(archiveOutput, '## Decisions\n- nothing\n');
      await weeklyCurate({ projectRoot, backend, now });
      const archive = readFileSync(join(projectRoot, 'context', 'sessions', 'archive.md'), 'utf8');
      expect(archive).toContain('- Decision A.');
      expect(archive).toContain('- Decision B.');
      expect(archive).toContain('- Decision C.');
      // No merged_from comment because no merge happened
      expect(archive).not.toContain('merged_from');
    });
  });

  describe('34.4 #3 — recent.md rebuilt from current 7 days', () => {
    it('calls dailyDistill inline for current week, recent.md reflects new output', async () => {
      const now = '2026-05-28T09:00:00Z';
      // 2 OLD files + 3 CURRENT
      seedTodayFile('2026-05-10', '## Decisions\n- old\n');
      seedTodayFile('2026-05-12', '## Decisions\n- old\n');
      seedTodayFile('2026-05-26', '## Decisions\n- recent A\n');
      seedTodayFile('2026-05-27', '## Decisions\n- recent B\n');
      seedTodayFile('2026-05-28', '## Decisions\n- recent C\n');

      const archiveOutput = '## Week of 2026-05-04\n\n- consolidated old\n';
      const recentOutput = '## Decisions\n\n- recent A, B, C consolidated\n';
      const backend = mockBackend(archiveOutput, recentOutput);

      const r = await weeklyCurate({ projectRoot, backend, now });
      expect(r.action).toBe('curated');
      expect(r.archivedDays).toBe(2);
      expect(r.currentDays).toBe(3);
      expect(r.recentPath).toMatch(/recent\.md$/);

      // Two backend.compress calls fired (archive + recent)
      expect(backend.calls.length).toBe(2);

      const recent = readFileSync(join(projectRoot, 'context', 'sessions', 'recent.md'), 'utf8');
      expect(recent).toContain('recent A, B, C consolidated');
    });

    it('honors skipRecentRebuild: only 1 backend call, recent.md untouched', async () => {
      const now = '2026-05-28T09:00:00Z';
      seedTodayFile('2026-05-10', '## Decisions\n- old\n');
      seedTodayFile('2026-05-28', '## Decisions\n- current\n');
      const backend = mockBackend('## Week of 2026-05-04\n\n- consolidated\n');
      const r = await weeklyCurate({
        projectRoot, backend, now, skipRecentRebuild: true,
      });
      expect(r.action).toBe('curated');
      expect(backend.calls.length).toBe(1); // archive call only
      expect(r.recentPath).toBeUndefined();
      // recent.md should not be created by this run
      expect(existsSync(join(projectRoot, 'context', 'sessions', 'recent.md'))).toBe(false);
    });
  });

  describe('34.4 #4 — idempotency: second run with no OLD files is a no-op', () => {
    it('after curate, re-running on current-only fixture returns skipped:no-old-files; archive size unchanged', async () => {
      const now = '2026-05-28T09:00:00Z';
      seedTodayFile('2026-05-10', '## Decisions\n- old\n');
      seedTodayFile('2026-05-28', '## Decisions\n- current\n');
      const backend1 = mockBackend('## Week of 2026-05-04\n\n- consolidated\n', '## Decisions\n- current\n');
      const r1 = await weeklyCurate({ projectRoot, backend: backend1, now });
      expect(r1.action).toBe('curated');
      const archivePath = join(projectRoot, 'context', 'sessions', 'archive.md');
      const archiveSize1 = readFileSync(archivePath, 'utf8').length;

      // Cooldown is active now (touched by run #1). Pass a much later `now`
      // so the cooldown gate doesn't fire — we want to exercise the
      // no-old-files branch specifically.
      const later = '2026-05-29T09:00:00Z';
      const backend2 = mockBackend('should-not-be-called', 'should-not-be-called');
      const r2 = await weeklyCurate({ projectRoot, backend: backend2, now: later });
      expect(r2.action).toBe('skipped');
      expect(r2.reason).toBe('no-old-files');
      expect(backend2.calls.length).toBe(0);

      // Archive file size MUST be identical — no growth on re-run
      const archiveSize2 = readFileSync(archivePath, 'utf8').length;
      expect(archiveSize2).toBe(archiveSize1);
    });
  });

  describe('Door 5 — NDJSON curate.log observability', () => {
    it('writes a success entry on curate path', async () => {
      const now = '2026-05-28T09:00:00Z';
      seedTodayFile('2026-05-10', '## Decisions\n- old\n');
      seedTodayFile('2026-05-28', '## Decisions\n- current\n');
      const backend = mockBackend('## Week of 2026-05-04\n\n- consolidated\n', '## Decisions\n- current\n');
      await weeklyCurate({ projectRoot, backend, now });
      const logPath = join(projectRoot, 'context', 'sessions', '2026-05-28.curate.log');
      expect(existsSync(logPath)).toBe(true);
      const entry = JSON.parse(readFileSync(logPath, 'utf8').trim().split('\n')[0]);
      expect(entry.scope).toBe('weekly-curate');
      expect(entry.success).toBe(true);
      expect(entry.archived_days).toBe(1);
      expect(entry.current_days).toBe(1);
    });

    it('writes a failure entry on Haiku error', async () => {
      const now = '2026-05-28T09:00:00Z';
      seedTodayFile('2026-05-10', '## Decisions\n- old\n');
      const backend = new MockHaikuBackend({ throwError: new Error('haiku-crash') });
      const r = await weeklyCurate({ projectRoot, backend, now });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('compress_failed');
      const logPath = join(projectRoot, 'context', 'sessions', '2026-05-28.curate.log');
      expect(existsSync(logPath)).toBe(true);
      const entry = JSON.parse(readFileSync(logPath, 'utf8').trim().split('\n')[0]);
      expect(entry.success).toBe(false);
      expect(entry.error_category).toBe('compress_failed');
    });

    it('M6 fix: error path touches cooldown marker (fail-loud over re-cost)', async () => {
      const now = '2026-05-28T09:00:00Z';
      seedTodayFile('2026-05-10', '## Decisions\n- old\n');
      const backend = new MockHaikuBackend({ throwError: new Error('haiku-crash') });
      await weeklyCurate({ projectRoot, backend, now });
      // Cooldown marker should exist after the failed Haiku call —
      // analogous to daily-distill's documented "touch on success +
      // error" contract per design §8.6.1.
      const markerPath = join(projectRoot, 'context', '.locks', 'last-haiku-call.ts');
      expect(existsSync(markerPath)).toBe(true);
    });
  });

  describe('I2 fix: cooldown-skip NDJSON entry has null model_id (truth-in-logging)', () => {
    it('does NOT record model_id when Haiku was never called', async () => {
      const now = '2026-05-28T09:00:00Z';
      touchCooldownMarker({ projectRoot, now });
      seedTodayFile('2026-05-10', '## Decisions\n- old\n');
      await weeklyCurate({
        projectRoot,
        backend: mockBackend('archive', 'recent'),
        now,
      });
      const logPath = join(projectRoot, 'context', 'sessions', '2026-05-28.curate.log');
      const entry = JSON.parse(readFileSync(logPath, 'utf8').trim().split('\n')[0]);
      expect(entry.skipped_reason).toBe('cooldown');
      expect(entry.model_id).toBeNull();
    });
  });

  describe('M4 fix: recentMaxBytes plumbs through to inline dailyDistill', () => {
    it('passes recentMaxBytes as maxOutputBytes to the inner dailyDistill call', async () => {
      const now = '2026-05-28T09:00:00Z';
      seedTodayFile('2026-05-10', '## Decisions\n- old\n');
      seedTodayFile('2026-05-28', '## Decisions\n- current\n');
      const backend = mockBackend('## Week of 2026-05-04\n\n- consolidated\n', '## Decisions\n- recent\n');
      await weeklyCurate({
        projectRoot, backend, now, recentMaxBytes: 1024,
      });
      // calls[0] = archive Haiku call; calls[1] = inline dailyDistill's Haiku call
      expect(backend.calls.length).toBe(2);
      expect(backend.calls[1].maxOutputBytes).toBe(1024);
    });
  });
});

describe('Task 34 — dedupBullets I1 contract: pre-section bullets pass through verbatim (no implicit-section dedup)', () => {
  it('bullets BEFORE any `## Week of` heading pass through unchanged with no merged_from', () => {
    const input = [
      '- pre-header bullet A',
      '- pre-header bullet B',
      '## Week of 2026-05-11',
      '- in-section bullet',
    ].join('\n');
    const out = dedupBullets(input, ['2026-05-11', '2026-05-12']);
    expect(out).toContain('- pre-header bullet A');
    expect(out).toContain('- pre-header bullet B');
    expect(out).not.toContain('merged_from');
  });

  it('S5 fix: non-week `## ` headings reset section state (no false merge across section types)', () => {
    const input = [
      '## Week of 2026-05-11',
      '- shared bullet',
      '## Decisions',
      '- shared bullet',
    ].join('\n');
    // The `## Decisions` heading resets inWeekSection=false; the
    // second `- shared bullet` is in a non-week section and should
    // NOT merge with the first.
    const out = dedupBullets(input, ['2026-05-11', '2026-05-12']);
    expect(out.match(/- shared bullet/g).length).toBe(2);
    expect(out).not.toContain('merged_from');
  });
});

describe('Task 34 — register-crons unregister idempotency (skill-review I3)', () => {
  it('runRegisterCrons --unregister is idempotent in dry-run when only daily was registered', async () => {
    // Cover the case where existing v0.1.0 users only had daily-distill
    // registered (pre-Task-34). Re-running register-crons --unregister
    // should produce TWO command lines (daily + weekly) without error.
    const { unregisterCron, CRON_ENTRY_NAME, WEEKLY_ENTRY_NAME } = await import(
      '../packages/cli/src/register-crons.mjs'
    );
    const r1 = unregisterCron({ entryName: CRON_ENTRY_NAME, dryRun: true });
    const r2 = unregisterCron({ entryName: WEEKLY_ENTRY_NAME, dryRun: true });
    expect(r1.action).toBe('dry-run');
    expect(r2.action).toBe('dry-run');
    // Two distinct entry-name interpolations
    expect(r1.command).toContain(CRON_ENTRY_NAME);
    expect(r2.command).toContain(WEEKLY_ENTRY_NAME);
    expect(r1.command).not.toBe(r2.command);
  });

  it('registerCron rejects invalid entryName at validation boundary', async () => {
    // Defensive: entryName goes into shell-line + plist label + schtasks
    // identifier; non-trivial chars would break the platform commands.
    const { registerCron } = await import('../packages/cli/src/register-crons.mjs');
    const r = registerCron({
      command: 'cmk-x',
      entryName: 'bad name with spaces',
      dryRun: true,
    });
    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('schema');
  });
});

describe('Task 34 — dedupBullets (pure-function unit tests)', () => {
  it('returns input unchanged when no week sections present', () => {
    const input = 'preamble\nrandom text';
    expect(dedupBullets(input, [])).toBe(input);
  });

  it('preserves single bullet per week section', () => {
    const input = '## Week of 2026-05-11\n\n- one bullet\n';
    const out = dedupBullets(input, ['2026-05-11']);
    expect(out).toContain('- one bullet');
    expect(out).not.toContain('merged_from');
  });

  it('collapses duplicates within a week section', () => {
    const input = [
      '## Week of 2026-05-11',
      '',
      '- Same thing.',
      '- same thing',
      '',
    ].join('\n');
    const out = dedupBullets(input, ['2026-05-11', '2026-05-12']);
    expect(out).toMatch(/- Same thing\./);
    expect(out.match(/- same thing/gi).length).toBe(1);
    expect(out).toContain("merged_from: ['2026-05-11', '2026-05-12']");
  });

  it('treats different week sections independently (no cross-week merge)', () => {
    const input = [
      '## Week of 2026-05-11',
      '- shared',
      '## Week of 2026-05-18',
      '- shared',
    ].join('\n');
    const out = dedupBullets(input, ['2026-05-11', '2026-05-18']);
    // Both weeks keep their bullet; no merge across weeks
    expect(out.match(/- shared/g).length).toBe(2);
  });
});
