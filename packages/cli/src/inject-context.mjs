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
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { SCRATCHPADS_BY_TIER, resolveTierRoot } from './tier-paths.mjs';
import { nowIso } from './audit-log.mjs';
import { detectStaleness } from './lazy-compress.mjs';

// 13,000 bytes = sum of all per-file caps (12,275 from Task 12/14) + 725
// bytes of headroom for inter-tier markers + future modest growth.
// Coordinated with TIER_BUDGETS below per design §7.1 "Snapshot cap
// coordination rule" (2026-05-26 amendment). Raising this requires
// raising one or more TIER_BUDGETS to consume the new headroom; see
// scripts/validate-template.mjs for the build-time invariant check.
const DEFAULT_CAP_BYTES = 13_000;
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

// Per-tier byte budgets (design §7.1, 2026-05-26 coordination amendment).
// Each tier truncates section-by-section to its own budget BEFORE the
// snapshot's total-cap drop step runs. Each budget = EXACT SUM of
// per-file caps in that tier (Task 12/14):
//
//   L = 3000  (machine-paths.md 1500 + overrides.md 1500)
//   P = 4300  (SOUL.md 1800 + MEMORY.md 2500)
//   U = 4975  (USER.md 1375 + HABITS.md 1800 + LESSONS.md 1800)
//   Σ = 12,275 (fits the 13,000 DEFAULT_CAP_BYTES with 725-byte slack)
//
// This is THE STRUCTURAL FIX from PR-25's user-tier truncation finding.
// Per-file caps were specified independently from snapshot cap and
// per-tier budgets in v0.1.0's initial spec; the sums didn't compose,
// so files at their legal caps blew the snapshot. Now per-tier budgets
// derive from per-file caps; snapshot cap derives from the sum.
// scripts/validate-template.mjs asserts this composition rule on every
// `npm test` run so future per-file-cap changes can't silently break it.
const TIER_BUDGETS = Object.freeze({
  L: 3000,
  P: 4300,
  U: 4975,
});

// Per-tier reading plan. The hook reads the scratchpads allowed at that
// tier (per SCRATCHPADS_BY_TIER) plus — for the project tier — the most
// recent rolling-window day file.
//
// INDEX.md is deliberately NOT in the snapshot (#R, 2026-05-30). It is a
// pointer/reference doc that self-declares "NOT auto-loaded at session
// start" in its own template body — injecting it both violated that
// contract and pushed ~2 KB of reference prose into Claude's context,
// crowding out real facts. It stays on disk for lookup via `cmk search` /
// the granular archive; it is not session-start content.
function plannedFilesForTier(tier, tierRoot) {
  const files = [];
  for (const name of SCRATCHPADS_BY_TIER[tier]) {
    files.push(join(tierRoot, name));
  }
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

// The all-zero sha1 is the kit's template-seed sentinel: every scaffolded
// placeholder bullet (in machine-paths/overrides/SOUL/USER/HABITS/LESSONS)
// carries `sha1: 0000…0000` + `at: 2020-01-01T…`. A real captured fact
// always has a real content sha1. We use this to distinguish "scaffolding
// the user never replaced" from "a fact worth injecting".
const SEED_SHA1_RE = /sha1:\s*0{40}/;

// All HTML-comment handling below uses STRING SCANNING (indexOf/startsWith),
// never a regex tag-filter. Regex-based HTML-comment stripping is fragile by
// nature (it can't see newlines, leaves partial `<!--`, etc. — flagged by
// CodeQL's js/bad-tag-filter). String scanning is both more robust and not a
// tag-filter, so it sidesteps that whole class.

// True if `line`, ignoring surrounding whitespace, is exactly one self-
// contained HTML comment (`<!-- … -->`) — e.g. a per-bullet provenance line.
function isCommentOnlyLine(line) {
  if (typeof line !== 'string') return false;
  const t = line.trim();
  return t.startsWith('<!--') && t.endsWith('-->') && t.length >= 7;
}

// Remove every self-contained `<!-- … -->` span WITHIN a single line, by
// scanning for delimiter pairs. An unterminated `<!--` (no `-->` on this
// line) is left in place for the multi-line state machine to handle.
function stripInlineComments(line) {
  let out = '';
  let i = 0;
  for (;;) {
    const open = line.indexOf('<!--', i);
    if (open === -1) return out + line.slice(i);
    const close = line.indexOf('-->', open + 4);
    if (close === -1) return out + line.slice(i); // unterminated; leave it
    out += line.slice(i, open);
    i = close + 3;
  }
}

// Is `bulletLine` a placeholder/seed bullet that should NOT be injected?
// Primary signal: a following provenance comment carrying the all-zero seed
// sha1 (every scaffolded template bullet has it; a real captured fact never
// does). Secondary: the `(example)` marker — but ONLY in the template's
// exact `(P-XXXXXXXX) (example) …` shape (right after the citation id), so a
// real fact whose text merely mentions "(example)" is not mis-dropped.
function isSeedBullet(bulletLine, nextLine) {
  if (/^\s*-\s+\([PUL]-[A-Za-z0-9]{8}\)\s+\(example\)/.test(bulletLine)) {
    return true;
  }
  const prov = isCommentOnlyLine(nextLine) ? nextLine : '';
  return SEED_SHA1_RE.test(prov);
}

// Remove HTML comments robustly, including the kit templates' multi-line
// format-explanation headers that ILLUSTRATIVELY embed a single-line
// `<!-- source… -->` example inside the outer `<!-- … -->` block (a naive
// "first <!-- to first -->" pass closes on that inner `-->` and orphans the
// tail). We strip inline comments first (killing the nested one) and only
// then walk the now-cleanly-delimited multi-line blocks. All string-scan.
function stripHtmlComments(text) {
  // Pass 1 — remove every self-contained `<!-- … -->` on a single line.
  const lines = text.split('\n').map(stripInlineComments);
  // Pass 2 — remove multi-line blocks (each now free of any inner `-->`).
  const out = [];
  let inBlock = false;
  for (let line of lines) {
    if (inBlock) {
      const close = line.indexOf('-->');
      if (close === -1) continue; // still inside the block; drop the line
      inBlock = false;
      line = line.slice(close + 3);
    }
    const open = line.indexOf('<!--');
    if (open !== -1) {
      inBlock = true;
      line = line.slice(0, open);
    }
    if (line.trim() !== '' || out.length === 0 || out[out.length - 1] !== '') {
      out.push(line.replace(/[ \t]+$/, ''));
    }
  }
  return out.join('\n');
}

// Clean a scratchpad body for INJECTION (not for on-disk storage — the
// files keep their human-editing headers). Self-test finding #R: the raw
// bodies are ~70% template-comment noise + placeholder seed bullets that
// bury (and crowd out) the real captured facts, so the model concludes
// "no real facts populated yet". This strips:
//   1. placeholder seed bullets (all-zero sha1 / `(example)`) + their
//      provenance comment line, and
//   2. ALL remaining `<!-- -->` comments (multi-line format-explanation
//      headers AND per-bullet provenance — the fact text + its `(P-…)`
//      citation id carry everything the model needs to read & cite).
// Whitespace is normalized so stripped regions don't leave holes.
//
// Known limitation (rare): a captured fact whose TEXT contains a literal
// `<!--`/`-->` (e.g. a note about HTML/templating) has that fragment
// stripped from the INJECTED view. The on-disk fact and the search index
// are unaffected — only the session-start snapshot loses the literal
// comment markers. Accepted as a rare edge vs. the cost of distinguishing
// real comments from comment-shaped fact text.
function cleanScratchpadBody(body) {
  // Normalize CRLF so user-edited (Windows) scratchpads don't leave stray
  // \r after comment/seed stripping.
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      /^\s*-\s/.test(line) &&
      ID_TOKEN_RE.test(line) &&
      isSeedBullet(line, lines[i + 1])
    ) {
      if (isCommentOnlyLine(lines[i + 1])) i++;
      continue;
    }
    kept.push(line);
  }
  // Step 2 — strip all remaining comments (format headers + real-bullet
  // provenance), then normalize whitespace.
  return stripHtmlComments(kept.join('\n'))
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

// After cleaning, does a body carry any real content — i.e. a non-blank
// line that isn't a markdown heading? A body of only headings (every
// bullet was a stripped seed) is pure scaffolding and must NOT contribute
// a tier block (otherwise the model sees an empty "## …" skeleton).
function hasRealContent(cleaned) {
  return cleaned
    .split('\n')
    .some((l) => l.trim() !== '' && !/^#{1,6}\s/.test(l));
}

// Read the snapshot-eligible content for one tier as a single string. If
// no tier files exist (or the tier dir itself is absent), returns ''. Each
// file body is cleaned for injection (see cleanScratchpadBody); files that
// reduce to scaffolding-only contribute nothing, and a tier whose every
// file is scaffolding-only is excluded entirely (no header, no skeleton).
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
    const cleaned = cleanScratchpadBody(body);
    if (!hasRealContent(cleaned)) continue;
    sections.push(cleaned);
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

// Truncate one tier block to fit its budget by dropping whole `## `
// sections from the END. Section-granular (not bullet- or byte-
// granular) per design §7.1.1: structural shape preservation matters
// more than maximum byte utilization. Returns { text, sectionsDropped,
// preBytes, postBytes }.
//
// Algorithm: split into sections delimited by `## ` (level-2 markdown
// heading) anywhere in the tier block. Anything BEFORE the first `## `
// (file headers, comments, top-level title) is the "preamble" and is
// always kept. Sections are popped from the END until the kept text
// fits the budget OR no sections remain (preamble-only). If the
// preamble alone exceeds budget, we return it unchanged — that's a
// configuration problem (preamble shouldn't be that big) but
// preferable to dropping the file header.
function truncateTierToBudget(blockText, budget) {
  const preBytes = Buffer.byteLength(blockText, 'utf8');
  if (preBytes <= budget) {
    return { text: blockText, sectionsDropped: 0, preBytes, postBytes: preBytes };
  }
  // Find every `## ` heading position. Each section runs from one
  // heading line to the next (or EOF).
  const lines = blockText.split('\n');
  const headingIdxs = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) headingIdxs.push(i);
  }
  if (headingIdxs.length === 0) {
    // No sections — nothing to drop. Return as-is.
    return { text: blockText, sectionsDropped: 0, preBytes, postBytes: preBytes };
  }
  // Build section boundaries: [start..end) for each section.
  const sections = headingIdxs.map((startIdx, i) => ({
    startIdx,
    endIdx: i + 1 < headingIdxs.length ? headingIdxs[i + 1] : lines.length,
  }));
  // Pop from the end while over budget.
  let droppedCount = 0;
  let keptEndLine = lines.length;
  while (sections.length > 0) {
    const candidateText = lines.slice(0, keptEndLine).join('\n');
    if (Buffer.byteLength(candidateText, 'utf8') <= budget) break;
    const last = sections.pop();
    keptEndLine = last.startIdx;
    droppedCount++;
  }
  const finalText = lines.slice(0, keptEndLine).join('\n');
  return {
    text: finalText,
    sectionsDropped: droppedCount,
    preBytes,
    postBytes: Buffer.byteLength(finalText, 'utf8'),
  };
}

// Enforce per-tier byte budgets (design §7.1.1) by dropping whole `## `
// sections from each tier block's tail. Each truncation emits a
// tier_truncated_to_budget NDJSON event.
//
// AFTER per-tier truncation, if the SUM of kept tier blocks still
// exceeds the snapshot cap (configuration error: Σ budgets > cap),
// fall back to the legacy whole-tier-drop behavior — drops the
// lowest-priority tier wholesale, logged as a dropped_tiers event.
// This shouldn't fire under the documented budget table (1500+4500+
// 4000 = 10000 ≤ 10240 default cap), but the safety net is cheap.
function enforceCap(orderedBlocks, capBytes, ts) {
  const tierEvents = [];
  // Step 1: per-tier budget enforcement (section-granular).
  for (const block of orderedBlocks) {
    const budget = TIER_BUDGETS[block.tier];
    if (typeof budget !== 'number') continue; // unknown tier; pass through
    const r = truncateTierToBudget(block.text, budget);
    if (r.sectionsDropped > 0) {
      tierEvents.push({
        ts,
        event: 'tier_truncated_to_budget',
        tier: block.tier,
        budget,
        pre_bytes: r.preBytes,
        post_bytes: r.postBytes,
        sections_dropped: r.sectionsDropped,
      });
      block.text = r.text;
    }
  }

  // Step 2: total-cap fallback. Drop whole tier blocks from the tail
  // until under capBytes. Shouldn't fire in normal config; the
  // dropped_tiers shape is preserved for back-compat.
  const dropEvents = [];
  let bytes = orderedBlocks.reduce(
    (sum, b) => sum + Buffer.byteLength(b.text, 'utf8'),
    0,
  );
  while (bytes > capBytes && orderedBlocks.length > 0) {
    const dropped = orderedBlocks.pop();
    bytes -= Buffer.byteLength(dropped.text, 'utf8');
    let event = dropEvents[dropEvents.length - 1];
    if (!event) {
      event = { ts, capBytes, dropped_tiers: [] };
      dropEvents.push(event);
    }
    event.dropped_tiers.push(dropped.tier);
  }

  return {
    blocks: orderedBlocks,
    truncationEvents: [...tierEvents, ...dropEvents],
  };
}

/**
 * Detached fire-and-forget spawn of the lazy-compress bin. Per design
 * §8.2.2 — non-blocking, hook returns within its 500ms budget while the
 * child runs ambiently. The bin is PATH-resolved when npm-installed
 * globally (`cmk-compress-lazy` declared in package.json `bin:`).
 *
 * Exposed so injectContext can override via dependency injection in tests
 * (testSpawnLazy parameter) — production callers pass nothing.
 */
function spawnLazyCompress(projectRoot) {
  try {
    // The lazy-compress child intentionally outlives this hook process;
    // parent-side timeout is incorrect by design — the child carries its
    // own internal timeout via runLazyCompress → daily-distill /
    // weekly-curate → HaikuViaAnthropicApi.compress({timeoutMs: 50_000}).
    // shell:true so the Windows .cmd shim is found via PATH (same pattern
    // register-crons.mjs uses for cmk-daily-distill).
    // spawn-discipline: ignore detached-fire-and-forget per design §8.5 — same posture as capture-turn.mjs's auto-extract spawn (Task 23).
    const child = spawn('cmk-compress-lazy', [], {
      detached: true,
      stdio: 'ignore',
      shell: true,
      cwd: projectRoot,
      windowsHide: true,
      env: { ...process.env, CMK_PROJECT_DIR: projectRoot },
    });
    child.unref();
    return { spawned: true, pid: child.pid };
  } catch (err) {
    // M2 fix: emit a Door-4 NDJSON entry on spawn failure (PATH miss,
    // EACCES) so users have observability when lazy-compress can't
    // fire. Without this, the only signal is the lazyTrigger.spawned
    // field on the return struct, which Claude Code's hook subsystem
    // doesn't persist. Best-effort write — if the log directory
    // doesn't exist or is unwritable, silently continue (we don't want
    // the hook to fail because we couldn't log a spawn failure).
    try {
      const locksDir = join(projectRoot, 'context', '.locks');
      mkdirSync(locksDir, { recursive: true });
      appendFileSync(
        join(locksDir, 'lazy-compress.log'),
        JSON.stringify({
          ts: nowIso(),
          scope: 'lazy-compress',
          action: 'spawn-failed',
          reason: 'spawn-failed',
          error: err?.message ?? String(err),
        }) + '\n',
        'utf8',
      );
    } catch {
      // best-effort
    }
    return { spawned: false, reason: 'spawn-failed', error: err?.message ?? String(err) };
  }
}

export function injectContext({
  cwd,
  userDir,
  now,
  capBytes,
  // Test-only injection point per spawn-discipline (the production path
  // uses spawnLazyCompress directly). Tests pass a fake to assert
  // "lazy-compress was/was-not triggered" without touching the host.
  testSpawnLazy,
} = {}) {
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

  // 6. Task 35 lazy-compress trigger: cheap (<5ms) staleness check.
  // When non-fresh + non-cron-active, detached-spawn `cmk-compress-lazy`
  // so the hook can return within its 500ms NFR-1 budget while the
  // child does the rollup work cron would have done.
  let lazyTrigger = null;
  try {
    const verdict = detectStaleness({ projectRoot, now: ts });
    lazyTrigger = { verdict: verdict.action, reason: verdict.reason };
    if (verdict.action === 'stale-daily' || verdict.action === 'stale-weekly') {
      const spawner = typeof testSpawnLazy === 'function' ? testSpawnLazy : spawnLazyCompress;
      const spawnResult = spawner(projectRoot);
      lazyTrigger = { ...lazyTrigger, ...spawnResult };
    }
  } catch (err) {
    // detectStaleness should be defensive; if it throws, log + continue.
    lazyTrigger = { verdict: 'error', error: err?.message ?? String(err) };
  }

  // 7. Emit the Anthropic SessionStart hook output shape (design §5.1 +
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
    lazyTrigger,
    bytes: Buffer.byteLength(snapshot, 'utf8'),
  };
}
