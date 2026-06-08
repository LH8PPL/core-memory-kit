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
import { createHash } from 'node:crypto';
import { writeFact as defaultWriteFact } from './write-fact.mjs';
import { buildRichFactBody, slugifyFact } from './rich-fact.mjs';

/**
 * Write a rich Why/How fact file. Pure (no console logging) — returns the
 * writeFact result so the caller can format its own message / envelope.
 *
 * @param {string} text - the fact headline.
 * @param {object} [options] - { why, how, type, title, links, trust }. (tier is
 *   not honored here — rich capture writes the project tier P; the CLI/MCP
 *   adapters surface the v0.1.x tier deferral before calling.)
 * @param {object} [deps] - { projectRoot, writeFact } injection seams for tests.
 * @returns the writeFact result: { action:'created'|'skipped'|'error', id?, path?, errorCategory?, errors?, skipReason? }
 */
export function rememberRich(text, options = {}, deps = {}) {
  const projectRoot = deps.projectRoot ?? resolvePath(process.cwd());
  const write = deps.writeFact ?? defaultWriteFact;

  const headline = String(text).trim();
  const title = (options.title && String(options.title).trim()) || headline.split('\n')[0].slice(0, 80);
  const body = buildRichFactBody({ text: headline, why: options.why, how: options.how });
  const related = options.links
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
    // Content fingerprint for provenance/dedup — NOT a security context. Matches
    // the kit's sha1-of-content convention (memory-write.mjs, index-rebuild.mjs);
    // writeFact dedups by content-addressed id, this is the source_sha1 field. // NOSONAR
    sourceSha1: createHash('sha1').update(body).digest('hex'), // NOSONAR
    related,
    projectRoot,
  });
}

/** The title rememberRich() will derive for `text`/`options` (for caller messages). */
export function richFactTitle(text, options = {}) {
  return (options.title && String(options.title).trim()) || String(text).trim().split('\n')[0].slice(0, 80);
}
