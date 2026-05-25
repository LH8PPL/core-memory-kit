---
date: 2026-05-26
topic: working-product live-test findings — plugin layout path mismatch caught at the validation gate
status: complete
related_research: []
informed_sections: [design.md §5.1, CLAUDE.md "Did you check?" discipline]
tags:
  - live-test
  - plugin-layout
  - architecture-first
  - primary-source-verification
  - meta-lesson
---

# Live-test findings — plugin-layout path mismatch

## TL;DR

The working-product live test (Task 23 merged; auto-extract → MEMORY.md → SessionStart-injection loop) **never made it past scenario 0** (setup verification). A plugin-layout path mismatch in `design.md §5.1` shadowed the kit's new 6-hook manifest with the legacy v0.0.1 starter manifest, which crashed under the repo's ESM declaration. None of the kit's hooks actually fired in a real `claude --print` session.

**Fix** (this PR, `fix-livetest-findings`): move `plugin/.claude-plugin/hooks/hooks.json` → `plugin/hooks/hooks.json` (the canonical Anthropic location per [code.claude.com/docs/en/plugins](https://code.claude.com/docs/en/plugins) "Plugin structure overview"), delete the legacy `plugin/hooks/*.js` v0.0.1 handlers, update the hooks-scaffold test's `HOOKS_JSON_PATH` constant, amend `design.md §5.1` with the corrected path + a historical-note callout, and capture the meta-lesson here.

The meta-lesson is the more valuable output of this whole episode.

## (a) What broke and how it surfaced

### The diagnostic process

After the post-Task-23 docs commit landed on main, the working-product loop was structurally complete: Stop hook → spawn auto-extract → Haiku call → trust-routed write → next session reads MEMORY.md via SessionStart injection. Time to live-test before continuing the build plan.

Setup followed the isolation recipe agreed in the prior turn — no global plugin install:

```bash
SANDBOX=/tmp/cmk-livetest
mkdir -p "$SANDBOX" && cd "$SANDBOX" && git init -q
MEMORY_KIT_USER_DIR=/tmp/cmk-livetest-user \
  node <repo>/packages/cli/bin/cmk.mjs install
```

Install produced the expected 9 files: `MEMORY.md`, `SOUL.md`, `USER.md`, `HABITS.md`, `LESSONS.md`, `machine-paths.md`, `overrides.md` plus `INDEX.md` + `CLAUDE.md`. The `.gitignore` got the kit block.

Then scenario 1 — basic capture flow:

```bash
cd /tmp/cmk-livetest
echo "I prefer terse responses with no preamble. Also: my Python version is 3.13 and I always use pnpm not npm." | \
  MEMORY_KIT_USER_DIR=/tmp/cmk-livetest-user \
  claude --print --plugin-dir <repo>/plugin --model claude-haiku-4-5-20251001 --max-turns 1
```

Model responded. Waited 8 seconds for the detached auto-extract to complete. Then checked the kit's state:

- `context/.locks/audit.log` — **missing**
- `context/sessions/*.extract.log` — **missing**
- `context/transcripts/` — **empty**
- `context/MEMORY.md` — **unchanged from install state**

None of the kit's hooks had fired. But the plugin clearly loaded (the model's response referenced "claude-memory-kit installed" in its setup acknowledgment).

### Drilling in

Re-ran with `--verbose --include-hook-events --output-format=stream-json` to get the lifecycle event stream. Two findings popped immediately:

**Finding 1 — plugin loaded successfully:**

```json
{"type":"system","subtype":"init","plugins":[{"name":"claude-memory-kit","path":"C:\\Projects\\claude-memory-kit\\plugin","source":"claude-memory-kit@inline"}]}
```

The kit's plugin was recognized. `--plugin-dir` worked. Plugin name + path + source all correct.

**Finding 2 — only one hook fired, from the wrong path:**

```json
{"type":"system","subtype":"hook_started","hook_name":"Stop","hook_event":"Stop"}
{"type":"system","subtype":"hook_response","hook_name":"Stop","outcome":"error",
 "stderr":"file:///C:/Projects/claude-memory-kit/plugin/hooks/transcript-capture.js:8\nconst fs = require('fs');\n           ^\n\nReferenceError: require is not defined in ES module scope, you can use import instead\nThis file is being treated as an ES module because it has a '.js' file extension and 'C:\\Projects\\claude-memory-kit\\package.json' contains \"type\": \"module\"."}
```

The Stop hook fired — but pointed at the **legacy** `plugin/hooks/transcript-capture.js`, not our new `cmk-capture-turn` bash wrapper. And it crashed immediately on the ESM-vs-CJS mismatch (legacy file uses `require()`; the kit's root `package.json` has `"type": "module"`).

**None of the kit's 5 new hooks (Setup, SessionStart, UserPromptSubmit, PostToolUse, SessionEnd) appeared in the event stream at all.** They were registered in `plugin/.claude-plugin/hooks/hooks.json` — a path Claude Code 2.1.140 doesn't read.

### Root cause

Anthropic's plugin-layout spec at [code.claude.com/docs/en/plugins](https://code.claude.com/docs/en/plugins) ("Plugin structure overview" section) defines the directory layout with an explicit Warning callout:

> ⚠️ **Common mistake**: Don't put `commands/`, `agents/`, `skills/`, or `hooks/` inside the `.claude-plugin/` directory. Only `plugin.json` goes inside `.claude-plugin/`. All other directories must be at the plugin root level.

And the documented layout table lists `hooks/` location as **"Plugin root"**, not `.claude-plugin/`.

The kit's design.md §5.1 had been written referencing `plugin/.claude-plugin/hooks/hooks.json` — the very location the Warning callout flags as a common mistake. Task 17 (PR-16) shipped the new 6-hook manifest at that incorrect path. The legacy `plugin/hooks/hooks.json` from the v0.0.1 starter scaffold was deliberately left in place (flagged in PR-16's body as a follow-up cleanup question) — and that legacy manifest was the one Claude Code actually loaded.

The Warning callout in Anthropic's docs would have caught this immediately. We didn't read those docs at design time.

## (b) The actual meta-lesson — primary-source verification near-miss

This is the more valuable finding than the path fix itself.

The kit's design.md §5.1 had this verification note:

> Pattern: `${CLAUDE_PLUGIN_ROOT}/bin/cmk-<verb>` (kit-unique prefix dodges Anthropic bug #29724). **Convention verified against claude-mem (`thedotmack/claude-mem/plugin/hooks/hooks.json`) and claude-remember (`Digital-Process-Tools/claude-remember/hooks/hooks.json`).**

That note describes how we verified the **command pattern** (the `bash "${CLAUDE_PLUGIN_ROOT}/bin/cmk-<verb>"` shape). It does NOT describe how we verified the **manifest location**. The location came from a different source — never explicitly checked.

The deeper issue: both claude-mem and claude-remember actually USE the correct `plugin/hooks/hooks.json` location. We had two convergent N=1 confirmations of the right path from third-party plugins. But we wrote `plugin/.claude-plugin/hooks/hooks.json` into design.md anyway — probably because someone saw `.claude-plugin/plugin.json` (which IS canonical) and pattern-matched "all plugin metadata lives under `.claude-plugin/`" without checking.

**Either way: convergent third-party evidence (claude-mem + claude-remember both correct) didn't save us.** What would have saved us is reading Anthropic's plugin docs once. The docs page is 200 lines, takes 10 minutes, and answers the question definitively.

### The discipline addition worth making

The kit's CLAUDE.md has a "Did you check?" rule (project-CLAUDE.md "Working style → Verification"):

> **"Did you check?" is the load-bearing question.** Every external claim about a project / library / API gets verified against the primary source before being stated as fact. My training data is sometimes wrong — primary-source examination has surfaced 8+ corrections during this project.

The rule was respected for individual API claims (we verified specific function signatures, specific commit hashes, specific issue numbers). It was NOT respected for the *plugin-layout convention* — because that didn't feel like an "external claim about a library/API," it felt like a *convention we already knew*.

Conventions feel like ambient knowledge. They aren't. A convention is just an external claim about how a tool wants its files arranged. The verification rule applies.

The specific addition to CLAUDE.md (made in this PR):

> **Convention-convergence-across-third-party-implementations is not primary-source verification.** When a project / library / API has official docs, check the docs directly. Reading two plugins that both implement convention X tells you those two authors agreed on X — it doesn't tell you X is correct. If a primary source exists (Anthropic's plugin docs, the W3C spec, the language reference manual), go there.

This is one bullet under the existing "Verification" subsection — small surface, big effect.

## (c) Validation of the architecture-first decision

This is the textbook case of the bet paying off.

The project's working-style document (project-CLAUDE.md) frames the trade-off explicitly:

> Architecture-first v0.1 (~50 dev-days, 36 tasks). Not Cursor's MVP shape — we're laying foundations first.

And the journey log records that Lior accepted this trade-off knowingly:

> The kit doesn't become usable until **Task 23** (auto-extract subagent + memory-write skill). Tasks 1-22 lay foundations. Honest with the user about this — they accepted the trade-off (architecture-first vs Cursor's MVP-first ~22-hour scope).

The architecture-first bet says: invest in test infrastructure, code review gates, shared modules, type discipline — pay that cost up front, recoup it at integration time. The pay-off only shows up when the foundations meet reality.

Today is the recoup. Here's the gate-by-gate breakdown of what each layer of the architecture caught:

| Gate | What it caught (across the build) |
| --- | --- |
| **Unit tests (657/657 green at this commit)** | All the boundary-contract bugs — PR-13's B3 comma-injection in HTML-comment provenance; PR-15's B1 bullet-id wrong-bullet mutation; PR-21's B1 retain-bidirectional over-promotion; per-PR alphabet violations until Task 15 introduced validate-test-ids; etc. |
| **Per-PR `code-review-excellence` pass** | PR-21's 5 findings — B1 retain semantics, I2 stringly-typed error categories, I3 double-set log fields, M1 sha1-marker, plus the Poison_Guard gap acceptance. Caught what tests can't (judgment-call design decisions, security gaps, semantic-not-functional issues). |
| **Layer-wide code review (Checkpoint 11)** | Cross-module shared-helper duplication that no per-PR review could see — the I1-I4 findings that produced the shared `tier-paths.mjs` / `audit-log.mjs` / `frontmatter.mjs` / `result-shapes.mjs` modules. |
| **Live test (this finding)** | The plugin-load path mismatch. No test or review could catch it because none of them actually exercised Claude Code's plugin loader. The unit tests pinned that `plugin/.claude-plugin/hooks/hooks.json` is a valid manifest — they couldn't ask the question "is this where Claude Code looks for it?" |

Each gate caught what only that gate can catch. No single gate could have caught all four categories. The architecture-first decision wasn't about being thorough; it was about *building the right gates for the right kinds of bugs*, knowing in advance which gate would catch which kind.

If we'd shipped Cursor-style (one big MVP, then iterate), this bug would have surfaced in production after dozens more tasks piled on top. By then, undoing the wrong path would have meant migrating real user data, regression-testing every dependent feature, and explaining to users why their `.claude-plugin/hooks/` directories suddenly didn't work. Now it's a one-PR fix on a fresh branch with all 657 tests still green afterward.

The cost of architecture-first is paid up front in foundation work that doesn't ship features. The bet is that the cost is bounded (we spend ~22 dev-days on it) while the avoided cost is unbounded (production incidents compound). Today validates the bet for the first time.

## (d) Primary-source re-verification (the load-bearing citation)

URL: [code.claude.com/docs/en/plugins](https://code.claude.com/docs/en/plugins)

Section: **"Plugin structure overview"** — appears immediately after the Quickstart section.

The relevant Warning callout (quoted verbatim):

> ⚠️ **Common mistake**: Don't put `commands/`, `agents/`, `skills/`, or `hooks/` inside the `.claude-plugin/` directory. Only `plugin.json` goes inside `.claude-plugin/`. All other directories must be at the plugin root level.

The relevant table:

| Directory | Location | Purpose |
| :--- | :--- | :--- |
| `.claude-plugin/` | Plugin root | Contains `plugin.json` manifest (optional if components use default locations) |
| `skills/` | Plugin root | Skills as `<name>/SKILL.md` directories |
| `commands/` | Plugin root | Skills as flat Markdown files. Use `skills/` for new plugins |
| `agents/` | Plugin root | Custom agent definitions |
| `hooks/` | Plugin root | Event handlers in `hooks.json` |
| `.mcp.json` | Plugin root | MCP server configurations |
| `.lsp.json` | Plugin root | LSP server configurations for code intelligence |
| `monitors/` | Plugin root | Background monitor configurations in `monitors.json` |
| `bin/` | Plugin root | Executables added to the Bash tool's `PATH` while the plugin is enabled |
| `settings.json` | Plugin root | Default settings applied when the plugin is enabled |

Verified by `WebFetch` on 2026-05-26. The docs page also includes a "Debug plugin issues" section that explicitly says: *"Check the structure: Ensure your directories are at the plugin root, not inside `.claude-plugin/`."* That's literally the bug, in a debugging-tips paragraph, in the docs we should have read first.

Going forward, design.md and CLAUDE.md amendments lock the convention. The next time someone (Claude or human) writes a layout decision into a spec doc, the verification rule covers it.

## Bonus finding — Windows spawn bug (compressor.mjs)

After the plugin-layout fix landed and hooks started firing correctly, scenario 1 surfaced a **second** bug. The Stop hook spawned auto-extract; auto-extract called `HaikuViaAnthropicApi.compress()`; the call failed in **23 ms** with `error_category: "haiku_failed"`.

23 ms is suspiciously fast — Haiku calls take 1–5 seconds minimum. The failure was happening before Haiku ever heard from us.

### Diagnostic

Reproduced the spawn in isolation:

```bash
node -e "import('./packages/cli/src/compressor.mjs').then(...)"
# Error: spawn claude ENOENT
```

Root cause: on Windows, npm-installed CLI binaries ship as a `.cmd` shim. Node's `child_process.spawn('claude')` does NOT auto-resolve `.cmd`/`.bat` extensions (unlike shell PATH resolution which does). `where claude` finds both `claude` and `claude.cmd` in `%USERPROFILE%\AppData\Roaming\npm\` — but node only looks for an exact `claude` executable, which doesn't run on Windows without a shell layer. Two compounding issues on top:

1. **Node CVE-2024-27980 hardening** blocks running `.cmd` files via plain `spawn`; it requires `shell: true` or explicit `cmd.exe /c` invocation.
2. **cmd.exe mangles JSON arguments.** The original `compressor.mjs` passed `--mcp-config '{"mcpServers":{}}'` inline as an argv item. With `shell: true`, cmd.exe strips the outer quotes and re-tokenizes, turning the JSON into `{mcpServers:{}}` (no quotes) which fails MCP-config parsing.
3. **`cwd: '/tmp'`** doesn't resolve on Windows. Node's spawn passes it through verbatim; the OS treats it as a non-existent directory.

### Fix

Three coordinated changes in `compressor.mjs`:

1. **Default `claudeBin` to `claude.cmd` on Windows**, `claude` elsewhere (`process.platform === 'win32'`).
2. **`shell: true`** in spawn options so the .cmd shim runs through cmd.exe (POSIX no-op for our metacharacter-free argv).
3. **Write the empty MCP config to a tempfile** under `os.tmpdir()` and pass `--mcp-config <path>` instead of inline JSON. Bypasses the cmd.exe quoting nightmare entirely. Tempfile is cleaned up in both close + error paths.
4. **`cwd: tmpdir()`** instead of `/tmp` so the sandbox-cwd directive of design §6.1 works cross-platform.

The compressor test was rewritten to assert the new contract (cmd matches platform-appropriate value; `opts.shell === true`; `--mcp-config` arg ends with `empty-mcp.json` rather than being inline JSON; `opts.cwd` is a non-empty string).

### Why the unit tests didn't catch this

The `HaikuViaAnthropicApi` test injects a `spawnFn` mock. The injected mock never invokes real spawn — it just records the cmd/args/opts and synthesizes a fake child. So the test pinned the cmd-and-args **shape** correctly (matching what the spec said), but never exercised the actual `child_process.spawn` against the real `claude` binary. The spawn-shape was right per spec; the spawn-shape was wrong per reality.

This is the **same architectural lesson as the plugin-layout bug**: a unit test pins the manifest; only the live test pins "and the manifest is in the right place" and "and node's spawn actually executes against this argv on this OS."

It's a different gate that catches a different category of bug.

### Future-proofing

For any future `spawnFn`-injected boundary tests, add a smoke-level "real spawn smoke" that runs the real flow against a no-op subject (e.g., spawn `echo` or `node -e "process.exit(0)"` with the documented opts shape) to confirm Node's spawn actually accepts those opts on this OS. The smoke doesn't need to call Haiku — it just needs to verify the spawn-layer works. Would have caught this. Recording the suggestion here; not implementing in this PR (out of scope).

## Verification — scenarios 1 + 2 both pass on the fix branch

After both fixes (plugin-layout path + Windows spawn) landed on this branch, re-ran the live scenarios. Sandbox: `/tmp/cmk-livetest` with isolation flags `--plugin-dir <repo>/plugin` + `MEMORY_KIT_USER_DIR=/tmp/cmk-livetest-user`. No global install.

### Scenario 1 — basic capture flow (with restatement-eliciting prompt)

User prompt: `"Walk me through what you know about my preferences..."` — designed to make the assistant restate the facts the user dictates (because the kit extracts from the assistant turn, not the user prompt; see "Architectural finding" below).

Assistant response restated 4 facts: terse responses, Python 3.13, pnpm not npm, Conventional Commits.

Auto-extract result (`extract.log` second line):

```json
{"ts":"2026-05-25T09:38:12Z","success":true,"error_category":null,"observation_count":4,"skipped_reason":null,"duration_ms":16188}
```

All 4 facts written to `MEMORY.md` Active Threads with full provenance:

```markdown
- (P-DAASP4MT) Communication preference: terse responses, no preamble
  <!-- source: auto-extract-session, source_line: 1, sha1: ca7540a5ce0a65e65995d25e145b47826ee1cae4, write: auto-extract, trust: high, at: 2026-05-25T09:38:12Z -->
- (P-AKSHDSaP) Python version: 3.13
  <!-- source: auto-extract-session, source_line: 1, sha1: 0e4ae491c04beebfb326cd7547d5aaca19491a9f, write: auto-extract, trust: high, at: 2026-05-25T09:38:12Z -->
- (P-X94B3XW2) Package manager: pnpm (not npm)
  <!-- source: auto-extract-session, source_line: 1, sha1: bebd54b61d636b0543c2044b99fdbc72e1cd496c, write: auto-extract, trust: high, at: 2026-05-25T09:38:12Z -->
- (P-TU22LKWW) Git commit convention: Conventional Commits format
  <!-- source: auto-extract-session, source_line: 1, sha1: d2be447497ffec270fef80be82e1594bb3649bae, write: auto-extract, trust: high, at: 2026-05-25T09:38:12Z -->
```

Audit log: 4 entries with canonical schema v1 (`action: appended`, `reasonCode: scratchpad-append`, real SHA-1 in `extra`). Cap pressure triggered on the 3rd write — consolidator ran, dropped 3 stale seed bullets to make room.

### Scenario 2 — fresh session reads session-1 captures via SessionStart injection

Fresh `claude --print` invocation in the same sandbox:

> User: "What do you know about my preferences? Don't read any files, just tell me what's already in your context."
>
> Assistant: *"Based on what's already in my context, here's what I know about your preferences:*
> *— Terse responses, no preamble (no summaries at the end)*
> *— Explain tradeoffs before recommending; don't lead with conclusions*
> *— Verify external claims against primary sources before stating as fact*
> *— Memory writes should be silent—don't announce them*
> *— Python 3.13*
> *— pnpm (not npm)*
> *— Conventional Commits format for git messages*
> *— You maintain a personal wiki at `/c/Projects/liorwiki/`...*
> *— This project uses claude-memory-kit for in-repo memory in `context/`..."*

**The model used the injected context.** All 4 session-1 facts present. Plus the kit's seed SOUL.md content (verify primary sources, etc.). Plus the user's global `~/.claude/CLAUDE.md` content (liorwiki). The 3-tier model worked, and the model actually USED the snapshot to answer.

This is the load-bearing test. **The working-product value prop is real, not just structurally implemented.**

### Architectural finding worth recording (out of scope for THIS PR — flag for Task 22/24 spec discussion)

Auto-extract reads the **assistant turn**, not the **user prompt**. So the first round (with a terse "Ready. What do you need?" response) extracted 0 facts even though the user's prompt contained 4 durable preferences. Only the restatement-eliciting prompt produced captures.

This is design-correct per the current spec — but the user-experience implication is significant: a user dictating preferences to a brief, acknowledging assistant gets nothing captured. The kit's mental model in design §6.0 ("Claude takes notes naturally, the way a colleague taking minutes in a meeting doesn't need the speaker to say 'please write that down'") fails when the assistant doesn't restate.

Possible directions (parking for Task 22 / Task 24 spec discussion):

- Have auto-extract also read the captured UserPromptSubmit transcript line as context.
- Add a "the user JUST DICTATED these facts" pass that runs on user-prompts too.
- Document the "ask Claude to restate" pattern as the canonical UX.

NOT fixing in this PR.

## What's NOT in this PR (per Lior's gate)

This PR fixes only the immediate path mismatch + the CLAUDE.md discipline note + the Windows spawn bug surfaced during live testing. It does NOT:

- Continue to live-test scenarios 3–7. Those remain gated on Lior's review of this fix + a green re-run of scenarios 1 + 2 on the fix branch.
- Resume Tasks 22 (SessionEnd CompressorBackend invocation) or 24 (memory-write skill + Poison_Guard). Both stay paused until live-test findings inform their specs.
- Modify any other part of design.md, CLAUDE.md, or the architecture. Only the §5.1 path correction + the convention-convergence verification rule.

The pattern for future live-test cycles, if more issues surface: same shape — `fix-livetest-findings-N` branch per finding, primary-source verification first, narrow fix scope, journey-log entry capturing the meta-lesson.
