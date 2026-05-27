// @doors: 1, 2
// Door 3 N/A: these tests use MockHaikuBackend (in-process); no subprocess spawn.
// Door 4 N/A: temp-file IPC (auto-extract's named-exception Door 4 in design §17.1) is exercised by tests/cli-auto-extract.test.js — this file consolidates Task 27 checkpoint fixes that don't add new IPC surface.
// Door 5 N/A: side-effect observability (extract.log entries, audit-log entries) is already pinned by per-module tests — this file's tests target the specific composition contracts the Task 27 review surfaced.

// Tests for Task 27 — Layer 4 checkpoint review fixes.
//
// Each finding from the layer-wide review (subagent report 2026-05-27)
// gets a focused test here. Per-module tests still own the surface
// behavior; these tests pin the cross-module composition contracts
// that the review found were either missing OR latent.
//
// Findings in scope:
//   - I1: auto-extract turn-file cleanup in finally block
//   - I2: classifyHighTrustWrite discriminator pure function
//   - I3: capturePrompt → captureTurn integration (heading-format contract)
//   - B2: auto-extract → cooldown marker → compress-session skip
//   B1 is pinned in tests/cli-memory-write.test.js (errors-field assertion
//   added to the existing Poison_Guard test) since it's a return-shape
//   contract rather than a cross-module composition.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  runAutoExtract,
  classifyHighTrustWrite,
} from '../packages/cli/src/auto-extract.mjs';
import { compressSession } from '../packages/cli/src/compress-session.mjs';
import { MockHaikuBackend } from '../packages/cli/src/compressor.mjs';
import { install } from '../packages/cli/src/install.mjs';
import { capturePrompt } from '../packages/cli/src/capture-prompt.mjs';
import { captureTurn } from '../packages/cli/src/capture-turn.mjs';

function makeFixture() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-task27-fixes-'));
  const projectRoot = join(sandbox, 'proj');
  return { sandbox, projectRoot };
}

async function installFixture(projectRoot) {
  await install({ projectRoot, userTier: join(projectRoot, '..', 'user') });
}

function writeTurnFile(projectRoot, body) {
  const transcriptsDir = join(projectRoot, 'context', 'transcripts');
  mkdirSync(transcriptsDir, { recursive: true });
  const path = join(
    transcriptsDir,
    `.extract-${Date.now()}-${Math.floor(Math.random() * 100000)}.tmp`,
  );
  writeFileSync(path, body, 'utf8');
  return path;
}

function mockBackend(...lines) {
  return new MockHaikuBackend({
    responses: [
      {
        outputText: lines.join('\n'),
        inputTokens: 100,
        outputTokens: 20,
        costUSD: 0.0001,
        preservedIds: [],
      },
    ],
  });
}

describe('Task 27 — Layer 4 checkpoint review fixes', () => {
  let sandbox;
  let projectRoot;

  beforeEach(async () => {
    const f = makeFixture();
    sandbox = f.sandbox;
    projectRoot = f.projectRoot;
    await installFixture(projectRoot);
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('I1 — auto-extract turn-file cleanup', () => {
    it('deletes the turn-file after a successful auto-extract', async () => {
      const turnFile = writeTurnFile(
        projectRoot,
        '## ts — assistant\n\nuser standardized on python 3.13 for new projects',
      );
      expect(existsSync(turnFile)).toBe(true);
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user:python 3.13 is the project default'),
        now: '2026-05-27T10:00:00Z',
      });
      expect(r.action).toBe('extracted');
      expect(existsSync(turnFile)).toBe(false);
    });

    it('deletes the turn-file even on the nothing_durable skipped path', async () => {
      const turnFile = writeTurnFile(projectRoot, 'small talk');
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('SKIP'),
        now: '2026-05-27T10:00:01Z',
      });
      expect(r.action).toBe('skipped');
      expect(existsSync(turnFile)).toBe(false);
    });
  });

  describe('I2 — classifyHighTrustWrite discriminator', () => {
    it('returns "memory" for appended', () => {
      expect(classifyHighTrustWrite({ action: 'appended', id: 'P-AAAAAAAA' }))
        .toBe('memory');
    });

    it('returns "conflict" for queued (defensive — currently unreachable from auto-extract)', () => {
      expect(classifyHighTrustWrite({ action: 'queued', id: 'P-AAAAAAAA' }))
        .toBe('conflict');
    });

    it('returns "rejected" for any error / unknown action', () => {
      expect(classifyHighTrustWrite({ action: 'error', errorCategory: 'poison_guard' }))
        .toBe('rejected');
      expect(classifyHighTrustWrite({ action: 'rejected' })).toBe('rejected');
      expect(classifyHighTrustWrite(null)).toBe('rejected');
      expect(classifyHighTrustWrite(undefined)).toBe('rejected');
    });
  });

  describe('I3 — capturePrompt → captureTurn integration', () => {
    it('captureTurn picks up the user prompt captureTurn wrote into the transcript', () => {
      // Per the bi-turn contract (design §6.4): capture-turn reads back
      // the most-recent USER heading from the transcript. The heading
      // format is the contract between capturePrompt and captureTurn.
      // This test pins the integration end-to-end; a future change to
      // either side's heading format breaks here, not at production
      // surface time.
      capturePrompt({
        payload: { prompt: 'I prefer pnpm over npm for new projects' },
        projectRoot,
        now: '2026-05-27T10:00:00Z',
      });
      const r = captureTurn({
        payload: {
          assistant_message: 'Noted — will scaffold new projects with pnpm.',
        },
        projectRoot,
        now: '2026-05-27T10:00:01Z',
      });
      expect(r.action).toBe('captured');
      expect(existsSync(r.turnFile)).toBe(true);
      const body = readFileSync(r.turnFile, 'utf8');
      expect(body).toContain('I prefer pnpm over npm');
      expect(body).toContain('Noted — will scaffold new projects with pnpm.');
    });
  });

  describe('B2 — auto-extract → cooldown → compress-session composition', () => {
    it('auto-extract touches the cooldown marker on success', async () => {
      const turnFile = writeTurnFile(projectRoot, 'a turn');
      await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user:durable fact'),
        now: '2026-05-27T10:00:00Z',
      });
      const marker = join(
        projectRoot,
        'context',
        '.locks',
        'last-haiku-call.ts',
      );
      expect(existsSync(marker)).toBe(true);
      // mtime should be at/near 2026-05-27T10:00:00Z
      const mtimeMs = statSync(marker).mtimeMs;
      const expectedMs = new Date('2026-05-27T10:00:00Z').getTime();
      expect(Math.abs(mtimeMs - expectedMs)).toBeLessThan(5000); // 5s tolerance
    });

    it('compress-session skips when auto-extract just ran within 120s', async () => {
      // Auto-extract runs first; sets the cooldown marker mtime to T0.
      const turnFile = writeTurnFile(projectRoot, 'a turn');
      await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user:auto-extracted fact'),
        now: '2026-05-27T10:00:00Z',
      });
      // Now compress-session fires at T0+10s (within the 120s cooldown).
      writeFileSync(
        join(projectRoot, 'context', 'sessions', 'now.md'),
        '## ts\n\nlive buffer content\n',
        'utf8',
      );
      const r = await compressSession({
        projectRoot,
        backend: mockBackend('## Decisions\n- something'),
        now: '2026-05-27T10:00:10Z',
      });
      expect(r.action).toBe('skipped');
      expect(r.reason).toBe('cooldown');
    });

    it('compress-session DOES run when auto-extract last fired >120s ago', async () => {
      const turnFile = writeTurnFile(projectRoot, 'a turn');
      await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: mockBackend('TRUST_HIGH user:auto-extracted fact'),
        now: '2026-05-27T10:00:00Z',
      });
      writeFileSync(
        join(projectRoot, 'context', 'sessions', 'now.md'),
        '## ts\n\nlive buffer content\n',
        'utf8',
      );
      // Fire 200s later (well past the 120s window).
      const r = await compressSession({
        projectRoot,
        backend: mockBackend('## Decisions\n- something'),
        now: '2026-05-27T10:03:20Z',
      });
      expect(r.action).toBe('compressed');
    });

    it('auto-extract still touches the marker on HAIKU_FAILED (so a failing Haiku does not get re-tried by compress-session immediately)', async () => {
      // Mock a backend that throws (non-timeout). The catch path should
      // still touch the marker.
      const throwingBackend = {
        compress: async () => {
          throw new Error('mock-haiku-fail');
        },
        modelId: () => 'mock-haiku',
      };
      const turnFile = writeTurnFile(projectRoot, 'a turn');
      const r = await runAutoExtract({
        turnFile,
        projectRoot,
        haikuBackend: throwingBackend,
        now: '2026-05-27T10:00:00Z',
      });
      expect(r.action).toBe('error');
      expect(r.error_category).toBe('haiku_failed');
      const marker = join(
        projectRoot,
        'context',
        '.locks',
        'last-haiku-call.ts',
      );
      expect(existsSync(marker)).toBe(true);
    });
  });
});
