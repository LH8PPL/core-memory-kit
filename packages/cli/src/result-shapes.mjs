// Canonical result-shape conventions for cmk public boundaries.
//
// Per the Layer-2 review's I3 finding, `errorCategory` was tagged inconsistently
// across the four modules: writeFact set it; forget never did; mergeFacts set it
// only for input validation. A consumer doing `if (r.errorCategory === 'schema')`
// branched correctly for some failures and missed others. This module pins down
// the enum + provides helpers so error returns are uniform.
//
// Public surface:
//   ERROR_CATEGORIES — frozen enum of errorCategory values
//   ACTION_TYPES     — frozen enum of action values
//   errorResult({category, errors, ...rest}) → canonical error result object
//   notFoundResult({errors, ...rest}) → canonical not-found result object
//
// The canonical result shape for write-side boundaries is:
//   { action: enum, id?, path?, errorCategory?, errors?, ...extras }
// Where action is the discriminator. errorCategory + errors only appear when
// action === 'error'. See CLAUDE.md "Shared modules" + design §1.3.

export const ERROR_CATEGORIES = Object.freeze({
  // Input shape wrong — a validation rule was violated. Caller passed bad
  // arguments. Most validateOptions failures use this.
  SCHEMA: 'schema',

  // Runtime constraint violated. The arguments looked valid but the operation
  // can't proceed without corrupting existing state. Examples:
  //   - mergeFacts: merged body would dedup against an unrelated existing fact
  //   - writeFact: same path exists with a different id (would overwrite)
  COLLISION: 'collision',

  // Lookup failed at runtime. Used by callers that distinguish "I couldn't
  // find what you asked for" from "your input was wrong" — typically pairs
  // with action: 'not-found' for the cleanest UX, but errorCategory: 'not-found'
  // is available for write-side boundaries that need to report missing
  // referenced ids without a discriminator change.
  NOT_FOUND: 'not-found',

  // Another writer holds a lock; retry later. Used by the auto-extract
  // subagent (Task 23) when a prior invocation still holds the
  // context/.locks/auto-extract.lock file.
  CONCURRENT_RUN: 'concurrent_run',

  // A scratchpad write would push the file past its configured cap even
  // after consolidation (Task 12, design §2.1). Caller chose not to
  // forcibly truncate; the write is rejected so no silent data loss.
  CAP_EXCEEDED: 'cap_exceeded',

  // --- Auto-extract / hook entrypoint validation (Task 23) -----------
  // These pair with handlers that ALWAYS exit 0 (a crashed hook is
  // worse than a missing capture). The category surfaces in
  // sessions/{date}.extract.log so analytics can track failure modes.

  // The caller did not pass `projectRoot`. Programmer error in the
  // bin wrapper; ships as a guard against misuse.
  MISSING_PROJECT_ROOT: 'missing_project_root',

  // No CompressorBackend implementation was passed. Same shape as
  // above — guards a programmer error.
  MISSING_BACKEND: 'missing_backend',

  // The expected turn buffer file (Task 21 wrote it under
  // transcripts/.extract-*.tmp) doesn't exist by the time auto-extract
  // gets scheduled. Could be a race with Task 21's writeFileSync, or
  // a manual cleanup of stale temp files.
  MISSING_TURN: 'missing_turn',

  // The CompressorBackend's compress() rejected. For
  // HaikuViaAnthropicApi this means the `claude --print` subprocess
  // exited non-zero or the spawn itself failed. HAIKU_TIMEOUT
  // (below) is the disambiguated case for "took too long" vs.
  // "exited unhealthy"; analytics treat them differently.
  HAIKU_FAILED: 'haiku_failed',

  // CompressorBackend.compress() exceeded the caller-supplied
  // timeoutMs (design §8.5). The subprocess was killed by the
  // SIGTERM → grace → SIGKILL escalation in terminateSubprocess.
  // Auto-extract passes timeoutMs=25_000 (under 30s Stop hook
  // ceiling); compress-session passes 50_000 (under 60s SessionEnd
  // ceiling). The inner timeout exists so the catch + finally +
  // log-write all run BEFORE the outer hook ceiling kills the
  // parent — without it, a hung Haiku call would leak the
  // auto-extract.lock file and skip the NDJSON log entry.
  // Distinct from HAIKU_FAILED so analytics can separate "the API
  // is slow today" from "the API rejected our call".
  HAIKU_TIMEOUT: 'haiku_timeout',

  // SessionEnd compression (Task 22) — the CompressorBackend's
  // compress() rejected when called with the §8.4 compression
  // prompt against sessions/now.md. Disambiguates from
  // HAIKU_FAILED in extract.log so analytics can separate
  // extraction failures from compression failures (same root cause
  // — the `claude` subprocess — but the call sites have different
  // recovery semantics: extract is best-effort, compression
  // leaves now.md intact for the next attempt).
  COMPRESS_FAILED: 'compress_failed',

  // Poison_Guard rejection (Task 24, design §6.7) — the pre-write
  // regex filter matched a secret/injection pattern. memoryWrite()
  // returns this category and the matched pattern_id surfaces in
  // .locks/poison-guard.log (NDJSON, redacted) so audits can track
  // frequency without exposing the cleartext that triggered the
  // rejection. Pairs with POISON_GUARD_CATEGORIES from
  // poison-guard.mjs for routing analytics.
  POISON_GUARD: 'poison_guard',

  // `cmk search` requested --mode=semantic or --mode=hybrid but the
  // Layer 5b memsearch+Milvus install isn't present (Task 30, design
  // §9.3). Pairs with `process.exitCode = 2` in subcommands.mjs per
  // tasks.md 30.2's explicit "exit 2 when not installed" contract.
  // NO silent fallback to keyword — the user asked for semantic,
  // and the surface should fail-loud so they know what's missing.
  SEMANTIC_UNAVAILABLE: 'semantic_unavailable',
});

export const ACTION_TYPES = Object.freeze({
  CREATED: 'created',
  SKIPPED: 'skipped',
  TOMBSTONED: 'tombstoned',
  MERGED: 'merged',
  ERROR: 'error',
  CANCELLED: 'cancelled',
  NOT_FOUND: 'not-found',
});

const VALID_CATEGORIES = new Set(Object.values(ERROR_CATEGORIES));

export function errorResult({ category, errors, ...rest }) {
  if (!VALID_CATEGORIES.has(category)) {
    throw new Error(
      `errorResult: invalid category ${JSON.stringify(category)}. Must be one of: ${[
        ...VALID_CATEGORIES,
      ].join(', ')}`,
    );
  }
  if (!Array.isArray(errors) || errors.length === 0) {
    throw new Error('errorResult: errors must be a non-empty array');
  }
  return {
    action: 'error',
    errorCategory: category,
    errors,
    ...rest,
  };
}

export function notFoundResult({ errors, ...rest }) {
  if (!Array.isArray(errors) || errors.length === 0) {
    throw new Error('notFoundResult: errors must be a non-empty array');
  }
  return {
    action: 'not-found',
    errors,
    ...rest,
  };
}
