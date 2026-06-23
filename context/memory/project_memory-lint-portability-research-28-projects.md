---
id: P-H332ZKHJ
type: project
title: memory-lint-portability-research-28-projects
created_at: 2026-06-23T06:49:23Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 9c453e104fd120542aa3a42a8e70f08c5d8944f671e245cb7f57e29d110e9374
related: [scratchpad-inline-html-provenance-is-the-lint-outlier, user-ci-lints-memory-files-gap]
---

RESEARCH COMPLETE (28 projects + web/ecosystem + linter primary docs, 2026-06-23). CORRECTIONS to the earlier framing: (1) MD033 "no-inline-HTML" does NOT flag HTML comments — only HTML TAGS (<div>). `<!-- -->` PASSES MD033 (markdownlint RULES.md, both Ruby+JS impls). The kit's REAL lint exposure is only MD041 (leading header-comment = first line not a heading) + MD013 (long provenance lines) — two cosmetic rules. (2) The "zero others use inline-HTML provenance in memory body" claim now holds across 28 projects, not 6 — confirmed outlier. (3) Almost NO memory/agent system ships a lint-ignore for its committed files (only coder-registry .prettierignores CLAUDE.md); the ecosystem mostly just doesn't lint these files in CI. Memory engines (mem0/langmem/Letta) store in DB not markdown so never hit it; file-based ones (claude-remember/basicmem/Cline/Roo/Continue) use frontmatter+clean-body = lint-passing by format. CANONICAL FIX (ecosystem standard for tool-managed markdown): a self-exempting in-file `<!-- markdownlint-disable-file MD013 MD041 -->` directive — travels in the file the kit owns, works on any markdownlint CLI (NOTE: the old .markdownlintignore is silently ignored by current markdownlint-cli2 — a trap). Pair with a .prettierignore entry for Prettier. No competitor closes this gap = differentiator, not just a fix.

**Why:** The user (correctly) pushed back that the earlier conclusion rested on only 6 repos with no web research: "did you check more than 20? deep research on the web? actual code, configs, memory files, outputs?" The full research corrected a real error (MD033 false premise) and grounded the fix in ecosystem-canonical practice + a 28-project primary-source survey.

**How to apply:** Recommended fix (NOT provenance relocation — that's 4-7 days AND wouldn't fix the header-comment MD041 anyway): scaffold a self-exempting `<!-- markdownlint-disable-file MD013 MD041 -->` into the committed memory scratchpads + a cmk-managed .prettierignore block for context/, via the same idempotent-managed-fragment pattern as .gitignore/.gitattributes. ~0.5-1 day, zero blast radius, zero desync risk, and ahead of the field (no competitor does it). Supersedes the relocation option in [[scratchpad-inline-html-provenance-is-the-lint-outlier]].
