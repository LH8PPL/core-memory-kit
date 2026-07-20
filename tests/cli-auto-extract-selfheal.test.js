// @doors: 1, 2, 5
// Door 1 (Response): runAutoExtract's result carries observation_count > 0 and
//   fallbackUsed on a failed LLM call.
// Door 2 (State): the fallback's capture actually lands in the memory tier.
// Door 5 (Observability): the extract.log entry records fallback_candidates /
//   fallback_written, so a starved loop is diagnosable after the fact.
// Door 3 N/A: the backend is injected as a fake — asserting WHAT is sent is
//   cli-auto-extract's job (@door-3.5 there); this file owns the FAILURE path.
// Door 4 N/A: no message-queue surface.
//
// Task 242 (D-369) — SELF-HEAL: capture must never reach zero, for EVERY
// failure mode, with NO command run.
//
// This is THE done-criterion of the task. The bug was measured on this repo's
// own dogfood logs: 6/6 haiku_timeout in one session → zero captures, silently.
// A table-driven test over every failure class is deliberate — a timeout-only
// fallback would have left ~44% of historical failures (concurrent_run 82,
// haiku_failed 47 of 295) still dropping their turns.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAutoExtract } from '../packages/cli/src/auto-extract.mjs';

let sandbox;
let projectRoot;
let userDir;
let turnFile;

// A turn shaped like a REAL kit-debugging session: dominated by kit-failure
// prose with one genuine project fact. Proves the fallback captures the mission
// context WITHOUT laundering our build noise into the tier.
const HOSTILE_TURN = [
  'USER_TURN:',
  'the extractor timed out again, 6 of 6 this session',
  'cmk doctor should not be the only surface for a silent failure',
  'we decided the payment retry window is 72 hours',
  'validate-docs went red on main after the consolidation',
  'ASSISTANT_TURN:',
  'Understood, recording that.',
].join('\n');

function seedProject() {
  mkdirSync(join(projectRoot, 'context', 'memory'), { recursive: true });
  mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });
  mkdirSync(join(projectRoot, 'context', 'sessions'), { recursive: true });
  writeFileSync(
    join(projectRoot, 'context', 'MEMORY.md'),
    '# Working Memory\n\n## Active Threads\n\n## Environment Notes\n\n## Pending Decisions\n\n',
    'utf8',
  );
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-selfheal-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  mkdirSync(userDir, { recursive: true });
  seedProject();
  turnFile = join(projectRoot, 'context', '.locks', '.extract-test.tmp');
  writeFileSync(turnFile, HOSTILE_TURN, 'utf8');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

// Every failure class the extractor can hit — INCLUDING an unrecognized one,
// so a future/novel error is covered the day it appears.
const FAILURE_MODES = [
  ['haiku_timeout', () => { const e = new Error('timed out'); e.name = 'HaikuTimeoutError'; e.category = 'haiku_timeout'; throw e; }],
  ['haiku_failed', () => { throw new Error('subprocess exited 1'); }],
  ['backend threw a raw crash', () => { throw new TypeError('cannot read properties of undefined'); }],
  ['novel/unrecognized category', () => { const e = new Error('something new'); e.category = 'brand_new_mode'; throw e; }],
];

describe('Task 242 — capture NEVER reaches zero, for every failure mode, with no command run', () => {
  for (const [label, thrower] of FAILURE_MODES) {
    it(`${label}: the deterministic fallback still lands the mission fact`, async () => {
      const haikuBackend = { compress: async () => thrower() };
      const r = await runAutoExtract({ projectRoot, userDir, turnFile, haikuBackend });

      // Door 1 — the run reports a failure, but NOT an empty one.
      expect(r.action).toBe('error');
      expect(
        r.observation_count,
        'a failed extraction must still capture something — this is the whole task',
      ).toBeGreaterThan(0);
      expect(r.fallbackUsed).toBe(true);

      // Door 2 — the mission fact is on disk; the kit noise is NOT.
      const mem = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
      expect(mem).toMatch(/payment retry window/i);
      expect(mem, 'kit-operational noise must never reach a memory tier').not.toMatch(
        /extractor|timed out|cmk doctor|validate-docs/i,
      );
    });
  }

  it('Door 5: the extract.log records the fallback so a starved loop is diagnosable', async () => {
    const haikuBackend = { compress: async () => { const e = new Error('t'); e.name = 'HaikuTimeoutError'; throw e; } };
    const r = await runAutoExtract({ projectRoot, userDir, turnFile, haikuBackend });
    expect(existsSync(r.logPath)).toBe(true);
    const lines = readFileSync(r.logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.success).toBe(false);
    expect(entry.fallback_candidates).toBeGreaterThan(0);
    expect(entry.fallback_written).toBeGreaterThan(0);
  });

  it('provenance is HONEST — the fallback is not laundered as an LLM extraction', async () => {
    const haikuBackend = { compress: async () => { throw new Error('fail'); } };
    const r = await runAutoExtract({ projectRoot, userDir, turnFile, haikuBackend });
    for (const c of r.candidates ?? []) {
      expect(c.write_source).toBe('auto-extract-fallback');
    }
  });

  it('a turn with NO durable mission content captures nothing (no fabrication)', async () => {
    writeFileSync(turnFile, '<user>\nthe extractor timed out again\n</user>\n', 'utf8');
    const haikuBackend = { compress: async () => { throw new Error('fail'); } };
    const r = await runAutoExtract({ projectRoot, userDir, turnFile, haikuBackend });
    expect(r.observation_count).toBe(0);
    const mem = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(mem).not.toMatch(/extractor/i);
  });
});
