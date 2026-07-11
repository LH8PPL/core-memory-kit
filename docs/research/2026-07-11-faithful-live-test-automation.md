---
date: 2026-07-11
topic: Making automated tests faithfully reproduce a human cut-gate — closing the unit-green/integration-broken gap
source: Web research (Kent C. Dodds, Google Software Engineering book, testscript/Bitfield, fast-check, PagerDuty, GitHub Actions matrix docs) synthesized against the kit's own bug history
tags: [testing, live-test, cut-gate, e2e, process]
---

# Faithful live-test automation — the cut-gate parity playbook

_The user's directive (2026-07-11): "do live tests as much as you can … so we don't have to
wait for me to do the cut gate to find problems." This note grounds the harness plan in
practice, not just our own precedent. Drives Task 221 + the CLAUDE.md "Live-test toward
cut-gate parity" rule + ADR-adjacent process._

## The core finding — this is a test-TAXONOMY gap, not a test-QUANTITY gap

Google's small / medium / large test taxonomy explains the kit's pattern structurally:
**hermetic "small" unit tests are DESIGNED to be blind to process/agent-boundary phenomena.**
All four bugs the manual cut-gate caught that the unit suite missed — the UTF-8 BOM on hook
stdin (D-306), the `/c:/…` Windows path (D-305), the killed cron / false-green health check
(D-298), the empty `USER_PROMPT` env var (D-303) — are boundary phenomena a hermetic test
cannot, by definition, see. **2836 green tests and 4 missed bugs are not in tension** — they're
different layers of the pyramid. The fix is to add faithful *medium/large* tests for the
specific boundary classes, not more unit tests.

The literature (Kent C. Dodds "write tests, not too many, mostly integration"; the testing
trophy; Google's book Ch. on test sizes) converges on: for a CLI/hook tool, the highest-value
tests **invoke the built binary as a subprocess against a real temp filesystem** and assert on
real side-effects — not import the module's functions.

**The kit already proved the key technique once, reactively:** the D-306 BOM fix was found by
capturing the real BOM-prefixed stdin via a live probe and asserting against it. The playbook's
top move is to make that a STANDING habit (a committed fixture corpus) instead of a post-mortem.

## Technique-per-bug-class (mapped to the kit's actual history)

| Bug class (kit example) | Faithful-test technique |
| --- | --- |
| Input-encoding (BOM D-306, CRLF, empty `USER_PROMPT` D-303, unicode) | **Fixture corpus** of real captured payloads per agent×platform, fed to the REAL bin as a subprocess; + **property-based** fuzzing (fast-check) over every hook stdin parser |
| Cross-platform path (`/c:/…` D-305) | **Real-OS matrix CI** running the fixture-replay tests (a Windows runner catches the `/c:/` shape structurally) |
| Time/schedule starvation (killed cron D-298) | **Fault-injection**: `spawnSync` + a timed SIGTERM to kill a job at ~80%, assert forward progress (the Task-204 resumability property). No chaos platform needed on a single-machine CLI. |
| False-green health check (HC-10 D-298) | **"Watch the watchmen"**: seed a KNOWN-broken state, assert the health check reports UNHEALTHY (PagerDuty's monitor-the-monitor pattern). The HC-10 D-298 test IS this. |
| Real-agent-in-the-loop nondeterminism | **Presence-based** (not exact-match) assertions; a **fake-agent binary** emitting canned responses for CI; the real `claude -p` only in on-demand `live-verify`-class scripts |

## The prioritized playbook for THIS kit (Task 221)

Cheapest + highest-recurrence first:

1. **Fixture corpus** of real captured payloads per agent×platform (generalize D-306).
2. **Property-based "weird input corpus"** (fast-check) for every hook stdin parser.
3. **"Watch the watchmen" tests** — seed broken state, assert the HC reports unhealthy
   (generalize the HC-10 D-298 test to every HC that could false-green).
4. **Fault-inject kill-mid-run** — `spawnSync` + timed SIGTERM; assert forward progress
   (the Task-204 property, made a permanent test — the `live-distill-probe` shape).
5. **Real-OS matrix** running the fixture-replay tests.
6. **Broaden `live-verify.mjs`** past the persona wedge (LOWEST priority — most expensive,
   live-model-dependent).

Items 3 + 4 are cheap and land with the tasks that surface each class (203/204 already added
the first of each). Items 1 + 2 are the next PR. 5 + 6 as capacity allows.

## Honest tradeoffs / what NOT to over-invest in

- **Don't** adopt a chaos-engineering platform (Litmus / Chaos Mesh) — overkill for a
  single-machine CLI; a timed SIGTERM does the job.
- **Don't** chase exact-match assertions on live LLM output — presence-based is correct, and
  the kit already does this (the spawn-smokes, live-verify).
- Live-model tests cost real tokens + are nondeterministic → keep them ON-DEMAND
  (`npm run live-verify`), never in `npm test`. The deterministic harnesses (fixture-replay,
  property-based, watch-the-watchmen, fault-inject) DO belong in `npm test`.
- The goal is not to ELIMINATE the manual cut-gate but to make it mostly CONFIRMATORY.

## Pointers

- Kent C. Dodds — "Write tests. Not too many. Mostly integration." + the Testing Trophy.
- Google, _Software Engineering at Google_ — the small/medium/large test-size taxonomy.
- testscript (Go) / Bitfield Consulting — "test the binary, not the module" for CLIs.
- fast-check — property-based testing for JS/TS (the weird-input corpus).
- PagerDuty — "who watches the watchmen" / monitor-the-monitor testing.
- GitHub Actions — matrix strategy for real-OS runners.

_(Full fetched-source citations were assembled in the research pass; the synthesis above is the
actionable subset. Anything that came only from search-summary text rather than a fetched page
was flagged as such in the pass and is not asserted here as verified.)_
