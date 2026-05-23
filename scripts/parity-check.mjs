#!/usr/bin/env node
// Cross-implementation parity check. Runs both dump scripts, compares the
// per-vector rows (ignoring the top-level "impl" tag), exits non-zero on any
// canonical-text or ID mismatch.
//
// Used locally and by .github/workflows/canonicalize-parity.yml.

import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const pythonBin = process.env.PYTHON ?? (process.platform === 'win32' ? 'py' : 'python3');
const tmp = mkdtempSync(join(tmpdir(), 'cmk-parity-'));
const nodeOut = join(tmp, 'node.json');
const pyOut = join(tmp, 'python.json');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`Command failed (${r.status}): ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

try {
  run('node', ['scripts/parity-dump-node.mjs', nodeOut]);
  run(pythonBin, ['scripts/parity-dump-python.py', pyOut]);

  const nodeRows = JSON.parse(readFileSync(nodeOut, 'utf8')).rows;
  const pyRows = JSON.parse(readFileSync(pyOut, 'utf8')).rows;

  if (nodeRows.length !== pyRows.length) {
    console.error(`Row count mismatch: node=${nodeRows.length}, python=${pyRows.length}`);
    process.exit(1);
  }

  const mismatches = [];
  for (let i = 0; i < nodeRows.length; i++) {
    const n = nodeRows[i];
    const p = pyRows[i];
    if (n.name !== p.name) {
      mismatches.push(`Row ${i}: name differs (node=${n.name}, python=${p.name})`);
      continue;
    }
    for (const field of ['canonical', 'id_p', 'id_u', 'id_l']) {
      if (n[field] !== p[field]) {
        mismatches.push(
          `Vector "${n.name}" / field "${field}":\n  node=${JSON.stringify(n[field])}\n  python=${JSON.stringify(p[field])}`,
        );
      }
    }
  }

  if (mismatches.length > 0) {
    console.error('Parity check FAILED:');
    for (const m of mismatches) console.error('  ' + m);
    process.exit(1);
  }

  console.log(`Parity check OK — ${nodeRows.length} vectors, byte-identical Node ≡ Python.`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
