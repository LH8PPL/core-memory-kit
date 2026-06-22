# cmk — full test + cut gate (KIRO)

**The Kiro counterpart to [`cut-gate.md`](cut-gate.md).** Same rigor, same shape — but every Claude-Code surface is swapped for its Kiro equivalent. Version-agnostic; reused every cut that ships a Kiro change.

> **What's different from the Claude-Code gate (read this first):**
>
> - **Install command:** `cmk install --with-semantic --ide kiro` (NOT bare `cmk install`).
> - **Two clients, one install.** Kiro is Amazon Q Developer CLI under the hood. `cmk install --ide kiro` wires **five surfaces** at once, covering **both** clients:
>   - **Kiro IDE (GUI)** → `.kiro/hooks/*.kiro.hook` files (auto-fire, no agent selection).
>   - **kiro-cli (terminal)** → a `~/.aws/amazonq/cli-agents/q_cli_default.json` agent-config whose `hooks{}` fire only for the **default agent**.
>   - **Shared by both:** MCP (`.kiro/settings/mcp.json`), steering (`.kiro/steering/cmk.md`), skills (`.kiro/skills/`).
> - **The hook surfaces are input adapters only** — both call the SAME `cmk hook <event>` dispatcher → the same `captureTurn()` / `injectContext()` core as Claude Code. So the **memory core is identical**; this gate verifies the **Kiro wiring**, not the core again (the core is gated by [`cut-gate.md`](cut-gate.md) + the suite).
> - **★★ Test the REAL paths — back up, run for real, restore (BINDING).** This gate runs against your **real** `~/.claude-memory-kit` (user tier) and **real** `~/.aws` (the CLI-agent surface) — because that is exactly what a real user hits; a sandbox would hide a path bug. The safety is a **backup-before / restore-after** protocol (§0b), NOT env-var redirection. (`~/.aws` holds your real AWS credentials — it is **copied**, never moved, and restored by deleting only the cmk agent files; see §0b.) A live-test once wrote a stray `q_cli_default.json` into the real `~/.aws` (D-184) — the backup is what makes that safe to verify for real.
>
> **Cutting now: `v0.4.0`** — the cross-agent breadth release; **Kiro is the first non-Claude-Code agent** (Task 50, D-182/D-183/D-184). This gate IS the v0.4.0 Kiro live-test (sub-task 50.M).
> _Replace `0.4.0` / `v0.4.0` in the commands below if you reuse this guide for a later Kiro-touching cut._

It exercises every Kiro surface end-to-end on the **real installed artifact**: install (all 5 surfaces), the scaffolded skills, the `.kiro.hook` IDE hooks (capture + inject), the kiro-cli agent-config + the guarded default-agent, the **MCP tools driven in a real Kiro session**, organic capture, recall, and the full `cmk` CLI — then the tag-push.

---

## How to read this

- **★ = cut-gate check.** Every ★ must pass to tag the release. The rest is the full sweep — run it so nothing ships untested.
- Each check is one line you can tick, followed by the **action** (a code block) and a **PASS:** line.
- Throwaway probes use their own temp dirs and never touch your main run.
- **Time:** ~60–75 min.
- **Prereqs:** **Kiro IDE installed** + **kiro-cli on PATH** (both — the gate exercises each). Python 3.12+ on PATH (for `--with-semantic`).

> **★★ The real-input rule (binding — D-84).** A check **PASSES only when it ran on REAL input that exercises the feature** — never "the command didn't crash." A hook that is *registered* but never *fires-and-captures-a-real-turn* is **unverified**, not a pass (the whole point of 50.M: "docs-correct ≠ fires"). The IDE/CLI hook checks below FAIL if you only confirm the file exists.

> **★★ The backup rule (binding — D-184).** Before ANY `cmk install --ide kiro` or live Kiro session, run the **§0b backup block** — it snapshots your real `~/.claude-memory-kit` + `~/.aws` into `C:\cut-gate-backups\12_v0.4.0_kiro\` (the central backup root). The gate writes to the **real** dirs; the **§Verdict restore block** preserves the test artifacts as evidence and puts your originals back. Paths below mean your REAL `~/.aws` / `~/.claude-memory-kit` — the backup is the safety net, not a redirect.

---

## 0. Cut the release locally, then build the REAL artifact

**0a — cut the release locally FIRST.** Bumps `package.json` + finalizes the CHANGELOG so the artifact reports `0.4.0`. Local commit only — the tag-push stays the last step, after every ★ passes.

```powershell
cd C:\Projects\claude-memory-kit
git checkout main; git pull
npm run release -- minor             # v0.4.0 is a MINOR (the cross-agent differentiator) per RELEASE-PLAN.md
git diff                             # review: ONLY the version bump + CHANGELOG consolidation
git add CHANGELOG.md packages\cli\package.json
git commit -m "release: v0.4.0"      # local release commit — do NOT tag yet
git push origin main
```

**0b — build + install the real artifact.**

```powershell
cd C:\Projects\claude-memory-kit\packages\cli
npm pack                             # → lh8ppl-claude-memory-kit-<version>.tgz
npm uninstall -g @lh8ppl/claude-memory-kit
# Use the EXPLICIT filename npm pack printed — PowerShell does NOT glob `*.tgz`
# the way bash does (a literal `*` → ENOENT). e.g. for v0.4.0:
npm install -g .\lh8ppl-claude-memory-kit-0.4.0.tgz
cmk --version                        # ✅ matches packages/cli/package.json
# (If `npm uninstall -g` warned EPERM on better_sqlite3.node — a Windows file
#  lock — it still removes the packages; the reinstall + the version check below
#  confirm the new artifact is live. Harmless.)
```

**0c — back up the real dirs (the binding backup rule).** The gate runs against your REAL `~/.claude-memory-kit` + `~/.aws`. Snapshot them first into the central backup root, then start the user tier clean so capture-from-zero is honest:

```powershell
$bk = "C:\cut-gate-backups\12_v0.4.0_kiro"
New-Item -ItemType Directory -Path $bk | Out-Null

# user tier: kit-only → MOVE it aside (starts the gate from empty; restored verbatim after)
if (Test-Path $env:USERPROFILE\.claude-memory-kit) {
  Move-Item $env:USERPROFILE\.claude-memory-kit "$bk\BEFORE-.claude-memory-kit"
}
# ~/.aws: holds your REAL AWS creds/config → COPY (never move it out from under other tools)
if (Test-Path $env:USERPROFILE\.aws) {
  Copy-Item $env:USERPROFILE\.aws "$bk\BEFORE-.aws" -Recurse
}
# record what the cmk agent files looked like BEFORE (so restore knows what to remove)
"$(Get-Date -Format o) — gate start. Pre-existing cmk agents in real ~/.aws:" | Out-File "$bk\NOTES.md"   # -Format o, NOT -o (ambiguous in PowerShell 5.1)
Get-ChildItem $env:USERPROFILE\.aws\amazonq\cli-agents\*.json -EA SilentlyContinue | % { $_.Name } | Out-File "$bk\NOTES.md" -Append
```

- [ ] **G0** — `cmk --version` matches `packages/cli/package.json` _(older → you're testing a stale global; re-run `npm install -g` against the freshly-packed `.tgz`)._
- [ ] **G0-kiro** — `kiro-cli --version` runs (kiro-cli is on PATH) AND Kiro IDE opens. _(Both clients are exercised; if you only have one, mark the other client's checks `unverified`, don't skip silently.)_
- [ ] **G0-backup** — `C:\cut-gate-backups\12_v0.4.0_kiro\BEFORE-.claude-memory-kit` + `BEFORE-.aws` both exist, and `~/.claude-memory-kit` is now absent (moved aside) so capture starts from zero. _(`~/.aws` stays in place — it was copied, not moved.)_

---

## 1. Scaffold + read every file — all 5 Kiro surfaces

Validates scaffold integrity + that all five Kiro surfaces land in the verified paths.

```powershell
mkdir C:\Temp\kiro-gate; cd C:\Temp\kiro-gate
git init
cmk install --with-semantic --ide kiro    # the Kiro install — all 5 surfaces + semantic recall (~260 MB once + model pre-warm)
cmk doctor
```

- [ ] **★ KG1 — install prints the Kiro success summary.**
      The install ends with:
      `cmk install: kiro-gate ready for Kiro — context/ scaffolded; mcp + steering + skills + ide-hooks + cli-agent wired.`
      then `Restart Kiro to activate the hooks (steering + skills + MCP are immediate).`
      **PASS:** the summary names **all five** surfaces (`mcp + steering + skills + ide-hooks + cli-agent`). _(If your real `~/.aws` has NO Kiro default agent, the CLI agent takes the default silently — no "Note: you already have a Kiro CLI default agent" line. If you DO already have a Kiro default, you'll see that note here instead — and that's the guarded path KG7 forces deterministically.)_

- [ ] **★ KG1b — `cmk doctor` clean (agent-aware HC-1).** `cmk doctor` → **0 fail** on a fresh Kiro install (HC-1..HC-9).
      **HC-1 must read as a KIRO check, not a Claude one:** `[PASS] HC-1: ... Kiro capture/inject wired via IDE hooks (.kiro/hooks/) + CLI agent (~/.aws/amazonq/cli-agents/)`. **FAIL the gate** if HC-1 says `.claude/settings.json missing → cmk repair --hooks` — that's the pre-D-185 bug (doctor not agent-aware); you're on a stale binary, rebuild (§0b). _(D-185/D-186, found + fixed by this gate: HC-1 is a capability check — PASSes if the IDE hooks OR the CLI agent is present, so both a Kiro-IDE and a kiro-cli-only user read clean. The other memory-core checks are agent-agnostic.)_

- [ ] **★ KG2 — MCP surface (shared IDE+CLI).**
      ```powershell
      type .kiro\settings\mcp.json        # mcpServers["claude-memory-kit"] = { type:"stdio", command:"cmk", args:["mcp","serve"] }
      ```
      **PASS:** `.kiro/settings/mcp.json` registers the `claude-memory-kit` stdio server.

- [ ] **★ KG3 — steering surface (shared IDE+CLI).**
      ```powershell
      type .kiro\steering\cmk.md          # frontmatter `inclusion: always`, inside the managed marker block
      ```
      **PASS:** `.kiro/steering/cmk.md` exists, carries `inclusion: always`, and its body tells Kiro to recall via `cmk search` before re-deriving. The kit content sits inside `cmk:start`/`:end` markers (byte-preserve on uninstall).

- [ ] **★ KG4 — skills surface (shared IDE+CLI), ported + Kiro-safe.**
      ```powershell
      type .kiro\skills\memory-search\SKILL.md
      type .kiro\skills\memory-write\SKILL.md
      ```
      **PASS:** both `SKILL.md` files exist under `.kiro/skills/<name>/`, AND the **Claude-Code-only frontmatter keys are dropped** — `context:` and `allowed-tools:` must NOT appear (Kiro's skill frontmatter doesn't use them). The body (the recall / capture procedure) is intact.

- [ ] **★ KG5 — IDE hooks surface (the GUI client).**
      ```powershell
      type .kiro\hooks\cmk-capture.kiro.hook
      type .kiro\hooks\cmk-inject.kiro.hook
      ```
      **PASS — both files are valid `.kiro.hook` JSON in the verified shape:**
      - `cmk-capture.kiro.hook`: `{ "version":"1.0.0", "enabled":true, "name":"claude-memory-kit: capture", "when":{"type":"agentStop"}, "then":{"type":"runCommand", "command":<cmd>, "timeout":60} }`
      - `cmk-inject.kiro.hook`: same shape, `when.type":"promptSubmit"`, `then.timeout":30`.
      - **The `command` is platform-correct:** on Windows it is **`cmd.exe /c cmk hook stop`** / `... promptSubmit` (Kiro routes hooks through WSL, which has no node — a bare `cmk hook` would fail with `node: not found`). On macOS/Linux it is the bare `cmk hook <event>`.
      - **`runCommand`, not `askAgent`** — the kit does DETERMINISTIC capture (no LLM-in-the-loop), which no surveyed Kiro project does.

- [ ] **★ KG6 — CLI agent-config surface (the terminal client), in your REAL `~/.aws`.**
      ```powershell
      type $env:USERPROFILE\.aws\amazonq\cli-agents\q_cli_default.json
      ```
      **PASS — the agent-config is the Amazon-Q Rust-contract shape:**
      - `"managedBy": "claude-memory-kit"` (the structural ownership marker — the uninstall key, NOT a description substring).
      - `"hooks"` is an OBJECT keyed by trigger → array of `{command, timeout_ms}`: `agentSpawn` (timeout_ms 10000, inject) + `stop` (timeout_ms 30000, capture). **`timeout_ms`, NOT `timeout`** (the stale `agent-v1.json` shape is `{command}`-only — this must be the Rust contract).
      - the `command` is platform-correct (`cmd.exe /c cmk hook <event>` on Windows).
      - carries `mcpServers.cmk` + `prompt: "file://AGENTS.md"` + `resources` listing the steering file.
      - **This is the REAL path kiro-cli reads** — which is why the §0b backup copied `~/.aws` first (it'll be restored). _(If you already had a Kiro default agent, the kit wrote `cmk.json` here instead, NOT `q_cli_default.json` — see KG7; check `cmk.json` in that case.)_

- [ ] **★ KG7 — the guarded default-agent (non-clobber).** Deterministic probe in a SECOND sandbox where a default already exists:
      This is the ONE probe that uses a throwaway `~/.aws` — because it deliberately simulates *someone else's* existing default to prove the kit won't clobber it. The kit's `MEMORY_KIT_AWS_DIR` escape hatch points the CLI-agent leg at a temp dir for this one block, then is cleared:
      ```powershell
      $g = "C:\Temp\kiro-guard-aws"; Remove-Item -Recurse -Force $g -EA SilentlyContinue
      mkdir "$g\amazonq" > $null
      # simulate a user who already has a default agent
      '{ "chat.defaultAgent": "their-agent" }' | Set-Content "$g\amazonq\settings.json" -Encoding utf8
      $h = "C:\Temp\kiro-guard-proj"; Remove-Item -Recurse -Force $h -EA SilentlyContinue
      mkdir $h > $null; Set-Location $h; git init | Out-Null
      $env:MEMORY_KIT_AWS_DIR = $g           # surgical: redirect ONLY this guard probe off the real ~/.aws
      cmk install --ide kiro                 # watch the summary
      type "$g\amazonq\settings.json"        # their default is byte-untouched
      dir "$g\amazonq\cli-agents"            # a NAMED cmk.json landed; NO q_cli_default.json written by us
      Remove-Item Env:\MEMORY_KIT_AWS_DIR     # clear it — the rest of the gate uses the REAL ~/.aws
      Set-Location C:\Temp\kiro-gate
      ```
      **PASS:** the install prints the **`Note: you already have a Kiro CLI default agent — the kit installed a `cmk` agent instead.`** line; `settings.json` still says `chat.defaultAgent: their-agent` (untouched); the kit wrote `cmk.json`, NOT `q_cli_default.json`. **FAIL:** the kit overwrote their default or their settings.

- [ ] **★ KG8 — `--with-semantic` enabled hybrid-by-default (same as Claude-Code G7).**
      ```powershell
      type context\settings.json           # "search": { "default_mode": "hybrid" }
      ```
      **PASS:** the install said semantic ENABLED **and** `settings.json` carries `default_mode: hybrid`. _(If npm failed, settings must NOT say hybrid — no half-state.)_

- [ ] **★ KG9 — scaffold reads clean (READ EVERY FILE IN ALL THREE MEMORY TIERS — not a spot-check).**
      The `context/` memory tiers are agent-agnostic, so the same G4 discipline applies. Read every file; a leaked username, an unrendered `{{TODAY}}`, or malformed frontmatter is a cut-blocker.
      ```powershell
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8   # avoid mojibake false alarms (middot/em-dash)
      function Read-Tier($dir) {
        if (-not (Test-Path $dir)) { Write-Output "(no $dir)"; return }
        Get-ChildItem -Recurse $dir -File | % { "`n===== $($_.FullName) ====="; [System.IO.File]::ReadAllText($_.FullName) }
      }
      Read-Tier "$env:USERPROFILE\.claude-memory-kit"   # User tier (real — backed up in §0c)
      Read-Tier "context"                                 # Project tier (committed)
      Read-Tier "context.local"                           # Local tier (gitignored)
      ```
      **PASS — every file shows:** no kit-internal cruft (no `Task NN`, `design §`), no literal `{{TODAY}}`, **no real username in a committed tier** (public-repo leak = blocker), example bullets marked `(example)`, well-formed frontmatter.

- [ ] **★ KG10 — AGENTS.md present, Claude-Code-only files ABSENT (D-188).** A Kiro install writes Kiro's instruction file (`AGENTS.md`, the cross-tool always-loaded standard) and does NOT drop Claude-Code-only files (`CLAUDE.md`, `.claude/skills/`) — Kiro can't read them, and the CLI agent-config's `prompt: file://AGENTS.md` must resolve.
      ```powershell
      "AGENTS.md present (expect True):  $(Test-Path AGENTS.md)"
      type AGENTS.md                                  # a managed claude-memory-kit:start block
      "CLAUDE.md ABSENT  (expect False): $(Test-Path CLAUDE.md)"
      ".claude/ ABSENT   (expect False): $(Test-Path .claude)"
      ```
      **PASS:** `AGENTS.md` exists with the managed memory-awareness block; **no** `CLAUDE.md`, **no** `.claude/`. **FAIL** (the pre-D-188 leak): a dead `.claude/skills/` or a `CLAUDE.md` Kiro can't use, or a missing `AGENTS.md` (the CLI agent's `prompt` would point at nothing).

Now **restart Kiro** (close + reopen the IDE; restart any kiro-cli session) so the hooks + MCP load, then `code .` (or open `C:\Temp\kiro-gate` in Kiro). The live checks (§2 onward) need the reloaded hooks.

---

## 2. Session 1 (Kiro IDE) — build it, stating preferences

Same build arc as the Claude-Code gate, run in **Kiro IDE**. Each stage pairs a **Build** prompt with a **Say it out loud** preference — a real opinion, never "remember this". End each turn normally (the `agentStop` IDE hook fires capture).

**Stage 0 — baseline.** *Build:* "Create a minimal Python web chat UI: a FastAPI server with a WebSocket endpoint and a single static `index.html`. Plain HTML/JS, no framework. Put the server in `app.py`." → run it if offered.

**Stage 1 — refactor to layers.** *Build:* "Refactor into a layered FastAPI project — `app/{api,services,repositories,schemas,core}/` and `app/main.py`. WebSocket route into `api/`, broadcast logic into a service, Pydantic schemas. Keep port 8000." *Say:* "How I build backends: FastAPI is the delivery layer, not the brain. Routes stay thin and orchestrate; logic lives in services; data access in boring repositories; Pydantic schemas are the boundary contracts."

**Stage 2 — swap to Claude + typing/TDD rule.** *Build:* "Change it to a single-user chat with Claude via the Claude Agent SDK — a `ClaudeAgentService` wrapping `ClaudeSDKClient`, each WebSocket connection its own session." *Say:* "Type hints on every signature — Python 3.12+. Comments explain why, not what. And tests first: boundary test, watch it fail, then implement."

**Stage 3 — stream + async rule + the universal rule.** *Build:* "Stream Claude's output to the browser as it arrives — push JSON frames over the WebSocket." *Say:* "Async all the way down — nothing blocking in the event loop." **Then one cross-project rule:** "From now on, in every project I work on, always use `uv` for packages, never `pip`, and always run `ruff` before committing."

**Watch while you build (the IDE-hook live gates — the heart of 50.M):**

- [ ] **★ KH1 — the IDE capture hook FIRES and captures a real turn (`agentStop`).**
      After a build turn ends in Kiro IDE, the `cmk-capture.kiro.hook` ran `cmk hook stop` automatically. Verify the turn was captured:
      ```powershell
      type context\sessions\now.md          # the just-ended turn's content is here
      Get-ChildItem context\.locks\*.log | % { Select-String $_ -Pattern "capture|stop" } | Select-Object -First 5
      ```
      **PASS:** a real turn from this Kiro session landed in `now.md` / the capture log — with **no manual `cmk` command** run. **FAIL:** `now.md` is empty after several turns (the hook registered but never fired) — that's the 50.M blocker.

- [ ] **★ KH2 — the IDE inject hook FIRES (`promptSubmit`) — recall is injected.**
      Mid-session, the `cmk-inject.kiro.hook` ran `cmk hook promptSubmit`, surfacing recalled memory into Kiro's context. After a few turns, ask in Kiro IDE something memory should answer (e.g. *"what port are we on again?"*).
      **PASS:** Kiro answers from injected memory (port 8000, the layered structure) without re-reading the code — and the inject hook appears in the hook activity / `now.md` shows the recall path. **FAIL:** Kiro globs the code to re-derive what memory already holds.

- [ ] **★ KH3 — a crashed hook never breaks the Kiro session (always-exit-0).**
      The dispatcher catches every error and exits 0 (a non-zero hook exit BLOCKS the Kiro tool — AWS docs). Sanity-check the invariant deterministically:
      ```powershell
      cmd.exe /c cmk hook stop ; echo "exit=$LASTEXITCODE"          # empty/garbage stdin → still exit 0
      cmd.exe /c cmk hook totally-unknown-event ; echo "exit=$LASTEXITCODE"   # unknown event → no-op, exit 0
      ```
      **PASS:** both print `exit=0`. **FAIL:** any non-zero exit (a real Kiro session would stall on that tool).

---

## 3. Capture checks — read the files

(Agent-agnostic — the capture/extract core is shared. Same as the Claude-Code gate's §3; abbreviated here.)

```powershell
cmk search "layered"; cmk search "type hints"; cmk search "port 8000"
type context\MEMORY.md
dir context\memory; type context\memory\project_*.md
```

- [ ] **B1 — auto-capture fires.** Your decisions/prefs show up **without** "remember this".
- [ ] **★ B2 — rich capture.** Durable preferences are rich fact files (frontmatter + `**Why:**` + `**How to apply:**`), not bare one-liners.
- [ ] **★ B9 — auto-extract writes RICH project facts.** At least one `context\memory\project_*.md` carries `write_source: auto-extract` + `trust: medium` + a Why/How body — captured from the Kiro session with no `cmk remember`.
- [ ] **★ B3 — the wedge fills.** `type $env:USERPROFILE\.claude-memory-kit\HABITS.md` (+ `USER.md`, `LESSONS.md`) → your cross-project style is there (real user tier; backed up in §0c).
- [ ] **★ B4 — stated rule → `trust: high`, automatically.** The uv/ruff rule landed in a user-tier scratchpad on its own: `findstr /S /C:"trust: high" $env:USERPROFILE\.claude-memory-kit\*.md`.

---

## 4. Explicit capture probes — run in the build terminal

(Agent-agnostic CLI surface — identical to the Claude-Code gate. Run the standing privacy/sanitization probes; abbreviated.)

- [ ] **C1 — terse.** `cmk remember "We deploy with Kamal to Hetzner, never Vercel."` → appears in `context\MEMORY.md`.
- [ ] **C2 — rich.** `cmk remember "Reflection beats one-shot generation" --type feedback --title "reflection-loop" --why "..." --how "..."` → rich `feedback_reflection-loop.md`.
- [ ] **C3 — Poison_Guard.** `cmk remember "key sk-ant-api03-AAArealishlookinglongtokenvalue00"` → rejected (exit 2), nothing written.
- [ ] **C4 — sanitization.** `cmk remember "venv at C:\Users\<you>\proj\.venv"` → the file shows `~\…`, never your username.
- [ ] **★ C5 — `<private>` stripped on the write path.** `cmk remember "host prod-7 <private>root pw hunter2-SECRET</private>" --type project` → `Select-String context\memory\*.md,context\memory\INDEX.md -Pattern "hunter2-SECRET"` finds nothing.
- [ ] **★ FQ1 — FTS5 query sanitization.** `cmk search "v0.4"` / `cmk search "user-explicit"` / `cmk search "section:search"` → results or clean "no results", never an `FTS5 parse error`.

---

## 4b. The conversational surface — Kiro drives the MCP tools  ⬅️ the Kiro in-chat headline

The regular Kiro user **never types `cmk`** — they talk, and Kiro runs the MCP tools. Run these **in a real Kiro session** (IDE or kiro-cli), not the terminal. This is the surface the CLI suite structurally can't cover.

- [ ] **★ M0 — the MCP tools are live in Kiro.**
      In Kiro, say: *"list your cmk MCP tools."*
      → `mk_remember, mk_search, mk_get, mk_timeline, mk_cite, mk_recent_activity, mk_trust, mk_lessons_promote, mk_forget, mk_queue_list, mk_queue_resolve` (**11**).
      **PASS:** all 11 resolve. **FAIL / empty:** the MCP server didn't launch — re-check KG2 + that you restarted Kiro.

- [ ] **★ M1 — capture in chat, prompt-free.**
      Say: *"remember our staging runs on Fly.io — because it's cheap to spin ephemeral envs up and down."*
      **PASS:** Kiro calls **`mk_remember`** (an MCP tool, not a shell command), silent on success; the "because" makes it a rich fact.

- [ ] **★ M2 — "forget X" → two-step, then gone.**
      Say: *"actually, forget the Fly.io staging decision."*
      **PASS, in order:** (1) the first `mk_forget` returns a preview + confirm token (nothing deleted yet); (2) after you confirm, the second call tombstones it; (3) *"where does staging run?"* → gone (no Fly.io), no manual reindex.

- [ ] **M3 — "trust this / not important".** Capture two throwaway facts, then *"that one's important — keep it"* / *"eh, not important."* **PASS:** Kiro calls `mk_trust` with `high` then `low`.

---

## 5. Session 2 (kiro-cli) — the terminal client + recall  ⬅️ a NEW kiro-cli session

This is the **CLI-agent live gate** — the half KG6 only proves on disk. Start `kiro-cli` in the project with **NO `--agent` flag**, so the default-agent resolution is what's under test.

```powershell
cd C:\Temp\kiro-gate
# the CLI agent lives in your REAL ~/.aws/amazonq/cli-agents/ (backed up in §0c)
kiro-cli chat        # NO --agent flag — cmk must resolve as the DEFAULT agent
```

Without re-explaining anything, ask: *"What are my standing cross-project rules, and how is this project structured?"* then *"Add a `/health` endpoint."*

- [ ] **★ KC1 — the default agent resolves with no `--agent` flag.**
      `kiro-cli chat` started the **cmk** agent automatically (because the kit registered `q_cli_default.json` in the sandbox).
      **PASS:** the session runs as the cmk agent (its `agentSpawn` hook fired — see KC2); you never passed `--agent`. **FAIL:** kiro-cli starts a different/blank agent → the default-agent registration didn't take (the D-182 bug the guard exists to avoid).

- [ ] **★ KC2 — `agentSpawn` injects at session start (the SessionStart analog).**
      At kiro-cli session start, the `agentSpawn` hook ran `cmk hook agentSpawn`, injecting the memory snapshot.
      **PASS:** the very first answer (the "standing rules + structure" question) names your rules (uv/ruff/type-hints/layered) + the structure (port 8000, Claude SDK) **without a re-brief** — proof the snapshot was injected at spawn. **FAIL:** kiro-cli has no memory of Session 1 (inject didn't fire).

- [ ] **★ KC3 — `stop` captures at turn-end in kiro-cli.**
      After a kiro-cli turn, the `stop` hook ran `cmk hook stop`.
      ```powershell
      type context\sessions\now.md          # the kiro-cli turn is captured here too
      ```
      **PASS:** a kiro-cli turn landed in `now.md` / the capture log — same shared core as the IDE hook, different client. **FAIL:** kiro-cli turns aren't captured.

- [ ] **★ KC4 — MCP reachable from the kiro-cli session.**
      In the kiro-cli chat, say *"search your memory for the port we use."*
      **PASS:** the MCP `mk_search` resolves the fact (port 8000) — the `mcpServers.cmk` entry in the agent-config works from the terminal client.

- [ ] **D2 — style follow-through.** `/health` lands as a thin, type-hinted route in `api/`, without being re-told your style.

---

## 6. Session 3 — the cold-open (the wedge)  ⬅️ a BRAND-NEW Kiro project

```powershell
mkdir C:\Temp\kiro-coldopen; cd C:\Temp\kiro-coldopen
git init; cmk install --with-semantic --ide kiro
```
Open in Kiro (or `kiro-cli chat`). Ask: *"Start a new Python backend for me — set up the structure."*

- [ ] **★ E1 — cold-open (the wedge).** It scaffolds the **layered** shape + `uv`/`ruff` tooling **without being told** — because the Session-1 persona (sandboxed user tier) injected. *"How does it know that?"* = the wedge. **The gate that matters most** — and it proves the persona injects through Kiro's hook, not just Claude Code's.

---

## 7. Full feature sweep — every `cmk` subcommand  (~15 min, in `C:\Temp\kiro-gate`)

The `cmk` CLI is agent-agnostic — this sweep is identical to [`cut-gate.md`](cut-gate.md) §7. Run **F-1 … F-19** there (recall/index, persona, lifecycle, memory-management, health/repair, native-coexistence, MCP/transcripts, the L2 ladder). They are not re-listed here; nothing about them is Kiro-specific.

**The one Kiro-specific lifecycle check:**

- [ ] **★ KU1 — `cmk uninstall --ide kiro` removes ONLY our Kiro surfaces, byte-preserves the rest, never touches `context/` (D-189).**
      In `C:\Temp\kiro-gate` (NEVER a real project):
      ```powershell
      cmk uninstall --ide kiro     # the per-agent Kiro uninstall (NOT bare `cmk uninstall`, which is the Claude surface)
      dir .kiro\hooks              # cmk-capture/cmk-inject .kiro.hook GONE
      type .kiro\settings\mcp.json # our server key gone; a sibling user server (if any) preserved
      type .kiro\steering\cmk.md   # our marker block stripped; user content outside markers byte-preserved
      type AGENTS.md               # our managed block stripped; user AGENTS.md content (if any) byte-preserved
      dir $env:USERPROFILE\.aws\amazonq\cli-agents   # our q_cli_default.json / cmk.json GONE; any user-authored agent preserved
      "context/ preserved (expect True): $(Test-Path context\MEMORY.md)"
      ```
      **PASS:** uninstall removes our IDE hooks + MCP key + steering block + AGENTS.md block + skills + CLI agent-config; leaves any user-authored sibling (a non-`managedBy:claude-memory-kit` agent, a sibling MCP server, user steering/AGENTS.md text) byte-untouched; AND **`context/` is preserved** (the shared brain is never deleted). **FAIL:** a user file was deleted, `context/` was touched, or a managed surface lingered.

- [ ] **★ KU2 — dual-agent coexistence (D-188).** A project can carry BOTH agents. In a throwaway project, install both and confirm neither clobbers the other; uninstall one and the other survives:
      ```powershell
      $d = "C:\Temp\kiro-dual"; Remove-Item -Recurse -Force $d -EA SilentlyContinue
      mkdir $d > $null; Set-Location $d; git init | Out-Null
      cmk install                  # Claude Code first → CLAUDE.md + .claude/skills
      cmk install --ide kiro       # add Kiro → .kiro/ + AGENTS.md, Claude surface UNTOUCHED
      "CLAUDE.md still here (True): $(Test-Path CLAUDE.md)"
      "Kiro hooks added (True):     $(Test-Path .kiro\hooks\cmk-capture.kiro.hook)"
      cmk uninstall --ide kiro     # remove ONLY Kiro
      "Kiro gone (False):           $(Test-Path .kiro\hooks\cmk-capture.kiro.hook)"
      "Claude survives (True):      $(Test-Path CLAUDE.md)"
      Set-Location C:\Temp\kiro-gate; Remove-Item -Recurse -Force $d -EA SilentlyContinue
      ```
      **PASS:** both installs coexist (the second never clobbers the first); `cmk uninstall --ide kiro` removes only the Kiro surface and leaves the Claude one. **FAIL:** the second install clobbered the first, or uninstall removed the wrong agent's files.

---

## 8. Portability

Same as the Claude-Code gate — `context/` is committed and travels with `git clone` (tenet T2). The `.kiro/` surfaces (hooks/steering/skills/mcp) are committed too, so a clone is Kiro-ready; the CLI agent-config (`~/.aws`) is machine-local and re-created by `cmk install --ide kiro` on the new machine.

- [ ] **★ H1** — clone `C:\Temp\kiro-gate` elsewhere, open in Kiro → the project memory (`context/`) + the `.kiro/` surfaces are already there.

---

## Verdict + the cut

**Cut v0.4.0 if** every **★** passes —
`KG1, KG1b, KG2, KG3, KG4, KG5, KG6, KG7, KG8, KG9, KG10, KH1, KH2, KH3, M0, M1, M2, KC1, KC2, KC3, KC4, E1, KU1, KU2, H1` (the Kiro surface + live gates) **and** the agent-agnostic standing gates from [`cut-gate.md`](cut-gate.md) (`B2, B9, B3, B4, C5, FQ1, F-3, F-11b` + the recall ladder where it overlaps).

**The 50.M live-test is KH1/KH2 (IDE hooks FIRE) + KC1/KC2/KC3 (kiro-cli default-agent + hooks FIRE).** These are the checks unit tests structurally can't reach — "the hook is written correctly" (the suite proves that) ≠ "the hook fires and captures a real turn in a real Kiro session" (only this gate proves that). The D-182 8-point checklist maps to: default resolves w/o `--agent` (KC1), inject+capture FIRE not just register (KH1/KH2/KC2/KC3), non-clobber guard (KG7), MCP reachable (KG2/KC4/M0), timeout composition (KG5/KG6 carry the `timeout`/`timeout_ms` ceilings; KH3 proves a slow/failed hook exits 0).

Record the live result (which checks passed, any findings) in **tasks.md 50.M** + a **DECISION-LOG** entry.

**Then preserve the evidence + restore your real dirs (the binding restore — mirror of §0c):**

```powershell
$bk = "C:\cut-gate-backups\12_v0.4.0_kiro"

# 1. PRESERVE the test artifacts as evidence (diff against the next run later)
Copy-Item $env:USERPROFILE\.claude-memory-kit       "$bk\AFTER-.claude-memory-kit" -Recurse -EA SilentlyContinue
Copy-Item C:\Temp\kiro-gate                          "$bk\AFTER-test-project"       -Recurse -EA SilentlyContinue
Copy-Item $env:USERPROFILE\.aws\amazonq\cli-agents   "$bk\AFTER-aws-cli-agents"     -Recurse -EA SilentlyContinue
"$(Get-Date -Format o) — gate finished; artifacts copied above." | Out-File "$bk\NOTES.md" -Append   # -Format o, NOT -o (PowerShell 5.1)

# 2. RESTORE the user tier (it was MOVED aside in §0c — put the original back verbatim)
Remove-Item -Recurse -Force $env:USERPROFILE\.claude-memory-kit -EA SilentlyContinue
if (Test-Path "$bk\BEFORE-.claude-memory-kit") {
  Move-Item "$bk\BEFORE-.claude-memory-kit" $env:USERPROFILE\.claude-memory-kit
}

# 3. RESTORE ~/.aws — it was COPIED (your real creds were never moved), so just
#    delete ONLY the cmk agent files the gate added. Leave everything else intact.
Remove-Item $env:USERPROFILE\.aws\amazonq\cli-agents\q_cli_default.json -EA SilentlyContinue  # if WE wrote it (check NOTES.md — skip if it pre-existed)
Remove-Item $env:USERPROFILE\.aws\amazonq\cli-agents\cmk.json           -EA SilentlyContinue
#    (NOTES.md lists what was in ~/.aws BEFORE — if q_cli_default.json pre-existed, do NOT delete it; the kit wrote cmk.json in that case.)

# 4. clean the throwaway project dirs (NOT the backups)
Remove-Item -Recurse -Force C:\Temp\kiro-gate, C:\Temp\kiro-coldopen, C:\Temp\kiro-guard-aws, C:\Temp\kiro-guard-proj -EA SilentlyContinue
Remove-Item Env:\MEMORY_KIT_AWS_DIR -EA SilentlyContinue   # in case the KG7 probe left it set
```

### ★ Pre-tag gate (BEFORE the tag — docs lag the code otherwise)

- [ ] **CHANGELOG consolidated** — `[Unreleased]` → `## [0.4.0] — <date>`; `print-release-notes.mjs 0.4.0` parses the section.
- [ ] **★ READMEs reflect v0.4.0** — both root `README.md` + npm landing `packages/cli/README.md` describe the cross-agent/Kiro headline + `--ide kiro`.
- [ ] **`packages/cli/package.json` version** = `0.4.0`.

**To publish (your outward action):**

```powershell
git tag v0.4.0
git push origin v0.4.0
```

`publish.yml` runs the suite, publishes `@lh8ppl/claude-memory-kit@0.4.0` to npm with provenance, and creates the GitHub Release from the `[0.4.0]` CHANGELOG section.

**Verify after:** `npm view @lh8ppl/claude-memory-kit version` → `0.4.0`; the npm page shows a provenance badge; the GitHub Release matches `## [0.4.0]`.

Per-finding notes go in a dated doc under [`../journey/`](../journey/), not here — this stays a clean script.
