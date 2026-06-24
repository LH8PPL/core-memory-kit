<!-- Cap: 2500 chars · Last distilled: 2026-06-10 · Last health check: 2026-06-10 -->

# Working Memory

<!-- Your project's working scratchpad. Replace the example bullets with real state; empty sections are fine. -->

## Active Threads

<!-- Current work in progress. Drop bullets as work resolves. -->

- (P-9HAX6LAX) agentSpawn hook verified firing; D-198 configuration fix confirmed working; Kiro version 2.9.0
  <!-- source: review-promote, source_line: 1, sha1: 222af275ce998c5cf4d4151f78310097402e2444e0babec7f9f373b3ea562eac, write: user-explicit, trust: high, at: 2026-06-24T20:00:03Z -->
- (P-VRJ9JMX5) kiro-cli only passes env overrides to registry-type MCP servers, not stdio-type; since your server is stdio-type (personal), CMK_PROJECT_DIR is silently dropped (verified from kiro-cli changelog)
  <!-- source: review-promote, source_line: 1, sha1: 114995a3b156bf43ab3f62488d930d448b1bdf3a9ac2d99b98b0f2dc626706d4, write: user-explicit, trust: high, at: 2026-06-24T20:00:03Z -->
- (P-ZXUWSZWJ) The kit's code fix is correct; the blocking issue is kiro-cli's env-passing architecture, not the kit itself
  <!-- source: review-promote, source_line: 1, sha1: 5310a7af2ea18cc16c39238aa5d3663cdf60ca0caa9bb1b4be3b4ed698e3a6ce, write: user-explicit, trust: high, at: 2026-06-24T20:00:03Z -->
- (P-A79KMP6L) Only mk_remember MCP-tool calls are affected; CLI hooks (agentSpawn inject + stop capture) continue to work normally
  <!-- source: review-promote, source_line: 1, sha1: 5490b1d95075cb9066b9e6544a88bb70845bb03fd51f65a34267d60741976ed5, write: user-explicit, trust: high, at: 2026-06-24T20:00:04Z -->
- (P-TBKTT7FS) Kiro bug #5873 blocks manual `mk_remember` tool from routing to custom assistants like claude-memory-kit
  <!-- source: review-promote, source_line: 1, sha1: 3b840077a942e945975319be45779eeb334cdfe61b7b7bdda995a1f0902bd0c0, write: user-explicit, trust: high, at: 2026-06-24T20:00:05Z -->
- (P-LRC5G3V6) Clarifying scope — asking whether kiro-ide and claude-code are still pending fixes in mcp route (in addition to kiro-cli live test)
  <!-- source: review-promote, source_line: 1, sha1: c660344e231b777c2f073d80ea4554f7dd032b2c55ff38bc8798429b51d7d294, write: user-explicit, trust: high, at: 2026-06-24T20:00:05Z -->

## Environment Notes

<!-- Tool versions, paths, URLs, env state. -->


## Pending Decisions

<!-- Things still to decide. Remove when resolved. -->

