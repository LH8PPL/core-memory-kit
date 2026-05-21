# Install on Linux

These instructions target **Ubuntu/Debian** (apt). For Fedora/RHEL/Arch, swap the package manager — the rest is identical.

## 1. Prerequisites (one-time per machine)

```bash
# Core developer tools
sudo apt update
sudo apt install -y git python3 python3-pip python3-venv build-essential

# Node.js 20+ (Ubuntu's default repo lags; use NodeSource)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Docker Engine (OPTIONAL — milvus-lite works on Linux natively)
# Only install if you want a remote Milvus.
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add yourself to the docker group so you don't need sudo for docker commands
sudo groupadd docker 2>/dev/null || true
sudo usermod -aG docker $USER
newgrp docker  # apply group change in current shell
```

Then install Claude Code:

```bash
sudo npm install -g @anthropic-ai/claude-code
```

Verify:

```bash
git --version
python3 --version
node --version
docker --version    # only if you installed it
claude --version
```

## 2. Install the memory kit into your project

Pick one.

### Path A — Script install (recommended)

```bash
git clone https://github.com/<your-username>/claude-memory-kit ~/.local/share/claude-memory-kit

cd ~/Projects/my-new-project
bash ~/.local/share/claude-memory-kit/install.sh
```

### Path B — Claude Code plugin

```text
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

mv context/USER.md.template            context/USER.md
mv context/MEMORY.md.template          context/MEMORY.md
mv context/SOUL.md.template            context/SOUL.md
mv context/memory/INDEX.md.template    context/memory/INDEX.md
```

Then replace `{{TODAY}}` and `{{PROJECT_NAME}}` manually.

## 3. Open Claude Code in the project

Open the project as the **primary working directory**. The memory hooks only fire when this project is primary, not when it's an added/additional directory.

## 4. Install Layer 5 (memsearch — semantic recall)

```bash
# Install memsearch with local embeddings
python3 -m pip install --user "memsearch[onnx]"

# Configure
memsearch config set embedding.provider onnx
memsearch config set embedding.model "gpahal/bge-m3-onnx-int8"

# Initial index (uses milvus-lite at ~/.memsearch/milvus.db by default)
bash scripts/memsearch-index-with-flush.sh context/memory context/sessions context/transcripts
```

milvus-lite is bundled with `memsearch[onnx]` and works natively on Linux. Skip the `milvus-deploy/` directory unless you want a remote Milvus.

## 5. Install Layer 6 (auto-curation crons)

```bash
python3 scripts/register-crons.py
```

Verify:

```bash
crontab -l
```

You should see three entries with comments matching your project's name prefix.

If your system uses `systemd` timers instead of cron (some servers do), you'll need to convert the cron entries to `.timer` units — but cron works fine for desktop/dev use.

## Linux-specific notes

- **`pip install --user`**: avoids sudo and installs into `~/.local/bin`. Make sure `~/.local/bin` is on your `$PATH` (it usually is by default).
- **Display-less servers**: the kit works fine over SSH. The PreToolUse hook only needs Node, which has no display dependency.
- **PATH for cron**: cron jobs run with a minimal PATH. The kit's shell scripts (`run-daily-distill.sh` etc.) prepend `/usr/local/bin` and `/usr/bin` so `memsearch`, `claude`, and `python3` are found.

## Sources

- [Docker Engine on Ubuntu install docs](https://docs.docker.com/engine/install/ubuntu/)
- [Docker post-install (add user to docker group)](https://docs.docker.com/engine/install/linux-postinstall/)
- [NodeSource setup script](https://github.com/nodesource/distributions)
- [Claude Code plugins docs](https://code.claude.com/docs/en/plugins)
