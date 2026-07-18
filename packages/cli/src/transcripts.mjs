// `cmk transcripts extract` (Task 38b, T-032).
//
// Two public boundaries:
//
//   extractTranscript({inputPath, outputPath, includeThinking?})
//     → {turnsKept, rawLines, outputSize, sessionStart, sessionEnd}
//
//   discoverSessions({slug?, sessionUuidSuffix?, sinceIso?, harnessRoot?})
//     → Array<{slug, sessionId, jsonlPath, mtimeMs}>
//
// Promotes the existing `scripts/extract-session-transcript.mjs` (kit-
// dev utility) to a user-facing CLI subcommand. Lets users mine months
// of pre-kit conversation history at
// `~/.claude/projects/<slug>/<uuid>.jsonl` into clean markdown corpora
// they can curate from.
//
// Filter contract (matches the scripts version + tasks.md 38.6):
//   - Keep user + assistant text content
//   - Drop tool_use / tool_result / image blocks
//   - Drop thinking blocks UNLESS --include-thinking
//   - Strip <system-reminder>, <command-name>, <command-message>,
//     <command-args>, <ide_opened_file>, <ide_selection>,
//     <local-command-stdout>, <local-command-stderr> from user text
//
// Per design §16.8 + tasks.md 38b (38.6–38.9).

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';

const SYSTEM_REMINDER_RE = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const COMMAND_NAME_RE = /<command-name>[\s\S]*?<\/command-name>/g;
const COMMAND_MESSAGE_RE = /<command-message>[\s\S]*?<\/command-message>/g;
const COMMAND_ARGS_RE = /<command-args>[\s\S]*?<\/command-args>/g;
const IDE_OPENED_RE = /<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g;
const IDE_SELECTION_RE = /<ide_selection>[\s\S]*?<\/ide_selection>/g;
const LOCAL_STDOUT_RE = /<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g;
const LOCAL_STDERR_RE = /<local-command-stderr>[\s\S]*?<\/local-command-stderr>/g;

const UUID_RE = /^([0-9a-f-]{36})\.jsonl$/i;

/**
 * The Claude Code harness slug for a project path — the directory name used
 * under ~/.claude/projects/. Same rule the harness applies (every
 * non-alphanumeric char → '-'); the two pre-existing inline copies live in
 * doctor.mjs + import-anthropic-memory.mjs.
 */
export function harnessSlugForPath(projectRoot) {
  return String(projectRoot).replace(/[^a-zA-Z0-9]/g, '-');
}

function stripHarnessNoise(text) {
  return String(text)
    .replace(SYSTEM_REMINDER_RE, '')
    .replace(COMMAND_NAME_RE, '')
    .replace(COMMAND_MESSAGE_RE, '')
    .replace(COMMAND_ARGS_RE, '')
    .replace(IDE_OPENED_RE, '')
    .replace(IDE_SELECTION_RE, '')
    .replace(LOCAL_STDOUT_RE, '')
    .replace(LOCAL_STDERR_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractText(content, includeThinking) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    } else if (
      includeThinking &&
      block.type === 'thinking' &&
      typeof block.thinking === 'string'
    ) {
      parts.push(`\n[thinking]\n${block.thinking}\n[/thinking]\n`);
    }
    // Drop tool_use, tool_result, image, etc.
  }
  return parts.join('\n');
}

/**
 * Extract a single session jsonl into a clean markdown transcript.
 *
 * @returns {object} {turnsKept, rawLines, outputSize, sessionStart, sessionEnd}
 */
export function extractTranscript({
  inputPath,
  outputPath,
  includeThinking = false,
} = {}) {
  const errors = [];
  if (!inputPath) errors.push('inputPath: required');
  if (!outputPath) errors.push('outputPath: required');
  if (errors.length > 0) {
    return errorResult({ category: ERROR_CATEGORIES.SCHEMA, errors });
  }
  if (!existsSync(inputPath)) {
    return errorResult({
      category: ERROR_CATEGORIES.NOT_FOUND,
      errors: [`inputPath does not exist: ${inputPath}`],
    });
  }
  const raw = readFileSync(inputPath, 'utf8');
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
    const text = stripHarnessNoise(extractText(msg.content, !!includeThinking));
    if (!text) continue;
    turnIndex += 1;
    turns.push({ n: turnIndex, role, ts: ts || null, text });
  }

  const sessionStart = firstTimestamp ? new Date(firstTimestamp).toISOString() : null;
  const sessionEnd = lastTimestamp ? new Date(lastTimestamp).toISOString() : null;

  const out = [];
  out.push('# Session transcript');
  out.push('');
  out.push(`- **Source jsonl**: \`${inputPath}\``);
  out.push(`- **Spans**: ${sessionStart ?? '?'} → ${sessionEnd ?? '?'}`);
  out.push(`- **Turns kept**: ${turns.length} (raw lines: ${lines.length})`);
  out.push(
    `- **Filters applied**: tool calls + tool results + thinking blocks + system reminders + IDE state + slash-command annotations removed${includeThinking ? ' (EXCEPT thinking, retained per --include-thinking)' : ''}`,
  );
  out.push('');
  out.push('---');
  out.push('');

  for (const turn of turns) {
    const tsLabel = turn.ts
      ? new Date(turn.ts).toISOString().replace('T', ' ').replace(/\..+/, ' UTC')
      : '';
    out.push(`## Turn ${turn.n} — ${turn.role}${tsLabel ? ` — ${tsLabel}` : ''}`);
    out.push('');
    out.push(turn.text);
    out.push('');
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, out.join('\n'), 'utf8');
  const outputSize = statSync(outputPath).size;
  return {
    action: 'completed',
    turnsKept: turns.length,
    rawLines: lines.length,
    outputSize,
    sessionStart,
    sessionEnd,
  };
}

/**
 * Discover Claude Code session jsonls under ~/.claude/projects/.
 *
 * @param {object} opts
 * @param {string} [opts.slug]  filter to this slug only
 * @param {string} [opts.sessionUuidSuffix]  match the session jsonl whose basename ends with this UUID suffix
 * @param {string} [opts.sinceIso]  filter by mtime >= this ISO date
 * @param {string} [opts.harnessRoot]  override (test injection) for ~/.claude/projects
 * @returns {Array<{slug, sessionId, jsonlPath, mtimeMs}>}
 */
export function discoverSessions({
  slug,
  sessionUuidSuffix,
  sinceIso,
  harnessRoot,
} = {}) {
  const root = harnessRoot ?? join(homedir(), '.claude', 'projects');
  if (!existsSync(root)) return [];
  const slugsToScan = slug ? [slug] : safeReaddir(root).filter((s) => isDir(join(root, s)));
  const sinceMs = sinceIso ? new Date(sinceIso).getTime() : null;
  const results = [];
  for (const s of slugsToScan) {
    const dir = join(root, s);
    if (!isDir(dir)) continue;
    for (const name of safeReaddir(dir)) {
      const m = UUID_RE.exec(name);
      if (!m) continue;
      const jsonlPath = join(dir, name);
      let mtimeMs;
      try {
        mtimeMs = statSync(jsonlPath).mtimeMs;
      } catch {
        continue;
      }
      if (sinceMs !== null && mtimeMs < sinceMs) continue;
      const sessionId = m[1];
      if (sessionUuidSuffix && !sessionId.endsWith(sessionUuidSuffix)) continue;
      results.push({ slug: s, sessionId, jsonlPath, mtimeMs });
    }
  }
  // Sort newest first
  results.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return results;
}

function safeReaddir(path) {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
