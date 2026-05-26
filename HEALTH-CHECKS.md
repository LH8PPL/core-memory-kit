# Health checks

Nine yes/no checks the kit runs at session start. Each has a self-repair path. Documented here for reference; the authoritative copy lives in each project's `context/SETUP.md` (so it travels with the project).

| ID | Check | How to verify |
|---|---|---|
| HC-1 | memsearch installed | `pip show memsearch` exits 0 (or `memsearch --version` succeeds) |
| HC-2 | Stop hook registered | `.claude/settings.json` (or the plugin's `hooks/hooks.json`) contains `transcript-capture.js` |
| HC-3 | MEMORY.md distill is fresh (≤ 2 days) | Parse `<!-- Last distilled: YYYY-MM-DD -->` from `context/MEMORY.md` |
| HC-4 | Transcripts are firing (≤ 3 days) | `ls context/transcripts/*.md` — newest mtime within 3 days |
| HC-5 | INDEX.md matches `context/memory/` | Files listed in INDEX = files present on disk (excluding INDEX itself) |
| HC-6 | Cron jobs registered with host scheduler | Windows: `schtasks /query` returns Ready for every active job. Unix: `crontab -l` contains matching comment line. |
| HC-7 | memsearch backend reachable | `memsearch stats` exits 0 |
| HC-8 | Native Anthropic Auto Memory status detected | Inspect `~/.claude/projects/<slug>/memory/` existence + contents; log to `context/.locks/native-memory-status.log` as `{active: true \| false \| unknown, last_modified: <ISO>, file_count: N}` (non-fatal informational — lets users see whether the kit is supplementing or substituting Anthropic's native memory) |
| HC-9 | No stale lock files under `context/.locks/` + `<userDir>/.locks/` | `detectStaleLocks(projectRoot, {userDir})` from [packages/cli/src/lock-discipline.mjs](packages/cli/src/lock-discipline.mjs) returns no entries with `stale: true` |

## Self-repair

When a check fails, route to its repair step. **Never run install commands silently** — always ASK the user first.

### HC-1 — memsearch not installed

Repair: Re-run Step 5a from `context/SETUP.md`. Ask the user "install memsearch with local ONNX embeddings (~600MB)?" If yes:

```bash
python -m pip install "memsearch[onnx]"
```

If `memsearch --help` fails after install on Windows, check that `where memsearch.exe` and `python -c "import memsearch"` point to the same Python install.

### HC-2 — Stop hook not registered

Repair: Re-run Step 4b from `context/SETUP.md`. The hooks block in `.claude/settings.json` should contain:

```json
"hooks": {
  "Stop":        [ { "hooks": [ { "type": "command", "command": "node .claude/hooks/transcript-capture.js" } ] } ],
  "PreToolUse":  [ { "hooks": [ { "type": "command", "command": "node .claude/hooks/pre-tool-memory.js" } ] } ]
}
```

Preserve any existing `permissions` allowlist.

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

Re-run the registration script (idempotent — only registers missing tasks):

```bash
python scripts/register-crons.py
```

To see what it WOULD do without changing anything: `python scripts/register-crons.py --dry-run`.

To remove a specific task: `python scripts/register-crons.py --unregister daily-memory-distillation`.

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

## Adding new health checks

When the system grows, add a new HC by:

1. Adding a row to the table in `template/context/SETUP.md`.
2. Adding a self-repair section here and in `template/context/SETUP.md`.
3. Adding the matching summary line to the runtime contract in `template/CLAUDE.md.template`.

All three should stay in sync. SETUP.md is authoritative for "how to install/repair"; CLAUDE.md is authoritative for "what to check at session startup."
