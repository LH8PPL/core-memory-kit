// @doors: 1, 2, 4
// Door 3 N/A: graduation calls writeFact() in-process (no subprocess spawn).
// Door 5 N/A: no message-queue interaction.

// Tests for Task 91 — MEMORY.md graduation (the missing 3rd shrink mechanism).
//
// Scope (D-57, Decision A): graduation is a SAFETY VALVE — when MEMORY.md is at
// cap pressure and consolidate() can't free enough (because the bullets are
// high-trust, which stale-drop never removes), the oldest high-trust bullets
// GRADUATE into context/memory/*.md fact files (via writeFact), freeing the hot
// index so the new write lands instead of returning CAP_EXCEEDED. Search-only;
// project MEMORY.md only.
//
// Boundary-test discipline: assert appendScratchpadBullet()'s PUBLIC outcome —
// the write succeeds, fact files appear on disk, MEMORY.md drops under cap, the
// graduated bullets leave MEMORY.md but the recent/low-trust ones do not.
// Do NOT test internal graduation helpers.

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
import { appendScratchpadBullet } from '../packages/cli/src/scratchpad.mjs';
import { graduateForCapRelief, condenseScratchpadForCapRelief } from '../packages/cli/src/graduation.mjs';

// A MEMORY.md full of RECENT + HIGH-trust bullets — exactly the accumulation
// consolidate() refuses to drop (high-trust is preserved regardless of age),
// so cap pressure can only be relieved by graduation. This is the proven helper
// from cli-scratchpad.test.js (padding lands in Environment Notes; each bullet
// body is distinct so writeFact derives a distinct content id).
function buildMemoryMd({
  targetBytes,
  paddingDate = '2026-05-24T10:00:00Z',
  paddingTrust = 'high',
}) {
  const header = [
    '<!--',
    'Cap: 2500 chars.',
    'Last distilled: 2026-05-24.',
    'Last health check: 2026-05-24.',
    '-->',
    '',
    '# Working Memory',
    '',
    '## Active Threads',
    '',
    '## Environment Notes',
    '',
  ].join('\n');
  const footer = ['', '## Pending Decisions', '', ''].join('\n');

  const lines = [header];
  let i = 0;
  while (true) {
    const id = `P-PAD${String(i).padStart(5, '0')}`;
    const bullet = `- (${id}) padding bullet number ${i} ensuring deterministic char count`;
    const comment = `  <!-- source: pad/${i}.md, source_line: 1, sha1: ${'a'.repeat(40)}, write: manual-edit, trust: ${paddingTrust}, at: ${paddingDate} -->`;
    const candidate = lines.join('\n') + '\n' + bullet + '\n' + comment + footer;
    if (Buffer.byteLength(candidate, 'utf8') >= targetBytes) break;
    lines.push(bullet);
    lines.push(comment);
    i++;
  }
  return lines.join('\n') + footer;
}

function validBulletOpts(overrides = {}) {
  return {
    tier: 'P',
    scratchpad: 'MEMORY.md',
    section: 'Active Threads',
    text: 'newly added scratchpad bullet',
    provenance: {
      source: 'transcripts/2026-05-24.md',
      source_line: 42,
      sha1: 'b'.repeat(40),
      write: 'user-explicit',
      trust: 'high',
      at: '2026-05-24T12:00:00Z',
    },
    now: '2026-05-24T12:00:00Z',
    ...overrides,
  };
}

function setCap(projectRoot, maxChars) {
  writeFileSync(
    join(projectRoot, 'context', 'settings.json'),
    JSON.stringify({ scratchpads: { 'MEMORY.md': { max_chars: maxChars } } }),
    'utf8',
  );
}

function factFiles(projectRoot) {
  const dir = join(projectRoot, 'context', 'memory');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'INDEX.md');
}

describe('Task 91 — MEMORY.md graduation (safety valve)', () => {
  let sandbox;
  let projectRoot;
  let memoryMd;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-graduation-test-'));
    projectRoot = join(sandbox, 'proj');
    mkdirSync(join(projectRoot, 'context'), { recursive: true });
    memoryMd = join(projectRoot, 'context', 'MEMORY.md');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('the BLOCKER: a high-trust-full MEMORY.md that would CAP_EXCEEDED now graduates + appends', () => {
    setCap(projectRoot, 1500);
    // ~1450 bytes of recent high-trust bullets — consolidate() can drop NONE.
    writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 1480 }), 'utf8');

    const r = appendScratchpadBullet(
      validBulletOpts({
        projectRoot,
        text: 'a brand new high-trust durable fact about the deploy target',
      }),
    );

    // Door 1 (response): the write SUCCEEDS — pre-graduation this returned
    // action:'error', errorCategory:'cap_exceeded'.
    expect(r.action).toBe('appended');
    expect(r.bulletsGraduated).toBeGreaterThan(0);

    // Door 2 (state): graduated bullets became fact files on disk...
    expect(factFiles(projectRoot).length).toBeGreaterThan(0);
    // ...MEMORY.md is back under cap...
    const after = readFileSync(memoryMd, 'utf8');
    expect(Buffer.byteLength(after, 'utf8')).toBeLessThanOrEqual(1500);
    // ...the new bullet landed...
    expect(after).toContain('a brand new high-trust durable fact about the deploy target');
    // ...and at least one padding (graduated) bullet LEFT MEMORY.md.
    expect(after).not.toContain('P-PAD00000'); // validate-test-ids: ignore (helper-generated 0-padded id)
  });

  it('cross-store dedup: a bullet whose fact already exists does not create a second file', () => {
    setCap(projectRoot, 1500);
    writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 1480 }), 'utf8');

    // First append → graduation creates fact files.
    appendScratchpadBullet(
      validBulletOpts({ projectRoot, text: 'first durable fact for the deploy target' }),
    );
    const countAfterFirst = factFiles(projectRoot).length;
    expect(countAfterFirst).toBeGreaterThan(0);

    // Re-seed the SAME high-trust-full state and append again. The padding
    // bodies are identical to round 1, so graduating them must DEDUP against
    // the fact files already on disk (writeFact keys on content id) — not pile
    // up duplicate files.
    writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 1480 }), 'utf8');
    appendScratchpadBullet(
      validBulletOpts({ projectRoot, text: 'second durable fact for the deploy target' }),
    );

    const countAfterSecond = factFiles(projectRoot).length;
    // The padding bodies repeat, so re-graduating them adds NO new files for the
    // already-graduated bodies (exact-canonical cross-store dedup).
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it('over-mutation guard: graduation only fires under cap pressure; a comfortable write keeps every bullet', () => {
    setCap(projectRoot, 2500);
    // Well under cap → no graduation should happen.
    writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 900 }), 'utf8');

    const r = appendScratchpadBullet(
      validBulletOpts({ projectRoot, text: 'a small addition with plenty of room' }),
    );

    expect(r.action).toBe('appended');
    expect(r.bulletsGraduated ?? 0).toBe(0);
    expect(factFiles(projectRoot).length).toBe(0);
    const after = readFileSync(memoryMd, 'utf8');
    expect(after).toContain('P-PAD00000'); // validate-test-ids: ignore (helper-generated 0-padded id); nothing graduated away
  });

  it('91.2 eviction archives, does not vanish: a consolidate()-dropped stale bullet is recoverable', () => {
    // Near default cap with STALE MEDIUM padding → consolidate() drops them
    // (low/medium AND >14d). Pre-Task-91 those were hard-deleted with no trace.
    writeFileSync(
      memoryMd,
      buildMemoryMd({
        targetBytes: 2400, // > 95% of the 2500 default cap
        paddingDate: '2026-04-01T00:00:00Z', // >14d old
        paddingTrust: 'medium', // droppable by consolidate
      }),
      'utf8',
    );

    const r = appendScratchpadBullet(validBulletOpts({ projectRoot }));
    expect(r.action).toBe('appended');
    expect(r.bulletsConsolidated).toBeGreaterThan(0);

    // Dropped from the live hot index...
    const after = readFileSync(memoryMd, 'utf8');
    expect(after).not.toContain('P-PAD00000'); // validate-test-ids: ignore (helper id)

    // ...but ARCHIVED, not vanished (the §6.5 tombstone principle applied to the
    // eviction edge — Door 2 state + Door 4 recoverability).
    const archivePath = join(
      projectRoot,
      'context',
      'memory',
      'archive',
      'evicted-bullets.md',
    );
    expect(existsSync(archivePath)).toBe(true);
    expect(readFileSync(archivePath, 'utf8')).toContain('P-PAD00000'); // validate-test-ids: ignore (helper id)
  });

  it('rollback (double-capture guard): a bullet that fails writeFact mid-graduation strands NO fact file', () => {
    // Two high-trust bullets; the second carries a secret that writeFact's
    // Poison_Guard rejects. The cap is tuned so BOTH must graduate to fit — so
    // the poison failure leaves graduation short of the cap, which must trigger
    // the transactional rollback: the clean fact file it already created gets
    // unlinked, and graduateForCapRelief returns the original text with nothing
    // committed (zero side effects), so the failed append leaves no double-capture.
    const mk = (id, text) =>
      `- (${id}) ${text}\n  <!-- source: x.md, source_line: 1, sha1: ${'a'.repeat(40)}, write: manual-edit, trust: high, at: 2026-05-24T10:00:00Z -->`;
    const clean = mk('P-CLEANFCT', 'a clean durable architecture decision worth keeping around');
    const poison = mk(
      'P-PSNFACTV',
      'leaked sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA end',
    );
    const text = `# Working Memory\n\n## Active Threads\n${clean}\n${poison}\n\n## Pending Decisions\n`;
    const startBytes = Buffer.byteLength(text, 'utf8');
    const cleanBytes = Buffer.byteLength(`${clean}\n`, 'utf8');
    // capBytes < (start - cleanBytes) so graduating the clean bullet alone is NOT
    // enough; ≥ (start - clean - poison) so the gate deems "both fit" feasible.
    const capBytes = startBytes - cleanBytes - 1;

    const r = graduateForCapRelief({
      text,
      capBytes,
      tier: 'P',
      projectRoot,
      userDir: join(sandbox, 'user-tier'),
      now: '2026-05-24T12:00:00Z',
    });

    expect(r.graduated).toEqual([]); // couldn't relieve → nothing committed
    expect(r.text).toBe(text); // original returned unchanged
    expect(factFiles(projectRoot)).toHaveLength(0); // the clean file was rolled back
  });
});

// ===========================================================================
// Task 151.4 — demote-not-evict for the USER-TIER PERSONA (ADR-0016, §20.3).
//
// HOLE B (the v0.3.1 cold-open bug): when a user-tier persona scratchpad
// (USER/HABITS/LESSONS.md) exceeds its cap, graduateForCapRelief moved the
// OLDEST high-trust persona bullets to <userDir>/fragments/ — which
// inject-context NEVER reads — so a promoted trait VANISHED from the cold-open
// snapshot. The fix: the persona tier CONDENSES in place (mechanical, no LLM —
// LLM rewrite is Task 95) and NEVER graduates its high-trust bullets out. The
// file may grow past the inject budget (load-cap, not write-cap); the snapshot
// load-cap (§7.1.1, sweep order = 151.5) keeps high-trust injected.
// ===========================================================================

/** Build a user-tier persona scratchpad (HABITS.md) full of high-trust bullets. */
function buildHabitsMd({ targetBytes, trust = 'high', at = '2026-05-24T10:00:00Z' }) {
  const header = ['# Habits (cross-project working style)', '', '## Iteration Cadence', ''].join('\n');
  const footer = ['', '## Destructive Operations', '', '## Communication Style', '', ''].join('\n');
  const lines = [header];
  const ids = [];
  let i = 0;
  while (true) {
    // base32-safe id (excludes 0/1/8/O/I/l) — map each index digit to a safe
    // letter and pad with 'A'.
    const tail = String(i).replace(/[0-9]/g, (d) => 'ABCDEFGHJK'[Number(d)]);
    const id = `U-HAB${tail.padStart(5, 'A')}`;
    const bullet = `- (${id}) cross-project habit number ${i} that should stay injected at cold-open`;
    const comment = `  <!-- source: persona/${i}.md, source_line: 1, sha1: ${'a'.repeat(40)}, write: user-explicit, trust: ${trust}, at: ${at} -->`;
    const candidate = lines.join('\n') + '\n' + bullet + '\n' + comment + footer;
    if (Buffer.byteLength(candidate, 'utf8') >= targetBytes) break;
    lines.push(bullet);
    lines.push(comment);
    ids.push(id);
    i++;
  }
  return { content: lines.join('\n') + footer, count: i, ids };
}

function fragmentFiles(userDir) {
  const dir = join(userDir, 'fragments');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md'));
}

describe('Task 151.4 — persona condenses, never evicts to fragments (Hole B)', () => {
  let sandbox;
  let projectRoot;
  let userDir;
  let habitsMd;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-condense-test-'));
    projectRoot = join(sandbox, 'proj');
    userDir = join(sandbox, 'user');
    mkdirSync(join(projectRoot, 'context'), { recursive: true });
    mkdirSync(userDir, { recursive: true });
    habitsMd = join(userDir, 'HABITS.md');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('THE HOLE-B REPRO: high-trust persona traits past cap STILL inject — none stranded in fragments', () => {
    // A HABITS.md already over the 1800B cap, all high-trust (consolidate drops
    // nothing). Append one more high-trust trait.
    const { content, ids } = buildHabitsMd({ targetBytes: 1900 });
    writeFileSync(habitsMd, content, 'utf8');

    const r = appendScratchpadBullet({
      tier: 'U',
      scratchpad: 'HABITS.md',
      section: 'Iteration Cadence',
      text: 'a freshly promoted cross-project trait that must survive cold-open',
      provenance: {
        source: 'persona-synthesis', source_line: 1, sha1: 'b'.repeat(40),
        write: 'user-explicit', trust: 'high', at: '2026-05-30T12:00:00Z',
      },
      userDir,
      now: '2026-05-30T12:00:00Z',
    });

    // Door 1 — the write succeeds.
    expect(r.action).toBe('appended');
    // Door 1 — NOTHING graduated out of the persona (the Hole-B fix).
    expect(r.bulletsGraduated ?? 0).toBe(0);

    // Door 2 — every prior high-trust trait is STILL in the injected file...
    const after = readFileSync(habitsMd, 'utf8');
    for (const id of ids) expect(after).toContain(id);
    // ...the new trait landed...
    expect(after).toContain('must survive cold-open');
    // ...and NO fragments file was created (the eviction target that vanishes).
    expect(fragmentFiles(userDir)).toHaveLength(0);
  });

  it('over-mutation guard: a comfortable user-tier write touches nothing (no condense, no eviction)', () => {
    const { content, ids } = buildHabitsMd({ targetBytes: 400 }); // well under cap
    writeFileSync(habitsMd, content, 'utf8');

    const r = appendScratchpadBullet({
      tier: 'U', scratchpad: 'HABITS.md', section: 'Iteration Cadence',
      text: 'one more small habit',
      provenance: {
        source: 'persona-synthesis', source_line: 1, sha1: 'c'.repeat(40),
        write: 'user-explicit', trust: 'high', at: '2026-05-30T12:00:00Z',
      },
      userDir, now: '2026-05-30T12:00:00Z',
    });

    expect(r.action).toBe('appended');
    expect(r.bulletsGraduated ?? 0).toBe(0);
    const after = readFileSync(habitsMd, 'utf8');
    for (const id of ids) expect(after).toContain(id);
    expect(fragmentFiles(userDir)).toHaveLength(0);
  });
});

describe('Task 151.4 — condenseScratchpadForCapRelief (mechanical, no LLM)', () => {
  it('reclaims bytes by collapsing blank runs + trailing whitespace, dropping NO bullet', () => {
    const text = [
      '# Habits',
      '',
      '',
      '', // a 3-blank run → collapses to 1
      '## Iteration Cadence',
      '- (U-HABAAAAA) first habit   ', // trailing spaces → trimmed
      '  <!-- trust: high, at: 2026-05-24T10:00:00Z -->',
      '',
      '',
      '- (U-HABBBBBB) second habit',
      '  <!-- trust: high, at: 2026-05-24T10:00:00Z -->',
      '',
    ].join('\n');

    const out = condenseScratchpadForCapRelief(text);

    // Every bullet survives (no eviction — that is the whole point).
    expect(out).toContain('U-HABAAAAA');
    expect(out).toContain('U-HABBBBBB');
    expect(out).toContain('first habit');
    expect(out).toContain('second habit');
    // It actually reclaimed bytes (collapsed blanks / trimmed trailing space).
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThan(Buffer.byteLength(text, 'utf8'));
    // No triple-blank run remains.
    expect(out).not.toMatch(/\n\n\n/);
    // No trailing whitespace on the bullet line.
    expect(out).not.toMatch(/first habit +\n/);
  });

  it('is idempotent — condensing already-tight text returns it unchanged', () => {
    const tight = ['# Habits', '', '## Iteration Cadence', '- (U-HABAAAAA) a habit', '  <!-- trust: high -->', ''].join('\n');
    expect(condenseScratchpadForCapRelief(tight)).toBe(tight);
  });

  it('CRLF-tolerant (Windows): a CRLF-authored persona file actually condenses (not a no-op)', () => {
    // split('\n') would leave a trailing '\r' on every line and condense NOTHING —
    // the exact Task 139 CRLF class. Build with \r\n and assert bytes drop.
    const crlf = ['# Habits', '', '', '', '## Iteration Cadence', '- (U-HABAAAAA) a habit   ', '  <!-- trust: high -->', ''].join('\r\n');
    const out = condenseScratchpadForCapRelief(crlf);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThan(Buffer.byteLength(crlf, 'utf8'));
    expect(out).toContain('U-HABAAAAA'); // bullet survived
    expect(out).not.toMatch(/\n\n\n/); // blank run collapsed
    expect(out).not.toMatch(/a habit +\n/); // trailing spaces trimmed
  });
});
