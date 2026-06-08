# cmk — full test + cut gate

**The single guide to run before tagging a release.** Version-agnostic — reused every cut.

> **Cutting now: `v0.2.3`** — the **conversational surface**: every memory op now runs as an **MCP tool Claude drives in chat** (you never type `cmk`, no approval prompt — Task 108) + **free-speech "forget X" / "trust this"** (Task 117) + the **D-84 fix lane** (register-crons fixed on Windows+macOS, forget→search auto-reindex, persona-generate timeout, queue/import/weekly-curate now really tested — Tasks 109–116).
> _Replace `0.2.3` / `v0.2.3` in the commands below if you reuse this guide for a later cut._

It exercises every kit feature end-to-end on the **real installed artifact**:
install (with MCP-server registration), the memory-write skill, the **MCP tools driven in conversation**,
a staged build with organic capture, explicit-capture probes, free-speech forget/trust,
recall, the cross-project cold-open (the wedge), the full `cmk` CLI, the plugin route,
privacy, and portability — then the tag-push.

---

## How to read this

- **★ = cut-gate check.**
  Every ★ must pass to tag the release.
  The rest is the full feature sweep — run it so nothing ships untested.
- Each check is one line you can tick, followed by the **action** (a code block) and a **PASS:** line.
- Throwaway probes use their own temp dirs and never touch your main run.
- **Time:** ~75–90 min.
- **Prereq:** Python 3.12+ on PATH.

> **★★ The real-input rule (binding — D-84).** A check **PASSES only when it ran on REAL input that exercises the feature** — never "the command didn't crash on trivial input." These are **NOT passes** — mark them `unverified` and re-run for real:
> - "skipped (cooldown)" → clear the cooldown (`cooldownMs:0` / delete the marker) and re-run.
> - an **empty queue** → seed real pending review/conflict items, then resolve.
> - a **dry-run with nothing to do** → create the real source (e.g. a native `MEMORY.md`), then run for real with `--yes`.
> - a **same-day project with nothing > 7d** → age the `today-*.md` fixtures past the window.
>
> The v0.2.2 sweep conflated "ran without error" with "the feature works" and shipped **four** broken/unverified commands — `register-crons` (errored on Windows), `persona generate` (timed out), `weekly-curate`/`queue`/`import-anthropic` (only ever the trivial path). Each had a green-LOOKING trivial path. **If a command can only be run on trivial input here, that's a coverage gap** → it needs an automated REAL-input test in the suite (now present for weekly-curate / queue / import-anthropic — Tasks 112–114; live-verified for register-crons / forget / persona generate / import — D-96/D-97).

**Already green — don't re-do by hand:**
`npm run live-test` drives the deterministic half headlessly on the real tarball.
Trail: [`../journey/live-test-runs/`](../journey/live-test-runs/).

**What you add by hand:**
**R1** (console flash), **R2** (prompt UX), the **conversational MCP + free-speech surface** (§4b — Claude driving the tools in chat; the CLI suite can't cover Claude-in-the-loop), and the **recall feel** — the things automation can't see.

> Supersedes the two older guides ([`v0.2.0-self-test-guide.md`](v0.2.0-self-test-guide.md),
> [`v0.2.0-self-test-guide-pdf.md`](v0.2.0-self-test-guide-pdf.md)) — their checks are folded in below.

---

## New in v0.2.3 — what this run additionally validates

The headline is **the regular user never types `cmk`** — every voiced intent reaches memory either **automatically** (a hook) or **Claude-mediated** through an MCP tool, **prompt-free**. Plus the **D-84 fix lane**: commands that shipped green-LOOKING but broke on real input.

| Check | Feature | What's new |
| --- | --- | --- |
| **★ G6 / M0** | Task 108 | `cmk install` **registers the MCP server** (`.mcp.json` + `mcp__cmk__*` allow-list) → **11 tools** Claude drives in chat, prompt-free |
| **★ M1** | Tasks 108 + 117 | memory ops happen **in conversation** — natural capture, recall, and **free-speech mutation** with no `cmk` typing |
| **★ M2** | Tasks 117 + 108b + 110 | **"forget X"** in plain speech → `mk_forget` **two-step** (preview + confirm) → gone from search, **no manual reindex** |
| **M3** | Task 117 | **"trust this / not important"** in plain speech → `mk_trust` (the one free-speech gap D-85 named) |
| **F-6 / F-9 / F-13** | Tasks 109 / 113 / 114 | the **D-84 lane**: `register-crons` fixed on Windows **and** macOS; `queue review/conflicts` + `import-anthropic` now exercised on **real** input, not the trivial path |
| **F-16** | Task 115 | the auto-extract transcript temp (`.extract-*.tmp`) is **gitignored** — a partial buffer never travels with `git clone` |

**Standing checks (re-run; not new this cut):** the **v0.2.2 rich-auto-capture** headline **B9** (Task 103) and the **§19 retention arc B5–B8 + D5** (Tasks 91–94) stay below as the standing memory-quality + retention gate.

---

## 0. Cut the release locally, then build the REAL artifact

**0a — cut the release locally FIRST.** This bumps `package.json` + finalizes the CHANGELOG so the artifact you test below actually reports `0.2.3` (without this, `npm pack` builds the OLD `0.2.2`). It is a **local commit only** — the tag-push (the outward publish) stays the very last step, after every ★ passes.

```powershell
cd C:\Projects\claude-memory-kit
git checkout main; git pull
npm run release -- minor             # [Unreleased] → ## [0.2.3] — <date>; package.json 0.2.2 → 0.2.3
git diff                             # review: ONLY the version bump + CHANGELOG consolidation
git add CHANGELOG.md packages\cli\package.json
git commit -m "release: v0.2.3"      # local release commit — do NOT tag yet (that's the last step)
git push origin main
```

**0b — build + install the real artifact.**

```powershell
cd C:\Projects\claude-memory-kit\packages\cli
npm pack                             # → lh8ppl-claude-memory-kit-0.2.3.tgz
npm uninstall -g @lh8ppl/claude-memory-kit
npm install -g .\lh8ppl-claude-memory-kit-0.2.3.tgz
cmk --version                        # ✅ 0.2.3

# Wipe the user tier so capture-from-zero is honest (back it up first if you care)
Remove-Item -Recurse -Force $env:USERPROFILE\.claude-memory-kit
```

- [ ] **G0** — `cmk --version` → `0.2.3` _(if it says `0.2.2`, you skipped 0a — run `npm run release -- minor` first)_

---

## 1. Scaffold + read every file

Validates scaffold integrity + the Task-69 skill surface.

```powershell
mkdir C:\Temp\cut-gate4; cd C:\Temp\cut-gate4
git init; cmk install; cmk doctor
code .
```

- [ ] **★ G1 — install + doctor clean.**
      `cmk install` → "ready, hooks wired";
      `cmk doctor` → **0 fail** (`6 pass · 0 fail · 3 skip` without memsearch).
      Type:
        `/hooks` → the 5 `cmk-*` hooks are loaded.

- [ ] **★ G2 — the skill is scaffolded + SAFE.**
      Open:
        `.claude\skills\memory-write\SKILL.md`:
      - `allowed-tools: Bash(cmk remember *) Bash(cmk forget *) Read` — **no `Edit`/`Write`**
      - the **"NEVER hand-edit `context/memory/`"** gate
      - no `packages/cli/src` dev paths

- [ ] **★ G3 — CLAUDE.md is slim.**
      The "Memory write rules" block is a few invariants + a pointer to the skill,
      **not** the old multi-step procedure.

- [ ] **G4 — scaffold reads clean.**
      Type: `context\MEMORY.md`, `SOUL.md`, `context.local\machine-paths.md`
      → no kit-internal cruft (no `Task 12`, `design §16.16`, dev-speak),
        no literal `{{TODAY}}`, no `C:\Users\<you>`.
      `.claude\settings.json` has the hooks + the `Bash(cmk:*)` allow-list.

- [ ] **★ G6 — `cmk install` registered the MCP server (Task 108 — new in v0.2.3).**
      Install now wires the MCP surface so Claude can run every memory op in chat, prompt-free:
      ```powershell
      type .mcp.json                                       # mcpServers.cmk = { type:"stdio", command:"cmk", args:["mcp","serve"] }
      Select-String .claude\settings.json -Pattern "mcp__cmk"   # the mcp__cmk__* allow-list entry
      ```
      **PASS:** `.mcp.json` names the `cmk` stdio server **and** `settings.json` allow-lists `mcp__cmk__*`.
      _(Pre-v0.2.3 the MCP server existed but you had to register it by hand; capture/forget rode a Bash `cmk` call that could trigger a permission prompt.)_

---

## 2. Session 1 — build it, stating preferences

Build a small real thing across **one** session.
Each stage pairs a **Build** prompt with a **Say it out loud** preference — a real opinion, stated naturally, **never** "remember this".
End each turn normally (the Stop hook fires auto-extract).
Don't start a new session between stages.

**Stage 0 — baseline.**
 *Build:* "Create a minimal Python web chat UI: a FastAPI server with a WebSocket endpoint and a single static `index.html`. 
Plain HTML/JS, no framework. Put the server in `app.py`."
 → "yes, run it" if offered.

**Stage 1 — refactor to layers.**
 *Build:* "Refactor this into a layered FastAPI project -  `app/{api,services,repositories,schemas,core}/` and `app/main.py`. 
WebSocket route into `api/`, connection/broadcast logic into a service, Pydantic schemas. 
Keep it on port 8000."

 *Say:* "How I build backends: FastAPI is the delivery layer, not the brain. 
Routes stay thin and orchestrate; logic lives in services; data access in boring repositories; Pydantic schemas are the boundary contracts. 
I'd rather pay the structure cost now than fight it in six months."

**Stage 2 — swap to Claude + typing/TDD rule.**
 *Build:* "Change it to a single-user chat with Claude via the Claude Agent SDK (`claude-agent-sdk`) - a `ClaudeAgentService` wrapping `ClaudeSDKClient`, each WebSocket connection its own session."

 *Say:* "Type hints on every signature - Python 3.12+. 
Comments explain why, not what. 
And tests first: boundary test, watch it fail, then implement."

**Stage 3 — stream + async rule + the universal rule.**
 *Build:* "Stream Claude's output to the browser as it arrives — push JSON
 frames over the WebSocket; the client appends to the live bubble."

 *Say:* "Async all the way down — nothing blocking in the event loop." 
 **Then state one cross-project rule:** "From now on, in every project I work on, always use `uv` for packages, never `pip`, and always run `ruff` before committing."

**Watch while you build:**

- [ ] **★ R1 — no console flash (Task 81).**
      At every SessionStart, NO black `node` window flashes to the foreground. (Visual.)

- [ ] **★ R2 — no permission prompt on explicit capture (Tasks 79 + 90).**
      When the agent captures explicitly, Claude Code shows
      **neither** "Allow this bash command?" (the `cmk` call)
      **nor** "Use skill /memory-write?" (the skill).
      Both are allow-listed at install.
      _**Known accepted edge (D-80 / §16.57):** if the agent wraps the call as
      `cd "<abs project path>" && cmk remember …`, Claude Code prompts — not because
      of `cmk` (the bare `cmk …` is allow-listed) but because the absolute-path `cd`
      subcommand isn't auto-approved (compounds are checked per-subcommand). This is
      a documented, deliberately-unfixed edge — click Yes and continue; it does NOT
      fail R2 (the bare-`cmk` path is friction-free)._

- [ ] **★ G5 — explicit-skill security check (Task 69).**
      Mid-build, say: *"remember this: my local cache is at C:\Users\<you>\cache\app."*
      Verify:
      - the agent **ran `cmk remember`** (not a hand-edit), and
      - the committed `context\MEMORY.md` / fact file shows `~\cache\app` — **never** your username.
      (A hand-edit or a leaked username = blocker.)

---

## 3. Capture checks — read the files

```powershell
cmk search "layered"; cmk search "type hints"; cmk search "port 8000"
type context\MEMORY.md
dir context\memory; type context\memory\feedback_*.md
```

- [ ] **B1 — auto-capture fires.**
      Your decisions/prefs (layered, Claude SDK, type hints, async, port 8000)
      show up **without** "remember this".

- [ ] **★ B2 — rich capture (F1).**
      Durable preference facts are **rich fact files** (frontmatter + `**Why:**` + `**How to apply:**`),
      not bare one-liners.

- [ ] **★ B9 — auto-extract writes RICH project facts (Task 103 — the v0.2.2 headline).**
      You never ran `cmk remember` in Session 1 — yet durable PROJECT knowledge (the layered
      structure, the Claude-SDK service, the streaming design) landed as **rich fact files**,
      not just terse `MEMORY.md` bullets:
      ```powershell
      dir context\memory\project_*.md
      type context\memory\project_*.md
      ```
      At least one `project_*.md` carries `write_source: auto-extract` + `trust: medium` +
      a `**Why:**`/`**How to apply:**` body. **That's the native-immune rich capture working** —
      a turn that saved to Claude's built-in memory instead would still leave THIS behind.
      _(Pre-Task-103 auto-extract wrote only terse bullets; rich files needed an explicit `cmk remember`.
      If `context\memory\` has NO `write_source: auto-extract` rich file, the headline didn't fire this
      session — investigate before shipping: re-run a knowledge-dense turn; it's a Haiku judgment pass.)_

- [ ] **★ B3 — the wedge fills.**
      Type: `%USERPROFILE%\.claude-memory-kit\HABITS.md` (+ `USER.md`, `LESSONS.md`)
      → your cross-project style is there (was empty pre-v0.2).

- [ ] **★ B4 — stated rule → `trust: high`, automatically.**
      The uv/ruff rule landed in a user-tier scratchpad on its own (no command),
      provenance `trust: high` + `write: user-explicit`:
      ```powershell
      findstr /S /C:"trust: high" %USERPROFILE%\.claude-memory-kit\*.md
      ```

### ★ B5 — Graduation: the write-lock fix (Task 91)

`MEMORY.md` is a byte-capped hot index.
When it fills with high-trust facts, the oldest **graduate** out into `context\memory\*.md`
(the permanent, searchable store) so new writes keep landing instead of erroring `cap_exceeded`.

Deterministic probe — a **throwaway** project (doesn't touch your run);
lower the cap so graduation fires after a few facts:

```powershell
$g = "C:\Temp\grad-check"; Remove-Item -Recurse -Force $g -EA SilentlyContinue
mkdir $g > $null; Set-Location $g; git init | Out-Null; cmk install | Out-Null
# NO BOM — Set-Content -Encoding utf8 writes a BOM that breaks the JSON cap override
[IO.File]::WriteAllText("$g\context\settings.json", '{ "scratchpads": { "MEMORY.md": { "max_chars": 1400 } } }')
1..12 | ForEach-Object { cmk remember "Durable decision $_ the next session must recall to avoid re-deriving it" | Out-Null }
"MEMORY.md  = $((Get-Item context\MEMORY.md).Length) B  (cap 1400 — must stay <= cap)"
"graduated  = $((Get-ChildItem context\memory\project_*.md -EA SilentlyContinue).Count) fact files  (must be > 0)"
"audit grad = $((Select-String context\.locks\audit.log -Pattern '\"action\":\"graduated\"' -EA SilentlyContinue).Count) events"
Set-Location C:\Temp; Remove-Item -Recurse -Force $g -EA SilentlyContinue
```

- [ ] **★ B5 — PASS:**
      - all 12 land (**no `cap_exceeded`**)
      - `MEMORY.md` ≤ cap
      - graduated fact files **> 0**
      - audit graduated events **> 0**
      _(Pre-Task-91 the ~5th `cmk remember` would error and memory would silently write-lock.)_

### ★ B6 — LOW-trust drops leave a trace, and the log stays out of git (Task 92)

A discarded LOW candidate used to vanish with no record.
Now each drop logs a `low_trust_discarded` excerpt to `extract.log` —
which carries raw, un-screened text, so it must never be committed.

```powershell
# The security half (deterministic): the diagnostic log is gitignored.
git -C C:\Temp\cut-gate4 check-ignore context\sessions\probe.extract.log
# The trace half (observational): if any build turn was graded LOW, you'll see it.
findstr /S /C:"low_trust_discarded" C:\Temp\cut-gate4\context\sessions\*.extract.log
```

- [ ] **★ B6 — PASS (must):**
      `check-ignore` prints the path (it's ignored) → the raw excerpt never reaches git.
- [ ] **B6 — Observational:**
      if a turn was graded LOW, its excerpt appears in `extract.log`
      (empty is fine — it means nothing graded LOW this run).

### ★ B7 — Graduation also fires proactively at session-end (Task 94.3)

Reactive graduation fires on a write.
The **proactive** sweep catches a scratchpad that drifts over cap **between** sessions
(e.g. a cap change, or bullets aging) — with no triggering write.
Probe: fill at the default cap, then **lower** the cap so the file is now over,
then run the session-end handler.

```powershell
$s = "C:\Temp\sweep-check"; Remove-Item -Recurse -Force $s -EA SilentlyContinue
mkdir $s > $null; Set-Location $s; git init | Out-Null; cmk install | Out-Null
1..12 | ForEach-Object { cmk remember "Session-end sweep durable fact number $_ worth keeping around" | Out-Null }
# Now DROP the cap below the current size — MEMORY.md is suddenly over budget, with no new write:
[IO.File]::WriteAllText("$s\context\settings.json", '{ "scratchpads": { "MEMORY.md": { "max_chars": 700 } } }')
$before = (Get-Item context\MEMORY.md).Length
# Feed stdin ('{}' | …) — the handler drains its stdin like a real hook. (Since Task 101
# a bare `cmk-compress-session` no longer HANGS on a manual run — it detects the TTY and
# returns — but piping '{}' still mirrors the real hook envelope, so keep it.)
$env:CMK_PROJECT_DIR = $s; '{}' | cmk-compress-session | Out-Null    # the SessionEnd handler (fast — empty buffer skips Haiku)
"MEMORY.md  before = $before B  →  after = $((Get-Item context\MEMORY.md).Length) B  (must drop toward <= 700)"
"sweep grad = $((Select-String context\.locks\audit.log -Pattern '\"trigger\":\"session-end\"' -EA SilentlyContinue).Count) session-end graduated events  (must be > 0)"
Remove-Item Env:\CMK_PROJECT_DIR
Set-Location C:\Temp; Remove-Item -Recurse -Force $s -EA SilentlyContinue
```

- [ ] **★ B7 — PASS:**
      - `MEMORY.md` shrinks toward the new cap
      - audit shows **`"trigger":"session-end"`** graduated events **> 0** (the proactive sweep fired without a write)

### B8 — The user-tier persona graduates too (Task 94.2, observational)

Graduation isn't project-only — the cross-project persona (`USER`/`HABITS`/`LESSONS`)
graduates its overflow into `<user-tier>\fragments\` as well.
It's the **same mechanism** B7 proves deterministically, with the tier gate lifted to P+U,
so this run just watches for it rather than forcing it.
After Session 1 (B3/B4 fill the persona), if any persona scratchpad grew past its cap:

```powershell
dir %USERPROFILE%\.claude-memory-kit\fragments
findstr /S /C:"\"tier\":\"U\"" %USERPROFILE%\.claude-memory-kit\.locks\audit.log | findstr graduated
```

- [ ] **B8 — PASS (observational):**
      if the persona overflowed, `fragments\` holds the graduated persona facts
      and the user-tier audit shows `graduated` events with `"tier":"U"`.
      Empty is fine — it means the persona stayed under cap this run.
      The graduation path itself is proven by **B7** (same code) and locked by the suite (`cli-load-cap` 94.2).

---

## 4. Explicit capture probes — run in the build terminal

- [ ] **C1 — terse.**
      `cmk remember "We deploy with Kamal to Hetzner, never Vercel."`
      → appears in `context\MEMORY.md`.

- [ ] **C2 — rich (F1).**
      ```powershell
      cmk remember "Reflection beats one-shot generation" --type feedback --title "reflection-loop" --why "iterative critique catches errors a single pass misses" --how "generator then critic then route; cap iterations"
      ```
      → a rich `context\memory\feedback_reflection-loop.md` with Why/How.

- [ ] **C3 — Poison_Guard.**
      `cmk remember "key sk-ant-api03-AAArealishlooking..."`
      → **rejected** (exit 2), nothing written anywhere.

- [ ] **C4 — sanitization.**
      `cmk remember "venv at C:\Users\<you>\proj\.venv"`
      → the file shows `~\…`, **never** your username.

---

## 4b. The conversational surface — Claude drives the tools (Tasks 108 + 117)  ⬅️ the v0.2.3 headline

The regular user **never types `cmk`** — they talk, and Claude runs the MCP tools **prompt-free**.
Run these **in chat** (a real Claude Code session), not the terminal. This is the surface the
CLI suite structurally can't cover (Claude is in the loop).

- [ ] **★ M0 — the 11 tools are live (Task 108).**
      Say: *"list your cmk MCP tools."*
      → `mk_remember, mk_search, mk_get, mk_timeline, mk_cite, mk_recent_activity, mk_trust, mk_lessons_promote, mk_forget, mk_queue_list, mk_queue_resolve` (**11**).
      _(Empty = the server didn't launch; re-check G6 + that you restarted Claude Code.)_

- [ ] **★ M1 — capture in chat, prompt-free (Task 108).**
      Say: *"remember our staging environment runs on Fly.io — because it's cheap to spin ephemeral envs up and down."*
      **PASS:** Claude calls **`mk_remember`** (not a Bash command), **no "Allow this command?" prompt**, silent on success.
      _(The "because" makes it a rich **fact** — M2's forget targets facts, not the terse bullets a bare "remember X" makes.)_

- [ ] **★ M2 — "forget X" → two-step, then gone (Tasks 117 + 108b + 110).**
      Say: *"actually, forget the Fly.io staging decision."*
      **PASS, in order:**
      1. The **first** `mk_forget` call returns a **preview + a confirm token** — **nothing deleted yet** (an auto-invoking model can't silently destroy memory).
      2. After you confirm, the **second** call tombstones it.
      3. Say *"where does staging run?"* → **gone** (no Fly.io), with **no manual `cmk reindex`** (forget self-heals search).
      _(Pre-110 a forgotten fact lingered in search until a manual reindex; pre-117 there was no plain-speech path to forget at all.)_

- [ ] **M3 — "trust this / not important" (Task 117).**
      Capture two throwaway facts, then say on one *"that one's important — keep it,"* on the other *"eh, that's not important, I'm not sure about it."*
      **PASS:** Claude calls **`mk_trust`** with `high` for the first and `low` for the second.
      _(The one free-speech gap D-85 named — pre-117 trust could only be changed via the CLI.)_

---

## 5. Session 2 — recall + recall-QUALITY  ⬅️ start a NEW session

Start Session 2 as a **new chat in the SAME window** (don't cleanly close Session 1) — that's the
case Task 105 fixes: Claude Code does **not** fire SessionEnd on a new-chat-same-window, so the
`now.md` rollup has to self-heal at the new SessionStart instead.

Without re-explaining anything, ask:
*"What are my standing cross-project rules, and how is this project structured?"*
then:
*"Add a `/health` endpoint."*

- [ ] **★ D1 — recall.**
      It names your rules (uv/ruff/type-hints/layered) + the structure (port 8000, layered, Claude SDK)
      **without a re-brief**.

- [ ] **D6 — SessionStart self-heal (Task 105).**
      Session 1's buffer rolled forward even though you never cleanly closed it — at Session 2's
      SessionStart the kit rolled the leftover `now.md` into a dated daily file:
      ```powershell
      dir context\sessions\today-*.md      # exists (Session 1 rolled at Session 2 start)
      type context\sessions\*.compress.log  # a roll entry; now.md is small/empty again
      ```
      _(Pre-Task-105 a never-cleanly-closed session left `now.md` growing with no `today-*.md` built.
      If you closed+reopened cleanly instead, SessionEnd already rolled it — same outcome, different trigger.)_

- [ ] **D2 — style follow-through.**
      `/health` lands as a **thin route** in `api/`, **type-hinted**, without being re-told your style.

- [ ] **★ D3 — recall FEEL (the cut judgment).**
      Watch *how* it answers your **rules**: lead with memory, or **glob/read the code** to re-derive?
      The harness found this ~**50/50** — the known **Task-75 active-recall gap** (v0.3).
      The cold-open (§6) is the reliable wedge; in-project recall varies.
      **Decide:** ship with this, or want Task 75 first? *(Rec: ship.)*

- [ ] **R2-quality — no hallucinated summary (Task 84).**
      Type: `context\sessions\recent.md` and `today-*.md`
      → the rolling summary describes only what the session contained (FastAPI, layered, Claude SDK, port 8000).
      **FAIL:** an invented framework (Flask/Django), wrong SDK, or a port the project never had.

- [ ] **R3-quality — config recall, not a code-read (Task 80).**
      `cmk search "port 8000"` returns a hit,
      and the "what port" answer doesn't require globbing `**/*.py`.

- [ ] **D4 — stale-thread baseline (Task 68, watch).**
      `context\MEMORY.md` "Active Threads" — are finished threads still listed as active?
      (Baseline for the v0.2.x pruning fix.)

- [ ] **D5 — importance-aware inject (Task 93, observational).**
      If a tier ever overflowed its inject budget, `context\.locks\truncation.log` shows
      `"strategy":"importance-ordered"` and the **dropped** sections are the lowest-value ones —
      never a high-trust section while a low-trust one survives.
      ```powershell
      type context\.locks\truncation.log
      ```
      _(No truncation event = the tiers fit; the ordering is suite-covered regardless.)_

---

## 6. Session 3 — the cold-open (the wedge, wow #1)  ⬅️ a BRAND-NEW project

```powershell
mkdir C:\Temp\cut-gate-coldopen5; cd C:\Temp\cut-gate-coldopen5
git init; cmk install; code .
```
Ask: *"Start a new Python backend for me - set up the structure."*

- [ ] **★ E1 — cold-open.**
      It scaffolds the **layered** shape + `uv`/`ruff` tooling **without being told** —
      because the Session-1 persona injected.
      *"How does it know that?"* = the wedge.
      **This is the gate that matters most.**

---

## 7. Full feature sweep — every `cmk` subcommand  (~15 min, in `C:\Temp\cut-gate4`)

**Recall & index**

- [ ] **F-1**
      - `cmk search "<kw>"` finds facts
      - `cmk reindex` rebuilds, search still works
      - `cmk view` — _v0.1.x stub; expect "not yet implemented" (not a failure)_

**Cross-project persona**

- [ ] **F-2**
      `cmk persona generate` → runs synthesis;
      candidates promote or land in `~\.claude-memory-kit\queues\persona-review.md`.

- [ ] **★ F-3 — explicit promote (Task 76).**
      `cmk lessons promote <id>` → moves a project **fact** to the user tier at **`trust: high`** via the safe path;
      verify the bullet in `~\.claude-memory-kit\LESSONS.md`; try `--to HABITS.md`.
      _Use a **fact** id — in `cmk search` output its location is a `context\memory\*.md` file (a `context\MEMORY.md:NN` row is a scratchpad **bullet**, which promote rejects with a "scratchpad bullet, not a fact" hint)._

- [ ] **★ F-3b — persona portability (Task 72).**
      `cmk persona export persona-bundle.json` → one bundle file;
      then `cmk persona import persona-bundle.json` (re-import is idempotent — backs up + reapplies);
      the export carries **no** username/secret (already sanitized), and `.locks/.index/` are NOT in the bundle.

**Lifecycle & self-curation**

- [ ] **F-4**
      - `cmk daily-distill` → consolidates daily summaries
      - `cmk weekly-curate` → rolls `today-*.md` >7d into `archive.md`

- [ ] **F-5**
      `cmk roll` → session rotation (no error on your OS).
      _(`cmk compress` requires `--lazy` in v0.1.0 — bare `cmk compress` is a v0.1.x stub.)_

- [ ] **F-6**
      `cmk register-crons` → registers host-scheduler jobs (then `cmk doctor` HC-6 passes); confirm no error.

**Memory management**

- [ ] **F-7**
      `cmk forget <id> --yes` → tombstones (moved to `archive\tombstones`, still resolvable — NOT hard-deleted).
      **v0.2.3:** the fact **disappears from `cmk search` immediately** — no manual `cmk reindex` (Task 110); the free-speech / two-step path is **M2**.
      _(`--yes` is required in v0.1.0; `<id>` must be a **fact** id — see F-3.)_

- [ ] **F-8**
      `cmk trust <id> <high|medium|low>` → changes a fact's trust (and `cmk search` reflects it without a manual reindex).
      The free-speech path ("trust this" / "not important") is **M3**.

- [ ] **F-9**
      `cmk queue review` / `cmk queue conflicts` → walk pending medium-trust extracts / conflicts.

- [ ] **F-10**
      `cmk purge --hard <id>` → the explicit destructive path.
      _v0.1.x stub; expect "not yet implemented" (use `cmk forget` for normal deletion). Not a failure._

**Health & repair**

- [ ] **F-11**
      - `cmk doctor` → HC-1..HC-9 accurate
      - `cmk repair --hooks` re-wires if settings drift
      - `cmk config get/set` — _v0.1.x stub; expect "not yet implemented" (doctor + repair are the live health surface). Not a failure._

**Native coexistence & import**

- [ ] **F-12**
      `cmk disable-native-memory` → writes committable `autoMemoryEnabled:false` (doctor HC-8 reflects it);
      `cmk enable-native-memory` reverses.

- [ ] **F-13**
      `cmk import-anthropic-memory` → imports existing native Auto Memory files into the kit schema.

**MCP + transcripts**

- [ ] **F-14**
      `cmk mcp serve` → stdio MCP server starts (Ctrl-C to stop);
      `mk_remember`/`mk_get`/`mk_search` respond (and report `queued` correctly, not a false `accepted`).

- [ ] **F-15**
      `cmk transcripts extract` (**no path arg**) → pulls durable facts out of your captured Claude session transcripts.
      _Heads-up: with no arg it scans your **whole** `~\.claude\projects` history (can be thousands of sessions / many MB written to `transcripts-extracted\`). Run it where you're OK with that, or skip — it's not a ★._

- [ ] **F-16 — transcript temp is gitignored (Task 115 — new in v0.2.3).**
      The auto-extract write buffer (`.extract-*.tmp`) is created-then-deleted, so `git status` usually shows nothing **whether or not** the ignore works — test the rule **deterministically**:
      ```powershell
      New-Item -Force context\transcripts\.extract-test.tmp | Out-Null
      git check-ignore context\transcripts\.extract-test.tmp   # PASS = echoes the path (ignored)
      Remove-Item context\transcripts\.extract-test.tmp
      ```
      A partial buffer can never travel with `git clone`.

---

## 8. Lighter scenarios  (~10 min)

- [ ] **L1 — plugin route (route B).**
      In a *second* empty folder, inside Claude Code:
      `/plugin marketplace add LH8PPL/claude-memory-kit`
      → `/plugin install claude-memory-kit`
      → `/claude-memory-kit:bootstrap`
      → `/reload-plugins`.
      Scaffolds `context/`, hooks active.
      (Local variant if the marketplace lags: `claude --plugin-dir <repo>\plugin`.)

- [ ] **L2 — "remember this".**
      Say *"Remember this: the API base URL is `https://api.example.com`."*
      → `cmk search "api.example.com"` finds it.

- [ ] **★ L3 — privacy tag.**
      Say *"`<private>` my license key is ABC-123 `</private>` — now add a README."*
      → `context\MEMORY.md` does **NOT** contain `ABC-123`.

---

## 9. Portability ("another computer")

In `C:\Temp\cut-gate4`: `git add -A; git commit -m "wip"`.
Clone elsewhere (`git clone C:\Temp\cut-gate4 C:\Temp\cut-gate-clone`), open *that* in Claude Code.

- [ ] **★ H1**
      the clone already has the project memory (`context/` is committed — tenet T2).

---

## Verdict + the cut

**Cut if** every **★** passes —
`G1–G3, G5, G6, R1, R2, M0, M1, M2, B2, B9, B3, B4, B5, B6, B7, D1, E1, F-3, L3, H1` —
and you've decided D3's recall variance is acceptable *(rec: yes — active recall is v0.3)*.
**M0–M2 are the v0.2.3 headline** — every memory op runs as a Claude-driven MCP tool in chat, prompt-free, with "forget X" two-step + auto-reindexed. **B9 stays the standing rich-auto-capture gate** (the v0.2.2 headline) — if `context\memory\` has no `write_source: auto-extract` rich file, investigate before shipping.

(B8, D5, D6 are observational — they confirm the new graduation/inject/self-heal behavior when it fires,
but the code is proven by B7/B5 + the suite.)

A clean full sweep (F-1..F-15 + L1–L2) means nothing ships untested.

### ★ Pre-tag gate (do this BEFORE the tag — docs lag the code otherwise)

The tag triggers an **immutable** npm publish; whatever docs are committed at that moment ship forever. Confirm:

- [ ] **CHANGELOG consolidated** — `[Unreleased]` folded into `## [X.Y.Z] — <date>`; `[Unreleased]` reset; `print-release-notes.mjs <version>` parses the section.
- [ ] **★ READMEs reflect THIS version** — both the **root `README.md`** (status line + "What it does") **and** the **npm landing `packages/cli/README.md`** describe this version's headline capability + its new commands. _(Lesson from v0.2.0: the tag beat the README refresh, so the immutable npm 0.2.0 page shipped a stale landing page — fixed only by a 0.2.1 patch. The npm landing page is `packages/cli/README.md`, NOT the root one.)_
- [ ] **`packages/cli/package.json` version** = the version you're about to tag (`0.2.3`).

**To publish (your outward action):**

```powershell
git tag v0.2.3
git push origin v0.2.3
```

`publish.yml` runs the suite, publishes `@lh8ppl/claude-memory-kit@0.2.3` to npm with provenance,
and creates the GitHub Release from the `[0.2.3]` CHANGELOG section.

**Verify after:**
- `npm view @lh8ppl/claude-memory-kit version` → `0.2.3`
- the npm page shows a **provenance** badge
- the GitHub Release matches `## [0.2.3]`

Per-finding notes go in a dated doc under [`../journey/`](../journey/), not here — this stays a clean script.
