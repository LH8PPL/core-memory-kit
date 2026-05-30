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
