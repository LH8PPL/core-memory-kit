// @doors: 1, 2, 3, 5
// Door 3: HC-1 + HC-7 spawn `memsearch --version`; HC-1's skip-path message asserts the subprocess CALL (Door-3 surface). Real memsearch-installed coverage is a v0.1.x integration test (parallel to Layer 5b's gate per ADR-0008).
// Door 4 N/A: no message-queue interaction.

// Tests for Task 37 — `cmk doctor` health checks HC-1..HC-9 (T-031).
// Per tasks.md 37.6 (7 cases):
//   1. All 9 HCs run in order; report line per check (PASS / FAIL / SKIP)
//   2. Full run completes within 5s on 10k-observation fixture
//   3. Failed HC (e.g., HC-2 missing hook): repair command surfaced
//   4. HC-8 active: log shows active:true + file count + last_modified
//   5. HC-8 inactive: log shows active:false
//   6. HC-9 stale lock present: report includes the lock's recoveryCommand
//   7. Install-requiring repair: stub prompt; assert prompt shown before any install command

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { runDoctor } from '../packages/cli/src/doctor.mjs';
import { install } from '../packages/cli/src/install.mjs';
import { markCronRegistered } from '../packages/cli/src/lazy-compress.mjs';

let sandbox;
let projectRoot;
let userDir;

async function makeFixture() {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-doctor-test-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  // noHooks: scaffold-only. As of Task 49 `install` wires hooks into
  // .claude/settings.json by default; the HC-2 unit tests below want to
  // control the settings.json shape themselves (absent / empty / flat /
  // nested), so the fixture must NOT pre-write hooks. The install→doctor
  // integration (hooks ON → HC-2 pass) is its own test below.
  await install({ projectRoot, userTier: userDir, noHooks: true });
}

function seedRecentMd(ageMs) {
  const dir = join(projectRoot, 'context', 'sessions');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'recent.md');
  writeFileSync(path, '## Decisions\n- something\n', 'utf8');
  if (ageMs !== undefined) {
    const t = (Date.now() - ageMs) / 1000;
    utimesSync(path, t, t);
  }
}

function seedTranscript(name, ageMs) {
  const dir = join(projectRoot, 'context', 'transcripts');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, '# transcript\n', 'utf8');
  if (ageMs !== undefined) {
    const t = (Date.now() - ageMs) / 1000;
    utimesSync(path, t, t);
  }
}

function seedSettingsJson(content) {
  const dir = join(projectRoot, '.claude');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(content), 'utf8');
}

beforeEach(async () => {
  await makeFixture();
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('Task 37 — runDoctor (cmk doctor health checks)', () => {
  describe('Validation (Door 1)', () => {
    it('rejects missing projectRoot', async () => {
      const r = await runDoctor({ userDir });
      expect(r.action).toBe('error');
      expect(r.errors).toEqual(expect.arrayContaining(['projectRoot is required']));
    });
  });

  describe('37.6 #1 — all 9 HCs run in order; pass/fail/skip per check', () => {
    it('emits exactly 9 checks with id HC-1..HC-9 in order', async () => {
      const r = await runDoctor({ projectRoot, userDir });
      expect(r.action).toBe('completed');
      expect(r.checks.length).toBe(9);
      const ids = r.checks.map((c) => c.id);
      expect(ids).toEqual([
        'HC-1', 'HC-2', 'HC-3', 'HC-4', 'HC-5', 'HC-6', 'HC-7', 'HC-8', 'HC-9',
      ]);
      // Every check has the canonical shape
      for (const c of r.checks) {
        expect(c).toHaveProperty('id');
        expect(c).toHaveProperty('name');
        expect(c).toHaveProperty('status');
        expect(c).toHaveProperty('message');
        expect(['pass', 'fail', 'skip']).toContain(c.status);
      }
    });
  });

  describe('37.6 #2 — full run completes promptly (regression guard, not a production-timing measurement)', () => {
    it('finishes well inside a non-pathological ceiling', async () => {
      const r = await runDoctor({ projectRoot, userDir });
      // The production NFR is ~5s (design §5/§14), but this test runs
      // alongside 700+ concurrent vitest files (and under `npm run stress`,
      // 5× back-to-back) where doctor's subprocess spawns (HC-1/HC-7
      // `memsearch --version`, etc.) contend for the CPU — a borderline
      // `< 5000` assertion flaked at 5028ms under that load (2026-05-31),
      // an absolute wall-clock threshold on an inherently load-variable
      // measurement (same class as the captureTurn detach fix in Task 61).
      // We assert a 10s "not pathological" ceiling instead: it still catches
      // a real regression (a hung HC or a missing subprocess timeout blows
      // far past 10s), without flaking on test-harness concurrency noise.
      expect(r.duration_ms).toBeLessThan(10_000);
    });
  });

  describe('37.6 #3 — failed HC surfaces the repair command', () => {
    it('HC-2 missing settings.json → fail with `cmk repair --hooks`', async () => {
      // install() doesn't drop .claude/settings.json in the test
      // sandbox, so HC-2 fails by default.
      const r = await runDoctor({ projectRoot, userDir });
      const c2 = r.checks.find((c) => c.id === 'HC-2');
      expect(c2.status).toBe('fail');
      expect(c2.recoveryCommand).toBe('cmk repair --hooks');
    });

    it('HC-2 settings.json with missing hooks → fail with repair', async () => {
      seedSettingsJson({ hooks: { Stop: [] } }); // intentionally empty
      const r = await runDoctor({ projectRoot, userDir });
      const c2 = r.checks.find((c) => c.id === 'HC-2');
      expect(c2.status).toBe('fail');
      expect(c2.message).toMatch(/missing hook references/);
    });

    it('HC-2 settings.json with all hooks (flat form) → pass', async () => {
      seedSettingsJson({
        hooks: {
          SessionStart: [{ command: 'cmk-inject-context' }],
          Stop: [{ command: 'cmk-capture-turn' }],
          SessionEnd: [{ command: 'cmk-compress-session' }],
        },
      });
      const r = await runDoctor({ projectRoot, userDir });
      const c2 = r.checks.find((c) => c.id === 'HC-2');
      expect(c2.status).toBe('pass');
    });

    it('HC-2 settings.json with NESTED-form hooks (the real cmk install / repair shape) → pass', async () => {
      // Regression for the install→doctor composition bug found in Task 49:
      // cmk install + cmk repair --hooks write the canonical nested
      // Anthropic shape `{hooks:[{type,command}]}`, but HC-2 used to only
      // inspect a top-level `e.command`, so it reported fail on hooks the
      // kit itself just wrote. HC-2 now traverses `e.hooks[]`.
      seedSettingsJson({
        hooks: {
          SessionStart: [{ hooks: [{ type: 'command', command: 'cmk-inject-context', timeout: 30 }] }],
          Stop: [{ hooks: [{ type: 'command', command: 'cmk-capture-turn', timeout: 30 }] }],
          SessionEnd: [{ hooks: [{ type: 'command', command: 'cmk-compress-session', timeout: 60 }] }],
        },
      });
      const r = await runDoctor({ projectRoot, userDir });
      const c2 = r.checks.find((c) => c.id === 'HC-2');
      expect(c2.status).toBe('pass');
    });

    it('integration: cmk install (hooks ON) → cmk doctor → HC-2 passes', async () => {
      // The full composition: a default `cmk install` wires hooks, and a
      // subsequent `cmk doctor` must report HC-2 pass (not send the user
      // chasing `cmk repair --hooks` on hooks that are already correct).
      const freshSandbox = mkdtempSync(join(tmpdir(), 'cmk-doctor-int-'));
      try {
        const proj = join(freshSandbox, 'proj');
        const usr = join(freshSandbox, 'user');
        await install({ projectRoot: proj, userTier: usr }); // hooks ON (default)
        const r = await runDoctor({ projectRoot: proj, userDir: usr });
        const c2 = r.checks.find((c) => c.id === 'HC-2');
        expect(c2.status).toBe('pass');
      } finally {
        rmSync(freshSandbox, { recursive: true, force: true });
      }
    });

    it('B1 fix: HC-2 detects hook in WRONG event array as fail (not false-pass)', async () => {
      // Skill-review B1: previous substring-on-stringify implementation
      // false-pass'd on hooks wired to wrong events OR mentioned in
      // descriptions/TODOs. This test pins the actual structural walk.
      seedSettingsJson({
        // All three hook names appear, but in the WRONG event arrays.
        hooks: {
          SessionStart: [{ command: 'cmk-compress-session' }], // wrong
          Stop: [{ command: 'cmk-inject-context' }], // wrong
          SessionEnd: [{ command: 'cmk-capture-turn' }], // wrong
        },
      });
      const r = await runDoctor({ projectRoot, userDir });
      const c2 = r.checks.find((c) => c.id === 'HC-2');
      expect(c2.status).toBe('fail');
      // The message should call out missing hooks per their CORRECT event
      expect(c2.message).toMatch(/SessionStart\.cmk-inject-context/);
      expect(c2.message).toMatch(/Stop\.cmk-capture-turn/);
      expect(c2.message).toMatch(/SessionEnd\.cmk-compress-session/);
    });

    it('B1 fix: HC-2 does NOT false-pass on TODO text mentioning the hook names', async () => {
      seedSettingsJson({
        description: 'TODO: wire cmk-inject-context cmk-capture-turn cmk-compress-session',
        hooks: { SessionStart: [], Stop: [], SessionEnd: [] },
      });
      const r = await runDoctor({ projectRoot, userDir });
      const c2 = r.checks.find((c) => c.id === 'HC-2');
      expect(c2.status).toBe('fail');
    });

    // v0.2.0 severity fix: on a FRESH project (nothing distilled yet), a
    // never-built recent.md is "not yet", not a failure — SKIP (lazy-on-read
    // builds it once there's session content). A STALE recent.md is still FAIL.
    it('HC-3 missing recent.md (fresh project) → skip, no repair command', async () => {
      const r = await runDoctor({ projectRoot, userDir });
      const c3 = r.checks.find((c) => c.id === 'HC-3');
      expect(c3.status).toBe('skip');
      expect(c3.recoveryCommand).toBeUndefined();
    });

    it('HC-3 fresh recent.md → pass', async () => {
      seedRecentMd(60_000); // 1 minute old
      const r = await runDoctor({ projectRoot, userDir });
      const c3 = r.checks.find((c) => c.id === 'HC-3');
      expect(c3.status).toBe('pass');
    });

    it('HC-3 stale recent.md (>2d) → fail (still a real signal)', async () => {
      seedRecentMd(3 * 24 * 60 * 60 * 1000); // 3 days old
      const r = await runDoctor({ projectRoot, userDir });
      const c3 = r.checks.find((c) => c.id === 'HC-3');
      expect(c3.status).toBe('fail');
      expect(c3.recoveryCommand).toBe('cmk daily-distill');
    });

    // v0.2.0 severity fix: no transcripts yet (fresh project) → SKIP, not FAIL.
    it('HC-4 no transcripts (fresh project) → skip', async () => {
      const r = await runDoctor({ projectRoot, userDir });
      const c4 = r.checks.find((c) => c.id === 'HC-4');
      expect(c4.status).toBe('skip');
    });

    it('HC-4 transcripts EXIST but all stale (>3d) → fail (hook may have stopped)', async () => {
      seedTranscript('2026-05-20.md', 5 * 24 * 60 * 60 * 1000); // 5 days old
      const r = await runDoctor({ projectRoot, userDir });
      const c4 = r.checks.find((c) => c.id === 'HC-4');
      expect(c4.status).toBe('fail');
      expect(c4.recoveryCommand).toBeTruthy();
    });

    it('HC-4 transcript within 3d → pass', async () => {
      seedTranscript('2026-05-28.md', 60_000);
      const r = await runDoctor({ projectRoot, userDir });
      const c4 = r.checks.find((c) => c.id === 'HC-4');
      expect(c4.status).toBe('pass');
      expect(c4.message).toMatch(/1 transcript/);
    });

    // v0.2.0 severity fix: cron is optional (lazy-on-read fallback), so its
    // absence is SKIP, not FAIL — a healthy fresh install shouldn't read as broken.
    it('HC-6 no cron sentinel → skip (optional; fallback active)', async () => {
      const r = await runDoctor({ projectRoot, userDir });
      const c6 = r.checks.find((c) => c.id === 'HC-6');
      expect(c6.status).toBe('skip');
      expect(c6.message).toMatch(/register-crons/); // command still surfaced, as info
    });

    it('HC-6 cron sentinel present → pass', async () => {
      markCronRegistered({ projectRoot });
      const r = await runDoctor({ projectRoot, userDir });
      const c6 = r.checks.find((c) => c.id === 'HC-6');
      expect(c6.status).toBe('pass');
    });
  });

  describe('37.6 #4 + #5 — HC-8 native Anthropic Auto Memory detection logs structured entry', () => {
    it('writes single-line JSON snapshot to .locks/native-memory-status.log with active:false when no Anthropic dir exists', async () => {
      const r = await runDoctor({ projectRoot, userDir });
      const c8 = r.checks.find((c) => c.id === 'HC-8');
      expect(c8.status).toBe('pass');
      const logPath = join(projectRoot, 'context', '.locks', 'native-memory-status.log');
      expect(existsSync(logPath)).toBe(true);
      const entry = JSON.parse(readFileSync(logPath, 'utf8').trim().split('\n')[0]);
      // For a freshly-installed test sandbox, Anthropic's slug-dir for
      // this path won't exist → active:false.
      expect(entry.active).toBe(false);
      expect(entry.file_count).toBe(0);
    });

    it('Task 60: when autoMemoryEnabled:false is set, HC-8 reports DISABLED + records setting_state (the opt-out is discoverable here)', async () => {
      // Write the committable opt-out into the project settings.json.
      const claudeDir = join(projectRoot, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify({ autoMemoryEnabled: false }, null, 2), 'utf8');

      const r = await runDoctor({ projectRoot, userDir });
      const c8 = r.checks.find((c) => c.id === 'HC-8');
      expect(c8.status).toBe('pass');
      expect(c8.message).toMatch(/disabled/i);
      expect(c8.message).toMatch(/sole memory layer/i);

      // Door 4 — the snapshot log records the setting state.
      const logPath = join(projectRoot, 'context', '.locks', 'native-memory-status.log');
      const entry = JSON.parse(readFileSync(logPath, 'utf8').trim().split('\n')[0]);
      expect(entry.setting_state).toBe('disabled');
    });
  });

  describe('37.6 #6 — HC-9 stale locks surface recoveryCommand', () => {
    it('reports stale lock with recoveryCommand when a stale .lock file exists', async () => {
      // Seed a stale lock: pid 999999 (unlikely to be alive)
      const locksDir = join(projectRoot, 'context', '.locks');
      mkdirSync(locksDir, { recursive: true });
      const lockPath = join(locksDir, 'auto-extract.lock');
      writeFileSync(lockPath, '999999\n', 'utf8');
      const r = await runDoctor({ projectRoot, userDir });
      const c9 = r.checks.find((c) => c.id === 'HC-9');
      expect(c9.status).toBe('fail');
      expect(c9.recoveryCommand).toBeTruthy();
      // The lock-discipline emits a platform-aware recoveryCommand
      // (rm on POSIX, Remove-Item on Windows). Just check it's
      // non-empty and references the lock path.
      expect(c9.recoveryCommand).toContain('auto-extract.lock');
    });

    it('passes when no stale locks present', async () => {
      const r = await runDoctor({ projectRoot, userDir });
      const c9 = r.checks.find((c) => c.id === 'HC-9');
      expect(c9.status).toBe('pass');
    });
  });

  describe('37.6 #7 — install-requiring repair is flagged for prompt-before-execute', () => {
    it('HC-1 missing-memsearch path carries requiresInstall:true + pip install hint', async () => {
      const r = await runDoctor({ projectRoot, userDir });
      const c1 = r.checks.find((c) => c.id === 'HC-1');
      // Layer 5b (memsearch) is OPTIONAL per ADR-0008 — the test host
      // may or may not have it installed. Contract:
      //   - When memsearch IS installed: c1.status === 'pass', no
      //     requiresInstall flag (already done).
      //   - When NOT installed: c1.status === 'skip', requiresInstall:
      //     true, recoveryCommand contains `pip install`.
      if (c1.status === 'skip') {
        expect(c1.requiresInstall).toBe(true);
        expect(c1.recoveryCommand).toContain('pip install');
      } else {
        expect(c1.status).toBe('pass');
        expect(c1.requiresInstall).toBeFalsy();
      }
    });

    it('non-install repairs do NOT carry requiresInstall:true', async () => {
      const r = await runDoctor({ projectRoot, userDir });
      const c2 = r.checks.find((c) => c.id === 'HC-2');
      const c3 = r.checks.find((c) => c.id === 'HC-3');
      const c6 = r.checks.find((c) => c.id === 'HC-6');
      // None of these recovery commands invoke an installer
      expect(c2.requiresInstall).toBeFalsy();
      expect(c3.requiresInstall).toBeFalsy();
      expect(c6.requiresInstall).toBeFalsy();
    });
  });

  describe('HC-5 INDEX.md consistency', () => {
    it('skip when context/memory/ doesn\'t exist', async () => {
      // install() creates context/memory/ — let's remove it explicitly
      rmSync(join(projectRoot, 'context', 'memory'), { recursive: true, force: true });
      const r = await runDoctor({ projectRoot, userDir });
      const c5 = r.checks.find((c) => c.id === 'HC-5');
      expect(c5.status).toBe('skip');
    });

    it('fail when INDEX.md is missing but memory/ has fact files', async () => {
      const memoryDir = join(projectRoot, 'context', 'memory');
      mkdirSync(memoryDir, { recursive: true });
      writeFileSync(join(memoryDir, 'P-AAAAAAAA.md'), '---\nid: P-AAAAAAAA\n---\n\nfact\n', 'utf8');
      // No INDEX.md
      const r = await runDoctor({ projectRoot, userDir });
      const c5 = r.checks.find((c) => c.id === 'HC-5');
      expect(c5.status).toBe('fail');
      expect(c5.recoveryCommand).toBe('cmk reindex');
    });

    it('pass when INDEX.md references all fact files', async () => {
      const memoryDir = join(projectRoot, 'context', 'memory');
      mkdirSync(memoryDir, { recursive: true });
      writeFileSync(join(memoryDir, 'P-AAAAAAAA.md'), '---\nid: P-AAAAAAAA\n---\n\nfact\n', 'utf8');
      writeFileSync(join(memoryDir, 'INDEX.md'), '# Index\n- [fact A](P-AAAAAAAA.md)\n', 'utf8');
      const r = await runDoctor({ projectRoot, userDir });
      const c5 = r.checks.find((c) => c.id === 'HC-5');
      expect(c5.status).toBe('pass');
    });

    it('fail when INDEX.md is stale (references missing files)', async () => {
      const memoryDir = join(projectRoot, 'context', 'memory');
      mkdirSync(memoryDir, { recursive: true });
      writeFileSync(join(memoryDir, 'INDEX.md'), '# Index\n- [missing](P-BBBBBBBB.md)\n', 'utf8');
      const r = await runDoctor({ projectRoot, userDir });
      const c5 = r.checks.find((c) => c.id === 'HC-5');
      expect(c5.status).toBe('fail');
      expect(c5.message).toMatch(/stale in INDEX/);
    });
  });
});
