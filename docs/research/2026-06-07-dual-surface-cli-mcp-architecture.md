---
date: 2026-06-07
topic: How dual-surface (CLI + MCP) memory products share ONE core + handle input + keep parity — source-level research for Task 108 / ADR-0014
sources:
  - basic-memory (basicmachines-co) — AGPL-3.0 — source-read via GitHub API + raw files
  - mempalace (mempalace/mempalace) — MIT — source-read via GitHub API
  - ADR-0006 (lifecycle hooks) — the deferred "MCP-for-writes" line
  - prior notes: claude-remember code-dive, gstack skill-layer, deep-dive-product-memory-implementations
tags: [task-108, adr-0014, cli-mcp-parity, shared-core, structured-input, dual-surface, research-first]
---

# Dual-surface CLI+MCP architecture — source research for Task 108

> **Research-first** (D-82 directive): before designing the unify-CLI+MCP work, read the ACTUAL CURRENT source of the dual-surface products — don't lean on README prose or training data (which is unreliable for these niche repos). The question our existing notes never answered: **how do you keep a CLI and an MCP surface in parity over one core, and take rich input without shell corruption?**
>
> **IP discipline:** basic-memory is **AGPL-3.0**, mempalace **MIT** — we study PATTERNS and cite; we lift NO code (the kit's standing rule; AGPL especially is incompatible with verbatim reuse).

## The reframe found while reading the docs (ADR-0006, line 82)

ADR-0006's "Alternatives considered" already weighed the exact architecture Task 108 builds:

> *"Use `claude_memory` (Ruby) inversion: hooks for capture only, **MCP for retrieval+writes** — Genuinely interesting; **deferred to v0.2 as a possible refactor.** v0.1 keeps the hook-driven write path because it's the proven model in claude-mem."*

So **MCP-as-write-surface was never settled against — it was a documented v0.2 deferral.** Task 108 = cashing it in, triggered by the cut-gate's D-81 (shell-write corruption) / D-85 (free-speech needs a tool per intent) / R2 (shell-write permission prompt). Design §10.3's "MCP = retrieval" is the v0.1 *state*, not a closed door. ADR-0014 executes ADR-0006's deferred line and cites its origin (`codenamev/claude_memory`, Ruby).

## basic-memory — the TARGET pattern (source-verified)

**Package layout** (`src/basic_memory/`): `cli/` · `mcp/` · `api/` · **`services/`** · **`repository/`** · `schemas/`+`schema/` · `models/` · `sync/` · `markdown/` · `indexing/`. A textbook layered split — three front-ends (`cli`, `mcp`, `api`) over a shared `services/` + `repository/` core.

**How the surfaces reach the core** (the decisive find — `mcp/async_client.py`): the MCP tools do NOT call `services/` directly. They go through the **internal FastAPI `api/` via `ASGITransport`**:
```python
from basic_memory.api.app import app as fastapi_app
transport=ASGITransport(app=fastapi_app)   # in-process ASGI — no network socket
base_url="http://test"
```
Cloud mode swaps in a real network `AsyncClient`. So their parity mechanism = **one `api/` surface + a swappable transport** (in-process ASGI locally / HTTP for cloud). The CLI exposes the same operations under a `tool` namespace (`basic-memory tool edit-note`) — i.e. CLI commands and MCP tools are the *same* ops.

| Adoption-verification | |
|---|---|
| **Adopted** | The layered shared-core pattern (surfaces = thin adapters; one core owns the logic). |
| **What it provided (concrete)** | Proof from real source that the leading CLI+MCP memory product routes *both* surfaces through one core — and the exact seam (`ASGITransport` in-process API) + the swappable-transport idea. |
| **Counterfactual** | Without the source read I'd have assumed "shared core = call `services` directly" and missed that the leading product inserts an API layer — and *why* (cloud/web parity). I'd not have known the deviation point to make explicit. |
| **Verdict** | **Helpful.** |
| **Do NOT copy** | The internal HTTP/ASGI indirection. They justify it with a **web UI + a cloud product**; the kit is single-user/local/Node with neither, so an internal API layer is pure overhead → our CLI + MCP call the core **functions directly, in-process**. (Same "skip infra you don't need" call as Milvus/Qdrant.) Revisit their swappable-transport only if `cmk view`'s web UI or a cloud story ever ships. |

## mempalace — the ANTI-pattern (source-verified)

**Package layout** (`mempalace/`): `cli.py` (67 KB) · `mcp_server.py` (**129 KB**, all 29 tools inline) · flat functional modules (`palace.py`, `palace_graph.py`, `searcher.py`, `miner.py`, `entity_registry.py`, `repair.py`). **No `services/`/`core/`/`api/`/`tools/` directory** — logic distributed across big modules; the two front-ends are huge per-surface files.

| Adoption-verification | |
|---|---|
| **Adopted** | Nothing structural — kept as a **cautionary** data point. |
| **What it provided (concrete)** | A real example of dual-surface WITHOUT core extraction: 67 KB CLI + 129 KB MCP, ~5 CLI commands vs 29 MCP tools (nowhere near 1:1), no shared service layer, no parity guard. That's *exactly what our drifted MCP already is*, scaled up. |
| **Counterfactual** | Without it I'd have only the positive example; this shows the concrete failure mode (per-surface monoliths that drift) we're spending Task 108 to avoid, and confirms "dual-surface ≠ 1:1 parity." |
| **Verdict** | **Helpful (negative result).** |

## claude-mem — third dual-surface product, in OUR stack (source-verified, structure)

**Layout** (`src/`, TS/Node): `cli/` (handlers, adapters, **`stdin-reader.ts`**) + `server/` + top-level **`core/` + `services/` + `shared/` + `sdk/`** + `storage/` + `hooks/` + `adapters/`. **But `src/server/` is a full backend** — `routes/`, `middleware/`, `auth/`, `queue/`, `jobs/`, *and* `mcp/`. The MCP lives *inside* a server backend (like basic-memory's `api/`), not as a thin in-process adapter.

| Adoption-verification | |
|---|---|
| **Adopted** | The layered shared-core idea (a 3rd confirmation: `core/`+`services/`+`shared/`+`sdk/` under separate `cli/` + `server/` front-ends), in our own language. The CLI's `stdin-reader.ts` corroborates the off-shell stdin input channel. |
| **What it provided (concrete) + the correction it forced** | It **corrected** a premature read: I'd inferred "no `api/` dir ⇒ in-process." `server/` (routes/middleware/auth/queue/jobs/mcp) *is* the backend. So **both** leaders (basic-memory + claude-mem) run a server/backend layer — claude-mem heavier (auth/queue/jobs). "In-process shared-core is the norm" is **false**. |
| **Counterfactual** | Without this dive the ADR would have claimed "the leaders share the core in-process" — a wrong, hollow read from a directory name. |
| **Verdict** | **Helpful (corrective).** |
| **Honest gap** | Could NOT resolve claude-mem's CLI↔server wire (HTTP vs in-process) from structure alone (API sizes zero). Doesn't change our decision (we go in-process regardless). |

**Corrected synthesis point:** our in-process shared core (no server layer) is a **deliberate, scope-justified simplification** — single-user/local/Node, no hosting/auth/background-jobs — **not what the leaders do.** They go heavier *because* of cloud/web/multi-user scope we don't have.

## Input channels — off-shell (from prior source notes, re-confirmed)

- **basic-memory MCP**: in-process params (ASGI) — never a shell.
- **claude-remember**: stdin-from-temp-file, *explicitly* to preserve `$`/backtick verbatim ([code-dive:117](2026-05-25-claude-remember-code-dive.md#L117)).
- **gstack `/learn`**: a single **single-quoted JSON arg** to a binary (off-shell-substitution, but fragile on a literal `'`).
- **Our decision**: `cmk remember --from-file <fact.json>` + `--json -` (stdin) → `JSON.parse` → the SAME object the MCP tool passes. `fs.readFileSync`+`JSON.parse` is byte-total. The union of claude-remember (file/stdin) + claude-mem/basic-memory (structured params).

## Synthesis → the Task 108 / ADR-0014 architecture

1. **Extract an in-process memory-op core** (basic-memory's `services/` shape) — structured object in / result out; NO internal HTTP/ASGI layer (we have no web/cloud product to justify it).
2. **CLI + MCP = thin adapters** over that core — explicitly NOT mempalace's per-surface monoliths.
3. **Off-shell input** — CLI `--from-file`/stdin, MCP JSON params; rich content never on a shell command line (fixes D-81).
4. **`validate-cli-mcp-parity` guard** — the differentiator NEITHER product has; it's what keeps us from drifting into mempalace over time.
5. **1:1 is not sacred** — parity applies to the **memory surface** (read + write + mutate); lifecycle/host verbs (`install`, `register-crons`, `mcp serve`) stay CLI-only.
6. **Destructive MCP ops** (`mk_forget`/`purge`) carry a confirm-token (the auto-invoking model can't silently tombstone).
7. This realizes ADR-0006's deferred "MCP for retrieval+writes" line; ADR-0014 supersedes that deferral + revises design §10.3 (decision-trail-preserved).
