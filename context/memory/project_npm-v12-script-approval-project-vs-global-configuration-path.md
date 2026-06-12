---
id: P-7FV4EYaW
type: project
title: 'npm v12 Script Approval: Project vs. Global Configuration Paths'
created_at: 2026-06-12T15:52:09Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: c6e21171c58c93ed658129ca563c02390ed84655
---

npm v12 (~July 2026) introduces script approval with separate mechanisms:
- Project-level: `npm approve-scripts` / `npm deny-scripts` + `package.json` allowlist
- Global-level: separate `allow-scripts` config (exact syntax TBD from npm docs)

**Kit-specific**: `npm install -g` users require global-config remediation in doctor hints, not project-level allowlist.

**Why:** Dual-path architecture means different remediation per install type. Verified against GitHub changelog (2026-06-09) and community discussion #198547.

**How to apply:** When implementing native-binding HC, pin exact global syntax from npm config docs; ensure doctor hints explicitly cover the global `allow-scripts` path for global installs.
