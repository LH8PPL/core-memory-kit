---
id: P-PBFLRGMS
type: feedback
title: follow-the-doc-procedure-route-dont-narrate
created_at: 2026-06-18T07:01:30Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 0e73dddc1bbe85a0941bd0772055a3437a11abfd1507103fc4ccecbc582d30ad
related: [guides-are-runbooks-not-journals]
---

Before writing anything durable down, consult the source-of-truth table (CLAUDE.md) and route the content to its ONE authoritative home — don't invent a new doc, inflate prose, or write the same thing into multiple files. A decision/pivot → DECISION-LOG only (research note + design POINT to it, never re-narrate). A runbook stays a runbook. The procedure already says where things go.

**Why:** The user, twice in one session: the cut-gate guide became a journal, then a Task-159 pivot got triplicated across DECISION-LOG + research note + design. Same root failure both times: when I have something to capture I write PROSE instead of routing it to its one home tersely — violating "single source of truth, always-on." The procedure (source-of-truth table) exists precisely so I don't re-decide placement each time, and I keep not consulting it. The user: "we have a known doc procedure, why are you inventing new docs? again."

**How to apply:** When about to capture anything durable: (1) classify it (decision/pivot? rule? task state? research finding? runbook step?); (2) look up its ONE home in the CLAUDE.md source-of-truth table; (3) write it THERE, tersely; (4) from any other doc that needs to reference it, write a one-line POINTER, never a second copy. If you catch yourself writing the same explanation into a second file, stop — that's the duplication smell. Pairs with [[guides-are-runbooks-not-journals]].
