# Health checks

Nine yes/no checks `cmk doctor` runs against the kit installation. Each has a self-repair path. (HC-10 was scoped but not shipped in v0.1.0 — design §18 deferred to v0.1.x as a structural-validator extension rather than a doctor surface; remove the row to avoid drift.)

| ID | Check | How to verify |
| --- | --- | --- |
| HC-1 | memsearch installed (Layer 5b semantic backend) | `memsearch --version` succeeds within 3.5s |
| HC-2 | Stop + SessionStart hooks registered | `.claude/settings.json` contains `cmk-inject-context` in SessionStart, `cmk-capture-turn` in Stop, `cmk-compress-session` in SessionEnd (structural walk, not substring match) |
| HC-3 | Daily distill is fresh (≤ 2 days) | `context/sessions/recent.md` mtime is within 2 days of `now` |
| HC-4 | Transcripts are firing (≤ 3 days) | At least one `context/transcripts/*.md` has mtime within 3 days |
| HC-5 | INDEX.md matches `context/memory/` | `[PUL]-XXXXXXXX.md` filenames in INDEX = fact files on disk (excluding INDEX itself) |
| HC-6 | Cron jobs registered with host scheduler | `context/.locks/cron-registered` sentinel exists (written by `cmk register-crons`) |
| HC-7 | memsearch backend reachable | Short-circuits on HC-1 verdict (Milvus reachability deferred to Layer 5b / v0.1.x per ADR-0008) |
| HC-8 | Native Anthropic Auto Memory status detected | Inspect `~/.claude/projects/<slug>/memory/`; write single-line JSON snapshot to `context/.locks/native-memory-status.log`. Non-fatal informational. |
| HC-9 | No stale lock files | `detectStaleLocks(projectRoot, {userDir})` from [packages/cli/src/lock-discipline.mjs](packages/cli/src/lock-discipline.mjs) returns no entries with `stale: true` |

**Severity on a fresh project (v0.2.0):** HC-3, HC-4, and HC-6 report **SKIP**, not FAIL, when there's simply nothing to check yet — no distill built (HC-3), no Claude Code session captured here yet (HC-4), or cron not registered (HC-6, which is *optional*: the kit falls back to lazy-on-read compression). A clean install therefore reads `pass · 0 fail · skip` and `cmk doctor` exits `0`. These flip to **FAIL** only on a genuine problem: a *stale* distill (recent.md exists but > 2 days old), or transcripts that exist but stopped firing (> 3 days).

## Self-repair

When a check fails, route to its repair step. **Never run install commands silently** — always ASK the user first.

### HC-1 — memsearch not installed

Repair: Re-run Step 5a from `context/SETUP.md`. Ask the user "install memsearch with local ONNX embeddings (~600MB)?" If yes:

```bash
python -m pip install "memsearch[onnx]"
```

If `memsearch --help` fails after install on Windows, check that `where memsearch.exe` and `python -c "import memsearch"` point to the same Python install.

### HC-2 — Stop hook not registered

Repair: run **`cmk repair --hooks`** — it idempotently merges the kit's canonical hooks block into `.claude/settings.json`, preserving any of your own hooks and other keys. (`cmk install` writes the same block; repair is the targeted re-apply.) After repairing, restart Claude Code.

As of v0.1.1 the block uses PATH-resolved bare bin names (shell form), which resolve the `npm install -g @lh8ppl/claude-memory-kit` global shims on every OS:

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

### HC-3 — Distill timestamp stale

The daily-distill cron is either not running or not updating the timestamp. Steps:

1. Run `bash scripts/run-daily-distill.sh` manually. If it succeeds, the timestamp updates and HC-3 goes green.
2. If it fails (Claude auth issue, allowlist too narrow), add a "Pending Decision" entry to MEMORY.md describing the failure.
3. Check `schtasks /query /tn <project>-daily-memory-distillation` (Windows) or `crontab -l` (Unix) to confirm the job is registered.

### HC-4 — Transcripts not firing

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

### HC-5 — INDEX.md out of sync

Add missing files to INDEX.md, or remove stale entries. Each line is:

```
- [type] [Title](filename.md) — short hook
```

Where type is one of `user`, `feedback`, `project`, `reference`.

### HC-6 — Cron jobs missing

Re-run the registration command (idempotent — registers both daily-distill at 23:00 and weekly-curate at Sun 09:00):

```bash
cmk register-crons
```

To see what it WOULD do without changing anything: `cmk register-crons --dry-run`.

To remove both entries: `cmk register-crons --unregister`.

### HC-7 — memsearch backend unreachable

**Windows**: Docker Desktop probably isn't running, or the Milvus containers stopped. ASK user to start Docker Desktop, then:

```bash
cd milvus-deploy
docker compose up -d
cd ..
```

Wait 30-60s for the three containers (`milvus-standalone`, `milvus-minio`, `milvus-etcd`) to report `(healthy)`:

```bash
docker compose ps
```

Then re-run `memsearch stats`.

**Linux/macOS**: check that `~/.memsearch/milvus.db` exists and is accessible. If `milvus.uri` was previously set to a remote URI but you want local milvus-lite back:

```bash
memsearch config set milvus.uri "~/.memsearch/milvus.db"
```

### HC-10 — platform-aware emissions mismatch

Repair: this check is non-fatal and informational. If `cmk doctor` reports a mismatch, the kit's platform-detection (`process.platform`) disagrees with the emission shape — likely a misuse of `platform-commands.mjs` somewhere in the codebase. Run:

```bash
node scripts/validate-platform-commands.mjs
```

…to scan for hardcoded POSIX emissions outside the helper. The validator output names the offending file + line.

If the validator passes but `cmk doctor` still reports a mismatch, the cause is likely an environment quirk (Git Bash on Windows reporting itself as `linux`-like, or vice versa). Document the case in a research note and file a v0.1.x candidate.

## Adding new health checks

When the system grows, add a new HC by:

1. Adding a row to the table in `template/context/SETUP.md`.
2. Adding a self-repair section here and in `template/context/SETUP.md`.
3. Adding the matching summary line to the runtime contract in `template/CLAUDE.md.template`.

All three should stay in sync. SETUP.md is authoritative for "how to install/repair"; CLAUDE.md is authoritative for "what to check at session startup."
