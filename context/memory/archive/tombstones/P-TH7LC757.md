---
deleted_at: 2026-06-10T12:32:11Z
deleted_reason: duplicates the engineering-discipline seam rule AND superseded by Task 125.4 (the npm closure becomes seam-testable) (D-108/D-112 class)
deleted_by: user-explicit
id: P-TH7LC757
type: project
title: Test Design via Seams (npm-spawn Closures)
created_at: 2026-06-10T12:18:46Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: ec41185419538c3aa01c155e7b529eeb1ab4472c
---

npm-spawn/warm closures are tested through injected seam validation, not real `npm install -g` execution:
- **Why**: avoids slow, flaky, environment-dependent CI
- **Contract validation**: seam layer asserts the boundary contract; closure code itself is not executed
- **Coverage impact**: coverage tools report "uncovered" lines in these closures by design — expected, not a gap

**Why:** Real `npm install` is slow and flaky; seams are deterministic and validate the contract boundary

**How to apply:** When reviewing coverage reports, do not flag uncovered lines in npm-spawn closures as gaps; the contract is validated at the seam
