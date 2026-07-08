---
id: P-KZaR4PMV
type: project
shape: State
title: task-148-v050-scope-transcript-path-not-just-fact-classifier
created_at: 2026-07-07T19:37:29Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 764e07a3c3b79fb4bf2c1d316695023f702757b61e747bff40d60ab97e948eb5
related: [cut-gate-v050-transcript-privacy-is-task-148-trigger-fired]
---

SCOPE FINDING for pulling Task 148 into v0.5.0 (the cold-open re-verdict): Task 148 as WRITTEN adds a sensitivity axis to the auto-extract HAIKU FACT CLASSIFIER (routes sensitive CURATED FACTS away from the committed tier to context.local/). But the v0.5.0 cold-open leak was in the RAW TRANSCRIPT tier (context/transcripts/{date}.md), which capture-turn.mjs writes VERBATIM using only sanitizePrivacyTags (strips <private> blocks) — this happens BEFORE and INDEPENDENT of auto-extract's classifier (capture-turn imports privacy.mjs + appends the transcript, THEN spawns auto-extract as a detached child). So 148's fact-classifier sensitivity axis does NOT close the transcript leak — it protects curated facts, not the raw tier where the actual PII («NAME»/«EMAIL» (the maintainer's git-config identity) from uv-init git-config echo) landed. The <private>-tag strip can't catch it because the user never wrapped it (the exact 'you don't know it's sensitive until you've typed it' problem 148's own description names). CONCLUSION: closing the cold-open leak requires MORE than 148-as-written — either (a) EXTEND 148 to add a sensitivity/redaction screen on the capture-turn TRANSCRIPT-write path (not just the fact classifier), or (b) a sibling mechanism for the raw tier. This is a genuine architectural fork = design+ADR BEFORE code (the needs-deeper-design verdict holds, now bigger than the task entry assumed). Task 148's two pre-existing open forks (explicit-path screen for cmk remember with no Haiku; false-positive recovery) STILL apply. Default action is settled (Option A: drop-from-committed, fall through to context.local/; <private> survives as override) per tasks.md:1468; the judgment-SITE design is the open part — now spanning BOTH the fact path AND the transcript path. nestwork (D-227) is the reference for the term-list + AI-pass shape.

**Why:** The user decided to pull Task 148 into v0.5.0 to close the cold-open transcript-PII leak. But 148 as written only screens the fact-extraction path, while the leak is in the raw transcript tier written earlier by capture-turn — so building 148-as-spec would NOT fix the incident that motivated pulling it in. This must be designed (ADR) before code, and the scope is bigger than the task entry.

**How to apply:** Write the 148 design doc + ADR first (needs-deeper-design, binding rule = docs before code). Design must span: (1) the raw-transcript-write sensitivity screen in capture-turn (the actual leak site) — likely a Haiku or heuristic pass that redacts/routes before the transcript append, composing with the detached-child budget; (2) the fact-classifier axis (148 as originally written); (3) the two open forks (explicit cmk remember screen, false-positive recovery). Grill the design (the user's needs-deeper-design intent) before implementation. Read nestwork's desensitization contract at design time.
