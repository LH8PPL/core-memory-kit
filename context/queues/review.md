## 2026-06-16T11:18:09Z — auto-extract (medium-trust, pending review)
- (P-F29TVCRT) FQ1 test coverage gap — the cut-gate probe is CLI-only, not MCP tool (the actual user surface); add MCP test coverage to close the gap.
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-16T11:18:09Z -->
## 2026-06-16T11:25:54Z — auto-extract (medium-trust, pending review)
- (P-D2BR4VYX) Auto-recall agents do not and should not read tombstoned facts; recovery is always human-initiated.
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-16T11:25:54Z -->
## 2026-06-16T12:01:44Z — auto-extract (medium-trust, pending review)
- (P-K6DKFXP4) Check documentation to verify technical claims rather than reasoning through uncertainty
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-16T12:01:44Z -->
## 2026-06-16T13:07:39Z — auto-extract (medium-trust, pending review)
- (P-DEQV4AUL) v0.3.2 ships FTS5 query fix (Task 153) + validate-index (Task 152)
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-16T13:07:39Z -->
## 2026-06-16T13:07:39Z — auto-extract (medium-trust, pending review)
- (P-Y9DZXM3D) Tasks 156 (DECISIONS.md AI-recall) and 155 (tombstone recovery flag) queued for v0.3.3
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-16T13:07:39Z -->
## 2026-06-16T14:05:44Z — auto-extract (medium-trust, pending review)
- (P-N6ZTVDUC) v0.3.2 shipped to npm (@lh8ppl/claude-memory-kit@0.3.2) with SLSA provenance and GitHub Release
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-16T14:05:44Z -->
## 2026-06-16T14:05:44Z — auto-extract (medium-trust, pending review)
- (P-KKYS67aQ) node:sqlite migration rejected—clean CI perf data showed 10% slower search performance
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-16T14:05:44Z -->
## 2026-06-16T14:05:44Z — auto-extract (medium-trust, pending review)
- (P-aG3GHZBE) v0.3.3 roadmap: Task 156 (DECISIONS.md AI-recall journal completion), Task 155 (tombstone recovery flag)
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-16T14:05:44Z -->
## 2026-06-18T06:40:32Z — auto-extract (medium-trust, pending review)
- (P-CLTKNaVa) Memory routing gap caught — I was writing to harness slug path instead of kit's documented in-repo context/; asking if this needs addressing
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T06:40:32Z -->
## 2026-06-18T06:53:08Z — auto-extract (medium-trust, pending review)
- (P-94DQYLBM) INDEX.md is the kit's metadata index of all 307 memory facts; touched on every fact save
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T06:53:08Z -->
## 2026-06-18T06:53:08Z — auto-extract (medium-trust, pending review)
- (P-BFTDUAQT) DECISIONS.md is the decision journal; Task 159 makes it auto-update automatically
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T06:53:08Z -->
## 2026-06-18T06:55:13Z — auto-extract (medium-trust, pending review)
- (P-DCP2GLQY) Task 159 made two undocumented divergences from research spec: used `isJournalStale()` boolean instead of `detectStaleness` verdict; used INDEX.md mtime proxy instead of checking newest fact file. Code is sound; decision trail has a gap.
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T06:55:13Z -->
## 2026-06-18T06:55:13Z — auto-extract (medium-trust, pending review)
- (P-UY6XTETK) Expects implementation choices to be traceable to (or explicitly justified against) prior research and documented decisions. Surfaced via probing question "did you go over all the docs?"
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T06:55:13Z -->
## 2026-06-18T07:23:23Z — auto-extract (medium-trust, pending review)
- (P-HGAHKL9H) 6 mattpocock skills (tdd, grilling, diagnosing-bugs, codebase-design, domain-modeling, prototype) are gitignored; prevents travel between machines
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T07:23:23Z -->
## 2026-06-18T07:23:23Z — auto-extract (medium-trust, pending review)
- (P-WCBPVNEa) Skills available but not invoked despite matching work; violates Skill agency rule (skills auto-fire, shouldn't need manual command)
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T07:23:23Z -->
## 2026-06-18T07:23:23Z — auto-extract (medium-trust, pending review)
- (P-6DNYCTB2) Code-review-excellence is pre-existing skill, not one of 6 newly adopted; produced concrete value (caught I1 bug)
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T07:23:23Z -->
## 2026-06-18T08:19:22Z — auto-extract (medium-trust, pending review)
- (P-A2XCSPSa) CHANGELOG date for v0.3.3 is 2026-06-18
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T08:19:22Z -->
## 2026-06-18T12:58:52Z — auto-extract (medium-trust, pending review)
- (P-54X6D2DM) cmk-compress-session must be invoked by Claude Code at session-end, not manually; code documents this; manual run causes hangs
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T12:58:52Z -->
## 2026-06-18T14:18:21Z — auto-extract (medium-trust, pending review)
- (P-YA74AXRJ) Nested-`claude` invocations from inside an active Claude Code session timeout at 50s; this affected D6 but is environmental, not a kit defect.
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T14:18:21Z -->
## 2026-06-18T14:18:21Z — auto-extract (medium-trust, pending review)
- (P-DV52LVVN) D6 (now→today roll) fail-safe behavior confirmed: timeout logs cleanly, now.md is preserved, retry happens next SessionStart—nothing lost.
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T14:18:21Z -->
## 2026-06-18T14:18:21Z — auto-extract (medium-trust, pending review)
- (P-LD7RPCTX) Honest uncertainty flagging: can't be 100% sure whether compress timeout is environmental or real without running it outside the harness; both readings are plausible.
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T14:18:21Z -->
## 2026-06-18T20:16:34Z — auto-extract (medium-trust, pending review)
- (P-KKALEZCP) Only 2 of 19 systems (memsearch, Letta) cleanly implement A+B+C (buffer cap + deterministic pre-truncate + partial-evict); 2 more do ~2.5; the rest do 1–2.
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T20:16:34Z -->
## 2026-06-18T20:23:01Z — auto-extract (medium-trust, pending review)
- (P-5WHKZPR3) Kit's memory system uses a `now → today → recent → archive` rolling window; `now.md` grows unbounded within a session due to roll firing at session boundaries only (causes 470KB+ buffers).
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T20:23:01Z -->
## 2026-06-18T20:23:01Z — auto-extract (medium-trust, pending review)
- (P-WYEEXZRN) Root cause: roll mechanism fires only at SessionStart/SessionEnd, not turn boundaries, so `now.md` accumulates entire-session content before draining.
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T20:23:01Z -->
## 2026-06-18T20:23:01Z — auto-extract (medium-trust, pending review)
- (P-MXSa47QX) User prefers memory designs tailored to kit's actual architecture over patterns borrowed from other systems.
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-18T20:23:01Z -->
## 2026-06-19T05:20:12Z — auto-extract (medium-trust, pending review)
- (P-4TGBBBPB) 200KB input compresses in ~15s standalone (no contention); real-world failures occur across 8B–334KB range with zero size correlation, proving timeouts are environmental not input-driven.
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-19T05:20:12Z -->
## 2026-06-19T05:34:45Z — auto-extract (medium-trust, pending review)
- (P-E7AL69YL) observability-first approach — captures real failure data before implementing dependent features (retry); values measurement over assumptions
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-19T05:34:45Z -->
## 2026-06-19T07:15:47Z — auto-extract (medium-trust, pending review)
- (P-TSBAKGD7) Expects comprehensive accounting of work—what was kept, what was superseded but preserved, what was discarded, and why for each
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-19T07:15:47Z -->
## 2026-06-19T21:10:58Z — auto-extract (medium-trust, pending review)
- (P-WMN3HFPF) Prefer using recorded memory lookups and CLI tools (cmk search) instead of manually re-reading project files to re-derive facts.
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-19T21:10:58Z -->
## 2026-06-19T21:22:40Z — auto-extract (medium-trust, pending review)
- (P-XM9YAKRW) httpx2 deprecation in FastAPI TestClient — need to replace httpx dependency with httpx2 eventually
  <!-- proposed_trust: medium, write: auto-extract, at: 2026-06-19T21:22:40Z -->
