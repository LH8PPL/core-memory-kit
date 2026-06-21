# RESUME HERE — 2026-06-21 (Kiro rework in flight)

> Context-compact breadcrumb. Branch `task-50-kiro-cli` (PR-2) is in flight. PR-1 already MERGED to main.

## Latest state (top of mind)

- **v0.3.5 SHIPPED** (npm + GitHub Release). Tag pushed earlier this session.
- **Task 50 (cross-agent, Kiro) — REWORK in progress (D-182/D-183).** The original #210 Kiro profile was wrong against the live tool; reworked through a 14-project survey + the AWS Rust contract + live-testing on the user's real Kiro.
- **PR-1 MERGED (#212):** shared 3 surfaces (MCP + steering + skills) + **IDE hooks** (`.kiro/hooks/*.kiro.hook`).
- **PR-2 IN FLIGHT (branch `task-50-kiro-cli`, NOT pushed yet):** the **CLI agent-config** + guarded default-agent (50.L done, committed `9c85863`). Full suite 2132/0.

## What's built in PR-2 (committed, not pushed)

- `kiro-cli-agent.mjs` — writes `~/.aws/amazonq/cli-agents/q_cli_default.json` (Amazon-Q Rust contract: `hooks{agentSpawn,stop}`, `timeout_ms`, platform `cmd.exe /c cmk hook` command). **Guarded default-agent** (named `cmk.json` + `skipped-existing` notice if a user default exists).
- `kiro-hook-command.mjs` — shared platform-correct command (extracted from kiro-ide-hooks; both surfaces use it).
- `installKiro` now wires the **5th surface** (`cli-agent`); reports `cliDefaultAgent`.
- **`MEMORY_KIT_AWS_DIR` env override** sandboxes the `~/.aws` write (a live-test caught a real bug writing to the real `~/.aws` — see P-3Y6MCN2B).

## What's LEFT for PR-2 → then v0.4.0

1. **PR-2 housekeeping (next):** README + CHANGELOG (CLI-agent surface), DECISION-LOG D-183 update (or a D-184 for the CLI surface), build-log entry, the `cli-mcp-parity`/`doc-completeness` validators (the `hook` verb is already CLI_ONLY). Then stress 5/5 → push branch → PR-2 → two-pass review → merge.
2. **The batched manual live-test (the user's plan, P-FA4ALL42):** do it ONCE after ALL v0.4.0 code lands — one Kiro session verifies BOTH surfaces (IDE `.kiro.hook` capture-fires + CLI agent + default-agent). The 8-point checklist (D-182). **ALWAYS set `MEMORY_KIT_AWS_DIR=<tmp>` + `MEMORY_KIT_USER_DIR=<tmp>`** so the real `~/.aws`/user-tier are never touched.
3. **Cut v0.4.0** once both PRs merged + the live-test passes.

## Key verified facts (all in memory — `cmk search "Kiro"`)

- Kiro hook input = argv(event) + env(`USER_PROMPT`) + cwd + transcript FILE, NOT stdin (P-CJYGTQYR).
- Windows: Kiro runs hooks via WSL (no node) → command MUST be `cmd.exe /c cmk hook <event>` (P-PM2CD6CB, live-proven).
- `.kiro.hook` format verified from a real GUI hook (P-WJRUQVSW). IDE hooks auto-fire `agentStop` with `runCommand` (the kit is the FIRST to do deterministic capture — 40+ surveyed hooks are all `askAgent`).
- The CORE is shared: `cmk hook stop` and Claude Code's bin both call the SAME `captureTurn()`; Kiro files are only the input adapter (P-7QBE6A6M).
- `~/.aws` write safety: always `MEMORY_KIT_AWS_DIR` in tests/live-checks (P-3Y6MCN2B).

## Orientation

- Status/next: [`specs/tasks.md`](specs/tasks.md) "Current state" + Task 50 (50.A–50.M; I/J/K/L done, M = live-test).
- Decisions: [`DECISION-LOG.md`](docs/journey/DECISION-LOG.md) — D-180 → D-181 (wrong build) → D-182 (settled) → D-183 (PR-1).
- Research: `docs/research/2026-06-20-kiro-automatic-memory-deep-research.md` + `2026-06-21-kiro-install-path-settled.md`.

## To resume, say:

`continue Kiro PR-2` (finish PR-2 housekeeping → push → PR → merge), or `start the Kiro live-test` (the batched manual check).
