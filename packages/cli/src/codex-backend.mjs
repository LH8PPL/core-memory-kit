// codex-backend.mjs — the CodexExecBackend (Task 196 tail; the Task-200 seam).
//
// The kit's LLM backend for a CODEX-only user who never installed Claude Code.
// Routes the kit's "Haiku call" (compression / persona / temporal-sweep /
// auto-extract) through the user's OWN `codex exec`, authed by their existing
// ChatGPT/Codex login — NO `claude` binary, NO `ANTHROPIC_API_KEY`.
//
// LIVE-VERIFIED on the maintainer's real Windows machine, codex-cli 0.142.5
// (2026-07-12, docs/research/2026-07-12-codex-adapter-surfaces.md):
//   `codex exec --skip-git-repo-check -s read-only --json -` reading the prompt
//   on STDIN (`-`) → exit 0, a JSONL event stream on stdout ending in
//   `{"type":"item.completed","item":{"type":"agent_message","text":"…"}}`.
//   A tiny prompt round-trips in ~5s (much faster than cursor-agent's 60–83s).
//
// Flag rationale (each probed live):
//   --skip-git-repo-check  the throwaway sandbox cwd is not a git repo; without
//                          this codex refuses to run there.
//   -s read-only           the kit's calls are pure text transforms — the codex
//                          child must never execute model-generated commands
//                          (safety + speed; also avoids approval prompts).
//   --json                 deterministic machine output: parse the LAST
//                          item.completed agent_message from the event stream
//                          (chosen over --output-last-message FILE — no file
//                          plumbing through the sandbox; same shape family the
//                          rollout reader already speaks).
//   `-` (stdin prompt)     the D-278/D-280 posture shared by all backends —
//                          multi-line prompts survive verbatim, no Windows
//                          quoting hazard.
//   (no --model)           the user's configured default model runs the call;
//                          overridable via the ctor for tests/tuning.
//
// Shared invariants (spawnBackendCall): the CMK_BACKEND_SPAWN recursion guard
// (the inner codex would fire `.codex/hooks.json` → `cmk codex-hook` again) +
// the throwaway no-config sandbox cwd + the spawn→settle→timeout→cleanup dance.

import { spawn as defaultSpawn } from 'node:child_process';
import { CompressorBackend, spawnBackendCall } from './compressor.mjs';

// npm installs codex as a `.cmd` shim on Windows (the D-274 / claude.cmd class);
// a bare-name spawn won't resolve it. Overridable for tests + odd installs
// (e.g. the Codex DESKTOP app bundles codex.exe off-PATH — pass codexBin).
const DEFAULT_CODEX_BIN = process.platform === 'win32' ? 'codex.cmd' : 'codex';

// Live: a small call round-trips in ~5s, but a real compression input is bigger
// and model queues vary — default to the ceiling-free-sized bound the other
// agent backends use headroom-wise. Callers on the 60s SessionEnd hook ceiling
// pass their own tighter timeoutMs (the D-92/F-2 composition rule).
const CODEX_DEFAULT_TIMEOUT_MS = 120_000;

export class CodexExecBackend extends CompressorBackend {
  constructor({ codexBin, model, spawnFn } = {}) {
    super();
    this._bin = codexBin ?? DEFAULT_CODEX_BIN;
    this._model = model; // undefined → the user's configured default model
    this._spawn = spawnFn ?? defaultSpawn;
  }

  modelId() {
    return this._model ?? 'codex-default';
  }

  estimatedCostPerCall(inputBytes) {
    // Subscription-based, not per-token USD — a coarse positive estimate keeps
    // the CompressorBackend contract (callers only branch on >0).
    return Math.max(0.001, (inputBytes / 10000) * 0.001);
  }

  async compress({ input, maxOutputBytes, instructions, timeoutMs, killGraceMs } = {}) {
    if (typeof input !== 'string') {
      throw new Error('CodexExecBackend.compress: input must be a string');
    }
    const promptBody = instructions ? `${instructions}\n\n${input}` : input;
    const effectiveTimeoutMs =
      typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : CODEX_DEFAULT_TIMEOUT_MS;

    const args = [
      'exec',
      '--skip-git-repo-check',
      '-s',
      'read-only',
      '--json',
      ...(this._model ? ['--model', this._model] : []),
      '-', // read the prompt on stdin
    ];

    return spawnBackendCall({
      bin: this._bin,
      args,
      promptBody,
      sandboxPrefix: 'cmk-codex-',
      label: 'CodexExecBackend: codex exec',
      parseStdout: parseCodexJsonStream,
      timeoutMs: effectiveTimeoutMs,
      killGraceMs,
      maxOutputBytes,
      costUSD: this.estimatedCostPerCall(Buffer.byteLength(promptBody, 'utf8')),
      spawnImpl: this._spawn,
    });
  }
}

// Parse the `codex exec --json` JSONL event stream: the answer is the LAST
// `item.completed` whose item is an `agent_message` (live-verified shape:
// {"type":"item.completed","item":{"id":"…","type":"agent_message","text":"…"}}).
// Non-JSON lines and other event types are skipped — a format drift degrades to
// '' (the caller's empty-output handling), never a crash.
export function parseCodexJsonStream(stdout) {
  if (typeof stdout !== 'string' || stdout.length === 0) return '';
  let text = '';
  for (const line of stdout.split('\n')) {
    const trimmed = line.replace(/\r$/, '').trim();
    if (!trimmed || trimmed[0] !== '{') continue;
    let evt;
    try {
      evt = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (evt?.type === 'item.completed' && evt.item?.type === 'agent_message'
        && typeof evt.item.text === 'string') {
      text = evt.item.text;
    }
  }
  return text.trim();
}
