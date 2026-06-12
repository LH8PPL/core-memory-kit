# Health checks

Eight yes/no checks `cmk doctor` runs against the kit installation. Each has a self-repair path. (The two memsearch checks — formerly HC-1 "installed" + HC-7 "reachable" — were removed in Task 120: the kit ships keyword-only and the Layer-5b semantic backend is not yet shipped; the backend choice is deferred per design §9.3.1.)

| ID | Check | How to verify |
| --- | --- | --- |
| HC-1 | Stop + SessionStart hooks registered | `.claude/settings.json` contains `cmk-inject-context` in SessionStart, `cmk-capture-turn` in Stop, `cmk-compress-session` in SessionEnd (structural walk, not substring match) |
| HC-2 | Daily distill is fresh (≤ 2 days) | `context/sessions/recent.md` mtime is within 2 days of `now` |
| HC-3 | Transcripts are firing (≤ 3 days) | At least one `context/transcripts/*.md` has mtime within 3 days |
| HC-4 | INDEX.md matches `context/memory/` | `[PUL]-XXXXXXXX.md` filenames in INDEX = fact files on disk (excluding INDEX itself) |
| HC-5 | Cron jobs registered with host scheduler | `context/.locks/cron-registered` sentinel exists (written by `cmk register-crons`) |
| HC-6 | Native Anthropic Auto Memory status detected | Inspect `~/.claude/projects/<slug>/memory/`; write single-line JSON snapshot to `context/.locks/native-memory-status.log`. Non-fatal informational. |
| HC-7 | No stale lock files | `detectStaleLocks(projectRoot, {userDir})` from [packages/cli/src/lock-discipline.mjs](packages/cli/src/lock-discipline.mjs) returns no entries with `stale: true` |
| HC-8 | Native bindings present (npm 12 readiness) | `require('better-sqlite3')` loads its `.node` binding; when `search.default_mode` is `hybrid`/`semantic`, the embedder import is probed too (distinguishing not-installed from installed-but-binding-broken). Fails with the exact `--allow-scripts` remediation when npm 12 blocked the install script (Task 141a, D-129) |

**Severity on a fresh project:** HC-2, HC-3, and HC-5 report **SKIP**, not FAIL, when there's simply nothing to check yet — no distill built (HC-2), no Claude Code session captured here yet (HC-3), or cron not registered (HC-5, which is *optional*: the kit falls back to lazy-on-read compression). A clean install therefore reads `pass · 0 fail · skip` and `cmk doctor` exits `0`. These flip to **FAIL** only on a genuine problem: a *stale* distill (recent.md exists but > 2 days old), or transcripts that exist but stopped firing (> 3 days).

## Self-repair

When a check fails, route to its repair step. **Never run install commands silently** — always ASK the user first.

### HC-1 — Stop hook not registered

Repair: run **`cmk repair --hooks`** — it idempotently merges the kit's canonical hooks block into `.claude/settings.json`, preserving any of your own hooks and other keys. (`cmk install` writes the same block; repair is the targeted re-apply.) After repairing, restart Claude Code.

The block uses PATH-resolved bare bin names (shell form), which resolve the `npm install -g @lh8ppl/claude-memory-kit` global shims on every OS:

```json
"hooks": {
  "SessionStart":     [ { "hooks": [ { "type": "command", "command": "cmk-inject-context",   "timeout": 30 } ] } ],
  "UserPromptSubmit": [ { "hooks": [ { "type": "command", "command": "cmk-capture-prompt",    "timeout": 10 } ] } ],
  "PostToolUse":      [ { "matcher": "Write|Edit|MultiEdit", "hooks": [ { "type": "command", "command": "cmk-observe-edit", "async": true, "timeout": 120 } ] } ],
  "Stop":             [ { "hooks": [ { "type": "command", "command": "cmk-capture-turn",      "timeout": 30 } ] } ],
  "SessionEnd":       [ { "hooks": [ { "type": "command", "command": "cmk-compress-session",  "timeout": 60 } ] } ]
}
```

(If you installed via the `/plugin` marketplace route instead, the hooks come from the plugin's own `hooks.json` using `${CLAUDE_PLUGIN_ROOT}` — you don't wire settings.json yourself on that route.) Preserve any existing `permissions` allowlist.

### HC-2 — Distill timestamp stale

The daily-distill cron is either not running or not updating the timestamp. Steps:

1. Run `cmk daily-distill` manually. If it succeeds, the timestamp updates and HC-2 goes green.
2. If it fails (Claude auth issue, allowlist too narrow), add a "Pending Decision" entry to MEMORY.md describing the failure.
3. Check `schtasks /query /tn cmk-daily-distill` (Windows) or `crontab -l` (Unix) to confirm the job is registered.

### HC-3 — Transcripts not firing

**First check the root cause**: Claude Code's Stop hook fires only when this project is the **primary** working directory. If you opened Claude Code in a different project and this one is an added/additional directory, the hook in this project's `.claude/settings.json` doesn't activate.

Fix: open Claude Code with this project as primary (File → Open Folder, not "Add to Workspace").

If primary AND still failing:
1. Verify Node is installed: `node --version`.
2. Test the hook in isolation:
   ```bash
   echo '{"stop_reason":"end_turn","response":"test"}' | node .claude/hooks/transcript-capture.js
   ```
   Should exit 0 and (since "test" is < 100 chars) skip the auto-extract.
3. Re-register the hook entry in `.claude/settings.json`.

### HC-4 — INDEX.md out of sync

Add missing files to INDEX.md, or remove stale entries. Each line is:

```
- [type] [Title](filename.md) — short hook
```

Where type is one of `user`, `feedback`, `project`, `reference`.

### HC-5 — Cron jobs missing

Re-run the registration command (idempotent — registers both daily-distill at 23:00 and weekly-curate at Sun 09:00):

```bash
cmk register-crons
```

To see what it WOULD do without changing anything: `cmk register-crons --dry-run`.

To remove both entries: `cmk register-crons --unregister`.

(HC-6 native-memory detection and HC-7 stale-lock detection are informational / self-evident from the `cmk doctor` output and need no manual repair recipe.)

### HC-8 — Native binding missing (npm 12 blocked the install script)

npm 12 (~July 2026) turns dependency install scripts **off by default**, including the implicit node-gyp build that `better-sqlite3`'s binding needs — a fresh `npm install -g` then looks installed but search/reindex crash at first use. `cmk install` detects this up front and offers to fix it inline; HC-8 is the backstop. Repair (the global `allow-scripts` config — the project-level `npm approve-scripts` allowlist does not apply to `-g` installs):

```bash
npm install -g @lh8ppl/claude-memory-kit --allow-scripts=better-sqlite3
```

Set-and-forget alternative (one-time, machine-level — also covers future reinstalls and npx; per the npm maintainers in the v12 community discussion):

```bash
npm config set allow-scripts=better-sqlite3 --location=user
```

Note npm 12's default is **soft mode**: the unapproved script *skips with a warning and the install succeeds* — which is exactly why the breakage is easy to miss and `cmk install` probes for it. (`strict-allow-scripts=true` turns it into a hard install failure.)

For the optional semantic embedder (only checked when this project defaults to hybrid/semantic search):

```bash
npm install -g @huggingface/transformers --allow-scripts=onnxruntime-node
```

(`cmk install --with-semantic` passes that flag itself on npm ≥ 11.16.)

## Adding new health checks

When the system grows, add a new HC by:

1. Adding the check function + the `runDoctor` wiring in [`packages/cli/src/doctor.mjs`](packages/cli/src/doctor.mjs) (tests in `tests/cli-doctor.test.js` pin count + order).
2. Adding a row to the table here, plus a self-repair section when the repair isn't self-evident.
3. Updating the design table in `specs/design.md` §14 and the README health-checks table / count lines (pinned by `tests/docs-structure.test.js`).

(Original instructions pointed at `template/context/SETUP.md` + `template/CLAUDE.md.template`; the current template no longer enumerates HCs — the scaffolded CLAUDE.md block describes `cmk doctor` generically, so per-HC docs live only in the three spots above. Noted 2026-06-12, Task 141a.)
