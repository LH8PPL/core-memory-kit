---
deleted_at: 2026-07-12T18:08:25Z
deleted_reason: ''
deleted_by: user-explicit
id: P-J4TUPTZL
type: project
shape: Timeless
title: Test Structure and Fixtures
created_at: 2026-07-12T17:31:39Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 2c0b1441e3a03fe16ade93b8fd16fba66b4b803d7edab04ba4c282a1729751ff
---

- **conftest.py** — pytest fixture `client()` yields `TestClient(create_app())` as context manager
- **Test file** — imports `TestClient`, uses `/api/v1` prefix, calls HTTP methods and asserts on status + JSON response
- **E2E tests** — exercise full route → service → repo flow (not mocked)

**Why:** TestClient provides sync interface; E2E approach validates integration; conftest fixture avoids duplication

**How to apply:** Create tests/ dir with conftest.py fixture, write test functions using client.get/post with JSON payloads and assertions on status_code and resp.json()
