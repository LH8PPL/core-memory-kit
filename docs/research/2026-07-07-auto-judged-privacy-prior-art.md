---
date: 2026-07-07
topic: Auto-judged privacy screen prior art — full-corpus triage + deep-reads (memclaw PII pipeline, hermes threat-pattern architecture, PII-detection landscape, nestwork, Anthropic redact/Dreams/PII-purifier)
source: Three-wave agent research (10 sonnet runs) — targeted deep-reads + full-corpus triage of SOURCES.md/all research notes + code-level shortlist reads; clones under C:/tmp/cmk-research-clones/
tags: [task-148, privacy, pii, redaction, poison-guard, transcripts, memclaw, hermes, presidio, gitleaks, a-memguard, honcho, nestwork]
---

# Auto-judged privacy screen — prior-art sweep (Task 148, v0.5.0)

**Date:** 2026-07-07 · **Trigger:** the v0.5.0 cold-open cut-gate captured the maintainer's real name + email (from `uv init`'s git-config echo in tool output) into `context/transcripts/{date}.md` — a would-be-committed file. Task 148's own re-verdict trigger ("a privacy incident / user request. Re-verdict at the v0.5.0 cut") fired exactly as written; the user pulled 148 into v0.5.0 and blocked the tag on it (D-294).

**Method:** three waves — (1) targeted deep-reads (nestwork, mem0/letta/basic-memory fresh-diff, PII-detection landscape), (2) a FULL-corpus triage (every project in SOURCES.md + all ~78 research notes scored against the privacy lens — the D-180 widen, at the user's push), (3) code-level deep-reads of the triage shortlist (caura-memclaw, hermes-agent, Memoria, Honcho, gitleaks, A-MemGuard paper). ~10 sonnet agent-runs; clones under `C:/tmp/cmk-research-clones/`.

---

## Headline: no prior art for the full mechanism; strong parts to steal

**Nobody ships LLM-judged sensitivity routing between committed/gitignored tiers.** The closest system (caura-memclaw) has a real PII pipeline but quarantines by *metadata + query-visibility narrowing in the same store* — never by tier migration. The field's raw-conversation posture is unscreened-verbatim persistence everywhere (mem0, letta, basic-memory, Honcho), and mem0 moved *backwards* (its 2026-07 `ADDITIVE_EXTRACTION_PROMPT` calls personal/health details "often the MOST valuable" to store). The kit's git-committed model makes the leak class strictly worse than DB-backed competitors (a committed leak ships to every clone) — we are solving a problem the field structurally doesn't have to.

## Per-source findings (what to steal / avoid)

### caura-memclaw (the only real PII pipeline found; deep-read at `d0d458f`)

- **Two-detector split** — the load-bearing architecture: a deterministic regex+checksum scan ALWAYS inline/blocking (`common/governance/pii_patterns.py`, 7 categories, Luhn/mod-97/entropy gates on high-risk classes), plus an LLM `contains_pii` signal riding the general enrichment call — inline in "strong" write mode, **deferred + async-remediation** in "fast" mode (post-write `soft_delete` on an already-persisted row).
- **Ordering steal:** the deterministic scan runs BEFORE the content-hash, mutating content in place, so hash/dedup/embed/store all see the *redacted* text — mask-then-store is race-free by construction.
- **Audit steal:** `Finding` carries only category + offsets + severity + content-sha, **never the matched text** — the audit log structurally cannot leak what it caught.
- **Actions:** tenant-configured `drop` (422, nothing persists) / `mask` (in-place, «EMAIL»-style tokens) / `flag` (store + metadata stamp). LLM findings have no spans → can only drop/flag, and the audit records when a mask-configured tenant got a forced flag fallback.
- **Config-validator steal (verbatim class):** a boot-time Pydantic validator that raises unless `enrichment_inline_timeout < request_timeout` (named per composing pair) — exactly the kit's composition-verification class, enforced at construction.
- **Divergences (deliberate, ours):** (a) memclaw's "keep private" only narrows `visibility` — same DB, same tier; the kit routes to a **gitignored tier** (stronger guarantee). (b) memclaw has **no false-positive release path at all** — a genuine field gap the kit's redactions-log recovery fills. (c) memclaw's 4 trust tiers are agent-authorization, fully unrelated to content sensitivity — no trust×sensitivity precedent exists.

### hermes-agent (deep-read at `ee66ff2`; corrects earlier assumptions)

- **`privacy.redact_pii` is NOT a PII scrubber** — it's deterministic SHA-256 hashing of messaging-platform user/chat IDs behind a platform allowlist, in the gateway session-context block only. Fails open. Not memory screening. (The field's one "PII redaction" commit was weaker than it looked.)
- **The real steal: ONE shared threat-pattern library with scoped subsets** (`tools/threat_patterns.py`: `all`/`context`/`strict`), consumed by three lifecycle call sites, each scope tuned to that boundary's false-positive tolerance (strict for user-mediated writes where an FP is cheaply resolved; narrower for scraped context files).
- **Defense-in-depth steal:** content is scanned at write AND re-scanned at load-from-disk into the prompt snapshot — the load-time scan catches on-disk poisoning that bypassed the tool. On a load-time match, the **snapshot gets a `[BLOCKED: …]` placeholder while the live file keeps the original** so the user can inspect + delete — the isolate-don't-vanish pattern our redactions-log mirrors.
- **Mechanics steals:** invisible-Unicode/bidi set-intersection check on the RAW string BEFORE NFKC normalization (normalization strips the signal); bounded `MAX_SCAN_CHARS=65_536`; bounded regex filler `(?:\w+\s+){0,8}` (no catastrophic backtracking); atomic temp-write+fsync+rename (readers never see a truncated file).
- **Confirmed:** no LLM-judgment tier anywhere in hermes — every guard is sync regex. The kit's async-Haiku judge has no hermes precedent; it is invented, not adapted.

### Anthropic (primary sources)

- **Memory Stores ship a first-party `redact` operation** (scrub a historical version's content — "leaked secrets/PII" — preserving the audit trail) and **Dreams** re-curates by reading raw transcripts and writing a NEW reviewable output store, never modifying input — the staged/deferred pipeline in its purest, highest-authority form.
- **The official "PII purifier" prompt** (Console prompt library) — an expert-redactor prompt that replaces PII in place, explicitly defends against obfuscated PII (spaced/newline-split characters), and returns FULL redacted text rather than character offsets (LLMs are unreliable at offsets, reliable at rewrite). This is the foundation for the kit's judge instructions.
- The API memory-tool docs warn: Claude "will usually refuse to write down sensitive information" but implementers should "add stricter validation" — first-party validation for a stricter-than-model-judgment screen.

### nestwork (deep-read at `027c43a`)

- The "desensitization contract" (`nestwork.config.json` `desensitize.*`) has **zero runtime enforcement** — it's a documented agent procedure with a mandatory human-review gate, not a code-level write screen. Their only automated redaction (history-sync hook) is credential/secret regex + home-path→`<HOME>` — **no name/email/PII class at all**.
- **Steals:** the LLM prompt's JSON output shape (`desensitized_content` / `redactions[]` / `review_flags[]`), the stable placeholder vocabulary (`<EMPLOYER>`, `<COLLEAGUE>`, `<INTERNAL-URL>`…), and the posture line: *"Be conservative. When in doubt, redact and flag rather than passing through."*

### PII-detection landscape (2026)

- **Every maintained JS/npm redaction library is regex-only** and self-documents that person-names break it (hyphenated/accented names). No maintained JS library does local NER or LLM PII detection.
- **Accuracy consensus:** regex is structurally incapable of context-dependent PII (names in prose); generic NER is domain-brittle (GLiNER F1 0.81 → 0.41 on health text); LLM-judgment is the only high-recall option for conversational PII. Latency tiers: regex ~2ms · NER ~35ms · LLM ~180-400ms — validating the layered fast-sync + async-LLM split.
- **Presidio:** its regex/checksum/deny-list recognizer catalog ports cleanly as JS data; its PERSON entity is NER-based and weak — not portable, not needed (the judge covers it). LLM Guard's Anonymize = Presidio + NER underneath (the guardrails ecosystem treats PII as an NER problem; no LLM-judge prompt to steal there).
- **gitleaks:** zero PII detectors (pure secrets by design). Steal its regex *engineering discipline*: cheap keyword pre-filter before the expensive regex, entropy thresholds, structural/checksum anchors, allowlist blocks.

### Field-diff (mem0 `9b04509` / letta `b76da9092` / basic-memory `0e59bbf`, since 2026-06-20)

- No privacy code added anywhere; all three persist raw conversation verbatim, unscreened. mem0's new extraction prompt is actively extraction-maximizing on personal content ("When in doubt, extract"). basic-memory's hermes integration auto-captures raw per-turn transcripts with pure length-truncation as the only transform. One field signal: NousResearch/hermes-agent's `privacy.redact_pii` (see above — ID hashing only).

### Bundle (Memoria / Honcho / A-MemGuard)

- **Memoria's `quarantine_low_confidence` is a hard `DELETE FROM`** behind a marketing name (whole-DB snapshot as the only rollback) — the *naming pitfall* to avoid: don't call anything "quarantine" without a per-item recovery path.
- **Honcho:** clean write-raw-now → durable Postgres queue (`work_unit_key` dedup + advisory locks) → async LLM derive — but purely a latency architecture, zero screening. The staging→async-judge→promote template transfers; the judge is ours to add.
- **A-MemGuard (paper; repo 404):** validates **isolate-don't-delete** as an evaluated posture (flagged memories are excluded from the validated retrieval set but never deleted; flags feed a lessons bank), and the **two-stage judge** shape (build a consensus/reference view first, then classify each candidate against it) as a prompt-engineering upgrade over one-shot classification.

---

## Design consequences (what the ADR encodes)

1. **L1 deterministic pattern layer** — sync, every write path, PII category class (email/phone/home-path/username) added to the Poison_Guard family; masks in place BEFORE hash/dedup/write (memclaw ordering); findings carry category+offsets never text (memclaw); invisible-Unicode-before-normalization + bounded scan + keyword pre-filter (hermes/gitleaks); stable placeholders.
2. **L3 async Haiku judge** in the existing detached child — Anthropic's PII-purifier prompt adapted (full-redacted-text output, obfuscation defense); transcript tier moves to **live-buffer (gitignored) → judge → promote-to-committed** so the committed tier never sees unscreened text (fail-closed; Haiku-down degrades to machine-local transcripts, i.e. native behavior — honest degrade).
3. **Fact path** — `sensitivity: commit|local-only|drop` axis on the auto-extract classifier (Option A settled: default commit, sensitive-useful → `context.local/`, drop logged).
4. **The two novel pieces (no field precedent):** tier-routing as the quarantine (stronger than memclaw's visibility narrowing) and the gitignored `redactions.log` false-positive recovery (a gap even memclaw didn't solve).
5. **NER layer (L2) rejected** — domain-brittle, heavy dep, the judge covers its ground.

Companion decision record: ADR-0019. Design: design.md §6.10. Task: 148 (v0.5.0).
