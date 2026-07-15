// Poison_Guard — pre-write secret + injection filter (Task 24.5, T-021).
//
// The kit's last line of defense before any auto-extracted or
// user-explicit fact is written to a project-tier or user-tier file
// that may end up in git. False negatives = credentials in the repo.
// False positives = legitimate writes blocked. Pattern correctness
// has to be right (design §6.7).
//
// Public boundary:
//   checkPoisonGuard(text) → {
//     rejected: boolean,
//     pattern_id: string | null,    // category id; null if rejected:false
//     redacted_excerpt: string,     // safe-for-logging excerpt; masks matched text with ***
//   }
//
// Pattern catalog per design §6.7. The catalog is intentionally
// conservative — see the design note "Why discoverability-only, not
// perfect prevention": the threat model is "accidental commit", not
// "active adversary in your repo." Regex catches the high-frequency
// mistakes; secret-scanners (gitleaks, trufflehog) are the second
// line of defense, not us.
//
// Redaction contract (security-load-bearing):
//   - The matched secret/injection text MUST NEVER appear in
//     redacted_excerpt in cleartext. The whole point of this module
//     is to keep secrets out of logs. Every pattern in this catalog
//     must produce a redacted excerpt that masks the match span
//     with `***`. Unit tests pin this contract.
//   - The excerpt is bounded in length (≤ ~200 chars) so a long
//     pasted blob doesn't blow up the log line.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { nowIso } from './audit-log.mjs';

// Task 70.4 — the invisible / zero-width / bidi code points, listed EXPLICITLY
// (no literal invisible chars in source — those are unreadable + editor-mangleable).
// Built into a regex char-class via `String.fromCodePoint` at module load.
// THE canonical invisible-codepoint catalog — exported so §6.10's L1 mask
// (pii-patterns.mjs) derives its strip-set from THIS list. Task 231 skill-
// review finding 1: the two modules each kept their own list and drifted —
// the mask knew the invisible math operators (U+2062–64), the guard didn't,
// so the silent-strip-and-write bypass survived for exactly those three
// codepoints. One list, one owner (the security screen), no drift.
export const INVISIBLE_UNICODE_CODEPOINTS = Object.freeze([
  0x00ad, // soft hyphen
  0x061c, // Arabic letter mark
  0x180e, // Mongolian vowel separator
  0x200b, 0x200c, 0x200d, // zero-width space / non-joiner / joiner
  0x2060, // word joiner
  0x2062, 0x2063, 0x2064, // invisible times / separator / plus
  0x2066, 0x2067, 0x2068, 0x2069, // bidi isolates: LRI / RLI / FSI / PDI
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, // bidi embeds/overrides: LRE/RLE/PDF/LRO/RLO
  0xfeff, // BOM / zero-width no-break space
]);
function buildInvisibleUnicodeRe() {
  const cls = INVISIBLE_UNICODE_CODEPOINTS.map((cp) => `\\u${cp.toString(16).padStart(4, '0')}`).join('');
  return new RegExp(`[${cls}]`);
}
const INVISIBLE_UNICODE_RE = buildInvisibleUnicodeRe();

// --- Pattern catalog -------------------------------------------------
// Each pattern is { id, re, category }. The id is the stable
// machine-parseable name that shows up in poison-guard.log NDJSON +
// extract.log error_category disambiguation. The re is the
// case-insensitive regex; category is 'secret' or 'injection' so the
// downstream categorizer can route into POISON_GUARD_CATEGORIES.
//
// Conservative-on-purpose. Adding a pattern is a write — adding a
// pattern that has false positives is a denial-of-service against
// legitimate user input. Each pattern should be vetted against
// realistic adversarial samples AND against realistic benign user
// content.
const SECRET_PATTERNS = [
  // AWS access key id — fixed prefix (AKIA/ASIA/AGPA + various) + 16
  // additional uppercase alphanumeric. The prefix is required to
  // avoid matching arbitrary 20-char alphanumeric blobs.
  {
    id: 'secret_aws_access_key_id',
    category: 'secret',
    re: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[A-Z0-9]{16}\b/,
  },
  // AWS secret access key in a key=value shape. The value pattern is
  // intentionally lenient (40-char Base64-ish) because real AWS secret
  // keys are 40 chars of Base64. We require the `aws_secret` token
  // nearby to gate on intent.
  {
    id: 'secret_aws_secret_access_key',
    category: 'secret',
    re: /(?:aws[_-]?secret[_-]?(?:access[_-]?)?key)[\s:=]+["']?[A-Za-z0-9/+=]{16,}/i,
  },
  // Generic api_key / secret / password / passwd / token / bearer
  // in a key=value shape. 20-char minimum on the value catches
  // realistic key shapes without flagging short test fixtures
  // (api_key=abc123 → only 6 chars, skipped).
  {
    id: 'secret_generic_credential',
    category: 'secret',
    re: /(?:api[_-]?key|secret|password|passwd|token|bearer)[\s:=]+["']?[A-Za-z0-9_\-/+=]{20,}/i,
  },
  // PEM private key armor. The "RSA "/"EC "/"OPENSSH "/"PGP "
  // variants are optional, so plain `-----BEGIN PRIVATE KEY-----`
  // also matches.
  {
    id: 'secret_pem_private_key',
    category: 'secret',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA |ENCRYPTED )?PRIVATE KEY-----/,
  },
  // GitHub personal access token: ghp_ prefix + 36 alphanumeric.
  // No trailing \b — adjacent alphanumeric padding (in tests; rare in
  // real input but possible) shouldn't suppress detection. Leading \b
  // is enough to prevent matching mid-identifier (e.g. "xghp_..." is
  // not a token).
  {
    id: 'secret_github_pat',
    category: 'secret',
    re: /\bghp_[A-Za-z0-9]{36}/,
  },
  // Task 134: the other GitHub token classes — OAuth (gho_), user-to-server
  // (ghu_), server-to-server (ghs_), refresh (ghr_). Same ghp_ shape (prefix
  // + 36 alnum); the 36-char floor is what keeps "ghost"/"ghs config" prose
  // out (a real English word can't reach prefix+36 alphanumerics).
  {
    id: 'secret_github_token',
    category: 'secret',
    re: /\bgh[ousr]_[A-Za-z0-9]{36}/,
  },
  // GitHub fine-grained PAT: github_pat_ + 82 chars of [A-Za-z0-9_]
  // (GitHub's documented detection regex; the token is the 11-char prefix +
  // 82-char body = 93 total. The body's internal underscore placement is not
  // contractually fixed, so match the whole-body class rather than a
  // prefix_body split — verified against GitHub Docs + GitGuardian's
  // detector, 2026-06-13).
  {
    id: 'secret_github_fine_grained_pat',
    category: 'secret',
    re: /\bgithub_pat_[A-Za-z0-9_]{82}/,
  },
  // Stripe secret keys: sk_live_ / rk_live_ (restricted) + 24+ alnum. The
  // _live_ infix + the floor keep benign "sk_" / "Stripe" prose out.
  {
    id: 'secret_stripe_key',
    category: 'secret',
    re: /\b[sr]k_live_[A-Za-z0-9]{24,}/,
  },
  // Google API key: AIza + 35 of [A-Za-z0-9_-] (39 total — the documented
  // length). The 4-char prefix alone is harmless prose ("AIza" mentioned);
  // the 35-char body is the gate.
  {
    id: 'secret_google_api_key',
    category: 'secret',
    re: /\bAIza[A-Za-z0-9_-]{35}\b/,
  },
  // GitLab personal access token: glpat- + 20+ alnum/dash/underscore.
  {
    id: 'secret_gitlab_pat',
    category: 'secret',
    re: /\bglpat-[A-Za-z0-9_-]{20,}/,
  },
  // npm access token: npm_ + 36 alnum (the modern granular/automation shape).
  {
    id: 'secret_npm_token',
    category: 'secret',
    re: /\bnpm_[A-Za-z0-9]{36}/,
  },
  // Hugging Face access token: hf_ + 34+ alnum (kit-relevant — the semantic
  // install pulls models from HF; a leaked hf_ token in a captured fact is
  // a real risk). The 34-char floor keeps "hf"/"half" prose out.
  {
    id: 'secret_huggingface_token',
    category: 'secret',
    re: /\bhf_[A-Za-z0-9]{34,}/,
  },
  // OpenAI / Anthropic style keys. sk- prefix + optional ant-/proj-
  // qualifier + ≥40 chars of alphanumeric/dash/underscore.
  {
    id: 'secret_openai_anthropic_key',
    category: 'secret',
    re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{40,}/,
  },
  // Slack tokens: xoxb-/xoxp-/xoxs- prefix + 10+ alphanumeric/dash.
  {
    id: 'secret_slack_token',
    category: 'secret',
    re: /\bxox[bps]-[A-Za-z0-9-]{10,}/,
  },
];

const INJECTION_PATTERNS = [
  // "ignore (all|any|previous|prior)* (instructions|prompts|rules)"
  // Qualifier words are zero-or-more so all of these match:
  //   "ignore instructions"
  //   "ignore previous instructions"
  //   "ignore all previous instructions"  (two qualifiers stacked)
  //   "IGNORE ALL PREVIOUS INSTRUCTIONS"  (case-insensitive)
  // The earlier `?` form only allowed ONE qualifier and missed the
  // most common phrasing.
  {
    id: 'injection_ignore_instructions',
    category: 'injection',
    re: /ignore (?:all |any |previous |prior )*(?:instructions?|prompts?|rules?)/i,
  },
  // "You are now [an AI role]" — role-override attempt.
  // Earlier draft was `/you are now (?:a |an |the )?[A-Za-z]/i` which
  // matched ANY sentence starting "you are now <word>" — including
  // benign content like "you are now able to ship", "you are now
  // blocked on the API", "you are now responsible for X". False
  // positives there = denial-of-service on legitimate memory writes.
  // Tightened to require an explicit role-impersonation noun, with
  // the optional adjective slot still capturing "you are now a
  // helpful pirate assistant" / "you are now a different agent".
  {
    id: 'injection_role_override',
    category: 'injection',
    re: /you are now (?:a |an |the )?(?:[a-z]+ ){0,3}(?:assistant|chatbot|ai|bot|pirate|agent|expert|persona|model|gpt|claude)/i,
  },
  // Fake role tags. Closing or opening <system> / <assistant> tag
  // in user-supplied content suggests an injection attempt.
  {
    id: 'injection_fake_role_tag',
    category: 'injection',
    re: /<\/?(?:system|assistant)>/i,
  },
  // "disregard the above" — common injection lead-in.
  {
    id: 'injection_disregard_above',
    category: 'injection',
    re: /disregard the above/i,
  },
  // Task 70.4 — invisible / zero-width / bidi Unicode. A hidden-instruction
  // vector: characters invisible to a human reviewer can smuggle text past the
  // eye AND past the other patterns, then ship with `git clone` in committed
  // memory. The set (Hermes parity + the Trojan-Source bidi class — kiro-design
  // §699 / kiro-requirements):
  //   • zero-width: U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ, U+2060 word-joiner,
  //     U+FEFF BOM/ZWNBSP
  //   • bidi controls (Trojan-Source): U+202A–U+202E (LRE/RLE/PDF/LRO/RLO),
  //     U+2066–U+2069 (LRI/RLI/FSI/PDI)
  //   • other invisibles: U+00AD soft hyphen, U+061C Arabic letter mark,
  //     U+180E Mongolian vowel separator
  // NOT included: ordinary whitespace (space/tab/newline) — those are visible
  // structure, not a hidden vector, so legitimate prose never false-positives.
  // Implemented as a Unicode-property + explicit-codepoint class via the
  // `buildInvisibleUnicodeRe()` helper below (NOT literal invisible chars inline,
  // which would be unreadable + editor-mangleable). Verified to match exactly the
  // 17 code points listed above with zero false positives on whitespace / ASCII /
  // accents / CJK / emoji.
  {
    id: 'injection_invisible_unicode',
    category: 'injection',
    re: INVISIBLE_UNICODE_RE,
  },
];

const ALL_PATTERNS = [...SECRET_PATTERNS, ...INJECTION_PATTERNS];

// Frozen enum of pattern ids grouped by category. Callers import this
// to validate routing logic without depending on the internal pattern
// array order.
export const POISON_GUARD_CATEGORIES = Object.freeze({
  SECRET_CATEGORIES: Object.freeze(SECRET_PATTERNS.map((p) => p.id)),
  INJECTION_CATEGORIES: Object.freeze(INJECTION_PATTERNS.map((p) => p.id)),
});

// Redaction parameters. The excerpt window around the match should be
// small enough to fit in a log line but large enough to give a human
// auditor enough context to act on (e.g., recognize "that was the
// AWS_SECRET line in my terraform output").
const REDACTION_CONTEXT_CHARS = 30;
const REDACTION_MASK = '***';

function redactExcerpt(text, matchStart, matchLength) {
  const ctxStart = Math.max(0, matchStart - REDACTION_CONTEXT_CHARS);
  const ctxEnd = Math.min(
    text.length,
    matchStart + matchLength + REDACTION_CONTEXT_CHARS,
  );
  const before = text.slice(ctxStart, matchStart);
  const after = text.slice(matchStart + matchLength, ctxEnd);
  const prefix = ctxStart > 0 ? '...' : '';
  const suffix = ctxEnd < text.length ? '...' : '';
  return `${prefix}${before}${REDACTION_MASK}${after}${suffix}`;
}

function matchPatterns(text, patterns) {
  for (const { id, re } of patterns) {
    const m = text.match(re);
    if (m) {
      return {
        rejected: true,
        pattern_id: id,
        redacted_excerpt: redactExcerpt(text, m.index, m[0].length),
      };
    }
  }
  return {
    rejected: false,
    pattern_id: null,
    redacted_excerpt: '',
  };
}

export function checkPoisonGuard(text) {
  if (typeof text !== 'string') {
    return {
      rejected: true,
      pattern_id: 'schema',
      redacted_excerpt: '',
    };
  }
  return matchPatterns(text, ALL_PATTERNS);
}

// --- NDJSON logger (Task 24.6, design §6.7) -------------------------
//
// One line per rejection at <projectRoot>/context/.locks/
// poison-guard.log. Schema documented in design §6.7:
//   {ts, pattern_id, source_file, source_line, action: "rejected",
//    redacted_excerpt}
//
// The cleartext that triggered the rejection is INTENTIONALLY absent
// from this log line. The caller produces redacted_excerpt via
// checkPoisonGuard() and passes it in. Tests pin that no field
// named raw_text / unredacted / matched_text / original ever appears.

const POISON_GUARD_LOG_RELATIVE = ['context', '.locks', 'poison-guard.log'];

export function logPoisonGuardRejection({
  projectRoot,
  ts,
  pattern_id,
  source_file,
  source_line,
  redacted_excerpt,
} = {}) {
  const logPath = join(projectRoot, ...POISON_GUARD_LOG_RELATIVE);
  if (!existsSync(dirname(logPath))) {
    mkdirSync(dirname(logPath), { recursive: true });
  }
  const entry = {
    ts,
    pattern_id,
    source_file,
    source_line,
    action: 'rejected',
    redacted_excerpt,
  };
  appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  return logPath;
}

// --- screenBeforeCommittedWrite (Task 216, D-320) -------------------------
//
// The Poison_Guard side-door fix. checkPoisonGuard is one well-built chokepoint
// on the DIRECT write path (write-fact / memory-write), but LLM-GENERATED
// (weekly-curate / daily-distill summaries) and EXTERNALLY-SOURCED (imports,
// transcript promotion, persona-review queue) content reaches committed tiers
// through side doors that skipped it — a secret pasted in conversation survives
// summarization/promotion verbatim into a git-committed file. This helper is
// the ONE call those sites share: screen `text`; if a secret/injection pattern
// hits, log the redacted rejection (best-effort — a log failure never blocks
// the decision) and return {rejected:true}; otherwise {rejected:false}. The
// CALLER decides what "rejected" means for its shape (drop the bullet, skip the
// promotion, hold the day) — this helper only screens + logs, matching the
// write-fact reference pattern.
//
// @param {string} text - the content about to reach a committed tier.
// @param {object} opts
// @param {string} opts.projectRoot - for the rejection log path.
// @param {string} opts.source - a source_file label for the log (e.g.
//   'weekly-curate', 'transcript-promote') so a rejection is traceable.
// @param {string} [opts.ts] - timestamp for the log entry.
// @param {string} [opts.scope] - 'all' (default) or 'secrets'. The transcript
//   tier uses 'secrets': a committed transcript is a verbatim RECORD, never
//   injected into context (search-last-resort only; the read-side defense is
//   the inject-time re-scan, Task 70), and full-catalog injection patterns
//   would routinely withhold transcripts of any repo that DISCUSSES prompt
//   injection (this dogfood repo quotes those phrases daily). Skill-review
//   finding 3, decision recorded in D-320.
// @returns {{rejected: boolean, pattern_id: string|null, redacted_excerpt: string}}
export function screenBeforeCommittedWrite(text, { projectRoot, source, ts, scope = 'all' } = {}) {
  const guard = scope === 'secrets'
    ? matchPatterns(String(text ?? ''), SECRET_PATTERNS)
    : checkPoisonGuard(String(text ?? ''));
  if (guard.rejected && guard.pattern_id !== 'schema' && projectRoot) {
    try {
      logPoisonGuardRejection({
        projectRoot,
        ts: ts ?? nowIso(),
        pattern_id: guard.pattern_id,
        source_file: source ?? 'committed-write',
        source_line: 1,
        redacted_excerpt: guard.redacted_excerpt,
      });
    } catch {
      // best-effort log — never let a logging failure change the screen verdict.
    }
  }
  return guard;
}
