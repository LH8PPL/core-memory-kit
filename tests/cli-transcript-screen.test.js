// @doors: 1, 2, 5
// Door 3 N/A: the judge call goes through the injected CompressorBackend
//   (MockHaikuBackend); the real-spawn side is compressor.mjs's spawn-smokes.
// @door-3.5: prompt-assertion — pins the judge INSTRUCTIONS (the adapted
//   Anthropic PII-purifier: placeholders, keep-everything-else, obfuscation
//   defense, return-only-text) and the INPUT composition (the pending live
//   entries reach the model verbatim).
// Door 4 N/A: no message-queue interaction (pending entries re-derive from
//   the live buffer + watermark each pass — no fragile queue file).
// Door 5: redactions.log (L3 layer) + the promote watermark state asserted.
//
// Tests for Task 148.3/148.4 (ADR-0019, design §6.10) — the transcript
// live-buffer → judge → promote screen. The contract:
//   - the committed transcripts/{date}.md NEVER receives unscreened text:
//     promote appends the judge's SCREENED output only (fail-closed).
//   - a dead/failing judge defers: live entries stay, watermark unmoved,
//     committed file untouched — retried next promote.
//   - the reject-gate: an empty / refusal-shaped / drastically-shrunk judge
//     output is treated as failure (never written).
//   - marker-after: the byte-offset watermark advances only AFTER the
//     committed append succeeds (crash re-promotes; append is idempotent).
//   - THE COLD-OPEN REPLAY (the D-169 automatic-path criterion): the exact
//     Session-3 leak content (a real name + email from uv-init git-config
//     echoed in tool output) lands SCREENED in the committed transcript with
//     no manual command — L1 catches the email at live-append; the judge
//     catches the name at promote.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  liveTranscriptPath,
  committedTranscriptPath,
  promotePendingTranscripts,
  PII_JUDGE_INSTRUCTIONS,
  PROMOTE_MAX_FILES_PER_RUN,
} from '../packages/cli/src/transcript-screen.mjs';
import { MockHaikuBackend } from '../packages/cli/src/compressor.mjs';
import { redactionsLogPath } from '../packages/cli/src/redactions-log.mjs';

let projectRoot;
const DATE = '2026-07-07';

function mockScreen(...outputs) {
  return new MockHaikuBackend({
    responses: outputs.map((t) => ({ outputText: t, inputTokens: 50, outputTokens: 40 })),
  });
}

function seedLive(entries) {
  const dir = join(projectRoot, 'context', 'transcripts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(liveTranscriptPath(projectRoot, DATE), entries, 'utf8');
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'cmk-tscreen-'));
});

afterEach(() => {
  try {
    rmSync(projectRoot, { recursive: true, force: true });
  } catch {
    /* Windows EPERM drain */
  }
});

describe('Task 148.3/148.4 — transcript screen (Doors 1+2+5 + 3.5)', () => {
  it('promotes pending live entries: screened text lands in the committed file, watermark advances (Doors 1+2)', async () => {
    const entry = `## ${DATE}T10:00:00Z — assistant\n\nMet with A Person about the rollout.\n\n`;
    seedLive(entry);
    const screened = `## ${DATE}T10:00:00Z — assistant\n\nMet with «NAME» about the rollout.\n`;
    const backend = mockScreen(screened);

    const res = await promotePendingTranscripts({ projectRoot, backend });
    expect(res.action).toBe('promoted');
    expect(res.promoted).toBe(1);

    const committed = readFileSync(committedTranscriptPath(projectRoot, DATE), 'utf8');
    expect(committed).toContain('«NAME»');
    expect(committed).not.toContain('A Person');

    // marker-after: a second promote with no new content is a clean no-op
    const res2 = await promotePendingTranscripts({ projectRoot, backend: mockScreen('unused') });
    expect(res2.action).toBe('noop');
    // and the committed file was not double-appended
    expect(committed.match(/10:00:00Z/g)).toHaveLength(1);
  });

  it('bounds one run to PROMOTE_MAX_FILES_PER_RUN judge calls, oldest first; the backlog drains next run (§8.5 SessionEnd-ceiling composition)', async () => {
    // 3 stale live files × 20s judge timeout each would compose past the 60s
    // SessionEnd hook ceiling. One run judges at most PROMOTE_MAX_FILES_PER_RUN
    // files (worst case 2×20s=40s, inside the 50s-under-60s convention).
    const dates = ['2026-07-05', '2026-07-06', '2026-07-07'];
    mkdirSync(join(projectRoot, 'context', 'transcripts'), { recursive: true });
    for (const d of dates) {
      writeFileSync(
        liveTranscriptPath(projectRoot, d),
        `## ${d}T09:00:00Z — user\n\nhello from ${d}\n\n`,
        'utf8',
      );
    }
    let calls = 0;
    const backend = {
      compress: async ({ input }) => {
        calls += 1;
        return { outputText: input, inputTokens: 1, outputTokens: 1 };
      },
    };

    const res = await promotePendingTranscripts({ projectRoot, backend });
    expect(calls).toBe(PROMOTE_MAX_FILES_PER_RUN);
    expect(res.promoted).toBe(PROMOTE_MAX_FILES_PER_RUN);
    // Oldest files drain first; the newest waits its turn.
    expect(existsSync(committedTranscriptPath(projectRoot, '2026-07-05'))).toBe(true);
    expect(existsSync(committedTranscriptPath(projectRoot, '2026-07-06'))).toBe(true);
    expect(existsSync(committedTranscriptPath(projectRoot, '2026-07-07'))).toBe(false);

    // The next invocation (next turn / next SessionEnd) picks up the remainder.
    await promotePendingTranscripts({ projectRoot, backend });
    expect(existsSync(committedTranscriptPath(projectRoot, '2026-07-07'))).toBe(true);
  });

  it('@door-3.5 prompt-assertion: the judge receives the PII-purifier instructions AND the pending entries verbatim', async () => {
    const entry = `## ${DATE}T11:00:00Z — user\n\nthe secret meeting is at 12 Elm Street\n\n`;
    seedLive(entry);
    const backend = mockScreen(`## ${DATE}T11:00:00Z — user\n\nthe secret meeting is at «ADDRESS»\n`);
    await promotePendingTranscripts({ projectRoot, backend });

    expect(backend.calls).toHaveLength(1);
    const call = backend.calls[0];
    // WHAT IS SENT — the input carries the pending entry text
    expect(call.input).toContain('12 Elm Street');
    // the instructions are the adapted Anthropic PII-purifier
    expect(call.instructions).toBe(PII_JUDGE_INSTRUCTIONS);
    expect(PII_JUDGE_INSTRUCTIONS).toMatch(/redact/i);
    expect(PII_JUDGE_INSTRUCTIONS).toContain('«NAME»');
    expect(PII_JUDGE_INSTRUCTIONS).toMatch(/spaces|newlines/i); // obfuscation defense
    expect(PII_JUDGE_INSTRUCTIONS).toMatch(/exactly|unchanged|word-for-word/i); // no paraphrase
    // bounded call (composition: inside the child budget)
    expect(call.timeoutMs).toBeLessThanOrEqual(25_000);
  });

  it('FAIL-CLOSED: a throwing backend defers — committed untouched, watermark unmoved, retry succeeds (148.4)', async () => {
    const entry = `## ${DATE}T12:00:00Z — assistant\n\ncall A Person at someuser@gmail.com\n\n`;
    seedLive(entry);
    const dead = new MockHaikuBackend({ throwError: new Error('backend down') });

    const res = await promotePendingTranscripts({ projectRoot, backend: dead });
    expect(res.action).toBe('deferred');
    expect(existsSync(committedTranscriptPath(projectRoot, DATE))).toBe(false);

    // retry with a live backend promotes the SAME pending entry
    const screened = `## ${DATE}T12:00:00Z — assistant\n\ncall «NAME» at «EMAIL»\n`;
    const res2 = await promotePendingTranscripts({ projectRoot, backend: mockScreen(screened) });
    expect(res2.action).toBe('promoted');
    expect(readFileSync(committedTranscriptPath(projectRoot, DATE), 'utf8')).toContain('«NAME»');
  });

  it('reject-gate: an empty or refusal-shaped or drastically-shrunk output is a failure, never written', async () => {
    const entry = `## ${DATE}T13:00:00Z — assistant\n\n${'substantive content here. '.repeat(10)}\n\n`;
    seedLive(entry);

    for (const bad of ['', 'I cannot help with redacting this content.', 'ok']) {
      const res = await promotePendingTranscripts({ projectRoot, backend: mockScreen(bad) });
      expect(res.action).toBe('deferred');
    }
    expect(existsSync(committedTranscriptPath(projectRoot, DATE))).toBe(false);
  });

  it('records an L3 redactions.log entry when the judge changed the text — and none when it did not (Door 5)', async () => {
    const changed = `## ${DATE}T14:00:00Z — assistant\n\nA Person approved it.\n\n`;
    seedLive(changed);
    await promotePendingTranscripts({
      projectRoot,
      backend: mockScreen(`## ${DATE}T14:00:00Z — assistant\n\n«NAME» approved it.\n`),
    });
    const log = readFileSync(redactionsLogPath(projectRoot), 'utf8');
    expect(log).toContain('"layer":"L3"');
    expect(log).toContain('A Person'); // the original survives ONLY here

    // an unchanged pass-through adds nothing
    appendFileSync(liveTranscriptPath(projectRoot, DATE), `## ${DATE}T14:05:00Z — user\n\nclean text\n\n`, 'utf8');
    const before = readFileSync(redactionsLogPath(projectRoot), 'utf8');
    await promotePendingTranscripts({
      projectRoot,
      backend: mockScreen(`## ${DATE}T14:05:00Z — user\n\nclean text\n`),
    });
    expect(readFileSync(redactionsLogPath(projectRoot), 'utf8')).toBe(before);
  });

  it('THE COLD-OPEN REPLAY (D-169 automatic path): the Session-3 leak content lands screened end-to-end', async () => {
    // The exact leak shape: uv init echoed the git-config name+email inside a
    // tool-output block; L1 at live-append already masked the email (this test
    // seeds the live file as capture-turn writes it, post-L1), and the judge
    // must catch the bare NAME that no pattern can.
    const liveEntry = [
      `## ${DATE}T22:27:00Z — assistant`,
      '',
      'Initialized the uv project.',
      '',
      '**Tools:**',
      '',
      '- Bash(cat pyproject.toml) → authors = [{ name = "Alex Personname", email = "«EMAIL»" }]',
      '',
      '',
    ].join('\n');
    seedLive(liveEntry);
    const screened = liveEntry.replace('Alex Personname', '«NAME»').trimEnd() + '\n';
    const res = await promotePendingTranscripts({ projectRoot, backend: mockScreen(screened) });

    expect(res.action).toBe('promoted');
    const committed = readFileSync(committedTranscriptPath(projectRoot, DATE), 'utf8');
    expect(committed).not.toContain('Alex Personname'); // the name is GONE from the committed tier
    expect(committed).toContain('«NAME»');
    expect(committed).toContain('«EMAIL»');
    // the original is recoverable locally, never committed
    expect(readFileSync(redactionsLogPath(projectRoot), 'utf8')).toContain('Alex Personname');
  });

  it('crash-replay (committed already carries the batch) advances the watermark WITHOUT a duplicate redactions.log entry (review M2)', async () => {
    const entry = `## ${DATE}T15:00:00Z — assistant\n\nA Person shipped it.\n\n`;
    seedLive(entry);
    const screened = `## ${DATE}T15:00:00Z — assistant\n\n«NAME» shipped it.\n`;

    // First promote: appends + logs the original once.
    await promotePendingTranscripts({ projectRoot, backend: mockScreen(screened) });
    const afterFirst = readFileSync(redactionsLogPath(projectRoot), 'utf8');
    expect(afterFirst.match(/A Person/g)).toHaveLength(1);

    // Simulate a crash BETWEEN append and watermark: rewind the watermark so the
    // same entry re-promotes, but the committed file already carries it.
    const statePath = join(projectRoot, 'context', '.locks', 'transcript-promote.state');
    writeFileSync(statePath, JSON.stringify({ [DATE]: 0 }), 'utf8');

    const res = await promotePendingTranscripts({ projectRoot, backend: mockScreen(screened) });
    expect(res.action).toBe('promoted'); // watermark advances (idempotent append)
    // committed file NOT double-appended…
    const committed = readFileSync(committedTranscriptPath(projectRoot, DATE), 'utf8');
    expect(committed.match(/15:00:00Z/g)).toHaveLength(1);
    // …and the recovery log NOT duplicated (M2).
    expect(readFileSync(redactionsLogPath(projectRoot), 'utf8').match(/A Person/g)).toHaveLength(1);
  });

  it('a missing/empty live buffer is a clean noop (fresh session)', async () => {
    const res = await promotePendingTranscripts({ projectRoot, backend: mockScreen('unused') });
    expect(res.action).toBe('noop');
  });
});
