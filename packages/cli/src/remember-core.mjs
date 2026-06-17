// Shared rich-capture core (Task 108b / ADR-0014).
//
// `rememberRich` writes a granular Why/How fact file via writeFact(). BOTH
// surfaces call it so they produce byte-identical fact files with one
// implementation of the contract:
//   - CLI  — subcommands.runRememberRich (re-exports this) ← `cmk remember --why/--how` + `--from-file`
//   - MCP  — mcp-server.makeMkRemember rich path           ← `mk_remember` with why/how/title/type
//
// It lives in its own module (not subcommands.mjs) because subcommands.mjs
// imports runMcpServer from mcp-server.mjs — so mcp-server importing the core
// back from subcommands would be a circular dependency. The core depends only
// on the write/format primitives, never on either front-end.
//
// Logging is the CALLER's concern: this returns the writeFact result and the
// CLI/MCP adapter formats its own message (the CLI's "saved rich fact" line vs
// the MCP's JSON envelope) — so stdout-purity on the MCP path is the adapter's
// to keep (design §10.1), not the core's.

import { resolve as resolvePath } from 'node:path';
import { hashContent } from './content-hash.mjs';
import { sanitizeForTitle } from './sanitize.mjs';
import { writeFact as defaultWriteFact } from './write-fact.mjs';
import { buildRichFactBody, slugifyFact } from './rich-fact.mjs';

/**
 * The note shown when a non-project tier (U/L) is requested on a capture. Both
 * `cmk remember` and `mk_remember` write the PROJECT tier (P) regardless of the
 * requested tier; a fact becomes cross-project via lessons-promote, not a direct
 * tier write (direct U/L routing is the deferred feature in design §16.40). This is the ONE
 * source of truth for that note across all three adapter paths (CLI terse, CLI
 * rich, MCP) — Task 108 unified the write core but the tier message had drifted
 * into three divergent, independently-stale copies (D-102). Centralizing it here
 * means it can't drift again.
 */
export function nonProjectTierNote(tier) {
  return (
    `tier '${tier}' is not a direct write target — captured to the project tier (P). ` +
    'To make it cross-project, promote it (`cmk lessons promote <id>` / the `mk_lessons_promote` tool).'
  );
}

/**
 * Write a rich Why/How fact file. Pure (no console logging) — returns the
 * writeFact result so the caller can format its own message / envelope.
 *
 * @param {string} text - the fact headline.
 * @param {object} [options] - { why, how, type, title, links, trust }. (tier is
 *   not honored here — rich capture writes the project tier P; the CLI/MCP
 *   adapters surface the non-project-tier note before/around calling.)
 * @param {object} [deps] - { projectRoot, writeFact } injection seams for tests.
 * @returns the writeFact result: { action:'created'|'skipped'|'error', id?, path?, errorCategory?, errors?, skipReason? }
 */
export function rememberRich(text, options = {}, deps = {}) {
  const projectRoot = deps.projectRoot ?? resolvePath(process.cwd());
  const write = deps.writeFact ?? defaultWriteFact;

  // Sanitize BEFORE deriving/slicing the title — the slug is `slugifyFact(title)`,
  // so anything still in the title here lands in the committed FILENAME + INDEX,
  // which writeFact's later body/title sanitization can't undo. sanitizeForTitle
  // (the ONE shared helper — sanitize.mjs) strips <private> + abstracts home
  // paths, the two cut-gate findings (v0.3.1 + F-V0.3.3-2). The body itself keeps
  // its <private> redaction via the headline below; home paths in the body are
  // abstracted by writeFact downstream.
  const headline = sanitizeForTitle(text);
  const safeTitle = options.title ? sanitizeForTitle(options.title) : '';
  const title = safeTitle || headline.split('\n')[0].slice(0, 80);
  const body = buildRichFactBody({ text: headline, why: options.why, how: options.how });
  // `links` arrives as an ARRAY from the MCP tool (z.array) and as a
  // comma-STRING from the CLI flag — accept both. The old `String(links)` path
  // coerced an array via toString (works only until a link contains a comma);
  // handle the array explicitly (D-102 / 121.6).
  const related = Array.isArray(options.links)
    ? options.links.map((s) => String(s).trim()).filter(Boolean)
    : options.links
      ? String(options.links).split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

  return write({
    tier: 'P',
    type: options.type ?? 'feedback',
    slug: slugifyFact(title),
    title,
    body,
    writeSource: 'user-explicit',
    trust: options.trust ?? 'high',
    sourceFile: 'user-explicit',
    sourceLine: 1,
    // Content fingerprint for provenance/dedup — NOT a security context.
    // Routes through the shared hashContent (SHA-256, D-149); writeFact dedups
    // by content-addressed id, this is the source_sha1 metadata field.
    sourceSha1: hashContent(body),
    related,
    projectRoot,
  });
}

/** The title rememberRich() will derive for `text`/`options` (for caller messages). */
export function richFactTitle(text, options = {}) {
  // Mirror rememberRich EXACTLY (the SAME sanitizeForTitle helper) so the preview
  // a caller echoes never carries <private> content or the username, and stays
  // identical to the title rememberRich actually derives + stores.
  const safeTitle = options.title ? sanitizeForTitle(options.title) : '';
  return safeTitle || sanitizeForTitle(text).split('\n')[0].slice(0, 80);
}

/**
 * Task 143 (D-130): the write-time near-dup guard for the EXPLICIT terse
 * capture paths (cmk remember / mk_remember). Returns extra memoryWrite
 * options — `{similarityFn, queueNearDups: true}` when this project is
 * semantic-configured AND the local embedder is available; `{}` otherwise.
 *
 * One shared gate for both adapters (the shared-modules rule). Best-effort
 * by contract: ANY failure (no embedder, model error, db hiccup) returns {}
 * so capture proceeds on the literal pipeline — losing a capture to a
 * similarity upgrade would invert the kit's priorities. The auto-extract
 * hook path deliberately does NOT call this (its detached child is
 * budget-constrained; the landed corpus gets the doctor's batch near-dup
 * view, Task 144, and re-curation, Task 95).
 *
 * @param {object} opts - { projectRoot, text, prepareImpl?, resolveModeImpl? } (seams for tests).
 * @returns {Promise<object>} extra memoryWrite options (possibly empty).
 */
export async function prepareNearDupGuard({ projectRoot, text, prepareImpl, resolveModeImpl } = {}) {
  try {
    const { resolveDefaultSearchMode, prepareSemanticSimilarity, SEMANTIC_NEARDUP_THRESHOLD } = await import('./semantic-backend.mjs');
    const mode = (resolveModeImpl ?? resolveDefaultSearchMode)({ projectRoot });
    if (mode === 'keyword') return {};
    const sem = await (prepareImpl ?? prepareSemanticSimilarity)({ projectRoot, newText: text });
    if (!sem.ok) return {};
    // The MEASURED bge-base threshold (see SEMANTIC_NEARDUP_THRESHOLD) — the
    // generic 0.85 default would miss the canonical "use uv not pip" pair.
    return { similarityFn: sem.similarityFn, similarityThreshold: SEMANTIC_NEARDUP_THRESHOLD, queueNearDups: true };
  } catch {
    return {};
  }
}
