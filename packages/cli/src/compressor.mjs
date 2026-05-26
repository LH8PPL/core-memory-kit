// CompressorBackend interface + concrete impls (Task 23.6, T-020).
//
// The interface (compress + modelId + estimatedCostPerCall) is the
// pluggable backend boundary referenced by design §8.3. It is used by
// two callers in v0.1:
//   1. Task 23 — auto-extract subagent (this PR). Calls compress() with
//      an extraction prompt + the just-captured turn.
//   2. Task 22 — SessionEnd hook (next PR). Calls compress() with a
//      compression prompt + the live now.md buffer.
//
// v0.1 ships ONE production implementation (HaikuViaAnthropicApi) plus
// a test-only MockHaikuBackend used by every downstream test that needs
// to inject canned responses without spawning the real `claude` binary.
// v0.2 candidates per ADR-0008: BedrockHaiku, LocalLlama; selected via
// settings.json (`compressor.backend`).
//
// Sandbox flags (cd /tmp, env -u CLAUDECODE, --allowed-tools "",
// --max-turns 1, --mcp-config '{"mcpServers":{}}' --strict-mcp-config,
// stdin from temp file) are absorbed from claude-remember's verified
// pattern (see docs/research/2026-05-25-claude-remember-code-dive.md
// and SOURCES.md for the licensing posture — patterns/values absorbed,
// no code or prompts copied).
//
// Note on the allowedTools split: design.md §6.1 documents
// `--allowed-tools "Read"`; the code-dive note recommended tightening
// to fully empty per claude-remember's actual pattern. This PR
// implements empty per Lior's instruction (the auto-extract sub-Claude
// never needs Read either — the turn content arrives in the prompt).

import { spawn as defaultSpawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HAIKU_MODEL_ID = 'claude-haiku-4-5-20251001';

// On Windows, npm-installed CLI binaries ship as a `.cmd` shim. Node's
// child_process.spawn does NOT auto-resolve `.cmd`/`.bat` extensions
// (unlike shell PATH resolution), so `spawn('claude')` fails with
// ENOENT on Windows even though `where claude` finds it. The
// documented Node-on-Windows pattern is to either pass the explicit
// `.cmd` suffix or use `shell: true`. We use the explicit suffix so
// the args (which include JSON like `'{"mcpServers":{}}'`) pass
// through unescaped — `shell: true` would let cmd.exe re-tokenize.
//
// Live-test surface this bug: HaikuViaAnthropicApi.compress() crashed
// with ENOENT on every detached auto-extract invocation on Windows
// because the bin defaulted to 'claude' literally. See
// docs/journey/2026-05-26-live-test-findings.md.
const DEFAULT_CLAUDE_BIN = process.platform === 'win32' ? 'claude.cmd' : 'claude';

// Conservative cost estimate for Haiku 4.5 (USD per 1K input tokens +
// USD per 1K output tokens). Anthropic-published pricing as of
// 2026-05-25; revisit periodically. The estimator assumes 4 bytes/token
// average — close enough for "is this call going to cost cents or
// dollars" budgeting.
const HAIKU_INPUT_USD_PER_1K = 0.001;
const HAIKU_OUTPUT_USD_PER_1K = 0.005;
const BYTES_PER_TOKEN_ESTIMATE = 4;
// Assumed output:input token ratio when the actual output isn't known
// (used by estimatedCostPerCall before a call is made).
const ESTIMATED_OUTPUT_FRACTION = 0.25;

export class CompressorBackend {
  async compress(_opts) {
    throw new Error('CompressorBackend.compress must be implemented by subclass');
  }
  modelId() {
    throw new Error('CompressorBackend.modelId must be implemented by subclass');
  }
  estimatedCostPerCall(_inputBytes) {
    throw new Error('CompressorBackend.estimatedCostPerCall must be implemented by subclass');
  }
}

// Subprocess timeout error — distinguishes "the call took too long"
// from "the call exited with a non-zero status" (which produces a
// generic Error with the subprocess's stderr). Callers route on
// `err.category` per design §8.5; the kit's ERROR_CATEGORIES enum
// uses HAIKU_TIMEOUT for this case + HAIKU_FAILED for non-zero exit.
//
// Per the design §8.5 contract, every CompressorBackend implementation
// (HaikuViaAnthropicApi here; v0.2 BedrockHaiku / LocalLlama later)
// MUST honor the caller-supplied timeoutMs by rejecting with a
// HaikuTimeoutError (or category-equivalent). The "Haiku" in the
// name is historical — the contract applies to every backend.
export class HaikuTimeoutError extends Error {
  constructor(message, { timeoutMs }) {
    super(message);
    this.name = 'HaikuTimeoutError';
    this.category = 'haiku_timeout';
    this.timeoutMs = timeoutMs;
  }
}

// SIGTERM → grace window → SIGKILL escalation. Exported so the kill
// chain itself is independently testable against real OS processes
// (see tests/spawn-smoke-kill-chain.test.js) — the production code
// path in compress() uses it internally.
//
// Returns {method: 'already-exited' | 'sigterm' | 'sigkill' |
// 'sigkill-no-confirm', exitCode}. The 'sigkill-no-confirm' case
// means we sent SIGKILL but the OS didn't deliver the 'exit' event
// within the secondary timeout — exceedingly rare; documented for
// completeness.
export function terminateSubprocess(child, { killGraceMs = 2000 } = {}) {
  return new Promise((resolve) => {
    if (child.exitCode !== null && child.exitCode !== undefined) {
      resolve({ method: 'already-exited', exitCode: child.exitCode });
      return;
    }
    let settled = false;
    let sigkillSent = false;
    const finish = (method) => {
      if (settled) return;
      settled = true;
      resolve({ method, exitCode: child.exitCode ?? null });
    };
    const onExit = () => {
      finish(sigkillSent ? 'sigkill' : 'sigterm');
    };
    child.once('exit', onExit);
    try {
      child.kill('SIGTERM');
    } catch {
      // Child already gone — onExit will fire (or has fired)
    }
    setTimeout(() => {
      if (settled) return;
      sigkillSent = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // Best-effort
      }
      setTimeout(() => finish('sigkill-no-confirm'), 1000);
    }, killGraceMs);
  });
}

export class HaikuViaAnthropicApi extends CompressorBackend {
  constructor({ claudeBin, model, spawnFn } = {}) {
    super();
    this._bin = claudeBin ?? DEFAULT_CLAUDE_BIN;
    this._model = model ?? HAIKU_MODEL_ID;
    this._spawn = spawnFn ?? defaultSpawn;
  }

  modelId() {
    return this._model;
  }

  estimatedCostPerCall(inputBytes) {
    const inputTokens = Math.ceil(inputBytes / BYTES_PER_TOKEN_ESTIMATE);
    const estOutputTokens = Math.ceil(inputTokens * ESTIMATED_OUTPUT_FRACTION);
    return (
      (inputTokens / 1000) * HAIKU_INPUT_USD_PER_1K +
      (estOutputTokens / 1000) * HAIKU_OUTPUT_USD_PER_1K
    );
  }

  async compress({ input, maxOutputBytes, preserveCitationIds, instructions, timeoutMs, killGraceMs } = {}) {
    if (typeof input !== 'string') {
      throw new Error('HaikuViaAnthropicApi.compress: input must be a string');
    }
    // The kit hands the model the prompt body via stdin (not argv) so
    // any `$`, backtick, `<`, `>` in the body is preserved verbatim —
    // shell interpolation can't reach it.
    const promptBody = instructions ? `${instructions}\n\n${input}` : input;

    // Write empty MCP config to a temp file rather than passing inline
    // JSON. Inline JSON via argv survives Linux/macOS shells but cmd.exe
    // strips the double-quotes when shell:true is set on Windows,
    // mangling `{"mcpServers":{}}` to `{mcpServers:{}}` and breaking
    // --mcp-config parsing. Tempfile + path arg is the cross-platform
    // pattern (live-test surface: see
    // docs/journey/2026-05-26-live-test-findings.md).
    const sandbox = mkdtempSync(join(tmpdir(), 'cmk-haiku-'));
    const mcpConfigPath = join(sandbox, 'empty-mcp.json');
    writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers: {} }), 'utf8');

    // Build claude --print invocation with the documented sandbox flags.
    // Empty allowedTools + empty MCP config = tightest possible sandbox;
    // the sub-Claude can only respond, not act.
    const args = [
      '--print',
      '--model',
      this._model,
      '--allowed-tools',
      '',
      '--max-turns',
      '1',
      '--mcp-config',
      mcpConfigPath,
      '--strict-mcp-config',
      '--output-format',
      'text',
    ];

    // Strip CLAUDECODE env var (the marker Claude Code sets to identify
    // itself to subagents) so Haiku doesn't pick up an "I'm inside
    // Claude Code" assumption.
    const env = { ...process.env };
    delete env.CLAUDECODE;

    // shell:true required on Windows so that .cmd shims (claude.cmd)
    // resolve through cmd.exe. Without it, node's spawn fails with
    // EINVAL/ENOENT because it won't auto-resolve .cmd extensions
    // (CVE-2024-27980 hardening). On Linux/macOS shell:true is a
    // no-op for argv-style invocation when the arguments don't contain
    // shell metacharacters — ours don't (the prompt goes via stdin).
    const child = this._spawn(this._bin, args, {
      cwd: tmpdir(), // OS-native temp dir; replaces `/tmp` which fails to resolve on Windows
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      // Suppress the transient cmd.exe console window on Windows —
      // every shell:true spawn flashes a window otherwise (visible
      // to the user when auto-extract / compress-session fires
      // dozens of times per session). stdio is piped so we still
      // capture the child's output through the regular handlers.
      windowsHide: true,
    });

    const cleanupSandbox = () => {
      // Single-use sandbox: the directory and the empty-mcp.json file
      // inside it are created per-call; nothing else references them
      // after the subprocess dies. On the timeout path,
      // `terminateSubprocess` runs in the background AFTER we call
      // `rmSync` here — if the dying subprocess is mid-read of
      // mcpConfigPath when SIGTERM hits, Windows can emit a benign
      // EBUSY which is swallowed by the catch. The ordering
      // (rm-then-kill) is intentional: the kill chain only touches
      // the child PID, never the sandbox path.
      try {
        rmSync(sandbox, { recursive: true, force: true });
      } catch {
        // Best-effort; OS cleans tmpdir eventually.
      }
    };

    return await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      // Timeout timer (set up below if caller supplied timeoutMs).
      // Cleared on close/error so a child that exits cleanly within
      // the window doesn't trigger the kill chain.
      let timeoutTimer = null;

      const settleReject = (err) => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        cleanupSandbox();
        reject(err);
      };
      const settleResolve = (value) => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        cleanupSandbox();
        resolve(value);
      };

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (err) => {
        settleReject(err);
      });
      child.on('close', (code) => {
        if (settled) return; // timeout already fired
        if (code !== 0) {
          settleReject(
            new Error(
              `HaikuViaAnthropicApi: claude --print exit ${code}: ${stderr.trim() || '(no stderr)'}`,
            ),
          );
          return;
        }
        const outputText = stdout.trim();
        // Honor maxOutputBytes by truncating defensively — Haiku is
        // instructed in the prompt to stay under the cap, but a
        // misbehaved response shouldn't blow downstream consumers.
        const trimmed =
          typeof maxOutputBytes === 'number' && Buffer.byteLength(outputText, 'utf8') > maxOutputBytes
            ? outputText.slice(0, maxOutputBytes)
            : outputText;
        const preservedIds = preserveCitationIds ? extractIds(trimmed) : [];
        settleResolve({
          outputText: trimmed,
          inputTokens: Math.ceil(Buffer.byteLength(promptBody, 'utf8') / BYTES_PER_TOKEN_ESTIMATE),
          outputTokens: Math.ceil(Buffer.byteLength(trimmed, 'utf8') / BYTES_PER_TOKEN_ESTIMATE),
          costUSD: this.estimatedCostPerCall(Buffer.byteLength(promptBody, 'utf8')),
          preservedIds,
        });
      });

      // Optional timeout. Default (no timeoutMs supplied) preserves
      // prior behavior — wait forever for the subprocess. Callers
      // SHOULD pass timeoutMs in production paths per design §8.5
      // (auto-extract 25_000, compress-session 50_000); the no-
      // timeout default exists only for backwards compatibility with
      // existing test fixtures that don't expect a timer.
      if (typeof timeoutMs === 'number' && timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          if (settled) return;
          // Fire the kill chain. Don't await it — settle the Promise
          // immediately with the timeout error so the caller doesn't
          // also have to wait the kill-grace window. The kill chain
          // runs in the background to clean up the OS-level subprocess
          // (terminateSubprocess returns a Promise we ignore here; the
          // sandbox cleanup happens in settleReject).
          terminateSubprocess(child, { killGraceMs: killGraceMs ?? 2000 }).catch(() => {
            // Best-effort; can't do anything further
          });
          settleReject(
            new HaikuTimeoutError(
              `HaikuViaAnthropicApi: claude --print did not return within ${timeoutMs}ms`,
              { timeoutMs },
            ),
          );
        }, timeoutMs);
      }

      // Send the prompt body via stdin and close.
      child.stdin.write(promptBody);
      child.stdin.end();
    });
  }
}

function extractIds(text) {
  // Fixed 8-char IDs per design §3.1. Previously `{6,8}` for slop
  // tolerance, but the kit only emits 8-char IDs; the {6,8} range
  // was a documented inconsistency. Tightened per PR-21 review.
  const re = /[ULP]-[A-Za-z0-9]{8}/g;
  const set = new Set();
  let m;
  while ((m = re.exec(text)) !== null) set.add(m[0]);
  return [...set];
}

// Test-only: deterministic stub for unit tests. Records every compress
// call on `this.calls` so downstream tests can spy on what was sent.
export class MockHaikuBackend extends CompressorBackend {
  constructor({ responses = [], throwError = null, model = 'mock-haiku' } = {}) {
    super();
    this._responses = [...responses];
    this._throw = throwError;
    this._model = model;
    this.calls = [];
  }

  modelId() {
    return this._model;
  }

  estimatedCostPerCall(inputBytes) {
    return inputBytes * 1e-6; // arbitrary; tests don't usually assert on this
  }

  async compress(opts) {
    this.calls.push(opts);
    if (this._throw) throw this._throw;
    if (this._responses.length === 0) {
      throw new Error('MockHaikuBackend: no more canned responses');
    }
    return this._responses.shift();
  }
}
