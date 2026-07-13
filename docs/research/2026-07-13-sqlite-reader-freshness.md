---
date: 2026-07-13
topic: Long-lived SQLite reader vs external writers — the MCP-server index-freshness design (Task 218), with a 17-project field survey + SQLite primary sources
source: Deep research (sqlite.org isolation/WAL/pragma docs + better-sqlite3 issues + chokidar issues) + code-read of 17 memory/MCP projects (claude-mem, basic-memory, official MCP memory server, mem0, graphiti, …) + 3 empirical repros on the kit's own code
tags: [mcp, sqlite, wal, freshness, recall, task-218, D-329]
---

# SQLite reader-freshness for the MCP server (Task 218)

_The research + empirical repros that reframed Task 218. Drives the D-329 design._

## The headline (repro-corrected)

The original task/review framed this as "a long-lived MCP reader's WAL connection
doesn't see another process's commits." **Three empirical repros on the kit's own code
disproved every variant of that** and found the ACTUAL cause:

1. **`data_version` did NOT change (2→2)** after an external `cmk remember`, and a fresh
   `.all()` on the reader still returned 0.
2. **A BRAND-NEW connection** to the same db path ALSO returned 0 after the external
   write — so it's not a per-connection snapshot issue at all.
3. **The index db file was byte-identical (86016) before and after** the external
   `cmk remember` — the writer **never wrote to the shared index db**. It wrote the fact
   `.md` file; a subsequent `cmk search` subprocess found it (1 result) **because the CLI
   search path runs `reindexBoot` per call** (subcommands.mjs:1168).

**The real root cause:** indexing is **lazy/reader-driven**. `cmk remember` writes the fact
FILE; the index (`observations_fts`) is only refreshed when a READER runs `reindexBoot`
(the incremental mtime/sha1 diff). EVERY CLI read does this (`cmk search`/`get`/…). The MCP
server is the ONE reader that runs `reindexBoot` only at boot — so it never picks up ANY
post-boot write (external OR its own file-writes that don't go through its reindex path).
This is NOT a WAL/snapshot problem; it's a "the MCP reader skips the per-read refresh every
other reader does" problem.

## SQLite primary sources (still useful — for the design, not the diagnosis)

- **WAL isolation** ([sqlite.org/isolation.html](https://sqlite.org/isolation.html),
  [wal.html](https://sqlite.org/wal.html)): a read txn sees a frozen snapshot until it
  ends; a fresh autocommit statement sees committed data straight from the WAL (no
  checkpoint needed). So IF indexing were eager, a fresh `.all()` WOULD see it — confirming
  the diagnosis that the problem is upstream (nothing was written to the db).
- **`PRAGMA data_version`** ([pragma docs](https://sqlite.org/pragma.html#pragma_data_version)):
  changes on ANY OTHER connection's commit, never the current connection's; cross-process +
  WAL safe; microsecond in-memory read. Caveat (Medcalf): must be checked OUTSIDE a txn.
  **NOT usable as the trigger here** — the external writer doesn't commit to the db at all,
  so `data_version` stays put (repro #1 proved it). It would only work if writes were eager.

## The field survey (17 projects — the consensus)

**Almost nobody keeps a long-lived cross-process SQLite reader + a watcher.** Two dominant
patterns:

1. **Re-read / re-derive per request** — the official MCP memory server re-reads the whole
   file every tool call; basic-memory uses a fresh connection per request on Windows
   (NullPool); mempalace/memsearch rebuild-on-demand; **the kit's own CLI already does this**
   (per-call `reindexBoot`). Most common by count.
2. **Single-process DB ownership** — claude-mem: one daemon owns the ONLY connection; other
   processes enqueue into a `pending_messages` SQLite queue table, never a 2nd connection.

**Watchers (chokidar/watchfiles) are used ONLY as re-ingest triggers, always backstopped,
never trusted as the read-freshness guarantee** — basic-memory even self-restarts its
watcher periodically (a tacit admission they drift under load). This matches the kit's
observed chokidar-drops-under-full-suite-load failure ([chokidar #417](https://github.com/paulmillr/chokidar/issues/417);
`usePolling:true` is the costly mitigation). **Nobody polls `data_version`** — not because
it's wrong, but because they all chose an architecture that never needed it.

## The recommended design (evidence-based, reframed)

**Make the MCP reader do what every other kit reader already does: run the incremental
`reindexBoot` per query.** This is the pattern the field converges on (re-derive per
request) AND the kit's own established CLI behavior — not a novel mechanism.

- **Primary (correctness, load-immune):** before each `mk_search`/`mk_get`, call
  `reindexBoot({ projectRoot, userDir, db })` (incremental — mtime/sha1 diff, only re-parses
  CHANGED files; ~7ms with a change, near-0 when nothing changed since the `files` checkpoint
  table short-circuits). This is a SYNCHRONOUS inline refresh on the query path — structurally
  immune to the chokidar-under-load drop (no async event to lose). It's exactly what
  subcommands.mjs:1168 does for `cmk search`.
- **Optional proactive polish (NOT the correctness guarantee):** the chokidar watcher MAY
  stay to reindex during idle so even the first post-write query is 0ms — but it is
  belt-and-suspenders over the per-query refresh, never relied on alone. Given it drops under
  load AND the per-query refresh already guarantees correctness, the simplest correct ship is
  **per-query `reindexBoot`, drop the watcher** (or keep it purely as an idle optimization).

### Why this beats "watcher + data_version"
- `data_version` can't trigger here (writes don't hit the db until a reader reindexes —
  repro #1).
- The watcher alone fails under the user's always-busy-laptop load (observed 5/5).
- Per-query incremental `reindexBoot` is deterministic, load-immune, cheap, and already the
  kit's proven CLI pattern — the field's dominant "re-derive per request" answer.

### Gotchas
- Keep the incremental short-circuit honest: `reindexBoot`'s `files` mtime/sha1 checkpoint
  makes the no-change case cheap; verify it doesn't re-parse everything each call.
- The MCP server holds ONE connection across calls — running `reindexBoot` (which is a
  `db.transaction`) on it per query is fine (better-sqlite3 is synchronous, single-threaded).
- The test must write via a REAL external `cmk remember` and assert the running server's
  next `mk_search` finds it — with NO reliance on FS-event timing (the per-query refresh is
  synchronous, so the test is deterministic, killing the load-flake).

### Citations
sqlite.org [isolation](https://sqlite.org/isolation.html) · [wal](https://sqlite.org/wal.html) ·
[pragma data_version](https://sqlite.org/pragma.html#pragma_data_version) ·
better-sqlite3 [api.md](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) ·
chokidar [#417](https://github.com/paulmillr/chokidar/issues/417). Code-read prior art:
[claude-mem](https://github.com/thedotmack/claude-mem) (single-owner + queue table),
[basic-memory](https://github.com/basicmachines-co/basic-memory) (NullPool per-request +
self-restarting watcher), [official MCP memory server](https://github.com/modelcontextprotocol/servers)
(re-read per call). Kit code: subcommands.mjs:1168 (CLI per-call reindexBoot), index-rebuild.mjs
(reindexBoot incremental), the 3 repros this session.
