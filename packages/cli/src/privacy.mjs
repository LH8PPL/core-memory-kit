// Shared privacy-tag sanitizer (FR-15, design §6.6). Used by every
// disk-write hook handler (UserPromptSubmit, Stop) so the strip /
// preserve rules are byte-identical between the prompt-capture and
// turn-capture code paths.
//
// Contract:
//   - <private>...</private> blocks (multiline + multi-occurrence) are
//     REPLACED with the literal "[private content redacted]" placeholder.
//     The original content never reaches any disk path.
//   - <retain>...</retain> blocks are preserved VERBATIM (the tags
//     themselves are kept) — the auto-extract subagent downstream
//     uses them as force-save signals; stripping here would break
//     that contract.

const PRIVATE_RE = /<private>[\s\S]*?<\/private>/g;
export const REDACTED_PLACEHOLDER = '[private content redacted]';

export function sanitizePrivacyTags(text) {
  if (typeof text !== 'string' || text === '') return text;
  return text.replace(PRIVATE_RE, REDACTED_PLACEHOLDER);
}
