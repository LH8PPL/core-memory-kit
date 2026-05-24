// Tests for Task 12 — Bounded scratchpad writer + cap enforcement (T-010).
// Per tasks.md 12.6:
//   - Test write at 50% of cap: write succeeds; consolidator not invoked
//   - Test write at 96% of cap: consolidator invoked before write
//   - Test consolidation: bullets <14d kept; >14d without trust:high dropped;
//     >14d with trust:high kept
//   - Test write that still exceeds cap after consolidation: rejected with
//     errorCategory "cap_exceeded", file unchanged
//   - Test settings.json override (MEMORY.md.max_chars: 4000) enforced even
//     if default is higher
//
// Boundary-test discipline:
//   - Test appendScratchpadBullet()'s PUBLIC contract — what lands in the
//     file, what the result shape reports, when consolidation kicks in,
//     when rejection fires.
//   - Do NOT test internal helpers (section finder, bullet formatter,
//     consolidation iterator).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendScratchpadBullet } from '../packages/cli/src/scratchpad.mjs';

// Default cap for MEMORY.md per design §1.1
const MEMORY_MD_DEFAULT_CAP = 2500;

/** Build a minimal MEMORY.md file with the documented 3-section layout +
 * an empty Active Threads section, sized to approximately `targetBytes`.
 * Padding goes in the Environment Notes section as inert bullets WITH
 * recent timestamps + trust:high so the consolidator can't drop them
 * (unless the caller passes oldPaddingDate / paddingTrust to make them
 * droppable). */
function buildMemoryMd({
  targetBytes,
  paddingDate = '2026-05-24T10:00:00Z',
  paddingTrust = 'high',
}) {
  const header = [
    '<!--',
    'Cap: 2500 chars.',
    `Last distilled: 2026-05-24.`,
    `Last health check: 2026-05-24.`,
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

  // Each padding bullet+comment is ~250 chars. Add until we hit target.
  const lines = [header];
  let i = 0;
  while (true) {
    const id = `P-PAD${String(i).padStart(5, '0')}`;
    const bullet = `- (${id}) padding bullet number ${i} ensuring deterministic char count`;
    const comment = `  <!-- source: pad/${i}.md, source_line: 1, sha1: ${'a'.repeat(40)}, write: manual-edit, trust: ${paddingTrust}, at: ${paddingDate} -->`;
    const candidate = lines.join('\n') + '\n' + bullet + '\n' + comment + footer;
    if (Buffer.byteLength(candidate, 'utf8') >= targetBytes) {
      // Stop adding padding; current state hasn't pushed past target yet.
      break;
    }
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

describe('Task 12 — appendScratchpadBullet() boundary', () => {
  let sandbox;
  let projectRoot;
  let userDir;
  let memoryMd;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-scratchpad-test-'));
    projectRoot = join(sandbox, 'proj');
    userDir = join(sandbox, 'user-tier');
    mkdirSync(join(projectRoot, 'context'), { recursive: true });
    memoryMd = join(projectRoot, 'context', 'MEMORY.md');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('happy path', () => {
    it('appends a bullet to the named section of an existing scratchpad', () => {
      writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 800 }), 'utf8');
      const r = appendScratchpadBullet(
        validBulletOpts({ projectRoot, text: 'the new bullet text' }),
      );
      expect(r.action).toBe('appended');
      expect(r.path).toBe(memoryMd);
      expect(typeof r.id).toBe('string');
      expect(r.id).toMatch(/^P-[2345679ABCDEFGHJKLMNPQRSTUVWXYZa]{8}$/);
      const after = readFileSync(memoryMd, 'utf8');
      expect(after).toContain('the new bullet text');
      expect(after).toContain(r.id);
    });

    it('the bullet text + provenance HTML comment appear under the named section, not elsewhere', () => {
      writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 800 }), 'utf8');
      const r = appendScratchpadBullet(
        validBulletOpts({
          projectRoot,
          section: 'Pending Decisions',
          text: 'a pending-decisions bullet',
        }),
      );
      expect(r.action).toBe('appended');
      const after = readFileSync(memoryMd, 'utf8');
      const pendingIdx = after.indexOf('## Pending Decisions');
      const bulletIdx = after.indexOf('a pending-decisions bullet');
      expect(pendingIdx).toBeGreaterThan(0);
      expect(bulletIdx).toBeGreaterThan(pendingIdx);
    });

    it('result reports cap, currentBytes, capUsedPct, and whether consolidation ran', () => {
      writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 800 }), 'utf8');
      const r = appendScratchpadBullet(validBulletOpts({ projectRoot }));
      expect(r.cap).toBe(MEMORY_MD_DEFAULT_CAP);
      expect(typeof r.bytes).toBe('number');
      expect(r.bytes).toBeGreaterThan(0);
      expect(r.bytes).toBeLessThanOrEqual(MEMORY_MD_DEFAULT_CAP);
      expect(r.consolidationRan).toBe(false);
    });

    it('appends an audit-log entry with action: "appended", canonical schema', () => {
      writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 800 }), 'utf8');
      const r = appendScratchpadBullet(validBulletOpts({ projectRoot }));
      const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
      expect(existsSync(auditPath)).toBe(true);
      const lines = readFileSync(auditPath, 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l));
      const entry = lines.find((e) => e.action === 'appended' && e.id === r.id);
      expect(entry).toBeDefined();
      expect(entry.schema).toBe(1);
      expect(entry.tier).toBe('P');
      expect(entry.paths.after).toBe(memoryMd);
    });
  });

  describe('schema validation', () => {
    const fieldsToOmit = ['tier', 'scratchpad', 'section', 'text', 'provenance'];
    for (const field of fieldsToOmit) {
      it(`omitting ${field} → action: "error", errorCategory: "schema"`, () => {
        writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 800 }), 'utf8');
        const opts = validBulletOpts({ projectRoot });
        delete opts[field];
        const r = appendScratchpadBullet(opts);
        expect(r.action).toBe('error');
        expect(r.errorCategory).toBe('schema');
        expect(r.errors.join(' ').toLowerCase()).toContain(field.toLowerCase());
      });
    }

    it('invalid tier → schema error', () => {
      const r = appendScratchpadBullet(
        validBulletOpts({ projectRoot, tier: 'X' }),
      );
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('scratchpad not valid for tier (e.g. MEMORY.md in tier U) → schema error', () => {
      const r = appendScratchpadBullet(
        validBulletOpts({ userDir, tier: 'U', scratchpad: 'MEMORY.md' }),
      );
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
      expect(r.errors.join(' ')).toMatch(/scratchpad|tier/i);
    });

    it('section not present in the file → schema error, file untouched', () => {
      const original = buildMemoryMd({ targetBytes: 800 });
      writeFileSync(memoryMd, original, 'utf8');
      const r = appendScratchpadBullet(
        validBulletOpts({ projectRoot, section: 'Nonexistent Section' }),
      );
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
      expect(r.errors.join(' ')).toMatch(/section/i);
      expect(readFileSync(memoryMd, 'utf8')).toBe(original);
    });

    it('provenance missing required fields → schema error', () => {
      writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 800 }), 'utf8');
      const r = appendScratchpadBullet(
        validBulletOpts({
          projectRoot,
          provenance: { source: 'x', source_line: 1, sha1: 'a'.repeat(40) /* missing write/trust/at */ },
        }),
      );
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
      expect(r.errors.join(' ')).toMatch(/provenance/i);
    });

    it('invalid trust value in provenance → schema error', () => {
      writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 800 }), 'utf8');
      const r = appendScratchpadBullet(
        validBulletOpts({
          projectRoot,
          provenance: {
            source: 'x',
            source_line: 1,
            sha1: 'a'.repeat(40),
            write: 'user-explicit',
            trust: 'medium-rare',
            at: '2026-05-24T12:00:00Z',
          },
        }),
      );
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });
  });

  describe('cap reading from settings.json (task 12.4)', () => {
    it('hardcoded default applies when no settings.json exists', () => {
      writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 800 }), 'utf8');
      const r = appendScratchpadBullet(validBulletOpts({ projectRoot }));
      expect(r.cap).toBe(MEMORY_MD_DEFAULT_CAP);
    });

    it('project settings.json override applies (max_chars: 4000)', () => {
      writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 800 }), 'utf8');
      writeFileSync(
        join(projectRoot, 'context', 'settings.json'),
        JSON.stringify({
          scratchpads: { 'MEMORY.md': { max_chars: 4000 } },
        }),
        'utf8',
      );
      const r = appendScratchpadBullet(validBulletOpts({ projectRoot }));
      expect(r.cap).toBe(4000);
    });

    it('project settings.json override applies even if the documented default is HIGHER', () => {
      // Documented default is 2500. Override to 1000. Append should see 1000 as the cap.
      writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 800 }), 'utf8');
      writeFileSync(
        join(projectRoot, 'context', 'settings.json'),
        JSON.stringify({
          scratchpads: { 'MEMORY.md': { max_chars: 1000 } },
        }),
        'utf8',
      );
      const r = appendScratchpadBullet(validBulletOpts({ projectRoot }));
      expect(r.cap).toBe(1000);
    });

    it('user settings.json applies when project settings absent', () => {
      mkdirSync(userDir, { recursive: true });
      const userMd = join(userDir, 'USER.md');
      writeFileSync(userMd, buildMemoryMdLikeUser({ targetBytes: 400 }), 'utf8');
      writeFileSync(
        join(userDir, 'settings.json'),
        JSON.stringify({
          scratchpads: { 'USER.md': { max_chars: 3000 } },
        }),
        'utf8',
      );
      const r = appendScratchpadBullet(
        validBulletOpts({
          userDir,
          tier: 'U',
          scratchpad: 'USER.md',
          section: 'About',
        }),
      );
      expect(r.action).toBe('appended');
      expect(r.cap).toBe(3000);
    });

    it('project settings.json wins over user settings.json (tier P)', () => {
      writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 800 }), 'utf8');
      mkdirSync(userDir, { recursive: true });
      writeFileSync(
        join(userDir, 'settings.json'),
        JSON.stringify({
          scratchpads: { 'MEMORY.md': { max_chars: 9999 } },
        }),
        'utf8',
      );
      writeFileSync(
        join(projectRoot, 'context', 'settings.json'),
        JSON.stringify({
          scratchpads: { 'MEMORY.md': { max_chars: 1500 } },
        }),
        'utf8',
      );
      const r = appendScratchpadBullet(
        validBulletOpts({ projectRoot, userDir }),
      );
      expect(r.cap).toBe(1500);
    });
  });

  describe('consolidation triggered at >95% of cap (task 12.3)', () => {
    it('write at ~50% of cap → consolidator NOT invoked', () => {
      writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 1250 }), 'utf8');
      const r = appendScratchpadBullet(validBulletOpts({ projectRoot }));
      expect(r.action).toBe('appended');
      expect(r.consolidationRan).toBe(false);
      expect(r.bulletsConsolidated).toBe(0);
    });

    it('write that would push to >95% of cap → consolidator IS invoked', () => {
      // Seed near the threshold with stale bullets that the consolidator can drop.
      writeFileSync(
        memoryMd,
        buildMemoryMd({
          targetBytes: 2400, // > 95% of 2500
          paddingDate: '2026-04-01T00:00:00Z', // >14d old
          paddingTrust: 'medium', // not protected
        }),
        'utf8',
      );
      const r = appendScratchpadBullet(validBulletOpts({ projectRoot }));
      expect(r.action).toBe('appended');
      expect(r.consolidationRan).toBe(true);
      expect(r.bulletsConsolidated).toBeGreaterThan(0);
    });

    it('consolidation: bullets <14d kept; >14d without trust:high dropped; >14d with trust:high kept', () => {
      // Mixed-age scratchpad: 3 stale-medium, 3 stale-high, 3 recent-medium
      const stale = '2026-04-01T00:00:00Z'; // >14d old
      const recent = '2026-05-20T00:00:00Z'; // <14d old (now is 2026-05-24)
      const mkBullet = (id, at, trust) =>
        `- (${id}) bullet ${id}\n  <!-- source: x.md, source_line: 1, sha1: ${'a'.repeat(40)}, write: manual-edit, trust: ${trust}, at: ${at} -->`;

      const file = [
        '<!--',
        'Cap: 2500 chars.',
        'Last distilled: 2026-05-24.',
        'Last health check: 2026-05-24.',
        '-->',
        '',
        '# Working Memory',
        '',
        '## Active Threads',
        mkBullet('P-OLDMED01', stale, 'medium'),
        mkBullet('P-OLDMED02', stale, 'medium'),
        mkBullet('P-OLDMED03', stale, 'medium'),
        mkBullet('P-OLDHGH01', stale, 'high'),
        mkBullet('P-OLDHGH02', stale, 'high'),
        mkBullet('P-OLDHGH03', stale, 'high'),
        mkBullet('P-NEWMED01', recent, 'medium'),
        mkBullet('P-NEWMED02', recent, 'medium'),
        mkBullet('P-NEWMED03', recent, 'medium'),
        '',
        '## Environment Notes',
        '',
        '## Pending Decisions',
        '',
      ].join('\n');

      writeFileSync(memoryMd, file, 'utf8');

      // Override cap so the file is already over 95% of it — forces consolidation.
      // Cap must be tight enough to trigger consolidation (file pre-write is
      // ~1620 bytes; after inserting 1 new bullet ~1870; > 95% of 1500 = 1425)
      // AND loose enough that the post-consolidation file (~1380 after dropping
      // 3 stale-medium bullets) still fits under the cap.
      writeFileSync(
        join(projectRoot, 'context', 'settings.json'),
        JSON.stringify({
          scratchpads: { 'MEMORY.md': { max_chars: 1500 } },
        }),
        'utf8',
      );

      const r = appendScratchpadBullet(validBulletOpts({ projectRoot }));
      expect(r.action).toBe('appended');
      expect(r.consolidationRan).toBe(true);
      const after = readFileSync(memoryMd, 'utf8');

      // Stale-medium → dropped
      expect(after).not.toContain('P-OLDMED01');
      expect(after).not.toContain('P-OLDMED02');
      expect(after).not.toContain('P-OLDMED03');

      // Stale-high → kept (trust: high preserved regardless of age)
      expect(after).toContain('P-OLDHGH01');
      expect(after).toContain('P-OLDHGH02');
      expect(after).toContain('P-OLDHGH03');

      // Recent-medium → kept (<14d old)
      expect(after).toContain('P-NEWMED01');
      expect(after).toContain('P-NEWMED02');
      expect(after).toContain('P-NEWMED03');

      expect(r.bulletsConsolidated).toBe(3);
    });
  });

  describe('rejection: still over cap after consolidation (task 12.5)', () => {
    it('all-recent-high-trust scratchpad pushed over cap → error_category cap_exceeded, file unchanged', () => {
      // Build a scratchpad full of recent + high-trust padding — consolidator
      // can't drop anything. Then append one more bullet to push over the cap.
      const original = buildMemoryMd({
        targetBytes: 2480, // close to 2500 default cap
        paddingDate: '2026-05-24T11:00:00Z', // recent
        paddingTrust: 'high', // protected
      });
      writeFileSync(memoryMd, original, 'utf8');

      const r = appendScratchpadBullet(validBulletOpts({ projectRoot }));
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('cap_exceeded');
      expect(r.errors.join(' ')).toMatch(/cap|exceeded/i);

      // File untouched
      expect(readFileSync(memoryMd, 'utf8')).toBe(original);
    });

    it('settings.json override creates an artificially low cap → rejection fires earlier', () => {
      writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 800 }), 'utf8');
      writeFileSync(
        join(projectRoot, 'context', 'settings.json'),
        JSON.stringify({
          scratchpads: { 'MEMORY.md': { max_chars: 750 } },
        }),
        'utf8',
      );
      const r = appendScratchpadBullet(validBulletOpts({ projectRoot }));
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('cap_exceeded');
    });
  });
});

/** Like buildMemoryMd but with USER.md's documented section names. */
function buildMemoryMdLikeUser({ targetBytes }) {
  const header = [
    '<!--',
    'Cap: 1375 chars.',
    'Last distilled: 2026-05-24.',
    'Last health check: 2026-05-24.',
    '-->',
    '',
    '# About me',
    '',
    '## About',
    '',
    '## Preferences',
    '',
  ].join('\n');
  const footer = ['', '## Working Style', '', ''].join('\n');
  const lines = [header];
  let i = 0;
  while (true) {
    const id = `U-PAD${String(i).padStart(5, '0')}`;
    const bullet = `- (${id}) user padding ${i}`;
    const comment = `  <!-- source: pad/${i}.md, source_line: 1, sha1: ${'a'.repeat(40)}, write: manual-edit, trust: high, at: 2026-05-24T10:00:00Z -->`;
    const candidate = lines.join('\n') + '\n' + bullet + '\n' + comment + footer;
    if (Buffer.byteLength(candidate, 'utf8') >= targetBytes) break;
    lines.push(bullet);
    lines.push(comment);
    i++;
  }
  return lines.join('\n') + footer;
}
