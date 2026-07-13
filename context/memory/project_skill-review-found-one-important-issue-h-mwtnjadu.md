---
id: P-MWTNJaDU
type: project
shape: State
title: 'Skill review found one Important issue: handleUnlink crash path under concurrent'
created_at: 2026-07-13T20:00:01Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: review-promote
source_line: 1
source_sha1: 0bba47e05ced15e2b42c71ea9319cd25958942fc90c7c3c99df9bcf799b31df1
---

Skill review found one Important issue: handleUnlink crash path under concurrent write; fix is trivial (mirror handleChange's try/catch)
