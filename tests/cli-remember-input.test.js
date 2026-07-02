// @doors: 1
// Door 2 N/A: parseFactInput is a pure parser — no disk write at this boundary
//   (the write is runRememberRich, covered by cli-remember-rich.test.js).
// Door 3 N/A: no subprocess at this boundary (the CLI injects the fs readers).
// Door 4 N/A: no audit-log/NDJSON at this boundary.
// Door 5 N/A: no message queue.
//
// Task 108.2 (108a) — unit coverage for the off-shell input parser. The CLI's
// real-binary tests (cli-remember.test.js) prove the end-to-end wiring but run
// in a SUBPROCESS, so they don't contribute in-process line coverage.
// parseFactInput is pure + dependency-injected, so every parse / validate /
// allowlist branch is exercised here.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFactInput, runRemember } from '../packages/cli/src/subcommands.mjs';

const fromFile = (json) => parseFactInput({ fromFile: '/x.json' }, { readFile: () => json });
const fromStdin = (json) => parseFactInput({ json: true }, { readStdin: () => json });

describe('parseFactInput — off-shell structured input parser (108a)', () => {
  it('--from-file: valid JSON → ok, allowlisted fields, content verbatim (backticks survive)', () => {
    const r = fromFile(
      JSON.stringify({
        text: 'use uv',
        why: 'fast `builds`',
        how: 'uv add',
        type: 'feedback',
        title: 't',
        links: ['a'],
        tier: 'P',
        trust: 'high',
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.channel).toBe('--from-file');
    expect(r.fields.text).toBe('use uv');
    expect(r.fields.why).toBe('fast `builds`'); // backticks preserved — the D-81 guarantee
    expect(r.fields.links).toEqual(['a']);
  });

  it('allowlists fields — a crafted write_source / source_file is NOT forwarded', () => {
    const r = fromFile(
      JSON.stringify({
        text: 't',
        writeSource: 'auto-extract',
        write_source: 'auto-extract',
        sourceFile: '/etc/passwd',
        evil: 'x',
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.fields).not.toHaveProperty('writeSource');
    expect(r.fields).not.toHaveProperty('write_source');
    expect(r.fields).not.toHaveProperty('sourceFile');
    expect(r.fields).not.toHaveProperty('evil');
    // 66.1/66.3 extended the allowlist with the two temporal fields (shape,
    // expires) — both validated strictly downstream by writeFact.
    expect(Object.keys(r.fields).sort()).toEqual([
      'expires', 'how', 'links', 'shape', 'text', 'tier', 'title', 'trust', 'type', 'why',
    ]);
  });

  it('--from-file read error → ok:false with a clear message', () => {
    const r = parseFactInput(
      { fromFile: '/missing.json' },
      { readFile: () => { throw new Error('ENOENT'); } },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/could not read/i);
  });

  it('oversized input (>64KB) → ok:false (size cap / Poison_Guard DoS guard)', () => {
    const r = fromFile(JSON.stringify({ text: 'big', why: 'x'.repeat(70 * 1024) }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/too large|KB/i);
  });

  it('malformed JSON → ok:false', () => {
    const r = fromFile('{not json');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/parse|json/i);
  });

  it('missing or whitespace-only text → ok:false', () => {
    expect(fromFile(JSON.stringify({ why: 'no text' })).ok).toBe(false);
    expect(fromFile(JSON.stringify({ text: '   ' })).ok).toBe(false);
  });

  it('non-object JSON (array / primitive) → ok:false', () => {
    expect(fromFile(JSON.stringify(['a', 'b'])).ok).toBe(false);
    expect(fromFile(JSON.stringify('just a string')).ok).toBe(false);
    expect(fromFile(JSON.stringify(null)).ok).toBe(false);
  });

  it('--json: valid stdin → ok', () => {
    const r = fromStdin(JSON.stringify({ text: 'from stdin' }));
    expect(r.ok).toBe(true);
    expect(r.channel).toBe('--json');
    expect(r.fields.text).toBe('from stdin');
  });

  it('--json: empty stdin (TTY / no pipe) → ok:false', () => {
    expect(fromStdin('').ok).toBe(false);
    expect(parseFactInput({ json: true }, { readStdin: () => '   ' }).error).toMatch(/stdin/i);
  });

  it('reports the rich flags ignored when passed alongside a channel', () => {
    const r = parseFactInput(
      { fromFile: '/x.json', why: 'a', trust: 'low', section: 'Threads' },
      { readFile: () => JSON.stringify({ text: 't' }) },
    );
    expect(r.ignored).toEqual(expect.arrayContaining(['--why', '--trust', '--section']));
  });
});

// In-process coverage for runRemember's channel dispatch glue. The real-binary
// tests (cli-remember.test.js) prove the optionSpec wiring end-to-end but run in
// a SUBPROCESS, so they don't cover these lines in-process — hence dep-injection
// (projectRoot/log/logError), mirroring runRememberRich.
describe('runRemember — in-process channel dispatch (108a)', () => {
  let root, projectRoot, out;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cmk-rr-'));
    projectRoot = join(root, 'proj');
    mkdirSync(join(projectRoot, 'context', 'memory'), { recursive: true });
    out = [];
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    process.exitCode = 0; // runRemember sets it on error paths — don't leak to the runner
  });
  const deps = () => ({ projectRoot, log: (m) => out.push(m), logError: (m) => out.push('ERR:' + m) });
  const facts = () =>
    readdirSync(join(projectRoot, 'context', 'memory')).filter((f) => f.endsWith('.md') && f !== 'INDEX.md');

  it('--from-file dispatches to a granular fact file (channel success glue)', () => {
    const p = join(root, 'f.json');
    writeFileSync(p, JSON.stringify({ text: 'use uv', type: 'feedback', title: 'uv', why: 'fast `b`' }), 'utf8');
    runRemember([], { fromFile: p }, deps());
    expect(facts()).toContain('feedback_uv.md');
    expect(out.join('\n')).toMatch(/saved rich fact/);
  });

  it('--from-file bad path → exit 2, writes nothing (channel error glue)', () => {
    runRemember([], { fromFile: join(root, 'nope.json') }, deps());
    expect(process.exitCode).toBe(2);
    expect(facts()).toHaveLength(0);
    expect(out.join('\n')).toMatch(/could not read/i);
  });

  it('bare remember (no text, no channel) → exit 2 usage error (bare-guard)', () => {
    runRemember([], {}, deps());
    expect(process.exitCode).toBe(2);
    expect(out.join('\n')).toMatch(/provide a fact/i);
  });

  it('--from-file with ignored rich flags → warns + still writes the JSON fact', () => {
    const p = join(root, 'f.json');
    writeFileSync(p, JSON.stringify({ text: 'x', type: 'feedback', title: 'sc' }), 'utf8');
    runRemember([], { fromFile: p, why: 'ignored' }, deps());
    expect(out.join('\n')).toMatch(/self-contained|ignor/i);
    expect(facts()).toContain('feedback_sc.md');
  });
});
