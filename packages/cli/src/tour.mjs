// `cmk tour` (Task 175, D-215) — narrate the user's OWN memory.
//
// Tour EXPLAINS, doctor CHECKS (keep them distinct — `cmk doctor` is the
// health sibling). The honesty contract: everything shown is read from the
// user's real files; nothing is invented. Degrades gracefully on a fresh
// install (narrates the STRUCTURE + how it fills).
//
// Public boundary:
//   buildTour({projectRoot, userDir}) → {sections: [{title, body}], examples: [{title, sourceFile}]}
//
// Idea borrowed from awrshift/claude-memory-kit's /tour — the one UX idea
// worth taking: walk the user through the system using THEIR files, not
// generic docs. Per design §16 (tour) + tasks.md 175.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseFrontmatter } from './frontmatter.mjs';
import { parseObservationsFromScratchpad } from './index-rebuild.mjs';

const FACT_FILE_RE = /^(user|feedback|project|reference)_.+\.md$/;

function safeList(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function safeRead(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

// Count REAL bullets — the indexer's parser excludes the scaffold's
// `(example)` seed bullets (the Task-183 filter), so a fresh install
// honestly reads as empty.
function countRealBullets(path, { projectRoot, userDir }) {
  const content = safeRead(path);
  if (!content) return 0;
  try {
    return parseObservationsFromScratchpad({ path, content, tier: 'P', projectRoot, userDir })
      .observations.length;
  } catch {
    return 0;
  }
}

// Read up to `max` real fact titles from a memory dir — title from
// frontmatter, filename as the honest fallback. Never invents.
function sampleFacts(memoryDir, relPrefix, max = 3) {
  const out = [];
  for (const name of safeList(memoryDir)) {
    if (!FACT_FILE_RE.test(name)) continue;
    const { frontmatter } = parseFrontmatter(safeRead(join(memoryDir, name)));
    out.push({
      title: frontmatter?.title ?? name.replace(/\.md$/, ''),
      type: frontmatter?.type ?? name.split('_')[0],
      sourceFile: `${relPrefix}${name}`,
    });
    if (out.length >= max) break;
  }
  return out;
}

function countFacts(memoryDir) {
  return safeList(memoryDir).filter((n) => FACT_FILE_RE.test(n)).length;
}

export function buildTour({ projectRoot, userDir } = {}) {
  const ctx = join(projectRoot ?? '.', 'context');
  const localCtx = join(projectRoot ?? '.', 'context.local');

  const projFacts = countFacts(join(ctx, 'memory'));
  const userFacts = countFacts(join(userDir ?? '', 'memory'));
  const memoryBullets = countRealBullets(join(ctx, 'MEMORY.md'), { projectRoot, userDir });
  const decisions = safeRead(join(ctx, 'DECISIONS.md'));
  const decisionCount = (decisions.match(/^## /gm) ?? []).length;
  const sessionFiles = safeList(join(ctx, 'sessions')).filter((n) => n.endsWith('.md')).length;
  const transcriptFiles = safeList(join(ctx, 'transcripts')).filter((n) => n.endsWith('.md')).length;
  const userTierExists = !!userDir && existsSync(userDir);

  const examples = [
    ...sampleFacts(join(ctx, 'memory'), 'context/memory/', 3),
    ...(userTierExists ? sampleFacts(join(userDir, 'memory'), 'user/memory/', 2) : []),
  ];
  const empty = projFacts === 0 && memoryBullets === 0 && userFacts === 0;

  const sections = [];

  sections.push({
    title: 'Where your memory lives (three tiers; precedence: local > project > user — most-specific wins)',
    body: [
      `  Project  context/           committed — travels with git clone${existsSync(ctx) ? '' : '  (not scaffolded yet — run cmk install)'}`,
      `  Local    context.local/     gitignored, per-machine${existsSync(localCtx) ? '' : '  (created on first local-only fact)'}`,
      `  User     ${userDir ?? '~/.core-memory-kit'}   cross-project, follows YOU${userTierExists ? '' : '  (not initialized yet)'}`,
    ].join('\n'),
  });

  if (empty) {
    sections.push({
      title: "What's captured so far",
      body: [
        '  Nothing captured yet — that changes on its own:',
        '  - the Stop hook reads each turn and saves durable facts automatically (no command needed)',
        '  - say "remember this" (or run `cmk remember "..." --why --how`) for an explicit save',
        '  - `cmk import-sessions` bootstraps memory from your EXISTING Claude Code history',
        '  - the rolling window (sessions/) fills as you work; the weekly curator keeps it tidy',
      ].join('\n'),
    });
  } else {
    const exampleLines = examples
      .slice(0, 3)
      .map((e) => `    • [${e.type}] ${e.title}  (${e.sourceFile})`);
    sections.push({
      title: "What's captured so far (read from YOUR files — real, not examples)",
      body: [
        `  ${projFacts} fact file(s) in context/memory/ · ${memoryBullets} working bullet(s) in MEMORY.md`,
        `  ${decisionCount} decision journal entr${decisionCount === 1 ? 'y' : 'ies'} in DECISIONS.md · ${sessionFiles} session file(s) · ${transcriptFiles} transcript file(s)`,
        userTierExists ? `  ${userFacts} cross-project fact(s) in your user tier` : '  user tier not initialized yet',
        ...(exampleLines.length ? ['  A few of yours:', ...exampleLines] : []),
      ].join('\n'),
    });
  }

  sections.push({
    title: 'How you (and Claude) get it back',
    body: [
      '  - a frozen snapshot injects at every session start — Claude opens already knowing this project',
      '  - `cmk search "<topic>"` — keyword/semantic/hybrid over the fact archive',
      '  - `cmk search "<topic>" --scope decisions` — decision HISTORY (what was rejected, what changed)',
      '  - `cmk search "<topic>" --scope transcripts` — the raw session record (last resort)',
      '  - `cmk expand <hit-id>` — the neighborhood around a hit · `cmk get <id>` — the full fact with Why/How',
      '  - in conversation, Claude drives the same operations through the memory-search skill + MCP tools',
    ].join('\n'),
  });

  sections.push({
    title: 'Next steps',
    body: [
      '  - `cmk doctor` — the health check (tour explains; doctor verifies the wiring)',
      empty
        ? '  - `cmk import-sessions --dry-run` — see whether past sessions can seed your memory today'
        : '  - `cmk stats memory-health` — watch the memory process improve week over week',
      '  - say "remember this" in conversation — the save happens through the screened write path',
    ].join('\n'),
  });

  return { sections, examples };
}
