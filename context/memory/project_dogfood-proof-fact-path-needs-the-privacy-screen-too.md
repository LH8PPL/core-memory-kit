---
id: P-B9NaRSCM
type: project
shape: Event
title: 'Dogfood proof: fact-path needs the privacy screen too'
created_at: 2026-07-08T10:58:23Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 763ee436d7e25b5d03daee252e7b87327cd7a6732b972508a20f9a9c10038fa9
related: [task-148-auto-judged-privacy-layered-screen-architecture, cut-gate-v050-transcript-privacy-is-task-148-trigger-fired]
---

The dogfood auto-extract leaked the maintainer's real name+email into 3 committed fact files during the Task-148 build — caught by validate-maintainer-name-confined in the stress gate, not before.

**Why:** The facts DESCRIBED the v0.5.0 cold-open incident (which was about that exact name+email leaking from a uv-init git-config echo), so auto-extract captured the name+email verbatim into context/memory/*.md — committed tier. This is the precise leak class Task 148 exists to catch, occurring on the FACT/scratchpad write path, not just the transcript path. The email should have been L1-masked at the cmk-remember/auto-extract boundary; the name is L3 territory. It proves the fact path (memory-write/write-fact) genuinely needs the screen, validating 148.2's explicit-path L1 wiring — and shows the residual: L1 alone can't catch a bare name, only L3 can.

**How to apply:** When writing dogfood facts that QUOTE an incident's leaked content, the content itself is the hazard — scrub before commit. The validate-maintainer-name-confined validator is the backstop (it fired in the stress prerun). Going forward, 148's L1 mask on the memory-write/write-fact path should catch the email automatically; the name still relies on the L3 judge (transcripts) or manual scrub (facts). Consider whether the fact path should also get an L3 pass in a future task.
