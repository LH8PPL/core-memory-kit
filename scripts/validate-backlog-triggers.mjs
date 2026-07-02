// validate-backlog-triggers.mjs — D-248's structural graduation (Task 197, D-255/D-256).
//
// RULE: every OPEN top-level task in specs/tasks.md must carry a recognizable
// DISPOSITION token in its entry — a named trigger or a version lane. "Deferred
// with nothing" is the rot D-248 forbids, and three manual sweep rounds
// (D-253 → D-253a → D-255) each missed strays a human walk couldn't see; the
// user's verdict on the manual approach: "this sweep starts to sound more like
// a light wipe." Presence is structural (this script); trigger QUALITY stays
// the sweep's judgment (a validator can't tell a checkable trigger from a
// vague one — see CLAUDE.md "Prose rules vs enforcement").
//
// What counts as a disposition token (any one, case-insensitive):
//   - "trigger"            — a named trigger ("Trigger (D-248): …", "[D-253a trigger: …]")
//   - a version lane        — "v0.<digit>" anywhere in the entry
//   - "lane"               — an explicit lane word ("patch lane", "curation lane")
//
// Out of scope (covered by the D-255 sweep rule, not lintable): deferrals living
// in ADRs / RELEASE-PLAN prose — those must be FILED as numbered tasks (the
// D-255 rule: prose may DESCRIBE a deferral, a task must CARRY it); future
// sweeps grep docs/adr/ + RELEASE-PLAN for defer/postpone strays.
//
// Scope: OPEN TOP-LEVEL tasks only (`- [ ] NNN. …`). Sub-tasks (45.1, 50.N)
// ride their parent's / their own inline disposition and are not enforced here.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TASKS = join(root, 'specs', 'tasks.md');

// Documented exceptions (task numbers as strings). Add ONLY with a reason.
const ALLOW = new Set([
  // (none — every open task carries a disposition as of the D-255 sweep close-out)
]);

const OPEN_PARENT = /^- \[ \] (\d+)\. /;
const ANY_TOP_LEVEL = /^- \[.\] \d+[a-zA-Z]?\.|^#{1,3} |^---$/; // next task / heading / rule = entry end
const DISPOSITION = /trigger|v0\.\d|\blane\b/i;

const lines = readFileSync(TASKS, 'utf8').split('\n');
const failures = [];

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(OPEN_PARENT);
  if (!m) continue;
  const taskNum = m[1];
  if (ALLOW.has(taskNum)) continue;
  // The ENTRY BLOCK: the parent line + everything until the next top-level
  // task / heading — older entries carry their lane in indented sub-lines.
  let block = lines[i];
  for (let j = i + 1; j < lines.length && !ANY_TOP_LEVEL.test(lines[j]); j++) {
    block += '\n' + lines[j];
  }
  if (!DISPOSITION.test(block)) {
    failures.push({ taskNum, lineNo: i + 1, excerpt: lines[i].slice(0, 120) });
  }
}

if (failures.length > 0) {
  console.error(`validate-backlog-triggers: FAIL — ${failures.length} open task(s) with NO disposition token (no trigger, no version lane):`);
  for (const f of failures) {
    console.error(`  specs/tasks.md:${f.lineNo}: Task ${f.taskNum} — ${f.excerpt}…`);
  }
  console.error('  Fix: add a named trigger ("Trigger (D-248): <checkable condition>") or a version lane to the entry,');
  console.error('  or — with a written reason — add the task number to the ALLOW list in this script. (D-248/D-255)');
  process.exit(1);
}

const openCount = lines.filter((l) => OPEN_PARENT.test(l)).length;
console.log(`validate-backlog-triggers: OK — ${openCount} open top-level task(s) all carry a trigger or lane`);
