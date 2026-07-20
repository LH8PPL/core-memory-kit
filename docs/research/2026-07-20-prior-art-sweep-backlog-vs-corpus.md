# Prior-art sweep: the open backlog vs the research corpus

**Date:** 2026-07-20 · **Trigger:** the user, after Task 174 shipped: *"14 projects are not even close to all the projects we researched"* → *"maybe you should check all the projects we researched if they help any of the tasks we will have?"* · **Method:** indexed all 95 `docs/research/` notes + 6 `docs/sources/` + 24 ADRs, then matched against the 34 genuinely-open top-level tasks.

## Why this exists

Prior-art checking had been happening **one task at a time, at build time** — which is how it gets skipped. Task 174 shipped after three separate misses in one session:

1. I built from the task spec + the one borrow it named, checking nothing else.
2. Asked whether I'd used the research, I swept 14 **locally cloned** repos and reported "no prior art" — that was **14% of the corpus** (101 distinct repos are referenced across the notes).
3. Asked again, the full note sweep found `docs/sources/gul-jabeen-claude-memory-guide-2026.md` § **"Git Hooks: Memory from Commit History"** — `echo "$(date) | $(git log -1 --oneline)" >> .claude-memory.md`. Cruder than what we built (no summarization, no gap detection, no honesty marking), but it **is** the concept, and it was in our own `docs/sources/`.

**The corpus is the notes, not the clones.** The notes are the distillation of ~101 projects; the clones are whatever happens to be on disk from recent sessions. Searching clones and calling it "the research" is the one-surface-proxy error applied to our own evidence base.

## The five findings most likely to change what we build

| Task | Source | The finding |
| --- | --- | --- |
| **184** cross-project search | [`2026-05-22-primary-source-examination.md`](2026-05-22-primary-source-examination.md) §4/5 | basic-memory ships `project_management` + `workspaces` MCP tools; the note says verbatim *"they've already solved the multi-project navigation problem."* **Written 2026-05-22; Task 184 drafted 2026-07-01 without picking it up.** |
| **67** cross-project promotion | [`2026-06-14-persona-promotion-models-cross-system.md`](2026-06-14-persona-promotion-models-cross-system.md) | 9-system survey: **not one** gates promotion behind a manual signal; all use automatic frequency × recency. Task 67's current lean — an explicit `--cross-project` flag — may be the field's **rejected minority** approach. |
| **146** concurrent MCP writes | [`2026-07-13-sqlite-reader-freshness.md`](2026-07-13-sqlite-reader-freshness.md) | Already built the WAL/isolation methodology + 3 empirical repros against the kit's own index db — precisely 146's open sub-question (b). Also: this probe is what tells whether **Task 238**'s parallel-agent trigger has fired; the two tasks were never cross-linked. |
| **177** correction-trained behavior | local clone | `pro-workflow/src/optimizer/` is **already cloned** and unread; two 2026-07-19 notes already read that repo's search layer. The task's "clone + read" first step is half done. |
| **223** L3 name-in-prose privacy | [`2026-07-07-auto-judged-privacy-prior-art.md`](2026-07-07-auto-judged-privacy-prior-art.md) | *Regex is structurally incapable of context-dependent PII; no maintained JS library does local NER.* **Predicted this task's live cut-gate failure 12 days before it was observed**, and argues against adding a deterministic L1 pass for this class. |

Also uncited-but-relevant: **127** ↔ [`2026-06-15-okf-open-knowledge-format-interop.md`](2026-06-15-okf-open-knowledge-format-interop.md) (OKF export as the team-interop path, ~90% format overlap already); **95** ↔ [`2026-06-12-pai-miessler-paradigm-ally.md`](2026-06-12-pai-miessler-paradigm-ally.md) (its two Task-55 inputs, absorbed into 95 at D-353 — confirm they're folded into design §21); **199** ↔ [`2026-07-02-contradiction-detection-bakeoff-real-corpus.md`](2026-07-02-contradiction-detection-bakeoff-real-corpus.md) (measured on our own 1,246-fact corpus: whole-text lexical pairing is a dead end, subject-keying works — informs which primitive 199's deterministic detector is built on).

## Designing blind (no research match)

**47 / 48** (doctor repair UX) · **73** (stale-placeholder re-render) · **140** (canonicalize ReDoS) · **141b** (node:sqlite migration) · **208** (Cursor gate — a QA run, not a design question) · **217** (shell-obfuscation bypass classes) · **240 / 241** (CI + dedupe hygiene).

Most are legitimately internal — but three point at real corpus gaps.

## Corpus gaps worth filling

1. **Self-healing CLI repair UX** — needed by **47/48/73**; no note studies how `npm audit fix` / `brew doctor` / `rustup` structure detect→confirm→repair. Three open tasks need the pattern; zero notes cover it.
2. **Command-obfuscation detection** — needed by **217**; nothing on how other agentic guardrails catch same-effect-different-syntax destructive ops (encoded PowerShell, `python -c` deletes) beyond literal regex. A real, unresourced security problem.
3. **npm native-dependency migration precedent** — needed by **141b**; no case studies of packages moving off `prebuild-install` toward `node:sqlite`-style zero-native-dep patterns.

## The process change

Prior-art checking moves from **build-time, per-task** to **sweep-time, whole-backlog**: run this sweep at each minor's backlog sweep (alongside the D-267 fired-trigger walk), and record matches **as annotations on the task entries themselves** — so the finding reaches the implementer at the moment they open the task, rather than depending on someone remembering to grep. The five above are annotated in `specs/tasks.md` now.
