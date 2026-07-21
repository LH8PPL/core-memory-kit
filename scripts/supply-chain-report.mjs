#!/usr/bin/env node
// Supply-chain watch reporter (Task 237, D-364/D-381).
//
// WHY THIS EXISTS — measured, not assumed. `security.yml` gates every push and
// PR on `npm audit` + osv-scanner. But an advisory published AFTER the last PR
// reaches nobody: the gates only run when someone pushes. On 2026-07-21 two
// advisories (body-parser GHSA-v422-hmwv-36x6, protobufjs GHSA-j3f2-48v5-ccww)
// landed overnight and were caught ONLY because a research commit happened to
// be pushed that afternoon. With a quiet week, they'd have sat undetected.
// A standing watch closes exactly that window.
//
// WHY THE LOGIC IS HERE AND NOT IN THE WORKFLOW YAML: the task's done-criterion
// is "the gate BITES" — demonstrable only if the decision is a pure function you
// can feed a deliberately-vulnerable fixture. Logic embedded in YAML can only be
// tested by pushing a vulnerable dependency to main.
//
// WHAT WE DELIBERATELY DID NOT COPY (from ECC's supply-chain-watch.yml, re-read
// at their HEAD 2026-07-21 per D-375): their hand-curated IOC blocklist of known
// compromised package@versions. A hand-tended list rots the moment it stops
// being tended, and a stale security list is worse than none — it reads as
// coverage. We stand on the live advisory databases instead.
//
// Usage (the workflow pipes the scanners' JSON in):
//   node scripts/supply-chain-report.mjs --audit audit.json --osv osv.json
// Exits 0 always (the workflow reads the emitted JSON and decides) — a reporter
// that crashes must not be indistinguishable from a clean scan.

import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Severities that wake a human. Moderates ride Dependabot PRs — the same policy
 * the existing PR gate already applies (`npm audit --audit-level=high`), kept
 * identical here so the standing watch and the PR gate can never disagree about
 * what counts as serious.
 */
export const ALERT_SEVERITIES = new Set(['high', 'critical']);

/** Stable marker so a re-run UPDATES one issue instead of filing a new one daily. */
export const ISSUE_MARKER = '<!-- cmk:supply-chain-watch -->';

function safeParse(json) {
  try {
    const v = JSON.parse(String(json || ''));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/**
 * Findings from `npm audit --json`. Pure.
 * @returns {Array<{package,severity,title,url,fix,source}>}
 */
export function parseNpmAudit(json) {
  const vulns = safeParse(json).vulnerabilities;
  if (!vulns || typeof vulns !== 'object') return [];
  const out = [];
  for (const [name, v] of Object.entries(vulns)) {
    if (!v || typeof v !== 'object') continue;
    const via = Array.isArray(v.via) ? v.via.find((x) => x && typeof x === 'object') : null;
    const fix = v.fixAvailable && typeof v.fixAvailable === 'object'
      ? `${v.fixAvailable.name}@${v.fixAvailable.version}`
      : v.fixAvailable === true
        ? 'available via `npm update`'
        : 'no fix published yet';
    out.push({
      package: v.name || name,
      severity: String(v.severity || '').toLowerCase(),
      title: via?.title || 'advisory',
      url: via?.url || '',
      fix,
      source: 'npm-audit',
    });
  }
  return out;
}

/**
 * Findings from `osv-scanner --format=json`. Pure.
 *
 * osv.dev is BROADER than the npm advisory DB and the two genuinely disagree —
 * 2026-07-21's body-parser advisory was reported by osv while `npm audit`
 * returned "found 0 vulnerabilities". Both are parsed; neither is authoritative
 * alone.
 * @returns {Array<{package,version,id,summary,severity,source}>}
 */
export function parseOsvResults(json) {
  const results = safeParse(json).results;
  if (!Array.isArray(results)) return [];
  const out = [];
  for (const r of results) {
    for (const p of (Array.isArray(r?.packages) ? r.packages : [])) {
      for (const v of (Array.isArray(p?.vulnerabilities) ? p.vulnerabilities : [])) {
        out.push({
          package: p?.package?.name || 'unknown',
          version: p?.package?.version || '',
          id: v?.id || 'unknown',
          summary: v?.summary || '',
          // osv-scanner's own gating already filters what it reports; anything
          // it surfaces here is treated as alert-worthy (it is the broader DB,
          // and it is the scanner that caught what npm audit missed).
          severity: 'high',
          source: 'osv',
        });
      }
    }
  }
  return out;
}

/**
 * Decide whether to wake anyone, and write the message if so. Pure.
 *
 * @param {{auditJson?: string, osvJson?: string, now?: string}} a
 * @returns {{shouldAlert:boolean, title:string, body:string, findings:object[], marker:string}}
 */
export function buildSupplyChainReport({ auditJson = '', osvJson = '', now = '' } = {}) {
  const audit = parseNpmAudit(auditJson).filter((f) => ALERT_SEVERITIES.has(f.severity));
  const osv = parseOsvResults(osvJson);
  const findings = [...audit, ...osv];

  if (findings.length === 0) {
    return { shouldAlert: false, title: '', body: '', findings: [], marker: ISSUE_MARKER };
  }

  const lines = [
    ISSUE_MARKER,
    '',
    `The standing supply-chain watch found **${findings.length} finding(s)** in the kit's dependency surface.`,
    '',
    'This watch exists because the PR gates only run when someone pushes — an advisory',
    'published after the last PR would otherwise reach nobody (Task 237; the class was',
    'observed live on 2026-07-21, when two advisories landed overnight and were caught',
    'only because an unrelated commit happened to be pushed).',
    '',
    '| Source | Package | Severity | Advisory | Remediation |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const f of findings) {
    const advisory = f.source === 'osv'
      ? `[${f.id}](https://osv.dev/${f.id})`
      : (f.url ? `[${f.title}](${f.url})` : f.title);
    const remedy = f.source === 'osv' ? `\`npm update ${f.package}\`` : (f.fix || 'see advisory');
    lines.push(`| ${f.source} | \`${f.package}${f.version ? '@' + f.version : ''}\` | ${f.severity} | ${advisory} | ${remedy} |`);
  }
  lines.push(
    '',
    '**To remediate:** `npm update <package>` for each row, then `npm audit --omit=dev --audit-level=high`',
    'and re-run this workflow to confirm it goes quiet. If a finding has no published fix,',
    'record the decision (accept / pin / replace) rather than leaving the issue open and unexplained.',
    '',
    '_Coverage boundary: this watch reports PUBLISHED advisories in the npm + OSV databases._',
    '_It does not detect zero-days, typosquats, or a compromised-but-unreported version — see SECURITY.md._',
    now ? `\n_Last run: ${now}_` : '',
  );

  return {
    shouldAlert: true,
    title: `Supply-chain watch: ${findings.length} dependency finding(s)`,
    body: lines.join('\n'),
    findings,
    marker: ISSUE_MARKER,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function argOf(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}
function readIf(path) {
  if (!path) return '';
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return ''; // a missing scan file is "nothing to report", never a crash
  }
}

if (import.meta.url === new URL(`file://${process.argv[1]?.replace(/\\/g, '/')}`).href
    || process.argv[1]?.endsWith('supply-chain-report.mjs')) {
  const report = buildSupplyChainReport({
    auditJson: readIf(argOf('--audit')),
    osvJson: readIf(argOf('--osv')),
    now: new Date().toISOString(),
  });
  const out = argOf('--out');
  if (out) writeFileSync(out, report.body, 'utf8');
  // The workflow branches on this line.
  process.stdout.write(JSON.stringify({
    shouldAlert: report.shouldAlert,
    title: report.title,
    count: report.findings.length,
  }) + '\n');
  process.exit(0);
}
