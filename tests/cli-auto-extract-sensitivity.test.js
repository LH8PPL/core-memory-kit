// @doors: 1, 2, 5
// Door 3 N/A: no subprocess spawn at this boundary — MockHaikuBackend injected (the spawn side is pinned by the auto-extract spawn-smokes).
// Door 4 N/A: no message-queue surface in the sensitivity axis (the review queue is deliberately BYPASSED for local-only — asserted as state, Door 2).
// @door-3.5: prompt-assertion — pins that the extraction INSTRUCTIONS carry the SENSITIVITY axis contract (values + default) the parser depends on.

// Task 148.5 (ADR-0019, design §6.10) — the fact-path sensitivity axis.
//
// The auto-extract classifier emits per candidate an optional sensitivity
// routing: commit (default) | local-only | drop.
//   commit     → the normal route (MEMORY.md / review queue / fact store).
//   local-only → useful but sensitive: routed to the gitignored
//                context.local/private.md scratchpad (L-tier ids). NEVER to a
//                committed surface — including the review queue (a sensitive
//                medium-trust candidate must not leak via queues/review.md).
//   drop       → not written anywhere; logged as skipped_reason:
//                sensitivity_drop in extract.log (Door 5) WITHOUT the text —
//                the content is sensitive, the log line must not carry it.
//
// Boundary: runAutoExtract({turnFile, projectRoot, haikuBackend}) with a
// MockHaikuBackend — same deep boundary as cli-auto-extract.test.js.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runAutoExtract,
  parseCandidates,
  parseRichFacts,
  buildExtractionInstructions,
} from '../packages/cli/src/auto-extract.mjs';
import { MockHaikuBackend } from '../packages/cli/src/compressor.mjs';
import { install } from '../packages/cli/src/install.mjs';

function makeFixture() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-sensitivity-test-'));
  const projectRoot = join(sandbox, 'proj');
  return { sandbox, projectRoot };
}

function writeTurnFile(projectRoot, { user, assistant }) {
  const dir = join(projectRoot, 'context', 'transcripts');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `.extract-${Date.now()}-${Math.floor(Math.random() * 100000)}.tmp`);
  writeFileSync(
    path,
    ['USER_TURN:', user ?? '', '', 'ASSISTANT_TURN:', assistant ?? ''].join('\n'),
    'utf8',
  );
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

// The review queue / private pad may legitimately not exist yet — absence is
// the STRONGEST form of "the content did not land there".
function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function readExtractLog(projectRoot, date) {
  const path = join(projectRoot, 'context', 'sessions', `${date}.extract.log`);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe('parseCandidates — sensitivity tail (148.5)', () => {
  it('parses an explicit sensitivity marker and strips it from the text', () => {
    const out = parseCandidates(
      'TRUST_HIGH user: sees Dr. Adams for weekly appointments | SENSITIVITY: local-only',
    );
    expect(out).toHaveLength(1);
    expect(out[0].sensitivity).toBe('local-only');
    expect(out[0].text).toBe('sees Dr. Adams for weekly appointments');
    expect(out[0].trust).toBe('high');
  });

  it('defaults to commit when no marker present (the pre-148.5 line shape)', () => {
    const out = parseCandidates('TRUST_HIGH user: python 3.13 is the project default');
    expect(out).toHaveLength(1);
    expect(out[0].sensitivity).toBe('commit');
    expect(out[0].text).toBe('python 3.13 is the project default');
  });

  it('parses drop and commit markers case-insensitively', () => {
    const out = parseCandidates(
      [
        'TRUST_MEDIUM user: venting about a coworker | SENSITIVITY: DROP',
        'TRUST_HIGH user: repo uses pnpm | sensitivity: commit',
      ].join('\n'),
    );
    expect(out).toHaveLength(2);
    expect(out[0].sensitivity).toBe('drop');
    expect(out[1].sensitivity).toBe('commit');
    expect(out[1].text).toBe('repo uses pnpm');
  });

  it('treats an unrecognized sensitivity value as local-only (conservative: never silently commit)', () => {
    const out = parseCandidates('TRUST_HIGH user: some flagged detail | SENSITIVITY: private');
    expect(out).toHaveLength(1);
    expect(out[0].sensitivity).toBe('local-only');
  });

  it('does not eat a legitimate pipe in the fact text (marker must be the line TAIL)', () => {
    const out = parseCandidates('TRUST_HIGH user: pipeline is build | test | deploy');
    expect(out).toHaveLength(1);
    expect(out[0].sensitivity).toBe('commit');
    expect(out[0].text).toBe('pipeline is build | test | deploy');
  });
});

describe('parseRichFacts — sensitivity field (148.5)', () => {
  it('parses an explicit sensitivity field', () => {
    const out = parseRichFacts(
      [
        'BEGIN_FACT',
        'type: project',
        'title: Home Office Setup',
        'body: works from a home office at a residential address',
        'sensitivity: local-only',
        'END_FACT',
      ].join('\n'),
    );
    expect(out).toHaveLength(1);
    expect(out[0].sensitivity).toBe('local-only');
  });

  it('defaults to commit when the field is absent', () => {
    const out = parseRichFacts(
      ['BEGIN_FACT', 'title: Deploy Target', 'body: we deploy to Cloud Run', 'END_FACT'].join('\n'),
    );
    expect(out).toHaveLength(1);
    expect(out[0].sensitivity).toBe('commit');
  });
});

describe('extraction instructions — the sensitivity contract (Door 3.5)', () => {
  it('instructions carry the SENSITIVITY axis: the three values and the commit default', () => {
    const instructions = buildExtractionInstructions();
    expect(instructions).toContain('SENSITIVITY');
    expect(instructions).toContain('local-only');
    expect(instructions).toContain('drop');
    expect(instructions).toContain('commit');
  });
});

describe('runAutoExtract — sensitivity routing (148.5)', () => {
  let sandbox;
  let projectRoot;

  beforeEach(async () => {
    const f = makeFixture();
    sandbox = f.sandbox;
    projectRoot = f.projectRoot;
    await install({ projectRoot, userTier: join(projectRoot, '..', 'user') });
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('drop: candidate written NOWHERE; extract.log gets skipped_reason sensitivity_drop WITHOUT the text', async () => {
    const turnFile = writeTurnFile(projectRoot, {
      user: 'personal detail I mentioned in passing',
      assistant: 'noted',
    });
    const r = await runAutoExtract({
      turnFile,
      projectRoot,
      haikuBackend: mockBackend(
        'TRUST_HIGH user: has a chronic health condition | SENSITIVITY: drop',
      ),
      now: '2026-07-08T10:00:00Z',
    });

    // Door 1: routed as a sensitivity drop, not a landed observation.
    expect(r.observation_count).toBe(0);
    expect(r.candidates[0].written).toBe('dropped-sensitivity');

    // Door 2: the text reaches NO surface — committed or local.
    const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(memory).not.toContain('chronic health condition');
    expect(readIfExists(join(projectRoot, 'context', 'queues', 'review.md'))).not.toContain(
      'chronic health condition',
    );
    expect(readIfExists(join(projectRoot, 'context.local', 'private.md'))).not.toContain(
      'chronic health condition',
    );

    // Door 5: the drop is observable — but the LOG must not carry the text.
    const log = readExtractLog(projectRoot, '2026-07-08');
    const dropEntry = log.find((e) => e.skipped_reason === 'sensitivity_drop');
    expect(dropEntry).toBeTruthy();
    expect(JSON.stringify(dropEntry)).not.toContain('chronic health condition');
  });

  it('local-only HIGH: bullet lands in gitignored context.local/private.md, NOT in MEMORY.md', async () => {
    const turnFile = writeTurnFile(projectRoot, {
      user: 'I see Dr. Adams on Tuesdays, plan work around it',
      assistant: 'will do',
    });
    const r = await runAutoExtract({
      turnFile,
      projectRoot,
      haikuBackend: mockBackend(
        'TRUST_HIGH user: unavailable Tuesday mornings (recurring appointment) | SENSITIVITY: local-only',
      ),
      now: '2026-07-08T10:00:00Z',
    });

    // Door 1: counts as a landed observation (it IS durable — just local).
    expect(r.action).toBe('extracted');
    expect(r.observation_count).toBe(1);
    expect(r.candidates[0].written).toBe('local');

    // Door 2: private.md holds it (L-tier id + auto-extract provenance)…
    const priv = readFileSync(join(projectRoot, 'context.local', 'private.md'), 'utf8');
    expect(priv).toContain('unavailable Tuesday mornings');
    expect(priv).toMatch(/\(L-[A-Za-z2-9]{8}\)/);
    expect(priv).toMatch(/write:\s*auto-extract/);
    // …and no committed surface does (over-mutation guard on the committed tier).
    const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(memory).not.toContain('unavailable Tuesday mornings');
  });

  it('local-only MEDIUM: bypasses the COMMITTED review queue — routes to private.md too', async () => {
    const turnFile = writeTurnFile(projectRoot, {
      user: 'context about my family situation',
      assistant: 'ok',
    });
    const r = await runAutoExtract({
      turnFile,
      projectRoot,
      haikuBackend: mockBackend(
        'TRUST_MEDIUM user: family member is in the hospital this month | SENSITIVITY: local-only',
      ),
      now: '2026-07-08T10:00:00Z',
    });

    expect(r.candidates[0].written).toBe('local');
    expect(readIfExists(join(projectRoot, 'context', 'queues', 'review.md'))).not.toContain(
      'family member is in the hospital',
    );
    const priv = readFileSync(join(projectRoot, 'context.local', 'private.md'), 'utf8');
    expect(priv).toContain('family member is in the hospital');
  });

  it('local-only rich fact: condensed to a private.md bullet, NOT a committed fact file', async () => {
    const turnFile = writeTurnFile(projectRoot, {
      user: 'my home office is at my residential address, remember the setup',
      assistant: 'noted the setup',
    });
    const r = await runAutoExtract({
      turnFile,
      projectRoot,
      haikuBackend: mockBackend(
        'BEGIN_FACT',
        'type: project',
        'title: Home Office Location',
        'body: the user works from a home office at their residential address',
        'sensitivity: local-only',
        'END_FACT',
      ),
      now: '2026-07-08T10:00:00Z',
    });

    expect(r.observation_count).toBe(1);
    expect(r.richFacts[0].written).toBe('local');
    // Door 2: no fact file under the COMMITTED context/memory/…
    const factsDir = join(projectRoot, 'context', 'memory');
    const factFiles = existsSync(factsDir)
      ? (await import('node:fs')).readdirSync(factsDir).filter((n) => n.includes('home-office'))
      : [];
    expect(factFiles).toHaveLength(0);
    // …the content lives in private.md instead.
    const priv = readFileSync(join(projectRoot, 'context.local', 'private.md'), 'utf8');
    expect(priv).toContain('Home Office Location');
    expect(priv).toContain('residential address');
  });

  it('drop rich fact: no fact file, no private.md write, sensitivity_drop logged without title or body', async () => {
    const turnFile = writeTurnFile(projectRoot, {
      user: 'some sensitive detail',
      assistant: 'ok',
    });
    const r = await runAutoExtract({
      turnFile,
      projectRoot,
      haikuBackend: mockBackend(
        'BEGIN_FACT',
        'title: Medication Schedule',
        'body: takes medication for a chronic condition every morning',
        'sensitivity: drop',
        'END_FACT',
      ),
      now: '2026-07-08T10:00:00Z',
    });

    expect(r.observation_count).toBe(0);
    expect(r.richFacts[0].written).toBe('dropped-sensitivity');
    const log = readExtractLog(projectRoot, '2026-07-08');
    const dropEntry = log.find((e) => e.skipped_reason === 'sensitivity_drop');
    expect(dropEntry).toBeTruthy();
    const serialized = JSON.stringify(dropEntry);
    expect(serialized).not.toContain('Medication Schedule');
    expect(serialized).not.toContain('chronic condition');
  });

  it('LOW-trust local-only discard: the excerpt trace is SUPPRESSED (extract.log may be committed)', async () => {
    const turnFile = writeTurnFile(projectRoot, {
      user: 'minor personal aside',
      assistant: 'ok',
    });
    const r = await runAutoExtract({
      turnFile,
      projectRoot,
      haikuBackend: mockBackend(
        'TRUST_LOW user: mentioned an ongoing medical treatment in passing | SENSITIVITY: local-only',
      ),
      now: '2026-07-08T10:00:00Z',
    });

    expect(r.candidates[0].written).toBe('discarded');
    const log = readExtractLog(projectRoot, '2026-07-08');
    const discard = log.find((e) => e.event === 'low_trust_discarded');
    expect(discard).toBeTruthy();
    expect(discard.excerpt_suppressed).toBe('sensitivity');
    expect(JSON.stringify(discard)).not.toContain('medical treatment');
  });

  it('mixed turn: commit candidate lands normally while its local-only sibling diverts (over-mutation guard)', async () => {
    const turnFile = writeTurnFile(projectRoot, {
      user: 'we use pnpm; also I have a standing Tuesday appointment',
      assistant: 'ok',
    });
    const r = await runAutoExtract({
      turnFile,
      projectRoot,
      haikuBackend: mockBackend(
        'TRUST_HIGH user: repo uses pnpm as the package manager',
        'TRUST_HIGH user: standing personal appointment Tuesdays | SENSITIVITY: local-only',
      ),
      now: '2026-07-08T10:00:00Z',
    });

    expect(r.observation_count).toBe(2);
    const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(memory).toContain('pnpm as the package manager');
    expect(memory).not.toContain('Tuesdays');
    const priv = readFileSync(join(projectRoot, 'context.local', 'private.md'), 'utf8');
    expect(priv).toContain('standing personal appointment Tuesdays');
    expect(priv).not.toContain('pnpm');
  });
});
