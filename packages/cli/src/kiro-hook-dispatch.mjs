// kiro-hook-dispatch.mjs — the `cmk hook <event>` Kiro dispatcher (Task 50.J).
//
// ONE entrypoint that both Kiro hook surfaces (IDE .kiro.hook + CLI agent-config)
// call: `cmk hook <event>` with the Kiro hook payload on stdin. It fans out by
// event to the kit's EXISTING inject/capture logic (injectContext / captureTurn —
// the same cores the Claude-Code cmk-inject-context / cmk-capture-turn bins use),
// so memory logic is shared cross-agent and only the per-agent payload adapter
// differs.
//
// Kiro lifecycle events → kit operation:
//   agentSpawn               → inject  (runs once, cached whole-conversation = SessionStart)
//   promptSubmit /           → inject  (per-prompt recall). The IDE .kiro.hook surface
//     userPromptSubmit                  emits `promptSubmit`; the Amazon-Q/CLI Rust contract
//                                       names the same trigger `userPromptSubmit`. BOTH are
//                                       recognized so the dispatcher is vocabulary-agnostic
//                                       across the two hook surfaces (the I-1 composition fix:
//                                       the CLI agent-config currently wires only
//                                       agentSpawn+stop by design — inject-once is sufficient
//                                       since agentSpawn caches the whole-conversation inject —
//                                       but if a future CLI agent wires the contract's
//                                       userPromptSubmit trigger, it routes to inject, not no-op).
//   stop                     → capture (turn-end, the deterministic capture spine)
//   <anything else>          → no-op   (forward-compatible: a new Kiro event never crashes)
//
// CRITICAL INVARIANT: always exit 0. A non-zero exit from a Kiro hook can break
// the session (the PILOT caveat — aws-bash-hooks §6). Every error is caught,
// reported on stderr, and the exit code stays 0. Memory capture is best-effort;
// a failed capture must never take the user's Kiro session down with it.
//
// Public surface:
//   dispatchKiroHook({ event, payload, cwd, userDir?, deps }) →
//     { action: 'inject'|'capture'|'noop'|'error', exitCode: 0, stdout?, stderr? }
//   `deps.inject` / `deps.capture` are REQUIRED — this is a pure router. The
//   cmk-hook bin wires the real injectContext / captureTurn (top-level await
//   import); tests pass fakes. Keeping the router dep-free makes it trivially
//   testable and keeps the inject/capture cores out of the no-op event path.

// `promptSubmit` (IDE .kiro.hook) and `userPromptSubmit` (Amazon-Q Rust contract)
// are the SAME trigger under two surface vocabularies — both map to inject.
const INJECT_EVENTS = new Set(['agentSpawn', 'promptSubmit', 'userPromptSubmit']);
const CAPTURE_EVENTS = new Set(['stop']);
// 50.N.1 — the prompt-submit events that ALSO capture the prompt (the <private>
// -strip + transcript-append half of Claude Code's UserPromptSubmit). An explicit
// ALLOW-set (not "INJECT minus agentSpawn") so a future inject-only event added to
// INJECT_EVENTS never silently starts calling capturePrompt with no prompt.
const PROMPT_CAPTURE_EVENTS = new Set(['promptSubmit', 'userPromptSubmit']);
// preToolUse → the memory delete-guardrail (D-192). The ONE event that may exit
// NON-zero: a non-zero preToolUse exit BLOCKS the Kiro tool (verified — the same
// mechanism the always-exit-0 invariant exists for). The guard exits 2 ONLY on a
// deliberate block; everything else (incl. a crashed guard via the catch) exits 0.
const GUARD_EVENTS = new Set(['preToolUse']);

export function dispatchKiroHook({ event, payload = {}, cwd, userDir, deps = {} } = {}) {
  const { inject, capture, capturePrompt, guard } = deps;

  try {
    if (INJECT_EVENTS.has(event)) {
      // The prompt-submit events (promptSubmit / userPromptSubmit) do BOTH inject
      // (recall) AND capturePrompt — the <private>-strip + transcript-append half,
      // matching Claude Code's UserPromptSubmit (cmk-capture-prompt). agentSpawn is
      // inject-only (no prompt to capture). capturePrompt is BEST-EFFORT: a throw
      // must never break inject or the session (50.N.1). Older installs without
      // the dep skip it cleanly.
      if (PROMPT_CAPTURE_EVENTS.has(event) && typeof capturePrompt === 'function') {
        try {
          capturePrompt({ payload, projectRoot: cwd, ...(userDir ? { userDir } : {}) });
        } catch (err) {
          // swallow — capture is best-effort; inject below still runs.
          process.stderr.write(`cmk hook ${event}: capturePrompt failed: ${err?.message ?? err}\n`);
        }
      }
      const r = inject({ cwd, ...(userDir ? { userDir } : {}) });
      // injectContext returns the text to surface as context; print on stdout so
      // Kiro adds it to the agent's context (the runCommand→stdout→context path).
      const stdout = r && typeof r.text === 'string' ? r.text : '';
      return { action: 'inject', exitCode: 0, stdout };
    }
    if (CAPTURE_EVENTS.has(event)) {
      capture({ payload, projectRoot: cwd, ...(userDir ? { userDir } : {}) });
      return { action: 'capture', exitCode: 0 };
    }
    if (GUARD_EVENTS.has(event)) {
      // guard() inspects the about-to-run tool command (from the Kiro payload)
      // and returns { block, reason? }. A block → exit 2 (BLOCK the tool) with
      // the reason on stderr; otherwise exit 0 (allow). If guard is not wired
      // (older install), default to allow — fail-open, never block by accident.
      const v = guard ? guard({ payload, cwd }) : { block: false };
      if (v && v.block) {
        return { action: 'blocked', exitCode: 2, stderr: v.reason ?? 'blocked by the memory delete-guardrail' };
      }
      return { action: 'allow', exitCode: 0 };
    }
    // unknown / not-yet-handled event — no-op, forward-compatible.
    return { action: 'noop', exitCode: 0 };
  } catch (err) {
    // NEVER propagate — exit 0 with the error on stderr so the Kiro session lives.
    // (A CRASHED guard fails OPEN here: a broken guardrail must not wedge the tool.)
    return { action: 'error', exitCode: 0, stderr: `cmk hook ${event}: ${err?.message ?? err}` };
  }
}
