# Working with Codex

claude-memory-kit runs on [Codex](https://developers.openai.com/codex) — OpenAI's coding
agent — with the same automatic memory loop as Claude Code, Kiro, and Cursor: recalled
memory injects at session start, every turn is captured, edits are observed, and the
delete-guardrail screens shell commands.

```bash
cmk install --ide codex                 # wire Codex end-to-end
cmk install --ide codex --with-semantic # …with local semantic recall
```

## What `--ide codex` writes

| Surface | File | What it does |
| --- | --- | --- |
| Hooks | `.codex/hooks.json` | `SessionStart` recall-inject + `UserPromptSubmit` prompt-capture + `Stop` turn-capture + `PostToolUse` (matcher `apply_patch\|Edit\|Write`) edit-observation + `PreToolUse` (matcher `Bash`) delete-guardrail — all driving one dispatcher, `cmk codex-hook` |
| MCP | `~/.codex/config.toml` `[mcp_servers]` | registered via Codex's own `codex mcp add claude-memory-kit -- cmk mcp serve` — the kit never hand-edits your TOML |
| Instructions | `AGENTS.md` | a managed block pointing the agent at the recall surface (`cmk search` / `cmk remember`) — Codex reads AGENTS.md natively |
| Memory | `context/` (+ `context.local/`, `~/.claude-memory-kit/`) | the same agent-neutral tiers every other agent shares |

## The one-time trust step (important)

Codex **hash-trusts hooks**: a new (or changed) non-managed hook is *skipped* until you
review it. After install, run `/hooks` once inside Codex and trust the kit's entries —
until then the automatic layer stays silent. (Same one-time-trust class as Kiro's MCP
click.) A kit upgrade that changes the hook command re-requires the review — `cmk doctor`
reminds you on its HC-1 line.

## Notes

- **Turn capture reads the rollout file.** Codex's `Stop` payload is status-only, but every
  hook payload carries `transcript_path` — the kit reads the last user/agent messages from
  the session's rollout (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`).
- **No SessionEnd event.** Codex's hook list has no session-end trigger, so end-of-session
  compression rides the lazy roll + optional cron paths (exactly like Kiro).
- **Codex Desktop app**: the desktop app bundles `codex.exe` off-PATH, so the install's
  automatic `codex mcp add` may not find it — the install prints the one-liner to run
  yourself. The CLI (`npm i -g @openai/codex`) puts `codex` on PATH and everything is
  automatic.
- Codex is growing its own native memory surfaces (a `memory_citation` field appears in
  rollouts). The kit's memory is in-repo and agent-neutral — they coexist; the kit never
  touches Codex's internal stores.

## codex as the automatic-memory backend

On a `--ide codex` install the kit's background LLM work (compression, auto-extract,
persona, temporal sweep) runs through **`codex exec`** — your existing ChatGPT/Codex
login, no `claude` binary, no API key. The call is sandboxed read-only (`-s read-only`),
never executes model-generated commands, and is guarded against hook recursion
(`CMK_BACKEND_SPAWN`). Split-brain works too: `cmk install --backend codex` on any
install routes just the background memory chore through Codex.

## Using both Codex and another agent on the same repo

`context/` is agent-neutral — install for both (`cmk install` + `cmk install --ide codex`)
and the two agents share one memory brain. `AGENTS.md` carries a single managed block
(re-installs fold duplicates).

## Uninstalling Codex

```bash
cmk uninstall --ide codex # remove the kit's hooks.json events + the AGENTS.md block + codex mcp remove
```

Conservative: your own hooks/config outside the kit's entries are byte-preserved, and
`context/` is never touched.

> **Shared-registration caveat:** Codex's MCP registration is **user-level**
> (`~/.codex/config.toml`), shared by every project. Uninstalling the kit from one
> project deregisters it for all of them — if another project still uses the kit on
> Codex, re-run `cmk install --ide codex` there (idempotent) or re-add with
> `codex mcp add claude-memory-kit -- cmk mcp serve`.
