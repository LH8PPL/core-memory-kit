---
id: P-BLSBXKGL
type: project
title: Auto-load of .kiro/hooks/cmk.kiro.hook.json hooks is the critical verification p
created_at: 2026-06-25T13:38:45Z
write_source: user-explicit
trust: high
source_file: review-promote
source_line: 1
source_sha1: d053c478d240e63e55dd56c0397f53cba4e5df51155881f94cfe3efa8aa26185
---

Auto-load of .kiro/hooks/cmk.kiro.hook.json hooks is the critical verification point for IDE 1.0 upgrade (the "load-bearing KHv1-load probe"); if not auto-loaded, post-install GUI reload step may be needed
