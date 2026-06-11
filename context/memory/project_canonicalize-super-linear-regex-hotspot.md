---
id: P-Za6L72JM
type: project
title: canonicalize() Super-Linear Regex Hotspot
created_at: 2026-06-11T21:33:37Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 88b268210205a7cc5d38834ca1208ea60016f669
---

**Issue:** `[\s.,:;]+$` pattern in canonicalize() — StackOverflow 2016 super-linear class (character-class run anchored to end-of-string). On pathological input like `". . . . . . . X"` repeated, regex engine backtracks O(n²) times when `$` fails.

**Risk:** Negligible. Runs locally on bounded input (memory bullets, few KB) in a CLI tool — no server-level DoS exposure.

**Fix (v0.3.x):** Replace with behavior-identical trailing-strip loop (~5 lines) to preserve downstream fact IDs.

**Why:** Confirmed real pattern, but execution is too constrained for practical risk. Behavior-identical fix ensures downstream stability.

**How to apply:** During v0.3.x sprint, refactor canonicalize() to loop-based approach; verify existing fact IDs remain stable.
