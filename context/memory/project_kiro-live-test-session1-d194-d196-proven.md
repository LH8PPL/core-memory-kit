---
id: P-FD93HDaQ
type: project
title: kiro-live-test-session1-d194-d196-proven
created_at: 2026-06-23T17:49:01Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: f269b3585bd6f86542849ade1a8de4004a0948141b5442220471729529a42258
related: [resume-v0-4-0-kiro-gate-8-fixes-shipped, kiro-mcp-autoapprove-missing-cut-blocker]
---

KIRO LIVE-TEST SUCCESS (Session 1, kiro-gate2, 2026-06-23): the D-196 + D-194 fixes are PROVEN end-to-end on the rebuilt artifact. M1 (D-196) ✅: Kiro called `mk_remember` (claude-memory-kit MCP tool) with a full rich payload (text/title/why/how/type) when the user said "always deploy .venv" — and it ran with NO Reject/Trust/Run prompt (silent by autoApprove config; last session this EXACT call prompted). Wrote user_always-use-venv-for-python-deps.md, accepted:true. KH-trust + KH1 ✅: both 'claude-memory-kit: recall' (inject) and 'claude-memory-kit: capture' hooks ran "successfully with no output" — silent, no Run/Reject, and capture FIRED. KG4 ✅: no "Invalid SKILL.md frontmatter". The ONE prompt that appeared was for the user's OWN `.venv\Scripts\python.exe -m pip install` command (NOT a kit hook/tool) — CORRECT: the kit only pre-trusts its own commands, never arbitrary pip/build commands (would be over-permissive). So all the live KH/M proofs pass. Build arc worked: Stage 0 (FastAPI WebSocket app.py + index.html, imports ok) + Stage 1 (.venv preference stated → captured).

**Why:** The cut-gate-kiro 50.M live test — the surfaces unit tests can't reach. Session 1 on the post-D-196 artifact proved the hooks AND the MCP tools both run prompt-free by config (no manual Trust clicks), which is the whole point of D-194+D-196. Last session M1 prompted; this session it's silent.

**How to apply:** Gate progress: KH-trust ✅, KH1 (capture fired) ✅, M1 (mk_remember silent) ✅, KG4 ✅. STILL TO DO in the live gate: KH2 (inject answers a recall question), Session 2 kiro-cli (KC1-4 + KG-guard delete-block), E1 cold-open wedge, KU1/KU2 uninstall. Then restore real tiers from run4 backup + user pushes v0.4.0 tag.
