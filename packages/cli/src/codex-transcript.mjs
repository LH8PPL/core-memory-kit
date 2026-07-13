// codex-transcript.mjs — read the last turn from a Codex rollout jsonl (Task 196).
//
// Codex persists every session as a rollout file
// (`~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`), and every hook
// payload carries its `transcript_path` on stdin — so the Stop-hook capture
// reads the EXACT file for the session, no workspace-key discovery needed
// (simpler than both the Claude slug walk and Kiro's two-schema resolution).
//
// Line shapes (pinned from a REAL 0.142.5 capture, 2026-07-12 — the fixture
// tests/fixtures/codex-rollout-sample.jsonl mirrors it):
//   {timestamp, type: 'event_msg', payload: {type: 'user_message',  message}}
//   {timestamp, type: 'event_msg', payload: {type: 'agent_message', message, phase}}
// Other line types (session_meta / response_item / turn_context / token_count)
// are not turn content — skipped. The LAST user_message + the LAST agent_message
// are the just-finished turn at Stop time.
//
// Input-boundary hardening (the D-306 class): tolerate a BOM, CRLF, and
// malformed/truncated lines — a capture reader must never crash the hook.
//
// Public surface:
//   readCodexTurn(transcriptPath) → { userText, assistantText }  (never throws)

import { existsSync, readFileSync } from 'node:fs';

export function readCodexTurn(transcriptPath) {
  const empty = { userText: '', assistantText: '' };
  if (typeof transcriptPath !== 'string' || transcriptPath.length === 0) return empty;

  let raw;
  try {
    if (!existsSync(transcriptPath)) return empty;
    raw = readFileSync(transcriptPath, 'utf8');
  } catch {
    return empty;
  }

  // BOM + CRLF normalization before the line split (D-306).
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  let userText = '';
  let assistantText = '';
  for (const line of raw.split('\n')) {
    const trimmed = line.replace(/\r$/, '').trim();
    if (!trimmed) continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue; // malformed / truncated line — skip, never crash
    }
    if (entry?.type !== 'event_msg' || !entry.payload) continue;
    const { type, message } = entry.payload;
    if (typeof message !== 'string') continue;
    if (type === 'user_message') userText = message;
    else if (type === 'agent_message') assistantText = message;
  }

  return { userText: userText.trim(), assistantText: assistantText.trim() };
}
