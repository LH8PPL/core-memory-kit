---
id: P-7XKFaB2N
type: project
title: Secret Leakage Defense-in-Depth Model
created_at: 2026-06-11T13:00:14Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: a75a5496b4d0a4b4daa1148f5498ba58a7cb6ee4
---

poison-guard.mjs is one layer in multi-layer defense:
- In-band filters: `<private>` tags, home-path sanitizer (→ `~`), gitignored raw logs
- Human review before commit (no auto-git)
- External: gitleaks / push-protection enforcement

Known gap: bare, unlabeled keys without recognizable prefix slip through. Documented trade-off; catching them requires generic regex that also matches git hashes.

**Why:** No single filter is complete. Layering reduces likelihood accidental secrets reach git.

**How to apply:** Before committing memory, treat poison-guard as one signal among several. Human review catches edge cases the pattern system misses.
