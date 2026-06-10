---
id: P-ZPU3YLGH
type: project
title: embedder ladder policy
created_at: 2026-06-10T07:21:59Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: e74d1a9c280d030fdfcaccd34ac992a4011fe2bc
---

Layer-5b embedder is chosen by a LADDER, not upfront

**Why:** MTEB rankings don't cover our short-fact corpus; the user prefers bigger-and-reliable over small-and-flaky, so the benchmark decides, not vibes (D-105)

**How to apply:** start bge-small-en-v1.5 via transformers.js (q8), run npm run bench:recall per rung (bge-base / nomic / EmbeddingGemma-class / bge-m3), go up until bang-per-buck flattens; install weight is an axis, quality wins ties
