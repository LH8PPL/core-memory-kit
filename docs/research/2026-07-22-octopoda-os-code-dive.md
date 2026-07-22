---
date: 2026-07-22
topic: Octopoda-OS code dive — loop detection, observability, audit chain, memory model
source: Shallow clone + code read of github.com/RyjoxTechnologies/Octopoda-OS (v3.0.x)
tags: [prior-art, loop-detection, observability, audit, task-250, task-212]
---

# Octopoda-OS code dive

**What it is (self-description):** "The open-source memory and observability layer for AI agents" — persistent memory, loop detection, audit trails, and a live dashboard, "automatic on `pip install`." MIT. Python (server + SDK) + a compiled React dashboard.

**Version actually cloned:** `3.3.5` (per `pyproject.toml`, package name `octopoda`), not the `3.0.3 ~2026-04` the task named. The repo is one code tree with **four overlapping package roots** whose relationship is not documented: `synrix/` (the memory SDK/engine), `synrix_runtime/` (the cloud API + monitoring + loop-intel + audit_v2 + dashboard), `octopoda_zf/` (a newer auto-instrumentation SDK: capture → extract → inject), and `octopoda/` (near-empty shim). "Octopoda" is the product brand; "synrix" is the internal name still all over the code. Full URL: <https://github.com/RyjoxTechnologies/Octopoda-OS>

**Headline verdict:** unusually for this field, the loop-detection engine is **real, concrete, deterministic code that ships MORE than the README claims** (10 classifiers behind a "five-signal" headline), NOT a README-only stub. The big caveats are (a) it's a **server product** — Postgres + pgvector + multi-tenant RLS + a hosted cloud API, none of it file-based; (b) the v2 classifiers have **zero unit-test coverage in the shipped `tests/` tree** and **all their precision/recall numbers are `None`** (never benchmarked); and (c) there are **two parallel loop detectors** (an inline v1 in `runtime.py`, and the v2 classifier suite) that the README conflates.

---

## 1. Loop-detection engine (PRIORITY)

### 1a. There are TWO engines, not one

**Engine V2 — `synrix_runtime/loop_intel_v2/` — the classifier suite. CODE-VERIFIED.**
Rule-based, deterministic, pure functions of an event window. `__init__.py` states the design contract explicitly: "Rule-based (no LLMs in the detection path) / Deterministic / Versioned / Unit-testable / Self-documenting." Ships **10 classifiers**, each `classify(events, agent_id) -> Optional[LoopDetection] | List[LoopDetection]`:

| Classifier | File | Status (registry.py) | Target P/R | Measured |
| --- | --- | --- | --- | --- |
| retry | `classifiers/retry.py` | live | 0.95/0.90 | **None** |
| polling | `classifiers/polling.py` | live | 0.90/0.85 | None |
| decision_oscillation | `classifiers/decision_oscillation.py` | live | 0.95/0.90 | None |
| cost_inflation | `classifiers/cost_inflation.py` | live | 0.95/0.90 | None |
| self_correction | `classifiers/self_correction.py` | live | 0.85/0.75 | None |
| ping_pong | `classifiers/ping_pong.py` | live | 0.95/0.85 | None |
| tool_nondeterminism | `classifiers/tool_nondeterminism.py` | live | 0.90/0.80 | None |
| recall_write | `classifiers/recall_write.py` | live | 0.85/0.75 | None |
| clarification | `classifiers/clarification.py` | **shadow** | 0.80/0.70 | None |
| reflection | `classifiers/reflection.py` | live | 0.85/0.75 | None |

`models.py` enumerates **16** `LoopType` values (8 more — `convergent_hallucination`, `plan_replan`, `tool_oscillation`, `subgoal_proliferation`, `consensus_failure`, `cross_session_contamination`, `stealth`, `unknown`) that have **no classifier file** — README-ONLY / aspirational enum entries.

**The README's "Five-signal engine: retry, oscillation, ping-pong, reflection, recall" is an UNDERCOUNT**, and all five map to real files (oscillation→decision_oscillation, recall→recall_write). PARTIAL only in that "measured accuracy" is unproven — `registry.record_measurement()` exists but is "kept in-memory for the life of the process; intended to be called by a CI job" and is never called in the shipped tree; every `measured_precision`/`measured_recall` is `None`.

**Engine V1 — `synrix_runtime/api/runtime.py::AgentRuntime.get_loop_status()` (~line 1086). CODE-VERIFIED.**
An **inline, in-memory** detector (confusingly the docstring calls it "Advanced Loop Detection v2"). Keeps per-`(tenant, agent)` in-process trackers (`_repeat_tracker`, `_write_tracker`, `_loop_status_cache`) and computes a health **score** (start 100, deduct per signal) → **severity green/yellow/orange/red**, from 5 heuristic signals over the last 5 min: write embedding-similarity (numpy dot ≥0.88, needs `octopoda[ai]`), key-overwrite frequency (≥3 writes/key/5min), write velocity (≥10 writes/60s = red), recent-alert history, and goal-drift (cosine of recent writes vs a stored goal embedding). This is the one wired to auto-pause (§below). It only sees **memory writes**, not tool/LLM calls.

### 1b. Per-signal detection algorithms (V2 — the interesting ones for us)

All are CODE-VERIFIED. All comparison is deterministic; similarity uses **stdlib `difflib.SequenceMatcher`** (`similarity.py`), *not* embeddings, so classifiers run with zero ML deps.

- **retry** — keep this agent's `TOOL_CALL` events, sort by ts. If the latest call isn't a failure (`success is False` OR `status_code ∈ [400,599]`), return None ("retry resolved"). Else walk backwards counting **consecutive identical** calls (same `tool_name` + sha256 hash of `json.dumps(args, sort_keys=True)`), break on a different call. HIGH if ≥3 consecutive AND ≥2 failures; MEDIUM if ≥2 AND ≥1. State kept: none (pure over the window). Input: tool-call log with `success`/`status_code`.
- **decision_oscillation** — keep `DECISION` events for the latest `decision_key`; need ≥3. Take last 6; fingerprint values via canonical JSON; require **exactly 2 distinct values** in **perfect A/B/A/B alternation** (3+ distinct = "exploring, not oscillating"). HIGH if ≥4, MEDIUM if 3. Input: a decision log.
- **ping_pong** (cross-agent) — group `MEMORY_WRITE` events by `key`; per key need ≥3 writes from **exactly 2 distinct agents** alternating A/B/A/B. Returns one detection **per qualifying key**. Input: shared-memory write log with author agent id.
- **recall_write** — per key, walk `MEMORY_READ`/`MEMORY_WRITE` chain; pair each write with the preceding read; `text_similarity(read_value, write_value)`; count "cycles" with sim ≥0.75. HIGH if ≥3 cycles & min-sim ≥0.85, MEDIUM if ≥2 & ≥0.75. Input: read+write log with values.
- **reflection** (255 lines, the richest) — per key, ≥3 writes; take last 6; **excludes** if any read on the key falls inside the write window (that's recall_write's territory); consecutive pairwise `text_similarity`; skip if `max_pair ≥0.995` ("duplicate thrash, not reflection"). HIGH if min-pair ≥0.80, MEDIUM if ≥0.65. Notably ships a **pattern-aware `suggested_fix` builder** that special-cases key shapes (`*:summary` → "intentional rolling summary, likely a false positive"; `recovery-marker`/`crash` → "symptom not bug"; `*:heartbeat`/`:status` → "polling overhead"; `goal:*` → "plan/replan loop") and computes a calibrated dedup threshold. This "don't cry wolf on legitimate summarization" nuance is the single most kit-relevant idea in the whole repo.

### 1c. What inputs it needs, and where events come from. CODE-VERIFIED.

`detection.detect()` runs all classifiers over a `List[LoopEvent]`. Events are typed dataclasses (`ToolCallEvent`, `LLMCallEvent`, `DecisionEvent`, `MemoryWriteEvent`, `MemoryReadEvent` — `models.py`). The production event source is `adapter.py::fetch_events()`, which **reads from the Postgres `nodes` table**: memory writes from the versioned rows, and tool/LLM/decision/read events from `audit_v2` rows (name-prefixed `auditv2:…`). The adapter's own SCHEMA NOTE is candid: "Tool calls, LLM calls, and decisions are NOT stored separately — those need audit-v2 enabled. Only memory-based classifiers will produce results here" without audit_v2. So retry/polling/cost_inflation/tool_nondeterminism are **inert unless the audit_v2 layer is on**.

### 1d. What happens on detection. CODE-VERIFIED (with a real enforcement path).

- **V2 default = observe + report.** `GET /v1/loops/v2/detect/{agent_id}?hours=…` returns detections (evidence + `suggested_fix`); the dashboard renders them. **No blocking by default.**
- **Remediation is opt-in and real.** `POST /v1/loops/v2/apply-fix` snapshots the redundant memory revisions into a `loop_intel_undo` table then **DELETEs them from `nodes`** (with a working `/undo-fix`). `POST /v1/loops/v2/dedup-guard` installs a per-key similarity guard that drops future near-dup writes.
- **Auto-pause exists.** `circuit_breaker.py` runs a **background daemon thread** (30s interval) that sums `cost_usd` per agent over a 60s window; over threshold → `LoopBreaker.pause_agent()` (subsequent writes return **HTTP 429**) + a Resend email. Separately, `trip_on_v1_severity()` wires **v1 orange/red severity → the same pause** ("decoupled from cost"). So the enforcement is genuinely there, just gated behind config and cost-centric by default.
- **Confidence gating:** `Confidence.LOW` is "logged only, never notifies" (`models.py`). Feedback loop: `feedback.py` records user "correct / false_positive" verdicts (in-memory default) — a precision-improvement scaffold, not yet DB-backed.

### 1e. Could our kit run these detectors over OUR logs without adopting their runtime? YES — this is the key finding.

The V2 classifiers are **pure, dependency-free functions** (stdlib `difflib`/`hashlib`/`json` only). They do **not** import their DB, API, or ML stack — `adapter.py` is the only DB coupling and is a *separable* input stage. To reuse the *approach* (not the code — it's server/DB-shaped) we'd need one adapter: **kit NDJSON log line → a small typed-event dataclass → classifier logic.** Mapping to our sources:
- `retry` / `tool_nondeterminism` — need a tool-call log with success/args. **The kit does not log tool calls today** (audit.log records memory mutations, not agent tool use). This is the gap Task 212 names.
- `reflection` / `recall_write` / `decision_oscillation` — map cleanly onto **`context/memory/` writes + `DECISIONS.md` + `extract.log`**: repeated near-identical fact writes to the same slug, oscillating decisions, read-then-rewrite. These we *can* compute from data we already have.
- `ping_pong` — multi-agent; N/A for the kit's single-agent-per-repo model.

---

## 2. Observability / health surfaces. CODE-VERIFIED.

- **`monitoring/anomaly.py::AnomalyDetector`** — statistical baseline-vs-recent over `metrics:{agent}:…` rows. Four checks: latency spike (recent mean > baseline + 3σ), high error rate (>5× a 0.01 baseline), idle anomaly, and **crash-loop (≥3 crashes in 10 min)**. Writes alerts to `alerts:{agent}:{ts}`. **This is the closest analog to "actionable failure" filtering:** the thresholds are explicitly *repeated*-over-a-window, not single-event — a lone crash or one slow call does NOT alert; 3-in-10-min or 5×-baseline-over-a-window does. That "repeated, not transient" gate is exactly the Task-250 discrimination, implemented as simple counting windows.
- **`monitoring/metrics.py`** (35 KB) and **`brain.py`** (29 KB, holds `LoopBreaker`) — larger fleet-metrics + pause/resume machinery (read at grep depth, not line-by-line — see "could not verify").
- **Surfaced where:** a live React dashboard (`synrix_runtime/dashboard/`, compiled assets — "Anomalies", "AuditTrail", "AuditV2", "Analytics", "Agents" views), the FastAPI routes, SSE for live streaming, AND MCP tools (`octopoda_memory_health`, `octopoda_loop_status`, `octopoda_loop_history`, `octopoda_agent_stats`) so the agent can query its own health.
- **Cost is a first-class metric** (`cost_models.py`, `audit_v2/cost.py`): every loop detection carries an estimated $ cost, and "loops caught before they burned tokens" is the product's core value pitch.

---

## 3. Hash-chained audit trail. CODE-VERIFIED — real construction & verification, but self-anchored.

`synrix_runtime/audit_v2/storage.py`:
- **Construction:** `_compute_hash(event, prev_hash) = sha256( prev_hash + "|" + canonical_json(event MINUS prev_hash) )`. Chain is **per-(tenant, agent)** — each agent's first event has `prev_hash=None`. The chain hash `_this_hash` is stored inside each event's own JSON row in `nodes` (name `auditv2:…`, `valid_until=0` = immutable). A per-agent write lock + `async_writer.py` single-writer worker serialize read-prev → compute → write so concurrent writes chain correctly.
- **Verification:** `verify_chain(tenant, agent_id?)` walks events in order, recomputes each event's hash, checks `stored.prev_hash == expected_prev`, reports `{ok, checked, first_broken_row_id, by_agent{...}}`. Exposed as an API endpoint. **This genuinely detects single-row edits/deletes** that don't rewrite the downstream chain.
- **Honest limits (why "tamper-evident" is partly decorative):** it's a **plain SHA-256 chain, not an HMAC** (no secret key) and it's **not externally anchored** — hashes live in the very `nodes` table they protect. An attacker with DB write access can edit a row and **recompute every subsequent hash**, and `verify_chain` (which recomputes from stored data) will pass. So it's tamper-*evident* against accidental corruption and naive single-row tampering, but **not** against a capable insider with write access. No Merkle root, no notarization, no WORM/append-only store, no signing key. Genuinely shipped, modestly scoped.

---

## 4. Memory model. CODE-VERIFIED (schema) / PARTIAL (curation internals).

- **Storage = server-side Postgres, opaque rows — NOT human-readable/editable markdown.** `init.sql`: a **bitemporal `nodes` table** (`tenant_id, name, data JSONB, metadata JSONB, embedding vector(384), valid_from, valid_until`) where `valid_until=0` marks the current version and history is retained (this is what powers `recall_history`). Plus `fact_embeddings` (LLM-extracted facts), a `entities`/`relationships` knowledge graph, and `tenant_settings`. Multi-tenant isolation via **Postgres Row-Level Security** keyed on `SET LOCAL app.tenant_id` — "the trust wall."
- **Write path:** SDK/MCP `remember(agent, key, value)` → cloud API → versioned `nodes` insert. `octopoda_zf` adds an auto-capture path: instrument the LLM SDK → `octopoda_process_conversation` / extractor pulls durable facts each turn.
- **Retrieval = hybrid.** pgvector **HNSW** cosine index for semantic (`recall_similar`), `text_pattern_ops` prefix index for key search, GIN/`pg_trgm` for full-text. `octopoda_zf/recall/injector.py` then **selects + token-bounds** the hits before injecting them as a system message (relevance floor + token cap + max-items). Embeddings: BGE-small / 384-dim; server-side in cloud mode, `octopoda[ai]` (sentence-transformers, ~33 MB) in local mode — without it, semantic recall silently returns 0.
- **Curation / consolidation / forgetting — exists as surface, internals only skimmed:** MCP tools `octopoda_consolidate` (merge duplicates), `octopoda_forget`, `octopoda_forget_stale(max_age_days)`, plus `octopoda_zf/extraction/{deduper,supersede,importance}.py` (dedup, supersession, importance scoring) and `synrix_runtime/core/gc.py`. I confirmed these files/tools exist and are wired, but did not read the consolidation/supersede algorithms line-by-line (see below).

---

## 5. MCP server. CODE-VERIFIED.

`synrix_runtime/api/mcp_server.py` — a **FastMCP** server (`FastMCP("Octopoda Memory")`) exposing **~29 tools** (README says 28), all **cloud-backed** (proxies to `api.octopodas.com`, requires `OCTOPODA_API_KEY`). Tools: `octopoda_remember/recall/search/recall_similar/recall_history/related/snapshot/restore/share/read_shared/list_agents/agent_stats/process_conversation/get_context/log_decision/forget/forget_stale/memory_health/consolidate/loop_status/loop_history/send_message/read_messages/broadcast/set_goal/get_goal/update_progress/search_filtered/status`.

**On nudging the agent to use them (Task 233's problem) — nothing special, and that's a finding.** The tool **docstrings are plain and descriptive** ("Store a persistent memory… persists across sessions"), with **no system-prompt injection, no hooks, no urgency framing** to push recall-under-fire. The only "nudge" mechanism is the *separate* `octopoda_zf` auto-instrumentation path, which **wraps the LLM SDK** to inject `injector.build_injection()` recall automatically before each call — i.e. they solve "agent forgets to recall" by **doing the recall for the agent** (SDK-side auto-injection), not by nudging the agent through tool descriptions. The MCP surface itself relies entirely on the model choosing to call the tools.

---

## Relevance to the kit

| Item | Finding | Verdict for the kit |
| --- | --- | --- |
| **Task 250 (failure-driven health nudge)** | V2 classifiers + `anomaly.py` both implement **"repeated-over-a-window, not transient" gating** with plain counting thresholds (retry ≥3-consecutive-with-≥2-failures; crash-loop ≥3-in-10-min; error-rate >5×-baseline). `reflection.py`'s pattern-aware fix builder explicitly suppresses false positives on legitimate summarization/heartbeat keys. | **ADAPT the ideas, not the code.** The window-count discrimination and the "don't nudge on a known-benign pattern" suppression list are directly transplantable to a nudge that fires only on *repeated* failure signatures in our logs. Their code is DB/server-shaped and unusable as-is. |
| **Task 212 (process-health metrics from logs we already write)** | The V2 classifiers are **pure stdlib functions over a typed event window** — the exact shape Task 212 wants. But they need a **tool-call log** we don't produce (retry/nondeterminism), while reflection/recall_write/oscillation map onto `context/memory/` + `DECISIONS.md` + `extract.log` we DO produce. `difflib.SequenceMatcher` as a zero-dep similarity proxy is a nice trick for our no-ML constraint. | **ADAPT.** Strongest validation that "detectors over an NDJSON log" is a sound design. Copy the *pattern* (event dataclass → pure classifier → evidence struct with `suggested_fix`). Consider: do we want to start logging agent tool-calls to unlock retry-class detection? |
| **Task 233 (recall under-fire / nudging tool use)** | Octopoda **does NOT nudge via MCP** — plain tool docstrings, no injection. It sidesteps the problem by auto-injecting recall SDK-side (`octopoda_zf`). Their injector uses a **relevance floor + token cap + max-items**, and their own benchmark caught that an **0.80 floor was too aggressive (filtered 5/7 relevant facts) → lowered to 0.45** — a calibration warning worth heeding for our snapshot. | **IGNORE their MCP approach** (offers nothing for the nudge problem). **NOTE the calibration lesson** for our session-start injection: a too-high relevance floor silently starves recall. Our SessionStart auto-injection is already the "do it for the agent" strategy they endorse. |
| **Task 127 (audit trail / tamper-evidence)** | Real per-agent SHA-256 hash chain with a working `verify_chain`, but **self-anchored, no HMAC, no external anchor** — defeated by any writer who rewrites the chain. Our `.locks/audit.log` is plain NDJSON with no chaining. | **ADAPT, modestly.** A per-file `prev_hash` chain over our append-only `audit.log` is cheap and would catch accidental corruption + naive edits. Do NOT oversell it as tamper-proof — the same limits apply to us and worse (our logs are local files). Their honest scoping is a good model. |
| **Overall shape** | Server product: Postgres + pgvector + RLS + hosted cloud + React dashboard + Stripe billing. | **IGNORE the architecture.** Opposite of the kit's file-based, no-server, human-readable, single-user design. Value is entirely in the **algorithms and the framing**, not the stack. |

**One-line takeaway:** the loop detectors are the real asset — 10 genuinely-shipped, deterministic, stdlib-only classifiers that prove "process-health detection over an event log" is a sound and buildable design — but they're unvalidated (no tests, no measured accuracy) and wrapped in a server product we'd never adopt. Lift the *pattern* and the *false-positive-suppression discipline* into Tasks 250/212; leave the runtime.

---

## What I could not verify and why

- **Measured detector accuracy.** All `measured_precision`/`measured_recall` are `None`; `record_measurement()` is never called in the shipped tree. The README's "five-signal engine" makes no accuracy claim, but the registry's target P/R (0.85–0.95) are **aspirations, not measurements**. No benchmark corpus is in the clone.
- **V2 classifier correctness under real data.** There are **NO unit tests** for `loop_intel_v2` in `tests/` (only the v1 `get_loop_status` is tested, via `test_comprehensive.py` / `test_mcp_local_adapter.py`). The classifier docstrings promise unit-testability; the tests aren't in the repo. `examples/loop_detection_demo.py` is a live-server integration demo, not a correctness test. So "genuinely shipped" = wired and structurally sound, **not** validated.
- **`metrics.py` (35 KB) and `brain.py` (29 KB) internals** — read at grep/header depth only (found `LoopBreaker`, severity thresholds, pause/resume), not line-by-line. The full fleet-metrics computation and the exact `LoopBreaker.pause_agent` state machine were not exhaustively traced.
- **Consolidation / supersession / GC algorithms** (`extraction/deduper.py`, `supersede.py`, `importance.py`, `core/gc.py`, `octopoda_consolidate`) — confirmed to exist and be wired, but the merge/forget logic was not read in detail (time budget spent on the priority-1 loop engine).
- **Runtime behavior** — nothing was executed. This is a static read only; no server was stood up, no DB, no live detection run. All "it fires when X" statements are read from the rule code, not observed.
- **Version drift** — the task named v3.0.3; the cloned `main` is `3.3.5`. Findings reflect `3.3.5`. The `CHANGELOG.md` (40 KB) was not read for per-version history.
