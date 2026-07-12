---
deleted_at: 2026-07-12T18:08:23Z
deleted_reason: ''
deleted_by: user-explicit
id: P-ZFGC9SBN
type: project
shape: Timeless
title: Repository Abstraction and In-Memory Implementation
created_at: 2026-07-12T17:31:39Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 7a8cd1d352aff88641fe11c4015f0d066a900259fb0577a2955b8a2a93823a73
---

- **Abstract base** — `UserRepository` ABC with async methods (`add`, `get`, `get_by_email`, `list`)
- **Concrete impl** — `InMemoryUserRepository` using `dict[UUID, User]`, shared singleton across requests
- **Wiring** — repo singleton created in `app/api/deps.py`, injected into service via `Depends(get_user_repository)`
- **Swappable** — to move to SQL/ORM, replace only the concrete class; service and routes unchanged

**Why:** Dev/test against in-memory store (no DB setup); production swap is a one-line dependency change

**How to apply:** Create abstract class with async methods, implement for in-memory in same file, inject via FastAPI Depends, store as module-level singleton
