# cmk — full test + cut gate (CURSOR)

**The Cursor counterpart to [`cut-gate.md`](cut-gate.md).** Same rigor, same shape — but every Claude-Code surface is swapped for its Cursor equivalent. Version-agnostic; reused every cut that ships a Cursor change.

> **What's different from the Claude-Code gate (read this first):**
>
> - **Install command:** `cmk install --with-semantic --ide cursor` (NOT bare `cmk install`).
> - **One client, three surfaces.** Cursor is a VS Code fork with a first-class hooks system. `cmk install --ide cursor` wires **three surfaces** — and unlike Kiro (which needed a bespoke five-surface orchestrator), Cursor rides the **generic** per-profile installer (`installAgent`), the proof-of-thesis that the D-180 "agent = thin DATA" seam works:
>   - **hooks** → a dedicated `.cursor/hooks.json` (`{version:1, hooks:{<event>:[{command}]}}`). Every wired event carries ONE command — `cmk cursor-hook` — because Cursor hooks speak **JSON over stdio in both directions** and the event name rides IN the payload (`hook_event_name`), so a single dispatcher routes all six events. Six legs: `sessionStart` (inject) · `beforeSubmitPrompt` (capture-prompt) · `afterAgentResponse` (capture-turn) · `afterFileEdit` (observe-edit) · `sessionEnd` (compress) · `beforeShellExecution` (the D-192 delete-guard).
>   - **MCP** → `.cursor/mcp.json` (`mcpServers.claude-memory-kit`, stdio `cmk mcp serve`).
>   - **instruction** → `.cursor/rules/claude-memory-kit.mdc` (`alwaysApply: true` frontmatter — the **`.mdc` extension is load-bearing**; Cursor IGNORES a plain `.md` in `.cursor/rules/`).
> - **The hook surface is an input adapter only** — `cmk cursor-hook` reads Cursor's JSON payload and calls the SAME `injectContext()` / `captureTurn()` / `observeEdit()` / `decideGuard()` cores as Claude Code. So the **memory core is identical**; this gate verifies the **Cursor wiring**, not the core again (the core is gated by [`cut-gate.md`](cut-gate.md) + the suite).
> - **★★ RESTART CURSOR AFTER INSTALL — BEFORE any live check (BINDING — the D-262 class).** Cursor loads `.cursor/hooks.json` at session start. A session open BEFORE `cmk install` (or before a Cursor **extension/app update**) has NOT loaded the just-wired hooks — the inject/capture/guard won't fire, and the check falsely appears to FAIL. This is the exact D-262 trap the Claude-Code + Kiro gates hit: *"hooks load at session start; after you change WHAT PROVIDES the hook, the session must reload."* **Fully quit + reopen Cursor after install, before §1's live checks.** A "hook didn't fire" symptom is a stale-session symptom until you've restarted and re-confirmed.
> - **★★ Test the REAL paths — back up, run for real, restore (BINDING — the D-84 real-input rule).** This gate runs against your **real** `~/.claude-memory-kit` (user tier) — because that's exactly what a real user hits; a sandbox would hide a path bug. The safety is the **backup-before / restore-after** protocol (§0b), NOT env-var redirection. Cursor's own config is per-project (`.cursor/` in the throwaway project dir) — nothing machine-global to back up on the Cursor side, unlike Kiro's `~/.kiro`.
>
> **This is the Task-196 Cursor live-test.** It is the surface-verification half — the CLI-side wiring was live-verified from `c:\tmp` during the build (install → inject → capture → guard-deny → uninstall), but the **real-Cursor-SESSION half** (drive a real Cursor chat, watch the snapshot arrive + a fact capture) is what only this gate proves.
>
> **Cutting alongside: `v0.4.5`** (the Cursor lane). **This gate does NOT cut the release** — a Cursor-touching cut runs [`cut-gate.md`](cut-gate.md) §0 for the actual version bump + tag; THIS gate is the Cursor live-test that must pass before that tag. _Replace `0.4.5` / `v0.4.5` below if you reuse this guide for a later Cursor-touching cut._

It exercises every Cursor surface end-to-end on the **real installed artifact**: install (all 3 surfaces), the always-applied rule, the six hooks (inject / capture-prompt / capture-turn / observe-edit / compress / delete-guard), the **MCP tools driven in a real Cursor session**, organic capture, recall, the cold-open wedge, and the Cursor-specific uninstall — proving the Cursor wiring the suite can't reach.

---

## How to read this

- **★ = cut-gate check.** Every ★ must pass to ship the Cursor change. The rest is the full sweep — run it so nothing ships untested.
- Each check is one line you can tick, followed by the **action** (a code block) and a **PASS:** line.
- Throwaway probes use their own temp dirs and never touch your main run.
- **Time:** ~40–55 min.
- **Prereqs:** **Cursor installed** (a recent build with the hooks system — `.cursor/hooks.json` support; the hooks feature shipped 2026). Python 3.12+ on PATH (for `--with-semantic`).

> **★★ The real-input rule (binding — D-84).** A check **PASSES only when it ran on REAL input that exercises the feature** — never "the command didn't crash." A hook that is *registered* but never *fires-and-captures-a-real-turn* is **unverified**, not a pass. The hook checks below FAIL if you only confirm the file exists.

> **★★ The backup rule (binding — D-184).** Before ANY live Cursor session that writes to your real user tier, run the **§0b backup block** — it snapshots your real `~/.claude-memory-kit` into `C:\cut-gate-backups\<n>_v0.4.5_cursor\`. The gate writes to the **real** user dir; the **§Verdict restore block** preserves the test artifacts as evidence and puts your original back.

---

## 0. Build the REAL artifact + back up the user tier

> **No §0a release-cut here.** The version bump + tag is the base [`cut-gate.md`](cut-gate.md)'s job (Cursor rides an existing lane's cut). This gate assumes the artifact reports the version you're shipping — build it below and confirm.

**0a — build + install the real artifact.**

```powershell
cd C:\Projects\claude-memory-kit\packages\cli
npm pack                             # → lh8ppl-claude-memory-kit-<version>.tgz
npm uninstall -g @lh8ppl/claude-memory-kit
# Use the EXPLICIT filename npm pack printed — PowerShell does NOT glob `*.tgz`.
npm install -g .\lh8ppl-claude-memory-kit-0.4.5.tgz
cmk --version                        # ✅ matches packages/cli/package.json
# (If `npm uninstall -g` warned EPERM on better_sqlite3.node — a Windows file
#  lock from a running MCP server — it's benign; the reinstall still lands.)
```

**0b — back up the real user tier (the safety net).**

```powershell
$root = "C:\cut-gate-backups"
New-Item -ItemType Directory -Force $root | Out-Null
$stamp = (Get-Date -Format "yyyyMMdd_HHmmss")
$run   = "13_v0.4.5_cursor_$stamp"     # bump the leading index per your backup convention
$bk    = Join-Path $root $run
New-Item -ItemType Directory -Force $bk | Out-Null
if (Test-Path "$env:USERPROFILE\.claude-memory-kit") {
  Copy-Item "$env:USERPROFILE\.claude-memory-kit" (Join-Path $bk "claude-memory-kit") -Recurse -Force
}
"backed up user tier → $bk"
```

**0c — the throwaway project.**

```powershell
Remove-Item -Recurse -Force C:\Temp\cursor-gate -EA SilentlyContinue
mkdir C:\Temp\cursor-gate; cd C:\Temp\cursor-gate
git init
cmk install --with-semantic --ide cursor
```

**★★ Now FULLY QUIT + REOPEN Cursor** on `C:\Temp\cursor-gate` before any §1 live check (the D-262 restart rule above). If Cursor was already open on this folder when you ran the install, its session has NOT loaded `.cursor/hooks.json`.

---

## 1. Scaffold + read every file — all 3 Cursor surfaces

Everything below is on-disk verification (no live session yet) — run in the build terminal at `C:\Temp\cursor-gate`.

- [ ] **★ CU1 — install prints the Cursor success summary.**
      ```powershell
      # (re-run is idempotent; the first run's output is what to read)
      cmk install --ide cursor
      ```
      **PASS:** the summary says **`ready for Cursor`** and names the wired legs (`instruction file + MCP + hooks`), plus the "Restart the agent to activate" line. **FAIL:** an error, or a missing leg in the summary.

- [ ] **★ CU1b — `cmk doctor` clean (agent-aware HC-1 for Cursor).** `cmk doctor` → **0 fail** on a fresh Cursor install.
      ```powershell
      cmk doctor
      ```
      **PASS:** HC-1 reports **`Cursor capture/inject wired via .cursor/hooks.json (cmk cursor-hook)`** — the Cursor-aware check, NOT a Claude-Code-shaped fail. **FAIL:** HC-1 fails with `cmk repair --hooks` (the Claude hint) → `detectInstallKind` didn't recognize the `.cursor/rules/claude-memory-kit.mdc` marker, or the dispatcher isn't on the load-bearing events (the D-185 false-FAIL class).

- [ ] **★ CU2 — hooks surface: the versioned `.cursor/hooks.json` with the dispatcher on all 6 events.**
      ```powershell
      type .cursor\hooks.json
      ```
      **PASS:** the file has a top-level **`"version": 1`** AND a `hooks` object with all six events — `sessionStart`, `beforeSubmitPrompt`, `afterFileEdit`, `afterAgentResponse`, `sessionEnd`, `beforeShellExecution` — each an array whose command ends in **`cmk cursor-hook`** (platform-wrapped: `cmd.exe /c cmk cursor-hook` on Windows, bare `cmk cursor-hook` on POSIX). **FAIL:** missing `version` (Cursor requires it), a missing event, or a per-event bespoke command instead of the single dispatcher.

- [ ] **★ CU3 — MCP surface: `.cursor/mcp.json`.**
      ```powershell
      type .cursor\mcp.json
      ```
      **PASS:** `mcpServers.claude-memory-kit` is a stdio server (`"type": "stdio"`, `"command": "cmk"`, `"args": ["mcp", "serve"]`). **FAIL:** the server key is missing or malformed.

- [ ] **★ CU4 — instruction surface: the always-applied `.mdc` rule.**
      ```powershell
      type .cursor\rules\claude-memory-kit.mdc
      ```
      **PASS:** the file exists at **`.cursor/rules/claude-memory-kit.mdc`** (the `.mdc` extension — a plain `.md` here is IGNORED by Cursor), opens with `---` frontmatter carrying **`alwaysApply: true`**, and its body sits inside `<!-- claude-memory-kit:start -->` / `:end` markers telling Cursor to recall via `cmk search` before re-deriving. **FAIL:** wrong extension, missing `alwaysApply`, or missing markers.

- [ ] **★ CU5 — scaffold reads clean (READ EVERY FILE IN ALL THREE MEMORY TIERS — not a spot-check).**
      ```powershell
      Get-ChildItem -Recurse context | Select-Object FullName
      type context\MEMORY.md
      type context\.gitignore    # (or the repo .gitignore) — sessions/transcripts/.index/.locks gitignored
      ```
      **PASS:** the `context/` 3-tier layout scaffolded (`MEMORY.md`, `memory/INDEX.md`, `sessions/`, the queues, the gitignore tiers) exactly as the Claude-Code scaffold — the core is agent-neutral. **FAIL:** a missing tier or an unexpected file.

- [ ] **★ CU6 — Claude-Code-only files ABSENT on a Cursor-only install (D-188).** A `--ide cursor` install must NOT drop Claude-Code-only surfaces the way the generic scaffold once did.
      ```powershell
      "no .claude/skills (expect False): $(Test-Path .claude\skills)"
      "no CLAUDE.md (expect False):      $(Test-Path CLAUDE.md)"
      "no .kiro (expect False):          $(Test-Path .kiro)"
      ```
      **PASS:** none of `.claude/skills/`, `CLAUDE.md`, `.kiro/` exist — only the `.cursor/` surface + `context/`. **FAIL:** a dead Claude-Code or Kiro surface leaked onto the Cursor project.

- [ ] **★ CU7 — `--with-semantic` enabled hybrid-by-default (same as Claude-Code G7).**
      ```powershell
      type context\settings.json     # search.default_mode
      ```
      **PASS:** the install said semantic ENABLED **and** `settings.json` carries `default_mode: hybrid`. _(If npm failed, settings must NOT say hybrid — no half-state.)_

---

## 2. Session 1 (Cursor) — build it, stating preferences

**Open `C:\Temp\cursor-gate` in the freshly-restarted Cursor** (the D-262 restart from §0c). Build a small real thing across **one** Cursor Agent session, stating preferences naturally — **never** "remember this". End each turn normally (the `afterAgentResponse` hook fires capture).

Use the SAME build+say stages as the Claude-Code gate [`cut-gate.md`](cut-gate.md) §2 (the FastAPI layered-chat build with the uv/ruff/type-hints/layered/async preferences + the one cross-project rule). They are agent-neutral; don't re-transcribe them — drive them in the Cursor Agent chat.

**Watch while you build:**

- [ ] **★ CH-restart — the hooks are LOADED (the D-262 confirmation).**
      You restarted Cursor after install (§0c). The very first turn's inject/capture must work — if they don't, you're on a stale pre-install session. **PASS:** CH1/CH2 below fire on the first turns. **FAIL:** nothing fires → you didn't fully restart Cursor after `cmk install --ide cursor`; quit Cursor entirely (not just the window) and reopen.

- [ ] **★ CH1 — the capture hook FIRES and captures a real turn (`afterAgentResponse` → `cmk cursor-hook`).**
      ```powershell
      type context\sessions\now.md          # a real Cursor turn is captured here
      ```
      **PASS:** a real turn from this Cursor session landed in `now.md` / the capture log — with **NO manual `cmk` command** run. **FAIL:** `now.md` is empty after several turns (the hook registered but never fired — check CH-restart, then CU2's `afterAgentResponse` entry).

- [ ] **★ CH1b — the prompt-capture hook FIRES (`beforeSubmitPrompt`).**
      **PASS:** a user prompt from this session is captured (the transcript / prompt-capture path shows it), and the response you get back is `{continue: true}` (the prompt is NEVER blocked by capture). **FAIL:** prompts are blocked, or nothing is captured on submit.

- [ ] **★ CH2 — the inject hook FIRES — recall is injected (`sessionStart` → `additional_context`).**
      **PASS:** at Cursor session start the memory snapshot was injected; Cursor answers from injected memory (port 8000, the layered structure, your stated rules) without re-reading the code. **FAIL:** Cursor globs the code to re-derive what memory already holds → the `sessionStart` hook's `additional_context` isn't surfaced (this is the D-269 class — if inject emits empty, capture would still work but recall wouldn't; check `cmk cursor-hook` returns a non-empty `additional_context` on a project with facts).

- [ ] **★ CH3 — the observe-edit hook FIRES on a real file edit (`afterFileEdit`).**
      Have the Cursor agent create or heavily edit a >50-line file during the build.
      ```powershell
      type context\sessions\now.md          # look for a `… Edit file=… lines=6X` summary
      ```
      **PASS:** an above-threshold Cursor edit landed a `Edit file=… lines=6X` observation in `now.md` — proving the dispatcher synthesized `tool_response.content` from Cursor's `edits[]` so `observeEdit`'s line-count saw the real edit size (the Task-196 skill-review "wired-but-dead" fix). **FAIL:** no summary after a big edit → observe-edit is inert (the edit content wasn't carried; re-check the dispatcher's `afterFileEdit` adapter).

- [ ] **★ CH4 — a crashed hook never breaks the Cursor session (always-exit-0).**
      ```powershell
      # feed the dispatcher a malformed payload — it must exit 0, never crash the session
      '{bad json' | cmk cursor-hook; "exit=$LASTEXITCODE"
      # a permission event must FAIL OPEN on a crash
      '{"hook_event_name":"beforeShellExecution","command":"ls"}' | cmk cursor-hook
      ```
      **PASS:** the malformed payload prints `exit=0` (no crash); `beforeShellExecution` returns `{"permission":"allow"}`. **FAIL:** any non-zero exit or a thrown error (a real Cursor session would stall).

- [ ] **★ R2-cursor — no permission prompt on the kit's own hooks/tools.**
      Cursor's hooks run without a per-turn approval prompt for the kit's own `cmk cursor-hook` (they're the project's declared hooks). **PASS:** the build's turns proceed with no Cursor "approve this hook command?" popup for `cmk cursor-hook`. **FAIL:** Cursor prompts on every hook fire → note it (Cursor's hook-trust model differs from Claude Code's `PermissionRequest` auto-approver; capture the behavior for a follow-up, but a per-hook prompt that the user can "always allow" once is not a hard blocker).

- [ ] **★ G5 — explicit-skill security check (Task 69, agent-neutral).**
      Mid-build, say: *"remember this: my local cache is at C:\Users\<you>\cache\app."*
      **PASS:** the committed `context\MEMORY.md` / fact file shows `~\cache\app` — **never** your username (home-path abstraction on the write path). A leaked username = blocker.

---

## 3. Capture checks — read the files

Agent-neutral — identical to [`cut-gate.md`](cut-gate.md) §3. Run **B2, B9, B3, B4** there against the files this Cursor session produced:

- [ ] **★ B2 — rich capture.** Durable preferences are rich fact files (frontmatter + `**Why:**` + `**How to apply:**`).
- [ ] **★ B9 — auto-extract writes RICH project facts.** At least one `context\memory\project_*.md` carries `write_source: auto-extract` + `trust: medium` + a Why/How body — captured from the Cursor session with no `cmk remember`.
- [ ] **★ B3 — the wedge fills.** `type $env:USERPROFILE\.claude-memory-kit\HABITS.md` (+ `USER.md`, `LESSONS.md`) → your cross-project style is there (real user tier; backed up in §0b).
- [ ] **★ B4 — stated rule → `trust: high`, automatically.** `findstr /S /C:"trust: high" $env:USERPROFILE\.claude-memory-kit\*.md`.

---

## 4. Explicit capture probes — run in the build terminal

Agent-neutral — identical to [`cut-gate.md`](cut-gate.md) §4:

- [ ] **★ C5 — `<private>` stripped on the write path.** `cmk remember "host prod-7 <private>root pw hunter2-SECRET</private>" --type project` → `Select-String context\memory\*.md -Pattern "hunter2-SECRET"` finds nothing.
- [ ] **★ FQ1 — FTS5 query sanitization.** `cmk search "v0.4"` / `cmk search "user-explicit"` → results or a clean "no results", never an `FTS5 parse error`.

---

## 4b. The conversational surface — Cursor drives the MCP tools  ⬅️ the Cursor in-chat headline

Restart Cursor if you changed `.cursor/mcp.json` since opening (the MCP server is launched by Cursor). In the Cursor Agent chat:

- [ ] **★ M0 — the MCP tools are live in Cursor.**
      Ask Cursor to list its available `claude-memory-kit` tools (or just use one below).
      **PASS:** the `mk_*` tools resolve (`mk_remember`, `mk_search`, `mk_forget`, `mk_trust`, …). **FAIL / empty:** the MCP server didn't launch — re-check CU3 + that you restarted Cursor.

- [ ] **★ M1 — capture in chat.**
      In chat: *"remember that we run the API on port 8000 — that's decided."*
      **PASS:** Cursor calls **`mk_remember`** (an MCP tool) and the fact lands (rich if a "because" is given). _(Cursor asks for MCP-tool approval by default — "always allow" the kit's tools once; unlike Kiro there is no `autoApprove` array the kit writes, so the first call may prompt. Note the behavior; a one-time "always allow" is not a blocker.)_ **FAIL:** the call errors or nothing is written.

- [ ] **★ M2 — "forget X" → two-step, then gone.**
      *"forget the cache-path fact."* **PASS:** Cursor calls `mk_forget` (preview → confirm-token → tombstone); the fact is gone from search but the audit trail remains.

- [ ] **M3 — "trust this / not important" (observational).** **PASS:** Cursor calls `mk_trust` with `high` then `low`.

---

## 5. Session 2 (Cursor) — recall + recall-QUALITY  ⬅️ start a NEW Cursor session

Fully quit + reopen Cursor on `C:\Temp\cursor-gate` (a genuinely new session, so `sessionStart` inject fires fresh). Without re-explaining anything, ask: *"What are my standing cross-project rules, and how is this project structured?"* then *"Add a `/health` endpoint."*

- [ ] **★ W1 — recall on session start (the inject headline).**
      **PASS:** the first answer names your rules (uv/ruff/type-hints/layered/async) + the structure (port 8000, Claude SDK, the layered dirs) **without a re-brief** — proof the `sessionStart` snapshot was injected into a fresh Cursor session. **FAIL:** Cursor has no memory of Session 1 (inject didn't fire — the D-269 empty-snapshot class; verify `cmk cursor-hook` on a `sessionStart` payload returns the snapshot in `additional_context`).

- [ ] **★ W2 — paraphrase recall.** Ask about something using DIFFERENT words than you stated it. **PASS:** Cursor recalls it (semantic recall, since `--with-semantic`).

- [ ] **★ W3 — the raw record is reachable.** *"what did we decide about the deploy setup?"* **PASS:** the answer reflects the captured decision, not a re-derivation.

- [ ] **★ D2 — style follow-through.** `/health` lands as a thin, type-hinted route in `api/`, without being re-told your style.

---

## 6. Session 3 — the cold-open (the wedge)  ⬅️ a BRAND-NEW Cursor project

```powershell
Remove-Item -Recurse -Force C:\Temp\cursor-coldopen -EA SilentlyContinue
mkdir C:\Temp\cursor-coldopen; cd C:\Temp\cursor-coldopen
git init; cmk install --with-semantic --ide cursor
```
Open the NEW folder in Cursor (fully restart if Cursor was already running). Ask: *"Start a new Python backend for me — set up the structure."*

- [ ] **★ E1 — cold-open (the wedge). The gate that matters most.**
      It scaffolds the **layered** shape + `uv`/`ruff` tooling **without being told** — because the Session-1 persona (real user tier) injected through Cursor's `sessionStart` hook. *"How does it know that?"* = the wedge. Proves the persona injects through **Cursor's** hook, not just Claude Code's.

---

## 7. Full feature sweep + the Cursor-specific lifecycle checks

The `cmk` CLI is agent-agnostic — run the full **F-1 … F-19** sweep from [`cut-gate.md`](cut-gate.md) §7 (recall/index, persona, lifecycle, memory-management, health/repair, native-coexistence, MCP/transcripts, the L2 ladder). Not re-listed here; nothing about them is Cursor-specific.

**The Cursor-specific lifecycle checks:**

- [ ] **★ CU-uninstall — `cmk uninstall --ide cursor` removes ONLY our Cursor surfaces, byte-preserves the rest, never touches `context/`.**
      In `C:\Temp\cursor-gate` (NEVER a real project):
      ```powershell
      # seed a USER hook + a sibling MCP server first, to prove they survive
      cmk uninstall --ide cursor
      type .cursor\hooks.json     # OUR six events GONE; a user's own hooks (+ their version) preserved
      type .cursor\mcp.json       # our server key gone; a sibling user MCP server preserved
      dir .cursor\rules           # claude-memory-kit.mdc GONE (a kit-only .mdc is deleted; a user-edited one survives)
      "context/ preserved (expect True): $(Test-Path context\MEMORY.md)"
      ```
      **PASS:** uninstall removes our six hook events + MCP key + the `.mdc` rule; leaves any user-authored sibling (a user's own hook event, a sibling MCP server, a `.mdc` the user added content to) byte-untouched; AND **`context/` is preserved**. A **kit-only** `.mdc` (frontmatter-only, no user content) is DELETED — an empty always-applied rule is kit residue (the Task-196 skill-review #2 fix); a `.mdc` carrying the user's own lines SURVIVES with only our block stripped. **FAIL:** a user file was deleted, `context/` was touched, or a managed surface lingered.

- [ ] **★ CU-dual — dual-agent coexistence (D-188).** A project can carry Claude Code AND Cursor. In a throwaway project, install both, confirm neither clobbers the other, uninstall one and the other survives:
      ```powershell
      $d = "C:\Temp\cursor-dual"; Remove-Item -Recurse -Force $d -EA SilentlyContinue
      mkdir $d > $null; Set-Location $d; git init | Out-Null
      cmk install                  # Claude Code first → CLAUDE.md + .claude/skills
      cmk install --ide cursor     # add Cursor → .cursor/, Claude surface UNTOUCHED
      "CLAUDE.md still here (True): $(Test-Path CLAUDE.md)"
      "Cursor hooks added (True):   $(Test-Path .cursor\hooks.json)"
      cmk uninstall --ide cursor   # remove ONLY Cursor
      "Cursor gone (False):         $(Test-Path .cursor\hooks.json)"
      "Claude survives (True):      $(Test-Path CLAUDE.md)"
      Set-Location C:\Temp\cursor-gate; Remove-Item -Recurse -Force $d -EA SilentlyContinue
      ```
      **PASS:** both installs coexist (the second never clobbers the first); `cmk uninstall --ide cursor` removes only the Cursor surface and leaves the Claude one. **FAIL:** the second install clobbered the first, or uninstall removed the wrong agent's files.

---

## 8. Portability

Same as the Claude-Code gate — `context/` is committed and travels with `git clone` (tenet T2). The `.cursor/` surfaces (hooks/mcp/rules) are committed too, so a clone is Cursor-ready.

- [ ] **★ H1** — clone `C:\Temp\cursor-gate` elsewhere, open in Cursor → the project memory (`context/`) + the `.cursor/` surfaces are already there.

---

## Verdict + the cut

**Ship the Cursor change if** every **★** passes —
`CU1, CU1b, CU2, CU3, CU4, CU5, CU6, CU7, CH-restart, CH1, CH1b, CH2, CH3, CH4, R2-cursor, M0, M1, M2, W1, W2, W3, E1, CU-uninstall, CU-dual, H1` (the Cursor surface + live gates) **and** the agent-agnostic standing gates from [`cut-gate.md`](cut-gate.md) (`B2, B9, B3, B4, C5, FQ1, G5, D2` + the F-sweep).

**The Task-196 live-test is CH1/CH1b/CH2/CH3 (the hooks FIRE in a real Cursor session) + W1 (recall on a fresh session) + E1 (the cold-open wedge through Cursor's hook).** These are the checks unit tests structurally can't reach — "the hook is written correctly" (the suite proves that) ≠ "the hook fires and captures/injects a real turn in a real Cursor session" (only this gate proves that). Note especially **CH2/W1** — the inject leg is the D-269 class (an empty snapshot passed every unit test while shipping broken on Kiro for two minors); this gate must confirm inject surfaces REAL memory content, not just that the hook ran.

Record the live result (which checks passed, any findings) in **tasks.md 196** + a **DECISION-LOG** entry.

**Then preserve the evidence + restore your real user tier (the binding restore — mirror of §0b):**

```powershell
$root = "C:\cut-gate-backups"
$bk   = (Get-ChildItem $root -Directory -Filter "13_v0.4.5_cursor*" | Sort-Object LastWriteTime -Desc | Select-Object -First 1).FullName
"restoring user tier from: $bk"
# The gate wrote test facts into your REAL ~/.claude-memory-kit. To put your
# original back (the test facts were the point of B3/B4 — keep a copy as evidence
# first if you want), restore the backup over it:
if (Test-Path (Join-Path $bk "claude-memory-kit")) {
  Remove-Item -Recurse -Force "$env:USERPROFILE\.claude-memory-kit"
  Copy-Item (Join-Path $bk "claude-memory-kit") "$env:USERPROFILE\.claude-memory-kit" -Recurse -Force
  "user tier restored from $bk"
}
# Clean the throwaway project dirs:
Remove-Item -Recurse -Force C:\Temp\cursor-gate, C:\Temp\cursor-coldopen -EA SilentlyContinue
```

The **actual release tag** is cut by [`cut-gate.md`](cut-gate.md) §0 + its pre-tag gate — this Cursor gate is the live-test that must be green before that tag. Per-finding notes go in a dated doc under [`../journey/`](../journey/), not here.
