---
id: P-CAKHLMRY
type: project
title: scratchpad-provenance-format-RESOLVED-keep-inline
created_at: 2026-06-23T07:56:06Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: e07c442702bec62d65aeec230bbe5f66df46da74adb1ea4f96c40845a7c00b25
related: [adr-0009-inline-provenance-was-deliberate-but-lint-cost-unweighed, memory-lint-portability-research-28-projects, user-ci-lints-memory-files-gap]
---

RESOLVED (deep research 2026-06-23, 2 independent agents + markdownlint source + 30+ sources incl. Astro/Hugo/Obsidian/Logseq/org-mode/XMP/DVC): the scratchpad inline-HTML-comment provenance is the RIGHT mechanism for the kit's constraint, NOT a wrong turn. PREMISE CORRECTION (our own CLAUDE.md was wrong): MD033 does NOT flag HTML comments (only tags) — confirmed from markdownlint's md033.mjs source + PyMarkdown. MD041 is line-1-only (the header comment, separate concern). The ONLY real lint hit is MD013 (line-length) on long provenance lines. So it's ONE cosmetic rule on a data file, not a format war. WHY inline-comment wins for OUR constraint (per-bullet metadata in a context-CAPPED, LLM-injected, git-committed, hand-editable file): it's the ONLY mechanism that is simultaneously per-item + lint/render-clean + FREE against the char cap (comments are stripped from LLM context = zero tokens). The alternatives are WORSE for us: frontmatter-map renders as ugly GitHub table + COSTS tokens + silently orphans on hand-edit (research actively warns against it); Obsidian/Logseq key::value is lint-clean but VISIBLE = costs tokens every injection + :: collides with path/URL values. No surveyed tool does per-bullet inline metadata in one committed md file because the CONSTRAINT is unusual, not because there's a standard answer we ignored.

**Why:** The user refused to defer the design question (rightly — deferral = it dies, like Task 150) and demanded real research over my framing: 'deep research on best practices, other projects, anything... the original thinking isn't wrong, just how we did it.' The research vindicated the original mechanism AND corrected a real error in our docs (MD033/MD041 don't fire) — so the decision is now evidence-grounded, not opinion.

**How to apply:** FIX (small, real): (1) correct CLAUDE.md + ADR-0009 — the comment does NOT trip MD033/MD041; only MD013 (line-length) is real. (2) Exempt the memory tier from MD013 (it's a machine-managed data store, not prose — line-length is the wrong rule) via a cmk-install-managed .markdownlint config fragment for context/, same idempotent pattern as .gitignore/.gitattributes. This makes a USER's markdownlint CI pass on the committed memory. (3) Keep the inline-comment format — research-confirmed correct. SUPERSEDES the relocation options in [[adr-0009-inline-provenance-was-deliberate-but-lint-cost-unweighed]] — relocation rejected on evidence (frontmatter-map is strictly worse).
