// @doors: 1, 3
// Door 2 N/A: the orchestrator mutates no disk state itself — compressSession /
//   autoPersona / graduateAllScratchpads own the writes and are mocked here; their
//   disk-state doors are pinned in cli-compress-session.test.js +
//   cli-auto-persona.test.js + cli-graduate-session.test.js.
// Door 4 N/A: no NDJSON log emitted by the orchestrator; the stderr diagnostic
//   shape is the RETURN of summarizeSessionEnd (a pure fn) and is asserted as
//   Door 1 below. The bins do the actual process.stderr.write.
// Door 5 N/A: no message-queue surface.

// Boundary tests for the SessionEnd orchestrator (Task 86b + D-42). The contract:
//   1. runSessionEndTasks runs compressSession + autoPersona CONCURRENTLY (the
//      composition fix — two 50s inner timeouts must fit a 60s hook ceiling, which
//      only works if they overlap rather than run back-to-back).
//   2. Each pass gets its OWN backend instance (no shared mutable state).
//   3. allSettled isolation — a failure in one pass never discards the other's
//      result and never rejects up into the hook.
//   4. summarizeSessionEnd renders both outcomes into stable stderr lines.
//
// The two callees are mocked: this file owns the ORCHESTRATION contract, not the
// compression / persona behavior (those have their own test files). Mocking lets
// the concurrency proof be deterministic (event-ordering, not wall-clock).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { compressMock, personaMock, graduateMock, journalMock, temporalMock, promoteMock } = vi.hoisted(() => ({
  compressMock: vi.fn(),
  personaMock: vi.fn(),
  graduateMock: vi.fn(),
  journalMock: vi.fn(),
  temporalMock: vi.fn(),
  promoteMock: vi.fn(),
}));

vi.mock('../packages/cli/src/compress-session.mjs', () => ({ compressSession: compressMock }));
vi.mock('../packages/cli/src/auto-persona.mjs', () => ({ autoPersona: personaMock }));
vi.mock('../packages/cli/src/graduate-session.mjs', () => ({ graduateAllScratchpads: graduateMock }));
vi.mock('../packages/cli/src/decisions-journal.mjs', () => ({ syncDecisionsJournal: journalMock }));
vi.mock('../packages/cli/src/temporal-sweep.mjs', () => ({ temporalSweep: temporalMock }));
vi.mock('../packages/cli/src/transcript-screen.mjs', () => ({
  promotePendingTranscripts: promoteMock,
  // session-end-tasks now imports this constant to pass the ceiling-safe
  // timeout at the SessionEnd site (P-AAHW235S) — the mock must expose it.
  PII_JUDGE_SESSIONEND_TIMEOUT_MS: 50_000,
}));

const { runSessionEndTasks, summarizeSessionEnd } = await import(
  '../packages/cli/src/session-end-tasks.mjs'
);

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  compressMock.mockReset();
  personaMock.mockReset();
  graduateMock.mockReset();
  journalMock.mockReset();
  // Default: graduation sweep is a synchronous no-op unless a test overrides it.
  graduateMock.mockReturnValue({ results: [], totalGraduated: 0, totalConsolidated: 0 });
  // Default: journal sync is a synchronous no-op unless a test overrides it.
  journalMock.mockReturnValue({ written: false, appended: 0 });
  // Default: temporal sweep is an idle no-op unless a test overrides it.
  temporalMock.mockResolvedValue({ action: 'skipped', reason: 'no-new-facts', pairs_judged: 0 });
  // Default: transcript promote is an idle no-op unless a test overrides it.
  promoteMock.mockReset();
  promoteMock.mockResolvedValue({ action: 'noop', promoted: 0, deferred: 0 });
});

describe('runSessionEndTasks — concurrency (D-42 composition fix)', () => {
  it('runs compressSession and autoPersona concurrently (both start before either finishes)', async () => {
    // Deterministic concurrency proof: Promise.allSettled kicks off BOTH calls
    // before either awaited delay resolves, so the event order is
    // [c-start, p-start, c-end, p-end]. A sequential implementation would produce
    // [c-start, c-end, p-start, p-end]. We assert the LAST start precedes the
    // FIRST end — true only under concurrency, and independent of timing jitter.
    const events = [];
    compressMock.mockImplementation(async () => {
      events.push('c-start');
      await delay(40);
      events.push('c-end');
      return { action: 'compressed' };
    });
    personaMock.mockImplementation(async () => {
      events.push('p-start');
      await delay(40);
      events.push('p-end');
      return { action: 'promoted', promoted: [], queued: [] };
    });

    await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
    });

    const lastStart = Math.max(events.indexOf('c-start'), events.indexOf('p-start'));
    const firstEnd = Math.min(events.indexOf('c-end'), events.indexOf('p-end'));
    expect(lastStart, `events were sequential, not concurrent: ${events.join(',')}`)
      .toBeLessThan(firstEnd);
  });

  it('gives each pass its OWN backend instance (no shared mutable state)', async () => {
    const backends = [];
    const makeBackend = () => {
      const b = { tag: `backend-${backends.length}`, compress: vi.fn() };
      backends.push(b);
      return b;
    };
    compressMock.mockResolvedValue({ action: 'compressed' });
    personaMock.mockResolvedValue({ action: 'promoted', promoted: [], queued: [] });

    await runSessionEndTasks({ projectRoot: '/proj', userDir: '/userdir', makeBackend });

    // Door 3: each concurrent Haiku pass invoked once, each with a DISTINCT
    // backend. Four passes as of Task 148.3 (compress + persona + temporal sweep
    // + transcript promote).
    expect(backends).toHaveLength(4);
    const compressBackend = compressMock.mock.calls[0][0].backend;
    const personaBackend = personaMock.mock.calls[0][0].backend;
    expect(compressBackend).toBeTruthy();
    expect(personaBackend).toBeTruthy();
    expect(compressBackend).not.toBe(personaBackend);
  });

  it('passes the right args to each callee (Door 3 — call shape)', async () => {
    compressMock.mockResolvedValue({ action: 'compressed' });
    personaMock.mockResolvedValue({ action: 'promoted', promoted: [], queued: [] });

    await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
      now: '2026-06-03T00:00:00Z',
    });

    expect(compressMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectRoot: '/proj', now: '2026-06-03T00:00:00Z' }),
    );
    // cooldownMs:0 is load-bearing — without it the shared 120s Haiku cooldown
    // (touched by the concurrent compress pass) would skip persona at SessionEnd.
    // source:'transcript' (Task 86c) — classify the raw conversation, not the
    // distilled fact corpus.
    expect(personaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRoot: '/proj',
        userDir: '/userdir',
        cooldownMs: 0,
        now: '2026-06-03T00:00:00Z',
        source: 'transcript',
      }),
    );
  });
});

describe('runSessionEndTasks — Task 198.1 per-session temporal sweep (D-266)', () => {
  it('runs temporalSweep CONCURRENTLY in the same allSettled block as compress+persona', async () => {
    // The 60s-ceiling composition (D-92/F-2): the sweep is a THIRD Haiku call,
    // so it must overlap — not run sequentially after the ~50s concurrent block,
    // which would blow the ceiling. Assert its start precedes the first end.
    const events = [];
    compressMock.mockImplementation(async () => {
      events.push('c-start');
      await delay(40);
      events.push('c-end');
      return { action: 'compressed' };
    });
    personaMock.mockImplementation(async () => {
      await delay(40);
      return { action: 'promoted', promoted: [], queued: [] };
    });
    temporalMock.mockImplementation(async () => {
      events.push('t-start');
      await delay(40);
      return { action: 'swept', pairs_judged: 2, superseded: 1 };
    });

    await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
    });

    // t-start precedes c-end → the sweep overlaps the concurrent block.
    expect(events.indexOf('t-start')).toBeLessThan(events.indexOf('c-end'));
  });

  it('gives the sweep its OWN backend (a THIRD instance, no shared state)', async () => {
    const backends = [];
    const makeBackend = () => {
      const b = { tag: `backend-${backends.length}`, compress: vi.fn() };
      backends.push(b);
      return b;
    };
    compressMock.mockResolvedValue({ action: 'compressed' });
    personaMock.mockResolvedValue({ action: 'promoted', promoted: [], queued: [] });

    await runSessionEndTasks({ projectRoot: '/proj', userDir: '/userdir', makeBackend });

    // four concurrent Haiku passes → four distinct backends (Task 148.3 added promote)
    expect(backends).toHaveLength(4);
    const sweepBackend = temporalMock.mock.calls[0][0].backend;
    const compressBackend = compressMock.mock.calls[0][0].backend;
    expect(sweepBackend).toBeTruthy();
    expect(sweepBackend).not.toBe(compressBackend);
  });

  it('passes projectRoot + userDir + now to the sweep (Door 3 call shape)', async () => {
    compressMock.mockResolvedValue({ action: 'compressed' });
    personaMock.mockResolvedValue({ action: 'promoted', promoted: [], queued: [] });

    await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
      now: '2026-07-04T00:00:00Z',
    });

    expect(temporalMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectRoot: '/proj', userDir: '/userdir', now: '2026-07-04T00:00:00Z' }),
    );
  });

  it('caps the SessionEnd sweep at 50s (under the 60s hook ceiling — D-92/F-2)', async () => {
    // The sweep's own default is 120s (ceiling-free weekly/lazy sites); at
    // SessionEnd it MUST be bounded to 50s like compress + persona, or its judge
    // call could be SIGKILL'd by the 60s ceiling mid-write.
    compressMock.mockResolvedValue({ action: 'compressed' });
    personaMock.mockResolvedValue({ action: 'promoted', promoted: [], queued: [] });

    await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
    });

    expect(temporalMock).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 50_000 }),
    );
  });

  it('a thrown sweep is isolated (allSettled) — never rejects the hook, the other outcomes survive', async () => {
    compressMock.mockResolvedValue({ action: 'compressed' });
    personaMock.mockResolvedValue({ action: 'promoted', promoted: [], queued: [] });
    temporalMock.mockRejectedValue(new Error('sweep boom'));

    const outcomes = await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
    });

    expect(outcomes.compressOutcome.status).toBe('fulfilled');
    expect(outcomes.temporalOutcome.status).toBe('rejected');
  });

  it('summarizeSessionEnd renders the temporal outcome line (Door 1)', async () => {
    compressMock.mockResolvedValue({ action: 'compressed' });
    personaMock.mockResolvedValue({ action: 'promoted', promoted: [], queued: [] });
    temporalMock.mockResolvedValue({ action: 'swept', pairs_judged: 3, superseded: 2, duplicates: 1 });

    const outcomes = await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
    });
    const lines = summarizeSessionEnd(outcomes).join('');
    expect(lines).toMatch(/temporal.*superseded: 2/i);
  });
});

describe('runSessionEndTasks — Task 94.3 graduation sweep (sequential, after persona)', () => {
  it('runs the graduation sweep AFTER the concurrent compress+persona block (disjoint-input rule)', async () => {
    // autoPersona WRITES the user-tier scratchpads graduation then reads — proving
    // graduation starts only after BOTH concurrent passes resolve guarantees no
    // read-write race on those files.
    const events = [];
    compressMock.mockImplementation(async () => {
      await delay(30);
      events.push('c-end');
      return { action: 'compressed' };
    });
    personaMock.mockImplementation(async () => {
      await delay(30);
      events.push('p-end');
      return { action: 'promoted', promoted: [], queued: [] };
    });
    graduateMock.mockImplementation(() => {
      events.push('g');
      return { results: [], totalGraduated: 0, totalConsolidated: 0 };
    });

    await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
    });

    // 'g' must come after BOTH concurrent passes ended.
    expect(events.indexOf('g')).toBeGreaterThan(events.indexOf('c-end'));
    expect(events.indexOf('g')).toBeGreaterThan(events.indexOf('p-end'));
  });

  it('passes projectRoot/userDir/now to the sweep and returns its outcome (Door 1+3)', async () => {
    compressMock.mockResolvedValue({ action: 'compressed' });
    personaMock.mockResolvedValue({ action: 'promoted', promoted: [], queued: [] });
    graduateMock.mockReturnValue({ results: [], totalGraduated: 3, totalConsolidated: 1 });

    const { graduationOutcome } = await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
      now: '2026-06-05T00:00:00Z',
    });

    expect(graduateMock).toHaveBeenCalledWith({
      projectRoot: '/proj',
      userDir: '/userdir',
      now: '2026-06-05T00:00:00Z',
    });
    expect(graduationOutcome.status).toBe('fulfilled');
    expect(graduationOutcome.value.totalGraduated).toBe(3);
  });

  it('still runs the sweep even when BOTH Haiku passes reject (allSettled isolation)', async () => {
    compressMock.mockRejectedValue(new Error('c'));
    personaMock.mockRejectedValue(new Error('p'));
    graduateMock.mockReturnValue({ results: [], totalGraduated: 0, totalConsolidated: 0 });

    const { graduationOutcome } = await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
    });

    expect(graduateMock).toHaveBeenCalledTimes(1);
    expect(graduationOutcome.status).toBe('fulfilled');
  });

  it('captures a synchronous sweep throw as a rejected outcome (never rejects the hook)', async () => {
    compressMock.mockResolvedValue({ action: 'compressed' });
    personaMock.mockResolvedValue({ action: 'promoted', promoted: [], queued: [] });
    graduateMock.mockImplementation(() => {
      throw new Error('sweep boom');
    });

    const { graduationOutcome } = await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
    });

    expect(graduationOutcome.status).toBe('rejected');
    expect(graduationOutcome.reason.message).toBe('sweep boom');
  });
});

describe('runSessionEndTasks — Task 159 decision-journal auto-sync (D-169)', () => {
  it('syncs the decision journal at session end with NO manual `cmk digest` (Door 3)', async () => {
    // The load-bearing automatic-path assertion: the journal renders from the
    // session-end hook, with no human-run command. (D-164 / the D-169 done-criteria rule.)
    compressMock.mockResolvedValue({ action: 'compressed' });
    personaMock.mockResolvedValue({ action: 'promoted', promoted: [], queued: [] });
    journalMock.mockReturnValue({ written: true, appended: 120, path: '/proj/context/DECISIONS.md' });

    const { journalOutcome } = await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
      now: '2026-06-18T00:00:00Z',
    });

    expect(journalMock).toHaveBeenCalledWith({ projectRoot: '/proj', now: '2026-06-18T00:00:00Z' });
    expect(journalOutcome.status).toBe('fulfilled');
    expect(journalOutcome.value.written).toBe(true);
    expect(journalOutcome.value.appended).toBe(120);
  });

  it('still syncs the journal even when BOTH Haiku passes reject (allSettled isolation)', async () => {
    compressMock.mockRejectedValue(new Error('c'));
    personaMock.mockRejectedValue(new Error('p'));
    journalMock.mockReturnValue({ written: false, appended: 0 });

    const { journalOutcome } = await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
    });

    expect(journalMock).toHaveBeenCalledTimes(1);
    expect(journalOutcome.status).toBe('fulfilled');
  });

  it('captures a synchronous journal throw as a rejected outcome (never rejects the hook)', async () => {
    compressMock.mockResolvedValue({ action: 'compressed' });
    personaMock.mockResolvedValue({ action: 'promoted', promoted: [], queued: [] });
    journalMock.mockImplementation(() => {
      throw new Error('journal boom');
    });

    const { journalOutcome } = await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
    });

    expect(journalOutcome.status).toBe('rejected');
    expect(journalOutcome.reason.message).toBe('journal boom');
  });
});

describe('runSessionEndTasks — allSettled isolation (best-effort)', () => {
  it('a persona failure does not discard the compress result', async () => {
    compressMock.mockResolvedValue({ action: 'compressed', duration_ms: 5 });
    personaMock.mockRejectedValue(new Error('haiku boom'));

    const { compressOutcome, personaOutcome } = await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
    });

    expect(compressOutcome.status).toBe('fulfilled');
    expect(compressOutcome.value.action).toBe('compressed');
    expect(personaOutcome.status).toBe('rejected');
    expect(personaOutcome.reason.message).toBe('haiku boom');
  });

  it('a compress failure does not discard the persona result', async () => {
    compressMock.mockRejectedValue(new Error('compress boom'));
    personaMock.mockResolvedValue({ action: 'promoted', promoted: [{}], queued: [] });

    const { compressOutcome, personaOutcome } = await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
    });

    expect(compressOutcome.status).toBe('rejected');
    expect(compressOutcome.reason.message).toBe('compress boom');
    expect(personaOutcome.status).toBe('fulfilled');
    expect(personaOutcome.value.action).toBe('promoted');
  });

  it('does not reject even when BOTH passes throw', async () => {
    compressMock.mockRejectedValue(new Error('c'));
    personaMock.mockRejectedValue(new Error('p'));

    await expect(
      runSessionEndTasks({
        projectRoot: '/proj',
        userDir: '/userdir',
        makeBackend: () => ({ compress: vi.fn() }),
      }),
    ).resolves.toMatchObject({
      compressOutcome: { status: 'rejected' },
      personaOutcome: { status: 'rejected' },
    });
  });
});

describe('summarizeSessionEnd — stderr line rendering', () => {
  it('renders both fulfilled outcomes with bytes + counts', () => {
    const lines = summarizeSessionEnd({
      compressOutcome: {
        status: 'fulfilled',
        value: { action: 'compressed', bytesIn: 100, bytesOut: 50, duration_ms: 1200 },
      },
      personaOutcome: {
        status: 'fulfilled',
        value: { action: 'promoted', promoted: [{}, {}], queued: [{}] },
      },
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('compressed');
    expect(lines[0]).toContain('in: 100b, out: 50b');
    expect(lines[0]).toContain('ms: 1200');
    expect(lines[1]).toContain('persona promoted (promoted: 2, queued: 1)');
    expect(lines.every((l) => l.endsWith('\n'))).toBe(true);
  });

  it('renders a cooldown-skip compress with a reason and no bytes block', () => {
    const lines = summarizeSessionEnd({
      compressOutcome: { status: 'fulfilled', value: { action: 'skipped', reason: 'cooldown', duration_ms: 1 } },
      personaOutcome: { status: 'fulfilled', value: { action: 'skipped', promoted: [], queued: [] } },
    });
    expect(lines[0]).toContain('skipped (cooldown)');
    expect(lines[0]).not.toContain('in:');
    expect(lines[1]).toContain('persona skipped (promoted: 0, queued: 0)');
  });

  it('renders a rejected compress outcome as an unexpected error', () => {
    const lines = summarizeSessionEnd({
      compressOutcome: { status: 'rejected', reason: new Error('boom-c') },
      personaOutcome: { status: 'fulfilled', value: { action: 'promoted', promoted: [], queued: [] } },
    });
    expect(lines[0]).toContain('unexpected error: boom-c');
  });

  it('renders a rejected persona outcome as a refresh failure', () => {
    const lines = summarizeSessionEnd({
      compressOutcome: { status: 'fulfilled', value: { action: 'compressed', duration_ms: 5 } },
      personaOutcome: { status: 'rejected', reason: new Error('boom-p') },
    });
    expect(lines[1]).toContain('persona refresh failed: boom-p');
  });

  it('tolerates missing fields without throwing (defensive)', () => {
    const lines = summarizeSessionEnd({
      compressOutcome: { status: 'fulfilled', value: {} },
      personaOutcome: { status: 'fulfilled', value: {} },
    });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('persona undefined (promoted: 0, queued: 0)');
  });

  it('renders a graduation outcome as a third line when present (Task 94.3)', () => {
    const lines = summarizeSessionEnd({
      compressOutcome: { status: 'fulfilled', value: { action: 'compressed', duration_ms: 5 } },
      personaOutcome: { status: 'fulfilled', value: { action: 'promoted', promoted: [], queued: [] } },
      graduationOutcome: { status: 'fulfilled', value: { totalGraduated: 4, totalConsolidated: 2 } },
    });
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('graduation (graduated: 4, consolidated: 2)');
    expect(lines[2].endsWith('\n')).toBe(true);
  });

  it('renders a rejected graduation outcome as a failure line', () => {
    const lines = summarizeSessionEnd({
      compressOutcome: { status: 'fulfilled', value: { action: 'compressed', duration_ms: 5 } },
      personaOutcome: { status: 'fulfilled', value: { action: 'promoted', promoted: [], queued: [] } },
      graduationOutcome: { status: 'rejected', reason: new Error('boom-g') },
    });
    expect(lines[2]).toContain('graduation failed: boom-g');
  });

  it('omits the graduation line entirely when graduationOutcome is absent (back-compat)', () => {
    const lines = summarizeSessionEnd({
      compressOutcome: { status: 'fulfilled', value: { action: 'compressed', duration_ms: 5 } },
      personaOutcome: { status: 'fulfilled', value: { action: 'promoted', promoted: [], queued: [] } },
    });
    expect(lines).toHaveLength(2);
  });

  it('renders a fulfilled journal outcome as a fourth line when present (Task 159)', () => {
    const lines = summarizeSessionEnd({
      compressOutcome: { status: 'fulfilled', value: { action: 'compressed', duration_ms: 5 } },
      personaOutcome: { status: 'fulfilled', value: { action: 'promoted', promoted: [], queued: [] } },
      graduationOutcome: { status: 'fulfilled', value: { totalGraduated: 0, totalConsolidated: 0 } },
      journalOutcome: { status: 'fulfilled', value: { written: true, appended: 240 } },
    });
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain('journal (written: true, appended: 240)');
    expect(lines[3].endsWith('\n')).toBe(true);
  });

  it('renders a rejected journal outcome as a failure line', () => {
    const lines = summarizeSessionEnd({
      compressOutcome: { status: 'fulfilled', value: { action: 'compressed', duration_ms: 5 } },
      personaOutcome: { status: 'fulfilled', value: { action: 'promoted', promoted: [], queued: [] } },
      graduationOutcome: { status: 'fulfilled', value: { totalGraduated: 0, totalConsolidated: 0 } },
      journalOutcome: { status: 'rejected', reason: new Error('boom-j') },
    });
    expect(lines[3]).toContain('journal sync failed: boom-j');
  });

  it('omits the journal line entirely when journalOutcome is absent (back-compat)', () => {
    const lines = summarizeSessionEnd({
      compressOutcome: { status: 'fulfilled', value: { action: 'compressed', duration_ms: 5 } },
      personaOutcome: { status: 'fulfilled', value: { action: 'promoted', promoted: [], queued: [] } },
      graduationOutcome: { status: 'fulfilled', value: { totalGraduated: 0, totalConsolidated: 0 } },
    });
    expect(lines).toHaveLength(3);
  });

  it('renders a non-noop transcript-promote outcome as its own line (Task 148.3)', () => {
    const lines = summarizeSessionEnd({
      compressOutcome: { status: 'fulfilled', value: { action: 'compressed', duration_ms: 5 } },
      personaOutcome: { status: 'fulfilled', value: { action: 'promoted', promoted: [], queued: [] } },
      promoteOutcome: { status: 'fulfilled', value: { action: 'promoted', promoted: 2, deferred: 1 } },
    });
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('transcript-promote promoted (promoted: 2, deferred: 1)');
    expect(lines[2].endsWith('\n')).toBe(true);
  });

  it('stays silent on a noop transcript-promote (the common no-live-buffer session)', () => {
    const lines = summarizeSessionEnd({
      compressOutcome: { status: 'fulfilled', value: { action: 'compressed', duration_ms: 5 } },
      personaOutcome: { status: 'fulfilled', value: { action: 'promoted', promoted: [], queued: [] } },
      promoteOutcome: { status: 'fulfilled', value: { action: 'noop', promoted: 0, deferred: 0 } },
    });
    expect(lines).toHaveLength(2);
  });

  it('renders a rejected transcript-promote outcome as a failure line', () => {
    const lines = summarizeSessionEnd({
      compressOutcome: { status: 'fulfilled', value: { action: 'compressed', duration_ms: 5 } },
      personaOutcome: { status: 'fulfilled', value: { action: 'promoted', promoted: [], queued: [] } },
      promoteOutcome: { status: 'rejected', reason: new Error('boom-t') },
    });
    expect(lines[2]).toContain('transcript-promote failed: boom-t');
  });

  it('surfaces the DEFER REASON on a deferred promote (observability — P-AAHW235S: a timeout vs reject-gate defer was invisible)', () => {
    // The defer reason was in the return object but never printed, so
    // diagnosing "why is the committed transcript empty?" needed live
    // instrumentation. Surface it: a deferred promote line carries the reason.
    const lines = summarizeSessionEnd({
      compressOutcome: { status: 'fulfilled', value: { action: 'compressed', duration_ms: 5 } },
      personaOutcome: { status: 'fulfilled', value: { action: 'promoted', promoted: [], queued: [] } },
      promoteOutcome: {
        status: 'fulfilled',
        value: { action: 'deferred', promoted: 0, deferred: 1, reason: 'judge timeout after 50000ms' },
      },
    });
    expect(lines[2]).toContain('transcript-promote deferred');
    expect(lines[2]).toContain('judge timeout after 50000ms');
  });
});

describe('runSessionEndTasks — transcript promote pass (Task 148.3)', () => {
  it('calls promotePendingTranscripts with projectRoot + its OWN backend, and returns the outcome', async () => {
    const backends = [];
    const makeBackend = () => {
      const b = { tag: `backend-${backends.length}`, compress: vi.fn() };
      backends.push(b);
      return b;
    };
    compressMock.mockResolvedValue({ action: 'compressed' });
    personaMock.mockResolvedValue({ action: 'promoted', promoted: [], queued: [] });
    promoteMock.mockResolvedValue({ action: 'promoted', promoted: 3, deferred: 0 });

    const r = await runSessionEndTasks({ projectRoot: '/proj', userDir: '/userdir', makeBackend });

    // Door 3 — call shape: projectRoot + a backend distinct from every other pass's.
    expect(promoteMock).toHaveBeenCalledTimes(1);
    const args = promoteMock.mock.calls[0][0];
    expect(args.projectRoot).toBe('/proj');
    const otherBackends = [
      compressMock.mock.lastCall[0].backend,
      personaMock.mock.lastCall[0].backend,
      temporalMock.mock.lastCall[0].backend,
    ];
    expect(args.backend).toBeTruthy();
    for (const other of otherBackends) expect(args.backend).not.toBe(other);

    // Door 1 — the outcome rides the return object.
    expect(r.promoteOutcome.status).toBe('fulfilled');
    expect(r.promoteOutcome.value).toEqual({ action: 'promoted', promoted: 3, deferred: 0 });
  });

  it('passes a CEILING-SAFE timeout to the SessionEnd promote (≤50s under the 60s hook ceiling — P-AAHW235S)', async () => {
    // The detached-child promote default is ceiling-free (120s, D-179 class).
    // But the SessionEnd top-up runs CONCURRENTLY with compress/persona/sweep
    // under the 60s hook ceiling — each sibling capped at 50s (D-92/F-2). So
    // this site MUST pass an explicit tight timeout, NOT inherit the 120s
    // default (which would make it the longest pole → SIGKILL mid-write, the
    // exact composition bug PROMOTE_MAX_FILES_PER_RUN + the sweep's 50s cap
    // exist to prevent).
    compressMock.mockResolvedValue({ action: 'compressed' });
    personaMock.mockResolvedValue({ action: 'promoted', promoted: [], queued: [] });
    promoteMock.mockResolvedValue({ action: 'noop' });

    await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
    });

    const args = promoteMock.mock.calls[0][0];
    expect(typeof args.timeoutMs).toBe('number');
    expect(args.timeoutMs).toBeLessThanOrEqual(50_000);
  });

  it('a promote failure never discards the other outcomes (allSettled isolation)', async () => {
    compressMock.mockResolvedValue({ action: 'compressed' });
    personaMock.mockResolvedValue({ action: 'promoted', promoted: [], queued: [] });
    promoteMock.mockRejectedValue(new Error('judge down'));

    const r = await runSessionEndTasks({
      projectRoot: '/proj',
      userDir: '/userdir',
      makeBackend: () => ({ compress: vi.fn() }),
    });

    expect(r.promoteOutcome.status).toBe('rejected');
    expect(r.compressOutcome.status).toBe('fulfilled');
    expect(r.personaOutcome.status).toBe('fulfilled');
  });
});
