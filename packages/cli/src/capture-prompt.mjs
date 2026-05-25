// UserPromptSubmit hook real handler (Task 19, T-016). Second Layer 4
// module — fires on every user prompt, sanitizes the privacy tags
// before any disk write, and appends to the daily transcript file.
//
// Public boundary: capturePrompt({payload, projectRoot, now}) → result.
// The bin wrapper deals with stdin parsing + protocol JSON; this
// module is pure-function-ish: takes the parsed payload + project
// root, produces the transcript file as a side effect.
//
// Privacy contract (FR-15, design §6.6):
//   - <private>...</private> blocks are REPLACED with the literal
//     "[private content redacted]" placeholder. The original content
//     never touches any disk path under the project.
//   - <retain>...</retain> blocks are preserved VERBATIM (including the
//     tags). The Stop hook + auto-extract subagent downstream uses
//     these tags as force-save signals; stripping them here would
//     break that contract.
//
// Transcript format:
//   ## <ISO timestamp> — user
//
//   <sanitized prompt body>
//
// One heading per turn so downstream tools can scan by ## markers
// (matches claude-remember's compaction strategy).

import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizePrivacyTags } from './privacy.mjs';

function dateFromIso(iso) {
  // Slice 'YYYY-MM-DD' from 'YYYY-MM-DDTHH:MM:SSZ'. Validating
  // upstream would be over-engineering — callers pass nowIso() or a
  // test fixture date.
  return String(iso).slice(0, 10);
}

export function capturePrompt({ payload, projectRoot, now } = {}) {
  if (!payload || typeof payload !== 'object') {
    return { action: 'noop', reason: 'no-payload' };
  }
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
  if (prompt === '') {
    return { action: 'noop', reason: 'empty-prompt' };
  }

  const ts = now ?? new Date().toISOString();
  const date = dateFromIso(ts);
  const transcriptsDir = join(projectRoot, 'context', 'transcripts');
  const transcriptPath = join(transcriptsDir, `${date}.md`);

  const sanitized = sanitizePrivacyTags(prompt);
  const entry = `## ${ts} — user\n\n${sanitized}\n\n`;

  if (!existsSync(transcriptsDir)) {
    mkdirSync(transcriptsDir, { recursive: true });
  }
  appendFileSync(transcriptPath, entry, 'utf8');

  return { action: 'appended', transcriptPath };
}
