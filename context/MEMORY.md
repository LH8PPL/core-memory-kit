<!-- Cap: 2500 chars · Last distilled: 2026-06-10 · Last health check: 2026-06-10 -->

# Working Memory

<!-- Your project's working scratchpad. Replace the example bullets with real state; empty sections are fine. -->

## Active Threads

<!-- Current work in progress. Drop bullets as work resolves. -->

- (P-9NVV4XMQ) The D-105 v0.3 lane is COMPLETE (2026-06-10): 75.0 #147, 99 #148, 52 #149, 65 #150 (semantic recall R@5 0.941/paraphrase 1.000, ADR-0015 — video parity), README #151. Next open v0.3 work: 75.1/75.2 recall skill+hint, Task 104 L3 transcripts, Task 46 install --with-semantic; then the v0.3.0 cut (live test + tag = the user's steps)
  <!-- source: user-explicit, source_line: 1, sha1: 4cbaf1928ed377bc1d110828f905e70cf65fbe13, write: user-explicit, trust: high, at: 2026-06-10T10:38:39Z -->
- (P-772HMSZ4) User confirms explicit user-facing suggestion (cmk install --with-semantic) is better than silent degradation or no explanation
  <!-- source: auto-extract-session, source_line: 1, sha1: f04a0309f43b8f52a5e46646801074cb1fef506a, write: auto-extract, trust: high, at: 2026-06-10T12:45:25Z -->
- (P-CBDN7KXQ) User validates pragmatic retry-with-wait approach for transient failures ("maybe if you waited it will succeed?")
  <!-- source: auto-extract-session, source_line: 1, sha1: 341d34da4b116cfe49030f009fe85304d24ca933, write: auto-extract, trust: high, at: 2026-06-10T12:45:25Z -->
- (P-QXDNaC5U) v0.3.0 is BUILD-COMPLETE (2026-06-10): Tasks 46/125/124/75(all)/104(all) shipped, PRs #152-#158. Next step is the CUT — the user's manual live-test of the recall ladder (memory-search skill trigger, the hint, --scope transcripts), then npm run release -- minor and the v0.3.0 tag push. 3 SonarCloud hotspot review-marks pending in the user's UI (all non-security: constant shell strings + the sha1 checkpoint).
  <!-- source: user-explicit, source_line: 1, sha1: a6d11a7f45eeb2937bed971211a3f331ae5a2daf, write: user-explicit, trust: high, at: 2026-06-10T19:52:22Z -->
- (P-a5W95QXS) This file (docs/process/cut-gate.md) is their manual live-test guide for releases — the standard checklist they run before shipping.
  <!-- source: auto-extract-session, source_line: 1, sha1: 406d0df191a0093e78f6c2fe232c2a82f0fd1d30, write: auto-extract, trust: high, at: 2026-06-10T19:57:43Z -->

## Environment Notes

<!-- Tool versions, paths, URLs, env state. -->


## Pending Decisions

<!-- Things still to decide. Remove when resolved. -->

