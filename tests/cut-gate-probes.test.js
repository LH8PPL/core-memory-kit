// @doors: 1
// Door 2 N/A: read-only — parses the guide + calls the pure guard; no disk writes.
// Door 3 N/A: no subprocess.
// Door 4 N/A: no message-queue.
// Door 5 N/A: no log surface (checkPoisonGuard's logging is a separate caller concern).
//
// Task 137.3 — the guide's probes must BITE (the C3 class).
// cut-gate9 found that the guide's Poison_Guard probe token ended in a literal
// `...` and was 27 chars — UNDER the guard's ≥40 minimum — so the manual gate
// "tested" the guard with a string that sailed through, landing a fake secret
// in project memory. A probe string that doesn't trip the pattern it tests is
// the D-84 real-input rule violated inside the GUIDE itself.
//
// This suite extracts every secret-shaped probe token from
// docs/process/cut-gate.md and executes each against the REAL checkPoisonGuard
// — the guide can no longer drift under the guard's thresholds silently.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPoisonGuard } from '../packages/cli/src/poison-guard.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const guide = readFileSync(join(REPO, 'docs', 'process', 'cut-gate.md'), 'utf8');

// Secret-shaped probe tokens the guide instructs the operator to paste.
// Fixed-prefix families only (the same zero-FP construction as the guard's
// own catalog): sk- / sk-ant- API keys, AWS AKIA ids, GitHub ghp_ PATs.
// validate-test-ids: ignore — these regexes describe secret shapes, not kit ids.
const PROBE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\bAKIA[A-Z0-9]{8,}\b/g,
  /\bghp_[A-Za-z0-9]{8,}\b/g,
];

function extractProbes(text) {
  const out = new Set();
  for (const re of PROBE_PATTERNS) {
    for (const m of text.matchAll(re)) out.add(m[0]);
  }
  return [...out];
}

describe('Task 137.3 — every secret-shaped probe in cut-gate.md trips the real guard', () => {
  const probes = extractProbes(guide);

  it('the extractor finds at least one probe (a matcher that matches nothing guards nothing)', () => {
    expect(probes.length).toBeGreaterThan(0);
  });

  it.each(probes.map((p) => [p.slice(0, 24) + '…', p]))(
    'probe %s is rejected by checkPoisonGuard',
    (_label, probe) => {
      const r = checkPoisonGuard(`my key is ${probe}`);
      expect(r.rejected, `guide probe does not trip the guard (the C3 class): ${probe}`).toBe(true);
    },
  );
});
