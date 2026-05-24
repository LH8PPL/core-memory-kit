import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  canonicalize,
  generateId,
  encodeBase32,
  BASE32_ALPHABET,
} from '../packages/canonicalize/src/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, '..', 'fixtures', 'canonicalize-vectors.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const AMBIGUOUS_CHARS = ['0', 'O', '1', 'l', 'I', '8'];

describe('@cmk/canonicalize — fixture-driven', () => {
  it('has at least 30 vectors (FR-14 minimum)', () => {
    expect(fixture.vectors.length).toBeGreaterThanOrEqual(30);
  });

  it('every vector has a unique name', () => {
    const names = fixture.vectors.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
  });

  describe('canonicalize() produces documented expected_canonical for every vector', () => {
    for (const v of fixture.vectors) {
      it(v.name, () => {
        expect(canonicalize(v.input)).toBe(v.expected_canonical);
      });
    }
  });

  describe('generateId("P", input) produces documented expected_id_P for every vector', () => {
    for (const v of fixture.vectors) {
      it(v.name, () => {
        expect(generateId('P', v.input)).toBe(v.expected_id_P);
      });
    }
  });
});

describe('@cmk/canonicalize — backref idempotency (FR-14)', () => {
  it('adding a (P-XXXXXXXX) backref does not change the ID', () => {
    const base = 'we standardized on python 3.13';
    const withBackref = `(P-A8FN3MQ2) ${base}`; // validate-test-ids: ignore
    expect(generateId('P', withBackref)).toBe(generateId('P', base));
  });

  it('adding any tier prefix backref yields the same ID as without', () => {
    const base = 'milvus is pinned at v2.6.16';
    expect(generateId('P', `(U-AAAAAAAA) ${base}`)).toBe(generateId('P', base));
    expect(generateId('P', `(L-BBBBBBBB) ${base}`)).toBe(generateId('P', base));
    expect(generateId('P', `(P-CCCCCCCC) ${base}`)).toBe(generateId('P', base));
  });
});

describe('@cmk/canonicalize — tier prefix only affects ID prefix, not hash body', () => {
  it('P/U/L IDs for same input share the 8-char hash body', () => {
    const input = 'shared canonical body';
    const p = generateId('P', input);
    const u = generateId('U', input);
    const l = generateId('L', input);
    expect(p.slice(2)).toBe(u.slice(2));
    expect(p.slice(2)).toBe(l.slice(2));
    expect(p.startsWith('P-')).toBe(true);
    expect(u.startsWith('U-')).toBe(true);
    expect(l.startsWith('L-')).toBe(true);
  });

  it('rejects invalid tier prefix', () => {
    expect(() => generateId('X', 'whatever')).toThrow(/Invalid tier/);
    expect(() => generateId('', 'whatever')).toThrow(/Invalid tier/);
    expect(() => generateId('p', 'whatever')).toThrow(/Invalid tier/);
  });
});

describe('@cmk/canonicalize — base32 alphabet (FR-14)', () => {
  it('alphabet has exactly 32 chars', () => {
    expect(BASE32_ALPHABET.length).toBe(32);
  });

  it('alphabet excludes all 6 ambiguous chars (0, O, 1, l, I, 8)', () => {
    for (const c of AMBIGUOUS_CHARS) {
      expect(BASE32_ALPHABET.includes(c)).toBe(false);
    }
  });

  it('alphabet chars are unique', () => {
    expect(new Set(BASE32_ALPHABET).size).toBe(BASE32_ALPHABET.length);
  });

  it('1000 random hash encodings contain no ambiguous chars', () => {
    for (let i = 0; i < 1000; i++) {
      const id = generateId('P', `random-input-${Math.random()}-${i}`);
      const body = id.slice(2);
      for (const c of AMBIGUOUS_CHARS) {
        expect(body.includes(c)).toBe(false);
      }
    }
  });

  it('encodeBase32 round-trips bit-length correctly (8 bytes → 13 chars)', () => {
    const out = encodeBase32(new Uint8Array(8));
    expect(out.length).toBe(13);
  });

  it('encodeBase32 of 32 zero bytes produces 52 chars of alphabet[0]', () => {
    const out = encodeBase32(new Uint8Array(32));
    expect(out.length).toBe(52);
    expect(out).toBe(BASE32_ALPHABET[0].repeat(52));
  });
});

describe('@cmk/canonicalize — canonicalize edge cases', () => {
  it('null/undefined → empty string', () => {
    expect(canonicalize(null)).toBe('');
    expect(canonicalize(undefined)).toBe('');
  });

  it('canonicalize is idempotent', () => {
    const sampleInputs = fixture.vectors.map((v) => v.input);
    for (const input of sampleInputs) {
      const once = canonicalize(input);
      const twice = canonicalize(once);
      expect(twice).toBe(once);
    }
  });

  it('SHA-256 → base32 → first-8-chars produces deterministic ID', () => {
    const id1 = generateId('P', 'deterministic input');
    const id2 = generateId('P', 'deterministic input');
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^P-[2345679ABCDEFGHJKLMNPQRSTUVWXYZa]{8}$/);
  });
});
