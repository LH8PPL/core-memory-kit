---
id: P-4VAY63ST
type: project
shape: Event
title: Kiro gate contaminated by running CLI checks in a Kiro-open folder — re-run needed for B9/E3
created_at: 2026-07-08T19:50:04Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 82a810fbbd6660ae7bf86d211f5112a8414e88fd0755abbdc78e3599d93e3ba7
related: [kiro-gate-v0-5-0-session-1-privacy-screen-all-core-surfaces, d-292-resolved-all-three-agent-gates-block-the-v0-5-0-tag-co]
---

KIRO gate test-hygiene error (my mistake): I ran the CLI-deterministic gate checks (cmk/node commands) inside C:\Temp\kiro-gate-v050 WHILE the Kiro IDE had that folder open with hooks active — so Kiro's capture hook recorded MY command activity + this Claude conversation's assistant text into the Kiro project's transcript/now.md, contaminating it. Result: the live transcript has 11 assistant-turn headings, 0 user-turn headings, and 9 mentions of my Claude-session text mixed with 14 Kiro-build terms. This compromises B9 (auto-extract facts) and E3 (learn-loop) scoring for this Kiro session — auto-extract returned nothing_durable x11 because it saw assistant-only/contaminated content.

**Why:** Found during the thorough pre-S1-through-S2 file/command sweep the user requested. Evidence: context/sessions/now.md and context/transcripts/2026-07-08.live.md contain '## <ts> — assistant' headings whose BODY is this Claude conversation's text (e.g. "Kiro gate — CLI-deterministic half: PASS", "Recorded (P-EA59K24G)", the mk_remember tool-call echo) — my messages, not the Kiro session's. 0 '— user' headings at all. The extract.log shows 11 successful auto-extract runs (dur 7-18s, real kiro-cli LLM calls) ALL returning nothing_durable/obs:0 — consistent with the extractor seeing assistant-origin/contaminated content (assistant-origin candidates demote toward discarded; no USER_TURN to anchor user-stated preferences). ROOT: the Kiro IDE had C:\Temp\kiro-gate-v050 open with its hooks live while I ran the gate's CLI-deterministic checks (cmk doctor, node probes, git config) in that same folder from the dev-repo Claude session — Kiro's capture fired on that activity. This is MY test-hygiene mistake (the guide's §0 backup/isolation intent is that the folder is driven ONLY by the agent under test), NOT a proven product bug. The CLI-deterministic surface checks (KG1-KG11 + privacy scaffold) and the privacy-screen L1/L3 mechanism (redactions L1:1+L3:10, committed transcript screened) are STILL valid — they're file-state checks independent of the transcript content. What's compromised is B9 (auto-extract rich facts) + E3 (learn-loop recall/judge) which read the session's captured turns. KG11 clarification (the user's catch): trust lives in .vscode/settings.json (present, scoped), NOT .kiro/permissions.yaml (not emitted this install) — KG11 PASSES via .vscode.

**How to apply:** RE-RUN the Kiro live session CLEANLY: (1) fresh folder (e.g. C:\Temp\kiro-gate-v050b), (2) install --ide kiro --with-semantic + set the fictional git identity, (3) do ALL CLI-deterministic checks BEFORE opening it in Kiro (or in a throwaway probe dir), (4) then open ONLY in Kiro and drive the session there — do NOT run cmk/node commands in that folder from a separate Claude session while Kiro has it open. Then B9/E3 can be scored honestly: check now.md has BOTH — user and — assistant headings, extract.log shows obs>0 on a preference-stating turn, recall.log has source:inject+search, and (if a failure/correction happens) trust-signals.log populates. The privacy screen + CLI surfaces already PASSED and need not be re-verified. This is the general test-isolation discipline: a gate folder is driven by EXACTLY ONE agent; a second agent (or my CLI commands) touching it while hooks are live contaminates the capture. Relates the fresh-folder discipline (P-J4D2RZFS), P-EA59K24G (the now-compromised Session 1 scoring — supersede its B9/E3 claims), D-292 (the 3-gate resolution).
