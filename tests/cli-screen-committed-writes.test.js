// @doors: 1, 2, 5
// Door 3 N/A: every LLM call here goes through an injected CompressorBackend
//   (MockHaikuBackend); no subprocess spawn at these boundaries. The real-spawn
//   side is covered by the compressor spawn-smokes in their own files.
// Door 4 N/A: no message-queue interaction.
// Door 5: .locks/poison-guard.log NDJSON entries asserted (redacted, no cleartext).
//
// Tests for Task 216 (D-320) — screen LLM-generated / externally-sourced text
// through Poison_Guard before every COMMITTED-tier write (the "side doors"
// around the memoryWrite chokepoint). One test per wired site, each in the
// over-mutation shape: the clean content proceeds, the poisoned content is
// dropped/deferred/rejected — never silently lost AND never written.
//
// Sites under test:
//   1. screenBeforeCommittedWrite() itself (the shared helper + redacted log)
//   2. weekly-curate: the archive.md append (skip write + KEEP source days)
//   3. daily-distill: per-day artifact banking (poisoned day not banked,
//      clean day banks; the day self-heals by re-distilling next run)
//   4. daily-distill: the assembled recent.md backstop (legacy poisoned
//      artifact → old recent.md kept, write skipped)
//   5. transcript-screen: promote WITHHOLDS a poisoned batch (content-free
//      marker committed, watermark advances, raw stays in the live buffer) —
//      and screens SECRETS ONLY (injection phrases promote; finding 3 / D-320)
//   6. auto-persona: review-queue entries screened (poisoned entry dropped,
//      REDACTED user-tier audit entry)
//   7. trust: overrideTrust re-screens on a trust INCREASE (blocked), while a
//      DECREASE on the same content still succeeds
//   8. input pre-screens (skill-review finding 2): a secret in the SOURCE is
//      caught BEFORE the Haiku call (no summarize bill on retry), and an
//      empty/poisoned-only assembly never truncates a good recent.md (finding 1)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { screenBeforeCommittedWrite } from '../packages/cli/src/poison-guard.mjs';
import { weeklyCurate } from '../packages/cli/src/weekly-curate.mjs';
import { dailyDistill } from '../packages/cli/src/daily-distill.mjs';
import {
  liveTranscriptPath,
  committedTranscriptPath,
  promotePendingTranscripts,
} from '../packages/cli/src/transcript-screen.mjs';
import { appendPersonaReviewQueue } from '../packages/cli/src/auto-persona.mjs';
import { overrideTrust } from '../packages/cli/src/trust.mjs';
import { writeBullet } from '../packages/cli/src/provenance.mjs';
import { MockHaikuBackend } from '../packages/cli/src/compressor.mjs';
import { install } from '../packages/cli/src/install.mjs';

// A canonical secret fixture that trips the guard's AWS access-key pattern.
const SECRET = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';

let sandbox;
let projectRoot;
let userDir;

async function makeFixture() {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-screen-cw-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
}

function seedTodayFile(date, body) {
  const dir = join(projectRoot, 'context', 'sessions');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `today-${date}.md`);
  writeFileSync(path, body, 'utf8');
  return path;
}

function mockBackend(...outputs) {
  return new MockHaikuBackend({
    responses: outputs.map((outputText) => ({
      outputText,
      inputTokens: 100,
      outputTokens: 50,
      costUSD: 0.0001,
      preservedIds: [],
    })),
  });
}

function poisonLogPath(root) {
  return join(root, 'context', '.locks', 'poison-guard.log');
}

beforeEach(async () => {
  await makeFixture();
});

afterEach(() => {
  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    /* Windows EPERM drain */
  }
});

describe('Task 216 — screenBeforeCommittedWrite (the shared helper)', () => {
  it('passes clean text through (rejected:false, no log entry)', () => {
    const r = screenBeforeCommittedWrite('a perfectly ordinary durable fact', {
      projectRoot,
      source: 'unit-test',
    });
    expect(r.rejected).toBe(false);
    expect(existsSync(poisonLogPath(projectRoot))).toBe(false);
  });

  it('rejects a secret and logs a REDACTED NDJSON entry (Doors 1+5)', () => {
    const r = screenBeforeCommittedWrite(`config note: ${SECRET}`, {
      projectRoot,
      source: 'unit-test',
      ts: '2026-07-11T00:00:00Z',
    });
    expect(r.rejected).toBe(true);
    expect(r.pattern_id).toBe('secret_aws_access_key_id');

    const log = readFileSync(poisonLogPath(projectRoot), 'utf8');
    const entry = JSON.parse(log.trim().split('\n').at(-1));
    expect(entry.pattern_id).toBe('secret_aws_access_key_id');
    expect(entry.source_file).toBe('unit-test');
    // Redaction invariant: the cleartext secret never lands in the log.
    expect(log).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('screens without logging when projectRoot is absent (user-tier callers)', () => {
    const r = screenBeforeCommittedWrite(SECRET, { source: 'unit-test' });
    expect(r.rejected).toBe(true);
    expect(existsSync(poisonLogPath(projectRoot))).toBe(false);
  });
});

describe('Task 216 — weekly-curate archive screen', () => {
  it('skips the archive write AND keeps the source days when Haiku output carries a secret (Doors 1+2+5)', async () => {
    const now = '2026-05-28T09:00:00Z';
    // One aged day (>7d before now) so the archive consolidation runs.
    seedTodayFile('2026-05-13', '## Decisions\n- Old decision, perfectly clean\n');
    // Pre-existing archive content that must remain untouched (over-mutation).
    const archivePath = join(projectRoot, 'context', 'sessions', 'archive.md');
    writeFileSync(archivePath, '## Week of 2026-04-27\n\n- prior archive content\n', 'utf8');

    // The model echoes a secret into its consolidation (the side-door: Haiku
    // output was never screened before the committed append).
    const backend = mockBackend(`## Week of 2026-05-11\n\n- deploy key is ${SECRET}\n`);
    const r = await weeklyCurate({ projectRoot, backend, now });

    expect(r.action).toBe('skipped');
    expect(r.reason).toBe('poison-guard');
    expect(r.pattern_id).toBe('secret_aws_access_key_id');

    // State (Door 2): archive.md unchanged — no poisoned append, prior content intact.
    const archive = readFileSync(archivePath, 'utf8');
    expect(archive).toContain('prior archive content');
    expect(archive).not.toContain('AKIAIOSFODNN7EXAMPLE');
    // Self-healing: the source day was NOT deleted — next run retries.
    expect(existsSync(join(projectRoot, 'context', 'sessions', 'today-2026-05-13.md'))).toBe(true);

    // Observability (Door 5): redacted rejection logged with the site's source tag.
    const log = readFileSync(poisonLogPath(projectRoot), 'utf8');
    expect(log).toContain('weekly-curate:archive');
    expect(log).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('pre-screens the aged SOURCE before the Haiku call (finding 2; Doors 1+2+3+5)', async () => {
    const now = '2026-05-28T09:00:00Z';
    // The secret sits in the aged day file itself — it would reproduce in the
    // summary on every retry, so it must be caught before the compress call.
    seedTodayFile('2026-05-13', `## Decisions\n- deploy uses ${SECRET}\n`);

    // External calls (Door 3): zero canned responses → throws if compress runs.
    const neverCalled = new MockHaikuBackend({ responses: [] });
    const r = await weeklyCurate({ projectRoot, backend: neverCalled, now });

    expect(r.action).toBe('skipped');
    expect(r.reason).toBe('poison-guard');
    // State (Door 2): source day kept (self-healing), archive.md never created.
    expect(existsSync(join(projectRoot, 'context', 'sessions', 'today-2026-05-13.md'))).toBe(true);
    expect(existsSync(join(projectRoot, 'context', 'sessions', 'archive.md'))).toBe(false);
    // Observability (Door 5): the input-stage tag names where it was caught.
    const log = readFileSync(poisonLogPath(projectRoot), 'utf8');
    expect(log).toContain('weekly-curate:input');
  });
});

describe('Task 216 — daily-distill per-day screen', () => {
  it('does not bank a poisoned day; the clean day banks and rides recent.md (over-mutation, Doors 1+2+5)', async () => {
    const now = '2026-05-28T23:00:00Z';
    seedTodayFile('2026-05-27', '## Decisions\n- day with a secret in session\n');
    seedTodayFile('2026-05-28', '## Decisions\n- clean day\n');
    // Responses consumed chronologically: day 27 poisoned, day 28 clean.
    const backend = mockBackend(
      `- summary leaking ${SECRET}\n`,
      '- clean summary for the 28th\n',
    );

    const r = await dailyDistill({ projectRoot, backend, now });
    expect(r.action).toBe('distilled');
    expect(r.distilledThisRun).toBe(1); // only the clean day banked

    const sessions = join(projectRoot, 'context', 'sessions');
    // State (Door 2): poisoned artifact absent, clean artifact present.
    expect(existsSync(join(sessions, 'today-2026-05-27.distilled.md'))).toBe(false);
    expect(existsSync(join(sessions, 'today-2026-05-28.distilled.md'))).toBe(true);
    // recent.md holds the clean day only — the secret never reaches it.
    const recent = readFileSync(join(sessions, 'recent.md'), 'utf8');
    expect(recent).toContain('clean summary for the 28th');
    expect(recent).not.toContain('AKIAIOSFODNN7EXAMPLE');

    // Observability (Door 5): the per-day site logged the redacted rejection.
    const log = readFileSync(poisonLogPath(projectRoot), 'utf8');
    expect(log).toContain('daily-distill:2026-05-27');

    // Self-healing: the un-banked day re-distills next run (no artifact = pending).
    const r2 = await dailyDistill({
      projectRoot,
      backend: mockBackend('- retried, now clean\n'),
      now: '2026-05-28T23:30:00Z',
      cooldownMs: 0,
    });
    expect(r2.action).toBe('distilled');
    expect(existsSync(join(sessions, 'today-2026-05-27.distilled.md'))).toBe(true);
  });

  it('backstop: a LEGACY poisoned artifact skips the recent.md write and keeps the old recent.md (Doors 1+2+5)', async () => {
    const now = '2026-05-28T23:00:00Z';
    const sessions = join(projectRoot, 'context', 'sessions');
    seedTodayFile('2026-05-27', '## Decisions\n- ordinary day\n');
    // A pre-Task-216 artifact carrying a secret, newer than its source day →
    // dayNeedsDistill skips it, assembleRecent would concatenate it.
    writeFileSync(join(sessions, 'today-2026-05-27.distilled.md'), `- legacy ${SECRET}\n`, 'utf8');
    const oldRecent = '## old but clean recent.md\n';
    writeFileSync(join(sessions, 'recent.md'), oldRecent, 'utf8');

    const r = await dailyDistill({ projectRoot, backend: mockBackend('unused'), now });
    expect(r.action).toBe('skipped');
    expect(r.reason).toBe('poison-guard');
    expect(r.pattern_id).toBe('secret_aws_access_key_id');

    // State (Door 2): the stale-but-clean recent.md is preserved.
    expect(readFileSync(join(sessions, 'recent.md'), 'utf8')).toBe(oldRecent);
    // Observability (Door 5): the backstop site logged.
    const log = readFileSync(poisonLogPath(projectRoot), 'utf8');
    expect(log).toContain('daily-distill:recent');
  });

  it('pre-screens the day SOURCE before the Haiku call: no summarize bill, recent.md untouched (findings 1+2; Doors 1+2+3+5)', async () => {
    const now = '2026-05-28T23:00:00Z';
    const sessions = join(projectRoot, 'context', 'sessions');
    seedTodayFile('2026-05-28', `## Decisions\n- config uses ${SECRET}\n`);
    const oldRecent = '## old but clean recent.md\n';
    writeFileSync(join(sessions, 'recent.md'), oldRecent, 'utf8');

    // External calls (Door 3): a backend with ZERO canned responses throws if
    // compress() is ever called — the input pre-screen must skip the bill.
    const neverCalled = new MockHaikuBackend({ responses: [] });
    const r = await dailyDistill({ projectRoot, backend: neverCalled, now });

    expect(r.action).toBe('skipped');
    expect(r.reason).toBe('poison-guard');
    expect(r.guardRejectedDays).toBe(1);
    // State (Door 2): no artifact banked; the old recent.md is NOT truncated
    // (the finding-1 clobber: empty assembly must never overwrite good state).
    expect(existsSync(join(sessions, 'today-2026-05-28.distilled.md'))).toBe(false);
    expect(readFileSync(join(sessions, 'recent.md'), 'utf8')).toBe(oldRecent);
    // Observability (Door 5): the input-stage tag names where it was caught.
    const log = readFileSync(poisonLogPath(projectRoot), 'utf8');
    expect(log).toContain('daily-distill:2026-05-28:input');
  });

  it('an all-empty assembly reports skipped/empty-output and keeps the old recent.md (finding 1)', async () => {
    const now = '2026-05-28T23:00:00Z';
    const sessions = join(projectRoot, 'context', 'sessions');
    seedTodayFile('2026-05-28', '## Decisions\n- ordinary clean day\n');
    const oldRecent = '## old but clean recent.md\n';
    writeFileSync(join(sessions, 'recent.md'), oldRecent, 'utf8');

    const r = await dailyDistill({ projectRoot, backend: mockBackend('   \n'), now });
    expect(r.action).toBe('skipped');
    expect(r.reason).toBe('empty-output');
    expect(readFileSync(join(sessions, 'recent.md'), 'utf8')).toBe(oldRecent);
  });
});

describe('Task 216 — transcript promote secret screen', () => {
  it('WITHHOLDS a poisoned batch: content-free marker committed, watermark advances, raw stays in the live buffer (Doors 1+2+5)', async () => {
    const DATE = '2026-07-07';
    const dir = join(projectRoot, 'context', 'transcripts');
    mkdirSync(dir, { recursive: true });
    // The secret sits IN the transcript; the PII judge (names/emails only)
    // passes it straight through — exactly the side-door under test.
    const entry = `## ${DATE}T10:00:00Z — assistant\n\nSet the CI variable ${SECRET} as discussed.\n\n`;
    writeFileSync(liveTranscriptPath(projectRoot, DATE), entry, 'utf8');
    const judgePassThrough = entry.trimEnd() + '\n';

    const res = await promotePendingTranscripts({
      projectRoot,
      backend: mockBackend(judgePassThrough),
    });
    // A poison hit is PERMANENT — deferring would re-judge (and re-bill) the
    // same batch every run and starve the 2 promote slots (D-298 class). The
    // batch is withheld: marker committed, watermark advanced.
    expect(res.action).toBe('withheld');
    expect(res.withheld).toBe(1);

    // State (Door 2): the committed transcript holds ONLY the marker — never
    // the secret, never the batch content.
    const committed = readFileSync(committedTranscriptPath(projectRoot, DATE), 'utf8');
    expect(committed).toContain('batch withheld: poison-guard secret_aws_access_key_id');
    expect(committed).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(committed).not.toContain('Set the CI variable');
    // The raw text is NOT lost: it stays in the gitignored live buffer.
    expect(readFileSync(liveTranscriptPath(projectRoot, DATE), 'utf8')).toContain(SECRET);

    // Watermark advanced: a re-promote is a clean no-op (no starvation, no
    // repeat judge billing) and the marker is not duplicated.
    const res2 = await promotePendingTranscripts({
      projectRoot,
      backend: mockBackend(judgePassThrough),
    });
    expect(res2.action).toBe('noop');
    expect(
      readFileSync(committedTranscriptPath(projectRoot, DATE), 'utf8').match(/batch withheld/g),
    ).toHaveLength(1);

    // Observability (Door 5): redacted rejection logged with the promote source tag.
    const log = readFileSync(poisonLogPath(projectRoot), 'utf8');
    expect(log).toContain(`transcript-promote:${DATE}`);
    expect(log).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('screens SECRETS ONLY: a transcript quoting an injection phrase promotes normally (finding 3 / D-320)', async () => {
    const DATE = '2026-07-08';
    const dir = join(projectRoot, 'context', 'transcripts');
    mkdirSync(dir, { recursive: true });
    // A verbatim RECORD legitimately quotes injection phrases (this dogfood
    // repo discusses them daily); the transcript tier is never injected into
    // context, so the full catalog would withhold real history for no gain.
    const entry = `## ${DATE}T10:00:00Z — assistant\n\nAdded a test for the "ignore all previous instructions" pattern.\n\n`;
    writeFileSync(liveTranscriptPath(projectRoot, DATE), entry, 'utf8');

    const res = await promotePendingTranscripts({
      projectRoot,
      backend: mockBackend(entry.trimEnd() + '\n'),
    });
    expect(res.action).toBe('promoted');
    const committed = readFileSync(committedTranscriptPath(projectRoot, DATE), 'utf8');
    expect(committed).toContain('ignore all previous instructions');
    expect(committed).not.toContain('batch withheld');
  });
});

describe('Task 216 — persona review-queue screen', () => {
  it('drops a poisoned classifier entry; the clean entry queues (over-mutation, Doors 1+2)', () => {
    const queuePath = appendPersonaReviewQueue({
      userDir,
      entries: [
        { target: 'LESSONS.md', section: 'Tooling Lessons', text: 'always pin dependency versions', confidence: 'medium' },
        { target: 'LESSONS.md', section: 'Tooling Lessons', text: `deploys authenticate with ${SECRET}`, confidence: 'medium' },
      ],
      now: '2026-07-11T00:00:00Z',
    });
    expect(queuePath).not.toBeNull();
    const queue = readFileSync(queuePath, 'utf8');
    expect(queue).toContain('always pin dependency versions');
    expect(queue).not.toContain('AKIAIOSFODNN7EXAMPLE');

    // Observability (Door 5): the drop is never silent — a REDACTED user-tier
    // audit entry names the pattern (no project-scoped log at this site).
    const audit = readFileSync(join(userDir, '.locks', 'audit.log'), 'utf8');
    expect(audit).toContain('poison-guard-rejected');
    expect(audit).toContain('secret_aws_access_key_id');
    expect(audit).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });
});

describe('Task 216 — trust-increase re-screen gate', () => {
  // A "legacy" fact written before the current pattern catalog (hand-seeded —
  // today's writeFact/memoryWrite would have screened it at write time).
  function seedLegacyFact() {
    const factDir = join(projectRoot, 'context', 'memory');
    mkdirSync(factDir, { recursive: true });
    const path = join(factDir, 'feedback_legacy-ci-key.md');
    writeFileSync(
      path,
      `---\nid: P-A2B2C3D4\ntype: feedback\ntrust: medium\n---\n\nCI deploys use ${SECRET} — rotate quarterly.\n`,
      'utf8',
    );
    return path;
  }

  it('blocks raising trust on content that trips the CURRENT catalog (Doors 1+2+5)', () => {
    const path = seedLegacyFact();
    const r = overrideTrust({ id: 'P-A2B2C3D4', level: 'high', projectRoot });

    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('poison_guard');
    expect(r.pattern_id).toBe('secret_aws_access_key_id');
    // State (Door 2): the fact file is untouched — trust stays medium.
    expect(readFileSync(path, 'utf8')).toContain('trust: medium');
    // Observability (Door 5): the gate logged the redacted rejection.
    const log = readFileSync(poisonLogPath(projectRoot), 'utf8');
    expect(log).toContain('trust-increase:P-A2B2C3D4');
    expect(log).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('still allows LOWERING trust on the same content (the gate is increase-only)', () => {
    const path = seedLegacyFact();
    const r = overrideTrust({ id: 'P-A2B2C3D4', level: 'low', projectRoot });
    expect(r.action).toBe('trust-updated');
    expect(readFileSync(path, 'utf8')).toContain('trust: low');
  });

  it('multi-location: gates on the location for which the change IS an increase, mutating nothing (Doors 1+2)', () => {
    // Fact file already HIGH (clean body — high→high is not an increase, so it
    // is never screened); a scratchpad bullet with the SAME id sits at MEDIUM
    // with a secret in its text — medium→high IS an increase for that location.
    const factDir = join(projectRoot, 'context', 'memory');
    mkdirSync(factDir, { recursive: true });
    const factPath = join(factDir, 'feedback_multi-loc.md');
    writeFileSync(
      factPath,
      '---\nid: P-B2C3D4E2\ntype: feedback\ntrust: high\n---\n\nperfectly clean fact body\n',
      'utf8',
    );
    const memoryPath = join(projectRoot, 'context', 'MEMORY.md');
    const bullet = writeBullet({
      id: 'P-B2C3D4E2',
      text: `drifted bullet copy with ${SECRET}`,
      provenance: {
        source: 'context/transcripts/2026-07-01.md', source_line: 1,
        sha1: 'a'.repeat(40), write: 'auto-extract', trust: 'medium',
        at: '2026-07-01T00:00:00Z',
      },
    });
    expect(bullet.action).toBe('formatted');
    appendFileSync(memoryPath, `\n${bullet.lines}\n`, 'utf8');

    const before = readFileSync(memoryPath, 'utf8');
    const r = overrideTrust({ id: 'P-B2C3D4E2', level: 'high', projectRoot });
    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('poison_guard');
    // State (Door 2): NEITHER location mutated — the fact file keeps high, the
    // bullet keeps medium (pre-scan gates before any write).
    expect(readFileSync(factPath, 'utf8')).toContain('trust: high');
    expect(readFileSync(memoryPath, 'utf8')).toBe(before);
  });
});
