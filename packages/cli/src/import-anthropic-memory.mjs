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
import { canonicalize, generateId } from '../../canonicalize/src/index.mjs';
import {
  appendAuditEntry,
  nowIso,
  REASON_CODES,
} from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';

const MEMORY_REL = ['context', 'MEMORY.md'];

// Same slug pattern HC-8 uses (matches Python's
// `re.sub(r'[^a-zA-Z0-9]', '-', project_dir)`).
export function anthropicSlugFor(projectRoot) {
  return String(projectRoot).replace(/[^a-zA-Z0-9]/g, '-');
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

  // Append section to MEMORY.md.
  // M3 (skill-review 2026-05-28): same-day re-runs create a NEW section
  // header. Append-only is correct for audit fidelity; cosmetic
  // deduplication of section headers is a v0.1.x candidate per design §16.
  const today = ts.slice(0, 10);
  const sectionHeader = `\n## Imported (Anthropic auto-memory, ${today})\n`;
  const bulletLines = proposals.map((p) => `- (${p.id}) ${p.text}\n<!-- write_source: imported, trust: medium, source: anthropic-auto-memory, imported_at: ${ts} -->`).join('\n');
  mkdirSync(join(projectRoot, 'context'), { recursive: true });
  appendFileSync(targetPath, sectionHeader + '\n' + bulletLines + '\n', 'utf8');

  let accepted = 0;
  for (const p of proposals) {
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
    proposals,
    accepted,
    skipped: skippedDup,
    errors: 0,
    sourcePath,
    targetPath,
    duration_ms: Date.now() - t0,
  };
}
