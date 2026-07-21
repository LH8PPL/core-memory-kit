// sanitize.mjs — privacy sanitizers applied before durable writes to a
// committed/shared tier. Sibling to poison-guard.mjs, but where Poison_Guard
// REJECTS a write (secrets/poison), these REWRITE it (privacy abstraction).
//
// Write-path fix #1 (the self-test privacy leak): a durable fact written to a
// committed project tier carried the local username inside an absolute
// interpreter path (C:\Users\<you>\...\python.exe), shipping it to git and
// making the fact non-portable. sanitizeHomePaths abstracts the home-dir
// prefix to `~` — killing the username leak AND making the fact portable
// across machines — while preserving everything after the home dir.
//
// Applied to P (committed) and U (cross-project) tier writes. NOT to L
// (local, gitignored) — machine-specific absolute paths are the whole point
// of the local tier, so they stay verbatim there.

import { sanitizePrivacyTags } from './privacy.mjs';

// Each pattern matches an absolute home-directory prefix up to (but not
// including) the next path separator / whitespace / quote, so the remainder
// of the path is preserved. Username char class excludes separators, spaces,
// quotes, and shell/redirect metacharacters.
const USER = "[^\\\\/\\s\"'`<>|]+";
// Case-INSENSITIVE: Windows + macOS filesystems are case-insensitive, so a
// fact may carry `c:\users\you\…` or `/users/you`; the `i` flag keeps the
// privacy abstraction from being bypassed by lowercasing.
const HOME_PATH_PATTERNS = [
  new RegExp(`[A-Za-z]:[\\\\/]Users[\\\\/]${USER}`, 'gi'), // Windows C:\Users\name (either slash)
  new RegExp(`/Users/${USER}`, 'gi'), // macOS /Users/name
  new RegExp(`/home/${USER}`, 'gi'), // Linux /home/name
];

/**
 * Abstract absolute home-directory prefixes to `~`. Returns non-string input
 * unchanged (callers may pass undefined for optional fields).
 */
export function sanitizeHomePaths(text) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const re of HOME_PATH_PATTERNS) out = out.replace(re, '~');
  return out;
}

/**
 * Sanitize a string that is about to become a fact TITLE — and therefore the
 * fact's SLUG (`slugifyFact(title)`) and committed FILENAME + INDEX.md link.
 *
 * THE INVARIANT (F-V0.3.3-2, cut-blocker): a slug is derived from the title
 * BEFORE `writeFact` runs, and `writeFact` only sanitizes the body + the
 * frontmatter `title:` field — NOT the slug/filename. So anything still in the
 * title at slug-derivation time leaks into the COMMITTED FILENAME, which no
 * downstream sanitization can undo. Every caller that derives a slug from
 * user/Haiku text MUST route the title through THIS helper first, so the leak
 * class is closed in ONE place instead of being re-missed per call site
 * (cmk remember had it; auto-extract had the same bug — the comment there even
 * wrongly claimed "writeFact already sanitizes").
 *
 * Two transforms, both required, privacy-first:
 *   - sanitizePrivacyTags: strip `<private>…</private>` (v0.3.1 — a later
 *     80-char title slice that severs the closing tag defeats writeFact's regex).
 *   - sanitizeHomePaths: `C:\Users\<you>` → `~` (F-V0.3.3-2 — the username leak).
 * Privacy-first is the safe order: the private span (which may itself contain a
 * home path) is removed wholesale before homepath-sanitize ever sees a fragment.
 *
 * @param {string} s
 * @returns {string} the redacted + abstracted, trimmed string (safe to slug)
 */
export function sanitizeForTitle(s) {
  return sanitizeHomePaths(sanitizePrivacyTags(String(s).trim()));
}

/**
 * Escape every regex metacharacter in `s` so it can be embedded in a `RegExp`
 * as a LITERAL. Both callers build a pattern out of user/corpus-supplied text
 * (a name to scrub, a username to mask) — without this, a `.` or `(` in that
 * text silently changes what the pattern matches.
 *
 * Lives here rather than in a new one-function module: this file is the kit's
 * string-shaping home (sanitizeHomePaths / sanitizeForTitle), and it is a leaf,
 * so `deletion-propagation` gains a cheap import instead of pulling in the
 * whole pii-patterns chain. Shared per Task 241 (byte-identical in
 * deletion-propagation + pii-patterns).
 */
export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
