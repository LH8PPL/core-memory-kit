# Working with Cursor

[Cursor](https://cursor.com) (the AI code editor + its `cursor-agent` CLI) is a first-class target for core-memory-kit. The memory core — store, search, compression, the three-tier model — is identical to the Claude Code experience; only the per-agent wiring differs. Cursor removed its own native "Memories" feature in 2.1.x (static rules are its only built-in persistence), so the kit restores the automatic capture-and-recall loop Cursor lost.

```bash
cd ~/my-project
cmk install --with-semantic --ide cursor   # wire Cursor in this project
cmk doctor                                  # verify, then RESTART Cursor so the hooks load
```

A Cursor install wires the MCP server, the lifecycle hooks (all driving one dispatcher), and an always-applied rule. It does **not** write Claude-Code-only files (`CLAUDE.md`, `.claude/skills/`) — Cursor reads its rule + drives memory as MCP tools.

## What `--ide cursor` writes

| Surface | Location | For |
| --- | --- | --- |
| **MCP server** | `.cursor/mcp.json` (`core-memory-kit` entry; sibling servers preserved) | drives memory as tools (`mk_remember` etc.) |
| **Hooks** | `.cursor/hooks.json` — one dispatcher (`cmk cursor-hook`) on six events | the full automatic loop |
| ↳ `sessionStart` | | injects recalled memory into the new session (`additional_context`) |
| ↳ `beforeSubmitPrompt` | | captures the prompt (always `continue: true` — memory never blocks your prompt) |
| ↳ `afterAgentResponse` | | captures the turn (the content-bearing turn-end event) |
| ↳ `afterFileEdit` | | records the edit observation |
| ↳ `sessionEnd` | | runs the compress + persona tasks |
| ↳ `beforeShellExecution` | | the memory delete-guardrail — denies a destructive command against a memory path via the JSON `permission` field |
| **Rule** | `.cursor/rules/core-memory-kit.mdc` (`alwaysApply: true`) | memory-awareness in context; also the cmk-owned install marker |

## Notes

- **Restart Cursor** to activate the hooks (the rule + MCP are immediate).
- Every hook drives the **one** `cmk cursor-hook` dispatcher — it always exits 0 so a hook failure never blocks a prompt or shell command; permission-type events fail **open** on a crash (a broken memory hook must never wedge your session).
- **Windows note (why the dispatcher normalizes the project root).** Cursor on Windows passes the project root to its hooks as `/c:/Your/Project` (a leading slash before the drive letter); the kit normalizes that to a valid Windows path so capture/recall/observe land in your real project rather than a dead path (a silent no-op before v0.5.0). You don't need to do anything — this is just why the root is normalized.
- The install is **touch-only-our-keys**: your own hooks in `.cursor/hooks.json` and sibling MCP servers in `.cursor/mcp.json` are preserved; the kit refuses to clobber a corrupt file.
- A Cursor install does **not** write Claude-Code-only files (`CLAUDE.md`, `.claude/skills/`).

## cursor-agent as the automatic-memory backend (v0.4.5+)

Beyond wiring the hooks, `cursor-agent` is also the **LLM backend** for a Cursor project's automatic memory. The kit's automatic features — compression, auto-extract, the cross-project persona/wedge, the temporal sweep, daily/weekly distillation — need to run an LLM in the background, and on a Cursor install they run it through **`cursor-agent -p`**, using your existing **Cursor subscription** login (**no API key, no Claude Code required**). This is what makes the kit work for a Cursor-only user.

- **Prerequisite:** `cursor-agent` must be on your PATH — it is a **separate install from the Cursor app**, and runs natively on **Windows, macOS, and Linux**:

  ```bash
  curl https://cursor.com/install -fsS | bash          # macOS / Linux
  # Windows (PowerShell):
  irm 'https://cursor.com/install?win32=true' | iex
  ```

  Then run `cursor-agent` once and log in through the browser (it reuses your Cursor subscription — no API key). Without it on PATH, capture / search / recall / the delete-guard still work (pure files + SQLite), but the automatic LLM steps are skipped. **`cmk doctor` (HC-11)** and **`cmk install`** both tell you if it's missing.
- **The background model** is `composer-2.5-fast` (Cursor's cheap/fast tier — the "janitor" role). Note `cursor-agent -p` runs the full agent loop even in print mode, so a background compression takes ~30–80s (bounded and best-effort; it never blocks a session).
- **Split-brain (run the memory on a *different* agent than you code in):** code in Cursor but route the frequent background memory work through a cheaper CLI you have — set it at install (`cmk install --ide cursor --backend kiro`) or after (`cmk config set backend.agent kiro`). Both write the same `backend.agent` key.
- **See what's active:** `cmk config show` prints your installed-for agent, the active backend agent (and whether it's an override), the backend-CLI presence, and the semantic mode.

Cross-agent siblings: **[Kiro](KIRO.md)** · **[Claude Code](CLAUDE-CODE.md)** · **[Codex](CODEX.md)**.

## Using both Cursor and another agent on the same repo

The installs are additive — run both (e.g. `cmk install` for Claude Code and `cmk install --ide cursor`), in any order. Each writes only its own wiring and never clobbers the other's; they share one `context/` memory brain. `--with-semantic` set by either is preserved by the other.

## Uninstalling Cursor

```bash
cmk uninstall --ide cursor   # remove the Cursor surface (the kit's events in .cursor/hooks.json, the core-memory-kit entry in .cursor/mcp.json, the managed .cursor/rules/core-memory-kit.mdc block)
```

On a dual-agent project, uninstall one agent and the other keeps working — the shared `context/` is untouched either way.
