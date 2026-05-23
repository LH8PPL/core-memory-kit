#!/usr/bin/env node
// Dump Node @cmk/canonicalize outputs for every fixture vector as a single
// JSON document (sorted, deterministic). Pair with parity-dump-python.py and
// compare the two outputs byte-for-byte to prove Node ≡ Python parity.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { canonicalize, generateId } from '../packages/canonicalize/src/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '..', 'fixtures', 'canonicalize-vectors.json');
const outPath = process.argv[2] ?? resolve(__dirname, '..', 'tmp-parity-node.json');

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
const rows = fixture.vectors.map((v) => ({
  name: v.name,
  canonical: canonicalize(v.input),
  id_p: generateId('P', v.input),
  id_u: generateId('U', v.input),
  id_l: generateId('L', v.input),
}));

writeFileSync(outPath, JSON.stringify({ impl: 'node', rows }, null, 2) + '\n', 'utf8');
console.log(`Wrote ${rows.length} rows to ${outPath}`);
