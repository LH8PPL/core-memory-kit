// HC-9: version-drift detection (Task 162 / D-176).
//
// WHY: after a user updates the global `cmk` (npm i -g @latest), a project's
// version-stamped scaffold — the CLAUDE.md managed block, the hooks, the skills —
// stays at the OLD version until `cmk install` re-runs in that project. Updating the
// npm package ALONE does not touch a project (the per-project re-install is the
// easily-forgotten step). Pre-162 the kit was silent about it (D-172: no update path).
// HC-9 makes `cmk doctor` TELL the user the project is behind + the exact command.
//
// The project's installed version lives in the CLAUDE.md managed-block start marker
// (`<!-- claude-memory-kit:start v0.3.3 -->`); the installed binary version is
// getKitVersion(). Drift = binary NEWER than the project marker → "run cmk install".
// A project marker NEWER than the binary is a downgrade (older global cli opening a
// newer-scaffolded project), NOT drift — flag pass, not a false alarm.

import { findManagedBlock, compareVersions } from './claude-md.mjs';

/**
 * Pure HC-9 check. Injectable inputs (no disk read here) so the logic is unit-tested
 * without a fixture tree; the doctor wiring reads CLAUDE.md + getKitVersion() and
 * passes them in.
 *
 * @param {object} args
 * @param {string|null} args.claudeMdText — the project's CLAUDE.md content, or null if absent.
 * @param {string} args.kitVersion        — the installed binary version (getKitVersion()).
 * @returns {{id:'HC-9', name:string, status:'pass'|'fail'|'skip', message:string, recoveryCommand?:string}}
 */
export function checkVersionDrift({ claudeMdText, kitVersion } = {}) {
  const id = 'HC-9';
  const name = 'Project scaffold version matches the installed cmk';

  // No CLAUDE.md, or no managed block → the project isn't kit-installed (or the block
  // was hand-removed). Not a drift signal; skip (HC-1/repair owns the missing-block case).
  if (!claudeMdText) {
    return { id, name, status: 'skip', message: 'no CLAUDE.md found — project not kit-installed' };
  }
  const block = findManagedBlock(claudeMdText);
  if (!block) {
    return { id, name, status: 'skip', message: 'no claude-memory-kit managed block in CLAUDE.md' };
  }

  // `block.version` is the `:start vX` marker value (findManagedBlock recovers it
  // even from a corrupted/orphan-start block — a stale corrupted block still earns
  // the `cmk install` advice, which fixes both). compareVersions strips any
  // `-prerelease` tag, so a `v0.3.4-beta` scaffold reads as `0.3.4` (the kit ships
  // no prereleases today; this is the intended "close enough" behavior).
  const projectVersion = block.version;
  const cmp = compareVersions(kitVersion, projectVersion);

  if (cmp <= 0) {
    // Binary == project (match) OR binary < project (a downgrade — older cli, newer
    // scaffold). Neither is "re-run install to catch up." Pass.
    return {
      id,
      name,
      status: 'pass',
      message:
        cmp === 0
          ? `project scaffold (v${projectVersion}) matches the installed cmk (v${kitVersion})`
          : `project scaffold (v${projectVersion}) is newer than the installed cmk (v${kitVersion}) — likely an older global cli; not drift`,
    };
  }

  // Binary NEWER than the project marker → the project is stale. THE drift case.
  return {
    id,
    name,
    status: 'fail',
    message: `this project's scaffold is v${projectVersion} but your installed cmk is v${kitVersion} — re-run \`cmk install\` here to refresh the CLAUDE.md block, hooks, and skills (then restart Claude Code)`,
    recoveryCommand: 'cmk install',
  };
}
