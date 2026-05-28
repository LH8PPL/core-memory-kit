#!/usr/bin/env node
// One-shot script: load fixtures/canonicalize-vectors.json, compute expected_id_P
// for every vector via @lh8ppl/cmk-canonicalize, write the fixture back. Run once after
// authoring inputs to freeze IDs; re-run only if canonicalize rules change.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { generateId } from '../packages/canonicalize/src/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '..', 'fixtures', 'canonicalize-vectors.json');

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
let frozen = 0;
for (const v of fixture.vectors) {
  const newId = generateId('P', v.input);
  if (v.expected_id_P !== newId) {
    v.expected_id_P = newId;
    frozen++;
  }
}
writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
console.log(`Froze ${frozen} of ${fixture.vectors.length} vector IDs into ${FIXTURE_PATH}`);
