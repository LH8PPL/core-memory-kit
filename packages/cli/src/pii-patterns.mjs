// pii-patterns.mjs — the L1 deterministic PII pattern layer (Task 148.1,
// ADR-0019, design §6.10). Sibling to poison-guard.mjs (which REJECTS
// secrets/injection) and sanitize.mjs (which abstracts home paths): this
// module MASKS incidental PII — emails, phone numbers, the local username —
// in place, before any commit-eligible write. A name/email in tool output is
// incidental, not adversarial, so the posture is rewrite-not-reject.
//
// Contracts (locked by tests/cli-pii-patterns.test.js):
//   - findings carry category + offsets, NEVER the matched text — an audit
//     entry built from findings structurally cannot leak what it caught
//     (the memclaw discipline).
//   - redactions carry original → placeholder — the caller appends them to
//     the gitignored context/.locks/redactions.log, the ONE place originals
//     survive (the recovery surface; never committed).
//   - invisible-Unicode/bidi characters are detected on the RAW string and
//     stripped BEFORE pattern matching (the hermes ordering — normalization
//     after matching would let zero-width-split PII evade the regexes).
//   - the scan is bounded (MAX_SCAN_CHARS) — an advisory guard with a bounded
//     worst case, not archival search; the un-scanned tail passes through.
//
// The L3 half of the screen (the async Haiku judge that catches names/health
// details patterns cannot see) lives in transcript-screen.mjs; the two layers
// compose per design §6.10.

import { homedir, userInfo } from 'node:os';
import { basename, join } from 'node:path';
import { sanitizeHomePaths } from './sanitize.mjs';
import { parseJsonFile } from './read-json.mjs';

// Stable placeholders — «»-delimited so they read as redactions, survive
// markdown, and never collide with real content (memclaw's token style).
export const PII_PLACEHOLDERS = Object.freeze({
  EMAIL: '«EMAIL»',
  PHONE: '«PHONE»',
  USERNAME: '«USER»',
});

// Bounded worst case (hermes MAX_SCAN_CHARS): scanners are advisory guards on
// hook-adjacent paths, not archival search. Content past the bound passes
// through unscanned — documented behavior, asserted in the tests.
export const MAX_SCAN_CHARS = 65_536;

// Invisible / bidi-control codepoints (hermes' set): zero-widths, word joiner,
// invisible math operators, BOM, and the full bidi-control range. Written as
// \u-escapes (NOT literal invisible glyphs) so the source is reviewable — a
// bidi/joined-sequence char can't hide IN the very defense against them (the
// SonarCloud bidi/joined-class finding), and a reviewer can read exactly which
// codepoints we strip. The Set and the RE are DERIVED from ONE list so they
// can never drift.
const INVISIBLE_CODEPOINT_HEX = [
  0x200b, 0x200c, 0x200d, // zero-width space / non-joiner / joiner
  0x2060, // word joiner
  0x2062, 0x2063, 0x2064, // invisible times / separator / plus
  0xfeff, // BOM / zero-width no-break space
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, // LRE RLE PDF LRO RLO
  0x2066, 0x2067, 0x2068, 0x2069, // LRI RLI FSI PDI
];
const INVISIBLE_CHARS = new Set(INVISIBLE_CODEPOINT_HEX.map((cp) => String.fromCodePoint(cp)));
// One alternation of individually-listed codepoints — no character-class
// ranges (a range could silently include an unintended codepoint) and no
// literal invisibles in the source. Checked via set intersection on the RAW
// string; stripped before any pattern runs.
const INVISIBLE_RE = new RegExp([...INVISIBLE_CHARS].join('|'), 'g');

// EMAIL — the standard conservative form. The allowlist skips bot/example
// addresses that are content, not PII: masking `noreply@anthropic.com` in a
// commit trailer would damage the record for zero privacy gain.
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const EMAIL_ALLOWLIST_RE = /^(?:no-?reply@|.*@(?:users\.noreply\.github\.com|example\.(?:com|org|net))$)/i;

// PHONE — deliberately conservative (the kit's Poison_Guard philosophy):
// require an international prefix OR separator-formatted groups, so versions
// (0.5.0), ports (8000), dates (2026-07-07), and bare digit runs never match.
//   +CC nnn nnn nnnn   |   (nnn) nnn-nnnn   |   nnn-nnn-nnnn
// Trailing lookahead rejects only a CONTINUATION (digit/hyphen) — a
// sentence-ending period after the number must not defeat the match.
const PHONE_RES = [
  /(?<![\w.])\+\d{1,3}[ -]\d{1,3}[ -]?\d{2,4}[ -]\d{3,4}(?![\d-])/g, // +972 54-123-4567
  /(?<![\w.])\(\d{3}\) ?\d{3}-\d{4}(?![\d-])/g, // (555) 123-4567
  /(?<![\w.])\d{3}-\d{3}-\d{4}(?![\d-])/g, // 555-123-4567 (NOT a date: dates are nnnn-nn-nn)
];

// Cheap keyword pre-filter (the gitleaks two-stage discipline): only run the
// expensive per-pattern pass when the text can possibly contain a match.
function mightContainPii(text, usernames) {
  if (text.includes('@')) return true;
  if (text.includes('+') || text.includes('(') || text.includes('-')) return true;
  // home-path indicators (sanitizeHomePaths is case-insensitive — match that)
  const lower = text.toLowerCase();
  if (lower.includes('users') || lower.includes('/home/')) return true;
  for (const u of usernames) if (u && text.includes(u)) return true;
  return false;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Core pass. Returns { text, findings, redactions } where findings are
 * category+offset-only (audit-safe) and redactions carry the originals
 * (for the gitignored recovery log). Offsets refer to the OUTPUT text's
 * placeholder positions — they locate the redaction, not the original.
 */
function run(text, { usernames = [], mutate }) {
  if (typeof text !== 'string') return { text, findings: [], redactions: [] };

  const findings = [];
  const redactions = [];

  // Bound the scanned region; the tail passes through untouched (documented).
  const head = text.slice(0, MAX_SCAN_CHARS);
  const tail = text.slice(MAX_SCAN_CHARS);

  // 1. Invisible-Unicode/bidi — RAW string, before any pattern (hermes order).
  let work = head;
  if ([...new Set(work)].some((ch) => INVISIBLE_CHARS.has(ch))) {
    findings.push({ category: 'INVISIBLE_UNICODE' });
    if (mutate) work = work.replace(INVISIBLE_RE, '');
  }

  if (!mightContainPii(work, usernames)) {
    return { text: mutate ? work + tail : text, findings, redactions };
  }

  const applyPattern = (re, category, placeholder, allow) => {
    work = work.replace(re, (match, ...rest) => {
      // String.replace passes (…groups, offset, string); with no capture
      // groups here, offset is the second-from-last arg.
      const offset = rest.at(-2);
      if (allow?.(match)) return match;
      findings.push({ category, start: offset, end: offset + placeholder.length });
      redactions.push({ category, placeholder, original: match });
      return mutate ? placeholder : match;
    });
  };

  // 2. EMAIL (allowlisted bot/example addresses stay).
  applyPattern(EMAIL_RE, 'EMAIL', PII_PLACEHOLDERS.EMAIL, (m) => EMAIL_ALLOWLIST_RE.test(m));

  // 3. PHONE (conservative forms only).
  for (const re of PHONE_RES) applyPattern(re, 'PHONE', PII_PLACEHOLDERS.PHONE);

  // 4. HOME_PATH — delegate to the existing shared abstraction (sanitize.mjs);
  //    detect-by-diff so the finding is recorded without re-implementing it.
  if (mutate) {
    const before = work;
    work = sanitizeHomePaths(work);
    if (work !== before) findings.push({ category: 'HOME_PATH' });
  }

  // 5. USERNAME — caller-supplied local usernames (derived from homedir /
  //    os.userInfo at the call site; injected here for determinism). Exact
  //    token matches only (boundaries), min length 3 — a short or embedded
  //    match is far likelier to be a real word than the login name.
  for (const u of usernames) {
    if (!u || u.length < 3) continue;
    const re = new RegExp(`(?<![\\w.-])${escapeRegExp(u)}(?![\\w.-])`, 'g');
    applyPattern(re, 'USERNAME', PII_PLACEHOLDERS.USERNAME);
  }

  return { text: mutate ? work + tail : text, findings, redactions };
}

/**
 * The local usernames the USERNAME category masks — derived from the OS, not
 * guessed: the login name + the home-dir basename (they differ on some
 * setups). Best-effort: an exotic environment without either just yields [].
 * Call sites pass the result into maskPii; tests inject their own list.
 */
export function localUsernames() {
  const names = new Set();
  try {
    const u = userInfo().username;
    if (u) names.add(u);
  } catch {
    /* no user info — fine */
  }
  try {
    const b = basename(homedir());
    if (b) names.add(b);
  } catch {
    /* no homedir — fine */
  }
  return [...names];
}

/**
 * The privacy-screen kill-switch (design §6.10): context/settings.json →
 * privacy.screen, default 'on'. BOM-tolerant via parseJsonFile (the D-187
 * class). 'off' reverts every 148 surface to pre-148 behavior.
 */
export function resolvePrivacyScreen({ projectRoot }) {
  // No projectRoot (e.g. a pure user-tier write) → screen ON (safe default:
  // the U tier is shared/portable, exactly where masking matters).
  if (typeof projectRoot !== 'string' || projectRoot === '') return 'on';
  const p = join(projectRoot, 'context', 'settings.json');
  const v = parseJsonFile(p, { fallback: null })?.privacy?.screen;
  return v === 'off' ? 'off' : 'on';
}

/** Read-only scan: findings without mutation (category + offsets only). */
export function scanPii(text, opts = {}) {
  const { findings } = run(text, { ...opts, mutate: false });
  return { findings };
}

/**
 * Mask PII in place. Returns:
 *   text       — the masked string (or the input verbatim if nothing matched)
 *   findings   — [{category, start?, end?}] — NEVER carries matched text
 *   redactions — [{category, placeholder, original}] — for redactions.log ONLY
 */
export function maskPii(text, opts = {}) {
  return run(text, { ...opts, mutate: true });
}
