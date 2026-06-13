# claude-memory-kit — project CLAUDE.md

Auto-loaded by Claude Code at session start when this repo is the primary workspace. Read in full before responding to the user.

## What this project is

A per-project, in-repo memory system for Claude Code. Fixes per-session amnesia by storing durable facts as markdown inside `<repo>/context/` (committed) + `<repo>/context.local/` (gitignored) + `~/.claude-memory-kit/` (user-tier). Architecture-first v0.1 (~50 dev-days, 36 tasks). Not Cursor's MVP shape — we're laying foundations first.

## Read these in order (10 minutes total)

1. [`docs/journey/build-log.md`](docs/journey/build-log.md) — full narrative. The single most important doc.
2. [`specs/tasks.md`](specs/tasks.md) — the 44-task build plan. Find the next `[ ]` parent task.
3. [`specs/glossary.md`](specs/glossary.md) — domain terms. When two docs disagree, glossary wins.
4. [`specs/design.md`](specs/design.md) — HOW the kit works (skim, then read sections as needed).
5. [`specs/requirements.md`](specs/requirements.md) — WHAT v0.1.0 must do (FR-*, NFR-*).

## Working style (locked in by the user)

The user is direct and tight on time. Match the energy.

**Tone:**

- Terse, direct responses. No filler ("Great question!", "Sure thing!", "I'd love to help!").
- Lead with the answer. Add context only if it changes the answer.
- "go" = start the next task immediately, no preamble.
- "lets continue" / "let's continue with X" = same — execute.
- Acknowledge mistakes plainly. Don't bury them in apology. "I was wrong about X. Here's the fix."

**Decisions:**

- One recommendation > four options. State a choice; user redirects if wrong.
- Use `AskUserQuestion` only for genuine forks where you can't pick. Don't over-use it for things you should just decide.
- When asked for opinions, give a real opinion. Don't equivocate.

**Verification:**

- **"Did you check?" is the load-bearing question.** Every external claim about a project / library / API gets verified against the primary source before being stated as fact. My training data is sometimes wrong — primary-source examination has surfaced 8+ corrections during this project.
- **Convention-convergence-across-third-party-implementations is not primary-source verification.** When a project / library / API has official docs, check the docs directly. Reading two plugins that both implement convention X tells you those two authors agreed on X — it doesn't tell you X is correct. If a primary source exists (Anthropic's plugin docs, the W3C spec, the language reference manual), go there. The 2026-05-26 live-test plugin-layout bug surfaced because design.md §5.1 was written against convergent third-party evidence without checking Anthropic's docs (which would have caught the mistake instantly via a Warning callout in their structure-overview section).
- **Internal cross-references are subject to the same primary-source verification.** A citation to `ADR-X` / `§X.Y` / `FR-N` / `Task NN` inside the spec stack is a claim that resolves to a specific anchor with specific content — verify that anchor exists and that its content matches the citing context, the same way you'd verify an external citation. A `(per ADR-0008)` reference that points at the wrong content is the same failure class as citing claude-mem as authoritative for an Anthropic spec — both ANSWER the question with a subset of the truth. PR-C of the post-PR-31 audit campaign (2026-05-26) ran the audit: surfaced two reserved-but-never-written ADRs (0009 + 0010, both shipped without a file — backfilled from research-base evidence), one cross-doc citation drift (FR-28/29/30 + NFR-9 cited as if in `requirements.md` but actually living in `requirements-revisions-proposed.md`), AND a self-correction (my own PR-A claim that ADR-0008 was mis-cited was wrong — the ADR title compounds bank-airgap + pluggable-compressor; the citations were correct all along; sloppy reading is its own version of the lazy-framing class). Internal-reference verification is what PR-D's `validate-references.mjs` will enforce structurally; until then, when you write or move a citation, verify the target the same way you'd verify an external one.
- **Composition verification — when two components have independent budgets / contracts, check the composition, not just each in isolation.** Per-file caps must compose with snapshot caps. Per-turn extraction must compose with typical turn shapes. Trust thresholds must compose with consolidation behavior. Inner subprocess timeouts must compose with outer hook ceilings. "Separately-correct-jointly-broken" is a real failure class — every spec author was right within their own surface; nobody owned the cross-surface invariant. **Six instances of the same pattern in this build**: PR-14 (per-file caps interacted with seed-trust+at to break first-write — addressed by tests/cli-seed-templates.test.js + design §7.1 cap-coordination rule), PR-22 (auto-extract spec read only the assistant turn, broke under realistic user-dictating-terse-ack flows — addressed by tests/cli-auto-extract.test.js + design §6.4 bi-turn temp-file shape), PR-25 (snapshot cap composed against per-file caps to drop the user tier on every default install — addressed by tests/template-scaffolding.test.js + design §7.1), PR-A of the post-PR-31 audit campaign (no inner subprocess timeout in `HaikuViaAnthropicApi.compress` meant the outer hook ceiling killed the parent without running catch / finally / log-write — composition gap between inner backend timeout and outer hook ceiling per design §8.5; addressed by tests/cli-compressor-timeout.test.js + tests/spawn-smoke-kill-chain.test.js + design §8.5), Task 25 (Layer-2 `mergeFacts` was assumed to compose with Layer-3 conflict-queue's `merge-both` action, but the two specs were written independently — the proposed bullet routed to `queues/conflicts.md` has no per-fact file, so `mergeFacts(existingId, proposedId)` errored `not-found` at runtime — **addressed by Task 25b's `mergeScratchpadBullets` Layer-3 merger** in `packages/cli/src/conflict-queue.mjs` + tests/cli-conflict-queue.test.js + design §6.8 updated with concrete merge semantics), and Task 31 (`mk_remember` reported `accepted: true` even when `memoryWrite` routed to `queues/conflicts.md` — the MCP tool was written assuming a 2-way appended/error outcome, missing the 3rd `queued` state from Task 25's conflict-queue integration; the model would have read `accepted:true` as "fact saved" while in fact `cmk queue conflicts` was required to land the bullet — **addressed by Task 31's queued-state branch in `makeMkRemember`** in `packages/cli/src/mcp-server.mjs` + tests/cli-mcp-server.test.js B1 contract lock test). When writing a spec that adds a budget, contract, or invariant, look for the OTHER specs that compose with it and verify the composition explicitly.
- **Full-research-base check on provenance questions — when asked "where did this design come from?", check the full research base before answering, not just the predecessor product you recall from this session.** The kit's research base lives in [`docs/research/`](docs/research/), [`docs/sources/`](docs/sources/), [`docs/adr/`](docs/adr/), [`docs/conversation-log/`](docs/conversation-log/), and [`SOURCES.md`](SOURCES.md). A provenance answer that names only the source freshest in your context is wrong in the same way a primary-source claim that names only one convergent third-party is wrong: it ANSWERS the question, but with a subset of the truth. Real precedent: when asked about `memory-write` skill provenance, my first answer cited only `claude-mem` / `claude-remember` and missed the Kiro / Cursor / ChatGPT / Antigravity research notes entirely — all of which had documented influence on the skill's shape. Cross-session-blind recall is the kit's whole problem; the workaround is to scan the file tree, not lean on what I happen to remember. Before answering, grep the research dirs (`grep -ri '<topic>' docs/research/ docs/sources/ docs/adr/ SOURCES.md`) and list every hit.
- **Read the authoritative docs for a task BEFORE writing its code (binding).** Before implementing any task, read the design + findings docs that govern it — by **default**, not when reminded. The minimum set: (a) the task's `tasks.md` entry AND every doc it links; (b) the `design.md` section(s) the change touches (the architecture it must fit); (c) the relevant **ADR**(s) and **DECISION-LOG / research** entries for the area (the *why* + what's already settled/deferred). Reading the spec + the code is **not** sufficient — the spec tells you WHAT, the design/ADR/findings tell you WHAT-IT-MUST-COMPOSE-WITH and WHAT-WAS-ALREADY-DECIDED. This is the "did you check the primary source?" rule applied to the START of a task, not just to claims. **Why binding (the precedent):** 2026-06-07, mid-Task-105, the user asked *"did you read all the documentation we wrote about it?"* — and the honest answer was *not yet* (I'd read the task spec + code, but not design §8 / §16.27 / D-75). I stopped and read them BEFORE writing implementation — and reading **§16.27** is exactly what let self-review catch a real `now.md` truncate race the implementation introduced. A retro-audit of Tasks 101 + 103 against their docs found both *aligned*, but 101's alignment was luck-of-a-mechanical-change (I hadn't read §5.1/§8.5/ADR-0006 at the time, the change just happened to preserve the contracts) — which is the point: doc-reading-first turns "happened to be right" into "verified right," and turns latent composition bugs into caught ones. **How to apply:** at task start, before the first code edit, grep + read the governing docs (`grep -rn '<task-topic>' specs/ docs/adr/ docs/journey/DECISION-LOG.md docs/research/`); when a doc names a composition boundary (a shared function, a race, a cooldown, a cap), trace it in the code as part of planning, not after a red gate. Plan mode forces this; outside plan mode it's still required.
- **Branch BEFORE the first commit of a task, never after (binding, mechanical).** A new task's FIRST action that touches the working tree must be preceded by `git checkout -b task-N-short-name` off fresh `main`. Do not start editing on `main` "just to explore" — exploration is read-only; the moment you edit, you should already be on the task branch. **Precedent:** 2026-06-07, Tasks 103 AND 105 both began with edits on `main` (103 caught before commit; 105 committed directly to `main` before I noticed → required a `git branch` + `git reset --hard origin/main` recovery). Nothing was pushed either time, so recovery was clean — but it's avoidable friction. The fix is purely mechanical: branch first.
- **Durable-state-first checkpoint discipline.** Long-running multi-PR work has context-loss risk at session boundaries. Three checkpoint patterns:
  1. **Per-PR**: any session that opens, modifies, or merges a campaign PR updates the durable tracker ([`docs/journey/build-log.md`](docs/journey/build-log.md) §"Post-PR-31 audit campaign tracker" or the equivalent for future campaigns) in the same commit batch. Tracker state never lags behind PR state.
  2. **Context-pressure**: when a session notices context-tight signals (long conversation, low-context reminder from the harness, multiple PRs in flight), write a tracker-update commit BEFORE engaging with the next prompt. **Durable-state-first, then work.**
  3. **Per-task-boundary (interval flush)**: in a multi-task or autopilot run, document each task BEFORE starting the next — its `tasks.md` entry/checkbox + any `DECISION-LOG` entry land in the same commit batch as the task's code, never deferred to "merge-time" or "later." A task boundary is a hard documentation checkpoint: do not carry an undocumented decision/finding across it. The interval IS the task boundary; under context-pressure, flush immediately (pattern 2). Precedent: the 2026-06-03 cut autopilot, where a task's code shipped but its `tasks.md`/`DECISION-LOG` updates lagged (batched toward merge) and the user caught it ("do you document everything?"). The existing always-on rules didn't prevent the lag; this concrete interval does.

  References: 2026-05-26 audit campaign where the tracker initially lived only in session todos and would have died with the session — fixed via the post-PR-32 durable tracker write. PR-E was added to the campaign 2026-05-26 with its full scope landing in the tracker BEFORE any PR-E work began, exactly because of this discipline. An automatic Stop hook to enforce this was considered + decided against for v0.1.0 (every-turn firing would create noise even with conditional logic; the hook itself would need to honor all campaign audit classes — timeout / lock / four-doors / platform). Parked as v0.2 candidate if the manual disciplines prove insufficient.
- **Checkpoint-verification discipline (binding).** Never flip a checkpoint checkbox without re-running its verification criteria from current `main`. Test numbers from a PR-branch run are NOT sufficient — they were taken before merge, before conflict resolution, before subsequent commits to main. Real precedent: the 2026-05-23 cold-start bootstrap test — a fresh session lifted PR-branch numbers (218/140/38) into a Checkpoint-6 annotation without re-running from main; the user caught it (*"did you do it? not just marked it as finished?"*). The mental shortcut ("fresh-looking numbers ⇒ already verified") won over the "did you check?" rule. The structural fix — a `cmk checkpoint <n>` subcommand that runs the criteria and gates the checkbox flip — is a v0.1.x candidate (design §16.56); until it ships, this rule is the guard.
- **Live-test every task, not just unit tests (binding).** A task is not verified until its REAL command/behavior has been exercised end-to-end — green unit tests are necessary but NOT sufficient. **Unit-green ≠ works-on-real-input** — the D-84 lesson that spawned the whole v0.2.3 re-audit lane: `register-crons` errored on Windows, `persona generate` timed out on a real corpus, and `weekly-curate`/`queue`/`import-anthropic` had only ever run their trivial (cooldown/empty/dry-run) path — each while its suite was green. **How to apply:** after the suite passes, run the ACTUAL command against REAL input from the **current repo code** (`node packages/cli/bin/cmk.mjs <cmd>`, never the globally-installed published `cmk` — that's the OLD version), in a sandbox that can't touch the user's real state (`MEMORY_KIT_USER_DIR=<tmp>`, a throwaway project dir; `--dry-run` for system-changing ops like `register-crons`; NEVER the real cron registration / `npm publish` / tag push — those are the user's outward steps). For surfaces a one-shot CLI can't reach — the MCP tools driven by Claude in a live session, interactive prompts, console-flash/prompt-UX — **flag them honestly for the user's manual live-test session; do NOT claim "verified" for a layer you could not exercise.** Record the live result in the task's `DECISION-LOG` entry. **The user's directive (2026-06-08):** *"live test every task from now on."* Precedent: the v0.2.3 lane live-verified Tasks 109/110/111/114/115/117 from the CLI on real Windows + real Haiku (D-96/97/98/100). Live-testing closes the gap unit tests structurally can't see — the lazy-framing class lives in that gap.
- **Decision-trail preservation (binding).** When a documented plan / design / implementation choice changes mid-build, the new path is APPENDED to the old, not substituted for it. The old plan stays visible (with the date + reason it was set aside); the new path lands alongside (with the date + reason it was chosen). Future contributors — including future-Claude after a context compact — need to understand WHY the build's current path differs from what an earlier spec/research note assumed.

  Real precedent: **Task 33's Node-vs-Python pivot** (2026-05-28). The tasks.md entry originally read `python scripts/register-crons.py` because claude-remember's precedent used Python. The first attempt at the pivot wholesale-replaced the Python language with Node, erasing the decision history. The user caught it: *"dont remove the python option, add that we are just not doing it and are using node js and why"*. Corrected: both options now visible in tasks.md 33.2 + design.md §8.6.3, with the 4-point rationale (no new toolchain / existing kit pattern / single-language deploy / fits test surface) explaining the choice.

  **Why this matters**: a contributor reading tasks.md 6 months from now needs to understand whether the Python option was rejected on its merits OR whether we just hadn't tried it yet. Erasing the choice loses that signal. Same applies to:

  - Schema design decisions (when a column gets renamed / removed)
  - Library choices (when a dep gets swapped)
  - Test-fixture approaches (when one pattern replaces another)
  - Architectural splits (when one layer absorbs another)

  **How to apply**: when changing a documented plan, find every authoritative reference (tasks.md / design.md / requirements.md / ADRs) and PRESERVE the old plan with a `**Original plan (pre-YYYY-MM-DD)**:` block, ADD the new path with a `**Implementation pivot YYYY-MM-DD**:` block, and document the rationale concretely (not "we changed our minds" — the actual concrete reasons).

  This rule is itself a meta-instance of "decision trails matter": the rule emerged from a single concrete case, but it generalizes to every spec-stack change going forward.

- **Single source of truth, always-on (binding).** Every piece of project state has exactly ONE authoritative file. When any state changes — task ships, sub-task completes, PR opens / merges, decision made, finding surfaced, deferral noted, dependency identified, research learned, ADR decided, meta-rule emerges — update the authoritative file in the SAME commit batch as the work that produced the change. **The agent's only durable memory is files; in-context knowledge dies at session end.** Never rely on "I'll write it later" or "I'll remember." This applies recursively: if you notice state living in the wrong file (e.g., progress in CLAUDE.md, deferrals in commit messages, decisions in transient PR comments), move it to the right one in the same commit batch.

  **Source-of-truth table** (the authoritative home for each concern):

  | Concern | Authoritative file |
  | --- | --- |
  | Every task + sub-task + checkbox state + dependencies + paused-conditions | [`specs/tasks.md`](specs/tasks.md) |
  | Campaign-PR queue + per-PR status + scopes + deferrals (as sub-tasks) | [`specs/tasks.md`](specs/tasks.md) (Task 23 tracker section) |
  | Per-PR narrative + meta-lessons + retrospectives | [`docs/journey/build-log.md`](docs/journey/build-log.md) |
  | HOW things work (architecture, schemas, validators, v0.1.x candidates §16) | [`specs/design.md`](specs/design.md) |
  | WHAT must ship (FRs, NFRs, acceptance criteria) | [`specs/requirements.md`](specs/requirements.md) and [`specs/requirements-revisions-proposed.md`](specs/requirements-revisions-proposed.md) (FR-28+) |
  | Architectural decisions | [`docs/adr/`](docs/adr/) |
  | External citations + verification status | [`docs/SOURCES.md`](docs/SOURCES.md) |
  | Domain terms (glossary wins when docs disagree) | [`specs/glossary.md`](specs/glossary.md) |
  | Diagnostic table | [`HEALTH-CHECKS.md`](HEALTH-CHECKS.md) |
  | Research notes (one per finding) | [`docs/research/`](docs/research/) |
  | Chronological decision/issue/bug/fix paper trail (the spine that ties the others together) | [`docs/journey/DECISION-LOG.md`](docs/journey/DECISION-LOG.md) |
  | **User-facing capability surface (what the kit can do, for a new user)** | [`README.md`](README.md) "What it does" + "CLI" sections AND [`packages/cli/README.md`](packages/cli/README.md) (the npm landing page) |
  | **Per-release "what shipped" record** | [`CHANGELOG.md`](CHANGELOG.md) |
  | **Which version each task ships in (release lanes + the one-differentiator-per-minor rule)** | [`docs/RELEASE-PLAN.md`](docs/RELEASE-PLAN.md) |
  | Stable project rules + verification disciplines + working style + anti-patterns | this file (`CLAUDE.md`) |
  | Test count / suite state | **Not tracked.** Derived from `npm test`. Snapshot, not state. |

  **Things that are NOT state** (do not track in any file): test pass/fail counts, "we're at this PR right now" mid-session breadcrumbs, intermediate-todo lists. State has a half-life — if it's true forever it's a rule (`CLAUDE.md`), if it's true until-it-changes it's a tracked artifact (`tasks.md` / `design.md` / etc.), if it's only true this session it's not state at all.

  References: 2026-05-27 methodology refactor when the user surfaced the CLAUDE.md "Current state" section as volatile-state-in-a-rules-file (state had been duplicated across CLAUDE.md + tasks.md + journey log, with tasks.md lagging behind PR shipments). The refactor: tasks.md absorbed the campaign tracker as Task 23.9-23.15 sub-tasks; CLAUDE.md kept only RULES and pointed at tasks.md for status; the journey log kept narrative + retrospectives. **This is binding going forward**, not a one-time cleanup.
- **Decision-log discipline (binding).** Maintain an append-only chronological paper trail at [`docs/journey/DECISION-LOG.md`](docs/journey/DECISION-LOG.md) of every **decision / pivot / issue / bug / fix**. Two halves, both binding:
  1. **Read before re-opening.** Before recommending a change to ANY previously-made choice — plan, scope, architecture, priority — search the decision log (+ the relevant findings/spec docs) for it. If it's recorded as **SETTLED**, do not re-litigate it; execute it. You may revisit a settled decision ONLY with *new evidence*, and you must say so explicitly: "this revisits SETTLED decision D-N because (the new evidence)." A recommendation that contradicts a settled line WITHOUT new evidence is a bug in the same class as citing a wrong source — it answers from faded in-context memory instead of the durable record.
  2. **Append after deciding.** When anything durable is decided or learned, append an entry in the SAME commit batch (newest block at top). Entry types: DECISION / PIVOT / ISSUE / BUG / FIX / NOTE. The decision log is the chronological spine; stable rules still graduate to this file, task state to `tasks.md`, per-PR narrative to the build log — the log ties them together with dates + rationale.
  3. **Record the decision + rationale, not the conversation.** Log WHAT was decided and WHY it holds — not how the topic came up, who said it, or the incidental example that sparked it (a random googled project, "the first thing that came up"). That provenance is noise, not signal (the user 2026-05-30: *"you want to mention the bus driver that drove me home too?"*). Quote the user only when their words ARE the rule (a working-style directive), never to credit a trigger. Terse over complete.

  **Why this is binding (the precedent):** 2026-05-30, the assistant recommended re-opening the already-settled "build v0.2 vs. v0.1.3 patch-sweep" decision, reasoning from in-context memory rather than reading [`v0.1.1-self-test-findings.md`](docs/journey/v0.1.1-self-test-findings.md) §"COMMITTED ROADMAP" (which recorded the decision the same day). The user: *"please write down all decisions… so if context fills up or this session ends prematurely we have a paper trail… we will not have this problem again that you decide something against an already decision line we are already into."* This is the cross-session-amnesia failure the whole kit exists to kill — applied to our own build process. The decision log is the workaround until the kit dogfoods itself (Task 52).
- **Cross-platform command discipline (binding).** Every user-facing shell command emission — whether emitted programmatically by kit code (`recoveryCommand` fields, `cmk doctor` HC-* repair output, `cmk repair` self-repair hints, error-message "run X to fix" lines, install / uninstall completion paths, audit-log action hints) OR written into docs (README install instructions, `SETUP.md` repair commands, `HEALTH-CHECKS.md` recovery hints, `design.md` user-facing shell snippets) — must work on the user's native shell across **Windows + macOS + Linux**. The failure mode: a Windows user on stock cmd.exe pasting `rm "..."` gets "command not found"; the kit's job is to emit `Remove-Item "..."` for them instead. Programmatic emissions delegate to [`packages/cli/src/platform-commands.mjs`](packages/cli/src/platform-commands.mjs) (or carry an explicit `// platform-commands: ignore <reason>` marker for legitimate platform-specific contracts like the Windows-`schtasks`-vs-POSIX-`cron` branches in `register-crons.mjs`). [`scripts/validate-platform-commands.mjs`](scripts/validate-platform-commands.mjs) structurally enforces this on every `npm test`. Doc-side emissions are reviewer discipline (no automated validator scans markdown for POSIX shell snippets — too many false positives on legitimate code-block examples). The rule fired three times in the post-PR-31 audit campaign: PR-B (the `recoveryCommand` finding surfaced the class), PR-E (this campaign Part 7/7 generalized PR-B's inline fix into a shared helper + validator), and an open follow-up tracked at design §18 (clean up the legacy `auto-extract-memory.sh` references in docs — Task 23 already replaced the .sh file with `cmk-auto-extract.mjs`; the doc references are stale, not a runtime hazard).
- **Name privacy (binding).** This repo is public. **Never write the maintainer's real name into committed/public docs** — use **"the user"** (working-style quotes, decision-log attributions, findings) or **"the maintainer"** (copyright/credit), and **"live-test"** for run labels (not a name-based label). Applies to new DECISION-LOG entries, journey/research notes, ADRs, commit-message bodies, and code comments. **The ONE allowed home for the real name is the author/copyright metadata** — `LICENSE` + the `plugin.json` / `marketplace.json` / `pyproject.toml` author fields (the maintainer's deliberate public authorship — D-102 / the user's 2026-06-09 call); [`validate-maintainer-name-confined.mjs`](scripts/validate-maintainer-name-confined.mjs) enforces that the name appears NOWHERE ELSE in any tracked file. Precedent: the 2026-06-04 corpus-wide de-identification sweep (D-51) replaced 537 occurrences across 54 .md files **but missed code / scripts / tests** (extended in Task 122, 2026-06-09); without the rule + the guard the next session re-introduces the name (e.g. writing `<the-name>: "…"` into the decision log) and silently undoes the scrub. Scope is the NAME only; gendered pronouns and the git-commit author identity are out of scope (the user controls their own git config). When quoting the user, attribute to "the user".
- Verification status (`✓` / `~` / `✗`) is tracked in [`SOURCES.md`](SOURCES.md).

## Engineering discipline (binding)

**Test-driven development.** Always:

1. Write the test first (the public-contract boundary test).
2. Watch it fail.
3. Implement the code until tests pass.
4. Never change the test to make it pass. Change the code.

**Boundary testing** (per Ousterhout, *A Philosophy of Software Design*):

- Test the **public interface** of each module. Not the internal helpers.
- A good test survives refactors. If a refactor breaks a test that was testing the contract, the refactor broke the contract — that's the test working.
- The test for `writeFact()` checks what file lands where with what frontmatter. NOT how `_parseFrontmatter()` happens to handle YAML.

**The five exit doors** (per Goldberg's *nodejs-testing-best-practices*) — when writing a test, walk this checklist and assert every applicable door:

1. **Response** — what does the public function return? (action / errorCategory / id / path / …)
2. **State** — what changed on disk / in the audit log / in the scratchpad / in the tombstone archive?
3. **External calls** — what subprocesses got spawned with what argv + env? (use the spawn-smoke pattern from design §17 for the real-binary side)
4. **Observability** — what NDJSON entry landed in the right log with the right shape? (audit.log, extract.log, compress.log, poison-guard.log)
5. (Message queues — N/A for the kit; no MQ surface.)

Most kit tests assert (1) and (2). The ones that miss (3) or (4) are the ones where a future bug ships silently. Pin all four whenever they apply.

**Over-mutation guard** — for any operation that mutates a subset of state (remove one bullet, replace one fact, tombstone one observation), the test must assert *the other records are untouched*. Seed N records, mutate one, assert N-1 remain. Goldberg calls this "test undesired side effects (delete-one doesn't delete-all)" and it catches off-by-one splices, wrong-section walkers, and over-eager regex matches that happy-path tests miss because the matched record disappears as expected. Specific instance: `tests/cli-memory-write.test.js` has explicit over-mutation tests for `remove` and `replace`.

**Walk all four doors before considering a test "done"** — when writing a new test or opening an existing test file, explicitly run through the five-exit-doors checklist (Response / State / External calls / Observability / [Queues — N/A]) and pin every door that applies. Doors 3 and 4 are the ones future bugs hide behind when missed — Door 3 (external calls) because mock-only tests miss spawn-layer breakage (the PR #22 lesson), Door 4 (observability) because NDJSON log assertions are the audit trail for production debugging.

**Integration-test coverage for cross-module flows** — when two kit modules compose at runtime (e.g., `memory-write` → `conflict-queue`; `auto-extract` → `memory-write`; `Stop hook` → `capture-turn` → detached `auto-extract`), at least one test MUST exercise the full integration path. Per-module unit tests verify each surface in isolation but routinely miss call-shape contracts at the boundary. Precedent: Task 25's `generateId({text, tier})` named-args bug shipped latent because every queue-route test bypassed `memory-write` and constructed `writeConflictEntry` directly; Task 25b's `mergeScratchpadBullets` integration test was the first to exercise the real call chain. Full content + the v0.1.x validator candidate in [`design.md §17.8`](specs/design.md).

**Caller-map BOTH ways before changing a shared function (binding).** Before editing any function used outside its own file — signature, required args, return shape, OR behavior — build the impact map in **both directions, first**, and update everything in the SAME change:

- **TO it (callers)** — `grep "fnName("` across `src/` (minus the definition). These break if you change the *contract*. Every caller gets updated or the change isn't done.
- **FROM it (callees)** — what the new body now depends on (new imports, helpers, globals). These must exist + be in scope.

Do this **before** the edit, not after a red suite. Precedent (2026-06-01): the `installTier` placeholder fix added a required `vars` arg but missed the `initUserTier` caller → `cmk init-user-tier` crashed; the full suite caught it, which is the expensive path. The retroactive caller-map confirmed the break — but run upfront it would have caught it for free. (And the verification grep itself had a multi-line-import false-negative — a token grep is a starting point, not proof; read the actual call sites.) This is the same class as the composition rules above, applied at edit time rather than test time.

**Deep modules with simple interfaces:**

- Wrap related code into broad modules that expose narrow surfaces.
- Don't fragment cohesive logic into many shallow helpers.
- Example: `install.mjs` is one module with one public boundary (`install({ ... })`) backed by ~10 internal helpers.

**Incremental build:**

- Each task produces working, integrated code. No orphaned code.
- After any sub-task, the codebase should still pass all tests.

**Test fixture IDs must pass `ID_PATTERN`** — enforced via [`scripts/validate-test-ids.mjs`](scripts/validate-test-ids.mjs), wired as a pre-test step in `npm test`. Use only the kit's base32 alphabet (excludes `0`, `O`, `1`, `l`, `I`, `8`) or copy a real id from [`fixtures/canonicalize-vectors.json`](fixtures/canonicalize-vectors.json). For tests that deliberately use a malformed id (e.g. asserting `readBullet` rejects bad input), add `// validate-test-ids: ignore` on the same line.

**Shared modules** (established post-Checkpoint-11, 2026-05-24):

When implementing new task modules under [`packages/cli/src/`](packages/cli/src/), use the shared helpers — don't roll your own:

| Concern | Use this module | Don't |
| --- | --- | --- |
| Tier path resolution (`P/L/U`, projectRoot, userDir) | [`tier-paths.mjs`](packages/cli/src/tier-paths.mjs) | Re-derive `homedir() + .claude-memory-kit` inline |
| Frontmatter read/write (YAML in fact files, HTML-comment in scratchpads) | [`frontmatter.mjs`](packages/cli/src/frontmatter.mjs) (js-yaml–backed) | Write a "tiny shallow split-on-colon" parser |
| Audit-log appends (any mutating operation) | [`audit-log.mjs`](packages/cli/src/audit-log.mjs) — `appendAuditEntry()` | `appendFileSync` to `.locks/audit.log` directly |
| Error / result shape | [`result-shapes.mjs`](packages/cli/src/result-shapes.mjs) — `errorResult()` / `notFoundResult()` + `ERROR_CATEGORIES` enum | Hand-roll `{action: 'error', errorCategory: 'schema', ...}` per file |

Why: the Layer-2 review surfaced 4 modules independently reimplementing the same helpers with small variations — drift was already producing bugs (e.g. `INDEX.md` not filtered from one writer's dedup scan; audit-log shape divergence across writers). Future Layer 3/4/5/6 modules import from these shared sources. See [design §1.3](specs/design.md) for the architectural note and [glossary](specs/glossary.md) entries for [[Audit log]] + [[Result shape]] + [[Provenance frontmatter]].

## Prose rules vs enforcement (binding)

This codebase has two kinds of rules:

1. **Structural rules** — the rule has a deterministic shape that code can check: "every `spawn()` site has a `timeoutMs` argument", "every test file has a `// @doors:` header", "every reference like `ADR-NNNN` resolves to a file under `docs/adr/`". These get **validators** in `scripts/validate-*.mjs` wired into `npm test` as pre-test steps. Drift is caught at lint time, not when it ships.
2. **Judgment rules** — the rule's enforcement requires context the validator can't see: "Did you check the primary source?", "Did you ask the trigger question before codifying?", "Is this an instance of the lazy-framing class?". These stay as prose in CLAUDE.md and rely on the **code-review-excellence** ONE-holistic-pass-per-PR discipline (see "Skill agency" section).

**The validators that exist** (post-PR-31 audit campaign Part 4 / PR-D1):

| Validator | What it enforces | Source rule |
| --- | --- | --- |
| [`scripts/validate-test-ids.mjs`](scripts/validate-test-ids.mjs) | Every `[PUL]-XXXXXXXX` token in tests uses the kit's base32 alphabet (excludes `0`/`O`/`1`/`l`/`I`/`8`) | "Test fixture IDs must pass `ID_PATTERN`" (Engineering discipline) |
| [`scripts/validate-template.mjs`](scripts/validate-template.mjs) | The `template/` scaffold has every required dir + file, none empty; per-tier cap-coordination invariant (design §7.1) holds | "Snapshot cap composes with per-file caps" (Composition verification, instance #3) |
| [`scripts/validate-exit-doors.mjs`](scripts/validate-exit-doors.mjs) | Every test file has a `// @doors: <list>` header; doors not declared are explicitly marked `// Door N N/A: <reason>` | "Five exit doors framework — discipline is never silent omission" (design §17.1; Goldberg attribution in SOURCES.md). Warning mode during PR-D2 annotation pass; strict mode after (`CMK_DOORS_STRICT=1`). |
| [`scripts/validate-references.mjs`](scripts/validate-references.mjs) | Internal references (file links, ADR-NNNN, §N.N in design.md, FR-N, NFR-N, Task N) resolve to real anchors in the kit corpus | "Internal cross-references are subject to the same primary-source verification" (Verification rules, 10th) |
| [`scripts/validate-node-parse.mjs`](scripts/validate-node-parse.mjs) | Every `packages/cli/src/*.mjs` module imports under REAL Node in the npm-test prerun (vitest/esbuild parses leniently; a SyntaxError shipped to main through that divergence + lazy CI imports + grep-filtered test output - the cut-gate9 H1 crash) | "Live-test every task" applied to the parse engine itself (D-126) |
| [`scripts/validate-doc-completeness.mjs`](scripts/validate-doc-completeness.mjs) | Every CLI verb has a CLI.md heading; every MCP tool + zod param appears in MCP.md; deferral phrases ("not yet shipped/implemented") in user-facing docs require an allowlisted reason (both directions — stale entries fail too) | "Document user-facing capabilities in the same PR" made structural (the 2026-06-10 audit class — D-120) |
| [`scripts/validate-pack-completeness.mjs`](scripts/validate-pack-completeness.mjs) | Every canonical `template/` file ships in the npm tarball (`npm pack --dry-run --json` vs the tree) — a dropped template file scaffolds-silently-absent for every npm user | The cut-gate9 `npm notice` scare (Task 135 / D-141) — converts the manual `tar -tzf` eyeball into a structural guarantee |

**The PR-D2 validators all shipped** (`validate-spawn-discipline.mjs` / `validate-numbering-gaps.mjs` / `validate-composition.mjs` — modes in design §17.7; this section listed them as "coming" until Task 137's 2026-06-12 sweep reconciled it). **Task 137 added three more**, each converting a gate-found seam class into a structural check:

| Validator | What it enforces | Source rule |
| --- | --- | --- |
| [`scripts/validate-prompt-assertions.mjs`](scripts/validate-prompt-assertions.mjs) | Every LLM-spawn site's test pins WHAT IS SENT — the `@door-3.5:` marker + actual input/instructions assertions (two-factor) | "Door 3.5" (design §17.9) — the D-122 dedup-self-poisoning class |
| [`scripts/validate-budget-pairs.mjs`](scripts/validate-budget-pairs.mjs) | Every documented numeric budget has an at-cap + over-cap test pair, or a written suppression (registry-driven) | design §17.10 — the D-124 clipped-fact class (budgets fail at their edges) |
| [`scripts/validate-skill-allowlist.mjs`](scripts/validate-skill-allowlist.mjs) | Every scaffolded skill has its `Skill(<name>)` KIT_ALLOW entry, both directions | The D-123 class (fired twice: Task 90, Task 75.1) |

Plus the gate-side (not prerun) trend check: [`scripts/extract-trend.mjs`](scripts/extract-trend.mjs) (`npm run trend:extract`) — fails a live run whose `nothing_durable` rate crosses the systemic-suppressor threshold (design §17.11; the D-122 detection gap).

When a prose-only rule turns out to have a structural shape, **the move is to write the validator, not to add another prose paragraph**. Prose accumulates faster than discipline; structural enforcement catches drift on every run.

### Adoption-verification sub-rule (PR-D)

When the kit adopts an external thing — a library, a framework, a convention, a skill — the adoption must be justified by **concrete evidence**, not by feel. Use the template below per invocation. "It felt useful" is the lazy framing this campaign exists to eliminate.

```text
Adopted: <name>
What it provided (concrete): <specific artifact, citation, finding, regex, template, etc.>
What I would have done without it (counterfactual): <estimated alternative path + rough time estimate>
Verdict: helpful / neutral / not helpful
Reasoning: <one sentence — why the verdict>
```

**Evidence that counts as "helpful"** (any one is enough):

- Caught something I wouldn't have caught otherwise (specific finding).
- Produced a concrete artifact (validator regex, test template, checklist) I'd have built from scratch.
- Surfaced a primary source (citation, framework, repo) I'd have missed.
- Accelerated measurably (saved ~X hours via concrete template).
- Failed usefully (wrong output that I caught, forcing a verification check that surfaced something).

**Does NOT count**: "It felt useful." "It produced what I would have produced anyway." "It helped me think about the problem."

Applies beyond skills — to libraries, tools, conventions, anything the kit adopts. Negative-result audit notes ("invoked X, neutral outcome, reasoning: …") are valuable data, not failures.

## Workflow

- **Two-pass code-review discipline (binding)** — every PR gets BOTH a self-review AND a `code-review-excellence` skill pass before merge. The two passes catch different bugs because they anchor on different mental models:
  - **Self-review** anchors on the implementer's understanding of the diff. Catches tactical bugs the implementer half-knew about but didn't surface (e.g., the chokidar v5 glob-drop in Task 29 — I knew chokidar v5 had breaking changes but didn't pin which until self-review forced me to verify).
  - **Skill-review** anchors on the diff in isolation. Catches composition-class bugs the implementer's mental model hides (e.g., Task 29's `parseObservationsFromFactFile` field-name drift from `writeFact`; Task 30's FTS5 parse-error class on `"user-explicit"` queries; Task 31's mk_remember `accepted:true` on queued route).
  - **Empirical evidence**: every PR in the autopilot Tasks 28-32 run had at least one bug caught by skill-review that self-review missed. Pattern documented across 5 PRs (#44, #47, #48, #49, #50). The high-risk Task 31 had 2 Blocking + 4 Important from skill-review on top of self-review's 1 finding.
  - **How to apply**: after tests + stress pass, do the self-review pass walking the five doors + shared-module discipline + spec compliance + drift hazards. Fix what self-review surfaces. THEN spawn a code-review-excellence subagent with the PR's full diff scope. Fix what skill-review surfaces. Both reviews documented in the PR body.
  - The user's directive 2026-05-28: *"maybe you should also do code review of your own not just the skill after every pr before merge"*. Binding for every PR from that point on.
- **Autopilot mode (when explicitly granted)** — The user may delegate multiple consecutive tasks with auto-merge authority. Pattern: *"do tasks N through M on autopilot, stop only for problems or my input, do code review after every task, automerge unless problems"*. When granted:
  - Implement → tests pass → stress pass (fast-mode 5/5 first invocation OR documented live-Haiku jitter exception) → self-review → skill-review → fix all findings inline (per "fix everything now") unless genuinely v0.1.x → update PR body → `gh pr merge <N> --squash --delete-branch` → pull main → housekeeping (flip task checkbox, journey log retrospective) → push to main → start next task
  - **Stop conditions** (autopilot pauses for the user's input):
    - Code-review-excellence surfaces a Blocking finding that needs the user's judgment to resolve (architectural fork, not a tactical fix)
    - Failing tests can't be root-caused
    - Architectural decision (library choice, API design) is a genuine fork — not the obvious pick
    - Anything that touches the user's system beyond the repo (cron registration via host scheduler, npm publish, git tag push, GitHub Actions workflow file changes)
    - Destructive operations (database wipe, branch force-push to main, etc.)
  - **NOT stop conditions** (autopilot proceeds inline):
    - Tactical implementation choices
    - Test design
    - Fixing every code-review finding (the user's standing "fix everything now" directive)
    - v0.1.x deferrals (documented in design §16 with explicit ship trigger)
    - Routine commits, PR opens, self-merges via `gh pr merge --squash --delete-branch`
- **Strict task-order discipline (binding)** — work tasks in tasks.md order (Task N → Task N+1 → Task N+2 → …). No skipping ahead unless one of two conditions fires:
  - **Dependency-forced**: the current task can't proceed without a later task's primitive. (Rare in this kit — dependencies are usually backwards-pointing, not forward.)
  - **Problem-forced detour**: a real problem surfaced (test gap, bug, spec drift, dependency conflict) that needs to be addressed before the current task can be merged.
  - **"OPTIONAL" is not a skip license.** Tasks 28-35 are marked OPTIONAL in tasks.md (Layer 5 + Layer 6 — search + cron). The mark means "kit ships v0.1.0 useful without them" — NOT "skip them in autopilot ordering." the user chose Option A for Task 33 (full cross-platform); the same standing pattern applies to all OPTIONAL tasks: ship the full feature set in numerical order.
  - **Why strict order**: (1) **Context locality** — Task N+1's primitives reuse the warm mental model from Task N (e.g., Task 34's cron context reuses Task 33's primitives; skipping then coming back forces re-deriving). (2) **Layer cohesion** — close a layer before moving to cross-cutting (closed-Layer-5 → Task 33 was clean; same pattern continues with closed-Layer-6 → Tasks 37-43). (3) **No dependency inversion** — Tasks 37-43 don't block on 34-35, but 34 builds on 33's primitives.
  - The user's directive 2026-05-28: *"do them by order, no skiping to other tasks unless you have to for the corrent task or you found a problem that needs a detour."* Binding for every task from this point on.
- **One PR per parent task** in tasks.md (1, 2, 3, ..., not sub-tasks). Branch: `task-N-short-name`. Squash-merge into main. Delete branch on merge.
- **Flip each sub-task checkbox the moment it ships, not at end-of-PR**. Binding. As soon as a sub-task is implemented + tested green, flip its `[ ]` → `[x]` in `tasks.md` in the same commit that ships it. Batching the flips for the end-of-task housekeeping commit is error-prone — Task 23 shipped with 23.8 unchecked even though the work was in PR #26, and only got caught when the user asked "did you really do all the tasks in 23?" mid-Task-24. Apply this to every task from Task 24 onward.
- **All tests run by the agent (Claude), not by a human.** "Tests are green" is your assertion; the user trusts that assertion until proven wrong.
- **Never invoke tests manually — always through an `npm run …` script.** Binding (the user 2026-05-26: *"please write all tests in scripts… never do tests manually"*). The repo provides:
  - `npm test` — full suite (one run, validate-test-ids + validate-template prerun, live-Haiku spawn-smokes enabled by default)
  - `npm run test:file -- <path>` — targeted single-file or specific-test-name iteration (skips the slow prerun; pass any extra vitest args after `--`, e.g. `-t "test name"`)
  - `npm run test:watch` — interactive vitest
  - `npm run stress` — 5x full suite, refuses to run if `CMK_SKIP_LIVE_HAIKU=1` is set; this is the gate before opening any PR whose surface touches spawn boundaries, detached children, hook handlers, or anything else where concurrency-class flakes hide. **Logging is ALWAYS ON (D-68):** every run writes a per-run vitest json result file to `.stress-logs/<stamp>_run-N.json`, and on failure the runner parses it and prints the failing test names — so a flaky run is never undiagnosable (the 2026-06-05 Task 92 4/5 whose failing run predated logging is the precedent this kills). The json is a side channel (no TTY/timing change, unlike a stdout tee). `CMK_STRESS_LOG=1` is now the DEEP opt-in that ALSO tees full stdout (slower, needs bash) for crashes / prerun failures the json can't capture. **Gate met = 5/5 on the first stress invocation, OR — for the documented live-Haiku external-API jitter class only (PR #28's queued retry-on-timeout followup) — first run 4/5 followed by two consecutive 5/5 runs.** The two-consecutive-clears clause is narrow: it applies ONLY when the failing test (now NAMED in the json) is in the known live-Haiku jitter set (timeouts / 5xx / network blips during `claude --print` spawn-smokes), and it does NOT apply to any other flake class (Windows cold-start, lock contention, fixture races, etc.). For any non-jitter flake, the gate is 5/5 on the FIRST invocation — fix the flake or surface it as a PR blocker. Documented as PR-D1's gate-meeting precedent 2026-05-26. **Standalone `npm test` / `test:file` also always-log** to `.test-logs/last-run.json` (vitest.config json reporter; both dirs gitignored).
  - `npm run lint:test-ids` / `npm run validate:template` — individual prerun pieces
  - **Do not** type `npx vitest run …` directly; use `test:file`. **Do not** type `for i in 1..5; do npm test; done`; use `stress`. **Do not** set `CMK_SKIP_LIVE_HAIKU=1` to save round-trips; if a script's too slow, fix the script. The rule's job is to make the next-session-me invoke the same flow as this-session-me, without re-deriving it. New common invocations get a new `npm run` script, not a new shell habit.
- **PR title format**: `[N] <description> (T-NNN)` (T-NNN is the legacy ID; current convention is the bare number).
- **PR description ends with**: `_Implements: FR-X; design §Y_` traceability footer.
- **Commit co-author trailer = model-NEUTRAL (binding, the user's 2026-06-13 call).** End commit messages with `Co-Authored-By: Claude <noreply@anthropic.com>` — NOT a versioned form (`Claude Fable 5` / `Claude Opus 4.8` / etc.). This OVERRIDES any version-specific default-trailer convention from the harness system prompt. Why: the active model switches mid-session via `/model` (this session ran both Fable 5 and Opus), so a hardcoded version string is wrong on every commit made under a different model; the git author identity is already model-agnostic, and the trailer means "Claude co-authored this," not a per-commit model attribution. Already-merged commits carrying a versioned string are left as-is (rewriting merged history isn't worth it). D-140.
- **Document user-facing capabilities in the same PR that ships them (binding).** Any PR that adds or changes something a USER can see or run — a new `cmk` subcommand/flag, a new automatic behavior, a new capability — MUST update, in that same PR: (a) the **README capability surface** ([`README.md`](README.md) "What it does" + "CLI", and the npm-landing [`packages/cli/README.md`](packages/cli/README.md)), and (b) the **CHANGELOG** under a `## [Unreleased]` (or the next version) heading. The README is the kit's front door + npm landing page; a capability that ships without a README line is invisible to the people it's for. **Timing nuance (the honesty half):** the README describes what the *published/shipping* version does — document the feature as it merges (README-on-main reflects merged-pending-release; the npm page catches up at publish), but never write up an unshipped/unmerged feature in the README as if it's already live (same class as the lazy-framing rule, applied to docs). Internal-only changes (refactors, validators, test scaffolding, shared-module plumbing) do NOT need a README line — only user-visible capability does. Precedent: the user 2026-05-30 — *"if we add new feature and capabilities to our kit we should put it in readme… features in readme as an explanation what the kit can do"*; surfaced live drift (v0.1.2 shipped `cmk remember` but the README "What it does" still only named the old `memory-write` skill). D-17.
- **Cutting a release — use the mechanic, don't hand-edit (binding).** You edit ONE file during PRs: `CHANGELOG.md`'s `## [Unreleased]` section (scope-prefixed bullet + PR link per entry). To release: **`npm run release -- <patch|minor|major | X.Y.Z>`** ([`scripts/release.mjs`](scripts/release.mjs)) finalizes `[Unreleased]` → `## [X.Y.Z] — date`, resets a fresh `[Unreleased]`, and bumps `packages/cli/package.json` in lockstep (exactly the version drift the v0.1.2 release-verification failure caught). Review the diff, commit, then push the `vX.Y.Z` tag (your outward-facing step) → [`publish.yml`](.github/workflows/publish.yml) runs the suite, publishes npm with provenance, AND creates the GitHub Release from the same CHANGELOG section (`scripts/print-release-notes.mjs`). **Do NOT** hand-bump the version, hand-write release notes, or `gh release create` manually — the file is the single source; the mechanic generates the rest. Upgrade path (deferred, with trigger): if many parallel contributors ever make the single `[Unreleased]` section merge-conflict, switch the INPUT to per-PR `.changes/*.yaml` fragment files — the generator/output contract is unchanged. D-18.
- **After merge**:
  1. Pull main locally.
  2. Flip the task's checkboxes in `tasks.md` from `[ ]` to `[x]`. Annotate the parent task with `_shipped YYYY-MM-DD, PR #N_`.
  3. Append a task entry to the journey log under §6 — Implementation.
  4. Commit + push (direct to main, no PR for docs updates).
  5. Start the next task on a fresh branch off main.

## Anti-patterns (user has pushed back on these)

- **Over-engineering**. MCP auth tokens for a stdio-only local server; splitting one PR-sized task into 8 micro-PRs; "what if we also add X" detours. Don't. If the user wanted X, they'd ask.
- **Ceremony**. Excessive `AskUserQuestion` use; listing 4 options when you should just pick one; preamble before action.
- **Overstating commits**. Don't claim things are in a commit if they aren't. Read the actual diff before writing the commit message.
- **Fix the test, not the code**. If a test fails, the answer is almost always to fix the code. The exception is when the test is genuinely wrong — and in that case, say so explicitly and explain why.
- **Lazy framing hides real bugs — multi-sided rule.** Binding. Dismissive framings like "known flake", "expected fail", "doc consistency", "I'll fix it later", "skip live-X to save round-trips", "low-signal", "amortize across future PRs" hide real bugs four times out of four in this build's history. The pattern is multi-sided: the framing can come from the implementer (in a PR body), the reviewer (in a review summary), or the merger (accepting a PR whose body carries one of those framings without pushing back at merge time). When you are any of those three roles, your job is to push back at the other two:
  - **As implementer**: do not write a disclaimer into a PR body to make the merge easier. Either fix the root cause, or open the PR explicitly flagged for the user's decision — never both green and disclaimed.
  - **As reviewer**: when a review surfaces something that *looks* low-signal, check whether the framing itself is doing the work. "Amortize later" / "stylistic noise" / "long tail of low-yield audits" are exactly the framings that mask high-leverage gaps in the audit's head.
  - **As merger** (the user, or anyone with merge rights): treat any "known / expected / non-blocking / low-signal / amortize / skip" phrasing in a PR body or review summary as a blocker until you understand WHY it's there. Three of this build's four instances shipped because the merge step accepted a disclaimer; the bug surfaced from the next problem the disclaimer caused, not from the merge being independently wrong.

  Four instances in this build:
  1. **PR-22 plugin layout** — design.md §5.1 wrote the plugin manifest under `plugin/.claude-plugin/hooks/` because of "convergence across third-party plugins" framing (implementer-side). Anthropic's primary docs put it at `plugin/hooks/`. Plugin failed to load in the live test.
  2. **PRs #22 + #23 "known cli-capture-turn flake"** — both PR bodies carried `(known cli-capture-turn flake under full-suite concurrency on Windows; 15/15 in isolation)` (implementer-side). Both merged with the disclaimer (merger-side acceptance). The PR-29 audit then surfaced four flakes of the same Windows-cold-start class, not one.
  3. **PR-28 `CMK_SKIP_LIVE_HAIKU=1`** — habit of setting the skip env var locally to save Haiku round-trips (implementer-side habit during testing). The skip hid a real prompt-engineering bug where Haiku interpreted the compression directive as system-prompt configuration. Surfaced only on the first non-skipped full-suite run.
  4. **PR-30 audit "amortize across future PRs"** — my own reviewer-side framing on whether to do the four-doors audit upfront vs. opportunistically (reviewer-side). The "low signal on long tail" frame was load-bearing on the punt; would have shipped 11 missing-assertion gaps across the audited files.

  The user's note (2026-05-26): *"I'm also the one who merged PRs #22, #23, and #28 WITH the disclaimers in the bodies. The pushbacks came after merge, in response to the next problem the disclaimers caused. So the accept-at-merge step is where these actually shipped — and that's me."* This is the multi-sided point. Both Claude and the user can be the source of dismissals or the gate that lets them ship; the discipline is mutual.
- **Padding**. Don't repeat the user's question back. Don't explain what you're about to do unless it's non-obvious. End-of-turn summaries should be 1-2 sentences.

## Skill agency (binding — don't make the user the orchestrator)

Skills are **your tools, not the user's commands**. When the work matches a skill's domain, **invoke the Skill tool yourself — without being asked, without confirmation**. The user shouldn't have to say "use python-pro for this" any more than they should have to say "use the Read tool for this." Implicit agency on skills mirrors implicit agency on tools.

Mapping for this project (invoke proactively at the start of the task or sub-task that matches):

| Work domain | Skill to invoke |
| --- | --- |
| Writing Python code | `python-pro` |
| Writing pytest tests | `python-testing-patterns` |
| Reviewing a PR (yours or the user's request to review) | `code-review-excellence` |

Concrete rule: at the start of a task whose sub-tasks include the domain above, call the Skill tool BEFORE writing the code or doing the review. Example: Task 5.3 (Python implementation of canonicalize) → invoke `python-pro` first. Task 5.6 (writing pytest cases) → invoke `python-testing-patterns` first.

**ONE holistic `code-review-excellence` pass per PR, not fragmented.** When a PR's surface includes multiple concerns (e.g., a new module + spec docs + tests + a separate SKILL.md), the review covers all of it in one pass — integration risk concentrates across the whole change. Per the user's Task 24 launch instruction: *"ONE holistic code-review-excellence pass on the whole Task 24 PR. NOT a separate pass for SKILL.md alone. The SKILL.md, the Poison_Guard regex catalog, the routeHigh integration in auto-extract.mjs, and the trust-routing logic all need to be reviewed together — integration risk concentrates across the whole change, and fragmented review re-derives context anyway."* Same applies to every campaign PR — call the skill once with the full PR diff as scope, get one consolidated findings table.

**`memory-write` — superseded note (decision trail):**

- **Original rule (pre-2026-06-10):** the PREDECESSOR memory-write skill was banned from auto-triggering here — it wrote to `~/.claude/projects/<slug>/memory/`, the wrong location for this project.
- **Dogfood pivot 2026-06-10 (Task 52, D-108):** `cmk install` now runs on this repo, and the scaffolded `memory-write` skill in `.claude/skills/` is the KIT'S OWN (routes through `cmk remember`/`mk_remember` → the in-repo `context/` + Poison_Guard). It IS allowed — and expected — to trigger. The old ban's rationale (wrong location) no longer applies; only the kit's safe write path is permitted either way (never hand-edit memory files).

## On memory in this project (mental model)

The memory model the kit is building (and the model these notes are written under):

- **Auto-extract is the default.** Future-Claude takes notes naturally based on what's worth noting. The user does not need to say "remember this." See [`specs/design.md`](specs/design.md) §6.0 for the full mental model.
- **User phrase triggers are an override**, for cases where the user wants immediate explicit capture.
- **Original interim workaround (pre-2026-06-10):** until the kit dogfooded itself, durable facts were captured into the journey log via explicit `Edit`s — the kit's own auto-extract wasn't running on this repo.
- **Dogfood pivot 2026-06-10 (Task 52, D-108): the kit now runs on its OWN repo.** `cmk install` is live here — `context/` scaffolded + seeded, hooks fire (Stop auto-extract, SessionStart inject), MCP server registered. Durable facts arising in conversation are captured via **`cmk remember` / `mk_remember`** (rich `--why`/`--how` for decisions) or by auto-extract — never by hand-editing memory files. The DECISION-LOG + journey log remain the authoritative paper trail per the source-of-truth table; the kit's memory is the session-start recall layer over them. **Public-repo deviation (D-108):** `context/transcripts/` + `context/sessions/` are gitignored here (raw conversation content, name-privacy class); the curated tiers commit as designed.

## Current state

**For status (task list, completion state, what's next, what's paused, why): see [`specs/tasks.md`](specs/tasks.md).** That file is the single source of truth for everything-task-related. Look at Task 23's sub-tasks (especially 23.9-23.15) and the "Post-PR-31 audit campaign tracker" section near Task 23 for the in-flight campaign.

**For narrative (per-PR retrospectives, why decisions were made, meta-lessons): see [`docs/journey/build-log.md`](docs/journey/build-log.md).**

**This file (CLAUDE.md)** holds the project's stable RULES — verification disciplines, engineering conventions, working style, anti-patterns, campaign rules that apply to any future multi-PR campaign. State that changes per-PR (tests-green count, what's merged, what's next) is intentionally NOT in this file; it would create commit noise on the rulebook every PR transition.

## Campaign rules (apply to any future multi-PR audit campaign)

- **No parallel campaign PRs.** Per the original campaign launch: *"Each PR opens AFTER the prior PR merges. No parallel work on this campaign — the audits in each class touch overlapping files and parallel PRs would conflict."* Sequencing is strict: PR-A merges → PR-B opens; PR-B merges → PR-C opens; etc. The only exception is direct-to-main docs commits (tracker updates, meta-rule additions, future-work entries) which are docs-only and don't touch the campaign-PR branches' diffs — those CAN happen while a campaign PR is in flight, as demonstrated by the post-PR-32 tracker write and the post-PR-C bundle (`dd1f25e`).
- **If an audit surfaces an unanticipated category, open another PR in the campaign rather than bundling.** Per the original launch: *"If any PR's audit surfaces a class-7-class-8 unanticipated category, open a fifth PR in the campaign rather than bundling into the current one. Each PR stays focused."* This rule fired three times in the post-PR-31 audit campaign — twice reactively (PR-B → PR-E for cross-platform; PR-D → PR-D1 + PR-D2 for session budget) and once proactively (PR-D2 → PR-D2a + PR-D2b for session budget, pre-launch). Once a meta-rule is named explicitly, the next instance gets caught earlier.

## Working-product milestone

The kit doesn't become usable until **Task 23** (auto-extract subagent + memory-write skill). Tasks 1-22 lay foundations. Honest with the user about this — they accepted the trade-off (architecture-first vs Cursor's MVP-first ~22-hour scope). Don't apologize for it; it was a deliberate choice.

## When in doubt

Re-read the journey log. If still in doubt, ask the user with one specific question — not four bullet-pointed options.
<!-- claude-memory-kit:start v0.2.4 -->
## Memory System — claude-memory-kit

This project uses **claude-memory-kit** for per-project, in-repo memory that survives session boundaries. Memory lives in `context/` (committed) and `context.local/` (gitignored). Cross-project memory lives at `~/.claude-memory-kit/` (or `$MEMORY_KIT_USER_DIR`).

> This block is the runtime contract for the kit. `cmk doctor` reports which layers are active in your install. Docs: <https://github.com/LH8PPL/claude-memory-kit>

### Where memory lives

| Tier | Path | Travels with `git clone`? |
| --- | --- | --- |
| **User** | `~/.claude-memory-kit/` | No — machine-local, cross-project |
| **Project** | `<repo>/context/` | **Yes** — committed |
| **Local** | `<repo>/context.local/` | No — gitignored, per-machine |

Precedence at session start: local > project > user (most-specific wins, others are logged as shadowed).

### How memory works

- **Session start** — the kit injects a frozen snapshot (≤10 KB) from the three tiers into Claude's context. Loaded once, never mutated mid-session — preserves the prefix cache.
- **During the session** — durable facts get captured automatically by the Stop hook + `memory-write` skill (once Layer 4 is live). The user can also explicitly say "remember this", "from now on", "we decided X".
- **End of session** — the rolling-window pipeline compresses `sessions/now.md` into a daily summary. Cron jobs distill into `recent.md` and `archive.md` over time (Layer 6, optional).

### Health checks (when `cmk doctor` is live)

The `cmk doctor` health checks verify each layer is wired correctly: install integrity, hook registration, transcript capture freshness, INDEX accuracy, cron registration, semantic search backend, native Auto Memory coexistence, and stale locks. Full design + decision records: <https://github.com/LH8PPL/claude-memory-kit>.

### Recalling memory (for Claude)

The snapshot injected at session start is a **bounded hot index, not everything** — there is a deeper, queryable archive. When a question is "what did we decide / what's our X / how does the user work / what's the setup," **query your memory instead of re-deriving the answer from scratch**:

- **`cmk search "<topic>"`** — find any captured fact (decisions, preferences, config, lessons) across the project + user tiers.
- **`context/memory/<type>_<slug>.md`** — the granular fact archive with full **Why / How** rationale (`context/memory/INDEX.md` lists them).
- **`~/.claude-memory-kit/` (`USER.md` / `HABITS.md` / `LESSONS.md`)** — how this user works across *all* their projects.

Reach for these *first* — re-deriving an answer the project already recorded (by re-reading files, re-searching, or working it out again) wastes the memory that exists precisely so you don't have to. Recall from memory first, then verify against the source if needed.

### Memory write rules (for Claude)

Most capture is automatic — the Stop hook extracts durable facts each turn, no action needed. To capture something **explicitly**, the **`memory-write` skill** carries the full procedure; it loads on demand when you save a fact. The invariants it enforces:

- **Capture through `cmk remember`** — never hand-write `MEMORY.md`, `USER.md`, or files under `context/memory/`. The command routes through the kit's safe path (Poison_Guard secret screen, home-path → `~` abstraction so a committed fact never leaks your username, dedup, correct schema). Add `--why` / `--how` / `--type` to record a durable preference or decision richly — a bare bullet loses the *why*, which is the part worth keeping.
- **Machine-specific config** (absolute paths only valid on this machine) → `context.local/machine-paths.md` (gitignored), not `cmk remember`.
- **Cross-project lesson** (true on every project) → `cmk lessons promote <id>` moves a project fact to the user tier; never hand-edit the user-tier files (`LESSONS.md` / `HABITS.md` / `USER.md`).
- **Confirm silently.** Don't announce captures. Frozen-snapshot semantics mean a write takes effect next session.

### Privacy

- Anything inside `<private>...</private>` tags in a user prompt is stripped before any disk write — never persisted in any form.
- `cmk remember` (and auto-extract) abstract absolute home-dir paths (`C:\Users\you\…`, `/home/you/…`, `/Users/you/…`) to `~` before writing to a committed/shared tier, so a fact never ships your username and stays portable across machines. Genuinely machine-specific paths belong in `context.local/` (gitignored).

### Uninstall / remove this block

This block is managed by `cmk install`. To remove it cleanly:

```bash
cmk uninstall
```

Everything outside the `claude-memory-kit:start` / `:end` markers is byte-preserved.
<!-- claude-memory-kit:end -->
