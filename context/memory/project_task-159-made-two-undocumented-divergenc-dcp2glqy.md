---
id: P-DCP2GLQY
type: project
title: 'Task 159 made two undocumented divergences from research spec: used `isJournalSt'
created_at: 2026-06-20T07:18:48Z
write_source: user-explicit
trust: high
source_file: review-promote
source_line: 1
source_sha1: 996a60205119a1927a36aa575cfac769bc9b6fd34d03e86ce3ee0f2bd0b0823b
---

Task 159 made two undocumented divergences from research spec: used `isJournalStale()` boolean instead of `detectStaleness` verdict; used INDEX.md mtime proxy instead of checking newest fact file. Code is sound; decision trail has a gap.
