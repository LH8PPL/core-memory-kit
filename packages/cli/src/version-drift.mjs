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
// (`<!-- core-memory-kit:start v0.3.3 -->`); the installed binary version is
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
    return { id, name, status: 'skip', message: 'no core-memory-kit managed block in CLAUDE.md' };
  }

  // Task 220 (D-322): a duplicated managed block (copy-paste / kept-both-sides
  // merge) is a real integrity fault regardless of versions — the stale copy
  // shadows the refreshed one for any reader scanning past the first. `cmk
  // install` now FOLDS duplicates into one block, so it is the recovery here.
  if (block.duplicateCount > 0) {
    return {
      id,
      name,
      status: 'fail',
      message: `CLAUDE.md contains ${block.duplicateCount + 1} core-memory-kit managed blocks (a duplicate from a copy-paste or merge) — re-run \`cmk install\` to fold them into one`,
      recoveryCommand: 'cmk install',
    };
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

// --- The stale-GLOBAL half (Task 245 / D-382) --------------------------------
//
// checkVersionDrift above catches "the PROJECT is behind the binary." It cannot
// catch "the BINARY is behind the registry" — the silent-upgrade-failure class
// D-382 observed live: an `npm install -g @latest` that quietly leaves the old
// version in place (whatever the cause — the observed instance best fits
// registry-propagation timing minutes after a publish) keeps `cmk doctor`
// reporting healthy, because every check compares against the INSTALLED binary
// and an un-upgraded pair is internally consistent. That is how the PreCompact
// hook was absent from the kit's own repo for hours after Task 235 shipped.
//
// This check closes the hole regardless of cause: ask the npm registry what
// `latest` is and SAY SO OUT LOUD when the running binary is behind. Soft by
// design — a health check must never fail because the machine is offline:
//   - skipped entirely under CI (install-matrix runs doctor on every PR; a
//     registry hiccup must not flake a gate) or CMK_SKIP_UPDATE_CHECK=1
//   - short timeout; ANY network/HTTP/parse failure → {checked:false}, silent
//   - a plain registry metadata GET (the same request `npm view` makes);
//     nothing is sent beyond the package name

export const REGISTRY_LATEST_URL =
  'https://registry.npmjs.org/@lh8ppl%2fcore-memory-kit/latest';

export const UPDATE_CHECK_TIMEOUT_MS = 2500;

/**
 * Compare the running binary against the registry's `latest`. Never throws.
 *
 * @param {object} args
 * @param {string} args.installedVersion     — getKitVersion()
 * @param {Function} [args.fetcher]          — injectable fetch (tests)
 * @param {number} [args.timeoutMs]
 * @param {Record<string,string|undefined>} [args.env]
 * @returns {Promise<{checked:boolean, reason?:string, latest?:string, installed?:string, stale?:boolean}>}
 */
export async function checkPublishedLatest({
  installedVersion,
  fetcher,
  timeoutMs = UPDATE_CHECK_TIMEOUT_MS,
  env = process.env,
} = {}) {
  // CI: the install-matrix runs doctor on every PR — a registry hiccup must
  // not flake a gate. VITEST: the doctor suite calls runDoctor dozens of times
  // locally; without this, every one is a real registry GET (a test that wants
  // this path injects `env: {}` + a fake fetcher explicitly).
  if (env.CI || env.VITEST || env.CMK_SKIP_UPDATE_CHECK) {
    return { checked: false, reason: 'ci-or-disabled' };
  }
  try {
    const f = fetcher ?? fetch;
    const res = await f(REGISTRY_LATEST_URL, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { checked: false, reason: `http-${res.status}` };
    const { version } = await res.json();
    if (typeof version !== 'string' || !version) {
      return { checked: false, reason: 'bad-payload' };
    }
    return {
      checked: true,
      latest: version,
      installed: installedVersion,
      stale: compareVersions(installedVersion, version) < 0,
    };
  } catch {
    return { checked: false, reason: 'network' };
  }
}
