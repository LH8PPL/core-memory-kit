---
id: P-FHA3DTCB
type: project
title: 'Semantic Search: Opt-In Dependency, Default-On Behavior'
created_at: 2026-06-10T20:44:22Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 1058854ea70908b627b386a496530c960c455e52
---

**Installation**: `cmk install --with-semantic` adds @huggingface/transformers (~260 MB with ONNX runtime)

**Runtime behavior**: Once installed, `search.default_mode: hybrid` is configured; all bare `cmk search` and `mk_search` use semantic recall by default

**Pre-warming**: Model pre-warms at install time (avoids first-search surprise stall)

**Graceful fallback**: If embedder breaks, search degrades to keyword-only instead of failing entirely

**Design rationale**: Avoids hard 260 MB dependency penalty on every installation (especially CI, containers, markdown-only users) while delivering full default-on UX to users who explicitly opt in

**Future reconsideration**: Would re-open if quantized embedder (bge-small at ~25 MB) clears paraphrase benchmarks, or if opt-in adoption metrics reveal it as a friction gate

**Why:** Project aims to be lightweight (supporting users who only want markdown memory) while offering excellent UX to those who want semantic search. Balances these constraints via a design principle: dependency opt-in, behavior default-on.

**How to apply:** Reference this decision when documenting semantic search, onboarding contributors, or evaluating future bundling. Monitor adoption metrics to validate whether the opt-in step is a user fall-off gate (README/quickstart improvements help test this).
