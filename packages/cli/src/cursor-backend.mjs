// cursor-backend.mjs — the CursorAgentBackend (Task 200, D-270/D-274).
//
// The kit's LLM backend for a CURSOR-only user who never installed Claude Code.
// Routes the kit's "Haiku call" (compression / persona / temporal-sweep /
// auto-extract) through the user's OWN `cursor-agent`, authed by their existing
// Cursor SUBSCRIPTION login — NO `claude` binary, NO `ANTHROPIC_API_KEY`, and
// (per the D-274 live-verify) NO `CURSOR_API_KEY` for a normally-logged-in user
// (the key is only needed for headless-CI/no-browser environments).
//
// LIVE-VERIFIED on the user's real Windows machine (D-274/D-278,
// docs/research/2026-07-05-cross-agent-llm-backend-survey.md):
//   `agent -p --trust --model composer-2.5-fast --output-format text` reading the
//   prompt on STDIN → exit 0, a clean summary on STDOUT (no ANSI colors, no `> `
//   prompt marker — simpler than kiro-cli's output).
//
// THREE things the live-verify taught the build (D-278):
//   1. LATENCY — cursor-agent -p spins up the FULL agent loop even in print mode:
//      a real compression task took 60–83s (vs kiro-cli's ~1s). So this backend's
//      DEFAULT timeout is large (CURSOR_DEFAULT_TIMEOUT_MS, 150s), and callers on
//      the 60s SessionEnd hook ceiling must NOT run it synchronously — only the
//      ceiling-free/detached paths (daily-distill, lazy-compress) fit.
//   2. PROMPT VIA STDIN, not a positional — the multi-line `instructions\n\ninput`
//      positional read as a "workspace question" and the model asked for input
//      instead of doing the task. Piping the prompt on stdin (like the claude
//      backend) makes it DO the task, and also dodges the newline/quoting hazard
//      of a multi-line positional through spawnBin's Windows command string.
//   3. Two invariants shared with the other backends:
//      - THE RECURSION GUARD — CMK_BACKEND_SPAWN=1 in the child env so the inner
//        cursor-agent's fired hooks no-op at the dispatcher entry (agent-agnostic).
//      - WINDOWS `.cmd` SHIM — the native-Windows installer drops `agent.cmd`
//        under %LOCALAPPDATA%\cursor-agent\; a bare-name spawn won't resolve a
//        `.cmd` (the Claude `claude.cmd` class), so the default bin is `agent.cmd`
//        on win32. spawnBin builds the pre-quoted Windows command.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn as defaultSpawn } from 'node:child_process';
import { spawnBin } from './spawn-bin.mjs';
import {
  CompressorBackend,
  HaikuTimeoutError,
  HaikuFailedError,
  terminateSubprocess,
} from './compressor.mjs';

// The default cursor-agent binary. On Windows it's an `agent.cmd` shim under
// %LOCALAPPDATA%\cursor-agent\ (on the USER PATH); spawn('agent') won't resolve
// a bare name to `.cmd`, so default to `agent.cmd` on win32 (mirrors
// compressor.mjs's DEFAULT_CLAUDE_BIN → `claude.cmd`). Overridable for tests +
// odd installs.
const DEFAULT_CURSOR_BIN = process.platform === 'win32' ? 'agent.cmd' : 'agent';
// The cheap/fast model for the background role — Cursor's own Composer-fast, the
// Haiku-analog (D-274 live: the interactive default, cheapest tier). Overridable.
const DEFAULT_CURSOR_MODEL = 'composer-2.5-fast';

// cursor-agent -p runs the full agent loop even in print mode — a real
// compression task took 60–83s live (D-278). So when a caller passes no
// timeoutMs, default to a large ceiling-free-sized bound; a caller on the 60s
// SessionEnd hook ceiling must route this backend through a detached path.
const CURSOR_DEFAULT_TIMEOUT_MS = 150_000;

const BYTES_PER_TOKEN_ESTIMATE = 4;

export class CursorAgentBackend extends CompressorBackend {
  constructor({ cursorBin, model, spawnFn } = {}) {
    super();
    this._bin = cursorBin ?? DEFAULT_CURSOR_BIN;
    this._model = model ?? DEFAULT_CURSOR_MODEL;
    this._spawn = spawnFn ?? defaultSpawn;
  }

  modelId() {
    return this._model;
  }

  estimatedCostPerCall(inputBytes) {
    // Subscription-based, not per-token USD — a coarse positive estimate keeps
    // the CompressorBackend contract (callers only branch on >0). Scale loosely
    // by input size so the number is monotonic in work done.
    return Math.max(0.001, (inputBytes / 10000) * 0.001);
  }

  async compress({ input, maxOutputBytes, instructions, timeoutMs, killGraceMs } = {}) {
    if (typeof input !== 'string') {
      throw new Error('CursorAgentBackend.compress: input must be a string');
    }
    // The prompt is PIPED ON STDIN, not passed as a positional (D-278): the
    // multi-line `instructions\n\ninput` positional read as a "workspace question"
    // and the model asked for input instead of doing the task; stdin makes it DO
    // the task, and dodges the newline/quoting hazard of a multi-line positional
    // through spawnBin's Windows command string. Same posture as the claude
    // backend (preserves `$`/backtick/`<`/`>` verbatim — no shell reaches it).
    const promptBody = instructions ? `${instructions}\n\n${input}` : input;

    // cursor-agent -p is slow (60–83s live, D-278) — default to a large bound so
    // a caller that omits timeoutMs on a ceiling-free path doesn't false-timeout.
    const effectiveTimeoutMs =
      typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : CURSOR_DEFAULT_TIMEOUT_MS;

    const args = [
      '-p', // headless print mode (scripts / non-interactive; reads the prompt on stdin)
      '--trust', // trust the workspace without prompting — headless-only; dodges the `[a] Trust this workspace` prompt
      '--model',
      this._model,
      '--output-format',
      'text', // clean answer on stdout (no ANSI/`> ` marker)
    ];

    // THE RECURSION GUARD: CMK_BACKEND_SPAWN=1 so the inner cursor-agent's fired
    // hooks no-op at the dispatcher entry (agent-agnostic — the same guard the
    // KiroCliBackend uses). cursor-agent reads its own subscription login from
    // its stored tokens (no API key), so strip nothing else.
    const env = { ...process.env, CMK_BACKEND_SPAWN: '1' };

    // A throwaway cwd with no .cursor/ so no PROJECT hooks/rules are discovered
    // (belt-and-suspenders alongside the env guard). Mirrors the other backends
    // running in a fresh tmpdir.
    const sandbox = mkdtempSync(join(tmpdir(), 'cmk-cursor-'));

    const child = spawnBin(
      this._bin,
      args,
      { cwd: sandbox, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
      { spawnImpl: this._spawn },
    );

    const cleanup = () => {
      try { rmSync(sandbox, { recursive: true, force: true }); } catch { /* best-effort */ }
    };

    return await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timeoutTimer = null;

      const settleReject = (err) => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        cleanup();
        reject(err);
      };
      const settleResolve = (value) => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        cleanup();
        resolve(value);
      };

      // STDOUT carries the answer (clean with --output-format text); STDERR is
      // any diagnostic noise (kept only for the failure message).
      child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
      child.on('error', (err) => settleReject(err));
      child.on('close', (code) => {
        if (settled) return;
        if (code !== 0) {
          settleReject(
            new HaikuFailedError(
              `CursorAgentBackend: cursor-agent exit ${code}: ${stderr.trim() || '(no stderr)'}`,
              { exitCode: code, stderr: stderr.trim() },
            ),
          );
          return;
        }
        // Clean text output — just trim surrounding whitespace/newlines.
        const outputText = stdout.replace(/\r/g, '').trim();
        const trimmed =
          typeof maxOutputBytes === 'number' && Buffer.byteLength(outputText, 'utf8') > maxOutputBytes
            ? outputText.slice(0, maxOutputBytes)
            : outputText;
        settleResolve({
          outputText: trimmed,
          inputTokens: Math.ceil(Buffer.byteLength(promptBody, 'utf8') / BYTES_PER_TOKEN_ESTIMATE),
          outputTokens: Math.ceil(Buffer.byteLength(trimmed, 'utf8') / BYTES_PER_TOKEN_ESTIMATE),
          costUSD: this.estimatedCostPerCall(Buffer.byteLength(promptBody, 'utf8')),
          preservedIds: [],
        });
      });

      timeoutTimer = setTimeout(() => {
        if (settled) return;
        terminateSubprocess(child, { killGraceMs: killGraceMs ?? 2000 }).catch(() => {});
        settleReject(
          new HaikuTimeoutError(
            `CursorAgentBackend: cursor-agent did not return within ${effectiveTimeoutMs}ms`,
            { timeoutMs: effectiveTimeoutMs },
          ),
        );
      }, effectiveTimeoutMs);

      // cursor-agent -p reads the prompt on STDIN (D-278): write the body then
      // close, so any `$`/backtick/`<`/`>` survives verbatim (no shell reaches it).
      child.stdin.write(promptBody);
      child.stdin.end();
    });
  }
}
