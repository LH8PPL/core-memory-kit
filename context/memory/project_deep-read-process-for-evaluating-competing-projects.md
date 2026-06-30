---
id: P-JKPFY539
type: project
title: Deep-Read Process for Evaluating Competing Projects
created_at: 2026-06-28T18:33:46Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 8d56c76bc1e16c2df075bc683df96d0be031c221afda38f2b276c1338fe58f2c
---

When comparing competing memory systems or similar projects, use this 4-step process:
1. **README** — note the claimed pitch as hypothesis, not fact
2. **Secondary docs** — `ARCHITECTURE.md`, ADRs, design notes, wikis; this is where real design lives
3. **The code** — trace actual mechanisms: extraction/scoring logic, recall strategy, storage schema, hook wiring, how they solve hard problems (dedup, decay, contradiction, privacy)
4. **Gap analysis** — compare what they claim vs what code actually does; call winners honestly both directions

For large projects, spawn an Explore agent to sweep the codebase and report real architecture back.

**Why:** README is marketing material. Biggest advantages are often buried in secondary docs or undocumented in code. A rigorous read surfaces true design vs pitch. Prior: the "awrshift" comparison suffered from surface-level claims.

**How to apply:** Apply this process to every competing-project evaluation. Actually fetch/clone and read load-bearing files. Report back with *their actual architecture* vs ours — not their tagline vs ours.
