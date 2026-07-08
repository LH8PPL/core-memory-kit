---
id: P-TBGK35LC
type: project
shape: Event
title: 'Kiro gate v0.5.0: COMPLETE — all 3 sessions PASS, kit works end-to-end'
created_at: 2026-07-08T20:08:06Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 36b268e601c3b4226c8bde7a8acf4b17beceb120f31d2ee9f88b7fff9e142b73
related: [d-292-resolved-all-three-agent-gates-block-the-v0-5-0-tag-co, kiro-gate-v0-5-0-verdict-pass-the-kit-works-on-kiro]
---

KIRO gate v0.5.0 COMPLETE — all 3 sessions PASS (same as the Claude cut-gate, through Kiro's plumbing). S1: hooks fire, 5 correct rich memory files, privacy screen L1+L3, MCP prompt-free. S2: fresh session recalled cross-project rules + project structure + Session-1 decisions with no re-brief. S3 (the wedge): a brand-new Kiro project applied uv/local-.venv/ruff/layered-architecture/test-first + even the FastAPI-0.139.0 pin UNPROMPTED, because the persona injected. The kit works end-to-end on Kiro.

**Why:** D-292 (the 3-agent tag gate). Kiro is now fully verified across all 3 cut-gate sessions, the same structure as the Claude gate. S1 (build FastAPI chat, C:\Temp\kiro-gate-v050): install wires all surfaces (KG1-KG11, trust via .vscode/settings.json), capture/inject/observe-edit hooks fire every turn, 5 fact files written via mk_remember with correct v0.5.0 schema + rich Why/How + privacy-clean + INDEX auto-updated, MCP prompt-free (autoApprove), privacy screen ran (redactions L1+L3, committed transcript screened). S2 (reopen Kiro same project): agentSpawn inject fired, the fresh session recalled the uv/ruff rules AND the layered project structure AND the Session-1 decisions (FastAPI 0.139.0 pin, send() AsyncGenerator, per-turn cost) with NO re-brief, then capture fired + the ADR-0018 commit-proposal. S3 (fresh folder C:\Temp\kiro-coldopen-v050, the cold-open WEDGE — the gate that matters most): asked only 'start a new Python backend', Kiro applied the ENTIRE persona unprompted — uv init + uv add (never pip), project-local .venv, uv add --dev ruff + ran ruff check --fix + format, layered app/{api,core,db,models,services}/ with thin routes + router mount + pydantic-settings config, a passing test-first health test, even pinned FastAPI 0.139.0 from S1's recorded decision. recall.log confirmed the source:inject fired (that's HOW it knew); committed transcript screened (redactions.log 2 entries). 'How does it know that?' = the wedge, proven on Kiro's hooks not just Claude's.

**How to apply:** Kiro = GREEN for the v0.5.0 tag. Next: clean-slate the user tier (back up first, never delete) and run the Cursor gate from zero (S1 build+capture → S2 recall → S3 cold-open wedge), user-driven, assistant stays out of the folder while Cursor has it open (the P-4VAY63ST contamination lesson). When Cursor passes all 3 sessions, all-3-agent gate is met (Claude done, Kiro done, Cursor pending) → user tags v0.5.0. Relates D-292 (the resolution), P-GETTJWDJ (the earlier S1-only verdict this completes), P-EA59K24G/P-4VAY63ST (S1 detail + the contamination that's now moot since S2/S3 were driven cleanly), the Claude gate (the structure this mirrors).
