// MCP server (Task 31, T-027). Layer 5's final task — closes Layer 5.
//
// Per design §10 + tasks.md 31:
//   - stdio JSON-RPC transport per MCP 2025-06-18 spec
//   - Six tools: mk_search, mk_get, mk_timeline, mk_cite, mk_remember,
//     mk_recent_activity
//   - Path-traversal validation on every read/write surface
//   - All logs to stderr (or sessions/{date}.mcp.log); stdout pure
//
// Composes on top of:
//   - Task 28 index-db (the SQLite cache the server queries)
//   - Task 30 search (mk_search delegates to search())
//   - Task 24 memory-write (mk_remember delegates to memoryWrite())
//   - Task 13 provenance (citation IDs match ID_PATTERN)
//
// The MCP SDK (@modelcontextprotocol/sdk v1.29.0, official Anthropic
// TypeScript SDK) handles JSON-RPC framing + the initialize/initialized
// handshake + tool listing. We register tool handlers; the SDK handles
// the protocol envelope.
//
// Lior 2026-05-23 decision: @modelcontextprotocol/sdk library naming
// goes in tasks.md Task 31 implementation, NOT in design.md. This
// module is where the dep choice lands.
//
// High-risk surface per tasks.md 31 — individual PR review required.
// The risk class: MCP is a protocol implementation + security boundary
// (stdio with path-traversal validation). Subtle bugs in JSON-RPC
// framing, newline handling, or path validation can introduce real
// CVEs. The SDK handles framing; we own path validation + tool body
// + error mapping.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolve as resolvePath, isAbsolute } from 'node:path';
import { openIndexDb } from './index-db.mjs';
import { search, SEARCH_MODES } from './search.mjs';
import { memoryWrite } from './memory-write.mjs';
import { ID_PATTERN, resolveTierRoot } from './tier-paths.mjs';

// --- Path-traversal validation (design §10.2; tasks.md 31.2) ----------

/**
 * Reject paths that escape the kit's three documented tier roots. Per
 * NFR-6 + Kiro's stricter pattern:
 *   - canonicalize via path.resolve() so symlinks + .. are normalized
 *   - reject URL-encoded traversal (%2e%2e%2f)
 *   - require the canonical path to start with one of the three roots
 *
 * Returns the canonical resolved path on success; throws on rejection.
 * The tool surface catches the throw and translates to a JSON-RPC error.
 *
 * Currently no MCP tool accepts a user-provided path directly (mk_get
 * takes IDs which match ID_PATTERN, mk_remember writes via memoryWrite
 * which constructs paths internally). This is defensive readiness for
 * v0.1.x tools that may add path-accepting surfaces.
 */
export function validatePath(p, { projectRoot, userDir }) {
  if (typeof p !== 'string' || p.length === 0) {
    throw new Error('validatePath: path must be a non-empty string');
  }
  // Reject URL-encoded traversal before path.resolve normalizes it.
  if (/%2e%2e/i.test(p) || /%2f/i.test(p)) {
    throw new Error('validatePath: URL-encoded traversal rejected');
  }
  const canonical = isAbsolute(p) ? resolvePath(p) : resolvePath(projectRoot, p);
  // Per CLAUDE.md "Shared modules" rule: derive every tier root from
  // tier-paths.mjs's resolveTierRoot rather than re-deriving inline.
  // The earlier draft constructed the user-tier root as
  // `resolvePath(userDir ?? homedir() + '/.claude-memory-kit')` —
  // which silently drifted from resolveTierRoot's posture (honoring
  // env vars + path normalization). Surfaced as Layer-5 checkpoint
  // finding L5-I1 (2026-05-28); fixed by going through the shared
  // helper for all three roots.
  const roots = [
    resolvePath(resolveTierRoot({ tier: 'P', projectRoot, userDir })),
    resolvePath(resolveTierRoot({ tier: 'L', projectRoot, userDir })),
    resolvePath(resolveTierRoot({ tier: 'U', projectRoot, userDir })),
  ];
  for (const root of roots) {
    if (canonical === root || canonical.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) {
      return canonical;
    }
  }
  throw new Error(`validatePath: path escapes kit roots: ${p}`);
}

// --- Tool handlers ----------------------------------------------------

function makeMkSearch({ db, semanticBackend }) {
  return async ({ query, mode, tier, since, limit, min_trust }) => {
    const r = search({
      db, query,
      mode: mode ?? SEARCH_MODES.KEYWORD,
      tier,
      since,
      limit,
      minTrust: min_trust,
      semanticBackend,
    });
    if (r.action === 'error') {
      return {
        content: [{ type: 'text', text: `error: ${r.errors.join('; ')}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(r.results, null, 2) }],
    };
  };
}

function makeMkGet({ db }) {
  return async ({ ids }) => {
    const stmt = db.prepare(`
      SELECT id, body, heading_path, source_file, source_line, tier, trust,
             write_source, created_at, superseded_by, deleted_at
      FROM observations WHERE id = ?
    `);
    const rows = ids.map((id) => {
      if (!ID_PATTERN.test(id)) {
        return { id, error: 'invalid id format' };
      }
      const row = stmt.get(id);
      if (!row) return { id, error: 'not found' };
      return row;
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
    };
  };
}

function makeMkTimeline({ db }) {
  // Sequential context around an anchor ID or timestamp. v0.1.0 keeps
  // the implementation deliberately narrow: anchor by ID; return the
  // N observations before + N after by created_at order.
  return async ({ anchor, depth_before, depth_after }) => {
    const before = depth_before ?? 5;
    const after = depth_after ?? 5;
    if (!ID_PATTERN.test(anchor)) {
      return {
        content: [{ type: 'text', text: 'error: anchor must be a valid kit ID' }],
        isError: true,
      };
    }
    const anchorRow = db
      .prepare('SELECT created_at, tier FROM observations WHERE id = ?')
      .get(anchor);
    if (!anchorRow) {
      return {
        content: [{ type: 'text', text: 'error: anchor not found' }],
        isError: true,
      };
    }
    // M2: id tiebreaker on observations with identical created_at —
    // without it, observations created the same millisecond fall out
    // of the timeline non-deterministically. Same fix in afterRows.
    const beforeRows = db
      .prepare(`
        SELECT id, body, source_file, source_line, tier, trust, created_at
        FROM observations
        WHERE created_at < ? AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC LIMIT ?
      `)
      .all(anchorRow.created_at, before);
    const anchorFull = db
      .prepare(`
        SELECT id, body, source_file, source_line, tier, trust, created_at
        FROM observations WHERE id = ?
      `)
      .get(anchor);
    const afterRows = db
      .prepare(`
        SELECT id, body, source_file, source_line, tier, trust, created_at
        FROM observations
        WHERE created_at > ? AND deleted_at IS NULL
        ORDER BY created_at ASC, id ASC LIMIT ?
      `)
      .all(anchorRow.created_at, after);
    const timeline = [...beforeRows.reverse(), anchorFull, ...afterRows];
    return {
      content: [{ type: 'text', text: JSON.stringify(timeline, null, 2) }],
    };
  };
}

function makeMkCite() {
  // Pure formatting — no DB query needed. The canonical citation link
  // form is documented in design §10's tool table:
  //   `[#P-S79MJHFN](memkit://obs/P-S79MJHFN)`
  return async ({ id }) => {
    if (!ID_PATTERN.test(id)) {
      return {
        content: [{ type: 'text', text: 'error: id must match ID_PATTERN' }],
        isError: true,
      };
    }
    const link = `[#${id}](memkit://obs/${id})`;
    return {
      content: [{ type: 'text', text: link }],
    };
  };
}

function makeMkRemember({ projectRoot, userDir }) {
  return async ({ text, tier, cites }) => {
    // I1 + I2 boundary checks (Task 31 code-review):
    // - cites: memory-write doesn't currently wire cites → provenance.
    //   Silently dropping the array would tell the model "your citation
    //   was recorded" — false. Reject with "not yet supported" until
    //   memoryWrite gains a cites parameter (v0.1.x).
    // - tier 'U': the kit's user-tier templates (USER.md / HABITS.md /
    //   LESSONS.md) don't have MEMORY.md + 'Active Threads' section,
    //   so memoryWrite would fail with NOT_FOUND. v0.1.0 mk_remember
    //   only writes to project-tier MEMORY.md. (v0.1.x: parameterize
    //   scratchpad routing per tier.)
    if (Array.isArray(cites) && cites.length > 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'error: cites parameter not yet supported by mk_remember (v0.1.x — see design §16.x). Submit the text without cites for now.',
          },
        ],
        isError: true,
      };
    }
    if (tier === 'U' || tier === 'L') {
      return {
        content: [
          {
            type: 'text',
            text: `error: mk_remember in v0.1.0 only writes to tier 'P' (project). tier '${tier}' will be supported in v0.1.x when scratchpad routing is parameterized.`,
          },
        ],
        isError: true,
      };
    }
    const r = memoryWrite({
      action: 'add',
      text,
      tier: 'P',
      scratchpad: 'MEMORY.md',
      section: 'Active Threads',
      source: 'user-explicit', // mk_remember IS the user-explicit MCP write surface
      sessionId: 'mcp-server',
      projectRoot,
      userDir,
    });
    if (r.action === 'error') {
      return {
        content: [
          { type: 'text', text: `error (${r.errorCategory ?? 'unknown'}): ${(r.errors ?? []).join('; ')}` },
        ],
        isError: true,
      };
    }
    // B1 (Task 31 code-review): memoryWrite has THREE outcomes — appended,
    // queued (to queues/conflicts.md), or supersede/append (the v0.1.0
    // fallthrough path). Don't report `accepted: true` when the write
    // was actually queued for human review — the model would treat that
    // as "fact saved" while in fact `cmk queue conflicts` is required
    // to land the bullet. Same composition class as the Task 25 → 25b
    // mergeScratchpadBullets lesson in CLAUDE.md.
    if (r.action === 'queued') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                accepted: false,
                status: 'queued',
                awaiting_review: true,
                queue: 'conflicts',
                id: r.id,
                queued_to: r.path,
                hint: 'Run `cmk queue conflicts` to resolve the conflict; the bullet is not yet in MEMORY.md.',
              },
              null,
              2,
            ),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { id: r.id, written_to: r.path, accepted: true, action: r.action },
            null,
            2,
          ),
        },
      ],
    };
  };
}

function makeMkRecentActivity({ db }) {
  const WINDOWS = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  };
  return async ({ window, limit }) => {
    const w = window ?? '24h';
    if (!WINDOWS[w]) {
      return {
        content: [{ type: 'text', text: 'error: window must be 1h|24h|7d' }],
        isError: true,
      };
    }
    const lim = limit ?? 20;
    const cutoff = Date.now() - WINDOWS[w];
    const rows = db
      .prepare(`
        SELECT id, body, source_file, source_line, tier, trust, created_at
        FROM observations
        WHERE created_at >= ? AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT ?
      `)
      .all(cutoff, lim);
    return {
      content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
    };
  };
}

// --- Server build + run ----------------------------------------------

/**
 * Build the kit's MCP server. Caller passes context (projectRoot, userDir,
 * db handle, optional semanticBackend). Returns the McpServer instance
 * ready for `.connect(transport)`.
 *
 * Tests can build the server + invoke tool callbacks directly without
 * spinning up the stdio transport.
 */
export function buildMcpServer({ projectRoot, userDir, db, semanticBackend }) {
  const server = new McpServer({
    name: 'cmk',
    version: '0.1.0',
  });

  // mk_search
  server.registerTool(
    'mk_search',
    {
      description: 'Search kit memory (FTS5 keyword by default; semantic + hybrid require Layer 5b memsearch install).',
      inputSchema: {
        query: z.string().min(1).describe('search query'),
        mode: z.enum(['keyword', 'semantic', 'hybrid']).optional(),
        tier: z.enum(['U', 'P', 'L']).optional(),
        since: z.string().optional().describe('ISO 8601 timestamp'),
        limit: z.number().int().positive().max(1000).optional(),
        min_trust: z.enum(['low', 'medium', 'high']).optional(),
      },
    },
    makeMkSearch({ db, semanticBackend }),
  );

  // mk_get
  // M1: bounded `.max(100)` to prevent soft-DoS via a 100k-id request
  // opening 100k prepared statements + writing 100k JSON-encoded rows.
  server.registerTool(
    'mk_get',
    {
      description: 'Fetch full observation bodies + provenance + relations by ID.',
      inputSchema: {
        ids: z.array(z.string()).min(1).max(100).describe('kit observation IDs (max 100)'),
      },
    },
    makeMkGet({ db }),
  );

  // mk_timeline
  server.registerTool(
    'mk_timeline',
    {
      description: 'Sequential context around an anchor observation — N observations before + N after by created_at.',
      inputSchema: {
        anchor: z.string().describe('kit observation ID'),
        depth_before: z.number().int().nonnegative().max(50).optional(),
        depth_after: z.number().int().nonnegative().max(50).optional(),
      },
    },
    makeMkTimeline({ db }),
  );

  // mk_cite
  server.registerTool(
    'mk_cite',
    {
      description: 'Render a canonical Markdown citation link for a kit observation.',
      inputSchema: {
        id: z.string().describe('kit observation ID'),
      },
    },
    makeMkCite(),
  );

  // mk_remember
  // M1: bounded `.max(5000)` on text — a 10MB body would burn Poison_Guard
  // regex time + index-fts size. 5000 chars matches the kit's per-bullet
  // soft cap (design §2.1).
  server.registerTool(
    'mk_remember',
    {
      description: 'Explicit user-driven save to kit memory with audit trail.',
      inputSchema: {
        text: z.string().min(1).max(5000).describe('the fact text (max 5000 chars)'),
        tier: z.enum(['U', 'P', 'L']).optional(),
        cites: z.array(z.string()).optional(),
      },
    },
    makeMkRemember({ projectRoot, userDir }),
  );

  // mk_recent_activity
  server.registerTool(
    'mk_recent_activity',
    {
      description: 'List recent observation changes within a time window.',
      inputSchema: {
        window: z.enum(['1h', '24h', '7d']).optional(),
        limit: z.number().int().positive().max(1000).optional(),
      },
    },
    makeMkRecentActivity({ db }),
  );

  return server;
}

/**
 * Run the kit's MCP server over stdio (the production CLI path).
 *
 * Per design §10.1: stdout is reserved for JSON-RPC messages; ALL logs
 * to stderr. The SDK's StdioServerTransport handles the stdout/stdin
 * pipe — our concern is making sure we don't pollute stdout via
 * console.log() anywhere in the tool callbacks. console.error() (which
 * writes to stderr) is fine.
 *
 * Caller (`cmk mcp serve` subcommand) provides projectRoot + userDir.
 * We open the index DB read-only-ish (better-sqlite3 doesn't expose
 * a read-only flag mid-life; WAL + multi-connection makes this safe).
 */
export async function runMcpServer({ projectRoot, userDir, db: dbOverride, semanticBackend } = {}) {
  const db = dbOverride ?? openIndexDb({ projectRoot });
  const server = buildMcpServer({ projectRoot, userDir, db, semanticBackend });
  const transport = new StdioServerTransport();

  // I4 (Task 31 code-review): graceful shutdown. Without this, the
  // server holds the DB handle until the process is hard-killed —
  // problematic on Windows where Node's process-exit doesn't flush
  // SQLite WAL files synchronously. The kit's tests force `kill()`
  // which doesn't exercise this path, but production Claude Code
  // will simply close stdin when the session ends; we want to honor
  // that as the "shut down cleanly" signal.
  const closeOnce = (() => {
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      try {
        db.close();
      } catch (err) {
        // Best-effort — log to stderr (stdout reserved for JSON-RPC).
        process.stderr.write(
          `cmk-mcp-server: db.close() failed: ${err?.message ?? err}\n`,
        );
      }
    };
  })();

  // stdin close from Claude Code → graceful shutdown.
  process.stdin.on('end', closeOnce);
  process.stdin.on('close', closeOnce);
  // SIGINT / SIGTERM — the user interrupted from the terminal OR the
  // OS asked for a clean exit. Honor it.
  process.once('SIGINT', () => {
    closeOnce();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    closeOnce();
    process.exit(0);
  });

  await server.connect(transport);
  // The server now runs until stdin closes (Claude Code disconnects).
  // Return the handle so callers in tests can close cleanly.
  return { server, transport, db, close: closeOnce };
}
