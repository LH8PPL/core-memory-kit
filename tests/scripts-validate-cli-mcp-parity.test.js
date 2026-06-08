// @doors: 1
// Door 2 N/A: checkParity is pure (Set inputs → error array); no disk writes.
// Door 3 N/A: no subprocess at this boundary.
// Door 4 N/A: no NDJSON/audit-log surface.
// Door 5 N/A: no message queue.
//
// Task 108b — the CLI↔MCP parity guard (scripts/validate-cli-mcp-parity.mjs).
// We test the PURE checkParity() with synthetic inputs (proving it CATCHES each
// drift class — a guard that only ever passes is worthless), then assert the
// REAL repo is in parity (the live invariant the npm-test prerun enforces).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkParity,
  parseMcpTools,
  PARITY_MAP,
  CLI_ONLY,
} from '../scripts/validate-cli-mcp-parity.mjs';
import { subcommands } from '../packages/cli/src/subcommands.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// A minimal in-parity world used as the baseline for the drift cases.
const PMAP = { remember: { cli: 'remember', mcp: ['mk_remember'] } };
const ONLY = new Set(['doctor']);
const base = () => ({
  cliVerbs: new Set(['remember', 'doctor']),
  mcpTools: new Set(['mk_remember']),
  parityMap: PMAP,
  cliOnly: ONLY,
});

describe('checkParity — drift detection (108b guard)', () => {
  it('returns no errors when both surfaces match + every verb is classified', () => {
    expect(checkParity(base())).toEqual([]);
  });

  it('flags a parity op whose MCP tool is missing', () => {
    const errors = checkParity({ ...base(), mcpTools: new Set() });
    expect(errors.some((e) => /MCP tool 'mk_remember' is not registered/.test(e))).toBe(true);
  });

  it('flags a parity op whose CLI verb is missing', () => {
    const errors = checkParity({ ...base(), cliVerbs: new Set(['doctor']) });
    expect(errors.some((e) => /CLI verb 'remember' is not registered/.test(e))).toBe(true);
  });

  it('flags an orphan MCP tool with no CLI counterpart', () => {
    const errors = checkParity({ ...base(), mcpTools: new Set(['mk_remember', 'mk_orphan']) });
    expect(errors.some((e) => /MCP tool 'mk_orphan' has no CLI parity entry/.test(e))).toBe(true);
  });

  it('flags an unclassified CLI verb (neither parity nor infra-only)', () => {
    const errors = checkParity({ ...base(), cliVerbs: new Set(['remember', 'doctor', 'mystery']) });
    expect(errors.some((e) => /CLI verb 'mystery' is unclassified/.test(e))).toBe(true);
  });
});

describe('parseMcpTools', () => {
  it('extracts tool names from registerTool() calls', () => {
    const src = `
      server.registerTool('mk_search', {...}, handler);
      server.registerTool(  "mk_forget" , {...}, handler);
    `;
    expect(parseMcpTools(src)).toEqual(new Set(['mk_search', 'mk_forget']));
  });
});

describe('the live repo is in CLI↔MCP parity', () => {
  it('checkParity finds no drift against the real subcommands + mcp-server', () => {
    const cliVerbs = new Set(subcommands.map((s) => s.name));
    const mcpTools = parseMcpTools(
      readFileSync(join(REPO, 'packages/cli/src/mcp-server.mjs'), 'utf8'),
    );
    const errors = checkParity({ cliVerbs, mcpTools, parityMap: PARITY_MAP, cliOnly: CLI_ONLY });
    expect(errors).toEqual([]);
  });
});
