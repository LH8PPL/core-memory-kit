// @doors: 1, 2
// Door 3 N/A: docs tests are pure file reads; no subprocess.
// Door 4 N/A: no NDJSON observability surface.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 41 — top-level docs structural shape.
// Per tasks.md 41.5: README, QUICKSTART, ARCHITECTURE must exist, parse, and
// reference the current surface accurately. Catches stale doc references early
// (the same drift class Task 36 swept manually). The per-OS INSTALL-*.md guides
// + the legacy install.sh/.ps1 scripts were RETIRED 2026-06-08 — `cmk install`
// is the cross-OS entry point (CI-verified on ubuntu/macos/windows), so the
// per-OS docs were redundant + stale. See ADR-0005 (Status: Superseded).

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

const REQUIRED_DOCS = ['README.md', 'QUICKSTART.md', 'ARCHITECTURE.md', 'HEALTH-CHECKS.md'];

describe('Task 41 — top-level docs exist + structural shape', () => {
  for (const doc of REQUIRED_DOCS) {
    it(`${doc} exists`, () => {
      expect(existsSync(join(repoRoot, doc))).toBe(true);
    });
  }
});

describe('Task 41 — README references v0.1.0 surface (no stale references)', () => {
  let text;
  it('parses', () => {
    text = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    expect(text.length).toBeGreaterThan(500);
  });

  it('mentions the canonical install command (npm install -g)', () => {
    text = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    expect(text).toMatch(/npm install -g @lh8ppl\/claude-memory-kit/);
  });

  it('references cmk install (not the legacy install.sh / install.ps1)', () => {
    text = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    expect(text).toMatch(/cmk install/);
    // Negative assertion: legacy install scripts removed in v0.1.0
    expect(text).not.toMatch(/install\.sh\b/);
    expect(text).not.toMatch(/install\.ps1\b/);
  });

  it('references the 7 health checks (HC-1..HC-7) — the 2 memsearch checks were removed in Task 120', () => {
    text = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    expect(text).toMatch(/HC-1\.\.HC-7/);
    expect(text).not.toMatch(/HC-1\.\.HC-9\b/);
    expect(text).not.toMatch(/memsearch/i);
  });

  it('references Node-based register-crons (not python scripts/register-crons.py)', () => {
    text = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    expect(text).toMatch(/cmk register-crons/);
    expect(text).not.toMatch(/python scripts\/register-crons\.py/);
    expect(text).not.toMatch(/python3 scripts\/register-crons\.py/);
  });

  it('links to architectural docs (ARCHITECTURE.md + design.md)', () => {
    text = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    expect(text).toContain('ARCHITECTURE.md');
    expect(text).toContain('design.md');
  });
});

describe('Task 41 — QUICKSTART.md walkthrough is complete', () => {
  let text;
  it('parses', () => {
    text = readFileSync(join(repoRoot, 'QUICKSTART.md'), 'utf8');
    expect(text.length).toBeGreaterThan(500);
  });

  it('walks user through prerequisites → install → scaffold → verify → first session', () => {
    text = readFileSync(join(repoRoot, 'QUICKSTART.md'), 'utf8');
    // The numbered sections of the quickstart. Task 49 restructured §1
    // from "Install the CLI globally" into "Install — pick ONE route"
    // (npm route OR plugin-marketplace route, each complete); accept either
    // phrasing so the walk asserts an install step without pinning wording.
    expect(text).toMatch(/Prerequisites/);
    expect(text).toMatch(/Install (the CLI globally|— pick ONE route)/);
    expect(text).toMatch(/Scaffold the kit/);
    expect(text).toMatch(/Verify the install/);
    expect(text).toMatch(/Register the cron jobs/);
    expect(text).toMatch(/Open a session/);
    expect(text).toMatch(/verify memory persists/);
  });

  it('contains bash fenced blocks for each install step (executable by test-quickstart.sh)', () => {
    text = readFileSync(join(repoRoot, 'QUICKSTART.md'), 'utf8');
    // At minimum: npm install -g, cmk install, cmk doctor, cmk repair --hooks
    expect(text).toMatch(/```bash[\s\S]*?npm install -g @lh8ppl\/claude-memory-kit[\s\S]*?```/);
    expect(text).toMatch(/```bash[\s\S]*?cmk install[\s\S]*?```/);
    expect(text).toMatch(/```bash[\s\S]*?cmk doctor[\s\S]*?```/);
  });

  it('includes a troubleshooting table for common failure modes', () => {
    text = readFileSync(join(repoRoot, 'QUICKSTART.md'), 'utf8');
    expect(text).toMatch(/Troubleshooting/);
    expect(text).toMatch(/cmk: command not found/);
    expect(text).toMatch(/HC-2/);
  });
});
