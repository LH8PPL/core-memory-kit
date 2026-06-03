#!/usr/bin/env node
// Task 69.2 — ONE source for skill content.
//
// The kit ships the memory-write skill via TWO delivery routes that must stay
// byte-identical (design §1.3, route-equivalence):
//   - npm route:    `cmk install` scaffolds template/.claude/skills/ → project
//   - plugin route: the Claude Code plugin ships plugin/skills/
//
// The ROOT canonical source is `template/.claude/skills/`. This script mirrors
// each skill there into `plugin/skills/` so the plugin distribution carries the
// same content. Plugin-only skills (e.g. bootstrap) are left untouched — the
// mirror is one-directional template → plugin and additive on the plugin side.
//
// Run after editing any template skill; `scripts/validate-skill-sources.mjs`
// (wired into `npm test`) fails the build if the committed plugin copy drifts.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcSkills = join(repoRoot, 'template', '.claude', 'skills');
const destSkills = join(repoRoot, 'plugin', 'skills');

if (!existsSync(srcSkills)) {
  console.error(`sync-plugin-skills: source missing at ${srcSkills}`);
  process.exit(1);
}

let copied = 0;
for (const name of readdirSync(srcSkills, { withFileTypes: true })) {
  if (!name.isDirectory()) continue;
  const srcFile = join(srcSkills, name.name, 'SKILL.md');
  if (!existsSync(srcFile)) continue;
  const destFile = join(destSkills, name.name, 'SKILL.md');
  const next = readFileSync(srcFile);
  const prev = existsSync(destFile) ? readFileSync(destFile) : null;
  if (prev && prev.equals(next)) continue;
  mkdirSync(dirname(destFile), { recursive: true });
  writeFileSync(destFile, next);
  console.log(`  synced plugin/skills/${name.name}/SKILL.md`);
  copied += 1;
}

console.log(`sync-plugin-skills: ${copied} skill(s) updated`);
