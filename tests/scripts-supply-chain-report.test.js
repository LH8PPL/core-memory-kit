// @doors: 1
// Door 1 (Response): the report builder returns {shouldAlert, title, body, findings}.
// Door 2 N/A: pure function — writes nothing (the workflow owns issue creation).
// Door 3 N/A: no subprocess; the scanners' JSON is passed IN so this is testable
//   without network or a vulnerable install.
// Door 4 N/A: no message-queue surface.
// Door 5 N/A: the GitHub issue IS the observability surface, asserted via `body`.
//
// Task 237 (D-364) — the standing supply-chain watch.
//
// THE GAP, measured the day this shipped: security.yml ran ONLY on push + PR.
// On 2026-07-21 two advisories (body-parser GHSA-v422-hmwv-36x6, protobufjs
// GHSA-j3f2-48v5-ccww) were published overnight and reached us solely because a
// research commit happened to be pushed. With no push, nobody would have known.
// An advisory published AFTER the last PR reaches nobody without a STANDING
// watch — that is the whole task, and it fired in the wild before it shipped.
//
// WHY THE LOGIC LIVES IN A SCRIPT, NOT IN YAML: the done-criterion is "the gate
// BITES" — provable only if the decision is a pure function you can feed a
// deliberately-vulnerable fixture. A gate whose logic lives in workflow YAML can
// only be tested by pushing a vulnerable dependency to main, which is absurd.

import { describe, it, expect } from 'vitest';
import {
  parseNpmAudit,
  parseOsvResults,
  buildSupplyChainReport,
  ALERT_SEVERITIES,
} from '../scripts/supply-chain-report.mjs';

// A real-shaped `npm audit --json` fragment carrying one HIGH finding.
const AUDIT_VULNERABLE = JSON.stringify({
  vulnerabilities: {
    'some-pkg': {
      name: 'some-pkg',
      severity: 'high',
      via: [{ title: 'Prototype pollution', url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz', severity: 'high' }],
      range: '<2.3.0',
      fixAvailable: { name: 'some-pkg', version: '2.3.0' },
    },
    'moderate-dev-pkg': {
      name: 'moderate-dev-pkg',
      severity: 'moderate',
      via: [{ title: 'ReDoS', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', severity: 'moderate' }],
      range: '<1.0.0',
      fixAvailable: true,
    },
  },
});

const AUDIT_CLEAN = JSON.stringify({ vulnerabilities: {} });

// osv-scanner --format=json shape (results[].packages[].vulnerabilities[]).
const OSV_VULNERABLE = JSON.stringify({
  results: [{
    source: { path: 'package-lock.json' },
    packages: [{
      package: { name: 'body-parser', version: '2.2.2', ecosystem: 'npm' },
      vulnerabilities: [{ id: 'GHSA-v422-hmwv-36x6', summary: 'body-parser DoS' }],
    }],
  }],
});

const OSV_CLEAN = JSON.stringify({ results: [] });

describe('Task 237 — parsing the scanners', () => {
  it('extracts npm-audit findings with package, severity, and the fix version', () => {
    const found = parseNpmAudit(AUDIT_VULNERABLE);
    const high = found.find((f) => f.package === 'some-pkg');
    expect(high).toMatchObject({ severity: 'high', source: 'npm-audit' });
    expect(high.fix).toContain('2.3.0');
  });

  it('extracts osv findings with the advisory id', () => {
    const found = parseOsvResults(OSV_VULNERABLE);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ package: 'body-parser', id: 'GHSA-v422-hmwv-36x6', source: 'osv' });
  });

  it('never throws on garbage or empty scanner output (a broken scan must not wedge the watch)', () => {
    for (const bad of ['', 'not json{{', '{}', 'null']) {
      expect(() => parseNpmAudit(bad)).not.toThrow();
      expect(() => parseOsvResults(bad)).not.toThrow();
      expect(Array.isArray(parseNpmAudit(bad))).toBe(true);
    }
  });
});

describe('Task 237 — THE GATE BITES (the load-bearing half)', () => {
  it('ALERTS on a high-severity finding', () => {
    const r = buildSupplyChainReport({ auditJson: AUDIT_VULNERABLE, osvJson: OSV_CLEAN });
    expect(r.shouldAlert, 'a high advisory must raise the alarm').toBe(true);
    expect(r.findings.length).toBeGreaterThan(0);
  });

  it('ALERTS on an osv finding even when npm audit is clean (the scanners disagree by design)', () => {
    // osv.dev is broader than the npm advisory DB — today's body-parser advisory
    // was caught by osv while `npm audit` reported 0 vulnerabilities.
    const r = buildSupplyChainReport({ auditJson: AUDIT_CLEAN, osvJson: OSV_VULNERABLE });
    expect(r.shouldAlert, 'osv-only findings must still alert').toBe(true);
    expect(r.body).toMatch(/body-parser/);
  });

  it('is SILENT when both scanners are clean (no alert-fatigue)', () => {
    const r = buildSupplyChainReport({ auditJson: AUDIT_CLEAN, osvJson: OSV_CLEAN });
    expect(r.shouldAlert).toBe(false);
    expect(r.findings).toEqual([]);
  });

  it('does NOT alert on moderate-only findings (they ride Dependabot, per the existing gate policy)', () => {
    const moderateOnly = JSON.stringify({
      vulnerabilities: {
        'dev-thing': { name: 'dev-thing', severity: 'moderate', via: [{ title: 'x', severity: 'moderate' }], fixAvailable: true },
      },
    });
    const r = buildSupplyChainReport({ auditJson: moderateOnly, osvJson: OSV_CLEAN });
    expect(r.shouldAlert, 'moderate must not wake anyone at 3am').toBe(false);
  });

  it('the alert names the package, the severity, and what to DO about it', () => {
    const r = buildSupplyChainReport({ auditJson: AUDIT_VULNERABLE, osvJson: OSV_VULNERABLE });
    expect(r.title).toMatch(/supply.chain/i);
    expect(r.body).toMatch(/some-pkg/);
    expect(r.body).toMatch(/body-parser/);
    expect(r.body, 'an alert with no remedy is a nag').toMatch(/npm update|fix|remediat/i);
  });

  it('the body carries a STABLE marker so a re-run updates one issue instead of spamming new ones', () => {
    const r = buildSupplyChainReport({ auditJson: AUDIT_VULNERABLE, osvJson: OSV_CLEAN });
    expect(r.marker).toBeTruthy();
    expect(r.body).toContain(r.marker);
  });

  it('the alert severities are the documented set (high + critical only)', () => {
    expect([...ALERT_SEVERITIES].sort()).toEqual(['critical', 'high']);
  });
});
