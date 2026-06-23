---
id: P-9TRG76ST
type: project
title: scratchpad-inline-html-provenance-is-the-lint-outlier
created_at: 2026-06-23T06:23:46Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 829669678293cb7a0caad8d09bceef7eb0627c04bccd1dccae6f551968c79660
related: [user-ci-lints-memory-files-gap]
---

PRIMARY-SOURCE FINDING (actual-file check of 6 surveyed memory systems): the kit is NOT unique in committing memory — that's field-standard. The kit's GRANULAR FACT FILES (context/memory/*.md) are already lint-clean (YAML frontmatter + clean markdown body, 0 inline comments) — IDENTICAL structure to claude-remember/basicmem/mem0/etc. The lint-tripping surface is ONLY the SCRATCHPADS (MEMORY.md=11, SOUL.md=8, USER.md, INDEX.md): the kit puts per-bullet provenance as INLINE HTML COMMENTS (`<!-- source:... sha1:... trust:... -->` after each bullet) — a format NO other surveyed system uses (they use frontmatter or no per-bullet provenance in the hot file). So the linter problem is narrow + self-inflicted by the scratchpad format, not inherent to committing memory.

**Why:** The user pushed: "it cant be that we are so stupidly unique... dont just check their lint config, check their memory output." The actual-file check (6 cloned systems in /c/tmp) proved them right and narrowed the problem: our fact files match the field; only our scratchpad inline-comment provenance diverges + trips linters (MD033 inline-HTML, MD041 first-line-not-H1, MD013 long lines).

**How to apply:** The fix is narrower than 'make memory lint-clean' — it's the SCRATCHPAD provenance format only (scratchpad.mjs read/write). Options: (a) relocate per-bullet provenance to frontmatter/sidecar like everyone else (standard + lint-clean, but real surgery on the lifecycle-tracking core), or (b) ship a context/ linter-ignore fragment (cheap, keeps format, but offloads to user). The per-bullet inline comment IS the bullet-lifecycle data (id/source/sha1/trust/at), so relocating it is non-trivial.
