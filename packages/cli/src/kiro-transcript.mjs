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
//   parseKiroIdeV1Messages(jsonlText) → {userText, assistantText}  (IDE 1.0 messages.jsonl)
//   readKiroIdeV1Turn({projectRoot, env}) → {userText, assistantText}  (~/.kiro/sessions/<hash>/sess_*)
//   readKiroTurn({projectRoot, env}) → {userText, assistantText}  (IDE-0.x → CLI → IDE-1.0)

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
    // projectRoot and json.cwd are already absolute, same-machine, same-form
    // paths (the hook's cwd and the session's recorded cwd). resolve() would
    // re-root a value against the current cwd if it ever looked relative — a real
    // hazard. ASSUMPTION: both sides are absolute drive-letter or matching-form
    // paths; an extended-length (\\?\) or `~` form on one side only won't match
    // (a missed match → empty capture, never a crash). Full-string equality, not
    // a prefix test — so `C:\Temp\proj` and `C:\Temp\proj-2` correctly differ.
    const norm = (p) => p.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase();
    const want = norm(projectRoot);
    const files = readdirSync(cliDir).filter((f) => f.endsWith('.json'));
    let best = null;
    let bestStamp = null; // [epochMs, filename] for a deterministic tie-break
    for (const f of files) {
      let json;
      try {
        json = JSON.parse(readFileSync(join(cliDir, f), 'utf8'));
      } catch {
        continue;
      }
      if (!json?.cwd || norm(json.cwd) !== want) continue;
      // Parse updated_at to epoch ms for a numeric compare — robust to ISO
      // precision/offset drift (a future kiro-cli format change won't silently
      // mis-order). Unparseable → 0, so the filename tie-break still orders it.
      const epoch = Date.parse(json.updated_at) || 0;
      const stamp = [epoch, f];
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

/**
 * Parse a Kiro IDE 1.0 messages.jsonl (D-203g) into the latest user + assistant
 * text. IDE 1.0 moved session storage to ~/.kiro/sessions/<hash>/sess_<uuid>/ —
 * a JSON-Lines `messages.jsonl`: one `{id, timestamp, payload:{type, content}}` per
 * line; `payload.type ∈ {user, assistant, tool_call, tool_result, turn_start/end,
 * ContextualHookInvoked, …}`; `payload.content` is the message text (string) for
 * user/assistant. We take the LAST user + LAST assistant content. Primary-source
 * verified on a real IDE-1.0 session.
 * @param {string} jsonlText raw contents of a messages.jsonl
 * @returns {{userText:string, assistantText:string}}
 */
export function parseKiroIdeV1Messages(jsonlText) {
  const empty = { userText: '', assistantText: '' };
  if (typeof jsonlText !== 'string') return empty;
  let userText = '';
  let assistantText = '';
  for (const line of jsonlText.split('\n')) {
    if (line.trim() === '') continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // a malformed line never crashes the whole read
    }
    const type = msg?.payload?.type;
    const content = msg?.payload?.content;
    if (typeof content !== 'string' || content === '') continue;
    if (type === 'user') userText = content; // keep the LAST one
    else if (type === 'assistant') assistantText = content;
  }
  return { userText, assistantText };
}

/**
 * Read the latest turn from a Kiro IDE 1.0 session (D-203g). Scans
 * ~/.kiro/sessions/<workspace-hash>/sess_<uuid>/, matching session.json's
 * `workspacePaths` to projectRoot (no hash-reversing), picking the most-recently-
 * modified messages.jsonl. Pure + defensive (a capture hook must never crash).
 * @param {{projectRoot:string, env?:object}} args
 * @returns {{userText:string, assistantText:string}}
 */
export function readKiroIdeV1Turn({ projectRoot, env = process.env } = {}) {
  const empty = { userText: '', assistantText: '' };
  try {
    if (!projectRoot) return empty;
    const home = env.USERPROFILE || env.HOME || homedir();
    const sessionsRoot = join(home, '.kiro', 'sessions');
    if (!existsSync(sessionsRoot)) return empty;

    const norm = (p) => p.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase();
    const want = norm(projectRoot);

    // walk <hash>/sess_*/ dirs; match by session.json.workspacePaths; pick latest
    // messages.jsonl by mtime.
    let best = null; // [mtimeMs, messagesPath]
    for (const hash of readdirSync(sessionsRoot)) {
      const hashDir = join(sessionsRoot, hash);
      let sessDirs;
      try {
        sessDirs = readdirSync(hashDir).filter((d) => d.startsWith('sess_'));
      } catch {
        continue; // not a dir (e.g. the kiro-cli `cli/` sibling holds *.json files)
      }
      for (const sd of sessDirs) {
        const dir = join(hashDir, sd);
        const metaPath = join(dir, 'session.json');
        const msgPath = join(dir, 'messages.jsonl');
        if (!existsSync(metaPath) || !existsSync(msgPath)) continue;
        let meta;
        try {
          meta = JSON.parse(readFileSync(metaPath, 'utf8'));
        } catch {
          continue;
        }
        const paths = Array.isArray(meta?.workspacePaths) ? meta.workspacePaths : [];
        if (!paths.some((p) => typeof p === 'string' && norm(p) === want)) continue;
        let mtimeMs = 0;
        try {
          mtimeMs = statSync(msgPath).mtimeMs;
        } catch {
          /* keep 0 */
        }
        if (best === null || mtimeMs > best[0]) best = [mtimeMs, msgPath];
      }
    }
    if (!best) return empty;
    return parseKiroIdeV1Messages(readFileSync(best[1], 'utf8'));
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
// The non-(IDE-0.x) fallback chain: kiro-CLI (~/.kiro/sessions/cli, D-199) → IDE
// 1.0 (~/.kiro/sessions/<hash>/sess_*/messages.jsonl, D-203g). Tried when the
// legacy IDE-0.x globalStorage path yields nothing. Returns the first non-empty.
function readKiroFallbackTurn({ projectRoot, env }) {
  const cli = readKiroCliTurn({ projectRoot, env });
  if (cli.assistantText || cli.userText) return cli;
  return readKiroIdeV1Turn({ projectRoot, env });
}

export function readKiroTurn({ projectRoot, env = process.env } = {}) {
  const empty = { userText: '', assistantText: '' };
  try {
    const globalDir = env.CONTINUE_GLOBAL_DIR;
    // No IDE-0.x globalStorage (the CLI/IDE-1.0 don't set CONTINUE_GLOBAL_DIR) →
    // the fallback chain (kiro-CLI then IDE-1.0). The legacy IDE-0.x path stays
    // PRIMARY when its env+dir are present, so an 0.x user is unaffected.
    if (!globalDir || !projectRoot) return readKiroFallbackTurn({ projectRoot, env });
    const wsDir = join(globalDir, 'workspace-sessions', workspaceKeyForPath(projectRoot));
    if (!existsSync(wsDir)) return readKiroFallbackTurn({ projectRoot, env });

    // pick the most-recent session file (by dateCreated in the JSON, else mtime).
    const files = readdirSync(wsDir).filter((f) => f.endsWith('.json') && f !== 'sessions.json');
    if (files.length === 0) return readKiroFallbackTurn({ projectRoot, env });

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
    if (!best || !Array.isArray(best.history)) return readKiroFallbackTurn({ projectRoot, env });

    const turns = parseKiroSessionHistory(JSON.stringify(best));
    const lastUser = [...turns].reverse().find((t) => t.role === 'user');
    const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant');
    // IDE-0.x session present but no text → fall through (a mixed install where the
    // same project was used from another surface).
    if (!lastAssistant?.text && !lastUser?.text) return readKiroFallbackTurn({ projectRoot, env });
    return {
      userText: lastUser?.text || '',
      assistantText: lastAssistant?.text || '',
    };
  } catch {
    return empty;
  }
}
