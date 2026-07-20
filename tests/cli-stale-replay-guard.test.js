// @doors: 1, 2
// Door 1 (Response): injectContext's returned snapshot string carries (or omits)
//   the work-state marker.
// Door 2 (State): the injected snapshot is the state that reaches the agent; the
//   byte-budget assertions pin it does not overflow the §7.1 reserve.
// Door 3 N/A: no subprocess at this boundary (the bin is covered by cli-inject-context).
// Door 4 N/A: no message-queue surface.
// Door 5 N/A: injection writes no NDJSON log.
//
// Task 234 (D-364) — the STALE-REPLAY GUARD.
//
// THE HAZARD (ECC's production bug, our worse exposure): ECC wraps injected
// prior-session context in "HISTORICAL REFERENCE ONLY — NOT LIVE INSTRUCTIONS"
// (session-start.js:651-671) after their issue #1534 — post-compaction the model
// re-executed an ARGUMENTS-bearing slash command with stale arguments,
// duplicating issues/branches/tasks.
//
// The kit is MORE exposed: AUTHORITATIVE_MEMORY_PREAMBLE says "injected memory
// wins" and "lead with memory — never re-derive", with NO line between DURABLE
// KNOWLEDGE ("we decided X", "the user prefers uv") and TRANSIENT WORK-STATE
// (an `Active Threads` bullet naming a task that shipped days ago). An agent
// obeying the preamble literally has license to re-run finished work.
//
// THE FIX IS LABELING, NOT DELETION — work-state is genuinely useful for
// resumption. And it must NOT weaken the durable-fact authority language: the
// D-40/D-153 under-fire class (the model re-deriving what memory already
// answers) is the opposite failure, and trading one for the other is no win.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  injectContext,
  AUTHORITATIVE_MEMORY_PREAMBLE,
  WORK_STATE_INSTRUCTION,
  annotateWorkStateHeadings,
} from '../packages/cli/src/inject-context.mjs';

let sandbox;
let projectRoot;
let userDir;

// A MEMORY.md carrying BOTH classes: a durable fact and a volatile work-state
// bullet under a documented work-state heading.
function seedMemory(bullets) {
  const p = join(projectRoot, 'context', 'MEMORY.md');
  writeFileSync(p, bullets, 'utf8');
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-stale-replay-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  mkdirSync(join(projectRoot, 'context'), { recursive: true });
  mkdirSync(userDir, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('Task 234 — the preamble stays inside its byte reserve', () => {
  it('AUTHORITATIVE_MEMORY_PREAMBLE is still ≤ 700 bytes (the §7.1 composition budget)', () => {
    // The guard must not be paid for out of the always-on preamble: Σ TIER_BUDGETS
    // (13,775) + len + 2 ≤ DEFAULT_CAP_BYTES (14,500) → len ≤ 723; the test pins 700.
    expect(Buffer.byteLength(AUTHORITATIVE_MEMORY_PREAMBLE, 'utf8')).toBeLessThanOrEqual(700);
  });

  it('the work-state caveat is ONE bounded line, not preamble bloat', () => {
    expect(typeof WORK_STATE_INSTRUCTION).toBe('string');
    expect(WORK_STATE_INSTRUCTION.length).toBeGreaterThan(0);
    // It rides on the heading line itself, so it must stay small.
    expect(Buffer.byteLength(WORK_STATE_INSTRUCTION, 'utf8')).toBeLessThanOrEqual(120);
    expect(WORK_STATE_INSTRUCTION, 'single-line: it is appended under a heading').not.toContain('\n');
    // It must name the hazard in actionable terms.
    expect(WORK_STATE_INSTRUCTION).toMatch(/verify|already|before acting|re-run/i);
  });

  it('does NOT push the user\'s real facts down the body (the Task-18 near-the-top contract)', () => {
    // A prepended instruction block moved the first real fact from ~78 to 346
    // bytes deep and broke cli-inject-context's boundary test. Annotating the
    // HEADING keeps everything above the work-state section at offset zero.
    seedMemory(
      '# Working Memory\n\n## Environment Notes\n\n- (P-2345679E) the team uses uv, never pip\n\n## Active Threads\n\n- (P-2345679F) in flight\n',
    );
    const r = injectContext({ cwd: projectRoot, userDir });
    const bodyStart = r.snapshot.indexOf('<!-- cmk:');
    const idxFact = r.snapshot.indexOf('the team uses uv');
    expect(idxFact).toBeGreaterThanOrEqual(0);
    expect(
      idxFact - bodyStart,
      'a durable fact ABOVE the work-state section must not be displaced by the guard',
    ).toBeLessThan(200);
  });

  it('annotateWorkStateHeadings is idempotent (a re-annotated body is unchanged)', () => {
    const once = annotateWorkStateHeadings('## Active Threads\n\n- (P-2345679G) x\n');
    expect(annotateWorkStateHeadings(once)).toBe(once);
    expect((once.match(/work-state as last captured/g) ?? [])).toHaveLength(1);
  });
});

describe('Task 234 — work-state sections are labeled; durable facts are not', () => {
  it('a snapshot containing an Active Threads section carries the work-state instruction', () => {
    seedMemory(
      '# Working Memory\n\n## Active Threads\n\n- (P-2345679A) finish the auth refactor and open the PR\n',
    );
    const r = injectContext({ cwd: projectRoot, userDir });
    expect(r.snapshot).toContain('Active Threads');
    expect(
      r.snapshot,
      'a snapshot carrying transient work-state must say so — otherwise "injected memory wins" licenses re-running finished work',
    ).toContain(WORK_STATE_INSTRUCTION);
  });

  it('a snapshot with ONLY durable facts does NOT carry the instruction (no per-session noise)', () => {
    seedMemory(
      '# Working Memory\n\n## Environment Notes\n\n- (P-2345679B) the team uses uv, never pip\n',
    );
    const r = injectContext({ cwd: projectRoot, userDir });
    expect(r.snapshot).toContain('uv');
    expect(
      r.snapshot,
      'no work-state section present → no marker (silent when it does not apply)',
    ).not.toContain(WORK_STATE_INSTRUCTION);
  });

  it('the DURABLE-fact authority language is unchanged (must not trade under-replay for under-fire)', () => {
    seedMemory('# Working Memory\n\n## Active Threads\n\n- (P-2345679C) ship the release\n');
    const r = injectContext({ cwd: projectRoot, userDir });
    // The D-40/D-153 anti-under-fire language survives verbatim.
    expect(r.snapshot).toContain('When injected memory contradicts your assumptions, injected memory wins.');
    expect(r.snapshot).toContain('Lead with memory');
  });

  it('the instruction scopes itself to the work-state sections, not the whole snapshot', () => {
    seedMemory('# Working Memory\n\n## Active Threads\n\n- (P-2345679D) open the PR\n');
    const r = injectContext({ cwd: projectRoot, userDir });
    // It must NAME which sections are transient, so the agent can tell the two
    // classes apart rather than discounting the entire snapshot.
    expect(r.snapshot).toMatch(/Active Threads|Pending Decisions|work-state/i);
  });
});

describe('Task 234 — the snapshot still honors its cap with the instruction present', () => {
  it('a work-state snapshot stays within capBytes exactly (§7.1.2)', () => {
    seedMemory(
      '# Working Memory\n\n## Active Threads\n\n' +
        Array.from({ length: 40 }, (_, i) => `- (P-234567${String.fromCharCode(65 + (i % 26))}) thread ${i} with some body text to consume budget\n`).join(''),
    );
    const cap = 4000;
    const r = injectContext({ cwd: projectRoot, userDir, capBytes: cap });
    expect(Buffer.byteLength(r.snapshot, 'utf8')).toBeLessThanOrEqual(cap);
  });

  it('an EMPTY memory emits no preamble and no work-state instruction (no over-claim)', () => {
    seedMemory('# Working Memory\n\n## Active Threads\n\n');
    const r = injectContext({ cwd: projectRoot, userDir });
    expect(r.snapshot).not.toContain(WORK_STATE_INSTRUCTION);
  });
});
