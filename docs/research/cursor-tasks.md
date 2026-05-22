---
date: 2026-05-23
topic: Cursor's claude-memory-kit v0.1.0 tasks draft
source: Cursor IDE (cursor-test-memory-kit/tasks.md)
status: complete
informed_adrs: []
tags:
  - cursor
  - competitive-analysis
  - spec-generator-comparison
  - effort-estimation
  - mvp-shape
---

# Research: Cursor's claude-memory-kit tasks (verbatim capture)

## Why this research

Cursor's tasks.md is dramatically smaller than ours — 22 hours total vs our ~50 dev-days — and reads as a true MVP build sheet. Worth preserving as the strongest "what if we just shipped less" data point we have.

## Verbatim content

```markdown
# Tasks — memory-kit v0.1.0

Implementation checklist for **after** requirements and design are approved. v0.1.0 documentation deliverable is only `requirements.md`, `design.md`, and this file.

## P0 — Documentation (v0.1.0 deliverable)

| ID | Task | Status |
|----|------|--------|
| P0-1 | Write `requirements.md` | done |
| P0-2 | Write `design.md` | done |
| P0-3 | Write `tasks.md` | done |

## P1 — Schema and init

| ID | Task | Status | Deps |
|----|------|--------|------|
| P1-1 | `pyproject.toml` + package layout | pending | P0 |
| P1-2 | Default `config.yaml` template | pending | P1-1 |
| P1-3 | Markdown templates (scratch, INDEX, fact) | pending | P1-2 |
| P1-4 | `memory-kit init` command | pending | P1-3 |
| P1-5 | `.gitignore` entries for `.memory.local/`, `.memory/.cache/` | pending | P1-4 |

## P2 — Core CLI

| ID | Task | Status | Deps |
|----|------|--------|------|
| P2-1 | Paths + config loader | pending | P1 |
| P2-2 | Fact CRUD + ID allocator | pending | P2-1 |
| P2-3 | Scratch writer + cap enforcer | pending | P2-1 |
| P2-4 | Roll algorithm | pending | P2-3 |
| P2-5 | Digest builder | pending | P2-2, P2-3 |
| P2-6 | CLI: remember, forget, get, search, roll, load, doctor | pending | P2-2–P2-5 |
| P2-7 | Audit log | pending | P2-2 |

## P3 — Hooks

| ID | Task | Status | Deps |
|----|------|--------|------|
| P3-1 | `hook session-start` | pending | P2-5 |
| P3-2 | `hook prompt` (remember/forget) | pending | P2-2 |
| P3-3 | `hook stop` | pending | P2-3 |
| P3-4 | `hook session-end` | pending | P2-4 |
| P3-5 | `hook post-tool` | pending | P2-2 |
| P3-6 | `.claude/settings.json` template | pending | P3-1–P3-5 |
| P3-7 | Windows `memory-kit.cmd` shim | pending | P1-1 |

## P4 — MCP

| ID | Task | Status | Deps |
|----|------|--------|------|
| P4-1 | FTS5 index | pending | P2-2 |
| P4-2 | `memory-kit index --rebuild` | pending | P4-1 |
| P4-3 | Stdio MCP server | pending | P2, P4-1 |
| P4-4 | `.mcp.json` template | pending | P4-3 |

## P5 — Tests and polish

| ID | Task | Status | Deps |
|----|------|--------|------|
| P5-1 | `pytest` unit tests | pending | P2–P4 |
| P5-2 | `memory-kit doctor` | pending | P2 |
| P5-3 | README + coexistence guide | pending | P0 |

---

## v0.1.0 documentation exit criteria

- [x] `requirements.md` covers FR/NFR, acceptance criteria, out-of-scope
- [x] `design.md` covers schema, hooks, MCP, coexistence with auto memory
- [x] `tasks.md` phases P1–P5 with dependencies

## Implementation exit criteria (post-docs)

- [ ] `memory-kit init` in empty repo
- [ ] SessionStart digest under 10k chars
- [ ] `/remember` creates `P-*.md`
- [ ] No writes to Claude auto memory paths
- [ ] `pytest` passes for core modules
- [ ] No writes to Claude auto memory paths
- [ ] `pytest` green

## Estimates

| Phase | Estimate |
|-------|----------|
| P0 | 2h |
| P1 | 3h |
| P2 | 6h |
| P3 | 4h |
| P4 | 4h |
| P5 | 3h |
```

## What we learn from this size

| Cursor total: 22 hours | Ours required-only total: ~50 dev-days |
| --- | --- |
| 22 PR-sized tasks | 36 PR-sized tasks |
| 5 phases (P0..P5) | 7 groupings (Layer 1..6 + cross-cutting) |
| No optional surface | Layers 5 + 6 explicitly optional |

The factor-of-20 difference comes down to:

1. **No LLM auto-extract subagent** (we have T-020 + supporting infrastructure)
2. **No vector search / memsearch / Milvus** (we have optional Layer 5)
3. **No cron** (we have optional Layer 6 + lazy fallback)
4. **No content-addressed IDs / canonicalize lib** (we have T-005 with Node+Python parity)
5. **No conflict queue / review queue / Poison_Guard / tombstone discipline**
6. **No cross-OS install CI matrix as a separate task** (Cursor implies but doesn't task it)
7. **No MCP authentication** (we already dropped this)
8. **No CLAUDE.md versioned delimiter block** (we have T-004)

## Decision context for v0.1 scope

User-locked direction (2026-05-22): **architecture-shaped v0.1**, NOT MVP-shaped. Lay foundations once, build on top.

This research note is the audit-trail counterweight: if v0.1 schedule slips badly, Cursor's MVP shape is the documented contraction target.

## Reference

- Source files captured at `C:\Projects\cursor-test-memory-kit\{requirements,design,tasks}.md` (machine-local; Cursor IDE output 2026-05-23).
- Conversation context: [../conversation-log/2026-05-23.md](../conversation-log/2026-05-23.md).
