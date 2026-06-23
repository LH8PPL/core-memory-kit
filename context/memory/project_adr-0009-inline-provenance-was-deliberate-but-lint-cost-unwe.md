---
id: P-VMVAYVHJ
type: project
title: adr-0009-inline-provenance-was-deliberate-but-lint-cost-unweighed
created_at: 2026-06-23T07:39:44Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: a63d20b490a65d9623707f67889e82bb97c65f3c4eef2cbfdc0517b1fe5ec7da
related: [memory-lint-portability-research-28-projects, scratchpad-inline-html-provenance-is-the-lint-outlier]
---

DECISION ARCHAEOLOGY on the inline-HTML-comment scratchpad provenance (ADR-0009, accepted 2026-05-22): it was DELIBERATE, not accidental. The YAML-frontmatter-for-scratchpads alternative was EXPLICITLY considered + rejected (ADR-0009 line 109) for a real reason: per-bullet YAML frontmatter is ~2x the byte overhead of the one-line HTML comment, and the scratchpad has a 2500-char cap (it's context-injected every session) — so frontmatter → fewer real bullets fit → more aggressive consolidation. The HTML comment was chosen BECAUSE it's stripped from the LLM context (carries provenance at ZERO context-token cost). The frontmatter systems (claude-remember/basicmem) put frontmatter on PER-FACT files (1 fact/file — fits perfectly); their HOT/scratchpad memory either has no per-bullet provenance or isn't context-capped like ours. So we're solving a problem they don't have. BUT: ADR-0009's trade-off list weighed token-overhead vs audit-trail and NEVER considered lint-portability (user's CI breaking on the committed files) — a NEW cost discovered 2026-06-23, not on the original scale. AND the rebuildable SQLite DB now holds all provenance, weakening the durability argument. So it's a legitimate candidate to RE-EXAMINE per the kit's 'reopen-settled-only-with-new-evidence' bar — the new evidence is the lint-portability cost.

**Why:** The user challenged the 'we're ahead of the field' framing as rationalization: 'this could also mean we took the wrong turn... they didn't do a convoluted way, they did it how md/yaml/json work.' Reading ADR-0009 showed the truth is BOTH: deliberate trade-off (token budget) AND a cost (lint-portability) the original decision never weighed. Honest reconciliation, not defense.

**How to apply:** If revisiting: the ADR-0009 rejection of frontmatter rests on the 2500-char cap + zero-context-token property of HTML comments. Any alternative must preserve those (or accept fewer bullets/cap changes). The DB-holds-it-all finding + lint-portability are the new evidence that clears the reopen bar. Options remain: (a) self-exempting disable-directive (cheap, keeps format, the canonical ecosystem fix), (b) frontmatter migration (fights the cap rationale), (c) per-fact-file the scratchpad bullets too. NOT yet decided.
