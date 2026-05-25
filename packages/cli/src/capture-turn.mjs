// Stop hook real handler (Task 21, T-018). Sixth Layer 4 module.
//
// Public boundary: captureTurn({payload, projectRoot, now,
// autoExtractPath}) → result. Does two things:
//   1. Append the just-completed assistant turn to
//      <projectRoot>/context/transcripts/{YYYY-MM-DD}.md (parallel to
//      Task 19's capture-prompt, sharing the privacy sanitizer).
//   2. Spawn the auto-extract subagent (Task 23) as a DETACHED child
//      so it survives the parent's exit. The kit's hook must return
//      within ~50ms; the subagent does its work in the background.
//
// stop_hook_active guard (design §5.2.1):
//   The Stop hook can re-fire as a result of a prior Stop hook's
//   decision: "block" response, causing a loop. Anthropic's hook
//   payload carries stop_hook_active: true in those cases. When set,
//   we short-circuit: no transcript append, no spawn, no work — just
//   {action: 'noop'} and let the session close.
//
// Auto-extract subprocess (21.3 + 21.4):
//   Unix path: `node ${autoExtractPath} ${turnTempFile}` spawned with
//     detached:true + stdio:'ignore' + unref() — node's equivalent of
//     the bash `</dev/null >/dev/null 2>&1 & disown` pattern from
//     claude-remember. Works identically on Windows when the parent
//     is Git Bash because we use node's spawn, not shell &.
//   The turn text is buffered to a temp file under
//     <projectRoot>/context/transcripts/.extract-<ts>.tmp
//   so the detached child can read it without sharing stdin.
//
// Both-turns temp-file shape (design §6.4 amendment, 2026-05-26):
//   The temp file now contains BOTH the prior user prompt AND the
//   just-captured assistant turn, separated by literal markers:
//     USER_TURN:
//     <user body>
//
//     ASSISTANT_TURN:
//     <assistant body>
//   This lets auto-extract identify candidate-origin (user-stated vs
//   assistant-inferred) and apply the demotion rule from design §6.4
//   (assistant-origin facts demote one trust level so user review is
//   required before they enter MEMORY.md). The user turn is sourced
//   by reading the most recent `## <ts> — user` entry from today's
//   transcript file — which Task 19's capture-prompt wrote just
//   before this Stop hook fired.

import {
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { sanitizePrivacyTags } from './privacy.mjs';

function dateFromIso(iso) {
  return String(iso).slice(0, 10);
}

function extractTurnText(payload) {
  // Anthropic Stop hook payload spelling has shifted across Claude Code
  // versions. Probe the documented fields in priority order.
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.assistant_message === 'string') return payload.assistant_message;
  if (typeof payload.last_assistant_message === 'string') return payload.last_assistant_message;
  if (typeof payload.response === 'string') return payload.response;
  if (typeof payload.message === 'string') return payload.message;
  return '';
}

// Scan today's transcript for the most recent `## <ts> — user` entry
// and return its body. capture-prompt (Task 19) writes these entries
// on every UserPromptSubmit; the most-recent one is by definition the
// user prompt that triggered the assistant turn we're now capturing.
// Returns '' if the transcript doesn't exist, no user entry is
// present, or any read error occurs.
function readLastUserTurnFromTranscript(transcriptPath) {
  if (!existsSync(transcriptPath)) return '';
  let text;
  try {
    text = readFileSync(transcriptPath, 'utf8');
  } catch {
    return '';
  }
  const lines = text.split(/\r?\n/);
  let lastUserHeadingIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    // Match capture-prompt's format: "## <iso-ts> — user"
    if (/^##\s+\S+\s+—\s+user\s*$/.test(lines[i])) {
      lastUserHeadingIdx = i;
      break;
    }
  }
  if (lastUserHeadingIdx === -1) return '';
  // The user body runs from the line after the heading until the next
  // `## ` heading (the just-appended assistant entry) or EOF.
  let endIdx = lines.length;
  for (let i = lastUserHeadingIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  const body = lines.slice(lastUserHeadingIdx + 1, endIdx);
  while (body.length > 0 && body[0].trim() === '') body.shift();
  while (body.length > 0 && body[body.length - 1].trim() === '') body.pop();
  return body.join('\n');
}

// Assemble the both-turns temp-file body. Both turns are sanitized
// upstream — the user body comes from the transcript (which
// capture-prompt sanitized when writing it) and the assistant body
// is the now-sanitized argument. Markers are literal-prefix lines so
// auto-extract's parser can split cleanly.
function assembleBothTurnsBody({ userTurn, assistantTurn }) {
  return [
    'USER_TURN:',
    userTurn,
    '',
    'ASSISTANT_TURN:',
    assistantTurn,
  ].join('\n');
}

function defaultAutoExtractPath() {
  // Documented sibling of this script's bin wrapper. Resolved by the
  // bin wrapper (which knows CLAUDE_PLUGIN_ROOT); we use this fallback
  // only when the caller passes nothing. The path is allowed to not
  // exist — see spawn block below.
  return null;
}

function spawnAutoExtract(autoExtractPath, turnFile, projectRoot) {
  if (!autoExtractPath) return { spawned: false, reason: 'no-auto-extract-path' };
  if (!existsSync(autoExtractPath)) {
    return { spawned: false, reason: 'auto-extract-missing' };
  }
  try {
    const child = spawn(
      'node',
      [autoExtractPath, turnFile],
      {
        detached: true,
        stdio: 'ignore',
        cwd: projectRoot,
        env: { ...process.env, CMK_PROJECT_DIR: projectRoot },
      },
    );
    child.unref();
    return { spawned: true, pid: child.pid };
  } catch (err) {
    return { spawned: false, reason: 'spawn-failed', error: err?.message ?? String(err) };
  }
}

export function captureTurn({
  payload,
  projectRoot,
  now,
  autoExtractPath,
} = {}) {
  // 1. stop_hook_active guard. Short-circuit BEFORE any disk write or
  //    spawn so a recursive Stop firing can't poison the transcript.
  if (payload?.stop_hook_active === true) {
    return { action: 'noop', reason: 'stop-hook-active', spawned: false };
  }

  const turnText = extractTurnText(payload);
  if (turnText.trim() === '') {
    return { action: 'noop', reason: 'no-turn-text', spawned: false };
  }

  // 2. Append to today's transcript (sanitized).
  const ts = now ?? new Date().toISOString();
  const date = dateFromIso(ts);
  const transcriptsDir = join(projectRoot, 'context', 'transcripts');
  const transcriptPath = join(transcriptsDir, `${date}.md`);
  if (!existsSync(transcriptsDir)) {
    mkdirSync(transcriptsDir, { recursive: true });
  }
  const sanitized = sanitizePrivacyTags(turnText);
  appendFileSync(
    transcriptPath,
    `## ${ts} — assistant\n\n${sanitized}\n\n`,
    'utf8',
  );

  // 3. Buffer BOTH turns to a temp file so the detached child can read
  //    them without sharing our stdin (which has already been consumed
  //    by the parent bash wrapper). Per design §6.4, auto-extract
  //    reads the user prompt + assistant response together so it can
  //    distinguish user-stated facts from assistant-inferred ones.
  //    The user portion comes from today's transcript (capture-prompt
  //    wrote it before this Stop fired); the assistant portion is the
  //    `sanitized` text we just appended above.
  const userTurn = readLastUserTurnFromTranscript(transcriptPath);
  const turnFile = join(transcriptsDir, `.extract-${Date.now()}.tmp`);
  try {
    writeFileSync(
      turnFile,
      assembleBothTurnsBody({ userTurn, assistantTurn: sanitized }),
      'utf8',
    );
  } catch (err) {
    // Continue without spawning — partial success is better than abort.
    return {
      action: 'captured',
      transcriptPath,
      spawned: false,
      reason: 'turn-file-write-failed',
      error: err?.message ?? String(err),
    };
  }

  // 4. Spawn the auto-extract child (Task 23 fills in the script body).
  const path = autoExtractPath ?? defaultAutoExtractPath();
  const spawnResult = spawnAutoExtract(path, turnFile, projectRoot);

  return {
    action: 'captured',
    transcriptPath,
    turnFile,
    ...spawnResult,
  };
}
