---
id: P-4aK276X4
type: user
title: user-runs-full-stack-semantic-always
created_at: 2026-06-18T18:35:58Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 211e07b5ca670c5c82a7501aea0469392f9c202b0299bd2fc05a3c5f2e5327cc
related: [adopt-third-party-skills-via-installer-personal-tier]
---

The user always installs with `cmk install --with-semantic` (hybrid search default ON), and intends to run the full stack (semantic + crons + everything the kit offers) in normal daily use. So the kit's "full-featured" config IS this user's default path — not an edge case. Bugs/limitations that only appear under semantic-on or crons-on are HIGH priority, not corner cases.

**Why:** The user, 2026-06-18: "i will always run it with cmk install --with-semantic, and i will even run with everything else we got next time i close vs code, so ill get everything the kit can give me." This recontextualizes two findings: the `--scope decisions` unknown-scope warning (only fired under the hybrid default → was the user's DEFAULT experience on the headline feature, not an edge) and Task 161 (the compression-timeout spiral — the user's full-stack + real-session usage is exactly what triggers the unbounded now.md growth + daily-distill/weekly-curate timeouts).

**How to apply:** When triaging a bug or limitation that only manifests under semantic-search-on, crons-registered, or other full-feature config: treat it as on the user's primary path, NOT a rare edge — prioritize accordingly. When weighing whether a finding blocks a release vs defers, remember this user runs everything enabled. Relates to Task 161 (compression timeout under full-stack/real-session use).
