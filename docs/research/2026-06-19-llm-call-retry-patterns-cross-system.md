---
date: 2026-06-19
topic: How memory/agent systems RETRY a transient LLM-call failure — cross-system code read for Task 161's fix (after D-174 inverted the size-bound design to a retry). What they retry, how many attempts, what backoff, and the transient-vs-deterministic discriminator.
source: FRESH code reads (the /c/tmp/*-fresh clones from the 2026-06-18 dive, re-read for retry logic 2026-06-19). Checked the WHOLE field (not a subset): retry-on-LLM-call found + read in graphiti/Zep, Letta, mempalace, mem0, TencentDB, OpenHands, caura-memclaw (direct competitor), honcho; NO-retry (single-attempt) confirmed in claude-remember (the kit's precedent), claude-mem; N/A (no LLM compress) in basic-memory, squad, langmem/cognee/lightmem (retry hits were incidental — alembic/doc/embedding, not the compress path). Grounded against the kit's compressor.mjs failure shapes + the D-174 environmental-failure finding.
tags: [retry, backoff, exponential-backoff, transient-failure, rate-limit, llm-client, haiku_timeout, compress_failed, Task-161, D-174, D-175, tenacity, competitive-analysis, code-dive]
---

# LLM-call retry patterns across the field — the Task 161 fix grounding

> **Why this note.** D-174 inverted Task 161's fix: the compress timeout is ENVIRONMENTAL/TRANSIENT, not input-size-driven, so the fix direction is **retry**, not input-capping. Before designing the retry, read how the field ACTUALLY retries a transient LLM-call failure — not one system (the first pass tunneled on OpenHands), but every surveyed system that has real retry code. The convergence settles the open question D-174 left: **how to tell a transient failure (retry) from a deterministic one (don't).**

## What each system does (read from current source 2026-06-19)

| System | File | Max attempts | Backoff | Retries (transient) | Does NOT retry (deterministic) |
| --- | --- | --- | --- | --- | --- |
| **graphiti / Zep** | `llm_client/client.py` | **4** (`stop_after_attempt(4)`) | **exponential + jitter** (`wait_random_exponential`, tenacity) | `RateLimitError`, **HTTP 5xx (500–600)**, `EmptyResponseError`, `JSONDecodeError` (`is_server_or_retry_error`) | 4xx client errors (not matched → reraise) |
| **graphiti-anthropic** | `llm_client/anthropic_client.py` | 2 (`max_retries=2`) | — | `anthropic.RateLimitError` | `anthropic.APIError` — **explicit comment: "bypass the retry mechanism, as retrying policy-violating content will always fail"** |
| **Letta** | `agent.py` `_get_ai_reply` | 3 (`empty_response_retry_limit`) | **exponential, capped** (`min(backoff_factor * 2**(attempt-1), max_delay)`, `backoff_factor=0.5`) | empty response + bad finish-reason → raised as **`ValueError`** (the retryable marker) | context-length-exceeded → raised as **`RuntimeError`** ("not retryable, hence RuntimeError v.s. ValueError"); generic `Exception` → **exit immediately** |
| **mempalace** | `closet_llm.py` | 3 (`for attempt in range(3)`) | **exponential** (`time.sleep(2**attempt)`) | **429, 503**, `"rate" in str(e)`, `JSONDecodeError` | other `HTTPError` codes (fall through → raise) |
| **mem0** | `mem0/llms/*` | (provider SDK) | (provider SDK) | **delegates to the provider SDK's built-in retry** — no own loop | — |
| **TencentDB** | `memory_tencentdb/client.py` | (gateway) | (gateway) | "Wraps all Gateway API endpoints with timeout, **retry**, and error handling" — HTTP-client-level | — |
| **OpenHands** | `condenser/llm_summarizing_condenser.py` | 5 (`hard_context_reset_max_retries`) | — (shrinks input 0.8×/attempt) | the summary call itself overflowing (`context_scaling=0.8`) | — (a DIFFERENT retry: shrink-to-fit-token-window, NOT transient-failure retry) |
| **caura-memclaw** (direct competitor) | `common/llm/retry.py` `call_with_retry` | configurable (`LLM_RETRY_ATTEMPTS`) | **linear** (`base_delay * attempt_number`) | broad `Exception` + per-attempt `asyncio.wait_for` timeout; PLUS `call_with_fallback` (primary → tenant-fallback provider → fake) | reraises the last exception when exhausted |
| **honcho** | `http/async_client.py` | **2** (`DEFAULT_MAX_RETRIES=2`) | (httpx retry) | `RateLimitError` (transport layer) | — |
| **claude-remember** (kit PRECEDENT) | `pipeline/haiku.py` + `consolidate.py` | **1 — NO retry** | — | nothing — `call_haiku` raises `RuntimeError` on timeout/non-zero-exit; `consolidate` wraps it `ConsolidationSkipped` and moves on | everything (single attempt) |
| **claude-mem** (kit ANCESTOR) | per-turn summarize | **1 — NO retry** | — | nothing | everything |

## The decisive negative result (the kit's own precedent)

**claude-remember — the system the kit's compress mechanic was COPIED from — does NOT retry.** `call_haiku` raises `RuntimeError` on a timeout or non-zero exit; `consolidate` catches it as `ConsolidationSkipped` and moves on. Single attempt, no backoff, no retry. **claude-mem (the ancestor) also doesn't retry.** So the kit inherited the *no-retry* shape from its two precedents — exactly as it inherited the unbounded-input shape (D-174). The ENTIRE rest of the field retries transient failures; our two precedents (and therefore the kit) don't. **This is the same "inherited a precedent's gap" story as D-174, applied to retry instead of input-bounding.** Adding a bounded retry brings the kit to the field standard its precedents skipped.

## The convergent principles (7 of 7 retrying systems land on the same shape)

1. **Bounded attempts: 2–4 total.** Nobody retries indefinitely. graphiti=4, Letta=3, mempalace=3, graphiti-anthropic=2, honcho=2, memclaw=configurable. **A SINGLE retry (2 total attempts) is the floor (honcho/graphiti-anthropic); ≤4 is the ceiling.**
2. **Backoff: exponential (majority) or linear (memclaw).** `2**attempt` (mempalace), `backoff_factor * 2**(attempt-1)` capped (Letta), `wait_random_exponential` (graphiti), `base_delay * attempt_number` linear (memclaw). Never a fixed-interval hammer; exponential is the majority.
3. **Retry ONLY the transient class; NEVER the deterministic class** — this is the load-bearing discriminator, and it's UNANIMOUS:
   - **Transient (retry):** rate-limit (429), server errors (5xx / 503), empty/garbled response, JSON-decode failure, network blip. These recover on a re-call.
   - **Deterministic (do NOT retry):** 4xx client errors, **context-length-exceeded** (Letta's explicit `RuntimeError`), **policy violations** (graphiti-anthropic's explicit "retrying always fails"). Re-calling re-fails identically — retrying wastes time + budget.
   - **The signal is the error TYPE.** Letta encodes it structurally (`ValueError`=retryable vs `RuntimeError`=not); graphiti via an `is_server_or_retry_error` predicate; mempalace via explicit code checks (429/503).
4. **Reraise after exhaustion.** All surface the real error once retries are spent (graphiti `reraise=True`, Letta `raise Exception(...)`), never swallow it.
5. **Two valid placements:** an explicit retry loop in the client (graphiti/Letta/mempalace), OR delegate to the provider SDK's built-in retry (mem0) / a gateway wrapper (TencentDB). For the kit there is no SDK — we spawn `claude --print` as a subprocess — so an explicit loop is the only option (the graphiti/Letta shape).

## Mapping to the kit's three failure shapes (compressor.mjs)

The kit's `HaikuViaAnthropicApi.compress` rejects with three distinct shapes (verified in source):

| Kit failure | Class per the field's discriminator | Retry? |
| --- | --- | --- |
| **`HaikuTimeoutError`** (subprocess didn't return in `timeoutMs`) | TRANSIENT (the field's "slow / rate-limited / overloaded" — `claude --print` slow, the D-174 environmental case) | **Yes** — a re-call usually succeeds (the kit's own log: the same sizes succeed on other attempts) |
| **`HaikuFailedError`** (non-zero exit) | **AMBIGUOUS — depends on `exitCode`/`stderr`** (now captured, 161.6a). A transient spawn/overload failure → retry; an auth error / a deterministic CLI rejection → do NOT (Letta's RuntimeError class) | **Conditional** — retry only if the exit/stderr is NOT a known-deterministic class; this is exactly why 161.6a (capture the reason) had to ship FIRST |
| **raw spawn `Error`** (ENOENT — `claude` not found) | DETERMINISTIC (the binary isn't there; re-spawning re-fails) | **No** |

This is the discriminator D-174 left open, now answered by the field: **retry `haiku_timeout` and transient `haiku_failed`; never retry ENOENT or a deterministic non-zero exit.** The 161.6a observability fix is what lets us classify a `haiku_failed` at all.

## The kit-specific constraint the field does NOT face — composition under the hook ceiling

Every system above retries with NO outer wall-clock ceiling (a server / agent loop / CLI). The kit's `compressSession` runs under a **60s SessionEnd hook ceiling, concurrent with `autoPersona`** (D-42) — a 50s attempt + a 50s retry = 100s blows the ceiling and the OS SIGKILLs the parent. So the field's "retry up to 4×" CANNOT be applied verbatim to the hook path. The composition-safe placement (verified against the kit's code):

- **Ceiling-FREE paths get the field-standard retry**: `dailyDistill` + `weeklyCurate` (cron/detached children) + the **lazy `compressSession`** (SessionStart-detached child — no outer ceiling). A bounded exponential-backoff retry (≤2 attempts) fits.
- **The SessionEnd-hook `compressSession`** is the one constrained site: it already RESTORES the buffer on failure (D-79 `restoreRolling`) → the next SessionStart's lazy path re-rolls it. With the lazy path now carrying a real retry, the hook path's "delayed retry" becomes a real bounded retry one session later — so the hook path needs NO in-hook retry (which would blow the ceiling). This is the kit's version of "two valid placements": the hook delegates its retry to the ceiling-free lazy path.

## What we take / don't take

- **TAKE:** bounded attempts (≤2 for the kit, conservative), exponential backoff with a short base, **retry-only-transient keyed on the failure TYPE** (timeout + transient-exit; never ENOENT / deterministic-exit), reraise-after-exhaustion. The graphiti `is_server_or_retry_error` predicate + Letta's ValueError/RuntimeError split are the model.
- **DON'T TAKE:** an unbounded or 4–5× retry on the hook path (ceiling); a fixed-interval retry (use backoff); OpenHands's shrink-on-retry (that's a token-window fit, not a transient-failure retry — moot for us since D-174 ruled out size); a provider-SDK delegate (we have no SDK — we spawn a subprocess).

## Net → the retry design for Task 161 (feeds D-175 / §8.5)

A `compressWithRetry(backend, opts, { maxAttempts, baseBackoffMs, isRetryable })` helper:
- `maxAttempts` ≤ 2 (one retry) on the ceiling-free paths; exponential backoff (`baseBackoffMs * 2**(n-1)`, jittered, short base ~500ms–1s).
- `isRetryable(err)` = **true for `HaikuTimeoutError`** and for a `HaikuFailedError` whose `exitCode`/`stderr` is NOT a known-deterministic class (auth, ENOENT-equivalent); **false otherwise** — the field's transient-vs-deterministic discriminator, using the reasons 161.6a now captures.
- Wire into `dailyDistill` / `weeklyCurate` / lazy `compressSession` (ceiling-free). The SessionEnd-hook `compressSession` keeps its restore-on-failure → delegates the retry to the (now-retrying) lazy path; no in-hook retry (ceiling-safe).
- Reraise after exhaustion (the existing log + restore path handles the surfaced error).

## Reference (clones 2026-06-18, retry code read 2026-06-19)

- graphiti / Zep — <https://github.com/getzep/graphiti> (`graphiti_core/llm_client/client.py` tenacity `@retry(stop_after_attempt(4), wait_random_exponential, retry_if_exception(is_server_or_retry_error), reraise=True)`; `anthropic_client.py` RateLimit-retry-but-not-APIError)
- Letta — <https://github.com/letta-ai/letta> (`letta/agent.py` `_get_ai_reply` — ValueError=retryable / RuntimeError=not, `min(backoff_factor*2**(attempt-1), max_delay)`)
- mempalace — <https://github.com/MemPalace/mempalace> (`mempalace/closet_llm.py` — `for attempt in range(3)`, `2**attempt` backoff, 429/503/rate/JSONDecode)
- mem0 — <https://github.com/mem0ai/mem0> (delegates to the provider SDK's retry; no own loop)
- TencentDB — <https://github.com/TencentCloud/TencentDB-Agent-Memory> (`memory_tencentdb/client.py` — gateway-level timeout+retry)
- OpenHands — <https://github.com/OpenHands/software-agent-sdk> (`condenser/llm_summarizing_condenser.py` — shrink-on-retry, a DIFFERENT retry: token-window fit, not transient-failure)
- Relates: Task 161, D-174 (the inversion that made this a retry problem), D-175 (the retry decision this grounds), the [19-system buffer-compaction note](2026-06-18-session-buffer-compaction-under-latency-growth.md) (the same clones, input-bounding question), §8.5 (timeout/hook-ceiling composition — the kit-specific constraint the field doesn't have), D-79 (restore-on-failure — the hook path's existing delegated retry), D-42 (concurrent SessionEnd budget), 161.6a (the observability fix that makes the transient-vs-deterministic classification possible).
