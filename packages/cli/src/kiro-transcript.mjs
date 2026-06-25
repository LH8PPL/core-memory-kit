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
//   parseKiroSessionHistory(jsonText) → [{role, text}]   (ordered turns, IDE schema)
//   parseKiroCliSession(jsonText) → {assistantText}       (kiro-cli schema, D-199)
//   readKiroCliTurn({projectRoot, env}) → {userText, assistantText}  (~/.kiro/sessions/cli)
//   workspaceKeyForPath(workspacePath) → string          (the base64url dir key)
//   readKiroTurn({projectRoot, env}) → {userText, assistantText}  (IDE, then CLI fallback)

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
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

/**
 * Parse a kiro-cli session JSON into the latest assistant turn text.
 *
 * The kiro-CLI session schema is DIFFERENT from the IDE's (D-199 gate finding —
 * primary-source verified on a real `~/.kiro/sessions/cli/<uuid>.json`): there is
 * NO `history[]`. Instead the per-turn assistant text lives at
 *   session_state.conversation_metadata.user_turn_metadatas[].result.Ok.content[].data
 * (each content part is `{ kind, data }`, `kind === 'text'`). The user's prompt
 * text is NOT stored verbatim (only `user_prompt_length`), so the CLI path yields
 * the ASSISTANT text only — which is all captureTurn's extractTurnText needs.
 *
 * @param {string} jsonText raw contents of a kiro-cli <uuid>.json file
 * @returns {{assistantText:string}}
 */
export function parseKiroCliSession(jsonText) {
  let session;
  try {
    session = JSON.parse(jsonText);
  } catch {
    return { assistantText: '' };
  }
  const turns = session?.session_state?.conversation_metadata?.user_turn_metadatas;
  if (!Array.isArray(turns) || turns.length === 0) return { assistantText: '' };

  // the LAST turn is the most recent; read its assistant text from result.Ok.content[].
  const last = turns[turns.length - 1];
  const content = last?.result?.Ok?.content;
  if (!Array.isArray(content)) return { assistantText: '' };
  const assistantText = content
    .filter((part) => part && part.kind === 'text' && typeof part.data === 'string')
    .map((part) => part.data)
    .join('\n');
  return { assistantText };
}

/**
 * Read the latest assistant turn from a kiro-CLI session for a project. The CLI
 * stores sessions at ~/.kiro/sessions/cli/<uuid>.json, each carrying its own
 * `cwd` + `updated_at`; we pick the most-recent file whose `cwd` matches the
 * project root. Pure + defensive (a capture hook must never crash the session).
 * @param {{projectRoot:string, env?:object}} args
 * @returns {{userText:string, assistantText:string}}
 */
export function readKiroCliTurn({ projectRoot, env = process.env } = {}) {
  const empty = { userText: '', assistantText: '' };
  try {
    if (!projectRoot) return empty;
    const home = env.USERPROFILE || env.HOME || homedir();
    const cliDir = join(home, '.kiro', 'sessions', 'cli');
    if (!existsSync(cliDir)) return empty;

    // Compare cwd by NORMALIZED separators + case, NOT path.resolve(): both
    // projectRoot and json.cwd are already absolute (the hook's cwd and the
    // session's recorded cwd from the same machine). resolve() would re-root a
    // value against the current cwd if it ever looked relative — a real hazard.
    const norm = (p) => p.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase();
    const want = norm(projectRoot);
    const files = readdirSync(cliDir).filter((f) => f.endsWith('.json'));
    let best = null;
    let bestStamp = null; // [updated_at string, filename] for a deterministic tie-break
    for (const f of files) {
      let json;
      try {
        json = JSON.parse(readFileSync(join(cliDir, f), 'utf8'));
      } catch {
        continue;
      }
      if (!json?.cwd || norm(json.cwd) !== want) continue;
      const stamp = [String(json.updated_at ?? ''), f];
      if (bestStamp === null || stamp[0] > bestStamp[0] || (stamp[0] === bestStamp[0] && stamp[1] > bestStamp[1])) {
        bestStamp = stamp;
        best = json;
      }
    }
    if (!best) return empty;
    const { assistantText } = parseKiroCliSession(JSON.stringify(best));
    return { userText: '', assistantText };
  } catch {
    return empty;
  }
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
    // No IDE globalStorage (the CLI never sets CONTINUE_GLOBAL_DIR) → the kiro-CLI
    // path: ~/.kiro/sessions/cli/<uuid>.json, a DIFFERENT schema (D-199). The IDE
    // path stays the primary; the CLI is the fallback so the IDE is unaffected.
    if (!globalDir || !projectRoot) return readKiroCliTurn({ projectRoot, env });
    const wsDir = join(globalDir, 'workspace-sessions', workspaceKeyForPath(projectRoot));
    if (!existsSync(wsDir)) return readKiroCliTurn({ projectRoot, env });

    // pick the most-recent session file (by dateCreated in the JSON, else mtime).
    const files = readdirSync(wsDir).filter((f) => f.endsWith('.json') && f !== 'sessions.json');
    if (files.length === 0) return readKiroCliTurn({ projectRoot, env });

    // Sort files for a DETERMINISTIC pick (review M2): primary by dateCreated
    // (desc), secondary by filename (desc) so an equal-stamp tie isn't decided by
    // readdir order. The first after sort is the most-recent session.
    let best = null;
    let bestKey = null; // [stamp, filename]
    for (const f of files) {
      let json;
      try {
        json = JSON.parse(readFileSync(join(wsDir, f), 'utf8'));
      } catch {
        continue;
      }
      const key = [Number(json.dateCreated) || 0, f];
      if (bestKey === null || key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
        bestKey = key;
        best = json;
      }
    }
    if (!best || !Array.isArray(best.history)) return readKiroCliTurn({ projectRoot, env });

    const turns = parseKiroSessionHistory(JSON.stringify(best));
    const lastUser = [...turns].reverse().find((t) => t.role === 'user');
    const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant');
    // IDE session present but no assistant text → fall back to the CLI path (a
    // mixed install where the same project was used from both surfaces).
    if (!lastAssistant?.text && !lastUser?.text) return readKiroCliTurn({ projectRoot, env });
    return {
      userText: lastUser?.text || '',
      assistantText: lastAssistant?.text || '',
    };
  } catch {
    return empty;
  }
}
