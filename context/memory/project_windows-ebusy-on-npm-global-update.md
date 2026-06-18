---
id: P-MXZUV2UY
type: project
title: Windows EBUSY on npm Global Update
created_at: 2026-06-18T18:44:10Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: fc62eecd8fc4429fbb8c09b01b2cbf49048522a6e9ccf1ec27a49641998f2edc
---

npm update can fail with EBUSY (locked DLL) if Claude Code is running; encountered twice this session

**Why:** Real user blocker — cryptic error with no guidance if they try to update the global binary while IDE is open

**How to apply:** Document in TROUBLESHOOTING; consider graceful handling in `cmk update` or `cmk doctor`
