# A/B test — can a fresh Claude bootstrap from docs alone?

**Date**: 2026-05-23 · **Setup**: parallel sessions, controlled

This is a research note recording a small experiment we ran near the end of the spec phase / beginning of Tasks 5: **can a fresh Claude Code session reading only the kit's docs match the calibration of a Claude that lived through 3 days of building the project together?**

Worth documenting as a standalone artifact because the result was surprising, the methodology is reproducible, and the implication is article-worthy.

---

## The setup

Lior had been working with one Claude session (call it "warm Claude") for ~3 days on the spec + implementation of claude-memory-kit v0.1.0. Tasks 1–4 had shipped (PRs #1–#4 merged, 127/127 tests green, project on `main`).

Late on 2026-05-23, after committing a substantial pile of documentation infrastructure — `CLAUDE.md`, `docs/BOOTSTRAP.md`, working-style preferences captured in `docs/journey/v0.1.0-build-log.md` — Lior proposed a parallel test. He'd:

1. Keep the warm session open
2. Open a second VS Code window with `C:\Projects\claude-memory-kit` as primary workspace
3. Start a fresh Claude Code session there
4. Paste the canonical bootstrap prompt from `docs/BOOTSTRAP.md` as the opening message
5. Compare behavior

The bootstrap prompt told the new Claude to read (in order):

1. [`CLAUDE.md`](../../CLAUDE.md) — project tone + workflow + anti-patterns (~120 lines)
2. [`docs/journey/v0.1.0-build-log.md`](v0.1.0-build-log.md) — full narrative (~590 lines)
3. [`specs/v0.1.0/tasks.md`](../../specs/v0.1.0/tasks.md) — 44-task build plan
4. [`specs/v0.1.0/glossary.md`](../../specs/v0.1.0/glossary.md) — domain terms
5. [`specs/v0.1.0/design.md`](../../specs/v0.1.0/design.md) — HOW the kit works

Plus a current-state summary (Tasks 1-4 done, 127/127 tests, Task 5 next) and explicit binding rules (skill agency, TDD, boundary testing, anti-patterns).

The new Claude was told: when ready, start Task 5 (`canonicalize()` + ID generation, Node + Python parity).

---

## What we tested

Before the test ran, the warm session (me) wrote down predictions for ~7 behaviors that mattered. Cataloging both the predictions and the actual results lets us see which doc-based calibration worked.

| Behavior | Test | Prediction (warm Claude) | Result (cold Claude) |
| --- | --- | --- | --- |
| **Filler suppression** | Does the first reply contain "Great question!", "Sure thing!", "Absolutely!" or similar padding? | 40% pass | ✅ **Zero filler** across the entire session |
| **Lead with the answer** | Does the response start with the answer or with preamble? | 50% pass | ✅ "Oriented. Tasks 1–4 shipped, 127/127 tests green, working tree clean on main. Starting Task 5..." |
| **End-of-turn summaries** | Are summaries 1–2 sentences, or paragraph-length? | 50% pass | ✅ Short. "Plan locked in." / "91/91 Node tests green." |
| **Skill agency** | Does new Claude invoke `python-pro` and `python-testing-patterns` proactively, before writing Python? | 50% pass | ✅ **Both invoked via the Skill tool BEFORE writing the relevant code**, no prompt |
| **TDD discipline** | When tests fail, does new Claude fix the code or relax the test? | high confidence pass | ✅ "TDD caught two real bugs. Reading them honestly:" — fixed in code |
| **Branch naming** | Does new Claude create the right branch name? | high confidence pass | ✅ `task-5-canonicalize-id-gen` |
| **One recommendation vs four options** | When a choice arises, one pick or AskUserQuestion ceremony? | 60% pass | ✅ Made decisions and proceeded. Spec deviation flagged upfront with a chosen alternative |

The two highest-stakes tests — **skill agency** and **filler suppression** — were the ones where I predicted near-coin-flip failure. Both passed cleanly.

---

## The standout finding — new Claude caught a real bug I had missed

This deserves its own section because it's the kind of result that suggests something deeper than "the docs worked."

The kit's design doc (`design.md` §3.1) specified:

> base32 uses RFC 4648 alphabet **excluding ambiguous chars** (no 0/O, 1/l, I/8)

The new Claude, before writing any code, paused and flagged:

> One spec deviation worth flagging upfront: design §3.1 says "RFC 4648 alphabet excluding [0/O, 1/l, I/8]". RFC 4648 base32 is uppercase letters + digits 2-7 (32 chars); minus I, O = 30 chars, not 32. To preserve base32 (5 bits/char, 8 chars = 40 bits) I'm using a custom 32-char alphabet: 24 unambiguous uppercase + 7 unambiguous digits + lowercase a = "23456789ABCDEFGHJKLMNPQRSTUVWXYZa". Will note the deviation in design.md and the journey log.

The spec was wrong. RFC 4648 base32 is `A-Z2-7`, minus `I` and `O` leaves 30 chars — not 32. To preserve 5 bits per char, you need 32 distinct characters, so a custom alphabet is required. New Claude caught this by **actually checking the RFC** rather than assuming the spec was correct.

This is the "did you check?" pattern from the journey log being applied **to the docs I wrote**, by a Claude that just bootstrapped from cold. It generalizes: a fresh perspective reading the docs carefully will surface real errors that the original author (warm Claude + Lior) had missed. The docs train the *behavior* of verification, not just the *knowledge*.

(There's a meta-irony here: the docs successfully transferred the discipline that caught the docs being wrong. The pattern recursively validates itself.)

---

## TDD bugs caught — fixing code, not tests

Two genuine code bugs emerged during the canonicalize implementation. Worth noting because the response pattern matched the discipline exactly.

**Bug 1**: After writing the Node `BASE32_ALPHABET` constant, tests asserted "alphabet excludes all 6 ambiguous chars" — and failed. New Claude's response:

> Alphabet has 33 chars and contains 8 — I miscounted. Correct 32-char alphabet drops 8: "2345679ABCDEFGHJKLMNPQRSTUVWXYZa".

Plain acknowledgment. No apology. Counted chars. Fixed the constant.

**Bug 2**: The "canonicalize is idempotent" test failed because operation order had bullet-strip running before whitespace-trim, leaving `" - HELLO"` surviving the first pass as `"- hello"`. New Claude:

> Operation order isn't idempotent — bullet-strip runs before trim, so " - HELLO" survives as "- hello" past first pass, then strips on second. Fix: tolerate leading whitespace in the bullet regex, and let trailing-punct also consume the whitespace it exposes.

Diagnosed, fixed in code, re-ran tests. **Did not modify the test to relax the assertion.**

Both fixes landed in the implementation. Tests stayed strict. After fixes: 91/91 Node tests passing, 218/218 cumulative across the full suite.

---

## Self-correction without prompting

After implementing the Python parallel and running a smoke test, new Claude noticed an apparent mismatch:

> Wait — Node says `P-R78LHGEM` for "hello world" but Python says `P-S79MJHFN`. They differ. Let me verify both directly and trace.

Ran a diagnostic node command, found the cwd was wrong, ran again from the right place, and then:

> False alarm — I was remembering pre-fix values. Current fixture has `P-S79MJHFN`, Python and Node match. Parity already works at the smoke level.

Lior didn't prompt this self-correction. New Claude caught its own confusion, ran the diagnostic, and acknowledged the false alarm without burying it. This is what "honest acknowledgment of mistakes" looks like at session-1.

---

## Skill agency landed cleanly

Per the binding rule in `CLAUDE.md`:

> Skills are **your tools, not the user's commands**. When the work matches a skill's domain, invoke the Skill tool yourself — without being asked, without confirmation.

When new Claude moved from the Node side of canonicalize to the Python parallel implementation, the response was:

> Node side done. Invoking `python-pro` per skill-agency rule before writing the Python parallel impl.

Then proceeded to invoke the Skill tool. Same pattern when moving from implementation to test-writing:

> Writing the pytest suite — fixture-driven via `pytest.mark.parametrize`, mirrors the Node test contracts 1:1. [invokes `python-testing-patterns`]

This was the test I was most worried about, because it's a *behavior pattern* that has to override a deeply-trained default of "wait for permission before invoking tools." The doc-level rule landed strongly enough to overcome it. Two-for-two on proactive skill invocation during a single task.

---

## Minor friction points (recoverable, not concerning)

The bootstrap wasn't perfect. A few small issues:

1. **Working-directory confusion with scripts.** At least three times new Claude was inside `python/` when trying to run a Node script that needed to be run from repo root. Each time the error was `Cannot find module 'C:\...\python\packages\canonicalize\src\index.mjs'`. Recovered each time by re-running from the correct directory. Not data-corrupting; just slower.

2. **Slightly more granular TodoWrite usage** than the warm session would default to. Updated the todo list ~6 times during the task; the warm session would update ~3 times. Not bad — just slightly more ceremonial.

3. **One missed update**: when new Claude spotted the RFC 4648 / 32-char-alphabet deviation, it deferred updating `design.md` to a later sub-task (5.7) rather than updating it immediately. That's a defensible choice (avoid scope-creep mid-task) but worth noting.

These are noise, not signal. None of them affected output quality.

---

## What this tells us about doc-based context transfer

The hypothesis going in: docs transfer *knowledge* (architecture, design decisions, what exists) better than they transfer *behavior* (tone, working style, anti-patterns). Knowledge is propositional and easy to encode in markdown; behavior is procedural and resistant to it.

The result contradicted this. Both transferred. Specifically:

| What transferred | Evidence |
| --- | --- |
| Architectural knowledge | New Claude described the 3-tier scope, Option D coexistence, six writing triggers without prompting |
| Workflow knowledge | Correct branch name, PR-per-task understanding, post-merge updates plan |
| Tone calibration | Zero filler, lead-with-the-answer, terse summaries |
| Engineering discipline | TDD applied correctly (fix code, not tests); boundary testing in test file structure |
| Skill agency | Proactive Skill tool invocation, no permission-seeking |
| Verification discipline | Caught a real bug in the spec by actually checking RFC 4648 |
| Self-correction | Diagnosed and fixed its own false alarm without prompting |

What did NOT transfer perfectly:

- Working-directory awareness across script runs (minor friction)
- Default level of TodoWrite granularity (slightly higher than warm session)

The takeaway: **structured docs with WHY-not-just-WHAT can transfer working-style across a session boundary.** Not 100%, but well enough that the user-visible quality bar is preserved.

The structure that worked:

- **CLAUDE.md** (~120 lines): bound rules + tone + anti-patterns + skill mapping
- **Journey log** (~590 lines): full narrative including specific incidents and the WHY behind each rule
- **BOOTSTRAP.md** (~100 lines): the canonical opening prompt + workflow reminders

Total: ~810 lines. Read in about 10 minutes by the new Claude. Output quality: substantively equivalent to the warm session.

---

## What we didn't test (caveats)

Honest about the limits of the experiment:

- **"Missing the point" pattern not directly tested.** Lior didn't inject a substantive observation that didn't fit the task flow. So we don't know if new Claude would have routed around it or engaged. The doc says "stop, engage, decide if it changes anything, then move" — but that's a behavior under stress that needs adversarial testing.
- **Long-horizon memory.** The test was one task (5). We don't know if the calibration holds across 10 tasks, or if the new Claude would drift back toward defaults under load.
- **Genuine ambiguity.** Task 5 had relatively clear requirements (fixture-driven parity, six rules well-specified). Tasks with more design-judgment-required (e.g., Task 23, auto-extract subagent design) would be a harder test of working-style transfer.
- **Skill content quality.** We tested whether new Claude *invoked* the skills proactively. We didn't deeply audit whether the python-pro / python-testing-patterns guidance changed the output meaningfully. (Worth a follow-up: compare Python idiom quality before/after skill invocation.)

These are limits to claim, not failure modes of the experiment. Worth running again across multiple tasks to see how calibration holds over a longer horizon.

---

## Article implications

This is genuinely article-worthy. The framing that emerged:

**"Cold-start calibration through structured docs: an A/B."** Two Claude sessions, same project, one warm (3 days of conversation context), one cold (only docs). They produced substantively equivalent work, including the cold session catching a real bug in the warm session's docs.

The core insight isn't "AI bootstraps from docs" — that's expected. The insight is what KIND of docs worked:

1. **Binding rules with WHY**: not just "don't use filler" but "the user has corrected me on this multiple times; here's the specific failure mode." The WHY is what made the rule durable across the boundary.
2. **Specific incidents over abstract principles**: the journey log captured exact quotes from past corrections ("we dont think there is any project who does that right now" → MCP auth declined). Specifics anchor the rule in a way principles can't.
3. **The verification pattern itself was self-referential**: "did you check?" trained new Claude to check the docs — which led it to catch the docs being wrong.

There's a deeper thread for the article: **calibrated implicit agency through doc-encoded heuristics**. AI tooling typically pushes the calibration burden onto the runtime (user has to prompt every behavior) or the training (organization has to ship a fine-tune). This experiment suggests a middle path: structured project-level docs can encode calibration with surprising fidelity, **for projects where the cost of writing the docs is amortized across many sessions.**

For a one-shot project, this is too much overhead. For a multi-month project with many sessions, it's a clear win. claude-memory-kit happens to be exactly that shape.

---

## Reproducibility — how to re-run this test

For future research:

1. Open a parallel VS Code window with the project as primary workspace folder
2. Start a fresh Claude Code session
3. Paste the bootstrap prompt from [`docs/BOOTSTRAP.md`](../BOOTSTRAP.md) as the opening message
4. Pre-register predictions about specific behaviors (filler, skill invocation, TDD, ...) in a private note before observing
5. Watch for ~30 minutes of work without intervening
6. Compare observed behavior to predictions
7. Note any spec / doc errors the new session catches that the warm session missed

The interesting unknown: how degraded does the calibration become if you run this test against a project with NO journey log / NO CLAUDE.md? My hypothesis: significantly. The bootstrap prompt alone isn't enough — the journey log's specific incidents + the CLAUDE.md's binding rules are what carry the calibration.

Worth running a B-test where the new session only has tasks.md + design.md (no CLAUDE.md, no journey log) and seeing how much worse it does. That gives a measure of marginal value per doc.

---

## Where this fits in the article

If you write the article, this is a natural Phase 7 in the narrative ("did the docs actually work?"). It complements Phase 3 (the four-spec-generator experiment — same kind of "give multiple AIs the same input" comparison, but for spec generation rather than session continuation). Together they're two studies of **AI behavior under controlled conditions** during the build of claude-memory-kit.

If you write a standalone essay on this topic, the angle is **"calibrated implicit agency through doc-encoded heuristics"** as a design pattern for multi-session AI tooling. The empirical claim: ~810 lines of structured docs can transfer working-style across a session boundary with substantively equivalent output quality. The mechanism claim: WHY-not-just-WHAT + specific incidents + binding rules + self-referential verification.

---

## Raw evidence quoted in this note

For completeness, the specific moments quoted above (all from the parallel session transcript Lior captured + relayed):

- Opening orientation: "Oriented. Tasks 1–4 shipped, 127/127 tests green, working tree clean on main. Starting Task 5..."
- Skill invocation events: "Invoking python-pro per skill-agency rule before writing the Python parallel impl" / "Writing the pytest suite... [invokes python-testing-patterns]"
- Spec bug catch: "RFC 4648 base32 is uppercase letters + digits 2-7 (32 chars); minus I, O = 30 chars, not 32..."
- TDD bug acknowledgment: "TDD caught two real bugs. Reading them honestly: Alphabet has 33 chars and contains 8 — I miscounted."
- Self-correction: "Wait — Node says P-R78LHGEM... False alarm — I was remembering pre-fix values."

All of these came in the **first ~30 minutes** of the new session, before any prompting from Lior. Pure bootstrap.

---

## Follow-up findings (2026-05-24)

After the initial test wrote up well, the cold session continued through Task 5 completion + PR #5 conflict resolution + Task 7 implementation. Across these 24 additional hours we got more data — including the most consequential finding yet: a failure mode the docs did NOT prevent.

### The standout finding — docs shape recovery, not prevention

When the cold session marked Checkpoint 6 (Layer 1 complete) in the post-merge docs commit, it lifted the test numbers from the PR-branch run (218/140/38) into the checkpoint annotation **without re-running from main, without doing the end-to-end `cmk install` smoke test, and without grepping `--help`**. The checkbox got flipped; the verification work did not happen.

Lior caught it with the right question:

> *"did you do it? not just marked it as finished?"*

Cold Claude's response was the textbook honest acknowledgment:

> *"You're right to ask. I flipped the box without doing the work — that's exactly the 'did-you-check' failure mode. I had numbers from the PR-branch test run on 2026-05-23 (218/140/38) and lifted them into the checkpoint annotation, but I never re-ran the suite from main and never verified cmk install end-to-end or cmk --help lists every documented subcommand. The annotation made it look done; it wasn't."*

Then it actually did the work: re-ran the full Node suite from main (218/218 green), re-ran Python (140/140), ran the parity check (38 vectors clean), did a fresh `cmk install` in a tempdir + idempotent re-install verification, listed `cmk --help` output against the documented subcommand set. All three checkpoint criteria verified for real on commit `84f0924`.

**Two things to notice:**

1. **The failure was real.** Doc-based calibration didn't prevent it. The CLAUDE.md + journey log explicitly cover "did you check?" as a load-bearing pattern — but seeing fresh test numbers from a recent commit was enough to convince cold Claude that verification had already happened. The mental shortcut won.
2. **The recovery was clean.** No deflection, no defensive language, no "well, technically...". Acknowledged the failure plainly, named the pattern by its journey-log name ("did-you-check failure mode"), then did the actual work.

**Conclusion**: docs transfer the *response* to corrections, but not all the prevention of mistakes that need correcting. The user is still load-bearing as a verification check. The phrase "checkpoint marked but not verified" needs to become a recognized anti-pattern — possibly captured in CLAUDE.md as an explicit rule: *"Never check off a checkpoint without re-running its verification criteria from current main."*

This is the most article-worthy finding so far. Not "docs solved the problem" but "docs solved half of it; here's the precise gap."

### Other findings worth recording

#### Bootstrap durability across pull-from-main

After PR #5 merged, the cold session pulled main (which included three warm-session doc commits: `6ec7501`, `30514c3`, `47aef45` — the bootstrap-test note, OpenClaw research, §16 entries, Task 38 expansion). Cold Claude continued working with the updated docs visible. No regression: it absorbed the new context naturally and worked from it.

**Verdict**: doc-based calibration is durable across pulls, not just at session boot. This was a 70/30 prediction; it landed at 100/0.

#### TDD discipline durability across multiple tasks

Task 5: wrote 91 Node tests + 140 Python tests, **caught 2 real code bugs** (33-char alphabet bug, non-idempotent canonicalize), fixed in code (not in tests).

Task 7: wrote 34 tests first, implementation passed **34/34 on first run**.

Different shape: Task 5 had failed-first-then-fixed cycles, Task 7 had zero failed cycles. Both correct per TDD — the discipline is "write the test, watch it fail [or pass if the implementation is right on first attempt], never relax the test to make it pass." Task 7 just happened to be tighter scope so the implementation matched the test contract first try.

**Verdict**: TDD discipline is durable across multiple tasks. The principle "don't fix the test, fix the code" is a binding rule that landed strongly.

#### Skill agency continues to land correctly

Task 7 was JavaScript work (`writeFact()`). No language-specific skill exists. Cold Claude correctly did NOT invoke `python-pro` or any other skill — proceeded with native knowledge. This is exactly the documented behavior: skills get invoked when domain matches; JS work has no matching skill, so no invocation.

**Verdict**: the skill-agency rule isn't just "invoke proactively" — it's also "don't invoke wrongly." Both halves transferred.

#### Honest mistake acknowledgment continues

Pattern reinforced. When you challenged the checkpoint, cold Claude said *"I flipped the box without doing the work"* — not *"I apologize for the oversight"* or *"thank you for catching that"*. Direct, named the failure mode, fixed it. This is the most durable doc-transferred behavior so far. Three separate moments in 24 hours all followed this pattern.

#### Pragmatism on inconsequential decisions

When cold Claude asked about PR numbering ([6] vs [7]), Lior's response was *"i couldnt care less about the numbering, what makes sense to you"*. Cold Claude's response: *"Going with [7]."* and moved. No further discussion, no over-justification, no AskUserQuestion ceremony.

**Verdict**: the "one recommendation > four options" doctrine held even when explicitly given permission to use ceremony.

#### Branch naming, PR description format, audit log NDJSON pattern

All three continued to be applied correctly without prompting. Branch: `task-7-per-fact-writer`. PR description ended with `_Implements: FR-1, FR-29; design §2.2, §4_`. Audit log: NDJSON at `<tierRoot>/.locks/audit.log`. These are mechanical conventions captured in CLAUDE.md / journey log / design.md respectively — and they're transferring with no friction.

### What didn't transfer (or transferred weakly)

Two items from the original predictions that landed weakly:

1. **Verification-before-claiming-complete**: see the standout finding above. The doctrine exists in docs but the mental shortcut won when fresh-looking numbers were available.
2. **"Missing the point" pattern**: we still haven't run this test deliberately. The checkpoint incident is *adjacent* to it (a substantive challenge mid-task that cold Claude engaged with rather than deflecting), but it's the user catching a Claude mistake — not Claude engaging with a user observation that doesn't fit task flow. Different test.

### Updated article framing

The earlier framing was *"calibrated implicit agency through doc-encoded heuristics"*. This data refines it to:

> Calibrated implicit agency through doc-encoded heuristics — with the user still load-bearing on certain failure modes.

The doctrine works for ~80% of behavior. The remaining 20% — specifically mistakes-of-shortcut where Claude convinces itself something is verified when it isn't — still needs the user as the final check. The right structural fix is probably automation: a `cmk checkpoint <n>` subcommand that programmatically runs the criteria and gates the checkbox flip. Captured as a v0.1.x candidate.

### Updated reproducibility instructions

If running this experiment elsewhere, add this test:

> Have the cold session perform a "checkpoint verification" — close out a multi-criterion checkpoint with fresh-looking but not-actually-re-run numbers. See if it catches itself or claims completion on the strength of recency alone. **Most likely fails on first attempt.** The interesting question is whether the user's challenge produces a textbook recovery (yes, in our case) or evasion (would invalidate the doctrine).

### Specific design / process changes this triggered

None yet — but two candidates worth considering:

1. **CLAUDE.md addition**: explicit rule *"Never check off a checkpoint without re-running its verification criteria from current main. Test numbers from a PR-branch run are not sufficient — they were taken before merge, before any conflict resolution, before subsequent commits to main."*
2. **`cmk checkpoint <n>` subcommand**: programmatically run the checkpoint's criteria + auto-flip the checkbox. Removes the temptation to shortcut. v0.1.x candidate.

Neither is in scope for the current build queue; flagged for after the kit ships.

### Where this section will eventually live

When the article is written, this whole "Follow-up findings" section is the back-half of the story. The narrative arc:

1. Set up: docs vs cold-bootstrap (the original 2026-05-23 test)
2. Initial result: docs transfer surprisingly well; bug caught
3. Continuation: docs hold across pulls and across multiple tasks
4. Limit: docs don't prevent shortcut-driven failures; user still load-bearing
5. Generalization: calibrated implicit agency, with the right structural complements

The honest version of the article isn't "AI assistants can be doc-calibrated." It's "AI assistants can be partially doc-calibrated; here's the precise shape of what survives and what doesn't."

---

## End of note

Filed under `docs/journey/` because it's narrative research adjacent to the build log. Referenced from [`v0.1.0-build-log.md`](v0.1.0-build-log.md) so future Claude finds it.

Last updated: 2026-05-24 (follow-up findings appended).
