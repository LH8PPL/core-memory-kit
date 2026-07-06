#!/usr/bin/env node
// Agent-parametric backend live-test (Task 200, D-270/D-274/D-278).
//
// WHY THIS EXISTS: the kit's automatic engine routes its LLM call through the
// agent's OWN CLI (claude / kiro-cli / cursor-agent). The big scenario harness
// (scripts/live-test.mjs) hardcodes `claude` as the DRIVER (Claude plays the
// user) and runs on a Claude-equipped machine — so it would PASS while hiding
// the D-270 bug (a Cursor-only / Kiro-only user's engine silently no-ops). This
// script closes that gap: it exercises the kit's REAL backend SELECTION
// (makeBackend) against REAL input, on WHATEVER agent the project resolves to —
// so a Claude-free machine can prove its own automatic engine actually runs.
//
// It is the formalized, repeatable version of the manual cursor/kiro live-probes
// (D-274/D-278). ON-DEMAND (`npm run live-test:backend`), never in `npm test`
// (it spends real tokens on the resolved agent's subscription).
//
// USAGE:
//   npm run live-test:backend                 # resolve the backend for the cwd
//   npm run live-test:backend -- --agent kiro # force a specific agent
//   CMK_CURSOR_BIN=... npm run live-test:backend  # override a bin path
//
// It reports LIVE OK / LIVE FAIL with the elapsed time + the summary the backend
// produced, and exits non-zero on failure so a gate can consume it.

import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'packages', 'cli', 'src');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function load(mod) {
  return import(pathToFileURL(join(SRC, mod)).href);
}

// The reject-gate (D-279, from claude-remember's _is_non_summary): a model that
// second-guesses the task emits a refusal or a clarifying question instead of a
// summary. Screen for that phrasing so a non-empty non-answer FAILS the live test.
function isRefusal(text) {
  const t = text.toLowerCase();
  return (
    /i (don't|do not|cannot|can't) (have|access|see|find)/.test(t) ||
    /could you (clarify|provide|specify)/.test(t) ||
    /please (provide|clarify|specify|share)/.test(t) ||
    /what (should|would) (i|you)/.test(t) ||
    /(no|any) (stored|durable|prior) (preferences|memory|context)/.test(t)
  );
}

const INPUT =
  'The user prefers uv over pip for packaging, runs ruff before every commit, and uses pytest for tests.';
const INSTRUCTIONS =
  'Summarize the durable preference in one short sentence. Reply with only the sentence.';

async function main() {
  const projectRoot = arg('--project') ?? process.cwd();
  const forcedAgent = arg('--agent');

  const { resolveBackendAgent, makeBackend } = await load('make-backend.mjs');
  const { agentCliOnPath } = await load('agent-cli.mjs');

  // Which agent will run the call, and why.
  const norm = (a) => (a === 'claude-code' ? 'claude' : a);
  const resolved = forcedAgent
    ? { agent: norm(forcedAgent), source: 'forced (--agent)' }
    : resolveBackendAgent({ projectRoot });
  console.log(`backend agent: ${resolved.agent} (${resolved.source})`);

  // Presence check first — a missing CLI is the D-270 case; report it clearly.
  const present = agentCliOnPath(resolved.agent);
  console.log(`CLI probe: ${present.bin} → ${present.present ? 'present' : 'ABSENT'}${present.reason ? ` (${present.reason})` : ''}`);
  if (!present.present) {
    console.log(
      `LIVE SKIP: the ${resolved.agent} CLI is not available on this machine — ` +
        `the automatic engine would degrade to file-only here (the expected D-270 behavior). ` +
        `Install the CLI, or run on a machine that has it, to exercise the real call.`,
    );
    process.exit(3); // distinct from a real failure (2) — the CLI just isn't here
  }

  // Construct the REAL backend. Without --agent, use the production factory
  // (makeBackend → the same selection the automatic engine uses). With --agent,
  // construct the named backend class directly (bypasses install detection).
  const ctorOpts = {};
  if (resolved.agent === 'cursor' && process.env.CMK_CURSOR_BIN) ctorOpts.cursorBin = process.env.CMK_CURSOR_BIN;
  if (resolved.agent === 'kiro' && process.env.CMK_KIRO_BIN) ctorOpts.kiroBin = process.env.CMK_KIRO_BIN;
  let backend;
  if (forcedAgent) {
    const [{ HaikuViaAnthropicApi }, { KiroCliBackend }, { CursorAgentBackend }] = await Promise.all([
      load('compressor.mjs'),
      load('kiro-backend.mjs'),
      load('cursor-backend.mjs'),
    ]);
    const byAgent = { claude: HaikuViaAnthropicApi, 'claude-code': HaikuViaAnthropicApi, kiro: KiroCliBackend, cursor: CursorAgentBackend };
    const Cls = byAgent[resolved.agent];
    if (!Cls) { console.log(`LIVE FAIL: unknown --agent '${forcedAgent}'.`); process.exit(2); }
    backend = new Cls(ctorOpts);
  } else {
    backend = makeBackend({ projectRoot, ...ctorOpts });
  }

  console.log(`model: ${backend.modelId()}`);
  const t0 = Date.now();
  try {
    const r = await backend.compress({ input: INPUT, instructions: INSTRUCTIONS });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const text = typeof r.outputText === 'string' ? r.outputText.trim() : '';
    console.log(`outputText: ${JSON.stringify(r.outputText)}`);
    console.log(`tokens in/out: ${r.inputTokens}/${r.outputTokens}`);
    if (!text) {
      console.log(`LIVE FAIL: the backend returned an empty summary (${elapsed}s).`);
      process.exit(2);
    }
    // D-279 reject-gate: a NON-EMPTY refusal/clarification is a FAIL, not a pass
    // — the exact failure the parametric harness exists to catch (the model
    // second-guessing the task instead of doing it). Also sanity-check the
    // summary mentions the input's key terms.
    if (isRefusal(text)) {
      console.log(
        `LIVE FAIL: the backend REFUSED/deflected instead of summarizing (${elapsed}s) — ` +
          `a prompt-shape bug (the D-279 class). The response reads as a question/refusal, not a summary.`,
      );
      process.exit(2);
    }
    const mentionsTopic = /uv|ruff|pytest|pip|commit|test/i.test(text);
    if (!mentionsTopic) {
      console.log(
        `LIVE WARN: the summary doesn't mention any input key term (uv/ruff/pytest/…) — ` +
          `it may not be summarizing the given text. Review the output above.`,
      );
    }
    console.log(`LIVE OK — the ${resolved.agent} backend produced a summary in ${elapsed}s.`);
    process.exit(0);
  } catch (e) {
    console.log(`LIVE FAIL — ${e.category || e.name}: ${e.message}`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error('live-test-backend crashed:', e);
  process.exit(2);
});
