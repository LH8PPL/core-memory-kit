import { createHash } from 'node:crypto';

export const BASE32_ALPHABET = '2345679ABCDEFGHJKLMNPQRSTUVWXYZa';

const VALID_TIERS = new Set(['U', 'P', 'L']);

const RE_HTML_COMMENT = /<!--[\s\S]*?-->/g;
const RE_BACKREF = /\(([PUL])-[A-Za-z0-9]{8}\)/g;
const RE_BULLET_MARKER = /^\s*[-*+]\s+/;
const RE_WHITESPACE = /\s+/g;
const RE_UPPERCASE_ASCII = /[A-Z]/g;
const RE_TRAILING_PUNCT_WS = /[\s.,;]+$/;

export function canonicalize(text) {
  if (text === null || text === undefined) return '';
  let s = String(text);
  s = s.replace(RE_HTML_COMMENT, '');
  s = s.replace(RE_BACKREF, '');
  s = s.replace(RE_BULLET_MARKER, '');
  s = s.replace(RE_WHITESPACE, ' ');
  s = s.trim();
  s = s.replace(RE_UPPERCASE_ASCII, (c) => c.toLowerCase());
  s = s.replace(RE_TRAILING_PUNCT_WS, '');
  return s;
}

export function encodeBase32(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

export function generateId(tier, text) {
  if (!VALID_TIERS.has(tier)) {
    throw new Error(`Invalid tier: ${JSON.stringify(tier)}. Must be 'U', 'P', or 'L'.`);
  }
  const canonical = canonicalize(text);
  const hash = createHash('sha256').update(canonical, 'utf8').digest();
  const encoded = encodeBase32(hash);
  return `${tier}-${encoded.slice(0, 8)}`;
}
