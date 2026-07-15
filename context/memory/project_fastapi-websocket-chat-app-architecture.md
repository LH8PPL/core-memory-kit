---
id: P-CaY3MT5U
type: project
shape: State
title: FastAPI WebSocket Chat App Architecture
created_at: 2026-07-15T08:44:32Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 4ae1326e45a74e4f1e3fdf81cefbff9f433d5ef23eee2c0675e665940f3edf35
---

- Server: `app.py` with FastAPI, ConnectionManager managing active WebSocket connections, broadcast() method sends to all clients
- UI: `static/index.html` plain HTML/JS (no framework)
- Packages: fastapi, uvicorn[standard] in requirements.txt, installed to .venv
- Runs on 127.0.0.1:8000
- Message styling: own messages right-aligned blue, peers left-aligned white, system join/leave centered gray italic
- Server broadcasts to all on receive; client immediately renders own message on submit (no double-render on server echo)

**Why:** Complete, minimal chat scaffold for future reference or extension (usernames, persistence, etc.)

**How to apply:** Reference this layout when modifying—routes are / for index.html and /ws for WebSocket; ConnectionManager.disconnect() called on exceptions
