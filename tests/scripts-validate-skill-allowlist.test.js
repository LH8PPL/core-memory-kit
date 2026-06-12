// @doors: 1
// Door 2 N/A: checkSkillAllowlist is pure (lists in → error array out); no disk writes.
// Door 3 N/A: no subprocess at this boundary.
// Door 4 N/A: no message-queue.
// Door 5 N/A: no NDJSON/log surface.
//
// Task 137.2 — the skill↔allowlist guard (scripts/validate-skill-allowlist.mjs).
// The D-123 class: Task 75.1 scaffolded the memory-search skill but missed its
// `Skill(memory-search)` KIT_ALLOW entry — the model's first invocation would
// have hit a "Use skill?" prompt live (found by the cut-gate, not the suite;
// second instance of the class after Task 90). This guard makes the seam
// structural: every skill scaffolded from template/.claude/skills/ must have
// its Skill(<name>) entry in install's KIT_ALLOW, and every Skill(<name>)
// entry must have a real scaffolded skill (both directions — the D-120
// stale-entry pattern).
//
// We test the PURE check with synthetic inputs (a guard that only ever passes
// is worthless), then assert the REAL repo invariant.

import { describe, it, expect } from 'vitest';
import {
  checkSkillAllowlist,
  readScaffoldedSkillDirs,
  parseKitAllowSkills,
} from '../scripts/validate-skill-allowlist.mjs';

describe('checkSkillAllowlist — drift detection (137.2 / the D-123 class)', () => {
  it('returns no errors when every skill has its allow entry and vice versa', () => {
    expect(
      checkSkillAllowlist({
        skillDirs: ['memory-write', 'memory-search'],
        allowSkills: ['memory-write', 'memory-search'],
      }),
    ).toEqual([]);
  });

  it('flags a scaffolded skill with no Skill(<name>) allow entry (the 75.1 bug)', () => {
    const errors = checkSkillAllowlist({
      skillDirs: ['memory-write', 'memory-search'],
      allowSkills: ['memory-write'],
    });
    expect(errors.some((e) => /memory-search.*no Skill\(/.test(e))).toBe(true);
  });

  it('flags a Skill(<name>) allow entry whose skill does not exist (stale entry)', () => {
    const errors = checkSkillAllowlist({
      skillDirs: ['memory-write'],
      allowSkills: ['memory-write', 'memory-ghost'],
    });
    expect(errors.some((e) => /memory-ghost.*no scaffolded skill/.test(e))).toBe(true);
  });
});

describe('the real repo is in skill↔allowlist parity (the live invariant)', () => {
  it('template/.claude/skills/* ↔ KIT_ALLOW Skill(...) entries', () => {
    const skillDirs = readScaffoldedSkillDirs();
    const allowSkills = parseKitAllowSkills();
    expect(skillDirs.length).toBeGreaterThan(0); // the extractor itself must bite
    expect(allowSkills.length).toBeGreaterThan(0);
    expect(checkSkillAllowlist({ skillDirs, allowSkills })).toEqual([]);
  });
});
