---
id: P-WCaNKPHM
type: project
shape: State
title: cut-gate-v050-transcript-privacy-is-task-148-trigger-fired
created_at: 2026-07-07T19:35:38Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 5783e97e4839a50e8549b6c8fdb91b17f9ab9f48dca4b31c7530b70e48121a64
related: [cut-gate-v050-scaffold-gitignore-transcript-leak]
---

CORRECTION to the v0.5.0 cold-open transcript-privacy finding (supersedes the "scaffold gitignore oversight" framing in P-RHDTAZZL): after checking design.md + tasks.md + DECISION-LOG, committing context/transcripts/ is INTENTIONAL and load-bearing — design.md:3268 makes "ours is committed and permanent" a deliberate differentiator vs native's ~30-day machine-local JSONL, and the --scope transcripts recall floor + team-shareable value prop depend on it. Gitignoring transcripts by default would BREAK a shipped feature. The privacy hazard (a committed-tier leak ships to every git clone — real name/email/paths/secrets from tool output) is ALREADY KNOWN and designed-for: it is Task 148 (auto-judged privacy — an auto-extract sensitivity axis commit|local-only|drop that routes sensitive content to gitignored context.local/), status needs-deeper-design / backlog-no-version-yet. Task 148's OWN trigger reads: "the next auto-extract classifier-prompt touch (Task 192 the Stop-hook judge is a candidate ride); OR a privacy incident / user request. Re-verdict at the v0.5.0 cut." The cold-open (Session 3, 2026-07-07) captured «NAME»/«EMAIL» (the maintainer's git-config identity) into context/transcripts/2026-07-07.md that git add -A would stage — this IS the "privacy incident / user request" the trigger names, AND we are AT the v0.5.0 cut. So the correct action is NOT a gitignore fix — it is to make Task 148's re-verdict decision now (per D-248 the backlog-sweep-at-minor-cut rule + D-267 trigger-fired walk). D-108's dev-repo gitignore is correctly scoped (the maintainer's OWN repo is a public OSS repo). Curated tiers (memory/ facts, MEMORY.md, USER tier) remain CLEAN — the exposure is ONLY the raw transcript/session tiers.

**Why:** My first read framed this as a scaffold-gitignore oversight and proposed gitignoring transcripts by default — WRONG per the docs: committed transcripts are an intentional differentiator, and the privacy hazard is the already-designed Task 148 whose trigger explicitly says 'privacy incident / user request → re-verdict at the v0.5.0 cut.' The cut-gate produced exactly that incident at exactly that cut. The action is a backlog re-verdict, not a gitignore change.

**How to apply:** At the v0.5.0 cut, run Task 148's re-verdict (D-248 minor-cut backlog sweep + D-267 trigger-fired walk): decide (a) pull 148 into a near lane now that its trigger fired at the cut, (b) ship v0.5.0 with an interim guard (install-time warning + SECURITY doc that transcripts are committed + how to gitignore them, since 148's full auto-judge is needs-deeper-design and shouldn't block the tag), or (c) keep deferred with a refreshed trigger + document why. Recommend (b) as the tag-unblocker + (a) laned for v0.5.x. Do NOT gitignore transcripts by default (breaks the committed-recall-floor differentiator).
