// @doors: 1, 3
// Door 2 N/A: the validator is read-only (no disk writes).
// Door 4 N/A: output is the CLI report itself (asserted via Door 3's spawn).
// Door 5 N/A: no message queue.

// Tests for Task 128 — the docs-completeness guard. Pure-function gate-bites
// per violation class + ONE real-repo spawn (the validator must pass on the
// canonical tree, and its report names the three checks).

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkCliDocs,
  checkMcpDocs,
  checkDeferralPhrases,
  parseMcpToolParams,
} from '../scripts/validate-doc-completeness.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Task 128 — checkCliDocs', () => {
  it('passes when every verb appears in a heading (grouped headings count)', () => {
    const doc = '### `cmk install [--force]`\ntext\n### `cmk disable-native-memory` · `cmk enable-native-memory`\n';
    expect(
      checkCliDocs({
        cliVerbs: new Set(['install', 'disable-native-memory', 'enable-native-memory']),
        cliDocText: doc,
        exempt: new Map(),
      }),
    ).toEqual([]);
  });

  it('GATE BITES: an undocumented verb fails with an actionable message', () => {
    const errors = checkCliDocs({
      cliVerbs: new Set(['install', 'brand-new-verb']),
      cliDocText: '### `cmk install`\n',
      exempt: new Map(),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/brand-new-verb/);
    expect(errors[0]).toMatch(/CLI_DOC_EXEMPT/);
  });

  it('a verb mentioned only in BODY text (not a heading) still fails', () => {
    const errors = checkCliDocs({
      cliVerbs: new Set(['timeline']),
      cliDocText: '### `cmk search`\nAlso see cmk timeline for context.\n',
      exempt: new Map(),
    });
    expect(errors).toHaveLength(1);
  });

  it("GATE BITES: 'get' is NOT satisfied by the 'cmk config get' heading (anchor directly after cmk)", () => {
    const errors = checkCliDocs({
      cliVerbs: new Set(['get', 'config']),
      cliDocText: '### `cmk config get <key>` · `cmk config set <key> <value>`\n',
      exempt: new Map(),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/'cmk get'/);
  });
});

describe('Task 128 — checkMcpDocs + parseMcpToolParams', () => {
  const fakeSrc = `
    server.registerTool('mk_alpha', { inputSchema: {
      query: z.string(), limit: z.number().optional(),
    }, }, handler);
    server.registerTool('mk_beta', { inputSchema: {
      id: z.string(),
    }, }, handler);
  `;

  it('parses tool → param sets from source (segment-bounded, no bleed)', () => {
    const map = parseMcpToolParams(fakeSrc);
    expect([...map.keys()]).toEqual(['mk_alpha', 'mk_beta']);
    expect([...map.get('mk_alpha')]).toEqual(['query', 'limit']);
    expect([...map.get('mk_beta')]).toEqual(['id']);
  });

  it('GATE BITES: an undocumented tool and an undocumented param each fail', () => {
    const toolParams = parseMcpToolParams(fakeSrc);
    const errors = checkMcpDocs({
      toolParams,
      mcpDocText: '| `mk_alpha` | takes `query` |', // limit missing; mk_beta missing
    });
    expect(errors.some((e) => e.includes("parameter 'limit'"))).toBe(true);
    expect(errors.some((e) => e.includes("tool 'mk_beta'"))).toBe(true);
  });
});

describe('Task 128 — checkDeferralPhrases', () => {
  const allow = [{ file: 'docs/CLI.md', mustContain: 'legitimate stub marker', reason: 'test' }];

  it('GATE BITES: an unallowlisted deferral phrase fails with file:line', () => {
    const errors = checkDeferralPhrases({
      docs: [{ path: 'README.md', text: 'great\nthis is not yet shipped sadly\n' }],
      allowlist: allow,
    });
    expect(errors.some((e) => e.startsWith('README.md:2'))).toBe(true);
  });

  it('an allowlisted stub line passes; a STALE allowlist entry fails (both directions)', () => {
    const ok = checkDeferralPhrases({
      docs: [{ path: 'docs/CLI.md', text: 'Not yet implemented — legitimate stub marker here.\n' }],
      allowlist: allow,
    });
    expect(ok).toEqual([]);
    const stale = checkDeferralPhrases({
      docs: [{ path: 'docs/CLI.md', text: 'all shipped, nothing deferred\n' }],
      allowlist: allow,
    });
    expect(stale.some((e) => e.includes('matched nothing'))).toBe(true);
  });
});

describe('Task 128 — the validator passes on the canonical repo (Door 3)', () => {
  it('exits 0 and reports all three checks', () => {
    const r = spawnSync(
      process.execPath,
      [join(REPO_ROOT, 'scripts', 'validate-doc-completeness.mjs')],
      { encoding: 'utf8', cwd: REPO_ROOT },
    );
    expect(r.status, `validator failed:\n${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/CLI verbs documented/);
    expect(r.stdout).toMatch(/MCP tools/);
    expect(r.stdout).toMatch(/deferral phrases accounted/);
  });
});
