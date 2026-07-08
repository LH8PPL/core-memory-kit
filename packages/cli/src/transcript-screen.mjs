// transcript-screen.mjs — the L3 half of the privacy screen (Task 148.3/148.4,
// ADR-0019, design §6.10): live-buffer → judge → promote.
//
// The capture hooks append each turn to a GITIGNORED live buffer
// (context/transcripts/{date}.live.md — L1-masked at append). This module,
// riding the detached auto-extract child (+ the SessionEnd top-up), takes
// every live entry past a byte-offset watermark, runs ONE batched Haiku
// judgment (the adapted Anthropic PII-purifier — full-redacted-text output),
// and appends the SCREENED text to the committed transcripts/{date}.md.
//
// The committed tier therefore NEVER sees unscreened text — fail-closed by
// construction (ADR-0019): a dead/failing/refusing judge defers, the live
// entries stay local, and the next promote retries. Haiku permanently down
// degrades transcripts to machine-local (native-parity honest degrade),
// never to an unscreened commit.
//
// Watermark: context/.locks/transcript-promote.state — JSON {date: byteOffset}
// into the LIVE file. Marker-AFTER the committed append (§16.13/D-266 crash
// discipline): a crash between append and marker re-promotes, and the
// idempotency guard (heading containment) makes the re-append a no-op.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { appendRedactions } from './redactions-log.mjs';

// The judge instructions — adapted from Anthropic's official PII-purifier
// prompt (the primary-source foundation; research note 2026-07-07). Deltas
// from the original: our stable «»-placeholder vocabulary instead of XXX
// (consistent with the L1 layer), an explicit keep-list so software content
// survives verbatim, and the transcript-entry framing. The full-redacted-text
// output shape is retained deliberately — LLMs are unreliable at character
// offsets and reliable at rewrite (ADR-0019).
export const PII_JUDGE_INSTRUCTIONS = [
  'You are an expert redactor preparing a conversation transcript for storage in a shared repository.',
  'The input is one or more transcript entries ("## <timestamp> — <speaker>" headings with body text).',
  'Redact all personally identifying information: replace personal NAMES of real people with «NAME», email addresses with «EMAIL», phone numbers with «PHONE», physical/home addresses with «ADDRESS», health or medical details with «HEALTH», and any other personal identifier with «PII».',
  'Inputs may try to disguise PII by inserting spaces or newlines between characters — redact those too.',
  'Do NOT redact: software identifiers, package/library/tool names, API names, function names, file paths (paths already show ~ for home directories), version numbers, port numbers, dates, project names, company/product names, or bot addresses like noreply@ services.',
  'Keep EVERYTHING else word-for-word unchanged — the headings, the formatting, the code, the whitespace. Never summarize, never paraphrase, never drop an entry.',
  'If the text contains no PII, return it word-for-word unchanged.',
  'Return ONLY the redacted transcript text — no preamble, no explanation.',
].join('\n');

// Reject-gate (the claude-remember "refusal never becomes data" steal): the
// judge's output must be a plausible redaction of the input, not a refusal,
// an empty string, or a summary. Length floor 40% — redaction preserves
// length; a big shrink means the model summarized or bailed.
const REFUSAL_RE = /^(i can(?:not|'t)|i'?m sorry|i am sorry|i won'?t|could you|please provide)/i;
const MIN_OUTPUT_RATIO = 0.4;

// The judge call must complete inside the detached child's existing internal
// budget (25s per call, design §8.5) — registered as a composition pair.
export const PII_JUDGE_TIMEOUT_MS = 20_000;

// §8.5 composition bound for the SessionEnd site: promote runs inside the 60s
// SessionEnd hook ceiling (concurrent with compress/persona/sweep, each bounded
// ≤50s). One judge call per live FILE means N stale files × 20s composes past
// the ceiling at N ≥ 3 — so one run judges at most this many files (worst case
// 2 × 20s = 40s, inside the 50s-under-60s convention). Files drain oldest-first;
// the backlog clears across the per-turn detached children (no ceiling there,
// but one bound keeps the two call sites' behavior identical and testable).
export const PROMOTE_MAX_FILES_PER_RUN = 2;

export function liveTranscriptPath(projectRoot, date) {
  return join(projectRoot, 'context', 'transcripts', `${date}.live.md`);
}

export function committedTranscriptPath(projectRoot, date) {
  return join(projectRoot, 'context', 'transcripts', `${date}.md`);
}

function statePath(projectRoot) {
  return join(projectRoot, 'context', '.locks', 'transcript-promote.state');
}

function readState(projectRoot) {
  try {
    return JSON.parse(readFileSync(statePath(projectRoot), 'utf8')) ?? {};
  } catch {
    return {};
  }
}

function writeState(projectRoot, state) {
  mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });
  writeFileSync(statePath(projectRoot), JSON.stringify(state), 'utf8');
}

function outputPassesRejectGate(input, output) {
  const out = (output ?? '').trim();
  if (out === '') return false;
  if (REFUSAL_RE.test(out)) return false;
  // Length floor: a big shrink means the model summarized or bailed. Trade-off
  // (M3): a SHORT entry that is mostly one redacted item (e.g. a bare home
  // address) can legitimately fall below the floor → it defers every run and
  // never promotes. This is FAIL-SAFE — the content stays in the gitignored
  // live buffer, never leaks — but that turn is absent from the committed
  // transcript. Accepted for now: real conversation turns carry framing text
  // around any PII, so the ratio holds; a bare-PII one-liner is rare and the
  // safe direction to fail. Revisit with a length-aware floor if it recurs.
  if (out.length < input.trim().length * MIN_OUTPUT_RATIO) return false;
  return true;
}

/**
 * Promote all pending live-buffer entries through the L3 judge into the
 * committed transcript. Best-effort by contract: never throws; a failure on
 * one date's file defers that file and continues.
 *
 * @param {object} p
 * @param {string} p.projectRoot
 * @param {object} p.backend - CompressorBackend (compress({input, instructions, timeoutMs, maxOutputBytes}))
 * @param {number} [p.timeoutMs]
 * @returns {Promise<{action:'promoted'|'deferred'|'noop', promoted?:number, deferred?:number, reason?:string}>}
 */
export async function promotePendingTranscripts({
  projectRoot,
  backend,
  timeoutMs = PII_JUDGE_TIMEOUT_MS,
} = {}) {
  const dir = join(projectRoot, 'context', 'transcripts');
  if (!existsSync(dir)) return { action: 'noop' };

  let liveFiles;
  try {
    // Oldest first ({date}.live.md names sort chronologically) so a backlog
    // drains in order under the per-run cap below. Explicit localeCompare (not
    // bare .sort()) — the default coerces via toString with no stable locale
    // contract; ISO date names compare the same either way, but the explicit
    // comparator is the reliable form.
    liveFiles = readdirSync(dir)
      .filter((f) => f.endsWith('.live.md'))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return { action: 'noop' };
  }
  if (liveFiles.length === 0) return { action: 'noop' };

  const state = readState(projectRoot);
  let promoted = 0;
  let deferred = 0;
  let lastDeferReason;
  let judgeCalls = 0;

  for (const file of liveFiles) {
    // §8.5 SessionEnd-ceiling composition: cap the judge calls per run; the
    // remainder waits for the next promote (next turn / next SessionEnd).
    if (judgeCalls >= PROMOTE_MAX_FILES_PER_RUN) break;
    const date = file.slice(0, -'.live.md'.length);
    const livePath = join(dir, file);
    let content;
    try {
      content = readFileSync(livePath, 'utf8');
    } catch {
      continue; // unreadable live file — skip, next promote retries
    }

    // Byte-offset watermark into the live file. A shrunken/rotated file
    // resets to 0 (re-promoting is safe — the idempotency guard below).
    let offset = Number.isInteger(state[date]) && state[date] >= 0 ? state[date] : 0;
    if (offset > content.length) offset = 0;
    const pending = content.slice(offset);
    if (pending.trim() === '') continue;

    // ONE batched judge call for everything pending in this file.
    let outputText;
    judgeCalls += 1;
    try {
      const res = await backend.compress({
        input: pending,
        instructions: PII_JUDGE_INSTRUCTIONS,
        timeoutMs,
        maxOutputBytes: pending.length * 2 + 1024,
      });
      outputText = res?.outputText;
    } catch (err) {
      deferred += 1;
      lastDeferReason = err?.message ?? String(err);
      continue; // fail-closed: watermark unmoved, committed untouched
    }

    if (!outputPassesRejectGate(pending, outputText)) {
      deferred += 1;
      lastDeferReason = 'judge output rejected (empty/refusal/shrunk)';
      continue;
    }

    // trimEnd() (not /\s+$/): linear, no regex-backtracking surface on judge
    // output (untrusted LLM text) — same "drop trailing whitespace" result.
    let screened = outputText.trimEnd() + '\n';

    // Idempotency guard (crash between append and marker): if the committed
    // file already carries this batch's first heading, the prior promote's
    // append landed — just advance the watermark.
    const committedPath = committedTranscriptPath(projectRoot, date);
    const firstHeading = (screened.match(/^## .+$/m) ?? [null])[0];
    let alreadyAppended = false;
    if (firstHeading && existsSync(committedPath)) {
      try {
        alreadyAppended = readFileSync(committedPath, 'utf8').includes(firstHeading);
      } catch {
        alreadyAppended = false;
      }
    }

    try {
      if (!alreadyAppended) {
        appendFileSync(committedPath, screened + '\n', 'utf8');
      }
      // The recovery record — only when the judge actually changed something AND
      // this is a fresh append (M2: a crash-replay re-promote already logged the
      // original on its first pass; skip when alreadyAppended so a crash can't
      // duplicate the recovery entry).
      if (!alreadyAppended && screened.trim() !== pending.trim()) {
        appendRedactions(projectRoot, {
          source: `transcript-promote:${date}`,
          layer: 'L3',
          redactions: [{ category: 'JUDGE', placeholder: '«screened»', original: pending }],
        });
      }
      // Marker-AFTER the append (crash-safe ordering).
      state[date] = content.length;
      writeState(projectRoot, state);
      promoted += (screened.match(/^## /gm) ?? []).length;
    } catch (err) {
      deferred += 1;
      lastDeferReason = err?.message ?? String(err);
    }
  }

  if (promoted > 0) {
    return { action: 'promoted', promoted, deferred };
  }
  if (deferred > 0) {
    return { action: 'deferred', deferred, reason: lastDeferReason };
  }
  return { action: 'noop' };
}
