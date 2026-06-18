---
id: P-FJZFLaP9
type: project
title: adopt-third-party-skills-via-installer-personal-tier
created_at: 2026-06-18T07:52:53Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: e8c1a43513bd48ea670c8659ae0fcca6422507f4697cd911c53b35b04ec004ab
related: [follow-the-doc-procedure-route-dont-narrate]
---

Adopt third-party agent skills (e.g. mattpocock/skills) via their OWN installer to the PERSONAL tier (`~/.claude/skills/`), NOT by hand-copying into the project's `.claude/skills/`. Personal-tier skills auto-discover in every project (no per-project config, no restart), stay untouched upstream (no fork to maintain), and never get gitignored-and-lost. The model invokes them automatically on their own well-written `description` field — do NOT rewrite the author's descriptions. Hooks CANNOT invoke a skill (primary source: docs — "skills are not directly callable"); the most a hook does is inject additionalContext that nudges. CLAUDE.md naming a skill is only soft semantic reinforcement, not a trigger. So the kit's own skills (memory-write/memory-search, scaffolded by `cmk install`) stay project-local; general dev-tooling skills go personal-tier via the installer.

**Why:** This session botched it twice: first hand-copied 6 of a 33-skill interdependent system into the gitignored project `.claude/skills/` (missing the installer, CONTEXT.md, sibling skills, the user-invoked grill-me entry points), then I judged them worthless WITHOUT reading them. Primary-source research (Claude Code skills+hooks docs + mattpocock's writing-great-skills + README) showed the correct model: installer → personal tier → auto-discovery → author's descriptions do the triggering. The user: "dont do it manually you are suppose to use the installer" and "read the readme for fuck sake."

**How to apply:** For a general dev-tooling skill set: run the author's installer (e.g. `npx skills@latest add mattpocock/skills`) — it's INTERACTIVE and a global-machine action, so the USER runs it (don't script it non-interactively / don't hand-copy). Pick the skills + Claude Code + global scope from the menu; run any `/setup-*` skill the README requires (it configures CONTEXT.md / issue-tracker / ADR layout the engineering skills read). For the KIT's own skills, keep using `cmk install` (project tier). Never hand-edit or rewrite an upstream skill's description.
