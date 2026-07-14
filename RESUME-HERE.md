# RESUME HERE — 2026-06-21 (Kiro v0.4.0 — gate caught 4 cut-blockers, all fixed; live IDE/CLI test is what's left)

> **UPDATE: v0.4.0 SHIPPED** (npm + GitHub Release) — the three surfaces (Claude Code, Kiro IDE 1.0.52, kiro-cli V3 2.9.0) are all live-proven. The handoff state below is the point-in-time breadcrumb from BEFORE the cut; the operational `~/.aws` / `MEMORY_KIT_AWS_DIR` / `.kiro.hook` references in it have been corrected inline to the shipped paths (`~/.kiro/agents/cmk.json`, `MEMORY_KIT_KIRO_DIR`, v1 `.json` IDE hooks).
>
> On `main`, mid the **`cut-gate-kiro.md` live-test (50.M)**. The release is cut locally (v0.4.0, NO tag). §0 + §1 (install/scaffold + KG1–KG10) all PASS. The gate's first steps surfaced **4 real cut-blockers** — all merged + fixed. What's left: the **live IDE/CLI hook-firing checks (KH/KC — need real Kiro)**, then cut v0.4.0.

## ✅ Done — all merged to main

- **Kiro 5 surfaces (PRs #212/#213):** MCP + steering + skills + IDE hooks (`.kiro/hooks/`) + CLI agent (`~/.kiro/agents/cmk.json`, registered as default via `~/.kiro/settings/cli.json` — moved from the original `~/.aws/amazonq/cli-agents/` in D-198). D-182/183/184.
- **The gate found 6 cut-blockers, all fixed + merged** (each "unit-green but broken on real input" / "a Claude-Code-only mechanism not carried to the Kiro path"):
  - **#214 (D-185/186):** `cmk doctor` was Claude-only → HC-1 false-FAILed on Kiro. Now agent-aware capability check (IDE hooks OR CLI agent).
  - **#215 (D-187):** a BOM'd `settings.json` made the guard clobber the user's default agent. Kit-wide BOM-tolerant config reads (`read-json.mjs`).
  - **#216 (D-188/189):** `--ide kiro` left dead `.claude/skills` + a broken `prompt:file://AGENTS.md`. Now a clean per-agent OVERLAY: writes `AGENTS.md`, skips (never clobbers) Claude files, dual-agent coexistence, `cmk uninstall --ide kiro`. Verified vs 5 primary sources.
  - **#217 (D-190/191):** the Kiro `agentSpawn` hook flashed a `node` console window (Task-81 fix wasn't carried to the Kiro path → `injectContext` self-resolves the bin now); `cmk uninstall --ide kiro` left empty husks AND its first-cut husk-remover had a skill-review-caught data-loss bug (a regex that deleted user steering notes bordered by `---`) → fixed to a ReDoS-safe line-scan + gated on per-file changed. User Qs ("why `.claude`?", "are you sure uninstall works?") + the two-pass review caught all of it.
- **Gate doc** (`cut-gate-kiro.md`) updated: KG10 (AGENTS.md/no-Claude), KU1/KU2 (per-agent + dual-agent uninstall), KG1b (agent-aware HC-1).
- **README** has the user-asked **"Working with Kiro" + "Uninstalling"** sections.
- **Backups protocol:** real dirs backed up in `C:\cut-gate-backups\12_v0.4.0_kiro\` (BEFORE-*); gate runs against REAL `~/.kiro` + user tier (no env-var sandbox); restore at the end. The KG7 guard probe is the one surgical `MEMORY_KIT_KIRO_DIR` use.

## ▶ What's LEFT

1. **Rebuild the artifact** so the global `cmk` has all 4 fixes (the gate tests the installed binary): §0b only — `cd packages/cli; npm pack; npm uninstall -g; npm install -g .\lh8ppl-core-memory-kit-0.4.0.tgz`. (Version stays 0.4.0 — fixes are content. The EBUSY warning on uninstall is harmless.) Do NOT re-cut (§0a done) or re-backup (§0c done).
2. **The live IDE/CLI checks — needs YOU in real Kiro** (say `start the Kiro live-test`): open `C:\Temp\kiro-gate` in Kiro IDE, run **Session 1** (the build arc, §2), then I verify **KH1/KH2/KH3** (IDE `agentStop` capture + `promptSubmit` inject FIRE). Then `kiro-cli chat` with NO `--agent` for **KC1–KC4** (default resolves + `agentSpawn`/`stop` fire + MCP reach). These are the only checks unit tests can't reach.
3. **Cut v0.4.0** once the live checks pass: review the CHANGELOG/READMEs are current → the USER pushes the `v0.4.0` tag (publish.yml does npm + GitHub Release).
4. **After the cut:** re-run `cmk install` on THIS dev repo to clear the HC-9 version-drift (deferred during the gate).

---

> (Earlier breadcrumbs below — superseded by the section above for the most-current state.)

## Latest state (top of mind)

- **v0.3.5 SHIPPED** (npm + GitHub Release). Tag pushed earlier this session.
- **Task 50 (cross-agent, Kiro) — REWORK in progress (D-182/D-183).** The original #210 Kiro profile was wrong against the live tool; reworked through a 14-project survey + the AWS Rust contract + live-testing on the user's real Kiro.
- **PR-1 MERGED (#212):** shared 3 surfaces (MCP + steering + skills) + **IDE hooks** (`.kiro/hooks/*.kiro.hook`).
- **PR-2 IN FLIGHT (branch `task-50-kiro-cli`, NOT pushed yet):** the **CLI agent-config** + guarded default-agent (50.L done, committed `9c85863`). Full suite 2132/0.

## What's built in PR-2 (committed, not pushed)

- `kiro-cli-agent.mjs` — writes the kiro-cli agent config (`hooks{agentSpawn,userPromptSubmit,postToolUse,stop,preToolUse}`, `timeout_ms`, platform `cmd.exe /c cmk hook` command). **Guarded default-agent** (named `cmk.json` + `skipped-existing` notice if a user default exists). _(Superseded operational detail: this breadcrumb originally wrote `~/.aws/amazonq/cli-agents/q_cli_default.json` — that path was the **D-198 bug**; kiro-cli never read it. The shipped location is **`~/.kiro/agents/cmk.json`**, registered as default via `~/.kiro/settings/cli.json`.)_
- `kiro-hook-command.mjs` — shared platform-correct command (extracted from kiro-ide-hooks; both surfaces use it).
- `installKiro` now wires the **5th surface** (`cli-agent`); reports `cliDefaultAgent`.
- **`MEMORY_KIT_KIRO_DIR` env override** sandboxes the `~/.kiro` write (in tests/live-checks). _(Superseded operational detail: this breadcrumb originally named `MEMORY_KIT_AWS_DIR` sandboxing a `~/.aws` write — the write target moved to `~/.kiro` in D-198; `MEMORY_KIT_AWS_DIR` is now only a back-compat alias for the base.)_

## What's LEFT for PR-2 → then v0.4.0

1. **PR-2 housekeeping (next):** README + CHANGELOG (CLI-agent surface), DECISION-LOG D-183 update (or a D-184 for the CLI surface), build-log entry, the `cli-mcp-parity`/`doc-completeness` validators (the `hook` verb is already CLI_ONLY). Then stress 5/5 → push branch → PR-2 → two-pass review → merge.
2. **The batched manual live-test (the user's plan, P-FA4ALL42):** do it ONCE after ALL v0.4.0 code lands — one Kiro session verifies BOTH surfaces (IDE hooks capture-fires + CLI agent + default-agent). The 8-point checklist (D-182). **ALWAYS set `MEMORY_KIT_KIRO_DIR=<tmp>` + `MEMORY_KIT_USER_DIR=<tmp>`** so the real `~/.kiro`/user-tier are never touched. _(Superseded operational detail: this breadcrumb originally said `MEMORY_KIT_AWS_DIR` / `~/.aws` / `.kiro.hook` — the CLI write target moved to `~/.kiro` (D-198) and the IDE format moved to v1 `.json` (D-203); the sandbox var is `MEMORY_KIT_KIRO_DIR`.)_
3. **Cut v0.4.0** once both PRs merged + the live-test passes.

## Key verified facts (all in memory — `cmk search "Kiro"`)

- Kiro hook input = argv(event) + env(`USER_PROMPT`) + cwd + transcript FILE, NOT stdin (P-CJYGTQYR).
- Windows: Kiro runs hooks via WSL (no node) → command MUST be `cmd.exe /c cmk hook <event>` (P-PM2CD6CB, live-proven).
- `.kiro.hook` format verified from a real GUI hook (P-WJRUQVSW). IDE hooks auto-fire `agentStop` with `runCommand` (the kit is the FIRST to do deterministic capture — 40+ surveyed hooks are all `askAgent`).
- The CORE is shared: `cmk hook stop` and Claude Code's bin both call the SAME `captureTurn()`; Kiro files are only the input adapter (P-7QBE6A6M).
- `~/.kiro` write safety: always `MEMORY_KIT_KIRO_DIR` in tests/live-checks. _(Superseded operational detail: originally `MEMORY_KIT_AWS_DIR` / `~/.aws` — moved to `~/.kiro` in D-198; the AWS var is now a back-compat alias.)_

## Orientation

- Status/next: [`specs/tasks.md`](specs/tasks.md) "Current state" + Task 50 (50.A–50.M; I/J/K/L done, M = live-test).
- Decisions: [`DECISION-LOG.md`](docs/journey/DECISION-LOG.md) — D-180 → D-181 (wrong build) → D-182 (settled) → D-183 (PR-1).
- Research: `docs/research/2026-06-20-kiro-automatic-memory-deep-research.md` + `2026-06-21-kiro-install-path-settled.md`.

## To resume, say:

`continue Kiro PR-2` (finish PR-2 housekeeping → push → PR → merge), or `start the Kiro live-test` (the batched manual check).
