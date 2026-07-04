---
date: 2026-07-04
topic: Agent-relative LLM backend — route the kit's "Haiku call" through the AGENT'S OWN CLI so a Claude-Code-free user gets the full automatic engine (Task 200 / D-270)
source: Live probes on the installed kiro-cli (primary source) + cursor.com/docs/cli (doc-based for Cursor, not installed locally) + code read of compressor.mjs / the hook dispatchers
tags: [cross-agent, llm-backend, kiro, cursor, task-200, d-270, compressor-backend, recursion-guard]
---

# Agent-relative LLM backend (Task 200 research)

**The gap (D-270):** the kit's ENTIRE automatic-intelligence layer — auto-extract,
compression, persona/wedge, temporal-sweep, daily-distill, weekly-curate (**7
spawn sites**, all instantiating `HaikuViaAnthropicApi`) — shells out to the local
**`claude` binary** (`claude --print`). There is NO `ANTHROPIC_API_KEY` path (no
`@anthropic-ai/sdk` dep). So a user with ONLY Cursor or ONLY Kiro, who never
installed Claude Code, gets capture/search/inject/delete-guard (file-I/O + SQLite)
but every LLM step SILENTLY no-ops (spawn ENOENT → best-effort catch). The kit
degrades to a manual note store.

**The decision (D-270, the user):** route the "Haiku call" through the AGENT'S OWN
CLI — Kiro → `kiro-cli chat`, Cursor → `cursor-agent`, Claude Code → the existing
`claude --print` (unchanged). NOT a 2nd-vendor API key (a Cursor-only user
shouldn't need an Anthropic account); NOT "document Claude as a prereq" (that IS
the false promise). Extends ADR-0008's pluggable-`CompressorBackend` seam (now
un-deferred) from install-wiring (D-180) to a RUNTIME backend.

**The contract each backend must satisfy** (`compressor.mjs`): `compress({input,
instructions, timeoutMs, maxOutputBytes?}) → {outputText, costUSD?}` + `modelId()`
+ `estimatedCostPerCall()`; MUST honor `timeoutMs` (reject with a
`HaikuTimeoutError`-category error); MUST return ONLY text (the sub-model can't
act — the current backend enforces this with `--tools "" --max-turns 1`).

---

## Fork 1 — Kiro: `kiro-cli chat` as a one-shot LLM call — ✅ LIVE-CONFIRMED

`kiro-cli` is installed + logged in (Google auth — the user's own account). Probed
directly (the strongest primary source). It works, and better than expected:

```
kiro-cli chat --no-interactive --model claude-haiku-4.5 --trust-tools= "<prompt>"
```

- **`[INPUT]` positional** = the prompt ("The first question to ask").
- **`--no-interactive`** = "run without expecting user input" — the `--print`
  equivalent. Verified: returns the answer + exits 0, no TTY needed.
- **`--model claude-haiku-4.5`** — a genuine cheap Haiku (`--list-models` shows it
  at **0.40x credits**; even cheaper: `deepseek-3.2` 0.25x, `qwen3-coder-next`
  0.05x). The kit's background "Haiku role" maps directly onto it.
- **`--trust-tools=`** (empty) = trust NO tools — the sandbox (model emits text
  only). NOTE: it prints a benign WARNING about the empty value's format
  (`needs @{MCPSERVERNAME}/` prefix) but still runs correctly; the build should
  confirm the cleanest no-tools incantation (possibly `--trust-tools ''` vs a
  documented "trust nothing" form).
- **Auth:** the user's Kiro login (`kiro-cli whoami` → logged in). **NO
  `ANTHROPIC_API_KEY`, no Claude Code.** This is the whole point — the user uses
  what they already have.
- **Cost/latency (LIVE):** a 3-word reply cost **0.01 credits in ~1 second**.
  Cheap + fast enough for background compaction.

**Live result:** `kiro-cli chat --no-interactive --model claude-haiku-4.5 "Reply
with exactly: HELLO_WORLD_42"` → `HELLO_WORLD_42`, exit 0. The kit's compaction
prompts are larger but the shape is identical.

### Output parsing — ✅ SOLVED (answer is clean on STDOUT)

The interactive TUI noise (ANSI spinner frames, `N of 1 hooks finished`, the
`Credits: … Time: …` footer) all goes to **stderr**. **stdout carries ONLY the
answer**, prefixed with a `> ` prompt marker and ANSI color codes:

```
stdout (raw):      \x1b[38;5;141m> \x1b[0mHELLO_WORLD_42
stdout (parsed):   HELLO_WORLD_42        # strip ANSI, strip leading "> "
```

So the backend parse is: **capture stdout only, strip ANSI escape sequences, strip
the leading `> `** → the clean model output. (A future `--format json` for the
chat path would be cleaner, but today it's documented only for `--list-*`; the
strip-stdout approach is verified-working.)

---

## Fork 2 (the CRITICAL fork) — recursion: spawning the agent CLI from INSIDE its own hook — 🔴 REAL, ✅ GUARD DESIGNED

**The hazard is not theoretical — I reproduced it live.** Running `kiro-cli chat`
in a directory where the kit is installed **fired the kit's OWN `agentSpawn` inject
hook** (`cmd.exe /c cmk hook agentSpawn`), which called back into `cmk` — and
timed out (`✗ … failed after 10.15 s: command timed out after 10000 ms`). If the
kit spawns `kiro-cli chat` as its LLM backend from inside a Kiro `stop`/`sessionEnd`
hook, that inner `kiro-cli` fires the hooks AGAIN → recursion / a timeout storm.

**Every recursion vector routes through ONE function:** `dispatchKiroHook` (and
`dispatchCursorHook` for Cursor) — the profile wires `agentSpawn`/`userPromptSubmit`/
`stop`/`postToolUse` all to `cmk hook <event>` → the one dispatcher.

**The guard (env-var re-entrancy flag):** when the kit spawns the agent's CLI as its
backend, set **`CMK_BACKEND_SPAWN=1`** in the child's env. At the ENTRY of each hook
dispatcher, `if (process.env.CMK_BACKEND_SPAWN) return {action:'noop', exitCode:0}`.
The inner `kiro-cli`/`cursor-agent` inherits the var (standard child-env
inheritance — LIVE-VERIFIED the var reaches the child) → its fired hooks all no-op
instantly → the loop is broken at every vector with one check.

- **Verified:** env inheritance works through the `kiro-cli` spawn; with the guard
  added, the 39 hook-fire attempts become instant no-ops instead of recursive
  `cmk` calls; the answer still comes back clean on stdout.
- **Belt-and-suspenders (build decision):** also pass a hook-free / minimal
  `--agent` if one can be created (Kiro's `agent create` exists), OR run the
  backend spawn in a temp cwd with no `.kiro/`/`.cursor/` so no project hooks are
  discovered. The env-guard is the primary defense; the temp-cwd is redundant
  insurance (and the current `claude --print` backend already runs in `tmpdir()`).

---

## Fork 3 — Cursor: `cursor-agent -p` — ⚠️ DOC-CONFIRMED EXISTS, needs a LIVE probe in the build

`cursor-agent` is NOT installed on the dev machine (only the `cursor` IDE
launcher), so this is doc-based (cursor.com/docs/cli) — weaker than the Kiro live
probe. What the docs confirm:

- **Headless one-shot EXISTS:** `agent -p "<prompt>"` (`-p`/`--print` = non-
  interactive mode). Install: `curl https://cursor.com/install -fsSL | bash`.
- **Output formats:** `--output-format text` (default for `-p`) | `json` |
  `stream-json`. **JSON output is available** — likely cleaner to parse than
  Kiro's strip-stdout (a build advantage for Cursor).
- **Auth:** `CURSOR_API_KEY` env var (docs/cli/headless). Whether it ALSO works off
  the logged-in desktop session is unconfirmed — **build must verify**, because if
  it needs a separate `CURSOR_API_KEY` that's a small friction (though still not a
  Claude dependency).

**NOT documented (the build's live-probe checklist — `agent --help` on a real
install):** (a) a `--model` flag + valid cheap model names (the Kiro-equivalent of
`claude-haiku-4.5`); (b) a tool-disabling / text-only sandbox flag (the
`--tools ""` equivalent — load-bearing so the sub-model can't act); (c) the
recursion behavior (does `agent -p` fire `.cursor/hooks.json`? — Cursor's hooks
docs say `sessionStart`/`afterAgentResponse` do NOT fire in cloud/headless, which
would actually REDUCE the recursion surface vs Kiro — but `beforeShellExecution`/
`afterFileEdit` DO fire in headless, so the `CMK_BACKEND_SPAWN` guard is still
required); (d) the reported `-p`-hangs bug (forum, Feb 2026 — must reproduce/rule
out with a timeout leash, which the backend has anyway).

**Honest status:** Cursor's backend is FEASIBLE (headless CLI + JSON output +
auth all exist) but the exact invocation is NOT yet primary-verified. The build
starts with `curl install` + `agent --help` + a `-p` probe, mirroring the Kiro
live probe done here. Do NOT claim Cursor verified from docs alone (the §5.1 rule).

---

## Fork 4 — model selection (the cheap/fast background role)

- **Kiro:** ✅ `--model claude-haiku-4.5` (0.40x) confirmed; cheaper options exist.
  The backend should default to a cheap model + let it be overridden (config).
- **Cursor:** ⚠️ `--model` not documented — build must probe. If Cursor has no
  model pick, the backend uses whatever default `agent -p` runs (acceptable — the
  compaction prompts are simple).

---

## Fork 5 — cost / latency vs `claude --print`

- **Kiro:** 0.01 credits / ~1 s for a tiny call (LIVE). Comparable to `claude
  --print`; the kit's timeout ceilings (50s SessionEnd, ceiling-free lazy) already
  bound it.
- **Cursor:** TBD in the build; the same timeout leash applies.
- Both are the USER'S existing subscription credits — no new billing relationship.

---

## Fork 6 — does headless run in the ENV the hook fires in?

- **Kiro:** the `stop`/`sessionEnd` hooks run `cmk hook`/`cmk-compress-session` in
  the project cwd with the user's env — `kiro-cli` is on PATH there (it's how the
  hook itself got invoked). ✅ same-env spawn works. Strip `CLAUDECODE` (as the
  current backend does) + set `CMK_BACKEND_SPAWN`.
- **Cursor:** the `sessionEnd`/`afterAgentResponse` hook runs `cmk cursor-hook`;
  whether `cursor-agent` is on PATH in that env is a build-probe item (likely yes
  if the user installed the CLI; if the IDE bundles a different binary path, the
  backend resolves it like the current `DEFAULT_CLAUDE_BIN` platform logic).

---

## Design sketch — the backend-selection seam (for design.md §16.50.x)

1. **A `CompressorBackend` per agent** (ADR-0008's seam):
   - `HaikuViaClaudeCli` (rename of the misnamed `HaikuViaAnthropicApi`) — the
     existing `claude --print` path, unchanged (no regression for Claude Code).
   - `KiroCliBackend` — `kiro-cli chat --no-interactive --model <cheap> --trust-tools=`,
     stdin/argv prompt, parse-stdout-strip-ANSI, `CMK_BACKEND_SPAWN` guard, timeout.
   - `CursorAgentBackend` — `cursor-agent -p --output-format json <prompt>` (pending
     the live-probe of the exact flags), parse JSON, guard, timeout.
2. **Selection:** by the agent the project was installed for (the `detectInstallKind`
   the doctor already uses: `.claude/settings.json` → claude-cli; `.kiro/steering/cmk.md`
   → kiro; `.cursor/rules/claude-memory-kit.mdc` → cursor). The 7 spawn sites call a
   `makeBackend({projectRoot})` factory instead of `new HaikuViaAnthropicApi()`.
3. **Graceful degradation:** if the selected agent's CLI is absent/erroring, the
   backend fails best-effort (as today) BUT the kit should SURFACE it (a doctor
   HC: "the LLM backend for <agent> isn't reachable — automatic memory is degraded")
   instead of silently no-opping — that silent-no-op IS the D-270 bug.
4. **The recursion guard** (`CMK_BACKEND_SPAWN`) at both dispatcher entries — the
   load-bearing new invariant; a test must assert an inner hook no-ops when set.
5. **`scripts/live-test.mjs` becomes agent-parametric** — it hardcodes `claude`
   today; it must select the backend by installed agent so the LIVE test actually
   exercises the Claude-free path (the harness that would otherwise hide this bug,
   the D-84 class one level up).

## Verdict

**Kiro backend: proven feasible + the mechanism is fully worked out (live).** Output
parsing solved, recursion guard designed + env-inheritance verified, cheap Haiku +
the user's own auth confirmed. **Cursor backend: feasible, headless + JSON + auth
all exist, but the exact invocation needs a live `agent --help`/`-p` probe in the
build** (don't claim verified from docs). The build is a real **L**: rename + 2 new
backends + the selection factory + the recursion guard + the degradation-surfacing
doctor check + the agent-parametric live-test harness + per-agent live verification
on a machine WITHOUT `claude`. But there is no blocker — every hard question
(recursion, parsing, auth, cost) now has a verified answer for Kiro and a clear
build-probe for Cursor.
