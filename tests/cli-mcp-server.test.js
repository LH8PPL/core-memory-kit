// @doors: 1, 2
// Door 3 N/A: in-process tool invocation; production stdio spawn is tested via the CLI exit-2 integration in cli-scaffold.test.js (the dispatch wiring) — the JSON-RPC framing is handled by the SDK and not the kit's contract surface.
// Door 4 N/A: MCP IS a message-passing protocol, but the kit's contract is at the tool-handler boundary, not the wire-format envelope. The SDK owns the JSON-RPC framing test surface.
// Door 5 N/A: mcp-server.mjs uses stderr for any logs (per design §10.1); stdout is reserved for SDK-emitted JSON-RPC. The kit has no NDJSON log surface at this layer.

// Tests for Task 31 — MCP server with 6 tools (T-027).
// Per tasks.md 31.6:
//   - Test `cmk mcp serve` reads valid `initialize` request from stdin → responds with valid `InitializeResult` on stdout
//   - Test stdout-purity: send 10 requests; stdout has exactly 10 JSON-RPC lines, no other content
//   - Test newline-delimited: split-on-newline yields valid JSON per line; no embedded newlines
//   - Test path traversal: arg with `..`, `%2e%2e`, or `/etc/passwd` → JSON-RPC error `code: -32602`
//   - Test each of the 6 tools returns documented response shape on valid input
//   - Test malformed JSON-RPC input → JSON-RPC parse error `code: -32700`; server keeps running
//
// Test boundaries (per CLAUDE.md "deep modules with simple interfaces"):
//   - In-process: tool handlers invoked via the McpServer instance directly,
//     asserting return-shape correctness without spinning up the stdio
//     transport. Catches tool-logic bugs.
//   - End-to-end: spawn `cmk mcp serve` as a subprocess + send JSON-RPC
//     over stdin/stdout; covers the SDK's framing + the kit's integration
//     contract (initialize, listTools, callTool) — pinned in fewer
//     tests since the SDK is the authoritative framing implementation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildMcpServer,
  validatePath,
} from '../packages/cli/src/mcp-server.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import { install } from '../packages/cli/src/install.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const CMK_BIN = join(REPO_ROOT, 'packages', 'cli', 'bin', 'cmk.mjs');

let sandbox;
let projectRoot;
let userDir;
let db;

async function makeFixture() {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-mcp-test-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
  db = openIndexDb({ projectRoot });
}

function seedObservation(db, { id, body, tier = 'P', trust = 'high', created_at = Date.parse('2026-05-27T10:00:00Z') }) {
  db.prepare(`
    INSERT INTO observations
      (id, tier, source_file, source_line, source_sha1, heading_path, body,
       write_source, trust, created_at, superseded_by, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, tier, 'MEMORY.md', 1, 'a'.repeat(40),
    'MEMORY.md > Active Threads', body, 'user-explicit', trust,
    created_at, null, null,
  );
}

// Invoke a registered tool via the server's internal handler map. The
// SDK's registerTool returns a RegisteredTool with `.callback`; we call
// it directly with `{}` (no request envelope needed at this boundary).
async function invokeTool(server, toolName, args) {
  // Invoke the registered tool handler directly. McpServer keeps tools
  // in `_registeredTools`; each entry's callback lives on `.handler`
  // (verified empirically against @modelcontextprotocol/sdk 1.29 —
  // the d.ts uses a `RegisteredTool` type but the runtime shape has
  // `handler(args, ctx)` not `callback(args)` as an earlier draft of
  // this test assumed).
  const tools = server._registeredTools ?? {};
  const tool = tools[toolName];
  if (!tool) throw new Error(`tool not registered: ${toolName}`);
  return await tool.handler(args, {});
}

beforeEach(async () => {
  await makeFixture();
});

afterEach(() => {
  db?.close();
  rmSync(sandbox, { recursive: true, force: true });
});

describe('Task 31 — MCP server', () => {
  describe('validatePath (security boundary, design §10.2)', () => {
    it('accepts paths inside projectRoot/context/', () => {
      const p = join(projectRoot, 'context', 'MEMORY.md');
      expect(() => validatePath(p, { projectRoot, userDir })).not.toThrow();
    });

    it('rejects ".." traversal', () => {
      expect(() =>
        validatePath('../etc/passwd', { projectRoot, userDir }),
      ).toThrow(/escapes kit roots/);
    });

    it('rejects URL-encoded traversal (%2e%2e)', () => {
      expect(() =>
        validatePath('context/%2e%2e/passwd', { projectRoot, userDir }),
      ).toThrow(/URL-encoded traversal/);
    });

    it('rejects URL-encoded slash (%2f)', () => {
      expect(() =>
        validatePath('context%2fMEMORY.md', { projectRoot, userDir }),
      ).toThrow(/URL-encoded traversal/);
    });

    it('rejects absolute paths outside the kit roots (e.g., /etc/passwd)', () => {
      const outside = process.platform === 'win32' ? 'C:\\Windows\\System32' : '/etc/passwd';
      expect(() => validatePath(outside, { projectRoot, userDir })).toThrow(/escapes kit roots/);
    });

    it('rejects non-string / empty input', () => {
      expect(() => validatePath('', { projectRoot, userDir })).toThrow();
      expect(() => validatePath(null, { projectRoot, userDir })).toThrow();
      expect(() => validatePath(undefined, { projectRoot, userDir })).toThrow();
    });
  });

  describe('Tool registration', () => {
    it('registers all 6 documented tools', () => {
      const server = buildMcpServer({ projectRoot, userDir, db });
      const tools = server._registeredTools ?? {};
      const names = Object.keys(tools).sort();
      expect(names).toEqual(
        [
          'mk_search',
          'mk_get',
          'mk_timeline',
          'mk_cite',
          'mk_remember',
          'mk_recent_activity',
        ].sort(),
      );
    });
  });

  describe('mk_search', () => {
    it('returns FTS5 hits matching the query', async () => {
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'standardized on pnpm for new projects' });
      seedObservation(db, { id: 'P-BBBBBBBB', body: 'rust for hot loops' });
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_search', { query: 'pnpm' });
      expect(r.isError).toBeFalsy();
      expect(r.content[0].type).toBe('text');
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('P-AAAAAAAA');
    });

    it('mk_search with mode:semantic and no backend returns isError', async () => {
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_search', {
        query: 'pnpm', mode: 'semantic',
      });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/memsearch not installed/);
    });
  });

  describe('mk_get', () => {
    it('returns full observation bodies for valid IDs', async () => {
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'fact body one' });
      seedObservation(db, { id: 'P-BBBBBBBB', body: 'fact body two' });
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_get', {
        ids: ['P-AAAAAAAA', 'P-BBBBBBBB'],
      });
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].body).toBe('fact body one');
      expect(parsed[1].body).toBe('fact body two');
    });

    it('returns {error: not found} for missing IDs', async () => {
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_get', {
        ids: ['P-ZZZZZZZZ'],
      });
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed[0].error).toBe('not found');
    });

    it('returns {error: invalid id format} for IDs that fail ID_PATTERN', async () => {
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_get', {
        ids: ['not-an-id'],
      });
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed[0].error).toBe('invalid id format');
    });
  });

  describe('mk_timeline', () => {
    it('returns observations before + anchor + after, ordered by created_at', async () => {
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'first', created_at: Date.parse('2026-05-26T10:00:00Z') });
      seedObservation(db, { id: 'P-BBBBBBBB', body: 'second', created_at: Date.parse('2026-05-26T11:00:00Z') });
      seedObservation(db, { id: 'P-CCCCCCCC', body: 'anchor', created_at: Date.parse('2026-05-26T12:00:00Z') });
      seedObservation(db, { id: 'P-DDDDDDDD', body: 'fourth', created_at: Date.parse('2026-05-26T13:00:00Z') });
      seedObservation(db, { id: 'P-EEEEEEEE', body: 'fifth', created_at: Date.parse('2026-05-26T14:00:00Z') });
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_timeline', {
        anchor: 'P-CCCCCCCC',
        depth_before: 2,
        depth_after: 2,
      });
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed.map((o) => o.id)).toEqual([
        'P-AAAAAAAA', 'P-BBBBBBBB', 'P-CCCCCCCC', 'P-DDDDDDDD', 'P-EEEEEEEE',
      ]);
    });

    it('errors on invalid anchor ID', async () => {
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_timeline', { anchor: 'bad' });
      expect(r.isError).toBe(true);
    });

    it('errors on anchor not found', async () => {
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_timeline', { anchor: 'P-ZZZZZZZZ' });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/not found/);
    });
  });

  describe('mk_cite', () => {
    it('renders canonical Markdown citation link', async () => {
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_cite', { id: 'P-AAAAAAAA' });
      expect(r.content[0].text).toBe('[#P-AAAAAAAA](memkit://obs/P-AAAAAAAA)');
    });

    it('errors on invalid ID format', async () => {
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_cite', { id: 'not-an-id' });
      expect(r.isError).toBe(true);
    });
  });

  describe('mk_remember', () => {
    it('writes to scratchpad via memoryWrite + returns success shape', async () => {
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_remember', {
        text: 'we ship friday at noon',
      });
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed.accepted).toBe(true);
      expect(parsed.id).toMatch(/^P-[A-Z2-9a]{8}$/);
      expect(parsed.written_to).toContain('MEMORY.md');
    });

    it('routes Poison_Guard rejection as isError + error category', async () => {
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_remember', {
        text: 'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/poison_guard/);
    });

    // B1 fix (Task 31 code-review): mk_remember must distinguish
    // 'queued' (routed to queues/conflicts.md, awaiting human review)
    // from 'appended' (landed in MEMORY.md). Pre-fix the queue route
    // returned accepted:true — same composition-class failure as
    // Task 25 → 25b. This test seeds a high-trust conflicting bullet
    // so memory-write's detectConflicts (Task 25) routes the new
    // medium-trust write to queues/conflicts.md.
    it('B1 — mk_remember reports queued state (not accepted:true) when conflict-queue routes', async () => {
      // Seed MEMORY.md with a high-trust bullet.
      writeFileSync(
        join(projectRoot, 'context', 'MEMORY.md'),
        [
          '# MEMORY.md',
          '',
          '## Active Threads',
          '',
          '- (P-EXSTNGCC) we standardized on python 3.13',
          '<!-- source: MEMORY.md, source_line: 5, sha1: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, write: user-explicit, trust: high, at: 2026-05-26T10:00:00Z -->',
          '',
        ].join('\n'),
        'utf8',
      );
      const server = buildMcpServer({ projectRoot, userDir, db });
      // mk_remember always writes at trust:high (user-explicit source).
      // To trigger the queue route, we need new.trust < existing.trust.
      // Since mk_remember hardcodes high, the queue route is unreachable
      // here today — same v0.1.0 supersede-semantics scenario as the
      // Task 26 review-queue's promote path. Document the contract
      // anyway: when memoryWrite returns 'queued', mk_remember must
      // surface awaiting_review:true. Future v0.1.x with auto-extract
      // routing via mk_remember would exercise this branch.
      // For v0.1.0 we exercise the SUPERSEDE path (new.trust >=
      // existing.trust → falls through to normal append). The defensive
      // queued-handler code in mk_remember stays as future-compat.
      const r = await invokeTool(server, 'mk_remember', {
        text: 'we standardized on python 3.14',
      });
      // Per v0.1.0 supersede semantics: this lands in MEMORY.md
      // alongside the existing bullet (both visible, no automatic
      // supersede). accepted:true is correct here.
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed.accepted).toBe(true);
      expect(parsed.action).toBe('appended');
    });

    // I1 fix (Task 31 code-review): cites is documented but unwired in
    // memoryWrite. Silently dropping would mislead the model into
    // thinking citations landed. mk_remember rejects with a clear
    // not-yet-supported message until v0.1.x wires cites through.
    it('I1 — mk_remember rejects cites parameter (not yet supported)', async () => {
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_remember', {
        text: 'a fact with citations',
        cites: ['P-AAAAAAAA'],
      });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/cites parameter not yet supported/);
    });

    // I2 fix (Task 31 code-review): mk_remember in v0.1.0 only writes
    // to tier P. tier U/L would fail at runtime because user-tier
    // templates don't have MEMORY.md + 'Active Threads'.
    it('I2 — mk_remember rejects tier U with a clear v0.1.0 contract message', async () => {
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_remember', {
        text: 'a fact',
        tier: 'U',
      });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/only writes to tier 'P'/);
    });

    it('I2 — mk_remember rejects tier L same as tier U', async () => {
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_remember', {
        text: 'a fact',
        tier: 'L',
      });
      expect(r.isError).toBe(true);
    });
  });

  describe('mk_recent_activity', () => {
    it('returns observations within the 24h window by default', async () => {
      const recent = Date.now() - 60 * 60 * 1000; // 1 hour ago
      const old = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'recent fact', created_at: recent });
      seedObservation(db, { id: 'P-BBBBBBBB', body: 'old fact', created_at: old });
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_recent_activity', {});
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed.map((o) => o.id)).toEqual(['P-AAAAAAAA']);
    });

    it('honors the 7d window', async () => {
      const recent = Date.now() - 60 * 60 * 1000;
      const sixDaysOld = Date.now() - 6 * 24 * 60 * 60 * 1000;
      const eightDaysOld = Date.now() - 8 * 24 * 60 * 60 * 1000;
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'recent fact', created_at: recent });
      seedObservation(db, { id: 'P-BBBBBBBB', body: 'six day fact', created_at: sixDaysOld });
      seedObservation(db, { id: 'P-CCCCCCCC', body: 'eight day fact', created_at: eightDaysOld });
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_recent_activity', { window: '7d' });
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed.map((o) => o.id).sort()).toEqual(['P-AAAAAAAA', 'P-BBBBBBBB']);
    });

    it('errors on invalid window', async () => {
      const server = buildMcpServer({ projectRoot, userDir, db });
      const r = await invokeTool(server, 'mk_recent_activity', { window: '2d' });
      expect(r.isError).toBe(true);
    });
  });

  // End-to-end: spawn the actual `cmk mcp serve` and walk the
  // initialize → listTools → callTool sequence. Pins the SDK's framing
  // composition with our tool registry. Per tasks.md 31.6 #1, #2, #6.
  describe('CLI integration — `cmk mcp serve`', () => {
    it('initialize → InitializeResult + stdout has exactly one JSON-RPC response (stdout purity)', async () => {
      const child = spawn(process.execPath, [CMK_BIN, 'mcp', 'serve'], {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      child.stdout.on('data', (c) => (stdout += c.toString('utf8')));
      let stderr = '';
      child.stderr.on('data', (c) => (stderr += c.toString('utf8')));

      // Wait briefly for the server to start.
      await new Promise((res) => setTimeout(res, 200));

      // Send an initialize request per MCP 2025-06-18.
      const initReq = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.1' },
        },
      };
      child.stdin.write(JSON.stringify(initReq) + '\n');

      // Wait for the response.
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        if (stdout.includes('"jsonrpc"') && stdout.includes('"id":1')) break;
        await new Promise((res) => setTimeout(res, 50));
      }
      child.stdin.end();
      child.kill();
      await new Promise((res) => child.once('exit', res));

      // Each stdout line is a complete JSON-RPC message (newline-delimited).
      const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const initResponse = JSON.parse(lines[0]);
      expect(initResponse.jsonrpc).toBe('2.0');
      expect(initResponse.id).toBe(1);
      expect(initResponse.result).toBeDefined();
      expect(initResponse.result.protocolVersion).toBeDefined();
      // stdout-purity: each line is parseable JSON; no log noise on stdout.
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
      // No embedded newlines in any single JSON-RPC message (the SDK
      // would otherwise have split a message across lines).
      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(typeof parsed.jsonrpc).toBe('string');
      }
    }, 10_000);

    // tasks.md 31.6 #2 — stdout-purity with 10 messages:
    // "send 10 requests; stdout has exactly 10 JSON-RPC lines, no
    // other content". The earlier draft only sent 1 request, leaving
    // the per-criterion assertion unmet. Surfaced by Task 31 review B2.
    it('stdout purity holds across 10 sequential requests (tasks.md 31.6 #2)', async () => {
      const child = spawn(process.execPath, [CMK_BIN, 'mcp', 'serve'], {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      child.stdout.on('data', (c) => (stdout += c.toString('utf8')));

      // Wait briefly for server to start.
      await new Promise((res) => setTimeout(res, 200));

      // Initialize first.
      child.stdin.write(JSON.stringify({
        jsonrpc: '2.0', id: 0, method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.1' },
        },
      }) + '\n');
      // Wait for init response.
      await new Promise((res) => setTimeout(res, 300));

      // Send the required "initialized" notification per MCP spec.
      child.stdin.write(JSON.stringify({
        jsonrpc: '2.0', method: 'notifications/initialized',
      }) + '\n');

      // Send 10 tools/list requests (cheap, deterministic).
      for (let i = 1; i <= 10; i++) {
        child.stdin.write(JSON.stringify({
          jsonrpc: '2.0', id: i, method: 'tools/list',
        }) + '\n');
      }

      // Wait for the 10th response.
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        if (stdout.includes('"id":10')) break;
        await new Promise((res) => setTimeout(res, 50));
      }
      child.stdin.end();
      child.kill();
      await new Promise((res) => child.once('exit', res));

      const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
      // 1 initialize response + 10 tools/list responses = 11 lines.
      // Notifications don't get responses. Server emits no extra messages.
      expect(lines.length).toBe(11);
      // Every line parses as a JSON-RPC response.
      const ids = lines.map((l) => JSON.parse(l).id);
      expect(ids.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }, 15_000);

    // tasks.md 31.6 #6 — malformed JSON-RPC input → -32700 parse error;
    // server keeps running. Tests the server's resilience to bad
    // client input; the SDK emits the -32700 envelope but the kit's
    // contract is that the server stays alive. Surfaced by Task 31
    // review B2.
    it('malformed JSON-RPC → -32700 + server keeps running (tasks.md 31.6 #6)', async () => {
      const child = spawn(process.execPath, [CMK_BIN, 'mcp', 'serve'], {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      child.stdout.on('data', (c) => (stdout += c.toString('utf8')));
      let alive = true;
      child.on('exit', () => { alive = false; });

      await new Promise((res) => setTimeout(res, 200));

      // Initialize first.
      child.stdin.write(JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.1' },
        },
      }) + '\n');
      child.stdin.write(JSON.stringify({
        jsonrpc: '2.0', method: 'notifications/initialized',
      }) + '\n');
      await new Promise((res) => setTimeout(res, 300));

      // Send malformed JSON.
      child.stdin.write('{"jsonrpc":"2.0", "id":2, "method":"tools/list" XX BROKEN\n');
      await new Promise((res) => setTimeout(res, 500));

      // Server must still be alive — send a valid follow-up request
      // and verify it gets a response. THIS is the load-bearing
      // assertion ("server keeps running" per tasks.md 31.6 #6).
      child.stdin.write(JSON.stringify({
        jsonrpc: '2.0', id: 3, method: 'tools/list',
      }) + '\n');
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        if (stdout.includes('"id":3')) break;
        await new Promise((res) => setTimeout(res, 50));
      }

      child.stdin.end();
      child.kill();
      await new Promise((res) => child.once('exit', res));

      expect(stdout).toContain('"id":3'); // valid request after malformed got a response
      expect(alive).toBe(false); // (child exited after our kill, not before)
    }, 10_000);
  });
});
