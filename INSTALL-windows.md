# Install on Windows

## 1. Prerequisites (one-time per machine)

Open **PowerShell as Administrator** and run:

```powershell
# Core developer tools
winget install -e --id Git.Git
winget install -e --id Python.Python.3.13
winget install -e --id OpenJS.NodeJS.LTS

# Docker Desktop (required — milvus-lite has no Windows wheels)
winget install -e --id Docker.DockerDesktop
```

After Docker Desktop installs, launch it once. It will prompt to enable the **WSL 2 backend** — accept. If you don't have WSL 2 yet, the installer prompts you to install it; alternatively run `wsl --install` from an elevated PowerShell.

Then install Claude Code:

```powershell
npm install -g @anthropic-ai/claude-code
```

Verify versions:

```powershell
git --version
python --version
node --version
docker --version
claude --version
```

Anything failing? See [Docker Desktop install docs](https://docs.docker.com/desktop/install/windows-install/) or [winget Docker Desktop package](https://winget.run/pkg/Docker/DockerDesktop).

## 2. Install the memory kit into your project

Two paths — pick one.

### Path A — Script install (recommended)

```powershell
# Clone the kit
git clone https://github.com/<your-username>/claude-memory-kit C:\tools\claude-memory-kit

# Install into your project
cd C:\Projects\my-new-project
pwsh C:\tools\claude-memory-kit\install.ps1
```

The script copies the template files into your project's `.claude/`, `context/`, `scripts/`, `milvus-deploy/`, and `cron/jobs/` directories. Existing files are never overwritten.

### Path B — Claude Code plugin

```text
# In Claude Code, after opening your project as the primary cwd:
/plugin marketplace add <your-username>/claude-memory-kit
/plugin install claude-memory-kit
# Restart Claude Code
/claude-memory-kit:bootstrap
```

The plugin's `bootstrap` skill scaffolds the same files into your project.

### Path C — Manual copy

```powershell
# Clone the kit
git clone https://github.com/<your-username>/claude-memory-kit C:\tools\claude-memory-kit

# Copy template/ into your project
cd C:\Projects\my-new-project
Copy-Item -Recurse C:\tools\claude-memory-kit\template\.claude .
Copy-Item -Recurse C:\tools\claude-memory-kit\template\context .
Copy-Item -Recurse C:\tools\claude-memory-kit\template\scripts .
Copy-Item -Recurse C:\tools\claude-memory-kit\template\milvus-deploy .
Copy-Item -Recurse C:\tools\claude-memory-kit\template\cron .

# Rename the .template files (no automatic placeholder substitution in this path)
Rename-Item context\USER.md.template            USER.md
Rename-Item context\MEMORY.md.template          MEMORY.md
Rename-Item context\SOUL.md.template            SOUL.md
Rename-Item context\memory\INDEX.md.template    INDEX.md
```

Then manually replace `{{TODAY}}` and `{{PROJECT_NAME}}` in the renamed files.

## 3. Open Claude Code in the project

The memory hooks only fire when **this project is the primary working directory** in Claude Code. In VS Code: File → Open Folder → pick the project directory. Don't use "Add Folder to Workspace."

Verify Claude Code can see the hooks:

```text
/help
```

You should see the `memory-write` skill listed (or `claude-memory-kit:memory-write` if installed via plugin).

## 4. Install Layer 5 (memsearch — semantic recall)

In Claude Code, ASK Claude to walk through `context/SETUP.md § Step 5`. Or run manually:

```powershell
# Install memsearch with local embeddings
python -m pip install "memsearch[onnx]"

# Configure
memsearch config set embedding.provider onnx
memsearch config set embedding.model "gpahal/bge-m3-onnx-int8"

# Bring up Milvus (required on Windows)
cd milvus-deploy
docker compose up -d
cd ..

# Wait ~60s, then point memsearch at it
memsearch config set milvus.uri "http://localhost:19530"

# Initial index
bash scripts/memsearch-index-with-flush.sh context/memory context/sessions context/transcripts
```

The first index downloads the bge-m3 ONNX model (~558MB) into the huggingface cache.

## 5. Install Layer 6 (auto-curation crons)

```powershell
python scripts/register-crons.py
```

This creates three Task Scheduler tasks:

- `<project>-daily-memory-distillation` (23:00 daily)
- `<project>-nightly-memsearch-index` (02:00 daily)
- `<project>-weekly-memory-curator` (Sundays 09:00)

Override the prefix with `$env:CMK_TASK_PREFIX = "mypfx-"` before running if you want custom naming.

Verify:

```powershell
schtasks /query /fo csv /nh | Select-String "<project>-"
```

## Windows-specific gotchas

- **`bash` without quotes resolves to WSL**: Task Scheduler runs `cmd /c`, which has `C:\Windows\System32` high on PATH. A bare `bash` resolves to the WSL launcher, not Git Bash. `register-crons.py` handles this by rewriting `bash ...` invocations to `"C:\Program Files\Git\usr\bin\bash.exe" ...`. Don't edit it.
- **NTFS rejects `<` and `>` in filenames**: matters when cloning Milvus docs (the Java SDK uses `R<T>.md`). See `template/context/SETUP.md` "Reference docs" for the sparse-checkout workaround.
- **Docker Desktop must be running** for HC-7 to pass. The Milvus containers stop when Docker Desktop quits.

## Sources

- [Docker Desktop on Windows install docs](https://docs.docker.com/desktop/install/windows-install/)
- [winget Docker.DockerDesktop package](https://winget.run/pkg/Docker/DockerDesktop)
- [WSL 2 install guide](https://learn.microsoft.com/en-us/windows/wsl/install)
- [Claude Code plugins docs](https://code.claude.com/docs/en/plugins)
