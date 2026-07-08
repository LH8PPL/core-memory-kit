# ADR-0019 — Auto-judged privacy: a layered screen with tier-routing as the quarantine

- **Status:** Accepted (2026-07-07)
- **Task:** 148 (pulled into v0.5.0 — the tag is blocked on it; D-294)
- **Relates:** D-150 (the original "sensitivity is Claude's judgment, not the user's tag" slotting), D-218/D-227 (the field survey + nestwork correction), the 2026-07-07 cold-open incident (Session 3 of the v0.5.0 cut-gate captured the maintainer's real name + email into a would-be-committed transcript), design §6.6 (privacy tags), §6.7 (Poison_Guard), §6.10 (this mechanism), [research note](../research/2026-07-07-auto-judged-privacy-prior-art.md)

## Context

The kit's committed tiers are its wedge — memory that travels with `git clone`. That same
property makes a privacy leak strictly worse than in any DB-backed competitor: a leaked
name/email/health detail in `context/` ships to every clone, forever, in git history.

Three prior mechanisms existed, none covering the incident class:

- `<private>` tags (§6.6) — user-prospective; useless for content the user never wrapped
  (the incident: `uv init` echoed the git-config name/email in TOOL OUTPUT).
- Poison_Guard (§6.7) — secrets/injection regexes; PII (names, health) is not pattern-shaped.
- The dev repo's own D-108 gitignore of `transcripts/` + `sessions/` — protected the
  maintainer's public repo only; the scaffold ships transcripts committed BY DESIGN
  (design §19: "ours is committed and permanent" — the recall floor + the travel property).

The cold-open cut-gate run produced exactly Task 148's named re-verdict trigger ("a privacy
incident / user request — re-verdict at the v0.5.0 cut"). The user's verdict: pull 148 into
v0.5.0 and block the tag.

**The prior-art position (research note):** no system anywhere ships LLM-judged sensitivity
routing between committed/gitignored tiers. The closest (caura-memclaw) has a real two-detector
PII pipeline but quarantines by metadata/visibility narrowing in the same store, and has no
false-positive recovery path. The transcript tier is unscreened-verbatim across the entire
field. Two pieces of this design are therefore novel: tier-routing-as-quarantine and the
redactions-log recovery.

## Decision

A **two-layer screen at two write-boundaries, isolate-don't-delete**, composing with (never
replacing) §6.6/§6.7:

1. **L1 — deterministic PII pattern layer** (sync, every commit-eligible write, ~ms):
   a PII category class (email, phone, home-path/username) joining the Poison_Guard family
   in a shared, scope-tagged catalog (hermes' scoped-subsets architecture). Runs BEFORE
   content-hash/dedup/disk and masks in place (memclaw's race-free ordering) with stable
   placeholders (`«EMAIL»`, `«PHONE»`, `~`). Findings carry category + offsets, never the
   matched text (memclaw). Invisible-Unicode/bidi checked on the raw string before NFKC
   normalization; bounded scan size; keyword pre-filter before expensive regexes
   (hermes/gitleaks discipline). Unlike Poison_Guard's REJECT posture, the PII class MASKS —
   a name/email in a fact is incidental, not adversarial.

2. **L3 — async Haiku sensitivity judge** (in the existing detached auto-extract child; no
   new hot-path cost): catches what patterns cannot — names, health details, addresses in
   prose. Instructions adapted from Anthropic's official PII-purifier prompt (full
   redacted-text output — LLMs are unreliable at offsets, reliable at rewrite; obfuscation
   defense retained). NER (an L2) was considered and REJECTED: domain-brittle (GLiNER F1
   0.81→0.41 on health text), a heavy new dependency, and the judge covers its ground.

3. **The transcript tier moves to live-buffer → judge → promote.** The hot path (capture-
   prompt + capture-turn) appends to a GITIGNORED live buffer (`transcripts/{date}.live.md`);
   the detached child screens pending entries through L3 and appends the screened text to the
   committed `transcripts/{date}.md`, advancing a promote watermark. The committed tier never
   sees unscreened text — **fail-closed by construction**. Haiku-down degrades to transcripts
   staying machine-local (exactly native Claude Code behavior) until a later successful
   promote — an honest degrade, surfaced by doctor, never a silent leak.

4. **The fact path gets the original 148 axis:** the auto-extract classifier emits
   `sensitivity: commit | local-only | drop` per candidate (Option A settled at slotting:
   default commit; sensitive-but-useful → `context.local/private.md`, gitignored; drop →
   logged as `skipped_reason: sensitivity_drop`). The explicit path (`cmk remember`) gets
   L1 only — deliberate user-authored text, `<private>` remains the override.

5. **Recovery — the gitignored `redactions.log`** (NDJSON, `.locks/`): every L1/L3 redaction
   records original → placeholder, machine-local, never committed. A false positive is
   recoverable locally; the committed tier never learns what was redacted. (The field has
   no release path at all — memclaw included.)

## Options considered

1. **Gitignore `transcripts/` + `sessions/` in the scaffold** (extend D-108 to all users).
   Rejected: breaks the committed-transcript differentiator (design §19's recall floor +
   memory-travels-with-git); punishes the private-repo majority for the public-repo case.
2. **Redact-after-write** (append committed now, child rewrites later). Rejected: fail-OPEN
   (a dead child leaves the leak in place) + read-modify-write races on an append-hot file.
3. **Sync LLM judge on the hot path.** Rejected: 180-400ms/call cannot fit the ~500ms hook
   budget (the layered-latency evidence in the research note; memclaw pushes all LLM
   judgment off its blocking path for the same reason).
4. **Local NER middle layer.** Rejected (above).
5. **Doc/warning only** ("ship as-is, warn public-repo users"). Rejected by the user's
   re-verdict: an incident at the cut proves warnings don't reach the moment of `git add -A`.

## Consequences

- The committed transcript lags the live turn by seconds (child latency). Search over
  `--scope transcripts` sees promoted entries only — acceptable: the raw tier is the
  last-resort recall rung, and the live buffer keeps the CURRENT session fully local anyway.
- A second Haiku call per turn rides the detached child (cheap; bounded by the child's
  existing internal timeout; composition pair registered in the validators).
- The committed **sessions middle tier** (`now.md` → `today-{date}.md`) is covered as of the
  Task-148 build (review I1): `now.md` gets L1 masking; its text is conversational prose only
  (tool output — the incident's vector — goes to the transcript, which is L3-screened, not to
  `now.md`); and the compress-session prompt carries a **privacy instruction** (keep personal
  names/PII out of the summary — the name defense patterns can't provide), with the compressed
  OUTPUT L1-masked before it lands in the committed `today-{date}.md`. _(Correction: an earlier
  draft of this line asserted the compress-prompt privacy line "bounds the residual" as if it
  already existed — it did not; the code-review-excellence pass caught the gap and it was closed
  in the same PR. The residual name-in-a-Haiku-summary risk is now bounded by the compressor
  instruction rather than a second L3 judge call — no extra Haiku call, no ceiling impact.)_
- The scaffold gains gitignore lines for the live buffer + `context.local/private.md` is
  born gitignored by the existing `context.local/` rule.
- Users can disable via `settings.json` `privacy.screen: off` (the kill-switch convention,
  like `CMK_DISABLE_SEMANTIC`).
