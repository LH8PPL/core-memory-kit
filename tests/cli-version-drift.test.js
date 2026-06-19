// @doors: 1
// Door 2 N/A: checkVersionDrift is a pure read-only function — no kit disk-state mutation.
// Door 3 N/A: no subprocess spawn.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: the HC result is the return value (Door 1); the doctor CLI surfaces it.
//
// Task 162 / D-176 — HC-9 version-drift detection. After a user updates the global
// `cmk` (npm i -g @latest), a project's scaffold (CLAUDE.md managed block, hooks,
// skills) stays at the OLD version until `cmk install` re-runs — and the kit was
// silent about it (D-172: no update path). HC-9 makes the kit TELL the user the
// project is behind, so the easily-forgotten per-project re-install step is caught.

import { describe, it, expect } from 'vitest';
import { checkVersionDrift } from '../packages/cli/src/version-drift.mjs';

const claudeMdWith = (version) =>
  `# Project\n\nsome rules\n\n<!-- claude-memory-kit:start v${version} -->\nblock body\n<!-- claude-memory-kit:end -->\n`;

describe('checkVersionDrift (HC-9)', () => {
  it('PASS when the project block version matches the installed binary', () => {
    const r = checkVersionDrift({ claudeMdText: claudeMdWith('0.3.4'), kitVersion: '0.3.4' });
    expect(r.status).toBe('pass');
    expect(r.id).toBe('HC-9');
  });

  it('FAIL when the installed binary is NEWER than the project block (the drift case)', () => {
    const r = checkVersionDrift({ claudeMdText: claudeMdWith('0.3.3'), kitVersion: '0.3.4' });
    expect(r.status).toBe('fail');
    expect(r.message).toMatch(/0\.3\.3/); // names the stale project version
    expect(r.message).toMatch(/0\.3\.4/); // and the newer installed version
    expect(r.recoveryCommand).toBe('cmk install');
  });

  it('SKIP when CLAUDE.md has no managed block (project not kit-installed / hand-removed)', () => {
    const r = checkVersionDrift({ claudeMdText: '# Project\n\nno kit block here\n', kitVersion: '0.3.4' });
    expect(r.status).toBe('skip');
  });

  it('SKIP when CLAUDE.md is absent (claudeMdText null)', () => {
    const r = checkVersionDrift({ claudeMdText: null, kitVersion: '0.3.4' });
    expect(r.status).toBe('skip');
  });

  it('PASS (does NOT fail) when the project block is NEWER than the binary — a downgrade is not drift', () => {
    // A user on an older global cli opening a project scaffolded by a newer one.
    // That's not the "re-run install" case; flag it benignly as pass, not a false drift.
    const r = checkVersionDrift({ claudeMdText: claudeMdWith('0.4.0'), kitVersion: '0.3.4' });
    expect(r.status).toBe('pass');
  });

  it('handles a patch-level drift (0.3.4 → 0.3.5)', () => {
    const r = checkVersionDrift({ claudeMdText: claudeMdWith('0.3.4'), kitVersion: '0.3.5' });
    expect(r.status).toBe('fail');
  });

  it('still detects drift on a CORRUPTED block (orphan start marker, missing end) — skill-review I-1', () => {
    // findManagedBlock recovers a version from a start-marker-only block; if it's
    // stale, `cmk install` is doubly right (fixes the staleness AND the corruption).
    const orphan = `# Project\n\n<!-- claude-memory-kit:start v0.3.3 -->\nblock body with no end marker\n`;
    const r = checkVersionDrift({ claudeMdText: orphan, kitVersion: '0.3.4' });
    expect(r.status).toBe('fail');
    expect(r.recoveryCommand).toBe('cmk install');
  });

  it('treats a prerelease project marker as its release (0.3.4-beta == 0.3.4) — skill-review I-2', () => {
    const r = checkVersionDrift({ claudeMdText: claudeMdWith('0.3.4-beta'), kitVersion: '0.3.4' });
    expect(r.status).toBe('pass');
  });
});
