// @doors: 1
// Door 2 N/A: extractTurnToolActivity is a PURE function (JSONL text in,
//   formatted block out) — no disk state; the transcript append it feeds is
//   Door-2-asserted in cli-capture-turn.test.js.
// Door 3 N/A: no subprocess; capture-turn owns the spawn surface.
// Door 4 N/A: no log writes from the pure layer.
// Door 5 N/A: no message queue.

// Tests for Task 104.1 — extracting the current turn's TOOL ACTIVITY from
// Anthropic's session JSONL (the Stop payload's transcript_path) into the
// kit's own committed transcript. The JSONL internal format is NOT a
// documented contract — the shapes below were verified empirically across
// 6 sessions / 4 projects (2026-06-10): message.content is a block LIST or
// a plain STRING; tool_result.content is a STRING or a LIST of text blocks;
// harness entry types (queue-operation/attachment/ai-title/...) interleave
// and must be skipped. The parser is defensive: anything unrecognized
// degrades to null/skip, never a throw.

import { describe, it, expect } from 'vitest';
import { extractTurnToolActivity } from '../packages/cli/src/turn-tools.mjs';

// --- fixture builders (the verified shapes) --------------------------------

const line = (obj) => JSON.stringify(obj);
const userPrompt = (text) =>
  line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });
const userPromptStr = (text) =>
  line({ type: 'user', message: { role: 'user', content: text } }); // the plain-STRING variant
const assistantTools = (...uses) =>
  line({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: uses.map(([id, name, input]) => ({ type: 'tool_use', id, name, input })),
    },
  });
const toolResult = (id, content) =>
  line({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] },
  });
const assistantText = (text) =>
  line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
const harnessNoise = () =>
  [
    line({ type: 'queue-operation', op: 'x' }),
    line({ type: 'ai-title', title: 'y' }),
    line({ type: 'file-history-snapshot', files: [] }),
  ].join('\n');

describe('Task 104.1 — extractTurnToolActivity (pure JSONL → Tools block)', () => {
  it('extracts the CURRENT turn only: tool calls after the last real user prompt', () => {
    const jsonl = [
      userPrompt('old question'),
      assistantTools(['t1', 'Bash', { command: 'echo old' }]),
      toolResult('t1', 'old output'),
      assistantText('old answer'),
      userPrompt('what is the git status?'),
      assistantTools(['t2', 'Bash', { command: 'git status' }]),
      toolResult('t2', 'On branch main\nnothing to commit'),
      assistantText('clean tree'),
    ].join('\n');
    const block = extractTurnToolActivity(jsonl);
    expect(block).toContain('Bash(git status)');
    expect(block).toContain('On branch main');
    expect(block).not.toContain('echo old'); // prior turn excluded
  });

  it('handles the plain-STRING user content variant as a real prompt boundary', () => {
    const jsonl = [
      userPrompt('old'),
      assistantTools(['a', 'Read', { file_path: 'old.txt' }]),
      toolResult('a', 'old body'),
      userPromptStr('the string-content prompt'),
      assistantTools(['b', 'Read', { file_path: 'C:/sbx-files/new.txt' }]),
      toolResult('b', 'new body'),
    ].join('\n');
    const block = extractTurnToolActivity(jsonl);
    expect(block).toContain('new.txt');
    expect(block).not.toContain('old.txt');
  });

  it('tool_result content as a LIST of text blocks is flattened', () => {
    const jsonl = [
      userPrompt('q'),
      assistantTools(['x', 'Grep', { pattern: 'needle' }]),
      toolResult('x', [{ type: 'text', text: 'match one' }, { type: 'text', text: 'match two' }]),
    ].join('\n');
    const block = extractTurnToolActivity(jsonl);
    expect(block).toContain('Grep(needle)');
    expect(block).toContain('match one');
  });

  it('a tool_result-only user entry is NOT a prompt boundary (API convention: results ride user role)', () => {
    const jsonl = [
      userPrompt('the real question'),
      assistantTools(['p', 'Bash', { command: 'ls' }]),
      toolResult('p', 'files'),
      assistantTools(['q', 'Bash', { command: 'pwd' }]),
      toolResult('q', '/repo'),
    ].join('\n');
    const block = extractTurnToolActivity(jsonl);
    // BOTH calls belong to the current turn — the tool_result user entries
    // in between must not be mistaken for new prompts.
    expect(block).toContain('Bash(ls)');
    expect(block).toContain('Bash(pwd)');
  });

  it('returns null for a turn with no tool activity', () => {
    const jsonl = [userPrompt('hello'), assistantText('hi there')].join('\n');
    expect(extractTurnToolActivity(jsonl)).toBe(null);
  });

  it('returns null on empty/garbage input (never throws)', () => {
    expect(extractTurnToolActivity('')).toBe(null);
    expect(extractTurnToolActivity('not json at all\n{broken')).toBe(null);
    expect(extractTurnToolActivity(null)).toBe(null);
  });

  it('skips harness entry types and malformed lines without losing the turn', () => {
    const jsonl = [
      harnessNoise(),
      userPrompt('do the thing'),
      'this line is not json',
      assistantTools(['h', 'Edit', { file_path: 'src/app.mjs' }]),
      harnessNoise(),
      toolResult('h', 'ok'),
    ].join('\n');
    const block = extractTurnToolActivity(jsonl);
    expect(block).toContain('Edit(src/app.mjs)');
  });

  it('caps each result snippet and the whole block (git-bloat control)', () => {
    const big = 'x'.repeat(5000);
    const uses = [];
    const lines = [userPrompt('big work')];
    for (let i = 0; i < 30; i++) {
      lines.push(assistantTools([`id${i}`, 'Bash', { command: `cmd-${i}` }]));
      lines.push(toolResult(`id${i}`, big));
    }
    const block = extractTurnToolActivity(lines.join('\n'));
    expect(block.length).toBeLessThanOrEqual(4200); // BLOCK cap + small footer slack
    expect(block).toMatch(/more tool call/i); // overflow is summarized, not silently dropped
  });

  it('picks a representative input field per tool (command/file_path/pattern/query) and truncates it', () => {
    const jsonl = [
      userPrompt('q'),
      assistantTools(
        ['1', 'Bash', { command: 'npm test', description: 'noise' }],
        ['2', 'Read', { file_path: 'docs/x.md', limit: 5 }],
        ['3', 'WebFetch', { url: 'https://example.com/page', prompt: 'noise' }],
        ['4', 'SomeNewTool', { alpha: 'a', beta: 'b' }],
      ),
      toolResult('1', 'ok'),
    ].join('\n');
    const block = extractTurnToolActivity(jsonl);
    expect(block).toContain('Bash(npm test)');
    expect(block).toContain('Read(docs/x.md)');
    expect(block).toContain('WebFetch(https://example.com/page)');
    expect(block).toMatch(/SomeNewTool\(.+\)/); // unknown tools degrade to a JSON-ish summary
  });
});
