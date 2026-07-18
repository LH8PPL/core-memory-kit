// `cmk import-anthropic-memory` (Task 38a, T-032).
//
// Public boundary:
//   async importAnthropicMemory({projectRoot, now, dryRun?, acceptAll?, harnessRoot?})
//     → {action, proposals, accepted, skipped, errors, duration_ms}
//
// Reads Anthropic's native auto-memory at
// `~/.claude/projects/<slug>/memory/MEMORY.md` (same slug pattern HC-8
// uses) and merges useful bullets into the project's MEMORY.md as
// `write_source: imported, trust: medium` entries.
//
// Dedup contract: a candidate whose canonicalize(text) collides with an
// existing entry in the project MEMORY.md is skipped. Audit-logged via
// the canonical appendAuditEntry shape with reasonCode IMPORT_SKIPPED_DUPLICATE.
// This is intentional — Anthropic's auto-memory and the kit's
// auto-extract often converge on the same facts; we don't want to
// silently double-write.
//
// Per design §11.2 + tasks.md 38a (38.1–38.5).
//
// B1 fix (Task 38 skill-review 2026-05-28): uses appendAuditEntry +
// REASON_CODES.IMPORT_* per CLAUDE.md "Shared modules" rule. Previous
// implementation wrote raw JSON to audit.log, missing schema/action/tier
// fields → re-introduced the format drift the I4 review codified.
// B2 fix: harnessRoot test-injection parameter mirrors discoverSessions.

import {
  appendFileSync, // platform-commands: ignore — used only for the in-place MEMORY.md append (not audit log; that goes through appendAuditEntry)
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { canonicalize, generateId } from '@lh8ppl/cmk-canonicalize';
import {
  appendAuditEntry,
  nowIso,
  REASON_CODES,
} from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { writeBullet } from './provenance.mjs';
import { hashContent } from './content-hash.mjs';
import { checkPoisonGuard, logPoisonGuardRejection } from './poison-guard.mjs';
import { sanitizeHomePaths } from './sanitize.mjs';
import { harnessSlugForPath } from './transcripts.mjs';

const MEMORY_REL = ['context', 'MEMORY.md'];

// Same slug pattern HC-8 uses (matches Python's
// `re.sub(r'[^a-zA-Z0-9]', '-', project_dir)`). Kept as the historical
// export name; the canonical rule lives in transcripts.mjs (Task 225 M6 —
// three inline copies consolidated to one).
export function anthropicSlugFor(projectRoot) {
  return harnessSlugForPath(projectRoot);
}

/**
 * Where to find Anthropic's auto-memory for a given project root.
 *
 * @param {string} projectRoot
 * @param {string} [harnessRoot]  override (test injection); defaults to ~/.claude/projects
 */
export function anthropicMemoryPath(projectRoot, harnessRoot) {
  const root = harnessRoot ?? join(homedir(), '.claude', 'projects');
  return join(root, anthropicSlugFor(projectRoot), 'memory', 'MEMORY.md');
}

// M2 (skill-review 2026-05-28): permissive regex accepts -/*/+ markers.
// Anthropic's MEMORY.md format isn't externally documented; the permissive
// match also pulls in list items from prose. v0.1.0 trade-off: noisy
// proposals are fine because --dry-run lets the user inspect first.
// TODO(v0.1.x): tighten if user feedback surfaces over-extraction noise.
function parseBullets(markdown) {
  const out = [];
  for (const line of markdown.split('\n')) {
    const m = /^\s*[-*+]\s+(.+?)\s*$/.exec(line);
    if (m && m[1].trim().length > 0) out.push(m[1].trim());
  }
  return out;
}

/**
 * Run the import pipeline.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {string} [opts.now]
 * @param {boolean} [opts.dryRun]  print proposals; no file modified
 * @param {boolean} [opts.acceptAll]  apply every proposal (non-interactive path; in v0.1.0 the CLI either does --dry-run OR --yes-accept-all; interactive y/N is a v0.1.x candidate per design §16)
 * @param {string} [opts.harnessRoot]  override (test injection); defaults to ~/.claude/projects
 * @returns {Promise<object>}
 */
export async function importAnthropicMemory({
  projectRoot,
  now,
  dryRun = false,
  acceptAll = false,
  harnessRoot,
} = {}) {
  const ts = now ?? nowIso();
  const t0 = Date.now();

  if (!projectRoot) {
    return errorResult({
      category: ERROR_CATEGORIES.MISSING_PROJECT_ROOT,
      errors: ['projectRoot is required'],
      duration_ms: Date.now() - t0,
    });
  }

  const sourcePath = anthropicMemoryPath(projectRoot, harnessRoot);
  if (!existsSync(sourcePath)) {
    return {
      action: 'completed',
      proposals: [],
      accepted: 0,
      skipped: 0,
      errors: 0,
      reason: 'no-source',
      sourcePath,
      duration_ms: Date.now() - t0,
    };
  }

  let sourceText;
  try {
    sourceText = readFileSync(sourcePath, 'utf8');
  } catch (err) {
    return {
      action: 'completed',
      proposals: [],
      accepted: 0,
      skipped: 0,
      errors: 1,
      reason: `read-source-failed: ${err?.message ?? err}`,
      sourcePath,
      duration_ms: Date.now() - t0,
    };
  }

  // Read existing project MEMORY.md for dedup (canonicalize each bullet).
  const targetPath = join(projectRoot, ...MEMORY_REL);
  const existingCanonical = new Set();
  if (existsSync(targetPath)) {
    try {
      const existing = readFileSync(targetPath, 'utf8');
      for (const bullet of parseBullets(existing)) {
        existingCanonical.add(canonicalize(bullet));
      }
    } catch {
      // best-effort: empty set means we treat everything as new
    }
  }

  const sourceBullets = parseBullets(sourceText);
  const proposals = [];
  let skippedDup = 0;
  const tierRoot = join(projectRoot, 'context');
  for (const bullet of sourceBullets) {
    const canonical = canonicalize(bullet);
    if (!canonical) continue;
    const id = generateId('P', bullet);
    if (existingCanonical.has(canonical)) {
      skippedDup += 1;
      try {
        appendAuditEntry(tierRoot, {
          ts,
          action: 'import',
          tier: 'P',
          id,
          reasonCode: REASON_CODES.IMPORT_SKIPPED_DUPLICATE,
          extra: { source: 'anthropic-auto-memory' },
        });
      } catch {
        // best-effort — never block the import flow on audit-log failure
      }
      continue;
    }
    proposals.push({ text: bullet, canonical, id });
  }

  // Dry-run: report proposals + don't touch files.
  if (dryRun) {
    return {
      action: 'completed',
      mode: 'dry-run',
      proposals,
      accepted: 0,
      skipped: skippedDup,
      errors: 0,
      sourcePath,
      targetPath,
      duration_ms: Date.now() - t0,
    };
  }

  // Apply mode: write each proposal as a new bullet under an
  // `## Imported (Anthropic auto-memory, YYYY-MM-DD)` section.
  if (!acceptAll && proposals.length > 0) {
    // v0.1.0 has no interactive prompt at this layer — the CLI handler
    // is responsible for the readline flow if it wants one. v0.1.0
    // requires explicit `--yes` to apply.
    return {
      action: 'completed',
      mode: 'requires-confirmation',
      proposals,
      accepted: 0,
      skipped: skippedDup,
      errors: 0,
      sourcePath,
      targetPath,
      duration_ms: Date.now() - t0,
    };
  }

  if (proposals.length === 0) {
    return {
      action: 'completed',
      mode: 'apply',
      proposals: [],
      accepted: 0,
      skipped: skippedDup,
      errors: 0,
      sourcePath,
      targetPath,
      duration_ms: Date.now() - t0,
    };
  }

  // Poison_Guard + home-path screen (D-312 — the security-review side-door
  // finding): this importer launders content from Anthropic's native
  // auto-memory (a DIFFERENT tool context) straight into the committed,
  // git-pushed context/MEMORY.md. The sibling import-claude-md screens; this
  // one never did. Screen each proposal's text: home-path-sanitize (so an
  // imported absolute path doesn't ship the username) then Poison_Guard —
  // a secret/injection hit DROPS that bullet (logged, redacted), the clean
  // ones proceed. A dropped bullet counts as skipped, not an error.
  let skippedPoison = 0;
  const screened = [];
  for (const p of proposals) {
    const sanitizedText = sanitizeHomePaths(p.text);
    const guard = checkPoisonGuard(sanitizedText);
    if (guard.rejected) {
      skippedPoison += 1;
      if (guard.pattern_id !== 'schema') {
        logPoisonGuardRejection({
          projectRoot,
          ts,
          pattern_id: guard.pattern_id,
          source_file: 'import-anthropic-memory',
          source_line: 1,
          redacted_excerpt: guard.redacted_excerpt,
        });
      }
      continue;
    }
    screened.push({ ...p, text: sanitizedText });
  }
  if (screened.length === 0) {
    return {
      action: 'completed',
      mode: 'apply',
      proposals: [],
      accepted: 0,
      skipped: skippedDup + skippedPoison,
      errors: 0,
      sourcePath,
      targetPath,
      duration_ms: Date.now() - t0,
    };
  }
  // From here `screened` is the accept set (const `proposals` is the pre-screen
  // list; use `screened` for the write + audit loop so the drop is honored).
  const accepted_proposals = screened;

  // Append section to MEMORY.md.
  // M3 (skill-review 2026-05-28): same-day re-runs create a NEW section
  // header. Append-only is correct for audit fidelity; cosmetic
  // deduplication of section headers is a v0.1.x candidate per design §16.
  const today = ts.slice(0, 10);
  const sectionHeader = `\n## Imported (Anthropic auto-memory, ${today})\n`;
  // Task 138 (D-125): emit the CANONICAL provenance comment via the shared
  // writeBullet builder — the hand-rolled `write_source:`-keyed comment was
  // invisible to the reindex parser (it maps the `write:` key to the
  // NOT-NULL observations.write_source column), so the first reindex after
  // an import failed and search degraded to the stale index (cut-gate9 F-13).
  const bulletLines = accepted_proposals
    .map((p) => {
      const sha1 = hashContent(p.text);
      const formatted = writeBullet({
        id: p.id,
        text: p.text,
        provenance: {
          source: 'anthropic-auto-memory',
          source_line: 1,
          sha1,
          write: 'imported',
          trust: 'medium',
          at: ts,
        },
      });
      return formatted.lines;
    })
    .join('\n');
  mkdirSync(join(projectRoot, 'context'), { recursive: true });
  // Lint-clean append (MD022): guarantee exactly one blank line ABOVE the
  // `## Imported …` heading when the target file already has content (the
  // leading `\n` in sectionHeader assumes the file ends in `\n` — fragile if it
  // doesn't). The blank below the heading is the `+ '\n'` after sectionHeader.
  let prefix = '';
  if (existsSync(targetPath)) {
    const existing = readFileSync(targetPath, 'utf8');
    if (existing.trim() !== '') {
      prefix = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '' : '\n';
    }
  }
  // sectionHeader already starts with `\n`, so a file ending in `\n` yields the
  // needed blank line; prefix adds the missing one only when the file lacks a
  // trailing newline.
  appendFileSync(targetPath, prefix + sectionHeader + '\n' + bulletLines + '\n', 'utf8');

  let accepted = 0;
  for (const p of accepted_proposals) {
    accepted += 1;
    try {
      appendAuditEntry(tierRoot, {
        ts,
        action: 'import',
        tier: 'P',
        id: p.id,
        reasonCode: REASON_CODES.IMPORT_APPLIED,
        extra: {
          source: 'anthropic-auto-memory',
          trust: 'medium',
          write_source: 'imported',
        },
      });
    } catch {
      // best-effort
    }
  }

  return {
    action: 'completed',
    mode: 'apply',
    proposals: accepted_proposals,
    accepted,
    skipped: skippedDup + skippedPoison,
    errors: 0,
    sourcePath,
    targetPath,
    duration_ms: Date.now() - t0,
  };
}
