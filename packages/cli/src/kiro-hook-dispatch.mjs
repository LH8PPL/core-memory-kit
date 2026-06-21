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
//   agentSpawn     → inject  (runs once, cached whole-conversation = SessionStart)
//   promptSubmit   → inject  (per-prompt recall)
//   stop           → capture (turn-end, the deterministic capture spine)
//   <anything else>→ no-op   (forward-compatible: a new Kiro event never crashes)
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

const INJECT_EVENTS = new Set(['agentSpawn', 'promptSubmit']);
const CAPTURE_EVENTS = new Set(['stop']);

export function dispatchKiroHook({ event, payload = {}, cwd, userDir, deps = {} } = {}) {
  const { inject, capture } = deps;

  try {
    if (INJECT_EVENTS.has(event)) {
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
    // unknown / not-yet-handled event — no-op, forward-compatible.
    return { action: 'noop', exitCode: 0 };
  } catch (err) {
    // NEVER propagate — exit 0 with the error on stderr so the Kiro session lives.
    return { action: 'error', exitCode: 0, stderr: `cmk hook ${event}: ${err?.message ?? err}` };
  }
}
