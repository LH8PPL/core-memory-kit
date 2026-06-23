---
id: P-AQEa5CEM
type: project
title: md007-is-model-output-indent-not-provenance-format
created_at: 2026-06-23T08:08:16Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 205cc57188addec966fd7a3cd5aac643571e096ec70c3f2cd0d9af0b92dfa75a
related: [real-markdownlint-output-on-memory-MD007-not-MD013, scratchpad-provenance-format-resolved-keep-inline]
---

FINAL GROUND TRUTH (read every offending line 2026-06-23): the kit's inline-HTML-comment provenance trips ZERO markdownlint rules. The 45 MD007 hits come from AUTO-EXTRACT MODEL OUTPUT — the LLM writes sub-bullets indented 2 spaces inside fact-file bodies (e.g. `  - Decision captured → ...`), and default MD007 ul-indent wants 0 or 4, not 2. The other hits (MD034 bare-URLs ×6, MD037/MD039 emphasis/link spacing ×3+3, MD012 double-blank ×2) are ALSO model-written prose, not the kit's format. So 'our memory files break linters' was NEVER a format problem — it's 'a model writing markdown occasionally uses 2-space sublists + bare URLs', which would hit ANY memory system whose model writes md. The provenance comments are innocent. Two honest fixes: (a) scoped context/.markdownlint.json relaxing prose-rules for model-generated data files (MD007/MD013/MD034) — a TRUE statement about the files, not 'ignore'; (b) BETTER: fix auto-extract to emit 0/4-space sublist indent so output is lint-clean BY CONSTRUCTION (attacks source not symptom — aligns with 'work with the format'). The user's skepticism ('so you just ignore everything?') correctly caught that a blanket-ignore would hide the wrong thing.

**Why:** The user pushed back on 'just ignore all memory files = the fix'. Reading the actual MD007 lines proved the provenance format is innocent — the errors are auto-extract model output (2-space sublists, bare URLs). This reframes the fix from 'exempt our format' to 'either relax prose-rules for data files OR make the model output lint-clean'.

**How to apply:** Prefer fix (b): make auto-extract / the fact-writer normalize sublist indentation to 0 or 4 spaces + auto-link bare URLs, so committed memory is lint-clean by construction. Fix (a) as the floor/complement: a committed context/.markdownlint.json relaxing MD007/MD013/MD034 for the data tier (markdownlint per-dir config, verified). Correct CLAUDE.md's wrong 'trips MD041/MD013' → 'model-written bodies trip MD007/MD034; the provenance comments trip nothing'.
