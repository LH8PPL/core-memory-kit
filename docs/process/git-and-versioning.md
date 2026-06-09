---
process: git-and-versioning
status: active
since: 2026-05-21
related_adrs: [0001-separate-project-not-fork-youtube-to-slide.md, 0004-spec-driven-development-kiro-style.md]
tags:
  - git
  - versioning
  - semver
---

# Process: Git, versioning, and ADR lifecycle

## Branching

For v0.1 development, `main` is the only branch. The repo is a single-developer project with one-Claude-at-a-time discipline.

When v0.1 ships, we may adopt a `main` (stable) + `dev` (next release) split. For now, `main` is dev.

## Commit message conventions

Subject line in the imperative mood, under 70 chars. Body explains the **why**, not the what (the diff shows the what).

```text
<verb>: <noun phrase under 70 chars>

<one or two paragraphs explaining why this change was needed,
not what it changed. The diff already shows what.>

Refs: T-12, ADR-0007  (if applicable)
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

When a commit implements a task from `specs/v0.X/tasks.md`, reference the task ID. When a commit creates or modifies an ADR, reference the ADR.

### Examples

```text
Initial commit: claude-memory-kit

Per-project, in-repo memory system for Claude Code. Two install paths
(script + Claude Code plugin) plus a manual-copy fallback. Cross-OS
prerequisites documented per platform (Windows/macOS/Linux).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

```text
docs: backfill governance documentation

Establishes the docs/ tree with ADRs, process docs, research notes,
source notes, and conversation logs. Captures every decision made
during v0.0.1 development and the planning of v0.1.0, with full
provenance — designed for personal-wiki ingestion.

Refs: ADR-0001..ADR-0008
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

## Versioning (semver)

| Component | Bump on |
|---|---|
| MAJOR (v0 → v1, v1 → v2) | Breaking change to user-facing API: file layout, hook contract, MCP tool surface |
| MINOR (v0.0 → v0.1, v0.1 → v0.2) | New feature, new capability. No breaking change to existing installs |
| PATCH (v0.1.0 → v0.1.1) | Bug fix, documentation, internal refactor |

While in v0.x, MINOR bumps may include cosmetic breaking changes (this is the semver convention for pre-1.0 packages). Each MINOR ships its own `specs/v0.X/` directory.

Tags use the `v` prefix: `v0.0.1`, `v0.1.0`, etc.

## Tag discipline

- Tag every release. Even alpha / pre-release versions.
- Tag annotated (`git tag -a v0.X.Y -m "..."`), not lightweight.
- Push tags explicitly: `git push origin v0.X.Y`.
- Never delete a tag once pushed. Versions are immutable.

## What goes in git, what doesn't

| In git | Out of git (.gitignore) |
|---|---|
| `template/`, `plugin/` source | `template/milvus-deploy/volumes/` (Milvus runtime data) |
| All `docs/` (including conversation logs and research notes) | `*.log`, `*.tmp`, `.extract-*.tmp` |
| All `specs/v0.X/` documents | `node_modules/`, `__pycache__/`, `.venv/` |
| `CHANGELOG.md` (semver-tracked changes) | OS junk (`.DS_Store`, `Thumbs.db`) |
| `LICENSE`, `README.md`, `ARCHITECTURE.md`, `HEALTH-CHECKS.md` | Editor settings (`.vscode/`, `.idea/`) |

`docs/` is in git **on purpose** — it's the project's history and the wiki ingest source. The conversation logs are also in git for the same reason.

## CHANGELOG.md

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. Every release adds a section:

```markdown
## [v0.1.0] — YYYY-MM-DD

### Added
- 6 lifecycle hooks (SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd, Setup)
- Three-tier scope model (user / project / local)
- Content-addressed citation IDs (8-char base32 SHA-256)
- ...

### Changed
- Hook architecture refactored from 2-hook v0.0.1 model
- ...

### Fixed
- N/A for v0.1.0

### Removed
- PreToolUse as primary memory-injection hook (replaced by SessionStart)

### Security
- `<private>` tag handling

[v0.1.0]: https://github.com/LH8PPL/claude-memory-kit/compare/v0.0.1...v0.1.0
```

The CHANGELOG is for **humans reading the diff at a glance**. The full provenance is in `docs/adr/` and `docs/conversation-log/`.

## When to commit during a spec cycle

| Phase | Commit? |
|---|---|
| Drafting `requirements.md` (open questions still open) | **No** — keep as working file |
| `requirements.md` approved, open questions resolved | **Yes** — `docs: requirements.md for v0.X.0` |
| Research outputs land in `docs/research/` | **Yes** as they arrive — `docs: add Option-B research for v0.X.0` |
| Drafting `design.md` | **No** until approved |
| `design.md` approved | **Yes** — `docs: design.md for v0.X.0` |
| Drafting `tasks.md` | **No** until approved |
| `tasks.md` approved | **Yes** — `docs: tasks.md for v0.X.0` |
| Implementing each task | **Yes** per task — `T-NN: <verb> <noun>` |
| Release | **Yes** — `release: v0.X.0`, then tag |

Frequent small commits beat one giant "everything for v0.X" commit. The diff is the audit trail.

## Operating on the repo while inside another project's working directory

The user often runs Claude Code from `c:\Projects\project-b` (primary cwd) while we operate on `c:\Projects\claude-memory-kit`. All git operations on the kit must use the absolute path:

```bash
cd /c/Projects/claude-memory-kit && git <verb> ...
```

Or git's `-C` flag:

```bash
git -C /c/Projects/claude-memory-kit <verb> ...
```

Never assume cwd is the kit — verify with `git -C ... status` first.

## ADR lifecycle (mirror of [adr/README.md](../adr/README.md))

- **proposed** — under discussion. May not merge.
- **accepted** — agreed and load-bearing.
- **superseded** — replaced by a newer ADR. The old ADR remains; `superseded_by:` points to the replacement. Never delete.
- **deprecated** — no longer applies but not formally replaced.

When superseding an ADR, the new ADR must:

- Reference the superseded one in `supersedes:` frontmatter.
- Explain in its Context section why the previous decision is no longer valid.
- Update the superseded ADR's `status:` and `superseded_by:` fields.

## Push discipline

- Push `main` after every meaningful commit. The remote is the backup.
- Push tags immediately after creating them.
- Never `git push --force` on `main`. If a commit needs to be undone, create a new commit that reverts it.
- Force-push is allowed on a developer branch (not yet relevant for v0.1).

## References

- Semantic Versioning 2.0.0: <https://semver.org/>
- Keep a Changelog 1.1.0: <https://keepachangelog.com/en/1.1.0/>
- Conventional Commits (we follow loosely, not strictly): <https://www.conventionalcommits.org/>
- The repo on GitHub: <https://github.com/LH8PPL/claude-memory-kit> (private)
- Current tag: `v0.0.1` — initial baseline before v0.1 work begins
