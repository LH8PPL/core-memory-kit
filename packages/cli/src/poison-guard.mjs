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

export function checkPoisonGuard(text) {
  if (typeof text !== 'string') {
    return {
      rejected: true,
      pattern_id: 'schema',
      redacted_excerpt: '',
    };
  }
  for (const { id, re } of ALL_PATTERNS) {
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
