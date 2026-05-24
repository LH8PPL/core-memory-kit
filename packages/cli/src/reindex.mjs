import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const VALID_TIERS = new Set(['U', 'P', 'L']);
const INDEX_SIZE_WARN_BYTES = 25 * 1024;
const HOOK_MAX_LEN = 80;

const TIER_LABEL = {
  P: 'project tier',
  L: 'local tier',
  U: 'user tier',
};

function resolveTierRoot({ tier, projectRoot, userDir }) {
  if (tier === 'P') return join(projectRoot ?? process.cwd(), 'context');
  if (tier === 'L') return join(projectRoot ?? process.cwd(), 'context.local');
  return (
    userDir ??
    process.env.MEMORY_KIT_USER_DIR ??
    join(homedir(), '.claude-memory-kit')
  );
}

function resolveFactDir(tier, tierRoot) {
  return tier === 'U' ? join(tierRoot, 'fragments') : join(tierRoot, 'memory');
}

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: null, body: text };
  const fm = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    fm[key] = value;
  }
  return { frontmatter: fm, body: m[2] ?? '' };
}

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

function formatIndexLine({ id, type, title, filename, hook }) {
  const head = `- (${id}) [${type}] [${title}](${filename})`;
  return hook ? `${head} — ${hook}` : head;
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
  return out.sort();
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
    const { frontmatter, body } = parseFrontmatter(text);
    if (!frontmatter) {
      pushWarning(`reindex: ${filename} skipped — no YAML frontmatter`);
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
