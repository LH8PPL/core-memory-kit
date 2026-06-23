#!/usr/bin/env node
// validate-skill-sources.mjs — Task 69.2 structural guard.
//
// Two enforcement jobs, both wired into `npm test`:
//
//   1. ONE SOURCE (drift guard). The ROOT canonical source for every shipped
//      skill is `template/.claude/skills/<name>/SKILL.md`. The plugin route
//      ships `plugin/skills/<name>/SKILL.md`, which MUST be byte-identical
//      (route-equivalence, design §1.3). If they drift, fail and tell the dev
//      to run `node scripts/sync-plugin-skills.mjs`. (Plugin-only skills like
//      bootstrap are allowed — the mirror is template → plugin, additive.)
//
//   2. SAFETY CONTRACT. A kit skill must NEVER be able to hand-edit memory
//      files — that bypasses Poison_Guard + home-path sanitization (the F1 /
//      v0.1.2 username-leak class). Every canonical skill is checked:
//        - frontmatter has non-empty `name` + `description`
//        - `allowed-tools` is present and grants NEITHER `Edit` NOR `Write`
//        - body references no dev-repo internal path (`packages/cli/src`)
//        - body uses forward-slash paths only (no `context\` backslash)
//      The memory-write skill additionally must carry the MUST/NEVER
//      hand-edit gate and route through `cmk remember` / `cmk forget`.
//
// Source rule: CLAUDE.md "Prose rules vs enforcement" — a prose-only rule with
// a structural shape gets a validator, not another paragraph. The unsafe-skill
// finding (D-28) is exactly that shape.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// Root defaults to the repo this script lives in; an explicit argv[2] lets the
// test suite point it at a fixture tree (the "gate actually bites" negative path).
const repoRoot = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const canonicalDir = join(repoRoot, 'template', '.claude', 'skills');
const pluginDir = join(repoRoot, 'plugin', 'skills');

const errors = [];

// STRICT-parse the frontmatter YAML — the same thing Kiro does (and Claude Code
// does NOT, which is why an invalid-YAML description shipped latent until the
// cut-gate-kiro live test rejected it). A naive line-split parser hides the bug:
// a description with an unquoted `: ` (colon-space) is INVALID YAML — a strict
// parser reads a new mapping key ("mapping values are not allowed here") and
// rejects the whole frontmatter. Returns { data } on success or { yamlError } on
// a genuine parse failure, so the caller can fail the gate with the YAML reason.
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { data: {} };
  try {
    const data = yaml.load(m[1]);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return { yamlError: 'frontmatter is not a YAML mapping' };
    }
    return { data };
  } catch (err) {
    return { yamlError: err.message.split('\n')[0] };
  }
}

if (!existsSync(canonicalDir)) {
  console.error(`validate-skill-sources: FAIL — canonical skills dir missing at ${canonicalDir}`);
  process.exit(1);
}

const skills = readdirSync(canonicalDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const name of skills) {
  const canonicalPath = join(canonicalDir, name, 'SKILL.md');
  if (!existsSync(canonicalPath)) continue;
  const text = readFileSync(canonicalPath, 'utf8');
  const parsed = frontmatter(text);
  const where = `template/.claude/skills/${name}/SKILL.md`;

  // --- strict YAML (the Kiro-reject class) ---
  // If the frontmatter isn't valid YAML, Kiro rejects the skill outright
  // ("Invalid SKILL.md frontmatter"). Fail here, name the YAML reason, and skip
  // the field checks (they'd be meaningless on unparseable frontmatter).
  if (parsed.yamlError) {
    errors.push(`${where}: invalid YAML frontmatter — Kiro will reject this skill (${parsed.yamlError})`);
    continue;
  }
  const fm = parsed.data;

  // --- safety contract ---
  if (!fm.name) errors.push(`${where}: frontmatter missing \`name\``);
  if (!fm.description) errors.push(`${where}: frontmatter missing \`description\``);

  const allowed = fm['allowed-tools'];
  if (!allowed) {
    errors.push(`${where}: frontmatter missing \`allowed-tools\` (must scope tools explicitly)`);
  } else {
    if (/\bEdit\b/.test(allowed)) {
      errors.push(`${where}: allowed-tools grants \`Edit\` — bypasses Poison_Guard (F1 leak class)`);
    }
    if (/\bWrite\b/.test(allowed)) {
      errors.push(`${where}: allowed-tools grants \`Write\` — bypasses Poison_Guard (F1 leak class)`);
    }
  }

  if (/packages\/cli\/src/.test(text)) {
    errors.push(`${where}: references dev-repo internal path \`packages/cli/src\` (users don't have it)`);
  }
  if (/context\\/.test(text)) {
    errors.push(`${where}: uses a backslash path — forward-slashes only (cross-platform)`);
  }

  // memory-write specific: the hand-edit hard gate + cmk routing.
  if (name === 'memory-write') {
    if (!/NEVER/.test(text) || !/context\/memory/.test(text)) {
      errors.push(`${where}: missing the MUST/NEVER hand-edit hard gate naming context/memory`);
    }
    if (!/cmk remember/.test(text)) {
      errors.push(`${where}: must route capture through \`cmk remember\``);
    }
  }

  // --- drift guard ---
  const pluginPath = join(pluginDir, name, 'SKILL.md');
  if (!existsSync(pluginPath)) {
    errors.push(
      `plugin/skills/${name}/SKILL.md: missing — run \`node scripts/sync-plugin-skills.mjs\``,
    );
  } else if (!readFileSync(pluginPath).equals(Buffer.from(text, 'utf8'))) {
    errors.push(
      `plugin/skills/${name}/SKILL.md: drifted from canonical — run \`node scripts/sync-plugin-skills.mjs\``,
    );
  }
}

if (errors.length > 0) {
  console.error(`validate-skill-sources: FAIL — ${errors.length} issue(s)`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

console.log(`validate-skill-sources: OK — ${skills.length} canonical skill(s); plugin mirror + safety contract verified`);
