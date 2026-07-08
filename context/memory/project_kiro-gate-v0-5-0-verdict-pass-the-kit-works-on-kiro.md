---
id: P-GETTJWDJ
type: project
shape: Event
title: 'Kiro gate v0.5.0 VERDICT: PASS — the kit works on Kiro'
created_at: 2026-07-08T19:53:36Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: c4939f2043b000be6eb589cdb5baee57335a23709cca4b3d31295212faeebe1a
related: [d-292-resolved-all-three-agent-gates-block-the-v0-5-0-tag-co, kiro-gate-contaminated-by-running-cli-checks-in-a-kiro-open]
---

KIRO gate v0.5.0: PASS. The kit works end-to-end on Kiro — installs + wires all surfaces, hooks fire live (recall/capture/observe-edit), the persona/steering injects (the wedge worked), memory is captured correctly (5 rich privacy-clean fact files with full v0.5.0 schema, INDEX auto-updated), MCP tools run prompt-free, and the privacy screen screens (L1+L3, committed transcript clean). The bar is "does the kit work / do memory files land correctly" — it does.

**Why:** The user's framing clarified the gate's actual bar (2026-07-08): "we are checking that the kit works, if we have memory files then it works." The assistant had over-fixated on B9 (auto-extract vs explicit capture) + E3-judge (which didn't fire only because the clean forward-progress session had no failure/correction to judge — not a defect). Those are refinements, not "does it work" questions. What the Kiro live session PROVED: install wires all 7+ surfaces (KG1-KG11 all pass, KG11 trust via .vscode/settings.json per the user's correction, not permissions.yaml); Kiro's capture/inject/observe-edit hooks fire every turn (the ★★ real-input rule — registered AND firing); steering + the persona injected (the wedge — it applied recorded conventions unprompted); 5 fact files written via mk_remember with correct v0.5.0 schema (frontmatter + recurrence_count, write_source:user-explicit, trust:high auto, real source_sha1, rich Why/How bodies, correct feedback/project/user typing), privacy-clean (0 raw username, 0 absolute paths), INDEX.md auto-updated with all 5; MCP tools ran inline prompt-free (autoApprove); the privacy screen ran (redactions L1:1+L3:10, committed transcript screened, raw username 0). The transcript got contaminated by the assistant running CLI checks in the Kiro-open folder (P-4VAY63ST) — that blocked a clean B9/E3 read but does NOT change the verdict: memory files landed correctly = the kit works.

**How to apply:** Kiro is a PASS for the v0.5.0 tag gate. Do NOT block the tag on B9/E3 nuances — the kit demonstrably works on Kiro (memory captured, hooks fire, persona injects, privacy screens, MCP prompt-free). Move to the Cursor gate next (same bar: does the kit work / do memory files land). When all 3 agents pass this bar, the user tags v0.5.0. The B9 auto-extract-on-Kiro observation (extract.log ran 11x but nothing_durable, likely because the contaminated transcript fed it assistant-only content) is worth a clean re-check SOMETIME but is NOT tag-blocking — the explicit capture path (the primary, most-used one) works perfectly. Relates P-4VAY63ST (the contamination, why B9/E3 weren't cleanly scored), P-EA59K24G (Session 1 detail), D-292 (3-gate resolution — Kiro now GREEN).
