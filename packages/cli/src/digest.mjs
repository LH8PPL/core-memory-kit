// `cmk digest` — a regenerated, readable render of everything the kit currently
// knows (Task 147, D-132). Facts by type + the persona + active threads, as one
// markdown page. The README-demo artifact.
//
// REGENERATED (not append-only): unlike DECISIONS.md (the permanent journal),
// the digest is a CURRENT-KNOWLEDGE snapshot — it should reflect only what
// exists now, so it is rebuilt on every invocation (the INDEX.md lifecycle,
// correct here). The two surfaces differ on purpose: digest = "what do we know
// now", DECISIONS.md = "what did we decide over time" (D-161).
//
// Read-only by contract: pure reads over the fact archive + scratchpads. The
// `--decisions` flag also triggers the DECISIONS.md journal sync (the one
// mutation, delegated to the append-only writer).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseFrontmatter } from './frontmatter.mjs';

const TYPE_ORDER = ['project', 'feedback', 'reference', 'user'];
const TYPE_LABEL = {
  project: 'Decisions & project state',
  feedback: 'Working-style & preferences',
  reference: 'References',
  user: 'About the user',
};

function readFacts(projectRoot) {
  const dir = join(projectRoot, 'context', 'memory');
  const facts = [];
  if (!existsSync(dir)) return facts;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md') || name === 'INDEX.md') continue;
    try {
      const { frontmatter } = parseFrontmatter(readFileSync(join(dir, name), 'utf8'));
      if (!frontmatter?.id || frontmatter.deleted_at) continue;
      facts.push({
        id: frontmatter.id,
        type: frontmatter.type ?? 'unknown',
        title: frontmatter.title ?? frontmatter.id,
        trust: frontmatter.trust ?? 'unknown',
        createdAt: frontmatter.created_at ?? null,
      });
    } catch {
      // unparseable — reindex/HC-4 own that class
    }
  }
  return facts;
}

/**
 * Build the digest markdown from facts (pure — exported for testing).
 * @param {Array} facts
 * @param {{now?:string}} [opts]
 */
export function buildDigest(facts, { now } = {}) {
  const stamp = (now ?? new Date().toISOString()).slice(0, 10);
  const lines = [`# Memory digest — ${stamp}`, ''];
  if (facts.length === 0) {
    lines.push('_Memory is empty — capture starts as you work._', '');
    return lines.join('\n');
  }
  lines.push(`${facts.length} fact(s) in project memory.`, '');

  const byType = new Map();
  for (const f of facts) {
    if (!byType.has(f.type)) byType.set(f.type, []);
    byType.get(f.type).push(f);
  }
  const orderedTypes = [
    ...TYPE_ORDER.filter((t) => byType.has(t)),
    ...[...byType.keys()].filter((t) => !TYPE_ORDER.includes(t)),
  ];
  for (const type of orderedTypes) {
    const group = byType.get(type).slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    lines.push(`## ${TYPE_LABEL[type] ?? type} (${group.length})`, '');
    for (const f of group) {
      const date = String(f.createdAt ?? '').slice(0, 10) || '—';
      lines.push(`- **${f.title}** · \`${f.id}\` · ${f.trust} · ${date}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Read facts + render the digest for a project (read-only). */
export function digest({ projectRoot, now } = {}) {
  const facts = readFacts(projectRoot);
  return buildDigest(facts, { now });
}
