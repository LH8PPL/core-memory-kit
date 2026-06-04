# live-test findings — 2026-06-04

**27 pass · 2 fail · 0 skip** · claude 2.1.160 (Claude Code)

- [x] **S0-install** — cmk 0.2.0 (real artifact, isolated)
- [x] **S1-install** —   Note: Claude Code's native Auto Memory keeps running alongside the kit (both fill over time). For one lean memory layer, run `cmk disable-native-memory`.
- [x] **S1-doctor-0fail** — 6 pass · 0 fail · 3 skip (1354ms)
- [x] **S1-skill-safe** — safe skill scaffolded (no Edit/Write, NEVER gate)
- [x] **S1-claudemd-slim** — CLAUDE.md block slim (skill pointer, no fat procedure)
- [x] **S1-hooks-allow** — settings.json: hooks + cmk allow-list
- [x] **S1-no-placeholder** — no {{placeholder}}; install date rendered
- [x] **S1-no-username-leak** — no username in committed scaffold
- [x] **S2-0-build** — 1 .py file(s) built
- [x] **S2-0-output** — turn output references the work
- [x] **S2-1-build** — package shape built (2 .py files)
- [x] **S2-2-build** — type hints present in built source
- [x] **S2-3-build** — .venv added to a .gitignore
- [x] **B1-autocapture** — 4/4 build-turn signals captured (no "remember this")
- [x] **B2-rich-capture** — 4 fact file(s)
- [x] **B3-persona-fills** — user tier filled with cross-project style
- [x] **B4-stated-rule-high** — uv/ruff rule promoted at trust:high
- [x] **C1-terse** — terse cmk remember → MEMORY.md
- [x] **C2-rich** — rich fact file with Why/How
- [x] **C3-poison-guard** — Poison_Guard rejected the secret (exit 2)
- [x] **C3-no-write** — rejected secret wrote NOWHERE on disk
- [x] **C4-sanitize** — home path → ~ (no username)
- [x] **S69-no-hand-edit** — no hand-edit of memory files (tools: Read,Edit)
- [x] **S69-skill-no-leak** — no username leaked from the "remember this" capture
- [x] **S69-audited** — audit.log has write entries (cmk-routed)
- [ ] **D1-recall** — recalled 0/5 persona signals in a fresh session
- [ ] **D2-from-memory** — code-read to answer not-in-code facts — the Task-75 active-recall gap (tools: Glob)
- [x] **S5-install-B** — projectB scaffolded
- [x] **E1-cold-open** — applied 3/3 persona signals (text+built; package built=true, 8 .py)

## Session-2 recall (tools: Glob)

No additional entries in the slug-based memory path — everything above is the complete picture from your injected snapshot. Nothing beyond what's listed.

## Session-3 cold-open (built 8 .py files)

All green. Here's the layout:

```
projectB/
├── src/
│   ├── api/
│   │   ├── health.py      # GET /api/v1/health
│   │   └── router.py      # aggregates all sub-routers
│   └── main.py            # app factory + module-level app instance
├── tests/
│   └── test_health.py     # boundary test (ASGI transport, no real server)
└── pyproject.toml         # ruff + pytest config, uv-managed deps
```

**Run it locally:**
```
uv run uvicorn src.main:app --reload
```

**Key decisions:**
- `create_app()` factory in `main.py` keeps the app testable without side-effects on import
- Each feature gets its own router module — `router.py` is just an aggregator, never business logic
- `asyncio_mode = "auto"` in pytest so async tests need no decorator
- ruff configured with `E, F, I, UP, B, SIM` — catches style, imports, and common bugs

Add your next endpoint by creating `src/api/<feature>.py`, adding a router there, and including it in `src/api/router.py`.

### built source (excerpt)
def main():
    print("Hello from projectb!")


if __name__ == "__main__":
    main()

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/health", tags=["health"])


class HealthResponse(BaseModel):
    status: str


@router.get("", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(status="ok")

from fastapi import APIRouter

from src.api import health

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)


from fastapi import FastAPI

from src.api.router import api_router


def create_app() -> FastAPI:
    app = FastAPI(title="projectb", version="0.1.0")
    app.include_router(api_router)
    return app


app = create_app()


import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


async def test_health_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {
