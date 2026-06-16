---
date: 2026-06-16
topic: Index-uniqueness root cause for the `reindex --full` UNIQUE-constraint crash (Bug 1) — how the cross-project analogs key their retrieval store (by id vs by file), and why the kit's file-scoped DELETE is the bug
source: Full cross-project pass for the fix. (1) Re-read the kit's own research base (claude-mem, claude-remember code dive, project-memory, TencentDB code dive); (2) fresh clone-and-read of FOUR analogs' storage/index code at the SQL-statement level — TencentDB-Agent-Memory, **basic-memory** (the closest design twin: markdown files = truth, SQLite = derived index), claude-memory-compiler, obsidian-index-service, sqlite-memory, memsearch; (3) wiki article read — **memweave** ("Zero-Infra AI Agent Memory with Markdown and SQLite", a third markdown+SQLite+sqlite-vec twin); (4) a web pass on the SQLite-canonical mechanism. Three independent primary sources (TencentDB / basic-memory / memweave) + the SQLite docs converge on the same principle.
tags: [bug1, reindex, index, sqlite, fts5, unique-constraint, dedup, upsert, dual-write, scratchpad, granular-archive, tencentdb, basic-memory, memweave, claude-mem, claude-remember, project-memory, v0.3.3, code-dive]
---

# Bug 1 root cause — id-keyed vs file-keyed retrieval store

> **Why this note.** v0.3.2 shipped, then `cmk reindex --full` was found to crash `UNIQUE constraint failed: observations.id` on the kit's own corpus. Before picking a fix I checked what the projects we researched actually do at the storage layer — clone-and-read, not recall. The answer reframes the fix and is worth recording so a future session doesn't re-derive it.

## The crash (reproduced, deterministic)

`reindexFull` / `reindexBoot` both call `replaceObservationsForFile(db, {source, observations, ...})` ([index-rebuild.mjs](../../packages/cli/src/index-rebuild.mjs)), which does:

```js
db.prepare('DELETE FROM observations WHERE source_file = ?').run(source_file);  // file-scoped
for (const obs of observations) insert.run(obs);                                // PK is `id`
```

The kit's `cmk remember` **dual-writes** a fact: a bullet in `context/MEMORY.md` "Active Threads" AND a granular `context/memory/<type>_*.md` archive file. **Both carry the same content-addressed id** (e.g. `P-TLTURYF7`). But `observations.id` is a global `PRIMARY KEY` ([index-db.mjs:62](../../packages/cli/src/index-db.mjs)). So:

1. reindex processes `MEMORY.md` → DELETE rows where `source_file='context/MEMORY.md'` → INSERT `P-TLTURYF7` ✓
2. reindex processes the granular file → DELETE only touches `source_file='context/memory/…'` (a *different* path, no rows) → INSERT `P-TLTURYF7` → **UNIQUE constraint failed: observations.id** 💥

Reproduced against the real repo corpus: 4 colliding ids (`P-TLTURYF7`, `P-ZVQEMWJA`, `P-F94ZJMYV`, `P-7Q5U4XTK`) — each a live Active-Thread bullet that also has a granular archive file.

**The DELETE is scoped by the wrong key.** Uniqueness is on `id`; the delete is by `source_file`. File-as-unit delete cannot clear an id owned by a *different* file.

## Why this is the kit's own problem (the cross-project check)

None of the predecessors hit this — and the reason is instructive:

| Project | Storage model | Has scratchpad? | Has granular per-fact id archive? | Same id in 2 indexed sources? |
| --- | --- | --- | --- | --- |
| **claude-remember** (code dive 2026-05-25) | rolling window only: `now → today → recent → archive`, no ids, no index | yes | **no** | impossible (compression MOVES the fact; truncates `now.md`) |
| **project-memory** (the user's predecessor) | 4 flat append-only markdown files, no ids, no index | no | no | impossible |
| **claude-mem** | opaque SQLite, `id INTEGER PRIMARY KEY AUTOINCREMENT`, no markdown truth | no | n/a | impossible (no markdown source files at all) |
| **TencentDB-Agent-Memory** (code dive) | JSONL shards = truth, SQLite/vec = rebuildable index, **id-keyed** | no separate hot scratchpad | yes (records) | **avoided by design** — see below |
| **claude-memory-kit** | markdown truth (ADR-0002) + rolling-window scratchpad (from claude-remember) + granular per-fact id archive (ADR-0009) | **yes** | **yes** | **YES — the bug** |

The kit is the only one that combined **(a)** claude-remember's hot rolling-window scratchpad with **(b)** a granular per-fact archive carrying a stable content-addressed id. A fact therefore legitimately exists in two indexed source files at once. Neither predecessor had both, so neither faced the uniqueness collision.

## How the analogs avoid it — three independent primary sources, one principle

I read the storage/index code (not my notes) of every analog with our architecture. Three converge on the SAME rule from different angles: **identity is keyed on the record id / content, never on the enclosing file.**

### 1. TencentDB-Agent-Memory — id-keyed upsert (append-shards = truth, SQLite/vec = index)

Cloned fresh; read `src/core/store/sqlite.ts`. Its retrieval store is **id-keyed end to end**:

- **Metadata**: `record_id TEXT PRIMARY KEY` + `INSERT … ON CONFLICT(record_id) DO UPDATE` — a true upsert **by id** (sqlite.ts:562, 604-610).
- **Vector**: `// vec0 does NOT support ON CONFLICT, so upsert = delete + insert` → `DELETE FROM l1_vec WHERE record_id = ?` then insert — **by id** (sqlite.ts:19, 623-624, 1047).
- **FTS**: `DELETE FROM l1_fts WHERE record_id = ?` then insert — **by id** (sqlite.ts:794).
- Public write entry: `upsertL1(record)` (sqlite.ts:998) — takes ONE record, upserts by id. There is **no "delete all rows for a source file, then re-insert"** primitive; the id is the unit of replacement, not the file.

### 2. basic-memory — the closest design twin (markdown files = truth, SQLite = rebuildable index)

This is the most directly comparable project we've researched: notes are markdown files, the DB is a derived index, and it has fought *exactly* this uniqueness problem. Read `src/basic_memory/sync/sync_service.py` + `services/entity_service.py` + the alembic migrations:

- The stable id is the **permalink**, `UNIQUE` (`uix_entity_permalink`). They hit collisions and made the constraint **partial** — migration `502b60eaa905` ("remove required from entity.permalink") rebuilds it as `sqlite_where: content_type='text/markdown' AND permalink IS NOT NULL`. A uniqueness key that can't be global gets a *conditional* unique index, not a crash.
- **`resolve_permalink(path, markdown)`** (entity_service.py:150) is explicit collision disambiguation. Docstring priority rule **2: "If markdown has permalink but it's used by another file → make unique."** It calls `get_file_path_for_permalink(desired)` ("is this id already owned by a *different* file?") and disambiguates before the write — the collision never reaches the unique index.
- The search index is cleared **by the stable id, not the file**: `delete_by_permalink(permalink)` AND `delete_by_entity_id(entity.id)` (sync_service.py:1308, 1310). File path is only the *addressing* (`get_by_file_path`); the index delete is id-scoped.

basic-memory's answer to "same id, two files" is **one file per id, disambiguate at resolve-time** — the dual to TencentDB's "one row per id, upsert."

### 3. memweave — content-hash keyed (markdown + SQLite + sqlite-vec, "no vector DB")

Wiki article + repo. Same files-are-truth / DB-is-derived-cache split as us, keyed on **SHA-256 of chunk content**: `embedding_cache - hash → vector`, `files - SHA-256 change detection`. Re-index is hash-keyed: "if a file is re-indexed and 90% of its chunks are unchanged, only the changed chunks trigger an API call; the rest are served from cache." The unit of identity is the **content hash, not the file** — the same chunk text in two files resolves to the same cache entry, so a repeat never collides. **Two layers:** file-SHA for change-detection, content-hash for identity/dedup.

### The SQLite-canonical mechanism (web pass)

The SQLite docs + tutorials confirm the textbook answer matches the code: a `UNIQUE`/`PRIMARY KEY` collision is resolved with **UPSERT (`INSERT … ON CONFLICT(<key>) DO UPDATE`)** or `INSERT OR IGNORE` / `INSERT OR REPLACE` — keyed on the uniqueness column. There is no exotic pattern; the fix the analogs use *is* the standard one.

### The validated principle (3 sources agree)

When the index's uniqueness key is the record id (or content hash), every write path must clear-and-replace **by that key**, never by an enclosing container (file/shard/scene). The kit violates this: it replaces by `source_file` while the PK is `id`. TencentDB resolves by upserting the id; basic-memory by disambiguating the id at resolve-time (+ partial unique index); memweave by hash-keyed dedup. All three keep **one logical row per id** and none uses a composite `(id, file)` key.

## Fix direction (validated, for v0.3.3)

The cross-project-validated move is to make the index **id-keyed at the write boundary**, matching the PK. Two compatible shapes, both eliminate the crash; the choice is about what the surviving row's *provenance* should point at:

1. **Upsert by id with deterministic precedence (recommended).** Replace `INSERT` with an id-keyed upsert (`INSERT … ON CONFLICT(id) DO UPDATE` / `INSERT OR REPLACE`), and order/guard the write so the **granular archive row wins** over the scratchpad bullet (archive = the canonical, full Why/How home). One id → one row → archive provenance, regardless of walk order. This is exactly TencentDB's `ON CONFLICT(record_id) DO UPDATE` shape, plus a precedence rule the kit needs because (unlike TencentDB) the kit has two source files producing the same id.

2. **Skip the scratchpad observation when a granular file owns the id (cross-source dedup pass).** Treat `context/memory/*.md` as canonical and don't emit an observation for a `MEMORY.md` bullet whose id already has an archive file. Cleanest semantically (the scratchpad is a *view*, not an independent source), but requires the parse to become cross-source-aware (today it's per-file-independent).

**Not recommended:** composite PK `(id, source_file)` — it makes `cmk search` return the same fact twice (one hit per source file), which hurts recall and pushes a dedup into every reader. **None of the three analogs does this** — TencentDB upserts one row per id, basic-memory keeps one file per id (partial unique index + resolve-time disambiguation), memweave keys on one content-hash. A composite key is the one shape the primary sources unanimously avoid. `INSERT OR IGNORE` (first-walk wins) is also rejected: provenance becomes nondeterministic (scratchpad vs archive depending on walk order).

The recommendation (#1) keeps the schema, matches TencentDB's id-keyed upsert directly, and adds the one thing TencentDB didn't need — archive-beats-scratchpad precedence — because of the kit's dual-write (the same need basic-memory meets with its `resolve_permalink` priority rules). Filed against Bug 1 in the v0.3.3 lane (fact `P-UCG4RKNL`).

## Net

The `reindex --full` crash is a **file-keyed delete against an id-keyed uniqueness constraint** — surfaced now because v0.3.x dogfooding produced 4 facts that live in both the hot scratchpad and the granular archive simultaneously. The kit is the only researched system that combined a rolling-window scratchpad with a stable-id per-fact archive, so the collision is its own. But the *fix* is not novel: three independent markdown-first analogs (TencentDB id-keyed upsert, basic-memory partial-unique-index + resolve-time disambiguation, memweave content-hash dedup) plus the SQLite docs all converge on one rule — **key replacement on the id/content, keep one logical row per id, never a composite `(id, file)` key.** The kit's fix is the id-keyed upsert with archive-beats-scratchpad precedence.

## Reference

- Crash repro: `reindexFull({projectRoot: <this repo>})` against the live corpus → `UNIQUE constraint failed: observations.id` (4 colliding ids, each a live Active-Thread bullet with a granular archive file).
- Primary source 1 — **TencentDB** (id-keyed upsert): <https://github.com/TencentCloud/TencentDB-Agent-Memory> `src/core/store/sqlite.ts` (meta `ON CONFLICT(record_id) DO UPDATE` :604-610; vec delete-then-insert by record_id :623-624,1047; fts delete by record_id :794; `upsertL1(record)` :998).
- Primary source 2 — **basic-memory** (closest design twin; partial unique index + resolve-time disambiguation): <https://github.com/basicmachines-co/basic-memory> `src/basic_memory/services/entity_service.py` `resolve_permalink` :150 (priority rule 2 "used by another file → make unique"); `sync/sync_service.py` :1308-1310 (`delete_by_permalink` / `delete_by_entity_id`); alembic `502b60eaa905` (partial `uix_entity_permalink`, `sqlite_where content_type='text/markdown' AND permalink IS NOT NULL`).
- Primary source 3 — **memweave** (markdown+SQLite+sqlite-vec, content-hash keyed): <https://github.com/sachinsharma9780/memweave> (SHA-256 chunk-hash identity + `files` SHA change-detection; "rebuild from files; cache by hash").
- Web pass — SQLite UPSERT/ON CONFLICT as the canonical collision mechanism: <https://www.sqlitetutorial.net/sqlite-unique-constraint/>, <https://sqlite.org/forum/info/5e249867c3ed37ce>.
- Relates: [2026-06-15-tencentdb-agent-memory-code-dive.md](2026-06-15-tencentdb-agent-memory-code-dive.md) (dual-write-truth-vs-index split, line 34), [2026-05-25-claude-remember-code-dive.md](2026-05-25-claude-remember-code-dive.md) (rolling window has no granular id archive), [2026-05-21-claude-mem-architecture.md](2026-05-21-claude-mem-architecture.md) (opaque autoincrement, no markdown source), [2026-06-15-project-memory-skill-predecessor.md](2026-06-15-project-memory-skill-predecessor.md) (flat files, no ids), ADR-0002 (markdown-is-truth + rebuildable index), ADR-0009 (per-observation provenance + ids). Bug tracked in fact `P-UCG4RKNL`, v0.3.3 lane.
