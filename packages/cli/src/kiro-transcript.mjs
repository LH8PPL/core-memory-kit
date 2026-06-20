// kiro-transcript.mjs — the Kiro session-transcript adapter (Task 50.H).
//
// Resolves the D-180 "highest unverified risk": Kiro stores transcripts
// differently from Claude Code, and the kit's capture path hardcoded the
// Claude-Code touchpoints (~/.claude/projects/<slug>/<session>.jsonl, JSONL).
// Verified on a REAL Kiro install (D-180): Kiro is a VS Code fork; per-session
// JSON lives at
//   %APPDATA%/Kiro/User/globalStorage/kiro.kiroagent/workspace-sessions/
//     <base64url(workspacePath)>/<sessionId>.json
// with a `history[]` of { message: { role, content: [{type:'text', text}] } }
// plus a sibling `sessions.json` index.
//
// This module is the per-agent transcript adapter the cross-agent seam needs:
// it turns Kiro's session JSON into the {role, text} turns the kit's capture
// path consumes, and resolves the workspace→dir key. Pure + defensive — a
// malformed/partial session returns [] rather than throwing (a capture hook
// must never crash the agent).
//
// Public surface:
//   parseKiroSessionHistory(jsonText) → [{role, text}]   (ordered turns)
//   workspaceKeyForPath(workspacePath) → string          (the base64url dir key)

/**
 * Parse a Kiro session JSON into ordered {role, text} turns.
 * @param {string} jsonText raw contents of a <sessionId>.json file
 * @returns {{role:string, text:string}[]}
 */
export function parseKiroSessionHistory(jsonText) {
  let session;
  try {
    session = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!session || !Array.isArray(session.history)) return [];

  const turns = [];
  for (const item of session.history) {
    const msg = item && item.message;
    if (!msg || typeof msg.role !== 'string') continue;
    const text = extractText(msg.content);
    if (text !== '') turns.push({ role: msg.role, text });
  }
  return turns;
}

// Join the text of all text-type content parts; ignore tool/other blocks.
// Kiro's content is always an array of typed parts (verified on a real install);
// a non-array is treated as "no text" rather than guessed at.
function extractText(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

/**
 * Encode a workspace path to Kiro's workspace-sessions directory key.
 * EXACT scheme verified on a real install: standard base64, then +→-, /→_, and
 * the `=` padding → `_` (NOT stripped — Kiro keeps the padding as underscores).
 * @param {string} workspacePath e.g. 'c:\\Projects\\demo'
 * @returns {string}
 */
export function workspaceKeyForPath(workspacePath) {
  return Buffer.from(workspacePath, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '_');
}
