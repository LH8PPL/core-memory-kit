---
deleted_at: 2026-07-12T18:08:18Z
deleted_reason: ''
deleted_by: user-explicit
id: P-BQWQPDQR
type: project
shape: Timeless
title: Layered FastAPI Backend Architecture
created_at: 2026-07-12T17:31:39Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: d6a63c076b401ee73f17f06cf403210a21a9741fd0c2eb2fecb4cf950a9c256e
---

**Layers and responsibilities:**
- **Routes** (`app/api/routes/`) — thin HTTP wrappers; validate input via Pydantic schemas, delegate to service, shape response
- **Services** (`app/services/`) — business logic; orchestrate repositories, enforce invariants, raise domain errors (no HTTP knowledge)
- **Repositories** (`app/repositories/`) — abstract contract + concrete implementations (in-memory dict for dev/test)
- **Models** (`app/models/`) — internal domain models (dataclass, separate from wire schemas)
- **Schemas** (`app/schemas/`) — Pydantic request/response contracts (boundary layer only)
- **Core** (`app/core/`) — config (pydantic-settings), domain errors, shared logic
- **Dependencies** (`app/api/deps.py`) — composition root; wires repository → service → route

**Key invariants:** all async; services take repo as constructor arg; routes use FastAPI Depends; no framework types leak into services

**Why:** Enables testability, swappable implementations (in-memory → SQL without touching services), and framework-agnostic domain logic

**How to apply:** For new backends, create abstract Repository ABC in `app/repositories/<domain>.py`, concrete InMemoryImpl, Service consuming it, Routes depending on Service via Depends
