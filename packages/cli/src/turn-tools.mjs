// Task 104.1 — extract the CURRENT turn's tool activity from Anthropic's
// session JSONL (the Stop payload's `transcript_path`) so capture-turn can
// enrich the kit's own committed transcript (the L3 raw tier of the recall
// waterfall, design §19 / D-117).
//
// Why read the live JSONL: it is the only record of tool calls + results
// (the Stop payload itself carries only the assistant TEXT), and it expires
// (~30 days, machine-local) — we extract the current turn into OUR format at
// capture time; we never copy/snapshot the file (the user's 2026-06-06
// directive: enriching our own transcript, not a JSONL crutch).
//
// The JSONL internal format is NOT a documented Anthropic contract (only
// `transcript_path` is). Shapes below were verified EMPIRICALLY across 6
// sessions / 4 projects (2026-06-10):
//   - entries: {type: 'user'|'assistant'|<harness types to skip>, message?}
//   - message.content: a block LIST or a plain STRING (both real)
//   - blocks: text / thinking / tool_use {id,name,input} / tool_result
//     {tool_use_id, content: STRING or LIST of {type:'text',text}}
//   - tool_result blocks ride USER-role entries (API convention) — a user
//     entry is a real prompt boundary ONLY if it has text and no tool_result.
// Everything here is defensive: unrecognized shapes are skipped; any failure
// returns null. A format shift degrades the enrichment, never the capture.
//
// Public boundary:
//   extractTurnToolActivity(jsonlText) → string|null   (pure)
//   readTranscriptTail(path, maxBytes?) → string        (bounded file read)

import { openSync, readSync, closeSync, fstatSync } from 'node:fs';

// Caps (git-bloat control, the D-117 sub-decision (a)): one turn's Tools
// block stays a small fraction of a transcript day.
const RESULT_SNIPPET_CHARS = 300;
const INPUT_SUMMARY_CHARS = 160;
const BLOCK_CAP_CHARS = 4000;
// Tail bound: one turn comfortably fits; a mega-session file is never read whole.
const DEFAULT_TAIL_BYTES = 768 * 1024;

// The most informative input field per common tool; unknown tools fall back
// to a compact JSON summary. Order matters — first present key wins.
const REPRESENTATIVE_INPUT_KEYS = [
  'command',
  'file_path',
  'pattern',
  'query',
  'url',
  'path',
  'prompt',
];

function oneLine(s, max) {
  const flat = String(s).replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max) + '…' : flat;
}

function summarizeInput(input) {
  if (!input || typeof input !== 'object') return '';
  for (const key of REPRESENTATIVE_INPUT_KEYS) {
    if (typeof input[key] === 'string' && input[key].trim() !== '') {
      return oneLine(input[key], INPUT_SUMMARY_CHARS);
    }
  }
  try {
    return oneLine(JSON.stringify(input), INPUT_SUMMARY_CHARS);
  } catch {
    return '';
  }
}

function flattenResultContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === 'object' && typeof b.text === 'string' ? b.text : ''))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function contentBlocks(message) {
  const c = message?.content;
  return Array.isArray(c) ? c.filter((b) => b && typeof b === 'object') : [];
}

// A user entry is a REAL prompt boundary when it carries prompt text (string
// content or a text block) and no tool_result blocks (results ride user role).
function isRealUserPrompt(entry) {
  if (entry?.type !== 'user') return false;
  const c = entry.message?.content;
  if (typeof c === 'string') return c.trim() !== '';
  const blocks = contentBlocks(entry.message);
  if (blocks.some((b) => b.type === 'tool_result')) return false;
  return blocks.some((b) => b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '');
}

export function extractTurnToolActivity(jsonlText) {
  if (typeof jsonlText !== 'string' || jsonlText.trim() === '') return null;

  const entries = [];
  for (const raw of jsonlText.split('\n')) {
    if (raw.trim() === '') continue;
    try {
      const e = JSON.parse(raw);
      if (e && (e.type === 'user' || e.type === 'assistant')) entries.push(e);
    } catch {
      // partial first line of a tail read, or harness noise — skip
    }
  }
  if (entries.length === 0) return null;

  let lastPromptIdx = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isRealUserPrompt(entries[i])) {
      lastPromptIdx = i;
      break;
    }
  }
  // No prompt boundary in the (tail) window → attribute everything we see to
  // the current turn rather than dropping it (the tail bound already scopes us).
  const turn = entries.slice(lastPromptIdx + 1);

  const calls = []; // {id, name, summary, result}
  const byId = new Map();
  for (const e of turn) {
    for (const b of contentBlocks(e.message)) {
      if (b.type === 'tool_use' && typeof b.name === 'string') {
        const call = { id: b.id, name: b.name, summary: summarizeInput(b.input), result: '' };
        calls.push(call);
        if (typeof b.id === 'string') byId.set(b.id, call);
      } else if (b.type === 'tool_result') {
        const call = typeof b.tool_use_id === 'string' ? byId.get(b.tool_use_id) : undefined;
        if (call && !call.result) {
          call.result = oneLine(flattenResultContent(b.content), RESULT_SNIPPET_CHARS);
        }
      }
    }
  }
  if (calls.length === 0) return null;

  const lines = [];
  let used = 0;
  let shown = 0;
  for (const call of calls) {
    const line = `- ${call.name}(${call.summary})${call.result ? ` → ${call.result}` : ''}`;
    if (used + line.length + 1 > BLOCK_CAP_CHARS) break;
    lines.push(line);
    used += line.length + 1;
    shown += 1;
  }
  if (shown < calls.length) {
    lines.push(`- …${calls.length - shown} more tool call(s) truncated`);
  }
  return lines.join('\n');
}

// Bounded tail read — a turn comfortably fits in the window; a multi-MB
// session file is never loaded whole inside the Stop hook's budget.
export function readTranscriptTail(path, maxBytes = DEFAULT_TAIL_BYTES) {
  let fd;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const len = size - start;
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, start);
    return buf.toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // best-effort close
      }
    }
  }
}
