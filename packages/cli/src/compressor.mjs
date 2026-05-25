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

const HAIKU_MODEL_ID = 'claude-haiku-4-5-20251001';
const DEFAULT_CLAUDE_BIN = 'claude';

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

  async compress({ input, maxOutputBytes, preserveCitationIds, instructions } = {}) {
    if (typeof input !== 'string') {
      throw new Error('HaikuViaAnthropicApi.compress: input must be a string');
    }
    // The kit hands the model the prompt body via stdin (not argv) so
    // any `$`, backtick, `<`, `>` in the body is preserved verbatim —
    // shell interpolation can't reach it.
    const promptBody = instructions ? `${instructions}\n\n${input}` : input;

    // Build claude --print invocation with the documented sandbox flags.
    // The empty allowedTools + empty MCP config are the tightest
    // possible sandbox; the sub-Claude can only respond, not act.
    const args = [
      '--print',
      '--model',
      this._model,
      '--allowed-tools',
      '',
      '--max-turns',
      '1',
      '--mcp-config',
      '{"mcpServers":{}}',
      '--strict-mcp-config',
      '--output-format',
      'text',
    ];

    // Strip CLAUDECODE env var (the marker Claude Code sets to identify
    // itself to subagents) so Haiku doesn't pick up an "I'm inside
    // Claude Code" assumption.
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const child = this._spawn(this._bin, args, {
      cwd: '/tmp',
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code !== 0) {
          reject(
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
        resolve({
          outputText: trimmed,
          inputTokens: Math.ceil(Buffer.byteLength(promptBody, 'utf8') / BYTES_PER_TOKEN_ESTIMATE),
          outputTokens: Math.ceil(Buffer.byteLength(trimmed, 'utf8') / BYTES_PER_TOKEN_ESTIMATE),
          costUSD: this.estimatedCostPerCall(Buffer.byteLength(promptBody, 'utf8')),
          preservedIds,
        });
      });
      // Send the prompt body via stdin and close.
      child.stdin.write(promptBody);
      child.stdin.end();
    });
  }
}

function extractIds(text) {
  const re = /[ULP]-[A-Za-z0-9]{6,8}/g;
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
