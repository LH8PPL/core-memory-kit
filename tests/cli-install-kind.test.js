// @doors: 1
// Door 2 N/A: pure read-only detection over an existing tree (no mutation).
// Door 3 N/A: no external services / subprocess.
// Door 4 N/A: no message queues.
// Door 5 N/A: no observability / NDJSON emission at this surface.

// Tests for Task 200 — detectInstallKind extracted to its own shared module
// (install-kind.mjs) so makeBackend can import it WITHOUT pulling in doctor.mjs's
// heavy dependency chain (circular-dep avoidance). Behavior is byte-identical to
// the doctor.mjs original (keyed on the cmk-owned markers, the I2 discipline).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectInstallKind } from '../packages/cli/src/install-kind.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'cmk-installkind-'));
}
function touch(root, ...parts) {
  const p = join(root, ...parts);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, 'x', 'utf8');
}

describe('Task 200 — detectInstallKind (extracted shared module)', () => {
  it('a .claude/settings.json marks a claude-code install', () => {
    const root = tmp();
    touch(root, '.claude', 'settings.json');
    expect(detectInstallKind(root)).toBe('claude-code');
  });

  it('a .kiro/steering/cmk.md marks a kiro install', () => {
    const root = tmp();
    touch(root, '.kiro', 'steering', 'cmk.md');
    expect(detectInstallKind(root)).toBe('kiro');
  });

  it('the cmk-owned .cursor rule marks a cursor install', () => {
    const root = tmp();
    touch(root, '.cursor', 'rules', 'core-memory-kit.mdc');
    expect(detectInstallKind(root)).toBe('cursor');
  });

  it('a bare .cursor/ dir alone does NOT flip to cursor (I2 marker discipline)', () => {
    const root = tmp();
    mkdirSync(join(root, '.cursor'), { recursive: true });
    expect(detectInstallKind(root)).toBe('claude-code'); // default
  });

  it('an empty project defaults to claude-code', () => {
    expect(detectInstallKind(tmp())).toBe('claude-code');
  });
});
