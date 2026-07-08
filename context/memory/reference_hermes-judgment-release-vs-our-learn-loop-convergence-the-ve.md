---
id: P-3TECZBaY
type: reference
shape: State
title: Hermes Judgment Release vs our learn-loop — convergence + the verification-evidence pattern
created_at: 2026-07-08T11:32:01Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: a86fc7072df755eb88d8e66f202562065ee46bab5adb31029bb434466b9914e2
related: [verify-the-autonomous-loop-not-just-the-human-correction-pat, automatic-oracle-free-quadrant-is-the-real-design-target, failure-signal-asymmetry-in-oracle-free-contexts]
---

hermes-agent's Judgment Release (July 2026) shipped production self-improvement — convergent with ADR-0017 on the write side, and its verification-driven completion is a concrete reference for OUR open wedge-mechanics problem (autonomous success signals).

**Why:** Release notes (github.com/NousResearch/hermes-agent/releases, the user's pointer): (1) a post-turn self-improvement fork — background auxiliary model digests context per turn and decides what to save (= our Acquire/auto-extract shape, convergent); (2) /learn on-demand skill distillation; (3) /journey human-curated timeline of learned memories/skills; (4) verification-driven completion — "decides it's finished by actually running your project's checks, not by asserting success," recording verification evidence. Key structural difference: hermes judges at WRITE time (what to save) and leaves curation of existing memories to the human; our ADR-0017 loop judges at USE time (recall-log attribution → Stop-hook judge → trust deltas on the memories that surfaced). Per the notes hermes has no outcome-driven dampening/reinforcement of existing memories — the attribution loop remains our differentiator (VERIFY against the hermes repo before stating in a doc; this is from summarized release notes). Prior coverage: docs/research/2026-06-01-deep-dive row 8 recorded hermes agent-created-skills+curator as an "interesting self-improvement loop" (v0.3+ candidate); the 2026-06-03 dedicated hermes review predates this release.

**How to apply:** When designing the wedge mechanics (Task 191 autonomous resolution — the ADR-0017 "wedge mechanics unfinalized" item) and the Task 194 evidence gate, use hermes's verification-evidence pattern as the reference shape for the autonomous SUCCESS signal: end an autonomous task with a machine-checkable claim, actually run the project's checks, record the evidence, resolve the pre-registered expectation HIT/MISS with no human. This directly mitigates the silent-success asymmetry (P-7TYWM43U) — success stops being silent when it is checkable. Before citing hermes specifics in an ADR/design doc, do the primary-source repo read (the release-notes summary is not sufficient per the verification rules).
