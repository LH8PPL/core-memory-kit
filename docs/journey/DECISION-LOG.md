# Decision log — running paper trail

> **Purpose.** An append-only, chronological record of every **decision / issue / bug / fix / pivot** so that a future session (after auto-compact or a premature end) can reconstruct *what was decided and why* without re-deriving it from faded context. This file exists because on 2026-05-30 the assistant recommended re-opening an **already-settled** decision (build v0.2 vs. a v0.1.3 patch-sweep) — reasoning from in-context memory instead of the durable record. Lior: *"we will not have this problem again that you decide something against an already decision line we are already into."*
>
> **Binding usage (see CLAUDE.md "Decision-log discipline"):**
> 1. **Before re-opening ANY decision** — search this file + [`v0.1.1-self-test-findings.md`](v0.1.1-self-test-findings.md) + tasks.md for it. If it's here marked **SETTLED**, do not re-litigate it; execute it. Surface a change only if you have *new* evidence, and say explicitly "this revisits SETTLED decision D-N because <new evidence>".
> 2. **After making/learning anything durable** — append an entry in the SAME batch as the work. Decisions, issues found, bugs, fixes, design choices, pivots. Newest block at the TOP.
> 3. Entry types: **DECISION** (a choice + why), **PIVOT** (a previously-documented choice changed — preserve the old per decision-trail rule), **ISSUE** (a problem noted, maybe not yet fixed), **BUG**, **FIX**, **NOTE**.
> 4. This is the running paper trail. Stable rules still graduate to CLAUDE.md; task state still lives in tasks.md; per-PR narrative still goes to the build log. This file is the chronological spine that ties them together.

---

## 2026-05-30 — v0.1.2 shipped; v0.2 launched; Task 45 started

### Settled decisions (do NOT re-open without new evidence)

- **D-1 DECISION — Build v0.2 (Phases 1→3). SETTLED.** The kit's core vision is "Claude remembers its own positions and stays consistent" (the FastAPI scenario: *"2 days ago you said X was a mistake; now the opposite"*). Lior: *"this was an integral part of the kit … if it's somewhere in the future I want to be there in that future, and now."* Phases: 1 Foundation (done) → 2 Automatic memory → 3 the consistency engine. Source: [`v0.1.1-self-test-findings.md`](v0.1.1-self-test-findings.md) §"COMMITTED ROADMAP". **This was re-opened in error on 2026-05-30 and re-confirmed; do not re-litigate.**

- **D-2 DECISION — v0.1.x backlog folds into v0.2; NO v0.1.3 patch-sweep. SETTLED.** The ~40 design §16 candidates are overwhelmingly trigger-gated ("ship when a real need/bug surfaces"); the non-trigger-gated ones (Task 45 auto-persona, 16.18 temporal, Task 55 patterns) ARE the v0.2 feature set. A patch-sweep would manufacture a release for items with no demand. **Let real usage (the friend + Lior's own use) be the trigger** for any v0.1.3. Implication: stop asking "patch-sweep first or fold?" — it's folded.

- **D-3 DECISION — Task 45 (auto-persona) is the friend-handoff gate; re-homed v0.1.1 → v0.2 Phase 2. SETTLED.** The self-test (finding #2 🟡) empirically reproduced design §16.16's predicted failure: cross-project doctrine (venv-3.13, layered-backend) was captured but filed PROJECT-tier; the USER tier stayed empty → cross-project value prop collapses. Lior: *"we have to have task 45 and i need v0.2 … i dont think i can send this to my friend without it."* The friend gets the same empty user tier until Task 45 ships.

- **D-4 PIVOT — Task 45 posture: manual accept/reject gate → OPTIMISTIC AUTO-PROMOTE. SETTLED.** Original design (tasks.md 45.2 `cmk persona accept/reject` + 45.3 `--auto` opt-in **default-off**) is a manual-confirmation shape. Superseded for v0.2 by Lior's *"i dont want to do anything, i want it to be automatic"* + his choice **Optimistic**. New posture (tasks.md 45.6): high-confidence cross-project doctrine auto-promotes to the user tier at `trust:medium` with NO manual step; low/medium-confidence routes to the auto-drained review queue; auto-supersede on contradiction (reuse Task 25). **Old manual design preserved** in tasks.md 45.1-45.5 as decision-trail + fallback if optimistic proves too aggressive.

- **D-5 DECISION — Auto-persona uses Design B (piggyback the weekly-curate consolidator). SETTLED.** It already runs the CompressorBackend (Haiku) with no extra API call; extend its prompt with a "Step 3: persona candidates" classification. Source: claude-remember code-dive + tasks.md 45.1. Fallback: Design A (standalone `cmk persona generate` pipeline) if the consolidator prompt budget can't absorb it.

- **D-6 DECISION — auto-drain the review/conflict queues (no manual `cmk queue *` in the common case). SETTLED.** Lior 2026-05-30: *"i dont want to do anything, automatic."* Posture: Optimistic — auto-promote; auto-supersede on contradiction (reuse Task 25 conflict detection); the daily-distill (Task 33) + weekly-curate (Task 34) passes drain the queues. Manual `cmk queue *` stays available, just not required.

- **D-7 DECISION — Code-quality CI = "Both" (coverage now + SonarCloud). SETTLED, SHIPPED.** Vitest v8 coverage gate (70% ratchet, lcov) PR #75 + SonarCloud CI-based scan PR #78. SonarCloud **Automatic Analysis disabled** (mutually exclusive with the CI-based scan). Task 54 flipped to [x].

### Task 45 implementation design choices (2026-05-30, first increment)

- **D-8 DECISION — Classification contract.** The backend (Haiku Step-3) emits one line per cross-project candidate: `PERSONA CANDIDATE | target=<FILE> | section=<SECTION> | confidence=<high|medium|low> | <one-line restatement>`. Module parses via `CANDIDATE_RE`. Project-specific facts are NOT surfaced. Rationale: matches claude-remember's `IDENTITY CANDIDATE:` pattern, extended with routing + confidence.
- **D-9 DECISION — Routing targets + sections.** USER.md (About/Preferences/Working Style), HABITS.md (Iteration Cadence/Destructive Operations/Communication Style), LESSONS.md (Tooling Lessons/Process Lessons/Anti-patterns). A classifier-named target outside this allow-list is dropped defensively (never trust Haiku routing blindly).
- **D-10 DECISION — Provenance of promoted bullets.** `write: 'compressor'` (reused the existing valid enum — a Haiku-backend synthesis IS a compressor op; avoids a provenance-schema change this increment), `trust: 'medium'` (system-derived, not user-attested), `source: 'persona-synthesis'`, `source_line: 1`, `sha1` = sha1 of the bullet text. **Open:** a distinct `write: 'auto-persona'` enum value would be more audit-precise — deferred (schema change). Logged as I-2.
- **D-11 DECISION — Source corpus = project-tier (P) facts only.** Assembled via `listObservationSources({projectRoot, userDir})` filtered to `tier==='P'`. `userDir` is passed through PURELY to keep U-tier resolution sandbox-scoped — **never walk the real `~/.claude-memory-kit`** (design §16.36 hazard). U-tier is the DESTINATION, not a source.
- **D-12 DECISION — Confidence gate is not a manual gate.** `high` → auto-promote now; `medium`/`low` → collected in `queued[]` (response only this increment; the queue-FILE write + auto-drain lands in the next increment with its own test).

### Issues / bugs / fixes

- **I-1 ISSUE (meta, root cause of today's misstep)** — assistant re-opened SETTLED decision D-1/D-2 from faded context instead of reading the durable record. **FIX:** this decision log + the new CLAUDE.md "Decision-log discipline (binding)" rule (read before re-opening; append after deciding). Also reinforced the existing "don't summarize from memory when primary source is available" verification rule — it applies to *our own prior decisions*, not just external sources.
- **I-2 ISSUE (open, Task 45)** — audit entry for a persona promotion passes `paths: [res.path]` (array), but audit-log.mjs schema doc says `paths` is `{before?, after?, archive?}`. Should be `paths: { after: res.path }`. Non-breaking today (writer copies through; test only greps for "persona"), but it's schema drift. **FIX pending** in the next Task 45 increment (when the per-promotion audit is hardened with the over-mutation + Door-3/4 tests).
- **I-3 ISSUE (open, Task 45)** — cooldown gate (120s Haiku, shared marker) not yet honored in `autoPersona`. Fine for the standalone first increment (tests don't set markers); MUST be added with the `cmk persona generate` wrapper + the Design-B weekly-curate hook (which already gates cooldown at the consolidator level). Logged so it isn't forgotten.

### Shipped / state

- **v0.1.2 SHIPPED to npm** as `latest`, SLSA-provenance-signed. PR #79 merged (`abcb118`) → tag `v0.1.2` → `publish.yml` (run 26685130999). GitHub Release created. Carries all Phase-1 self-test fixes (#R/#0/#0b/#1/#3/#4 + install polish).
- **v0.2 roadmap formalized** in tasks.md (Phase 2/3 block + Task 45.6 + 45.7) — commit `b57df43`.
- **Task 45 first increment** — `packages/cli/src/auto-persona.mjs` + `tests/cli-auto-persona.test.js` (5 green) + `PERSONA_PROMOTED`/`PERSONA_SUPERSEDED` reason codes. On branch `task-45-auto-persona`.
