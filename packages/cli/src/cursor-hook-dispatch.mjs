// cursor-hook-dispatch.mjs — the `cmk cursor-hook` dispatcher (Task 196).
//
// ONE entrypoint every Cursor hook event calls: `cmk cursor-hook` with Cursor's
// JSON payload on stdin (the event name rides IN the payload as
// `hook_event_name` — no per-event argv needed). It fans out by event to the
// kit's EXISTING cores (injectContext / captureTurn / capturePrompt /
// observeEdit / decideGuard / session-end tasks — the same cores the Claude-Code
// bins and the Kiro dispatcher use), so memory logic is shared cross-agent and
// only the per-agent payload/response adapter differs (the D-180 seam).
//
// Cursor's hook protocol (cursor.com/docs/agent/hooks, primary-verified
// 2026-07-03): JSON over stdio in BOTH directions. Responses use Cursor's exact
// field names — these are load-bearing, a drifted key is a silent no-op:
//   sessionStart          → inject   → {additional_context: <snapshot>}
//   beforeSubmitPrompt    → capturePrompt → {continue: true}  (ALWAYS true —
//                            memory capture must never block the user's prompt)
//   afterAgentResponse    → capture  (payload.text = the assistant's final
//                            message — the turn-end capture spine; Cursor's
//                            `stop` payload is status-only, so this is the
//                            content-bearing event)              → no response
//   afterFileEdit         → observe  (file_path → a Write-class tool payload
//                            observeEdit's eligibility check recognizes)
//   sessionEnd            → session-end tasks (fire-and-forget)  → no response
//   beforeShellExecution  → guard (D-192 memory delete-guardrail)
//                            → {permission: 'allow'|'deny', agent_message?}
//   <anything else>       → no-op (forward-compatible: a new Cursor event never
//                            crashes)
//
// CRITICAL INVARIANTS:
//   - ALWAYS exit 0. Deny is expressed via the JSON `permission` field, never an
//     exit code (Cursor treats exit 2 as deny, but JSON carries the reason too).
//   - Permission-type events FAIL OPEN on a crash: a broken memory hook must
//     never block the user's prompt (beforeSubmitPrompt → continue:true) or
//     shell command (beforeShellExecution → permission:allow).
//
// Public surface:
//   dispatchCursorHook({ event, payload, cwd, userDir?, deps }) →
//     { action, exitCode: 0, stdout?, stderr? }
//   `deps` are REQUIRED cores — this is a pure router (tests pass fakes; the
//   `cmk cursor-hook` subcommand wires the real ones). A missing dep is a clean
//   no-op (older install), never a crash.

export function dispatchCursorHook({ event, payload = {}, cwd, userDir, deps = {} } = {}) {
  const { inject, capture, capturePrompt, observe, guard, sessionEnd } = deps;
  const tierArgs = { ...(userDir ? { userDir } : {}) };

  try {
    if (event === 'sessionStart') {
      if (typeof inject !== 'function') return { action: 'noop', exitCode: 0 };
      const r = inject({ cwd, ...tierArgs });
      const text = r && typeof r.text === 'string' ? r.text : '';
      const resp = text ? { additional_context: text } : {};
      return { action: 'inject', exitCode: 0, stdout: JSON.stringify(resp) };
    }

    if (event === 'beforeSubmitPrompt') {
      if (typeof capturePrompt === 'function') {
        try {
          capturePrompt({ payload, projectRoot: cwd, ...tierArgs });
        } catch (err) {
          // fail open — the response below still lets the prompt through.
          return {
            action: 'capture-prompt',
            exitCode: 0,
            stdout: JSON.stringify({ continue: true }),
            stderr: `cmk cursor-hook ${event}: ${err?.message ?? err}`,
          };
        }
      }
      return { action: 'capture-prompt', exitCode: 0, stdout: JSON.stringify({ continue: true }) };
    }

    if (event === 'afterAgentResponse') {
      if (typeof capture !== 'function') return { action: 'noop', exitCode: 0 };
      const assistantText = typeof payload.text === 'string' ? payload.text : '';
      capture({
        payload: { assistant_message: assistantText },
        projectRoot: cwd,
        ...tierArgs,
      });
      return { action: 'capture', exitCode: 0 };
    }

    if (event === 'afterFileEdit') {
      if (typeof observe !== 'function') return { action: 'noop', exitCode: 0 };
      // Adapt Cursor's {file_path, edits[]} to the Write-class tool payload
      // observeEdit's eligibility check recognizes (same move as Kiro's
      // fs_write → Write map). observeEdit sizes the edit by line-counting
      // `tool_response.content` — Cursor has no such field, so we synthesize
      // it from the edits' new_strings. WITHOUT this the content is '' → 0
      // lines → the leg no-ops on EVERY Cursor edit (the "wired-but-dead"
      // class, skill-review #1 — the same shape as D-269). Join with newlines
      // so the eligibility line-count reflects the real edit size.
      const editedContent = Array.isArray(payload.edits)
        ? payload.edits
            .map((e) => (e && typeof e.new_string === 'string' ? e.new_string : ''))
            .join('\n')
        : '';
      observe({
        payload: {
          tool_name: 'Edit',
          tool_input: { file_path: payload.file_path },
          tool_response: { content: editedContent },
        },
        projectRoot: cwd,
        ...tierArgs,
      });
      return { action: 'observe', exitCode: 0 };
    }

    if (event === 'sessionEnd') {
      if (typeof sessionEnd !== 'function') return { action: 'noop', exitCode: 0 };
      // The session-end tasks (compress + persona) are ASYNC and heavy. The
      // dispatcher stays a sync router: it starts the work and hands the
      // promise back as `pending` — the bin layer awaits it so the process
      // doesn't exit under the running tasks. A sync throw is caught below;
      // an async rejection is the awaiter's to swallow (fail-open there too).
      const pending = sessionEnd({ payload, projectRoot: cwd, ...tierArgs });
      return { action: 'session-end', exitCode: 0, ...(pending ? { pending } : {}) };
    }

    if (event === 'beforeShellExecution') {
      // The memory delete-guardrail (D-192). A crashed guard fails OPEN via the
      // outer catch (allow) — a broken guardrail must not block the shell.
      const v = typeof guard === 'function' ? guard({ payload, cwd }) : { block: false };
      if (v && v.block) {
        return {
          action: 'blocked',
          exitCode: 0,
          stdout: JSON.stringify({
            permission: 'deny',
            agent_message: v.reason ?? 'blocked by the claude-memory-kit delete-guardrail',
          }),
        };
      }
      return { action: 'allow', exitCode: 0, stdout: JSON.stringify({ permission: 'allow' }) };
    }

    // unknown / future event — no-op, forward-compatible.
    return { action: 'noop', exitCode: 0 };
  } catch (err) {
    // NEVER propagate — exit 0 with the error on stderr so the Cursor session
    // lives. Permission-type events emit their fail-OPEN response.
    const stderr = `cmk cursor-hook ${event}: ${err?.message ?? err}`;
    if (event === 'beforeShellExecution') {
      return { action: 'error', exitCode: 0, stdout: JSON.stringify({ permission: 'allow' }), stderr };
    }
    if (event === 'beforeSubmitPrompt') {
      return { action: 'error', exitCode: 0, stdout: JSON.stringify({ continue: true }), stderr };
    }
    return { action: 'error', exitCode: 0, stderr };
  }
}
