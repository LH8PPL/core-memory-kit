#!/usr/bin/env node
// Docs-completeness guard (Task 128, D-120). Converts the 2026-06-10 manual
// docs audit into a structural guarantee (the prose-vs-enforcement rule):
// the audit found 7 undocumented CLI commands, an MCP reference without
// parameters, and stale "not yet shipped" disclaimers that survived multiple
// releases — all spot-check findings, all of which decay. Three checks:
//
//   1. CLI completeness — every registered subcommand name appears in a
//      `### ` heading line of docs/CLI.md (grouped headings count).
//   2. MCP completeness — every registered MCP tool name AND every zod
//      inputSchema parameter name appears in docs/MCP.md.
//   3. Deferral honesty — "not yet shipped/implemented" / "deferred to a
//      later release" phrases in the user-facing docs require an explicit
//      allowlist entry with a reason (legitimate stubs), so a shipped
//      feature can't keep its disclaimer and a new disclaimer can't ship
//      unaccounted.
//
// NOT covered (judgment, stays prose + the cut-gate ★ pre-tag check): the
// README capability-surface quality ("is the feature described well?").

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// Commands that deliberately have no CLI.md section, each with a reason.
export const CLI_DOC_EXEMPT = new Map([
  ['help', 'commander built-in (auto-generated help text)'],
  ['version', 'trivial — `cmk --version` is shown in the quickstart'],
]);

// Legitimate deferral phrases — each entry pins ONE documented stub.
// Shipping the feature means deleting both the phrase and its entry here.
export const DEFERRAL_ALLOWLIST = [
  { file: 'docs/CLI.md', mustContain: 'are the live health surface', reason: 'config is a v0.1.x stub (doctor+repair are the live surface)' },
  { file: 'docs/CLI.md', mustContain: 'read the markdown directly', reason: 'view is a v0.1.x stub' },
  { file: 'docs/CLI.md', mustContain: 'use `cmk forget`', reason: 'purge is a v0.1.x stub (forget is the supported delete)' },
];

const DEFERRAL_PATTERN = /not yet (shipped|implemented)|deferred to a later release/i;
const USER_FACING_DOCS = ['README.md', 'packages/cli/README.md', 'docs/CLI.md', 'docs/MCP.md'];

/** Check 1 — every CLI verb has a CLI.md heading mention. Pure. */
export function checkCliDocs({ cliVerbs, cliDocText, exempt = CLI_DOC_EXEMPT }) {
  const errors = [];
  const headings = cliDocText
    .split('\n')
    .filter((l) => l.startsWith('### '))
    .join('\n');
  for (const verb of cliVerbs) {
    if (exempt.has(verb)) continue;
    // The verb must appear as a word inside some `### ... cmk ...` heading
    // (grouped headings like "disable-native-memory · enable-native-memory" count).
    const re = new RegExp(`cmk[^\\n\`]*\\b${verb.replace(/[-]/g, '\\-')}\\b`);
    if (!re.test(headings)) {
      errors.push(
        `CLI.md: command 'cmk ${verb}' has no \`### \` section heading — document it (or add it to CLI_DOC_EXEMPT with a reason)`,
      );
    }
  }
  return errors;
}

/** Check 2 — every MCP tool + every schema param appears in MCP.md. Pure. */
export function checkMcpDocs({ toolParams, mcpDocText }) {
  const errors = [];
  for (const [tool, params] of toolParams) {
    if (!mcpDocText.includes(tool)) {
      errors.push(`MCP.md: tool '${tool}' is not documented`);
      continue;
    }
    for (const param of params) {
      // Param names are snake_case words; require a literal mention.
      if (!new RegExp(`\\b${param}\\b`).test(mcpDocText)) {
        errors.push(`MCP.md: tool '${tool}' parameter '${param}' is not documented`);
      }
    }
  }
  return errors;
}

/** Check 3 — deferral phrases require an allowlist entry. Pure. */
export function checkDeferralPhrases({ docs, allowlist = DEFERRAL_ALLOWLIST }) {
  const errors = [];
  const used = new Set();
  for (const { path, text } of docs) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!DEFERRAL_PATTERN.test(lines[i])) continue;
      const hit = allowlist.findIndex(
        (a) => a.file === path && lines[i].includes(a.mustContain),
      );
      if (hit === -1) {
        errors.push(
          `${path}:${i + 1}: deferral phrase without an allowlist entry — either the feature shipped (delete the phrase) or it's a legitimate stub (add a DEFERRAL_ALLOWLIST entry with a reason): ${lines[i].trim().slice(0, 100)}`,
        );
      } else {
        used.add(hit);
      }
    }
  }
  // The inverse: an allowlist entry whose phrase is GONE is stale bookkeeping.
  allowlist.forEach((a, i) => {
    if (!used.has(i)) {
      errors.push(
        `DEFERRAL_ALLOWLIST entry ${i} ('${a.mustContain}' in ${a.file}) matched nothing — the stub shipped or the wording moved; remove/update the entry`,
      );
    }
  });
  return errors;
}

/** Parse tool → Set(param names) from mcp-server.mjs source. */
export function parseMcpToolParams(src) {
  const out = new Map();
  // Split on registerTool boundaries; the first chunk (before any tool) drops.
  const segments = src.split(/registerTool\(\s*['"]/).slice(1);
  for (const seg of segments) {
    const tool = seg.match(/^([a-z_]+)['"]/)?.[1];
    if (!tool) continue;
    const schemaStart = seg.indexOf('inputSchema:');
    if (schemaStart === -1) {
      out.set(tool, new Set());
      continue;
    }
    // Scan the schema object: param keys are `name: z.` at the top level of
    // the block. Bounded to the segment so the NEXT tool's keys can't bleed in.
    const block = seg.slice(schemaStart, seg.indexOf('},', schemaStart) + 1);
    out.set(tool, new Set([...block.matchAll(/\b([a-z_]+):\s*z\./g)].map((m) => m[1])));
  }
  return out;
}

async function runCli() {
  const { subcommands } = await import('../packages/cli/src/subcommands.mjs');
  const cliVerbs = new Set(subcommands.map((s) => s.name));
  const cliDocText = readFileSync(join(REPO, 'docs/CLI.md'), 'utf8');
  const mcpDocText = readFileSync(join(REPO, 'docs/MCP.md'), 'utf8');
  const toolParams = parseMcpToolParams(
    readFileSync(join(REPO, 'packages/cli/src/mcp-server.mjs'), 'utf8'),
  );
  const docs = USER_FACING_DOCS.map((p) => ({
    path: p,
    text: readFileSync(join(REPO, p), 'utf8'),
  }));

  const errors = [
    ...checkCliDocs({ cliVerbs, cliDocText }),
    ...checkMcpDocs({ toolParams, mcpDocText }),
    ...checkDeferralPhrases({ docs }),
  ];
  if (errors.length > 0) {
    console.error(`validate-doc-completeness: FAIL — ${errors.length} issue(s)`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  const paramCount = [...toolParams.values()].reduce((n, s) => n + s.size, 0);
  console.log(
    `validate-doc-completeness: OK — ${cliVerbs.size} CLI verbs documented, ${toolParams.size} MCP tools / ${paramCount} params documented, deferral phrases accounted`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli();
}
