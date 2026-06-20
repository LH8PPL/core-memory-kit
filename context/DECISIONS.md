# Decisions

> Append-only decision journal — every decision the kit captured, in order, with its why.
> Maintained by claude-memory-kit (`cmk digest`). Superseded/retracted entries stay (the trail is the point).

<!-- decision:P-ZPU3YLGH -->
### embedder ladder policy
**When:** 2026-06-10 · **Fact:** `P-ZPU3YLGH`
**Why:** MTEB rankings don't cover our short-fact corpus; the user prefers bigger-and-reliable over small-and-flaky, so the benchmark decides, not vibes (D-105)

<!-- decision:P-Aa22MJAC -->
### semantic backend: sqlite-vec primary, zvec fallback
**When:** 2026-06-10 · **Fact:** `P-Aa22MJAC`
**Why:** sqlite-vec puts vectors inside the SQLite index the kit already runs (one store, design 9.3.1 fit); zvec is embedded+Node+Windows but its bindings are only ~May-2026 old

<!-- decision:P-MHKMPLCR -->
### public-repo memory policy
**When:** 2026-06-10 · **Fact:** `P-MHKMPLCR`
**Why:** transcripts and session logs carry raw dev-conversation content (name-privacy class), so they stay machine-local here; a normal private project commits them (D-108 deviation)

<!-- decision:P-2THQQ9UU -->
### Degradation Messaging Pattern
**When:** 2026-06-10 · **Fact:** `P-2THQQ9UU`
**Why:** Users need to understand why behavior changed and what they can do. This is the UX standard for degradation in this project.

<!-- decision:P-N9BGGaK6 -->
### Transient Failure Retry Strategy
**When:** 2026-06-10 · **Fact:** `P-N9BGGaK6`
**Why:** A single transient delay can cause false negatives; 5 seconds is low-cost. Distinguishing jitter from real degradation prevents flaky CI while preserving signal for real b

<!-- decision:P-CBDN7KXQ -->
### User validates pragmatic retry-with-wait approach for transient failures ("maybe
**When:** 2026-06-10 · **Fact:** `P-CBDN7KXQ`

<!-- decision:P-QXDNaC5U -->
### v0.3.0 is BUILD-COMPLETE (2026-06-10): Tasks 46/125/124/75(all)/104(all) shipped
**When:** 2026-06-10 · **Fact:** `P-QXDNaC5U`

<!-- decision:P-MHCAaYVG -->
### Cut-Gate Testing Guide (Manual Release QA)
**When:** 2026-06-10 · **Fact:** `P-MHCAaYVG`
**Why:** Encodes hard-won lessons (D-84, v0.2.0, Task-75) into repeatable process; prevents regression and avoids known gotchas; respects user's time with clear estimates and scope boundaries.

<!-- decision:P-a5W95QXS -->
### This file (docs/process/cut-gate.md) is their manual live-test guide for release
**When:** 2026-06-10 · **Fact:** `P-a5W95QXS`

<!-- decision:P-TaHaDQV7 -->
### B5/B7 Probe Footgun — settings.json Wholesale Overwrite
**When:** 2026-06-10 · **Fact:** `P-TaHaDQV7`
**Why:** Running B5/B7 in a working directory (not throwaway) corrupts configuration.

<!-- decision:P-VNH3PTEL -->
### Task 124 — Auto-Reindex for cmk forget Command
**When:** 2026-06-10 · **Fact:** `P-VNH3PTEL`
**Why:** Eliminates manual bookkeeping in memory management workflows; reduces error surface.

<!-- decision:P-R5B4C5NR -->
### Authority Preamble Is the Key Behavioral Lever in Memory Injection
**When:** 2026-06-10 · **Fact:** `P-R5B4C5NR`

<!-- decision:P-TDMC9ZWE -->
### Convergent Design Validation — External System Mirrors Kit Architecture
**When:** 2026-06-10 · **Fact:** `P-TDMC9ZWE`
**Why:** Independent validation of the design reduces architectural risk and confirms the waterfall pattern is sound. Proof point for stakeholders and defense against mono-search proposals.

<!-- decision:P-JGNBLDR3 -->
### Embedding Model Trade-off: bge-base vs bge-m3 (Benchmarked Choice)
**When:** 2026-06-10 · **Fact:** `P-JGNBLDR3`
**Why:** Model selection must be task-specific. bge-m3 is not universally better — it underperforms on the kit's exact retrieval challenge. The benchmark (D-109) grounded this choice in data, not vibes.

<!-- decision:P-aA5S5S2U -->
### User confirmed companion project approach for Task 127 aligns with kit philosoph
**When:** 2026-06-10 · **Fact:** `P-aA5S5S2U`

<!-- decision:P-NFJFMJTT -->
### User prefers rapid execution ("do it, why wait?" and "why not just do it now?" s
**When:** 2026-06-10 · **Fact:** `P-NFJFMJTT`

<!-- decision:P-FHA3DTCB -->
### Semantic Search: Opt-In Dependency, Default-On Behavior
**When:** 2026-06-10 · **Fact:** `P-FHA3DTCB`
**Why:** Project aims to be lightweight (supporting users who only want markdown memory) while offering excellent UX to those who want semantic search. Balances these constraints via a design principle: dependency opt-in, behavior default-on.

<!-- decision:P-BDJHESCB -->
### CHANGELOG Script Assertion — Non-Unique Anchor Gotcha
**When:** 2026-06-11 · **Fact:** `P-BDJHESCB`
**Why:** Silent script failures are easy to miss in automated workflows; this is a recurring gotcha.

<!-- decision:P-CL9DBDJK -->
### Stub Command Removal — Five-Piece Pattern
**When:** 2026-06-11 · **Fact:** `P-CL9DBDJK`
**Why:** Stub deletions touch multiple locations across the codebase; recording the pattern prevents incomplete removals.

<!-- decision:P-ULTaWK4B -->
### Release Gate Structure (v0.3.0)
**When:** 2026-06-11 · **Fact:** `P-ULTaWK4B`
**Why:** D3's promotion to required blocker is a recent change; the next release cycle must respect this gate structure.

<!-- decision:P-ZQLQ65UP -->
### Session 2026-06-11 closed fully shipped: PRs #159 (sessions searchable), #160 (d
**When:** 2026-06-11 · **Fact:** `P-ZQLQ65UP`

<!-- decision:P-WK53SJZ5 -->
### Carefully reviews changes for unintended scope loss. This scrutiny identified a
**When:** 2026-06-11 · **Fact:** `P-WK53SJZ5`

<!-- decision:P-MRWY2C43 -->
### Cut Gate Must Test Full Recall Ladder
**When:** 2026-06-11 · **Fact:** `P-MRWY2C43`
**Why:** The cut-gate is the kit's comprehensive health check; every subsystem must be proven to work end-to-end. Gaps in coverage may be invisible in a summary diff.

<!-- decision:P-7L3FTZ3Y -->
### Prefers comprehensive, full end-to-end test coverage. Concerned that changes shi
**When:** 2026-06-11 · **Fact:** `P-7L3FTZ3Y`

<!-- decision:P-Pa5RBNQ4 -->
### Release Git Choreography: Memory, Release, Tag (in order)
**When:** 2026-06-11 · **Fact:** `P-Pa5RBNQ4`
**Why:** Keeps the tree clean; release commits reflect versioning, not session metadata. Memory churn is incidental to development, not part of the release artifact.

<!-- decision:P-VHMVDFZP -->
### The kit NEVER runs git on the user's behalf — settled product position, user-con
**When:** 2026-06-11 · **Fact:** `P-VHMVDFZP`
**Why:** Hooks running git would race with the user's own staging/rebases and create per-turn commit noise; on public repos, reviewing the memory diff before commit IS the privacy gate (facts about the user would otherwise publish sight-unseen). The user: 'i wouldnt want to do git commands for people automaticly.'

<!-- decision:P-VC4UGJTP -->
### Does not want Claude to automatically execute git commands; prefers explicit use
**When:** 2026-06-11 · **Fact:** `P-VC4UGJTP`

<!-- decision:P-L6J7QRDL -->
### Automation Boundary Principle for claude-memory-kit
**When:** 2026-06-11 · **Fact:** `P-L6J7QRDL`
**Why:** Every auto-committing tool eventually has the "it committed something I didn't want" problem. Memory systems have observer-effect dynamics — discussing the system changes it. The correct gate is human review before publication, not automation of the user's authorship surface.

<!-- decision:P-aLPJJGFL -->
### Separate Memory Captures from Release Commits
**When:** 2026-06-11 · **Fact:** `P-aLPJJGFL`
**Why:** Release commits should show only what went into the release — when auditing `release: vX.Y.Z` later, the commit should be uncluttered and reviewable as a pure version bump. Accumulated memory captures muddy that history.

<!-- decision:P-674Q5D5M -->
### Changes since version 0.2.3 appear to have introduced failures in memory kit
**When:** 2026-06-11 · **Fact:** `P-674Q5D5M`

<!-- decision:P-E2GNU77L -->
### Composition Bug Pattern in claude-memory-kit
**When:** 2026-06-11 · **Fact:** `P-E2GNU77L`
**Why:** Composition failures hide in unit-green suites; requires end-to-end Stop-hook chain testing (capture → detached spawn → live extraction) to surface

<!-- decision:P-L4Q72B3Y -->
### MEMORY.md scratchpad still contains only example bullets instead of populating w
**When:** 2026-06-11 · **Fact:** `P-L4Q72B3Y`

<!-- decision:P-MZDaYRWX -->
### Requesting complete re-verification: check previous test gate outputs (gate7), r
**When:** 2026-06-11 · **Fact:** `P-MZDaYRWX`

<!-- decision:P-94E7GN3T -->
### Release Cut Gate Validation Pattern
**When:** 2026-06-11 · **Fact:** `P-94E7GN3T`
**Why:** Validates memory extraction system is working before release; acts as a final quality check that automated testing otherwise misses.

<!-- decision:P-7FM6NVP4 -->
### Skill composition pattern: scaffold + allow-list must be updated together
**When:** 2026-06-11 · **Fact:** `P-7FM6NVP4`
**Why:** Second occurrence of this composition pattern (memory-write in Task 90 was the first). This repeating bug class should be prevented in future skill additions.

<!-- decision:P-GUWLUBBT -->
### Two Bugs Fixed—Validation Points for Session 1 & 2
**When:** 2026-06-11 · **Fact:** `P-GUWLUBBT`
**Why:** These were bugs causing test suite failures. The PR fixes both; Session 1 & 2 testing confirms the fixes work correctly.

<!-- decision:P-XUQK356C -->
### Post-Merge Checkout Race Condition (Kit Memory Writes)
**When:** 2026-06-11 · **Fact:** `P-XUQK356C`
**Why:** The kit maintains and actively modifies its own `context/` during operations. Merge/checkout operations can race with these writes, causing transient stale branches.

<!-- decision:P-QC26V7EB -->
### Claude Memory Kit — cmk Doctor Baseline (Pre-First-Turn)
**When:** 2026-06-11 · **Fact:** `P-QC26V7EB`
**Why:** Baseline expectations distinguish healthy early state from actual failures. Skip count acts as a maturity indicator — changing skip counts are normal and reflect the system warming up.

<!-- decision:P-69AFCHKZ -->
### Claude Memory Kit — Template File Structure in Tarball
**When:** 2026-06-11 · **Fact:** `P-69AFCHKZ`
**Why:** The template structure defines what gets installed into fresh projects. Knowing exact file count and layout helps verify pack completeness and predict post-install directory structure.

<!-- decision:P-TTL9GSJV -->
### Reliable tarball file validation with npm pack --json
**When:** 2026-06-11 · **Fact:** `P-TTL9GSJV`
**Why:** Manual `tar -tzf` verification is error-prone. Structural validators need a reliable source of truth that can be asserted at test time.

<!-- decision:P-X5VHDWAE -->
### Validator pattern: structural guards in test suite (Task 128 reference)
**When:** 2026-06-11 · **Fact:** `P-X5VHDWAE`
**Why:** Converting manual verification steps into permanent test-time guarantees catches silent failures (e.g., missing template files) early, not at user time.

<!-- decision:P-RP4BG3YM -->
### Pre-Session Verification Checklist Structure
**When:** 2026-06-11 · **Fact:** `P-RP4BG3YM`
**Why:** Multi-stage verification (file-side / in-session / live-test) catches config issues, integration problems, and artifact integrity before release.

<!-- decision:P-aN9PaSGC -->
### Validation Gate Structure (cut-gate9 Release)
**When:** 2026-06-11 · **Fact:** `P-aN9PaSGC`
**Why:** Standardized gates catch regressions; each check owns a specific concern. Automation verifies what it can; in-session UX and skip-prompt behavior require hands-on testing.

<!-- decision:P-3SFJR4LM -->
### Code Scar: Overly-Broad Injection Pattern
**When:** 2026-06-11 · **Fact:** `P-3SFJR4LM`

<!-- decision:P-MLV9MSPR -->
### poison-guard.mjs: Specific Provider Patterns Are By Design
**When:** 2026-06-11 · **Fact:** `P-MLV9MSPR`
**Why:** Threat model is accidental leakage. False positives = DoS against system's own legitimate memory content.

<!-- decision:P-7XKFaB2N -->
### Secret Leakage Defense-in-Depth Model
**When:** 2026-06-11 · **Fact:** `P-7XKFaB2N`
**Why:** No single filter is complete. Layering reduces likelihood accidental secrets reach git.

<!-- decision:P-4TSUCAM5 -->
### as long as it adds and not deminish — standing constraint on change scope
**When:** 2026-06-11 · **Fact:** `P-4TSUCAM5`

<!-- decision:P-RL2aKHKQ -->
### Prefers concise, numbered instructions without narrative explanation or backgrou
**When:** 2026-06-11 · **Fact:** `P-RL2aKHKQ`

<!-- decision:P-AFLZRQJ5 -->
### Extraction Output Truncation Bug
**When:** 2026-06-11 · **Fact:** `P-AFLZRQJ5`
**Why:** Prevents dense inference turns from poisoning the fact archive; must validate shape completeness.

<!-- decision:P-Y5U33ATF -->
### Release Gate Process (Template from v0.3.0)
**When:** 2026-06-11 · **Fact:** `P-Y5U33ATF`
**Why:** This gate sequence validates the kit works in cold-start scenarios (Session 3 ensures new users aren't surprised), the guide is accurate (F-sweep), packaging is clean (re-pack), and finally publishes. Designed and validated for v0.3.0 release.

<!-- decision:P-PSN32KXM -->
### E1 Test Scoring Criteria (Backend Code Generation)
**When:** 2026-06-11 · **Fact:** `P-PSN32KXM`
**Why:** E1 validates that memory successfully embedded the user's backend philosophy (FastAPI, type safety, testing discipline) into code generation without explicit prompting. This is the core efficacy test.

<!-- decision:P-NYDA656J -->
### FastAPI Project Scaffolding Workflow and Structure
**When:** 2026-06-11 · **Fact:** `P-NYDA656J`
**Why:** Provides repeatable, testable scaffolding with proper layering (config/routes/schemas/tests separation), async-first design, and immediate verification

<!-- decision:P-CXC5JJHU -->
### User chose REST API backend with FastAPI and no database for new project
**When:** 2026-06-11 · **Fact:** `P-CXC5JJHU`

<!-- decision:P-7HE9BCZW -->
### User uses uv for Python project initialization and dependency management
**When:** 2026-06-11 · **Fact:** `P-7HE9BCZW`

<!-- decision:P-AXBVF6WA -->
### npm pack executed successfully; @lh8ppl/claude-memory-kit v0.3.0 tarball generat
**When:** 2026-06-11 · **Fact:** `P-AXBVF6WA`

<!-- decision:P-Za6L72JM -->
### canonicalize() Super-Linear Regex Hotspot
**When:** 2026-06-11 · **Fact:** `P-Za6L72JM`
**Why:** Confirmed real pattern, but execution is too constrained for practical risk. Behavior-identical fix ensures downstream stability.

<!-- decision:P-LUGG95FY -->
### SonarCloud Hotspot Review — Mark Safe with Comment
**When:** 2026-06-11 · **Fact:** `P-LUGG95FY`
**Why:** Tool limitation requires documented workaround; risk assessment and rationale must be visible to team and future sessions

<!-- decision:P-DGN6ZNXZ -->
### v0.4 Roadmap — Kiro-First Editor Integration
**When:** 2026-06-11 · **Fact:** `P-DGN6ZNXZ`
**Why:** Clear sequencing unblocks user's own workflow first; Kiro support is critical path for v0.4 utility

<!-- decision:P-MWJCVZBH -->
### SonarQube Hotspot Review Script Filtering Logic
**When:** 2026-06-11 · **Fact:** `P-MWJCVZBH`
**Why:** Slow-regex performance is critical in files with large input scope; these require human judgment rather than automated wave-through to avoid missing real issues.

<!-- decision:P-XQ9RYXaJ -->
### Backlog for v0.3.x and v0.4
**When:** 2026-06-11 · **Fact:** `P-XQ9RYXaJ`
**Why:** These tasks emerged from the quality gate review and are ready to schedule.

<!-- decision:P-NHPPPXGD -->
### QA Verification Discipline Before Release
**When:** 2026-06-11 · **Fact:** `P-NHPPPXGD`
**Why:** Catches false positives; provides audit trail for future readers auditing why each decision was made.

<!-- decision:P-9NaMaLE6 -->
### v0.3.0 Released With Green Quality Gate
**When:** 2026-06-11 · **Fact:** `P-9NaMaLE6`
**Why:** Marks completion of the quality gate enforcement for this release; establishes clean baseline for next session.

<!-- decision:P-CW99QNUX -->
### npm v12 Breaking Change and better-sqlite3 Migration Plan
**When:** 2026-06-11 · **Fact:** `P-CW99QNUX`
**Why:** npm 12 ships next month, breaking all new users. Structural fix also eliminates known Windows pain. Time-sensitive.

<!-- decision:P-JRXWU6JP -->
### We can upgrade to latest Node version at any time — no legacy version constraint
**When:** 2026-06-11 · **Fact:** `P-JRXWU6JP`

<!-- decision:P-JN3BYXJN -->
### When asked for a review/opinion, provide that analysis only—don't autonomously w
**When:** 2026-06-11 · **Fact:** `P-JN3BYXJN`

<!-- decision:P-TCKSCKAC -->
### Core Philosophy of the Kit
**When:** 2026-06-11 · **Fact:** `P-TCKSCKAC`
**Why:** Transparency and auditability are core to kit's value proposition versus enterprise fleet systems like memclaw

<!-- decision:P-W7TSERZR -->
### Crystallization with Reviewable Proposals (Task 95)
**When:** 2026-06-11 · **Fact:** `P-W7TSERZR`
**Why:** Achieves memclaw's deduplication goal (rot elimination) while maintaining kit's transparency and audit trail

<!-- decision:P-22VAP6JX -->
### Lazy Re-Embedding on Model Upgrades
**When:** 2026-06-11 · **Fact:** `P-22VAP6JX`
**Why:** Deferral scales to large deployments; feasible once transcript chunks reach thousands

<!-- decision:P-VS9AKQ7P -->
### Memory Trust Scoring — Event-Driven Instead of Server-Side
**When:** 2026-06-11 · **Fact:** `P-VS9AKQ7P`
**Why:** Adopts memclaw's earned-trust insight without requiring server infrastructure or API costs on every write

<!-- decision:P-4aaKKRKV -->
### PII Handling — Non-Adoption of Quarantine
**When:** 2026-06-11 · **Fact:** `P-4aaKKRKV`
**Why:** Kit's memory lives in git repos — privacy (discard-on-sight) is higher priority than quarantine-for-review UX

<!-- decision:P-DW269VXT -->
### cmk Task and Decision Record Governance
**When:** 2026-06-11 · **Fact:** `P-DW269VXT`
**Why:** Codifies cmk's project management model — how work, decisions, and priorities are tracked

<!-- decision:P-GFTYR6T3 -->
### Confirmed adding 4 new task proposals to cmk backlog with minimal response "slot
**When:** 2026-06-11 · **Fact:** `P-GFTYR6T3`

<!-- decision:P-PRJ9QDGG -->
### v0.3.x Release Lane — Tasks 142–145 Priority Order
**When:** 2026-06-11 · **Fact:** `P-PRJ9QDGG`
**Why:** User confirmed slotting 4 new proposals; establishes next-phase roadmap and priorities

<!-- decision:P-2UW5RAKR -->
### PAI (Personal AI Infrastructure) Memory & Architecture Convergence
**When:** 2026-06-12 · **Fact:** `P-2UW5RAKR`
**Why:** Independent convergence strongly validates the kit's memory taxonomy and paradigm. The RELATIONSHIP category is a genuine gap—tracking collaboration evolution could inform Task 55 (meta-learning). The architectural framing clarifies the kit's unique value proposition: composability and zero-friction adoption.

<!-- decision:P-NXF3aCPB -->
### Semantic Search vs. Grep Trade-Off (D-111 Design Rationale)
**When:** 2026-06-12 · **Fact:** `P-NXF3aCPB`
**Why:** The kit's semantic-search choice diverges from PAI despite shared philosophy. The decision is data-driven (benchmarked) and intentional, not a paradigm violation. Documents why the choice was made for future reconsideration.

<!-- decision:P-NQ7WEWSJ -->
### D-111 Design as Bridge Position
**When:** 2026-06-12 · **Fact:** `P-NQ7WEWSJ`
**Why:** Independent convergence of two respected systems on opposing positions suggests both are contextually correct; the kit's D-111 is the synthesis, not a compromise

<!-- decision:P-5RYWEUQM -->
### D-121 Viewer — Reconsidered for v0.4 Design Slot
**When:** 2026-06-12 · **Fact:** `P-5RYWEUQM`
**Why:** D-121 was parked with "keep the idea" reasoning. Pulse at that scale is the strongest argument yet that this feature set has genuine demand, not just theoretical appeal.

<!-- decision:P-LUQGGBRS -->
### Task 55 Enrichment — RELATIONSHIP Memory + Learn Phase
**When:** 2026-06-12 · **Fact:** `P-LUQGGBRS`
**Why:** Three independent design systems converged on capturing task retrospectives + collaboration memory, signaling this is a genuine missing piece

<!-- decision:P-E3SWXCSY -->
### Kit Architecture — Index Routing and Fact Storage
**When:** 2026-06-12 · **Fact:** `P-E3SWXCSY`
**Why:** The pattern scales to large corpora while keeping session context tractable. Multiple independent research efforts converged on this design, validating the approach.

<!-- decision:P-MY3CHJ94 -->
### Memory Evaluation Metrics — Outcome vs. Retrieval Level
**When:** 2026-06-12 · **Fact:** `P-MY3CHJ94`
**Why:** The distinction clarifies scope — retrieval validates internal function, outcome validates user value. Different metrics answer different questions and drive different decisions.

<!-- decision:P-97GWWRNU -->
### Research Inclusion Bar for SOURCES Artifact
**When:** 2026-06-12 · **Fact:** `P-97GWWRNU`
**Why:** The SOURCES artifact must remain credible and actionable. Unverified claims dilute the research base and mislead future development decisions.

<!-- decision:P-DUZYECE4 -->
### v0.3.0 PUBLISHED 2026-06-11 (npm + GitHub Release) after the gate day: 8 bugs fo
**When:** 2026-06-12 · **Fact:** `P-DUZYECE4`

<!-- decision:P-Y5N7FSAV -->
### Auto-Compact Fidelity Loss Mid-Task
**When:** 2026-06-12 · **Fact:** `P-Y5N7FSAV`
**Why:** Fidelity loss forces the next session to re-derive missing context, negating the kit's designed benefit of seamless continuity across boundaries.

<!-- decision:P-TUJKaAQ6 -->
### Autopilot Memory Consultation Architecture
**When:** 2026-06-12 · **Fact:** `P-TUJKaAQ6`
**Why:** Autopilot work must leverage memory without explicit asking; design balances autonomous value against deliberate human control over forget/queue decisions.

<!-- decision:P-GRUJ3P7Q -->
### Memory Kit + Workflows Integration Surface
**When:** 2026-06-12 · **Fact:** `P-GRUJ3P7Q`
**Why:** Workflow agents start cold (no context on user setup/decisions); kit multiplies core utility across swarm scale.

<!-- decision:P-DC97QaDC -->
### Pre-session verification found one composition bug (memory-search allow-list omi
**When:** 2026-06-12 · **Fact:** `P-DC97QaDC`

<!-- decision:P-JU7RRUT9 -->
### Assistant overgeneralized a prior context-specific permission ("for ruflo, you d
**When:** 2026-06-12 · **Fact:** `P-JU7RRUT9`

<!-- decision:P-SKYZHH2U -->
### Autopilot memory is mixed push (SessionStart snapshot always in context) and pul
**When:** 2026-06-12 · **Fact:** `P-SKYZHH2U`

<!-- decision:P-Q4TA2SAX -->
### Prefers terse, step-by-step instructions with time estimates and optional paths
**When:** 2026-06-12 · **Fact:** `P-Q4TA2SAX`

<!-- decision:P-BJQaGQ6H -->
### Iterative, thorough research approach—adds items even near session end rather th
**When:** 2026-06-12 · **Fact:** `P-BJQaGQ6H`

<!-- decision:P-A6XDaDHA -->
### Kit Feature Gap — Chronological Decision Rendering
**When:** 2026-06-12 · **Fact:** `P-A6XDaDHA`
**Why:** That both the kit and Squad independently maintain chronological journals indicates this view type is valuable beyond individual-fact retrieval. The gap is a missed product feature—a natural extension of `cmk digest`.

<!-- decision:P-7RQTaMU4 -->
### Kit's Decision Log — Manual Maintenance Pattern
**When:** 2026-06-12 · **Fact:** `P-7RQTaMU4`
**Why:** Both the kit team and peer projects (Squad) independently maintain chronological decision journals, suggesting this narrative form provides value that individual-fact storage doesn't. The kit chose to keep D-log authoritative rather than migrate to the fact model.

<!-- decision:P-XTLTaX5C -->
### Decision-Journal View Gap — Now Task 147
**When:** 2026-06-12 · **Fact:** `P-XTLTaX5C`
**Why:** User pattern discovery — manual decision journaling across multiple teams signals a real user need the kit doesn't yet meet

<!-- decision:P-9GQSPN2C -->
### Proactively seeks good ideas and practices from peer/sibling projects to steal o
**When:** 2026-06-12 · **Fact:** `P-9GQSPN2C`

<!-- decision:P-BJ9J9GP7 -->
### Squad Sweep Complete — Seven Tasks Slotted (141–147)
**When:** 2026-06-12 · **Fact:** `P-BJ9J9GP7`
**Why:** Documents the scope and closure of a multi-session source-inventory effort; establishes what tasks are now in flight and their provenance

<!-- decision:P-F5M3VBTG -->
### User gates session close with verification question "is everything in lane? slot
**When:** 2026-06-12 · **Fact:** `P-F5M3VBTG`

<!-- decision:P-WYDCWV5H -->
### Design.md §16: Deliberate Parking Lot with Ship Triggers
**When:** 2026-06-12 · **Fact:** `P-WYDCWV5H`
**Why:** The project needs a staging area for long-term candidates without making them tasks prematurely; ship-triggers prevent ideas from rotting as stale backlog

<!-- decision:P-aUDDN4WP -->
### Task 147 design upgraded: the kit gets a STANDING committed context/DECISIONS.md
**When:** 2026-06-12 · **Fact:** `P-aUDDN4WP`
**Why:** A standing journal puts each decision line in the PR diff that captured it (reviewable), travels with git clone, and needs no tooling to read - the same reasons the build repo hand-maintains its own DECISION-LOG

<!-- decision:P-ZQV3U4BP -->
### Decision-trail rule — preserve decision history in task entries
**When:** 2026-06-12 · **Fact:** `P-ZQV3U4BP`
**Why:** Future sessions need to understand decision evolution and rationale; decision trails prevent design context loss

<!-- decision:P-N5YK2T6R -->
### decisions.md feature using standing-journal design pattern
**When:** 2026-06-12 · **Fact:** `P-N5YK2T6R`
**Why:** Kit needs structured decision capture to preserve design rationale across sessions and prevent decisions from being forgotten

<!-- decision:P-ZRQRa277 -->
### kit needs decisions.md feature
**When:** 2026-06-12 · **Fact:** `P-ZRQRa277`

<!-- decision:P-X5RWPJQY -->
### Design Lesson Numbering System (D-###) in claude-memory-kit
**When:** 2026-06-12 · **Fact:** `P-X5RWPJQY`
**Why:** Project code reviews and PR descriptions reference these patterns to justify design choices; helps understand vocabulary and decision-tracing

<!-- decision:P-AXU3YSXC -->
### PR #168 - cmk import-claude-md Command Complete
**When:** 2026-06-12 · **Fact:** `P-AXU3YSXC`
**Why:** Completed feature ready for merge; implementation demonstrates safe fact-import pattern and reuse-at-design-time principle

<!-- decision:P-CZ7WMRYM -->
### autopilot grant — v0.3.x queue (2026-06-12)
**When:** 2026-06-12 · **Fact:** `P-CZ7WMRYM`
**Why:** U-XTCFKJ4U: never generalize permissions across tasks — the grant's exact scope must be on the record so a future session neither exceeds it nor re-asks for it.

<!-- decision:P-T7ZLD7YB -->
### Autopilot standing permission for v0.3.x queue starting Task 141a
**When:** 2026-06-12 · **Fact:** `P-T7ZLD7YB`

<!-- decision:P-7FV4EYaW -->
### npm v12 Script Approval: Project vs. Global Configuration Paths
**When:** 2026-06-12 · **Fact:** `P-7FV4EYaW`
**Why:** Dual-path architecture means different remediation per install type. Verified against GitHub changelog (2026-06-09) and community discussion #198547.

<!-- decision:P-9NHZ2SV2 -->
### npm v12 Mitigation Plan (Tasks 141a–141b)
**When:** 2026-06-12 · **Fact:** `P-9NHZ2SV2`
**Why:** npm v12 lands July 2026. npm 11.16+ already emits warnings and breaks on our binding. Users will hit silent failures (install succeeds, tool crashes on first use) without mitigation.

<!-- decision:P-BDES4aW7 -->
### Install-time consent for better-sqlite3 binding (replaces error → doctor round-trip)
**When:** 2026-06-12 · **Fact:** `P-BDES4aW7`
**Why:** User objected to original UX (npm install error → doctor command → error again → discovery left to an obscure tool). This change prioritizes inline, immediate resolution at the moment of install. Their feedback shaped the design before it shipped.

<!-- decision:P-XBB4aELR -->
### Dependabot Cannot Approve allowScripts in Strict Repos
**When:** 2026-06-12 · **Fact:** `P-XBB4aELR`
**Why:** Affects approval fatigue and long-term security posture in strict-mode npm repos.

<!-- decision:P-A5QQRXMR -->
### Five-Point Stress Gate and Auto-Launch PR Workflow
**When:** 2026-06-12 · **Fact:** `P-A5QQRXMR`
**Why:** Stress gating is a quality validation before merge. The auto-launch on pass keeps the pipeline moving predictably without manual gate-watching.

<!-- decision:P-aZH2NRSE -->
### Task Pipeline Stages
**When:** 2026-06-12 · **Fact:** `P-aZH2NRSE`
**Why:** Recurring structure observed across Tasks 74, 144, 145; understanding stages helps predict throughput and identify bottlenecks

<!-- decision:P-RLKAYYRZ -->
### Stress Testing Omitted for Pure-Read CLI Changes
**When:** 2026-06-12 · **Fact:** `P-RLKAYYRZ`
**Why:** Pure-read analysis and CLI printing introduce no concurrency or spawning risks, making stress tests unnecessary and allowing them to be skipped to save CI time.

<!-- decision:P-E6J7aYH5 -->
### skill-review Imported-Facts Staleness Bug Fixed
**When:** 2026-06-12 · **Fact:** `P-E6J7aYH5`
**Why:** Correctness of the memory system depends on imported facts remaining fresh. This bug threatened that invariant.

<!-- decision:P-2aD2YHMB -->
### Modular Skill Architecture: Read/Write Separation
**When:** 2026-06-13 · **Fact:** `P-2aD2YHMB`
**Why:** Separating read from write reduces blast radius and prevents accidental memory corruption. The boundary is a first-class design principle, not an implementation detail.

<!-- decision:P-2JMVXJ3a -->
### Task 146: Concurrent Swarm Support Testing
**When:** 2026-06-13 · **Fact:** `P-2JMVXJ3a`
**Why:** The kit's strength is as a shared memory layer for many independent agents. Concurrent safety is the missing validation needed before swarm support is proven.

<!-- decision:P-REVFHLBK -->
### kit skills are modular thin-orchestrators over a deep cmk substrate
**When:** 2026-06-13 · **Fact:** `P-REVFHLBK`
**Why:** The user surfaced the mega-vs-modular / skill-scaling question (2026-06-13 whiteboard images); the answer is reusable architecture framing for Task 146 (Workflows) and for any future skill the kit scaffolds — keep skills thin, push capability into composable cmk/MCP cores.

<!-- decision:P-EBGGNUQ4 -->
### async-ifying a CLI action races its synchronous in-process test callers
**When:** 2026-06-13 · **Fact:** `P-EBGGNUQ4`
**Why:** Second instance this session of an async change creating a stress-only race (the spawn-smoke empty-output oracle was the first). The caller-map-both-ways rule (CLAUDE.md) applies to TEST callers, not just src callers — and the stress gate is the thing that catches the timing, which is exactly why it runs on memory-write-surface PRs.

<!-- decision:P-GZR7BG2Q -->
### Hardcoded Model Version in Commit Trailer Goes Stale on Model Switch
**When:** 2026-06-13 · **Fact:** `P-GZR7BG2Q`
**Why:** You work with multiple Claude models in a single session and switch between them. Static trailers mean commit metadata no longer reflects which model actually created the code.

<!-- decision:P-FZ3XFLAB -->
### CMK_DISABLE_SEMANTIC Environment Variable
**When:** 2026-06-13 · **Fact:** `P-FZ3XFLAB`
**Why:** Allows disabling expensive optional features (semantic similarity) in certain deployments or test scenarios.

<!-- decision:P-GXG7L6RH -->
### Seam-Injection Test Coverage Blindspot
**When:** 2026-06-13 · **Fact:** `P-GXG7L6RH`
**Why:** Known pattern (documented in Task-85). Prevents undetected untested code from merging.

<!-- decision:P-Q73KUNWJ -->
### Sonar 0%-New-Code Coverage Gate
**When:** 2026-06-13 · **Fact:** `P-Q73KUNWJ`
**Why:** Prevents untested code from reaching production; enforces code quality.

<!-- decision:P-UMH4G5A2 -->
### Bash tool cwd persists — cd into a workspace silently reroutes npm test
**When:** 2026-06-13 · **Fact:** `P-UMH4G5A2`
**Why:** Burned ~two cycles this session reading 6-passed and a packages/cli error path as if they were the root suite; the cause was a persisted cd from an earlier inspect command, not a real failure.

<!-- decision:P-DMPCD5F3 -->
### bash-cwd-drift creates packages/cli/context/ artifacts
**When:** 2026-06-13 · **Fact:** `P-DMPCD5F3`
**Why:** Prevents misidentification of artifacts as uncommitted work; documents a known benign quirk

<!-- decision:P-VEMJ4EVR -->
### exit-doors gate performs Task-137 validation
**When:** 2026-06-13 · **Fact:** `P-VEMJ4EVR`
**Why:** Documents validation chain; shows active error detection in prerun gating

<!-- decision:P-64FTWQKK -->
### Task 135 integrated pack-completeness validator into prerun
**When:** 2026-06-13 · **Fact:** `P-64FTWQKK`
**Why:** Documents evolution from manual to structured validation; pattern for future gating work

<!-- decision:P-BQDDQLMM -->
### Task 140 has byte-identical output hard constraint
**When:** 2026-06-13 · **Fact:** `P-BQDDQLMM`
**Why:** Any byte difference breaks downstream content-addressed systems

<!-- decision:P-4EGENKKN -->
### Task Queue Organization & Naming Convention
**When:** 2026-06-13 · **Fact:** `P-4EGENKKN`
**Why:** Task codes are used as shorthand in planning and PR context; CLI items have documentation prerequisites; queue structure clarifies what "done" means for a release

<!-- decision:P-44FARNBA -->
### Handler Test Coverage Gap: Error/Exit Branches
**When:** 2026-06-13 · **Fact:** `P-44FARNBA`
**Why:** This systematic gap risks incomplete coverage and repeated discovery cycles. Recording the pattern prevents future handler-task rework.

<!-- decision:P-VHDD6VVV -->
### Direct-to-Main Approval by Campaign Rules
**When:** 2026-06-13 · **Fact:** `P-VHDD6VVV`
**Why:** Enforces code quality gates and test verification. Committing production code directly to main breaks CI discipline and prevents the full test run from catching integration issues. Also: never commit when test failures are present.

<!-- decision:P-PBCLJ2VB -->
### Multi-Stage Quality Gates Catch Bugs Unit Tests Miss
**When:** 2026-06-13 · **Fact:** `P-PBCLJ2VB`
**Why:** Unit tests verify isolated units but don't catch async races, untested paths, integration issues, or runtime environment quirks.

<!-- decision:P-XAVLD63M -->
### Production Code Must Go Through PR/CI
**When:** 2026-06-13 · **Fact:** `P-XAVLD63M`
**Why:** PR/CI ensures code review, confirmed-green test suite before merge, and cross-platform CI validation. CI matrix catches Windows/macOS issues that local runs may miss.

<!-- decision:P-4aG26CRV -->
### npm 12 & the 141a/141b Migration Strategy
**When:** 2026-06-13 · **Fact:** `P-4aG26CRV`
**Why:** npm-12 is a hard blocker for better-sqlite3. 141b removes the problem entirely; no native deps = install anywhere, forever.

<!-- decision:P-PU4FZPZW -->
### Kit Versioning Uses Lane-Themed Releases, Not Strict Semver
**When:** 2026-06-13 · **Fact:** `P-PU4FZPZW`
**Why:** Prevents confusion between strict semver (feature = minor bump) and the kit's versioning scheme, where a minor bump signals a paradigm/capability shift, and patches are polish within that shift. Ensures settled decisions (e.g., "v0.4.0 is Kiro") don't get accidentally clobbered by sequential numbering logic.

<!-- decision:P-V77JZTJR -->
### Live validation must happen before committing major dependency migrations; don't
**When:** 2026-06-13 · **Fact:** `P-V77JZTJR`

<!-- decision:P-UKXW3FN9 -->
### v0.3.1 will release the current feature batch (live-tested first); v0.3.2 will i
**When:** 2026-06-13 · **Fact:** `P-UKXW3FN9`

<!-- decision:P-ZXaUQRaS -->
### Conditional Tech Adoption Discipline
**When:** 2026-06-13 · **Fact:** `P-ZXaUQRaS`
**Why:** Prevents trading UX/performance for technical elegance or convenience on faith. Forces explicit data-driven decisions.

<!-- decision:P-JHLNTFBM -->
### Node:sqlite Adoption Perf Gate (D-147) — Execution Plan
**When:** 2026-06-13 · **Fact:** `P-JHLNTFBM`
**Why:** User won't regress user-facing response latency for installation convenience. Perf is measured, not assumed.

<!-- decision:P-ZCRT7N2H -->
### Accepts one-time install UX friction (binding prompt); will not sacrifice perman
**When:** 2026-06-13 · **Fact:** `P-ZCRT7N2H`

<!-- decision:P-FPYJVM79 -->
### Chose "no measurable regression" for storage backend — search speed is the kit's
**When:** 2026-06-13 · **Fact:** `P-FPYJVM79`

<!-- decision:P-K4X4VRPH -->
### Perf Gate Principle — Search Speed Non-Negotiable
**When:** 2026-06-13 · **Fact:** `P-K4X4VRPH`
**Why:** User stated search is foundational to the kit's purpose; any permanent slowdown defeats the kit's value. This discipline parallels prior bake-offs (D-109 embedder choice).

<!-- decision:P-EAALA5AR -->
### v0.3.1 Cut-Gate Checklist (Additive Testing Plan)
**When:** 2026-06-13 · **Fact:** `P-EAALA5AR`
**Why:** Ensures every v0.3.x release tests standing regression checks + new-feature validation consistently. Three-part structure (CLI-driven, user-only, pre-tag) is reusable for future releases.

<!-- decision:P-XSE9J4SZ -->
### Cut-Gate Live-Test Verification Workflow
**When:** 2026-06-14 · **Fact:** `P-XSE9J4SZ`
**Why:** Live testing plus on-disk file verification surfaces boundary violations and single-point-of-enforcement failures that automated tests alone cannot detect

<!-- decision:P-SD7WDA3Z -->
### Hook-Boundary Implementation Gap (Privacy-Strip Example)
**When:** 2026-06-14 · **Fact:** `P-SD7WDA3Z`
**Why:** Single-point-of-enforcement (hook-only) misses actual file write operations; boundary violations slip through without file-verification checks

<!-- decision:P-9YGaCE66 -->
### Post-Merge Clean-Build Verification
**When:** 2026-06-14 · **Fact:** `P-9YGaCE66`
**Why:** Dev tree may have transient state; only a clean build from main branch proves the product is correct

<!-- decision:P-ZMCV7XLP -->
### RESUME v0.3.1 cut-gate — 2 bugs found+fixed, PR #179 in flight
**When:** 2026-06-14 · **Fact:** `P-ZMCV7XLP`
**Why:** Context near auto-compact mid-cut-gate; the next session must not lose where the live-test stands or re-derive the two findings.

<!-- decision:P-4HWRCJBR -->
### Sensitive Content Policy for Memory Capture System
**When:** 2026-06-14 · **Fact:** `P-4HWRCJBR`
**Why:** Ensures personal/sensitive content never silently lands in git-committed, possibly-shared files. Solves the core risk: sensitive data in a repo that might be pushed.

<!-- decision:P-VREAaST9 -->
### vitest can show a module-resolution failure (Cannot find module /@id/...) on the
**When:** 2026-06-14 · **Fact:** `P-VREAaST9`
**Why:** It LOOKS like a test failure in CI/stress, and the lazy reflex is to wave it off as 'known transient' — but that exact reflex is what hid a real CodeQL high-sev alert on this same PR #179. Never assume transient.

<!-- decision:P-4PEW73GU -->
### Cut-gate validation includes paraphrase-recall check
**When:** 2026-06-14 · **Fact:** `P-4PEW73GU`
**Why:** Ensures comprehensive semantic validation of the merged build before considering work complete.

<!-- decision:P-7Z4JAQLX -->
### Multi-layer gating before main merge
**When:** 2026-06-14 · **Fact:** `P-7Z4JAQLX`
**Why:** Catches issues at multiple points before they reach main; reduces risk of broken mainline.

<!-- decision:P-X9ZB69LH -->
### Stress runner and incremental JSON handling
**When:** 2026-06-14 · **Fact:** `P-X9ZB69LH`
**Why:** Avoids wasted debugging effort on partial/corrupt JSON; runner handles it internally.

<!-- decision:P-ZHC3BS29 -->
### Release Gating Workflow for Version Cuts
**When:** 2026-06-14 · **Fact:** `P-ZHC3BS29`
**Why:** Each gate catches different classes of bugs. Stress + CI catch logic errors; install-path tests catch deployment/integration issues that CI misses (e.g., title-truncation data-loss bugs now fixed in PR #180).

<!-- decision:P-D7aTRN9U -->
### v0.3.1 Release: Final Workflow
**When:** 2026-06-14 · **Fact:** `P-D7aTRN9U`
**Why:** This is the fully mapped workflow for v0.3.1 release; provides a template for subsequent releases and ensures no steps are skipped.

<!-- decision:P-K6GWAA44 -->
### INDEX.md is a committed human-readable artifact
**When:** 2026-06-14 · **Fact:** `P-K6GWAA44`
**Why:** INDEX is part of the project's shipped state; users rely on it staying current and human-readable

<!-- decision:P-X2ZJ6Y4J -->
### writeFact silent failure mode: reindex failure swallowing
**When:** 2026-06-14 · **Fact:** `P-X2ZJ6Y4J`
**Why:** Hidden failure mode caused INDEX corruption with no observable signal; was only discoverable via file audit

<!-- decision:P-RKHLCEET -->
### Release Documentation Convention (Bug Fixes vs Features)
**When:** 2026-06-14 · **Fact:** `P-RKHLCEET`
**Why:** Keeps release history clean and searchable; ensures README reflects actual feature set, not implementation fixes

<!-- decision:P-J7D46R62 -->
### Anti-Pattern Rejection: SessionStart Auto-Heal
**When:** 2026-06-14 · **Fact:** `P-J7D46R62`
**Why:** The incidental next-capture self-heal suffices. Hot-path cost is not justified for cosmetic drift.

<!-- decision:P-7G3GYKTM -->
### INDEX Drift Self-Heal Architecture
**When:** 2026-06-14 · **Fact:** `P-7G3GYKTM`
**Why:** The incidental next-capture self-heal is sufficient and costs nothing at runtime. SessionStart machinery would over-engineer a vanishingly rare edge case.

<!-- decision:P-CFA7ZXAa -->
### Session 1 Post-Execution Guardrails
**When:** 2026-06-14 · **Fact:** `P-CFA7ZXAa`
**Why:** Confirms Stop hook and auto-memory extraction system are functioning; validates that durable facts are captured with reasoning sections

<!-- decision:P-QCKEA5A3 -->
### Session 1 Staged Build Workflow
**When:** 2026-06-14 · **Fact:** `P-QCKEA5A3`
**Why:** Validates auto-memory extraction system (Stop hook auto-captures preferences stated naturally, without explicit "remember this" commands)

<!-- decision:P-4aRS5H6T -->
### Clean-Start Procedure for Session 1 Test
**When:** 2026-06-14 · **Fact:** `P-4aRS5H6T`
**Why:** Ensures B3/B4 cross-project persona capture can verify uv/ruff rule lands from zero; prevents pre-seeding contamination

<!-- decision:P-9VESM93S -->
### Claude Memory Kit Installation Levels
**When:** 2026-06-14 · **Fact:** `P-9VESM93S`
**Why:** Testing Session 1 validates that cross-project persona capture fires correctly; this requires a fresh project folder with zero pre-seeded facts. The global binary is stable; only the per-project scaffold is session-specific.

<!-- decision:P-CEDDPRCH -->
### Claude Code Hook Activation Requires Restart
**When:** 2026-06-14 · **Fact:** `P-CEDDPRCH`
**Why:** Claude Code loads hook configuration once at startup and does not hot-reload `.claude/settings.json` changes.

<!-- decision:P-WaCZ7REY -->
### cmk install --with-semantic Scaffolds Semantic Recall
**When:** 2026-06-14 · **Fact:** `P-WaCZ7REY`
**Why:** Semantic search adds hybrid matching (keyword + semantic) to memory recall, improving relevance of facts retrieved across sessions.

<!-- decision:P-4VT5UP5R -->
### Memory Kit Hooks Are Project-Scoped
**When:** 2026-06-14 · **Fact:** `P-4VT5UP5R`
**Why:** Hooks execute in the context of the Claude Code window that triggered them, which is tied to the open project directory. They read `.claude/settings.json` from the working directory.

<!-- decision:P-XQRM9UFY -->
### cut-gate11 Memory System Three-Tier Architecture
**When:** 2026-06-14 · **Fact:** `P-XQRM9UFY`
**Why:** Enables safe sharing of scaffold and memory across machines without leaking per-machine artifacts or raw logs

<!-- decision:P-MWQKPU54 -->
### cut-gate11 Pre-Session Verification Checklist
**When:** 2026-06-14 · **Fact:** `P-MWQKPU54`
**Why:** Documents baseline scaffold state; confirms readiness before building; catches misconfiguration early

<!-- decision:P-QZS2XMKP -->
### Memory-search skill trigger is phrasing-sensitive
**When:** 2026-06-14 · **Fact:** `P-QZS2XMKP`
**Why:** Explains variance in early test runs; clarifies this is a trigger-detection polish issue (fixable), not mechanism failure (blocker)

<!-- decision:P-JP9PYX7R -->
### Memory-Recall Fix Incomplete — Structure Questions Still Code-Crawl
**When:** 2026-06-14 · **Fact:** `P-JP9PYX7R`
**Why:** The user is systematically verifying whether a fix actually produces the intended behavior. Unit tests pass, but they verify well-formedness, not live behavior — especially important for LLM-sensitive recall.

<!-- decision:P-NU2K2NN9 -->
### Validation Pipeline for claude-memory-kit Includes Format and Privacy Gates
**When:** 2026-06-14 · **Fact:** `P-NU2K2NN9`
**Why:** Preventive gates catch issues before code review, reducing back-and-forth and avoiding silent failures (1024-char limit would cause skill to silently fail to load).

<!-- decision:P-DBTYCD5U -->
### Research-Based Claims Discipline
**When:** 2026-06-14 · **Fact:** `P-DBTYCD5U`
**Why:** Prevents unfounded claims about competitive landscape that could misdirect architecture; the kit's core value depends on understanding how others solved the same recall problem.

<!-- decision:P-DSPZ9CAW -->
### Deciding Experiment That Gates v0.3.1
**When:** 2026-06-14 · **Fact:** `P-DSPZ9CAW`
**Why:** Live re-test validates the fix against the original problem (crawling code instead of using memory). Removes doubt and gates the tag decision.

<!-- decision:P-a2BSC7NG -->
### Description Field Length — Root Cause and Fix
**When:** 2026-06-14 · **Fact:** `P-a2BSC7NG`
**Why:** Long descriptions were silently breaking the YAML structure or exceeding token/parsing limits. This was discovered by code inspection (challenge 1: "Did you check the docs?").

<!-- decision:P-M7ZYUVES -->
### v2 Skill Triggering: Semantic Intent Instead of Phrase Matching
**When:** 2026-06-14 · **Fact:** `P-M7ZYUVES`
**Why:** Phrase-matching fails for esoteric/roundabout questions; semantic intent + hint-reference generalizes across varied phrasings.

<!-- decision:P-9HK3PZVK -->
### Recall Skill Validation Contract
**When:** 2026-06-14 · **Fact:** `P-9HK3PZVK`
**Why:** The skill has two failure modes (over-fire wastes cycles, under-fire misses memory). Testing both ensures usability. Systematic eval in v0.4 is more rigorous than endless hand-trials.

<!-- decision:P-LVTJKE2B -->
### Layered Backend Architecture in Live Persona
**When:** 2026-06-14 · **Fact:** `P-LVTJKE2B`
**Why:** Architecture was described across projects (inferred vs declared) and stuck in medium-confidence queue; auto-drain moved it to live tier for consistent injection.

<!-- decision:P-M9DH6KYM -->
### Persona Auto-Drain Queue for Medium-Confidence Candidates
**When:** 2026-06-14 · **Fact:** `P-M9DH6KYM`
**Why:** The wedge test was failing because persona wasn't injecting into new projects; medium-confidence signals were stuck with no escape path.

<!-- decision:P-AaTGXLHE -->
### cmk install modes affect cold-open search behavior
**When:** 2026-06-14 · **Fact:** `P-AaTGXLHE`
**Why:** Testing fixes under different configurations than the original bug report creates false-negative risk (test appears to fail when fix is actually working)

<!-- decision:P-TCKPLP3E -->
### Cold-Start Test for Persona Architecture Transfer
**When:** 2026-06-14 · **Fact:** `P-TCKPLP3E`
**Why:** Tests whether persona facts not only transfer to new projects but are actually applied in generation. Confirms memory drainage/promotion system works end-to-end, not just at storage level.

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-6LJZ69M5 -->
### SonarCloud Coverage Job Rate-Limited by HF Hub Cache Miss
**When:** 2026-06-15 · **Fact:** `P-6LJZ69M5`
**Why:** HF Hub rate-limiting on shared API keys is a hidden failure mode in CI; without caching, coverage jobs fail silently. The fix is mechanical (copy the cache step), but the root cause is non-obvious.

<!-- decision:P-ZV6DT5WA -->
### Release Merge-Gate Workflow
**When:** 2026-06-15 · **Fact:** `P-ZV6DT5WA`
**Why:** Gate checks prevent shipping broken or incomplete releases; mandatory discipline for release safety.

<!-- decision:P-SSTU3RL4 -->
### Release Gate Workflow and Final User Control
**When:** 2026-06-15 · **Fact:** `P-SSTU3RL4`
**Why:** Ensures all checks pass before any publishable artifact is created. User retains final control per D-126 (no auto-tagging from CI).

<!-- decision:P-ENQSa3T9 -->
### SonarCloud Zero-Coverage From Missing Cache Step
**When:** 2026-06-15 · **Fact:** `P-ENQSa3T9`
**Why:** Failure cascade was non-obvious and blocked the v0.3.1 gate; worth capturing for future SonarCloud troubleshooting.

<!-- decision:P-XCTDZRCH -->
### Post-Commit Validator Suite
**When:** 2026-06-15 · **Fact:** `P-XCTDZRCH`
**Why:** Catch integration bugs early: dangling references, leaks, orphaned task IDs. These are easy to miss in manual review.

<!-- decision:P-PKPUKZRH -->
### RELEASE-PLAN.md: Authoritative Task-to-Lane Map
**When:** 2026-06-15 · **Fact:** `P-PKPUKZRH`
**Why:** Prevents silent orphans. A task could appear laned in tasks.md but actually lack a version assignment, causing confusion about scope and release timing.

<!-- decision:P-DY6aUA7A -->
### Task-Lane Consistency Audit Workflow
**When:** 2026-06-15 · **Fact:** `P-DY6aUA7A`
**Why:** Tasks can acquire lane context without being formally assigned to a version, creating shadow state. A side-by-side comparison of both files catches these silently-laned-but-unassigned tasks.

<!-- decision:P-YLWTT5aG -->
### TencentDB-Agent-Memory Write/Search Implementation Comparison
**When:** 2026-06-15 · **Fact:** `P-YLWTT5aG`
**Why:** Comparative code-level review of adjacent implementation reveals convergence areas (no action) and architectural alternatives (design patterns for roadmap).

<!-- decision:P-7MXBHAWU -->
### User reviews multiple adjacent/competing projects to extract design patterns and
**When:** 2026-06-15 · **Fact:** `P-7MXBHAWU`

<!-- decision:P-GATKYaHT -->
### Task 50 Research-Revisit Gate and Multi-Agent Pattern
**When:** 2026-06-15 · **Fact:** `P-GATKYaHT`
**Why:** Leverage existing multi-agent research; avoid re-derivation. Taskmaster provides actionable blueprints before Task 50 starts.

<!-- decision:P-ZDR9EQRa -->
### v0.4.x Versioning Roadmap
**When:** 2026-06-15 · **Fact:** `P-ZDR9EQRa`
**Why:** Clarifies v0.4.0 ships infrastructure + first integration. Explains tail strategy: agents are patch-level, numbered only at ship time.

<!-- decision:P-HTZHX3F7 -->
### OpenHands Context Condenser — Applicable Compression Ideas
**When:** 2026-06-15 · **Fact:** `P-HTZHX3F7`
**Why:** Production patterns from mature agent runtime; worth evaluating for compression design

<!-- decision:P-DYa3YF7X -->
### Qdrant Vector Database — Re-rejected (ADR-0015 reaffirmed)
**When:** 2026-06-15 · **Fact:** `P-DYa3YF7X`
**Why:** Prevents future re-litigations; clarifies architectural vs technical reasons for rejection

<!-- decision:P-ZE9MW3QP -->
### Open Knowledge Format (OKF) — Design Validation and Interchange Target
**When:** 2026-06-15 · **Fact:** `P-ZE9MW3QP`
**Why:** External validation that kit's core thesis (git-native, minimal, human-readable) is correct; OKF provides a ready-made interchange standard at the team/cross-agent boundary without full redesign

<!-- decision:P-4QAAULAL -->
### Research Triage Rule — Skip Out-of-Scope Topics
**When:** 2026-06-15 · **Fact:** `P-4QAAULAL`
**Why:** Keeps research archive focused and load-bearing; prevents cluttering with unrelated material; ensures every saved memo is something a future session will actually use

<!-- decision:P-4ELVTGQB -->
### I used https://github.com/SpillwaveSolutions/project-memory before starting clau
**When:** 2026-06-15 · **Fact:** `P-4ELVTGQB`

<!-- decision:P-FaMS2LTW -->
### D-144 (housekeeping) is the post-Task-129 step in the remaining v0.3.x queue
**When:** 2026-06-15 · **Fact:** `P-FaMS2LTW`

<!-- decision:P-aRUCEJ6E -->
### FTS5 Query Sanitization (Task 153)
**When:** 2026-06-15 · **Fact:** `P-aRUCEJ6E`
**Why:** production bug affecting search UX when version strings or dotted terms appear in queries

<!-- decision:P-L5S6JJU3 -->
### v0.3.2 Release Scope Expanded
**When:** 2026-06-15 · **Fact:** `P-L5S6JJU3`
**Why:** The v0.3.2 scope expanded beyond the initial 153+152 after re-evaluation: 134 (open since v0.3.1, zero-risk add) and the gitattributes follow-up (parked from Task 139) were pulled in, plus 147 (the decisions.md the user explicitly asked for). The node:sqlite migration stays conditional because search latency is paid every query forever — we don't sacrifice the kit's core purpose for an install-time convenience.

<!-- decision:P-GWKDXJU4 -->
### Planning Docs as Standalone Commits on Main
**When:** 2026-06-15 · **Fact:** `P-GWKDXJU4`
**Why:** Maintains "single source of truth, same commit batch" discipline. Scope decisions are visible in main history and don't get tangled with task PR reviews.

<!-- decision:P-JXRTNTaG -->
### v0.3.2 Scope Locked; Strict Task-Order Discipline
**When:** 2026-06-15 · **Fact:** `P-JXRTNTaG`
**Why:** Dependencies and risk management. Spike results for 141b decide whether it ships in v0.3.2 or defers to v0.3.3.

<!-- decision:P-2Qa3JA5W -->
### FTS5 Query Sanitization — Per-Token Quoting Design
**When:** 2026-06-15 · **Fact:** `P-2Qa3JA5W`
**Why:** Per-token quoting preserves implicit-AND between words (better recall for multi-word queries like "layered architecture"), while whole-query quoting forces strict phrase matching. Grounded in SQLite FTS5 primary docs.

<!-- decision:P-CWTW7GT6 -->
### FTS5 and sqlite-vec are chosen by design per ADR-0002 and ADR-0015
**When:** 2026-06-15 · **Fact:** `P-CWTW7GT6`
**Why:** These are foundational architectural constraints. Future sessions may encounter FTS5 recall limitations or proposals to switch to a vector DB; understanding these tenets is essential to evaluating such requests.

<!-- decision:P-FZSCATHJ -->
### v0.3.2 Scope Correction Dedup
**When:** 2026-06-15 · **Fact:** `P-FZSCATHJ`
**Why:** Pulling already-shipped tasks back into a new version's scope is a real planning error — it would waste a re-implementation cycle or ship a confusing duplicate. The correction is the durable state; the earlier expanded-scope fact is now misleading and must not be the one a future session recalls.

<!-- decision:P-YEH2DCQU -->
### Node:sqlite FTS5 Module Availability Gate for Task 141b Migration
**When:** 2026-06-15 · **Fact:** `P-YEH2DCQU`
**Why:** Task 141b is conditional on three spikes. Without confirming FTS5 is available on all target platforms, the migration could pass in controlled dev/test environments but fail in production.

<!-- decision:P-LaJYSMLa -->
### Reject ponytail plugin; philosophical conflict with project design
**When:** 2026-06-15 · **Fact:** `P-LaJYSMLa`
**Why:** The kit's value derives from deliberate rigor; Ponytail optimizes in the opposite direction. Adopting it would undermine the project's architectural philosophy and create decision-making conflicts on every tool/code choice.

<!-- decision:P-HC3VHHET -->
### Kit Produces Facts, Not Views — The DECISIONS.md Gap
**When:** 2026-06-15 · **Fact:** `P-HC3VHHET`
**Why:** Clarifies Task 147 scope — DECISIONS.md is *not* redundant with existing docs; it's the *missing view* that the kit's facts should feed into. Distinction: kit = facts, DECISION-LOG/squad = views.

<!-- decision:P-FH2Q2TZ7 -->
### Append-Only Model for DECISIONS.md (Never Regenerate from Live Facts)
**When:** 2026-06-15 · **Fact:** `P-FH2Q2TZ7`
**Why:** Regenerating from live facts erases history. Superseded decisions disappear; retracted decisions are gone. This violates the decision-trail preservation rule: the journal's purpose is to show why we changed course, not rewrite history to look like current state was always obvious. Squad appends for this reason (history is the point). The kit can improve squad's model (no junk, typed facts, clear structure) while keeping the append-only virtue.

<!-- decision:P-32DWHP4G -->
### Regenerated Surfaces vs Append-Only Surfaces (Digest vs DECISIONS.md)
**When:** 2026-06-15 · **Fact:** `P-32DWHP4G`
**Why:** They answer different questions. Digest = "current knowledge" (regeneration correct, always consistent). DECISIONS = "why did we decide this" (append correct, history is the point). Regenerating DECISIONS erases context; appending digest fills it with noise.

<!-- decision:P-AYFCJ25H -->
### Unbounded Permanent Ledger vs Bounded Working Set (DECISIONS.md vs MEMORY.md)
**When:** 2026-06-15 · **Fact:** `P-AYFCJ25H`
**Why:** Working memory and decision history need opposite strategies. MEMORY is a triage queue (keep recent threads hot). DECISIONS is a permanent record (context for architectural choices). Confusing them would either lose old decisions (parking) or bloat DECISIONS with noise (bounded).

<!-- decision:P-3C9V6a76 -->
### DECISIONS.md is append-only permanent journal not regenerated
**When:** 2026-06-15 · **Fact:** `P-3C9V6a76`
**Why:** Arrived at by reasoning through what happens when a decision-fact is superseded/forgotten over time. A regenerated-from-live DECISIONS.md (my first instinct, mirroring INDEX.md) would erase superseded decisions — destroying the journal's entire value (the why-we-changed trail). The MEMORY.md parking model also must NOT apply: old decisions are the MOST valuable part of a decision log, so it's unbounded and never rolls. Append-permanent for the journal vs regenerate for the digest — the difference IS the MEMORY.md-vs-decision-log distinction. Squad appends because it has no DB; the kit appends-with-structure (links/supersession/no-junk) because it does.

<!-- decision:P-Aa22MJAC -->
### semantic backend: sqlite-vec primary, zvec fallback
**When:** 2026-06-10 · **Fact:** `P-Aa22MJAC`
**Why:** sqlite-vec puts vectors inside the SQLite index the kit already runs (one store, design 9.3.1 fit); zvec is embedded+Node+Windows but its bindings are only ~May-2026 old

<!-- decision:P-N9BGGaK6 -->
### Transient Failure Retry Strategy
**When:** 2026-06-10 · **Fact:** `P-N9BGGaK6`
**Why:** A single transient delay can cause false negatives; 5 seconds is low-cost. Distinguishing jitter from real degradation prevents flaky CI while preserving signal for real b

<!-- decision:P-QXDNaC5U -->
### v0.3.0 is BUILD-COMPLETE (2026-06-10): Tasks 46/125/124/75(all)/104(all) shipped
**When:** 2026-06-10 · **Fact:** `P-QXDNaC5U`

<!-- decision:P-MHCAaYVG -->
### Cut-Gate Testing Guide (Manual Release QA)
**When:** 2026-06-10 · **Fact:** `P-MHCAaYVG`
**Why:** Encodes hard-won lessons (D-84, v0.2.0, Task-75) into repeatable process; prevents regression and avoids known gotchas; respects user's time with clear estimates and scope boundaries.

<!-- decision:P-a5W95QXS -->
### This file (docs/process/cut-gate.md) is their manual live-test guide for release
**When:** 2026-06-10 · **Fact:** `P-a5W95QXS`

<!-- decision:P-TaHaDQV7 -->
### B5/B7 Probe Footgun — settings.json Wholesale Overwrite
**When:** 2026-06-10 · **Fact:** `P-TaHaDQV7`
**Why:** Running B5/B7 in a working directory (not throwaway) corrupts configuration.

<!-- decision:P-aA5S5S2U -->
### User confirmed companion project approach for Task 127 aligns with kit philosoph
**When:** 2026-06-10 · **Fact:** `P-aA5S5S2U`

<!-- decision:P-ULTaWK4B -->
### Release Gate Structure (v0.3.0)
**When:** 2026-06-11 · **Fact:** `P-ULTaWK4B`
**Why:** D3's promotion to required blocker is a recent change; the next release cycle must respect this gate structure.

<!-- decision:P-Pa5RBNQ4 -->
### Release Git Choreography: Memory, Release, Tag (in order)
**When:** 2026-06-11 · **Fact:** `P-Pa5RBNQ4`
**Why:** Keeps the tree clean; release commits reflect versioning, not session metadata. Memory churn is incidental to development, not part of the release artifact.

<!-- decision:P-aLPJJGFL -->
### Separate Memory Captures from Release Commits
**When:** 2026-06-11 · **Fact:** `P-aLPJJGFL`
**Why:** Release commits should show only what went into the release — when auditing `release: vX.Y.Z` later, the commit should be uncluttered and reviewable as a pure version bump. Accumulated memory captures muddy that history.

<!-- decision:P-MZDaYRWX -->
### Requesting complete re-verification: check previous test gate outputs (gate7), r
**When:** 2026-06-11 · **Fact:** `P-MZDaYRWX`

<!-- decision:P-aN9PaSGC -->
### Validation Gate Structure (cut-gate9 Release)
**When:** 2026-06-11 · **Fact:** `P-aN9PaSGC`
**Why:** Standardized gates catch regressions; each check owns a specific concern. Automation verifies what it can; in-session UX and skip-prompt behavior require hands-on testing.

<!-- decision:P-7XKFaB2N -->
### Secret Leakage Defense-in-Depth Model
**When:** 2026-06-11 · **Fact:** `P-7XKFaB2N`
**Why:** No single filter is complete. Layering reduces likelihood accidental secrets reach git.

<!-- decision:P-RL2aKHKQ -->
### Prefers concise, numbered instructions without narrative explanation or backgrou
**When:** 2026-06-11 · **Fact:** `P-RL2aKHKQ`

<!-- decision:P-Za6L72JM -->
### canonicalize() Super-Linear Regex Hotspot
**When:** 2026-06-11 · **Fact:** `P-Za6L72JM`
**Why:** Confirmed real pattern, but execution is too constrained for practical risk. Behavior-identical fix ensures downstream stability.

<!-- decision:P-XQ9RYXaJ -->
### Backlog for v0.3.x and v0.4
**When:** 2026-06-11 · **Fact:** `P-XQ9RYXaJ`
**Why:** These tasks emerged from the quality gate review and are ready to schedule.

<!-- decision:P-9NaMaLE6 -->
### v0.3.0 Released With Green Quality Gate
**When:** 2026-06-11 · **Fact:** `P-9NaMaLE6`
**Why:** Marks completion of the quality gate enforcement for this release; establishes clean baseline for next session.

<!-- decision:P-4aaKKRKV -->
### PII Handling — Non-Adoption of Quarantine
**When:** 2026-06-11 · **Fact:** `P-4aaKKRKV`
**Why:** Kit's memory lives in git repos — privacy (discard-on-sight) is higher priority than quarantine-for-review UX

<!-- decision:P-NXF3aCPB -->
### Semantic Search vs. Grep Trade-Off (D-111 Design Rationale)
**When:** 2026-06-12 · **Fact:** `P-NXF3aCPB`
**Why:** The kit's semantic-search choice diverges from PAI despite shared philosophy. The decision is data-driven (benchmarked) and intentional, not a paradigm violation. Documents why the choice was made for future reconsideration.

<!-- decision:P-TUJKaAQ6 -->
### Autopilot Memory Consultation Architecture
**When:** 2026-06-12 · **Fact:** `P-TUJKaAQ6`
**Why:** Autopilot work must leverage memory without explicit asking; design balances autonomous value against deliberate human control over forget/queue decisions.

<!-- decision:P-DC97QaDC -->
### Pre-session verification found one composition bug (memory-search allow-list omi
**When:** 2026-06-12 · **Fact:** `P-DC97QaDC`

<!-- decision:P-BJQaGQ6H -->
### Iterative, thorough research approach—adds items even near session end rather th
**When:** 2026-06-12 · **Fact:** `P-BJQaGQ6H`

<!-- decision:P-A6XDaDHA -->
### Kit Feature Gap — Chronological Decision Rendering
**When:** 2026-06-12 · **Fact:** `P-A6XDaDHA`
**Why:** That both the kit and Squad independently maintain chronological journals indicates this view type is valuable beyond individual-fact retrieval. The gap is a missed product feature—a natural extension of `cmk digest`.

<!-- decision:P-7RQTaMU4 -->
### Kit's Decision Log — Manual Maintenance Pattern
**When:** 2026-06-12 · **Fact:** `P-7RQTaMU4`
**Why:** Both the kit team and peer projects (Squad) independently maintain chronological decision journals, suggesting this narrative form provides value that individual-fact storage doesn't. The kit chose to keep D-log authoritative rather than migrate to the fact model.

<!-- decision:P-XTLTaX5C -->
### Decision-Journal View Gap — Now Task 147
**When:** 2026-06-12 · **Fact:** `P-XTLTaX5C`
**Why:** User pattern discovery — manual decision journaling across multiple teams signals a real user need the kit doesn't yet meet

<!-- decision:P-aUDDN4WP -->
### Task 147 design upgraded: the kit gets a STANDING committed context/DECISIONS.md
**When:** 2026-06-12 · **Fact:** `P-aUDDN4WP`
**Why:** A standing journal puts each decision line in the PR diff that captured it (reviewable), travels with git clone, and needs no tooling to read - the same reasons the build repo hand-maintains its own DECISION-LOG

<!-- decision:P-ZRQRa277 -->
### kit needs decisions.md feature
**When:** 2026-06-12 · **Fact:** `P-ZRQRa277`

<!-- decision:P-7FV4EYaW -->
### npm v12 Script Approval: Project vs. Global Configuration Paths
**When:** 2026-06-12 · **Fact:** `P-7FV4EYaW`
**Why:** Dual-path architecture means different remediation per install type. Verified against GitHub changelog (2026-06-09) and community discussion #198547.

<!-- decision:P-BDES4aW7 -->
### Install-time consent for better-sqlite3 binding (replaces error → doctor round-trip)
**When:** 2026-06-12 · **Fact:** `P-BDES4aW7`
**Why:** User objected to original UX (npm install error → doctor command → error again → discovery left to an obscure tool). This change prioritizes inline, immediate resolution at the moment of install. Their feedback shaped the design before it shipped.

<!-- decision:P-XBB4aELR -->
### Dependabot Cannot Approve allowScripts in Strict Repos
**When:** 2026-06-12 · **Fact:** `P-XBB4aELR`
**Why:** Affects approval fatigue and long-term security posture in strict-mode npm repos.

<!-- decision:P-aZH2NRSE -->
### Task Pipeline Stages
**When:** 2026-06-12 · **Fact:** `P-aZH2NRSE`
**Why:** Recurring structure observed across Tasks 74, 144, 145; understanding stages helps predict throughput and identify bottlenecks

<!-- decision:P-E6J7aYH5 -->
### skill-review Imported-Facts Staleness Bug Fixed
**When:** 2026-06-12 · **Fact:** `P-E6J7aYH5`
**Why:** Correctness of the memory system depends on imported facts remaining fresh. This bug threatened that invariant.

<!-- decision:P-2aD2YHMB -->
### Modular Skill Architecture: Read/Write Separation
**When:** 2026-06-13 · **Fact:** `P-2aD2YHMB`
**Why:** Separating read from write reduces blast radius and prevents accidental memory corruption. The boundary is a first-class design principle, not an implementation detail.

<!-- decision:P-2JMVXJ3a -->
### Task 146: Concurrent Swarm Support Testing
**When:** 2026-06-13 · **Fact:** `P-2JMVXJ3a`
**Why:** The kit's strength is as a shared memory layer for many independent agents. Concurrent safety is the missing validation needed before swarm support is proven.

<!-- decision:P-4aG26CRV -->
### npm 12 & the 141a/141b Migration Strategy
**When:** 2026-06-13 · **Fact:** `P-4aG26CRV`
**Why:** npm-12 is a hard blocker for better-sqlite3. 141b removes the problem entirely; no native deps = install anywhere, forever.

<!-- decision:P-ZXaUQRaS -->
### Conditional Tech Adoption Discipline
**When:** 2026-06-13 · **Fact:** `P-ZXaUQRaS`
**Why:** Prevents trading UX/performance for technical elegance or convenience on faith. Forces explicit data-driven decisions.

<!-- decision:P-9YGaCE66 -->
### Post-Merge Clean-Build Verification
**When:** 2026-06-14 · **Fact:** `P-9YGaCE66`
**Why:** Dev tree may have transient state; only a clean build from main branch proves the product is correct

<!-- decision:P-VREAaST9 -->
### vitest can show a module-resolution failure (Cannot find module /@id/...) on the
**When:** 2026-06-14 · **Fact:** `P-VREAaST9`
**Why:** It LOOKS like a test failure in CI/stress, and the lazy reflex is to wave it off as 'known transient' — but that exact reflex is what hid a real CodeQL high-sev alert on this same PR #179. Never assume transient.

<!-- decision:P-D7aTRN9U -->
### v0.3.1 Release: Final Workflow
**When:** 2026-06-14 · **Fact:** `P-D7aTRN9U`
**Why:** This is the fully mapped workflow for v0.3.1 release; provides a template for subsequent releases and ensures no steps are skipped.

<!-- decision:P-CFA7ZXAa -->
### Session 1 Post-Execution Guardrails
**When:** 2026-06-14 · **Fact:** `P-CFA7ZXAa`
**Why:** Confirms Stop hook and auto-memory extraction system are functioning; validates that durable facts are captured with reasoning sections

<!-- decision:P-4aRS5H6T -->
### Clean-Start Procedure for Session 1 Test
**When:** 2026-06-14 · **Fact:** `P-4aRS5H6T`
**Why:** Ensures B3/B4 cross-project persona capture can verify uv/ruff rule lands from zero; prevents pre-seeding contamination

<!-- decision:P-WaCZ7REY -->
### cmk install --with-semantic Scaffolds Semantic Recall
**When:** 2026-06-14 · **Fact:** `P-WaCZ7REY`
**Why:** Semantic search adds hybrid matching (keyword + semantic) to memory recall, improving relevance of facts retrieved across sessions.

<!-- decision:P-a2BSC7NG -->
### Description Field Length — Root Cause and Fix
**When:** 2026-06-14 · **Fact:** `P-a2BSC7NG`
**Why:** Long descriptions were silently breaking the YAML structure or exceeding token/parsing limits. This was discovered by code inspection (challenge 1: "Did you check the docs?").

<!-- decision:P-AaTGXLHE -->
### cmk install modes affect cold-open search behavior
**When:** 2026-06-14 · **Fact:** `P-AaTGXLHE`
**Why:** Testing fixes under different configurations than the original bug report creates false-negative risk (test appears to fail when fix is actually working)

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-ENQSa3T9 -->
### SonarCloud Zero-Coverage From Missing Cache Step
**When:** 2026-06-15 · **Fact:** `P-ENQSa3T9`
**Why:** Failure cascade was non-obvious and blocked the v0.3.1 gate; worth capturing for future SonarCloud troubleshooting.

<!-- decision:P-DY6aUA7A -->
### Task-Lane Consistency Audit Workflow
**When:** 2026-06-15 · **Fact:** `P-DY6aUA7A`
**Why:** Tasks can acquire lane context without being formally assigned to a version, creating shadow state. A side-by-side comparison of both files catches these silently-laned-but-unassigned tasks.

<!-- decision:P-YLWTT5aG -->
### TencentDB-Agent-Memory Write/Search Implementation Comparison
**When:** 2026-06-15 · **Fact:** `P-YLWTT5aG`
**Why:** Comparative code-level review of adjacent implementation reveals convergence areas (no action) and architectural alternatives (design patterns for roadmap).

<!-- decision:P-GATKYaHT -->
### Task 50 Research-Revisit Gate and Multi-Agent Pattern
**When:** 2026-06-15 · **Fact:** `P-GATKYaHT`
**Why:** Leverage existing multi-agent research; avoid re-derivation. Taskmaster provides actionable blueprints before Task 50 starts.

<!-- decision:P-ZDR9EQRa -->
### v0.4.x Versioning Roadmap
**When:** 2026-06-15 · **Fact:** `P-ZDR9EQRa`
**Why:** Clarifies v0.4.0 ships infrastructure + first integration. Explains tail strategy: agents are patch-level, numbered only at ship time.

<!-- decision:P-DYa3YF7X -->
### Qdrant Vector Database — Re-rejected (ADR-0015 reaffirmed)
**When:** 2026-06-15 · **Fact:** `P-DYa3YF7X`
**Why:** Prevents future re-litigations; clarifies architectural vs technical reasons for rejection

<!-- decision:P-FaMS2LTW -->
### D-144 (housekeeping) is the post-Task-129 step in the remaining v0.3.x queue
**When:** 2026-06-15 · **Fact:** `P-FaMS2LTW`

<!-- decision:P-aRUCEJ6E -->
### FTS5 Query Sanitization (Task 153)
**When:** 2026-06-15 · **Fact:** `P-aRUCEJ6E`
**Why:** production bug affecting search UX when version strings or dotted terms appear in queries

<!-- decision:P-JXRTNTaG -->
### v0.3.2 Scope Locked; Strict Task-Order Discipline
**When:** 2026-06-15 · **Fact:** `P-JXRTNTaG`
**Why:** Dependencies and risk management. Spike results for 141b decide whether it ships in v0.3.2 or defers to v0.3.3.

<!-- decision:P-2Qa3JA5W -->
### FTS5 Query Sanitization — Per-Token Quoting Design
**When:** 2026-06-15 · **Fact:** `P-2Qa3JA5W`
**Why:** Per-token quoting preserves implicit-AND between words (better recall for multi-word queries like "layered architecture"), while whole-query quoting forces strict phrase matching. Grounded in SQLite FTS5 primary docs.

<!-- decision:P-LaJYSMLa -->
### Reject ponytail plugin; philosophical conflict with project design
**When:** 2026-06-15 · **Fact:** `P-LaJYSMLa`
**Why:** The kit's value derives from deliberate rigor; Ponytail optimizes in the opposite direction. Adopting it would undermine the project's architectural philosophy and create decision-making conflicts on every tool/code choice.

<!-- decision:P-3C9V6a76 -->
### DECISIONS.md is append-only permanent journal not regenerated
**When:** 2026-06-15 · **Fact:** `P-3C9V6a76`
**Why:** Arrived at by reasoning through what happens when a decision-fact is superseded/forgotten over time. A regenerated-from-live DECISIONS.md (my first instinct, mirroring INDEX.md) would erase superseded decisions — destroying the journal's entire value (the why-we-changed trail). The MEMORY.md parking model also must NOT apply: old decisions are the MOST valuable part of a decision log, so it's unbounded and never rolls. Append-permanent for the journal vs regenerate for the digest — the difference IS the MEMORY.md-vs-decision-log distinction. Squad appends because it has no DB; the kit appends-with-structure (links/supersession/no-junk) because it does.

<!-- decision:P-Aa22MJAC -->
### semantic backend: sqlite-vec primary, zvec fallback
**When:** 2026-06-10 · **Fact:** `P-Aa22MJAC`
**Why:** sqlite-vec puts vectors inside the SQLite index the kit already runs (one store, design 9.3.1 fit); zvec is embedded+Node+Windows but its bindings are only ~May-2026 old

<!-- decision:P-N9BGGaK6 -->
### Transient Failure Retry Strategy
**When:** 2026-06-10 · **Fact:** `P-N9BGGaK6`
**Why:** A single transient delay can cause false negatives; 5 seconds is low-cost. Distinguishing jitter from real degradation prevents flaky CI while preserving signal for real b

<!-- decision:P-QXDNaC5U -->
### v0.3.0 is BUILD-COMPLETE (2026-06-10): Tasks 46/125/124/75(all)/104(all) shipped
**When:** 2026-06-10 · **Fact:** `P-QXDNaC5U`

<!-- decision:P-MHCAaYVG -->
### Cut-Gate Testing Guide (Manual Release QA)
**When:** 2026-06-10 · **Fact:** `P-MHCAaYVG`
**Why:** Encodes hard-won lessons (D-84, v0.2.0, Task-75) into repeatable process; prevents regression and avoids known gotchas; respects user's time with clear estimates and scope boundaries.

<!-- decision:P-a5W95QXS -->
### This file (docs/process/cut-gate.md) is their manual live-test guide for release
**When:** 2026-06-10 · **Fact:** `P-a5W95QXS`

<!-- decision:P-TaHaDQV7 -->
### B5/B7 Probe Footgun — settings.json Wholesale Overwrite
**When:** 2026-06-10 · **Fact:** `P-TaHaDQV7`
**Why:** Running B5/B7 in a working directory (not throwaway) corrupts configuration.

<!-- decision:P-aA5S5S2U -->
### User confirmed companion project approach for Task 127 aligns with kit philosoph
**When:** 2026-06-10 · **Fact:** `P-aA5S5S2U`

<!-- decision:P-ULTaWK4B -->
### Release Gate Structure (v0.3.0)
**When:** 2026-06-11 · **Fact:** `P-ULTaWK4B`
**Why:** D3's promotion to required blocker is a recent change; the next release cycle must respect this gate structure.

<!-- decision:P-Pa5RBNQ4 -->
### Release Git Choreography: Memory, Release, Tag (in order)
**When:** 2026-06-11 · **Fact:** `P-Pa5RBNQ4`
**Why:** Keeps the tree clean; release commits reflect versioning, not session metadata. Memory churn is incidental to development, not part of the release artifact.

<!-- decision:P-aLPJJGFL -->
### Separate Memory Captures from Release Commits
**When:** 2026-06-11 · **Fact:** `P-aLPJJGFL`
**Why:** Release commits should show only what went into the release — when auditing `release: vX.Y.Z` later, the commit should be uncluttered and reviewable as a pure version bump. Accumulated memory captures muddy that history.

<!-- decision:P-MZDaYRWX -->
### Requesting complete re-verification: check previous test gate outputs (gate7), r
**When:** 2026-06-11 · **Fact:** `P-MZDaYRWX`

<!-- decision:P-aN9PaSGC -->
### Validation Gate Structure (cut-gate9 Release)
**When:** 2026-06-11 · **Fact:** `P-aN9PaSGC`
**Why:** Standardized gates catch regressions; each check owns a specific concern. Automation verifies what it can; in-session UX and skip-prompt behavior require hands-on testing.

<!-- decision:P-7XKFaB2N -->
### Secret Leakage Defense-in-Depth Model
**When:** 2026-06-11 · **Fact:** `P-7XKFaB2N`
**Why:** No single filter is complete. Layering reduces likelihood accidental secrets reach git.

<!-- decision:P-RL2aKHKQ -->
### Prefers concise, numbered instructions without narrative explanation or backgrou
**When:** 2026-06-11 · **Fact:** `P-RL2aKHKQ`

<!-- decision:P-Za6L72JM -->
### canonicalize() Super-Linear Regex Hotspot
**When:** 2026-06-11 · **Fact:** `P-Za6L72JM`
**Why:** Confirmed real pattern, but execution is too constrained for practical risk. Behavior-identical fix ensures downstream stability.

<!-- decision:P-XQ9RYXaJ -->
### Backlog for v0.3.x and v0.4
**When:** 2026-06-11 · **Fact:** `P-XQ9RYXaJ`
**Why:** These tasks emerged from the quality gate review and are ready to schedule.

<!-- decision:P-9NaMaLE6 -->
### v0.3.0 Released With Green Quality Gate
**When:** 2026-06-11 · **Fact:** `P-9NaMaLE6`
**Why:** Marks completion of the quality gate enforcement for this release; establishes clean baseline for next session.

<!-- decision:P-4aaKKRKV -->
### PII Handling — Non-Adoption of Quarantine
**When:** 2026-06-11 · **Fact:** `P-4aaKKRKV`
**Why:** Kit's memory lives in git repos — privacy (discard-on-sight) is higher priority than quarantine-for-review UX

<!-- decision:P-NXF3aCPB -->
### Semantic Search vs. Grep Trade-Off (D-111 Design Rationale)
**When:** 2026-06-12 · **Fact:** `P-NXF3aCPB`
**Why:** The kit's semantic-search choice diverges from PAI despite shared philosophy. The decision is data-driven (benchmarked) and intentional, not a paradigm violation. Documents why the choice was made for future reconsideration.

<!-- decision:P-TUJKaAQ6 -->
### Autopilot Memory Consultation Architecture
**When:** 2026-06-12 · **Fact:** `P-TUJKaAQ6`
**Why:** Autopilot work must leverage memory without explicit asking; design balances autonomous value against deliberate human control over forget/queue decisions.

<!-- decision:P-DC97QaDC -->
### Pre-session verification found one composition bug (memory-search allow-list omi
**When:** 2026-06-12 · **Fact:** `P-DC97QaDC`

<!-- decision:P-BJQaGQ6H -->
### Iterative, thorough research approach—adds items even near session end rather th
**When:** 2026-06-12 · **Fact:** `P-BJQaGQ6H`

<!-- decision:P-A6XDaDHA -->
### Kit Feature Gap — Chronological Decision Rendering
**When:** 2026-06-12 · **Fact:** `P-A6XDaDHA`
**Why:** That both the kit and Squad independently maintain chronological journals indicates this view type is valuable beyond individual-fact retrieval. The gap is a missed product feature—a natural extension of `cmk digest`.

<!-- decision:P-7RQTaMU4 -->
### Kit's Decision Log — Manual Maintenance Pattern
**When:** 2026-06-12 · **Fact:** `P-7RQTaMU4`
**Why:** Both the kit team and peer projects (Squad) independently maintain chronological decision journals, suggesting this narrative form provides value that individual-fact storage doesn't. The kit chose to keep D-log authoritative rather than migrate to the fact model.

<!-- decision:P-XTLTaX5C -->
### Decision-Journal View Gap — Now Task 147
**When:** 2026-06-12 · **Fact:** `P-XTLTaX5C`
**Why:** User pattern discovery — manual decision journaling across multiple teams signals a real user need the kit doesn't yet meet

<!-- decision:P-aUDDN4WP -->
### Task 147 design upgraded: the kit gets a STANDING committed context/DECISIONS.md
**When:** 2026-06-12 · **Fact:** `P-aUDDN4WP`
**Why:** A standing journal puts each decision line in the PR diff that captured it (reviewable), travels with git clone, and needs no tooling to read - the same reasons the build repo hand-maintains its own DECISION-LOG

<!-- decision:P-ZRQRa277 -->
### kit needs decisions.md feature
**When:** 2026-06-12 · **Fact:** `P-ZRQRa277`

<!-- decision:P-7FV4EYaW -->
### npm v12 Script Approval: Project vs. Global Configuration Paths
**When:** 2026-06-12 · **Fact:** `P-7FV4EYaW`
**Why:** Dual-path architecture means different remediation per install type. Verified against GitHub changelog (2026-06-09) and community discussion #198547.

<!-- decision:P-BDES4aW7 -->
### Install-time consent for better-sqlite3 binding (replaces error → doctor round-trip)
**When:** 2026-06-12 · **Fact:** `P-BDES4aW7`
**Why:** User objected to original UX (npm install error → doctor command → error again → discovery left to an obscure tool). This change prioritizes inline, immediate resolution at the moment of install. Their feedback shaped the design before it shipped.

<!-- decision:P-XBB4aELR -->
### Dependabot Cannot Approve allowScripts in Strict Repos
**When:** 2026-06-12 · **Fact:** `P-XBB4aELR`
**Why:** Affects approval fatigue and long-term security posture in strict-mode npm repos.

<!-- decision:P-aZH2NRSE -->
### Task Pipeline Stages
**When:** 2026-06-12 · **Fact:** `P-aZH2NRSE`
**Why:** Recurring structure observed across Tasks 74, 144, 145; understanding stages helps predict throughput and identify bottlenecks

<!-- decision:P-E6J7aYH5 -->
### skill-review Imported-Facts Staleness Bug Fixed
**When:** 2026-06-12 · **Fact:** `P-E6J7aYH5`
**Why:** Correctness of the memory system depends on imported facts remaining fresh. This bug threatened that invariant.

<!-- decision:P-2aD2YHMB -->
### Modular Skill Architecture: Read/Write Separation
**When:** 2026-06-13 · **Fact:** `P-2aD2YHMB`
**Why:** Separating read from write reduces blast radius and prevents accidental memory corruption. The boundary is a first-class design principle, not an implementation detail.

<!-- decision:P-2JMVXJ3a -->
### Task 146: Concurrent Swarm Support Testing
**When:** 2026-06-13 · **Fact:** `P-2JMVXJ3a`
**Why:** The kit's strength is as a shared memory layer for many independent agents. Concurrent safety is the missing validation needed before swarm support is proven.

<!-- decision:P-4aG26CRV -->
### npm 12 & the 141a/141b Migration Strategy
**When:** 2026-06-13 · **Fact:** `P-4aG26CRV`
**Why:** npm-12 is a hard blocker for better-sqlite3. 141b removes the problem entirely; no native deps = install anywhere, forever.

<!-- decision:P-ZXaUQRaS -->
### Conditional Tech Adoption Discipline
**When:** 2026-06-13 · **Fact:** `P-ZXaUQRaS`
**Why:** Prevents trading UX/performance for technical elegance or convenience on faith. Forces explicit data-driven decisions.

<!-- decision:P-9YGaCE66 -->
### Post-Merge Clean-Build Verification
**When:** 2026-06-14 · **Fact:** `P-9YGaCE66`
**Why:** Dev tree may have transient state; only a clean build from main branch proves the product is correct

<!-- decision:P-VREAaST9 -->
### vitest can show a module-resolution failure (Cannot find module /@id/...) on the
**When:** 2026-06-14 · **Fact:** `P-VREAaST9`
**Why:** It LOOKS like a test failure in CI/stress, and the lazy reflex is to wave it off as 'known transient' — but that exact reflex is what hid a real CodeQL high-sev alert on this same PR #179. Never assume transient.

<!-- decision:P-D7aTRN9U -->
### v0.3.1 Release: Final Workflow
**When:** 2026-06-14 · **Fact:** `P-D7aTRN9U`
**Why:** This is the fully mapped workflow for v0.3.1 release; provides a template for subsequent releases and ensures no steps are skipped.

<!-- decision:P-CFA7ZXAa -->
### Session 1 Post-Execution Guardrails
**When:** 2026-06-14 · **Fact:** `P-CFA7ZXAa`
**Why:** Confirms Stop hook and auto-memory extraction system are functioning; validates that durable facts are captured with reasoning sections

<!-- decision:P-4aRS5H6T -->
### Clean-Start Procedure for Session 1 Test
**When:** 2026-06-14 · **Fact:** `P-4aRS5H6T`
**Why:** Ensures B3/B4 cross-project persona capture can verify uv/ruff rule lands from zero; prevents pre-seeding contamination

<!-- decision:P-WaCZ7REY -->
### cmk install --with-semantic Scaffolds Semantic Recall
**When:** 2026-06-14 · **Fact:** `P-WaCZ7REY`
**Why:** Semantic search adds hybrid matching (keyword + semantic) to memory recall, improving relevance of facts retrieved across sessions.

<!-- decision:P-a2BSC7NG -->
### Description Field Length — Root Cause and Fix
**When:** 2026-06-14 · **Fact:** `P-a2BSC7NG`
**Why:** Long descriptions were silently breaking the YAML structure or exceeding token/parsing limits. This was discovered by code inspection (challenge 1: "Did you check the docs?").

<!-- decision:P-AaTGXLHE -->
### cmk install modes affect cold-open search behavior
**When:** 2026-06-14 · **Fact:** `P-AaTGXLHE`
**Why:** Testing fixes under different configurations than the original bug report creates false-negative risk (test appears to fail when fix is actually working)

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-ENQSa3T9 -->
### SonarCloud Zero-Coverage From Missing Cache Step
**When:** 2026-06-15 · **Fact:** `P-ENQSa3T9`
**Why:** Failure cascade was non-obvious and blocked the v0.3.1 gate; worth capturing for future SonarCloud troubleshooting.

<!-- decision:P-DY6aUA7A -->
### Task-Lane Consistency Audit Workflow
**When:** 2026-06-15 · **Fact:** `P-DY6aUA7A`
**Why:** Tasks can acquire lane context without being formally assigned to a version, creating shadow state. A side-by-side comparison of both files catches these silently-laned-but-unassigned tasks.

<!-- decision:P-YLWTT5aG -->
### TencentDB-Agent-Memory Write/Search Implementation Comparison
**When:** 2026-06-15 · **Fact:** `P-YLWTT5aG`
**Why:** Comparative code-level review of adjacent implementation reveals convergence areas (no action) and architectural alternatives (design patterns for roadmap).

<!-- decision:P-GATKYaHT -->
### Task 50 Research-Revisit Gate and Multi-Agent Pattern
**When:** 2026-06-15 · **Fact:** `P-GATKYaHT`
**Why:** Leverage existing multi-agent research; avoid re-derivation. Taskmaster provides actionable blueprints before Task 50 starts.

<!-- decision:P-ZDR9EQRa -->
### v0.4.x Versioning Roadmap
**When:** 2026-06-15 · **Fact:** `P-ZDR9EQRa`
**Why:** Clarifies v0.4.0 ships infrastructure + first integration. Explains tail strategy: agents are patch-level, numbered only at ship time.

<!-- decision:P-DYa3YF7X -->
### Qdrant Vector Database — Re-rejected (ADR-0015 reaffirmed)
**When:** 2026-06-15 · **Fact:** `P-DYa3YF7X`
**Why:** Prevents future re-litigations; clarifies architectural vs technical reasons for rejection

<!-- decision:P-FaMS2LTW -->
### D-144 (housekeeping) is the post-Task-129 step in the remaining v0.3.x queue
**When:** 2026-06-15 · **Fact:** `P-FaMS2LTW`

<!-- decision:P-aRUCEJ6E -->
### FTS5 Query Sanitization (Task 153)
**When:** 2026-06-15 · **Fact:** `P-aRUCEJ6E`
**Why:** production bug affecting search UX when version strings or dotted terms appear in queries

<!-- decision:P-JXRTNTaG -->
### v0.3.2 Scope Locked; Strict Task-Order Discipline
**When:** 2026-06-15 · **Fact:** `P-JXRTNTaG`
**Why:** Dependencies and risk management. Spike results for 141b decide whether it ships in v0.3.2 or defers to v0.3.3.

<!-- decision:P-2Qa3JA5W -->
### FTS5 Query Sanitization — Per-Token Quoting Design
**When:** 2026-06-15 · **Fact:** `P-2Qa3JA5W`
**Why:** Per-token quoting preserves implicit-AND between words (better recall for multi-word queries like "layered architecture"), while whole-query quoting forces strict phrase matching. Grounded in SQLite FTS5 primary docs.

<!-- decision:P-LaJYSMLa -->
### Reject ponytail plugin; philosophical conflict with project design
**When:** 2026-06-15 · **Fact:** `P-LaJYSMLa`
**Why:** The kit's value derives from deliberate rigor; Ponytail optimizes in the opposite direction. Adopting it would undermine the project's architectural philosophy and create decision-making conflicts on every tool/code choice.

<!-- decision:P-3C9V6a76 -->
### DECISIONS.md is append-only permanent journal not regenerated
**When:** 2026-06-15 · **Fact:** `P-3C9V6a76`
**Why:** Arrived at by reasoning through what happens when a decision-fact is superseded/forgotten over time. A regenerated-from-live DECISIONS.md (my first instinct, mirroring INDEX.md) would erase superseded decisions — destroying the journal's entire value (the why-we-changed trail). The MEMORY.md parking model also must NOT apply: old decisions are the MOST valuable part of a decision log, so it's unbounded and never rolls. Append-permanent for the journal vs regenerate for the digest — the difference IS the MEMORY.md-vs-decision-log distinction. Squad appends because it has no DB; the kit appends-with-structure (links/supersession/no-junk) because it does.

<!-- decision:P-Aa22MJAC -->
### semantic backend: sqlite-vec primary, zvec fallback
**When:** 2026-06-10 · **Fact:** `P-Aa22MJAC`
**Why:** sqlite-vec puts vectors inside the SQLite index the kit already runs (one store, design 9.3.1 fit); zvec is embedded+Node+Windows but its bindings are only ~May-2026 old

<!-- decision:P-N9BGGaK6 -->
### Transient Failure Retry Strategy
**When:** 2026-06-10 · **Fact:** `P-N9BGGaK6`
**Why:** A single transient delay can cause false negatives; 5 seconds is low-cost. Distinguishing jitter from real degradation prevents flaky CI while preserving signal for real b

<!-- decision:P-QXDNaC5U -->
### v0.3.0 is BUILD-COMPLETE (2026-06-10): Tasks 46/125/124/75(all)/104(all) shipped
**When:** 2026-06-10 · **Fact:** `P-QXDNaC5U`

<!-- decision:P-MHCAaYVG -->
### Cut-Gate Testing Guide (Manual Release QA)
**When:** 2026-06-10 · **Fact:** `P-MHCAaYVG`
**Why:** Encodes hard-won lessons (D-84, v0.2.0, Task-75) into repeatable process; prevents regression and avoids known gotchas; respects user's time with clear estimates and scope boundaries.

<!-- decision:P-a5W95QXS -->
### This file (docs/process/cut-gate.md) is their manual live-test guide for release
**When:** 2026-06-10 · **Fact:** `P-a5W95QXS`

<!-- decision:P-TaHaDQV7 -->
### B5/B7 Probe Footgun — settings.json Wholesale Overwrite
**When:** 2026-06-10 · **Fact:** `P-TaHaDQV7`
**Why:** Running B5/B7 in a working directory (not throwaway) corrupts configuration.

<!-- decision:P-aA5S5S2U -->
### User confirmed companion project approach for Task 127 aligns with kit philosoph
**When:** 2026-06-10 · **Fact:** `P-aA5S5S2U`

<!-- decision:P-ULTaWK4B -->
### Release Gate Structure (v0.3.0)
**When:** 2026-06-11 · **Fact:** `P-ULTaWK4B`
**Why:** D3's promotion to required blocker is a recent change; the next release cycle must respect this gate structure.

<!-- decision:P-Pa5RBNQ4 -->
### Release Git Choreography: Memory, Release, Tag (in order)
**When:** 2026-06-11 · **Fact:** `P-Pa5RBNQ4`
**Why:** Keeps the tree clean; release commits reflect versioning, not session metadata. Memory churn is incidental to development, not part of the release artifact.

<!-- decision:P-aLPJJGFL -->
### Separate Memory Captures from Release Commits
**When:** 2026-06-11 · **Fact:** `P-aLPJJGFL`
**Why:** Release commits should show only what went into the release — when auditing `release: vX.Y.Z` later, the commit should be uncluttered and reviewable as a pure version bump. Accumulated memory captures muddy that history.

<!-- decision:P-MZDaYRWX -->
### Requesting complete re-verification: check previous test gate outputs (gate7), r
**When:** 2026-06-11 · **Fact:** `P-MZDaYRWX`

<!-- decision:P-aN9PaSGC -->
### Validation Gate Structure (cut-gate9 Release)
**When:** 2026-06-11 · **Fact:** `P-aN9PaSGC`
**Why:** Standardized gates catch regressions; each check owns a specific concern. Automation verifies what it can; in-session UX and skip-prompt behavior require hands-on testing.

<!-- decision:P-7XKFaB2N -->
### Secret Leakage Defense-in-Depth Model
**When:** 2026-06-11 · **Fact:** `P-7XKFaB2N`
**Why:** No single filter is complete. Layering reduces likelihood accidental secrets reach git.

<!-- decision:P-RL2aKHKQ -->
### Prefers concise, numbered instructions without narrative explanation or backgrou
**When:** 2026-06-11 · **Fact:** `P-RL2aKHKQ`

<!-- decision:P-Za6L72JM -->
### canonicalize() Super-Linear Regex Hotspot
**When:** 2026-06-11 · **Fact:** `P-Za6L72JM`
**Why:** Confirmed real pattern, but execution is too constrained for practical risk. Behavior-identical fix ensures downstream stability.

<!-- decision:P-XQ9RYXaJ -->
### Backlog for v0.3.x and v0.4
**When:** 2026-06-11 · **Fact:** `P-XQ9RYXaJ`
**Why:** These tasks emerged from the quality gate review and are ready to schedule.

<!-- decision:P-9NaMaLE6 -->
### v0.3.0 Released With Green Quality Gate
**When:** 2026-06-11 · **Fact:** `P-9NaMaLE6`
**Why:** Marks completion of the quality gate enforcement for this release; establishes clean baseline for next session.

<!-- decision:P-4aaKKRKV -->
### PII Handling — Non-Adoption of Quarantine
**When:** 2026-06-11 · **Fact:** `P-4aaKKRKV`
**Why:** Kit's memory lives in git repos — privacy (discard-on-sight) is higher priority than quarantine-for-review UX

<!-- decision:P-NXF3aCPB -->
### Semantic Search vs. Grep Trade-Off (D-111 Design Rationale)
**When:** 2026-06-12 · **Fact:** `P-NXF3aCPB`
**Why:** The kit's semantic-search choice diverges from PAI despite shared philosophy. The decision is data-driven (benchmarked) and intentional, not a paradigm violation. Documents why the choice was made for future reconsideration.

<!-- decision:P-TUJKaAQ6 -->
### Autopilot Memory Consultation Architecture
**When:** 2026-06-12 · **Fact:** `P-TUJKaAQ6`
**Why:** Autopilot work must leverage memory without explicit asking; design balances autonomous value against deliberate human control over forget/queue decisions.

<!-- decision:P-DC97QaDC -->
### Pre-session verification found one composition bug (memory-search allow-list omi
**When:** 2026-06-12 · **Fact:** `P-DC97QaDC`

<!-- decision:P-BJQaGQ6H -->
### Iterative, thorough research approach—adds items even near session end rather th
**When:** 2026-06-12 · **Fact:** `P-BJQaGQ6H`

<!-- decision:P-A6XDaDHA -->
### Kit Feature Gap — Chronological Decision Rendering
**When:** 2026-06-12 · **Fact:** `P-A6XDaDHA`
**Why:** That both the kit and Squad independently maintain chronological journals indicates this view type is valuable beyond individual-fact retrieval. The gap is a missed product feature—a natural extension of `cmk digest`.

<!-- decision:P-7RQTaMU4 -->
### Kit's Decision Log — Manual Maintenance Pattern
**When:** 2026-06-12 · **Fact:** `P-7RQTaMU4`
**Why:** Both the kit team and peer projects (Squad) independently maintain chronological decision journals, suggesting this narrative form provides value that individual-fact storage doesn't. The kit chose to keep D-log authoritative rather than migrate to the fact model.

<!-- decision:P-XTLTaX5C -->
### Decision-Journal View Gap — Now Task 147
**When:** 2026-06-12 · **Fact:** `P-XTLTaX5C`
**Why:** User pattern discovery — manual decision journaling across multiple teams signals a real user need the kit doesn't yet meet

<!-- decision:P-aUDDN4WP -->
### Task 147 design upgraded: the kit gets a STANDING committed context/DECISIONS.md
**When:** 2026-06-12 · **Fact:** `P-aUDDN4WP`
**Why:** A standing journal puts each decision line in the PR diff that captured it (reviewable), travels with git clone, and needs no tooling to read - the same reasons the build repo hand-maintains its own DECISION-LOG

<!-- decision:P-ZRQRa277 -->
### kit needs decisions.md feature
**When:** 2026-06-12 · **Fact:** `P-ZRQRa277`

<!-- decision:P-7FV4EYaW -->
### npm v12 Script Approval: Project vs. Global Configuration Paths
**When:** 2026-06-12 · **Fact:** `P-7FV4EYaW`
**Why:** Dual-path architecture means different remediation per install type. Verified against GitHub changelog (2026-06-09) and community discussion #198547.

<!-- decision:P-BDES4aW7 -->
### Install-time consent for better-sqlite3 binding (replaces error → doctor round-trip)
**When:** 2026-06-12 · **Fact:** `P-BDES4aW7`
**Why:** User objected to original UX (npm install error → doctor command → error again → discovery left to an obscure tool). This change prioritizes inline, immediate resolution at the moment of install. Their feedback shaped the design before it shipped.

<!-- decision:P-XBB4aELR -->
### Dependabot Cannot Approve allowScripts in Strict Repos
**When:** 2026-06-12 · **Fact:** `P-XBB4aELR`
**Why:** Affects approval fatigue and long-term security posture in strict-mode npm repos.

<!-- decision:P-aZH2NRSE -->
### Task Pipeline Stages
**When:** 2026-06-12 · **Fact:** `P-aZH2NRSE`
**Why:** Recurring structure observed across Tasks 74, 144, 145; understanding stages helps predict throughput and identify bottlenecks

<!-- decision:P-E6J7aYH5 -->
### skill-review Imported-Facts Staleness Bug Fixed
**When:** 2026-06-12 · **Fact:** `P-E6J7aYH5`
**Why:** Correctness of the memory system depends on imported facts remaining fresh. This bug threatened that invariant.

<!-- decision:P-2aD2YHMB -->
### Modular Skill Architecture: Read/Write Separation
**When:** 2026-06-13 · **Fact:** `P-2aD2YHMB`
**Why:** Separating read from write reduces blast radius and prevents accidental memory corruption. The boundary is a first-class design principle, not an implementation detail.

<!-- decision:P-2JMVXJ3a -->
### Task 146: Concurrent Swarm Support Testing
**When:** 2026-06-13 · **Fact:** `P-2JMVXJ3a`
**Why:** The kit's strength is as a shared memory layer for many independent agents. Concurrent safety is the missing validation needed before swarm support is proven.

<!-- decision:P-4aG26CRV -->
### npm 12 & the 141a/141b Migration Strategy
**When:** 2026-06-13 · **Fact:** `P-4aG26CRV`
**Why:** npm-12 is a hard blocker for better-sqlite3. 141b removes the problem entirely; no native deps = install anywhere, forever.

<!-- decision:P-ZXaUQRaS -->
### Conditional Tech Adoption Discipline
**When:** 2026-06-13 · **Fact:** `P-ZXaUQRaS`
**Why:** Prevents trading UX/performance for technical elegance or convenience on faith. Forces explicit data-driven decisions.

<!-- decision:P-9YGaCE66 -->
### Post-Merge Clean-Build Verification
**When:** 2026-06-14 · **Fact:** `P-9YGaCE66`
**Why:** Dev tree may have transient state; only a clean build from main branch proves the product is correct

<!-- decision:P-VREAaST9 -->
### vitest can show a module-resolution failure (Cannot find module /@id/...) on the
**When:** 2026-06-14 · **Fact:** `P-VREAaST9`
**Why:** It LOOKS like a test failure in CI/stress, and the lazy reflex is to wave it off as 'known transient' — but that exact reflex is what hid a real CodeQL high-sev alert on this same PR #179. Never assume transient.

<!-- decision:P-D7aTRN9U -->
### v0.3.1 Release: Final Workflow
**When:** 2026-06-14 · **Fact:** `P-D7aTRN9U`
**Why:** This is the fully mapped workflow for v0.3.1 release; provides a template for subsequent releases and ensures no steps are skipped.

<!-- decision:P-CFA7ZXAa -->
### Session 1 Post-Execution Guardrails
**When:** 2026-06-14 · **Fact:** `P-CFA7ZXAa`
**Why:** Confirms Stop hook and auto-memory extraction system are functioning; validates that durable facts are captured with reasoning sections

<!-- decision:P-4aRS5H6T -->
### Clean-Start Procedure for Session 1 Test
**When:** 2026-06-14 · **Fact:** `P-4aRS5H6T`
**Why:** Ensures B3/B4 cross-project persona capture can verify uv/ruff rule lands from zero; prevents pre-seeding contamination

<!-- decision:P-WaCZ7REY -->
### cmk install --with-semantic Scaffolds Semantic Recall
**When:** 2026-06-14 · **Fact:** `P-WaCZ7REY`
**Why:** Semantic search adds hybrid matching (keyword + semantic) to memory recall, improving relevance of facts retrieved across sessions.

<!-- decision:P-a2BSC7NG -->
### Description Field Length — Root Cause and Fix
**When:** 2026-06-14 · **Fact:** `P-a2BSC7NG`
**Why:** Long descriptions were silently breaking the YAML structure or exceeding token/parsing limits. This was discovered by code inspection (challenge 1: "Did you check the docs?").

<!-- decision:P-AaTGXLHE -->
### cmk install modes affect cold-open search behavior
**When:** 2026-06-14 · **Fact:** `P-AaTGXLHE`
**Why:** Testing fixes under different configurations than the original bug report creates false-negative risk (test appears to fail when fix is actually working)

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-ENQSa3T9 -->
### SonarCloud Zero-Coverage From Missing Cache Step
**When:** 2026-06-15 · **Fact:** `P-ENQSa3T9`
**Why:** Failure cascade was non-obvious and blocked the v0.3.1 gate; worth capturing for future SonarCloud troubleshooting.

<!-- decision:P-DY6aUA7A -->
### Task-Lane Consistency Audit Workflow
**When:** 2026-06-15 · **Fact:** `P-DY6aUA7A`
**Why:** Tasks can acquire lane context without being formally assigned to a version, creating shadow state. A side-by-side comparison of both files catches these silently-laned-but-unassigned tasks.

<!-- decision:P-YLWTT5aG -->
### TencentDB-Agent-Memory Write/Search Implementation Comparison
**When:** 2026-06-15 · **Fact:** `P-YLWTT5aG`
**Why:** Comparative code-level review of adjacent implementation reveals convergence areas (no action) and architectural alternatives (design patterns for roadmap).

<!-- decision:P-GATKYaHT -->
### Task 50 Research-Revisit Gate and Multi-Agent Pattern
**When:** 2026-06-15 · **Fact:** `P-GATKYaHT`
**Why:** Leverage existing multi-agent research; avoid re-derivation. Taskmaster provides actionable blueprints before Task 50 starts.

<!-- decision:P-ZDR9EQRa -->
### v0.4.x Versioning Roadmap
**When:** 2026-06-15 · **Fact:** `P-ZDR9EQRa`
**Why:** Clarifies v0.4.0 ships infrastructure + first integration. Explains tail strategy: agents are patch-level, numbered only at ship time.

<!-- decision:P-DYa3YF7X -->
### Qdrant Vector Database — Re-rejected (ADR-0015 reaffirmed)
**When:** 2026-06-15 · **Fact:** `P-DYa3YF7X`
**Why:** Prevents future re-litigations; clarifies architectural vs technical reasons for rejection

<!-- decision:P-FaMS2LTW -->
### D-144 (housekeeping) is the post-Task-129 step in the remaining v0.3.x queue
**When:** 2026-06-15 · **Fact:** `P-FaMS2LTW`

<!-- decision:P-aRUCEJ6E -->
### FTS5 Query Sanitization (Task 153)
**When:** 2026-06-15 · **Fact:** `P-aRUCEJ6E`
**Why:** production bug affecting search UX when version strings or dotted terms appear in queries

<!-- decision:P-JXRTNTaG -->
### v0.3.2 Scope Locked; Strict Task-Order Discipline
**When:** 2026-06-15 · **Fact:** `P-JXRTNTaG`
**Why:** Dependencies and risk management. Spike results for 141b decide whether it ships in v0.3.2 or defers to v0.3.3.

<!-- decision:P-2Qa3JA5W -->
### FTS5 Query Sanitization — Per-Token Quoting Design
**When:** 2026-06-15 · **Fact:** `P-2Qa3JA5W`
**Why:** Per-token quoting preserves implicit-AND between words (better recall for multi-word queries like "layered architecture"), while whole-query quoting forces strict phrase matching. Grounded in SQLite FTS5 primary docs.

<!-- decision:P-LaJYSMLa -->
### Reject ponytail plugin; philosophical conflict with project design
**When:** 2026-06-15 · **Fact:** `P-LaJYSMLa`
**Why:** The kit's value derives from deliberate rigor; Ponytail optimizes in the opposite direction. Adopting it would undermine the project's architectural philosophy and create decision-making conflicts on every tool/code choice.

<!-- decision:P-3C9V6a76 -->
### DECISIONS.md is append-only permanent journal not regenerated
**When:** 2026-06-15 · **Fact:** `P-3C9V6a76`
**Why:** Arrived at by reasoning through what happens when a decision-fact is superseded/forgotten over time. A regenerated-from-live DECISIONS.md (my first instinct, mirroring INDEX.md) would erase superseded decisions — destroying the journal's entire value (the why-we-changed trail). The MEMORY.md parking model also must NOT apply: old decisions are the MOST valuable part of a decision log, so it's unbounded and never rolls. Append-permanent for the journal vs regenerate for the digest — the difference IS the MEMORY.md-vs-decision-log distinction. Squad appends because it has no DB; the kit appends-with-structure (links/supersession/no-junk) because it does.

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-YL3LWC69 -->
### D-126 (.gitattributes CRLF prevention follow-up) is the final v0.3.x queue item
**When:** 2026-06-15 · **Fact:** `P-YL3LWC69`

<!-- decision:P-YUCE6EAH -->
### Merge workflow for this PR: squash merge + delete branch
**When:** 2026-06-15 · **Fact:** `P-YUCE6EAH`

<!-- decision:P-9SN5DHQT -->
### For v0.3.2, only proceed with node:sqlite migration (141b) if perf tests show p9
**When:** 2026-06-15 · **Fact:** `P-9SN5DHQT`

<!-- decision:P-TLTURYF7 -->
### Start v0.3.2 now and include Task 153 (FTS5 parse fix) in this release
**When:** 2026-06-15 · **Fact:** `P-TLTURYF7`

<!-- decision:P-ZVQEMWJA -->
### Confirmed proposed v0.3.2 scope is better (tasks 153, 152, 134, gitattributes, c
**When:** 2026-06-15 · **Fact:** `P-ZVQEMWJA`

<!-- decision:P-F94ZJMYV -->
### Always monitor CI without asking for permission or pausing to confirm; this is t
**When:** 2026-06-15 · **Fact:** `P-F94ZJMYV`

<!-- decision:P-TAPT7BH7 -->
### Expand condensed content to 2 lines when it feels cramped; prioritize breathing
**When:** 2026-06-15 · **Fact:** `P-TAPT7BH7`

<!-- decision:P-7Q5U4XTK -->
### Rename README section "What it does" to "Features" — clearer language for capabi
**When:** 2026-06-15 · **Fact:** `P-7Q5U4XTK`

<!-- decision:P-SC3W3ZDV -->
### Autopilot merge rules for install-surface changes
**When:** 2026-06-15 · **Fact:** `P-SC3W3ZDV`
**Why:** Future sessions need to know which changes require user approval and which proceed automatically, to avoid unintended ship-surface deployments.

<!-- decision:P-T42VTJBJ -->
### Task 141b spike results node:sqlite migration
**When:** 2026-06-15 · **Fact:** `P-T42VTJBJ`
**Why:** The three 141b gates were the precondition for the node:sqlite migration. Two pass cleanly; the perf gate is inconclusive on this hardware (noise >> the 3% bar). Cherry-picking a passing run would be the lazy-framing failure — the honest result is 'can't measure 3% here.' The decision now needs either a clean machine or a user call on other grounds.

<!-- decision:P-3U4WSVEM -->
### Autopilot Stop-Condition for Install-Surface Decisions
**When:** 2026-06-15 · **Fact:** `P-3U4WSVEM`
**Why:** Install-surface changes have high blast radius and warrant explicit user judgment.

<!-- decision:P-DSRXEXRL -->
### Task 141b Spike Results — Perf Inconclusive on Dev Machine
**When:** 2026-06-15 · **Fact:** `P-DSRXEXRL`
**Why:** Stable measurement impossible on variable dev machine. Cannot proceed without clean data (guessing or cherry-picking would be the trap).

<!-- decision:P-AE2R9TUU -->
### v0.3.2 Release Status
**When:** 2026-06-15 · **Fact:** `P-AE2R9TUU`
**Why:** v0.3.2 is release-ready without 141b. Task 141a already covers npm-12 pain. 141b ships later with stable perf data.

<!-- decision:P-PMJYQEC5 -->
### sqlite-vec Incompatibility Between better-sqlite3 and node:sqlite
**When:** 2026-06-15 · **Fact:** `P-PMJYQEC5`
**Why:** Explains why the 141b benchmark produced ±50% variance and why detecting the target 3% perf difference was impossible. Documents a hard constraint on how these libraries can be compared.

<!-- decision:P-66XJQTaM -->
### Benchmark Noise Floor on Dev Laptop
**When:** 2026-06-15 · **Fact:** `P-66XJQTaM`
**Why:** Migration 141b depends on verifying D-147. The user will not push an unverified gate; data quality is the blocker.

<!-- decision:P-5UJHaH4F -->
### Benchmark Harness Noise Floor Rule (3% RSD threshold)
**When:** 2026-06-15 · **Fact:** `P-5UJHaH4F`
**Why:** Implemented to ensure harness honesty after the user's earlier question "do you get the same results?" This prevents false verdicts on noisy hardware and makes measurement limits transparent.

<!-- decision:P-5NZCD94Q -->
### v0.3.2 Release Scope and 141b Gate
**When:** 2026-06-16 · **Fact:** `P-5NZCD94Q`
**Why:** v0.3.2 scope is locked; 141b is the sole pending decision before release can be cut

<!-- decision:P-CUV74RDV -->
### Task 141b node:sqlite migration rejected on perf
**When:** 2026-06-16 · **Fact:** `P-CUV74RDV`
**Why:** The whole migration was gated on D-147's three spikes; the perf gate is decisive. CI gave clean measurement (noise « the 3% bar) showing node:sqlite is ~10% slower on FTS5 keyword search — the hot path users pay every query. The kit's core purpose is fast local recall; a permanent 10% search regression to avoid a one-time npm-12 install prompt is the wrong trade (the user's settled principle). This closes 141b honestly on real data, not laptop noise.

<!-- decision:P-WB2VQPWN -->
### 141b Is Rejected — Decision Rationale
**When:** 2026-06-16 · **Fact:** `P-WB2VQPWN`
**Why:** Decision grounded in clean, repeatable CI data. User's persistent questioning of noisy laptop results led to escalating to CI, which provided the definitive answer.

<!-- decision:P-LF5GNVaZ -->
### CI Triggering Capability
**When:** 2026-06-16 · **Fact:** `P-LF5GNVaZ`
**Why:** Assistant was over-cautious about automation scope. This capability exists and is faster than asking user to click.

<!-- decision:P-6AW7LDQH -->
### v0.3.2 Release Scope Locked
**When:** 2026-06-16 · **Fact:** `P-6AW7LDQH`
**Why:** All planned tasks completed; 141b rejected on clean data. Release is unblocked pending manual tag push.

<!-- decision:P-B4CANFVU -->
### Cut-Gate Verification Probes
**When:** 2026-06-16 · **Fact:** `P-B4CANFVU`
**Why:** These probes verify the built artifact before publishing. Knowing their names helps locate them in the release guide.

<!-- decision:P-7T2BCHL6 -->
### Release Workflow: Commit, Cut-Gate, Tag-Push
**When:** 2026-06-16 · **Fact:** `P-7T2BCHL6`
**Why:** This is the repeatable release process. Capturing the workflow and ownership boundaries avoids re-deriving at the next release.

<!-- decision:P-AUF4MDTR -->
### Doctor Health Check Baseline (Fresh Install)
**When:** 2026-06-16 · **Fact:** `P-AUF4MDTR`
**Why:** Distinguishes expected vs. actual health issues early in setup validation.

<!-- decision:P-FGJMCQNP -->
### v0.3.2 New Validation Gates
**When:** 2026-06-16 · **Fact:** `P-FGJMCQNP`
**Why:** These are new features shipped in 0.3.2; knowing their guide locations ensures they are tested during release validation.

<!-- decision:P-6VTN4QSS -->
### Windows npm Uninstall – better_sqlite3.node Lock
**When:** 2026-06-16 · **Fact:** `P-6VTN4QSS`
**Why:** Helps distinguish a non-blocker (EPERM on .node) from actual failures during uninstall/install cycles.

<!-- decision:P-2CFEBV9Y -->
### Cut-Gate Pre-Release Validation Checklist (G0-G7)
**When:** 2026-06-16 · **Fact:** `P-2CFEBV9Y`
**Why:** These gates catch breaking changes, misconfiguration, and integration regressions before user-facing Session 1. They form the kit's cut validation checklist.

<!-- decision:P-5PC4DaJF -->
### Windows npm Uninstall EPERM With better_sqlite3
**When:** 2026-06-16 · **Fact:** `P-5PC4DaJF`
**Why:** EPERM during teardown/rebuild is a frequent false alarm on Windows. Knowing it is harmless and expected prevents misdiagnosis and unnecessary re-runs.

<!-- decision:P-6JFTXAPN -->
### G4 Gate Upgraded to Mandatory Full-Sweep
**When:** 2026-06-16 · **Fact:** `P-6JFTXAPN`
**Why:** Prevent accidentally committed secrets/paths in public release. The upgrade ensures this cannot be missed.

<!-- decision:P-DRaNKRTM -->
### Three-Tier Memory Architecture
**When:** 2026-06-16 · **Fact:** `P-DRaNKRTM`
**Why:** Understanding the tier structure is essential for correct memory placement and avoiding committed-tier leaks.

<!-- decision:P-ZFEHNQY7 -->
### First-Time MCP Server Approval in Claude Code
**When:** 2026-06-16 · **Fact:** `P-ZFEHNQY7`
**Why:** Claude Code enforces this security policy on all MCP servers defined in committed config

<!-- decision:P-UBV99YJ7 -->
### MCP Server and Settings File Organization
**When:** 2026-06-16 · **Fact:** `P-UBV99YJ7`
**Why:** Project-scoped tools must travel with `git clone` so all teammates get the same MCP servers, while user-specific customizations remain local

<!-- decision:P-aD27LQ3H -->
### journaledIds Regex Incompleteness — Unbounded DECISIONS.md Growth (DJ2)
**When:** 2026-06-16 · **Fact:** `P-aD27LQ3H`
**Why:** Regression-test gap—fixtures didn't exercise the real alphabet. Ship-blocker for v0.3.2 (digest/journaling is a headline feature). Fix lands on main before tag.

<!-- decision:P-DPLXZCXJ -->
### Capture-completeness vs capture-perception gap (persona-queue delay)
**When:** 2026-06-16 · **Fact:** `P-DPLXZCXJ`
**Why:** User's instinct about incompleteness is valid as a UX signal, but correctly identified as a promotion/visibility issue rather than a missing-facts issue.

<!-- decision:P-9HCCG4RQ -->
### Release Validation Gate Structure
**When:** 2026-06-16 · **Fact:** `P-9HCCG4RQ`
**Why:** Separates repeatable, fast validation from expensive manual review. Unblocks parallel work and provides clear visibility into validation progress.

<!-- decision:P-9PXGBNLT -->
### F-7 Spec vs Code Mismatch: Tombstone Reading in cmk get
**When:** 2026-06-16 · **Fact:** `P-9PXGBNLT`
**Why:** Future cut-gate specification updates or F-7 work could accidentally claim unimplemented behavior. The spec must reflect the intentional live-only design.

<!-- decision:P-VUC9TB6X -->
### MCP Server Staleness Workaround
**When:** 2026-06-16 · **Fact:** `P-VUC9TB6X`
**Why:** MCP servers can drift out of sync mid-session, causing queries to fail against pre-fix code even though the fix is deployed. Quick restart avoids confusion when debugging apparent regressions.

<!-- decision:P-YFUW6ABE -->
### Read Path Inconsistency — `get` Lacks Deleted_at Filter
**When:** 2026-06-16 · **Fact:** `P-YFUW6ABE`
**Why:** Flagged during fact-probing work as a gap: the CLI and MCP surfaces have different coverage, surfacing this inconsistency. If recovery features are added, this pattern should be fixed.

<!-- decision:P-MEVGaRK7 -->
### Tombstone Data Lifecycle — Forget vs. Purge
**When:** 2026-06-16 · **Fact:** `P-MEVGaRK7`
**Why:** Product decision pending on recovery surfaces. Current architecture is the constraint: data exists (kept by design), so recovery would be a read operation, not a reconstruct. This context informs scope and feasibility.

<!-- decision:P-49BQNG9V -->
### Automatic recall never reads tombstones; recovery is human-only opt-in
**When:** 2026-06-16 · **Fact:** `P-49BQNG9V`
**Why:** Memory flagged this as an unsettled gap (the journal-vs-digest visibility split was decided in D-161, but whether the snapshot injector / mk_search hard-exclude tombstoned facts was never decided). Settling it: tombstones invisible to auto-recall because confidently-wrong recall (resurfacing a deleted fact) is catastrophic for a memory product; the negative-knowledge case has a better home (retract-in-place). Distinguishes forget (delete) from supersede (evolve) cleanly.

<!-- decision:P-XZSUPBWU -->
### Auto-recall agents are blind to tombstoned facts
**When:** 2026-06-16 · **Fact:** `P-XZSUPBWU`
**Why:** An agent confidently recalling a fact the user explicitly deleted is the worst failure mode a memory product can have. Keeping tombstones invisible to agents enforces the invariant that "forget" is truly permanent from the agent's perspective.

<!-- decision:P-ZVZ5a6RK -->
### Retracts and forgets are semantically distinct
**When:** 2026-06-16 · **Fact:** `P-ZVZ5a6RK`
**Why:** These two deletion modes serve different needs. Retracts preserve the story of how decisions evolved (important for continuity). Forgets remove visibility entirely (important for cleaning up unwanted facts). Conflating them leads to either losing decision history or accidentally auto-recovering deleted facts.

<!-- decision:P-JYH2P5QC -->
### DECISIONS.md is write-only for AI recall — not in any recall directive or test
**When:** 2026-06-16 · **Fact:** `P-JYH2P5QC`
**Why:** Task 147 built DECISIONS.md as a human-readable decision journal, but the AI's recall directives were never updated to consult it, and it's not indexed for search — so the journal's unique value (decision evolution, retracted/rejected decisions) is unreachable by automatic recall. This is the same class as the tombstone gap: a surface exists but recall doesn't reach it. Surfaced by the user asking 'when I mention Kamal, where do you look, and when would you go to DECISIONS.md?' — answer: never, today.

<!-- decision:P-GHN4aLTN -->
### Task 156 DECISIONS.md recall is v0.3.3 the next version firm
**When:** 2026-06-16 · **Fact:** `P-GHN4aLTN`
**Why:** I initially slotted the DECISIONS.md-recall gap vaguely as "v0.3.3/v0.4"; the user pushed back wanting it to be the NEXT version, not punted. Firming to v0.3.3 because leaving a just-shipped headline feature (the decision journal) un-recallable by the AI across two minor versions is the wrong call — it completes v0.3.2's feature.

<!-- decision:P-FCK9J9CM -->
### RESUME v0.3.2 cut-gate in progress
**When:** 2026-06-16 · **Fact:** `P-FCK9J9CM`
**Why:** A long multi-thread cut-gate session with high context-loss risk; if it compacts or VS Code restarts, the next session needs to know exactly where the cut stands — what passed, what's left, that main is uncut, and the next outward step — without re-deriving it from scratch. This is the kit's own amnesia-prevention applied to its own release.

<!-- decision:P-9N4JG45F -->
### The journal/decision-recall feature's PRIMARY value is automatic AI recall when
**When:** 2026-06-16 · **Fact:** `P-9N4JG45F`

<!-- decision:P-H33RCKS4 -->
### Rebuild+Reinstall Before Session 2 (Release Cut Workflow)
**When:** 2026-06-16 · **Fact:** `P-H33RCKS4`
**Why:** Session 2 tests recall via `mk_search` (MCP server). Stale server = stale code = re-hitting fixed bugs. The release-cut chain is: fix → save → verify-on-current-code.

<!-- decision:P-A396Z6JP -->
### Windows DLL Lock Blocks NPM Reinstall (better_sqlite3.node)
**When:** 2026-06-16 · **Fact:** `P-A396Z6JP`
**Why:** The Node.js native module loads the DLL into the process; the file stays locked until the process exits.

<!-- decision:P-X2VUTU3Z -->
### Close VS Code to close Claude Code on cut-gate14
**When:** 2026-06-16 · **Fact:** `P-X2VUTU3Z`
**Why:** Environment-specific constraint relevant to session lifecycle and testing procedures.

<!-- decision:P-MV3GBMZ2 -->
### FQ1 (FTS5 fix) in installed 0.3.2, ready for Session 2 recall tests
**When:** 2026-06-16 · **Fact:** `P-MV3GBMZ2`
**Why:** Session 2 tests recall via `mk_search` (MCP server), which requires FQ1. Clarifies that rebuild is unnecessary for S2.

<!-- decision:P-FKVJZZQL -->
### MCP server may retain stale code in memory after package updates
**When:** 2026-06-16 · **Fact:** `P-FKVJZZQL`
**Why:** Session 2 recall tests use `mk_search` (MCP server). Stale server can error even if fixes are on disk.

<!-- decision:P-F7XQXFKL -->
### VS Code Windows Are Independent Claude Code Sessions
**When:** 2026-06-16 · **Fact:** `P-F7XQXFKL`
**Why:** Critical for parallel work and troubleshooting; prevents confusion about session/server state; allows independent problem-solving in different windows without risk to other conversations

<!-- decision:P-N9FJU9Ta -->
### Project Configuration & Tech Stack
**When:** 2026-06-16 · **Fact:** `P-N9FJU9Ta`
**Why:** Standing configuration that every session should apply consistently to maintain code quality and structure.

<!-- decision:P-JY9ZGT5C -->
### Three-Session Release Validation Methodology
**When:** 2026-06-16 · **Fact:** `P-JY9ZGT5C`
**Why:** Validates that memory recall, memory-search skill, and persona transfer are working correctly before release.

<!-- decision:P-YFBTYUPQ -->
### Session 2 recall passed; broken install root-caused + recovered
**When:** 2026-06-16 · **Fact:** `P-YFBTYUPQ`
**Why:** Session 2 is a cut-gate milestone (recall is the kit's wow). Recording that recall passed strongly even through a broken install, that the two scary-looking findings (cmk crash + DECISIONS.md dup) were both the stale-install root cause not new bugs, and how the reinstall recovered — so the cut can proceed and a future session doesn't re-investigate.

<!-- decision:P-VTLX4QYR -->
### v0.3.2 cut-gate complete E1 wedge passed ready to tag
**When:** 2026-06-16 · **Fact:** `P-VTLX4QYR`
**Why:** The cold-open (E1) is the kit's single most important gate — the wedge that justifies the whole product. It passed live with the best-case result (persona transferred to a zero-history project, even the subtle repo-exception nuance). Recording that all gates passed + the bugs the cut-gate caught means the cut decision is fully traceable and a future session knows v0.3.2 was properly gated.

<!-- decision:P-RHaM3HDa -->
### Release & Publish Workflow (Git Tag to npm)
**When:** 2026-06-16 · **Fact:** `P-RHaM3HDa`
**Why:** Repeatable, verifiable release process ensures consistency, transparency, and auditability

<!-- decision:P-AX32FX5V -->
### v0.3.2 Release Inventory & v0.3.3 Feature Queue
**When:** 2026-06-16 · **Fact:** `P-AX32FX5V`
**Why:** Clear record of what shipped vs. what's in flight; documents feature readiness gates

<!-- decision:P-9TVaG53C -->
### onnxruntime-node CI Download Flakiness
**When:** 2026-06-16 · **Fact:** `P-9TVaG53C`
**Why:** Distinguishes transient network flakes from real code/release problems; prevents false alarm investigation

<!-- decision:P-B93GXMBD -->
### v0.3.2 published to npm with provenance
**When:** 2026-06-16 · **Fact:** `P-B93GXMBD`
**Why:** Closes the v0.3.2 release loop — records what shipped, that the cut-gate caught 3 bugs, and the transient onnxruntime-node ETIMEDOUT publish failure + its retry fix (so a future cut doesn't panic when publish.yml fails on that dependency's network install).

<!-- decision:P-Q2GaW43C -->
### Cut-Gate Process Validated Release Quality
**When:** 2026-06-16 · **Fact:** `P-Q2GaW43C`
**Why:** Cut-gate is the quality checkpoint that prevents bugs from reaching users. This session proved it catches real problems—it earned its keep.

<!-- decision:P-6GK6PZ2Z -->
### node:sqlite Migration Decision
**When:** 2026-06-16 · **Fact:** `P-6GK6PZ2Z`
**Why:** Search is a critical operation; existing implementation met all requirements. The regression eliminated any benefit from the migration.

<!-- decision:P-SURaZQS4 -->
### Tombstone Auto-Recall Design Decision
**When:** 2026-06-16 · **Fact:** `P-SURaZQS4`
**Why:** Respects user intent and data integrity—deleted records should not auto-surface in the AI system.

<!-- decision:P-UCG4RKNL -->
### Two post-v0.3.2 bugs index corruption and stale snapshot for v0.3.3
**When:** 2026-06-16 · **Fact:** `P-UCG4RKNL`
**Why:** Context is about to auto-compact (2% left); these two bugs ARE the cross-session-amnesia failure the kit exists to prevent, found on the kit itself right after shipping v0.3.2. Must be durable so the next session (which may itself hit the stale snapshot) can pick up the diagnosis and fix, not re-investigate.

<!-- decision:P-T6Q2QWHE -->
### Version Snapshot in recent.md Guards Against Cross-Session Amnesia
**When:** 2026-06-16 · **Fact:** `P-T6Q2QWHE`
**Why:** New sessions load memory to understand project state. A stale version snapshot would make them think an older version is current (e.g., v0.3.1 when v0.3.2 shipped). The snapshot is a guard rail for session continuity.

<!-- decision:P-64UMEVFG -->
### User questions whether kept branches are necessary; signals active concern about
**When:** 2026-06-16 · **Fact:** `P-64UMEVFG`

<!-- decision:P-N5AC9UXY -->
### Cut-Gate Review Process
**When:** 2026-06-17 · **Fact:** `P-N5AC9UXY`
**Why:** The project distinguishes live-tested (real data) from synthetic-tested (fixtures) from untested (behavioral). Unverified items are explicitly flagged rather than claimed complete.

<!-- decision:P-RR5a6aER -->
### Testing Verification Levels
**When:** 2026-06-17 · **Fact:** `P-RR5a6aER`
**Why:** Prevents false claims of completeness. Unverified paths are flagged for cut-gate review.

<!-- decision:P-AZa9JRMS -->
### Contract-Lock Testing Pattern
**When:** 2026-06-17 · **Fact:** `P-AZa9JRMS`
**Why:** Status-code tests verify the happy/error paths but miss contract violations; contract-lock tests catch edge cases and breaches directly.

<!-- decision:P-aFKRUUYV -->
### D-163 Invariant — Agent Must Never See Forgotten Facts
**When:** 2026-06-17 · **Fact:** `P-aFKRUUYV`
**Why:** Agent leaking recovered forgotten facts would be a critical privacy breach; the invariant must be enforced by-default, not remembered.

<!-- decision:P-2QSPCZCX -->
### Five Focus Questions Code Review Framework
**When:** 2026-06-17 · **Fact:** `P-2QSPCZCX`
**Why:** These five areas are the highest-risk surface for new features — privacy leaks, path traversal, invariant violations, shape mutations, default-enabled footguns.

<!-- decision:P-4EZT6FPU -->
### Graceful Degrade on Malformed Archive Data
**When:** 2026-06-17 · **Fact:** `P-4EZT6FPU`
**Why:** Recovery happens *because* something went wrong; crashing would prevent recovery. A graceful-degrade contract should be locked by test.

<!-- decision:P-UBU2NFWX -->
### Path Traversal Protection — Anchored ID Pattern + Validate-Before-Join
**When:** 2026-06-17 · **Fact:** `P-UBU2NFWX`
**Why:** Whitelist-pattern validation before path construction is the correct defense; the ordering prevents regressions.

<!-- decision:P-GF2UaLAH -->
### Scope Documentation Discipline — Record *Why*, Not Just *What*
**When:** 2026-06-17 · **Fact:** `P-GF2UaLAH`
**Why:** Future reader (or user months later) understands the decision and won't re-open the question or accidentally build the deferred feature in ad-hoc ways.

<!-- decision:P-DYCCQG9H -->
### Release Trigger: Tag Push Publishes
**When:** 2026-06-17 · **Fact:** `P-DYCCQG9H`
**Why:** Separates user control over release timing from deterministic automation, preventing accidental early releases while keeping the publish step hands-free.

<!-- decision:P-CATHYC5L -->
### Release Workflow for claude-memory-kit
**When:** 2026-06-17 · **Fact:** `P-CATHYC5L`
**Why:** This is the established pattern for shipping claude-memory-kit releases. v0.3.3 is the current example. The tag push is the critical "outward step" where work transitions from local to external/public.

<!-- decision:P-6NLDRFYV -->
### DECISIONS.md Cut-Gate Structure (DJ1–DJ4)
**When:** 2026-06-17 · **Fact:** `P-6NLDRFYV`
**Why:** Ensures DECISIONS.md recall is reliable across the full lifecycle (create, digest, forget, recall-as-retracted). The mechanism/behavior split acknowledges what can vs cannot be auto-tested.

<!-- decision:P-XK4aDSCY -->
### DJ4 Verification Prompts (DECISIONS.md Recall Gate)
**When:** 2026-06-17 · **Fact:** `P-XK4aDSCY`
**Why:** DJ4 is a behavioral gate that cannot be auto-tested. These prompts operationalize the manual verification step, making it repeatable and executable.

<!-- decision:P-QBWYD2Q9 -->
### Behavioral Gate Standard Pattern (v0.3.3)
**When:** 2026-06-17 · **Fact:** `P-QBWYD2Q9`
**Why:** Vague gates ("ask a history question") are not executable by humans running manual pre-release verification. Every gate must be runnable by someone without deep project context.

<!-- decision:P-KQ9WE2AU -->
### v0.3.3 Release Staging State
**When:** 2026-06-17 · **Fact:** `P-KQ9WE2AU`
**Why:** Accurate pre-tagging state; unblocks final release step.

<!-- decision:P-BPSaKX7V -->
### Release Workflow with Destructive Manual Steps
**When:** 2026-06-17 · **Fact:** `P-BPSaKX7V`
**Why:** Workflow has irreversible steps; next session needs to know the release is staged but requires explicit user choice on scope before proceeding

<!-- decision:P-EYGaT423 -->
### PowerShell UTF-8 Display Artifact in cmk Cut-Gate Validation
**When:** 2026-06-17 · **Fact:** `P-EYGaT423`
**Why:** Prevents future cmk setup runs from falsely failing gate checks due to display artifacts masking correct file state on Windows

<!-- decision:P-TTKBJN2D -->
### Cut-Gate Testing Structure (Terminal vs Live-Session Gates)
**When:** 2026-06-17 · **Fact:** `P-TTKBJN2D`
**Why:** Determines what can run in CI/headless vs what needs user interaction; gate placement guides future test additions

<!-- decision:P-GZUSMZVQ -->
### PowerShell UTF-8 Encoding Fix for Cut-Gate G4 Reads
**When:** 2026-06-17 · **Fact:** `P-GZUSMZVQ`
**Why:** Get-Content on Windows console displays UTF-8 middots/emdashes as mojibake characters, causing false-positive "corruption" flags during verification

<!-- decision:P-LCZ6Q27C -->
### Version 0.3.3 Release Features and Test Coverage
**When:** 2026-06-17 · **Fact:** `P-LCZ6Q27C`
**Why:** Next session needs exact test coverage before final release; live gates are blocking for 0.3.3 tag

<!-- decision:P-AW7WKGVT -->
### Multi-Site Home-Path Slug-Leak Bug Class (v0.3.3 Cut-Blocker)
**When:** 2026-06-17 · **Fact:** `P-AW7WKGVT`
**Why:** Usernames/home paths in committed fact filenames compromise privacy—auto-extract is highest risk because it runs automatically on every conversation turn with zero user action. This is confirmed as v0.3.3 cut-blocker, not just the single-site remember-core issue.

<!-- decision:P-647JJL4R -->
### Session 2 Validation Gates (cut-gate15)
**When:** 2026-06-17 · **Fact:** `P-647JJL4R`
**Why:** Validates v0.3.3 headline features (memory-search skill auto-trigger, DECISIONS.md scope, recall directives) behaviorally; remaining gates require live Claude session to drive conversational flows.

<!-- decision:P-7KRR6B6E -->
### Memory Kit Validation Gates (D1–W4 + DJ4 Live Gate)
**When:** 2026-06-17 · **Fact:** `P-7KRR6B6E`
**Why:** Each gate tests a distinct recall layer (rule search, decision recall, paraphrase matching, decision history); passing all gates confirms end-to-end function. DJ4 specifically validates that decision-history (DECISIONS.md) recall fires in *live* sessions, not just at design time — a headline v0.3.3 feature.

<!-- decision:P-KHB93CGB -->
### DJ4 Live-Gate Test Passed (v0.3.3 Headline Feature)
**When:** 2026-06-17 · **Fact:** `P-KHB93CGB`
**Why:** DJ4 is the headline verification for v0.3.3. Confirms feature design is sound; infrastructure gotcha does not block the tag.

<!-- decision:P-UTBXMFWR -->
### June 17 11:12 Build: decisions Scope Implemented
**When:** 2026-06-17 · **Fact:** `P-UTBXMFWR`
**Why:** Distinguishes current-build capabilities from stale-process behavior when testing scope-based features.

<!-- decision:P-SZX5LG7P -->
### MCP Server Staleness Gotcha (D-80)
**When:** 2026-06-17 · **Fact:** `P-SZX5LG7P`
**Why:** Affects feature testing and verification during development, especially when iterating on schema or scope changes. First encountered during DJ4 (v0.3.3 headline feature) testing on Jun 17.

<!-- decision:P-XCN5JURQ -->
### DJ4-Live Test Prerequisites
**When:** 2026-06-18 · **Fact:** `P-XCN5JURQ`
**Why:** Without DECISIONS.md, `mk_search {scope:"decisions"}` has nothing to return; restarting picks up the current build and avoids stale-process masking; testing against a retracted decision exercises the journal's unique value over fact-based recall

<!-- decision:P-MaWYNV6F -->
### Stale MCP Process Workaround After Build Updates
**When:** 2026-06-18 · **Fact:** `P-MaWYNV6F`
**Why:** The processes are long-lived and bound to the binary they loaded with; new sessions spawn fresh processes, but old sessions continue serving the outdated version

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-3FEV3J72 -->
### Probes for honest assessment of testing coverage — what was actually live-tested
**When:** 2026-06-17 · **Fact:** `P-3FEV3J72`

<!-- decision:P-AZZD4XCF -->
### Before tagging v0.3.3, user wants comprehensive confirmation that all vague gate
**When:** 2026-06-17 · **Fact:** `P-AZZD4XCF`

<!-- decision:P-aCAV54FE -->
### Don't assume execution scope without explicit permission; user corrected "i didn
**When:** 2026-06-17 · **Fact:** `P-aCAV54FE`

<!-- decision:P-YZZWTMEP -->
### Renamed `$env:USERPROFILE\.claude-memory-kit` as backup before running destructi
**When:** 2026-06-17 · **Fact:** `P-YZZWTMEP`

<!-- decision:P-5UMXLADZ -->
### Specified clear scope boundary — execute all steps up to "## 2. Session 1," stop
**When:** 2026-06-17 · **Fact:** `P-5UMXLADZ`

<!-- decision:P-9X52U9EP -->
### Prefers centralized helpers over code duplication (affirmed for multi-site bug f
**When:** 2026-06-17 · **Fact:** `P-9X52U9EP`

<!-- decision:P-4KZ72VGV -->
### Task Done-Goal Explicitness Rule
**When:** 2026-06-18 · **Fact:** `P-4KZ72VGV`
**Why:** D-169 was missed because automatic behavior was tested, but every test ran `cmk digest` manually first — masking that the automatic hook wasn't implemented. Explicit checkboxes make gaps impossible to ignore. This rule bookends the existing "live-test every task" rule.

<!-- decision:P-6ZS6ZAL6 -->
### Test Anti-pattern — Setup Commands Masking Automation
**When:** 2026-06-18 · **Fact:** `P-6ZS6ZAL6`
**Why:** D-169: DECISIONS.md auto-population was fully tested but every test started with manual `cmk digest`. The feature worked in tests, failed in real use.

<!-- decision:P-4SVME7QG -->
### cut-guide.md should be minimal, easy to read; use for live manual testing; move
**When:** 2026-06-18 · **Fact:** `P-4SVME7QG`

<!-- decision:P-4XHUNa9W -->
### Scaffolded Skills Drift After Binary Updates Without cmk install
**When:** 2026-06-18 · **Fact:** `P-4XHUNa9W`
**Why:** Stale skills silently under-perform (don't trigger), causing the agent to bypass them and hand-solve instead. This is also a real cmk doctor gap worth addressing for all users.

<!-- decision:P-ZZNLF7US -->
### lost track of what Task 159 was doing; signals confusion promptly rather than co
**When:** 2026-06-18 · **Fact:** `P-ZZNLF7US`

<!-- decision:P-79TK4TaF -->
### Memory Kit Index File (INDEX.md) Architecture
**When:** 2026-06-18 · **Fact:** `P-79TK4TaF`
**Why:** This is the kit's internal architecture. Understanding it is key to designing efficient session-start logic (e.g., Task 159's decision journal refresh).

<!-- decision:P-6RaEC34F -->
### prioritizes finishing v0.3.3 and moving on; willing to defer semantic search to
**When:** 2026-06-18 · **Fact:** `P-6RaEC34F`

<!-- decision:P-VVUK5RU7 -->
### Task 159: Auto-Updating Decision Journal
**When:** 2026-06-18 · **Fact:** `P-VVUK5RU7`
**Why:** v0.3.3 release blocker. Manual decision logs don't scale; automation keeps the journal honest.

<!-- decision:P-PZ4LH3CW -->
### CMK Decision Trail Requires Divergence Recording
**When:** 2026-06-18 · **Fact:** `P-PZ4LH3CW`
**Why:** Traceability and informed review. Future maintainers must know both the original decision and the reasons for change; prevents the same design question from being reconsidered.

<!-- decision:P-C5SL7RaW -->
### Journal Staleness Check Uses INDEX.md Mtime Proxy
**When:** 2026-06-18 · **Fact:** `P-C5SL7RaW`
**Why:** Session-start budget is tight; INDEX.md is a required artifact maintained by kit infrastructure anyway.

<!-- decision:P-LTCCJKT9 -->
### Journal Staleness Detection Uses Separate Boolean, Not Verdict
**When:** 2026-06-18 · **Fact:** `P-LTCCJKT9`
**Why:** Single-verdict slot constraint makes shared detection impossible for independent concerns. This is a compositional invariant of the kit's architecture.

<!-- decision:P-XZLFTK2A -->
### Decision-Trail Recording Convention for Divergences
**When:** 2026-06-18 · **Fact:** `P-XZLFTK2A`
**Why:** Maintains traceability and accountability; enables future context recovery and decision history.

<!-- decision:P-754HQESG -->
### Decision-trail work (A) is non-negotiable priority—"no matter what is a must."
**When:** 2026-06-18 · **Fact:** `P-754HQESG`

<!-- decision:P-QF6B7HQW -->
### New Skills System & Auto-Invocation Gap
**When:** 2026-06-18 · **Fact:** `P-QF6B7HQW`
**Why:** Skills exist to prevent silent divergences and improve discipline, but the auto-invocation layer isn't working as designed.

<!-- decision:P-4aSAFL3J -->
### User accepts technical divergences from research/design IF they were reasoned ag
**When:** 2026-06-18 · **Fact:** `P-4aSAFL3J`

<!-- decision:P-JTWUL9ZX -->
### Don't invent new documentation structures; follow the established documentation
**When:** 2026-06-18 · **Fact:** `P-JTWUL9ZX`

<!-- decision:P-FWFK4ARZ -->
### Documentation-map Spine drifts while DECISION-LOG stays current
**When:** 2026-06-18 · **Fact:** `P-FWFK4ARZ`
**Why:** Drift occurs because releases are cut and documented elsewhere without proactively refreshing the Spine. This repeats the same error class as Task 159 triplication and cut-gate-as-journal — state in multiple places, not maintained in the designated home.

<!-- decision:P-2TSXUZHR -->
### `.claude/skills/` Gitignore Creates Broken CLAUDE.md References on Clone
**When:** 2026-06-18 · **Fact:** `P-2TSXUZHR`
**Why:** The dev-skills are durable tools referenced in a standing instruction document. When the tools are gitignored but the doc is committed, fresh clones get broken pointers silently. This is structural drift, not content drift.

<!-- decision:P-QRHBWWLH -->
### Skill Adoption Verification Standard
**When:** 2026-06-18 · **Fact:** `P-QRHBWWLH`
**Why:** Grounds tool-keeping decisions in evidence rather than theory; prevents accumulation of unused tools

<!-- decision:P-TaFGHHD9 -->
### Skills Don't Trigger From CLAUDE.md or Hooks
**When:** 2026-06-18 · **Fact:** `P-TaFGHHD9`
**Why:** It's non-obvious. Most would expect CLAUDE.md or hooks to be the invocation mechanism. Understanding the real mechanism prevents wasted attempts and false assumptions.

<!-- decision:P-V33QABGS -->
### Use the official installer (npx skills@latest add) rather than manual commands f
**When:** 2026-06-18 · **Fact:** `P-V33QABGS`

<!-- decision:P-FJZFLaP9 -->
### adopt-third-party-skills-via-installer-personal-tier
**When:** 2026-06-18 · **Fact:** `P-FJZFLaP9`
**Why:** This session botched it twice: first hand-copied 6 of a 33-skill interdependent system into the gitignored project `.claude/skills/` (missing the installer, CONTEXT.md, sibling skills, the user-invoked grill-me entry points), then I judged them worthless WITHOUT reading them. Primary-source research (Claude Code skills+hooks docs + mattpocock's writing-great-skills + README) showed the correct model: installer → personal tier → auto-discovery → author's descriptions do the triggering. The user: "dont do it manually you are suppose to use the installer" and "read the readme for fuck sake."

<!-- decision:P-MB6XBZRR -->
### Task 159 Multi-Stage Verification Gate
**When:** 2026-06-18 · **Fact:** `P-MB6XBZRR`
**Why:** Task 159 is performance-critical with subtle interactions (lazy bin + journal sync). Multi-stage gate catches issues unit tests alone miss; the I1 fix was only visible in live-test, and skill-review caught a separate issue self-review missed.

<!-- decision:P-6L5CWR9G -->
### CI Pipeline Configuration
**When:** 2026-06-18 · **Fact:** `P-6L5CWR9G`
**Why:** These define what "CI is green" means in this repo; understanding the full matrix is essential for release QA, troubleshooting, and future expansion

<!-- decision:P-3GPCJWXQ -->
### Cut-Gate Sandbox Isolation
**When:** 2026-06-18 · **Fact:** `P-3GPCJWXQ`
**Why:** Install flows write memory files. Testing against real setup risks data loss or corruption.

<!-- decision:P-YHQU4aTH -->
### Cut-Gate Test Workflow
**When:** 2026-06-18 · **Fact:** `P-YHQU4aTH`
**Why:** Established pattern used consistently across 15+ test runs; proven reliable

<!-- decision:P-4JXMa5HF -->
### cmk install --with-semantic Command
**When:** 2026-06-18 · **Fact:** `P-4JXMa5HF`
**Why:** Core setup command for semantic search with documented graceful degradation on DLL lock failure.

<!-- decision:P-MQMPUBBN -->
### Cut-Gate 16 — Setup & Terminal Tests Complete
**When:** 2026-06-18 · **Fact:** `P-MQMPUBBN`
**Why:** Clear checkpoint. Terminal half is done; prevents re-deriving setup in next session. Signals readiness for in-chat testing phase.

<!-- decision:P-WX5WPTTJ -->
### cmk-compress-session requires SessionEnd hook invocation; manual terminal runs hang
**When:** 2026-06-18 · **Fact:** `P-WX5WPTTJ`
**Why:** Manual invocation during cut-gate testing created hung node processes. Understanding the hook-based design and correct testing patterns prevents this in future work.

<!-- decision:P-32TD3JaT -->
### CMK Tool Invocation: cmk-compress-session vs cmk-compress-lazy
**When:** 2026-06-18 · **Fact:** `P-32TD3JaT`
**Why:** Manual testing of cmk-compress-session led to confusion and hung processes; understanding the tool's intended context prevents wasted debugging.

<!-- decision:P-GD3QTG9V -->
### Version 0.3.3 Release — cut-gate16 Test Session State
**When:** 2026-06-18 · **Fact:** `P-GD3QTG9V`
**Why:** Clear record of final validation state before release.

<!-- decision:P-AZKXQRHC -->
### cut-gate16 Test Workflow Phases
**When:** 2026-06-18 · **Fact:** `P-AZKXQRHC`
**Why:** The phases are a structured verification checklist for the memory kit's core functionality. Running them in-chat (not terminal) lets Claude Code exercise its memory integration directly.

<!-- decision:P-JQ76A4W6 -->
### Doc Version Strings Should Be Parameterized
**When:** 2026-06-18 · **Fact:** `P-JQ76A4W6`
**Why:** Docs go stale; the tarball example in the guide had 0.3.2 but the actual install is 0.3.3. Parameterized docs are maintenance-free.

<!-- decision:P-ZXF759KP -->
### §5 Test Scorecard — Gates W1 through D6
**When:** 2026-06-18 · **Fact:** `P-ZXF759KP`
**Why:** Tracks which parts of the kit test plan have passed, which are blocked by harness issues, and which remain.

<!-- decision:P-XVEYV7a4 -->
### D6 Fail-Safe Behavior on Compress Timeout
**When:** 2026-06-18 · **Fact:** `P-XVEYV7a4`
**Why:** D6 gate failure is acceptable because the kit does not corrupt or lose state; it degrades gracefully.

<!-- decision:P-YZHN6DP6 -->
### Nested-claude Spawn Timeout in Test Harness
**When:** 2026-06-18 · **Fact:** `P-YZHN6DP6`
**Why:** D6 gate failed with `haiku_timeout`, but the failure pattern (timing out when called from inside Claude Code) repeats across multiple test attempts. Points to harness artifact, not kit bug.

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-WSD3WEUY -->
### Skills installation complete — user ran `npx skills@latest add mattpocock/skills
**When:** 2026-06-18 · **Fact:** `P-WSD3WEUY`

<!-- decision:P-PRCXC9EQ -->
### expects GitHub CI automation to run on PR/merge
**When:** 2026-06-18 · **Fact:** `P-PRCXC9EQ`

<!-- decision:P-N5NPMLYY -->
### Test prompts should use natural language with subtle behavioral triggers, not ex
**When:** 2026-06-18 · **Fact:** `P-N5NPMLYY`

<!-- decision:P-9Z63AQE7 -->
### `claude --print` Haiku Latency & Compression Timeout Margin
**When:** 2026-06-18 · **Fact:** `P-9Z63AQE7`
**Why:** The 50s timeout was calibrated against expected latency (21–50s). Actual latency has degraded significantly, causing compressions to time out and now.md to grow unbounded if failures recur across sessions.

<!-- decision:P-D6YGVW9L -->
### Compression Retry Mechanism
**When:** 2026-06-18 · **Fact:** `P-D6YGVW9L`
**Why:** If compression times out, the feature fails safely but silently — input is not lost. However, if failures are consistent (e.g., due to persistent CLI latency), now.md accumulates unbounded across sessions until a compression finally beats the timeout clock.

<!-- decision:P-RX6DWHZD -->
### System-touching features are skipped in automated verification runs
**When:** 2026-06-18 · **Fact:** `P-RX6DWHZD`
**Why:** Protects the user's real system and data from unintended side effects during automated testing.

<!-- decision:P-VZF4U3TP -->
### Tag-ready criterion: core features pass; known issues cleanly deferred
**When:** 2026-06-18 · **Fact:** `P-VZF4U3TP`
**Why:** Allows shipping working features while deferring known architectural issues to future releases without false urgency or version coupling.

<!-- decision:P-KRGYHRUX -->
### Decisions Scope Semantic Fallback Warning (Task 156 Bug)
**When:** 2026-06-18 · **Fact:** `P-KRGYHRUX`
**Why:** Headline feature (Task 156, decisions recall) works but looks broken. Cosmetic defect in flagship feature kills user confidence on first impression.

<!-- decision:P-a2QWV6V4 -->
### Decisions Scope Uses Direct File Read, Not Vector DB
**When:** 2026-06-18 · **Fact:** `P-a2QWV6V4`
**Why:** Task 156 established this design to reuse the file-read precedent and maintain the journal as a live markdown view. Semantic search requires indexed data; the journal is neither indexed nor stored as table rows.

<!-- decision:P-5M3QY5B6 -->
### v0.3.3 Bug — Semantic Backend Attempted for Keyword-Only Decisions Scope
**When:** 2026-06-18 · **Fact:** `P-5M3QY5B6`
**Why:** The default search mode is hybrid (attempts semantic first), and the code does not short-circuit for decisions scope before attempting semantic. `search.mjs:163` has explicit validation that decisions is keyword-only, but `subcommands.mjs` ignores this and tries semantic anyway, generating a false-failure warning for expected behavior.

<!-- decision:P-RRENWMU7 -->
### Fix for `--scope decisions` Warning Bug in Memory Search
**When:** 2026-06-18 · **Fact:** `P-RRENWMU7`
**Why:** This is a real CLI bug affecting the v0.3.3 cut-gate; the fix and test metrics are durable reference for similar scope-handling issues.

<!-- decision:P-497V47QC -->
### Claude Memory Kit Update Workflow
**When:** 2026-06-18 · **Fact:** `P-497V47QC`
**Why:** Users need a clear process to adopt new versions; the kit has no `cmk update` wrapper command yet (v0.3.3)

<!-- decision:P-FBXSRRa9 -->
### Kit Update & Drift Detection Gaps (v0.3.4 Task)
**When:** 2026-06-18 · **Fact:** `P-FBXSRRa9`
**Why:** Basic product expectation ("how do I update?") has no answer; v0.3.3 ready to ship but these are gaps for v0.3.4

<!-- decision:P-MXZUV2UY -->
### Windows EBUSY on npm Global Update
**When:** 2026-06-18 · **Fact:** `P-MXZUV2UY`
**Why:** Real user blocker — cryptic error with no guidance if they try to update the global binary while IDE is open

<!-- decision:P-5PJXVSSG -->
### Plugin Install and Bootstrap Are Separate One-Time Steps
**When:** 2026-06-18 · **Fact:** `P-5PJXVSSG`
**Why:** Clarifies why two commands are required and prevents confusion about whether bootstrap is redundant or a plugin issue.

<!-- decision:P-7GQ4N9NJ -->
### Updating CMK Requires Re-running Bootstrap on Project Files
**When:** 2026-06-18 · **Fact:** `P-7GQ4N9NJ`
**Why:** The two-step update process (global machinery + per-project scaffold) is not obvious; users will expect a single update command to handle everything and will hit stale memory files.

<!-- decision:P-JZ3JaU7L -->
### Windows EBUSY When Updating CMK During Claude Code Runtime
**When:** 2026-06-18 · **Fact:** `P-JZ3JaU7L`
**Why:** Real blocker for Windows users. The EBUSY error is cryptic with no guidance on the cause or fix.

<!-- decision:P-5ZRXEHUW -->
### Release Gate-Test Pattern (claude-memory-kit)
**When:** 2026-06-18 · **Fact:** `P-5ZRXEHUW`
**Why:** Prevents shipping half-baked features; ensures solid user experience and builds user trust in kit quality.

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-P9XLPJ2X -->
### Assistant has a pattern of running without sufficient thought/planning ("running
**When:** 2026-06-18 · **Fact:** `P-P9XLPJ2X`

<!-- decision:P-RDZ6SE7C -->
### User explicitly prefers concise responses; doesn't want walls of text
**When:** 2026-06-18 · **Fact:** `P-RDZ6SE7C`

<!-- decision:P-4D76WXZP -->
### Approved cleanup and ready to proceed to next phase (VS Code on cut-gate16)
**When:** 2026-06-18 · **Fact:** `P-4D76WXZP`

<!-- decision:P-MaPBRMaZ -->
### Installation command for this project updated to: cmk install --with-semantic
**When:** 2026-06-18 · **Fact:** `P-MaPBRMaZ`

<!-- decision:P-E4HX6VVU -->
### Corrects mechanism-only testing (bash) by steering toward behavioral testing via
**When:** 2026-06-18 · **Fact:** `P-E4HX6VVU`

<!-- decision:P-4LCSC9ZY -->
### Release verification must include testing the actual installed/packaged artifact
**When:** 2026-06-18 · **Fact:** `P-4LCSC9ZY`

<!-- decision:P-2GRPQKFa -->
### Research Documentation Convention
**When:** 2026-06-18 · **Fact:** `P-2GRPQKFa`
**Why:** Shows what was originally asked vs. what was actually researched; prevents re-checking systems; documents decision rationale and scope changes transparently

<!-- decision:P-FDATL4KY -->
### Task 161 Decision D-173 — Bound Compaction Input
**When:** 2026-06-18 · **Fact:** `P-FDATL4KY`
**Why:** 17-of-19 system convergence validates bounded-input as proven, safe path. Closes gap from design inception.

<!-- decision:P-5KXaLFDC -->
### Context Buffer Stabilization: 19 Systems Classified by Approach
**When:** 2026-06-18 · **Fact:** `P-5KXaLFDC`
**Why:** The proposed A+B+C+D exceeds what 17/19 systems do. The two most-similar systems validate A+B+C but not D. This opens a simplification fork: is full A+B+C justified, or does B+C (with defensive A) suffice?

<!-- decision:P-MYDY3DXF -->
### A+C-Core Design Pivot (Memsearch-Anchored, B Dropped)
**When:** 2026-06-18 · **Fact:** `P-MYDY3DXF`
**Why:** 19-system union was overengineered; anchoring on the two most-similar systems (memsearch + Letta) reveals the core is just input-cap + recent-window, not four mechanisms.

<!-- decision:P-BBEZ4YaD -->
### Overflow-Handling Caveat—Single Buffer vs. Memsearch's Many Files
**When:** 2026-06-18 · **Fact:** `P-BBEZ4YaD`
**Why:** A+C alone work for memsearch's shape (many files) but `now.md` is single growing buffer; trimmed overflow needs explicit handling, not just window-keep.

<!-- decision:P-M9J9M9LZ -->
### Proposed Turn-Based Memory Roll Design
**When:** 2026-06-18 · **Fact:** `P-M9J9M9LZ`
**Why:** Kit uses single-file model, unlike memsearch/Letta/MemoryOS; using existing rolling window more frequently (per turn, not per session) fits actual architecture better than borrowing cap-the-buffer pattern.

<!-- decision:P-6WEYN2TM -->
### Compression Spiral Bug at Three Identical Call Sites
**When:** 2026-06-18 · **Fact:** `P-6WEYN2TM`
**Why:** The bug is systemic at three sites, not localized to one verb. Per-verb or per-buffer fixes are incomplete; the root issue is unbound input to backend.compress.

<!-- decision:P-6M26BR9S -->
### Durable Tiers Enable Safe Buffer Trimming
**When:** 2026-06-18 · **Fact:** `P-6M26BR9S`
**Why:** When bounding input to compression, the "where does overflow go?" concern dissolves. Old content can be safely trimmed from derived buffers because it's already in the durable record.

<!-- decision:P-PAKDAWVL -->
### NOW_MD_ASSISTANT_CAP Precedent
**When:** 2026-06-18 · **Fact:** `P-PAKDAWVL`
**Why:** Shows the kit isn't starting from zero on input bounding — the precedent already exists. The solution should extend this pattern rather than invent a new mechanism.

<!-- decision:P-F9SUD9EG -->
### Prefers option 2 (bound inside CompressorBackend.compress implementation, not a
**When:** 2026-06-18 · **Fact:** `P-F9SUD9EG`

<!-- decision:P-GSRN46VV -->
### Requires overflow handling be comprehensive — don't shift problem from now.md to
**When:** 2026-06-18 · **Fact:** `P-GSRN46VV`

<!-- decision:P-DTS22L9D -->
### Wants research re-visited before final commit — pick direction, validate sources
**When:** 2026-06-18 · **Fact:** `P-DTS22L9D`

<!-- decision:P-SFaECJRK -->
### Compression Timeout Root Cause: Environmental Contention, Not Input Size
**When:** 2026-06-19 · **Fact:** `P-SFaECJRK`
**Why:** The original design premise (A+C to cap input size and prevent "compounding spiral") is falsified. Failures hit 8KB and 329-byte inputs equally. The buffer grows only because failures leave it un-drained; failures are transient/environmental, not size-induced.

<!-- decision:P-PVAPFJMR -->
### Compress Logger Observability Gap
**When:** 2026-06-19 · **Fact:** `P-PVAPFJMR`
**Why:** Without stderr/exit-code in the log, the kit can't diagnose actual failure reasons. This prevents knowing whether failures are transient (worth retrying) or deterministic (unfixable by retry).

<!-- decision:P-TASRaWE2 -->
### Structured Error Logging for Compress Failures
**When:** 2026-06-19 · **Fact:** `P-TASRaWE2`
**Why:** Observability gap prevented distinguishing transient failures (retry helps) from deterministic ones (retry re-fails). Structured logging enables data-driven retry design instead of assumptions.

<!-- decision:P-7KJS5Q7K -->
### Compression Retry Strategy for claude-memory-kit
**When:** 2026-06-19 · **Fact:** `P-7KJS5Q7K`
**Why:** Transient failures (timeouts, 5xx) are non-deterministic and retry-recoverable; deterministic failures need design fixes, not retries. The ecosystem confirms this pattern.

<!-- decision:P-6SESSZ33 -->
### SessionEnd Hook No-Retry Constraint
**When:** 2026-06-19 · **Fact:** `P-6SESSZ33`
**Why:** Protect concurrent persona call latency SLA while maintaining compression safety and reliability.

<!-- decision:P-YCA3aZYT -->
### Decision Trail and Knowledge Preservation System
**When:** 2026-06-19 · **Fact:** `P-YCA3aZYT`
**Why:** The team frequently revisits decisions (e.g., size-cap design may return if future measurements show different constraints). Recording full context prevents re-deriving analysis and makes fallback decisions safe. Builds institutional memory and supports learning.

<!-- decision:P-AV5aYUZJ -->
### Live Cut-Gate Requirement — Unit-Green ≠ Works-on-Real-Input
**When:** 2026-06-19 · **Fact:** `P-AV5aYUZJ`
**Why:** Unit mocks diverge from production behavior; transient Haiku failures are real and can only be validated by exercising the real service.

<!-- decision:P-GL7A4BXS -->
### Retry Configuration Strategy by Path
**When:** 2026-06-19 · **Fact:** `P-GL7A4BXS`
**Why:** The ceiling-free paths have time budget for retry; SessionEnd-hook is constrained and must fail fast to stay under 60s ceiling, shifting retry burden to the lazy path.

<!-- decision:P-63V2GTPD -->
### Stress Gate Requirement for Spawn-Boundary Changes
**When:** 2026-06-19 · **Fact:** `P-63V2GTPD`
**Why:** Spawn-boundary code is concurrency-sensitive and unit tests alone do not surface race conditions or transient spawn failures under load.

<!-- decision:P-F6KQVPPR -->
### Task 161.11 Retry Implementation Live Verification (Passed)
**When:** 2026-06-19 · **Fact:** `P-F6KQVPPR`
**Why:** Retry logic near spawn boundaries is high-risk; transient vs. permanent failures must be classified correctly. Windows and POSIX have different exit-code semantics. Conservative default prevents loops; logging gaps must be tracked.

<!-- decision:P-YBJRDa6H -->
### "autopilot" — user empowers assistant to decide scope for update-path documentat
**When:** 2026-06-19 · **Fact:** `P-YBJRDa6H`

<!-- decision:P-SaAAX7XL -->
### Claude-Memory-Kit Update Paths (npm vs Plugin)
**When:** 2026-06-19 · **Fact:** `P-SaAAX7XL`
**Why:** This decision point (which path to document/support) requires honest accounting of both user experiences. Both paths share the same fundamental workflow; both have identical "forgotten per-project step" failure mode.

<!-- decision:P-ZKH65YMH -->
### Known Quirks and Solutions
**When:** 2026-06-19 · **Fact:** `P-ZKH65YMH`
**Why:** These surface in real usage and block smooth UX in both paths (or are path-specific friction).

<!-- decision:P-UG3CSVUB -->
### Version Stamping and Scaffold Isolation
**When:** 2026-06-19 · **Fact:** `P-UG3CSVUB`
**Why:** This explains the silent failure: users update globally but forget per-project re-stamping, leaving mismatched versions. The separation is fundamental to the architecture.

<!-- decision:P-NDWKVJ27 -->
### User questioned whether the update task is necessary and doesn't remember the or
**When:** 2026-06-19 · **Fact:** `P-NDWKVJ27`

<!-- decision:P-DYPWAPD5 -->
### Cut-Gate Testing Practice
**When:** 2026-06-19 · **Fact:** `P-DYPWAPD5`
**Why:** Real sessions expose integration issues, edge cases, and interactions that sandbox tests cannot. Task 161's compression-retry behavior only surfaced in actual use, not in isolated test suites.

<!-- decision:P-W75PJXBP -->
### Release Process for claude-memory-kit
**When:** 2026-06-19 · **Fact:** `P-W75PJXBP`
**Why:** Ensures consistent, repeatable release process with automated publishing via GitHub Actions.

<!-- decision:P-2MSZRDP7 -->
### User chose docs+drift-check now (not defer) — clear priority decision
**When:** 2026-06-19 · **Fact:** `P-2MSZRDP7`

<!-- decision:P-LaG5aW75 -->
### Layered Backend Pattern
**When:** 2026-06-19 · **Fact:** `P-LaG5aW75`
**Why:** Separates concerns so services are testable/reusable without FastAPI; prevents architectural decay.

<!-- decision:P-KYTE5Q9V -->
### .venv Setup Requirement
**When:** 2026-06-19 · **Fact:** `P-KYTE5Q9V`
**Why:** Isolates dependencies; prevents version conflicts across projects.

<!-- decision:P-NNNBBSJZ -->
### Two Promotion Paths Route Facts Differently
**When:** 2026-06-19 · **Fact:** `P-NNNBBSJZ`
**Why:** The two capture mechanisms have different routing strategies — not a v0.3.4 code change (verified zero persona-related changes in v0.3.4), but which *mechanism fired* on that run. Auto-persona spreads; explicit-promote concentrates. This finding sharpens Task 151 for v0.4.

<!-- decision:P-J4LZZ2YG -->
### Backup Location and Naming Convention
**When:** 2026-06-19 · **Fact:** `P-J4LZZ2YG`
**Why:** Keeps versioned persona snapshots organized and easily findable during cut-gate testing and version comparisons; establishes a durable artifact location outside transient temp directories

<!-- decision:P-V9KUSZJM -->
### Fact Currency and Auto-Supersession Not Yet Implemented
**When:** 2026-06-19 · **Fact:** `P-V9KUSZJM`
**Why:** Projects evolve and generate multiple generations of design docs; the kit needs a way to surface current facts authoritatively. Task 66/95 planned for v0.4.

<!-- decision:P-WZMCCFLE -->
### Down-payment + full-redesign split pattern (D-154 precedent, v0.3.1)
**When:** 2026-06-19 · **Fact:** `P-WZMCCFLE`
**Why:** Captures urgency and ships the wedge-critical part without diluting committed minors or re-opening settled decisions.

<!-- decision:P-FG56FKV2 -->
### One-differentiator-per-minor rule (D-146)
**When:** 2026-06-19 · **Fact:** `P-FG56FKV2`
**Why:** Keeps release scope clear and focused. Violations delay both features and diffuse impact.

<!-- decision:P-JYBXNXE7 -->
### Task 151 classification and strategic weight
**When:** 2026-06-19 · **Fact:** `P-JYBXNXE7`
**Why:** Soft spots in foundational features affect downstream systems. New evidence (D-177 data) raises Task 151's importance relative to curation work.

<!-- decision:P-XXYKQaRS -->
### v0.3.5 patch vs v0.4.0 versioning logic
**When:** 2026-06-19 · **Fact:** `P-XXYKQaRS`
**Why:** Preserves single-differentiator rule, ships important fixes sooner, doesn't delay committed work.

<!-- decision:P-MSZXZ6VS -->
### Project Origin and Core Problem
**When:** 2026-06-19 · **Fact:** `P-MSZXZ6VS`
**Why:** This origin story is the foundation of all design decisions and prioritization. The kit exists to solve the user's real problem (forgetting context across sessions), not for its own sake. The video's thesis (recall reliability is the most important layer) validates why injection-layer quality is core product value.

<!-- decision:P-SPBREG3F -->
### HC-9 Drift After Claude Code Update (v0.3.4)
**When:** 2026-06-20 · **Fact:** `P-SPBREG3F`
**Why:** v0.3.4 detects when tool updates diverge the cached state and provides a simple recovery path. A future session encountering this drift needs to know it's not indicative of a real problem.

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-NWG4PSPL -->
### Always create .venv for Python projects; install packages into it, not globally
**When:** 2026-06-19 · **Fact:** `P-NWG4PSPL`

<!-- decision:P-TLKQFR7Z -->
### Layered backend architecture: routes (thin, orchestrate transport only), service
**When:** 2026-06-19 · **Fact:** `P-TLKQFR7Z`

<!-- decision:P-LHNFGNQX -->
### Prefer paying architectural cost upfront to avoid maintenance friction later—"ra
**When:** 2026-06-19 · **Fact:** `P-LHNFGNQX`

<!-- decision:P-GAaL225G -->
### User's convention: claude-memory-kit backups go to ~\ (not temp directories)
**When:** 2026-06-19 · **Fact:** `P-GAaL225G`

<!-- decision:P-KQGKWQUT -->
### User reconsidering whether Task 151 (persona-redesign) should enter v0.4.0 despi
**When:** 2026-06-19 · **Fact:** `P-KQGKWQUT`

<!-- decision:P-HP6UTS9X -->
### Don't do v0.3.5 down-payment (full work/tests, no kit payoff); do full 151 redes
**When:** 2026-06-19 · **Fact:** `P-HP6UTS9X`

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-F29TVCRT -->
### FQ1 test coverage gap — the cut-gate probe is CLI-only, not MCP tool (the actual
**When:** 2026-06-20 · **Fact:** `P-F29TVCRT`

<!-- decision:P-D2BR4VYX -->
### Auto-recall agents do not and should not read tombstoned facts; recovery is alwa
**When:** 2026-06-20 · **Fact:** `P-D2BR4VYX`

<!-- decision:P-K6DKFXP4 -->
### Check documentation to verify technical claims rather than reasoning through unc
**When:** 2026-06-20 · **Fact:** `P-K6DKFXP4`

<!-- decision:P-Y9DZXM3D -->
### Tasks 156 (DECISIONS.md AI-recall) and 155 (tombstone recovery flag) queued for
**When:** 2026-06-20 · **Fact:** `P-Y9DZXM3D`

<!-- decision:P-DEQV4AUL -->
### v0.3.2 ships FTS5 query fix (Task 153) + validate-index (Task 152)
**When:** 2026-06-20 · **Fact:** `P-DEQV4AUL`

<!-- decision:P-N6ZTVDUC -->
### v0.3.2 shipped to npm (@lh8ppl/claude-memory-kit@0.3.2) with SLSA provenance and
**When:** 2026-06-20 · **Fact:** `P-N6ZTVDUC`

<!-- decision:P-CLTKNaVa -->
### Memory routing gap caught — I was writing to harness slug path instead of kit's
**When:** 2026-06-20 · **Fact:** `P-CLTKNaVa`

<!-- decision:P-KKYS67aQ -->
### node:sqlite migration rejected—clean CI perf data showed 10% slower search perfo
**When:** 2026-06-20 · **Fact:** `P-KKYS67aQ`

<!-- decision:P-aG3GHZBE -->
### v0.3.3 roadmap: Task 156 (DECISIONS.md AI-recall journal completion), Task 155 (
**When:** 2026-06-20 · **Fact:** `P-aG3GHZBE`

<!-- decision:P-BFTDUAQT -->
### DECISIONS.md is the decision journal; Task 159 makes it auto-update automaticall
**When:** 2026-06-20 · **Fact:** `P-BFTDUAQT`

<!-- decision:P-94DQYLBM -->
### INDEX.md is the kit's metadata index of all 307 memory facts; touched on every f
**When:** 2026-06-20 · **Fact:** `P-94DQYLBM`

<!-- decision:P-DCP2GLQY -->
### Task 159 made two undocumented divergences from research spec: used `isJournalSt
**When:** 2026-06-20 · **Fact:** `P-DCP2GLQY`

<!-- decision:P-UY6XTETK -->
### Expects implementation choices to be traceable to (or explicitly justified again
**When:** 2026-06-20 · **Fact:** `P-UY6XTETK`

<!-- decision:P-HGAHKL9H -->
### 6 mattpocock skills (tdd, grilling, diagnosing-bugs, codebase-design, domain-mod
**When:** 2026-06-20 · **Fact:** `P-HGAHKL9H`

<!-- decision:P-WCBPVNEa -->
### Skills available but not invoked despite matching work; violates Skill agency ru
**When:** 2026-06-20 · **Fact:** `P-WCBPVNEa`

<!-- decision:P-6DNYCTB2 -->
### Code-review-excellence is pre-existing skill, not one of 6 newly adopted; produc
**When:** 2026-06-20 · **Fact:** `P-6DNYCTB2`

<!-- decision:P-A2XCSPSa -->
### CHANGELOG date for v0.3.3 is 2026-06-18
**When:** 2026-06-20 · **Fact:** `P-A2XCSPSa`

<!-- decision:P-54X6D2DM -->
### cmk-compress-session must be invoked by Claude Code at session-end, not manually
**When:** 2026-06-20 · **Fact:** `P-54X6D2DM`

<!-- decision:P-YA74AXRJ -->
### Nested-`claude` invocations from inside an active Claude Code session timeout at
**When:** 2026-06-20 · **Fact:** `P-YA74AXRJ`

<!-- decision:P-DV52LVVN -->
### D6 (now→today roll) fail-safe behavior confirmed: timeout logs cleanly, now.md i
**When:** 2026-06-20 · **Fact:** `P-DV52LVVN`

<!-- decision:P-LD7RPCTX -->
### Honest uncertainty flagging: can't be 100% sure whether compress timeout is envi
**When:** 2026-06-20 · **Fact:** `P-LD7RPCTX`

<!-- decision:P-KKALEZCP -->
### Only 2 of 19 systems (memsearch, Letta) cleanly implement A+B+C (buffer cap + de
**When:** 2026-06-20 · **Fact:** `P-KKALEZCP`

<!-- decision:P-5WHKZPR3 -->
### Kit's memory system uses a `now → today → recent → archive` rolling window; `now
**When:** 2026-06-20 · **Fact:** `P-5WHKZPR3`

<!-- decision:P-WYEEXZRN -->
### Root cause: roll mechanism fires only at SessionStart/SessionEnd, not turn bound
**When:** 2026-06-20 · **Fact:** `P-WYEEXZRN`

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-4TGBBBPB -->
### 200KB input compresses in ~15s standalone (no contention); real-world failures o
**When:** 2026-06-20 · **Fact:** `P-4TGBBBPB`

<!-- decision:P-MXSa47QX -->
### User prefers memory designs tailored to kit's actual architecture over patterns
**When:** 2026-06-20 · **Fact:** `P-MXSa47QX`

<!-- decision:P-E7AL69YL -->
### observability-first approach — captures real failure data before implementing de
**When:** 2026-06-20 · **Fact:** `P-E7AL69YL`

<!-- decision:P-ZMRE4MSU -->
### Cascade-Starvation: Lazy Distill Limitation on Busy Repos
**When:** 2026-06-20 · **Fact:** `P-ZMRE4MSU`
**Why:** Known limitation (Task 105/D-75). Surfaces as unexpected staleness on high-activity projects. Lazy SessionStart fallback is insufficient as *sole* distill mechanism for hierarchical compression.

<!-- decision:P-2RaREHLR -->
### CMK Health Check Status (2026-06-20)
**When:** 2026-06-20 · **Fact:** `P-2RaREHLR`
**Why:** Captures current health state. Staleness is caused by two compounding issues: (1) cascade-starvation where stale-now verdict blocks stale-daily/weekly refresh cycles, (2) unretried haiku_timeout on weekly compression (predates v0.3.4). Cron not registered means no scheduled background distill; only lazy fallback on SessionStart. Native auto-memory running in parallel with kit layers.

<!-- decision:P-BKCWY2C6 -->
### Cron Job Registration Feature (HC-5)
**When:** 2026-06-20 · **Fact:** `P-BKCWY2C6`
**Why:** Without cron, lazy SessionStart fallback is the only automatic distill path, which starves on busy repos (cascade-starvation). Scheduled cron runs provide reliable daily/weekly cycles — the real fix for staleness on high-activity dogfood/test projects.

<!-- decision:P-BDQ7XNU5 -->
### Weekly Compression Timeout and v0.3.4 Retry Logic
**When:** 2026-06-20 · **Fact:** `P-BDQ7XNU5`
**Why:** Large compressions can timeout; v0.3.4 added retry recovery. The unretried timeout in this session predates the fix. With new install, future timeouts should auto-retry.

<!-- decision:P-ABWV2PS7 -->
### LLM Timeout Retries: Backoff Interval Strategy
**When:** 2026-06-20 · **Fact:** `P-ABWV2PS7`
**Why:** Short backoff intervals (< 1s) don't give slow LLM windows time to pass; they just hammer with back-to-back requests. Long waits (5–10s) align with field practice and let transient slowness resolve naturally.

<!-- decision:P-6U7SCR5a -->
### Register Crons for Staleness/Starvation Prevention
**When:** 2026-06-20 · **Fact:** `P-6U7SCR5a`
**Why:** Crons are the designed fix for staleness and cascade-starvation; background distill-curate cycle prevents memory degradation over time

<!-- decision:P-Ta2YJJaB -->
### Tag and Publish v0.3.5 Release
**When:** 2026-06-20 · **Fact:** `P-Ta2YJJaB`
**Why:** Release commit b4ecf78 is on main and ready; tagging is the publish gate that automates npm and GitHub release

<!-- decision:P-WQDKTWEG -->
### Close Claude Code Before Global cmk Install to Avoid EBUSY
**When:** 2026-06-20 · **Fact:** `P-WQDKTWEG`
**Why:** Claude Code's MCP processes hold file locks; npm needs exclusive DLL access during installation. DLL contention occurs on Windows.

<!-- decision:P-NZE35AKR -->
### Local Tarball Testing Path (Pre-Publish Gate)
**When:** 2026-06-20 · **Fact:** `P-NZE35AKR`
**Why:** Catches bugs before they reach npm; reduces risk of bad versions going public; aligns with established cut-gate.md pattern, proven effective for v0.3.5.

<!-- decision:P-2WWX4ZHY -->
### v0.3.5 Release Verified and Ready
**When:** 2026-06-20 · **Fact:** `P-2WWX4ZHY`
**Why:** Confirms end-to-end fix works and no blockers remain; safe to publish.

<!-- decision:P-RES031CG -->
### RESUME — v0.3.1 cut-gate near-complete; PR
**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-TSBAKGD7 -->
### Expects comprehensive accounting of work—what was kept, what was superseded but
**When:** 2026-06-20 · **Fact:** `P-TSBAKGD7`

<!-- decision:P-9YCUW5QH -->
### Distill Performance Baselines (Slow vs Healthy Haiku)
**When:** 2026-06-20 · **Fact:** `P-9YCUW5QH`
**Why:** Manual distill run on 2026-06-20 took 240s and succeeded, confirming the v0.3.5 retry fix handles slow-Haiku windows where v0.3.4 would have failed entirely. This is the exact scenario the timeout/backoff tuning targets.
