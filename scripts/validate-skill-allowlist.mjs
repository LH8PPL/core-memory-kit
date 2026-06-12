#!/usr/bin/env node
// validate-skill-allowlist.mjs — every scaffolded skill has its
// `Skill(<name>)` permissions-allow entry, and every entry has its skill
// (Task 137.2 — the D-123 class made structural).
//
// The class fired twice before this guard existed: Task 90 (memory-write
// shipped without its allow entry; the model's invocation hit a "Use
// skill?" prompt live) and Task 75.1 (memory-search repeated it; found by
// cut-gate9's pre-session sweep, fixed as Task 133). Skill scaffolding and
// the permissions allowlist live in different files with no shared source,
// so nothing structural kept them in sync — until this.
//
// Both directions checked (the D-120 stale-entry pattern):
//   - a skill dir under template/.claude/skills/ with no Skill(<name>)
//     entry in install's KIT_ALLOW fails;
//   - a Skill(<name>) KIT_ALLOW entry with no scaffolded skill dir fails
//     (removing a skill forces removing its entry).
//
// Scope: the INSTALL route only (template/.claude/skills/ ↔
// settings-hooks.mjs KIT_ALLOW). The plugin route's skills (e.g.
// `bootstrap`) ship via the plugin's own manifest and never touch
// settings.json permissions — deliberately out of scope.
//
// Run: `node scripts/validate-skill-allowlist.mjs`
// Wired into `npm test` as a pre-test step.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = process.env.CMK_VALIDATOR_ROOT
  ? resolve(process.env.CMK_VALIDATOR_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SKILLS_DIR = join(REPO, 'template', '.claude', 'skills');
const SETTINGS_HOOKS = join(REPO, 'packages', 'cli', 'src', 'settings-hooks.mjs');

/** Scaffolded skill names = the dir names under template/.claude/skills/. */
export function readScaffoldedSkillDirs() {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** The Skill(<name>) entries inside settings-hooks.mjs's KIT_ALLOW array. */
export function parseKitAllowSkills() {
  const src = readFileSync(SETTINGS_HOOKS, 'utf8');
  const arrayMatch = src.match(/const KIT_ALLOW\s*=\s*\[([^\]]*)\]/);
  if (!arrayMatch) return [];
  return [...arrayMatch[1].matchAll(/Skill\(([^)]+)\)/g)].map((m) => m[1]).sort();
}

/**
 * Pure parity check. Returns human-readable errors (empty = in sync).
 *
 * @param {object} a
 * @param {string[]} a.skillDirs   - scaffolded skill names.
 * @param {string[]} a.allowSkills - Skill(<name>) names from KIT_ALLOW.
 */
export function checkSkillAllowlist({ skillDirs, allowSkills }) {
  const errors = [];
  const allow = new Set(allowSkills);
  const dirs = new Set(skillDirs);
  for (const skill of skillDirs) {
    if (!allow.has(skill)) {
      errors.push(
        `scaffolded skill '${skill}' has no Skill(${skill}) entry in settings-hooks.mjs KIT_ALLOW — ` +
          `the model's first invocation will hit a "Use skill?" prompt (the D-123 class). ` +
          `Add the entry in the same change that scaffolds the skill.`,
      );
    }
  }
  for (const name of allowSkills) {
    if (!dirs.has(name)) {
      errors.push(
        `KIT_ALLOW carries Skill(${name}) but no scaffolded skill exists at template/.claude/skills/${name}/ — ` +
          `stale allow entries must be removed with the skill (the D-120 both-directions pattern).`,
      );
    }
  }
  return errors;
}

function runCli() {
  const skillDirs = readScaffoldedSkillDirs();
  const allowSkills = parseKitAllowSkills();
  const errors = checkSkillAllowlist({ skillDirs, allowSkills });
  if (errors.length > 0) {
    console.error('validate-skill-allowlist: FAIL');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log(
    `validate-skill-allowlist: OK — ${skillDirs.length} scaffolded skill(s), each with its Skill(...) allow entry (both directions)`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli();
}
