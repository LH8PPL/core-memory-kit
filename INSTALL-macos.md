# Install on macOS

## 1. Prerequisites (one-time per machine)

[Install Homebrew](https://brew.sh/) if you don't have it:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then:

```bash
brew install git python@3.13 node

# Docker is OPTIONAL on macOS — milvus-lite (bundled with memsearch) works natively.
# Only install Docker Desktop if you specifically want a remote Milvus.
brew install --cask docker-desktop

# Claude Code
npm install -g @anthropic-ai/claude-code
```

Verify:

```bash
git --version
python3 --version
node --version
claude --version
```

## 2. Install the memory kit into your project

Pick one path.

### Path A — Script install (recommended)

```bash
git clone https://github.com/<your-username>/claude-memory-kit ~/.local/share/claude-memory-kit

cd ~/Projects/my-new-project
bash ~/.local/share/claude-memory-kit/install.sh
```

### Path B — Claude Code plugin

```text
# In Claude Code, after opening your project as the primary cwd:
/plugin marketplace add <your-username>/claude-memory-kit
/plugin install claude-memory-kit
# Restart Claude Code
/claude-memory-kit:bootstrap
```

### Path C — Manual copy

```bash
git clone https://github.com/<your-username>/claude-memory-kit ~/.local/share/claude-memory-kit

cd ~/Projects/my-new-project
cp -r ~/.local/share/claude-memory-kit/template/.claude .
cp -r ~/.local/share/claude-memory-kit/template/context .
cp -r ~/.local/share/claude-memory-kit/template/scripts .
cp -r ~/.local/share/claude-memory-kit/template/cron .

# Rename .template files
mv context/USER.md.template            context/USER.md
mv context/MEMORY.md.template          context/MEMORY.md
mv context/SOUL.md.template            context/SOUL.md
mv context/memory/INDEX.md.template    context/memory/INDEX.md
```

Then manually replace `{{TODAY}}` and `{{PROJECT_NAME}}` in the renamed files. (The script does this for you in Path A.)

## 3. Open Claude Code in the project

Open the project as the **primary working directory** in your editor — File → Open Folder, not "Add to Workspace." The memory hooks only fire when this project is primary.

## 4. Install Layer 5 (memsearch — semantic recall)

```bash
# Install memsearch with local embeddings
python3 -m pip install "memsearch[onnx]"

# Configure
memsearch config set embedding.provider onnx
memsearch config set embedding.model "gpahal/bge-m3-onnx-int8"

# Initial index (uses bundled milvus-lite at ~/.memsearch/milvus.db by default)
bash scripts/memsearch-index-with-flush.sh context/memory context/sessions context/transcripts
```

Skip the `milvus-deploy/` directory on macOS — milvus-lite is bundled with `memsearch[onnx]` and works out of the box. The wrapper script detects `milvus-lite` and skips the flush step automatically.

## 5. Install Layer 6 (auto-curation crons)

macOS uses `launchd` via the kit's cross-platform registration command:

```bash
cmk register-crons
```

This registers both daily-distill (23:00 daily) and weekly-curate (Sun 09:00) jobs as user-level LaunchAgents (`~/Library/LaunchAgents/com.cmk.cmk-daily-distill.plist` + `~/Library/LaunchAgents/com.cmk.cmk-weekly-curate.plist`). Preview with `cmk register-crons --dry-run` first if you want to inspect the plists.

Verify (replace YOUR_UID with `id -u`):

```bash
launchctl list | grep cmk
```

You should see three entries with comments matching your project's name prefix.

If you'd rather use `launchd` (the modern macOS scheduler), you can convert the cron entries to plist files manually — but cron works fine and is simpler.

## macOS-specific notes

- **Apple Silicon (M1/M2/M3/M4)**: everything above works natively. milvus-lite ships an arm64 wheel.
- **System Python vs Homebrew Python**: use the Homebrew one (`python3` after `brew install python@3.13`). The system Python at `/usr/bin/python3` lacks pip by default and is managed by Apple.
- **PATH for cron jobs**: `crontab` on macOS runs jobs with a minimal PATH. The kit's shell scripts (`run-daily-distill.sh` etc.) prepend `/opt/homebrew/bin` and `/usr/local/bin` so brew-installed binaries are found.

## Sources

- [Homebrew install](https://brew.sh/)
- [docker-desktop cask](https://formulae.brew.sh/cask/docker-desktop) (optional on macOS)
- [Claude Code plugins docs](https://code.claude.com/docs/en/plugins)
