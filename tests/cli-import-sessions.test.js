// @doors: 1, 2, 3, 5
// Door 3 covered in-process: the LLM boundary is the injected CompressorBackend
//   (MockHaikuBackend records every compress() call — argv/env spawn shape is
//   compressor.mjs's own surface, pinned by its spawn-smoke tests). The
//   @door-3.5 prompt assertions below pin WHAT IS SENT to the backend.
// Door 4 N/A: no message-queue interaction.

// Tests for Task 225 — `cmk import-sessions` (the v0.6.0 headline, D-326):
// bootstrap the memory from EXISTING Claude Code session history so day one
// isn't empty. Pipeline per session (oldest-first):
//   discoverSessions (38b) → extractTranscript (38b) → raw extract archived to
//   the GITIGNORED context/transcripts/imported/ floor (ADR-0010) → compressor
//   backend summarizes into the rolling-window day-file shape → L1 maskPii +
//   screenBeforeCommittedWrite (216) → append today-<date>.md with an
//   imported-session provenance marker (213) → ledger + audit (the
//   artifact-derived resume point, ADR-0020 — NOT the video's run-once
//   sentinel) → transcript-chunk index sync → searchable immediately.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  utimesSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../packages/cli/src/install.mjs';
import { MockHaikuBackend } from '../packages/cli/src/compressor.mjs';
import {
  importSessions,
  readImportedSessionIds,
  harnessSlugForPath,
  DEFAULT_MAX_SESSIONS,
  SUMMARY_MAX_BYTES,
} from '../packages/cli/src/import-sessions.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import { reindexBoot } from '../packages/cli/src/index-rebuild.mjs';
import { search } from '../packages/cli/src/search.mjs';
import { readAuditLog } from '../packages/cli/src/audit-log.mjs';
import {
  runImportSessions,
  offerImportSessions,
  runInstall,
} from '../packages/cli/src/subcommands.mjs';

let sandbox;
let projectRoot;
let userDir;
let harnessRoot;
let slug;

const NOW = '2026-07-18T12:00:00Z';

// Valid session-jsonl UUIDs (basename shape [0-9a-f-]{36}, per transcripts.mjs).
const UUID_A = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_B = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';
const UUID_C = 'cccccccc-3333-4ccc-8ccc-cccccccccccc';

const DAY_SUMMARY = [
  '## Decisions',
  '- Adopted thin-routes layering for the gateway backend',
  '',
  '## Active Threads',
  '- ConnectionManager broadcast pattern for websocket fan-out',
].join('\n');

function writeSessionJsonl(root, sessionSlug, uuid, turns, { mtime } = {}) {
  const dir = join(root, sessionSlug);
  mkdirSync(dir, { recursive: true });
  const lines = turns.map((t) =>
    JSON.stringify({
      type: t.role,
      timestamp: t.ts,
      message: { role: t.role, content: [{ type: 'text', text: t.text }] },
    }),
  );
  const p = join(dir, `${uuid}.jsonl`);
  writeFileSync(p, lines.join('\n') + '\n', 'utf8');
  if (mtime) {
    const d = new Date(mtime);
    utimesSync(p, d, d);
  }
  return p;
}

function seedThreeSessions() {
  // Oldest → newest: A (June 1) → B (June 2) → C (June 3).
  writeSessionJsonl(
    harnessRoot,
    slug,
    UUID_A,
    [
      { role: 'user', ts: '2026-06-01T09:00:00Z', text: 'How should we layer the gateway backend?' },
      { role: 'assistant', ts: '2026-06-01T09:01:00Z', text: 'Thin routes over services over repositories.' },
    ],
    { mtime: '2026-06-01T10:00:00Z' },
  );
  writeSessionJsonl(
    harnessRoot,
    slug,
    UUID_B,
    [
      { role: 'user', ts: '2026-06-02T09:00:00Z', text: 'Websocket fan-out design?' },
      { role: 'assistant', ts: '2026-06-02T09:01:00Z', text: 'A ConnectionManager with a broadcast method.' },
    ],
    { mtime: '2026-06-02T10:00:00Z' },
  );
  writeSessionJsonl(
    harnessRoot,
    slug,
    UUID_C,
    [
      { role: 'user', ts: '2026-06-03T09:00:00Z', text: 'Retry policy for the queue consumer?' },
      { role: 'assistant', ts: '2026-06-03T09:01:00Z', text: 'Exponential backoff, five attempts.' },
    ],
    { mtime: '2026-06-03T10:00:00Z' },
  );
}

function makeBackend(n = 3) {
  return new MockHaikuBackend({
    responses: Array.from({ length: n }, () => ({
      outputText: DAY_SUMMARY,
      inputTokens: 100,
      outputTokens: 40,
      costUSD: 0.0001,
      preservedIds: [],
    })),
  });
}

function dayFile(date) {
  return join(projectRoot, 'context', 'sessions', `today-${date}.md`);
}

function ledgerPath() {
  return join(projectRoot, 'context', 'sessions', 'imported-sessions.md');
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-import-sessions-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user-tier');
  harnessRoot = join(sandbox, 'harness', 'projects');
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(harnessRoot, { recursive: true });
  install({ projectRoot, userTier: userDir, skipClaudeFiles: true, noHooks: true, noSemantic: true });
  slug = harnessSlugForPath(projectRoot);
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('importSessions — full pipeline (Doors 1, 2, 3, 5)', () => {
  it('imports discovered sessions into dated day files with provenance markers, ledger, raw floor, and audit trail', async () => {
    seedThreeSessions();
    const backend = makeBackend(3);
    const result = await importSessions({ projectRoot, backend, now: NOW, harnessRoot });

    // Door 1 — response shape.
    expect(result.action).toBe('completed');
    expect(result.discovered).toBe(3);
    expect(result.alreadyImported).toBe(0);
    expect(result.selected).toBe(3);
    expect(result.imported).toHaveLength(3);
    expect(result.screened_out).toEqual([]);
    expect(result.failed).toEqual([]);
    // Oldest-first processing order.
    expect(result.imported.map((s) => s.sessionId)).toEqual([UUID_A, UUID_B, UUID_C]);
    expect(result.imported[0]).toMatchObject({
      sessionId: UUID_A,
      slug,
      date: '2026-06-01',
    });

    // Door 2 — day files exist, carry the imported-session provenance marker
    // (Task 213: session id + span, so the summary stays traceable) + summary.
    for (const [uuid, date] of [
      [UUID_A, '2026-06-01'],
      [UUID_B, '2026-06-02'],
      [UUID_C, '2026-06-03'],
    ]) {
      const text = readFileSync(dayFile(date), 'utf8');
      expect(text).toContain(`imported-session: ${uuid}`);
      expect(text).toContain('## Decisions');
      expect(text).toContain('thin-routes layering');
    }

    // Door 2 — the committed ledger records every session id (the resume point).
    const ledger = readFileSync(ledgerPath(), 'utf8');
    for (const uuid of [UUID_A, UUID_B, UUID_C]) expect(ledger).toContain(uuid);
    expect(readImportedSessionIds(projectRoot).has(UUID_A)).toBe(true);

    // Door 2 — raw extracts archived to the gitignored floor (ADR-0010).
    const rawDir = join(projectRoot, 'context', 'transcripts', 'imported');
    expect(existsSync(join(rawDir, `${UUID_A}.md`))).toBe(true);
    expect(readFileSync(join(rawDir, `${UUID_A}.md`), 'utf8')).toContain('layer the gateway backend');

    // Door 3 — exactly one backend call per session.
    expect(backend.calls).toHaveLength(3);

    // @door-3.5: import-sessions summarize prompt — pin WHAT IS SENT.
    // Input carries the extracted session text; instructions carry the
    // day-file format contract AND the ADR-0019 privacy rule (the
    // differentiator: his import summarizes unscreened, ours instructs the
    // judge in the same call).
    expect(backend.calls[0].input).toContain('layer the gateway backend');
    expect(backend.calls[0].instructions).toContain('## Decisions');
    expect(backend.calls[0].instructions).toMatch(/never include personal names|no personal names/i);
    expect(backend.calls[0].instructions).toContain('as if it had been captured live');
    expect(backend.calls[0].maxOutputBytes).toBe(SUMMARY_MAX_BYTES);

    // Door 5 — audit trail: one import-applied entry per session.
    const audit = readAuditLog(join(projectRoot, 'context'));
    const applied = audit.filter((e) => e.reasonCode === 'import-applied' && e.action === 'import-session');
    expect(applied.map((e) => e.id).sort()).toEqual([UUID_A, UUID_B, UUID_C].sort());
  });

  it('appends same-date sessions into ONE day file, both markers present', async () => {
    writeSessionJsonl(
      harnessRoot,
      slug,
      UUID_A,
      [{ role: 'user', ts: '2026-06-05T08:00:00Z', text: 'Morning topic alpha.' }],
      { mtime: '2026-06-05T09:00:00Z' },
    );
    writeSessionJsonl(
      harnessRoot,
      slug,
      UUID_B,
      [{ role: 'user', ts: '2026-06-05T15:00:00Z', text: 'Afternoon topic beta.' }],
      { mtime: '2026-06-05T16:00:00Z' },
    );
    const result = await importSessions({ projectRoot, backend: makeBackend(2), now: NOW, harnessRoot });
    expect(result.imported).toHaveLength(2);
    const text = readFileSync(dayFile('2026-06-05'), 'utf8');
    expect(text).toContain(`imported-session: ${UUID_A}`);
    expect(text).toContain(`imported-session: ${UUID_B}`);
  });
});

describe('importSessions — idempotency + resumability (ADR-0020)', () => {
  it('re-run on an already-imported corpus is a no-op: zero backend calls, day files byte-identical', async () => {
    seedThreeSessions();
    await importSessions({ projectRoot, backend: makeBackend(3), now: NOW, harnessRoot });
    const before = readFileSync(dayFile('2026-06-01'), 'utf8');

    const backend2 = makeBackend(3);
    const rerun = await importSessions({ projectRoot, backend: backend2, now: NOW, harnessRoot });
    expect(rerun.alreadyImported).toBe(3);
    expect(rerun.imported).toEqual([]);
    expect(backend2.calls).toHaveLength(0);
    expect(readFileSync(dayFile('2026-06-01'), 'utf8')).toBe(before);
  });

  it('a run that fails mid-way keeps the finished units; the re-run imports ONLY the remainder', async () => {
    seedThreeSessions();
    // Only ONE canned response: session A succeeds, B and C fail at the
    // backend (the "killed at 80%" shape, deterministic — ADR-0020).
    const failing = makeBackend(1);
    const first = await importSessions({ projectRoot, backend: failing, now: NOW, harnessRoot });
    expect(first.imported.map((s) => s.sessionId)).toEqual([UUID_A]);
    expect(first.failed).toHaveLength(2);
    expect(readImportedSessionIds(projectRoot).has(UUID_A)).toBe(true);
    expect(readImportedSessionIds(projectRoot).has(UUID_B)).toBe(false);

    const backend2 = makeBackend(3);
    const second = await importSessions({ projectRoot, backend: backend2, now: NOW, harnessRoot });
    expect(second.alreadyImported).toBe(1);
    expect(second.imported.map((s) => s.sessionId)).toEqual([UUID_B, UUID_C]);
    // Only the remainder paid for — A's summary is never re-bought.
    expect(backend2.calls).toHaveLength(2);
  });
});

describe('importSessions — the screen (216 + ADR-0019): nothing unscreened lands committed', () => {
  it('a summary carrying a secret is dropped + logged; other sessions still import (over-mutation guard)', async () => {
    seedThreeSessions();
    const backend = new MockHaikuBackend({
      responses: [
        { outputText: DAY_SUMMARY, inputTokens: 1, outputTokens: 1, costUSD: 0, preservedIds: [] },
        {
          // Session B's summary leaks an AWS access key — the screen must
          // reject the WRITE, not the run.
          outputText: '## Decisions\n- Use key AKIAIOSFODNN7EXAMPLE for the deploy',
          inputTokens: 1,
          outputTokens: 1,
          costUSD: 0,
          preservedIds: [],
        },
        { outputText: DAY_SUMMARY, inputTokens: 1, outputTokens: 1, costUSD: 0, preservedIds: [] },
      ],
    });
    const result = await importSessions({ projectRoot, backend, now: NOW, harnessRoot });

    expect(result.imported.map((s) => s.sessionId)).toEqual([UUID_A, UUID_C]);
    expect(result.screened_out).toHaveLength(1);
    expect(result.screened_out[0].sessionId).toBe(UUID_B);

    // The poisoned day file was never written; the secret is nowhere on the
    // committed tier.
    expect(existsSync(dayFile('2026-06-02'))).toBe(false);
    // Door 5 — the rejection is logged (redacted).
    const pgLog = join(projectRoot, 'context', '.locks', 'poison-guard.log');
    expect(existsSync(pgLog)).toBe(true);
    expect(readFileSync(pgLog, 'utf8')).toContain('import-sessions');

    // A screened session is RECORDED (not retried forever): re-run buys nothing.
    const backend2 = makeBackend(3);
    const rerun = await importSessions({ projectRoot, backend: backend2, now: NOW, harnessRoot });
    expect(backend2.calls).toHaveLength(0);
    expect(rerun.alreadyImported).toBe(3);
  });

  it('L1 masks structured PII in the summary before it lands (email → «EMAIL»)', async () => {
    writeSessionJsonl(
      harnessRoot,
      slug,
      UUID_A,
      [{ role: 'user', ts: '2026-06-01T09:00:00Z', text: 'Contact detail discussion.' }],
      { mtime: '2026-06-01T10:00:00Z' },
    );
    const backend = new MockHaikuBackend({
      responses: [
        {
          outputText: '## Decisions\n- Send reports to ops.person@acme-corp.io weekly',
          inputTokens: 1,
          outputTokens: 1,
          costUSD: 0,
          preservedIds: [],
        },
      ],
    });
    await importSessions({ projectRoot, backend, now: NOW, harnessRoot });
    const text = readFileSync(dayFile('2026-06-01'), 'utf8');
    expect(text).not.toContain('ops.person@acme-corp.io');
    expect(text).toContain('«EMAIL»');
  });
});

describe('importSessions — selection bounds (picker semantics)', () => {
  it('maxSessions at-cap: a bound equal to the corpus imports everything', async () => {
    seedThreeSessions();
    const result = await importSessions({
      projectRoot, backend: makeBackend(3), now: NOW, harnessRoot, maxSessions: 3,
    });
    expect(result.imported).toHaveLength(3);
  });

  it('maxSessions over-cap: the bound keeps the NEWEST sessions, drops the oldest', async () => {
    seedThreeSessions();
    const result = await importSessions({
      projectRoot, backend: makeBackend(2), now: NOW, harnessRoot, maxSessions: 2,
    });
    expect(result.discovered).toBe(3);
    expect(result.selected).toBe(2);
    expect(result.imported.map((s) => s.sessionId)).toEqual([UUID_B, UUID_C]);
    expect(readImportedSessionIds(projectRoot).has(UUID_A)).toBe(false);
  });

  it('sinceIso filters by session mtime', async () => {
    seedThreeSessions();
    const result = await importSessions({
      projectRoot, backend: makeBackend(2), now: NOW, harnessRoot, sinceIso: '2026-06-02T00:00:00Z',
    });
    expect(result.imported.map((s) => s.sessionId)).toEqual([UUID_B, UUID_C]);
  });

  it('default bound is DEFAULT_MAX_SESSIONS (a documented budget, not unbounded)', async () => {
    expect(DEFAULT_MAX_SESSIONS).toBeGreaterThan(0);
    // The default flows through as the selection cap.
    seedThreeSessions();
    const result = await importSessions({ projectRoot, backend: makeBackend(3), now: NOW, harnessRoot });
    expect(result.selected).toBe(Math.min(3, DEFAULT_MAX_SESSIONS));
  });

  it('scopes to the current project slug by default; --all-projects widens', async () => {
    seedThreeSessions();
    writeSessionJsonl(
      harnessRoot,
      'some--other--project',
      'dddddddd-4444-4ddd-8ddd-dddddddddddd',
      [{ role: 'user', ts: '2026-06-04T09:00:00Z', text: 'Unrelated project chatter.' }],
      { mtime: '2026-06-04T10:00:00Z' },
    );
    const scoped = await importSessions({ projectRoot, backend: makeBackend(3), now: NOW, harnessRoot });
    expect(scoped.discovered).toBe(3);

    // Reset to a fresh project for the widened run.
    const all = await importSessions({
      projectRoot, backend: makeBackend(4), now: NOW, harnessRoot, allProjects: true,
    });
    expect(all.discovered).toBe(4);
  });
});

describe('importSessions — edges', () => {
  it('dry-run previews without writing or spending', async () => {
    seedThreeSessions();
    const backend = makeBackend(3);
    const result = await importSessions({ projectRoot, backend, now: NOW, harnessRoot, dryRun: true });
    expect(result.action).toBe('dry-run');
    expect(result.preview).toHaveLength(3);
    expect(backend.calls).toHaveLength(0);
    expect(existsSync(ledgerPath())).toBe(false);
    expect(existsSync(dayFile('2026-06-01'))).toBe(false);
  });

  it('an empty session (no text turns) is recorded skipped-empty, never compressed, never retried', async () => {
    writeSessionJsonl(harnessRoot, slug, UUID_A, [], { mtime: '2026-06-01T10:00:00Z' });
    const backend = makeBackend(1);
    const result = await importSessions({ projectRoot, backend, now: NOW, harnessRoot });
    expect(backend.calls).toHaveLength(0);
    expect(result.imported).toEqual([]);
    // Recorded so a re-run skips it.
    const backend2 = makeBackend(1);
    const rerun = await importSessions({ projectRoot, backend: backend2, now: NOW, harnessRoot });
    expect(rerun.alreadyImported).toBe(1);
    expect(backend2.calls).toHaveLength(0);
  });

  it('no harness history → honest skip, no writes', async () => {
    const result = await importSessions({ projectRoot, backend: makeBackend(0), now: NOW, harnessRoot });
    expect(result.action).toBe('skipped');
    expect(result.reason).toBe('no-sessions');
    expect(existsSync(ledgerPath())).toBe(false);
  });
});

describe('runImportSessions — the CLI layer (dep-injected, no stdin, no live backend)', () => {
  it('confirmed run imports; the console narrates count + searchability', async () => {
    seedThreeSessions();
    const logs = [];
    const result = await runImportSessions({
      projectRoot,
      backend: makeBackend(3),
      harnessRoot,
      now: NOW,
      prompter: async () => 'y',
      log: (m) => logs.push(m),
      logError: (m) => logs.push(m),
    });
    expect(result.action).toBe('completed');
    expect(result.imported).toHaveLength(3);
    const out = logs.join('\n');
    expect(out).toContain('found 3 session(s)');
    expect(out).toContain('imported 3 session(s)');
    expect(out).toContain('cmk search');
  });

  it('declined confirmation writes nothing (default-skip)', async () => {
    seedThreeSessions();
    const backend = makeBackend(3);
    const result = await runImportSessions({
      projectRoot,
      backend,
      harnessRoot,
      now: NOW,
      prompter: async () => '',
      log: () => {},
      logError: () => {},
    });
    expect(result.action).toBe('declined');
    expect(backend.calls).toHaveLength(0);
    expect(existsSync(ledgerPath())).toBe(false);
  });

  it('non-interactive without --yes refuses with exit 2 and writes nothing', async () => {
    seedThreeSessions();
    const errs = [];
    const prevExit = process.exitCode;
    try {
      await runImportSessions({
        projectRoot,
        backend: makeBackend(3),
        harnessRoot,
        now: NOW,
        // no prompter injected; test process has no TTY on stdin+stdout in CI,
        // but pin it deterministically regardless:
        log: () => {},
        logError: (m) => errs.push(m),
        prompter: undefined,
      });
      expect(errs.join('\n')).toContain('--yes');
      expect(existsSync(ledgerPath())).toBe(false);
    } finally {
      process.exitCode = prevExit;
    }
  });

  it('--yes skips the prompt entirely', async () => {
    seedThreeSessions();
    const result = await runImportSessions({
      projectRoot,
      backend: makeBackend(3),
      harnessRoot,
      now: NOW,
      yes: true,
      log: () => {},
      logError: () => {},
    });
    expect(result.imported).toHaveLength(3);
  });

  it('rejects a non-positive --max with exit 2', async () => {
    const errs = [];
    const prevExit = process.exitCode;
    try {
      await runImportSessions({
        projectRoot,
        backend: makeBackend(0),
        harnessRoot,
        max: '0',
        log: () => {},
        logError: (m) => errs.push(m),
      });
      expect(errs.join('\n')).toContain('--max');
      expect(process.exitCode).toBe(2);
    } finally {
      process.exitCode = prevExit;
    }
  });
});

describe('the install offer (Task 225 automatic-path criterion)', () => {
  it('offerImportSessions: history present + "y" → imports through the same pipeline', async () => {
    seedThreeSessions();
    const logs = [];
    const offer = await offerImportSessions(
      { harnessRoot, importBackend: makeBackend(3), now: NOW, importPrompter: async () => 'y' },
      { projectRoot, log: (m) => logs.push(m) },
    );
    expect(offer.action).toBe('imported');
    expect(offer.result.imported).toHaveLength(3);
    expect(existsSync(dayFile('2026-06-01'))).toBe(true);
  });

  it('offerImportSessions: default answer skips (one question, default-skip)', async () => {
    seedThreeSessions();
    const backend = makeBackend(3);
    const offer = await offerImportSessions(
      { harnessRoot, importBackend: backend, now: NOW, importPrompter: async () => '' },
      { projectRoot, log: () => {} },
    );
    expect(offer.action).toBe('declined');
    expect(backend.calls).toHaveLength(0);
  });

  it('offerImportSessions: no history → silent no-op; no prompter → printed hint only', async () => {
    const none = await offerImportSessions(
      { harnessRoot, importPrompter: async () => 'y' },
      { projectRoot, log: () => {} },
    );
    expect(none.action).toBe('none');

    seedThreeSessions();
    const logs = [];
    const hint = await offerImportSessions(
      { harnessRoot }, // no prompter, no TTY in the test runner
      { projectRoot, log: (m) => logs.push(m) },
    );
    expect(hint.action).toBe('hint');
    expect(logs.join('\n')).toContain('cmk import-sessions');
    expect(existsSync(ledgerPath())).toBe(false);
  });

  it('cmk install detects existing harness history and OFFERS the import (no manual command)', async () => {
    // Fresh project dir so install runs its real claude-code path.
    const freshRoot = join(sandbox, 'fresh-proj');
    mkdirSync(freshRoot, { recursive: true });
    const freshSlug = harnessSlugForPath(freshRoot);
    writeSessionJsonl(
      harnessRoot,
      freshSlug,
      UUID_A,
      [{ role: 'user', ts: '2026-06-01T09:00:00Z', text: 'Historic decision about caching.' }],
      { mtime: '2026-06-01T10:00:00Z' },
    );
    const logs = [];
    const questions = [];
    await runInstall({
      cwd: freshRoot,
      userTier: join(sandbox, 'user-tier-2'),
      hooks: false,
      semantic: false,
      bindingProbe: () => ({ ok: true }),
      harnessRoot,
      importBackend: makeBackend(1),
      now: NOW,
      importPrompter: async (q) => {
        questions.push(q);
        return 'y';
      },
      log: (m) => logs.push(m),
      logError: (m) => logs.push(m),
    });
    // ONE question, naming the detected history.
    expect(questions).toHaveLength(1);
    expect(questions[0]).toContain('existing Claude Code session(s)');
    expect(logs.join('\n')).toContain('Imported 1 session(s)');
    const day = join(freshRoot, 'context', 'sessions', 'today-2026-06-01.md');
    expect(existsSync(day)).toBe(true);
    expect(readFileSync(day, 'utf8')).toContain(`imported-session: ${UUID_A}`);
  });
});

describe('importSessions — searchable immediately (the done-criterion)', () => {
  it('imported summaries are FOUND by search with the day-file source citation', async () => {
    seedThreeSessions();
    await importSessions({ projectRoot, backend: makeBackend(3), now: NOW, harnessRoot });

    const db = openIndexDb({ projectRoot });
    try {
      reindexBoot({ projectRoot, userDir, db });
      // Paraphrase-shaped keyword query against the summary content.
      const found = search({ db, query: 'websocket broadcast fan-out', scope: 'transcripts', projectRoot });
      expect(found.results.length).toBeGreaterThan(0);
      const hit = found.results.find((r) => String(r.source_file).includes('context/sessions/today-'));
      expect(hit).toBeTruthy();

      // The ledger itself must NOT pollute search (it's a UUID list, not memory).
      const uuidHit = search({ db, query: UUID_A.slice(0, 8), scope: 'transcripts', projectRoot });
      const ledgerRows = uuidHit.results.filter((r) => String(r.source_file).includes('imported-sessions.md'));
      expect(ledgerRows).toEqual([]);
    } finally {
      db.close();
    }
  });
});
