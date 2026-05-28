// `cmk import-anthropic-memory` (Task 38a, T-032).
//
// Public boundary:
//   async importAnthropicMemory({projectRoot, userDir, now, dryRun?, acceptAll?})
//     → {action, proposals, accepted, skipped, errors, duration_ms}
//
// Reads Anthropic's native auto-memory at
// `~/.claude/projects/<slug>/memory/MEMORY.md` (same slug pattern HC-8
// uses) and merges useful bullets into the project's MEMORY.md as
// `write_source: imported, trust: medium` entries.
//
// Dedup contract: a candidate whose canonicalize(text) collides with an
// existing entry in the project MEMORY.md is skipped. Audit-logged as
// `skipped: duplicate`. This is intentional — Anthropic's auto-memory
// and the kit's auto-extract often converge on the same facts; we don't
// want to silently double-write.
//
// Per design §11.2 + tasks.md 38a (38.1–38.5).

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { canonicalize, generateId } from '../../canonicalize/src/index.mjs';
import { nowIso } from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';

const MEMORY_REL = ['context', 'MEMORY.md'];
const AUDIT_REL = ['context', '.locks', 'audit.log'];

// Same slug pattern HC-8 uses (matches Python's
// `re.sub(r'[^a-zA-Z0-9]', '-', project_dir)`).
export function anthropicSlugFor(projectRoot) {
  return String(projectRoot).replace(/[^a-zA-Z0-9]/g, '-');
}

export function anthropicMemoryPath(projectRoot) {
  return join(homedir(), '.claude', 'projects', anthropicSlugFor(projectRoot), 'memory', 'MEMORY.md');
}

function parseBullets(markdown) {
  // Very permissive: any line starting with `-` or `*` is a bullet.
  // Strip leading marker + leading whitespace.
  const out = [];
  for (const line of markdown.split('\n')) {
    const m = /^\s*[-*+]\s+(.+?)\s*$/.exec(line);
    if (m && m[1].trim().length > 0) out.push(m[1].trim());
  }
  return out;
}

function writeAuditEntry({ projectRoot, entry }) {
  const path = join(projectRoot, ...AUDIT_REL);
  try {
    mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });
    appendFileSync(path, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // best-effort
  }
}

/**
 * Run the import pipeline.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {string} [opts.userDir]
 * @param {string} [opts.now]
 * @param {boolean} [opts.dryRun]  print proposals; no file modified
 * @param {boolean} [opts.acceptAll]  apply every proposal (non-interactive path; in v0.1.0 the CLI either does --dry-run OR --yes-accept-all; interactive y/N is a v0.1.x candidate per design §16)
 * @returns {Promise<object>}
 */
export async function importAnthropicMemory({
  projectRoot,
  userDir,
  now,
  dryRun = false,
  acceptAll = false,
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

  const sourcePath = anthropicMemoryPath(projectRoot);
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
  for (const bullet of sourceBullets) {
    const canonical = canonicalize(bullet);
    if (!canonical) continue;
    if (existingCanonical.has(canonical)) {
      skippedDup += 1;
      writeAuditEntry({
        projectRoot,
        entry: {
          ts,
          reason: 'import-skipped-duplicate',
          source: 'import-anthropic-memory',
          canonical_id: generateId('P', bullet),
        },
      });
      continue;
    }
    proposals.push({
      text: bullet,
      canonical,
      id: generateId('P', bullet),
    });
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
  const today = ts.slice(0, 10);
  const sectionHeader = `\n## Imported (Anthropic auto-memory, ${today})\n`;
  const bulletLines = proposals.map((p) => `- (${p.id}) ${p.text}\n<!-- write_source: imported, trust: medium, source: anthropic-auto-memory, imported_at: ${ts} -->`).join('\n');
  mkdirSync(join(projectRoot, 'context'), { recursive: true });
  appendFileSync(targetPath, sectionHeader + '\n' + bulletLines + '\n', 'utf8');

  let accepted = 0;
  for (const p of proposals) {
    accepted += 1;
    writeAuditEntry({
      projectRoot,
      entry: {
        ts,
        reason: 'import-applied',
        source: 'import-anthropic-memory',
        canonical_id: p.id,
        trust: 'medium',
        write_source: 'imported',
      },
    });
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
