// @doors: 1
// Door 2 N/A: the parser is pure — it reads a session JSON string/file and
//   returns extracted turns; no state mutation.
// Door 3 N/A: no subprocess spawn.
// Door 4 N/A: no log emission.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50.H — the Kiro transcript parser.
//
// Resolves the D-180 "highest unverified risk" concretely: Kiro is a VS Code
// fork storing per-session JSON at
//   %APPDATA%/Kiro/User/globalStorage/kiro.kiroagent/workspace-sessions/<b64url(path)>/<sessionId>.json
// with a `history[]` of { message: { role, content: [{type:'text', text}] } }.
// This parser turns that into the {role, text} turns the kit's capture path
// consumes — the per-agent transcript adapter the seam needs (vs the hardcoded
// Claude-Code JSONL reader). The fixture below mirrors the REAL shape inspected
// on a live Kiro install.

import { describe, it, expect } from 'vitest';
import {
  parseKiroSessionHistory,
  workspaceKeyForPath,
} from '../packages/cli/src/kiro-transcript.mjs';

// A realistic Kiro session JSON (the shape verified on a real install).
const sessionJson = JSON.stringify({
  sessionId: 'e9ea84dd-5429-4ffe-b9f5-247bed6acef2',
  title: 'Build a memory system',
  workspaceDirectory: 'c:\\Projects\\demo',
  history: [
    {
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'Build a memory system.' },
          { type: 'text', text: 'It must survive sessions.' },
        ],
      },
    },
    {
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Here is the plan.' }],
      },
    },
  ],
});

describe('Task 50.H — Kiro transcript parser', () => {
  describe('parseKiroSessionHistory', () => {
    it('extracts ordered {role, text} turns, joining multi-part content', () => {
      const turns = parseKiroSessionHistory(sessionJson);
      expect(turns).toEqual([
        { role: 'user', text: 'Build a memory system.\nIt must survive sessions.' },
        { role: 'assistant', text: 'Here is the plan.' },
      ]);
    });

    it('returns [] for a session with no history (new/empty session)', () => {
      expect(parseKiroSessionHistory(JSON.stringify({ history: [] }))).toEqual([]);
      expect(parseKiroSessionHistory(JSON.stringify({}))).toEqual([]);
    });

    it('tolerates a malformed session (returns [] rather than throwing)', () => {
      expect(parseKiroSessionHistory('{ not json')).toEqual([]);
      expect(parseKiroSessionHistory('')).toEqual([]);
    });

    it('skips non-text content parts (e.g. tool blocks) without crashing', () => {
      const withTool = JSON.stringify({
        history: [
          {
            message: {
              role: 'assistant',
              content: [
                { type: 'toolUse', name: 'x' },
                { type: 'text', text: 'after the tool' },
              ],
            },
          },
        ],
      });
      expect(parseKiroSessionHistory(withTool)).toEqual([{ role: 'assistant', text: 'after the tool' }]);
    });
  });

  describe('workspaceKeyForPath — Kiro\'s base64url(workspacePath) mapping', () => {
    it('matches the EXACT scheme verified on a real Kiro install (+→-, /→_, =→_)', () => {
      // Real install: c:\Projects\kiro-test-memory-kit →
      //   YzpcUHJvamVjdHNca2lyby10ZXN0LW1lbW9yeS1raXQ_
      // i.e. standard base64 with +→- , /→_ , and PADDING = → _ (not stripped).
      const key = workspaceKeyForPath('c:\\Projects\\kiro-test-memory-kit');
      expect(key).toBe('YzpcUHJvamVjdHNca2lyby10ZXN0LW1lbW9yeS1raXQ_');
    });

    it('is deterministic (same path → same key)', () => {
      expect(workspaceKeyForPath('c:\\X')).toBe(workspaceKeyForPath('c:\\X'));
    });
  });
});
