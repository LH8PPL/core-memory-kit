# Sources and references

Where the patterns and decisions in this kit come from.

## Conceptual / inspiration

- **Simon Scrapes — "Master Claude Memory to Get Ahead of 99% of People"** ([YouTube](https://www.youtube.com/watch?v=rFWxRZ5D-lM), [Notion writeup](https://scrapeshq.notion.site/claude-memory-systems)) — the source pattern for layered, per-project memory; the four-component Layer 4 design (PreToolUse + Stop + skill + auto-extract); the frozen-snapshot concept.
- **Hermes** (Anthropic example agent) — the frozen-snapshot pattern that inspired SOUL.md as a separate "how Claude shows up" file from USER.md ("who the user is").

## Claude Code

- [Claude Code plugins reference](https://code.claude.com/docs/en/plugins) — manifest format (`.claude-plugin/plugin.json`), skills/hooks/agents/MCP-servers directory conventions, `--plugin-dir` for local testing, `/plugin install` for marketplace install.
- [Claude Code hooks documentation](https://docs.claude.com/en/docs/claude-code/hooks) — PreToolUse / Stop event types, `additionalContext` output protocol, hook input JSON shape.
- [Claude Code skills documentation](https://docs.claude.com/en/docs/claude-code/skills) — SKILL.md frontmatter (`description`, `disable-model-invocation`), auto-trigger via description matching.

## memsearch and Milvus

- **memsearch** by Zilliz ([GitHub](https://github.com/zilliztech/memsearch)) — local-first hybrid keyword + vector search, ONNX embedding provider, MilvusStore backend.
- [memsearch issue #534](https://github.com/zilliztech/memsearch/issues/534) — missing flush() in MilvusStore.upsert(); the reason `scripts/memsearch-index-with-flush.sh` exists as a wrapper.
- **Milvus v2.6 release notes** — Woodpecker WAL backend change (replaces Pulsar in v2.5). Pulled from `milvus-io/web-content` repo on GitHub when the official docs site returned 403.
- **Milvus standalone Docker install** — official multi-container compose pattern (etcd + MinIO + standalone). The `latest` tag is v3.0-beta and crashes; v2.6.16 is the current stable.

## Per-OS install commands

### Windows
- [Docker Desktop on Windows install docs](https://docs.docker.com/desktop/install/windows-install/) — WSL 2 backend requirements, per-user vs all-users install.
- [winget Docker.DockerDesktop package](https://winget.run/pkg/Docker/DockerDesktop) — `winget install -e --id Docker.DockerDesktop`.
- [WSL 2 install guide (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/wsl/install) — `wsl --install` from elevated PowerShell.

### macOS
- [Homebrew install](https://brew.sh/) — the `/bin/bash -c "$(curl ...)"` one-liner.
- [docker-desktop Homebrew cask](https://formulae.brew.sh/cask/docker-desktop) — `brew install --cask docker-desktop` (optional on macOS since milvus-lite works natively).

### Linux
- [Docker Engine on Ubuntu install docs](https://docs.docker.com/engine/install/ubuntu/) — apt repository setup, GPG key import, `docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`.
- [Docker post-install steps](https://docs.docker.com/engine/install/linux-postinstall/) — `groupadd docker`, `usermod -aG docker $USER`, `newgrp docker`.
- [NodeSource Node.js distributions](https://github.com/nodesource/distributions) — `curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -`.

## Windows-specific gotchas

- **NTFS forbids `<` and `>` in filenames** — surfaces when cloning `milvus-io/web-content` (Java SDK uses `R<T>.md`). Fix: sparse-checkout. Documented in `template/context/SETUP.md` reference docs section.
- **Task Scheduler resolves `bash` to WSL launcher, not Git Bash** — fix: `scripts/register-crons.py` rewrites `bash ...` to `"C:\Program Files\Git\usr\bin\bash.exe" ...` explicitly.
- **milvus-lite has no Windows wheels on PyPI** — fix: ship a Docker Compose stack for Milvus v2.6.16 in `milvus-deploy/`.

## Embedding model

- **gpahal/bge-m3-onnx-int8** ([HuggingFace](https://huggingface.co/gpahal/bge-m3-onnx-int8)) — int8-quantized BGE-M3 in ONNX format. ~558MB. Multilingual. Used by memsearch with the ONNX provider so no API key is required.
