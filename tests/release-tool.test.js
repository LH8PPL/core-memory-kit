// @doors: 1
// Door 2 N/A: assembleRelease is a PURE function (text in → text out); the fs
//   write + package.json bump live in the thin CLI wrapper (scripts/release.mjs),
//   exercised by the release-verification suite + a real release.
// Door 3 N/A: no subprocess at this boundary.
// Door 4 N/A: no NDJSON observability.
// Door 5 N/A: no message queue.
//
// Tests for the release mechanic (Lior 2026-05-30: "put everything in a file and
// that creates everything from that"). assembleRelease() turns the hand-edited
// CHANGELOG `## [Unreleased]` section into a finalized `## [X.Y.Z] — date`
// section + a fresh empty [Unreleased] + the extracted GitHub release notes,
// and computes the bumped semver. One file in → CHANGELOG + version + notes out.

import { describe, it, expect } from 'vitest';
import { assembleRelease, extractReleaseNotes } from '../scripts/lib/changelog-release.mjs';

const SAMPLE = `# Changelog

All notable changes to claude-memory-kit are documented in this file.

## [Unreleased]

v0.2 — automatic memory + "Claude stays consistent."

<!-- New user-facing capabilities land here per the CLAUDE.md rule. -->

### Added

- **persona:** \`cmk persona generate\` synthesizes a cross-project persona ([#82](https://github.com/LH8PPL/claude-memory-kit/pull/82)).

### Fixed

- **conflict-queue:** trust mis-read on indented provenance comments ([#82](https://github.com/LH8PPL/claude-memory-kit/pull/82)).

## [0.1.2] — 2026-05-30

### Added

- \`cmk remember\` ([#74](https://github.com/LH8PPL/claude-memory-kit/pull/74)).
`;

describe('assembleRelease() — generate a release from the [Unreleased] section', () => {
  it('finalizes [Unreleased] into the bumped version + date, keeps history', () => {
    const r = assembleRelease({
      changelogText: SAMPLE,
      currentVersion: '0.1.2',
      bump: 'minor',
      date: '2026-06-15',
    });

    expect(r.newVersion).toBe('0.2.0');
    // New finalized section exists with version + ISO date.
    expect(r.changelog).toMatch(/## \[0\.2\.0\] — 2026-06-15/);
    // It carries the real entries.
    expect(r.changelog).toMatch(/cmk persona generate/);
    expect(r.changelog).toMatch(/conflict-queue.*indented provenance/);
    // Prior release is preserved untouched, below the new one.
    expect(r.changelog.indexOf('## [0.2.0]')).toBeLessThan(r.changelog.indexOf('## [0.1.2]'));
    expect(r.changelog).toMatch(/## \[0\.1\.2\] — 2026-05-30/);
  });

  it('resets [Unreleased] to a fresh empty skeleton above the new release', () => {
    const r = assembleRelease({ changelogText: SAMPLE, currentVersion: '0.1.2', bump: 'minor', date: '2026-06-15' });
    // A fresh [Unreleased] still exists...
    expect(r.changelog).toMatch(/## \[Unreleased\]/);
    // ...and it sits ABOVE the new version...
    expect(r.changelog.indexOf('## [Unreleased]')).toBeLessThan(r.changelog.indexOf('## [0.2.0]'));
    // ...and it no longer carries the shipped entries (they moved down).
    const unreleased = r.changelog.slice(
      r.changelog.indexOf('## [Unreleased]'),
      r.changelog.indexOf('## [0.2.0]'),
    );
    expect(unreleased).not.toMatch(/cmk persona generate/);
  });

  it('emits release notes = the new section body, WITHOUT the changelog HTML guidance comment', () => {
    const r = assembleRelease({ changelogText: SAMPLE, currentVersion: '0.1.2', bump: 'minor', date: '2026-06-15' });
    expect(r.notes).toMatch(/cmk persona generate/);
    expect(r.notes).toMatch(/Claude stays consistent/); // the v0.2 summary line is kept
    expect(r.notes).not.toMatch(/<!--/); // guidance comment stripped from notes
    expect(r.notes).not.toMatch(/## \[/); // notes are the body only, no heading
  });

  it('supports patch + major bumps and an explicit version', () => {
    expect(assembleRelease({ changelogText: SAMPLE, currentVersion: '0.1.2', bump: 'patch', date: '2026-06-15' }).newVersion).toBe('0.1.3');
    expect(assembleRelease({ changelogText: SAMPLE, currentVersion: '0.1.2', bump: 'major', date: '2026-06-15' }).newVersion).toBe('1.0.0');
    expect(assembleRelease({ changelogText: SAMPLE, currentVersion: '0.1.2', version: '0.5.0', date: '2026-06-15' }).newVersion).toBe('0.5.0');
  });

  it('refuses to release when [Unreleased] has no real entries (only the placeholder comment)', () => {
    const empty = `# Changelog

## [Unreleased]

<!-- nothing here yet -->

## [0.1.2] — 2026-05-30

- prior.
`;
    expect(() => assembleRelease({ changelogText: empty, currentVersion: '0.1.2', bump: 'minor', date: '2026-06-15' }))
      .toThrow(/no.*entries|nothing to release/i);
  });

  it('rejects a non-increasing explicit version', () => {
    expect(() => assembleRelease({ changelogText: SAMPLE, currentVersion: '0.1.2', version: '0.1.2', date: '2026-06-15' }))
      .toThrow(/must be greater|increasing/i);
  });
});

describe('extractReleaseNotes() — CI builds the GitHub release from CHANGELOG', () => {
  it('returns the body of an already-finalized version section', () => {
    const notes = extractReleaseNotes(SAMPLE, '0.1.2');
    expect(notes).toMatch(/cmk remember/);
    expect(notes).not.toMatch(/## \[/); // body only
    expect(notes).not.toMatch(/persona generate/); // not the [Unreleased] section
  });

  it('round-trips: assembleRelease then extractReleaseNotes returns the same notes', () => {
    const r = assembleRelease({ changelogText: SAMPLE, currentVersion: '0.1.2', bump: 'minor', date: '2026-06-15' });
    const extracted = extractReleaseNotes(r.changelog, '0.2.0');
    expect(extracted).toBe(r.notes);
  });

  it('throws when the version section is absent', () => {
    expect(() => extractReleaseNotes(SAMPLE, '9.9.9')).toThrow(/no "## \[9\.9\.9\]"/);
  });
});
