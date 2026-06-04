# gstack — Garry Tan's skill layer over GBrain (the other half of a store we already studied)

**Source:** <https://github.com/garrytan/gstack> (MIT). Read 2026-05-30 (primary-source: README + 4 of 23 SKILL.md files — `context-save`, `context-restore`, `learn`, `review`). Prompted by the user: *"would any of these skills help you?"*

**What it is.** An opinionated "software factory" — 23+ skills turning Claude Code into a virtual eng team (CEO/eng-manager/designer/QA/release-manager roles). Each skill is a top-level dir with a `SKILL.md` + backing `bin/` binaries; state under `~/.gstack/projects/{slug}/`.

**The connection that makes it relevant to the kit.** gstack ships `sync-gbrain` / `setup-gbrain` — it is the **skill/workflow layer over [GBrain](2026-05-24-gbrain-architecture.md)**, the same Garry Tan knowledge-graph store the kit already studied for design §16.19 (zero-LLM typed-edge KG) + §16.17 (benchmark harness). So gstack is the missing other half: GBrain = the memory/KG store, gstack = the skills that read/write it. The kit had studied the store, not the skill layer.

## Per-skill findings (the 4 read)

### `/learn` — independent precedent for the kit's supersede/contradiction model + Task 55's confidence scale
- Stores learnings as JSONL: `{skill, type, key, insight, confidence(1–10), ts, source, files}` at `~/.gstack/projects/{slug}/learnings.jsonl`.
- `type` taxonomy: **pattern / pitfall / preference / architecture / tool / operational**.
- **Append-only, latest-wins-per-`key`** = the kit's tombstone/supersede semantics by another name.
- **Prune mode detects contradictions** (same `key`, conflicting `insight`) and asks the user to remove/keep/update = the kit's conflict-queue + Task 45's auto-supersede-on-contradiction + Phase-3 contradiction reconciliation.
- **confidence 1–10 numeric** = concrete second-source precedent for design §16.52 / Task 55's "numeric refinement of the categorical trust level (the one idea worth borrowing from ECC)." Now two independent implementations point at a numeric confidence field.
- **Capture is skill-instrumented, NOT conversation-auto-extracted**: `/review`, `/ship`, `/investigate` call `gstack-learnings-log` to record findings; `/learn` only aggregates/searches/prunes. The kit's auto-extract (conversation → facts, no skill instrumentation) is the more-automatic model.
- Storage is **user-home per-slug, NOT in-repo/committed** — the kit's T2 difference (memory travels with `git clone`).

### `context-save` / `context-restore` — a manual, non-committed analog of the kit's thesis
- `/context-save` writes timestamped markdown checkpoints (`YYYYMMDD-HHMMSS-*.md`, YAML frontmatter: branch/status/modified-files/goal/decisions/remaining/gotchas) to `~/.gstack/projects/{slug}/checkpoints/`, append-only.
- `/context-restore` loads the newest (or title-matched) checkpoint, **searches across branches** (Conductor workspace handoff), presents a summary, prompts continue/view/exit.
- = a **manual** (`/`-triggered), **user-home, non-committed** version of the kit's session-handoff (RESUME-HERE) + the new `DECISION-LOG.md`. Validates the design space; the predecessor shape the kit improves on (auto + committed). SOURCES analog alongside claude-mem / claude-remember / GBrain.

### `/review` — two borrowable techniques (the skill itself is harness-coupled)
- **Pre-emit verification gate:** every finding MUST quote the specific motivating code line; if none can be cited, confidence is forced to 4–5 and suppressed. (Anti-false-positive — operationalizes the kit's "cite the anchor / did you check?" rule for review.)
- **Plan-completion audit:** classify each plan/`tasks.md` item DONE / PARTIAL / NOT-DONE / CHANGED / UNVERIFIABLE against the diff. (Pre-PR self-review checklist.)
- Also: confidence 1–10 with display tiers (suppress 3–4 to appendix); specialist-subagent dispatch on >50-line diffs; always-on adversarial/red-team + cross-model (Codex) gating on `[P1]`. Sophisticated, but bound to gstack's Codex/Greptile/specialist binaries — not standalone-installable here, and the kit already mandates `code-review-excellence`.

## Verdict (adoption-verification template)

```
Adopted: gstack (the system) — NO.
What it provided (concrete): /learn's {key + latest-wins + contradiction-prune + confidence 1–10}
  as an independent second-source precedent for the kit's supersede/conflict model and Task 55 /
  §16.52's numeric-confidence idea; /review's pre-emit-verification-gate + plan-completion-audit
  as two borrowable review techniques; gstack↔GBrain completes a store/skill picture the kit
  half-studied.
What I would have done without it: kept Task 55's confidence field as a single-source (ECC) idea;
  run my review passes without the cite-the-line suppression gate.
Verdict: helpful (as research + 2 techniques) / NOT adopted (as code or wholesale skills).
Reasoning: coupled to gstack binaries + ~/.gstack (user-home, non-committed = kit T2 difference) +
  skill-instrumented capture (less automatic than the kit's auto-extract); wholesale adoption is the
  same tool-bloat rejected for Task 53's ECC repo. Value is design-validation + 2 concrete techniques.
```

**Actions taken:** SOURCES.md entry (analog list); fold the confidence-1–10 + contradiction-prune second-source precedent into design §16.52 / Task 55 when that task opens; apply `/review`'s two techniques to the Task 45 review pass. Decision-log: D-16.
