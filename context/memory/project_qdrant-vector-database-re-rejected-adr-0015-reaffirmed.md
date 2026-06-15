---
id: P-DYa3YF7X
type: project
title: Qdrant Vector Database — Re-rejected (ADR-0015 reaffirmed)
created_at: 2026-06-15T08:26:30Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: e82053880bab45cbd239f38aaadf4d4ab8624fb3d460388f597acb1a67502ad0
---

- **Architecture:** Server-weight vector-DB (Rust, 32k★)
- **Conflicts:** D-23 (node-only), ADR-0002 (markdown is truth), lean-install ethos
- **Technical reason:** Our bottleneck is embedding quality (bge-base ladder, R@5 0.941), not ANN speed; HNSW + quantization are non-actionable at kit scale
- **Honest framing:** Qdrant excels for massive/distributed workloads — which the kit deliberately isn't

**Why:** Prevents future re-litigations; clarifies architectural vs technical reasons for rejection

**How to apply:** Reference when vector-DB discussions arise in future sessions; ground decisions in ADRs and product-fit, not capabilities alone
