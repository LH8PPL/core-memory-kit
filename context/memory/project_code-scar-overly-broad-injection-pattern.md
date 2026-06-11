---
id: P-3SFJR4LM
type: project
title: 'Code Scar: Overly-Broad Injection Pattern'
created_at: 2026-06-11T13:00:14Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: dec018458d2bbcbd3fc1c3503c4436ae60c2bc18
---

The `"you are now"` injection pattern in poison-guard.mjs was originally too broad, matching any sentence starting "you are now <word>", including false positiv
