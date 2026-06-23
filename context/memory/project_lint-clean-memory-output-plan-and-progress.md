---
id: P-MY52BNZ4
type: project
title: lint-clean-memory-output-plan-and-progress
created_at: 2026-06-23T10:11:11Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 401bde0eea9817409d94364e66ab49e5cdcf0e8940dc705b010895f3a2d5dc37
related: [super-linter-real-run-1058-md-findings-context-included, md007-is-model-output-indent-not-provenance-format]
---

PLAN (in progress, task-lint-clean-memory-output branch): make the kit emit LINT-CLEAN markdown BY CONSTRUCTION (fix at source, not relax rules — the user's call). Two halves. HALF 1 (kit generators — mechanical writer fixes, verify each against real markdownlint strict): (a) DECISIONS.md buildDecisionEntry — DONE: ### → ## (MD001) + blank lines around heading (MD022); retraction annotator updated from indexOf('### ') to newline-anchored '\n## '; lint-clean test added; 12 tests pass. (b) evicted-bullets.md archiveEvictedBullets — DONE: blank line after '## Evicted' heading (MD022); 24 scratchpad tests pass. (c) INDEX.md reindex writer — TODO: bare URLs (MD034) + spaces-in-links (MD039). HALF 2 (model-written fact bodies — 12 files with MD007 2-space sublists + MD034 bare URLs): NO template fix possible — it's auto-extract/remember MODEL OUTPUT. THE USER'S IDEA: add markdown-style rules to the memory-write SKILL so the writing AI emits lint-clean md (4-space or 0-space lists, no bare URLs, blanks around headings) — instructs the model AND the main agent. Plus: a cmk lint-clean validator/cleanup for existing files. Goal: a kit-installed repo passes super-linter/strict-markdownlint on context/ with NO config exemption.

**Why:** The user rejected 'relax the cosmetic rules' in favor of 'just fix it — emit correct markdown, add rules to the skill so the AI writes md the right way.' Right call: fixing at source means no config to ship, no exemption to explain, and the memory is genuinely clean markdown like every other system. Captured durably because the user explicitly warned this kind of task gets deferred-and-lost (like Task 150) — it must not.

**How to apply:** Continue on task-lint-clean-memory-output: (1) fix INDEX-writer bare-URLs (auto-wrap in <>), (2) add a 'write lint-clean markdown' section to template/.claude/skills/memory-write/SKILL.md (4-space lists, <url> not bare, blanks around headings) — synced to plugin + dogfood, (3) optionally a validate step or cmk-side normalization so model-written bodies get cleaned on write, (4) verify the WHOLE context/ passes super-linter strict, (5) two-pass review + the CLAUDE.md doc correction (the real rules are MD022/MD007/MD034, not MD041/MD013). Each generator fix VERIFIED against real markdownlint, not theorized.
