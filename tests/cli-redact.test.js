// @doors: 1, 2, 3, 5
// Door 4 N/A: no message queue.

// Tests for Task 96 (ADR-0022, D-62/D-218) — the compliance scrub.
//
// `redactFact` removes a leaked secret/PII span from EVERY app-layer copy of a
// fact — the live file (or its tombstoned/superseded archive copy), the
// dual-written scratchpad bullet, the INDEX + search index — replacing it with
// `[redacted: <reason> <date>]` while KEEPING the fact and an audit entry that
// never contains the secret. `purgeHard` is the whole-fact irreversible delete.
//
// The ADR-0022 contract pinned here:
//   - app-layer scrub is COMPLETE (live + tombstones + superseded + scratchpad
//     + indexes) and idempotent;
//   - the audit trail survives, secret-free;
//   - git history is NOT touched — the CLI prints the rotate-first + filter-repo
//     advisory instead (Door 3 pins the advisory text);
//   - purge --hard is explicit-human-only and NEVER an MCP tool (§6.5).
//
// Seeding note: several tests write fact files DIRECTLY (bypassing writeFact)
// — deliberate: the compliance case is a secret that landed BEFORE the guard
// existed (writeFact's Poison_Guard would reject a secret-shaped seed today,
// which is the point of Task 231).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../packages/cli/src/install.mjs';
import { redactFact, purgeHard } from '../packages/cli/src/redact.mjs';
import { search } from '../packages/cli/src/search.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const CMK_BIN = join(REPO_ROOT, 'packages', 'cli', 'bin', 'cmk.mjs');

// A leaked "credential" that is NOT guard-shaped (so control writes pass) but
// unique enough that zero occurrences after a scrub is meaningful.
const SECRET = 'hunter2-blue-credential-XKQV93';

let sandbox;
let projectRoot;
let userDir;

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-redact-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

const factDir = () => join(projectRoot, 'context', 'memory');
const indexPath = () => join(factDir(), 'INDEX.md');
const memoryMdPath = () => join(projectRoot, 'context', 'MEMORY.md');
const auditPath = () => join(projectRoot, 'context', '.locks', 'audit.log');

// Seed a legacy fact file carrying the secret (pre-guard era), id-stamped.
function seedLeakedFact({ id = 'P-RDCTAAAA', slug = 'leaked-fact', extra = '' } = {}) {
  const p = join(factDir(), `project_${slug}.md`);
  writeFileSync(
    p,
    `---\nid: ${id}\ntype: project\ntitle: deploy notes with ${SECRET}\ntrust: medium\ncreated_at: 2026-01-01T00:00:00Z\n---\n\nthe deploy uses ${SECRET} on the bastion${extra}\n\n**Why:** legacy leak predating the guard\n`,
  );
  return { id, path: p };
}

describe('redactFact — the app-layer scrub (ADR-0022)', () => {
  it('scrubs every occurrence in a LIVE fact (body + title), keeps the fact, marks the span', () => {
    const { id, path } = seedLeakedFact();
    const r = redactFact({ id, pattern: SECRET, reason: 'leaked credential', projectRoot, userDir });

    expect(r.action).toBe('redacted');
    expect(r.occurrences).toBeGreaterThanOrEqual(2); // title + body
    const after = readFileSync(path, 'utf8');
    expect(after).not.toContain(SECRET);
    expect(after).toContain('[redacted: leaked credential');
    // the rest of the fact survives (redact ≠ delete)
    expect(after).toContain('the deploy uses');
    expect(after).toContain('legacy leak predating the guard');
  });

  it('scrubs a TOMBSTONED copy (the archive is the compliance surface a tombstone preserves)', () => {
    const tombDir = join(factDir(), 'archive', 'tombstones');
    mkdirSync(tombDir, { recursive: true });
    const p = join(tombDir, 'P-RDCTBBBB.md');
    writeFileSync(p, `---\nid: P-RDCTBBBB\ntype: project\ntitle: old fact\ndeleted_at: 2026-01-02T00:00:00Z\n---\n\nheld ${SECRET} verbatim\n`);

    const r = redactFact({ id: 'P-RDCTBBBB', pattern: SECRET, projectRoot, userDir });
    expect(r.action).toBe('redacted');
    expect(readFileSync(p, 'utf8')).not.toContain(SECRET);
  });

  it('scrubs a SUPERSEDED copy', () => {
    const supDir = join(factDir(), 'archive', 'superseded');
    mkdirSync(supDir, { recursive: true });
    const p = join(supDir, 'P-RDCTCCCC.md');
    writeFileSync(p, `---\nid: P-RDCTCCCC\ntype: project\ntitle: superseded\nsuperseded_by: P-RDCTAAAA\n---\n\nolder text with ${SECRET}\n`);

    const r = redactFact({ id: 'P-RDCTCCCC', pattern: SECRET, projectRoot, userDir });
    expect(r.action).toBe('redacted');
    expect(readFileSync(p, 'utf8')).not.toContain(SECRET);
  });

  it('scrubs the dual-written scratchpad bullet IN PLACE (line kept, span replaced)', () => {
    const { id } = seedLeakedFact();
    const md = readFileSync(memoryMdPath(), 'utf8');
    writeFileSync(memoryMdPath(), md + `\n- (${id}) deploy uses ${SECRET} on the bastion\n`);

    redactFact({ id, pattern: SECRET, projectRoot, userDir });

    const after = readFileSync(memoryMdPath(), 'utf8');
    expect(after).not.toContain(SECRET);
    expect(after).toContain(`(${id}) deploy uses [redacted:`); // bullet survives, span gone
  });

  it('the INDEX and the search index no longer carry the secret (in-band reindex — no manual follow-up)', () => {
    const { id } = seedLeakedFact();
    const r = redactFact({ id, pattern: SECRET, projectRoot, userDir });
    expect(r.action).toBe('redacted');

    if (existsSync(indexPath())) {
      expect(readFileSync(indexPath(), 'utf8')).not.toContain(SECRET);
    }
    const hits = search({ query: SECRET, projectRoot, userDir, mode: 'keyword' });
    expect((hits.results ?? []).length).toBe(0);
  });

  it('the audit entry records the redaction WITHOUT the secret (Door 5)', () => {
    const { id } = seedLeakedFact();
    redactFact({ id, pattern: SECRET, reason: 'compliance', projectRoot, userDir });

    const audit = readFileSync(auditPath(), 'utf8');
    expect(audit).toContain('"action":"redacted"');
    expect(audit).toContain(id);
    expect(audit).not.toContain(SECRET);
  });

  it('over-mutation guard: OTHER facts and non-matching spans are untouched', () => {
    const { id } = seedLeakedFact();
    const otherPath = join(factDir(), 'project_innocent.md');
    const otherContent = `---\nid: P-RDCTDDDD\ntype: project\ntitle: innocent\n---\n\nnothing secret here\n`;
    writeFileSync(otherPath, otherContent);

    redactFact({ id, pattern: SECRET, projectRoot, userDir });
    expect(readFileSync(otherPath, 'utf8')).toBe(otherContent);
  });

  it('reports pattern occurrences REMAINING ELSEWHERE (per-fact scope is explicit, not silent)', () => {
    const { id } = seedLeakedFact();
    writeFileSync(
      join(factDir(), 'project_second-leak.md'),
      `---\nid: P-RDCTEEEE\ntype: project\ntitle: second\n---\n\nalso carries ${SECRET}\n`,
    );

    const r = redactFact({ id, pattern: SECRET, projectRoot, userDir });
    expect(r.action).toBe('redacted');
    expect(r.remainingElsewhere).toBeGreaterThanOrEqual(1);
    // and it did NOT scrub the other fact (per-id scope)
    expect(readFileSync(join(factDir(), 'project_second-leak.md'), 'utf8')).toContain(SECRET);
  });

  it('is idempotent — a second run finds zero occurrences and is not an error', () => {
    const { id } = seedLeakedFact();
    redactFact({ id, pattern: SECRET, projectRoot, userDir });
    const second = redactFact({ id, pattern: SECRET, projectRoot, userDir });
    expect(second.action).toBe('redacted');
    expect(second.occurrences).toBe(0);
  });

  it('unknown id → not-found; empty pattern → schema error (Door 1 — the repo result-shape contract)', () => {
    expect(redactFact({ id: 'P-RDCTZZZZ', pattern: SECRET, projectRoot, userDir }).action).toBe('not-found');
    const { id } = seedLeakedFact();
    expect(redactFact({ id, pattern: '', projectRoot, userDir }).action).toBe('error');
  });
});

// The live-test finding (2026-07-16): fact FILENAMES are derived from the
// title (writeFact: `${type}_${slugifyFact(title)}.md`), so a title-borne
// secret leaks into the COMMITTED path itself — the body scrub left the
// filename shouting the secret via INDEX links, search source_file, and the
// audit-log path echo. redactFact must rename when the title changed.
describe('redactFact — filename scrub (title-borne secret leaks into the committed path)', () => {
  const SLUG_FRAGMENT = 'hunter2-blue-credential-xkqv93'; // slugifyFact(SECRET)

  // Seed the way writeFact names files: slug computed from the leaked title.
  function seedTitleLeak(id = 'P-RDCTGGGG') {
    const p = join(factDir(), `project_deploy-notes-with-${SLUG_FRAGMENT}.md`);
    writeFileSync(
      p,
      `---\nid: ${id}\ntype: project\ntitle: deploy notes with ${SECRET}\ntrust: medium\ncreated_at: 2026-01-01T00:00:00Z\n---\n\nrotate ${SECRET} quarterly\n`,
    );
    return { id, path: p };
  }

  it('renames a LIVE fact whose filename carries the secret slug; the fact stays resolvable by id', () => {
    const { id, path } = seedTitleLeak();
    const r = redactFact({ id, pattern: SECRET, reason: 'leaked', projectRoot, userDir });

    expect(r.action).toBe('redacted');
    expect(r.renamed).toBeTruthy();
    expect(r.renamed.from).toBe(path);
    expect(existsSync(path)).toBe(false); // old secret-bearing path is GONE
    expect(existsSync(r.renamed.to)).toBe(true);
    expect(r.renamed.to).not.toContain(SLUG_FRAGMENT);
    // still resolvable at the new path — a rename that orphans the id is worse
    const second = redactFact({ id, pattern: SECRET, projectRoot, userDir });
    expect(second.action).toBe('redacted');
    expect(second.occurrences).toBe(0);
  });

  it('search + INDEX no longer surface the secret via the PATH after the rename', () => {
    const { id } = seedTitleLeak('P-RDCTHHHH');
    redactFact({ id, pattern: SECRET, projectRoot, userDir });

    if (existsSync(indexPath())) {
      expect(readFileSync(indexPath(), 'utf8')).not.toContain(SLUG_FRAGMENT);
    }
    // the live-test repro: `cmk search hunter2` matched the source_file path
    const hits = search({ query: 'hunter2', projectRoot, userDir, mode: 'keyword' });
    expect((hits.results ?? []).length).toBe(0);
  });

  it('does NOT rename when the secret is body-only (title clean → filename clean)', () => {
    const { id, path } = seedLeakedFact({ id: 'P-RDCTJJJJ', slug: 'clean-title-fact' });
    // overwrite: title without the secret, body with it
    writeFileSync(
      path,
      `---\nid: ${id}\ntype: project\ntitle: clean title\n---\n\nbody carries ${SECRET}\n`,
    );
    const r = redactFact({ id, pattern: SECRET, projectRoot, userDir });
    expect(r.action).toBe('redacted');
    expect(r.renamed).toBeNull();
    expect(existsSync(path)).toBe(true);
  });

  it('never renames an ARCHIVE copy (tombstones/superseded are id-named; resolveFact depends on it)', () => {
    const tombDir = join(factDir(), 'archive', 'tombstones');
    mkdirSync(tombDir, { recursive: true });
    const p = join(tombDir, 'P-RDCTKKKK.md');
    writeFileSync(p, `---\nid: P-RDCTKKKK\ntype: project\ntitle: had ${SECRET} in title\ndeleted_at: 2026-01-02T00:00:00Z\n---\n\nbody\n`);

    const r = redactFact({ id: 'P-RDCTKKKK', pattern: SECRET, projectRoot, userDir });
    expect(r.action).toBe('redacted');
    expect(r.renamed).toBeNull();
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p, 'utf8')).not.toContain(SECRET);
  });

  it('rename collision → id-suffixed filename, still no secret in the path', () => {
    const { id } = seedTitleLeak('P-RDCTMMMM');
    // pre-create the file the scrubbed title would slug to, forcing a collision
    const probe = redactFact({ id, pattern: SECRET, reason: 'x', projectRoot, userDir, now: '2026-07-16T00:00:00Z' });
    expect(probe.renamed).toBeTruthy();
    // seed a SECOND leaked fact whose scrubbed title collides with the first's
    const dupe = seedTitleLeak('P-RDCTNNNN');
    const r = redactFact({ id: dupe.id, pattern: SECRET, reason: 'x', projectRoot, userDir, now: '2026-07-16T00:00:00Z' });
    expect(r.renamed).toBeTruthy();
    expect(r.renamed.to).not.toBe(probe.renamed.to); // did not clobber the first
    expect(r.renamed.to).not.toContain(SLUG_FRAGMENT);
    expect(existsSync(r.renamed.to)).toBe(true);
    expect(existsSync(probe.renamed.to)).toBe(true); // over-mutation guard
  });

  it('purge audit entry never records the removed PATH (a secret-titled filename would leak into the log purge cannot scrub) — Door 5', () => {
    const { id } = seedTitleLeak('P-RDCTQQQQ');
    const r = purgeHard({ id, yes: true, projectRoot, userDir });
    expect(r.action).toBe('purged');

    const audit = readFileSync(auditPath(), 'utf8');
    const purgedLine = audit.split('\n').find((l) => l.includes('"action":"purged"'));
    expect(purgedLine).toBeTruthy();
    expect(purgedLine).toContain(id); // the id identifies the fact
    expect(purgedLine).not.toContain(SLUG_FRAGMENT); // the path is the leak
  });

  it('scrubs the audit-log PATH ECHO (a created-entry carries the secret-slug path) — Door 5', () => {
    const { id, path } = seedTitleLeak('P-RDCTPPPP');
    // simulate the original writeFact audit entry echoing the leaked path
    const createdEntry = JSON.stringify({
      ts: '2026-01-01T00:00:00Z', schema: 1, action: 'created', tier: 'P', id,
      reasonCode: 'fact-created', paths: { after: path },
    });
    writeFileSync(auditPath(), createdEntry + '\n', { flag: 'a' });

    redactFact({ id, pattern: SECRET, projectRoot, userDir });

    const audit = readFileSync(auditPath(), 'utf8');
    expect(audit).not.toContain(SECRET);
    expect(audit).not.toContain(SLUG_FRAGMENT);
    // the log is still line-parseable NDJSON after the scrub
    for (const line of audit.split('\n').filter(Boolean)) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe('purgeHard — the irreversible whole-fact delete (§6.5)', () => {
  it('removes the fact file, its scratchpad bullet, and the index rows; audit survives', () => {
    const { id, path } = seedLeakedFact();
    const md = readFileSync(memoryMdPath(), 'utf8');
    writeFileSync(memoryMdPath(), md + `\n- (${id}) deploy uses ${SECRET}\n`);

    const r = purgeHard({ id, yes: true, projectRoot, userDir });

    expect(r.action).toBe('purged');
    expect(existsSync(path)).toBe(false);
    expect(readFileSync(memoryMdPath(), 'utf8')).not.toContain(id);
    const hits = search({ query: SECRET, projectRoot, userDir, mode: 'keyword' });
    expect((hits.results ?? []).length).toBe(0);
    const audit = readFileSync(auditPath(), 'utf8');
    expect(audit).toContain('"action":"purged"');
    expect(audit).not.toContain(SECRET);
  });

  it('purges a TOMBSTONED fact too (the archive copy is exactly what compliance wants gone)', () => {
    const tombDir = join(factDir(), 'archive', 'tombstones');
    mkdirSync(tombDir, { recursive: true });
    const p = join(tombDir, 'P-RDCTFFFF.md');
    writeFileSync(p, `---\nid: P-RDCTFFFF\ntype: project\ntitle: old\ndeleted_at: 2026-01-02T00:00:00Z\n---\n\n${SECRET}\n`);

    const r = purgeHard({ id: 'P-RDCTFFFF', yes: true, projectRoot, userDir });
    expect(r.action).toBe('purged');
    expect(existsSync(p)).toBe(false);
  });

  it('refuses without explicit yes (never a silent irreversible delete)', () => {
    const { id, path } = seedLeakedFact();
    const r = purgeHard({ id, projectRoot, userDir });
    expect(r.action).toBe('error');
    expect(existsSync(path)).toBe(true);
  });
});

// Skill-review B1/B2/B3 + I6/I7 — the scrub surface must match the kit's
// ACTUAL dual-write graph (L-tier scratchpads incl. private.md, the committed
// DECISIONS.md journal, the audit log's path echoes), not a hand-rolled subset.
describe('redact/purge — the full dual-write graph (skill-review fixes)', () => {
  const localRoot = () => join(projectRoot, 'context.local');

  it('scrubs an L-TIER fact bullet in context.local/private.md (where the sensitivity screen routes secrets)', () => {
    const lFactDir = join(localRoot(), 'memory');
    mkdirSync(lFactDir, { recursive: true });
    writeFileSync(
      join(lFactDir, 'project_local-leak.md'),
      `---\nid: L-RDCTRRRR\ntype: project\ntitle: local leak\n---\n\nuses ${SECRET}\n`,
    );
    const privatePad = join(localRoot(), 'private.md');
    writeFileSync(privatePad, `# Private\n\n- (L-RDCTRRRR) stored ${SECRET} here\n`);

    const r = redactFact({ id: 'L-RDCTRRRR', pattern: SECRET, projectRoot, userDir });
    expect(r.action).toBe('redacted');
    expect(readFileSync(privatePad, 'utf8')).not.toContain(SECRET);
    expect(readFileSync(privatePad, 'utf8')).toContain('(L-RDCTRRRR) stored [redacted:');
  });

  it('scrubs the committed DECISIONS.md journal entry (title + Why dual-write) — bounded to THIS fact\'s span', () => {
    const { id } = seedLeakedFact({ id: 'P-RDCTSSSS', slug: 'journal-leak' });
    const journal = join(projectRoot, 'context', 'DECISIONS.md');
    writeFileSync(
      journal,
      `# Decisions\n\n<!-- decision:${id} -->\n\n## deploy notes with ${SECRET}\n\n**When:** 2026-01-01 · **Fact:** \`${id}\`\n**Why:** rotate ${SECRET} quarterly\n\n<!-- decision:P-RDCTTTTT -->\n\n## other entry\n\n**Why:** unrelated ${SECRET} mention\n`,
    );

    const r = redactFact({ id, pattern: SECRET, projectRoot, userDir });
    const after = readFileSync(journal, 'utf8');
    // THIS entry scrubbed…
    expect(after).not.toContain(`deploy notes with ${SECRET}`);
    expect(after).toContain('deploy notes with [redacted:');
    // …the OTHER entry untouched (per-fact scope) but REPORTED
    expect(after).toContain(`unrelated ${SECRET} mention`);
    expect(r.remainingElsewhere).toBeGreaterThanOrEqual(1);
  });

  it('purge --hard REMOVES the journal entry (the entry text IS the fact) and leaves other entries', () => {
    const { id } = seedLeakedFact({ id: 'P-RDCTUUUU', slug: 'purge-journal' });
    const journal = join(projectRoot, 'context', 'DECISIONS.md');
    writeFileSync(
      journal,
      `# Decisions\n\n<!-- decision:${id} -->\n\n## the purged one\n\n**Why:** goes away\n\n<!-- decision:P-RDCTTTTT -->\n\n## survivor entry\n\n**Why:** stays\n`,
    );

    const r = purgeHard({ id, yes: true, projectRoot, userDir });
    expect(r.action).toBe('purged');
    expect(r.journalRemoved).toBeTruthy();
    const after = readFileSync(journal, 'utf8');
    expect(after).not.toContain('the purged one');
    expect(after).toContain('survivor entry'); // over-mutation guard
  });

  it('purge scrubs historical audit PATH ECHOES of the removed file (B3 — purge knows the filenames, not the pattern)', () => {
    const { id, path } = seedTitleLeakAt('P-RDCTVVVV');
    const createdEntry = JSON.stringify({
      ts: '2026-01-01T00:00:00Z', schema: 1, action: 'created', tier: 'P', id,
      reasonCode: 'fact-created', paths: { after: path },
    });
    writeFileSync(auditPath(), createdEntry + '\n', { flag: 'a' });

    const r = purgeHard({ id, yes: true, projectRoot, userDir });
    expect(r.action).toBe('purged');
    const audit = readFileSync(auditPath(), 'utf8');
    expect(audit).not.toContain('hunter2-blue-credential-xkqv93');
    for (const line of audit.split('\n').filter(Boolean)) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('audit scrub is JSON-AWARE: a pattern with quotes/backslashes is caught in its ESCAPED form (I6)', () => {
    const trickySecret = 'C:\\keys\\svc"account';
    const { id, path } = seedLeakedFact({ id: 'P-RDCTWWWW', slug: 'tricky' });
    writeFileSync(path, `---\nid: ${id}\ntype: project\ntitle: tricky\n---\n\nkey at ${trickySecret} rotate\n`);
    // an audit entry whose STRING VALUE holds the secret — raw bytes on disk
    // carry it escaped (\\ and \"), which a byte-literal replace misses
    writeFileSync(
      auditPath(),
      JSON.stringify({ ts: '2026-01-01T00:00:00Z', schema: 1, action: 'created', tier: 'P', id, reasonCode: 'fact-created', extra: { note: `seeded ${trickySecret}` } }) + '\n',
      { flag: 'a' },
    );

    const r = redactFact({ id, pattern: trickySecret, projectRoot, userDir });
    expect(r.occurrences).toBeGreaterThanOrEqual(1);
    const audit = readFileSync(auditPath(), 'utf8');
    const createdLine = audit.split('\n').find((l) => l.includes('"created"'));
    const note = JSON.parse(createdLine).extra.note;
    expect(note).toContain('[redacted]');
    expect(note).not.toContain(trickySecret);
  });

  it('a NON-BULLET scratchpad line with the secret is REPORTED, not silently missed (I7)', () => {
    const { id } = seedLeakedFact({ id: 'P-RDCTXXXX', slug: 'stray-line' });
    const md = readFileSync(memoryMdPath(), 'utf8');
    writeFileSync(
      memoryMdPath(),
      md + `\n- (${id}) bullet with ${SECRET}\n- (P-RDCTTTTT) unrelated bullet also carrying ${SECRET}\n`,
    );

    const r = redactFact({ id, pattern: SECRET, projectRoot, userDir });
    const after = readFileSync(memoryMdPath(), 'utf8');
    expect(after).toContain(`(${id}) bullet with [redacted:`); // ours scrubbed
    expect(after).toContain(`unrelated bullet also carrying ${SECRET}`); // theirs untouched
    expect(r.remainingElsewhere).toBeGreaterThanOrEqual(1); // …but REPORTED
  });

  it('purge over-mutation: N bullets seeded, ONE purged, N-1 (and their provenance comments) survive; second purge → not-found', () => {
    const { id } = seedLeakedFact({ id: 'P-RDCTYYYY', slug: 'purge-target' });
    const md = readFileSync(memoryMdPath(), 'utf8');
    writeFileSync(
      memoryMdPath(),
      md +
        `\n- (${id}) the purged bullet\n<!-- source: a -->\n- (P-RDCTTTTT) survivor one\n<!-- source: b -->\n- (P-RDCTZZZZ) survivor two\n`,
    );

    const r = purgeHard({ id, yes: true, projectRoot, userDir });
    expect(r.action).toBe('purged');
    const after = readFileSync(memoryMdPath(), 'utf8');
    expect(after).not.toContain(`(${id})`);
    expect(after).toContain('survivor one');
    expect(after).toContain('<!-- source: b -->');
    expect(after).toContain('survivor two');

    expect(purgeHard({ id, yes: true, projectRoot, userDir }).action).toBe('not-found');
  });
});

// seedTitleLeak variant usable outside its home describe (id param only).
function seedTitleLeakAt(id) {
  const p = join(projectRoot, 'context', 'memory', `project_deploy-notes-with-hunter2-blue-credential-xkqv93.md`);
  writeFileSync(
    p,
    `---\nid: ${id}\ntype: project\ntitle: deploy notes with ${SECRET}\ntrust: medium\ncreated_at: 2026-01-01T00:00:00Z\n---\n\nrotate ${SECRET} quarterly\n`,
  );
  return { id, path: p };
}

describe('the §6.5 / ADR-0022 surface contracts', () => {
  it('the MCP server exposes NO redact or purge tool (destructive path stays human-only)', async () => {
    const src = readFileSync(join(REPO_ROOT, 'packages', 'cli', 'src', 'mcp-server.mjs'), 'utf8');
    expect(src).not.toMatch(/mk_redact|mk_purge/);
    // the stronger pin (skill-review M11): the server must not even IMPORT
    // the module — a differently-named tool (mk_scrub, mk_remove_fact)
    // wrapping redactFact/purgeHard would slip a name-only grep.
    expect(src).not.toMatch(/from ['"]\.\/redact\.mjs['"]/);
    expect(src).not.toMatch(/\bredactFact\b|\bpurgeHard\b/);
  });

  it('CLI: cmk redact prints the honest git advisory (rotate-first + filter-repo, never executed) — Door 3', () => {
    const { id } = seedLeakedFact();
    const r = spawnSync(
      process.execPath,
      [CMK_BIN, 'redact', id, '--pattern', SECRET, '--reason', 'leak', '--project', projectRoot],
      { cwd: projectRoot, encoding: 'utf8', env: { ...process.env, MEMORY_KIT_USER_DIR: userDir } },
    );
    expect(r.status).toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).toContain('redacted');
    expect(out.toLowerCase()).toContain('rotate');
    expect(out).toContain('git filter-repo');
    expect(out.toLowerCase()).toContain('git history');
  });

  it('CLI: cmk purge --hard requires --yes and exits 2 without it — Door 3', () => {
    const { id, path } = seedLeakedFact();
    const refuse = spawnSync(
      process.execPath,
      [CMK_BIN, 'purge', '--hard', id, '--project', projectRoot],
      { cwd: projectRoot, encoding: 'utf8', env: { ...process.env, MEMORY_KIT_USER_DIR: userDir } },
    );
    expect(refuse.status).toBe(2);
    expect(existsSync(path)).toBe(true);

    const go = spawnSync(
      process.execPath,
      [CMK_BIN, 'purge', '--hard', id, '--yes', '--project', projectRoot],
      { cwd: projectRoot, encoding: 'utf8', env: { ...process.env, MEMORY_KIT_USER_DIR: userDir } },
    );
    expect(go.status).toBe(0);
    expect(existsSync(path)).toBe(false);
  });
});
