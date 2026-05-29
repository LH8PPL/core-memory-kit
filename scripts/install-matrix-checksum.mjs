#!/usr/bin/env node
// Task 40 — install-matrix per-OS scaffold-tree checksum producer.
//
// Runs `cmk install` in a tempdir, walks the scaffolded `context/`
// tree, and writes a single `install-matrix-checksum.json` with a
// per-file SHA-256 + a tree-aggregate hash. The CI's checksum-compare
// step downloads all 3 OS artifacts and asserts the tree-aggregate
// hashes match (per design §14 — scaffold output is OS-independent).

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');
const cmkBin = join(repoRoot, 'packages', 'cli', 'bin', 'cmk.mjs');

const sandbox = mkdtempSync(join(tmpdir(), 'cmk-install-matrix-'));
const projectRoot = join(sandbox, 'proj');
const userDir = join(sandbox, 'user');

// Pre-create the project directory so cmk install has somewhere to scaffold into
mkdirSync(projectRoot, { recursive: true });
mkdirSync(userDir, { recursive: true });

console.log(`[install-matrix-checksum] running on platform=${platform()}`);
console.log(`[install-matrix-checksum] sandbox=${sandbox}`);

// Run cmk install in the tempdir
const env = {
  ...process.env,
  MEMORY_KIT_USER_DIR: userDir,
};
process.chdir(projectRoot);
// Use node directly (avoid PATH issues with cmk shim across OSes)
execSync(`node "${cmkBin}" install`, {
  env: { ...env, INIT_CWD: projectRoot },
  stdio: 'inherit',
  cwd: projectRoot,
});

// Walk the scaffolded context/ tree
const contextDir = join(projectRoot, 'context');

// Runtime/gitignored dirs that are NOT part of the deterministic scaffold
// and must be excluded from the cross-OS byte-identical comparison:
//   - .locks/  : audit.log carries per-run timestamps + absolute tempdir
//                paths (since Task 49, `cmk install` writes an
//                INSTALL_HOOKS_WIRED audit entry) — inherently non-deterministic.
//   - .index/  : regenerable SQLite cache.
// Both are gitignored (never committed), so the scaffold-determinism
// guarantee (design §14) was never about them.
const RUNTIME_DIRS = new Set(['.locks', '.index']);

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir).sort()) {
    if (RUNTIME_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    const rel = relative(projectRoot, full).split(sep).join(posix.sep);
    if (st.isDirectory()) {
      entries.push(...walk(full));
    } else if (st.isFile()) {
      const buf = readFileSync(full);
      // Normalize line endings: CRLF → LF for cross-OS comparison.
      // Per template/.gitattributes etc., the kit's text files are
      // committed as LF; on Windows checkout, git may convert to CRLF.
      const text = buf.toString('utf8').replace(/\r\n/g, '\n');
      const sha = createHash('sha256').update(text, 'utf8').digest('hex');
      entries.push({ path: rel, sha256: sha, size: buf.length });
    }
  }
  return entries;
}

const files = walk(contextDir);
const treeHash = createHash('sha256')
  .update(files.map((f) => `${f.path}:${f.sha256}`).join('\n'), 'utf8')
  .digest('hex');

const payload = {
  platform: platform(),
  fileCount: files.length,
  treeHash,
  files,
};

const outPath = join(repoRoot, 'install-matrix-checksum.json');
writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`[install-matrix-checksum] wrote ${outPath} (${files.length} files, treeHash=${treeHash.slice(0, 16)}...)`);
