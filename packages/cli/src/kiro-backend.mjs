// kiro-backend.mjs — the KiroCliBackend (Task 200, D-270).
//
// The kit's LLM backend for a KIRO-only user who never installed Claude Code.
// Routes the kit's "Haiku call" (compression / persona / temporal-sweep /
// auto-extract) through the user's OWN `kiro-cli chat`, authed by their existing
// Kiro/Google login — NO `claude` binary, NO `ANTHROPIC_API_KEY`.
//
// LIVE-CONFIRMED on the installed kiro-cli (docs/research/2026-07-04-agent-
// relative-llm-backend.md): `kiro-cli chat --no-interactive --model
// claude-haiku-4.5 --trust-tools= "<prompt>"` returns the answer on STDOUT
// (0.01 credits / ~1 s), the interactive TUI noise (spinners, hook-status,
// credits footer) goes to STDERR. The answer is prefixed with a `> ` prompt
// marker + ANSI color codes → strip ANSI, strip the leading `> `.
//
// Two invariants this backend carries that the claude-cli backend doesn't need:
//   1. THE RECURSION GUARD — kiro-cli fires the kit's OWN hooks; spawning it
//      from inside a Kiro hook would recurse (reproduced live: agentSpawn →
//      10s timeout storm). We set CMK_BACKEND_SPAWN=1 in the child env; the
//      dispatchers (kiro-hook-dispatch / cursor-hook-dispatch) no-op on it.
//   2. STDOUT-ONLY PARSE — the answer is on stdout; stderr is TUI noise we drop.

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

// The default kiro-cli binary. On Windows it's an .exe under LocalAppData; the
// resolution mirrors the claude-cli backend's DEFAULT_CLAUDE_BIN pattern — a
// bare name resolved on PATH, overridable via the constructor for tests + odd
// installs. (kiro-cli installs itself on PATH, so the bare name usually works.)
const DEFAULT_KIRO_BIN = 'kiro-cli';
// The cheap/fast model for the background role (live: 0.40x credits). Overridable.
const DEFAULT_KIRO_MODEL = 'claude-haiku-4.5';

const BYTES_PER_TOKEN_ESTIMATE = 4;

// Strip ANSI escape sequences (colors, cursor moves) + the leading `> ` prompt
// marker kiro-cli prints before the answer. Only the FIRST `> ` is the marker;
// a `> ` inside the body (e.g. a quoted line) is left alone.
function parseKiroStdout(raw) {
  // eslint-disable-next-line no-control-regex
  const noAnsi = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b[<>=]/g, '');
  const trimmed = noAnsi.replace(/\r/g, '').trim();
  return trimmed.startsWith('> ') ? trimmed.slice(2) : trimmed;
}

export class KiroCliBackend extends CompressorBackend {
  constructor({ kiroBin, model, spawnFn } = {}) {
    super();
    this._bin = kiroBin ?? DEFAULT_KIRO_BIN;
    this._model = model ?? DEFAULT_KIRO_MODEL;
    this._spawn = spawnFn ?? defaultSpawn;
  }

  modelId() {
    return this._model;
  }

  estimatedCostPerCall(inputBytes) {
    // Credit-based, not USD — a coarse positive estimate keeps the
    // CompressorBackend contract (callers only branch on >0). Live: a small
    // call was 0.01 credits; scale loosely by input size.
    return Math.max(0.01, (inputBytes / 10000) * 0.01);
  }

  async compress({ input, maxOutputBytes, instructions, timeoutMs, killGraceMs } = {}) {
    if (typeof input !== 'string') {
      throw new Error('KiroCliBackend.compress: input must be a string');
    }
    // The prompt rides as the [INPUT] positional (kiro-cli chat's first arg).
    // D-279: join instructions + input as a SINGLE directive line, NOT two
    // newline-separated blocks. Live-verified: the two-line `instructions\n\ninput`
    // D-280: pipe the prompt on STDIN, NOT as a positional arg. The positional
    // form makes kiro-cli treat the prompt CONVERSATIONALLY — against the real
    // multi-paragraph compression prompt (a big instruction block + a delimited
    // buffer) it REFUSES the task ("I don't see a session buffer… could you
    // provide it?"), even with the D-279 single-directive colon-join (which only
    // ever worked for a TOY one-line prompt — the skill-review caught this against
    // the REAL buildCompressionInstructions). Piping on stdin (the SAME channel
    // the claude + cursor backends use) makes kiro-cli DO the task and read the
    // delimited buffer correctly. So instructions + input join the plain two-line
    // way (the claude-backend shape), delivered via stdin.
    const promptBody = instructions ? `${instructions}\n\n${input}` : input;

    const args = [
      'chat',
      '--no-interactive', // one-shot, no TTY (the --print equivalent)
      '--model',
      this._model,
      '--trust-tools=', // trust NO tools → the model can only emit text (sandbox)
      // the prompt rides on STDIN (below), NOT as a positional arg (D-280).
    ];

    // THE RECURSION GUARD: CMK_BACKEND_SPAWN=1 so the inner kiro-cli's fired
    // hooks no-op at the dispatcher entry (else agentSpawn/stop recurse — live-
    // reproduced). Strip nothing else; kiro-cli reads its own login from env.
    const env = { ...process.env, CMK_BACKEND_SPAWN: '1' };

    // A throwaway cwd with no .kiro/ so no PROJECT hooks are discovered either
    // (belt-and-suspenders alongside the env guard). Mirrors the claude-cli
    // backend running in tmpdir().
    const sandbox = mkdtempSync(join(tmpdir(), 'cmk-kiro-'));

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

      // STDOUT carries the answer; STDERR is TUI noise (we keep it only for the
      // failure message).
      child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
      child.on('error', (err) => settleReject(err));
      child.on('close', (code) => {
        if (settled) return;
        if (code !== 0) {
          settleReject(
            new HaikuFailedError(
              `KiroCliBackend: kiro-cli chat exit ${code}: ${stderr.trim() || '(no stderr)'}`,
              { exitCode: code, stderr: stderr.trim() },
            ),
          );
          return;
        }
        const outputText = parseKiroStdout(stdout);
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

      if (typeof timeoutMs === 'number' && timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          if (settled) return;
          terminateSubprocess(child, { killGraceMs: killGraceMs ?? 2000 }).catch(() => {});
          settleReject(
            new HaikuTimeoutError(
              `KiroCliBackend: kiro-cli chat did not return within ${timeoutMs}ms`,
              { timeoutMs },
            ),
          );
        }, timeoutMs);
      }

      // D-280: kiro-cli reads the prompt on STDIN (no positional arg) — write the
      // body then close, so any `$`/backtick/`<`/`>` survives verbatim (no shell
      // reaches it) and the model does the task instead of treating it as chat.
      child.stdin.write(promptBody);
      child.stdin.end();
    });
  }
}

export { parseKiroStdout };
