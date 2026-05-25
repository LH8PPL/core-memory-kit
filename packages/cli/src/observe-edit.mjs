// PostToolUse hook real handler (Task 20, T-017). Fires on Write /
// Edit / MultiEdit only (matcher in hooks.json) and appends a one-line
// summary of large tool outputs to sessions/now.md — feeds the rolling-
// window compression pipeline (design §8.1).
//
// Public boundary: observeEdit({payload, projectRoot, now}) → result.
// The bin wrapper handles stdin parsing + the detached-spawn dance
// that makes the hook return within 50ms regardless of how big the
// tool output is.
//
// Filter rules (defensive — hooks.json matcher should be the first
// line of defense, but a misconfigured plugin install could route
// other tool_names here, so we double-check):
//   - tool_name must be one of Write / Edit / MultiEdit
//   - tool_response.content must be > LINE_THRESHOLD lines
//
// Per design §1.4 / §8.1 the summary line shape feeds claude-remember-
// style compaction downstream; we use a stable
//   [<iso-ts>] <tool> file=<file_path> lines=<count>
// format so the SessionEnd Haiku compressor (Task 22+23) can recognize
// individual events.

import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const ELIGIBLE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const LINE_THRESHOLD = 50; // strictly greater-than per design / 20.2

function countLines(text) {
  if (typeof text !== 'string' || text === '') return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n++;
  }
  // Trailing newline → the empty-after-last-\n shouldn't count as a
  // line of content. Subtract one if the text ended on \n.
  if (text.charCodeAt(text.length - 1) === 10) n--;
  return n;
}

function extractContent(payload) {
  // Be permissive — different tool invocations shape the response
  // slightly differently (Anthropic hook payload evolution). Probe a
  // few documented spellings.
  if (!payload || typeof payload !== 'object') return '';
  const r = payload.tool_response ?? payload.toolResponse ?? null;
  if (r && typeof r === 'object') {
    if (typeof r.content === 'string') return r.content;
    if (typeof r.output === 'string') return r.output;
    if (typeof r.text === 'string') return r.text;
  }
  if (typeof payload.output === 'string') return payload.output;
  return '';
}

function extractFilePath(payload) {
  const i = payload?.tool_input ?? payload?.toolInput ?? null;
  if (i && typeof i === 'object') {
    if (typeof i.file_path === 'string') return i.file_path;
    if (typeof i.filePath === 'string') return i.filePath;
    if (typeof i.path === 'string') return i.path;
  }
  return '';
}

export function observeEdit({ payload, projectRoot, now } = {}) {
  const toolName = payload?.tool_name ?? payload?.toolName;
  if (!ELIGIBLE_TOOLS.has(toolName)) {
    return { action: 'noop', reason: 'tool-name-not-eligible' };
  }
  const content = extractContent(payload);
  const lines = countLines(content);
  if (lines <= LINE_THRESHOLD) {
    return { action: 'noop', reason: 'below-line-threshold', lines };
  }

  const ts = now ?? new Date().toISOString();
  const filePath = extractFilePath(payload);
  const summary = `[${ts}] ${toolName} file=${filePath} lines=${lines}\n`;
  const sessionsDir = join(projectRoot, 'context', 'sessions');
  const nowMd = join(sessionsDir, 'now.md');
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }
  appendFileSync(nowMd, summary, 'utf8');
  return { action: 'appended', summaryLine: summary, lines };
}
