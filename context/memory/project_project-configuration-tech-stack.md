---
id: P-N9FJU9Ta
type: project
title: Project Configuration & Tech Stack
created_at: 2026-06-16T12:03:54Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: aad13704dac8fafb52c62a1ffd20cef30d2a082c98e9ee823e36a589afe75fa4
---

- **Port:** 8000
- **Architecture:** Layered
- **Concurrency:** Async
- **Type hints:** Required throughout
- **Linting/formatting:** uv/ruff
- **SDK:** Claude SDK (for integration)

**Why:** Standing configuration that every session should apply consistently to maintain code quality and structure.

**How to apply:** When scaffolding new code or extending features, apply layered + async + type-hinted patterns and use uv/ruff for linting.
