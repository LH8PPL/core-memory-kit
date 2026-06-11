# caura-memclaw — governed fleet memory: the strongest Task-127 prior art yet

**Date**: 2026-06-12 · **Source**: <https://github.com/caura-ai/caura-memclaw> (README-level review; NOT code-dived) · **Trigger**: the user's post-v0.3.0 review sweep.

## What it is

Open-source governed memory for AGENT FLEETS: PostgreSQL + pgvector, FastAPI microservices, multi-tenant with row-level isolation, visibility scopes (agent/team/org), four trust tiers, audit trails, PII auto-quarantine, MCP-native (12 tools), OpenClaw fleet plugin. Vendor-backed (caura-ai), Apache 2.0, v2.14.0 (2026-06-10), 104 stars, a named production case (eToro: "300+ AI agents on one governed memory — 26,500+ memories, 1,372 shared skills, 23 ms p50 search").

## Why it matters to the kit

1. **Concept-set convergence (3rd independent instance this week).** Trust tiers, per-operation audit trails, provenance, contradiction auto-supersede (= our F-D), "crystallization" LLM-merging near-duplicates (= our consolidation / Task 95), hybrid semantic+keyword retrieval, PII quarantine (= the Poison_Guard class). After Simon-v2 (D-119) and ruflo-by-contrast (2026-06-12 note), memclaw-by-convergence confirms the vocabulary is simply correct — the kit holds it file-based, local-first, git-native.
2. **The category answer to Task 127 (team layer, postponed to v0.5+ per D-127).** Their lane is orgs/fleets on server infrastructure (Postgres/Redis/Docker) — the exact class the kit removed for individuals (D-101 / Task 120). When 127's design slot arrives, the live fork is: **git-native federation of our own vs. a memclaw CONNECTOR as the team seam** — the latter matches the user's original framing ("a complementary project and a way to connect it in the kit", D-119) almost verbatim. Code-dive memclaw FIRST at that point.
3. **Nearer-task inputs**: outcome-based learning (memories scored by task success/failure) is a concrete shape for **Task 97** (dynamic trust); the 8-status memory lifecycle with automatic crystallization is prior art for **Task 66** (temporal validity).

## Verdict

No current-lane impact. Primary prior-art reference for Task 127; secondary inputs to 97/66. All claims README-level — apply the primary-source rule (code-dive) before citing any as fact.
