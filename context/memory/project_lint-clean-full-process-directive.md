---
id: P-F5LRAPF3
type: project
title: lint-clean-full-process-directive
created_at: 2026-06-23T10:21:31Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: c922a449401a8816f37cbdc396e0e6b02da541b4415acba8d052cd21cdb05673
related: [lint-clean-memory-output-plan-and-progress, super-linter-real-run-1058-md-findings-context-included]
---

The lint-clean-memory-output work is a FULL markdown-format-contract change across 38 src modules (every write/read/add/update/remove site that touches memory markdown structure), NOT a few generator patches. The user's directive 2026-06-23: do it the kit's full-process way — "read the code file by file, module by module, write a plan, design the fix, write the tasks, write tests, write the code, test, check, review." NOT rushed, NOT deferred (the user explicitly fears this gets postponed like Task 150). LOCAL-ONLY this session (user's internet flaky — no web/Docker/research-agents).

**Why:** The user rejected both 'relax the rules' and a rushed multi-file patch; wants the kit's own disciplined process (plan→design→tasks→TDD→implement→test→review) on the full 38-file format-contract surface, done locally due to flaky internet.

**How to apply:** Branch task-lint-clean-memory-output. DONE+tested+lint-verified: DECISIONS.md buildDecisionEntry (###→## + blanks, retraction parser updated to newline-anchored '\n## '), evicted-bullets archiveEvictedBullets (blank after heading). Write-audit found MD022: reindex:111, scratchpad:218 (ensureSectionExists), auto-persona:423, import-anthropic:231; MD007 from 2-space provenance indent (deliberate — likely config not reformat); templates lead with HTML comment (MD041). NEXT: read/mutate-side audit (the 38 files that PARSE structure — a format change breaks them, e.g. the retraction parser already broke on ###→##), then design a single normalizeMarkdownStructure() helper + reader updates + existing-file migration + strict-markdownlint verification of whole context/. Continue file-by-file reading.
