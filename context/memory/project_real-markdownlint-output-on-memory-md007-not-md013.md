---
id: P-GAPEQDQ3
type: project
title: real-markdownlint-output-on-memory-MD007-not-MD013
created_at: 2026-06-23T07:59:37Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 77002634f0a0795419ea63a09eefc4b5aca05b3c2bc58a92052907ffb4c4ecd9
related: [scratchpad-provenance-format-resolved-keep-inline, user-ci-lints-memory-files-gap]
---

GROUND TRUTH (ran real markdownlint-cli2 on this repo's committed memory 2026-06-23): the inline-comment provenance does NOT trip MD013/MD033/MD041 — those fire ZERO times (the whole thread theorized about them; all wrong). The ACTUAL error profile across context/MEMORY.md+SOUL.md+memory/*.md: MD007 ×45 (unordered-list-indent — the 2-space-indented `<!-- ... -->` provenance line reads to markdownlint as a mis-indented list item), MD034 ×6 (bare URLs in fact bodies), MD039 ×3 + MD037 ×3 (spaces in link/emphasis), MD012 ×2 (double blank lines). So the provenance FORMAT's only real lint impact is MD007 (the comment-line INDENTATION, not the HTML comment itself). The empty scaffold template passes 0 errors; errors only appear once real bullets accumulate. Lesson: check actual linter OUTPUT, not theorize about which rules apply — the user demanded exactly this and it overturned 4 turns of wrong assumptions.

**Why:** The user insisted on checking actual outputs over theory ('check their memory output... actual code'). Running real markdownlint proved the provenance comment trips MD007 (indentation), NOT the MD013/MD033/MD041 the entire thread (and CLAUDE.md, and the research agents) assumed. Ground truth beats convergent theory.

**How to apply:** The fix is now precise: a cmk-install-managed context/.markdownlint.json (markdownlint auto-applies per-directory configs, verified) disabling the rules that fire on the memory FORMAT — primarily MD007 (provenance-indent), plus MD012/MD034 if desired — NOT MD013/MD033/MD041 (they don't fire). This is a COMMITTED file (not gitignored — the gitignore fragment only excludes .index/.locks/extract-logs), so it travels to the user and their CI's markdownlint picks it up. Correct CLAUDE.md's wrong 'trips MD041/MD013' claim to 'trips MD007 (indent)'.
