#!/usr/bin/env node
// validate-agent-adapter-parity.mjs — every supported agent profile wires
// EXACTLY the legs its integration-TYPE declares (Task 50.D — the cross-agent
// adapter seam's parity invariant made structural; D-180).
//
// The integration-type taxonomy (claude-mem insight): an agent's type dictates
// which legs it MUST wire and which it MUST NOT. The factory (agent-profile.mjs)
// enforces this at definition time — this validator is the lint-time guard that
// catches drift: a profile constructed outside the factory, or a future change
// to the leg contract that the registry no longer satisfies. Both directions:
//   - under-wiring (a native-hooks-mcp profile missing its hooks leg) fails;
//   - over-wiring (an mcp-only profile that declares hooks) fails.
//
// Mirrors validate-skill-allowlist (both-directions, D-120) + the other
// structural validators. Run: `node scripts/validate-agent-adapter-parity.mjs`
// Wired into `npm test` as a pre-test step.

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = process.env.CMK_VALIDATOR_ROOT
  ? resolve(process.env.CMK_VALIDATOR_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The required legs per integration type. instructionFile is universal; mcp +
// hooks vary. Kept here (not imported from the factory) so the validator is an
// INDEPENDENT statement of the contract — if the factory's internal table drifts
// from this, the live-registry parity check surfaces it.
export const REQUIRED_LEGS_BY_TYPE = Object.freeze({
  'native-hooks-mcp': ['instructionFile', 'mcp', 'hooks'],
  'hooks-mcp': ['instructionFile', 'mcp', 'hooks'],
  'mcp-only': ['instructionFile', 'mcp'],
  'instruction-only': ['instructionFile'],
});

const ALL_LEGS = ['instructionFile', 'mcp', 'hooks'];

function legPresent(profile, leg) {
  return profile[leg] !== undefined && profile[leg] !== null;
}

/**
 * Check the parity invariant for a set of profiles.
 * @param {object[]} [profiles] defaults to the live registry (async-loaded by
 *   the CLI entry; tests pass explicit arrays).
 * @returns {{ok:boolean, checked:number, violations:string[]}}
 */
export function checkAdapterParity(profiles) {
  const violations = [];
  for (const p of profiles) {
    const type = p.integrationType;
    const required = REQUIRED_LEGS_BY_TYPE[type];
    if (!required) {
      violations.push(`profile '${p.name}': unknown integrationType '${type}'`);
      continue;
    }
    for (const leg of ALL_LEGS) {
      const mustHave = required.includes(leg);
      const has = legPresent(p, leg);
      if (mustHave && !has) {
        violations.push(`profile '${p.name}' (${type}): MISSING required leg '${leg}' (under-wired)`);
      } else if (!mustHave && has) {
        violations.push(`profile '${p.name}' (${type}): declares '${leg}' but its type forbids it (over-wired)`);
      }
    }
  }
  return { ok: violations.length === 0, checked: profiles.length, violations };
}

// ── CLI entry ────────────────────────────────────────────────────────────────
async function main() {
  const mod = await import(
    pathToFileURL(resolve(REPO, 'packages', 'cli', 'src', 'agent-profiles.mjs')).href
  );
  const profiles = mod.listAgentProfiles();
  const r = checkAdapterParity(profiles);
  if (!r.ok) {
    console.error('validate-agent-adapter-parity: FAIL');
    for (const v of r.violations) console.error(`  ✗ ${v}`);
    process.exit(1);
  }
  console.log(`validate-agent-adapter-parity: OK — ${r.checked} agent profile(s) wire their integration-type legs`);
}

// Run only when invoked directly (not when imported by the test).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
