// @doors: 1, 2
// Door 3 N/A: repair/roll use injected backend + injected reindexer; no subprocess at this boundary.
// Door 4 N/A: no NDJSON observability — dispatcher modules return result structs (underlying compress-session / daily-distill / weekly-curate emit their own NDJSON).
// Door 5 N/A: no message-queue interaction.

// Tests for Task 39 — cmk repair + cmk roll (T-033).
// Per tasks.md 39.6:
//   - cmk repair twice in a row: second run produces no file changes (mtime check)
//   - --locks: fresh 30-min lock NOT removed; stale 2-h lock removed
//   - --hooks re-registers all kit hooks; subsequent run is no-op
//   - --index invokes reindexFull
//   - cmk roll --scope today invokes daily-distill path
//   - cmk roll --scope recent invokes weekly-curate path
//   - cmk roll default = --scope now (compress-session)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRepair } from '../packages/cli/src/repair.mjs';
import { runRoll, ROLL_SCOPES } from '../packages/cli/src/roll.mjs';
import { MockHaikuBackend } from '../packages/cli/src/compressor.mjs';
import { install } from '../packages/cli/src/install.mjs';
import { readAuditLog } from '../packages/cli/src/audit-log.mjs';

let sandbox;
let projectRoot;
let userDir;

async function makeFixture() {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-repair-roll-test-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  // noHooks: scaffold-only. As of Task 49 `install` wires hooks by
  // default; the --hooks repair tests below need settings.json to start
  // ABSENT (or stale) so repair has something to do. (install→repair
  // sharing the same writeKitHooks boundary is its own contract; the
  // install-side wiring is covered in cli-install-hooks.test.js.)
  await install({ projectRoot, userTier: userDir, noHooks: true });
}

function seedLock(name, ageMs) {
  const dir = join(projectRoot, 'context', '.locks');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, '999999\n', 'utf8'); // PID unlikely to be alive
  if (ageMs !== undefined) {
    const t = (Date.now() - ageMs) / 1000;
    utimesSync(path, t, t);
  }
  return path;
}

function mockBackend(...outputs) {
  return new MockHaikuBackend({
    responses: outputs.map((outputText) => ({
      outputText,
      inputTokens: 50,
      outputTokens: 25,
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

describe('Task 39 — runRepair', () => {
  describe('Validation (Door 1)', () => {
    it('rejects missing projectRoot', async () => {
      const r = await runRepair({});
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('missing_project_root');
    });

    it('rejects invalid scope', async () => {
      const r = await runRepair({ projectRoot, scope: 'bogus' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });
  });

  describe('39.1 — --hooks merges canonical kit hooks into settings.json', () => {
    it('creates .claude/settings.json with kit hooks when missing', async () => {
      const settingsPath = join(projectRoot, '.claude', 'settings.json');
      expect(existsSync(settingsPath)).toBe(false);
      const r = await runRepair({ projectRoot, userDir, scope: 'hooks' });
      expect(r.action).toBe('completed');
      const hooks = r.repairs.find((x) => x.kind === 'hooks');
      expect(hooks.changed).toBe(true);
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      expect(settings.hooks.SessionStart).toBeTruthy();
      expect(JSON.stringify(settings.hooks)).toContain('cmk-inject-context');
      expect(JSON.stringify(settings.hooks)).toContain('cmk-capture-turn');
      expect(JSON.stringify(settings.hooks)).toContain('cmk-compress-session');
    });

    it('idempotent: second run produces no changes (mtime stable)', async () => {
      const settingsPath = join(projectRoot, '.claude', 'settings.json');
      await runRepair({ projectRoot, userDir, scope: 'hooks' });
      const mtime1 = statSync(settingsPath).mtimeMs;

      await new Promise((resolve) => setTimeout(resolve, 20));

      const r2 = await runRepair({ projectRoot, userDir, scope: 'hooks' });
      const mtime2 = statSync(settingsPath).mtimeMs;
      const hooks = r2.repairs.find((x) => x.kind === 'hooks');
      expect(hooks.changed).toBe(false);
      expect(mtime2).toBe(mtime1);
    });

    it('preserves non-kit user hook entries', async () => {
      const settingsPath = join(projectRoot, '.claude', 'settings.json');
      mkdirSync(join(projectRoot, '.claude'), { recursive: true });
      writeFileSync(
        settingsPath,
        JSON.stringify({
          permissions: { allow: ['Read'] },
          hooks: {
            SessionStart: [
              { hooks: [{ command: 'my-custom-hook.sh' }] },
            ],
          },
        }),
        'utf8',
      );
      await runRepair({ projectRoot, userDir, scope: 'hooks' });
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      // User's custom hook preserved
      expect(JSON.stringify(settings.hooks.SessionStart)).toContain('my-custom-hook.sh');
      // Kit hook also present
      expect(JSON.stringify(settings.hooks.SessionStart)).toContain('cmk-inject-context');
      // User's permissions preserved AND the kit's own allow-list added (Task 79:
      // cmk install/repair allow-lists Bash(cmk:*) so explicit captures don't prompt).
      expect(settings.permissions.allow).toContain('Read');
      expect(settings.permissions.allow).toContain('Bash(cmk:*)');
    });
  });

  describe('39.2 — --locks removes stale > cutoff, preserves fresh', () => {
    it('removes 2h-old stale lock, preserves 30min-old', async () => {
      const stalePath = seedLock('stale.lock', 2 * 60 * 60 * 1000); // 2h old
      const freshPath = seedLock('fresh.lock', 30 * 60 * 1000); // 30min old

      const r = await runRepair({ projectRoot, userDir, scope: 'locks' });
      const locks = r.repairs.find((x) => x.kind === 'locks');
      expect(locks.changed).toBe(true);
      expect(existsSync(stalePath)).toBe(false);
      expect(existsSync(freshPath)).toBe(true);
    });

    it('changed:false when no stale locks present', async () => {
      const r = await runRepair({ projectRoot, userDir, scope: 'locks' });
      const locks = r.repairs.find((x) => x.kind === 'locks');
      expect(locks.changed).toBe(false);
    });
  });

  describe('39.3 — --index invokes reindexer', () => {
    it('calls injected reindexer + reports changed:true', async () => {
      let called = 0;
      const reindexer = async () => {
        called += 1;
        return { observationsIndexed: 42 };
      };
      const r = await runRepair({
        projectRoot,
        userDir,
        scope: 'index',
        reindexer,
      });
      const index = r.repairs.find((x) => x.kind === 'index');
      expect(called).toBe(1);
      expect(index.changed).toBe(true);
    });

    it('captures reindex errors gracefully', async () => {
      const reindexer = async () => {
        throw new Error('db locked');
      };
      const r = await runRepair({
        projectRoot,
        userDir,
        scope: 'index',
        reindexer,
      });
      const index = r.repairs.find((x) => x.kind === 'index');
      expect(index.changed).toBe(false);
      expect(index.error).toMatch(/reindex failed: db locked/);
      expect(r.errors).toBeGreaterThanOrEqual(1);
    });

    // Cut-gate v0.3.1 finding: the REAL reindexFull needs a `db` argument
    // (it calls db.exec), but repairIndex called it without one — so
    // `cmk repair --index` / `--all` threw "Cannot read properties of
    // undefined (reading 'exec')" since Task 49. Every prior test injected a
    // reindexer mock, so the real call-shape contract was never exercised
    // (the seam-injection blind spot). This test uses the PRODUCTION path
    // (no injected reindexer) against a real installed project.
    it('repair --index runs the REAL reindexFull (opens its own db) — no injected reindexer', async () => {
      const { install } = await import('../packages/cli/src/install.mjs');
      await install({ projectRoot, userTier: userDir });
      // Seed a fact so reindex has something to index.
      const { writeFact } = await import('../packages/cli/src/write-fact.mjs');
      writeFact({
        tier: 'P', type: 'project', slug: 'repair-real-reindex',
        title: 'real reindex seed', body: 'the staging cluster deploys weekly',
        writeSource: 'user-explicit', trust: 'high',
        sourceFile: 'test', sourceLine: 1, sourceSha1: 'abc', projectRoot,
      });
      const r = await runRepair({ projectRoot, userDir, scope: 'index' }); // NO reindexer
      const index = r.repairs.find((x) => x.kind === 'index');
      expect(index.changed).toBe(true);
      expect(index.error).toBeUndefined();
      expect(r.errors).toBe(0);
    });
  });

  describe('scope: all (default) runs all three', () => {
    it('produces 4 repair entries: hooks, locks, index, format', async () => {
      const reindexer = async () => ({ observationsIndexed: 0 });
      const r = await runRepair({
        projectRoot,
        userDir,
        scope: 'all',
        reindexer,
      });
      const kinds = r.repairs.map((x) => x.kind);
      expect(kinds).toEqual(['hooks', 'locks', 'index', 'format']); // format added (Task 164.9)
    });
  });

  describe('I1 fix — embedded KIT_HOOKS_BLOCK works without plugin/hooks/hooks.json', () => {
    it('repairHooks succeeds even if plugin/hooks/hooks.json is absent (validates npm-install-g posture)', async () => {
      // The test installs the kit to a tempdir which has NO plugin/ tree
      // by definition — same shape as a `npm install -g` install. If
      // repairHooks were still reading from plugin/hooks/hooks.json
      // via __dirname walking, this would fail with "kit hooks template
      // missing". After the I1 fix (inlined KIT_HOOKS_BLOCK), it
      // succeeds regardless of plugin/ presence.
      //
      // Task 49 (2026-05-29): the block moved to settings-hooks.mjs and
      // switched from the plugin form (6 events incl. Setup) to the
      // npm-route form (5 functional events, bare PATH-resolved bin names)
      // so repaired hooks work with no plugin loaded — matching
      // `cmk install`. Setup/cmk-version-check is intentionally dropped
      // (not-yet-implemented stub; no node bin ships for it). The plugin
      // form still lives in plugin/hooks/hooks.json for the plugin route.
      const r = await runRepair({ projectRoot, userDir, scope: 'hooks' });
      expect(r.action).toBe('completed');
      const hooks = r.repairs.find((x) => x.kind === 'hooks');
      expect(hooks.error).toBeUndefined();
      expect(hooks.changed).toBe(true);
      expect(hooks.events).toEqual([
        'PreToolUse', // the memory delete-guardrail (D-192)
        'SessionStart',
        'UserPromptSubmit',
        'PostToolUse',
        'Stop',
        'SessionEnd',
      ]);
    });

    it('repaired hook commands are PATH-resolved bare bin names (npm route), NOT ${CLAUDE_PLUGIN_ROOT}', async () => {
      const settingsPath = join(projectRoot, '.claude', 'settings.json');
      await runRepair({ projectRoot, userDir, scope: 'hooks' });
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      const allCommands = JSON.stringify(settings.hooks);
      expect(allCommands).toContain('cmk-inject-context');
      // npm route uses bare names in shell form — no plugin-root, no bash wrapper
      expect(allCommands).not.toContain('CLAUDE_PLUGIN_ROOT');
      expect(settings.hooks.SessionStart[0].hooks[0].command).toBe('cmk-inject-context');
      // shell form: no `args` key (exec form would break on Windows npm shims)
      expect(settings.hooks.SessionStart[0].hooks[0].args).toBeUndefined();
    });
  });

  describe('164.9 — --format migrates DECISIONS.md to lint-clean headings', () => {
    const OLD_JOURNAL = [
      '# Decisions',
      '',
      '<!-- decision:P-AAAAAAAA -->',
      '### embedder ladder policy',
      '**When:** 2026-06-10 · **Fact:** `P-AAAAAAAA`',
      '**Why:** the benchmark decides',
      '',
    ].join('\n');

    it('rewrites old `### ` entries to `## ` + blank-surrounded (changed:true)', async () => {
      mkdirSync(join(projectRoot, 'context'), { recursive: true });
      const path = join(projectRoot, 'context', 'DECISIONS.md');
      writeFileSync(path, OLD_JOURNAL, 'utf8');

      const r = await runRepair({ projectRoot, userDir, scope: 'format' });
      const fmt = r.repairs.find((x) => x.kind === 'format');
      expect(fmt.changed).toBe(true);

      const after = readFileSync(path, 'utf8');
      expect(after).not.toMatch(/^### /m);
      expect(after).toMatch(/<!-- decision:P-AAAAAAAA -->\n\n## embedder ladder policy\n\n/);
      // content preserved (append-only safety)
      expect(after).toContain('**Why:** the benchmark decides');
    });

    it('is idempotent — a second --format on clean content is changed:false', async () => {
      mkdirSync(join(projectRoot, 'context'), { recursive: true });
      const path = join(projectRoot, 'context', 'DECISIONS.md');
      writeFileSync(path, OLD_JOURNAL, 'utf8');
      await runRepair({ projectRoot, userDir, scope: 'format' });
      const r2 = await runRepair({ projectRoot, userDir, scope: 'format' });
      const fmt = r2.repairs.find((x) => x.kind === 'format');
      expect(fmt.changed).toBe(false);
    });

    it('no DECISIONS.md → changed:false, no error', async () => {
      const r = await runRepair({ projectRoot, userDir, scope: 'format' });
      const fmt = r.repairs.find((x) => x.kind === 'format');
      expect(fmt.changed).toBe(false);
      expect(fmt.error).toBeUndefined();
    });
  });

  describe('I3 fix — Door-4 audit-log entries (REPAIR_HOOKS_APPLIED / REPAIR_LOCK_REMOVED)', () => {
    it('emits REPAIR_HOOKS_APPLIED on changed=true', async () => {
      await runRepair({ projectRoot, userDir, scope: 'hooks' });
      const entries = readAuditLog(join(projectRoot, 'context'));
      const hookEntry = entries.find(
        (e) => e.reasonCode === 'repair-hooks-applied',
      );
      expect(hookEntry).toBeTruthy();
      expect(hookEntry.schema).toBe(1);
      expect(hookEntry.action).toBe('repair');
      expect(hookEntry.tier).toBe('P');
      expect(hookEntry.id).toBe('P-RPHKAPLD');
      expect(hookEntry.extra?.events).toEqual(
        expect.arrayContaining(['SessionStart', 'Stop', 'SessionEnd']),
      );
    });

    it('emits REPAIR_HOOKS_NOOP on idempotent re-run', async () => {
      await runRepair({ projectRoot, userDir, scope: 'hooks' });
      await runRepair({ projectRoot, userDir, scope: 'hooks' });
      const entries = readAuditLog(join(projectRoot, 'context'));
      const noopEntry = entries.find(
        (e) => e.reasonCode === 'repair-hooks-noop',
      );
      expect(noopEntry).toBeTruthy();
    });

    it('emits REPAIR_LOCK_REMOVED per removed stale lock', async () => {
      seedLock('stale-a.lock', 2 * 60 * 60 * 1000);
      seedLock('stale-b.lock', 2 * 60 * 60 * 1000);
      await runRepair({ projectRoot, userDir, scope: 'locks' });
      const entries = readAuditLog(join(projectRoot, 'context'));
      const lockEntries = entries.filter(
        (e) => e.reasonCode === 'repair-lock-removed',
      );
      expect(lockEntries.length).toBe(2);
      expect(lockEntries.every((e) => e.id === 'P-RPLKRMVD')).toBe(true);
    });
  });

  describe('M1 fix — preserved.ageMs uses injected `now`', () => {
    it('reports ageMs against the injected now anchor, not Date.now()', async () => {
      // Seed a stale-but-recent lock (30min old)
      const lockPath = seedLock('recent-stale.lock', 30 * 60 * 1000);
      // Inject a now that's 31 minutes after seed (just past the lock's mtime)
      const lockMtimeMs = statSync(lockPath).mtimeMs;
      const fakeNow = new Date(lockMtimeMs + 31 * 60 * 1000).toISOString();
      const r = await runRepair({
        projectRoot,
        userDir,
        scope: 'locks',
        now: fakeNow,
      });
      const locks = r.repairs.find((x) => x.kind === 'locks');
      // The lock should be preserved (still within 1h cutoff)
      const preserved = locks.preserved.find((p) => p.path === lockPath);
      expect(preserved).toBeTruthy();
      // ageMs should be ~31 minutes (based on fakeNow), NOT real elapsed time
      const expectedAgeMs = 31 * 60 * 1000;
      expect(preserved.ageMs).toBeGreaterThan(expectedAgeMs - 1000);
      expect(preserved.ageMs).toBeLessThan(expectedAgeMs + 1000);
    });
  });
});

describe('Task 39 — runRoll', () => {
  describe('Validation (Door 1)', () => {
    it('rejects missing projectRoot', async () => {
      const r = await runRoll({ backend: mockBackend('x') });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('missing_project_root');
    });

    it('rejects missing backend', async () => {
      const r = await runRoll({ projectRoot });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('missing_backend');
    });

    it('rejects invalid scope', async () => {
      const r = await runRoll({
        projectRoot,
        backend: mockBackend('x'),
        scope: 'bogus',
      });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });
  });

  describe('39.4/39.5 — scope dispatch', () => {
    it('default scope is `now` and delegates to compress-session', async () => {
      // Seed a now.md so compress-session has something to compress
      const sessionsDir = join(projectRoot, 'context', 'sessions');
      mkdirSync(sessionsDir, { recursive: true });
      writeFileSync(join(sessionsDir, 'now.md'), '## Discussion\n- some content here that is long enough\n', 'utf8');
      const backend = mockBackend('## Decisions\n- consolidated\n');
      const r = await runRoll({
        projectRoot,
        backend,
        now: '2026-05-28T10:00:00Z',
      });
      expect(r.action).toBe('completed');
      expect(r.scope).toBe(ROLL_SCOPES.NOW);
      expect(r.delegatedTo).toBe('compress-session');
    });

    it('--scope today delegates to daily-distill', async () => {
      const sessionsDir = join(projectRoot, 'context', 'sessions');
      mkdirSync(sessionsDir, { recursive: true });
      writeFileSync(join(sessionsDir, 'today-2026-05-28.md'), '## Decisions\n- x\n', 'utf8');
      const backend = mockBackend('## Decisions\n- distilled\n');
      const r = await runRoll({
        projectRoot,
        backend,
        scope: ROLL_SCOPES.TODAY,
        now: '2026-05-28T10:00:00Z',
      });
      expect(r.action).toBe('completed');
      expect(r.delegatedTo).toBe('daily-distill');
      expect(r.result.action).toBe('distilled');
    });

    it('--scope recent delegates to weekly-curate', async () => {
      const sessionsDir = join(projectRoot, 'context', 'sessions');
      mkdirSync(sessionsDir, { recursive: true });
      writeFileSync(join(sessionsDir, 'today-2026-05-10.md'), '## Decisions\n- old\n', 'utf8');
      writeFileSync(join(sessionsDir, 'today-2026-05-28.md'), '## Decisions\n- current\n', 'utf8');
      // weeklyCurate makes TWO Haiku calls: archive + inline daily rebuild
      const backend = mockBackend(
        '## Week of 2026-05-04\n\n- archived\n',
        '## Decisions\n\n- current\n',
      );
      const r = await runRoll({
        projectRoot,
        backend,
        scope: ROLL_SCOPES.RECENT,
        now: '2026-05-28T10:00:00Z',
      });
      expect(r.action).toBe('completed');
      expect(r.delegatedTo).toBe('weekly-curate');
      expect(r.result.action).toBe('curated');
    });

    it('cooldownMs: 0 override — runs even when shared 120s marker active', async () => {
      // Touch the cooldown marker
      const { touchCooldownMarker } = await import('../packages/cli/src/cooldown.mjs');
      const now = '2026-05-28T10:00:00Z';
      touchCooldownMarker({ projectRoot, now });

      // Seed a today file so daily-distill has input
      const sessionsDir = join(projectRoot, 'context', 'sessions');
      mkdirSync(sessionsDir, { recursive: true });
      writeFileSync(join(sessionsDir, 'today-2026-05-28.md'), '## Decisions\n- x\n', 'utf8');

      const backend = mockBackend('## Decisions\n- distilled\n');
      const r = await runRoll({
        projectRoot,
        backend,
        scope: ROLL_SCOPES.TODAY,
        now,
      });
      // Without the override, daily-distill would return skipped:cooldown.
      // With the override, runRoll explicitly bypasses the gate.
      expect(r.result.action).toBe('distilled');
    });
  });
});
