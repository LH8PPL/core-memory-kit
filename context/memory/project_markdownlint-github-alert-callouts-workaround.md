---
id: P-aWPUD54M
type: project
shape: Timeless
title: Markdownlint + GitHub Alert Callouts Workaround
created_at: 2026-07-15T18:03:00Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 67c3819d6a165ffa7f69ad1c56d7a46a82463931f6027936719c218c26472cba
---

- GitHub alert callouts (`[!IMPORTANT]`, etc.) with blank lines between paragraphs trigger linting errors
- Workaround: Use `<br>` HTML tags instead of blank lines to maintain paragraph separation while staying lint-clean
- Applies to multi-paragraph content within a single callout block

**Why:** markdownlint has specific style rules for blockquotes in alert contexts; bare blank lines are flagged as violations

**How to apply:** In alert callouts with multiple paragraphs, use `<br>` for line breaks; verify no new lint errors after edits
