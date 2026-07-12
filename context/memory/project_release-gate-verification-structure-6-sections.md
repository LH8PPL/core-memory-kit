---
id: P-DKP76NFC
type: project
shape: Timeless
title: Release Gate Verification Structure — 6 Sections
created_at: 2026-07-12T17:51:55Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 1c8d2beee5eb8b0d39f71b67cf64322c779980306d6a7660b1b40917a5aebc67
---

- 6-section gate: Scaffold (G1–G7), Capture (B1–B9b), Explicit (C1–C6/FQ1/RX1), Hardening (HG1–HG6), Recall (W1–W4/D3), Cold-open (E1–E3)
- v0.5.1 passes all sections
- Hardening patches can skip prior-release standing checks (DJ/PR/TV/BK/M from v0.3–v0.4) if scope doesn't touch those surfaces

**Why:** Systematic verification framework; v0.5.1 scope justified as hardening patch (narrow risk surface)

**How to apply:** Use full gate for major/standard releases. For hardening patches with documented scope narrowness, prior-release checks may be deferred if no cross-surface changes made.
