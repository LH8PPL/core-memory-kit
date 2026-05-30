// Release mechanic — turn the hand-edited CHANGELOG `## [Unreleased]` section
// into a finalized release. Lior 2026-05-30: "put everything in a file and that
// creates everything from that." One file (CHANGELOG.md `[Unreleased]`) is the
// single source you edit during PRs; this assembles the finalized changelog
// section + the bumped version + the GitHub release notes from it.
//
// PURE function (text in → text out) so it's boundary-testable without fs; the
// thin CLI wrapper (scripts/release.mjs) does the file writes + package.json bump.
//
// Upgrade path (documented, not built): if the kit ever gets many parallel
// contributors and this one `[Unreleased]` section starts merge-conflicting,
// swap the INPUT to per-PR `.changes/*.yaml` fragment files and feed their
// concatenation in here as `changelogText`'s unreleased body — the
// assembler/output contract stays the same. We adopt that ceremony only when the
// conflict problem it solves actually exists.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// Reuse the linear, ReDoS-safe comment stripper (NOT a `/<!--.*-->/` regex —
// that trips CodeQL js/polynomial-redos + js/incomplete-multi-character-sanitization).
import { stripHtmlComments } from '../../packages/canonicalize/src/index.mjs';

const UNRELEASED_RE = /^##\s*\[Unreleased\]\s*$/im;
const VERSION_HEADING_RE = /^##\s*\[\d+\.\d+\.\d+\]/m;

// The reset skeleton written back as the new empty [Unreleased].
const UNRELEASED_SKELETON = [
  '## [Unreleased]',
  '',
  '<!-- New user-facing capabilities land here in the same PR that ships them (CLAUDE.md "Document user-facing capabilities" rule). -->',
  '',
].join('\n');

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  if (!m) throw new Error(`not a semver version: ${JSON.stringify(v)}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function bumpSemver(current, bump) {
  const [maj, min, pat] = parseSemver(current);
  switch (bump) {
    case 'major':
      return `${maj + 1}.0.0`;
    case 'minor':
      return `${maj}.${min + 1}.0`;
    case 'patch':
      return `${maj}.${min}.${pat + 1}`;
    default:
      throw new Error(`bump must be major|minor|patch (got ${JSON.stringify(bump)})`);
  }
}

function isGreater(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false; // equal
}

/**
 * Assemble a release from the CHANGELOG `[Unreleased]` section.
 *
 * @param {object} opts
 * @param {string} opts.changelogText  full CHANGELOG.md contents
 * @param {string} opts.currentVersion current package version (e.g. '0.1.2')
 * @param {'major'|'minor'|'patch'} [opts.bump] semver bump (ignored if `version` given)
 * @param {string} [opts.version] explicit target version (overrides `bump`)
 * @param {string} [opts.date]    ISO date for the heading (default: today, UTC)
 * @returns {{newVersion: string, changelog: string, notes: string}}
 */
export function assembleRelease({ changelogText, currentVersion, bump, version, date } = {}) {
  if (typeof changelogText !== 'string' || !changelogText) {
    throw new Error('assembleRelease: changelogText (string) is required');
  }
  if (!currentVersion) throw new Error('assembleRelease: currentVersion is required');

  const newVersion = version ? String(version).trim() : bumpSemver(currentVersion, bump);
  parseSemver(newVersion); // validate shape
  if (!isGreater(newVersion, currentVersion)) {
    throw new Error(
      `release version must be greater (increasing) than current ${currentVersion}; got ${newVersion}`,
    );
  }
  const isoDate = date ?? new Date().toISOString().slice(0, 10);

  // Locate the [Unreleased] heading.
  const unreleasedMatch = UNRELEASED_RE.exec(changelogText);
  if (!unreleasedMatch) {
    throw new Error('assembleRelease: no "## [Unreleased]" section found in CHANGELOG');
  }
  const unreleasedHeadingStart = unreleasedMatch.index;
  const bodyStart = unreleasedHeadingStart + unreleasedMatch[0].length;

  // The body runs until the next "## [x.y.z]" version heading (or EOF).
  const after = changelogText.slice(bodyStart);
  const nextHeading = VERSION_HEADING_RE.exec(after);
  const bodyEnd = nextHeading ? bodyStart + nextHeading.index : changelogText.length;

  const rawBody = changelogText.slice(bodyStart, bodyEnd);

  // Notes = body with HTML guidance comments stripped, trimmed.
  const notes = stripHtmlComments(rawBody).replace(/\n{3,}/g, '\n\n').trim();

  // Refuse to cut a release with no real entries (a bullet line). The v0.2
  // summary prose alone is not a release.
  if (!/^[-*]\s+\S/m.test(notes)) {
    throw new Error('assembleRelease: [Unreleased] has no entries — nothing to release');
  }

  const head = changelogText.slice(0, unreleasedHeadingStart);
  const tail = changelogText.slice(bodyEnd); // the prior releases (## [x.y.z] …)

  const newSection = `## [${newVersion}] — ${isoDate}\n\n${notes}\n`;
  const assembled = `${head}${UNRELEASED_SKELETON}\n${newSection}\n${tail}`;
  // Normalize accidental >2 blank-line runs introduced by the splice.
  const changelog = assembled.replace(/\n{4,}/g, '\n\n\n');

  return { newVersion, changelog, notes };
}

/**
 * Extract the release-notes body for an already-finalized version section
 * (`## [X.Y.Z] — date`) from CHANGELOG.md. Used by CI (publish.yml) on a tag
 * push to create the GitHub Release without hand-writing notes again.
 *
 * @returns {string} the section body (entries only; heading + HTML comments removed)
 */
export function extractReleaseNotes(changelogText, version) {
  if (typeof changelogText !== 'string') throw new Error('extractReleaseNotes: changelogText required');
  parseSemver(version);
  const esc = version.replace(/\./g, '\\.');
  const headingRe = new RegExp(`^##\\s*\\[${esc}\\][^\\n]*$`, 'm');
  const m = headingRe.exec(changelogText);
  if (!m) throw new Error(`extractReleaseNotes: no "## [${version}]" section found`);
  const bodyStart = m.index + m[0].length;
  const after = changelogText.slice(bodyStart);
  const next = /^##\s*\[/m.exec(after);
  const body = next ? after.slice(0, next.index) : after;
  return stripHtmlComments(body).replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * fs orchestrator behind `npm run release`: read CHANGELOG.md + the cli
 * package.json under `repoRoot`, assemble the release, and (unless `dry`)
 * write both back — the finalized CHANGELOG + the bumped version in lockstep.
 * Separated from the CLI so the State door (the writes) is testable against a
 * sandbox repoRoot.
 *
 * @returns {{newVersion, notes, changelogPath, pkgPath, wrote: boolean}}
 */
export function prepareReleaseFiles({ repoRoot, target, date, dry = false } = {}) {
  if (!repoRoot) throw new Error('prepareReleaseFiles: repoRoot is required');
  if (!target) throw new Error('prepareReleaseFiles: target (patch|minor|major|X.Y.Z) is required');
  const changelogPath = join(repoRoot, 'CHANGELOG.md');
  const pkgPath = join(repoRoot, 'packages', 'cli', 'package.json');

  const changelogText = readFileSync(changelogPath, 'utf8');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const isExplicit = /^\d+\.\d+\.\d+$/.test(target);

  const { newVersion, changelog, notes } = assembleRelease({
    changelogText,
    currentVersion: pkg.version,
    bump: isExplicit ? undefined : target,
    version: isExplicit ? target : undefined,
    date,
  });

  if (!dry) {
    writeFileSync(changelogPath, changelog, 'utf8');
    pkg.version = newVersion;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  }

  return { newVersion, notes, changelogPath, pkgPath, wrote: !dry };
}
