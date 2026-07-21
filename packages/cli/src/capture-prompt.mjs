// UserPromptSubmit hook real handler (Task 19, T-016). Second Layer 4
// module — fires on every user prompt, sanitizes the privacy tags
// before any disk write, and appends to the daily transcript file.
//
// Public boundary: capturePrompt({payload, projectRoot, now}) → result.
// The bin wrapper deals with stdin parsing + protocol JSON; this
// module is pure-function-ish: takes the parsed payload + project
// root, produces the transcript file as a side effect.
//
// Privacy contract (FR-15, design §6.6):
//   - <private>...</private> blocks are REPLACED with the literal
//     "[private content redacted]" placeholder. The original content
//     never touches any disk path under the project.
//   - <retain>...</retain> blocks are preserved VERBATIM (including the
//     tags). The Stop hook + auto-extract subagent downstream uses
//     these tags as force-save signals; stripping them here would
//     break that contract.
//
// Transcript format:
//   ## <ISO timestamp> — user
//
//   <sanitized prompt body>
//
// One heading per turn so downstream tools can scan by ## markers
// (matches claude-remember's compaction strategy).

import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizePrivacyTags } from './privacy.mjs';
import { maskPii, localUsernames, resolvePrivacyScreen } from './pii-patterns.mjs';
import { appendRedactions } from './redactions-log.mjs';
import { liveTranscriptPath } from './transcript-screen.mjs';
import { judgeUserPrompt } from './judge-signals.mjs';
import { dateFromIso } from './audit-log.mjs';

// Task 75.2 — the per-prompt "memory available" recall nudge (memsearch's
// UserPromptSubmit hint, D-115's 75.2 half). The SessionStart snapshot +
// its authority preamble cover the session OPEN; this keeps the agent
// aware MID-session (after the snapshot scrolls into history) that a deep,
// searchable archive exists behind the bounded snapshot. Conditions keep
// it noise-free: substantive prompts only (≥10 chars — "ok"/"go" never pay
// the hint; memsearch's heuristic) and only when there IS an archive to
// recall from (a granular INDEX.md). One line — the per-prompt token cost
// stays negligible, and it rides the EXISTING hook (no extra spawn).
const HINT_MIN_PROMPT_CHARS = 10;

export function buildMemoryHint({ projectRoot, prompt } = {}) {
  if (typeof prompt !== 'string' || prompt.trim().length < HINT_MIN_PROMPT_CHARS) {
    return null;
  }
  try {
    const indexPath = join(projectRoot, 'context', 'memory', 'INDEX.md');
    if (!existsSync(indexPath)) return null;
    // `cmk install` scaffolds INDEX.md on every project, so existence alone
    // is always true post-install (skill-review finding). Require at least
    // one real entry — a fresh, empty project must not advertise recorded
    // memory it does not have. Entry lines start "- (" (the reindex format).
    if (!readFileSync(indexPath, 'utf8').includes('\n- (')) return null;
  } catch {
    return null;
  }
  return (
    '[core-memory-kit] Recorded memory available beyond the session snapshot — ' +
    'use the memory-search skill when the answer may already be recorded (prior decisions, history, conventions, ' +
    'project structure/architecture, where things live). Recall it; do not re-read the code to reconstruct it.'
  );
}

export function capturePrompt({ payload, projectRoot, now } = {}) {
  if (!payload || typeof payload !== 'object') {
    return { action: 'noop', reason: 'no-payload' };
  }
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
  if (prompt === '') {
    return { action: 'noop', reason: 'empty-prompt' };
  }

  const ts = now ?? new Date().toISOString();
  const date = dateFromIso(ts);
  const transcriptsDir = join(projectRoot, 'context', 'transcripts');
  const transcriptPath = join(transcriptsDir, `${date}.md`);

  let sanitized = sanitizePrivacyTags(prompt);

  // Task 148.2b/148.3 (ADR-0019, design §6.10): L1 mask + live-buffer split —
  // the user prompt gets the same treatment as the assistant turn. Screen ON:
  // masked, appended to the gitignored live buffer (promoted screened later);
  // OFF: pre-148 direct committed append.
  const screenOn = resolvePrivacyScreen({ projectRoot }) === 'on';
  if (screenOn) {
    const m = maskPii(sanitized, { usernames: localUsernames() });
    sanitized = m.text;
    appendRedactions(projectRoot, {
      source: 'capture-prompt',
      layer: 'L1',
      redactions: m.redactions,
    });
  }
  const effectiveTranscriptPath = screenOn
    ? liveTranscriptPath(projectRoot, date)
    : transcriptPath;
  const entry = `## ${ts} — user\n\n${sanitized}\n\n`;

  if (!existsSync(transcriptsDir)) {
    mkdirSync(transcriptsDir, { recursive: true });
  }
  appendFileSync(effectiveTranscriptPath, entry, 'utf8');

  // Task 192 (ADR-0017 Phase 1c): the USER-CORRECTION detector rides the
  // prompt hook — a correction in the user's opening words dampens the prior
  // window's surfaced ids (through the 193 screen) and resolves pending
  // expectations MISS/REVERSAL. Best-effort by module contract.
  try {
    judgeUserPrompt({ projectRoot, session: payload?.session_id, prompt: sanitized });
  } catch {
    /* the judge must never break the prompt hook */
  }

  return { action: 'appended', transcriptPath: effectiveTranscriptPath };
}
