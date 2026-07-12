---
deleted_at: 2026-07-12T18:08:20Z
deleted_reason: ''
deleted_by: user-explicit
id: P-PBBD2LCZ
type: project
shape: Timeless
title: Project Directory Structure and Module Organization
created_at: 2026-07-12T17:31:39Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: b43a7216da8693309d4fc54b436e90606a70415cc37983cf843290046069d46b
---

```
app/
  main.py (app factory + exception handlers)
  core/config.py (pydantic-settings), errors.py (domain errors)
  api/deps.py (Depends wiring), router.py (include_router aggregation), routes/{health,users}.py
  schemas/user.py (Pydantic BaseModel for wire)
  models/user.py (dataclass for persistence)
  repositories/user.py (abstract + InMemoryImpl)
  services/user.py (business logic)
tests/conftest.py (TestClient fixture), test_users.py (E2E)
```

**Why:** Organize by layer; easy to locate and add new domains (replicate user/ pattern)

**How to apply:** Follow this structure; to add a domain, create user.py in each layer, wire in deps.py, add route module
