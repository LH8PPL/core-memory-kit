// @doors: 1, 2
// Door 3 N/A: structural assertions read repo security-config files; no subprocess spawn.
// Door 4 N/A: no NDJSON observability.
// Door 5 N/A: no message-queue.

// Tests for Task 53 — package security hardening (T-041).
// Asserts the security posture is wired structurally: the CI scanners
// exist + parse + carry their load-bearing refs, the provenance publish
// workflow is shaped correctly, Dependabot is configured, SECURITY.md
// documents the threat model + disclosure, and both packages carry a
// `bugs` URL. ("Gate actually bites" is proven by the scan workflows
// running on the PR itself; this file pins that the gates EXIST + are
// well-formed, so they can't silently disappear.)
//
// Boundary discipline: assert presence + the specific tokens that make
// each gate functional (the `uses:` refs, the provenance flag, the
// audit-level, the OIDC permission) — NOT the full YAML byte-shape,
// which is allowed to evolve.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const wf = (name) => join(REPO_ROOT, '.github', 'workflows', name);
const read = (p) => readFileSync(p, 'utf8');

describe('Task 53 — security workflows exist + parse', () => {
  for (const name of ['security.yml', 'codeql.yml', 'publish.yml']) {
    it(`${name} exists and is valid YAML`, () => {
      const p = wf(name);
      expect(existsSync(p), `${name} missing`).toBe(true);
      expect(() => yaml.load(read(p))).not.toThrow();
    });
  }

  it('.github/dependabot.yml exists, valid YAML, npm ecosystem', () => {
    const p = join(REPO_ROOT, '.github', 'dependabot.yml');
    expect(existsSync(p)).toBe(true);
    const doc = yaml.load(read(p));
    expect(doc.version).toBe(2);
    const ecosystems = (doc.updates ?? []).map((u) => u['package-ecosystem']);
    expect(ecosystems).toContain('npm');
  });
});

describe('Task 53 — security.yml gates (secrets + CVEs)', () => {
  let text;
  it('loads', () => {
    text = read(wf('security.yml'));
    expect(text.length).toBeGreaterThan(0);
  });

  it('runs gitleaks secret scanning', () => {
    text = read(wf('security.yml'));
    expect(text).toMatch(/gitleaks\/gitleaks-action@/);
  });

  it('.gitleaks.toml exists + allowlists the deliberate test fixtures', () => {
    // Load-bearing: without this allowlist, gitleaks flags the poison-guard
    // fixtures (ghp_1234…, AWS example key) and reds every PR.
    const p = join(REPO_ROOT, '.gitleaks.toml');
    expect(existsSync(p)).toBe(true);
    const toml = read(p);
    expect(toml).toMatch(/allowlist/);
    expect(toml).toMatch(/poison-guard/);
  });

  it('runs osv-scanner for CVEs (OSV.dev DB)', () => {
    text = read(wf('security.yml'));
    expect(text).toMatch(/google\/osv-scanner-action/);
  });

  it('hard-gates on npm audit high/critical', () => {
    text = read(wf('security.yml'));
    expect(text).toMatch(/npm audit[^\n]*--audit-level[= ](high|critical)/);
  });

  it('triggers on push and pull_request', () => {
    const doc = yaml.load(read(wf('security.yml')));
    // YAML parses the `on:` key as boolean true in some loaders; read raw.
    const raw = read(wf('security.yml'));
    expect(raw).toMatch(/pull_request:/);
    expect(raw).toMatch(/push:/);
    expect(doc).toBeTruthy();
  });
});

describe('Task 53 — codeql.yml (SAST)', () => {
  it('uses the CodeQL action (init + analyze) for JavaScript', () => {
    const text = read(wf('codeql.yml'));
    expect(text).toMatch(/github\/codeql-action\/init@/);
    expect(text).toMatch(/github\/codeql-action\/analyze@/);
    expect(text).toMatch(/javascript/i);
  });
});

describe('Task 53 — publish.yml (CI provenance publish)', () => {
  let text;
  let doc;
  it('loads + parses', () => {
    text = read(wf('publish.yml'));
    doc = yaml.load(text);
    expect(doc).toBeTruthy();
  });

  it('triggers on v* tags', () => {
    text = read(wf('publish.yml'));
    expect(text).toMatch(/tags:/);
    expect(text).toMatch(/['"]?v\*/);
  });

  it('grants id-token: write (OIDC for provenance)', () => {
    text = read(wf('publish.yml'));
    expect(text).toMatch(/id-token:\s*write/);
  });

  it('publishes with --provenance', () => {
    text = read(wf('publish.yml'));
    expect(text).toMatch(/npm publish[^\n]*--provenance/);
  });

  it('authenticates via the NPM_TOKEN secret (not a hardcoded token)', () => {
    text = read(wf('publish.yml'));
    expect(text).toMatch(/NODE_AUTH_TOKEN/);
    expect(text).toMatch(/secrets\.NPM_TOKEN/);
    // never a literal token
    expect(text).not.toMatch(/npm_[A-Za-z0-9]{20,}/);
  });

  it('runs the test suite before publishing (gate)', () => {
    text = read(wf('publish.yml'));
    expect(text).toMatch(/npm (test|ci)/);
  });
});

describe('Task 53 — SECURITY.md threat model + disclosure', () => {
  let text;
  it('exists with substantive content', () => {
    const p = join(REPO_ROOT, 'SECURITY.md');
    expect(existsSync(p)).toBe(true);
    text = read(p);
    expect(text.length).toBeGreaterThan(500);
  });

  it('documents a responsible-disclosure contact', () => {
    text = read(join(REPO_ROOT, 'SECURITY.md'));
    expect(text).toMatch(/report|disclos/i);
    expect(text).toMatch(/@/); // a contact email/handle
  });

  it('names the kit-specific threat surfaces + mitigations', () => {
    text = read(join(REPO_ROOT, 'SECURITY.md'));
    expect(text).toMatch(/hook|subprocess|auto-extract/i);
    expect(text).toMatch(/poison/i); // the poison-guard mitigation
  });
});

describe('Task 53 — package.json bugs URL (both packages)', () => {
  for (const rel of ['packages/cli/package.json', 'packages/canonicalize/package.json']) {
    it(`${rel} carries a bugs URL`, () => {
      const pkg = JSON.parse(read(join(REPO_ROOT, rel)));
      const bugs = typeof pkg.bugs === 'string' ? pkg.bugs : pkg.bugs?.url;
      expect(bugs, `${rel} missing bugs`).toBeTruthy();
      expect(bugs).toMatch(/github\.com\/LH8PPL\/core-memory-kit/);
    });
  }
});
