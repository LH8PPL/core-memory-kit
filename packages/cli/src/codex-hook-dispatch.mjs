// codex-hook-dispatch.mjs — the `cmk codex-hook` dispatcher (Task 196, Codex leg).
//
// ONE entrypoint every Codex hook event calls: `cmk codex-hook` with Codex's
// JSON payload on stdin (the event rides in the payload as `hook_event_name` —
// no per-event argv). It fans out by event to the kit's EXISTING cores
// (injectContext / captureTurn / capturePrompt / observeEdit / decideGuard —
// the same cores the Claude-Code bins and the Kiro/Cursor dispatchers use), so
// memory logic is shared cross-agent and only the payload/response adapter
// differs (the D-180 seam).
//
// Codex's hook protocol (learn.chatgpt.com/docs/hooks, primary-verified
// 2026-07-12 + live-probed on codex-cli 0.142.5 — the research note
// docs/research/2026-07-12-codex-adapter-surfaces.md): JSON over stdio; the
// response envelope is Claude-Code-SHAPED. Exact field names are load-bearing —
// a drifted key is a silent no-op:
//   SessionStart     → inject  → {hookSpecificOutput: {hookEventName:
//                       'SessionStart', additionalContext: <snapshot>}}
//   UserPromptSubmit → capturePrompt → NO decision field ever (a memory hook
//                       must never block the user's prompt)
//   Stop             → capture (the turn is READ FROM payload.transcript_path —
//                       Codex's Stop payload is status-only, but every payload
//                       carries the rollout path; readCodexTurn extracts the
//                       last user/agent messages)          → no response
//   PostToolUse      → observe (apply_patch/Edit/Write → the Write-class tool
//                       payload observeEdit's eligibility check recognizes)
//   PreToolUse       → guard (D-192 memory delete-guardrail) →
//                       {hookSpecificOutput: {hookEventName: 'PreToolUse',
//                        permissionDecision: 'deny', permissionDecisionReason}}
//   <anything else>  → no-op (forward-compatible: PreCompact/SubagentStop/a new
//                       Codex event never crashes)
//
// NOTE: Codex has NO SessionEnd event (verified — the event list ends at Stop/
// SubagentStop), so the sessionEnd compression leg rides the lazy/cron paths on
// Codex installs, exactly like Kiro.
//
// CRITICAL INVARIANTS (shared with the Cursor dispatcher):
//   - ALWAYS exit 0. Deny is expressed via the JSON envelope, never an exit code.
//   - Permission-type events FAIL OPEN on a crash: a broken memory hook must
//     never block the user's prompt (UserPromptSubmit) or tool call (PreToolUse).
//   - CMK_BACKEND_SPAWN no-ops everything at the entry (Task 200 recursion
//     guard — the CodexExecBackend's inner `codex exec` fires these hooks again).
//
// Public surface:
//   dispatchCodexHook({ event, payload, cwd, userDir?, deps, env? }) →
//     { action, exitCode: 0, stdout?, stderr? }
//   `deps` are REQUIRED cores — this is a pure router (tests pass fakes; the
//   `cmk codex-hook` subcommand wires the real ones). A missing dep is a clean
//   no-op (older install), never a crash.

import { readCodexTurn } from './codex-transcript.mjs';

function envelope(hookEventName, fields) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName, ...fields } });
}

export function dispatchCodexHook({ event, payload = {}, cwd, userDir, deps = {}, env = process.env } = {}) {
  const { inject, capture, capturePrompt, observe, guard } = deps;
  const tierArgs = { ...(userDir ? { userDir } : {}) };

  // Task 200 (D-270): the recursion guard — see cursor-hook-dispatch.mjs for the
  // live-reproduced storm this prevents. One check at the entry breaks every
  // routing vector.
  if (env && env.CMK_BACKEND_SPAWN) {
    return { action: 'noop', exitCode: 0 };
  }

  try {
    if (event === 'SessionStart') {
      if (typeof inject !== 'function') return { action: 'noop', exitCode: 0 };
      const r = inject({ cwd, ...tierArgs });
      const text = r && typeof r.text === 'string' ? r.text : '';
      if (!text) return { action: 'inject', exitCode: 0 };
      return {
        action: 'inject',
        exitCode: 0,
        stdout: envelope('SessionStart', { additionalContext: text }),
      };
    }

    if (event === 'UserPromptSubmit') {
      if (typeof capturePrompt === 'function') {
        try {
          capturePrompt({ payload, projectRoot: cwd, ...tierArgs });
        } catch (err) {
          // fail open — never emit a decision field; the prompt goes through.
          return {
            action: 'capture-prompt',
            exitCode: 0,
            stderr: `cmk codex-hook ${event}: ${err?.message ?? err}`,
          };
        }
      }
      return { action: 'capture-prompt', exitCode: 0 };
    }

    if (event === 'Stop') {
      if (typeof capture !== 'function') return { action: 'noop', exitCode: 0 };
      // Codex's Stop payload is status-only; the turn content lives in the
      // rollout file the payload points at. readCodexTurn never throws.
      const turn = readCodexTurn(payload.transcript_path);
      capture({
        payload: {
          // user_message is captureTurn's contract field (capture-turn.mjs:427
          // — the Kiro Stop hook uses the same key). The first draft sent
          // `user_prompt`, a dead key captureTurn never reads — the exact
          // D-269/P-TQSG9PCA wired-but-dead class (skill-review Blocking #1).
          ...(turn.userText ? { user_message: turn.userText } : {}),
          assistant_message: turn.assistantText,
        },
        projectRoot: cwd,
        ...tierArgs,
      });
      return { action: 'capture', exitCode: 0 };
    }

    if (event === 'PostToolUse') {
      if (typeof observe !== 'function') return { action: 'noop', exitCode: 0 };
      // Adapt Codex's edit tools (canonical tool_name `apply_patch`; matchers
      // also accept Edit/Write) to the Write-class payload observeEdit's
      // eligibility check recognizes. tool_response.content must survive so the
      // line-count eligibility isn't 0 (the D-269 "wired-but-dead" class).
      const content = typeof payload?.tool_response?.content === 'string'
        ? payload.tool_response.content
        : '';
      observe({
        payload: {
          tool_name: 'Edit',
          tool_input: { file_path: payload?.tool_input?.file_path },
          tool_response: { content },
        },
        projectRoot: cwd,
        ...tierArgs,
      });
      return { action: 'observe', exitCode: 0 };
    }

    if (event === 'PreToolUse') {
      // The memory delete-guardrail (D-192). A crashed guard fails OPEN via the
      // outer catch — a broken guardrail must not block the tool call.
      const v = typeof guard === 'function' ? guard({ payload, cwd }) : { block: false };
      if (v && v.block) {
        return {
          action: 'blocked',
          exitCode: 0,
          stdout: envelope('PreToolUse', {
            permissionDecision: 'deny',
            permissionDecisionReason:
              v.reason ?? 'blocked by the claude-memory-kit delete-guardrail',
          }),
        };
      }
      return { action: 'allow', exitCode: 0 };
    }

    // unknown / future event (PreCompact, SubagentStop, …) — no-op.
    return { action: 'noop', exitCode: 0 };
  } catch (err) {
    // NEVER propagate — exit 0 with the error on stderr so the Codex session
    // lives. Permission-type events fail OPEN by emitting NO deny envelope.
    const stderr = `cmk codex-hook ${event}: ${err?.message ?? err}`;
    return { action: 'error', exitCode: 0, stderr };
  }
}
