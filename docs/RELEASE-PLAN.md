# Release plan — task → version map

> **Single source of truth for WHICH version each task ships in.** When deciding "what version does task X go in?", this file answers it. `tasks.md` holds task DETAIL + checkbox state; this file holds the version LANE. Update it in the same batch whenever a task's target version changes.

## How we decide version (the rule — D-24)

Each **MINOR** version (0.X.0) ships exactly **ONE differentiator** — a "wow" a user can feel — then: build → live-test (`npm run live-verify` + a manual run) → publish → next. **PATCH** versions (0.2.X) are polish / fixes / follow-ups to the *current* wow, with **no** new differentiator. **Breadth** features (other agents, team features) are valuable but off the wow-path → a later minor.

The wows, in order (D-25 video-parity, D-26 the three wows):

- **v0.2.0 — THE WEDGE**: cross-project persona cold-open. Open Claude on a brand-new project and it already knows how you work.
- **v0.3.0 — RECALL + CONSISTENCY**: "what did we decide & why, weeks ago?" + Claude notices and reconciles when it contradicts itself (D-26 #2 + #3).
- **v0.4.0+ — BREADTH**: other coding agents, team/shared features.

---

## v0.2.0 — the wedge (cutting now)

The differentiator is the wedge; the rest are the quality fixes that make it *feel* right (D-25).

- [x] **86** — wedge multi-rule promote (concurrent SessionEnd + transcript classifier) — _shipped #107_
- [x] **87** — compression input = the conversation, not file-write logs — _shipped #108_
- [x] **84b** — supersede stale state across the 3 compression layers — _shipped #109_
- [x] **88** — compressor `--tools ''` sandbox flag — _shipped #110_
- [x] **name de-identification sweep** — _DONE 2026-06-04 (D-51): the maintainer's name → "the user"/"the maintainer", name-based run labels → "live-test" across 54 .md (537 repl.); the durable rule is in CLAUDE.md "Name privacy". (Code/scripts/tests were missed — extended in Task 122, 2026-06-09.)_
- [x] **91 — MEMORY.md graduation (write-lock safety valve)** — _shipped 2026-06-04, PR #113 (D-54/D-57). Transactional cap-pressure valve, project MEMORY.md only; generalized to all tiers by Task 94._
- [~] **94 — load-cap (not write-cap) + universal graduation** — _CORE shipped 2026-06-04, PR #114 (D-61/D-63): 94.1 load-cap (writes always succeed; no write-lock on any tier) + 94.2 all-tier graduation (persona graduates to `fragments/` — the D-60 persona-lock fix). The never-lose invariant is delivered. 94.3 (proactive SessionEnd graduation sweep) shipped 2026-06-05 (D-65); 94.4 (= Task 93 importance-aware inject) shipped 2026-06-05 (D-66). Remaining: 94.5 (live cold-open re-test — the user's outward action)._
- _**Friend-handoff reframe (D-61):** the v0.2.0 tag is a milestone (no write-lock anywhere, zero loss); the "good enough to give a friend" bar is the **v0.3 recall lane** finish (Task 75/84/80c), not the tag. The user (2026-06-04): "this is not a good product right now… I will continue to do all the tasks until we have everything this kit promises."_
- [ ] **manual live test** — the user's clean-slate run on a fresh project (pre-tag; the cut gate per D-24). _Guide ready: [`docs/process/cut-gate.md`](process/cut-gate.md). The automated half is green (`npm run live-test`, D-50); the manual run covers R1/R2 + the recall feel. **Unblocked now that Task 91 shipped — re-run fresh on a NEW artifact (rebuild the tarball); the write-lock is fixed so multi-session capture + cap-stability can pass.**_
- [x] **90 — `cmk install` allow-lists `Skill(memory-write)` (D-52)** — _shipped 2026-06-04._ The cut-gate live run caught that Task 69's skill-delivery reintroduced a "Use skill?" prompt that Task 79's bash allow-list didn't cover (composition gap); install now allow-lists the skill too, so explicit capture is friction-free. (+ drive-by fix of a pre-existing time-bomb test.)
- [x] **status audit DONE** (D-47) — flipped verified-done: **24, 34, 56, 76, 78**; closed obsolete **44**; confirmed OPEN: **67, 69, 41.4, 45.2, 47, 51** (+ 84 stays open: 84c deferred). Methodology: evidence per task, not memory.
- [x] **69 — skills-as-delivery / de-bloat CLAUDE.md (PULLED INTO v0.2.0; D-48 → implemented D-49)** — 5 sub-tasks shipped: 69.0 rewrote the stale+UNSAFE memory-write skill (was hand-editing MEMORY.md, bypassing Poison_Guard = F1 leak class — **security**; now `Bash(cmk remember *) Bash(cmk forget *) Read` least-privilege, MUST/NEVER gate) · 69.1 `cmk install` scaffolds `.claude/skills/` (route-equivalence) · 69.2 one source (`template/` canonical → `plugin/` mirror via `sync-plugin-skills.mjs`) + `validate-skill-sources.mjs` drift+safety guard · 69.3 slimmed the CLAUDE.md block to facts + a skill pointer · 69.4 tests (17 cases incl. "gate bites" negatives). _Shipped 2026-06-04, PR #111; 1394 suite green + live-verify PASS 2/2+2/2._

## v0.2.x — wedge polish (patch, no new differentiator)

**→ v0.2.3 — the cut-gate5 sweep findings (next patch; all in [`tasks.md`](../specs/tasks.md) §"v0.2.3").** Surfaced by the 2026-06-07 cut-gate5 live run + full CLI sweep. v0.2.2's ★ headline passed; these are the honesty/automation fixes the sweep + the user's "no code-word passes; a regular user expects everything automatic" push surfaced. Headline = **Task 108** (unify CLI+MCP over one core + resilient `--from-file`/stdin input + parity guard; fixes D-81 backtick corruption; research-first on basic-memory + mempalace). Then: **109** register-crons broken on Windows (D-83) · **110** `cmk forget` must auto-reindex, no manual command (F-7) · **111** `cmk persona generate` real-run timeout (F-2) · **112** weekly-curate real verification (F-4) · **113** queue review/conflicts real verification (F-9) · **114** import-anthropic real verification (F-13) · **115** transcript temp-file hygiene · **116** coverage hardening so "never tested since v0.1" can't recur (D-84) · **117** free-speech intent→action coverage — make the kit invisible (**D-85:** the regular user never runs commands — *even the maintainer* drives via Claude, never types `cmk`; every intent needs an automatic or Claude-mediated path). · **118** resolve R2/D-80 (the `cd`-compound permission prompt) via the MCP-first surface — install allowlists `mcp__cmk__*`, rides 108 (D-80 revisited with new evidence). _Decision trail: D-80/D-81/D-82/D-83/D-84/D-85._

**⛔ v0.2.3 CUT-BLOCKERS surfaced by the live cut (D-102, 2026-06-09) — must land BEFORE the `v0.2.3` tag:**

- [x] **122** — 🔴 name-privacy: extended the D-51 de-id sweep to CODE (the maintainer's real name was in shipped `src/` + scripts) + added the `validate-maintainer-name-confined.mjs` guard so it can't recur. _shipped 2026-06-09 (v0.2.3)._
- [x] **121 (user-facing parts)** — fixed the MCP server's hardcoded `version: '0.1.0'`, the "v0.1.0/v0.1.x" user-facing capture messages, CLI.md's stale tool list, and flipped ADR-0014 → Accepted. _shipped 2026-06-09 (v0.2.3)._ **Comment-normalization internal: NOT a task** — 121.6 settled it (the `v0.1.x` deferral-markers stay as a documented convention meaning "a later patch"); nothing trailed to v0.2.4.

**→ v0.2.4 — housekeeping ✅ SHIPPED 2026-06-09.** Cleanup surfaced during the v0.2.3 cut + pre-existing CI hygiene; no new differentiator (still wedge polish). _Published to npm (`@lh8ppl/claude-memory-kit@0.2.4`, provenance) + GitHub Release `v0.2.4`._

- [x] **120** — removed the stale `memsearch + Milvus` scaffolding (`doctor` 9→7 checks HC-1..HC-7 + the shipped `milvus-deploy`/`memsearch-index` template files **and the plugin mirror** + genericized the user-facing "memsearch" strings → "Layer-5b backend (not yet shipped)"). **KEPT** the `semanticBackend` seam — the §9.3.1 backend-choice deferral STANDS. Surfaced 2026-06-08 when `cmk doctor` showed "memsearch installed" during the v0.2.3 cut (D-101). _shipped 2026-06-09, PR #145 (v0.2.4). Live-verified: `cmk doctor` → 7 checks, 0 memsearch, across ubuntu/windows/macOS CI._
- [x] **119** — bumped `actions/checkout@v4` → `@v6` (Node 24) across all 7 workflows; it was the lone Node-20 laggard (the rest already Node-24). Ahead of GitHub's Node-20 runner removal (2026-09-16). _shipped 2026-06-09, PR #146 (v0.2.4)._

- _**80 / 80c moved to v0.3** (D-57) — env/config capture+recall rides with the recall wow; no longer a v0.2.0 conditional blocker. The prompt-side 80b shipped; the deterministic 80c lands in v0.3 with active recall._
- [x] **92** — LOW-trust drops must leave a trace (lifecycle-map G6; D-55) — _shipped 2026-06-05, D-67._ Each discarded LOW candidate logs a `low_trust_discarded` excerpt+reason trace to extract.log (log-only, not the review queue). Security composition fix: the diagnostic extract.log is now gitignored (carries raw un-screened excerpts).
- [x] **93** — inject drop importance-aware, not tail-order (lifecycle-map G7; = Task 94.4) — _shipped 2026-06-05, D-66._ `truncateTierToBudget` now evicts the lowest-value section first (trust → recency → tail tiebreak); strict generalization of the old tail-drop (legacy tests unchanged). Follow-up: the total-cap fallback still drops whole tiers persona-first (v-next, design §19.3).
- **84c** — de-bias scaffold seed examples (cosmetic; seed-ID regen ripple)
- [~] **72** — user-tier portability across machines (the wedge's cross-machine half) — _CORE shipped 2026-06-05, D-69: `cmk persona export`/`import` (transactional, OS-agnostic bundle) + the D-27 honesty fix. `cmk persona sync` (git auto-pull/push) deferred as a documented fork (72.2)._
- **73** — upgrade/repair: re-render stale placeholders in existing tiers
- **68** — weekly-curate LLM-semantic scratchpad pruning
- **70** — inject/output injection-defense (memory-poisoning defense-in-depth)
- **47** — `cmk doctor --repair` (prompt-then-install per failed HC)
- [x] **52** — dogfood the kit on its own repo (the meta-fix for "we kept losing context") — _shipped 2026-06-10, pulled into the v0.3 lane (D-105/D-108)_
- **48** — promote ask-before-install rule to a proper NFR (doc/requirements housekeeping)
- [x] **77** — rename version-named-but-general docs → version-agnostic (the misnomer class): `specs/v0.1.0/` → `specs/` **and** `docs/journey/v0.1.0-build-log.md` → `docs/journey/build-log.md` — _shipped 2026-06-08, one atomic refactor; ~200 refs updated, `validate-references` + suite green; point-in-time history docs left version-stamped._
- **45.1–45.4** — persona manual controls (surface / `cmk persona accept|reject` / auto-apply / hand-curated conflict — verify which already shipped via the wedge work)
- **live-verify `--permission-mode`** — let project-A actually write files in the harness (Task 89 enhancement)

## v0.3.0 — recall + consistency (the next wow)

**Lane plan approved 2026-06-09 (D-105), 5 PRs in order:** **75.0** (authoritative-memory instruction — pulled forward of 65: cheapest recall lever, no backend dependency; _shipped 2026-06-10_) → **99** (benchmark; baselines = one-shot FTS5 AND agentic/iterative keyword — the embedder must beat the latter, per Anthropic's "start with agentic search" guidance) → **52** (dogfood the kit on its own repo — the real corpus for the bake-off) → **65** (spike sqlite-vec [zvec = named fallback] → embedder ladder from bge-small upward, bigger-wins-ties, numbers decide → build behind the §9.3.1 seam) → **README professional upgrade** ✅ shipped 2026-06-10 (published the benchmark table + fixed stale HC counts). **The 5-PR lane plan is COMPLETE**; next in v0.3: 75.1/75.2 + 104 + 46.

- [x] **65** — Layer-5b semantic recall (the video's "recall is the most important function") — _shipped 2026-06-10 (ADR-0015/D-109): sqlite-vec + bge-base, **R@5 0.941 / paraphrase 1.000** = wow #2 recall-with-reasoning = **video parity reached**._ _MemPalace blueprint (D-70): embedded vector (sqlite-vec) + hybrid pipeline (keyword-boost → temporal-proximity → optional LLM rerank); pairs with Task 99 (benchmark)._
- [x] **99** — recall benchmark (LongMemEval-style R@k) so Task 65 is decided on numbers, not vibes (D-70, MemPalace). _shipped 2026-06-10 (D-107). **Baselines: keyword R@5 0.176 → agentic-deterministic 0.471 → agentic+Haiku 0.529 (paraphrase ceiling 0.300 = the Task-65 headroom).**_
- [~] **75** — recall TRIGGER: make the agent actively USE memory when it needs old context (D-35 active recall). _The load-bearing v0.3 piece (D-57): graduation (Task 91/94) makes facts search-only, so this is what makes overflow facts findable. **Reframed instruction-first (D-64, memory-os Layer 7): the primary lever is telling the agent injected/searchable memory is AUTHORITATIVE — lead with it, don't re-derive — not just the search backend.**_ _**75.0 shipped 2026-06-10** (snapshot preamble + CLAUDE.md authority rule); 75.1/75.2 after Task 65._
- **97** — dynamic trust: trust scores accumulate over time (feedback loop) vs static-at-capture (D-64, memory-os; the user wants it). Composes with F-D + Task 66 + §19.3.
- **80 / 80c** — deterministic env/config capture (observe-edit), so config values are recallable not re-derived (moved from v0.2.0 per D-57; pairs with 75/65).
- **51** — index session-rollup + transcript files for search
- **57 / 58 / 59** — capture Claude's stated positions as decision-facts + inject a "recent decisions" digest + contradiction reconciliation (Phase 3)
- **F-D** — fact-layer auto-supersede (semantic contradiction between captured facts, e.g. uv-vs-venv)
- **95** — dream-style re-curation (D-62): re-curate from RAW transcripts → a REVIEWABLE new output (not in-place), merging dups + resolving contradictions latest-wins + surfacing insights; unifies F-D + Task 55/66 + curate. From the 2026-06-04 Anthropic Dreams primary source.
- **96** — memory versioning + redact (D-62): point-in-time recovery of any prior value + a compliance scrub path; completes the never-lose invariant beyond tombstones. _(may slip to v0.4.)_
- **66** — temporal validity (facts stay true / age out correctly)
- **71** — external-drift guard (detect + refuse hand-edits to memory)
- **74** — re-inject memory after compaction (PreCompact hook)
- **129** — `cmk config get/set/--show-origin` (the stub became real when `--with-semantic` shipped a real setting; D-121)
- **130** — `cmk purge --hard` ships WITH 96 (the compliance-scrub verb over the versioned store; D-121)
- **131** — remove the `cmk view` stub (the viewer IDEA moves to v0.4; D-121)
- **134** — Poison_Guard catalog extension (fixed-prefix adds only; the user's add-don't-diminish directive)
- **135** — pack-completeness validator (`npm pack --dry-run --json` vs the template tree)
- **137** — close the gate-vs-automation gap (5 structural checks from the 2026-06-11 gate-found bug classes)
- [x] **46** — `cmk install --with-semantic` (embedder bootstrap + hybrid-by-default-when-enabled; pairs with 65) — _shipped 2026-06-10, PR #152 (D-111)_

## v0.4.0+ — breadth

- **50** — cross-agent install (`cmk install --ide cursor|codex|gemini-cli`)
- **55** — behavioral pattern detection + promotion ("learn how I work," not just facts)
- **viewer (design-first)** — a memory viewer for the non-developer audience (the parked `cmk view` idea — a product question, not a port number; D-121). Judge next to the Task-127 team-layer companion.

---

## Notes

- **This file is authoritative for the version LANE.** A task's full detail + checkbox state lives in [`specs/tasks.md`](../specs/tasks.md); its narrative in the journey log; its version assignment here.
- **F-D and 84c were deferred from v0.2.0** (2026-06-03): F-D is the v0.3 semantic-contradiction engine (didn't break recall; 84b covers the summary layer); 84c is cosmetic placeholder text. Both are zero-ripple leaves — nothing depends on them.
- When a new finding/task appears, assign it a lane HERE in the same batch, so version decisions stop being ad-hoc.
- **Backlog-hygiene audit 2026-06-07** (the user: *"are all tasks slotted to a planned version, or are we lugging around problems?"*): all v0.2.3 findings (Tasks 108–117, D-81→D-85) are slotted; nearly every other open task already had a lane. Two orphans were tied off: **41.4** (`test-quickstart.sh` — stale vs Task 62 node-only; retire-or-reshape at v0.2.x) and **76.2** (lessons-promote `--tier U` decision — folded into Task 108/v0.2.3). **94.5** (manual cold-open re-test) is not an orphan — it IS the in-progress 2026-06-07 cut-gate. No silently-unslotted open tasks remain.
