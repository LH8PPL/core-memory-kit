# v0.2.3 manual live-test — the new conversational surface

**The hand-run delta for the `v0.2.3` cut.** Run it **alongside** [`cut-gate.md`](cut-gate.md),
not instead of it: cut-gate is the full feature sweep (scaffold, the staged build with
organic capture, recall, the wedge, the whole CLI, privacy, portability); **this doc covers
only what v0.2.3 added** — the **MCP tools driven by Claude in conversation** and the
**free-speech forget/trust** triggers, neither of which the CLI tests or `npm run live-test`
can reach.

---

## How to read this

- **★ = cut-gate check.** Every ★ must pass to tag `v0.2.3`. The rest is the sweep — run it so nothing ships untested.
- Each check is one line you tick, then the **action** and a **PASS:** line. IDs are `V0…V11` (this doc) — the `R1`/`R2`/`B*` IDs in §F are cross-references into [`cut-gate.md`](cut-gate.md).
- **"(in chat)"** = type it to Claude in a real Claude Code session. **"(terminal)"** = a shell.
- **Time:** ~30–40 min. **Prereq:** Python 3.12+ on PATH; the deterministic half (`npm run live-test`) already green.

> **★★ The real-input rule (binding — D-84).** A check **PASSES only when it ran on REAL input that exercises the feature** — never "the command didn't crash." An empty queue, a dry-run with nothing to do, a cooldown-skip = **`unverified`**, not pass; create the real input and re-run. The v0.2.3 lane exists *because* the v0.2.2 sweep conflated "ran without error" with "works" and shipped four broken commands.

---

## New in v0.2.3 — what this run validates

The headline is **the regular user never types `cmk`** — every voiced intent reaches memory via an MCP tool (Claude-mediated) or a hook (automatic).

| Check | Feature | What's new |
| --- | --- | --- |
| **★ V0b/V0c** | Task 108 | `cmk install` registers the **MCP server** (`.mcp.json` + `mcp__cmk__*` allow-list) → 11 tools available **prompt-free** |
| **★ V1** | Task 103 + 108 | capture fires on the **natural** path (no "remember this") and rides the prompt-free MCP write |
| **★ V4** | Tasks 117 + 110 + 108b | **"forget X"** in plain speech → `mk_forget` **two-step** (preview + confirm) → gone from search, no manual reindex |
| **V5** | Task 117 | **"trust this / not important"** in plain speech → `mk_trust` (the one free-speech gap D-85 named) |
| **V7** | Task 113 | the interactive `cmk queue review`/`conflicts` **readline prompt** works on a real terminal |
| **V8** | Task 109 | `cmk register-crons` registers without error on Windows **and** macOS (the D-83 bug) |
| **V11** | Task 115 | the auto-extract transcript temp (`.extract-*.tmp`) is **gitignored** |

---

## 0. Clean slate — build the REAL artifact

You run this **before** publishing, so install the tarball you're **about to** ship —
**not** `npm install -g @lh8ppl/claude-memory-kit` (that's the OLD published version).

```powershell
cd C:\Projects\claude-memory-kit
git checkout main; git pull                   # must include the v0.2.3 batch (Tasks 108–117) + the release commit

cd C:\Projects\claude-memory-kit\packages\cli
npm pack                                      # → lh8ppl-claude-memory-kit-0.2.3.tgz
npm uninstall -g @lh8ppl/claude-memory-kit    # remove the OLD global first
npm install -g .\lh8ppl-claude-memory-kit-0.2.3.tgz

# A throwaway project to test in (its own dir — never touches your real work):
mkdir C:\Temp\cmk-v023; cd C:\Temp\cmk-v023
git init; cmk install                         # scaffolds + wires hooks + registers the MCP server
```

- [ ] **★ V0 — version.** `cmk --version` → **`0.2.3`** (NOT the old published number).
- [ ] **★ V0b — MCP wiring written (Task 108).**
      ```powershell
      type .mcp.json                                  # → mcpServers.cmk = { type:"stdio", command:"cmk", args:["mcp","serve"] }
      Select-String -Path .claude\settings.json -Pattern "mcp__cmk"   # → the mcp__cmk__* allow-list entry
      ```
      **PASS:** `.mcp.json` names the `cmk` stdio server **and** `settings.json` allow-lists `mcp__cmk__*`.
- [ ] **Restart Claude Code** so the hooks + MCP server load: `/exit`, then run `claude` again in `C:\Temp\cmk-v023`.
- [ ] **★ V0c — server connected (Task 108).** _(in chat)_ *"list your cmk MCP tools."*
      **PASS:** you see the **11** `mcp__cmk__*` tools — `mk_remember, mk_search, mk_get, mk_timeline, mk_cite, mk_recent_activity, mk_trust, mk_lessons_promote, mk_forget, mk_queue_list, mk_queue_resolve`.
      _(If the list is empty the server didn't launch — re-check V0b + that you restarted.)_

---

## A. Memory in conversation — the real user surface (Tasks 108 + 117)

**The point: you never type `cmk`.** You work and talk; Claude drives the tools; no approval prompt.
Lead with the **natural** path (the headline — the user never says "remember"); the explicit
forget/trust prompts below are voiced intents *by nature* (you can't "forget" passively).

- [ ] **★ V1 — capture fires on the NATURAL path, prompt-free (Tasks 103 + 108).**
      In the flow of a tiny real task, state a preference **naturally — never "remember this"**:
      _(in chat)_ *"scaffold a one-file Python CLI that prints the weather for a city."* …then, reacting to the result:
      *"by the way — I always use `httpx`, never `requests`, and `typer` for CLIs. That's how I build every tool."*
      **End the turn** (the Stop hook fires auto-extract). Then _(terminal)_:
      ```powershell
      cmk search "httpx"
      ```
      **PASS:** it's captured **without** you saying "remember" and **without** any approval prompt — `search` finds the httpx/typer preference. _(the D-85 headline; pre-108 the write rode a Bash `cmk` call that could trigger a permission prompt)_
- [ ] **V2 — EXPLICIT capture via free speech (Task 108).**
      _(in chat)_ *"remember we standardized on pnpm for this repo — we switched because npm was too slow on the monorepo."*
      **PASS:** Claude calls **`mk_remember`** (not a Bash command), **no "Allow this command?" prompt**, silent on success.
      _(The "because" makes it a rich **fact file** — `forget` in V4 tombstones **facts**, not the terse one-line bullets a bare "remember X" produces.)_
- [ ] **★ V3 — recall, no re-explaining (Task 108).**
      _(in chat)_ *"what did we decide about package managers?"*
      **PASS:** Claude calls **`mk_search`/`mk_get`** and answers **"pnpm"** with a citation id — not "I don't have that."
- [ ] **★ V4 — "forget X" in plain speech → two-step, then gone (Tasks 117 + 108b + 110).**
      _(in chat)_ *"actually, forget the pnpm decision."*
      **PASS, in order:**
      1. The **first** `mk_forget` call returns a **preview** of what would be tombstoned **+ a confirm token** — **nothing is deleted yet** (an auto-invoking model can't silently destroy memory).
      2. After you confirm, the **second** call tombstones it.
      3. _(in chat)_ *"what about package managers?"* → **gone** (no "pnpm"), with **no manual `cmk reindex`** (forget self-heals the index).
      _(Pre-110 a forgotten fact lingered in search until a manual reindex; pre-117 there was no plain-speech path to forget at all.)_
- [ ] **V5 — "trust this / not important" in plain speech (Task 117).**
      Capture two throwaway facts, then: _(in chat)_ on one *"that one's important — keep it,"* on the other *"eh, that's not important, I'm not sure about it."*
      **PASS:** Claude calls **`mk_trust`** with `high` for the first and `low` for the second. _(the one free-speech gap D-85 named — pre-117 trust could only be changed via the CLI.)_
- [ ] **★ V6 — cross-project doctrine → the wedge fills (Task 61).**
      _(in chat)_ *"that httpx/typer rule applies to every project, not just this one."* End the turn, then _(terminal)_:
      ```powershell
      type %USERPROFILE%\.claude-memory-kit\HABITS.md
      ```
      **PASS:** the rule is in your **user tier** (`HABITS.md` or `LESSONS.md`) — usually written **automatically** by the per-turn auto-persona pass, no command. V10 then confirms a different project cold-opens already knowing it.

---

## B. The interactive resolvers (Task 113)

CLI tests drove these with injected answers; here you drive the **real readline prompt**.

**Honest caveat — you can't force a queue item on demand.** There's no `cmk queue add`; items only
appear when **auto-extract** grades a turn medium-trust (→ review queue) or a medium-trust capture
conflicts with a high-trust fact (→ conflict queue). So this is **opportunistic** — run it after a
real session has accumulated items. The resolver *logic* is already deterministically covered by the
suite (Task 113); this confirms the **interactive terminal prompt** itself.

```powershell
cmk queue review        # empty → "runs clean"; if items → type  promote / discard / skip
cmk queue conflicts     # empty → "runs clean"; if items → type  keep-old / keep-new / merge-both / skip
```

- [ ] **V7 — runs clean on an empty queue** (no crash). _(113)_
- [ ] **V7b — if items exist:** the walker prints each, takes your typed answer, applies it (a promoted review item lands in `MEMORY.md`; a resolved conflict does **not** reappear on a second run). _(113)_

---

## C. Cron registration on YOUR OS (Task 109) — optional (real system change)

`--dry-run` is what I verified by hand; the bare command actually registers. **Skip if you don't want the jobs.**

```powershell
cmk register-crons --dry-run     # always safe — prints the exact scheduler command, no error
cmk register-crons               # registers the daily + weekly jobs (Win Task Scheduler / launchd / cron)
cmk doctor                       # HC-6 (cron registered) now passes
cmk register-crons --unregister  # clean up when done
```

- [ ] **V8 — registers without error on your OS** (the D-83 Windows `schtasks` bug + the macOS plist sibling are fixed). _(109)_

---

## D. Cross-session — does it survive a restart? (Tasks 110, 111)

- [ ] **★ V9 — forgotten stays forgotten (Task 110).**
      After the forget in **V4**, **restart Claude Code** and ask about package managers again.
      **PASS:** still **gone** — the tombstoned fact is **not** re-injected at SessionStart.
- [ ] **V10 — persona cold-open in a NEW project (Tasks 111 + 61).**
      Open Claude Code in a **brand-new, different** folder and ask _(in chat)_ *"how do I like to build things?"*
      **PASS:** it already knows **httpx/typer** (promoted to your user tier in V6) — **no re-briefing.** _(the v0.2 wedge — must still hold.)_

---

## E. Hygiene — the transcript temp never ships (Task 115)

The `.extract-*.tmp` buffer is created-then-deleted by the auto-extract child, so it's usually
gone by the time you look — `git status` would show nothing **whether or not** the gitignore works.
So test the rule **deterministically**: plant a temp, confirm git ignores it, clean up.

```powershell
cd C:\Temp\cmk-v023
New-Item -Force context\transcripts\.extract-test.tmp | Out-Null
git check-ignore context\transcripts\.extract-test.tmp   # PASS = it echoes the path (ignored)
Remove-Item context\transcripts\.extract-test.tmp
```

- [ ] **V11 — `git check-ignore` echoes the path** → a partial auto-extract buffer can never travel with `git clone`. _(115)_

---

## F. Carry-overs from the full guide — the things only a human can judge

Not new in v0.2.3, but **not** covered by automation and they still gate a cut. The exhaustive ★
sweep is in [`cut-gate.md`](cut-gate.md); these are the must-not-skip ones (IDs are cut-gate's).

- [ ] **★ deterministic half green.** `npm run live-test` (drives the headless half on the real tarball) — all pass. _(the automated backbone)_
- [ ] **★ R1 — no console flash.** Opening Claude Code (SessionStart fires the detached lazy-compress) shows **no popped-up black `node` window**. _(cut-gate R1 / Task 81 — visual)_
- [ ] **★ R2 — no permission prompt on memory ops.** Already confirmed at **V2 + V4**: Claude using the `mcp__cmk__*` tools triggers **neither** "Allow this bash command?" **nor** a skill prompt. _(cut-gate R2 / Task 118 — resolved via the MCP-first surface; the `cd … && cmk` compound edge is a documented accepted exception, D-80)_
- [ ] **recall feel (judgment).** Across the session, ask 3–4 *"what did we decide / what do I prefer about X"* questions. **PASS:** it reliably surfaces the right fact with a citation. _(reliable always-fires recall is v0.3 / Task 75 — note misses, but they don't block v0.2.3.)_

---

## Record the run + cut

Drop a dated findings file in [`../journey/live-test-runs/`](../journey/live-test-runs/) with
anything only a human noticed (R1 flash, prompt UX, recall feel). Then cut:
`npm run release -- minor` → review the diff → push the `v0.2.3` tag (the outward step — CI publishes npm + the GitHub Release).
