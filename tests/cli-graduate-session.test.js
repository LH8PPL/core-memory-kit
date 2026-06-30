// @doors: 1, 2, 4
// Door 3 N/A: graduation calls writeFact() in-process (no subprocess spawn).
// Door 5 N/A: no message-queue interaction.

// Tests for Task 94.3 — the PROACTIVE SessionEnd graduation sweep.
//
// The reactive relief inside appendScratchpadBullet only fires when a write
// triggers cap pressure. graduateAllScratchpads() runs the SAME relief sequence
// (consolidate stale-drop + graduate high-trust overflow) OUTSIDE the append
// path, so a scratchpad stays under its load-cap even in a read-only session and
// low/medium bullets that AGED past the stale window between sessions are caught.
//
// Boundary-test discipline: assert the PUBLIC outcome — the sweep return shape,
// what lands on disk (scratchpad shrinks, fact files appear, evicted archived),
// and the 'graduated' audit entries. Do NOT test internal helpers.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { graduateAllScratchpads } from '../packages/cli/src/graduate-session.mjs';
import { readAuditLog } from '../packages/cli/src/audit-log.mjs';

// Build a scratchpad whose chosen section is packed with bullets until the file
// reaches targetBytes. Bodies are distinct so writeFact derives a distinct
// content id per graduated bullet (no spurious dedup). Ids are constructed
// dynamically (no literal token in source → the validate-test-ids linter sees
// none to flag).
function buildScratchpad({
  title,
  sections,
  fillSection,
  targetBytes,
  trust = 'high',
  date = '2026-05-24T10:00:00Z',
  idPrefix = 'P',
  idTag = 'FILL',
}) {
  const headLines = [`# ${title}`, ''];
  for (const s of sections) {
    headLines.push(`## ${s}`, '');
  }
  // Re-emit with the fill section's bullets appended in place.
  const render = (bullets) => {
    const out = [`# ${title}`, ''];
    for (const s of sections) {
      out.push(`## ${s}`, '');
      if (s === fillSection) {
        for (const b of bullets) out.push(b.bullet, b.comment);
        out.push('');
      }
    }
    return out.join('\n');
  };

  const bullets = [];
  let i = 0;
  // Loosely-valid id (graduation's BULLET_RE accepts [A-Za-z0-9]+); distinct body.
  while (true) {
    const id = `${idPrefix}-${idTag}${String(i).padStart(4, '0')}`;
    const bullet = `- (${id}) durable fact number ${i} that is high trust and worth keeping in the store`;
    const comment = `  <!-- source: src/${i}.md, source_line: 1, sha1: ${'a'.repeat(40)}, write: manual-edit, trust: ${trust}, at: ${date} -->`;
    const next = render([...bullets, { bullet, comment }]);
    if (Buffer.byteLength(next, 'utf8') >= targetBytes) break;
    bullets.push({ bullet, comment });
    i++;
  }
  void headLines;
  return render(bullets);
}

function factFiles(factDir) {
  if (!existsSync(factDir)) return [];
  return readdirSync(factDir).filter((f) => f.endsWith('.md') && f !== 'INDEX.md');
}

describe('Task 94.3 — proactive SessionEnd graduation sweep', () => {
  let sandbox;
  let projectRoot;
  let userDir;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-grad-session-'));
    projectRoot = join(sandbox, 'proj');
    userDir = join(sandbox, 'user-tier');
    mkdirSync(join(projectRoot, 'context'), { recursive: true });
    mkdirSync(userDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  function setProjectCap(scratchpad, maxChars) {
    writeFileSync(
      join(projectRoot, 'context', 'settings.json'),
      JSON.stringify({ scratchpads: { [scratchpad]: { max_chars: maxChars } } }),
      'utf8',
    );
  }
  function setUserCap(scratchpad, maxChars) {
    writeFileSync(
      join(userDir, 'settings.json'),
      JSON.stringify({ scratchpads: { [scratchpad]: { max_chars: maxChars } } }),
      'utf8',
    );
  }

  it('graduates an over-cap project MEMORY.md without any append (Door 1+2+4)', () => {
    setProjectCap('MEMORY.md', 1500);
    const memoryMd = join(projectRoot, 'context', 'MEMORY.md');
    writeFileSync(
      memoryMd,
      buildScratchpad({
        title: 'Working Memory',
        sections: ['Active Threads', 'Environment Notes', 'Pending Decisions'],
        fillSection: 'Environment Notes',
        targetBytes: 1900, // comfortably over the 1500 cap
      }),
      'utf8',
    );

    const out = graduateAllScratchpads({ projectRoot, userDir, now: '2026-06-05T00:00:00Z' });

    // Door 1: aggregate + per-scratchpad return shape.
    expect(out.totalGraduated).toBeGreaterThan(0);
    const memResult = out.results.find((r) => r.scratchpad === 'MEMORY.md');
    expect(memResult.action).toBe('relieved');
    expect(memResult.bulletsGraduated).toBe(out.totalGraduated);

    // Door 2: MEMORY.md is back under cap and the graduated bodies are now fact files.
    const after = readFileSync(memoryMd, 'utf8');
    expect(Buffer.byteLength(after, 'utf8')).toBeLessThanOrEqual(1500);
    expect(factFiles(join(projectRoot, 'context', 'memory')).length).toBe(out.totalGraduated);

    // Door 4: one 'graduated' audit entry per bullet, marked as a session-end trigger.
    const audit = readAuditLog(join(projectRoot, 'context'));
    const grad = audit.filter((e) => e.action === 'graduated');
    expect(grad.length).toBe(out.totalGraduated);
    expect(grad.every((e) => e.reasonCode === 'scratchpad-graduated')).toBe(true);
    expect(grad.every((e) => e.extra?.trigger === 'session-end')).toBe(true);
  });

  it('never-lose: every graduated bullet is recoverable as a fact file (none vanish)', () => {
    setProjectCap('MEMORY.md', 1500);
    const memoryMd = join(projectRoot, 'context', 'MEMORY.md');
    const original = buildScratchpad({
      title: 'Working Memory',
      sections: ['Active Threads', 'Environment Notes', 'Pending Decisions'],
      fillSection: 'Environment Notes',
      targetBytes: 2200,
    });
    writeFileSync(memoryMd, original, 'utf8');

    const out = graduateAllScratchpads({ projectRoot, userDir });

    // One fact file per graduated bullet (distinct bodies → no dedup collapse).
    expect(factFiles(join(projectRoot, 'context', 'memory')).length).toBe(out.totalGraduated);
    // The non-graduated bullets stay live in MEMORY.md — nothing was hard-deleted.
    const after = readFileSync(memoryMd, 'utf8');
    const liveBullets = (after.match(/^- \(/gm) ?? []).length;
    const originalBullets = (original.match(/^- \(/gm) ?? []).length;
    expect(liveBullets + out.totalGraduated).toBe(originalBullets);
  });

  it('drops + ARCHIVES stale low/medium bullets that aged past the window between sessions', () => {
    // The proactive sweep also runs consolidate(): an over-cap MEMORY.md whose
    // bullets are STALE MEDIUM (>14d) gets them dropped — and archived, not
    // vanished (the §6.5 tombstone principle). This is the cross-session-aging
    // case the reactive append path can't catch without a new write.
    setProjectCap('MEMORY.md', 1500);
    const memoryMd = join(projectRoot, 'context', 'MEMORY.md');
    writeFileSync(
      memoryMd,
      buildScratchpad({
        title: 'Working Memory',
        sections: ['Active Threads', 'Environment Notes', 'Pending Decisions'],
        fillSection: 'Environment Notes',
        targetBytes: 1900,
        trust: 'medium',
        date: '2026-04-01T00:00:00Z', // >14d before the sweep's `now`
      }),
      'utf8',
    );

    const out = graduateAllScratchpads({ projectRoot, userDir, now: '2026-06-05T00:00:00Z' });

    const memResult = out.results.find((r) => r.scratchpad === 'MEMORY.md');
    expect(memResult.action).toBe('relieved');
    expect(memResult.bulletsConsolidated).toBeGreaterThan(0);
    expect(memResult.bulletsGraduated).toBe(0); // medium → consolidated, not graduated
    // Under cap now, and the dropped bullets are recoverable in the archive.
    expect(Buffer.byteLength(readFileSync(memoryMd, 'utf8'), 'utf8')).toBeLessThanOrEqual(1500);
    const archivePath = join(projectRoot, 'context', 'memory', 'archive', 'evicted-bullets.md');
    expect(existsSync(archivePath)).toBe(true);
    // Door 4: one 'evicted' audit entry per dropped bullet.
    const audit = readAuditLog(join(projectRoot, 'context'));
    expect(audit.filter((e) => e.action === 'evicted').length).toBe(memResult.bulletsConsolidated);
  });

  it('over-mutation guard: an under-cap scratchpad is left byte-identical (no churn)', () => {
    setProjectCap('MEMORY.md', 2500);
    const memoryMd = join(projectRoot, 'context', 'MEMORY.md');
    const original = buildScratchpad({
      title: 'Working Memory',
      sections: ['Active Threads', 'Environment Notes', 'Pending Decisions'],
      fillSection: 'Environment Notes',
      targetBytes: 900, // well under cap
    });
    writeFileSync(memoryMd, original, 'utf8');

    const out = graduateAllScratchpads({ projectRoot, userDir });

    expect(out.totalGraduated).toBe(0);
    expect(readFileSync(memoryMd, 'utf8')).toBe(original); // untouched
    expect(factFiles(join(projectRoot, 'context', 'memory')).length).toBe(0);
    const memResult = out.results.find((r) => r.scratchpad === 'MEMORY.md');
    expect(memResult.action).toBe('noop');
  });

  it('151.4 (was 94.2): an over-cap user-tier USER.md CONDENSES, never graduates to fragments (Hole B)', () => {
    // DECISION TRAIL: the original 94.2 (D-60/D-61) graduated an over-cap persona
    // into userDir/fragments/. That mechanism IS Hole B — fragments/ is never
    // injected, so a high-trust trait graduated there vanishes at cold-open. Task
    // 151.4 (ADR-0016 §20.3) reverses the MECHANISM (condense + keep injected),
    // not the intent (never lose). So the over-cap persona's high-trust bullets
    // stay in the file; nothing graduates out; no fragments/ file is created.
    setUserCap('USER.md', 1200);
    const userMd = join(userDir, 'USER.md');
    const seeded = buildScratchpad({
      title: 'User Profile',
      sections: ['About', 'Preferences', 'Working Style'],
      fillSection: 'Preferences',
      targetBytes: 1700,
      idPrefix: 'U',
      idTag: 'USR',
    });
    writeFileSync(userMd, seeded, 'utf8');
    // The seeded high-trust bullet ids — every one must survive (never lost).
    const seededIds = [...seeded.matchAll(/\(U-USR\d+\)/g)].map((m) => m[0]);
    expect(seededIds.length).toBeGreaterThan(0);

    const out = graduateAllScratchpads({ projectRoot, userDir });

    const usrResult = out.results.find((r) => r.scratchpad === 'USER.md');
    // 151.4: NOTHING graduates out of the persona.
    expect(usrResult.bulletsGraduated ?? 0).toBe(0);
    // NO fragments/ eviction target was created (the Hole-B store).
    expect(existsSync(join(userDir, 'fragments'))).toBe(false);
    // Every seeded high-trust trait is STILL in the injected file (over-mutation
    // guard: condense drops no bullet — the file may exceed cap, load-cap allows it).
    const after = readFileSync(userMd, 'utf8');
    for (const id of seededIds) expect(after).toContain(id);
    // Door 4: no graduation audit entry on the user tier.
    const audit = readAuditLog(userDir);
    expect(audit.filter((e) => e.action === 'graduated' && e.tier === 'U').length).toBe(0);
  });

  it('never targets the LOCAL tier (machine config is excluded)', () => {
    // An over-cap machine-paths.md must be left untouched — L tier is not durable facts.
    mkdirSync(join(projectRoot, 'context.local'), { recursive: true });
    const machinePaths = join(projectRoot, 'context.local', 'machine-paths.md');
    const original = buildScratchpad({
      title: 'Machine Paths',
      sections: ['Tool Paths', 'Project Paths', 'Misc Paths'],
      fillSection: 'Tool Paths',
      targetBytes: 2000,
    });
    writeFileSync(machinePaths, original, 'utf8');

    const out = graduateAllScratchpads({ projectRoot, userDir });

    expect(out.results.every((r) => r.tier !== 'L')).toBe(true);
    expect(readFileSync(machinePaths, 'utf8')).toBe(original); // untouched
  });

  it('skips missing scratchpads gracefully (no throw, totalGraduated 0)', () => {
    // Fresh sandbox with no scratchpad files at all.
    const out = graduateAllScratchpads({ projectRoot, userDir });
    expect(out.totalGraduated).toBe(0);
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results.every((r) => r.action === 'skipped')).toBe(true);
  });
});
