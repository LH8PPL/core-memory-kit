---
id: P-77VH6NNB
type: project
shape: Timeless
title: 'Kit identity: a harness over the harness - the user''s framing'
created_at: 2026-07-21T20:14:39Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 14759307424290917c5576945d83bff79b6bbb37e49f5d36fec87b006c1deec6
related: [mcp-tools-under-used-when-harness-defers-them-task-233-fire, episode-based-architecture-principle-refined, memory-kit-s-soft-spot-agent-choice-default-over-recall]
---

The kit's identity, in the user's words (2026-07-21): "an AI agent harness over the AI agent harness — the core-memory-kit harness over the claude-code harness." The kit is supposed to make the agent WORK WITHIN IT — not a toolbox the agent optionally reaches into, but a layered harness that shapes the agent's memory behavior the way the host harness shapes its tool behavior: "the kit is a holistic process, and it needs all its parts to work" — the behind-the-scenes automation AND the in-chat half that makes the agent write to and recall from memory. Memory-search confirmed this framing was NOT previously recorded; its nearest ancestor is P-RWG93HDR ("the cross-session runtime that bounded harnesses lack"). Consequence for design: capture is already harness-grade (hooks fire without model cooperation); recall is hope-grade (model-initiated) — Task 233's build slice is the harness-ification of recall, and P-P3Ta6QVX (07-15) + P-DXPCKAUU (07-21) are its live evidence.

**Why:** Names the gap between the kit's two halves precisely: hooks COERCE (harness-grade), skills/tools HOPE (model-initiated). Every under-fire observation this week is one symptom of that asymmetry. The framing decides Task 233's direction: move recall from model-choice toward environment-shaping.

**How to apply:** When designing any model-facing kit surface, ask: does this COERCE like a harness (fires regardless of model cooperation) or HOPE like a suggestion (requires the model to choose it)? Prefer coerce where the host harness allows; measure the hope-paths' fire rate (D-122) and record the host's tool-loading policy alongside.
