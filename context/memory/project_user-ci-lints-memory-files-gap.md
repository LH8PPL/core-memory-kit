---
id: P-Da3BNKFC
type: project
title: user-ci-lints-memory-files-gap
created_at: 2026-06-23T06:18:18Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: c4063377c85b8b223f64350cec51140b747c398fb1feff23a9ddc380f4a9a767
related: [skill-md-yaml-colon-space-bug]
---

DESIGN GAP (undecided): the kit commits context/ memory files into the user's repo, but those files trip common linters (markdownlint, prettier, yamllint, Super-Linter) — MEMORY.md starts with an HTML comment not an H1 (MD041), every provenance line is inline HTML (MD033) + long (MD013), session logs have dup headings (MD024). The kit injects a .gitignore + .gitattributes fragment on install but NO linter-ignore. So memory is git-portable but not lint-portable: a user whose CI lints everything (no path distinction) gets their pipeline failing on the kit's own files.

**Why:** Surfaced by the user 2026-06-23: "if our memory files can not be inspected by a linter, then whoever uses this kit is going to have the same problem... at my work CI/CD my linter doesn't do a distinction, and it will flag our files." A real adoption blocker — not hypothetical (the user's own workplace CI). Never raised/decided before (checked DECISION-LOG + research).

**How to apply:** Likely fix: ship managed linter-ignore fragments (.markdownlintignore / .prettierignore / etc. excluding context/) via the same idempotent-managed-block pattern the kit already uses for .gitignore/.gitattributes, PLUS document the manual exclusion for linters the kit can't auto-cover. Do NOT bend the memory format to be lint-clean (HTML-comment provenance is deliberate). Proper task (install wiring + uninstall + tests + docs), not a quick patch — scope for v0.4.x/v0.5.
