---
deleted_at: 2026-07-12T18:08:16Z
deleted_reason: ''
deleted_by: user-explicit
id: P-3aND5HFN
type: project
shape: Timeless
title: FastAPI Dependency Injection and Singleton Management
created_at: 2026-07-12T17:31:39Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 3f9b094542f20cc98ade2e3572e41e3b4036e488b941f0cac62495c1d10b5bcd
---

- **Module-level singleton** — `_user_repo = InMemoryUserRepository()` in deps.py, created once
- **Dependency functions** — `get_user_repository()` returns singleton; `get_user_service(repo: Annotated[UserRepository, Depends(...)])` constructs service per-request
- **Type alias for routes** — `UserServiceDep = Annotated[UserService, Depends(get_user_service)]` for clean route signatures
- **Per-request service** — fresh service instance per request, but repo persists across requests (shared state)

**Why:** Singleton repo means in-memory state shared between requests; fresh service isolates logic per request; easy to replace repo impl

**How to apply:** Define Depends chain in deps.py, use type alias in route handler signature (e.g., `async def create_user(..., service: UserServiceDep)`)
