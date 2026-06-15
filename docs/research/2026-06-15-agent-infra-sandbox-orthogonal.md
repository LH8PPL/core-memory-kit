---
date: 2026-06-15
topic: agent-infra/sandbox — orthogonal to the kit (ephemeral agent EXECUTION environment, no memory); one positioning insight + a multi-harness data point
source: Repo metadata + README/MCP-surface check — https://github.com/agent-infra/sandbox (Python, 5.1k★, Apache-2.0). NOT cloned: it's a Docker execution sandbox, not a memory system — the MCP-surface confirmation is decisive.
tags: [agent-infra, sandbox, execution-environment, orthogonal, positioning, complementary, Task-50, Task-146, competitive-analysis, negative-result]
---

# agent-infra/sandbox — orthogonal assessment (nothing to borrow; one positioning insight)

> **What it is.** "All-in-One Sandbox for AI Agents" — a single Docker container bundling **Browser + Shell + File + MCP + VSCode Server** so an agent has a safe, all-in-one environment to browse, run shell commands, edit files, and execute code. Python, 5.1k★, Apache-2.0.

> **Verdict: ORTHOGONAL — nothing to use/steal/take.** It is agent **EXECUTION infrastructure** (the environment an agent RUNS IN), not memory/retrieval. No write, no search, no recall, no compression, no persona — no overlap with any kit surface. The cleanest "no" of the five-source review.

## Confirmed it's not a memory system (didn't dismiss on the name alone)

Checked the MCP surface, because "MCP" is in its topics and could in principle have been a memory tool. It is **execution tools only**:

- **Browser**: navigate / screenshot / click / type / scroll
- **File**: read / write / list / search / replace (file ops — NOT memory search)
- **Shell**: exec / create_session / kill
- **Markitdown**: convert / extract_text / extract_images

And explicitly: **"no memory/recall tools, no vector-search, no cross-session memory — a stateless execution environment."** Its only persistence is a within-session unified filesystem (files from the browser are visible to shell/file ops in the SAME session); nothing survives the container.

## The one useful thing it surfaces — POSITIONING (not a borrow)

agent-infra/sandbox is **complementary to the kit, not competitive**, and it crisply articulates the kit's value:

- **The sandbox is stateless by design; the kit is the state.** A user could run Claude Code (with claude-memory-kit installed) INSIDE such a sandbox: the sandbox provides the ephemeral execution environment (browser/shell/file/VSCode), and the kit provides the **persistent, cross-session memory that survives the container being torn down**. The sandbox forgets everything when it stops; the kit's committed `context/` does not. That contrast — *"your sandbox is ephemeral; your memory shouldn't be"* — is a clean one-liner for the kit's pitch.
- This is the same complementary relationship the kit has with any runtime/harness: the kit is memory infrastructure that rides INSIDE whatever environment the agent already has; it never provisions or sandboxes agent execution (that's the host's job — Claude Code, a CI runner, or a container like this).

## Multi-harness data point (feeds the D-157 Task-50 research-revisit gate)

A weak-but-real data point for the v0.4 cross-agent/harness gate ("nearly every project we researched does multi-IDE/agent/harness"): containerized sandboxes are one of the HARNESSES agents run in. The kit's deployment-compatibility question — *does the committed `context/` + the hooks + `cmk` work when the agent runs inside a Docker sandbox?* — is worth one line in the Task-146 (swarm/concurrency) + Task-50 (cross-agent) investigations: the kit is file-based + local, so as long as the project dir is mounted/persisted it should work, but a container that tears down its filesystem would lose `context.local/` + the user tier (the project tier survives if the repo is the mounted volume + committed). Not a task; a compatibility note to verify if/when containerized-agent support is ever on a lane.

## What we would NOT take

- **The Docker-sandbox itself** — provisioning agent execution is explicitly out of the kit's scope (memory infrastructure, not runtime). D-23 (node-only, no-server) + the local-first ethos.
- **Its file MCP tools** — file read/write/search over a sandbox FS is unrelated to memory search over the kit's `context/` archive.

## Net

**No action, no task, no code, no borrow.** Logged for the audit trail + the one durable yield: the **positioning insight** ("the sandbox is ephemeral; the kit is the state" — complementary, not competitive) and a multi-harness compatibility data point for the D-157 Task-50 revisit gate. An honest orthogonal-source result.

## Reference

- Repo: <https://github.com/agent-infra/sandbox> (Python, 5.1k★, Apache-2.0, pushedAt 2026-05-29)
- Relates: Task 50 + D-157 (cross-agent/harness research-revisit gate), Task 146 (swarm/concurrency — containerized harness compatibility), D-23 (node-only/no-server), the kit's positioning (README "what it does").
