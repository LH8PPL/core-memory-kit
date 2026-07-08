---
id: P-YMXER72W
type: project
shape: State
title: Verify the autonomous loop, not just the human-correction path
created_at: 2026-07-08T11:19:42Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: b6e0cad7bc2610daf6f84f908a1af053508f96591cda8bafac8cda6a22b16ad8
related: [automatic-oracle-free-quadrant-is-the-real-design-target, failure-signal-asymmetry-in-oracle-free-contexts, cross-session-feedback-thesis, adr-0017-finalization-agenda]
---

The autonomous (no-human-in-the-loop) learn-loop needs its OWN verification story, distinct from the human-correction path — the user pushed on this: "I can give you a task and then you run with it... what about memories you write from things you done, without the human?"

**Why:** The v0.5.0 cut-gate's loop check (and the assistant's first explanation) leaned on a HUMAN-produced outcome — user correction / reversal / re-ask — to close recall→judge→feedback. But the recorded design thesis (P-TLLH95BT high) is that the loop is oracle-free AND human-optional by design: the autonomous case is the TARGET, not an edge. When the user hands the agent a task and it runs autonomously, most human-keyed signals never fire, yet the loop is supposed to still work via: tool-result/exit-code, CI, contradiction/supersession, and PREDICTION/expectation self-resolution. Three recorded hard corners make the autonomous case genuinely harder to VERIFY: (1) silent-success asymmetry — autonomous failure detection is reliable, success detection nearly impossible (P-7TYWM43U); (2) the prediction-self-resolution wedge is directionally set but mechanically undesigned (P-9BDaHHAE item 4); (3) feedback is structurally cross-session — a session can't judge its own writes; the signal arrives NEXT session (P-ZRCYDEGK high). So a cut-gate that only tests "human corrects → judge fires" leaves the design's actual target UNVERIFIED.

**How to apply:** Add an AUTONOMOUS-loop check to the verification story, two parts: (a) SAME-session — in a live run, register a `PREDICTION:` line, let a real tool outcome (a test pass/fail, a command exit code) resolve it HIT/MISS with NO human turn between, then confirm trust-signals.log shows the judge fired and attributed the right recalled IDs. (b) CROSS-session — Session A does autonomous work + writes memories; Session B (fresh) recalls them and a contradiction or an attributed tool-failure dampens a wrong one, again no human. The cross-session dampening is the autonomous loop's real closing edge. This is a candidate cut-gate addition (a new gate stage) AND a candidate ADR-0017 / SYSTEM-MAP note (the autonomous verification path as a named region alongside the human path). Relates Task 190/191/192/193 (the organs), Task 194 (the steering-wire, gated on this evidence). Do NOT claim the loop "works" from the human-correction gate alone.
