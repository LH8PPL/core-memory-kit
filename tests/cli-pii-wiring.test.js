// @doors: 1, 2, 5
// Door 3 N/A: no subprocess in the explicit write path (Poison_Guard/maskPii
//   are in-process; the L3 judge's spawn side is transcript-screen's suite).
// Door 4 N/A: no message-queue interaction.
// Door 5: redactions.log NDJSON asserted (the recovery surface).
//
// Tests for Task 148.2 (ADR-0019, design §6.10) — L1 wired into the EXPLICIT
// write path (memoryWrite: scratchpad bullets + rich facts). The contract:
//   - committed tiers (P/U) get maskPii BEFORE dedup/disk — the landed text
//     carries placeholders, never the PII; originals land ONLY in the
//     gitignored redactions.log.
//   - the local tier (L) keeps text verbatim (machine-local is its purpose —
//     same posture as the existing home-path gate).
//   - privacy.screen: 'off' reverts to pre-148 behavior (home-paths only).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memoryWrite } from '../packages/cli/src/memory-write.mjs';
import { writeFact } from '../packages/cli/src/write-fact.mjs';
import { captureTurn } from '../packages/cli/src/capture-turn.mjs';
import { capturePrompt } from '../packages/cli/src/capture-prompt.mjs';
import { liveTranscriptPath, committedTranscriptPath } from '../packages/cli/src/transcript-screen.mjs';
import { redactionsLogPath } from '../packages/cli/src/redactions-log.mjs';
import { PII_PLACEHOLDERS } from '../packages/cli/src/pii-patterns.mjs';

let projectRoot;
let userDir;

function seedScratchpad(root) {
  mkdirSync(join(root, 'context'), { recursive: true });
  writeFileSync(
    join(root, 'context', 'MEMORY.md'),
    '<!-- Cap: 2500 chars -->\n\n# Working Memory\n\n## Active Threads\n\n## Environment Notes\n\n## Pending Decisions\n',
    'utf8',
  );
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'cmk-piiw-'));
  userDir = mkdtempSync(join(tmpdir(), 'cmk-piiw-u-'));
  seedScratchpad(projectRoot);
});

afterEach(() => {
  for (const d of [projectRoot, userDir]) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* Windows EPERM drain */
    }
  }
});

describe('Task 148.2 — L1 on the explicit write path (Doors 1+2+5)', () => {
  it('a P-tier bullet with an email lands MASKED; the original lands only in redactions.log', () => {
    const res = memoryWrite({
      action: 'add',
      tier: 'P',
      scratchpad: 'MEMORY.md',
      section: 'Environment Notes',
      text: 'the maintainer contact is someuser@gmail.com for now',
      projectRoot,
      userDir,
      source: 'user-explicit',
    });
    expect(res.action).toBe('appended');
    const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(memory).toContain(PII_PLACEHOLDERS.EMAIL);
    expect(memory).not.toContain('someuser@gmail.com');
    // Door 5: the recovery record
    const log = readFileSync(redactionsLogPath(projectRoot), 'utf8');
    expect(log).toContain('someuser@gmail.com');
    expect(log).toContain('"layer":"L1"');
  });

  it('clean text writes verbatim with NO redactions.log entry (clean turns are free)', () => {
    const res = memoryWrite({
      action: 'add',
      tier: 'P',
      scratchpad: 'MEMORY.md',
      section: 'Environment Notes',
      text: 'Node 20 runs the test suite',
      projectRoot,
      userDir,
      source: 'user-explicit',
    });
    expect(res.action).toBe('appended');
    expect(existsSync(redactionsLogPath(projectRoot))).toBe(false);
  });

  it('a rich FACT body with an email lands MASKED via writeFact (the 5-caller choke point)', () => {
    const res = writeFact({
      projectRoot,
      userDir,
      tier: 'P',
      type: 'project',
      slug: 'contact_convention',
      title: 'contact convention',
      body: 'ping someuser@gmail.com when the deploy lands',
      writeSource: 'user-explicit',
      trust: 'high',
      sourceFile: 'context/transcripts/2026-07-07.md',
      sourceLine: 1,
      sourceSha1: 'abc123ef0123456789abcdef0123456789abcdef',
      createdAt: '2026-07-07T20:00:00Z',
    });
    expect(res.action).toBe('created');
    const fact = readFileSync(res.path, 'utf8');
    expect(fact).toContain(PII_PLACEHOLDERS.EMAIL);
    expect(fact).not.toContain('someuser@gmail.com');
    const log = readFileSync(redactionsLogPath(projectRoot), 'utf8');
    expect(log).toContain('someuser@gmail.com');
  });

  it('captureTurn (screen on): the turn lands L1-MASKED in the gitignored LIVE buffer; the committed transcript is untouched (148.2b/148.3)', () => {
    const now = '2026-07-07T20:00:00Z';
    const r = captureTurn({
      payload: { assistant_message: 'ping someuser@gmail.com when done' },
      projectRoot,
      now,
    });
    expect(r.action).toBe('captured');
    const live = readFileSync(liveTranscriptPath(projectRoot, '2026-07-07'), 'utf8');
    expect(live).toContain(PII_PLACEHOLDERS.EMAIL);
    expect(live).not.toContain('someuser@gmail.com');
    // fail-closed: nothing reaches the committed file until the judge promotes
    expect(existsSync(committedTranscriptPath(projectRoot, '2026-07-07'))).toBe(false);
    // the original is recoverable
    expect(readFileSync(redactionsLogPath(projectRoot), 'utf8')).toContain('someuser@gmail.com');
  });

  it('captureTurn (screen on): the now.md session buffer is L1-MASKED too (Task 148 review M1 — the §6.10 commit-eligible now.md write site)', () => {
    // now.md → today-{date}.md is a COMMITTED path for normal users; design
    // §6.10 line 946 names now.md appends as a commit-eligible write. This pins
    // that the buffered conversation carries placeholders, not the PII — a
    // future refactor that re-derives the now.md text from the raw turn would
    // fail here instead of silently re-leaking.
    captureTurn({
      payload: { assistant_message: 'ping someuser@gmail.com when done' },
      projectRoot,
      now: '2026-07-07T20:03:00Z',
    });
    const nowMd = readFileSync(join(projectRoot, 'context', 'sessions', 'now.md'), 'utf8');
    expect(nowMd).toContain(PII_PLACEHOLDERS.EMAIL);
    expect(nowMd).not.toContain('someuser@gmail.com');
  });

  it('capturePrompt (screen on): the user prompt lands L1-MASKED in the live buffer', () => {
    const r = capturePrompt({
      payload: { prompt: 'my number is (555) 123-4567, call me' },
      projectRoot,
      now: '2026-07-07T20:01:00Z',
    });
    expect(r.action).toBe('appended');
    const live = readFileSync(liveTranscriptPath(projectRoot, '2026-07-07'), 'utf8');
    expect(live).toContain(PII_PLACEHOLDERS.PHONE);
    expect(live).not.toContain('(555) 123-4567');
    expect(existsSync(committedTranscriptPath(projectRoot, '2026-07-07'))).toBe(false);
  });

  it('captureTurn (screen OFF): pre-148 behavior — direct committed append, verbatim', () => {
    writeFileSync(
      join(projectRoot, 'context', 'settings.json'),
      JSON.stringify({ privacy: { screen: 'off' } }),
      'utf8',
    );
    const r = captureTurn({
      payload: { assistant_message: 'ping someuser@gmail.com when done' },
      projectRoot,
      now: '2026-07-07T20:02:00Z',
    });
    expect(r.action).toBe('captured');
    const committed = readFileSync(committedTranscriptPath(projectRoot, '2026-07-07'), 'utf8');
    expect(committed).toContain('someuser@gmail.com');
    expect(existsSync(liveTranscriptPath(projectRoot, '2026-07-07'))).toBe(false);
  });

  it('privacy.screen: off → pre-148 behavior (email verbatim; home-path abstraction still applies)', () => {
    writeFileSync(
      join(projectRoot, 'context', 'settings.json'),
      JSON.stringify({ privacy: { screen: 'off' } }),
      'utf8',
    );
    const res = memoryWrite({
      action: 'add',
      tier: 'P',
      scratchpad: 'MEMORY.md',
      section: 'Environment Notes',
      text: 'reach someuser@gmail.com under C:\\Users\\someone\\proj',
      projectRoot,
      userDir,
      source: 'user-explicit',
    });
    expect(res.action).toBe('appended');
    const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(memory).toContain('someuser@gmail.com'); // kill-switch honored
    expect(memory).toContain('~'); // the pre-148 home-path gate is NOT disabled
    expect(memory).not.toContain('C:\\Users\\someone');
  });
});
