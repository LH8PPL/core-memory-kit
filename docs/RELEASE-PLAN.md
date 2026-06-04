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
- [x] **name de-identification sweep** — _DONE 2026-06-04 (D-51): "Lior"→"the user"/"the maintainer", "lior-test"→"live-test" across 54 .md (537 repl.); the durable rule is in CLAUDE.md "Name privacy"._
- [ ] **91 — MEMORY.md graduation (the missing 3rd shrink mechanism)** — _BLOCKER, D-54. The cut-gate run surfaced that the hot index ships only 2 of its 3 designed shrink mechanisms (cap + stale-drop); **graduation — durable facts moving OUT into `context/memory/*.md` fact files — is unbuilt** (`grep graduat` → 0 source hits). Live-measured: MEMORY.md hit 2059/2500 B after ONE session, all bullets `trust: high` (un-droppable) → ~1 more session → `CAP_EXCEEDED` → the kit silently stops remembering. Subsumes the cut-gate double-capture. **Cut HELD on this** (Decision A; no stopgap — raising the cap is the rejected band-aid)._
- [ ] **manual live test** — the user's clean-slate run on a fresh project (pre-tag; the cut gate per D-24). _Guide ready: [`docs/process/v0.2.0-cut-gate.md`](process/v0.2.0-cut-gate.md). The automated half is green (`npm run live-test`, D-50); the manual run covers R1/R2 + the recall feel. **Paused at §3 (capture checks) pending Task 91 — the §5 multi-session recall + cap-stability checks can't pass while MEMORY.md write-locks.**_
- [x] **90 — `cmk install` allow-lists `Skill(memory-write)` (D-52)** — _shipped 2026-06-04._ The cut-gate live run caught that Task 69's skill-delivery reintroduced a "Use skill?" prompt that Task 79's bash allow-list didn't cover (composition gap); install now allow-lists the skill too, so explicit capture is friction-free. (+ drive-by fix of a pre-existing time-bomb test.)
- [x] **status audit DONE** (D-47) — flipped verified-done: **24, 34, 56, 76, 78**; closed obsolete **44**; confirmed OPEN: **67, 69, 41.4, 45.2, 47, 51** (+ 84 stays open: 84c deferred). Methodology: evidence per task, not memory.
- [x] **69 — skills-as-delivery / de-bloat CLAUDE.md (PULLED INTO v0.2.0; D-48 → implemented D-49)** — 5 sub-tasks shipped: 69.0 rewrote the stale+UNSAFE memory-write skill (was hand-editing MEMORY.md, bypassing Poison_Guard = F1 leak class — **security**; now `Bash(cmk remember *) Bash(cmk forget *) Read` least-privilege, MUST/NEVER gate) · 69.1 `cmk install` scaffolds `.claude/skills/` (route-equivalence) · 69.2 one source (`template/` canonical → `plugin/` mirror via `sync-plugin-skills.mjs`) + `validate-skill-sources.mjs` drift+safety guard · 69.3 slimmed the CLAUDE.md block to facts + a skill pointer · 69.4 tests (17 cases incl. "gate bites" negatives). _Shipped 2026-06-04, PR #111; 1394 suite green + live-verify PASS 2/2+2/2._

## v0.2.x — wedge polish (patch, no new differentiator)

- **92** — LOW-trust drops must leave a trace (lifecycle-map G6; D-55) — discarded LOW candidates vanish with no content record; log the excerpt to extract.log (don't pollute active memory).
- **93** — inject drop must be importance-aware, not tail-order (lifecycle-map G7; D-55) — `truncateTierToBudget` drops whole sections from the tail, so what reaches the window depends on section order not trust/recency; evict lowest-value first, never drop high-trust before low-trust.
- **84c** — de-bias scaffold seed examples (cosmetic; seed-ID regen ripple)
- **72** — user-tier portability across machines (the wedge's cross-machine half)
- **73** — upgrade/repair: re-render stale placeholders in existing tiers
- **68** — weekly-curate LLM-semantic scratchpad pruning
- **70** — inject/output injection-defense (memory-poisoning defense-in-depth)
- **47** — `cmk doctor --repair` (prompt-then-install per failed HC)
- **52** — dogfood the kit on its own repo (the meta-fix for "we kept losing context")
- **48** — promote ask-before-install rule to a proper NFR (doc/requirements housekeeping)
- **77** — rename version-named-but-general docs → version-agnostic (the misnomer class): `specs/v0.1.0/` → `specs/` **and** `docs/journey/v0.1.0-build-log.md` → `build-log.md` (both already hold v0.2 content; one atomic refactor PR; touches many links)
- **45.1–45.4** — persona manual controls (surface / `cmk persona accept|reject` / auto-apply / hand-curated conflict — verify which already shipped via the wedge work)
- **live-verify `--permission-mode`** — let project-A actually write files in the harness (Task 89 enhancement)

## v0.3.0 — recall + consistency (the next wow)

- **65** — Layer-5b semantic recall (the video's "recall is the most important function")
- **75** — recall TRIGGER: make the agent actively USE memory when it needs old context (D-35 active recall)
- **51** — index session-rollup + transcript files for search
- **57 / 58 / 59** — capture Claude's stated positions as decision-facts + inject a "recent decisions" digest + contradiction reconciliation (Phase 3)
- **F-D** — fact-layer auto-supersede (semantic contradiction between captured facts, e.g. uv-vs-venv)
- **66** — temporal validity (facts stay true / age out correctly)
- **71** — external-drift guard (detect + refuse hand-edits to memory)
- **74** — re-inject memory after compaction (PreCompact hook)
- **46** — `cmk install --with-semantic` (semantic-backend bootstrap; pairs with 65)

## v0.4.0+ — breadth

- **50** — cross-agent install (`cmk install --ide cursor|codex|gemini-cli`)
- **55** — behavioral pattern detection + promotion ("learn how I work," not just facts)

---

## Notes

- **This file is authoritative for the version LANE.** A task's full detail + checkbox state lives in [`specs/v0.1.0/tasks.md`](../specs/v0.1.0/tasks.md); its narrative in the journey log; its version assignment here.
- **F-D and 84c were deferred from v0.2.0** (2026-06-03): F-D is the v0.3 semantic-contradiction engine (didn't break recall; 84b covers the summary layer); 84c is cosmetic placeholder text. Both are zero-ripple leaves — nothing depends on them.
- When a new finding/task appears, assign it a lane HERE in the same batch, so version decisions stop being ad-hoc.
