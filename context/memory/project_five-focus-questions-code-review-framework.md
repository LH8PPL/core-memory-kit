---
id: P-2QSPCZCX
type: project
title: Five Focus Questions Code Review Framework
created_at: 2026-06-17T06:58:44Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: c017d77ec6f831fa9ead9c4a1beca0c317b1fff031cf131d7758f8a9eca6f0a1
---

Features receive security/design review around five specific questions:
1. **D-163 leak surface** — Does any auto-call surface (inject-context, search, index-rebuild) read the new data or expose tombstones?
2. **Path traversal** — Are IDs anchored with strict patterns? Is validation done before path operations?
3. **Invariant leak surfaces** — Are there other ways the invariant could be breached?
4. **Extra-field shape** — Do new fields cause shape mismatches for consumers (e.g., JSON.stringify vs strict schemas)?
5. **Default guards** — Are unsafe-by-default values protected by strict guards (e.g., `=== true`, not just truthiness)?

**Why:** These five areas are the highest-risk surface for new features — privacy leaks, path traversal, invariant violations, shape mutations, default-enabled footguns.

**How to apply:** Apply this framework to feature reviews; structure findings around the five questions rather than line-by-line walkthrough.
