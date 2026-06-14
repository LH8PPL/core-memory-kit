// @doors: 1
// Door 2 N/A: pure function — no disk/state mutation.
// Door 3 N/A: in-process — no subprocess spawn.
// Door 4 N/A: no NDJSON/log emission.
// Door 5 N/A: no message-queue surface.

// Boundary test for the shared content-fingerprint helper (content-hash.mjs,
// D-149). hashContent is the SINGLE home for the kit's content hash; the
// migration moved every fingerprint site from SHA-1 to SHA-256 to remove the
// js/weak-cryptographic-algorithm CodeQL sink kit-wide. The contract this test
// pins: a stable, 64-char-hex, SHA-256 digest of UTF-8 content.

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { hashContent } from '../packages/cli/src/content-hash.mjs';

describe('content-hash — hashContent (D-149)', () => {
  it('returns a 64-char lowercase hex digest (SHA-256 width)', () => {
    const digest = hashContent('hello world');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is SHA-256 of UTF-8 bytes (matches node:crypto reference)', () => {
    // The convention is SHA-256; if this ever drifts back to SHA-1 the digest
    // width assertion above AND this exact-value check both fail.
    const text = 'the rot dies at the door';
    const expected = createHash('sha256').update(text, 'utf8').digest('hex');
    expect(hashContent(text)).toBe(expected);
  });

  it('is deterministic — same input, same digest', () => {
    expect(hashContent('repeatable')).toBe(hashContent('repeatable'));
  });

  it('is sensitive — a one-char change flips the digest', () => {
    expect(hashContent('abc')).not.toBe(hashContent('abd'));
  });

  it('hashes UTF-8 multibyte content stably', () => {
    const text = 'café — naïve — 日本語';
    const expected = createHash('sha256').update(text, 'utf8').digest('hex');
    expect(hashContent(text)).toBe(expected);
  });
});
