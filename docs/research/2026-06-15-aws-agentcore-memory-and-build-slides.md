---
date: 2026-06-15
topic: AWS Bedrock AgentCore Memory (primary docs) + four AWS-build-event slides — the canonical MANAGED-CLOUD version of the kit's thesis; one actionable signal (error→fix as a first-class memory category)
source: AWS docs https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html (+ how-it-works, memory-strategies subpages) + 4 photos from an AWS build event (the user attended): a memory-type taxonomy, "What Do We Store" (Facts/Errors/Research), "How Do We Organize" (Folders/VectorDB/GraphDB), and a "Planning (Writing the Spec)" methodology slide.
tags: [aws, agentcore, bedrock, managed-memory, strategies, auto-extract, error-fix-memory, episodic, procedural, positioning, Task-55, Task-66, competitive-analysis, validation]
---

# AWS AgentCore Memory + build-event slides — assessment

> **Two inputs, one theme.** The user attended an AWS build event and photographed four slides on AI memory + how-to-work-with-AI, then pointed at the AgentCore Memory docs. Together they're the **canonical commercial statement of the exact problem the kit solves** — and AWS independently converges on the kit's core design, which is strong validation, plus surfaces ONE thing we don't have.

## How AWS Bedrock AgentCore Memory works (primary source)

A **fully-managed AWS cloud service** that fixes agent statelessness:

- **Short-term memory** — turn-by-turn within a session; raw conversation `events` written via **`CreateEvent`**. (= our `now.md` working window.)
- **Long-term memory** — **automatically + asynchronously extracted by an LLM** from the raw events, governed by **"strategies."** *This IS the kit's auto-extract thesis* (capture is automatic; a model decides what's durable; the user never tags). Built-in strategies:
  - **Semantic memory** — key facts (= our `project`/`reference` facts)
  - **Summary** — session summaries (= our compression / session rollups)
  - **User preference** — prefs like "prefers window seats" (= our persona: USER/HABITS)
  - **Custom / self-managed** — your own extraction prompts + schemas + namespaces (= the kit's auto-extract classifier instructions)
- **Retrieval** — semantic search over **namespaces** (e.g. `/preferences/{actorId}`) via `RetrieveMemoryRecords`. (= `cmk search` over tiers + scopes.)
- **Identity/storage** — `actorId` / `sessionId` / `namespaces` / events / records. (= our tiers user/project/local + scopes.)
- **Built-in vs override vs self-managed** — managed-algorithm vs prompt-customization vs full-ownership pipeline (a cost/control ladder).

**The architectural contrast = the kit's positioning, crisply.** AgentCore is the **fully-managed cloud** realization of the kit's exact mental model (auto-extract → long-term records → semantic retrieval, with fact/summary/preference strategies). The kit is the **local, file-based, git-native, no-server, no-cloud-account** realization of the SAME model (D-23, ADR-0002). Not a gap — the deliberate positioning. A clean one-liner falls out: **"AgentCore Memory, but local and git-native — no AWS account, your files, your repo, it travels with `git clone`."** That AWS built a managed service around this model is the strongest validation yet that the kit is solving a real, mainstream problem the right way.

## The four slides

1. **Memory taxonomy (Short-Term / Long-Term / Procedural / Episodic).** The standard four-type model. Maps onto what we already have, mostly under different names: short-term = compression window; long-term = facts + persona; **episodic** ("in our last session Monday we finalized Kyoto") = session rollups + DECISION-LOG; **procedural** ("I'll present a comparison table, your preferred format") = our `feedback`-type facts + persona working-style. We don't name procedural as its OWN tier — we fold "how the user wants me to work" into `feedback`. Noting, not restructuring.
2. **"What Do We Store?" — Facts / Errors / Research.** Facts (= `project`/`reference`) ✓; Research ("Bedrock AgentCore is a service…", "the auth logic lives in…") (= `reference` + the architecture/where-things-live recall we fixed in D-153) ✓; **Errors ("/users endpoint fails checks → Fix: use package v2.3.1") — the one we DON'T have as a first-class type.**
3. **"How Do We Organize?" — Folders / Vector DB / Graph DB**, showing `memories/{research,errors-and-fixes,facts}/*.md`. **This is the kit almost exactly** — typed markdown folders + a vector search layer (Graph DB shown but optional, as we treat it). Strong validation. And again **`errors-and-fixes/` is a first-class folder.**
4. **"Planning (Writing the Spec)"** — write a detailed plan, don't code yet; small independent steps; be explicit (data structures/APIs/exact changes, no assumptions); per step include how to verify success; anticipate failures + edge cases upfront. **This is the kit's OWN build methodology** — plan-mode-first, the Kiro spec-driven flow (ADR-0004), read-docs-before-code, five-exit-doors/anticipate-edge-cases. AWS teaching the workflow we codified. Validating, nothing new.

## The one actionable signal — error→fix as a first-class memory category

It recurs in BOTH slides (slide 2 "Errors", slide 3 `errors-and-fixes/`) and is the natural home for AgentCore's *custom strategy*: **"we hit error X, the fix was Y"** is a distinct, high-value memory the kit can capture today but only as a generic `project`/`reference` fact (our taxonomy is `user`/`feedback`/`project`/`reference`, enum-enforced in write-fact.mjs / auto-extract.mjs / mcp-server.mjs) — there's no error→fix TYPE with its own retrieval affordance ("what was the fix when we last hit this error?"). This is the same instinct already in the **Task 55 dossier** (ruflo trajectory memory "capture HOW a task was done well"; memclaw outcome-based scoring) — but the AWS framing is more concrete and standalone: an **error/solution pair** as its own category.

**Slot (design input, NOT a task now):** the error→fix category belongs in the **Task 55** design (behavioral/trajectory/outcome memory) and overlaps **Task 66** (temporal — a fix is true until the dep changes). When Task 55 is designed, evaluate adding an `error`/`fix` (or `lesson`-with-an-error-shape) type + the auto-extract classifier rule that recognizes "we hit X → fixed by Y" turns. Caveat per our discipline: a new fact TYPE ripples through the enum + trust + routing + persona logic + the type taxonomy in 4 files — not free; design it deliberately, don't bolt it on.

## What we would NOT take

- **The managed cloud service / Bedrock / AWS account dependency** — the exact opposite of the kit's local-first, no-server, no-cloud thesis (D-23). AgentCore is the kit's positioning FOIL, not a model to adopt.
- **`actorId`/`namespace` as our identity model** — our tier/scope + content-addressed IDs are the local-first equivalent and don't need a cloud actor registry.
- **Graph DB** — shown on slide 3, optional there as here; not on a kit lane.

## Net

**The strongest VALIDATION of the batch** (alongside OKF): AWS built a managed cloud service around the kit's exact mental model — auto-extract strategies (= our auto-extract), fact/summary/preference long-term records (= our facts/compression/persona), semantic namespace retrieval (= our tiered search), typed markdown folders (slide 3 = us). Confirms the design AND hands the kit a sharp positioning line ("AgentCore Memory, but local + git-native"). **One actionable signal:** error→fix as a first-class memory category (slides 2+3, AgentCore custom-strategy) — slotted as a design input to Task 55 (+ Task 66), not a task now, because a new fact type ripples through the enum/trust/routing. The Planning slide is our own methodology reflected back — pure validation.

## Reference

- AgentCore Memory: <https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html> (+ how-it-works, memory-strategies)
- Source: 4 AWS-build-event slides (the user's photos, 2026-06-15) + the AgentCore docs
- Relates: ADR-0002 (markdown is truth), D-23 (local-first/no-server — the positioning contrast), the auto-extract thesis (design §6.0 — AWS "strategies" converge on it), Task 55 (behavioral/trajectory/outcome memory — the error→fix home; ruflo/memclaw dossier), Task 66 (temporal — a fix ages), ADR-0004 (spec-driven flow — the Planning slide), D-153 (the research/where-things-live recall — slide 2's "Research"), OKF note (the sibling validation source).
