---
id: P-aSFM9AR2
type: project
title: skill-md-yaml-colon-space-bug
created_at: 2026-06-22T20:42:20Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: aa686ed7d65a30d7db52c1ac5fe9364247deba41dd1fc97c7e2bfffa3305df17
related: [kiro-trusted-commands-auto-approve]
---

The memory-write SKILL.md frontmatter `description` is INVALID YAML — it contains `"update memory: X is now Y"`, and the unquoted colon-space (`: `) makes a strict YAML parser read a new mapping key, breaking the parse. Claude Code tolerated it (lenient frontmatter read) so it shipped latent; Kiro validates SKILL.md frontmatter strictly and REJECTS the file ("Invalid SKILL.md frontmatter"). memory-search is fine (no colon-space in its description).

**Why:** Found live in the v0.4.0 cut-gate-kiro (50.M) — 7th cross-agent cut-blocker, the Claude-tolerated/Kiro-strict class. KG4 only checked that Claude-only frontmatter keys were ABSENT, never that the YAML actually parses, so the gate missed it too.

**How to apply:** Fix: rephrase the colon-space out of the description in all 3 copies (template/.claude/skills, dogfood .claude/skills, plugin/skills) + add a structural validate-skill-frontmatter.mjs that strict-parses every SKILL.md YAML on npm test. A description with embedded ': ' must be a quoted YAML scalar or rephrased.
