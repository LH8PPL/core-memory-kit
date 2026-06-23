---
id: P-6aN7PGVG
type: project
title: super-linter-real-run-1058-md-findings-context-included
created_at: 2026-06-23T08:20:07Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: d170a818a1df8fca5c36190931f1cf7555c5bcdd2eb1fcdabbe6d42f2c831ae1
related: [md007-is-model-output-indent-not-provenance-format, user-ci-lints-memory-files-gap, scratchpad-provenance-format-resolved-keep-inline]
---

SUPER-LINTER GROUND TRUTH (ran the real super-linter:slim-v7 Docker product against the whole repo, strict markdown all-rules-on, 2026-06-23): RESULTS — GitHub-Actions (actionlint), JSON, YAML, Bash ALL PASS CLEAN (our 8 workflows + configs are fine). Markdown: 1058 findings. Top rules: MD022 ×842 (blanks-around-headings — the kit's compact ### heading style, in BOTH docs AND committed memory like DECISIONS.md), MD034 ×58 (bare URLs), MD007 ×45 (model 2-space sublists), MD053 ×43 (unused link refs), MD012 ×27 (double blanks), MD025 ×16 (multiple H1). 824 of the errors ARE in context/ (DECISIONS.md heading style = MD022/MD001). KEY: the provenance HTML comments STILL trip nothing (no MD033/MD041 in counts) — but the broader memory+docs corpus trips HUNDREDS of cosmetic markdown rules because both model-output AND the kit's own curated docs use compact prose-markdown that default markdownlint dislikes. So the user's ORIGINAL worry was CORRECT: a user running super-linter/strict-markdownlint on a kit-installed repo gets hundreds of warnings on committed context/. The fix can't be just 'provenance' — it's the whole memory tier's markdown style vs default rules.

**Why:** The user demanded I run the REAL super-linter product instead of theorizing ('why are you theorizing... you can check docs and do live checks'). The run proved: code/workflows/yaml/json are clean (actionlint etc. find nothing), but markdown has 1058 findings incl. 824 in context/ — dominated by MD022 (842) from the compact heading style in both docs and committed memory. The provenance comments are innocent; the heading/list/URL STYLE is the real lint surface.

**How to apply:** Real fix options now evidence-grounded: (a) ship a committed context/.markdownlint.json (per-dir config, verified) relaxing the cosmetic rules the memory tier trips (MD022/MD007/MD012/MD034/MD025/MD053) so a user's markdownlint passes on context/; (b) ALSO add a repo-root .markdownlint.json shipped by install if the user wants the kit's docs clean too; (c) optionally normalize auto-extract/curation output (blank-around-headings, 4-space lists, auto-link URLs) to reduce hits at the source. The kit's OWN repo should ALSO fix these (our .markdownlint.json already disables 14 rules for editor noise — but super-linter with strict config shows the raw count). Correct CLAUDE.md's 'trips MD041/MD013' to the real MD022/MD007/MD034 set.
