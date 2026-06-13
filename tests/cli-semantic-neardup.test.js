// @doors: 1, 2
// Door 2: queue files + scratchpads written/asserted in a sandboxed install.
// Door 3 N/A: the embedder is an injected seam here; the real-model path is
//   the live-test (recorded in the PR + DECISION-LOG, run from the repo bin).
// Door 4 N/A: no message-queue (the conflict queue file is Door-2 state).
// Door 5 N/A: queue writes audit via writeConflictEntry's own contract,
//   pinned in cli-conflict-queue.test.js — not re-pinned here.
//
// Task 143 (D-130) — semantic near-duplicate detection at write time.
// Literal canonical-id dedup lets "use uv not pip" and "always install with
// uv, never pip" both persist. When semantic is configured AND the local
// embedder is available, the EXPLICIT capture paths compare the incoming
// text against existing bullets by cosine (over the content-addressed
// embedding cache) and route above-threshold matches to the CONFLICT QUEUE
// as near-dup proposals — never auto-drop (the reviewable-not-silent rule).
// Degrades gracefully to literal dedup when the embedder is absent.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareSemanticSimilarity } from '../packages/cli/src/semantic-backend.mjs';
import { memoryWrite } from '../packages/cli/src/memory-write.mjs';
import { prepareNearDupGuard } from '../packages/cli/src/remember-core.mjs';
import { runRemember } from '../packages/cli/src/subcommands.mjs';
import { install } from '../packages/cli/src/install.mjs';

let sandbox;
let projectRoot;
let userDir;

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-neardup-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
});

afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

// A fake extractor: deterministic 3-dim normalized vectors keyed by content.
// Texts sharing a "topic" token get near-identical vectors.
function fakeExtractor(vectorsByText) {
  const fn = async (input) => {
    const texts = Array.isArray(input) ? input : [input];
    const out = texts.map((t) => {
      const v = vectorsByText[t];
      if (!v) throw new Error(`fakeExtractor: no vector for: ${t}`);
      return v;
    });
    return { tolist: () => out };
  };
  return fn;
}

const UV_A = 'use uv not pip';
const UV_B = 'always install with uv, never pip';
const OTHER = 'the staging cluster deploys weekly';

// Normalized: A·B = 0.999…, A·OTHER = 0.
const VECTORS = {
  [UV_A]: [1, 0, 0],
  [UV_B]: [0.9995, 0.0316, 0],
  [OTHER]: [0, 1, 0],
};

describe('Task 143 — prepareSemanticSimilarity (Door 1)', () => {
  it('embedder absent → honest not-ok (callers degrade to literal)', async () => {
    const r = await prepareSemanticSimilarity({
      projectRoot,
      newText: UV_A,
      extractorImpl: async () => null,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('embedder-not-installed');
  });

  it('cosine over cached vectors: paraphrase pair scores high, unrelated low', async () => {
    const r = await prepareSemanticSimilarity({
      projectRoot,
      newText: UV_A,
      extractorImpl: async () => fakeExtractor(VECTORS),
      // The candidate-side cache lookup seam: text → normalized vector.
      cacheLookupImpl: (text) => VECTORS[text] ?? null,
    });
    expect(r.ok).toBe(true);
    expect(r.backend).toBe('semantic');
    expect(r.similarityFn(UV_A, UV_B)).toBeGreaterThan(0.95);
    expect(r.similarityFn(UV_A, OTHER)).toBeLessThan(0.1);
  });

  it('cache miss for a candidate → token-Jaccard fallback for that pair (never a throw)', async () => {
    const r = await prepareSemanticSimilarity({
      projectRoot,
      newText: UV_A,
      extractorImpl: async () => fakeExtractor(VECTORS),
      cacheLookupImpl: () => null, // nothing cached
    });
    expect(r.ok).toBe(true);
    const sim = r.similarityFn(UV_A, 'use uv not pip today');
    expect(sim).toBeGreaterThan(0); // literal overlap still scores
    expect(sim).toBeLessThanOrEqual(1);
  });

  it('REAL cache-snapshot path: reads the index-db embedding_cache, closes the db, looks up by sha', async () => {
    // Exercises the production lookup branch (openIndexDb → Map snapshot →
    // sha lookup) instead of the cacheLookupImpl seam — the branch Sonar
    // flagged as uncovered new code. Seed the cache the way syncSemanticIndex
    // writes it: content_sha = sha256(`${model}\n${text}`), vector = Float32 blob.
    const { openIndexDb } = await import('../packages/cli/src/index-db.mjs');
    const { createHash } = await import('node:crypto');
    const db = openIndexDb({ projectRoot });
    try {
      // Only the embedding_cache table is needed for the lookup path — a
      // plain table, no sqlite-vec extension required (ensureSemanticSchema
      // would demand the vec0 virtual tables + the loaded extension).
      db.exec('CREATE TABLE IF NOT EXISTS embedding_cache (content_sha TEXT PRIMARY KEY, model TEXT NOT NULL, vector BLOB NOT NULL)');
      const model = 'fake-model';
      const put = db.prepare('INSERT OR REPLACE INTO embedding_cache(content_sha, model, vector) VALUES (?, ?, ?)');
      for (const [text, vec] of Object.entries(VECTORS)) {
        const sha = createHash('sha256').update(`${model}\n${text}`).digest('hex');
        put.run(sha, model, Buffer.from(new Float32Array(vec).buffer));
      }
    } finally {
      db.close();
    }
    const r = await prepareSemanticSimilarity({
      projectRoot,
      newText: UV_A,
      modelId: 'fake-model',
      extractorImpl: async () => fakeExtractor(VECTORS),
      // no cacheLookupImpl → the REAL openIndexDb snapshot path runs
    });
    expect(r.ok).toBe(true);
    expect(r.similarityFn(UV_A, UV_B)).toBeGreaterThan(0.95);
    expect(r.similarityFn(UV_A, OTHER)).toBeLessThan(0.1);
  });

  it('embed throw → not-ok with embed-failed reason (the model-errored branch)', async () => {
    const r = await prepareSemanticSimilarity({
      projectRoot,
      newText: UV_A,
      extractorImpl: async () => async () => {
        throw new Error('onnx runtime blew up');
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/^embed-failed: /);
  });
});

describe('Task 143 — memoryWrite queueNearDups (Doors 1+2)', () => {
  const baseAdd = (text, over = {}) => ({
    action: 'add',
    tier: 'P',
    text,
    scratchpad: 'MEMORY.md',
    section: 'Active Threads',
    trust: 'high',
    source: 'user-explicit',
    projectRoot,
    userDir,
    now: '2026-06-12T12:00:00Z',
    ...over,
  });

  it('EQUAL-trust near-dup routes to the conflict queue as a proposal (the rot case)', () => {
    const first = memoryWrite(baseAdd(UV_A));
    expect(first.action).toBe('appended');

    const second = memoryWrite(
      baseAdd(UV_B, {
        similarityFn: () => 0.97,
        similarityThreshold: 0.85,
        queueNearDups: true,
      }),
    );
    expect(second.action).toBe('queued');

    // State (Door 2): the queue holds the proposal; the scratchpad does NOT
    // hold the near-dup; the original bullet is untouched (over-mutation).
    const queuePath = join(projectRoot, 'context', 'queues', 'conflicts.md');
    expect(existsSync(queuePath)).toBe(true);
    const queueText = readFileSync(queuePath, 'utf8');
    expect(queueText).toContain(UV_B);
    const mem = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(mem).toContain(UV_A);
    expect(mem).not.toContain(UV_B);
  });

  it('below-threshold stays a normal append (no false queueing)', () => {
    memoryWrite(baseAdd(UV_A));
    const r = memoryWrite(
      baseAdd(OTHER, {
        similarityFn: () => 0.2,
        similarityThreshold: 0.85,
        queueNearDups: true,
      }),
    );
    expect(r.action).toBe('appended');
  });

  it('default contract unchanged: without queueNearDups an equal-trust match still appends', () => {
    memoryWrite(baseAdd(UV_A));
    const r = memoryWrite(
      baseAdd(UV_B, {
        similarityFn: () => 0.97,
        similarityThreshold: 0.85,
        // no queueNearDups — the pre-143 supersede-appends contract holds
      }),
    );
    expect(r.action).toBe('appended');
  });

  it('lower-trust near-dup keeps the EXISTING queue route (unchanged contract)', () => {
    memoryWrite(baseAdd(UV_A, { trust: 'high' }));
    const r = memoryWrite(
      baseAdd(UV_B, {
        trust: 'low',
        similarityFn: () => 0.97,
        similarityThreshold: 0.85,
        queueNearDups: true,
      }),
    );
    expect(r.action).toBe('queued');
  });
});

describe('Task 143 — prepareNearDupGuard (the shared adapter gate, Door 1)', () => {
  it('keyword mode → {} (semantic never engages)', async () => {
    const extra = await prepareNearDupGuard({
      projectRoot,
      text: UV_A,
      resolveModeImpl: () => 'keyword',
      prepareImpl: async () => {
        throw new Error('must not be called in keyword mode');
      },
    });
    expect(extra).toEqual({});
  });

  it('semantic configured + embedder ok → similarityFn + the MEASURED threshold + queueNearDups', async () => {
    const extra = await prepareNearDupGuard({
      projectRoot,
      text: UV_A,
      resolveModeImpl: () => 'hybrid',
      prepareImpl: async () => ({ ok: true, similarityFn: () => 0.9, backend: 'semantic' }),
    });
    expect(extra.queueNearDups).toBe(true);
    expect(typeof extra.similarityFn).toBe('function');
    // The live-measured bge-base threshold (semantic-backend constant): the
    // generic 0.85 default would MISS the canonical uv pair at 0.8493.
    expect(extra.similarityThreshold).toBe(0.78);
  });

  it('embedder unavailable or throwing → {} (capture never blocked)', async () => {
    const absent = await prepareNearDupGuard({
      projectRoot,
      text: UV_A,
      resolveModeImpl: () => 'hybrid',
      prepareImpl: async () => ({ ok: false, reason: 'embedder-not-installed' }),
    });
    expect(absent).toEqual({});
    const throwing = await prepareNearDupGuard({
      projectRoot,
      text: UV_A,
      resolveModeImpl: () => 'hybrid',
      prepareImpl: async () => {
        throw new Error('model exploded');
      },
    });
    expect(throwing).toEqual({});
  });

  it('REAL dispatch — keyword project (default resolver) returns {} without touching the embedder', async () => {
    // No seams: exercises the production resolveDefaultSearchMode → a fresh
    // install defaults to keyword, so the guard early-returns {} (the
    // dynamic-import + real-resolver branch Sonar flagged as uncovered).
    const extra = await prepareNearDupGuard({ projectRoot, text: UV_A });
    expect(extra).toEqual({});
  });

  it('REAL dispatch — semantic-configured project with no embedder degrades to {} (CMK_DISABLE_SEMANTIC)', async () => {
    const settingsPath = join(projectRoot, 'context', 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({ search: { default_mode: 'hybrid' } }), 'utf8');
    const prev = process.env.CMK_DISABLE_SEMANTIC;
    process.env.CMK_DISABLE_SEMANTIC = '1';
    try {
      // Real resolveDefaultSearchMode reads hybrid → real prepareSemanticSimilarity
      // runs → the disabled embedder yields not-ok → {} (graceful degradation),
      // exercising the production path end-to-end with no seams.
      const extra = await prepareNearDupGuard({ projectRoot, text: UV_A });
      expect(extra).toEqual({});
    } finally {
      if (prev === undefined) delete process.env.CMK_DISABLE_SEMANTIC;
      else process.env.CMK_DISABLE_SEMANTIC = prev;
    }
  });
});

describe('Task 143 — runRemember end-to-end with the guard (Doors 1+2)', () => {
  it('a semantic near-dup typed at the CLI lands in the conflict queue, not the scratchpad', async () => {
    const out = [];
    const deps = { projectRoot, userDir, log: (m) => out.push(String(m)), logError: (m) => out.push(String(m)) };
    await runRemember([UV_A], {}, deps);
    await runRemember([UV_B], {}, {
      ...deps,
      nearDupGuard: {
        resolveModeImpl: () => 'hybrid',
        prepareImpl: async () => ({ ok: true, similarityFn: () => 0.97, backend: 'semantic' }),
      },
    });
    expect(out.join('\n')).toMatch(/queued for review/);
    const mem = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(mem).toContain(UV_A);
    expect(mem).not.toContain(UV_B);
  });
});
