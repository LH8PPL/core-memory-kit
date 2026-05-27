// @doors: 1, 3
// Door 2 N/A: validator reads template/ + writes to stdout/stderr; no kit-state mutation.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: no NDJSON observability surface.
//
// Self-test for scripts/validate-template.mjs.
//
// validate-template is tightly coupled to the kit's template/ scaffold +
// the cap-coordination invariant. Rather than reconstruct the full
// scaffold in a sandbox (which would duplicate the manifest), this
// self-test runs the validator against the REAL kit corpus and asserts
// it succeeds. That confirms the validator is functional on every run
// (smoke-test); deep behavioral testing of validate-template's logic is
// already covered by the existing tests/template-scaffolding.test.js
// which exercises the manifest at the public-contract boundary.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const VALIDATOR = join(REPO_ROOT, 'scripts', 'validate-template.mjs');

describe('validate-template (smoke test on real corpus)', () => {
  it('exits 0 on the kit\'s current template/ scaffold', () => {
    const r = spawnSync(process.execPath, [VALIDATOR], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/validate-template: OK/);
    expect(r.stdout).toMatch(/cap-coordination invariant satisfied/);
  });
});
