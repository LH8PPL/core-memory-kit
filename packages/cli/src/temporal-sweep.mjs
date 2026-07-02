// temporal-sweep.mjs — the Task 66.4 contradiction-catch pipeline (design
// §16.18; the shape SETTLED by measurement, D-259 — see the 2026-07-02
// bake-off research note).
//
// Detection is split by cost, per the corpus evidence:
//   1. CANDIDATES (no LLM): for each fact written since the last sweep,
//      retrieve same-subject older facts from the kit's OWN index — an FTS5
//      OR-query over the new fact's QUOTED title tokens (quoting makes a
//      shredded token like `v0.3.2` → [v0,3,2] match as a phrase — the
//      retrieval caveat the bake-off surfaced).
//   2. JUDGE (one batched Haiku call): SUPERSEDES / DUPLICATE / COEXIST —
//      the classification no cheap heuristic could make (lexical pairing
//      measured DEAD: zero true contradictions at any threshold; real
//      contradictions share a subject, not words). 10/10 twice on real
//      pairs at ~$0.004/10 in the bake-off.
//   3. ROUTE (code, event-time): SUPERSEDES → validity-window close (66.2;
//      created_at decides direction, never the LLM) · DUPLICATE → the
//      recurrence bump (the 151 promotion signal — the bake-off showed the
//      two classes share a pipeline) · COEXIST → drop.
//
// Runs inside weekly-curate's Haiku cycle (like auto-persona) — NO new
// hot-path spawn; the auto-extract detached child keeps its single call
// (the 60s-ceiling composition class stays untouched). The demo surface
// ("state updates resolved: X → Y") is read from the temporal_supersede
// audit entries by inject-context at the next SessionStart.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { resolveTierRoot, resolveFactDir } from './tier-paths.mjs';
import { parse } from './frontmatter.mjs';
import { canonicalize } from '@lh8ppl/cmk-canonicalize';
import { openIndexDb } from './index-db.mjs';
import { reindexBoot } from './index-rebuild.mjs';
import { resolveTemporalSupersede } from './validity-window.mjs';
import { bumpFactRecurrence } from './write-fact.mjs';
import { nowIso } from './audit-log.mjs';

// Cost bound: one batched call, at most this many pairs per sweep. Overflow
// is NOT silent (the no-silent-caps rule): dropped pairs are counted in the
// summary and the next weekly pass re-finds them (candidates are re-derived
// from the corpus, not a fragile queue).
export const MAX_PAIRS_PER_SWEEP = 20;
const CANDIDATES_PER_FACT = 3;
const BODY_SLICE = 350;
const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const MARKER_REL = ['context', '.locks', 'temporal-sweep-last-run'];

function asIsoString(v) {
  if (v instanceof Date) return v.toISOString();
  return v == null ? '' : String(v);
}

function readMarker(projectRoot) {
  const p = join(projectRoot, ...MARKER_REL);
  if (!existsSync(p)) return null;
  const t = readFileSync(p, 'utf8').trim();
  return Number.isFinite(Date.parse(t)) ? t : null;
}

function writeMarker(projectRoot, ts) {
  const p = join(projectRoot, ...MARKER_REL);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, ts, 'utf8');
}

function collectNewStateFacts({ projectRoot, userDir, sinceMs }) {
  const out = [];
  const tiers = [];
  if (projectRoot) tiers.push('P', 'L');
  if (userDir) tiers.push('U');
  for (const tier of tiers) {
    const tierRoot = resolveTierRoot({ tier, projectRoot, userDir });
    const factDir = resolveFactDir(tier, tierRoot);
    if (!existsSync(factDir)) continue;
    for (const entry of readdirSync(factDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'INDEX.md') continue;
      const path = join(factDir, entry.name);
      let frontmatter, body;
      try {
        ({ frontmatter, body } = parse(readFileSync(path, 'utf8')));
      } catch {
        continue;
      }
      if (!frontmatter?.id || frontmatter.deleted_at || frontmatter.superseded_by) continue;
      // Windows close on CURRENT-STATE claims only — State is the default
      // shape for every pre-66 fact (absence reads as State, design §16.18).
      const shape = frontmatter.shape ?? 'State';
      if (shape !== 'State') continue;
      const createdMs = Date.parse(asIsoString(frontmatter.created_at));
      if (!Number.isFinite(createdMs) || createdMs <= sinceMs) continue;
      out.push({
        id: frontmatter.id,
        tier,
        title: frontmatter.title ?? '',
        created: asIsoString(frontmatter.created_at),
        createdMs,
        body: (body ?? '').trim(),
        path,
      });
    }
  }
  return out;
}

// FTS5 OR-query over the fact's QUOTED title tokens. Quoting each token makes
// a punctuation-shredded token (`v0.3.2`) match as an adjacent-token phrase,
// and neutralizes FTS5 operator words (OR/AND/NOT) inside titles.
export function buildCandidateQuery(title) {
  const tokens = canonicalize(title ?? '')
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 8)
    .map((t) => `"${t.replace(/"/g, '')}"`);
  return tokens.join(' OR ');
}

function findCandidates(db, fact, { nowMs }) {
  const match = buildCandidateQuery(fact.title);
  if (!match) return [];
  let rows;
  try {
    rows = db
      .prepare(
        `SELECT o.id, o.body, o.created_at, o.source_file
           FROM observations_fts
           JOIN observations o ON o.rowid = observations_fts.rowid
          WHERE observations_fts MATCH @match
            AND o.id != @id
            AND o.deleted_at IS NULL
            AND o.superseded_by IS NULL
            AND (o.expires_at IS NULL OR o.expires_at > @now_ms)
            AND o.created_at < @created_ms
            AND o.source_file LIKE '%memory/%'
          ORDER BY observations_fts.rank
          LIMIT @limit`,
      )
      .all({
        match,
        id: fact.id,
        now_ms: nowMs,
        created_ms: fact.createdMs,
        limit: CANDIDATES_PER_FACT,
      });
  } catch {
    return []; // an FTS parse hiccup on one title must not kill the sweep
  }
  return rows;
}

// The judge prompt — the EXACT framing the bake-off scored 10/10 with, twice.
export function buildJudgeInstructions() {
  return [
    'You are classifying pairs of saved memory facts from a software project.',
    'For EACH pair, output exactly one line: `PAIR <n>: <VERDICT>` where VERDICT is one of:',
    '  SUPERSEDES — both facts describe the CURRENT STATE of the same evolving thing (a release, a task, a status), and the NEW fact replaces the OLD one: after the new fact, the old state description is no longer current.',
    '  DUPLICATE  — the two facts state the same information (restatement/rewording), neither adds a different state.',
    '  COEXIST    — same general subject but different aspects/claims; both remain true simultaneously.',
    'Judge ONLY whether the old state is still current given the new fact. Output nothing but the verdict lines.',
  ].join('\n');
}

export function buildJudgeInput(pairs) {
  const lines = [];
  pairs.forEach((p, i) => {
    lines.push(`PAIR ${i + 1}:`);
    lines.push(`  OLD (${p.older.created.slice(0, 10)}): ${p.older.title}`);
    lines.push(`  ${p.older.body.slice(0, BODY_SLICE).replace(/\n/g, ' ')}`);
    lines.push(`  NEW (${p.newer.created.slice(0, 10)}): ${p.newer.title}`);
    lines.push(`  ${p.newer.body.slice(0, BODY_SLICE).replace(/\n/g, ' ')}`);
    lines.push('');
  });
  return lines.join('\n');
}

function parseVerdicts(outputText) {
  const verdicts = {};
  for (const m of (outputText ?? '').matchAll(/PAIR\s*(\d+)\s*:\s*(SUPERSEDES|DUPLICATE|COEXIST)/gi)) {
    verdicts[Number(m[1])] = m[2].toUpperCase();
  }
  return verdicts;
}

/**
 * The weekly contradiction-catch pass. Deterministic candidate retrieval +
 * one batched judge call + event-time routing. Best-effort by contract —
 * returns a summary, never throws for a judge/parse hiccup.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {string} [opts.userDir]
 * @param {CompressorBackend} opts.backend  the weekly cycle's Haiku backend
 * @param {string} [opts.now]
 * @param {number} [opts.timeoutMs]
 */
export async function temporalSweep({
  projectRoot,
  userDir,
  backend,
  now,
  timeoutMs = 120000,
} = {}) {
  const ts = now ?? nowIso();
  const nowMs = Date.parse(ts);
  const marker = readMarker(projectRoot);
  const sinceMs = marker ? Date.parse(marker) : nowMs - DEFAULT_LOOKBACK_MS;

  const newFacts = collectNewStateFacts({ projectRoot, userDir, sinceMs });
  if (newFacts.length === 0) {
    writeMarker(projectRoot, ts);
    return { action: 'skipped', reason: 'no-new-facts', pairs_judged: 0 };
  }

  // Index the new facts, then retrieve candidates.
  const byId = new Map();
  let pairsDropped = 0;
  const db = openIndexDb({ projectRoot });
  try {
    try {
      reindexBoot({ projectRoot, userDir, db, now: nowMs });
    } catch {
      // boot reindex is best-effort; a stale index only reduces candidates
    }
    for (const fact of newFacts) byId.set(fact.id, fact);
    const pairs = [];
    const seen = new Set();
    for (const fact of newFacts) {
      for (const c of findCandidates(db, fact, { nowMs })) {
        const key = `${c.id}→${fact.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // A candidate that is itself one of this sweep's new facts is fine —
        // chains progress within a week; direction stays created_at-ordered.
        if (pairs.length >= MAX_PAIRS_PER_SWEEP) {
          pairsDropped++;
          continue;
        }
        pairs.push({
          older: {
            id: c.id,
            title: '', // filled from the row body head below
            created: new Date(c.created_at).toISOString(),
            body: c.body ?? '',
          },
          newer: fact,
        });
      }
    }
    // Candidate rows come from the index (body only); title = first body line
    // is good enough for the judge (fact bodies open with the claim).
    for (const p of pairs) {
      p.older.title = p.older.body.split('\n')[0].slice(0, 120);
    }

    if (pairs.length === 0) {
      writeMarker(projectRoot, ts);
      return { action: 'skipped', reason: 'no-candidates', new_facts: newFacts.length, pairs_judged: 0 };
    }

    let result;
    try {
      result = await backend.compress({
        input: buildJudgeInput(pairs),
        instructions: buildJudgeInstructions(),
        maxOutputBytes: 4000,
        timeoutMs,
      });
    } catch (err) {
      // Judge unavailable this week — do NOT advance the marker; the same
      // pairs are re-derived and judged next pass. Never lose a catch to a
      // transient failure.
      return {
        action: 'error',
        reason: 'judge-failed',
        error: err?.message ?? String(err),
        pairs_judged: 0,
        pairs_found: pairs.length,
      };
    }

    const verdicts = parseVerdicts(result.outputText);
    const summary = { superseded: 0, duplicates: 0, coexist: 0, unjudged: 0, errors: [] };
    for (let i = 0; i < pairs.length; i++) {
      const v = verdicts[i + 1];
      const p = pairs[i];
      if (v === 'SUPERSEDES') {
        const r = resolveTemporalSupersede({
          olderId: p.older.id,
          newerId: p.newer.id,
          projectRoot,
          userDir,
          now: ts,
          judgedBy: 'temporal-sweep',
        });
        if (r.action === 'superseded') summary.superseded++;
        else if (r.action === 'skipped') summary.coexist++; // already closed by an earlier pair
        else summary.errors.push(`${p.older.id}: ${(r.errors ?? [r.action]).join('; ')}`);
      } else if (v === 'DUPLICATE') {
        // The restatement signal — bump the OLDER fact's recurrence (151).
        const r = bumpFactRecurrence({ id: p.older.id, projectRoot, userDir, now: ts, source: 'temporal-sweep' });
        if (r?.action === 'bumped') summary.duplicates++;
        else summary.errors.push(`${p.older.id}: recurrence bump ${r?.action ?? 'failed'}`);
      } else if (v === 'COEXIST') {
        summary.coexist++;
      } else {
        summary.unjudged++; // malformed/missing verdict — drop, re-derived next pass
      }
    }

    writeMarker(projectRoot, ts);
    return {
      action: 'swept',
      new_facts: newFacts.length,
      pairs_judged: pairs.length,
      pairs_dropped: pairsDropped,
      ...summary,
      cost_usd: result.costUSD ?? null,
    };
  } finally {
    db.close();
  }
}
