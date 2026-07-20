---
id: P-B3BLXE9V
type: project
shape: State
title: slugify is NOT safe to de-duplicate despite 3 same-named copies (graduation.mjs,
created_at: 2026-07-20T09:16:34Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 7448d9ddfa8200b4bb9046d40a8a62758486063539f79cd350120562b9c00e15
---

slugify is NOT safe to de-duplicate despite 3 same-named copies (graduation.mjs, judgment.mjs, rich-fact.mjs::slugifyFact). They have DIFFERENT behavior: graduation caps at 40 chars with a deliberately ReDoS-safe string-op shape, judgment caps at 60 via a regex trim, rich-fact caps at 60 with a 'fact' fallback. Merging them silently changes generated FILENAMES across three subsystems. Also rejected from the same audit: the MISSING_PROJECT_ROOT/MISSING_BACKEND guard preamble (11+8 sites - entry-point contract that reads better inline, each computing duration_ms from its own t0), and validateOptions/readSettings/findSectionRange (3 sites each - same name, different per-module contracts, not verified identical).

**Why:** A clone scanner flags slugify as a TOP candidate (3 sites, identical name) so any future dedup pass will surface it again and it looks like free cleanup. It is a data bug wearing a refactor's clothes - changing a slug function changes the filenames facts are written to.

**How to apply:** When a dedup/refactor pass surfaces slugify, escapeRegExp-style helpers, or the guard preamble: READ the bodies before merging. Byte-identical (escapeRegExp, asIsoString, dateFromIso, list*FactFiles) is safe to hoist; same-name-different-cap is not. See Task 241 + D-368 for the full verified list of what IS safe.
