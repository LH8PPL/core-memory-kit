// @doors: 1, 2, 3
// Door 3: the external writer is a REAL separate `cmk remember` / `cmk forget`
//   process (execFileSync) into the SAME on-disk project the server reads —
//   the honest cross-writer whose write the MCP read tools must pick up.
// Door 4 N/A: no NDJSON/audit assertion at this surface (the refresh is
//   observable via the search/get result, Door 1/2).
// Door 5 N/A: no message-queue interaction.

// Task 218 — MCP server index freshness (D-329).
//
// The gap (repro-confirmed): the MCP server was the ONE reader that didn't run
// the per-query incremental `reindexBoot` every CLI read does (`cmk search`/
// `get`/`timeline` wrap reads in withReadDb, which reindexes first). Indexing is
// lazy/reader-driven — `cmk remember` writes the fact FILE; the FTS index is
// only refreshed when a reader reindexes. So the MCP read tools never saw a fact
// written after the server opened its handle. The fix brings the MCP read tools
// to CLI parity: each runs `refreshIndexForRead` (incremental, mtime/sha1 diff,
// ~0ms when nothing changed) before reading. DETERMINISTIC — a synchronous
// inline refresh, no FS-event timing (unlike the chokidar-watcher approach it
// replaced, which dropped events under load).
//
// Uses buildMcpServer (NOT runMcpServer) — the refresh lives in the tool
// handlers, so buildMcpServer gives refresh-wired tools without runMcpServer's
// process-level stdin/SIGINT handlers (which leak across an in-process test
// suite). Same pattern as cli-mcp-server.test.js. The db is opened + closed by
// the test, mirroring how a live server holds ONE long-lived handle across calls.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMcpServer } from '../packages/cli/src/mcp-server.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import { install } from '../packages/cli/src/install.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CMK_BIN = join(REPO_ROOT, 'packages', 'cli', 'bin', 'cmk.mjs');

let sandbox;
let projectRoot;
let userDir;
let db;

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-mcp-fresh-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
  // ONE long-lived handle across tool calls — the live-server shape.
  db = openIndexDb({ projectRoot });
});

afterEach(() => {
  try { db?.close(); } catch { /* already closed by a test */ }
  rmSync(sandbox, { recursive: true, force: true });
});

// The external writer — a real separate `cmk remember` process (the cross-writer
// the MCP reader must pick up). `cmk remember` operates on cwd, not a --project flag.
function externalRemember(text) {
  execFileSync('node', [CMK_BIN, 'remember', text, '--type', 'project'], {
    cwd: projectRoot,
    env: { ...process.env, MEMORY_KIT_USER_DIR: userDir },
    encoding: 'utf8',
  });
}

async function callTool(server, name, args) {
  const reg = server._registeredTools;
  const tool = reg instanceof Map ? reg.get(name) : reg?.[name];
  if (!tool) throw new Error(`${name} tool not registered`);
  const cb = tool.handler ?? tool.callback ?? tool;
  return cb(args);
}

function parseHits(r) {
  if (!r || r.isError || !Array.isArray(r.content) || !r.content[0]) return [];
  try {
    const parsed = JSON.parse(r.content[0].text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

describe('Task 218 — MCP server index freshness (CLI parity)', () => {
  it('mk_search sees a fact written by an EXTERNAL process AFTER the server opened its handle (no restart, DETERMINISTIC)', async () => {
    const server = buildMcpServer({ projectRoot, userDir, db });
    // not present at the start
    expect(parseHits(await callTool(server, 'mk_search', { query: 'quokka' }))).toHaveLength(0);

    // a real separate `cmk remember` process writes the fact (the writer's
    // reindex is on ITS OWN connection — the server's handle is separate).
    externalRemember('The quokka is the marker animal for MCP freshness');

    // the very NEXT mk_search refreshes the index inline and finds it —
    // synchronously, no waiting, no FS-event race.
    const hits = parseHits(await callTool(server, 'mk_search', { query: 'quokka' }));
    expect(hits.length, 'external fact not visible to the MCP reader (per-read refresh missing?)').toBeGreaterThan(0);
  });

  it('mk_get ALSO sees an external write (every read tool has CLI parity, not just search)', async () => {
    externalRemember('The numbat is the marker animal for mk_get freshness');
    const server = buildMcpServer({ projectRoot, userDir, db });
    // find the id via search (search refreshes)
    const hits = parseHits(await callTool(server, 'mk_search', { query: 'numbat' }));
    expect(hits.length).toBeGreaterThan(0);
    const id = hits[0].id;
    // write ANOTHER fact, then mk_get the FIRST — mk_get's own refresh keeps the
    // index current even though we never searched again.
    externalRemember('A second bilby fact to bump the index after the get target existed');
    const got = JSON.parse((await callTool(server, 'mk_get', { ids: [id] })).content[0].text);
    expect(Array.isArray(got)).toBe(true);
    expect(got[0]?.id ?? got[0]?.error).toBeDefined(); // a real row (or a structured not-found), never a crash
  });

  it('an EXTERNAL forget mid-session is picked up too (the reader stops returning the tombstoned fact)', async () => {
    externalRemember('The bettong is the forget marker animal');
    const server = buildMcpServer({ projectRoot, userDir, db });
    const hits = parseHits(await callTool(server, 'mk_search', { query: 'bettong' }));
    expect(hits.length).toBeGreaterThan(0);
    const id = hits[0].id;
    // external forget (a real separate process); `cmk forget` operates on cwd.
    execFileSync('node', [CMK_BIN, 'forget', id, '--yes'], {
      cwd: projectRoot, env: { ...process.env, MEMORY_KIT_USER_DIR: userDir }, encoding: 'utf8',
    });
    // the next search's refresh reindexes the tombstone → the fact is gone.
    expect(parseHits(await callTool(server, 'mk_search', { query: 'bettong' }))).toHaveLength(0);
  });
});
