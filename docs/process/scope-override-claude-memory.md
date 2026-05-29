---
process: scope-override-claude-memory
status: active
since: 2026-05-22
related_adrs: [0008-bank-airgap-deferred-to-future-version.md]
tags:
  - claude-ai
  - memory
  - prompts
  - workaround
---

# Process: Scope-override for Claude.ai's memory feature

## The problem

Claude.ai has a persistent memory feature that stores user context across conversations. In Deep Research mode this memory is **actively pulled** by the research model to "be helpful" — and the model often applies stored context to research even when the current task is unrelated.

Concrete example from `claude-memory-kit`: Claude.ai's memory had stored a work-context detail (a regulated / air-gapped deployment assumption). When the user asked Claude.ai to research memory systems for a **personal open-source project**, the research output assumed that regulated/air-gap context throughout — recommending Bedrock adapters, audit logs, machine-pinned tiers, none of which the personal project needs.

The user identified this as a recurring pattern: Claude.ai's research mode keeps applying a stored work-context assumption (a regulated / air-gapped deployment) to unrelated personal-project research, making assumptions that weren't asked for.

## The fix

Three layers, applied together:

### Layer 1 — Scope-override sentence in every prompt

Add this paragraph at the top of every Claude.ai (and ChatGPT) Deep Research prompt where personal-vs-work context could be confused:

```text
SCOPE OVERRIDE: This is a PERSONAL open-source project. Ignore any
memory or prior context about my workplace, employer, regulatory
constraints, air-gapped environments, or banking. Treat me as a
solo developer with no organizational constraints. If you find
yourself assuming "air-gapped" or "regulated" deployment, stop
and re-read this paragraph.
```

The last sentence ("stop and re-read") is the load-bearing one. Without it, the model often skims the override on first read and reverts to memory-injected context by the middle of its response. The explicit "stop" instruction interrupts pattern completion.

For projects where bank/air-gap context IS relevant (e.g., a future v0.2 deployment guide for regulated environments), simply omit this paragraph and let the memory do its work.

### Layer 2 — Counter-anchor with explicit context

Negative instructions ("ignore X") are weaker than positive instructions ("the context IS Y"). After the override, explicitly state the deployment context:

```text
Deployment target: a single developer's laptop, MIT-licensed open-source,
no enterprise constraints, no security review process, no audit trail.
```

This gives the model a concrete frame to hold onto, rather than just an empty space where the bank context used to be.

### Layer 3 — Claude memory hygiene

If a specific memory entry keeps causing problems:

1. Go to **Claude.ai → Settings → Profile → Manage memories**.
2. Find the specific entry (the stored work-context / deployment-environment detail).
3. Delete just that entry. Other memories stay.

Alternatively, Claude.ai has a temporary chat / "Don't remember" toggle (UI varies by interface version) that disables memory read AND write for that conversation. Useful for one-off personal-project research without permanently deleting work-context memory.

## What this is NOT

- This is **not a prompt-injection defense.** It's a prompt-anchoring fix. The model is being too helpful, not malicious.
- This is **not a Claude-only issue.** ChatGPT has the same memory feature with the same problem. The override pattern works for both.
- This is **not a permanent fix.** Anthropic may improve memory-scoping in future Claude versions. Re-evaluate this process when that happens.

## When to use the override

| Situation | Use override? |
|---|---|
| Personal project, no work overlap | **Yes** |
| Work project, on the work corporate environment | No — memory context is correct |
| Mixed (personal but informed by work expertise) | Yes, but soften — say "ignore deployment constraints" rather than "ignore my workplace entirely" |
| Brand-new topic the memory has no relevant context for | Optional — overhead with no benefit |

## Provenance

This process documented 2026-05-22 after the Option-B Deep Research run on `claude-memory-kit` returned with "regulated bank / air-gapped" framing despite the project being personal. See [ADR-0008](../adr/0008-bank-airgap-deferred-to-future-version.md) for how we handled the specific output (kept the pluggable compressor architecture; deferred Bedrock/local-LLM adapters to v0.2+).

## References

- Conversation discussing the issue: [../conversation-log/2026-05-22.md](../conversation-log/2026-05-22.md), thread "Claude.ai memory injection"
- Option-B research output (showing the symptom): [../research/2026-05-21-claude-ai-deep-research-option-b.md](../research/2026-05-21-claude-ai-deep-research-option-b.md)
- Claude.ai memory feature docs: <https://support.claude.com/en/articles/10185728-about-memory-on-claude-ai>
- ChatGPT memory feature docs: <https://help.openai.com/en/articles/8590148-memory-faq>
