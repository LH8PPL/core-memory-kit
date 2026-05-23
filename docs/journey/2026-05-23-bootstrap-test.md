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

## End of note

Filed under `docs/journey/` because it's narrative research adjacent to the build log. Referenced from [`v0.1.0-build-log.md`](v0.1.0-build-log.md) so future Claude finds it.

Last updated: 2026-05-23.
