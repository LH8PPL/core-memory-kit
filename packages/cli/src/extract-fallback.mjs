// Deterministic, LLM-free extraction fallback (Task 242, D-369).
//
// WHY THIS EXISTS
// ---------------
// On ANY extraction failure, auto-extract returned `observation_count: 0` and
// `candidates: []` — dropping the turn whole. Measured on this repo's own
// dogfood logs: 6/6 `haiku_timeout` in a single session → ZERO captures, and
// nothing anywhere said so. The sessions richest in durable findings (long,
// heavy, multi-agent) are exactly the ones that starve the extractor.
//
// Timeouts are not the only mode: of 295 historical non-success outcomes only
// 166 were `haiku_timeout`; `concurrent_run` (82) and `haiku_failed` (47) are
// the rest. So this runs on ANY failure, including an unrecognized category —
// a new failure mode is covered the day it appears, not the day someone notices.
//
// THE CONSTRAINT THAT MAKES IT SAFE (binding, the user's call)
// ------------------------------------------------------------
// MISSION CONTEXT ONLY. This extractor is dumber than the LLM one: it will
// otherwise capture whatever durable-looking prose is in the turn, and on a
// kit-debugging session that is almost entirely kit-failure noise. Kit bugs,
// timeouts, hook errors, our own debugging and retracted diagnoses are BUILD
// ARTIFACTS — their home is DECISION-LOG.md and tasks.md, never a memory tier
// injected into every future session.
//
// Default is EXCLUDE-ON-DOUBT: a missed capture is recoverable (the LLM pass
// re-attempts the turn on a later healthy pass), a poisoned tier is not.

// Cap: a fallback must never flood the tier. Deliberately small — this is a
// safety net, not a replacement for the LLM pass.
export const FALLBACK_MAX_CANDIDATES = 5;
const MIN_LEN = 15;
const MAX_LEN = 400;

// Kit-operational vocabulary. Anything naming the KIT'S OWN machinery, its
// failures, or our build process is excluded — see the module header.
const KIT_OPERATIONAL = [
  // the kit's own surfaces + commands
  /\b(cmk|auto-extract|extractor|inject-context|capture-turn|memory-write|poison.?guard)\b/i,
  /\b(hc-\d+|cmk doctor|doctor (check|reports?)|validate-\w+|validator)\b/i,
  /\b(stop hook|session ?start hook|pre.?compact|hook (is|was|not )?fir\w+)\b/i,
  // build/test/CI machinery
  /\b(npm (test|run)|test suite|stress (gate|run)|ci\b|main went red|coverage gate)\b/i,
  /\b(\d+\s*\/\s*\d+ (passing|green)|\d+ tests? (passing|green|failed))\b/i,
  // our own failure/debugging vocabulary
  /\b(haiku_timeout|haiku_failed|concurrent_run|timed? out|timeout|stack trace|enoent)\b/i,
  /\b(retracted|false positive|the probe|mis-?measured|regression test)\b/i,
  // build-process artifacts
  /\b(task \d+|d-\d{2,}|adr-\d+|pr #?\d+|decision.?log|tasks\.md)\b/i,
];

// A durable STATEMENT looks like a decision, preference, convention or fact
// about the user's world. Questions and commands are not durable statements.
const DURABLE_SIGNAL =
  /\b(we (decided|use|prefer|need|want|standardi[sz]e|deploy|run)|from now on|always|never|the (team|customer|client|project|service|api|app)\b|prefers?\b|convention|policy|rule is)\b/i;

const IMPERATIVE_OR_QUESTION = /^\s*(can|could|would|will|please|what|why|how|when|where|who|do|does|did|is|are|should|run|open|fix|add|make|show|check|try)\b|\?\s*$/i;

/**
 * Is this line about the KIT'S own operation rather than the user's mission?
 *
 * @param {string} line
 * @returns {boolean} true → must NOT reach a memory tier
 */
export function isKitOperational(line) {
  const s = String(line ?? '');
  return KIT_OPERATIONAL.some((re) => re.test(s));
}

/**
 * Extract durable mission-context candidates from a turn WITHOUT an LLM.
 *
 * Conservative by construction: only the USER's own words (the assistant's
 * turn is inference, not ground truth — the D-122 self-poisoning lesson), only
 * lines carrying a durable-statement signal, never questions or commands, and
 * never anything kit-operational.
 *
 * @param {object} a
 * @param {string} [a.userTurn] the user's turn text
 * @returns {Array<{text: string, trust: string, write_source: string}>}
 */
export function extractFallbackCandidates({ userTurn } = {}) {
  const raw = String(userTurn ?? '').trim();
  if (!raw) return [];

  const out = [];
  const seen = new Set();

  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim().replace(/^[-*>\s]+/, '').trim();
    if (text.length < MIN_LEN || text.length > MAX_LEN) continue;
    // Exclude-on-doubt, in order of cheapness.
    if (IMPERATIVE_OR_QUESTION.test(text)) continue;
    if (isKitOperational(text)) continue;
    if (!DURABLE_SIGNAL.test(text)) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      text,
      // Never 'high': this is a keyword heuristic, not a judgment. The LLM pass
      // re-attempting the turn later is what can promote it.
      trust: 'medium',
      // HONEST provenance — do NOT launder a heuristic capture as an LLM
      // extraction. A reader (and the learn-loop) must be able to tell them apart.
      write_source: 'auto-extract-fallback',
    });
    if (out.length >= FALLBACK_MAX_CANDIDATES) break;
  }

  return out;
}
