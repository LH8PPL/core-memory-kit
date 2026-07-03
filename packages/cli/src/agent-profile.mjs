// agent-profile.mjs — the per-agent profile factory (Task 50.C).
//
// D-180: per-agent adapters are DATA, not classes. This factory validates +
// normalizes a profile DECLARATION so the install routing (Task 50.F) can drive
// ANY agent through ONE code path — the config legs (MCP registration, hook
// entry) go through the shared `mutateAgentConfig` primitive (Task 50.B); the
// instruction leg goes through the kit's marker-block machinery. The factory
// itself does NO I/O — it's a pure validator/normalizer that returns a frozen
// descriptor. A bad profile fails LOUD at definition time (throws), not at
// install time against a user's machine.
//
// Integration-type taxonomy (the claude-mem insight — the type dictates which
// legs an agent wires):
//   native-hooks-mcp   — instruction + MCP + lifecycle hooks (Claude Code, Kiro)
//   hooks-mcp          — instruction + MCP + hooks, hooks via a dedicated file
//                        (Cursor) — same required legs as native-hooks-mcp;
//                        the `hooks.mechanism` field distinguishes them
//   mcp-only           — instruction + MCP, NO hooks (Copilot/Warp/Roo/Goose)
//   instruction-only   — instruction file only, NO MCP, NO hooks (AGENTS.md rung)
//
// Public surface:
//   defineAgentProfile(declaration) → frozen normalized descriptor (throws on invalid)
//   INTEGRATION_TYPES — frozen list of the valid integrationType values

export const INTEGRATION_TYPES = Object.freeze([
  'native-hooks-mcp',
  'hooks-mcp',
  'mcp-only',
  'instruction-only',
]);

const TYPES = new Set(INTEGRATION_TYPES);

// Which legs each type REQUIRES / FORBIDS. instructionFile is required by every
// type (the universal leg). mcp + hooks vary by type.
const TYPE_LEGS = Object.freeze({
  'native-hooks-mcp': { mcp: 'required', hooks: 'required' },
  'hooks-mcp': { mcp: 'required', hooks: 'required' },
  'mcp-only': { mcp: 'required', hooks: 'forbidden' },
  'instruction-only': { mcp: 'forbidden', hooks: 'forbidden' },
});

function fail(msg) {
  throw new Error(`defineAgentProfile: ${msg}`);
}

/**
 * Validate + normalize an agent profile declaration.
 * @param {object} decl
 * @returns {Readonly<object>} the frozen descriptor
 */
export function defineAgentProfile(decl) {
  if (decl === null || typeof decl !== 'object') {
    fail('declaration must be an object');
  }
  const {
    name,
    displayName,
    integrationType,
    detect,
    instructionFile,
    instructionFrontmatter,
    mcp,
    hooks,
    transcript,
  } = decl;

  // ── universal required fields ────────────────────────────────────────────
  if (typeof name !== 'string' || name.length === 0) {
    fail('name is required (non-empty string)');
  }
  if (!TYPES.has(integrationType)) {
    fail(`integrationType must be one of: ${INTEGRATION_TYPES.join(', ')} (got ${JSON.stringify(integrationType)})`);
  }
  if (detect === null || typeof detect !== 'object') {
    fail(`profile ${name}: detect descriptor is required (e.g. {homeDir:'.kiro'} | {command:'x'} | {always:true})`);
  }
  if (typeof instructionFile !== 'string' || instructionFile.length === 0) {
    fail(`profile ${name}: instructionFile is required (every integration type wires the instruction leg)`);
  }
  // Optional: agent-specific YAML frontmatter lines for the instruction file
  // (e.g. Cursor's `.mdc` needs `alwaysApply: true`; Kiro steering uses
  // `inclusion: always`). Data, not code — the writer wraps it in `---` fences.
  if (instructionFrontmatter !== undefined
      && (typeof instructionFrontmatter !== 'string' || instructionFrontmatter.length === 0)) {
    fail(`profile ${name}: instructionFrontmatter must be a non-empty string when present`);
  }

  // ── per-type leg contract (the parity invariant 50.D will also enforce) ──
  const legs = TYPE_LEGS[integrationType];
  enforceLeg(name, integrationType, 'mcp', mcp, legs.mcp);
  enforceLeg(name, integrationType, 'hooks', hooks, legs.hooks);

  // ── shape checks on present legs ─────────────────────────────────────────
  if (mcp !== undefined) {
    if (typeof mcp.path !== 'string' || typeof mcp.serversKey !== 'string') {
      fail(`profile ${name}: mcp requires {path, serversKey} strings`);
    }
  }
  if (hooks !== undefined) {
    if (typeof hooks.mechanism !== 'string') {
      fail(`profile ${name}: hooks requires a {mechanism} string`);
    }
    if (hooks.eventMap === null || typeof hooks.eventMap !== 'object') {
      fail(`profile ${name}: hooks requires an {eventMap} object`);
    }
  }

  // ── normalize + freeze ───────────────────────────────────────────────────
  const descriptor = {
    name,
    displayName: displayName || name,
    integrationType,
    detect: Object.freeze({ ...detect }),
    instructionFile,
    ...(instructionFrontmatter !== undefined ? { instructionFrontmatter } : {}),
    ...(mcp !== undefined ? { mcp: Object.freeze({ ...mcp }) } : {}),
    ...(hooks !== undefined
      ? { hooks: Object.freeze({ ...hooks, eventMap: Object.freeze({ ...hooks.eventMap }) }) }
      : {}),
    ...(transcript !== undefined ? { transcript: Object.freeze({ ...transcript }) } : {}),
  };
  return Object.freeze(descriptor);
}

function enforceLeg(name, type, leg, value, requirement) {
  if (requirement === 'required' && value === undefined) {
    fail(`profile ${name}: integrationType '${type}' requires the ${leg} leg`);
  }
  if (requirement === 'forbidden' && value !== undefined) {
    fail(`profile ${name}: integrationType '${type}' must NOT declare ${leg} (it over-wires its type)`);
  }
}
