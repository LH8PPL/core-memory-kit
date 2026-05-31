---
adr: 0008
title: Bank / air-gapped deployment deferred to v0.2+ but compressor designed pluggably
status: accepted
date: 2026-05-22
deciders:
  - Lior Hollander
  - Claude Opus 4.7
supersedes: null
superseded_by: null
related:
  - 0002-markdown-source-of-truth-over-opaque-db.md
  - 0006-lifecycle-hooks-architecture.md
tags:
  - deployment
  - scope
  - compressor
  - air-gap
---

# ADR-0008 — Bank / air-gapped deployment deferred to v0.2+ but compressor designed pluggably

## Status

**Accepted** 2026-05-22.

## Context

Option-B Deep Research (Claude.ai) repeatedly framed `claude-memory-kit` as if it were being designed for a **regulated bank / air-gapped deployment**. The report emphasized:

- Pluggable compressor (Haiku 4.5 in dev → Bedrock Anthropic in prod → local Llama-3.1-8B in air-gapped tier).
- `--tier machine` (chezmoi-style) for observations that must never leave a specific host.
- Audit log (`memkit audit`) covering every export.
- Internal security review for MCP exfiltration vectors.

The user clarified that Claude.ai's research mode had **injected this context unprompted** because Claude.ai's memory feature had stored a work-context detail (a regulated / air-gapped deployment assumption) and applies that context to research even when the current task is personal. The user explicitly stated this is a recurring problem with Claude.ai's research mode.

The user's actual position: `claude-memory-kit` is a **personal open-source project**. Regulated / air-gap context is a "maybe later, but not v0.1" concern.

## Decision

**v0.1 ships only the Haiku 4.5 (via Anthropic API) compressor adapter. Bank/air-gap features are NOT in v0.1.**

However, the v0.1 *architecture* must not preclude bank/air-gap deployment in v0.2+. Specifically:

1. The compressor is a **pluggable interface** even though only one implementation exists in v0.1:

   ```typescript
   interface CompressorBackend {
     compress(text: string, opts: CompressorOpts): Promise<string>;
     model_id(): string;
     cost_per_session_estimate(text_len: number): number;
   }
   ```

   v0.1 ships `class HaikuViaAnthropicApi implements CompressorBackend`. v0.2+ can add `BedrockBackend`, `LocalLlamaBackend`, etc., without touching the calling code.

2. **No hard-coded Anthropic API endpoint** in the compressor — the URL lives in `settings.json` so it can be swapped without code changes.

3. **No silent network calls** elsewhere (NFR-5 in [requirements.md](../../specs/v0.1.0/requirements.md)) — every network call is documented, user-approved, and tied to a specific feature. This makes v0.2's air-gap path a feature flag, not an audit.

### NOT in v0.1 (deferred to v0.2+)

- `BedrockBackend` (Anthropic via AWS Bedrock).
- `LocalLlamaBackend` (locally-hosted Llama-3.1-8B with KVzip compression).
- `--tier machine` (chezmoi-style host-pinned observations).
- `memkit audit` command (full export audit log).
- Pre-commit secret scanner integration (orthogonal to `<private>` tags — see [adr/0007 references for context]).

## Consequences

### Positive

- v0.1 scope stays tight. No Bedrock SDK dependency, no Llama runtime, no AWS credentials surface.
- The architectural seam (pluggable compressor interface) means v0.2 is a feature addition, not a rewrite.
- If this is ever deployed into a regulated / air-gapped environment, the seam provides a future path — but that's not blocking v0.1.

### Negative

- The pluggable interface adds one layer of indirection that v0.1 doesn't strictly need. A simpler "just call Haiku directly" implementation would be 20 lines shorter. The discipline is forward-looking insurance.
- Some Option-B research recommendations (audit log, machine tier) are deferred. If the user later realizes they want them sooner, we re-prioritize.

### Neutral

- This decision was prompted by a Claude.ai memory-injection issue (research model assumed bank context unprompted). See [process/scope-override-claude-memory.md](../process/scope-override-claude-memory.md) for the workaround pattern we now use when prompting Claude.ai Deep Research.

## Alternatives considered (and why rejected)

| Alternative | Why rejected |
|---|---|
| Build bank/air-gap features in v0.1 | Scope explosion. There's no regulated/air-gapped deployment target in 2026; building the feature now is speculative. |
| Hardcode Anthropic API and never abstract | If we later add a Bedrock or local backend, every call site has to change. The interface is one file; the abstraction is cheap. |
| Drop bank/air-gap entirely from the roadmap | A regulated/air-gapped deployment is a plausible future target; a contribution path matters. v0.2+ is the right time. |
| Ship Bedrock support too in v0.1 | Adds AWS SDK dependency, IAM credential handling, region selection, billing surface — none of which the v0.1 personal use needs. |

## References

- Option-B Deep Research: [research/2026-05-21-claude-ai-deep-research-option-b.md](../research/2026-05-21-claude-ai-deep-research-option-b.md), specifically the "regulated bank" framing in TL;DR and Stage 3 recommendations.
- Process doc on Claude.ai memory injection: [process/scope-override-claude-memory.md](../process/scope-override-claude-memory.md)
- Anthropic Claude on Bedrock GA notes: <https://aws.amazon.com/bedrock/anthropic/> (verified 2026-05-22)
- KVzip paper (informs local-LLM compression option): Kim et al., arXiv:2505.23416 — <https://arxiv.org/abs/2505.23416>
- Conversation context: [conversation-log/2026-05-22.md](../../archive/docs/conversation-log/2026-05-22.md), thread "Bank/air-gap context decision"

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-05-22 | Lior | Decided: defer to v0.2+, but design v0.1 with pluggable compressor interface |
