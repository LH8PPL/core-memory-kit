#!/usr/bin/env node
// One-shot ID computation for the 21 seed bullets across 7 scratchpad
// templates. Per the user's Q3 answer on Task 14 (2026-05-24): seed bullets
// use real generateId() values so content-addressed dedup works correctly
// when a user later writes the same fact themselves. Placeholders only
// belong in HTML-comment tutorial content.
//
// Run: `node scripts/compute-seed-bullet-ids.mjs`
// Output: one block per file with computed (tier-prefix + base32-8-char) ids.
// Copy the ids into the corresponding template/*.md.template seed bullets.

import { canonicalize, generateId } from '../packages/canonicalize/src/index.mjs';

const SEEDS = {
  'SOUL.md': {
    tier: 'P',
    bullets: [
      { section: 'Tone and Disposition', text: "explains tradeoffs before recommending; doesn't lead with conclusions" },
      { section: 'Operating Defaults', text: 'verifies external claims against primary sources before stating as fact' },
      { section: 'Boundary Rules', text: "writes to memory silently; doesn't announce captures" },
    ],
  },
  'MEMORY.md': {
    tier: 'P',
    bullets: [
      { section: 'Active Threads', text: '(example) reviewing PR #142 for the auth refactor' },
      { section: 'Environment Notes', text: '(example) Node 20.x; Python 3.13; Postgres 16 in the test environment' },
      { section: 'Pending Decisions', text: '(example) decide whether to deprecate /api/v1 by Q3 2026' },
    ],
  },
  'USER.md': {
    tier: 'U',
    bullets: [
      { section: 'About', text: 'engineer comfortable with TDD and incremental code review' },
      { section: 'Preferences', text: 'prefers terse responses; no preamble before the answer' },
      { section: 'Working Style', text: 'one PR per parent task; squash-merge into main' },
    ],
  },
  'HABITS.md': {
    tier: 'U',
    bullets: [
      { section: 'Iteration Cadence', text: 'commits incrementally as work progresses; not in one big push at the end' },
      { section: 'Destructive Operations', text: 'always confirms before git push, git reset --hard, or other irreversible operations' },
      { section: 'Communication Style', text: 'reads the diff before the commit message; trusts code over claims' },
    ],
  },
  'LESSONS.md': {
    tier: 'U',
    bullets: [
      { section: 'Tooling Lessons', text: 'fix the code, not the test' },
      { section: 'Process Lessons', text: 'correlation is not causation; measured profiling beats educated guessing' },
      { section: 'Anti-patterns', text: 'premature abstraction outlives the requirement that motivated it' },
    ],
  },
  'machine-paths.md': {
    tier: 'L',
    bullets: [
      { section: 'Tool Paths', text: '(example) node binary at /usr/local/bin/node' },
      { section: 'Project Paths', text: '(example) primary data directory at ~/.local/share/cmk' },
      { section: 'Misc Paths', text: '(example) cache root at ~/.cache/cmk' },
    ],
  },
  'overrides.md': {
    tier: 'L',
    bullets: [
      { section: 'Tool Overrides', text: '(example) editor: code --wait' },
      { section: 'Behavior Overrides', text: '(example) offline mode: true' },
      { section: 'Path Overrides', text: '(example) workspace root: ~/Projects' },
    ],
  },
};

for (const [file, { tier, bullets }] of Object.entries(SEEDS)) {
  console.log(`\n=== ${file} (tier ${tier}) ===`);
  for (const b of bullets) {
    const id = generateId(tier, b.text);
    console.log(`  [${b.section}]`);
    console.log(`    text: "${b.text}"`);
    console.log(`    canonical: "${canonicalize(b.text)}"`);
    console.log(`    id: ${id}`);
  }
}
