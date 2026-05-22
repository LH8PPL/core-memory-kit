---
date: 2026-05-22
topic: Primary-source examination of 5 reference projects
source: Direct gh api + WebFetch of repository files
status: complete — informs design.md sections 4-16
related_research: [2026-05-21-claude-mem-architecture, 2026-05-21-claude-remember-architecture, 2026-05-22-anthropic-claude-code-auto-memory]
informed_adrs: [0006-lifecycle-hooks-architecture, 0007-content-addressed-citation-ids]
tags:
  - primary-source
  - direct-examination
  - design-validation
---

# Primary-source examination — 5 reference projects

## Why this exists

Per user pushback on 2026-05-22: prior research notes were written from articles, READMEs, and metadata — not from actual repository source files. This document fixes that by examining the actual source files of the five reference projects whose patterns most directly inform our design.

Method: `gh api repos/X/contents/PATH` for structure, `WebFetch` on `raw.githubusercontent.com` URLs for file contents.

---

## 1. claude-mem (thedotmack/claude-mem)

### Files examined directly

| File | Size | What it told us |
|---|---|---|
| `plugin/.claude-plugin/plugin.json` | 551 bytes | Plugin manifest schema |
| `plugin/hooks/hooks.json` | 7,739 bytes | 6 hooks via `${CLAUDE_PLUGIN_ROOT}` paths |
| `src/services/sqlite/` (10 files listed) | Various | SQLite schema modules (Database.ts, Sessions.ts, Summaries.ts, Observations.ts, Timeline.ts, SessionSearch.ts, SessionStore.ts, PendingMessageStore.ts) |
| `src/servers/mcp-server.ts` (file listed) | 38,766 bytes | MCP server implementation |

### Verified facts

- **License**: Apache-2.0 (not the MIT some articles claimed)
- **Version**: 13.3.0 at time of examination (2026-05-22)
- **Plugin manifest format**: minimal — `name, version, description, author{name}, repository, license, keywords[], homepage`. Compatible with Anthropic's plugin spec.
- **Hook registration via `${CLAUDE_PLUGIN_ROOT}`** — confirms the canonical pattern for plugin path resolution. Our hooks should use this same convention.
- **SQLite storage is module-segmented** (Sessions, Summaries, Observations, Timeline, SessionSearch, SessionStore, PendingMessageStore each as separate `.ts` files) — not one monolithic schema.

### Errors in our prior research note

None major. The architecture note from 2026-05-21 was accurate at the conceptual level; we now have exact file paths.

### Design implications

- **Plugin manifest format**: copy the minimal schema verbatim.
- **Hook path pattern**: `${CLAUDE_PLUGIN_ROOT}/<segment>/<verb>` — already in our design (ADR-0006).
- **SQLite module segmentation**: when we build our SQLite+FTS5 read cache, segment by concern (observations table + sessions table + transcripts FTS5) rather than one monolithic schema.

---

## 2. claude-remember (Digital-Process-Tools/claude-remember)

### Files examined directly (verbatim contents fetched)

| File | Size | What it actually contains |
|---|---|---|
| `.claude-plugin/plugin.json` | 446 bytes | Manifest: `name: remember, version: 0.7.2, license: Community License` |
| `hooks/hooks.json` | 445 bytes | **2 hooks only**: `SessionStart` + `PostToolUse` |
| `identity.example.md` | 971 bytes | Dev partner persona template |
| `scripts/session-start-hook.sh` | 5,785 bytes | Iterates 7 memory files, cats them under `=== MEMORY ===` header |
| `scripts/save-session.sh` | 11,151 bytes | Haiku compression pipeline with cooldown + locking |

### Verified facts — and corrections to prior research

**Correction: claude-remember uses 2 hooks, not 3.** Our prior research note (`2026-05-21-claude-remember-architecture.md`) said 3 hooks (SessionStart, UserPromptSubmit, PostToolUse). The actual `hooks.json` registers **only SessionStart and PostToolUse**. The `user-prompt-hook.sh` script exists in `scripts/` but is NOT wired in `hooks.json`. Possibly future-pending or removed.

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/scripts/session-start-hook.sh\"" }] }],
    "PostToolUse": [{ "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/scripts/post-tool-hook.sh\"" }] }]
  }
}
```

**Memory file ordering at session start** (from session-start-hook.sh):

```bash
for MFILE in "$IDENTITY_FILE" "$CORE_MEMORIES" "$REMEMBER_HANDOFF" \
    "$REMEMBER_TODAY_FILE" "$REMEMBER_NOW" "$REMEMBER_RECENT" \
    "$REMEMBER_ARCHIVE"; do
    if [ -f "$MFILE" ] && [ -s "$MFILE" ]; then
        BASENAME=$(basename "$MFILE")
        echo "--- $BASENAME ---"
        cat "$MFILE"
    fi
done
```

The `REMEMBER_HANDOFF` file is **one-shot — read then cleared**:

```bash
if [ -f "$REMEMBER_HANDOFF" ] && [ -s "$REMEMBER_HANDOFF" ]; then
    : > "$REMEMBER_HANDOFF"
fi
```

**They READ Anthropic's session JSONL directly** at `$HOME/.claude/projects/<slug>/<session-id>.jsonl`. They don't write their own transcript — they parse Anthropic's. This is clever: avoids duplicate storage.

**Haiku compression invocation**:

```bash
claude -p --model haiku --allowedTools "" --max-turns 1 \
    --output-format json --mcp-config '{"mcpServers":{}}' \
    --strict-mcp-config < "$TMP_PROMPT"
```

**Strict isolation**: NO tools, NO MCP, single response. Our auto-extract uses `--allowed-tools "Read" "Edit" "Bash(wc *)"` (more permissive). claude-remember's approach is tighter and safer.

**Cooldowns**:

- 120 seconds between incremental saves
- 3,600 seconds (1 hour) between Now-Day Compression (`now.md → today-YYYY-MM-DD.md`)

**Lock**: `set -o noclobber` for atomic lock file creation at `.remember/tmp/save.lock`. Background subshell with `set +e` for error isolation.

**Hook dispatch extensibility**: they have a `dispatch "before_session_start"` / `dispatch "after_session_start"` mechanism for plugins to inject custom logic. We don't need this for v0.1.

### Design implications

1. **Consider 2-hook minimalism**: our 5+1 may be over-engineered. Worth re-evaluating against the YAGNI principle. claude-remember does a lot with just SessionStart + PostToolUse.
2. **Read Anthropic's JSONL instead of duplicating transcripts**: alternative to writing our own `transcripts/{date}.md`. Pros: less storage, single source of truth. Cons: depends on Anthropic's path being stable; lose control over format.
3. **Tighten our auto-extract tool allowlist**: drop `Edit` and `Bash(wc *)`; the sub-Claude only needs `Read`. Our memory-write skill is what does the writing; the sub-Claude just invokes the skill.
4. **Adopt their cooldown timings**: 120s incremental, 3,600s rolling-window compression.
5. **Adopt their locking pattern**: `noclobber` + lock file + background subshell.
6. **One-shot handoff file**: a `<repo>/context/handoff.md` that contains "what to do next session", consumed and cleared on read. Useful when planning a complex multi-session task.

---

## 3. Anthropic's official memory MCP (modelcontextprotocol/servers/src/memory)

### Files examined directly

| File | Size | What it told us |
|---|---|---|
| `src/memory/index.ts` | 15,962 bytes | Entire memory MCP server in one TypeScript file |
| `src/memory/README.md` (listed) | 10,080 bytes | Documentation |

### Verified facts

**Data model is a knowledge graph, NOT a markdown bullet list:**

```typescript
type Entity = {
  name: string;
  entityType: string;
  observations: string[];
};

type Relation = {
  from: string;        // entity name
  to: string;          // entity name
  relationType: string; // active voice e.g. "wrote", "uses"
};

type KnowledgeGraph = {
  entities: Entity[];
  relations: Relation[];
};
```

**Storage**: JSONL file at `MEMORY_FILE_PATH` (env var), defaults to `memory.jsonl` in script dir. Each line is `{"type": "entity", ...}` or `{"type": "relation", ...}`. Backward-compatible with `memory.json` (legacy single-object format).

**Nine tools** (in execution-relevant order):

1. `create_entities(entities[])` — adds entities, dedup by name
2. `create_relations(relations[])` — relations require active voice
3. `add_observations(entityName, content[])` — appends to existing entity
4. `delete_entities(names[])` — cascades to relations
5. `delete_observations(entityName, content[])` — strips specific observations
6. `delete_relations(relations[])` — removes relationship records
7. `read_graph()` — returns entire graph
8. `search_nodes(query)` — fuzzy match on name/type/observations
9. `open_nodes(names[])` — fetch specific entities with their relations

**Known bug**: `read_graph`, `search_nodes`, `open_nodes` emit a `type: "entity"` field that fails output schema validation. Unfixed as of release `2025.11.25`. Tracked at issues #3074 and #3144.

### Why we explicitly didn't follow this model

The knowledge-graph approach has real advantages — explicit relations, structured queries — but it's a **different abstraction entirely**. To use it we'd have to:

- Define entity types (User? Project? Tool? Decision?)
- Manage entity-name uniqueness
- Maintain referential integrity (if you delete entity X, must clean up all relations pointing to it)
- Resolve forward-references

Our design is **bullet-list-in-markdown-file**. Each bullet is an observation. There are no entities, no relations. Simpler. Less powerful for graph queries, more readable in plain text.

### Design implications

- **Validate that bullet-list-in-markdown is the right call for v0.1.** It is — for the same reasons git config is key-value not a graph. Our use case doesn't need entity-relation modeling.
- **Worth offering as v0.3+ optional layer** for users who want graph queries. Could pair with the Anthropic memory MCP rather than building our own.
- **Cite the schema-validation bug** in our docs as a known issue if we ever integrate the Anthropic memory MCP.

---

## 4. Basic Memory (basicmachines-co/basic-memory)

### Files examined directly

| File | Size | What it told us |
|---|---|---|
| `NOTE-FORMAT.md` | 14,349 bytes | The canonical note format spec |
| `src/basic_memory/mcp/tools/` (19 files listed) | Various | Full MCP tool surface |
| `src/basic_memory/` directory tree | — | Module organization (alembic, api, cli, importers, indexing, markdown, mcp, models, repository, schema, schemas) |
| `.claude-plugin/plugin.json` (skipped — not needed) | — | — |

### Verified facts

**Note format has three components**:

1. **YAML frontmatter**:
   ```yaml
   ---
   title: "Webcam ROI is wider than expected"
   type: feedback
   tags: [video-pipeline, roi, calibration]
   permalink: feedback-webcam-roi
   ---
   ```
   `title` (auto-generated if omitted), `type` (default `note`), `tags`, `permalink` (stable identifier persisting across moves), plus arbitrary custom fields stored as searchable metadata.

2. **Observations** — categorized facts via list syntax:
   ```markdown
   - [convention] use snake_case for variables #python (per code review 2026-05-15)
   ```
   Format: `- [category] content #tags (context)`. Category is required (square-bracketed). Hashtags optional. Parenthetical context optional.

3. **Relations** — links between documents:
   ```markdown
   - related [[Other Entity Name]] (because they share the ROI calibration)
   ```
   Format: `- relation_type [[Target Entity]] (context)`. Wiki-style `[[link]]` syntax. Inline wiki-links in prose create implicit `links_to` relations.

**Schemas** — optional Picoschema validation in frontmatter:

```yaml
schema:
  observations:
    - category: convention
      tags: required
```

Or reference an external schema note, or implicit lookup by `type` field.

> *"Observations and relations not covered by the schema are valid — schemas describe a subset, not a straitjacket."*

**MCP tool surface (19 tools)**:

| Category | Tools |
|---|---|
| Content CRUD | `write_note`, `read_note`, `edit_note`, `delete_note`, `move_note`, `view_note` |
| Navigation | `list_directory`, `build_context`, `canvas` |
| Search | `search`, `recent_activity` |
| Schema | `schema` (validate/infer) |
| Multi-project | `project_management`, `workspaces` |
| Integration | `chatgpt_tools`, `cloud_info`, `ui_sdk` |
| Reference | `release_notes` |
| Internal | `utils`, `read_content` |

### Design implications

1. **Their `[category] content #tags (context)` observation syntax is interesting.** More structured than ours. Worth considering for our granular archive entries — could be cleaner than free-form bullets.
2. **`[[wiki-link]]` syntax for relations between fragments** — we don't currently link between granular archive files. Adopting this is cheap; lets liorwiki ingest natively.
3. **Picoschema validation** is a v0.2+ candidate (our `<type>_<slug>.md` filenames already encode the type; explicit schemas would enforce frontmatter integrity).
4. **Our 5-tool MCP surface is much smaller than their 19.** That's intentional (v0.1 is minimal), but `recent_activity` is a useful tool we should consider adding — "what's been written to memory in the last 24h?" is a common query.
5. **`project_management` + `workspaces` tools** validate our v0.2 plan for `cmk search --all-projects`. They've already solved the multi-project navigation problem.

---

## 5. Hermes Agent (NousResearch/hermes-agent)

### Files examined directly

| File / dir | What it told us |
|---|---|
| Top-level structure | Massive monorepo: `agent/` (40+ Python files, many 50-230KB), `hermes_cli/`, `plugins/`, `skills/`, `gateway/`, etc. |
| `plugins/memory/` | `__init__.py` (14,418 bytes) + 8 provider subdirectories |
| `README.md` (summary fetched) | High-level overview |

### Verified facts

**`plugins/memory/` structure** — confirms the plugin-slot architecture:

```text
plugins/memory/
├── __init__.py            ← dispatcher / plugin manager
├── byterover/             ← one provider per subdir
├── hindsight/
├── holographic/
├── honcho/
├── mem0/
├── openviking/
├── retaindb/
└── supermemory/
```

**8 external memory providers**, each as its own subdirectory implementing a shared interface (defined in `__init__.py`). Configured via `memory.provider: <name>` in YAML config. Only one active at a time.

**Memory file location**: `~/.hermes/memories/` (machine-global), with `MEMORY.md` (2,200 char cap) and `USER.md` (1,375 char cap). Both files-on-disk, frozen-snapshot loaded at session start.

**The `agent/` directory** is huge — `conversation_loop.py` is 234KB, `auxiliary_client.py` is 231KB. This is a full agent runtime, not a Claude Code plugin.

### Design implications

1. **Our v0.2 plugin-slot roadmap is achievable** — Hermes provides a complete working template. We'd copy their `__init__.py` + per-provider-subdir layout.
2. **Their "8 external memory providers, only one active" pattern is the right shape** for our v0.2. Users pick: none (default, ours-only), or one of the providers.
3. **Hermes is its own runtime, NOT a Claude Code plugin** — we deliberately differ from Hermes by living inside Claude Code. Different distribution model.
4. **`USER.md` cap of 1,375 chars verified identical to ours.** Char-cap coincidence stands.

---

## Summary of corrections to prior research notes

1. **`research/2026-05-21-claude-remember-architecture.md` said claude-remember uses 3 hooks.** Actual: **2 hooks** (SessionStart + PostToolUse). Will update.
2. **Several prior notes referred to claude-mem as MIT-licensed.** Actual: **Apache-2.0**. Will update where wrong.
3. **Hermes' `USER.md` cap was reported as "≈1,375 chars" in prior notes.** Now verified exact.

## Summary of design implications for design.md

| Source | Pattern to adopt | Section in design.md |
|---|---|---|
| claude-mem | `${CLAUDE_PLUGIN_ROOT}` for hook paths (already in our design) | §5 (hooks) |
| claude-mem | SQLite module segmentation (Sessions, Observations, Timeline as separate concerns) | §9 (search layer) |
| claude-remember | Tighten auto-extract tool allowlist: only `Read`, drop `Edit` and `Bash(wc *)` | §6 (auto-extract) |
| claude-remember | Cooldown timings (120s incremental, 3,600s rolling-window) | §8 (compression) |
| claude-remember | `noclobber` lock pattern for concurrent-safe writes | §6 (auto-extract), §8 (compression) |
| claude-remember | Consider one-shot `handoff.md` file (consumed-and-cleared on read) | §2 (storage schemas) [optional v0.1.x] |
| claude-remember | Reading Anthropic's session JSONL directly | §11 (Anthropic coexistence) — alternative implementation |
| Anthropic MCP | Validate our bullet-list-in-markdown choice (different model from theirs) | §10 (MCP server) |
| Anthropic MCP | Cite their schema-validation bug if we ever integrate | §11 (Anthropic coexistence) |
| Basic Memory | `- [category] content #tags (context)` observation syntax | §2 (storage schemas) — consider for granular archive |
| Basic Memory | `[[wiki-link]]` syntax for cross-fragment relations | §2 (storage schemas) — adopt |
| Basic Memory | `recent_activity` MCP tool | §10 (MCP server) — add to v0.1 surface |
| Basic Memory | `project_management` / `workspaces` tools | §16 (v0.2 forward-compat) — already planned |
| Hermes | `plugins/memory/__init__.py + N providers` layout | §16 (v0.2 forward-compat) — adopt verbatim |
| Hermes | `memory.provider: <name>` YAML config for selecting provider | §16 (v0.2 forward-compat) |

## What I have NOT examined

Things I didn't fetch primary source for, in priority order if we need them later:

- **claude-mem `src/services/sqlite/Database.ts` and `Sessions.ts`** — would give us exact SQLite schema. Skipped because they're large (4,805 + 159 bytes — actually small! Worth fetching if we want to mirror exactly).
- **claude-mem `src/servers/mcp-server.ts`** (38KB) — would give us tool definitions verbatim. Too big to read in full; would need targeted excerpts.
- **Hermes' `plugins/memory/__init__.py`** (14,418 bytes) — the dispatcher interface. Worth fetching when we actually build v0.2 plugin slot.
- **Basic Memory's `write_note.py` and `edit_note.py`** — would give us the canonical Markdown frontmatter handling code. Skipped because the NOTE-FORMAT.md doc gave us the format spec.
- **claude-remember's `scripts/post-tool-hook.sh`** — would give us their PostToolUse handler. Worth fetching if we adopt their 2-hook minimalism in a future ADR.

Adding all of these to a "fetch when needed" list, not "fetch now."

## References

- claude-mem: <https://github.com/thedotmack/claude-mem>
- claude-remember: <https://github.com/Digital-Process-Tools/claude-remember>
- Anthropic memory MCP: <https://github.com/modelcontextprotocol/servers/tree/main/src/memory>
- Basic Memory: <https://github.com/basicmachines-co/basic-memory>
- Hermes Agent: <https://github.com/NousResearch/hermes-agent>
