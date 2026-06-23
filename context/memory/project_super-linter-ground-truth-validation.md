---
id: P-U2AD3CX4
type: project
title: Super-Linter Ground-Truth Validation
created_at: 2026-06-23T08:18:09Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 16cac4aa63434149af885e3ef8b59f6e31e8e013d6c83ef809cace15b1f41446
---

- **Tool**: Super-Linter Docker image with strict markdown config (all rules, none suppressed)
- **Results**: Analyzed by category: memory files (context/), docs/specs, code/workflows/shell

**Why:** Actual linter output is definitive; theorizing without empirical data is incomplete

**How to apply:** Run Super-Linter with strict config first as ground truth, then analyze findings by category
