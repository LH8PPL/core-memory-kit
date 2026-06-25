// kiro-hook-bin.mjs — the Kiro hook ADAPTER (Task 50.J/50.L).
//
// Bridges Kiro's runCommand hook input model to the kit's inject/capture cores.
// Kiro's model (LIVE-VERIFIED via probe, P-CJYGTQYR — and there is NO published
// runCommand prior art; every real Kiro hook is askAgent, so the probe is ground
// truth):
//   - EVENT  → argv          (`cmk hook stop` → argv[0] = 'stop')
//   - PROJECT→ process.cwd()  (Kiro runs the hook in the project root)
//   - PROMPT → process.env.USER_PROMPT  (set on promptSubmit; empty on stop)
//   - TURN   → Kiro's transcript file (.history), NOT a stdin payload
//   - TOOL   → (preToolUse) the about-to-run tool command; passed via env/argv
//             (exact field flagged for the cut-gate-kiro live test, D-192)
//
// This is the per-agent adapter the cross-agent seam needs: Claude Code reads a
// stdin JSON payload; Kiro reads argv+env+cwd+transcript. The dispatcher (50.J)
// owns the routing + the always-exit-0 invariant; this adapter owns the
// input translation. `deps` is the injection seam (tests pass fakes; the bin
// wires the real readKiroTurn / injectContext / captureTurn).
//
// Public surface:
//   runKiroHook({ argv, cwd, env, deps }) → { action, exitCode: 0, stdout?, stderr? }

import { dispatchKiroHook } from './kiro-hook-dispatch.mjs';

// 50.N.2 — Kiro's file-write tool names → Claude's PostToolUse-eligible names, so
// the shared observeEdit core (keyed on Write/Edit/MultiEdit) recognizes a Kiro
// file edit. `fs_write` is Kiro's create-or-edit-a-file tool (kiro.dev tool list);
// it covers both the create + edit cases, mapping to Claude's Write/Edit class
// (observeEdit treats Write/Edit/MultiEdit identically — the target name only
// appears in the summary line, so the map is behavior-neutral).
// NOTE: if a real kiro-cli turns out to have a SEPARATE append/patch tool (e.g.
// `fs_append`), add it here AND to the agent-config `matcher` (today scoped to the
// literal `fs_write`). Flagged for the cut-gate to confirm `fs_write` is the only
// file-mutation tool — no Kiro tool enumeration is captured in the research yet.
const KIRO_EDIT_TOOL_MAP = Object.freeze({
  fs_write: 'Write',
  fsWrite: 'Write', // camelCase spelling tolerance
});

export function runKiroHook({ argv = [], cwd = process.cwd(), env = process.env, payload = {}, deps = {} } = {}) {
  const event = argv[0];
  const { readKiroTurn, inject, capture, capturePrompt, observe, guard } = deps;

  // Wrap the kit cores so the dispatcher's generic inject/capture contract is fed
  // Kiro's actual inputs.
  const wrappedInject = (args) => inject({ ...args, userPrompt: env.USER_PROMPT || '' });

  const wrappedCapture = (args) => {
    // Kiro has no stdin payload — read the turn from Kiro's transcript instead,
    // then build the {assistant_message} payload captureTurn's extractTurnText
    // understands. A failed read must NOT crash (dispatcher catches + exits 0).
    const turn = readKiroTurn({ projectRoot: args.projectRoot, env }) || {};
    const payload = {
      assistant_message: turn.assistantText || '',
      // carry the user prompt too (capture-prompt pairing analog)
      ...(turn.userText ? { user_message: turn.userText } : {}),
    };
    return capture({ ...args, payload });
  };

  // 50.N.1 — prompt-capture on the prompt-submit events. The prompt text comes
  // from the stdin payload (kiro-cli `userPromptSubmit` carries `prompt`) OR env
  // USER_PROMPT (the IDE legacy surface). capturePrompt reads `payload.prompt`,
  // so build a payload that carries whichever is present.
  const wrappedCapturePrompt = capturePrompt
    ? (args) => {
        const prompt =
          (payload && typeof payload.prompt === 'string' && payload.prompt) ||
          env.USER_PROMPT ||
          '';
        return capturePrompt({ ...args, payload: { ...payload, prompt } });
      }
    : undefined;

  // 50.N.2 — observe-edit on postToolUse. Kiro's file-write tool is `fs_write`
  // (not Claude's Write/Edit/MultiEdit), so map the Kiro tool name to an eligible
  // one before observeEdit's eligibility check. observeEdit's path-extractor
  // already probes `path` (which Kiro's fs_write tool_input uses) alongside
  // file_path/filePath. The stdin payload (postToolUse → {tool_name, tool_input,
  // tool_response}) carries everything observeEdit needs.
  const wrappedObserve = observe
    ? (args) => {
        const mapped = KIRO_EDIT_TOOL_MAP[payload?.tool_name] ?? payload?.tool_name;
        return observe({ ...args, payload: { ...payload, tool_name: mapped } });
      }
    : undefined;

  // preToolUse guard (forward-compat path — the production Kiro install calls the
  // cmk-guard-memory bin directly, which reads the stdin payload). If a guard dep
  // is wired, pass the stdin payload through so it can read tool_input.command.
  const wrappedGuard = guard ? (args) => guard({ ...args, payload }) : undefined;

  return dispatchKiroHook({
    event,
    payload,
    cwd,
    deps: {
      inject: wrappedInject,
      capture: wrappedCapture,
      ...(wrappedCapturePrompt ? { capturePrompt: wrappedCapturePrompt } : {}),
      ...(wrappedObserve ? { observe: wrappedObserve } : {}),
      ...(wrappedGuard ? { guard: wrappedGuard } : {}),
    },
  });
}
