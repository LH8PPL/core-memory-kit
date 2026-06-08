# v0.2.3 manual live-test — touch every new thing

**Purpose:** verify the v0.2.3 surfaces that automation + CLI tests **can't** reach —
the MCP tools driven by Claude *in conversation*, the free-speech triggers, and the
interactive prompts. The plain CLI commands are already live-verified (D-96 / D-97 /
D-98 / D-100); this session is the rest.

**How to use:** tick each box. Each check is **Do** (the action) → **PASS** (what you
should see) → _(Task)_. "(in chat)" = type it to Claude in a real Claude Code session.
"(terminal)" = a shell.

**Time:** ~20–30 min.

---

## 0. Setup — a clean room, on the REAL artifact

You run this **before** publishing, so install the tarball you're **about to** ship —
**not** `npm install -g @lh8ppl/claude-memory-kit` (that's the OLD published version).

```bash
# From the repo — build the real artifact:
cd <repo>/packages/cli && npm pack            # → lh8ppl-claude-memory-kit-0.2.3.tgz
npm install -g ./lh8ppl-claude-memory-kit-0.2.3.tgz
cmk --version                                 # confirm it says 0.2.3

# A throwaway project to test in:
mkdir ~/cmk-livetest && cd ~/cmk-livetest && git init -q
cmk install                                   # scaffolds + wires hooks + MCP
```

- [ ] **MCP wiring written.** `cat .mcp.json` shows a `cmk` stdio server; `.claude/settings.json` allow-lists `mcp__cmk__*`. _(Task 108)_
- [ ] **Restart Claude Code** so the hooks + MCP server load: type `/exit`, then run `claude` again in this folder.
- [ ] **Server connected.** In chat, ask: *"what MCP tools do you have?"* → you should see `mcp__cmk__*` tools (mk_remember, mk_search, mk_forget, mk_trust, …). _(Task 108)_

---

## A. Memory ops in conversation — the real user surface (Tasks 108 + 117)

The point: **you never type `cmk`.** You talk; Claude drives the tools; no approval prompt.

- [ ] **Capture (in chat):** *"remember that we standardized on pnpm for this repo."*
  **PASS:** Claude calls `mk_remember` (not a Bash command), **no "Allow this command?" prompt**, and doesn't announce it unless asked. _(108)_
- [ ] **Capture rich (in chat):** *"from now on, always run the linter before committing — because it catches errors early."*
  **PASS:** `mk_remember` with `why`/`how` → a Why/How fact file. _(108)_
- [ ] **Recall (in chat):** *"what did we decide about package managers?"*
  **PASS:** Claude calls `mk_search` / `mk_get` and answers "pnpm" with a citation id. _(108)_
- [ ] **Forget via free speech (in chat):** *"actually, forget about the pnpm decision."*
  **PASS:** Claude calls `mk_forget` → shows a **preview + confirm token first**, waits for you, then tombstones. Ask *"what about package managers?"* again → **gone from search, no manual reindex.** _(110 + 117)_
- [ ] **Trust via free speech (in chat):** capture something, then say *"that one's important — keep it"* (→ high) and on another *"eh, that's not important / I'm not sure about it"* (→ low).
  **PASS:** Claude calls `mk_trust` with the right level. _(117)_
- [ ] **Cross-project promote (in chat):** *"that linter rule applies to every project, not just this one."*
  **PASS:** `mk_lessons_promote` (or it's already in your user tier from the rich capture). _(108)_

---

## B. The two-step destructive guard (Task 108b)

- [ ] **mk_forget is preview-then-confirm.** When you asked to forget above, the **first** tool call only previewed + returned a token; nothing was deleted until the **second** call.
  **PASS:** you saw the preview and Claude waited — an auto-invoking model can't silently delete. _(108b)_

---

## C. Interactive resolvers over a real terminal (Task 113)

CLI tests drove these with injected answers; here you drive the **real readline prompt.**

```bash
# Make a real pending item first (in chat): say something that conflicts with a
# saved high-trust fact, OR a medium-trust aside the auto-extract queues.
cmk queue review        # walk one: type  promote / discard / skip
cmk queue conflicts     # if any: type   keep-old / keep-new / merge-both / skip
```

- [ ] **Review walker works.** It prints the pending item, takes your answer, applies it; promoted text lands in MEMORY.md; the queue drains. _(113)_
- [ ] **Conflict walker works.** keep-old / keep-new / merge-both each do the right thing; a resolved item doesn't reappear on a second `cmk queue conflicts`. _(113)_

---

## D. Cron registration on YOUR OS (Task 109) — optional (real system change)

I verified `--dry-run` on Windows; this actually registers. **Skip if you don't want the jobs.**

```bash
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

```bash
cd ~/cmk-livetest && git add -A && git status --short | grep -i extract
```

- [ ] **No `.extract-*.tmp` staged** — a partial auto-extract buffer never travels with git. _(115)_

---

## Record the run

Drop a dated findings file in [`../journey/live-test-runs/`](../journey/live-test-runs/)
with anything that surprised you (R1 console-flash, R2 prompt UX, recall feel — the
things only a human notices). Then cut: `npm run release -- minor` → push the `v0.2.3` tag.
