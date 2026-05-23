#!/usr/bin/env node
// extract-session-transcript.mjs
//
// Read a Claude Code session jsonl (from ~/.claude/projects/<slug>/<uuid>.jsonl)
// and produce a clean, human-readable markdown transcript suitable for
// article curation or wiki ingest.
//
// What we keep:
//   - user messages (text content only)
//   - assistant messages (text content only)
//   - timestamps
//
// What we drop:
//   - assistant `thinking` blocks (long; internal reasoning; not article material)
//   - `tool_use` / `tool_result` blocks (machine-readable; not human prose)
//   - queue-operation / ai-title / last-prompt / file-history-snapshot / attachment / pr-link entries
//   - <system-reminder> ... </system-reminder> blocks inside user text (harness annotations, not user prose)
//   - <command-name> ... </command-name> blocks (slash-command annotations)
//   - <ide_opened_file> / <ide_selection> tags (IDE state, not user prose)
//
// Usage:
//   node scripts/extract-session-transcript.mjs --input <jsonl> --output <md>
//
// Example:
//   node scripts/extract-session-transcript.mjs \
//     --input  "C:/Projects/cmk-session-transcript/session-2026-05-20-to-23.raw.jsonl" \
//     --output "C:/Projects/cmk-session-transcript/session-2026-05-20-to-23.md"

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    input: { type: 'string', short: 'i' },
    output: { type: 'string', short: 'o' },
    'include-thinking': { type: 'boolean', default: false },
  },
});

if (!values.input || !values.output) {
  console.error('Usage: node extract-session-transcript.mjs --input <jsonl> --output <md> [--include-thinking]');
  process.exit(2);
}

const SYSTEM_REMINDER_RE = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const COMMAND_NAME_RE = /<command-name>[\s\S]*?<\/command-name>/g;
const COMMAND_MESSAGE_RE = /<command-message>[\s\S]*?<\/command-message>/g;
const COMMAND_ARGS_RE = /<command-args>[\s\S]*?<\/command-args>/g;
const IDE_OPENED_RE = /<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g;
const IDE_SELECTION_RE = /<ide_selection>[\s\S]*?<\/ide_selection>/g;
const LOCAL_COMMAND_OUTPUT_RE = /<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g;
const LOCAL_COMMAND_STDERR_RE = /<local-command-stderr>[\s\S]*?<\/local-command-stderr>/g;

function stripHarnessNoise(text) {
  return String(text)
    .replace(SYSTEM_REMINDER_RE, '')
    .replace(COMMAND_NAME_RE, '')
    .replace(COMMAND_MESSAGE_RE, '')
    .replace(COMMAND_ARGS_RE, '')
    .replace(IDE_OPENED_RE, '')
    .replace(IDE_SELECTION_RE, '')
    .replace(LOCAL_COMMAND_OUTPUT_RE, '')
    .replace(LOCAL_COMMAND_STDERR_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Pull plain text from a message's `content` field. The content is either
 * a string or an array of typed blocks. We keep `type: 'text'` blocks
 * (and optionally `type: 'thinking'` if --include-thinking).
 */
function extractText(content, includeThinking) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    } else if (includeThinking && block.type === 'thinking' && typeof block.thinking === 'string') {
      parts.push(`\n[thinking]\n${block.thinking}\n[/thinking]\n`);
    }
    // Drop tool_use, tool_result, image, etc.
  }
  return parts.join('\n');
}

const raw = readFileSync(values.input, 'utf8');
const lines = raw.split('\n').filter(Boolean);

const turns = [];
let firstTimestamp = null;
let lastTimestamp = null;
let turnIndex = 0;

for (const line of lines) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    continue;
  }
  const t = obj.type;
  if (t !== 'user' && t !== 'assistant') continue;

  const msg = obj.message || {};
  const role = msg.role || t;
  const ts = obj.timestamp;
  if (ts) {
    if (!firstTimestamp) firstTimestamp = ts;
    lastTimestamp = ts;
  }

  const raw = extractText(msg.content, !!values['include-thinking']);
  const text = stripHarnessNoise(raw);
  if (!text) continue; // Skip empty turns (often just tool results or pure tool calls)

  turnIndex++;
  turns.push({
    n: turnIndex,
    role,
    ts: ts || null,
    text,
  });
}

const sessionStart = firstTimestamp ? new Date(firstTimestamp).toISOString() : '?';
const sessionEnd = lastTimestamp ? new Date(lastTimestamp).toISOString() : '?';

const out = [];
out.push('# Session transcript');
out.push('');
out.push(`- **Source jsonl**: \`${values.input}\``);
out.push(`- **Spans**: ${sessionStart} → ${sessionEnd}`);
out.push(`- **Turns kept**: ${turns.length} (raw lines: ${lines.length})`);
out.push(`- **Filters applied**: tool calls + tool results + thinking blocks + system reminders + IDE state + slash-command annotations removed${values['include-thinking'] ? ' (EXCEPT thinking, retained per --include-thinking)' : ''}`);
out.push('');
out.push('---');
out.push('');

for (const turn of turns) {
  const tsLabel = turn.ts ? new Date(turn.ts).toISOString().replace('T', ' ').replace(/\..+/, ' UTC') : '';
  out.push(`## Turn ${turn.n} — ${turn.role}${tsLabel ? ` — ${tsLabel}` : ''}`);
  out.push('');
  out.push(turn.text);
  out.push('');
}

writeFileSync(values.output, out.join('\n'), 'utf8');

const outSize = statSync(values.output).size;
console.log(`extract-session-transcript: wrote ${turns.length} turns to ${values.output} (${(outSize / 1024 / 1024).toFixed(2)} MB)`);
