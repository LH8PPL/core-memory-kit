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
- [x] **91 — MEMORY.md graduation (write-lock safety valve)** — _shipped 2026-06-04, PR #113 (D-54/D-57). Transactional cap-pressure valve, project MEMORY.md only; generalized to all tiers by Task 94._
- [~] **94 — load-cap (not write-cap) + universal graduation** — _CORE shipped 2026-06-04, PR #114 (D-61/D-63): 94.1 load-cap (writes always succeed; no write-lock on any tier) + 94.2 all-tier graduation (persona graduates to `fragments/` — the D-60 persona-lock fix). The never-lose invariant is delivered. 94.3 (proactive SessionEnd graduation sweep) shipped 2026-06-05 (D-65). Follow-ups: 94.4 (= Task 93 importance-aware inject), 94.5 (live cold-open re-test)._
- _**Friend-handoff reframe (D-61):** the v0.2.0 tag is a milestone (no write-lock anywhere, zero loss); the "good enough to give a friend" bar is the **v0.3 recall lane** finish (Task 75/84/80c), not the tag. The user (2026-06-04): "this is not a good product right now… I will continue to do all the tasks until we have everything this kit promises."_
- [ ] **manual live test** — the user's clean-slate run on a fresh project (pre-tag; the cut gate per D-24). _Guide ready: [`docs/process/v0.2.0-cut-gate.md`](process/v0.2.0-cut-gate.md). The automated half is green (`npm run live-test`, D-50); the manual run covers R1/R2 + the recall feel. **Unblocked now that Task 91 shipped — re-run fresh on a NEW artifact (rebuild the tarball); the write-lock is fixed so multi-session capture + cap-stability can pass.**_
- [x] **90 — `cmk install` allow-lists `Skill(memory-write)` (D-52)** — _shipped 2026-06-04._ The cut-gate live run caught that Task 69's skill-delivery reintroduced a "Use skill?" prompt that Task 79's bash allow-list didn't cover (composition gap); install now allow-lists the skill too, so explicit capture is friction-free. (+ drive-by fix of a pre-existing time-bomb test.)
- [x] **status audit DONE** (D-47) — flipped verified-done: **24, 34, 56, 76, 78**; closed obsolete **44**; confirmed OPEN: **67, 69, 41.4, 45.2, 47, 51** (+ 84 stays open: 84c deferred). Methodology: evidence per task, not memory.
- [x] **69 — skills-as-delivery / de-bloat CLAUDE.md (PULLED INTO v0.2.0; D-48 → implemented D-49)** — 5 sub-tasks shipped: 69.0 rewrote the stale+UNSAFE memory-write skill (was hand-editing MEMORY.md, bypassing Poison_Guard = F1 leak class — **security**; now `Bash(cmk remember *) Bash(cmk forget *) Read` least-privilege, MUST/NEVER gate) · 69.1 `cmk install` scaffolds `.claude/skills/` (route-equivalence) · 69.2 one source (`template/` canonical → `plugin/` mirror via `sync-plugin-skills.mjs`) + `validate-skill-sources.mjs` drift+safety guard · 69.3 slimmed the CLAUDE.md block to facts + a skill pointer · 69.4 tests (17 cases incl. "gate bites" negatives). _Shipped 2026-06-04, PR #111; 1394 suite green + live-verify PASS 2/2+2/2._

## v0.2.x — wedge polish (patch, no new differentiator)

- _**80 / 80c moved to v0.3** (D-57) — env/config capture+recall rides with the recall wow; no longer a v0.2.0 conditional blocker. The prompt-side 80b shipped; the deterministic 80c lands in v0.3 with active recall._
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
- **75** — recall TRIGGER: make the agent actively USE memory when it needs old context (D-35 active recall). _The load-bearing v0.3 piece (D-57): graduation (Task 91/94) makes facts search-only, so this is what makes overflow facts findable. **Reframed instruction-first (D-64, memory-os Layer 7): the primary lever is telling the agent injected/searchable memory is AUTHORITATIVE — lead with it, don't re-derive — not just the search backend.**_
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
- **46** — `cmk install --with-semantic` (semantic-backend bootstrap; pairs with 65)

## v0.4.0+ — breadth

- **50** — cross-agent install (`cmk install --ide cursor|codex|gemini-cli`)
- **55** — behavioral pattern detection + promotion ("learn how I work," not just facts)

---

## Notes

- **This file is authoritative for the version LANE.** A task's full detail + checkbox state lives in [`specs/v0.1.0/tasks.md`](../specs/v0.1.0/tasks.md); its narrative in the journey log; its version assignment here.
- **F-D and 84c were deferred from v0.2.0** (2026-06-03): F-D is the v0.3 semantic-contradiction engine (didn't break recall; 84b covers the summary layer); 84c is cosmetic placeholder text. Both are zero-ripple leaves — nothing depends on them.
- When a new finding/task appears, assign it a lane HERE in the same batch, so version decisions stop being ad-hoc.
