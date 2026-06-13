import { createHash } from 'node:crypto';

export const BASE32_ALPHABET = '2345679ABCDEFGHJKLMNPQRSTUVWXYZa';

const VALID_TIERS = new Set(['U', 'P', 'L']);

const RE_BACKREF = /\(([PUL])-[A-Za-z0-9]{8}\)/g;
const RE_BULLET_MARKER = /^\s*[-*+]\s+/;
const RE_WHITESPACE = /\s+/g;
const RE_UPPERCASE_ASCII = /[A-Z]/g;
// Per-char whitespace test (the `\s` class, anchored so it matches a WHOLE
// single char) for the trailing-strip scan below. Anchored `^\s$` so it
// can't partial-match; `\s` is JS's full Unicode whitespace set, identical
// to what `[\s.,;]` matched.
const RE_ONE_WS = /^\s$/;

// Strip `<!-- ... -->` HTML comments by scanning, NOT a regex. The previous
// `/<!--[\s\S]*?-->/g` tripped CodeQL js/polynomial-redos (O(n²) on inputs
// with many unclosed `<!--`) AND js/incomplete-multi-character-sanitization
// (a single global replace can leave a bare `<!--`). This indexOf scan is
// linear, can't ReDoS, and is OUTPUT-IDENTICAL to that regex for every input
// — well-formed (`<!--a--><!--b-->` → ``), nested (`<!--<!---->` → ``), and
// unclosed (`a <!-- b` → `a <!-- b`, left as-is, exactly as the regex did).
// Output-identity is load-bearing: canonicalize feeds content-addressed IDs
// with Node↔Python parity (fixtures/canonicalize-vectors.json) — any change
// to the canonical form would change every ID. The Python twin keeps its
// equivalent `<!--.*?-->` regex (CodeQL scans JS only); both yield the same.
export function stripHtmlComments(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const start = s.indexOf('<!--', i);
    if (start === -1) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, start);
    const end = s.indexOf('-->', start + 4);
    if (end === -1) {
      // Unclosed comment — leave the remainder verbatim (the lazy regex,
      // finding no `-->`, also left it). Preserves canonical output.
      out += s.slice(start);
      break;
    }
    i = end + 3; // skip past the closing `-->`
  }
  return out;
}

export function canonicalize(text) {
  if (text === null || text === undefined) return '';
  let s = String(text);
  s = stripHtmlComments(s);
  s = s.replace(RE_BACKREF, '');
  s = s.replace(RE_BULLET_MARKER, '');
  s = s.replace(RE_WHITESPACE, ' ');
  s = s.trim();
  s = s.replace(RE_UPPERCASE_ASCII, (c) => c.toLowerCase());
  s = stripTrailingPunctWs(s);
  return s;
}

// Strip a trailing run of whitespace / `.` / `,` / `;` by scanning from the
// END, NOT a regex. The previous `/[\s.,;]+$/` is the textbook super-linear
// trailing-strip pattern (the StackOverflow-2016-outage class; flagged Safe
// in the D-128 Sonar triage on bounded memory-bullet input, but the loop is
// the free fix). OUTPUT-IDENTICAL by construction: the regex removed the
// maximal trailing run where every char is `\s|.|,|;`; this walks back over
// exactly those chars and slices once. Output-identity is load-bearing —
// canonicalize feeds content-addressed IDs with Node↔Python parity
// (fixtures/canonicalize-vectors.json); any drift would re-key every ID.
// The Python twin keeps its `[\s.,;]+$` regex (the super-linear concern is
// the JS CodeQL/Sonar finding; Python's `re` is not the target); both yield
// the same bytes. Linear: one backward pass, no backtracking.
export function stripTrailingPunctWs(s) {
  let end = s.length;
  while (end > 0) {
    const c = s[end - 1];
    if (c === '.' || c === ',' || c === ';' || RE_ONE_WS.test(c)) {
      end -= 1;
    } else {
      break;
    }
  }
  return end === s.length ? s : s.slice(0, end);
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
