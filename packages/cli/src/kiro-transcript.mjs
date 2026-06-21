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
//   readKiroTurn({projectRoot, env}) → {userText, assistantText}  (latest turn)

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

/**
 * Read the latest user+assistant turn from Kiro's transcript for a project.
 *
 * Composes the verified pieces (probe P-CJYGTQYR + D-180):
 *   - the globalStorage dir is given to the hook via env CONTINUE_GLOBAL_DIR
 *     (= …/Kiro/User/globalStorage/kiro.kiroagent), so we don't guess the path;
 *   - the per-project dir is workspace-sessions/<base64url(projectRoot)>;
 *   - the most-recent <sessionId>.json (by dateCreated, else mtime) is the live
 *     session; its history[] is parsed to the latest user + assistant text.
 *
 * Pure + defensive: any missing dir / absent env / parse error returns empty
 * strings, never throws (a capture hook must never crash the Kiro session).
 *
 * @param {{projectRoot:string, env?:object}} args
 * @returns {{userText:string, assistantText:string}}
 */
export function readKiroTurn({ projectRoot, env = process.env } = {}) {
  const empty = { userText: '', assistantText: '' };
  try {
    const globalDir = env.CONTINUE_GLOBAL_DIR;
    if (!globalDir || !projectRoot) return empty;
    const wsDir = join(globalDir, 'workspace-sessions', workspaceKeyForPath(projectRoot));
    if (!existsSync(wsDir)) return empty;

    // pick the most-recent session file (by dateCreated in the JSON, else mtime).
    const files = readdirSync(wsDir).filter((f) => f.endsWith('.json') && f !== 'sessions.json');
    if (files.length === 0) return empty;

    let best = null;
    let bestStamp = -Infinity;
    for (const f of files) {
      let json;
      try {
        json = JSON.parse(readFileSync(join(wsDir, f), 'utf8'));
      } catch {
        continue;
      }
      const stamp = Number(json.dateCreated) || 0;
      if (stamp >= bestStamp) {
        bestStamp = stamp;
        best = json;
      }
    }
    if (!best || !Array.isArray(best.history)) return empty;

    const turns = parseKiroSessionHistory(JSON.stringify(best));
    const lastUser = [...turns].reverse().find((t) => t.role === 'user');
    const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant');
    return {
      userText: lastUser?.text || '',
      assistantText: lastAssistant?.text || '',
    };
  } catch {
    return empty;
  }
}
