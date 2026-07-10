// Task 192 — the Stop-hook JUDGE: the full oracle-free passive-signal
// portfolio (ADR-0017 Phase 1c; D-252). Four deterministic detectors ride
// the EXISTING hooks (no new spawn, no ritual — D-169):
//
//   - TOOL-RESULT ±   (captureTurn): the turn's tool errors/successes,
//                      attributed via the 190 recall-log's recent search ids
//   - USER-CORRECTION − (capturePrompt): the next user turn contradicts —
//                      dampen the prior turn's surfaced ids + resolve pending
//                      expectations MISS (REVERSAL on a revert-pattern)
//   - RE-ASK −        (captureTurn): a search re-fetched ids the snapshot
//                      already carried — the injection failed the model
//   - SILENT-SUCCESS weak-+ (captureTurn): expectations pending past the
//                      turn window with nothing fired → WEAK-POSITIVE
// POLARITY (D-246, pinned): re-surfacing is never reinforcement (dampen).
// Every delta routes through applyTrustSignal → the 193 SCREEN.
//
// @doors: 1, 2, 5
// Door 3 N/A: detectors are pure + file I/O; no subprocess (the wire test's spawn is stubbed).
// Door 4 N/A: no message queue.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  detectToolFailures,
  detectCorrection,
  detectReask,
  judgeTurn,
  judgeUserPrompt,
  CORRECTION_PATTERNS,
  REVERSAL_PATTERNS,
  TURN_WINDOW_MS,
} from '../packages/cli/src/judge-signals.mjs';
import { appendRecallEntry, readRecallLog } from '../packages/cli/src/recall-log.mjs';
import { capturePredictions, readExpectations, resolveExpectation } from '../packages/cli/src/expectations.mjs';
import { readSignalLog } from '../packages/cli/src/feedback-screen.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import { captureTurn } from '../packages/cli/src/capture-turn.mjs';
import { capturePrompt } from '../packages/cli/src/capture-prompt.mjs';
import { writeFileSync } from 'node:fs';

let sandbox;
let projectRoot;

function seedFact(db, id, trust_score = 0.5) {
  db.prepare(`
    INSERT INTO observations
      (id, tier, source_file, source_line, source_sha1, heading_path, body,
       write_source, trust, created_at, superseded_by, deleted_at, expires_at, trust_score)
    VALUES (?, 'P', 'MEMORY.md', 1, ?, 'MEMORY.md > Active Threads', ?, 'user-explicit', 'high', ?, NULL, NULL, NULL, ?)
  `).run(id, 'a'.repeat(40), `body of ${id}`, Date.parse('2026-07-01T10:00:00Z'), trust_score);
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-judge-test-'));
  projectRoot = join(sandbox, 'proj');
  mkdirSync(join(projectRoot, 'context', 'memory'), { recursive: true });
});

afterEach(async () => {
  // Drain-then-swallow (the cli-capture-turn pattern): the captureTurn wire
  // test spawns a detached stub child that can briefly hold the cwd on
  // Windows (EPERM). Give it a beat; if the handle persists, leave the tmp
  // dir to the OS.
  await new Promise((res) => setTimeout(res, 300));
  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    // background child still holds a handle - harmless
  }
});

describe('Task 192 — pure detectors (Door-3.5-pinned patterns)', () => {
  it('detectToolFailures: flags isError calls, ignores clean ones', () => {
    const calls = [
      { name: 'Bash', result: 'ok', isError: false },
      { name: 'Bash', result: 'ENOENT: no such file', isError: true },
    ];
    const r = detectToolFailures(calls);
    expect(r.failures).toBe(1);
    expect(r.successes).toBe(1);
  });

  it('detectCorrection: start-anchored corrective phrases hit; ambiguity leans PRECISE (I1 contract)', () => {
    expect(detectCorrection('No, that is not the right file')).toBe('correction');
    expect(detectCorrection("actually, that's wrong - it is the v2 endpoint")).toBe('correction');
    expect(detectCorrection("that's wrong — the port is 8080")).toBe('correction');
    expect(detectCorrection('I know there is no rush here')).toBe(null);
    expect(detectCorrection('please continue with the plan')).toBe(null);
    // I1 accepted false-NEGATIVE: a bare "actually it's X" is indistinguishable
    // from neutral phrasing without semantics — precision over recall (a missed
    // correction costs one un-dampened fact; a false one dampens good memory).
    expect(detectCorrection("actually it's the v2 endpoint")).toBe(null);
  });

  it('I1 FP sweep: approving/neutral openers never read as corrections', () => {
    expect(detectCorrection('No worries, take your time')).toBe(null);
    expect(detectCorrection('No problem at all')).toBe(null);
    expect(detectCorrection('Actually, great idea — do that')).toBe(null);
    expect(detectCorrection('before we go back to the main task, one question')).toBe(null);
    expect(detectCorrection('switching back to the frontend work now')).toBe(null);
  });

  it('detectCorrection: START-anchored revert imperatives classify as REVERSAL', () => {
    expect(detectCorrection('go back to pip, uv is breaking the build')).toBe('reversal');
    expect(detectCorrection('revert to the old approach please')).toBe('reversal');
    expect(detectCorrection('please switch back to jest')).toBe('reversal');
  });

  it('detectReask: a search whose ids were ALL already injected = re-ask; fresh ids are not', () => {
    const inject = ['P-9LXBA3ZK', 'U-CVGYFKW2'];
    expect(detectReask(inject, ['P-9LXBA3ZK'])).toBe(true);
    expect(detectReask(inject, ['P-9LXBA3ZK', 'P-AAAAAA22'])).toBe(false); // new info arrived
    expect(detectReask(inject, [])).toBe(false); // empty search ≠ re-ask
  });
});

describe('Task 192 — judgeTurn (the Stop-hook wire)', () => {
  it('a turn with a TOOL FAILURE dampens the recently-searched ids through the SCREEN (audit + signal log visible)', () => {
    const db = openIndexDb({ projectRoot });
    seedFact(db, 'P-9LXBA3ZK', 0.5);
    db.close();
    // the fact surfaced via search 1 minute ago (inside the turn window)
    appendRecallEntry(projectRoot, { session: 's1', source: 'search', query: 'q', ids: ['P-9LXBA3ZK'] });

    const r = judgeTurn({
      projectRoot,
      session: 's1',
      toolCalls: [{ name: 'Bash', result: 'exit 1: tests failed', isError: true }],
    });
    expect(r.signals.some((s) => s.kind === 'tool-failure')).toBe(true);

    // Door 4: the delta went through the screened path — the signal log shows it.
    const sig = readSignalLog(projectRoot);
    expect(sig.some((e) => e.id === 'P-9LXBA3ZK' && e.event === 'dampen' && e.applied === true)).toBe(true);
  });

  it('an all-success turn with tool calls REINFORCES the attributed ids (the symmetric prize)', () => {
    const db = openIndexDb({ projectRoot });
    seedFact(db, 'P-9LXBA3ZK', 0.5);
    db.close();
    appendRecallEntry(projectRoot, { session: 's1', source: 'search', query: 'q', ids: ['P-9LXBA3ZK'] });

    judgeTurn({
      projectRoot,
      session: 's1',
      toolCalls: [{ name: 'Bash', result: 'ok', isError: false }],
    });
    const sig = readSignalLog(projectRoot);
    expect(sig.some((e) => e.id === 'P-9LXBA3ZK' && e.event === 'reinforce')).toBe(true);
  });

  it('RE-ASK: a search that only re-fetched injected ids emits DAMPEN — never reinforce (the D-246 polarity pin)', () => {
    const db = openIndexDb({ projectRoot });
    seedFact(db, 'P-9LXBA3ZK', 0.5);
    db.close();
    appendRecallEntry(projectRoot, { session: 's1', source: 'inject', ids: ['P-9LXBA3ZK', 'U-CVGYFKW2'] });
    appendRecallEntry(projectRoot, { session: 's1', source: 'search', query: 'the same thing again', ids: ['P-9LXBA3ZK'] });

    const r = judgeTurn({ projectRoot, session: 's1', toolCalls: [] });
    expect(r.signals.some((s) => s.kind === 're-ask')).toBe(true);
    const sig = readSignalLog(projectRoot);
    const entries = sig.filter((e) => e.id === 'P-9LXBA3ZK');
    expect(entries.length).toBeGreaterThanOrEqual(1);
    for (const e of entries) expect(e.event).toBe('dampen'); // NEVER reinforce
  });

  it('SILENT-SUCCESS: an expectation pending past the turn window resolves WEAK-POSITIVE at Stop', () => {
    // a pending expectation captured "long ago" (backdated inside the log)
    capturePredictions(projectRoot, { text: 'PREDICTION: the deploy finishes without a rollback today' });
    // age it: judgeTurn treats entries older than TURN_WINDOW_MS as previous-turn
    const r = judgeTurn({
      projectRoot,
      session: 's1',
      toolCalls: [],
      now: Date.now() + TURN_WINDOW_MS + 1000,
    });
    expect(r.signals.some((s) => s.kind === 'silent-success')).toBe(true);
    const pending = readExpectations(projectRoot, { pendingOnly: true });
    expect(pending).toHaveLength(0);
    const all = readExpectations(projectRoot);
    expect(all[0].verdict).toBe('WEAK-POSITIVE');
  });

  it('best-effort: judgeTurn on a bare (non-kit) root never throws and never scaffolds', () => {
    const bare = join(sandbox, 'bare');
    mkdirSync(bare, { recursive: true });
    expect(() => judgeTurn({ projectRoot: bare, session: 's', toolCalls: [] })).not.toThrow();
    expect(existsSync(join(bare, 'context'))).toBe(false);
  });
});

describe('Task 192 — B1/I2/I3 regression pins (skill-review)', () => {
  it('B1 WATERMARK: two consecutive judgeTurn calls over the same window apply exactly ONE delta', () => {
    const db = openIndexDb({ projectRoot });
    seedFact(db, 'P-9LXBA3ZK', 0.5);
    db.close();
    appendRecallEntry(projectRoot, { session: 's1', source: 'search', query: 'q', ids: ['P-9LXBA3ZK'] });

    judgeTurn({ projectRoot, session: 's1', toolCalls: [{ name: 'Bash', result: 'ok', isError: false }] });
    judgeTurn({ projectRoot, session: 's1', toolCalls: [{ name: 'Bash', result: 'ok', isError: false }] });

    const applied = readSignalLog(projectRoot).filter((e) => e.id === 'P-9LXBA3ZK' && e.applied === true);
    expect(applied).toHaveLength(1); // the second pass judged nothing new
  });

  it('I3 RATIO: one red test among many green calls does NOT dampen (TDD is not a failure outcome)', () => {
    const db = openIndexDb({ projectRoot });
    seedFact(db, 'P-9LXBA3ZK', 0.5);
    db.close();
    appendRecallEntry(projectRoot, { session: 's1', source: 'search', query: 'q', ids: ['P-9LXBA3ZK'] });

    const calls = [
      { name: 'Bash', result: 'RED: expected fail', isError: true },
      ...Array.from({ length: 9 }, () => ({ name: 'Bash', result: 'ok', isError: false })),
    ];
    judgeTurn({ projectRoot, session: 's1', toolCalls: calls });
    const dampens = readSignalLog(projectRoot).filter((e) => e.event === 'dampen');
    expect(dampens).toHaveLength(0); // below FAILURE_RATIO_THRESHOLD — silent
  });

  it('I2 OVERRIDE: a real MISS overrides a premature WEAK-POSITIVE (weak verdicts yield to evidence)', () => {
    capturePredictions(projectRoot, { text: 'PREDICTION: the login timeout is fixed by the config change' });
    const [exp] = readExpectations(projectRoot, { pendingOnly: true });
    resolveExpectation(projectRoot, { id: exp.id, verdict: 'WEAK-POSITIVE', observed: 'window closed' });
    const r = resolveExpectation(projectRoot, { id: exp.id, verdict: 'MISS', observed: 'user: still broken' });
    expect(r.action).toBe('resolved');
    const [after] = readExpectations(projectRoot);
    expect(after.verdict).toBe('MISS');
    // and a hard verdict never flips back:
    const r2 = resolveExpectation(projectRoot, { id: exp.id, verdict: 'WEAK-POSITIVE' });
    expect(r2.action).toBe('already-resolved');
  });

  it('M2: judgeUserPrompt on a bare (non-kit) root never throws and never scaffolds', () => {
    const bare = join(sandbox, 'bare2');
    mkdirSync(bare, { recursive: true });
    expect(() => judgeUserPrompt({ projectRoot: bare, prompt: 'No, that is wrong entirely' })).not.toThrow();
    expect(existsSync(join(bare, 'context'))).toBe(false);
  });
});

describe('Task 192 — judgeUserPrompt (the UserPromptSubmit wire)', () => {
  it('a CORRECTION dampens the prior turn ids + resolves pending expectations MISS', () => {
    const db = openIndexDb({ projectRoot });
    seedFact(db, 'P-9LXBA3ZK', 0.5);
    db.close();
    appendRecallEntry(projectRoot, { session: 's1', source: 'search', query: 'q', ids: ['P-9LXBA3ZK'] });
    capturePredictions(projectRoot, { text: 'PREDICTION: the config change fixes the login timeout' });

    const r = judgeUserPrompt({
      projectRoot,
      session: 's1',
      prompt: 'No, that broke it — the timeout is worse now',
    });
    expect(r.signals.some((s) => s.kind === 'correction')).toBe(true);

    const sig = readSignalLog(projectRoot);
    expect(sig.some((e) => e.id === 'P-9LXBA3ZK' && e.event === 'dampen')).toBe(true);
    const all = readExpectations(projectRoot);
    expect(all.some((e) => e.verdict === 'MISS')).toBe(true);
  });

  it('a REVERSAL prompt resolves pending expectations as REVERSAL', () => {
    capturePredictions(projectRoot, { text: 'PREDICTION: uv installs the dependencies noticeably faster' });
    judgeUserPrompt({ projectRoot, session: 's1', prompt: 'go back to pip, this is not working' });
    const all = readExpectations(projectRoot);
    expect(all.some((e) => e.verdict === 'REVERSAL')).toBe(true);
  });

  it('a NORMAL prompt emits nothing (no dampen storm from ordinary conversation — over-mutation guard)', () => {
    appendRecallEntry(projectRoot, { session: 's1', source: 'search', query: 'q', ids: ['P-9LXBA3ZK'] });
    const r = judgeUserPrompt({ projectRoot, session: 's1', prompt: 'looks good, please continue with the next step' });
    expect(r.signals).toHaveLength(0);
    expect(readSignalLog(projectRoot)).toHaveLength(0);
  });

  it('a CORRECTION resolves ONLY the in-window expectation, not a stale one (D-312 over-mutation fix)', () => {
    // A pending expectation captured now; the correction fires ~2 hours later.
    // Only expectations within TURN_WINDOW_MS of the correction may resolve —
    // a stale prediction must NOT get locked to MISS/REVERSAL by an unrelated
    // later correction (MISS/REVERSAL are the sticky verdicts). This is the
    // over-mutation class: seed 1 stale record, fire an unrelated correction,
    // assert the stale record is UNTOUCHED.
    capturePredictions(projectRoot, { text: 'PREDICTION: the config change fixes the login timeout' });
    const captureMs = Date.parse(readExpectations(projectRoot, { pendingOnly: true })[0].ts);

    // A correction two hours after capture — well past TURN_WINDOW_MS (15 min).
    const laterMs = captureMs + 2 * 60 * 60 * 1000;
    judgeUserPrompt({
      projectRoot,
      session: 's1',
      prompt: 'No, that broke it — the timeout is worse now',
      now: laterMs,
    });
    const stillPending = readExpectations(projectRoot, { pendingOnly: true });
    expect(stillPending).toHaveLength(1); // untouched — outside the window
    expect(readExpectations(projectRoot).some((e) => e.verdict === 'MISS')).toBe(false);
  });

  it('a CORRECTION still resolves an IN-window expectation MISS (the D-312 fix does not over-restrict)', () => {
    // Companion to the over-mutation test: within the window, resolution WORKS.
    capturePredictions(projectRoot, { text: 'PREDICTION: the config change fixes the login timeout' });
    const captureMs = Date.parse(readExpectations(projectRoot, { pendingOnly: true })[0].ts);
    judgeUserPrompt({
      projectRoot,
      session: 's1',
      prompt: 'No, that broke it — the timeout is worse now',
      now: captureMs + 60_000, // one minute later — inside TURN_WINDOW_MS
    });
    expect(readExpectations(projectRoot).some((e) => e.verdict === 'MISS')).toBe(true);
  });
});

describe('Task 192 — AUTOMATIC PATH (the hooks fire the judge, no cmk command)', () => {
  it('captureTurn: a failing tool call in the session JSONL dampens the searched ids via the screen', () => {
    const db = openIndexDb({ projectRoot });
    seedFact(db, 'P-9LXBA3ZK', 0.5);
    db.close();
    appendRecallEntry(projectRoot, { session: 's1', source: 'search', query: 'q', ids: ['P-9LXBA3ZK'] });

    // The Anthropic session JSONL shape (same fixture as cli-capture-turn):
    const jsonlPath = join(sandbox, 'session.jsonl');
    const lines = [
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }] } }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'FAIL 3 tests' }] } }),
    ];
    writeFileSync(jsonlPath, `${lines.join('\n')}\n`, 'utf8');
    const stubPath = join(sandbox, 'stub.mjs');
    writeFileSync(stubPath, 'process.exit(0);\n', 'utf8');

    captureTurn({
      payload: { assistant_message: 'tests ran', transcript_path: jsonlPath, session_id: 's1' },
      projectRoot,
      autoExtractPath: stubPath,
      now: new Date().toISOString(),
    });

    const sig = readSignalLog(projectRoot);
    expect(sig.some((e) => e.id === 'P-9LXBA3ZK' && e.event === 'dampen' && e.applied === true)).toBe(true);
  });

  it('capturePrompt: a correction prompt dampens the prior ids — hooks only', () => {
    const db = openIndexDb({ projectRoot });
    seedFact(db, 'P-9LXBA3ZK', 0.5);
    db.close();
    appendRecallEntry(projectRoot, { session: 's1', source: 'search', query: 'q', ids: ['P-9LXBA3ZK'] });

    capturePrompt({
      payload: { prompt: 'No, that is not right — the port is 8080', session_id: 's1' },
      projectRoot,
      now: new Date().toISOString(),
    });

    const sig = readSignalLog(projectRoot);
    expect(sig.some((e) => e.id === 'P-9LXBA3ZK' && e.event === 'dampen')).toBe(true);
  });
});
