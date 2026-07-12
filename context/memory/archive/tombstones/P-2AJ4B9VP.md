---
deleted_at: 2026-07-12T18:08:13Z
deleted_reason: ''
deleted_by: user-explicit
id: P-2AJ4B9VP
type: project
shape: Timeless
title: Domain Error Handling Pattern
created_at: 2026-07-12T17:31:39Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 92afbcde8a07fa6f79cd59c7e8b69219cd7f371fc1ff26d7d9c708e721e051bc
---

- **Definition** — abstract base classes in `app/core/errors.py` (`DomainError`, `NotFoundError`, `ConflictError`, etc.)
- **Raised by** — services when business rules are violated (e.g., duplicate email, missing entity)
- **Translated by** — app-level exception handlers in `app/main.py` (registered in `create_app()`), converting to HTTP status codes (404, 409, etc.)
- **Principle** — services are framework-agnostic; web layer alone knows about HTTP

**Why:** Centralizes error translation in one place; keeps domain code testable and reusable

**How to apply:** Define domain error classes in core; service raises them; exception_handler decorator in app factory maps them to JSONResponse status codes
