// judgment.mjs — earned method-preference records (Task 191, ADR-0017 Phase
// 1b; D-252). A judgment is NOT a fact: a fact asserts, a judgment COMPARES
// ("for task-shape T, prefer A over B") and must carry its baseline, its
// replication count, and an append-only evidence log — so it can be revised
// and never lies about how much it knows. Schema: the 2026-07-01
// comparative-judgment study (docs/research/), adopted verbatim.
//
// The honesty guards (binding, from the study):
//   - a judgment starts PROVISIONAL with n_episodes: 1 — one observation is
//     an anecdote, not a preference;
//   - met predictions NUDGE (HIT bumps n_episodes; corroborated only at >= 3
//     consistent episodes), only misses LOCK (a MISS or REVERSAL sets
//     direction_consistent: false — a sticky lock later HITs cannot undo);
//   - a preference CYCLE (A>B, B>C, C>A) marks every judgment on the cycle
//     CONTESTED — surfaced, never auto-picked;
//   - a judgment EXPIRES: decays_after maps onto the 66.1 expires_at
//     machinery, so a decayed judgment hides from search for free;
//   - judgments NEVER enter ranking (Task 194's blend is facts-only — this
//     module is the reason that rule is checkable: type === 'judgment').
//
// Writers route through writeFact (Poison_Guard + dedup + INDEX + audit —
// the shared safe path); updates route through frontmatter.parse/format (the
// validity-window pattern). Born from the loop (Task 192's resolutions), not
// from dictation: remember/mk_remember deliberately cannot write this type.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeFact } from './write-fact.mjs';
import { hashContent } from './content-hash.mjs';
import { parse, format } from './frontmatter.mjs';
import { appendAuditEntry, nowIso } from './audit-log.mjs';
import { reindex } from './reindex.mjs';

const VERDICTS = new Set(['HIT', 'MISS', 'REVERSAL', 'WEAK-POSITIVE']);

function factDirOf(projectRoot) {
  return join(projectRoot, 'context', 'memory');
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** List all judgment files, parsed. @returns {Array<{path, slug, frontmatter, body}>} */
export function readJudgments({ projectRoot } = {}) {
  const dir = factDirOf(projectRoot);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!name.startsWith('judgment_') || !name.endsWith('.md')) continue;
    try {
      const { frontmatter, body } = parse(readFileSync(join(dir, name), 'utf8'));
      // B1 (skill-review): parse() returns {frontmatter:null} on YAML failure
      // (merge-conflict markers in a committed judgment file are a realistic
      // trigger) - it never throws, so the catch below can't save us. Skip.
      if (!frontmatter || typeof frontmatter !== 'object') continue;
      out.push({ path: join(dir, name), slug: name.slice('judgment_'.length, -3), frontmatter, body });
    } catch {
      // unreadable judgment file — skip, never throw into a caller's loop
    }
  }
  return out;
}

// Directed-cycle check: does adding the edge prefer->over close a loop?
// Edges mean "prefer beats over"; ANY path over->...->prefer means the new
// edge completes a cycle. Only ACTIVE judgments (not retracted) participate.
// Returns the FULL cycle-node set - every node on ANY over->...->prefer path
// (forward-reachable-from-over INTERSECT reaches-prefer), not just the first
// DFS path (skill-review I1: one close can complete MULTIPLE cycles at once;
// under-marking leaves a real on-disk cycle uncontested - the unsafe
// direction. Mild over-marking of shared nodes errs safe by design).
function findCycleNodes(judgments, { prefer, over }) {
  const fwd = new Map(); // node -> Set(beaten)
  const rev = new Map(); // node -> Set(beaters)
  for (const j of judgments) {
    const fm = j.frontmatter;
    if (fm.status === 'retracted') continue;
    if (!fwd.has(fm.prefer)) fwd.set(fm.prefer, new Set());
    fwd.get(fm.prefer).add(fm.over);
    if (!rev.has(fm.over)) rev.set(fm.over, new Set());
    rev.get(fm.over).add(fm.prefer);
  }
  const bfs = (startNode, graph) => {
    const seen = new Set([startNode]);
    const queue = [startNode];
    while (queue.length > 0) {
      const n = queue.shift();
      for (const next of graph.get(n) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen;
  };
  const fromOver = bfs(over, fwd); // nodes over beats, transitively
  if (!fromOver.has(prefer)) return null; // no path back - no cycle
  const reachPrefer = bfs(prefer, rev); // nodes that transitively beat prefer
  const nodes = new Set([prefer, over]);
  for (const n of fromOver) if (reachPrefer.has(n)) nodes.add(n);
  return nodes;
}

function markContested(projectRoot, judgment, note) {
  const fm = { ...judgment.frontmatter, status: 'contested' };
  let body = judgment.body;
  if (body.includes('## Cycle / contradiction flag')) {
    // Append-friendly (skill-review I2): a SECOND cycle on an already-
    // contested judgment records its own note instead of matching only the
    // literal 'none'.
    body = /## Cycle \/ contradiction flag\n\nnone/.test(body)
      ? body.replace(/## Cycle \/ contradiction flag\n\nnone/, `## Cycle / contradiction flag\n\n${note}`)
      : body.replace(/## Cycle \/ contradiction flag\n\n/, `## Cycle / contradiction flag\n\n${note}\n`);
  }
  writeFileSync(judgment.path, format({ frontmatter: fm, body }), 'utf8');
  // The cycle flip is the same mutation class as an evidence transition -
  // audit it too (skill-review I2). Best-effort.
  try {
    appendAuditEntry(join(projectRoot, 'context'), {
      ts: nowIso(),
      action: 'judgment-contested',
      tier: 'P',
      id: judgment.frontmatter.id,
      reasonCode: 'judgment-cycle',
      reasonText: note,
    });
  } catch {
    // best-effort audit
  }
}

/**
 * Create a judgment record via the shared safe path.
 *
 * @param {object} o
 * @param {string} o.projectRoot
 * @param {string} o.prefer        the preferred method (A)
 * @param {string} o.over          the BASELINE it is preferred over (B)
 * @param {string} o.taskShape     the task shape T the claim is scoped to
 * @param {string[]} [o.confounds]
 * @param {string} [o.outcomeHorizon]
 * @param {string} [o.decaysAfter] ISO date — the judgment's expiry (maps to expires_at)
 * @returns {{action, id?, path?, slug?, cycle?: boolean, errors?}}
 */
export function writeJudgment({
  projectRoot,
  prefer,
  over,
  taskShape,
  confounds,
  outcomeHorizon,
  decaysAfter,
} = {}) {
  if (prefer === over) {
    return { action: 'error', errors: ['prefer/over: a judgment cannot prefer a method over itself'] };
  }
  const claim = `for ${taskShape}, ${prefer} preferred over ${over}`;
  const slug = slugify(`${prefer}-over-${over}-${taskShape}`);
  const body = [
    '## Claim',
    '',
    `For "${taskShape}": **${prefer} > ${over}**.`,
    '',
    '## Evidence',
    '',
    '## Cycle / contradiction flag',
    '',
    'none',
  ].join('\n');

  const r = writeFact({
    projectRoot,
    tier: 'P',
    type: 'judgment',
    slug,
    title: claim,
    body,
    writeSource: 'auto-extract',
    trust: 'medium',
    shape: 'Preference',
    expiresAt: decaysAfter,
    sourceFile: 'judgment',
    sourceLine: 1,
    sourceSha1: hashContent(claim),
    judgment: {
      claim,
      baseline: over,
      prefer,
      over,
      status: 'provisional',
      nEpisodes: 1,
      directionConsistent: true,
      confounds,
      outcomeHorizon,
      decaysAfter,
    },
  });
  if (r.action !== 'created') return { ...r, slug };

  // Cycle check AFTER the create so the new edge participates. On a cycle,
  // every judgment on it (including this one) flips contested — never
  // silently, never auto-picked (the study's hard rule).
  const all = readJudgments({ projectRoot });
  const cycleNodes = findCycleNodes(
    all.filter((j) => j.frontmatter.id !== r.id),
    { prefer, over },
  );
  let cycle = false;
  if (cycleNodes) {
    cycle = true;
    const note = `cycle detected ${[...cycleNodes].join(' / ')} — surfaced, not auto-picked`;
    for (const j of all) {
      if (cycleNodes.has(j.frontmatter.prefer) && cycleNodes.has(j.frontmatter.over)) {
        markContested(projectRoot, j, note);
      }
    }
    // M1: precedent (validity-window/merge-facts) reindexes after mutating
    // fact files so search reflects the flip immediately. Best-effort.
    try {
      reindex({ tier: 'P', projectRoot, warn: () => {} });
    } catch {
      /* self-heals on the next search's reindexBoot */
    }
  }
  return { ...r, slug, cycle };
}

/**
 * Append one outcome to a judgment's evidence log (the earned part) and
 * apply the status transitions. Append-only: evidence lines are never
 * rewritten or removed.
 *
 * @param {object} o
 * @param {string} o.projectRoot
 * @param {string} o.id         the judgment's fact id
 * @param {string} o.verdict    HIT | MISS | REVERSAL | WEAK-POSITIVE
 * @param {string} [o.predicted] the pre-registered expectation text
 * @param {string} [o.observed]  what actually happened
 * @param {string} [o.now]       ISO ts (tests)
 * @returns {{action:'appended'|'not-found'|'error', id?, status?, errors?}}
 */
export function appendJudgmentEvidence({ projectRoot, id, verdict, predicted, observed, now } = {}) {
  if (!VERDICTS.has(verdict)) {
    return { action: 'error', errors: [`verdict: must be one of ${[...VERDICTS].join('|')}`] };
  }
  const judgment = readJudgments({ projectRoot }).find((j) => j.frontmatter.id === id);
  if (!judgment) return { action: 'not-found', id };

  const ts = now ?? nowIso();
  const parts = [`- ${ts.slice(0, 10)}`];
  if (predicted) parts.push(`predicted: ${predicted}`);
  if (observed) parts.push(`observed: ${observed}`);
  parts.push(verdict);
  const line = parts.join(' · ');

  let body = judgment.body.replace(/## Evidence\n/, `## Evidence\n${line}\n`);
  const fm = { ...judgment.frontmatter };

  // The transition rules (the study's nudge-vs-lock asymmetry):
  if (verdict === 'HIT') {
    fm.n_episodes = (fm.n_episodes ?? 1) + 1;
    if (fm.direction_consistent === true && fm.n_episodes >= 3 && fm.status === 'provisional') {
      fm.status = 'corroborated';
    }
  } else if (verdict === 'MISS' || verdict === 'REVERSAL') {
    fm.direction_consistent = false; // the sticky lock — HITs never undo it
    fm.status = 'contested';
  }
  // WEAK-POSITIVE: evidence only — no replication bump, no status move.

  writeFileSync(judgment.path, format({ frontmatter: fm, body }), 'utf8');
  // M1: keep the index current after the mutation (the validity-window/
  // merge-facts precedent). Best-effort - reindexBoot self-heals otherwise.
  try {
    reindex({ tier: 'P', projectRoot, warn: () => {} });
  } catch {
    /* self-heals */
  }
  try {
    appendAuditEntry(join(projectRoot, 'context'), {
      ts,
      action: 'judgment-evidence',
      tier: 'P',
      id,
      reasonCode: 'judgment-evidence',
      extra: { verdict, status: fm.status },
    });
  } catch {
    // best-effort audit — the evidence is already durably on disk
  }
  return { action: 'appended', id, status: fm.status };
}
