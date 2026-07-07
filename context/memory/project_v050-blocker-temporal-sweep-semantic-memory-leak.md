---
id: P-5VJJUEES
type: project
shape: State
title: v050-blocker-temporal-sweep-semantic-memory-leak
created_at: 2026-07-07T14:44:57Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 12d2789f39bff69590558035e836b8ddee1f096c24b1456104f9fd38375d6c26
related: [9gb-node-hog-haiku-print-hang-machine-freeze]
---

CONFIRMED ROOT CAUSE of the 2026-07-07 machine freeze (8.8GB RAM, froze twice): a MEMORY LEAK in the SessionEnd/compaction path (`cmk-compress-session.mjs` → `runSessionEndTasks` → `temporalSweep`), triggered ONLY under semantic/hybrid mode. Mechanism: temporalSweep's semantic candidate-finder (temporal-sweep.mjs:261-282) calls `prepareSemanticBackend()` ONCE PER FACT (line 262), and prepareSemanticBackend calls `syncSemanticIndex()` on EVERY call (semantic-backend.mjs:290). Each syncSemanticIndex (1) loads ALL live observation bodies via `db.prepare(liveSql).all()` (line 179 — 1455 rows), (2) batch-embeds every UNCACHED body in ONE `extractor(toEmbed)` ONNX forward pass (line 217). Repro numbers: 1455 live facts, only 984 embedded → ~471 uncached bodies re-batch-embedded. The ONNX batch allocates large OFF-HEAP native buffers (that's why `--max-old-space-size=2048` did NOT stop it — RSS climbed to 5.5GB before I killed it; the leak is native, not V8 heap). REPRODUCED cleanly: `echo '{}' | CMK_PROJECT_DIR=<repo> node --max-old-space-size=2048 packages/cli/bin/cmk-compress-session.mjs` climbs unbounded on the 1455-fact repo; instant/clean on an empty repo (data-dependent). WHY NEW IN 0.5.0-context: never happened before because THIS repo never had semantic enabled until `cmk install --with-semantic` today (mode gate at temporal-sweep.mjs:243-244 — FTS projects skip the embedder finder entirely). The per-session temporalSweep wiring is Task 198 (D-266); the per-fact prepareSemanticBackend cost was flagged "KNOWN COST accepted for v0.4.5" (temporal-sweep.mjs:254-260) assuming N is small — but a fresh reindex leaves ~471 uncached AND the marker can make newFacts large, so N is NOT small. FIX DIRECTION: sync the semantic index ONCE before the sweep loop (not per-fact); embed the query only per fact against the already-synced vec table (the code comment at line 258-259 already names this: "embed the query directly against the already-synced vec table (skip the per-call sync)"). BLOCKS v0.5.0 tag.

**Why:** This froze the maintainer's machine twice during 0.5.0 gate-prep and is a hard blocker on the v0.5.0 tag. The root cause is a per-fact re-sync of the full semantic index in temporalSweep, only reachable in semantic/hybrid mode — which is exactly what the cut-gate + any --with-semantic user hits. Must be fixed before the gate runs (the gate itself fires SessionEnd).

**How to apply:** Fix: in temporal-sweep.mjs makeSemanticFinder, call prepareSemanticBackend/syncSemanticIndex ONCE outside the per-fact closure (sync the index up front), then per-fact only embed the query and search the already-synced vec table — do NOT re-run syncSemanticIndex per fact. Add a budget-pair test (at-cap/over-cap fact count) + a memory-bound assertion. Verify with the repro command against a large-fact repo. Then re-run the full cut-gate.
