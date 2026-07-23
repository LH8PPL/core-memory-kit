---
id: P-U5aGG67J
type: project
shape: Timeless
title: PII Screening Mechanism in the Kit
created_at: 2026-07-23T15:05:12Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 6f85493c3885edbe3d0a6d3f85cfccf604813f6019d8ffb9347d1b3c6b7b6e32
---

- **maskPii function**: masks emails and usernames before writing to committed files
- **Home path abstraction**: paths like `C:\Users\<username>\...` abstracted to `~` to prevent usernames leaking into committed facts
- **Transcript screening**: transcripts are screened before promotion to persistent memory  
- **Public repo validator**: validator ensures no real names appear in public repo outside license files
- **Security context**: "raw-prompt-in-log bug" was flagged as Blocking by reviewer, indicating prior privacy concern

**Why:** Personal info in committed facts travels with git clone, appears in PRs, and becomes permanently searchable; these mechanisms prevent accidental exposure

**How to apply:** Reference when implementing capture logic, designing fact promotion, or auditing public output for privacy compliance
