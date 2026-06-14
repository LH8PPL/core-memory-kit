// Content-fingerprint helper — the single home for the kit's content hash.
//
// Every "fingerprint this text/file content" site (provenance source_sha1,
// the `files` checkpoint diff key, transcript dedup, conflict-merge keys)
// MUST route through hashContent so the algorithm is defined in exactly one
// place. Eight modules previously rolled their own `createHash('sha1')`,
// which (a) let the algorithm drift per-site and (b) tripped CodeQL's
// js/weak-cryptographic-algorithm on each one independently.
//
// SHA-256, not SHA-1: the digests are non-cryptographic content fingerprints
// (dedup + change-detection), so SHA-1 was never a security flaw here — but a
// weak-hash sink on every site is noise that hides real findings, and the
// whole-convention move to SHA-256 (the user's call, D-149) removes the sink
// kit-wide while keeping the digest consistent across writers. The on-disk
// FIELD name stays `source_sha1` / `sha1` for back-compat (renaming the YAML
// key + db column would break existing fact files + checkpoints); only the
// algorithm changes. Existing `files`-table checkpoints mismatch once on the
// first boot after upgrade and self-heal via the normal reindex.

import { createHash } from 'node:crypto';

/**
 * Hash text/file content to a hex digest used as a non-cryptographic
 * fingerprint (dedup, drift-detection, provenance). UTF-8 input.
 * @param {string} content
 * @returns {string} 64-char lowercase hex SHA-256 digest
 */
export function hashContent(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
