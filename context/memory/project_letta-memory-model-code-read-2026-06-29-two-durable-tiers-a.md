---
id: P-3VGQYFZT
type: project
title: 'letta memory model (code-read 2026-06-29): TWO durable tiers + a message buffer.'
created_at: 2026-06-29T13:23:41Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 5fe538479b82465f673e6030e8aa1799ccec25844da582d506e80d4375f4f519
---

letta memory model (code-read 2026-06-29): TWO durable tiers + a message buffer. (1) Core memory = always-in-context blocks (label/description/value), per-block hard char limit CORE_MEMORY_BLOCK_CHAR_LIMIT=100000 (letta/constants.py:435). Edited by the AGENT via tools core_memory_append/core_memory_replace/rethink_memory (functions/function_sets/base.py) + the codex-style memory_replace/memory_insert/memory_rethink/memory_apply_patch. NO heat/trust/decay/frequency/access scoring anywhere on Block (orm/block.py, schemas/block.py) — only FileBlock has last_accessed_at. Promotion to core vs archival is PURE LLM JUDGMENT. (2) Archival memory = permanent semantic-searchable store (archival_memory_insert docstring: 'permanent', no eviction). (3) Eviction ONLY on the conversation message buffer via summarizer _partial_evict_buffer_summarization (drops oldest 30% -> summary; partial_evict_summarizer_percentage=0.30). Core + archival are NEVER cap-evicted. When a core block hits its char limit the write surfaces as an error and the agent must rethink/condense itself — letta has NO automatic eviction of durable memory.

**Why:** Background-loop reference (Task 179) + 'core memory exempt from eviction' precedent (Task 151 Move 2). The maintainer is deciding whether to protect high-value memory from a cap-relief sweep; letta's answer is: durable tiers are never swept, only the message buffer is.

**How to apply:** letta sleeptime agent (groups/sleeptime_multi_agent_v3.py): foreground turns increment a counter; every sleeptime_agent_frequency turns a background LettaAgentV3 fires, reads the conversation transcript since last_processed_message_id, and edits core-memory blocks via the memory tools, finishing with memory_finish_edits. Prompt = sleeptime_v2.py: 'make sure the memory blocks are comprehensive, readable, and up to date', 'be selective ... but aim to have high recall', use absolute dates not 'today/recently'.
