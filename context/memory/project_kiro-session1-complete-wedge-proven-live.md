---
id: P-V63LVV3H
type: project
title: kiro-session1-complete-wedge-proven-live
created_at: 2026-06-23T19:03:27Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 9e8c9e3939b876862d721178d2846e86665028991b95d3267bc49649acd40765
related: [kiro-live-test-session1-d194-d196-proven, resume-v0-4-0-kiro-gate-8-fixes-shipped]
---

KIRO SESSION 1 COMPLETE — near-perfect (kiro-gate2, 2026-06-23). All 4 build stages + 5 preference captures fired correctly. STANDOUT live-proven behaviors: (1) M1/D-196 — all 5 mk_remember MCP calls ran SILENT, no Reject/Trust/Run (autoApprove holds across the whole session). (2) THE WEDGE WORKS LIVE: when user said "in every project I work on" (uv/ruff rule), Kiro called mk_remember tier:U → got the correct tier-note ("U is not a direct write target, promote it") → then called mk_lessons_promote → "promoted to HABITS.md § Working Style". The B3/B4 cross-project persona path fired end-to-end in a real Kiro session. (3) RICH LINKED facts — Kiro used links:[...] to cross-reference ([[Layered FastAPI]]↔[[.venv]]↔[[Python conventions]]). (4) MEMORY-AWARE RECONCILIATION — Kiro noticed the .venv-pip-vs-uv tension and FLAGGED it ("the earlier note describes pip, now superseded by uv, want me to update it?") — reading its own memory + detecting a conflict. (5) KH hooks (recall+capture) ran silent every turn (D-194). The ONLY prompts were for the user's OWN commands (pip install, where uv, the &-ampersand PowerShell error) — correct, the kit only auto-trusts its own commands. 5 user-tier facts captured: .venv, layered-fastapi, python-conventions-tdd, async-all-the-way, uv-ruff(promoted to HABITS).

**Why:** Session 1 of the cut-gate-kiro live test (50.M). Beyond the D-194/D-196 prompt-free proofs, it proved the WEDGE (cross-project promotion via mk_lessons_promote), rich linked facts, and memory-aware conflict-detection all work in a REAL Kiro session — the deep features unit tests can't reach.

**How to apply:** Live-gate progress: KH-trust ✅, KH1 (capture fired every turn) ✅, M1 (mk_remember silent) ✅, B3/B4 wedge (lessons-promote to HABITS) ✅, rich+linked facts ✅, memory-aware reconcile ✅. STILL TO DO: KH2 (ask a recall question mid-session — does inject answer it?), §3 capture-file checks (read context/MEMORY.md + memory/*.md to confirm B2/B9 rich facts + B4 trust:high on the uv rule), Session 2 kiro-cli (KC1-4 + KG-guard delete-block), E1 cold-open wedge in a NEW project, KU1/KU2 uninstall. Then restore real tiers from run4 + user pushes v0.4.0 tag.
