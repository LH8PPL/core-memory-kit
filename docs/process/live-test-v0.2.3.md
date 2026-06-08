# v0.2.3 manual live-test — touch every new thing

**Purpose:** verify the v0.2.3 surfaces that automation + CLI tests **can't** reach —
the MCP tools driven by Claude *in conversation*, the free-speech triggers, and the
interactive prompts. The plain CLI commands are already live-verified (D-96 / D-97 /
D-98 / D-100); this session is the rest.

**How to use:** tick each box. Each check is **Do** (the action) → **PASS** (what you
should see) → _(Task)_. "(in chat)" = type it to Claude in a real Claude Code session.
"(terminal)" = a shell.

**Time:** ~30–40 min.

> **Relationship to [`cut-gate.md`](cut-gate.md):** that's the **full, exhaustive**
> feature sweep + the deterministic half (`npm run live-test`) + the ★ cut-required
> checks. **This doc is NOT a replacement** — it's the v0.2.3 NEW-surface delta
> (§A–§F) **plus** the human-only carry-overs from the full guide that still matter
> (§G). Run **both** for a complete cut: `cut-gate.md` for the exhaustive sweep,
> this one for the v0.2.3 new things. §G below is the minimum carry-over so you
> don't miss the things only a human can judge.

---

## 0. Setup — a clean room, on the REAL artifact

You run this **before** publishing, so install the tarball you're **about to** ship —
**not** `npm install -g @lh8ppl/claude-memory-kit` (that's the OLD published version).

```powershell
cd C:\Projects\claude-memory-kit
git checkout main; git pull                   # include the v0.2.3 batch (Tasks 108–117)

cd C:\Projects\claude-memory-kit\packages\cli
npm pack                                      # → lh8ppl-claude-memory-kit-0.2.3.tgz
npm uninstall -g @lh8ppl/claude-memory-kit    # remove the OLD global first
npm install -g .\lh8ppl-claude-memory-kit-0.2.3.tgz
cmk --version                                 # must say 0.2.3 (NOT the old published version)

# A throwaway project to test in:
mkdir C:\Temp\cmk-livetest; cd C:\Temp\cmk-livetest
git init; cmk install                         # scaffolds + wires hooks + MCP
```

- [ ] **MCP wiring written.** `cat .mcp.json` shows a `cmk` stdio server; `.claude/settings.json` allow-lists `mcp__cmk__*`. _(Task 108)_
- [ ] **Restart Claude Code** so the hooks + MCP server load: type `/exit`, then run `claude` again in this folder.
- [ ] **Server connected.** In chat, ask: *"what MCP tools do you have?"* → you should see `mcp__cmk__*` tools (mk_remember, mk_search, mk_forget, mk_trust, …). _(Task 108)_

---

## A. Memory ops in conversation — the real user surface (Tasks 108 + 117)

The point: **you never type `cmk`.** You talk; Claude drives the tools; no approval prompt.

- [ ] **Capture (in chat):** *"remember we standardized on pnpm for this repo — we switched because npm was too slow on the monorepo."*
  **PASS:** Claude calls `mk_remember` (not a Bash command), **no "Allow this command?" prompt**, and doesn't announce it unless asked. _(108)_
  **Why the "because":** it makes this a rich **fact file** (Why/How). That matters for the forget step below — `forget` tombstones **facts**, not the terse one-line bullets a bare "remember X" produces, so capture it with a reason if you want to forget it by name later.
- [ ] **Capture rich (in chat):** *"from now on, always run the linter before committing — because it catches errors early."*
  **PASS:** `mk_remember` with `why`/`how` → a Why/How fact file. _(108)_
- [ ] **Recall (in chat):** *"what did we decide about package managers?"*
  **PASS:** Claude calls `mk_search` / `mk_get` and answers "pnpm" with a citation id. _(108)_
- [ ] **Forget via free speech (in chat):** *"actually, forget about the pnpm decision."*
  **PASS:** Claude calls `mk_forget` → shows a **preview + confirm token first**, waits for you, then tombstones. Ask *"what about package managers?"* again → **gone from search, no manual reindex.** _(110 + 117)_
- [ ] **Trust via free speech (in chat):** capture something, then say *"that one's important — keep it"* (→ high) and on another *"eh, that's not important / I'm not sure about it"* (→ low).
  **PASS:** Claude calls `mk_trust` with the right level. _(117)_
- [ ] **Cross-project doctrine (in chat):** *"that linter rule applies to every project, not just this one."*
  **PASS:** it lands in your **user tier** (`~/.claude-memory-kit/HABITS.md` or `LESSONS.md`) — usually **automatically** (the per-turn auto-persona pass promotes cross-project doctrine; no command), which §E then confirms by cold-opening another project. _(Task 61 — the v0.2 wedge)_

---

## B. The two-step destructive guard (Task 108b)

- [ ] **mk_forget is preview-then-confirm.** When you asked to forget above, the **first** tool call only previewed + returned a token; nothing was deleted until the **second** call.
  **PASS:** you saw the preview and Claude waited — an auto-invoking model can't silently delete. _(108b)_

---

## C. Interactive resolvers over a real terminal (Task 113)

CLI tests drove these with injected answers; here you drive the **real readline prompt.**

**Honest caveat — you can't force a queue item on demand.** There's no `cmk queue add`;
items only appear when **auto-extract** grades a turn medium-trust (→ review queue) or a
medium-trust capture conflicts with a high-trust fact (→ conflict queue). So this is an
**opportunistic** check: run it after a real working session has accumulated items. The
resolver *logic* (promote/discard, keep-old/keep-new/merge-both) is already deterministically
covered by the suite (Task 113) — this confirms the **interactive terminal prompt** itself.

```powershell
cmk queue review        # empty → "runs clean"; if items → walk one: promote / discard / skip
cmk queue conflicts     # empty → "runs clean"; if items → keep-old / keep-new / merge-both / skip
```

- [ ] **Runs clean on an empty queue** (no crash). _(113)_
- [ ] **If items exist:** the walker prints each, takes your typed answer, applies it (promoted text lands in MEMORY.md; a resolved conflict doesn't reappear on a second run). _(113)_

---

## D. Cron registration on YOUR OS (Task 109) — optional (real system change)

I verified `--dry-run` on Windows; this actually registers. **Skip if you don't want the jobs.**

```powershell
cmk register-crons --dry-run     # always safe — confirm it prints a clean command, no error
cmk register-crons               # registers the daily + weekly jobs (Win Task Scheduler / launchd / cron)
cmk doctor                       # HC-6 should now pass
cmk register-crons --unregister  # clean up when done
```

- [ ] **Registers without error on your OS** (the D-83 Windows bug is fixed). _(109)_

---

## E. Cross-session + cold-open feel (Tasks 110, 111)

- [ ] **Forgotten stays forgotten.** After the forget in §A, **restart Claude Code** and ask about package managers again. **PASS:** still gone — not re-injected at SessionStart. _(110)_
- [ ] **Persona cold-open.** Open Claude Code in a **brand-new, different** project and ask *"how do I like to work?"* **PASS:** it already knows "run the linter first" (promoted to your user tier) — no re-briefing. _(111 / 117)_

---

## F. Hygiene spot-check (Task 115)

The buffer is created-then-deleted by the auto-extract child, so it's usually gone by
the time you look — `git status` would show nothing **whether or not** the gitignore
works. So test the rule **deterministically**: plant a temp, confirm git ignores it, clean up.

```powershell
cd C:\Temp\cmk-livetest
New-Item -Force context\transcripts\.extract-test.tmp | Out-Null
git check-ignore context\transcripts\.extract-test.tmp   # PASS = it echoes the path (ignored)
Remove-Item context\transcripts\.extract-test.tmp
```

- [ ] **`git check-ignore` echoes the path** → a partial auto-extract buffer can never travel with `git clone`. _(115)_

---

## G. Carry-overs from the full guide — the things only a human can judge

These aren't new in v0.2.3, but they're **not** covered by automation and still gate a cut.
(The exhaustive ★ sweep is in [`cut-gate.md`](cut-gate.md); these are the must-not-skip ones.)

- [ ] **Deterministic half passed.** `npm run live-test` (drives the headless half on the real tarball) — green. _(the automated backbone)_
- [ ] **R1 — no console flash.** On Windows, opening Claude Code (SessionStart fires the detached lazy-compress) shows **no popped-up console window**. _(R1)_
- [ ] **R2 — no approval prompt for memory ops.** Confirmed in §A: Claude using the `mcp__cmk__*` tools does **not** trigger "Allow this command?". _(R2 — resolved via the MCP-first surface, Task 118)_
- [ ] **Recall feel.** Across the session, ask 3–4 *"what did we decide / what do I prefer about X"* questions. **PASS (judgment):** it reliably surfaces the right fact with a citation — not "I don't have that." _(the ~50/50 recall problem; reliable always-fires recall is v0.3 / Task 75, so note any misses but they don't block v0.2.3)_
- [ ] **The wedge.** Confirmed in §E: a brand-new project cold-opens already knowing your cross-project style. _(the v0.2 headline — must still hold)_

---

## Record the run

Drop a dated findings file in [`../journey/live-test-runs/`](../journey/live-test-runs/)
with anything that surprised you (R1 console-flash, R2 prompt UX, recall feel — the
things only a human notices). Then cut: `npm run release -- minor` → push the `v0.2.3` tag.
