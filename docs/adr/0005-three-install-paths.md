---
adr: 0005
title: Ship three install paths — bash script, PowerShell script, Claude Code plugin
status: accepted
date: 2026-05-21
deciders:
  - the maintainer
  - Claude Opus 4.7
supersedes: null
superseded_by: null
related:
  - 0001-separate-project-not-fork-youtube-to-slide.md
tags:
  - install
  - distribution
  - cross-os
---

# ADR-0005 — Ship three install paths — bash script, PowerShell script, Claude Code plugin

## Status

**Accepted** 2026-05-21. Reaffirmed in [specs/v0.1.0/requirements.md FR-22](../../specs/v0.1.0/requirements.md) (OQ-2).

## Context

`claude-memory-kit` must install cleanly on:

- Windows 10/11 (the primary user's daily driver).
- macOS 14+ (the primary user's secondary machine).
- Ubuntu 22.04+ / generic Linux (potential adopters).

Three audiences exist:

1. **Power users with Git Bash on Windows or a normal Bash on Mac/Linux** — comfortable running `bash install.sh`.
2. **Windows-native users who don't have Git Bash** — need PowerShell.
3. **Claude Code users who prefer to install via the marketplace** — install via `/plugin install claude-memory-kit`, no terminal access needed.

Manual `cp -r` is documented as a fallback but is not a first-class install path — error-prone.

## Decision

**v0.1 ships three install paths in parallel:**

| Path | Audience | Mechanism |
|---|---|---|
| `bash install.sh` | macOS, Linux, Git Bash on Windows | Reads `template/` and scaffolds into the current directory, never overwriting existing files. Substitutes `{{TODAY}}` and `{{PROJECT_NAME}}` placeholders. |
| `pwsh install.ps1` | Windows-native (no Git Bash required) | PowerShell-native equivalent of `install.sh`. Same scaffolding, same idempotency. |
| `/plugin install claude-memory-kit` followed by `/claude-memory-kit:bootstrap` | Claude Code users | Plugin manifest at `plugin/.claude-plugin/plugin.json`. Plugin ships hooks + skills globally; the `bootstrap` skill scaffolds per-project files when invoked. |

Plus a documented **manual copy** fallback in [INSTALL-windows.md](../../INSTALL-windows.md), [INSTALL-macos.md](../../INSTALL-macos.md), [INSTALL-linux.md](../../INSTALL-linux.md) — not a primary path but available for offline / air-gapped scenarios.

All three paths are idempotent: re-running them on a project that already has the kit installed never overwrites existing files (it skips them with a `SKIP` log line).

## Consequences

### Positive

- Each install path matches a real user's workflow — no one has to context-switch into an unfamiliar tool.
- The plugin path is the lowest-friction for new users — discoverable from within Claude Code itself.
- The script paths are the most transparent — The user can read what they're about to run.
- Idempotency means re-installing after kit updates is safe.

### Negative

- Three install paths to keep in sync. When v0.1.1 adds a new file or directory, all three installers must learn about it. Mitigated by all three reading from the same `template/` source — there's no separate per-installer source-of-truth.
- The plugin requires a `bootstrap` skill that runs synchronously; bash/PowerShell scripts run faster. Documented in the plugin's README.

### Neutral

- A future `npx claude-memory-kit install` (Node-based universal installer) is mentioned in FR-22 as a fourth path for v0.1, but it's blocked on npm publication. Tracked as a v0.1 stretch goal.

## Alternatives considered (and why rejected)

| Alternative | Why rejected |
|---|---|
| Only `install.sh` | Excludes Windows-native PowerShell users. The user's primary machine is Windows. |
| Only Claude Code plugin | Requires Claude Code already installed; new users who haven't authenticated can't use it. Also: marketplace discoverability isn't there yet for v0.1 (private repo). |
| Only `npx claude-memory-kit install` | Requires npm publication; private-repo distribution doesn't work for npm. Defer. |
| All three plus a Docker image | Overkill for v0.1. The kit is markdown + scripts; Docker adds no value. |

## References

- Install scripts: [install.sh](../../install.sh), [install.ps1](../../install.ps1)
- Plugin manifest: [plugin/.claude-plugin/plugin.json](../../plugin/.claude-plugin/plugin.json)
- Per-OS install docs: [INSTALL-windows.md](../../INSTALL-windows.md), [INSTALL-macos.md](../../INSTALL-macos.md), [INSTALL-linux.md](../../INSTALL-linux.md)
- Claude Code plugin docs (verified 2026-05-21): <https://code.claude.com/docs/en/plugins>
- Conversation context: [conversation-log/2026-05-21.md](../../archive/docs/conversation-log/2026-05-21.md), thread "Install path scope"

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-05-21 | the user | All three approved (OQ-2 in requirements.md) |
