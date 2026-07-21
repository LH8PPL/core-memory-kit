# Repo read: Graphify-Labs/graphify

**Date:** 2026-07-21 · **Source:** https://github.com/Graphify-Labs/graphify (cloned `--depth 50` to `C:/Projects/research-clones/graphify`, HEAD `abff1b1` 2026-07-20)

## What it claims

README: "Type `/graphify` in your AI coding assistant and it maps your entire
project (code, docs, PDFs, images, videos) into a **knowledge graph** you can
**query instead of grepping**." Sells itself explicitly as "Not a vector
index. No embeddings, no vector store: a real graph you traverse." Every edge
is tagged `EXTRACTED` (explicit in source) or `INFERRED` (resolved by
graphify). Also ships a "work memory" feature (`graphify save-result` /
`graphify reflect`) and markets itself in `BENCHMARKS.md` as a **conversational
long-term memory competitor**, claiming LOCOMO recall@10 0.497 (vs mem0
0.048, BM25 0.362), LOCOMO QA accuracy 45.3%, LongMemEval-S 76% "tied for
best with dense RAG," all at "zero LLM credits to build the graph."

## What the evidence actually shows

**Repo facts:** Python, MIT license (Safi Shamsi — public repo byline), 51,663
LOC under `graphify/` (46 modules), 92,588 stars / 9,000 forks / 589 open
issues (`gh api`), created 2026-04-03, last push 2026-07-20, YC S26 badge in
README. CI present: `.github/workflows/ci.yml`, `publish.yml`,
`release-graph.yml`. `CHANGELOG.md` is 328 KB — hundreds of numbered bugfix
entries (`#1749`, `#1917`, `#2032`, etc.) cross-referenced directly in code
comments, evidence of a large, actively-maintained user base finding real
edge cases, not a vibe-coded demo.

**The graph is real, code-verified — this is the load-bearing finding.**
Unlike the flagships in the 2026-07-19 graph-memory code sweep (mem0:
score-boost only; MemOS: relational path commented out; Letta: no graph at
all — per ADR-0023), graphify ships an actual persisted, traversed graph:

- `graphify/build.py` (`build_from_json`, 1299 lines) assembles a
  `networkx.DiGraph`/`Graph` from extractor output, with real node/edge
  identity resolution: cross-file ghost-node merging keyed on `(basename,
  label)` with AST nodes as canonical, a normalized-id alias index for
  legacy/LLM-drifted ids, deterministic sorted-iteration to avoid
  hash-order nondeterminism, and a `build_merge` incremental-update path
  (replace-per-changed-file, prune-per-deleted-file) that persists back to
  `graphify-out/graph.json` in NetworkX node-link JSON.
- `graphify/serve.py` (1879 lines) is a real MCP stdio server exposing
  `shortest_path` (verified: `nx.shortest_path(G.to_undirected(...), src,
  tgt)` at line 1380), `get_neighbors`, `get_community`, `god_nodes`,
  `query_graph` (BFS/DFS bounded-depth subgraph extraction at
  `_bfs`/`_dfs`, lines 740/770), `graph_stats`. This is genuine graph
  traversal, not a vector-similarity call dressed as "graph."
- `graphify/analyze.py` (741 lines) runs real graph algorithms:
  `nx.edge_betweenness_centrality`, `nx.betweenness_centrality(G, k=k,
  seed=42)` for "surprising connections," `nx.simple_cycles` for import-cycle
  detection.
- `graphify/cluster.py` does community detection (Louvain/Leiden, per
  build.py comments about "modularity arithmetic" and "graspologic's
  Leiden").

**Answering the task's central question directly: yes, graphify is
different from the ADR-0023 corpus — it is a persisted, traversed graph
store in code, verified by reading `build.py`/`serve.py`/`analyze.py`
directly, not by trusting the README.**

**But it is a CODE/document knowledge graph, not a conversational-memory
graph — a different domain than what ADR-0023 evaluated.** The nodes are
functions/classes/files/concepts extracted via tree-sitter AST (deterministic,
zero-LLM per `ARCHITECTURE.md`'s pipeline
`detect→extract→build→cluster→analyze→report→export`) plus an LLM semantic
pass for docs/PDFs/images. There is no bi-temporal fact store, no
scratchpad/fact-file tier, no session-boundary concept — it graphs a
*codebase snapshot*, rebuilt on git commit/checkout hooks
(`graphify/hooks.py`: real git post-commit/post-checkout hook installer with
a multi-probe Python-interpreter detection shim, not a stub).

**The "work memory" feature (`reflect.py`, 882 lines) is the piece
genuinely adjacent to conversational/session memory**, and it is a
real, deterministic, well-engineered consolidation pass — worth reading in
detail (see Mechanism below). It is NOT a graph feature: it reads flat
markdown Q&A docs (`graphify save-result` writes them), scores cited graph
nodes, and writes a single `LESSONS.md` artifact. No LLM in the loop.

**The LOCOMO/LongMemEval benchmark numbers in `BENCHMARKS.md` are NOT
reproducible from this repo's code — verified gap.** `graphify/benchmark.py`
(the only benchmark code shipped) is a "token-reduction" measure — corpus
size vs subgraph token count for a query — unrelated to LOCOMO/LongMemEval.
No `mem0`/`supermemory` adapter code, no LOCOMO dataset loader, no grading
harness exists anywhere in the cloned tree (checked `worked/`, `tools/`,
`tests/`, root). The harness BENCHMARKS.md describes ("graphify's own
harness... mem0 and supermemory run self-hosted as adapters") is not in this
repo. **Treat the memory-benchmark numbers as an unverified vendor claim**,
not a code-verified fact — the reverse of the graph-traversal claim above,
which IS code-verified.

## Mechanism detail

**1. Extraction → graph build (deterministic code path):**
```
detect.collect_files(root) -> [Path]
extract.extract(path) -> {nodes:[{id,label,source_file,source_location}],
                           edges:[{source,target,relation,confidence}]}
build.build_from_json(extraction) -> nx.DiGraph   # id-resolution + dedup inline
cluster.cluster(G) -> G with community attr
analyze.analyze(G) -> {god_nodes, surprises, questions}
export.export(G,...) -> graph.json / graph.html / Obsidian vault
```
Every edge carries `confidence: EXTRACTED|INFERRED`, enforced by
`graphify/validate.py` before `build_graph()` will consume it.

**2. Entity dedup — three-stage, deterministic-floor-then-LLM-residue
(`graphify/dedup.py`, 669 lines) — the closest structural parallel to
design.md §21.2's three-stage pass in this codebase:**
```
pass 1: exact normalization (casefold, NFKC, strip non-alnum) + Shannon-entropy
        gate (drops low-entropy labels like "a"/"get" from fuzzy matching)
pass 2: MinHash/LSH blocking (num_perm=128, k=3 shingles) to avoid O(n^2),
        then Jaro-Winkler verification (rapidfuzz) with guards:
          - _is_variant_pair(): blocks SKU/model-suffix pairs (M1 vs M1 Pro)
          - _short_label_blocked(): blocks short-string prefix-bonus false
            positives unless same-length single-char substitution
          - _crossfile_fileanchored_blocked(): blocks cross-file merges of
            file-scoped definitions
        union-find merge on survivors
pass 3 (opt-in, dedup_llm_backend param): LLM tiebreaker ONLY for pairs in
        the [_LOW, _HIGH) ambiguous JW score band, batched per run, never
        per-item; decisively-distinct pairs never reach the LLM (#1284)
```
This is functionally the same architecture as design.md §21.2's
"deterministic floor... nothing the floor can decide reaches the LLM... ONE
batched LLM call" — an independent production implementation validating the
same shape, with concrete guard patterns (entropy gate, variant-suffix
blocking, cross-file blocking) the kit's design doesn't yet have named
equivalents for.

**3. Work-memory consolidation (`graphify/reflect.py`) — closest parallel to
Task 95's re-curation:**
```
graphify save-result --question Q --answer A --nodes N1 N2 --outcome
    useful|dead_end|corrected
  -> writes graphify-out/memory/<slug>.md (hand-rolled YAML frontmatter,
     no PyYAML dep)

graphify reflect
  -> load_memory_docs(): parse every memory/*.md
  -> aggregate_lessons(docs, now, half_life_days=30, min_corroboration=2):
       for each doc: sign = +1 useful / -1 dead_end|corrected / 0 unmarked
       weight = 0.5 ** (age_days / half_life_days)   # _decay()
       node_score[node] += sign * weight             # _record_node()
     _finalize_sources(): split into
       preferred  (pos-only, pos >= min_corroboration)
       tentative  (pos-only, pos < min_corroboration)
       contested  (pos AND neg both present; verdict = sign of net score)
  -> render_lessons_md() -> graphify-out/reflections/LESSONS.md
```
Deterministic (explicit `now` param -> byte-stable output), no LLM anywhere
in the pass. Contradiction resolution ("contested") is decided by
**net decayed score**, not strictly event-time — a genuine design
difference from design.md §21.2's binding rule ("which-wins on a
contradiction is decided by EVENT-TIME, never by the LLM"): graphify's
approach lets an old-but-heavily-corroborated signal outweigh one fresh
negative, whereas the kit's rule is strict latest-wins regardless of
corroboration count. Also notable: a derived-annotation sidecar
(`.graphify_learning.json`, `LEARNING_SIDECAR_NAME`) is kept explicitly
separate from `graph.json` — "no learning_* fields are ever stamped into the
graph itself" — the same non-destructive-derivation instinct as design.md's
AUTO-op-class / archive-not-delete rule, independently arrived at.

**4. Auto-trigger path:** `graphify/hooks.py` installs git `post-commit` /
`post-checkout` hooks (POSIX shell, multi-probe Python-interpreter
detection to survive uv-tool/pipx/venv/PATH variance) that detach-launch an
incremental rebuild (`watch._rebuild_code`) on changed files. This is a
**git-event trigger**, not a session-boundary trigger — structurally
different from the kit's Stop-hook (session-end) or PreCompact (context-window)
triggers; graphify has no concept of a chat session at all.

## Relevance to core-memory-kit

**ADR-0023 (graph recall) — direct, load-bearing relevance.** The ADR's
central empirical claim ("the field's own 'graph memory' flagships
under-deliver in shipped code") gets ONE clean counter-example from this
read: graphify's graph is real and traversed. This does not overturn
ADR-0023's decision, because graphify solves a different problem
(codebase-structure graph, built by deterministic AST parsing) than what
ADR-0023 evaluated (conversational-fact graphs, built by LLM extraction from
chat). The kit's `edges(src,dst,type)` activation-slice plan (ADR-0023
decision #1: parse `related:`/`[[slug]]` at reindex, recursive CTE for
supersession chains) is closer in spirit to graphify's AST-extracted
`EXTRACTED`/`INFERRED` edges than to any LLM-derived-KG approach — both are
"parse what's already there, deterministic rebuild, confidence-labeled."
graphify's confidence-label convention (`EXTRACTED` vs `INFERRED`) is a
clean, adoptable naming pattern for the kit's own edge provenance if/when
Task 232 lands.

**Task 95 (dream re-curation, design.md §21) — strong relevance via
`reflect.py`, weaker via `dedup.py`.** `dedup.py`'s three-pass pipeline
independently validates design §21.2's "deterministic floor, then one
batched LLM call for the ambiguous residue" shape — see Mechanism §2 above.
`reflect.py`'s time-decayed corroboration scoring is a genuinely different
mechanism than the kit's planned event-time-wins rule (§21.2) — worth a
citation as a considered-and-diverged-from alternative in any future design
note, not a straight borrow, because the kit's binding rule is deliberately
LLM-free AND corroboration-free (never count recurrence, per §21.6's
anti-scope: "no LLM-counted recurrence"). graphify's `node_pos`/`node_neg`
Counter-based corroboration counting is exactly the pattern §21.6
pre-emptively rejects ("no LLM-counted recurrence") — though graphify counts
recurrence in deterministic code, not via an LLM, so it isn't the same
hazard the anti-scope line was written against.

**Tasks 233/161/203 (context-compaction/distillation) — weak relevance.**
graphify has no analogous rolling-window/compaction pipeline; its "memory"
artifact (`LESSONS.md`) is a flat aggregate rewritten in full each run, not
an incrementally-compressed rolling summary. `graphify/cache.py`'s
per-file content-hash extraction cache (skip unchanged files) is a mild
parallel to the kit's mtime/hash-based re-embedding-staleness pattern, but
it's a much shallower mechanism (skip re-extraction, not skip
re-consolidation).

## Borrow candidates

- **Confidence-label convention on edges** (`EXTRACTED` vs `INFERRED`,
  `graphify/build.py` edge attrs + `ARCHITECTURE.md` table) — cheap,
  legible pattern for the kit's own `related:`/derived-edge provenance if
  Task 232/ADR-0023's activation slice grows a second (inferred) edge
  source later.
- **Entropy-gate + variant-suffix + cross-file blocking guards in
  `dedup.py`** — concrete, battle-tested false-positive guards for any
  future fuzzy-match dedup pass in the kit's own floor stage (design §21.2),
  each with a real numbered-issue rationale in comments.
- **Non-destructive derived-sidecar pattern** (`.graphify_learning.json`
  kept separate from `graph.json`, "no learning_* fields ever stamped into
  the graph itself") — independent validation of the kit's own
  archive-not-delete / AUTO-class-is-non-destructive instinct (design
  §21.2's op-class split); useful as a second citation if that section ever
  needs one.
- **`_decay()`'s clean half-life implementation** (`0.5 ** (age_days /
  half_life_days)`, undated-signal-keeps-full-weight, future-date-clamped-to-0)
  — small, reusable formula shape if the kit ever wants an opt-in
  recency-weighting knob distinct from strict event-time-wins.

## Reject candidates

- **Score-based (corroboration + decay) contradiction resolution** — direct
  conflict with design §21.2's binding event-time-wins rule and §21.6's
  anti-scope ("no LLM-counted recurrence"); reject for the kit's dream
  re-curation engine specifically, though the underlying formula could still
  inform an unrelated, explicitly-opt-in feature.
- **The self-reported LOCOMO/LongMemEval benchmark numbers** — no
  reproducible harness in this repo (see Honest gaps); do not cite as
  evidence for or against any graph-vs-flat retrieval decision without
  independent verification.
- **The AST-graph-of-code model wholesale** — solves a different problem
  (structural code navigation) than the kit's target (durable-fact recall
  across chat sessions); not a competing "memory" architecture despite the
  marketing overlap, so it's not a rival design to weigh against the kit's
  own recall path.
- **Git-hook-triggered rebuild as a session-memory trigger analog** — the
  trigger event (git commit/checkout) has no session-boundary semantics;
  porting the trigger *shape* to the kit would require inventing a session
  concept graphify doesn't have, so it's not a direct pattern transfer.

## Honest gaps

- **Benchmark harness not in this repo** — `BENCHMARKS.md`'s LOCOMO/
  LongMemEval numbers reference a harness with mem0/supermemory adapters
  that does not exist anywhere in the cloned tree (`worked/`, `tools/`,
  `tests/`, root all checked); `graphify/benchmark.py` is a different,
  unrelated token-reduction measure. The claim "graphify says X" is
  recorded above; "X is true" is NOT — unverified.
- **Did not read the semantic/LLM extraction path in depth** — `llm.py`
  (2994 lines) and `extract.py` (5244 lines, the largest module) were
  inventoried by grep/structure only, not read function-by-function; the
  claim "code is parsed with tree-sitter AST: deterministic, no LLM" was
  checked at the architecture-doc + pipeline level, not verified line-by-line
  against every language extractor.
- **Did not read `export.py`, `watch.py`, `install.py`, `cli.py`,
  `symbol_resolution.py`, or the `skills/*` per-agent integration files** —
  these were seen in the directory listing / LOC count only.
- **No images viewed** — the README embeds `graph-hero.png` and a
  `demo-path.svg`; neither was rendered/inspected, only referenced by
  filename in the fetched markdown.
- **No links followed** — did not fetch graphify.com, the linked Gumroad
  book ("The Memory Layer"), the Discord, or any GitHub issue referenced by
  number in code comments (e.g. #1749, #1917) to check the underlying bug
  reports for extra context beyond what the fix comment states.
- **Did not run the tool** — no `graphify install` / `/graphify` /
  `graphify reflect` was executed against a real corpus; all findings are
  from static code reading, per the task's requested method, but this means
  no runtime behavior (e.g. actual LLM-tiebreaker output quality, actual
  MCP tool response shapes under a live client) was observed.
- **Star/fork/issue counts are a live snapshot** (2026-07-21 via `gh api`)
  and will drift; not re-verified against any historical baseline.
