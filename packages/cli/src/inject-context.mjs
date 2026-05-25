// SessionStart hook real handler (Task 18, T-015). First Layer 4 module
// with non-trivial behavior; the previous Layer 4 task (#17) only shipped
// hooks.json + stub scripts.
//
// Public boundary: injectContext({cwd, userDir, now, capBytes}) → result.
// Walks the 3 tiers (local/project/user), composes a Frozen snapshot
// ≤ capBytes (default 10 KB per NFR-1 / design §1.4), dedups bullet IDs
// across tiers with most-specific-tier-wins, drops lowest-priority tiers
// on cap overflow, and emits the Anthropic hook `additionalContext` JSON
// shape so Claude Code's plugin loader injects it at session start.
//
// Side-effect log files (written under <projectRoot>/context/.locks/):
//   shadowed_by.log   — NDJSON, one entry per cross-tier ID collision
//   truncation.log    — NDJSON, one entry per cap-overflow truncation pass
// These mirror what cross-tier debug commands (`cmk config --show-origin`,
// future) will read from. The .locks/ dir is created on demand.
//
// Uses shared modules per CLAUDE.md "Shared modules" rule:
//   tier-paths.mjs    — resolveTierRoot, SCRATCHPADS_BY_TIER, ID_PATTERN
//   audit-log.mjs     — nowIso (consistent ISO formatter)

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  appendFileSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { SCRATCHPADS_BY_TIER, resolveTierRoot } from './tier-paths.mjs';
import { nowIso } from './audit-log.mjs';

const DEFAULT_CAP_BYTES = 10 * 1024;
const HOOK_EVENT_NAME = 'SessionStart';

// Match any line containing a `(P-XXXXXXXX)`-shaped citation id. Looser
// than ID_PATTERN on purpose — alphabet-validation is the writer's job;
// here we just want to recognize "any line that LOOKS like it carries a
// cited bullet" so we can dedup across tiers.
const ID_TOKEN_RE = /\(([PUL])-([A-Za-z0-9]{8})\)/;

// Tier-discovery + which files contribute to the snapshot for each tier.
// Order matters: this is the iteration order, also the snapshot output
// order (highest-priority first per design §7.1).
const TIER_ORDER = ['L', 'P', 'U'];

const TIER_LABELS = {
  L: 'local',
  P: 'project',
  U: 'user',
};

// Per-tier reading plan. The hook reads the scratchpads allowed at that
// tier (per SCRATCHPADS_BY_TIER) plus the tier's INDEX file, plus — for
// the project tier — the most recent rolling-window day file.
function plannedFilesForTier(tier, tierRoot) {
  const files = [];
  for (const name of SCRATCHPADS_BY_TIER[tier]) {
    files.push(join(tierRoot, name));
  }
  // INDEX: P/L use memory/INDEX.md; U uses fragments/INDEX.md (per
  // resolveFactDir asymmetry in tier-paths.mjs).
  const indexDir = tier === 'U' ? 'fragments' : 'memory';
  files.push(join(tierRoot, indexDir, 'INDEX.md'));
  if (tier === 'P') {
    const sessionsDir = join(tierRoot, 'sessions');
    const latest = latestDaySession(sessionsDir);
    if (latest) files.push(latest);
  }
  return files;
}

function latestDaySession(sessionsDir) {
  if (!existsSync(sessionsDir)) return null;
  const candidates = readdirSync(sessionsDir).filter((n) =>
    /^today-\d{4}-\d{2}-\d{2}\.md$/.test(n),
  );
  if (candidates.length === 0) return null;
  candidates.sort();
  return join(sessionsDir, candidates[candidates.length - 1]);
}

// Walk up from `cwd` looking for a directory with a `context/` child. The
// kit's project-tier root convention is `<repo>/context/`; the walk-up
// matches `git rev-parse --show-toplevel`'s semantics for nested invocations
// (a hook may fire while Claude Code's cwd is in a sub-package).
function discoverProjectRoot(cwd) {
  let dir = cwd;
  // Defensive bound: walk no more than 64 ancestors.
  for (let i = 0; i < 64; i++) {
    if (existsSync(join(dir, 'context'))) return dir;
    const parent = join(dir, '..');
    const norm = statSync(parent).isDirectory() ? parent : null;
    if (!norm || norm === dir) break;
    // Stop at the filesystem root.
    if (/^[A-Za-z]:\\?$|^\/$/.test(dir)) break;
    dir = parent;
  }
  // Fall back to `cwd` — the per-tier readers will return empty for
  // absent dirs, so this stays safe.
  return cwd;
}

function tierDirExists(tier, tierRoot) {
  return existsSync(tierRoot) && statSync(tierRoot).isDirectory();
}

// Read the snapshot-eligible content for one tier as a single string. If
// no tier files exist (or the tier dir itself is absent), returns ''. The
// per-file content is wrapped in a fenced header so the snapshot is
// self-describing to whoever reads Claude's context window.
function readTierBlock(tier, tierRoot) {
  if (!tierDirExists(tier, tierRoot)) return '';
  const sections = [];
  for (const path of plannedFilesForTier(tier, tierRoot)) {
    if (!existsSync(path)) continue;
    let body;
    try {
      body = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    if (body.trim() === '') continue;
    sections.push(body);
  }
  if (sections.length === 0) return '';
  const header = `<!-- cmk: ${TIER_LABELS[tier]} tier (${tier}) -->`;
  return [header, ...sections].join('\n\n').replace(/\n+$/, '') + '\n';
}

// Strip duplicate-ID lines from a tier block. Mutates by returning a new
// string. For each id in `seenIds`, find the line containing the id and
// the immediately-following line (if it looks like an HTML-comment
// provenance) and drop both. Records a shadow event for each id stripped.
function stripShadowedIds(tier, block, seenIds, shadowedEvents, ts) {
  if (!block) return block;
  const lines = block.split('\n');
  const kept = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(ID_TOKEN_RE);
    if (m) {
      const id = `${m[1]}-${m[2]}`;
      const prior = seenIds.get(id);
      if (prior && prior !== tier) {
        // Drop this line + (if next is the indented provenance) the next.
        const next = lines[i + 1];
        const isComment =
          typeof next === 'string' && /^\s*<!--.*-->\s*$/.test(next);
        // Record the shadowing once per (id, shadowed-tier).
        let event = shadowedEvents.find((e) => e.id === id);
        if (!event) {
          event = {
            ts,
            id,
            winner_tier: prior,
            shadowed_tiers: [],
          };
          shadowedEvents.push(event);
        }
        if (!event.shadowed_tiers.includes(tier)) {
          event.shadowed_tiers.push(tier);
        }
        i += isComment ? 2 : 1;
        continue;
      }
      // First sighting — claim it for this tier.
      if (!prior) seenIds.set(id, tier);
    }
    kept.push(lines[i]);
    i++;
  }
  return kept.join('\n');
}

function writeNdjsonLine(logPath, entry) {
  mkdirSync(join(logPath, '..'), { recursive: true });
  appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
}

// Drop entire tier blocks from the tail (lowest-priority first) until the
// concatenated snapshot fits within capBytes. Each drop emits one
// truncation event.
function enforceCap(orderedBlocks, capBytes, ts) {
  const events = [];
  // Pre-compute byte sizes so the loop doesn't reassemble repeatedly.
  let bytes = orderedBlocks.reduce(
    (sum, b) => sum + Buffer.byteLength(b.text, 'utf8'),
    0,
  );
  // Drop from the END (lowest priority is last in TIER_ORDER → last in the
  // ordered block list).
  while (bytes > capBytes && orderedBlocks.length > 0) {
    const dropped = orderedBlocks.pop();
    bytes -= Buffer.byteLength(dropped.text, 'utf8');
    let event = events[events.length - 1];
    if (!event) {
      event = { ts, capBytes, dropped_tiers: [] };
      events.push(event);
    }
    event.dropped_tiers.push(dropped.tier);
  }
  return { blocks: orderedBlocks, truncationEvents: events };
}

export function injectContext({ cwd, userDir, now, capBytes } = {}) {
  const ts = now ?? nowIso();
  const cap = typeof capBytes === 'number' ? capBytes : DEFAULT_CAP_BYTES;
  const startCwd = cwd ?? process.cwd();
  const projectRoot = discoverProjectRoot(startCwd);
  const resolvedUserDir =
    userDir ??
    process.env.MEMORY_KIT_USER_DIR ??
    join(homedir(), '.claude-memory-kit');

  // 1. Read each tier's block in priority order.
  const rawBlocks = TIER_ORDER.map((tier) => {
    const tierRoot =
      tier === 'U'
        ? resolvedUserDir
        : resolveTierRoot({ tier, projectRoot, userDir: resolvedUserDir });
    return { tier, tierRoot, text: readTierBlock(tier, tierRoot) };
  }).filter((b) => b.text !== '');

  // 2. Dedup IDs across tiers (highest-priority first).
  const seenIds = new Map();
  const shadowedEvents = [];
  for (const block of rawBlocks) {
    block.text = stripShadowedIds(
      block.tier,
      block.text,
      seenIds,
      shadowedEvents,
      ts,
    );
  }

  // 3. Cap enforcement: drop whole tier blocks from the tail until within
  // capBytes. Each drop emits one truncation event.
  const { blocks: keptBlocks, truncationEvents } = enforceCap(
    rawBlocks,
    cap,
    ts,
  );

  // 4. Concatenate.
  const snapshot = keptBlocks.map((b) => b.text).join('\n');

  // 5. Persist side-effect logs under <projectRoot>/context/.locks/. We
  // only write the project-tier .locks file (which is the well-known
  // location for cross-tier debug; mirrors audit.log placement).
  const locksDir = join(projectRoot, 'context', '.locks');
  if (shadowedEvents.length > 0) {
    for (const event of shadowedEvents) {
      writeNdjsonLine(join(locksDir, 'shadowed_by.log'), event);
    }
  }
  if (truncationEvents.length > 0) {
    for (const event of truncationEvents) {
      writeNdjsonLine(join(locksDir, 'truncation.log'), event);
    }
  }

  // 6. Emit the Anthropic SessionStart hook output shape (design §5.1 +
  // Anthropic hook protocol). When the snapshot is empty, we still emit
  // the shape so downstream tooling can rely on the field's presence.
  const hookOutput = {
    hookSpecificOutput: {
      hookEventName: HOOK_EVENT_NAME,
      additionalContext: snapshot,
    },
  };

  return {
    snapshot,
    hookOutput,
    shadowedEvents,
    truncationEvents,
    bytes: Buffer.byteLength(snapshot, 'utf8'),
  };
}
