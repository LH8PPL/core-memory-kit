// Granular-archive pointer-index writer (Task 8, refactored in
// cleanup-layer-2-cross-module-drift). Single public boundary:
// reindex(opts) → result. See design §2.3.
//
// Uses shared modules: tier-paths (path resolution), frontmatter (js-yaml
// parse). See CLAUDE.md "Shared modules" rule.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { VALID_TIERS, resolveTierRoot, resolveFactDir } from './tier-paths.mjs';
import { parse } from './frontmatter.mjs';

const INDEX_SIZE_WARN_BYTES = 25 * 1024;
const HOOK_MAX_LEN = 80;

const TIER_LABEL = {
  P: 'project tier',
  L: 'local tier',
  U: 'user tier',
};

function extractHook(body) {
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    if (line.length > HOOK_MAX_LEN) {
      return line.slice(0, HOOK_MAX_LEN).trimEnd() + '...';
    }
    return line;
  }
  return '';
}

// Wrap any bare http(s):// URL in angle brackets so it doesn't trip markdownlint
// MD034 (no-bare-urls) when the INDEX ships in a user's committed repo. A URL
// already inside `<…>` or `](…)` is left alone (the char before it isn't `<`/`(`).
function autolinkBareUrls(text) {
  return text.replace(/(^|[^<(])\b(https?:\/\/[^\s<>)\]]+)/g, '$1<$2>');
}

function formatIndexLine({ id, type, title, filename, hook }) {
  // Lint-clean the rendered INDEX line:
  //   - the title goes inside `[title]` link text: trim + collapse internal
  //     whitespace so a trailing space before `]` doesn't trip MD039
  //     (no-space-in-links).
  //   - the hook is trailing prose: wrap bare URLs (MD034).
  const linkTitle = String(title ?? '').replace(/\s+/g, ' ').trim();
  const head = `- (${id}) [${type}] [${linkTitle}](${filename})`;
  return hook ? `${head} — ${autolinkBareUrls(hook)}` : head;
}

function listFactFiles(factDir) {
  if (!existsSync(factDir)) return [];
  const out = [];
  for (const entry of readdirSync(factDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (entry.name === 'INDEX.md') continue;
    out.push(entry.name);
  }
  // Explicit code-unit comparator (sonar S2871). These filenames order INDEX.md,
  // a COMMITTED file — locale-dependent collation would make the same corpus
  // produce different diffs on different machines.
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function reindex(opts = {}) {
  const { tier, projectRoot, userDir, warn } = opts;
  if (!tier || !VALID_TIERS.has(tier)) {
    throw new Error(
      `reindex: invalid tier ${JSON.stringify(tier)}. Must be 'U', 'P', or 'L'.`,
    );
  }
  const emit = warn ?? ((msg) => process.stderr.write(msg + '\n'));
  const warnings = [];
  function pushWarning(msg) {
    warnings.push(msg);
    emit(msg);
  }

  const tierRoot = resolveTierRoot({ tier, projectRoot, userDir });
  const factDir = resolveFactDir(tier, tierRoot);
  mkdirSync(factDir, { recursive: true });

  const entries = [];
  for (const filename of listFactFiles(factDir)) {
    const path = join(factDir, filename);
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch (e) {
      pushWarning(`reindex: failed to read ${filename}: ${e.message}`);
      continue;
    }
    const { frontmatter, body, parseError } = parse(text);
    if (!frontmatter) {
      pushWarning(
        `reindex: ${filename} skipped — ${parseError ?? 'no YAML frontmatter'}`,
      );
      continue;
    }
    if (!frontmatter.id || !frontmatter.type || !frontmatter.title) {
      pushWarning(
        `reindex: ${filename} skipped — missing required frontmatter field(s) (id/type/title)`,
      );
      continue;
    }
    if (frontmatter.deleted_at) continue;
    entries.push({
      id: frontmatter.id,
      type: frontmatter.type,
      title: frontmatter.title,
      filename,
      hook: extractHook(body),
    });
  }

  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const header = `# Granular memory index — ${TIER_LABEL[tier]}\n\n## Files\n`;
  const bodyLines = entries.map(formatIndexLine).join('\n');
  const content = entries.length
    ? `${header}\n${bodyLines}\n`
    : `${header}\n`;

  const indexPath = join(factDir, 'INDEX.md');
  writeFileSync(indexPath, content, 'utf8');

  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > INDEX_SIZE_WARN_BYTES) {
    pushWarning(
      `reindex: ${indexPath} is ${(bytes / 1024).toFixed(1)} KB (>25 KB); consider consolidation`,
    );
  }

  return {
    tier,
    indexPath,
    factCount: entries.length,
    bytes,
    warnings,
  };
}
