---
date: 2026-06-20
topic: Cross-agent adapter seam for Task 50 (v0.4.0) — how the kit installs into agents beyond Claude Code (Kiro first), grounded in a full-corpus multi-agent-install survey + cloned adapter source + kiro.dev primary verification
source: (A) survey of our 66-note research corpus through the multi-agent-install lens; (B) cloned + read adapter source at c:/tmp/x50-clones/{claude-mem,taskmaster,opencode,roo,continue}; (C) kiro.dev primary-source verification pass
tags: [Task-50, cross-agent, cross-ide, adapter, profile, kiro, claude-mem, taskmaster, mcp-registration, hook-wiring, v0.4.0, mutateAgentConfig, agents-md, primary-source-verification]
---

# Research-Revisit Note — Cross-Agent Adapter Seam (Task 50, v0.4.0)

_Synthesized from: (A) a 66-note corpus survey through the multi-agent-install lens, (B) deep-reads of cloned adapter source (claude-mem, Taskmaster, opencode/roo/continue), and (C) a kiro.dev primary-source verification pass. Verification status is called out per claim — convergent third-party evidence is NOT presented as primary._

---

## 1. Did any product in OUR corpus solve the multi-agent adapter problem?

**Honest answer: essentially no — only one (claude-mem) actually installs the three things we install (lifecycle hooks + MCP registration + a managed instruction block) into more than one agent, and even it does so as bespoke-per-agent code, not a clean adapter abstraction. Beyond Taskmaster + claude-mem, the corpus gives us conventions and negative examples, not a reusable mechanism.**

The corpus splits cleanly:

| Bucket | Products | Why they don't solve OUR seam |
| --- | --- | --- |
| **Genuinely multi-agent install** | **claude-mem** | The one real precedent. Single installer + `--ide <agent>` flag, auto-detects each agent's config dir. But the code is bespoke-per-agent (see §2). This is the blueprint we already mapped to `cmk install --ide` (corpus note 2026-05-29, design §16.49/§16.50). |
| **Instruction-file-only multi-tool** | **SpillwaveSolutions/project-memory**, GBrain, OpenClaw | Solve only the instruction-file leg — maintain a managed block in `AGENTS.md` (+ `CLAUDE.md`) so non-Claude tools read the same memory-awareness. No hook-wiring, no per-agent MCP registration. project-memory has no hooks/MCP at all, so it only ever had to solve the easy half. |
| **MCP-connector "multi-agent"** | GBrain, memclaw, gstack-adjacent | "Multi-agent" = any MCP client connects to one standing server. That's a *connector* model (agent talks to a running brain), not an *installer* that wires per-agent lifecycle hooks. Confirms MCP-registration is our most agent-portable leg; hook-wiring is the most agent-specific. |
| **Per-host handcraft (negative example)** | **Tencent** (TencentDB agent memory) | Ships into two hosts (OpenClaw plugin + Hermes Docker) by **hand-building two separate integrations** with host-coupled hooks and its own non-MCP tool surface. This is exactly the per-host-handcraft pattern our seam exists to avoid — a useful negative example, not a blueprint. |
| **Single-agent / core-only** | claude-remember, memory-os, MemPalace, memsearch, Simon-Scrapes, OpenHands, AWS AgentCore, Anthropic Managed-Agents, the cursor/chatgpt/antigravity/kiro design drafts, PAI, ruflo, OKF, agent-infra | Storage/recall/compression internals, or a single-harness (Claude Code) design, or a managed-cloud service keyed on user/team/project not per-agent. No cross-agent install seam. |

**The one adapter-SHAPE validator beyond Taskmaster/claude-mem is OpenHands** (2026-06-15): it runs one immutable core across many runtimes/integrations via thin per-target `*_view.py` adapter files — the canonical "one core + thin per-target adapter" shape, proven at 77k-star scale. But it applies the shape to the *runtime/integration* boundary, not the IDE/agent boundary, and the note itself flags **Taskmaster's per-IDE profiles as the stronger, more direct precedent** for `cmk install --ide`. So OpenHands is a shape-confirmation breadcrumb, not a mechanism.

**Net:** the field has NOT solved core-identical-plus-thin-per-agent-wiring as a clean abstraction. claude-mem has the breadth but bespoke code; Taskmaster has the cleanest per-target *profile* model; the rest give conventions (`AGENTS.md`), invariants (fail-open inject), and one negative example (Tencent). **The true per-agent adapter is still ours to design** — but we are NOT designing from zero: the data/code split (§2) is well-supported.

---

## 2. The convergent adapter seam (recommended architecture)

The single most important lesson, from the claude-mem deep-read: **do NOT build a uniform `Installer` base class/interface across agents.** claude-mem tried exactly once (an `McpInstallerConfig` data-record + factory) and it only held for the four agents whose config is flat-JSON-with-one-servers-key. The moment an agent differed in *format* (Goose YAML) or *mechanism* (Codex plugin-marketplace, Cursor whole-file overwrite, Gemini event-mapping), the shared abstraction broke and the code fell back to bespoke. An `Installer.install()` interface would be a leaky abstraction whose bodies share zero code.

**Put the seam at the config-write PRIMITIVE, not at the installer.** What actually generalizes is the idempotent, touch-only-our-keys, atomic config mutation — which claude-mem re-implements ~6 times with **inconsistent rigor** (Gemini surgical; Cursor clobbers the whole `hooks.json`; the JSON-parse-error path *discards* user config). That rigor-drift IS the bug class, and it maps onto kit rules already on the books: "touch-only-our-keys" = the kit's marker-block byte-preservation invariant; "refuse to write on corrupt JSON" (claude-mem GeminiCliHooksInstaller.ts:88) = the kit's safe-write/poison-guard discipline applied to third-party files.

### Recommended shape

**(a) One shared, tested `mutateAgentConfig` primitive** — parameterized by `(path, format: json|yaml|toml, keyPath, entry, {merge|replace})`:
- round-trips JSON / YAML / TOML preserving every key it didn't write,
- refuses to clobber on parse error (don't recreate — abort + report, the Gemini pattern, NOT the Cursor pattern),
- is `changed`-boolean idempotent (Codex's pattern → "already enabled").
This is where the kit's existing strengths belong: atomic writes, marker-block preservation, composition-verification discipline.

**(b) Per-agent metadata stays DATA, not classes.** claude-mem's `McpInstallerConfig` record was the right shape; extend it. Cross-referenced with Taskmaster's `createProfile`, a kit per-agent profile declares:

| Field | Purpose | Taskmaster analog | claude-mem evidence |
| --- | --- | --- | --- |
| `name` / `displayName` | keystone (drives dir/file derivation) | `name` (load-bearing) | — |
| `instructionFile` | path + filename of the managed block | `fileMap` | `.cursor/rules/*.mdc`, `GEMINI.md`, `AGENTS.md` (Codex) |
| `mcpConfigPath` | MCP config file location | `mcpConfigName` → path | `.cursor/mcp.json`, `~/.github/copilot/mcp.json`, … |
| `mcpFormat` | `json` \| `yaml` \| `toml` \| `none` | (JSON only) | JSON / YAML (Goose) / TOML (Codex) / none (Gemini) |
| `mcpServersKey` | top-level key name | (fixed) | `mcpServers` vs **`servers`** (Copilot is the odd one) |
| `hookMechanism` | `settings-merge` \| `dedicated-file` \| `plugin-marketplace` \| `none` | `onAdd`/`onPostConvert` | Gemini merge / Cursor file / Codex marketplace / MCP-only |
| `eventMap` | abstract lifecycle event → agent's event name | — (claude.js hook) | `GEMINI_EVENT_TO_INTERNAL_EVENT`; Kiro `agentSpawn`/`stop` |
| `nodeCommand` | `'node'` literal vs absolute path | — | Cursor hardcodes `'node'`; shared factory uses absolute |

**(c) "Uninstall strips only our keys / preserves siblings" is a TESTED invariant** — the kit's over-mutation guard ("seed N, mutate one, assert N-1 remain") applied to agent settings files. claude-mem has NO test asserting Cursor's whole-file overwrite preserves a user's pre-existing hooks (it doesn't). That gap is exactly what the kit's over-mutation rule exists to catch.

### Keep vs drop from Taskmaster's `createProfile` (we're markdown-canonical)

| Field | Decision | Why |
| --- | --- | --- |
| `name` | **KEEP** | Non-negotiable keystone the factory derives from. |
| `profileDir` / `rulesDir` | **KEEP, set to `'.'`** (codex/claude pattern) | Memory lands in repo root / `context/`, not `.${name}/rules`. |
| `fileMap` | **KEEP** | Explicit canonical-markdown source→target placement. |
| `includeDefaultRules: false` | **KEEP (critical)** | Default `true` injects Taskmaster's five `.mdc` cursor-rule files — the kit wants none. |
| `mcpConfigName` / `mcpConfig` | **KEEP** | The kit registers an MCP server. |
| `onAdd`/`onRemove` | **KEEP the PATTERN, not the code** | claude.js's idempotent `CLAUDE.md` append/strip == our `claude-memory-kit:start/:end` byte-preserving install/uninstall. |
| `fileExtension`/`targetExtension` | **DROP** | Source+target both `.md`; setting neither emits zero `.mdc`-rewrite rules. Do NOT set `targetExtension:'.mdc'` (that's Cursor's outlier). |
| `customReplacements`/`toolMappings` | **DROP** | These rewrite Taskmaster's cursor-authored rule bodies. We ship our own authored markdown — dead weight. |
| `supportsRulesSubdirectories` | **DROP** | Cursor-only `taskmaster/` nesting. |
| `url`/`docsUrl` | **DROP or set to repo URL** | Only feed text-replacement regexes we don't use. |

**Net kit profile** ≈ codex's minimalism + claude's `CLAUDE.md` hook:
```js
createProfile({
  name: 'kiro',
  displayName: 'Kiro',
  profileDir: '.', rulesDir: '.',
  includeDefaultRules: false,          // skip the .mdc bundle
  mcpConfigName: '.kiro/settings/mcp.json',
  mcpServersKey: 'mcpServers',
  fileMap: { /* canonical .md sources → .kiro/steering/ target */ },
  eventMap: { sessionStart: 'agentSpawn', turnEnd: 'stop' },
  hookMechanism: 'agent-config-json',  // hooks live in .kiro/agents/<name>.json
  onAdd, onRemove                      // marker-block steering-file install/uninstall
})
```

**Scope discipline (from opencode/roo/continue read):** do NOT registry-ize the agent matrix today. opencode's registry-of-data-rows pays off at N≈75 homogeneous rows; our matrix is single-digit and each entry is genuinely different. Premature registry-ization is the over-engineering anti-pattern. The data/code split is the *discipline* to adopt (matrix as data, code only for genuine per-row quirks); the infrastructure is not worth building at today's size.

---

## 3. Per-agent integration taxonomy

The claude-mem insight: agents fall into integration **TYPES**, and the type dictates which legs the adapter wires.

| Type | What gets wired | Example agents | claude-mem mechanism |
| --- | --- | --- | --- |
| **native-hooks + MCP** (full) | settings-merge hooks + MCP reg + instruction file | Claude Code; **Kiro (CLI agent-config)** | gold-standard key-scoped registration |
| **hooks (dedicated file) + context** | whole `hooks.json` + context `.mdc` | Cursor | dedicated-file overwrite (the fragile one) |
| **hooks (settings-merge) + context** | merge into shared `settings.json` by name-key | Gemini CLI | surgical name-keyed merge |
| **plugin-marketplace** | shell out to agent's own plugin CLI; hooks ship in plugin payload | Codex | `codex plugin marketplace add` + TOML enable flags |
| **MCP-only** | MCP server + a context markdown placeholder; **no hooks** | Copilot CLI, Antigravity, Roo Code, Warp, Goose | data-record + shared factory ("transcript capture not available") |
| **instruction-file-only** | managed block in `AGENTS.md`/`CLAUDE.md`; no hooks, no MCP | project-memory predecessor; the AGENTS.md breadth rung | manual markdown |

**Mapping the next few targets:**

- **Kiro → native-hooks + MCP (full).** Target the **CLI agent-config hook system** (`agentSpawn` + `stop` inside `.kiro/agents/<name>.json`), NOT the IDE Agent Hooks surface. MCP via `.kiro/settings/mcp.json` (`mcpServers`). Instruction block via `.kiro/steering/` with `inclusion: always`. (See §4.)
- **Cursor → hooks(dedicated-file) + MCP.** `.cursor/mcp.json` (`mcpServers`), dedicated `hooks.json`, `.cursor/rules/*.mdc` context. **Adopt the surgical-merge fix, not claude-mem's whole-file clobber.**
- **Codex → plugin-marketplace.** Likely defer — driving an external CLI + TOML surgery is the highest-effort, lowest-reuse integration; AGENTS.md gives partial reach for free.
- **Gemini CLI → hooks(settings-merge) + context.** Name-keyed merge into `~/.gemini/settings.json`; `GEMINI.md` context. MCP not handled by claude-mem's file — verify separately.
- **Long-tail (Copilot/Warp/Roo/Antigravity) → MCP-only.** Cheapest: data-record + shared MCP-write primitive, no hook-wiring. Good "breadth without depth" tier.

---

## 4. Kiro primary-source verification table

_Verified against kiro.dev primary docs (verification pass C). Convergent/third-party claims are flagged as such — NOT presented as primary._

| Convention | Claim | Status | Source URL |
| --- | --- | --- | --- |
| Steering — workspace | `.kiro/steering/` (workspace root) | **VERIFIED** | kiro.dev/docs/steering/ |
| Steering — global | `~/.kiro/steering/` (cross-workspace) | **VERIFIED** | kiro.dev/docs/steering/ |
| Inclusion modes | `always` (default), `fileMatch`+`fileMatchPattern`, `manual` (`#name`) | **VERIFIED** | kiro.dev/docs/steering/ |
| Inclusion — 4th mode | **`auto`** (requires `name`+`description`, auto-includes on description match) | **VERIFIED — correction; original claim missed it** | kiro.dev/docs/steering/ |
| MCP — workspace | `.kiro/settings/mcp.json`, key `mcpServers` | **VERIFIED** | kiro.dev/docs/mcp/configuration/ |
| MCP — user | `~/.kiro/settings/mcp.json` | **VERIFIED** | kiro.dev/docs/mcp/configuration/ |
| MCP — per-server fields | `command`(req), `args`(req), `env`, `disabled`, `autoApprove`, **+`disabledTools`**; remote uses `url`/`headers`/`oauth` | **VERIFIED (+additions)** | kiro.dev/docs/mcp/configuration/ |
| MCP — secrets | docs recommend `${ENV_VAR}` over hardcoded secrets | **VERIFIED** (aligns with Poison_Guard) | kiro.dev/docs/mcp/configuration/ |
| **CLI agent hooks — location** | hooks live in `.kiro/agents/<name>.json` (workspace) / `~/.kiro/agents/<name>.json` (global), NOT a standalone file | **VERIFIED** | kiro.dev/docs/cli/custom-agents/configuration-reference/ |
| **CLI hooks — shape** | top-level `"hooks"` object, arrays keyed by trigger; entry `{command, matcher?}` | **VERIFIED** | kiro.dev/docs/cli/custom-agents/configuration-reference/ |
| **CLI hooks — triggers** | `agentSpawn`, `userPromptSubmit`, `preToolUse`(can block), `postToolUse`, `stop` | **VERIFIED** | kiro.dev/docs/cli/custom-agents/configuration-reference/ |
| Session-start inject | → **`agentSpawn`** ("agent is initialized") | **VERIFIED — ports cleanly** | configuration-reference/ + cli/hooks/ |
| Turn-end capture | → **`stop`** ("assistant finishes responding"); can return `{"decision":"block"}` on STDOUT | **VERIFIED — ports cleanly** | configuration-reference/ + cli/hooks/ |
| IDE Agent Hooks — path/format | original claim `.kiro/hooks/*.kiro.hook` JSON | **UNVERIFIED — wrong system; primary docs silent on storage path/extension** | kiro.dev/docs/hooks/types/ (omits storage) |

**Biggest composition RISK (the headline finding):** **Kiro has TWO hook systems and only ONE fits.** The kit must target **CLI agent hooks** (`agentSpawn` + `stop`, defined inside `.kiro/agents/<name>.json`) — NOT the IDE "Agent Hooks" surface. The IDE surface is file-event-centric (`File Create/Save/Delete`, plus a turn-level `Agent Stop`/`Prompt Submit`), has **no documented session-start (`agentSpawn`-equivalent) trigger**, and **no documented on-disk format/path** in primary docs. Building against `.kiro/hooks/*.kiro.hook` (the original claim's encoding) would mean building against an unverified format on the wrong system.

**Does Kiro have SessionStart-inject + turn-end-capture equivalents?** **Yes — on the CLI agent-hook surface.** `agentSpawn` = SessionStart-inject; `stop` = turn-end-capture. The kit's whole inject-at-start / capture-at-turn-end model ports cleanly to that surface, and the composition risk the prompt feared (file-events-only) disappears once we target CLI hooks. It RE-APPEARS only if we mistakenly target IDE Agent Hooks.

---

## 5. AGENTS.md as a cheap breadth rung

**Worth emitting — yes, as a one-artifact cross-tool reach for the instruction-file leg only.** It does NOT cover hook-wiring or MCP registration.

Corpus convergence (NOT primary verification of any single tool's reader — these are convergent third-party observations from our notes):
- **project-memory predecessor** maintains a managed block in BOTH `CLAUDE.md` and `AGENTS.md` so non-Claude tools (Cursor, etc.) read the same memory-awareness.
- **GBrain** ships both `CLAUDE.md` and `AGENTS.md` (independent convergence on the agent-readable-doc pattern).
- **OpenClaw** uses `AGENTS.md` as its operating-instructions file (loaded main + subagent).
- **Codex** (claude-mem) writes a tagged section into `~/.codex/AGENTS.md` (now legacy/being removed — a caution: a tool can move off it).
- The skills-survey note: the whole field **avoids the instruction-file-injection problem** by delivering capability via skills+hooks (runtime artifacts); our CLAUDE.md-append is "the outlier nobody else does."

**Recommendation:** emit a thin managed `AGENTS.md` block (same `claude-memory-kit:start/:end` byte-preserving machinery, only the *file location* changes) as the breadth rung for tools we haven't built a full adapter for. Per-agent specific files (`CLAUDE.md`, Kiro steering, `.cursorrules`) become thin shims that can point at it. **Caveat:** don't over-invest — Codex moving *off* AGENTS.md shows the convention is unstable, and we have NOT primary-verified which tools currently read `AGENTS.md` at runtime. Treat it as cheap reach, verify per target before claiming it works.

---

## 6. Recommended Task 50 build plan (v0.4.0)

Ordered to front-load the shared primitive (highest reuse) and gate on live verification (the kit's "live-test every task" rule):

1. **`mutateAgentConfig` primitive (shared, first).** `(path, format: json|yaml|toml, keyPath, entry, {merge|replace})`. JSON first (covers Kiro + Cursor + Gemini + the MCP-only long tail); YAML/TOML deferred until an agent needs them. Refuse-on-parse-error (Gemini pattern). `changed`-boolean idempotent. **Over-mutation test (binding kit rule): seed N sibling servers/hooks, mutate one, assert N-1 untouched** — the exact test claude-mem lacks. Door-2 (State) + Door-4 (Observability/audit) pinned.
2. **Per-agent profile descriptor (data shape).** Implement the §2(b) record + the `createProfile`-style factory with kit defaults (markdown-canonical: `includeDefaultRules:false`, `.md`=`.md`, profileDir `'.'`). No classes.
3. **Adapter parity validator** — `scripts/validate-agent-adapter-parity.mjs` (sibling of the existing validators; the drift-discipline neither claude-mem nor mempalace had). Asserts every supported agent wires the same legs declared by its TYPE (full vs MCP-only vs instruction-only), both directions. Wire into `npm test`.
4. **Kiro profile (first concrete agent).** TYPE = native-hooks+MCP-full. Steering block → `.kiro/steering/` (`inclusion: always`); MCP → `.kiro/settings/mcp.json` (`mcpServers`); hooks → `.kiro/agents/<name>.json` with `eventMap {sessionStart:'agentSpawn', turnEnd:'stop'}`. Marker-block install/uninstall via `onAdd`/`onRemove`.
5. **AGENTS.md breadth rung** — emit the managed `AGENTS.md` block as the instruction-only fallback tier (§5).
6. **`cmk install --ide <agent>` routing** — switch/dispatch over profiles (claude-mem's `makeIDETask` shape — a switch, not polymorphism, is correct here). Default `claude-code`; `--ide kiro` selects the Kiro profile. Each route must be COMPLETE alone (fix the kit's current two-mandatory-step npm+/plugin wart — design §16.49).
7. **Live verification at build time (binding "live-test every task"):**
   - Install into a throwaway Kiro workspace (`MEMORY_KIT_USER_DIR=<tmp>`), assert all three legs land in the verified paths.
   - **Highest-uncertainty live checks (flag for manual session — a one-shot CLI can't reach these):**
     - **Hook event model:** does `agentSpawn` actually fire an inject and `stop` actually fire a capture in a real Kiro CLI session? (Verified in *docs*; NOT yet exercised live.)
     - **Transcript format:** where does Kiro store turn transcripts, and in what shape? The kit's compress/extract path hardcodes Claude-Code touchpoints (`env -u CLAUDECODE`, `~/.claude/projects/<slug>/<session>.jsonl` — corpus note 2026-05-25). **This must be parameterized per agent and is UNVERIFIED for Kiro** — primary docs surveyed did not cover transcript-on-disk format. Highest-risk unknown in the whole port.
   - Record live results in the Task 50 DECISION-LOG entry; do NOT claim "verified" for the hook-firing or transcript layers until exercised.

**Sequencing note:** steps 1-3 are the reusable spine (build + test once); steps 4-6 are per-agent thin wiring; step 7 gates the cut. Codex (plugin-marketplace) and YAML-config agents (Goose) are explicitly out of v0.4.0 scope — highest effort, lowest reuse; revisit when an agent demands them.

---

## 7. Open risks / what we could NOT verify

Stated plainly — convergent third-party is NOT primary:

1. **Kiro transcript format is UNVERIFIED (highest risk).** No primary doc surveyed states where Kiro stores turn transcripts or their shape. The kit's extract/compress path currently hardcodes Claude-Code transcript touchpoints; porting REQUIRES this be parameterized, and we don't yet know Kiro's values. Must be discovered live during build (step 7).
2. **Kiro IDE Agent Hooks on-disk format is UNVERIFIED.** Primary docs are silent on storage path/extension. The original `.kiro/hooks/*.kiro.hook` claim is unconfirmed AND points at the wrong (file-event) system. We sidestep this by targeting CLI agent hooks — but if a future need pulls us toward the IDE surface, that format is an unknown.
3. **Hook firing is doc-verified, NOT live-verified.** `agentSpawn`→inject and `stop`→capture are confirmed in Kiro's CLI docs but have NOT been exercised in a real session. Treat as "should port" until step-7 live test, not "verified."
4. **AGENTS.md runtime readership is convergent-only.** We have multiple notes showing tools emit/read `AGENTS.md`, but NO primary verification of which tools currently load it at runtime, and Codex is *moving off* it. Cheap to emit; verify per target before claiming reach.
5. **Gemini/Codex MCP registration not fully characterized.** claude-mem's Gemini installer does hooks+context but no MCP write in the file read; Codex routes MCP via plugin-marketplace. If we add those agents, their MCP legs need their own primary-source pass.
6. **claude-mem rigor-drift is the inherited-bug-class warning, not a tested guarantee.** Their per-agent merge mechanics vary (surgical → whole-file-clobber). We're adopting the *good* patterns (Gemini surgical merge, Codex `changed`-boolean) and explicitly rejecting the bad (Cursor clobber, JSON-error-recreate) — but that's our design choice, not something the corpus proved safe.
7. **"One core + thin per-target adapter" is shape-validated (OpenHands, basic-memory swappable-transport), not mechanism-proven for the IDE/agent boundary.** No surveyed product proved core-identical-plus-thin-per-agent-wiring at the agent-harness boundary specifically. We're applying a validated shape to a boundary nobody in the corpus has cleanly solved — design from first principles, gate on live tests.

---

_Provenance: corpus survey (66 notes, batches 1-6); cloned-source deep-reads at `c:/tmp/x50-clones/{claude-mem,taskmaster,opencode,roo,continue}` (file:line citations inline above); kiro.dev primary-source pass (URLs in §4). Internal anchors confirmed present: design §16.49/§16.50, ADR-0012 (`docs/adr/0012-npm-publish-name-and-cross-agent-future.md`), D-157 (Task-50 research-revisit gate)._