// kiro-constants.mjs — leaf module of shared Kiro constants, so multiple Kiro
// modules can import them without an import cycle (install-kiro ↔ kiro-permissions).

// The kit's 12 MCP tool names (bare). Used for BOTH the IDE mcp.json `autoApprove`
// (install-kiro) AND the IDE-1.0 permissions.yaml `capability: mcp` match list
// (kiro-permissions) — one source so the two never drift.
export const MCP_AUTO_APPROVE = Object.freeze([
  'mk_remember',
  'mk_search',
  'mk_get',
  'mk_timeline',
  'mk_expand',
  'mk_cite',
  'mk_recent_activity',
  'mk_trust',
  'mk_lessons_promote',
  'mk_forget',
  'mk_queue_list',
  'mk_queue_resolve',
]);
