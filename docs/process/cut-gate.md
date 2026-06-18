# cmk — full test + cut gate

**The single guide to run before tagging a release.** Version-agnostic — reused every cut.

> **Cutting now: `v0.3.2`** — **the within-paradigm POLISH patch** (make the kit better without changing what it is — D-130):
> **Task 153** (FTS5 query sanitization — `cmk search "v0.3"` / `user-explicit` no longer crash — the headline user-facing fix this cut) and **Task 152** (`validate-index-completeness` — dev-tooling, runs in `npm test`, no live probe).
> **HELD for v0.3.3 (D-164):** `cmk digest` + the `context/DECISIONS.md` journal (Task 147) — the CODE is merged + tested, but it is NOT framed as a shipped feature until it is **recall-complete** (the AI must recall the decision timeline from the journal, not just write a file a human opens — the kit's "you don't manage memory, it just works" thesis). The recall wiring + a live recall gate land in v0.3.3. So **DJ1–DJ3 below test the journal CODE (still run them — the code ships in main) but are NOT v0.3.2 cut-blockers.**
> **141b (the `node:sqlite` migration) was REJECTED on perf** (D-162): clean CI bench showed node:sqlite ~10% slower on FTS5 keyword search → better-sqlite3 stays, 141a's install-time ask remains the npm-12 answer. Nothing to test here — the kit's storage layer is unchanged.
> This is a **PATCH** (`npm run release -- patch`) — 0.3.x is the polish lane; the differentiator (recall) shipped at 0.3.0, so additive polish is patch-level per RELEASE-PLAN.md + the one-differentiator-per-minor rule.
> _The version-agnostic checks below stand every cut; the v0.3.2 cut-blocker gate is **FQ1** (FTS5 query sanitization). DJ1–DJ3 run but are journal-CODE checks held for the v0.3.3 feature framing._
> _Replace `0.3.2` / `v0.3.2` in the commands below if you reuse this guide for a later cut._
>
> **Prior banner (v0.3.1 cut, pre-2026-06-16 — kept per the decision-trail rule):** the within-paradigm sweep (config / import-claude-md / near-dup-at-write / status line / memory-health doctor / Poison_Guard catalog / npm-12 readiness / `.gitattributes`) + four clean-build cut-gate fixes (C5/C6 `<private>` leaks, F-11 repair --index, F-11b index-drift trace). The v0.3.1-specific gates were **C5, C6, F-11, F-11b** — still run them (standing now).
> **Original banner (v0.3.0 cut, pre-2026-06-14 — kept per the decision-trail rule):** RECALL, the wow-#2 release — semantic + hybrid search (Task 65), one-flag enablement (Task 46), the recall trigger (Task 75), the L3 raw tier (Task 104). That was a MINOR (the reserved recall version).

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

## New in v0.3.0 — what this run additionally validates

The headline is **RECALL works** — the very gap D3 waved through last cut ("~50/50, the known Task-75 gap") is what this release fixes.
The ladder: authority preamble → auto-invoked `memory-search` skill → semantic/hybrid search → timeline/get → the raw transcript floor.

| Check | Feature | What's new |
| --- | --- | --- |
| **★ G2b** | Task 75.1 | the **`memory-search` recall skill** scaffolds beside memory-write — **read-only** contract, `context: fork` |
| **★ G7** | Task 46 | **`cmk install --with-semantic`** — one flag: embedder installed, model pre-warmed, search **defaults to hybrid** |
| **★ W1** | Tasks 75.0–75.2 | *"what did we decide about X?"* → the skill **auto-fires** (forked) → a **curated, citation-backed summary** — no re-brief, no code-grepping |
| **★ W2** | Tasks 65 + 46 | **paraphrase recall**: a question with ZERO keyword overlap finds the fact (bare `cmk search`, no flags — hybrid by default) |
| **★ W3** | Task 104.1 | transcripts record **what Claude DID** — a `**Tools:**` block under assistant turns |
| **★ W4** | Task 104.2 | **`--scope transcripts`**: an old error message / command is findable in the raw record — the last-resort tier |
| **★ D3** | Task 75 | recall FEEL is now a **GATE, not a judgment call** — leads with memory, never re-derives from code |

**Standing checks (re-run; not new this cut):** the **v0.2.3 conversational surface M0–M3** (Tasks 108/117), the **v0.2.2 rich-auto-capture** headline **B9** (Task 103), and the **§19 retention arc B5–B8 + D5** (Tasks 91–94).
**The table above lists only what's NEW this cut — the body below is the FULL end-to-end sweep (every section, every release; ~70 checks).** Nothing standing was removed; the v0.2.3 additions are §4b, the v0.2.2 headline is B9, the retention arc is B5–B8.

### Also new in v0.3.1 — the polish-patch gates

The v0.3.x feature sweep is covered by the standing sections below (config → **F-11**, `--with-semantic` near-dup → **C** + W2, memory-health → **F-11**, status line → SessionStart, npm-12 → **G1**/HC-8). The v0.3.1-SPECIFIC new gates — all four found by re-running this gate on a clean build:

| Check | Fix | What it verifies |
| --- | --- | --- |
| **★ C5** | #179 | `<private>` stripped on the `cmk remember`/`mk_remember`/import write path (not just the prompt hook) — secret absent from body, title, filename, INDEX |
| **★ C6** | #180 | `<private>` survives an 80-char TITLE trim that severs the closing tag — strip runs before the title is derived |
| **★ F-11b** | #181 | INDEX drift is DETECTED by HC-4 (+ `cmk reindex` heals it); a failed rebuild leaves an audit trace instead of a silent stale committed INDEX |
| **★ F-11** | #178 | `cmk repair --index` runs the REAL reindex (was a silent no-op — masked by mocked tests) |

Plus the SHA-256 fingerprint migration (internal; no probe — the suite + the unchanged on-disk field names cover it).
_Note: `mk_search` now also takes `scope`; the tool count stays **11**. The B5/B7 probes overwrite `settings.json` wholesale — fine in their throwaway dirs (a real project's `search.default_mode` would be lost; don't reuse the probe line outside them)._

### Also new in v0.3.2 — the digest + decision-journal gates

The headline this cut is **`cmk digest` + the standing append-only `context/DECISIONS.md`** (Task 147) — the chronological decision journal the kit was missing. Plus the **FTS5 query crash fix** (Task 153). All four v0.3.2-specific ★ gates run in §4c (digest/journal) and §4 (FTS5):

| Check | Feature | What it verifies |
| --- | --- | --- |
| **★ DJ1** | Task 147 | `cmk digest` prints a readable memory page (facts by type) AND creates `context/DECISIONS.md` from `type:project` decision facts (title + when + Why) |
| **★ DJ2** | Task 147 / D-161 | the journal is **append-only**: a second `cmk digest` doesn't duplicate; a forgotten decision's entry **survives, marked `_(retracted …)_` in place** (never deleted — the trail is the point) |
| **★ DJ3** | Task 147 | only `type:project` facts journal (a `feedback`/`reference` fact does NOT appear in `DECISIONS.md`) |
| **★ FQ1** | Task 153 | `cmk search "v0.3"` / `"user-explicit"` / `"section:search"` return results (or clean "no results"), **never the old `FTS5 parse error` crash** |

_Task 152 (`validate-index-completeness`) is dev-tooling — it runs in `npm test`, no live probe._

---

## 0. Cut the release locally, then build the REAL artifact

**0a — cut the release locally FIRST.** This bumps `package.json` + finalizes the CHANGELOG so the artifact you test below actually reports `0.3.1` (without this, `npm pack` builds the OLD `0.3.0`). It is a **local commit only** — the tag-push (the outward publish) stays the very last step, after every ★ passes.

```powershell
cd C:\Projects\claude-memory-kit
git checkout main; git pull
npm run release -- patch             # 0.3.2 is a PATCH in the polish lane (RELEASE-PLAN.md); [Unreleased] → ## [0.3.2]; package.json 0.3.1 → 0.3.2
git diff                             # review: ONLY the version bump + CHANGELOG consolidation
git add CHANGELOG.md packages\cli\package.json
git commit -m "release: v0.3.2"      # local release commit — do NOT tag yet (that's the last step)
git push origin main
```

**0b — build + install the real artifact.**

```powershell
cd C:\Projects\claude-memory-kit\packages\cli
npm pack                             # → lh8ppl-claude-memory-kit-0.3.2.tgz
npm uninstall -g @lh8ppl/claude-memory-kit
npm install -g .\lh8ppl-claude-memory-kit-0.3.2.tgz
cmk --version                        # ✅ 0.3.2

# Wipe the user tier so capture-from-zero is honest (back it up first if you care)
Remove-Item -Recurse -Force $env:USERPROFILE\.claude-memory-kit
```

- [ ] **G0** — `cmk --version` → `0.3.2` _(if it says `0.3.1`, you skipped 0a — run `npm run release -- patch` first; if it bumped to `0.4.0`, you ran `minor` by mistake — `git checkout CHANGELOG.md packages\cli\package.json` and re-run with `patch`)_

---

## 1. Scaffold + read every file

Validates scaffold integrity + the Task-69 skill surface.

```powershell
mkdir C:\Temp\cut-gate16; cd C:\Temp\cut-gate16
git init
cmk install --with-semantic          # v0.3.0: the one-flag semantic enablement (G7) — ~260 MB once + the model pre-warm; takes a minute
cmk doctor
code .
```

- [ ] **★ G1 — install + doctor clean.**
      `cmk install` → "ready, hooks wired";
      `cmk doctor` → **0 fail** (~`4 pass · 0 fail · 3 skip` on a fresh install — 7 checks now; the 2 memsearch checks were removed in Task 120).
      Type:
        `/hooks` → the 5 `cmk-*` hooks are loaded.

- [ ] **★ G2 — the skill is scaffolded + SAFE.**
      Open:
        `.claude\skills\memory-write\SKILL.md`:
      - `allowed-tools: Bash(cmk remember *) Bash(cmk forget *) Read` — **no `Edit`/`Write`**
      - the **"NEVER hand-edit `context/memory/`"** gate
      - no `packages/cli/src` dev paths

- [ ] **★ G2b — the RECALL skill is scaffolded + READ-ONLY (Task 75.1 — new in v0.3.0).**
      Open:
        `.claude\skills\memory-search\SKILL.md`:
      - `context: fork` (recall runs isolated — raw results never land in your chat)
      - `allowed-tools` grants **only** search/get/timeline/recent (both surfaces) —
        **no** `mk_remember`/`mk_forget`/`mk_trust`, **no** `Edit`/`Write` (a recall path that can't mutate memory)
      - the body's Step 4 names `--scope transcripts` as LAST RESORT

- [ ] **★ G7 — `--with-semantic` enabled hybrid-by-default (Task 46 — new in v0.3.0).**
      The install above printed **"Semantic recall ENABLED — `cmk search` now defaults to hybrid here. Model cached (Ns)."**
      ```powershell
      type context\settings.json        # "search": { "default_mode": "hybrid" }
      ```
      **PASS:** the install line said ENABLED **and** settings.json carries `default_mode: hybrid`.
      _(If npm failed, settings must NOT say hybrid — no half-state; keyword search unaffected.)_

- [ ] **★ G3 — CLAUDE.md is slim.**
      The "Memory write rules" block is a few invariants + a pointer to the skill,
      **not** the old multi-step procedure.

- [ ] **★ G4 — scaffold reads clean (READ EVERY FILE IN ALL THREE TIERS — not a spot-check).**
      A scaffold regression (a leaked username, an unrendered `{{TODAY}}`, malformed
      frontmatter, a real machine path in a committed tier) can hide in a file the
      named checks skip — so **enumerate and read every memory file across all three
      tiers**, not just MEMORY.md/SOUL.md (the user's standing rule, 2026-06-16):
      ```powershell
      # FIRST set the console to UTF-8 — otherwise Get-Content renders the seed
      # files' `·` (U+00B7 middot) and `—` (em-dash) as mojibake (`ֲ·`, `ג€"`) on
      # a default Windows code page, making a CLEAN scaffold LOOK corrupted (the
      # 2026-06-17 v0.3.3 cut-gate false alarm). This is a DISPLAY artifact, not a
      # file problem — the bytes are correct UTF-8.
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      function Read-Tier($dir) {
        if (-not (Test-Path $dir)) { Write-Output "(no $dir)"; return }
        Get-ChildItem -Recurse $dir -File | % { "`n===== $($_.FullName) ====="; [System.IO.File]::ReadAllText($_.FullName) }
      }
      Read-Tier "$env:USERPROFILE\.claude-memory-kit"   # User tier (cross-project)
      Read-Tier "context"                                # Project tier (committed)
      Read-Tier "context.local"                          # Local tier (gitignored)
      ```
      _If you DO see `ֲ·` / `ג€"`-style mojibake after the UTF-8 line above, verify the raw bytes before flagging it — `[System.IO.File]::ReadAllBytes(<file>)` then check the char after `chars ` is `U+00B7` (run the codepoint check from the v0.3.3 cut log). A real corruption is a cut-blocker; a console-display artifact is not._
      **PASS — every file must show:**
      - no kit-internal cruft (no `Task 12`, `design §16.16`, dev-speak)
      - no literal `{{TODAY}}` or any other unrendered placeholder (dates are real)
      - **no real username (`C:\Users\<you>` / your name)** anywhere in a COMMITTED tier (user + project) — a public-repo leak is a cut-blocker; `context.local/` (gitignored) may hold real paths but a fresh scaffold shouldn't
      - example bullets clearly marked `(example)` so a user knows to replace them
      - well-formed frontmatter (the seed `2020-01-01` / all-zero sha1 are deliberate sentinels — fine)
      `.claude\settings.json` has the 5 hooks + the `Bash(cmk:*)` allow-list.

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
 *Build:* "Stream Claude's output to the browser as it arrives - push JSON frames over the WebSocket; the client appends to the live bubble."

 *Say:* "Async all the way down — nothing blocking in the event loop." 
 **Then state one cross-project rule:** 
 "From now on, in every project I work on, always use `uv` for packages, never `pip`, and always run `ruff` before committing."

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

- [ ] **★ B9b — the capture TREND clears the suppressor threshold (Task 137.5 — the D-122 detection gap).**
      Per-turn outcomes are individually plausible; only the trend exposes a
      systemic suppressor (the dedup self-poisoning shipped ~10 releases of
      individually-normal `nothing_durable` skips). After the session's organic
      turns, run the trend gate over this run's extract logs:
      ```powershell
      npm run trend:extract -- <your-run-project>\context\sessions
      ```
      PASS = `nothing_durable` rate under 80% of judged turns (min sample 5;
      mechanical skips excluded). FAIL = the D-122 fingerprint — check the
      dedup context + the extraction prompt before trusting this build's capture.
      _(Inconclusive on a short session is honest — rerun after more turns, don't wave it.)_

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
git -C C:\Temp\cut-gate16 check-ignore context\sessions\probe.extract.log
# The trace half (observational): if any build turn was graded LOW, you'll see it.
findstr /S /C:"low_trust_discarded" C:\Temp\cut-gate16\context\sessions\*.extract.log
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
      `cmk remember "key sk-ant-api03-AAArealishlookinglongtokenvalue00"`
      → **rejected** (exit 2), nothing written anywhere.
      _(The token must be ≥40 chars after `sk-` — the guard's minimum, tuned to real key lengths (~95) without false-positives on short `sk-` words. The pre-2026-06-11 example here ended in a literal `...` and was 27 chars — UNDER the minimum, so it sailed through and landed a fake secret in project memory (the cut-gate16 find): probe strings must actually trip the pattern they test, same class as the D-84 real-input rule.)_

- [ ] **C4 — sanitization.**
      `cmk remember "venv at C:\Users\<you>\proj\.venv"`
      → the file shows `~\…`, **never** your username.

- [ ] **★ C5 — `<private>` stripped on the `cmk remember` write path (Task #179 / v0.3.1).**
      The prompt hook isn't the only privacy boundary — a direct CLI/MCP capture must redact too.
      ```powershell
      cmk remember "deploy host is prod-7 <private>root pw is hunter2-SECRET</private> use the bastion" --type project
      Select-String -Path context\memory\*.md,context\memory\INDEX.md -Pattern "hunter2-SECRET"
      ```
      **PASS:** the search finds **nothing** (secret absent from body, title, filename, AND INDEX); the fact body shows `[private content redacted]`.
      _(Pre-v0.3.1 the tag was honored only by the UserPromptSubmit hook, so `cmk remember`/`mk_remember`/import wrote the secret verbatim — the cut-gate finding.)_

- [ ] **★ C6 — `<private>` survives an 80-char TITLE trim (Task #180 / v0.3.1).**
      The title is derived from the text then trimmed to 80 chars — a trim that severs the closing `</private>` must not leak.
      ```powershell
      cmk remember "note xxxxxxxxxxxxxxxxxxxxxxxx <private>hunterSEKRET and more words here</private> tail" --type project
      Select-String -Path context\memory\*.md,context\memory\INDEX.md -Pattern "hunterSEKRET"
      ```
      **PASS:** nothing found — the strip runs BEFORE the title is derived, so a trimmed title can't carry the secret.
      _(The closing tag falls past char 80 → without the fix the redaction regex misses the broken span and the secret lands in the frontmatter `title:` + INDEX.)_

- [ ] **★ FQ1 — FTS5 query sanitization: dots / hyphens / colons no longer crash (Task 153 — new in v0.3.2).**
      A natural query containing FTS5-special chars used to crash with `FTS5 parse error` — `cmk search "v0.3 queue"` was the live report. Now the query is auto-quoted per-token.
      ```powershell
      cmk remember "v0.3.1 shipped to npm with the recall fix" | Out-Null
      cmk search "v0.3"                  # finds the fact — NOT a crash
      cmk search "v0.3 queue remaining"  # the exact shape that crashed — clean (hit or "no results")
      cmk search "user-explicit"         # the kit's own enum value — clean
      cmk search "section:search"        # a colon — clean (no unknown-column crash)
      ```
      **PASS:** every query returns results or a clean "no results" line + exit 0 — **never** an `FTS5 parse error` / stack trace. Plain multi-word queries still work (implicit-AND preserved).
      _(Pre-v0.3.2 the `.` in `v0.3` violated FTS5's bareword grammar → uncaught crash; `user-explicit` parsed `-` as a NOT operator. The fix per-token-quotes special tokens — the SQLite-sanctioned escape.)_

---

## 4c. `cmk digest` + the decision journal (Task 147)  ⬅️ the v0.3.2 headline

`cmk digest` prints a readable page of everything in memory AND maintains `context/DECISIONS.md` —
a committed, **append-only** chronological log of every decision (`type:project` fact) + its *why*.
Run these in the build terminal (`C:\Temp\cut-gate12`), after Session 1 has captured some facts.

- [ ] **★ DJ1 — `cmk digest` renders + creates `DECISIONS.md` (Task 147).**
      ```powershell
      cmk remember "We chose FTS5 keyword search for the kit" --type project --title "FTS5 keyword search" --why "Markdown stays the source of truth; the index is regenerable" | Out-Null
      cmk digest                          # prints the digest page to the terminal
      type context\DECISIONS.md
      ```
      **PASS:** `cmk digest` prints a "Memory digest" page grouping facts by type; `context\DECISIONS.md` exists and contains the decision (its title, a `**When:**` date, the `**Why:**`, and the `P-…` fact id).

- [ ] **★ DJ2 — append-only: idempotent + retract-in-place.**
      ```powershell
      cmk digest | Out-Null                                  # 2nd run, nothing new
      type context\DECISIONS.md                              # FTS5 decision appears once
      $id = (Select-String context\DECISIONS.md -Pattern 'P-[A-Z2-9]{8}' | Select-Object -First 1).Matches.Value
      cmk forget $id --yes | Out-Null
      cmk digest | Out-Null
      type context\DECISIONS.md                              # entry survives, now retracted
      ```
      **PASS:** the decision appears exactly once after the 2nd digest; after forget + digest its entry is still present, annotated `_(retracted …)_`, never removed.

- [ ] **★ DJ3 — only `type:project` facts journal.**
      ```powershell
      cmk remember "Keep replies terse" --type feedback --title "terse-replies" | Out-Null
      cmk digest | Out-Null
      Select-String context\DECISIONS.md -Pattern "terse-replies"
      ```
      **PASS:** the `feedback` fact does NOT appear in `DECISIONS.md`. (It still shows in the `cmk digest` page under working-style.)

- [ ] **★ DJ4 — recallable: `--scope decisions` surfaces history incl. retracted.**
      ```powershell
      cmk remember "Use Postgres for the store" --type project --title "store-choice" | Out-Null
      cmk digest | Out-Null
      cmk search "store" --scope decisions
      $id = (Select-String context\DECISIONS.md -Pattern 'P-[2-9A-HJ-NP-Za]{8}' | Select-Object -First 1).Matches.Value
      cmk forget $id --yes | Out-Null ; cmk digest | Out-Null
      cmk search "store" --scope decisions
      ```
      **PASS:** the first search returns the decision (labelled `decision`, clean snippet); after forget + digest the same search still returns it, labelled `decision (retracted)`.

- [ ] **★ DJ4-live — Claude reaches for the journal in chat (behavioral, real session).**
      Setup, in the LIVE project terminal:
      ```powershell
      cmk digest                                               # usually already done — auto-syncs (DJ5); run as fallback
      type context\DECISIONS.md                                # confirm it exists + lists this project's decisions
      ```
      Restart Claude Code (the MCP server is long-lived; a session from before step 0b's reinstall errors `unknown-scope:decisions`). Then in a fresh session, ask about a decision that was SUPERSEDED this build (the snapshot won't carry it, so Claude must reach for the journal):
      - "What did we settle on for `<the area that changed>`, and did it ever change?"
      - "Did we consider and reject anything for `<that area>`? What and why?"

      **PASS:** Claude runs `mk_search {scope:"decisions"}` and its answer names the superseded/retracted decision from the journal.
      **FAIL:** the journal exists but Claude never queries the `decisions` scope, or claims no history exists.
      **NOT-A-RESULT:** if `context\DECISIONS.md` doesn't exist, the gate is untested — a good answer from the facts is not a pass.

- [ ] **★ DJ5 — the journal auto-populates with no `cmk digest` (v0.3.3).**
      In a throwaway project with the kit installed. **Do NOT run `cmk digest`.**
      ```powershell
      cmk remember "Adopt id-keyed index replacement" --type project --title "index-replace" --why "archive beats scratchpad" | Out-Null
      node <kit>\packages\cli\bin\cmk-compress-session.mjs    # the session-end hook
      Test-Path context\DECISIONS.md                          # expect True
      Select-String context\DECISIONS.md -Pattern "index-replace"   # the journal entry is keyed by --title, not the remember text
      ```
      **PASS:** `context\DECISIONS.md` exists and lists the decision (its `--title`, a `**When:**` date, the `**Why:**`) — no `cmk digest` was run.
      **FAIL:** the file is absent after the hook, or only `cmk digest` can produce it.

      Fallback (no-clean-exit session): delete `context\DECISIONS.md`, capture a decision, run `node <kit>\packages\cli\bin\cmk-compress-lazy.mjs`, re-check `Test-Path` → True.

---

## 4b. The conversational surface — Claude drives the tools (Tasks 108 + 117)  ⬅️ the v0.2.3 headline (standing)

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

### ★ W1–W4 — the v0.3.0 recall ladder (run here, in Session 2)

The headline gate. Each rung exercises a different layer of the new recall stack.

- [ ] **★ W1 — the recall skill FIRES (Tasks 75.0–75.2).**
      Say: *"what did we decide about how this project is structured?"* (or any "what did we decide about X").
      **PASS, all three:**
      1. Claude **invokes the `memory-search` skill on its own** (you'll see the skill/agent activity) — not a `Grep`/`Read` crawl of the code.
      2. The answer is a **curated summary with citation ids** (`P-XXXXXXXX`) — not raw file dumps.
      3. It happens **mid-session** too (the per-prompt hint keeps the awareness alive after the snapshot scrolls) — ask again ~20 turns in.
      _(Pre-v0.3.0 this was D3's "~50/50, ship anyway". If the skill never fires, the trigger description needs work — blocker.)_

- [ ] **★ W2 — paraphrase recall (Tasks 65 + 46).**
      In the terminal — a question with **ZERO keyword overlap** with what you said in Session 1
      (you said "uv, never pip" / "FastAPI is the delivery layer"):
      ```powershell
      cmk search "how do we manage python dependencies"     # no flags — hybrid is the default after G7
      cmk search "where does business logic belong"
      ```
      **PASS:** each finds the right fact (the uv rule; the services-layer rule). The result line says `mode=hybrid` (or semantic).
      _(Keyword-only would miss both — that's the 0.176 → 0.941 bench gap shipping.)_

- [ ] **★ W3 — transcripts record what Claude DID (Task 104.1).**
      ```powershell
      type context\transcripts\*.md | Select-String -Context 0,4 "\*\*Tools:\*\*" | Select-Object -First 3
      ```
      **PASS:** assistant turns carry a `**Tools:**` block — the commands run / files edited during Session 1,
      with truncated results. _(This is the durable record native lacks — its JSONL expires in ~30 days.)_

- [ ] **★ W4 — the raw record is searchable, as LAST RESORT (Task 104.2).**
      Pick something that happened only as an ACTION in Session 1 (a command output, an error you saw — not a stated fact):
      ```powershell
      cmk search "<that error/command fragment>" --scope transcripts
      cmk search "<the same fragment>"                       # default scope: must NOT return raw chunks
      ```
      **PASS:** the transcripts scope finds it (a `T:context/transcripts/...` hit); the **default scope stays curated** (no transcript leak).
      In chat, the skill's Step 4 reaches the same tier when curated memory has no answer.

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

- [ ] **★ D3 — recall FEEL (now a GATE — Task 75 shipped).**
      Watch *how* it answers your **rules**: it must **lead with memory** (the injected snapshot, `mk_search`, or the
      memory-search skill) — **never** glob/read the code to re-derive what memory already holds.
      _Decision trail: pre-v0.3.0 this was a judgment call ("~50/50, the known Task-75 gap, rec: ship anyway").
      v0.3.0 IS the Task-75 fix (authority preamble + skill + hint) — so re-deriving-from-code is now a **blocker**, not a shrug._

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
mkdir C:\Temp\cut-gate-coldopen16; cd C:\Temp\cut-gate-coldopen16
git init; cmk install; code .
```
Ask: *"Start a new Python backend for me - set up the structure."*

- [ ] **★ E1 — cold-open.**
      It scaffolds the **layered** shape + `uv`/`ruff` tooling **without being told** —
      because the Session-1 persona injected.
      *"How does it know that?"* = the wedge.
      **This is the gate that matters most.**

---

## 7. Full feature sweep — every `cmk` subcommand  (~20 min, in `C:\Temp\cut-gate16`)

**Recall & index**

- [ ] **F-1**
      - `cmk search "<kw>"` finds facts
      - `cmk reindex` rebuilds, search still works

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
      `cmk forget <id> --yes` → tombstones: the fact file is **moved to `archive\tombstones\<id>.md`** (body preserved — NOT hard-deleted), and its DB row is pruned.
      **Since v0.2.3:** the fact **disappears from `cmk search` immediately** — no manual `cmk reindex` (Task 110); the free-speech / two-step path is **M2**.
      **`cmk get <id>` returns `not found`** — `get` is **live-only by default** (forget prunes the row). Automatic recall never resurfaces a forgotten fact (a deleted fact must stay invisible to the agent).
      **F-7b (Task 155 / D-163) — human-only recovery:** `cmk get <id> --include-tombstoned` recovers the forgotten body + `deleted_at`/`deleted_by`, marked `tombstoned: true`. **PASS:** plain `cmk get <id>` → `not found`; `cmk get <id> --include-tombstoned` → the body returns. **The D-163 lock:** the MCP `mk_get` tool is tombstone-blind — there is NO `include_tombstoned` param on it, so the AI can never recover a forgotten fact (verified by the contract-lock test `does NOT recover a tombstoned fact (D-163)`).
      **F-7b-live (the agent-stays-blind check — run in a real Claude Code session).** After forgetting a fact (use M2's Fly.io staging fact, or any `cmk forget`-ten id), open a session and ask Claude to recall it by content — paste:
      - **Prompt:** "Where does our staging environment run?" (or, for whatever you forgot: "What did we decide about &lt;the forgotten topic&gt;?")
      **PASS (live):** Claude says it has no record / doesn't know — it does NOT surface the forgotten value (no "Fly.io"), and it does NOT secretly recover it via `mk_get`. **FAIL (live):** Claude names the forgotten fact, OR runs any tool that returns the tombstoned body — that's a D-163 violation (the agent resurfaced a fact you deleted), a hard blocker. _Behavioral directive (like W1/M2) — the human eyeballs that the forget is honored in recall, not just in the index._
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
      - `cmk doctor` → HC-1..HC-8 accurate (HC-8 = native bindings / npm-12 readiness, new v0.3.1) + the trailing **Memory health (informational)** line renders
      - `cmk repair --hooks` re-wires if settings drift
      - **`cmk repair --index` → "(index): fixed → reindex completed"** (NOT an error). _v0.3.1: this ran the REAL reindexFull which needs a db; the bug where repair passed no db (since Task 49, masked by every test mocking the reindexer) was found by THIS cut-gate probe — keep it on the real path, no injected reindexer._
      - `cmk repair --all` → all three (hooks/locks/index) report cleanly
      - **`cmk config set <key> <value>` / `get <key>` / `--show-origin <key>`** — REAL as of v0.3.1 (Task 129): `set search.default_mode hybrid` → `get` returns it → `--show-origin` shows the tier. `--local` writes the gitignored tier. _(Was a stub pre-v0.3.1; the "not yet implemented" expectation is GONE.)_

- [ ] **★ F-11b — INDEX drift is DETECTED, and a failed rebuild leaves a TRACE (Task #181 / D-152 / v0.3.1).**
      `INDEX.md` is the committed, human-readable index — a derived view of the fact files that the writer keeps current on every capture. Two guarantees this cut adds:
      - **Detection:** delete a line from `context\memory\INDEX.md` (simulate drift), then `cmk doctor` → **HC-4 FAILS** with `recoveryCommand: cmk reindex`; run `cmk reindex` → HC-4 back to PASS.
      - **Observability:** a rebuild that *fails* (vs. the happy path) now records an `index-rebuild-failed` audit entry instead of being silently swallowed — so a committed INDEX that fell behind is diagnosable, not invisible.
      ```powershell
      # Detection half (deterministic): break the INDEX, confirm HC-4 catches it, reindex heals it.
      cmk doctor | Select-String "HC-4"           # PASS first
      # (hand-remove a fact line from context\memory\INDEX.md)
      cmk doctor | Select-String "HC-4"           # now FAIL → "cmk reindex"
      cmk reindex; cmk doctor | Select-String "HC-4"   # PASS again
      ```
      **PASS:** HC-4 fails on the broken INDEX and recovers after `cmk reindex`; the fact FILES were never at risk (INDEX is derived). _(Pre-v0.3.1 a hook-killed rebuild could leave a stale committed INDEX with ZERO trace — the cut-gate finding.)_

**Native coexistence & import**

- [ ] **F-12**
      `cmk disable-native-memory` → writes committable `autoMemoryEnabled:false` (doctor HC-6 reflects it);
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

- [ ] **F-16 — transcript temp is gitignored (Task 115 — since v0.2.3).**
      The auto-extract write buffer (`.extract-*.tmp`) is created-then-deleted, so `git status` usually shows nothing **whether or not** the ignore works — test the rule **deterministically**:
      ```powershell
      New-Item -Force context\transcripts\.extract-test.tmp | Out-Null
      git check-ignore context\transcripts\.extract-test.tmp   # PASS = echoes the path (ignored)
      Remove-Item context\transcripts\.extract-test.tmp
      ```
      A partial buffer can never travel with `git clone`.

**The L2 ladder + lifecycle (added 2026-06-11 — these four verbs had NO check in any prior cut; surfaced by the same completeness audit that built `validate-doc-completeness.mjs`)**

- [ ] **F-17 — L2 drill-down: `get` / `timeline` / `cite` (Tasks 101/103 — the cited-recall rung).**
      Take a real fact id from `cmk search "memory" --limit 1` (the `P-…` token), then:
      ```powershell
      cmk get <id>                 # full fact: body + Why/How + provenance
      cmk timeline <id>            # the fact's history chain (creates/updates/supersedes)
      cmk cite <id>                # the citation block Claude pastes into answers
      ```
      **PASS:** all three resolve the id; `timeline` shows at least the creation event; `cite` output names the source file.

- [ ] **F-18 — `recent-activity` (the what-just-happened surface).**
      `cmk recent-activity --window 24h --limit 5` → the facts touched in this run (the B-probes you just wrote) come back newest-first.
      **PASS:** non-empty, items recognizable from this session.

- [ ] **F-19 — `uninstall` is clean + `init-user-tier` re-seeds (lifecycle, in the throwaway dir ONLY).**
      In `C:\Temp\cut-gate16` (NEVER a real project):
      ```powershell
      cmk uninstall                # removes hooks + the CLAUDE.md managed block; context/ stays (your data)
      git status                   # nothing unexpected staged; CLAUDE.md outside the markers byte-preserved
      cmk install                  # reinstalls clean over the surviving context/
      cmk init-user-tier           # idempotent on an existing user tier (no overwrite of USER.md content)
      ```
      **PASS:** uninstall removes ONLY the managed surface; reinstall + init-user-tier are idempotent (no data loss, no duplicate blocks).

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

In `C:\Temp\cut-gate16`: `git add -A; git commit -m "wip"`.
Clone elsewhere (`git clone C:\Temp\cut-gate16 C:\Temp\cut-gate-clone`), open *that* in Claude Code.

- [ ] **★ H1**
      the clone already has the project memory (`context/` is committed — tenet T2).

---

## Verdict + the cut

**Cut if** every **★** passes —
`G1–G4, G2b, G5, G6, G7, R1, R2, M0, M1, M2, W1–W4, B2, B9, B3, B4, B5, B6, B7, C5, C6, FQ1, D1, D3, E1, F-3, F-11b, L3, H1`.
_(v0.3.2 cut-blockers. **DJ1–DJ3 are NOT cut-blockers this cut** — the `cmk digest`/DECISIONS.md feature is HELD for v0.3.3 until recall-complete (D-164); run the DJ probes to confirm the merged code is sound, but they don't gate the v0.3.2 tag.)_
_(v0.3.2 adds **FQ1** — FTS5 query sanitization (no crash on dots/hyphens/colons) — and **DJ1/DJ2/DJ3** — `cmk digest` + the append-only `DECISIONS.md` journal (renders, append-only/retract-in-place, decisions-only) — to the gate. 141b was rejected on perf (D-162); no storage-layer test.)_
_(v0.3.1's **C5/C6/F-11b** are now standing gates. D3's old "decide if the recall variance is acceptable" clause is GONE — v0.3.0 shipped the Task-75 fix; D3 is a hard gate now.)_
**The W1–W4 recall ladder + D3 are the v0.3.0 headline** — the skill fires, paraphrase recall hits, the raw record is reachable, and memory-first answering is a gate. **M0–M2 stay the standing conversational gate** (the v0.2.3 headline); **B9 stays the standing rich-auto-capture gate** (the v0.2.2 headline) — if `context\memory\` has no `write_source: auto-extract` rich file, investigate before shipping.

(B8, D5, D6 are observational — they confirm the new graduation/inject/self-heal behavior when it fires,
but the code is proven by B7/B5 + the suite.)

A clean full sweep (F-1..F-15 + L1–L2) means nothing ships untested.

### ★ Pre-tag gate (do this BEFORE the tag — docs lag the code otherwise)

The tag triggers an **immutable** npm publish; whatever docs are committed at that moment ship forever. Confirm:

- [ ] **CHANGELOG consolidated** — `[Unreleased]` folded into `## [X.Y.Z] — <date>`; `[Unreleased]` reset; `print-release-notes.mjs <version>` parses the section.
- [ ] **★ READMEs reflect THIS version** — both the **root `README.md`** (status line + "What it does") **and** the **npm landing `packages/cli/README.md`** describe this version's headline capability + its new commands. _(Lesson from v0.2.0: the tag beat the README refresh, so the immutable npm 0.2.0 page shipped a stale landing page — fixed only by a 0.2.1 patch. The npm landing page is `packages/cli/README.md`, NOT the root one.)_
- [ ] **`packages/cli/package.json` version** = the version you're about to tag (`0.3.2`).

**To publish (your outward action):**

```powershell
git tag v0.3.2
git push origin v0.3.2
```

`publish.yml` runs the suite, publishes `@lh8ppl/claude-memory-kit@0.3.2` to npm with provenance,
and creates the GitHub Release from the `[0.3.2]` CHANGELOG section.

**Verify after:**
- `npm view @lh8ppl/claude-memory-kit version` → `0.3.2`
- the npm page shows a **provenance** badge
- the GitHub Release matches `## [0.3.2]`

Per-finding notes go in a dated doc under [`../journey/`](../journey/), not here — this stays a clean script.
