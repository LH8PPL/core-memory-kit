---
id: P-RSLAJ6C4
type: project
shape: State
title: 'D-292 resolved: all-three-agent gates block the v0.5.0 tag (compatibility claim = truth, not ceremony)'
created_at: 2026-07-08T17:26:23Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 5f4c4c735c6c4994db34a9bd1ae1ea2bd1bdc3df78850e1f3b7a630000d747ed
related: [v0-5-0-release-tag-is-on-hold-until-cut-smmggxqw, cut-gate-guide-should-have-been-run-for-wrf66bay]
---

D-292 RESOLVED: the v0.5.0 tag is blocked on ALL THREE agent gates passing (Claude live + Kiro live + Cursor live), not the Claude gate alone. The user's framing: "we never checked them properly, so if us saying we are compatible with kiro and cursor is a lie, we must run the gate for both."

**Why:** Memory held two contradictory recorded positions on whether platform (Kiro/Cursor) gates block the tag: P-5SBBBN6R (non-blocking — base/Claude gate owns the tag, platform gates are surface-wiring green-lights) vs P-NWUYVLZN (all-three-must-pass). D-292 (the v0.5.0 tag-hold) never resolved which model applies. The user resolved it on the CORRECT axis — not "how much verification" but TRUTH: the README + CHANGELOG claim Kiro and Cursor compatibility, so shipping v0.5.0 without verifying capture/inject actually work through Kiro's hooks + Cursor's wiring would make that compatibility claim a LIE (the lazy-framing / knowingly-false-headline class this project forbids). This matters MORE for v0.5.0 than a typical release because the privacy screen (Task 148) is NEW and touches the capture/transcript path on EVERY agent — if Kiro or Cursor wires capture differently, the screen could behave differently there, untested. Precedent that proves the gates catch real bugs: D-269 (Kiro shipped empty snapshots for two minors while unit tests passed — agent-specific wiring is exactly what unit tests can't reach).

**How to apply:** Before the v0.5.0 tag, run BOTH the Kiro live-session gate AND the Cursor live-session gate on the 0.5.0 build, in addition to the already-passed Claude gate. Each verifies the SAME feature surface (learn-loop inject→capture→observe→save→wedge + the privacy screen) through that agent's DIFFERENT plumbing: Kiro = .kiro hooks/agent-config/steering/MCP (probes KH1-KH3 IDE hooks, KC1-KC4 CLI-agent hooks, KG-guard, + CH2/W1 must check actual injected CONTENT not just hook execution per D-269); Cursor = cursor-agent hooks (Task 196's owed live-session step). Also owed: the same Kiro/Cursor runs were skipped for v0.4.5 (P-WRF66BAY). A non-blocking wiring issue lanes to v0.5.x; a real capture/inject/privacy-screen break on either agent BLOCKS the tag. The tag push stays the user's outward step. Capture this in DECISIONS.md/DECISION-LOG (D-292 resolution). Relates P-WRF66BAY/P-SMMGGXQW (the hold + skip correction), P-5SBBBN6R/P-NWUYVLZN (the two models this resolves between), D-269 (the empty-snapshot precedent), Task 196 (Cursor live gate), the lazy-framing rule (a false compatibility claim is the forbidden class).
