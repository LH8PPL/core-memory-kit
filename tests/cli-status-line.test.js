// @doors: 1, 2
// Door 2: reads real audit.log + queue files from a sandboxed install.
// Door 3 N/A: no subprocess — the line rides the existing hook output.
// Door 4 N/A: no message-queue.
// Door 5 N/A: the status line IS the observability surface (user-display);
//   it deliberately writes no log of its own.
//
// Task 145 (D-130) — the session-start status line. The kit's biggest UX
// weakness: when it works, the user sees NOTHING. One USER-FACING line at
// SessionStart via the hook's `systemMessage` field (user-display channel
// per the Anthropic hooks doc — the D-116 primary-source check; the model
// never sees it, zero token cost) builds the trust loop every silent
// system lacks.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStatusLine, injectContext } from '../packages/cli/src/inject-context.mjs';
import { install } from '../packages/cli/src/install.mjs';
import { writeFact } from '../packages/cli/src/write-fact.mjs';

let sandbox;
let projectRoot;
let userDir;

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-status-line-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
});

afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

const NOW = '2026-06-12T12:00:00Z';

describe('Task 145 — buildStatusLine (Door 1)', () => {
  it('empty memory → an honest "capture starts now" line, never silence', () => {
    const line = buildStatusLine({ snapshot: '', projectRoot, now: NOW });
    expect(typeof line).toBe('string');
    expect(line).toMatch(/^claude-memory-kit:/);
    expect(line).toMatch(/empty|starts/i);
  });

  it('counts the UNIQUE injected fact ids from the snapshot', () => {
    const snapshot = [
      'preamble text',
      '- (P-Q4TA2SAX) fact one',
      '- (P-JU7RRUT9) fact two',
      '- (P-Q4TA2SAX) the same id again (INDEX line) — not double-counted',
      '- (U-HSXWZZZA) a user-tier fact',
    ].join('\n');
    const line = buildStatusLine({ snapshot, projectRoot, now: NOW });
    expect(line).toContain('3 fact');
  });

  it('counts captures from the last 24h via audit.log (created + import), older ones excluded', () => {
    const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
    mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });
    const lines = [
      { schema: 1, ts: '2026-06-12T09:00:00Z', action: 'created', tier: 'P', id: 'P-AAAA2222' },
      { schema: 1, ts: '2026-06-11T22:00:00Z', action: 'import', tier: 'P', id: 'P-BBBB3333' },
      { schema: 1, ts: '2026-06-05T09:00:00Z', action: 'created', tier: 'P', id: 'P-CCCC4444' }, // old
      { schema: 1, ts: '2026-06-12T10:00:00Z', action: 'skipped', tier: 'P', id: 'P-DDDD5555' }, // not a capture
    ];
    appendFileSync(auditPath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
    const line = buildStatusLine({ snapshot: '- (P-AAAA2222) x', projectRoot, now: NOW });
    expect(line).toMatch(/2 captured in the last 24h/);
  });

  it('surfaces pending queue items (injected listers; zero-pending stays silent)', () => {
    const withPending = buildStatusLine({
      snapshot: '- (P-AAAA2222) x',
      projectRoot,
      now: NOW,
      listConflictsImpl: () => [{ id: 'c1' }],
      listReviewImpl: () => [{ id: 'r1' }, { id: 'r2' }],
    });
    expect(withPending).toMatch(/1 conflict/);
    expect(withPending).toMatch(/2 review/);
    expect(withPending).toMatch(/cmk queue/);

    const noPending = buildStatusLine({
      snapshot: '- (P-AAAA2222) x',
      projectRoot,
      now: NOW,
      listConflictsImpl: () => [],
      listReviewImpl: () => [],
    });
    expect(noPending).not.toMatch(/conflict|review|queue/);
  });

  it('never throws on a broken project (missing files → a line, not a crash)', () => {
    rmSync(join(projectRoot, 'context'), { recursive: true, force: true });
    const line = buildStatusLine({ snapshot: '', projectRoot, now: NOW });
    expect(typeof line).toBe('string');
  });
});

describe('Task 145 — the hook output carries systemMessage (Doors 1+2)', () => {
  it('injectContext emits hookOutput.systemMessage alongside additionalContext', async () => {
    // Seed one real fact so the snapshot is non-empty end-to-end.
    writeFact({
      tier: 'P',
      type: 'project',
      slug: 'status-line-seed',
      title: 'status line seed fact',
      body: 'the deploy gate runs before every release',
      writeSource: 'user-explicit',
      trust: 'high',
      sourceFile: 'test',
      sourceLine: 1,
      sourceSha1: 'abc123',
      projectRoot,
    });
    const r = await injectContext({ cwd: projectRoot, userDir, now: NOW });
    expect(r.hookOutput.hookSpecificOutput.additionalContext).toBe(r.snapshot);
    expect(typeof r.hookOutput.systemMessage).toBe('string');
    expect(r.hookOutput.systemMessage).toMatch(/^claude-memory-kit:/);
    // The user-display line never leaks INTO the model context.
    expect(r.snapshot).not.toContain(r.hookOutput.systemMessage);
  });
});
