# Decisions

> Append-only decision journal — every decision the kit captured, in order, with its why.
> Maintained by claude-memory-kit (`cmk digest`). Superseded/retracted entries stay (the trail is the point).

<!-- decision:P-ZPU3YLGH -->

## embedder ladder policy

**When:** 2026-06-10 · **Fact:** `P-ZPU3YLGH`
**Why:** MTEB rankings don't cover our short-fact corpus; the user prefers bigger-and-reliable over small-and-flaky, so the benchmark decides, not vibes (D-105)

<!-- decision:P-Aa22MJAC -->

## semantic backend: sqlite-vec primary, zvec fallback

**When:** 2026-06-10 · **Fact:** `P-Aa22MJAC`
**Why:** sqlite-vec puts vectors inside the SQLite index the kit already runs (one store, design 9.3.1 fit); zvec is embedded+Node+Windows but its bindings are only ~May-2026 old

<!-- decision:P-MHKMPLCR -->

## public-repo memory policy

**When:** 2026-06-10 · **Fact:** `P-MHKMPLCR`
**Why:** transcripts and session logs carry raw dev-conversation content (name-privacy class), so they stay machine-local here; a normal private project commits them (D-108 deviation)

<!-- decision:P-2THQQ9UU -->

## Degradation Messaging Pattern

**When:** 2026-06-10 · **Fact:** `P-2THQQ9UU`
**Why:** Users need to understand why behavior changed and what they can do. This is the UX standard for degradation in this project.

<!-- decision:P-N9BGGaK6 -->

## Transient Failure Retry Strategy

**When:** 2026-06-10 · **Fact:** `P-N9BGGaK6`
**Why:** A single transient delay can cause false negatives; 5 seconds is low-cost. Distinguishing jitter from real degradation prevents flaky CI while preserving signal for real b

<!-- decision:P-CBDN7KXQ -->

## User validates pragmatic retry-with-wait approach for transient failures ("maybe

**When:** 2026-06-10 · **Fact:** `P-CBDN7KXQ`

<!-- decision:P-QXDNaC5U -->

## v0.3.0 is BUILD-COMPLETE (2026-06-10): Tasks 46/125/124/75(all)/104(all) shipped

**When:** 2026-06-10 · **Fact:** `P-QXDNaC5U`

<!-- decision:P-MHCAaYVG -->

## Cut-Gate Testing Guide (Manual Release QA)

**When:** 2026-06-10 · **Fact:** `P-MHCAaYVG`
**Why:** Encodes hard-won lessons (D-84, v0.2.0, Task-75) into repeatable process; prevents regression and avoids known gotchas; respects user's time with clear estimates and scope boundaries.

<!-- decision:P-a5W95QXS -->

## This file (docs/process/cut-gate.md) is their manual live-test guide for release

**When:** 2026-06-10 · **Fact:** `P-a5W95QXS`

<!-- decision:P-TaHaDQV7 -->

## B5/B7 Probe Footgun — settings.json Wholesale Overwrite

**When:** 2026-06-10 · **Fact:** `P-TaHaDQV7`
**Why:** Running B5/B7 in a working directory (not throwaway) corrupts configuration.

<!-- decision:P-VNH3PTEL -->

## Task 124 — Auto-Reindex for cmk forget Command

**When:** 2026-06-10 · **Fact:** `P-VNH3PTEL`
**Why:** Eliminates manual bookkeeping in memory management workflows; reduces error surface.

<!-- decision:P-R5B4C5NR -->

## Authority Preamble Is the Key Behavioral Lever in Memory Injection

**When:** 2026-06-10 · **Fact:** `P-R5B4C5NR`

<!-- decision:P-TDMC9ZWE -->

## Convergent Design Validation — External System Mirrors Kit Architecture

**When:** 2026-06-10 · **Fact:** `P-TDMC9ZWE`
**Why:** Independent validation of the design reduces architectural risk and confirms the waterfall pattern is sound. Proof point for stakeholders and defense against mono-search proposals.

<!-- decision:P-JGNBLDR3 -->

## Embedding Model Trade-off: bge-base vs bge-m3 (Benchmarked Choice)

**When:** 2026-06-10 · **Fact:** `P-JGNBLDR3`
**Why:** Model selection must be task-specific. bge-m3 is not universally better — it underperforms on the kit's exact retrieval challenge. The benchmark (D-109) grounded this choice in data, not vibes.

<!-- decision:P-aA5S5S2U -->

## User confirmed companion project approach for Task 127 aligns with kit philosoph

**When:** 2026-06-10 · **Fact:** `P-aA5S5S2U`

<!-- decision:P-NFJFMJTT -->

## User prefers rapid execution ("do it, why wait?" and "why not just do it now?" s

**When:** 2026-06-10 · **Fact:** `P-NFJFMJTT`

<!-- decision:P-FHA3DTCB -->

## Semantic Search: Opt-In Dependency, Default-On Behavior

**When:** 2026-06-10 · **Fact:** `P-FHA3DTCB`
**Why:** Project aims to be lightweight (supporting users who only want markdown memory) while offering excellent UX to those who want semantic search. Balances these constraints via a design principle: dependency opt-in, behavior default-on.

<!-- decision:P-BDJHESCB -->

## CHANGELOG Script Assertion — Non-Unique Anchor Gotcha

**When:** 2026-06-11 · **Fact:** `P-BDJHESCB`
**Why:** Silent script failures are easy to miss in automated workflows; this is a recurring gotcha.

<!-- decision:P-CL9DBDJK -->

## Stub Command Removal — Five-Piece Pattern

**When:** 2026-06-11 · **Fact:** `P-CL9DBDJK`
**Why:** Stub deletions touch multiple locations across the codebase; recording the pattern prevents incomplete removals.

<!-- decision:P-ULTaWK4B -->

## Release Gate Structure (v0.3.0)

**When:** 2026-06-11 · **Fact:** `P-ULTaWK4B`
**Why:** D3's promotion to required blocker is a recent change; the next release cycle must respect this gate structure.

<!-- decision:P-ZQLQ65UP -->

## Session 2026-06-11 closed fully shipped: PRs #159 (sessions searchable), #160 (d

**When:** 2026-06-11 · **Fact:** `P-ZQLQ65UP`

<!-- decision:P-WK53SJZ5 -->

## Carefully reviews changes for unintended scope loss. This scrutiny identified a

**When:** 2026-06-11 · **Fact:** `P-WK53SJZ5`

<!-- decision:P-MRWY2C43 -->

## Cut Gate Must Test Full Recall Ladder

**When:** 2026-06-11 · **Fact:** `P-MRWY2C43`
**Why:** The cut-gate is the kit's comprehensive health check; every subsystem must be proven to work end-to-end. Gaps in coverage may be invisible in a summary diff.

<!-- decision:P-7L3FTZ3Y -->

## Prefers comprehensive, full end-to-end test coverage. Concerned that changes shi

**When:** 2026-06-11 · **Fact:** `P-7L3FTZ3Y`

<!-- decision:P-Pa5RBNQ4 -->

## Release Git Choreography: Memory, Release, Tag (in order)

**When:** 2026-06-11 · **Fact:** `P-Pa5RBNQ4`
**Why:** Keeps the tree clean; release commits reflect versioning, not session metadata. Memory churn is incidental to development, not part of the release artifact.

<!-- decision:P-VHMVDFZP -->

## The kit NEVER runs git on the user's behalf — settled product position, user-con

**When:** 2026-06-11 · **Fact:** `P-VHMVDFZP`
**Why:** Hooks running git would race with the user's own staging/rebases and create per-turn commit noise; on public repos, reviewing the memory diff before commit IS the privacy gate (facts about the user would otherwise publish sight-unseen). The user: 'i wouldnt want to do git commands for people automaticly.'

<!-- decision:P-VC4UGJTP -->

## Does not want Claude to automatically execute git commands; prefers explicit use

**When:** 2026-06-11 · **Fact:** `P-VC4UGJTP`

<!-- decision:P-L6J7QRDL -->

## Automation Boundary Principle for claude-memory-kit

**When:** 2026-06-11 · **Fact:** `P-L6J7QRDL`
**Why:** Every auto-committing tool eventually has the "it committed something I didn't want" problem. Memory systems have observer-effect dynamics — discussing the system changes it. The correct gate is human review before publication, not automation of the user's authorship surface.

<!-- decision:P-aLPJJGFL -->

## Separate Memory Captures from Release Commits

**When:** 2026-06-11 · **Fact:** `P-aLPJJGFL`
**Why:** Release commits should show only what went into the release — when auditing `release: vX.Y.Z` later, the commit should be uncluttered and reviewable as a pure version bump. Accumulated memory captures muddy that history.

<!-- decision:P-674Q5D5M -->

## Changes since version 0.2.3 appear to have introduced failures in memory kit

**When:** 2026-06-11 · **Fact:** `P-674Q5D5M`

<!-- decision:P-E2GNU77L -->

## Composition Bug Pattern in claude-memory-kit

**When:** 2026-06-11 · **Fact:** `P-E2GNU77L`
**Why:** Composition failures hide in unit-green suites; requires end-to-end Stop-hook chain testing (capture → detached spawn → live extraction) to surface

<!-- decision:P-L4Q72B3Y -->

## MEMORY.md scratchpad still contains only example bullets instead of populating w

**When:** 2026-06-11 · **Fact:** `P-L4Q72B3Y`

<!-- decision:P-MZDaYRWX -->

## Requesting complete re-verification: check previous test gate outputs (gate7), r

**When:** 2026-06-11 · **Fact:** `P-MZDaYRWX`

<!-- decision:P-94E7GN3T -->

## Release Cut Gate Validation Pattern

**When:** 2026-06-11 · **Fact:** `P-94E7GN3T`
**Why:** Validates memory extraction system is working before release; acts as a final quality check that automated testing otherwise misses.

<!-- decision:P-7FM6NVP4 -->

## Skill composition pattern: scaffold + allow-list must be updated together

**When:** 2026-06-11 · **Fact:** `P-7FM6NVP4`
**Why:** Second occurrence of this composition pattern (memory-write in Task 90 was the first). This repeating bug class should be prevented in future skill additions.

<!-- decision:P-GUWLUBBT -->

## Two Bugs Fixed—Validation Points for Session 1 & 2

**When:** 2026-06-11 · **Fact:** `P-GUWLUBBT`
**Why:** These were bugs causing test suite failures. The PR fixes both; Session 1 & 2 testing confirms the fixes work correctly.

<!-- decision:P-XUQK356C -->

## Post-Merge Checkout Race Condition (Kit Memory Writes)

**When:** 2026-06-11 · **Fact:** `P-XUQK356C`
**Why:** The kit maintains and actively modifies its own `context/` during operations. Merge/checkout operations can race with these writes, causing transient stale branches.

<!-- decision:P-QC26V7EB -->

## Claude Memory Kit — cmk Doctor Baseline (Pre-First-Turn)

**When:** 2026-06-11 · **Fact:** `P-QC26V7EB`
**Why:** Baseline expectations distinguish healthy early state from actual failures. Skip count acts as a maturity indicator — changing skip counts are normal and reflect the system warming up.

<!-- decision:P-69AFCHKZ -->

## Claude Memory Kit — Template File Structure in Tarball

**When:** 2026-06-11 · **Fact:** `P-69AFCHKZ`
**Why:** The template structure defines what gets installed into fresh projects. Knowing exact file count and layout helps verify pack completeness and predict post-install directory structure.

<!-- decision:P-TTL9GSJV -->

## Reliable tarball file validation with npm pack --json

**When:** 2026-06-11 · **Fact:** `P-TTL9GSJV`
**Why:** Manual `tar -tzf` verification is error-prone. Structural validators need a reliable source of truth that can be asserted at test time.

<!-- decision:P-X5VHDWAE -->

## Validator pattern: structural guards in test suite (Task 128 reference)

**When:** 2026-06-11 · **Fact:** `P-X5VHDWAE`
**Why:** Converting manual verification steps into permanent test-time guarantees catches silent failures (e.g., missing template files) early, not at user time.

<!-- decision:P-RP4BG3YM -->

## Pre-Session Verification Checklist Structure

**When:** 2026-06-11 · **Fact:** `P-RP4BG3YM`
**Why:** Multi-stage verification (file-side / in-session / live-test) catches config issues, integration problems, and artifact integrity before release.

<!-- decision:P-aN9PaSGC -->

## Validation Gate Structure (cut-gate9 Release)

**When:** 2026-06-11 · **Fact:** `P-aN9PaSGC`
**Why:** Standardized gates catch regressions; each check owns a specific concern. Automation verifies what it can; in-session UX and skip-prompt behavior require hands-on testing.

<!-- decision:P-3SFJR4LM -->

## Code Scar: Overly-Broad Injection Pattern

**When:** 2026-06-11 · **Fact:** `P-3SFJR4LM`

<!-- decision:P-MLV9MSPR -->

## poison-guard.mjs: Specific Provider Patterns Are By Design

**When:** 2026-06-11 · **Fact:** `P-MLV9MSPR`
**Why:** Threat model is accidental leakage. False positives = DoS against system's own legitimate memory content.

<!-- decision:P-7XKFaB2N -->

## Secret Leakage Defense-in-Depth Model

**When:** 2026-06-11 · **Fact:** `P-7XKFaB2N`
**Why:** No single filter is complete. Layering reduces likelihood accidental secrets reach git.

<!-- decision:P-4TSUCAM5 -->

## as long as it adds and not deminish — standing constraint on change scope

**When:** 2026-06-11 · **Fact:** `P-4TSUCAM5`

<!-- decision:P-RL2aKHKQ -->

## Prefers concise, numbered instructions without narrative explanation or backgrou

**When:** 2026-06-11 · **Fact:** `P-RL2aKHKQ`

<!-- decision:P-AFLZRQJ5 -->

## Extraction Output Truncation Bug

**When:** 2026-06-11 · **Fact:** `P-AFLZRQJ5`
**Why:** Prevents dense inference turns from poisoning the fact archive; must validate shape completeness.

<!-- decision:P-Y5U33ATF -->

## Release Gate Process (Template from v0.3.0)

**When:** 2026-06-11 · **Fact:** `P-Y5U33ATF`
**Why:** This gate sequence validates the kit works in cold-start scenarios (Session 3 ensures new users aren't surprised), the guide is accurate (F-sweep), packaging is clean (re-pack), and finally publishes. Designed and validated for v0.3.0 release.

<!-- decision:P-PSN32KXM -->

## E1 Test Scoring Criteria (Backend Code Generation)

**When:** 2026-06-11 · **Fact:** `P-PSN32KXM`
**Why:** E1 validates that memory successfully embedded the user's backend philosophy (FastAPI, type safety, testing discipline) into code generation without explicit prompting. This is the core efficacy test.

<!-- decision:P-NYDA656J -->

## FastAPI Project Scaffolding Workflow and Structure

**When:** 2026-06-11 · **Fact:** `P-NYDA656J`
**Why:** Provides repeatable, testable scaffolding with proper layering (config/routes/schemas/tests separation), async-first design, and immediate verification

<!-- decision:P-CXC5JJHU -->

## User chose REST API backend with FastAPI and no database for new project

**When:** 2026-06-11 · **Fact:** `P-CXC5JJHU`

<!-- decision:P-7HE9BCZW -->

## User uses uv for Python project initialization and dependency management

**When:** 2026-06-11 · **Fact:** `P-7HE9BCZW`

<!-- decision:P-AXBVF6WA -->

## npm pack executed successfully; @lh8ppl/claude-memory-kit v0.3.0 tarball generat

**When:** 2026-06-11 · **Fact:** `P-AXBVF6WA`

<!-- decision:P-Za6L72JM -->

## canonicalize() Super-Linear Regex Hotspot

**When:** 2026-06-11 · **Fact:** `P-Za6L72JM`
**Why:** Confirmed real pattern, but execution is too constrained for practical risk. Behavior-identical fix ensures downstream stability.

<!-- decision:P-LUGG95FY -->

## SonarCloud Hotspot Review — Mark Safe with Comment

**When:** 2026-06-11 · **Fact:** `P-LUGG95FY`
**Why:** Tool limitation requires documented workaround; risk assessment and rationale must be visible to team and future sessions

<!-- decision:P-DGN6ZNXZ -->

## v0.4 Roadmap — Kiro-First Editor Integration

**When:** 2026-06-11 · **Fact:** `P-DGN6ZNXZ`
**Why:** Clear sequencing unblocks user's own workflow first; Kiro support is critical path for v0.4 utility

<!-- decision:P-MWJCVZBH -->

## SonarQube Hotspot Review Script Filtering Logic

**When:** 2026-06-11 · **Fact:** `P-MWJCVZBH`
**Why:** Slow-regex performance is critical in files with large input scope; these require human judgment rather than automated wave-through to avoid missing real issues.

<!-- decision:P-XQ9RYXaJ -->

## Backlog for v0.3.x and v0.4

**When:** 2026-06-11 · **Fact:** `P-XQ9RYXaJ`
**Why:** These tasks emerged from the quality gate review and are ready to schedule.

<!-- decision:P-NHPPPXGD -->

## QA Verification Discipline Before Release

**When:** 2026-06-11 · **Fact:** `P-NHPPPXGD`
**Why:** Catches false positives; provides audit trail for future readers auditing why each decision was made.

<!-- decision:P-9NaMaLE6 -->

## v0.3.0 Released With Green Quality Gate

**When:** 2026-06-11 · **Fact:** `P-9NaMaLE6`
**Why:** Marks completion of the quality gate enforcement for this release; establishes clean baseline for next session.

<!-- decision:P-CW99QNUX -->

## npm v12 Breaking Change and better-sqlite3 Migration Plan

**When:** 2026-06-11 · **Fact:** `P-CW99QNUX`
**Why:** npm 12 ships next month, breaking all new users. Structural fix also eliminates known Windows pain. Time-sensitive.

<!-- decision:P-JRXWU6JP -->

## We can upgrade to latest Node version at any time — no legacy version constraint

**When:** 2026-06-11 · **Fact:** `P-JRXWU6JP`

<!-- decision:P-JN3BYXJN -->

## When asked for a review/opinion, provide that analysis only—don't autonomously w

**When:** 2026-06-11 · **Fact:** `P-JN3BYXJN`

<!-- decision:P-TCKSCKAC -->

## Core Philosophy of the Kit

**When:** 2026-06-11 · **Fact:** `P-TCKSCKAC`
**Why:** Transparency and auditability are core to kit's value proposition versus enterprise fleet systems like memclaw

<!-- decision:P-W7TSERZR -->

## Crystallization with Reviewable Proposals (Task 95)

**When:** 2026-06-11 · **Fact:** `P-W7TSERZR`
**Why:** Achieves memclaw's deduplication goal (rot elimination) while maintaining kit's transparency and audit trail

<!-- decision:P-22VAP6JX -->

## Lazy Re-Embedding on Model Upgrades

**When:** 2026-06-11 · **Fact:** `P-22VAP6JX`
**Why:** Deferral scales to large deployments; feasible once transcript chunks reach thousands

<!-- decision:P-VS9AKQ7P -->

## Memory Trust Scoring — Event-Driven Instead of Server-Side

**When:** 2026-06-11 · **Fact:** `P-VS9AKQ7P`
**Why:** Adopts memclaw's earned-trust insight without requiring server infrastructure or API costs on every write

<!-- decision:P-4aaKKRKV -->

## PII Handling — Non-Adoption of Quarantine

**When:** 2026-06-11 · **Fact:** `P-4aaKKRKV`
**Why:** Kit's memory lives in git repos — privacy (discard-on-sight) is higher priority than quarantine-for-review UX

<!-- decision:P-DW269VXT -->

## cmk Task and Decision Record Governance

**When:** 2026-06-11 · **Fact:** `P-DW269VXT`
**Why:** Codifies cmk's project management model — how work, decisions, and priorities are tracked

<!-- decision:P-GFTYR6T3 -->

## Confirmed adding 4 new task proposals to cmk backlog with minimal response "slot

**When:** 2026-06-11 · **Fact:** `P-GFTYR6T3`

<!-- decision:P-PRJ9QDGG -->

## v0.3.x Release Lane — Tasks 142–145 Priority Order

**When:** 2026-06-11 · **Fact:** `P-PRJ9QDGG`
**Why:** User confirmed slotting 4 new proposals; establishes next-phase roadmap and priorities

<!-- decision:P-2UW5RAKR -->

## PAI (Personal AI Infrastructure) Memory & Architecture Convergence

**When:** 2026-06-12 · **Fact:** `P-2UW5RAKR`
**Why:** Independent convergence strongly validates the kit's memory taxonomy and paradigm. The RELATIONSHIP category is a genuine gap—tracking collaboration evolution could inform Task 55 (meta-learning). The architectural framing clarifies the kit's unique value proposition: composability and zero-friction adoption.

<!-- decision:P-NXF3aCPB -->

## Semantic Search vs. Grep Trade-Off (D-111 Design Rationale)

**When:** 2026-06-12 · **Fact:** `P-NXF3aCPB`
**Why:** The kit's semantic-search choice diverges from PAI despite shared philosophy. The decision is data-driven (benchmarked) and intentional, not a paradigm violation. Documents why the choice was made for future reconsideration.

<!-- decision:P-NQ7WEWSJ -->

## D-111 Design as Bridge Position

**When:** 2026-06-12 · **Fact:** `P-NQ7WEWSJ`
**Why:** Independent convergence of two respected systems on opposing positions suggests both are contextually correct; the kit's D-111 is the synthesis, not a compromise

<!-- decision:P-5RYWEUQM -->

## D-121 Viewer — Reconsidered for v0.4 Design Slot

**When:** 2026-06-12 · **Fact:** `P-5RYWEUQM`
**Why:** D-121 was parked with "keep the idea" reasoning. Pulse at that scale is the strongest argument yet that this feature set has genuine demand, not just theoretical appeal.

<!-- decision:P-LUQGGBRS -->

## Task 55 Enrichment — RELATIONSHIP Memory + Learn Phase

**When:** 2026-06-12 · **Fact:** `P-LUQGGBRS`
**Why:** Three independent design systems converged on capturing task retrospectives + collaboration memory, signaling this is a genuine missing piece

<!-- decision:P-E3SWXCSY -->

## Kit Architecture — Index Routing and Fact Storage

**When:** 2026-06-12 · **Fact:** `P-E3SWXCSY`
**Why:** The pattern scales to large corpora while keeping session context tractable. Multiple independent research efforts converged on this design, validating the approach.

<!-- decision:P-MY3CHJ94 -->

## Memory Evaluation Metrics — Outcome vs. Retrieval Level

**When:** 2026-06-12 · **Fact:** `P-MY3CHJ94`
**Why:** The distinction clarifies scope — retrieval validates internal function, outcome validates user value. Different metrics answer different questions and drive different decisions.

<!-- decision:P-97GWWRNU -->

## Research Inclusion Bar for SOURCES Artifact

**When:** 2026-06-12 · **Fact:** `P-97GWWRNU`
**Why:** The SOURCES artifact must remain credible and actionable. Unverified claims dilute the research base and mislead future development decisions.

<!-- decision:P-DUZYECE4 -->

## v0.3.0 PUBLISHED 2026-06-11 (npm + GitHub Release) after the gate day: 8 bugs fo

**When:** 2026-06-12 · **Fact:** `P-DUZYECE4`

<!-- decision:P-Y5N7FSAV -->

## Auto-Compact Fidelity Loss Mid-Task

**When:** 2026-06-12 · **Fact:** `P-Y5N7FSAV`
**Why:** Fidelity loss forces the next session to re-derive missing context, negating the kit's designed benefit of seamless continuity across boundaries.

<!-- decision:P-TUJKaAQ6 -->

## Autopilot Memory Consultation Architecture

**When:** 2026-06-12 · **Fact:** `P-TUJKaAQ6`
**Why:** Autopilot work must leverage memory without explicit asking; design balances autonomous value against deliberate human control over forget/queue decisions.

<!-- decision:P-GRUJ3P7Q -->

## Memory Kit + Workflows Integration Surface

**When:** 2026-06-12 · **Fact:** `P-GRUJ3P7Q`
**Why:** Workflow agents start cold (no context on user setup/decisions); kit multiplies core utility across swarm scale.

<!-- decision:P-DC97QaDC -->

## Pre-session verification found one composition bug (memory-search allow-list omi

**When:** 2026-06-12 · **Fact:** `P-DC97QaDC`

<!-- decision:P-JU7RRUT9 -->

## Assistant overgeneralized a prior context-specific permission ("for ruflo, you d

**When:** 2026-06-12 · **Fact:** `P-JU7RRUT9`

<!-- decision:P-SKYZHH2U -->

## Autopilot memory is mixed push (SessionStart snapshot always in context) and pul

**When:** 2026-06-12 · **Fact:** `P-SKYZHH2U`

<!-- decision:P-Q4TA2SAX -->

## Prefers terse, step-by-step instructions with time estimates and optional paths

**When:** 2026-06-12 · **Fact:** `P-Q4TA2SAX`

<!-- decision:P-BJQaGQ6H -->

## Iterative, thorough research approach—adds items even near session end rather th

**When:** 2026-06-12 · **Fact:** `P-BJQaGQ6H`

<!-- decision:P-A6XDaDHA -->

## Kit Feature Gap — Chronological Decision Rendering

**When:** 2026-06-12 · **Fact:** `P-A6XDaDHA`
**Why:** That both the kit and Squad independently maintain chronological journals indicates this view type is valuable beyond individual-fact retrieval. The gap is a missed product feature—a natural extension of `cmk digest`.

<!-- decision:P-7RQTaMU4 -->

## Kit's Decision Log — Manual Maintenance Pattern

**When:** 2026-06-12 · **Fact:** `P-7RQTaMU4`
**Why:** Both the kit team and peer projects (Squad) independently maintain chronological decision journals, suggesting this narrative form provides value that individual-fact storage doesn't. The kit chose to keep D-log authoritative rather than migrate to the fact model.

<!-- decision:P-XTLTaX5C -->

## Decision-Journal View Gap — Now Task 147

**When:** 2026-06-12 · **Fact:** `P-XTLTaX5C`
**Why:** User pattern discovery — manual decision journaling across multiple teams signals a real user need the kit doesn't yet meet

<!-- decision:P-9GQSPN2C -->

## Proactively seeks good ideas and practices from peer/sibling projects to steal o

**When:** 2026-06-12 · **Fact:** `P-9GQSPN2C`

<!-- decision:P-BJ9J9GP7 -->

## Squad Sweep Complete — Seven Tasks Slotted (141–147)

**When:** 2026-06-12 · **Fact:** `P-BJ9J9GP7`
**Why:** Documents the scope and closure of a multi-session source-inventory effort; establishes what tasks are now in flight and their provenance

<!-- decision:P-F5M3VBTG -->

## User gates session close with verification question "is everything in lane? slot

**When:** 2026-06-12 · **Fact:** `P-F5M3VBTG`

<!-- decision:P-WYDCWV5H -->

## Design.md §16: Deliberate Parking Lot with Ship Triggers

**When:** 2026-06-12 · **Fact:** `P-WYDCWV5H`
**Why:** The project needs a staging area for long-term candidates without making them tasks prematurely; ship-triggers prevent ideas from rotting as stale backlog

<!-- decision:P-aUDDN4WP -->

## Task 147 design upgraded: the kit gets a STANDING committed context/DECISIONS.md

**When:** 2026-06-12 · **Fact:** `P-aUDDN4WP`
**Why:** A standing journal puts each decision line in the PR diff that captured it (reviewable), travels with git clone, and needs no tooling to read - the same reasons the build repo hand-maintains its own DECISION-LOG

<!-- decision:P-ZQV3U4BP -->

## Decision-trail rule — preserve decision history in task entries

**When:** 2026-06-12 · **Fact:** `P-ZQV3U4BP`
**Why:** Future sessions need to understand decision evolution and rationale; decision trails prevent design context loss

<!-- decision:P-N5YK2T6R -->

## decisions.md feature using standing-journal design pattern

**When:** 2026-06-12 · **Fact:** `P-N5YK2T6R`
**Why:** Kit needs structured decision capture to preserve design rationale across sessions and prevent decisions from being forgotten

<!-- decision:P-ZRQRa277 -->

## kit needs decisions.md feature

**When:** 2026-06-12 · **Fact:** `P-ZRQRa277`

<!-- decision:P-X5RWPJQY -->

## Design Lesson Numbering System (D-###) in claude-memory-kit

**When:** 2026-06-12 · **Fact:** `P-X5RWPJQY`
**Why:** Project code reviews and PR descriptions reference these patterns to justify design choices; helps understand vocabulary and decision-tracing

<!-- decision:P-AXU3YSXC -->

## PR #168 - cmk import-claude-md Command Complete

**When:** 2026-06-12 · **Fact:** `P-AXU3YSXC`
**Why:** Completed feature ready for merge; implementation demonstrates safe fact-import pattern and reuse-at-design-time principle

<!-- decision:P-CZ7WMRYM -->

## autopilot grant — v0.3.x queue (2026-06-12)

**When:** 2026-06-12 · **Fact:** `P-CZ7WMRYM`
**Why:** U-XTCFKJ4U: never generalize permissions across tasks — the grant's exact scope must be on the record so a future session neither exceeds it nor re-asks for it.

<!-- decision:P-T7ZLD7YB -->

## Autopilot standing permission for v0.3.x queue starting Task 141a

**When:** 2026-06-12 · **Fact:** `P-T7ZLD7YB`

<!-- decision:P-7FV4EYaW -->

## npm v12 Script Approval: Project vs. Global Configuration Paths

**When:** 2026-06-12 · **Fact:** `P-7FV4EYaW`
**Why:** Dual-path architecture means different remediation per install type. Verified against GitHub changelog (2026-06-09) and community discussion #198547.

<!-- decision:P-9NHZ2SV2 -->

## npm v12 Mitigation Plan (Tasks 141a–141b)

**When:** 2026-06-12 · **Fact:** `P-9NHZ2SV2`
**Why:** npm v12 lands July 2026. npm 11.16+ already emits warnings and breaks on our binding. Users will hit silent failures (install succeeds, tool crashes on first use) without mitigation.

<!-- decision:P-BDES4aW7 -->

## Install-time consent for better-sqlite3 binding (replaces error → doctor round-trip)

**When:** 2026-06-12 · **Fact:** `P-BDES4aW7`
**Why:** User objected to original UX (npm install error → doctor command → error again → discovery left to an obscure tool). This change prioritizes inline, immediate resolution at the moment of install. Their feedback shaped the design before it shipped.

<!-- decision:P-XBB4aELR -->

## Dependabot Cannot Approve allowScripts in Strict Repos

**When:** 2026-06-12 · **Fact:** `P-XBB4aELR`
**Why:** Affects approval fatigue and long-term security posture in strict-mode npm repos.

<!-- decision:P-A5QQRXMR -->

## Five-Point Stress Gate and Auto-Launch PR Workflow

**When:** 2026-06-12 · **Fact:** `P-A5QQRXMR`
**Why:** Stress gating is a quality validation before merge. The auto-launch on pass keeps the pipeline moving predictably without manual gate-watching.

<!-- decision:P-aZH2NRSE -->

## Task Pipeline Stages

**When:** 2026-06-12 · **Fact:** `P-aZH2NRSE`
**Why:** Recurring structure observed across Tasks 74, 144, 145; understanding stages helps predict throughput and identify bottlenecks

<!-- decision:P-RLKAYYRZ -->

## Stress Testing Omitted for Pure-Read CLI Changes

**When:** 2026-06-12 · **Fact:** `P-RLKAYYRZ`
**Why:** Pure-read analysis and CLI printing introduce no concurrency or spawning risks, making stress tests unnecessary and allowing them to be skipped to save CI time.

<!-- decision:P-E6J7aYH5 -->

## skill-review Imported-Facts Staleness Bug Fixed

**When:** 2026-06-12 · **Fact:** `P-E6J7aYH5`
**Why:** Correctness of the memory system depends on imported facts remaining fresh. This bug threatened that invariant.

<!-- decision:P-2aD2YHMB -->

## Modular Skill Architecture: Read/Write Separation

**When:** 2026-06-13 · **Fact:** `P-2aD2YHMB`
**Why:** Separating read from write reduces blast radius and prevents accidental memory corruption. The boundary is a first-class design principle, not an implementation detail.

<!-- decision:P-2JMVXJ3a -->

## Task 146: Concurrent Swarm Support Testing

**When:** 2026-06-13 · **Fact:** `P-2JMVXJ3a`
**Why:** The kit's strength is as a shared memory layer for many independent agents. Concurrent safety is the missing validation needed before swarm support is proven.

<!-- decision:P-REVFHLBK -->

## kit skills are modular thin-orchestrators over a deep cmk substrate

**When:** 2026-06-13 · **Fact:** `P-REVFHLBK`
**Why:** The user surfaced the mega-vs-modular / skill-scaling question (2026-06-13 whiteboard images); the answer is reusable architecture framing for Task 146 (Workflows) and for any future skill the kit scaffolds — keep skills thin, push capability into composable cmk/MCP cores.

<!-- decision:P-EBGGNUQ4 -->

## async-ifying a CLI action races its synchronous in-process test callers

**When:** 2026-06-13 · **Fact:** `P-EBGGNUQ4`
**Why:** Second instance this session of an async change creating a stress-only race (the spawn-smoke empty-output oracle was the first). The caller-map-both-ways rule (CLAUDE.md) applies to TEST callers, not just src callers — and the stress gate is the thing that catches the timing, which is exactly why it runs on memory-write-surface PRs.

<!-- decision:P-GZR7BG2Q -->

## Hardcoded Model Version in Commit Trailer Goes Stale on Model Switch

**When:** 2026-06-13 · **Fact:** `P-GZR7BG2Q`
**Why:** You work with multiple Claude models in a single session and switch between them. Static trailers mean commit metadata no longer reflects which model actually created the code.

<!-- decision:P-FZ3XFLAB -->

## CMK_DISABLE_SEMANTIC Environment Variable

**When:** 2026-06-13 · **Fact:** `P-FZ3XFLAB`
**Why:** Allows disabling expensive optional features (semantic similarity) in certain deployments or test scenarios.

<!-- decision:P-GXG7L6RH -->

## Seam-Injection Test Coverage Blindspot

**When:** 2026-06-13 · **Fact:** `P-GXG7L6RH`
**Why:** Known pattern (documented in Task-85). Prevents undetected untested code from merging.

<!-- decision:P-Q73KUNWJ -->

## Sonar 0%-New-Code Coverage Gate

**When:** 2026-06-13 · **Fact:** `P-Q73KUNWJ`
**Why:** Prevents untested code from reaching production; enforces code quality.

<!-- decision:P-UMH4G5A2 -->

## Bash tool cwd persists — cd into a workspace silently reroutes npm test

**When:** 2026-06-13 · **Fact:** `P-UMH4G5A2`
**Why:** Burned ~two cycles this session reading 6-passed and a packages/cli error path as if they were the root suite; the cause was a persisted cd from an earlier inspect command, not a real failure.

<!-- decision:P-DMPCD5F3 -->

## bash-cwd-drift creates packages/cli/context/ artifacts

**When:** 2026-06-13 · **Fact:** `P-DMPCD5F3`
**Why:** Prevents misidentification of artifacts as uncommitted work; documents a known benign quirk

<!-- decision:P-VEMJ4EVR -->

## exit-doors gate performs Task-137 validation

**When:** 2026-06-13 · **Fact:** `P-VEMJ4EVR`
**Why:** Documents validation chain; shows active error detection in prerun gating

<!-- decision:P-64FTWQKK -->

## Task 135 integrated pack-completeness validator into prerun

**When:** 2026-06-13 · **Fact:** `P-64FTWQKK`
**Why:** Documents evolution from manual to structured validation; pattern for future gating work

<!-- decision:P-BQDDQLMM -->

## Task 140 has byte-identical output hard constraint

**When:** 2026-06-13 · **Fact:** `P-BQDDQLMM`
**Why:** Any byte difference breaks downstream content-addressed systems

<!-- decision:P-4EGENKKN -->

## Task Queue Organization & Naming Convention

**When:** 2026-06-13 · **Fact:** `P-4EGENKKN`
**Why:** Task codes are used as shorthand in planning and PR context; CLI items have documentation prerequisites; queue structure clarifies what "done" means for a release

<!-- decision:P-44FARNBA -->

## Handler Test Coverage Gap: Error/Exit Branches

**When:** 2026-06-13 · **Fact:** `P-44FARNBA`
**Why:** This systematic gap risks incomplete coverage and repeated discovery cycles. Recording the pattern prevents future handler-task rework.

<!-- decision:P-VHDD6VVV -->

## Direct-to-Main Approval by Campaign Rules

**When:** 2026-06-13 · **Fact:** `P-VHDD6VVV`
**Why:** Enforces code quality gates and test verification. Committing production code directly to main breaks CI discipline and prevents the full test run from catching integration issues. Also: never commit when test failures are present.

<!-- decision:P-PBCLJ2VB -->

## Multi-Stage Quality Gates Catch Bugs Unit Tests Miss

**When:** 2026-06-13 · **Fact:** `P-PBCLJ2VB`
**Why:** Unit tests verify isolated units but don't catch async races, untested paths, integration issues, or runtime environment quirks.

<!-- decision:P-XAVLD63M -->

## Production Code Must Go Through PR/CI

**When:** 2026-06-13 · **Fact:** `P-XAVLD63M`
**Why:** PR/CI ensures code review, confirmed-green test suite before merge, and cross-platform CI validation. CI matrix catches Windows/macOS issues that local runs may miss.

<!-- decision:P-4aG26CRV -->

## npm 12 & the 141a/141b Migration Strategy

**When:** 2026-06-13 · **Fact:** `P-4aG26CRV`
**Why:** npm-12 is a hard blocker for better-sqlite3. 141b removes the problem entirely; no native deps = install anywhere, forever.

<!-- decision:P-PU4FZPZW -->

## Kit Versioning Uses Lane-Themed Releases, Not Strict Semver

**When:** 2026-06-13 · **Fact:** `P-PU4FZPZW`
**Why:** Prevents confusion between strict semver (feature = minor bump) and the kit's versioning scheme, where a minor bump signals a paradigm/capability shift, and patches are polish within that shift. Ensures settled decisions (e.g., "v0.4.0 is Kiro") don't get accidentally clobbered by sequential numbering logic.

<!-- decision:P-V77JZTJR -->

## Live validation must happen before committing major dependency migrations; don't

**When:** 2026-06-13 · **Fact:** `P-V77JZTJR`

<!-- decision:P-UKXW3FN9 -->

## v0.3.1 will release the current feature batch (live-tested first); v0.3.2 will i

**When:** 2026-06-13 · **Fact:** `P-UKXW3FN9`

<!-- decision:P-ZXaUQRaS -->

## Conditional Tech Adoption Discipline

**When:** 2026-06-13 · **Fact:** `P-ZXaUQRaS`
**Why:** Prevents trading UX/performance for technical elegance or convenience on faith. Forces explicit data-driven decisions.

<!-- decision:P-JHLNTFBM -->

## Node:sqlite Adoption Perf Gate (D-147) — Execution Plan

**When:** 2026-06-13 · **Fact:** `P-JHLNTFBM`
**Why:** User won't regress user-facing response latency for installation convenience. Perf is measured, not assumed.

<!-- decision:P-ZCRT7N2H -->

## Accepts one-time install UX friction (binding prompt); will not sacrifice perman

**When:** 2026-06-13 · **Fact:** `P-ZCRT7N2H`

<!-- decision:P-FPYJVM79 -->

## Chose "no measurable regression" for storage backend — search speed is the kit's

**When:** 2026-06-13 · **Fact:** `P-FPYJVM79`

<!-- decision:P-K4X4VRPH -->

## Perf Gate Principle — Search Speed Non-Negotiable

**When:** 2026-06-13 · **Fact:** `P-K4X4VRPH`
**Why:** User stated search is foundational to the kit's purpose; any permanent slowdown defeats the kit's value. This discipline parallels prior bake-offs (D-109 embedder choice).

<!-- decision:P-EAALA5AR -->

## v0.3.1 Cut-Gate Checklist (Additive Testing Plan)

**When:** 2026-06-13 · **Fact:** `P-EAALA5AR`
**Why:** Ensures every v0.3.x release tests standing regression checks + new-feature validation consistently. Three-part structure (CLI-driven, user-only, pre-tag) is reusable for future releases.

<!-- decision:P-XSE9J4SZ -->

## Cut-Gate Live-Test Verification Workflow

**When:** 2026-06-14 · **Fact:** `P-XSE9J4SZ`
**Why:** Live testing plus on-disk file verification surfaces boundary violations and single-point-of-enforcement failures that automated tests alone cannot detect

<!-- decision:P-SD7WDA3Z -->

## Hook-Boundary Implementation Gap (Privacy-Strip Example)

**When:** 2026-06-14 · **Fact:** `P-SD7WDA3Z`
**Why:** Single-point-of-enforcement (hook-only) misses actual file write operations; boundary violations slip through without file-verification checks

<!-- decision:P-9YGaCE66 -->

## Post-Merge Clean-Build Verification

**When:** 2026-06-14 · **Fact:** `P-9YGaCE66`
**Why:** Dev tree may have transient state; only a clean build from main branch proves the product is correct

<!-- decision:P-ZMCV7XLP -->

## RESUME v0.3.1 cut-gate — 2 bugs found+fixed, PR #179 in flight

**When:** 2026-06-14 · **Fact:** `P-ZMCV7XLP`
**Why:** Context near auto-compact mid-cut-gate; the next session must not lose where the live-test stands or re-derive the two findings.

<!-- decision:P-4HWRCJBR -->

## Sensitive Content Policy for Memory Capture System

**When:** 2026-06-14 · **Fact:** `P-4HWRCJBR`
**Why:** Ensures personal/sensitive content never silently lands in git-committed, possibly-shared files. Solves the core risk: sensitive data in a repo that might be pushed.

<!-- decision:P-VREAaST9 -->

## vitest can show a module-resolution failure (Cannot find module /@id/...) on the

**When:** 2026-06-14 · **Fact:** `P-VREAaST9`
**Why:** It LOOKS like a test failure in CI/stress, and the lazy reflex is to wave it off as 'known transient' — but that exact reflex is what hid a real CodeQL high-sev alert on this same PR #179. Never assume transient.

<!-- decision:P-4PEW73GU -->

## Cut-gate validation includes paraphrase-recall check

**When:** 2026-06-14 · **Fact:** `P-4PEW73GU`
**Why:** Ensures comprehensive semantic validation of the merged build before considering work complete.

<!-- decision:P-7Z4JAQLX -->

## Multi-layer gating before main merge

**When:** 2026-06-14 · **Fact:** `P-7Z4JAQLX`
**Why:** Catches issues at multiple points before they reach main; reduces risk of broken mainline.

<!-- decision:P-X9ZB69LH -->

## Stress runner and incremental JSON handling

**When:** 2026-06-14 · **Fact:** `P-X9ZB69LH`
**Why:** Avoids wasted debugging effort on partial/corrupt JSON; runner handles it internally.

<!-- decision:P-ZHC3BS29 -->

## Release Gating Workflow for Version Cuts

**When:** 2026-06-14 · **Fact:** `P-ZHC3BS29`
**Why:** Each gate catches different classes of bugs. Stress + CI catch logic errors; install-path tests catch deployment/integration issues that CI misses (e.g., title-truncation data-loss bugs now fixed in PR #180).

<!-- decision:P-D7aTRN9U -->

## v0.3.1 Release: Final Workflow

**When:** 2026-06-14 · **Fact:** `P-D7aTRN9U`
**Why:** This is the fully mapped workflow for v0.3.1 release; provides a template for subsequent releases and ensures no steps are skipped.

<!-- decision:P-K6GWAA44 -->

## INDEX.md is a committed human-readable artifact

**When:** 2026-06-14 · **Fact:** `P-K6GWAA44`
**Why:** INDEX is part of the project's shipped state; users rely on it staying current and human-readable

<!-- decision:P-X2ZJ6Y4J -->

## writeFact silent failure mode: reindex failure swallowing

**When:** 2026-06-14 · **Fact:** `P-X2ZJ6Y4J`
**Why:** Hidden failure mode caused INDEX corruption with no observable signal; was only discoverable via file audit

<!-- decision:P-RKHLCEET -->

## Release Documentation Convention (Bug Fixes vs Features)

**When:** 2026-06-14 · **Fact:** `P-RKHLCEET`
**Why:** Keeps release history clean and searchable; ensures README reflects actual feature set, not implementation fixes

<!-- decision:P-J7D46R62 -->

## Anti-Pattern Rejection: SessionStart Auto-Heal

**When:** 2026-06-14 · **Fact:** `P-J7D46R62`
**Why:** The incidental next-capture self-heal suffices. Hot-path cost is not justified for cosmetic drift.

<!-- decision:P-7G3GYKTM -->

## INDEX Drift Self-Heal Architecture

**When:** 2026-06-14 · **Fact:** `P-7G3GYKTM`
**Why:** The incidental next-capture self-heal is sufficient and costs nothing at runtime. SessionStart machinery would over-engineer a vanishingly rare edge case.

<!-- decision:P-CFA7ZXAa -->

## Session 1 Post-Execution Guardrails

**When:** 2026-06-14 · **Fact:** `P-CFA7ZXAa`
**Why:** Confirms Stop hook and auto-memory extraction system are functioning; validates that durable facts are captured with reasoning sections

<!-- decision:P-QCKEA5A3 -->

## Session 1 Staged Build Workflow

**When:** 2026-06-14 · **Fact:** `P-QCKEA5A3`
**Why:** Validates auto-memory extraction system (Stop hook auto-captures preferences stated naturally, without explicit "remember this" commands)

<!-- decision:P-4aRS5H6T -->

## Clean-Start Procedure for Session 1 Test

**When:** 2026-06-14 · **Fact:** `P-4aRS5H6T`
**Why:** Ensures B3/B4 cross-project persona capture can verify uv/ruff rule lands from zero; prevents pre-seeding contamination

<!-- decision:P-9VESM93S -->

## Claude Memory Kit Installation Levels

**When:** 2026-06-14 · **Fact:** `P-9VESM93S`
**Why:** Testing Session 1 validates that cross-project persona capture fires correctly; this requires a fresh project folder with zero pre-seeded facts. The global binary is stable; only the per-project scaffold is session-specific.

<!-- decision:P-CEDDPRCH -->

## Claude Code Hook Activation Requires Restart

**When:** 2026-06-14 · **Fact:** `P-CEDDPRCH`
**Why:** Claude Code loads hook configuration once at startup and does not hot-reload `.claude/settings.json` changes.

<!-- decision:P-WaCZ7REY -->

## cmk install --with-semantic Scaffolds Semantic Recall

**When:** 2026-06-14 · **Fact:** `P-WaCZ7REY`
**Why:** Semantic search adds hybrid matching (keyword + semantic) to memory recall, improving relevance of facts retrieved across sessions.

<!-- decision:P-4VT5UP5R -->

## Memory Kit Hooks Are Project-Scoped

**When:** 2026-06-14 · **Fact:** `P-4VT5UP5R`
**Why:** Hooks execute in the context of the Claude Code window that triggered them, which is tied to the open project directory. They read `.claude/settings.json` from the working directory.

<!-- decision:P-XQRM9UFY -->

## cut-gate11 Memory System Three-Tier Architecture

**When:** 2026-06-14 · **Fact:** `P-XQRM9UFY`
**Why:** Enables safe sharing of scaffold and memory across machines without leaking per-machine artifacts or raw logs

<!-- decision:P-MWQKPU54 -->

## cut-gate11 Pre-Session Verification Checklist

**When:** 2026-06-14 · **Fact:** `P-MWQKPU54`
**Why:** Documents baseline scaffold state; confirms readiness before building; catches misconfiguration early

<!-- decision:P-QZS2XMKP -->

## Memory-search skill trigger is phrasing-sensitive

**When:** 2026-06-14 · **Fact:** `P-QZS2XMKP`
**Why:** Explains variance in early test runs; clarifies this is a trigger-detection polish issue (fixable), not mechanism failure (blocker)

<!-- decision:P-JP9PYX7R -->

## Memory-Recall Fix Incomplete — Structure Questions Still Code-Crawl

**When:** 2026-06-14 · **Fact:** `P-JP9PYX7R`
**Why:** The user is systematically verifying whether a fix actually produces the intended behavior. Unit tests pass, but they verify well-formedness, not live behavior — especially important for LLM-sensitive recall.

<!-- decision:P-NU2K2NN9 -->

## Validation Pipeline for claude-memory-kit Includes Format and Privacy Gates

**When:** 2026-06-14 · **Fact:** `P-NU2K2NN9`
**Why:** Preventive gates catch issues before code review, reducing back-and-forth and avoiding silent failures (1024-char limit would cause skill to silently fail to load).

<!-- decision:P-DBTYCD5U -->

## Research-Based Claims Discipline

**When:** 2026-06-14 · **Fact:** `P-DBTYCD5U`
**Why:** Prevents unfounded claims about competitive landscape that could misdirect architecture; the kit's core value depends on understanding how others solved the same recall problem.

<!-- decision:P-DSPZ9CAW -->

## Deciding Experiment That Gates v0.3.1

**When:** 2026-06-14 · **Fact:** `P-DSPZ9CAW`
**Why:** Live re-test validates the fix against the original problem (crawling code instead of using memory). Removes doubt and gates the tag decision.

<!-- decision:P-a2BSC7NG -->

## Description Field Length — Root Cause and Fix

**When:** 2026-06-14 · **Fact:** `P-a2BSC7NG`
**Why:** Long descriptions were silently breaking the YAML structure or exceeding token/parsing limits. This was discovered by code inspection (challenge 1: "Did you check the docs?").

<!-- decision:P-M7ZYUVES -->

## v2 Skill Triggering: Semantic Intent Instead of Phrase Matching

**When:** 2026-06-14 · **Fact:** `P-M7ZYUVES`
**Why:** Phrase-matching fails for esoteric/roundabout questions; semantic intent + hint-reference generalizes across varied phrasings.

<!-- decision:P-9HK3PZVK -->

## Recall Skill Validation Contract

**When:** 2026-06-14 · **Fact:** `P-9HK3PZVK`
**Why:** The skill has two failure modes (over-fire wastes cycles, under-fire misses memory). Testing both ensures usability. Systematic eval in v0.4 is more rigorous than endless hand-trials.

<!-- decision:P-LVTJKE2B -->

## Layered Backend Architecture in Live Persona

**When:** 2026-06-14 · **Fact:** `P-LVTJKE2B`
**Why:** Architecture was described across projects (inferred vs declared) and stuck in medium-confidence queue; auto-drain moved it to live tier for consistent injection.

<!-- decision:P-M9DH6KYM -->

## Persona Auto-Drain Queue for Medium-Confidence Candidates

**When:** 2026-06-14 · **Fact:** `P-M9DH6KYM`
**Why:** The wedge test was failing because persona wasn't injecting into new projects; medium-confidence signals were stuck with no escape path.

<!-- decision:P-AaTGXLHE -->

## cmk install modes affect cold-open search behavior

**When:** 2026-06-14 · **Fact:** `P-AaTGXLHE`
**Why:** Testing fixes under different configurations than the original bug report creates false-negative risk (test appears to fail when fix is actually working)

<!-- decision:P-TCKPLP3E -->

## Cold-Start Test for Persona Architecture Transfer

**When:** 2026-06-14 · **Fact:** `P-TCKPLP3E`
**Why:** Tests whether persona facts not only transfer to new projects but are actually applied in generation. Confirms memory drainage/promotion system works end-to-end, not just at storage level.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-6LJZ69M5 -->

## SonarCloud Coverage Job Rate-Limited by HF Hub Cache Miss

**When:** 2026-06-15 · **Fact:** `P-6LJZ69M5`
**Why:** HF Hub rate-limiting on shared API keys is a hidden failure mode in CI; without caching, coverage jobs fail silently. The fix is mechanical (copy the cache step), but the root cause is non-obvious.

<!-- decision:P-ZV6DT5WA -->

## Release Merge-Gate Workflow

**When:** 2026-06-15 · **Fact:** `P-ZV6DT5WA`
**Why:** Gate checks prevent shipping broken or incomplete releases; mandatory discipline for release safety.

<!-- decision:P-SSTU3RL4 -->

## Release Gate Workflow and Final User Control

**When:** 2026-06-15 · **Fact:** `P-SSTU3RL4`
**Why:** Ensures all checks pass before any publishable artifact is created. User retains final control per D-126 (no auto-tagging from CI).

<!-- decision:P-ENQSa3T9 -->

## SonarCloud Zero-Coverage From Missing Cache Step

**When:** 2026-06-15 · **Fact:** `P-ENQSa3T9`
**Why:** Failure cascade was non-obvious and blocked the v0.3.1 gate; worth capturing for future SonarCloud troubleshooting.

<!-- decision:P-XCTDZRCH -->

## Post-Commit Validator Suite

**When:** 2026-06-15 · **Fact:** `P-XCTDZRCH`
**Why:** Catch integration bugs early: dangling references, leaks, orphaned task IDs. These are easy to miss in manual review.

<!-- decision:P-PKPUKZRH -->

## RELEASE-PLAN.md: Authoritative Task-to-Lane Map

**When:** 2026-06-15 · **Fact:** `P-PKPUKZRH`
**Why:** Prevents silent orphans. A task could appear laned in tasks.md but actually lack a version assignment, causing confusion about scope and release timing.

<!-- decision:P-DY6aUA7A -->

## Task-Lane Consistency Audit Workflow

**When:** 2026-06-15 · **Fact:** `P-DY6aUA7A`
**Why:** Tasks can acquire lane context without being formally assigned to a version, creating shadow state. A side-by-side comparison of both files catches these silently-laned-but-unassigned tasks.

<!-- decision:P-YLWTT5aG -->

## TencentDB-Agent-Memory Write/Search Implementation Comparison

**When:** 2026-06-15 · **Fact:** `P-YLWTT5aG`
**Why:** Comparative code-level review of adjacent implementation reveals convergence areas (no action) and architectural alternatives (design patterns for roadmap).

<!-- decision:P-7MXBHAWU -->

## User reviews multiple adjacent/competing projects to extract design patterns and

**When:** 2026-06-15 · **Fact:** `P-7MXBHAWU`

<!-- decision:P-GATKYaHT -->

## Task 50 Research-Revisit Gate and Multi-Agent Pattern

**When:** 2026-06-15 · **Fact:** `P-GATKYaHT`
**Why:** Leverage existing multi-agent research; avoid re-derivation. Taskmaster provides actionable blueprints before Task 50 starts.

<!-- decision:P-ZDR9EQRa -->

## v0.4.x Versioning Roadmap

**When:** 2026-06-15 · **Fact:** `P-ZDR9EQRa`
**Why:** Clarifies v0.4.0 ships infrastructure + first integration. Explains tail strategy: agents are patch-level, numbered only at ship time.

<!-- decision:P-HTZHX3F7 -->

## OpenHands Context Condenser — Applicable Compression Ideas

**When:** 2026-06-15 · **Fact:** `P-HTZHX3F7`
**Why:** Production patterns from mature agent runtime; worth evaluating for compression design

<!-- decision:P-DYa3YF7X -->

## Qdrant Vector Database — Re-rejected (ADR-0015 reaffirmed)

**When:** 2026-06-15 · **Fact:** `P-DYa3YF7X`
**Why:** Prevents future re-litigations; clarifies architectural vs technical reasons for rejection

<!-- decision:P-ZE9MW3QP -->

## Open Knowledge Format (OKF) — Design Validation and Interchange Target

**When:** 2026-06-15 · **Fact:** `P-ZE9MW3QP`
**Why:** External validation that kit's core thesis (git-native, minimal, human-readable) is correct; OKF provides a ready-made interchange standard at the team/cross-agent boundary without full redesign

<!-- decision:P-4QAAULAL -->

## Research Triage Rule — Skip Out-of-Scope Topics

**When:** 2026-06-15 · **Fact:** `P-4QAAULAL`
**Why:** Keeps research archive focused and load-bearing; prevents cluttering with unrelated material; ensures every saved memo is something a future session will actually use

<!-- decision:P-4ELVTGQB -->

## I used https://github.com/SpillwaveSolutions/project-memory before starting clau

**When:** 2026-06-15 · **Fact:** `P-4ELVTGQB`

<!-- decision:P-FaMS2LTW -->

## D-144 (housekeeping) is the post-Task-129 step in the remaining v0.3.x queue

**When:** 2026-06-15 · **Fact:** `P-FaMS2LTW`

<!-- decision:P-aRUCEJ6E -->

## FTS5 Query Sanitization (Task 153)

**When:** 2026-06-15 · **Fact:** `P-aRUCEJ6E`
**Why:** production bug affecting search UX when version strings or dotted terms appear in queries

<!-- decision:P-L5S6JJU3 -->

## v0.3.2 Release Scope Expanded

**When:** 2026-06-15 · **Fact:** `P-L5S6JJU3`
**Why:** The v0.3.2 scope expanded beyond the initial 153+152 after re-evaluation: 134 (open since v0.3.1, zero-risk add) and the gitattributes follow-up (parked from Task 139) were pulled in, plus 147 (the decisions.md the user explicitly asked for). The node:sqlite migration stays conditional because search latency is paid every query forever — we don't sacrifice the kit's core purpose for an install-time convenience.

<!-- decision:P-GWKDXJU4 -->

## Planning Docs as Standalone Commits on Main

**When:** 2026-06-15 · **Fact:** `P-GWKDXJU4`
**Why:** Maintains "single source of truth, same commit batch" discipline. Scope decisions are visible in main history and don't get tangled with task PR reviews.

<!-- decision:P-JXRTNTaG -->

## v0.3.2 Scope Locked; Strict Task-Order Discipline

**When:** 2026-06-15 · **Fact:** `P-JXRTNTaG`
**Why:** Dependencies and risk management. Spike results for 141b decide whether it ships in v0.3.2 or defers to v0.3.3.

<!-- decision:P-2Qa3JA5W -->

## FTS5 Query Sanitization — Per-Token Quoting Design

**When:** 2026-06-15 · **Fact:** `P-2Qa3JA5W`
**Why:** Per-token quoting preserves implicit-AND between words (better recall for multi-word queries like "layered architecture"), while whole-query quoting forces strict phrase matching. Grounded in SQLite FTS5 primary docs.

<!-- decision:P-CWTW7GT6 -->

## FTS5 and sqlite-vec are chosen by design per ADR-0002 and ADR-0015

**When:** 2026-06-15 · **Fact:** `P-CWTW7GT6`
**Why:** These are foundational architectural constraints. Future sessions may encounter FTS5 recall limitations or proposals to switch to a vector DB; understanding these tenets is essential to evaluating such requests.

<!-- decision:P-FZSCATHJ -->

## v0.3.2 Scope Correction Dedup

**When:** 2026-06-15 · **Fact:** `P-FZSCATHJ`
**Why:** Pulling already-shipped tasks back into a new version's scope is a real planning error — it would waste a re-implementation cycle or ship a confusing duplicate. The correction is the durable state; the earlier expanded-scope fact is now misleading and must not be the one a future session recalls.

<!-- decision:P-YEH2DCQU -->

## Node:sqlite FTS5 Module Availability Gate for Task 141b Migration

**When:** 2026-06-15 · **Fact:** `P-YEH2DCQU`
**Why:** Task 141b is conditional on three spikes. Without confirming FTS5 is available on all target platforms, the migration could pass in controlled dev/test environments but fail in production.

<!-- decision:P-LaJYSMLa -->

## Reject ponytail plugin; philosophical conflict with project design

**When:** 2026-06-15 · **Fact:** `P-LaJYSMLa`
**Why:** The kit's value derives from deliberate rigor; Ponytail optimizes in the opposite direction. Adopting it would undermine the project's architectural philosophy and create decision-making conflicts on every tool/code choice.

<!-- decision:P-HC3VHHET -->

## Kit Produces Facts, Not Views — The DECISIONS.md Gap

**When:** 2026-06-15 · **Fact:** `P-HC3VHHET`
**Why:** Clarifies Task 147 scope — DECISIONS.md is *not* redundant with existing docs; it's the *missing view* that the kit's facts should feed into. Distinction: kit = facts, DECISION-LOG/squad = views.

<!-- decision:P-FH2Q2TZ7 -->

## Append-Only Model for DECISIONS.md (Never Regenerate from Live Facts)

**When:** 2026-06-15 · **Fact:** `P-FH2Q2TZ7`
**Why:** Regenerating from live facts erases history. Superseded decisions disappear; retracted decisions are gone. This violates the decision-trail preservation rule: the journal's purpose is to show why we changed course, not rewrite history to look like current state was always obvious. Squad appends for this reason (history is the point). The kit can improve squad's model (no junk, typed facts, clear structure) while keeping the append-only virtue.

<!-- decision:P-32DWHP4G -->

## Regenerated Surfaces vs Append-Only Surfaces (Digest vs DECISIONS.md)

**When:** 2026-06-15 · **Fact:** `P-32DWHP4G`
**Why:** They answer different questions. Digest = "current knowledge" (regeneration correct, always consistent). DECISIONS = "why did we decide this" (append correct, history is the point). Regenerating DECISIONS erases context; appending digest fills it with noise.

<!-- decision:P-AYFCJ25H -->

## Unbounded Permanent Ledger vs Bounded Working Set (DECISIONS.md vs MEMORY.md)

**When:** 2026-06-15 · **Fact:** `P-AYFCJ25H`
**Why:** Working memory and decision history need opposite strategies. MEMORY is a triage queue (keep recent threads hot). DECISIONS is a permanent record (context for architectural choices). Confusing them would either lose old decisions (parking) or bloat DECISIONS with noise (bounded).

<!-- decision:P-3C9V6a76 -->

## DECISIONS.md is append-only permanent journal not regenerated

**When:** 2026-06-15 · **Fact:** `P-3C9V6a76`
**Why:** Arrived at by reasoning through what happens when a decision-fact is superseded/forgotten over time. A regenerated-from-live DECISIONS.md (my first instinct, mirroring INDEX.md) would erase superseded decisions — destroying the journal's entire value (the why-we-changed trail). The MEMORY.md parking model also must NOT apply: old decisions are the MOST valuable part of a decision log, so it's unbounded and never rolls. Append-permanent for the journal vs regenerate for the digest — the difference IS the MEMORY.md-vs-decision-log distinction. Squad appends because it has no DB; the kit appends-with-structure (links/supersession/no-junk) because it does.

<!-- decision:P-Aa22MJAC -->

## semantic backend: sqlite-vec primary, zvec fallback

**When:** 2026-06-10 · **Fact:** `P-Aa22MJAC`
**Why:** sqlite-vec puts vectors inside the SQLite index the kit already runs (one store, design 9.3.1 fit); zvec is embedded+Node+Windows but its bindings are only ~May-2026 old

<!-- decision:P-N9BGGaK6 -->

## Transient Failure Retry Strategy

**When:** 2026-06-10 · **Fact:** `P-N9BGGaK6`
**Why:** A single transient delay can cause false negatives; 5 seconds is low-cost. Distinguishing jitter from real degradation prevents flaky CI while preserving signal for real b

<!-- decision:P-QXDNaC5U -->

## v0.3.0 is BUILD-COMPLETE (2026-06-10): Tasks 46/125/124/75(all)/104(all) shipped

**When:** 2026-06-10 · **Fact:** `P-QXDNaC5U`

<!-- decision:P-MHCAaYVG -->

## Cut-Gate Testing Guide (Manual Release QA)

**When:** 2026-06-10 · **Fact:** `P-MHCAaYVG`
**Why:** Encodes hard-won lessons (D-84, v0.2.0, Task-75) into repeatable process; prevents regression and avoids known gotchas; respects user's time with clear estimates and scope boundaries.

<!-- decision:P-a5W95QXS -->

## This file (docs/process/cut-gate.md) is their manual live-test guide for release

**When:** 2026-06-10 · **Fact:** `P-a5W95QXS`

<!-- decision:P-TaHaDQV7 -->

## B5/B7 Probe Footgun — settings.json Wholesale Overwrite

**When:** 2026-06-10 · **Fact:** `P-TaHaDQV7`
**Why:** Running B5/B7 in a working directory (not throwaway) corrupts configuration.

<!-- decision:P-aA5S5S2U -->

## User confirmed companion project approach for Task 127 aligns with kit philosoph

**When:** 2026-06-10 · **Fact:** `P-aA5S5S2U`

<!-- decision:P-ULTaWK4B -->

## Release Gate Structure (v0.3.0)

**When:** 2026-06-11 · **Fact:** `P-ULTaWK4B`
**Why:** D3's promotion to required blocker is a recent change; the next release cycle must respect this gate structure.

<!-- decision:P-Pa5RBNQ4 -->

## Release Git Choreography: Memory, Release, Tag (in order)

**When:** 2026-06-11 · **Fact:** `P-Pa5RBNQ4`
**Why:** Keeps the tree clean; release commits reflect versioning, not session metadata. Memory churn is incidental to development, not part of the release artifact.

<!-- decision:P-aLPJJGFL -->

## Separate Memory Captures from Release Commits

**When:** 2026-06-11 · **Fact:** `P-aLPJJGFL`
**Why:** Release commits should show only what went into the release — when auditing `release: vX.Y.Z` later, the commit should be uncluttered and reviewable as a pure version bump. Accumulated memory captures muddy that history.

<!-- decision:P-MZDaYRWX -->

## Requesting complete re-verification: check previous test gate outputs (gate7), r

**When:** 2026-06-11 · **Fact:** `P-MZDaYRWX`

<!-- decision:P-aN9PaSGC -->

## Validation Gate Structure (cut-gate9 Release)

**When:** 2026-06-11 · **Fact:** `P-aN9PaSGC`
**Why:** Standardized gates catch regressions; each check owns a specific concern. Automation verifies what it can; in-session UX and skip-prompt behavior require hands-on testing.

<!-- decision:P-7XKFaB2N -->

## Secret Leakage Defense-in-Depth Model

**When:** 2026-06-11 · **Fact:** `P-7XKFaB2N`
**Why:** No single filter is complete. Layering reduces likelihood accidental secrets reach git.

<!-- decision:P-RL2aKHKQ -->

## Prefers concise, numbered instructions without narrative explanation or backgrou

**When:** 2026-06-11 · **Fact:** `P-RL2aKHKQ`

<!-- decision:P-Za6L72JM -->

## canonicalize() Super-Linear Regex Hotspot

**When:** 2026-06-11 · **Fact:** `P-Za6L72JM`
**Why:** Confirmed real pattern, but execution is too constrained for practical risk. Behavior-identical fix ensures downstream stability.

<!-- decision:P-XQ9RYXaJ -->

## Backlog for v0.3.x and v0.4

**When:** 2026-06-11 · **Fact:** `P-XQ9RYXaJ`
**Why:** These tasks emerged from the quality gate review and are ready to schedule.

<!-- decision:P-9NaMaLE6 -->

## v0.3.0 Released With Green Quality Gate

**When:** 2026-06-11 · **Fact:** `P-9NaMaLE6`
**Why:** Marks completion of the quality gate enforcement for this release; establishes clean baseline for next session.

<!-- decision:P-4aaKKRKV -->

## PII Handling — Non-Adoption of Quarantine

**When:** 2026-06-11 · **Fact:** `P-4aaKKRKV`
**Why:** Kit's memory lives in git repos — privacy (discard-on-sight) is higher priority than quarantine-for-review UX

<!-- decision:P-NXF3aCPB -->

## Semantic Search vs. Grep Trade-Off (D-111 Design Rationale)

**When:** 2026-06-12 · **Fact:** `P-NXF3aCPB`
**Why:** The kit's semantic-search choice diverges from PAI despite shared philosophy. The decision is data-driven (benchmarked) and intentional, not a paradigm violation. Documents why the choice was made for future reconsideration.

<!-- decision:P-TUJKaAQ6 -->

## Autopilot Memory Consultation Architecture

**When:** 2026-06-12 · **Fact:** `P-TUJKaAQ6`
**Why:** Autopilot work must leverage memory without explicit asking; design balances autonomous value against deliberate human control over forget/queue decisions.

<!-- decision:P-DC97QaDC -->

## Pre-session verification found one composition bug (memory-search allow-list omi

**When:** 2026-06-12 · **Fact:** `P-DC97QaDC`

<!-- decision:P-BJQaGQ6H -->

## Iterative, thorough research approach—adds items even near session end rather th

**When:** 2026-06-12 · **Fact:** `P-BJQaGQ6H`

<!-- decision:P-A6XDaDHA -->

## Kit Feature Gap — Chronological Decision Rendering

**When:** 2026-06-12 · **Fact:** `P-A6XDaDHA`
**Why:** That both the kit and Squad independently maintain chronological journals indicates this view type is valuable beyond individual-fact retrieval. The gap is a missed product feature—a natural extension of `cmk digest`.

<!-- decision:P-7RQTaMU4 -->

## Kit's Decision Log — Manual Maintenance Pattern

**When:** 2026-06-12 · **Fact:** `P-7RQTaMU4`
**Why:** Both the kit team and peer projects (Squad) independently maintain chronological decision journals, suggesting this narrative form provides value that individual-fact storage doesn't. The kit chose to keep D-log authoritative rather than migrate to the fact model.

<!-- decision:P-XTLTaX5C -->

## Decision-Journal View Gap — Now Task 147

**When:** 2026-06-12 · **Fact:** `P-XTLTaX5C`
**Why:** User pattern discovery — manual decision journaling across multiple teams signals a real user need the kit doesn't yet meet

<!-- decision:P-aUDDN4WP -->

## Task 147 design upgraded: the kit gets a STANDING committed context/DECISIONS.md

**When:** 2026-06-12 · **Fact:** `P-aUDDN4WP`
**Why:** A standing journal puts each decision line in the PR diff that captured it (reviewable), travels with git clone, and needs no tooling to read - the same reasons the build repo hand-maintains its own DECISION-LOG

<!-- decision:P-ZRQRa277 -->

## kit needs decisions.md feature

**When:** 2026-06-12 · **Fact:** `P-ZRQRa277`

<!-- decision:P-7FV4EYaW -->

## npm v12 Script Approval: Project vs. Global Configuration Paths

**When:** 2026-06-12 · **Fact:** `P-7FV4EYaW`
**Why:** Dual-path architecture means different remediation per install type. Verified against GitHub changelog (2026-06-09) and community discussion #198547.

<!-- decision:P-BDES4aW7 -->

## Install-time consent for better-sqlite3 binding (replaces error → doctor round-trip)

**When:** 2026-06-12 · **Fact:** `P-BDES4aW7`
**Why:** User objected to original UX (npm install error → doctor command → error again → discovery left to an obscure tool). This change prioritizes inline, immediate resolution at the moment of install. Their feedback shaped the design before it shipped.

<!-- decision:P-XBB4aELR -->

## Dependabot Cannot Approve allowScripts in Strict Repos

**When:** 2026-06-12 · **Fact:** `P-XBB4aELR`
**Why:** Affects approval fatigue and long-term security posture in strict-mode npm repos.

<!-- decision:P-aZH2NRSE -->

## Task Pipeline Stages

**When:** 2026-06-12 · **Fact:** `P-aZH2NRSE`
**Why:** Recurring structure observed across Tasks 74, 144, 145; understanding stages helps predict throughput and identify bottlenecks

<!-- decision:P-E6J7aYH5 -->

## skill-review Imported-Facts Staleness Bug Fixed

**When:** 2026-06-12 · **Fact:** `P-E6J7aYH5`
**Why:** Correctness of the memory system depends on imported facts remaining fresh. This bug threatened that invariant.

<!-- decision:P-2aD2YHMB -->

## Modular Skill Architecture: Read/Write Separation

**When:** 2026-06-13 · **Fact:** `P-2aD2YHMB`
**Why:** Separating read from write reduces blast radius and prevents accidental memory corruption. The boundary is a first-class design principle, not an implementation detail.

<!-- decision:P-2JMVXJ3a -->

## Task 146: Concurrent Swarm Support Testing

**When:** 2026-06-13 · **Fact:** `P-2JMVXJ3a`
**Why:** The kit's strength is as a shared memory layer for many independent agents. Concurrent safety is the missing validation needed before swarm support is proven.

<!-- decision:P-4aG26CRV -->

## npm 12 & the 141a/141b Migration Strategy

**When:** 2026-06-13 · **Fact:** `P-4aG26CRV`
**Why:** npm-12 is a hard blocker for better-sqlite3. 141b removes the problem entirely; no native deps = install anywhere, forever.

<!-- decision:P-ZXaUQRaS -->

## Conditional Tech Adoption Discipline

**When:** 2026-06-13 · **Fact:** `P-ZXaUQRaS`
**Why:** Prevents trading UX/performance for technical elegance or convenience on faith. Forces explicit data-driven decisions.

<!-- decision:P-9YGaCE66 -->

## Post-Merge Clean-Build Verification

**When:** 2026-06-14 · **Fact:** `P-9YGaCE66`
**Why:** Dev tree may have transient state; only a clean build from main branch proves the product is correct

<!-- decision:P-VREAaST9 -->

## vitest can show a module-resolution failure (Cannot find module /@id/...) on the

**When:** 2026-06-14 · **Fact:** `P-VREAaST9`
**Why:** It LOOKS like a test failure in CI/stress, and the lazy reflex is to wave it off as 'known transient' — but that exact reflex is what hid a real CodeQL high-sev alert on this same PR #179. Never assume transient.

<!-- decision:P-D7aTRN9U -->

## v0.3.1 Release: Final Workflow

**When:** 2026-06-14 · **Fact:** `P-D7aTRN9U`
**Why:** This is the fully mapped workflow for v0.3.1 release; provides a template for subsequent releases and ensures no steps are skipped.

<!-- decision:P-CFA7ZXAa -->

## Session 1 Post-Execution Guardrails

**When:** 2026-06-14 · **Fact:** `P-CFA7ZXAa`
**Why:** Confirms Stop hook and auto-memory extraction system are functioning; validates that durable facts are captured with reasoning sections

<!-- decision:P-4aRS5H6T -->

## Clean-Start Procedure for Session 1 Test

**When:** 2026-06-14 · **Fact:** `P-4aRS5H6T`
**Why:** Ensures B3/B4 cross-project persona capture can verify uv/ruff rule lands from zero; prevents pre-seeding contamination

<!-- decision:P-WaCZ7REY -->

## cmk install --with-semantic Scaffolds Semantic Recall

**When:** 2026-06-14 · **Fact:** `P-WaCZ7REY`
**Why:** Semantic search adds hybrid matching (keyword + semantic) to memory recall, improving relevance of facts retrieved across sessions.

<!-- decision:P-a2BSC7NG -->

## Description Field Length — Root Cause and Fix

**When:** 2026-06-14 · **Fact:** `P-a2BSC7NG`
**Why:** Long descriptions were silently breaking the YAML structure or exceeding token/parsing limits. This was discovered by code inspection (challenge 1: "Did you check the docs?").

<!-- decision:P-AaTGXLHE -->

## cmk install modes affect cold-open search behavior

**When:** 2026-06-14 · **Fact:** `P-AaTGXLHE`
**Why:** Testing fixes under different configurations than the original bug report creates false-negative risk (test appears to fail when fix is actually working)

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-ENQSa3T9 -->

## SonarCloud Zero-Coverage From Missing Cache Step

**When:** 2026-06-15 · **Fact:** `P-ENQSa3T9`
**Why:** Failure cascade was non-obvious and blocked the v0.3.1 gate; worth capturing for future SonarCloud troubleshooting.

<!-- decision:P-DY6aUA7A -->

## Task-Lane Consistency Audit Workflow

**When:** 2026-06-15 · **Fact:** `P-DY6aUA7A`
**Why:** Tasks can acquire lane context without being formally assigned to a version, creating shadow state. A side-by-side comparison of both files catches these silently-laned-but-unassigned tasks.

<!-- decision:P-YLWTT5aG -->

## TencentDB-Agent-Memory Write/Search Implementation Comparison

**When:** 2026-06-15 · **Fact:** `P-YLWTT5aG`
**Why:** Comparative code-level review of adjacent implementation reveals convergence areas (no action) and architectural alternatives (design patterns for roadmap).

<!-- decision:P-GATKYaHT -->

## Task 50 Research-Revisit Gate and Multi-Agent Pattern

**When:** 2026-06-15 · **Fact:** `P-GATKYaHT`
**Why:** Leverage existing multi-agent research; avoid re-derivation. Taskmaster provides actionable blueprints before Task 50 starts.

<!-- decision:P-ZDR9EQRa -->

## v0.4.x Versioning Roadmap

**When:** 2026-06-15 · **Fact:** `P-ZDR9EQRa`
**Why:** Clarifies v0.4.0 ships infrastructure + first integration. Explains tail strategy: agents are patch-level, numbered only at ship time.

<!-- decision:P-DYa3YF7X -->

## Qdrant Vector Database — Re-rejected (ADR-0015 reaffirmed)

**When:** 2026-06-15 · **Fact:** `P-DYa3YF7X`
**Why:** Prevents future re-litigations; clarifies architectural vs technical reasons for rejection

<!-- decision:P-FaMS2LTW -->

## D-144 (housekeeping) is the post-Task-129 step in the remaining v0.3.x queue

**When:** 2026-06-15 · **Fact:** `P-FaMS2LTW`

<!-- decision:P-aRUCEJ6E -->

## FTS5 Query Sanitization (Task 153)

**When:** 2026-06-15 · **Fact:** `P-aRUCEJ6E`
**Why:** production bug affecting search UX when version strings or dotted terms appear in queries

<!-- decision:P-JXRTNTaG -->

## v0.3.2 Scope Locked; Strict Task-Order Discipline

**When:** 2026-06-15 · **Fact:** `P-JXRTNTaG`
**Why:** Dependencies and risk management. Spike results for 141b decide whether it ships in v0.3.2 or defers to v0.3.3.

<!-- decision:P-2Qa3JA5W -->

## FTS5 Query Sanitization — Per-Token Quoting Design

**When:** 2026-06-15 · **Fact:** `P-2Qa3JA5W`
**Why:** Per-token quoting preserves implicit-AND between words (better recall for multi-word queries like "layered architecture"), while whole-query quoting forces strict phrase matching. Grounded in SQLite FTS5 primary docs.

<!-- decision:P-LaJYSMLa -->

## Reject ponytail plugin; philosophical conflict with project design

**When:** 2026-06-15 · **Fact:** `P-LaJYSMLa`
**Why:** The kit's value derives from deliberate rigor; Ponytail optimizes in the opposite direction. Adopting it would undermine the project's architectural philosophy and create decision-making conflicts on every tool/code choice.

<!-- decision:P-3C9V6a76 -->

## DECISIONS.md is append-only permanent journal not regenerated

**When:** 2026-06-15 · **Fact:** `P-3C9V6a76`
**Why:** Arrived at by reasoning through what happens when a decision-fact is superseded/forgotten over time. A regenerated-from-live DECISIONS.md (my first instinct, mirroring INDEX.md) would erase superseded decisions — destroying the journal's entire value (the why-we-changed trail). The MEMORY.md parking model also must NOT apply: old decisions are the MOST valuable part of a decision log, so it's unbounded and never rolls. Append-permanent for the journal vs regenerate for the digest — the difference IS the MEMORY.md-vs-decision-log distinction. Squad appends because it has no DB; the kit appends-with-structure (links/supersession/no-junk) because it does.

<!-- decision:P-Aa22MJAC -->

## semantic backend: sqlite-vec primary, zvec fallback

**When:** 2026-06-10 · **Fact:** `P-Aa22MJAC`
**Why:** sqlite-vec puts vectors inside the SQLite index the kit already runs (one store, design 9.3.1 fit); zvec is embedded+Node+Windows but its bindings are only ~May-2026 old

<!-- decision:P-N9BGGaK6 -->

## Transient Failure Retry Strategy

**When:** 2026-06-10 · **Fact:** `P-N9BGGaK6`
**Why:** A single transient delay can cause false negatives; 5 seconds is low-cost. Distinguishing jitter from real degradation prevents flaky CI while preserving signal for real b

<!-- decision:P-QXDNaC5U -->

## v0.3.0 is BUILD-COMPLETE (2026-06-10): Tasks 46/125/124/75(all)/104(all) shipped

**When:** 2026-06-10 · **Fact:** `P-QXDNaC5U`

<!-- decision:P-MHCAaYVG -->

## Cut-Gate Testing Guide (Manual Release QA)

**When:** 2026-06-10 · **Fact:** `P-MHCAaYVG`
**Why:** Encodes hard-won lessons (D-84, v0.2.0, Task-75) into repeatable process; prevents regression and avoids known gotchas; respects user's time with clear estimates and scope boundaries.

<!-- decision:P-a5W95QXS -->

## This file (docs/process/cut-gate.md) is their manual live-test guide for release

**When:** 2026-06-10 · **Fact:** `P-a5W95QXS`

<!-- decision:P-TaHaDQV7 -->

## B5/B7 Probe Footgun — settings.json Wholesale Overwrite

**When:** 2026-06-10 · **Fact:** `P-TaHaDQV7`
**Why:** Running B5/B7 in a working directory (not throwaway) corrupts configuration.

<!-- decision:P-aA5S5S2U -->

## User confirmed companion project approach for Task 127 aligns with kit philosoph

**When:** 2026-06-10 · **Fact:** `P-aA5S5S2U`

<!-- decision:P-ULTaWK4B -->

## Release Gate Structure (v0.3.0)

**When:** 2026-06-11 · **Fact:** `P-ULTaWK4B`
**Why:** D3's promotion to required blocker is a recent change; the next release cycle must respect this gate structure.

<!-- decision:P-Pa5RBNQ4 -->

## Release Git Choreography: Memory, Release, Tag (in order)

**When:** 2026-06-11 · **Fact:** `P-Pa5RBNQ4`
**Why:** Keeps the tree clean; release commits reflect versioning, not session metadata. Memory churn is incidental to development, not part of the release artifact.

<!-- decision:P-aLPJJGFL -->

## Separate Memory Captures from Release Commits

**When:** 2026-06-11 · **Fact:** `P-aLPJJGFL`
**Why:** Release commits should show only what went into the release — when auditing `release: vX.Y.Z` later, the commit should be uncluttered and reviewable as a pure version bump. Accumulated memory captures muddy that history.

<!-- decision:P-MZDaYRWX -->

## Requesting complete re-verification: check previous test gate outputs (gate7), r

**When:** 2026-06-11 · **Fact:** `P-MZDaYRWX`

<!-- decision:P-aN9PaSGC -->

## Validation Gate Structure (cut-gate9 Release)

**When:** 2026-06-11 · **Fact:** `P-aN9PaSGC`
**Why:** Standardized gates catch regressions; each check owns a specific concern. Automation verifies what it can; in-session UX and skip-prompt behavior require hands-on testing.

<!-- decision:P-7XKFaB2N -->

## Secret Leakage Defense-in-Depth Model

**When:** 2026-06-11 · **Fact:** `P-7XKFaB2N`
**Why:** No single filter is complete. Layering reduces likelihood accidental secrets reach git.

<!-- decision:P-RL2aKHKQ -->

## Prefers concise, numbered instructions without narrative explanation or backgrou

**When:** 2026-06-11 · **Fact:** `P-RL2aKHKQ`

<!-- decision:P-Za6L72JM -->

## canonicalize() Super-Linear Regex Hotspot

**When:** 2026-06-11 · **Fact:** `P-Za6L72JM`
**Why:** Confirmed real pattern, but execution is too constrained for practical risk. Behavior-identical fix ensures downstream stability.

<!-- decision:P-XQ9RYXaJ -->

## Backlog for v0.3.x and v0.4

**When:** 2026-06-11 · **Fact:** `P-XQ9RYXaJ`
**Why:** These tasks emerged from the quality gate review and are ready to schedule.

<!-- decision:P-9NaMaLE6 -->

## v0.3.0 Released With Green Quality Gate

**When:** 2026-06-11 · **Fact:** `P-9NaMaLE6`
**Why:** Marks completion of the quality gate enforcement for this release; establishes clean baseline for next session.

<!-- decision:P-4aaKKRKV -->

## PII Handling — Non-Adoption of Quarantine

**When:** 2026-06-11 · **Fact:** `P-4aaKKRKV`
**Why:** Kit's memory lives in git repos — privacy (discard-on-sight) is higher priority than quarantine-for-review UX

<!-- decision:P-NXF3aCPB -->

## Semantic Search vs. Grep Trade-Off (D-111 Design Rationale)

**When:** 2026-06-12 · **Fact:** `P-NXF3aCPB`
**Why:** The kit's semantic-search choice diverges from PAI despite shared philosophy. The decision is data-driven (benchmarked) and intentional, not a paradigm violation. Documents why the choice was made for future reconsideration.

<!-- decision:P-TUJKaAQ6 -->

## Autopilot Memory Consultation Architecture

**When:** 2026-06-12 · **Fact:** `P-TUJKaAQ6`
**Why:** Autopilot work must leverage memory without explicit asking; design balances autonomous value against deliberate human control over forget/queue decisions.

<!-- decision:P-DC97QaDC -->

## Pre-session verification found one composition bug (memory-search allow-list omi

**When:** 2026-06-12 · **Fact:** `P-DC97QaDC`

<!-- decision:P-BJQaGQ6H -->

## Iterative, thorough research approach—adds items even near session end rather th

**When:** 2026-06-12 · **Fact:** `P-BJQaGQ6H`

<!-- decision:P-A6XDaDHA -->

## Kit Feature Gap — Chronological Decision Rendering

**When:** 2026-06-12 · **Fact:** `P-A6XDaDHA`
**Why:** That both the kit and Squad independently maintain chronological journals indicates this view type is valuable beyond individual-fact retrieval. The gap is a missed product feature—a natural extension of `cmk digest`.

<!-- decision:P-7RQTaMU4 -->

## Kit's Decision Log — Manual Maintenance Pattern

**When:** 2026-06-12 · **Fact:** `P-7RQTaMU4`
**Why:** Both the kit team and peer projects (Squad) independently maintain chronological decision journals, suggesting this narrative form provides value that individual-fact storage doesn't. The kit chose to keep D-log authoritative rather than migrate to the fact model.

<!-- decision:P-XTLTaX5C -->

## Decision-Journal View Gap — Now Task 147

**When:** 2026-06-12 · **Fact:** `P-XTLTaX5C`
**Why:** User pattern discovery — manual decision journaling across multiple teams signals a real user need the kit doesn't yet meet

<!-- decision:P-aUDDN4WP -->

## Task 147 design upgraded: the kit gets a STANDING committed context/DECISIONS.md

**When:** 2026-06-12 · **Fact:** `P-aUDDN4WP`
**Why:** A standing journal puts each decision line in the PR diff that captured it (reviewable), travels with git clone, and needs no tooling to read - the same reasons the build repo hand-maintains its own DECISION-LOG

<!-- decision:P-ZRQRa277 -->

## kit needs decisions.md feature

**When:** 2026-06-12 · **Fact:** `P-ZRQRa277`

<!-- decision:P-7FV4EYaW -->

## npm v12 Script Approval: Project vs. Global Configuration Paths

**When:** 2026-06-12 · **Fact:** `P-7FV4EYaW`
**Why:** Dual-path architecture means different remediation per install type. Verified against GitHub changelog (2026-06-09) and community discussion #198547.

<!-- decision:P-BDES4aW7 -->

## Install-time consent for better-sqlite3 binding (replaces error → doctor round-trip)

**When:** 2026-06-12 · **Fact:** `P-BDES4aW7`
**Why:** User objected to original UX (npm install error → doctor command → error again → discovery left to an obscure tool). This change prioritizes inline, immediate resolution at the moment of install. Their feedback shaped the design before it shipped.

<!-- decision:P-XBB4aELR -->

## Dependabot Cannot Approve allowScripts in Strict Repos

**When:** 2026-06-12 · **Fact:** `P-XBB4aELR`
**Why:** Affects approval fatigue and long-term security posture in strict-mode npm repos.

<!-- decision:P-aZH2NRSE -->

## Task Pipeline Stages

**When:** 2026-06-12 · **Fact:** `P-aZH2NRSE`
**Why:** Recurring structure observed across Tasks 74, 144, 145; understanding stages helps predict throughput and identify bottlenecks

<!-- decision:P-E6J7aYH5 -->

## skill-review Imported-Facts Staleness Bug Fixed

**When:** 2026-06-12 · **Fact:** `P-E6J7aYH5`
**Why:** Correctness of the memory system depends on imported facts remaining fresh. This bug threatened that invariant.

<!-- decision:P-2aD2YHMB -->

## Modular Skill Architecture: Read/Write Separation

**When:** 2026-06-13 · **Fact:** `P-2aD2YHMB`
**Why:** Separating read from write reduces blast radius and prevents accidental memory corruption. The boundary is a first-class design principle, not an implementation detail.

<!-- decision:P-2JMVXJ3a -->

## Task 146: Concurrent Swarm Support Testing

**When:** 2026-06-13 · **Fact:** `P-2JMVXJ3a`
**Why:** The kit's strength is as a shared memory layer for many independent agents. Concurrent safety is the missing validation needed before swarm support is proven.

<!-- decision:P-4aG26CRV -->

## npm 12 & the 141a/141b Migration Strategy

**When:** 2026-06-13 · **Fact:** `P-4aG26CRV`
**Why:** npm-12 is a hard blocker for better-sqlite3. 141b removes the problem entirely; no native deps = install anywhere, forever.

<!-- decision:P-ZXaUQRaS -->

## Conditional Tech Adoption Discipline

**When:** 2026-06-13 · **Fact:** `P-ZXaUQRaS`
**Why:** Prevents trading UX/performance for technical elegance or convenience on faith. Forces explicit data-driven decisions.

<!-- decision:P-9YGaCE66 -->

## Post-Merge Clean-Build Verification

**When:** 2026-06-14 · **Fact:** `P-9YGaCE66`
**Why:** Dev tree may have transient state; only a clean build from main branch proves the product is correct

<!-- decision:P-VREAaST9 -->

## vitest can show a module-resolution failure (Cannot find module /@id/...) on the

**When:** 2026-06-14 · **Fact:** `P-VREAaST9`
**Why:** It LOOKS like a test failure in CI/stress, and the lazy reflex is to wave it off as 'known transient' — but that exact reflex is what hid a real CodeQL high-sev alert on this same PR #179. Never assume transient.

<!-- decision:P-D7aTRN9U -->

## v0.3.1 Release: Final Workflow

**When:** 2026-06-14 · **Fact:** `P-D7aTRN9U`
**Why:** This is the fully mapped workflow for v0.3.1 release; provides a template for subsequent releases and ensures no steps are skipped.

<!-- decision:P-CFA7ZXAa -->

## Session 1 Post-Execution Guardrails

**When:** 2026-06-14 · **Fact:** `P-CFA7ZXAa`
**Why:** Confirms Stop hook and auto-memory extraction system are functioning; validates that durable facts are captured with reasoning sections

<!-- decision:P-4aRS5H6T -->

## Clean-Start Procedure for Session 1 Test

**When:** 2026-06-14 · **Fact:** `P-4aRS5H6T`
**Why:** Ensures B3/B4 cross-project persona capture can verify uv/ruff rule lands from zero; prevents pre-seeding contamination

<!-- decision:P-WaCZ7REY -->

## cmk install --with-semantic Scaffolds Semantic Recall

**When:** 2026-06-14 · **Fact:** `P-WaCZ7REY`
**Why:** Semantic search adds hybrid matching (keyword + semantic) to memory recall, improving relevance of facts retrieved across sessions.

<!-- decision:P-a2BSC7NG -->

## Description Field Length — Root Cause and Fix

**When:** 2026-06-14 · **Fact:** `P-a2BSC7NG`
**Why:** Long descriptions were silently breaking the YAML structure or exceeding token/parsing limits. This was discovered by code inspection (challenge 1: "Did you check the docs?").

<!-- decision:P-AaTGXLHE -->

## cmk install modes affect cold-open search behavior

**When:** 2026-06-14 · **Fact:** `P-AaTGXLHE`
**Why:** Testing fixes under different configurations than the original bug report creates false-negative risk (test appears to fail when fix is actually working)

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-ENQSa3T9 -->

## SonarCloud Zero-Coverage From Missing Cache Step

**When:** 2026-06-15 · **Fact:** `P-ENQSa3T9`
**Why:** Failure cascade was non-obvious and blocked the v0.3.1 gate; worth capturing for future SonarCloud troubleshooting.

<!-- decision:P-DY6aUA7A -->

## Task-Lane Consistency Audit Workflow

**When:** 2026-06-15 · **Fact:** `P-DY6aUA7A`
**Why:** Tasks can acquire lane context without being formally assigned to a version, creating shadow state. A side-by-side comparison of both files catches these silently-laned-but-unassigned tasks.

<!-- decision:P-YLWTT5aG -->

## TencentDB-Agent-Memory Write/Search Implementation Comparison

**When:** 2026-06-15 · **Fact:** `P-YLWTT5aG`
**Why:** Comparative code-level review of adjacent implementation reveals convergence areas (no action) and architectural alternatives (design patterns for roadmap).

<!-- decision:P-GATKYaHT -->

## Task 50 Research-Revisit Gate and Multi-Agent Pattern

**When:** 2026-06-15 · **Fact:** `P-GATKYaHT`
**Why:** Leverage existing multi-agent research; avoid re-derivation. Taskmaster provides actionable blueprints before Task 50 starts.

<!-- decision:P-ZDR9EQRa -->

## v0.4.x Versioning Roadmap

**When:** 2026-06-15 · **Fact:** `P-ZDR9EQRa`
**Why:** Clarifies v0.4.0 ships infrastructure + first integration. Explains tail strategy: agents are patch-level, numbered only at ship time.

<!-- decision:P-DYa3YF7X -->

## Qdrant Vector Database — Re-rejected (ADR-0015 reaffirmed)

**When:** 2026-06-15 · **Fact:** `P-DYa3YF7X`
**Why:** Prevents future re-litigations; clarifies architectural vs technical reasons for rejection

<!-- decision:P-FaMS2LTW -->

## D-144 (housekeeping) is the post-Task-129 step in the remaining v0.3.x queue

**When:** 2026-06-15 · **Fact:** `P-FaMS2LTW`

<!-- decision:P-aRUCEJ6E -->

## FTS5 Query Sanitization (Task 153)

**When:** 2026-06-15 · **Fact:** `P-aRUCEJ6E`
**Why:** production bug affecting search UX when version strings or dotted terms appear in queries

<!-- decision:P-JXRTNTaG -->

## v0.3.2 Scope Locked; Strict Task-Order Discipline

**When:** 2026-06-15 · **Fact:** `P-JXRTNTaG`
**Why:** Dependencies and risk management. Spike results for 141b decide whether it ships in v0.3.2 or defers to v0.3.3.

<!-- decision:P-2Qa3JA5W -->

## FTS5 Query Sanitization — Per-Token Quoting Design

**When:** 2026-06-15 · **Fact:** `P-2Qa3JA5W`
**Why:** Per-token quoting preserves implicit-AND between words (better recall for multi-word queries like "layered architecture"), while whole-query quoting forces strict phrase matching. Grounded in SQLite FTS5 primary docs.

<!-- decision:P-LaJYSMLa -->

## Reject ponytail plugin; philosophical conflict with project design

**When:** 2026-06-15 · **Fact:** `P-LaJYSMLa`
**Why:** The kit's value derives from deliberate rigor; Ponytail optimizes in the opposite direction. Adopting it would undermine the project's architectural philosophy and create decision-making conflicts on every tool/code choice.

<!-- decision:P-3C9V6a76 -->

## DECISIONS.md is append-only permanent journal not regenerated

**When:** 2026-06-15 · **Fact:** `P-3C9V6a76`
**Why:** Arrived at by reasoning through what happens when a decision-fact is superseded/forgotten over time. A regenerated-from-live DECISIONS.md (my first instinct, mirroring INDEX.md) would erase superseded decisions — destroying the journal's entire value (the why-we-changed trail). The MEMORY.md parking model also must NOT apply: old decisions are the MOST valuable part of a decision log, so it's unbounded and never rolls. Append-permanent for the journal vs regenerate for the digest — the difference IS the MEMORY.md-vs-decision-log distinction. Squad appends because it has no DB; the kit appends-with-structure (links/supersession/no-junk) because it does.

<!-- decision:P-Aa22MJAC -->

## semantic backend: sqlite-vec primary, zvec fallback

**When:** 2026-06-10 · **Fact:** `P-Aa22MJAC`
**Why:** sqlite-vec puts vectors inside the SQLite index the kit already runs (one store, design 9.3.1 fit); zvec is embedded+Node+Windows but its bindings are only ~May-2026 old

<!-- decision:P-N9BGGaK6 -->

## Transient Failure Retry Strategy

**When:** 2026-06-10 · **Fact:** `P-N9BGGaK6`
**Why:** A single transient delay can cause false negatives; 5 seconds is low-cost. Distinguishing jitter from real degradation prevents flaky CI while preserving signal for real b

<!-- decision:P-QXDNaC5U -->

## v0.3.0 is BUILD-COMPLETE (2026-06-10): Tasks 46/125/124/75(all)/104(all) shipped

**When:** 2026-06-10 · **Fact:** `P-QXDNaC5U`

<!-- decision:P-MHCAaYVG -->

## Cut-Gate Testing Guide (Manual Release QA)

**When:** 2026-06-10 · **Fact:** `P-MHCAaYVG`
**Why:** Encodes hard-won lessons (D-84, v0.2.0, Task-75) into repeatable process; prevents regression and avoids known gotchas; respects user's time with clear estimates and scope boundaries.

<!-- decision:P-a5W95QXS -->

## This file (docs/process/cut-gate.md) is their manual live-test guide for release

**When:** 2026-06-10 · **Fact:** `P-a5W95QXS`

<!-- decision:P-TaHaDQV7 -->

## B5/B7 Probe Footgun — settings.json Wholesale Overwrite

**When:** 2026-06-10 · **Fact:** `P-TaHaDQV7`
**Why:** Running B5/B7 in a working directory (not throwaway) corrupts configuration.

<!-- decision:P-aA5S5S2U -->

## User confirmed companion project approach for Task 127 aligns with kit philosoph

**When:** 2026-06-10 · **Fact:** `P-aA5S5S2U`

<!-- decision:P-ULTaWK4B -->

## Release Gate Structure (v0.3.0)

**When:** 2026-06-11 · **Fact:** `P-ULTaWK4B`
**Why:** D3's promotion to required blocker is a recent change; the next release cycle must respect this gate structure.

<!-- decision:P-Pa5RBNQ4 -->

## Release Git Choreography: Memory, Release, Tag (in order)

**When:** 2026-06-11 · **Fact:** `P-Pa5RBNQ4`
**Why:** Keeps the tree clean; release commits reflect versioning, not session metadata. Memory churn is incidental to development, not part of the release artifact.

<!-- decision:P-aLPJJGFL -->

## Separate Memory Captures from Release Commits

**When:** 2026-06-11 · **Fact:** `P-aLPJJGFL`
**Why:** Release commits should show only what went into the release — when auditing `release: vX.Y.Z` later, the commit should be uncluttered and reviewable as a pure version bump. Accumulated memory captures muddy that history.

<!-- decision:P-MZDaYRWX -->

## Requesting complete re-verification: check previous test gate outputs (gate7), r

**When:** 2026-06-11 · **Fact:** `P-MZDaYRWX`

<!-- decision:P-aN9PaSGC -->

## Validation Gate Structure (cut-gate9 Release)

**When:** 2026-06-11 · **Fact:** `P-aN9PaSGC`
**Why:** Standardized gates catch regressions; each check owns a specific concern. Automation verifies what it can; in-session UX and skip-prompt behavior require hands-on testing.

<!-- decision:P-7XKFaB2N -->

## Secret Leakage Defense-in-Depth Model

**When:** 2026-06-11 · **Fact:** `P-7XKFaB2N`
**Why:** No single filter is complete. Layering reduces likelihood accidental secrets reach git.

<!-- decision:P-RL2aKHKQ -->

## Prefers concise, numbered instructions without narrative explanation or backgrou

**When:** 2026-06-11 · **Fact:** `P-RL2aKHKQ`

<!-- decision:P-Za6L72JM -->

## canonicalize() Super-Linear Regex Hotspot

**When:** 2026-06-11 · **Fact:** `P-Za6L72JM`
**Why:** Confirmed real pattern, but execution is too constrained for practical risk. Behavior-identical fix ensures downstream stability.

<!-- decision:P-XQ9RYXaJ -->

## Backlog for v0.3.x and v0.4

**When:** 2026-06-11 · **Fact:** `P-XQ9RYXaJ`
**Why:** These tasks emerged from the quality gate review and are ready to schedule.

<!-- decision:P-9NaMaLE6 -->

## v0.3.0 Released With Green Quality Gate

**When:** 2026-06-11 · **Fact:** `P-9NaMaLE6`
**Why:** Marks completion of the quality gate enforcement for this release; establishes clean baseline for next session.

<!-- decision:P-4aaKKRKV -->

## PII Handling — Non-Adoption of Quarantine

**When:** 2026-06-11 · **Fact:** `P-4aaKKRKV`
**Why:** Kit's memory lives in git repos — privacy (discard-on-sight) is higher priority than quarantine-for-review UX

<!-- decision:P-NXF3aCPB -->

## Semantic Search vs. Grep Trade-Off (D-111 Design Rationale)

**When:** 2026-06-12 · **Fact:** `P-NXF3aCPB`
**Why:** The kit's semantic-search choice diverges from PAI despite shared philosophy. The decision is data-driven (benchmarked) and intentional, not a paradigm violation. Documents why the choice was made for future reconsideration.

<!-- decision:P-TUJKaAQ6 -->

## Autopilot Memory Consultation Architecture

**When:** 2026-06-12 · **Fact:** `P-TUJKaAQ6`
**Why:** Autopilot work must leverage memory without explicit asking; design balances autonomous value against deliberate human control over forget/queue decisions.

<!-- decision:P-DC97QaDC -->

## Pre-session verification found one composition bug (memory-search allow-list omi

**When:** 2026-06-12 · **Fact:** `P-DC97QaDC`

<!-- decision:P-BJQaGQ6H -->

## Iterative, thorough research approach—adds items even near session end rather th

**When:** 2026-06-12 · **Fact:** `P-BJQaGQ6H`

<!-- decision:P-A6XDaDHA -->

## Kit Feature Gap — Chronological Decision Rendering

**When:** 2026-06-12 · **Fact:** `P-A6XDaDHA`
**Why:** That both the kit and Squad independently maintain chronological journals indicates this view type is valuable beyond individual-fact retrieval. The gap is a missed product feature—a natural extension of `cmk digest`.

<!-- decision:P-7RQTaMU4 -->

## Kit's Decision Log — Manual Maintenance Pattern

**When:** 2026-06-12 · **Fact:** `P-7RQTaMU4`
**Why:** Both the kit team and peer projects (Squad) independently maintain chronological decision journals, suggesting this narrative form provides value that individual-fact storage doesn't. The kit chose to keep D-log authoritative rather than migrate to the fact model.

<!-- decision:P-XTLTaX5C -->

## Decision-Journal View Gap — Now Task 147

**When:** 2026-06-12 · **Fact:** `P-XTLTaX5C`
**Why:** User pattern discovery — manual decision journaling across multiple teams signals a real user need the kit doesn't yet meet

<!-- decision:P-aUDDN4WP -->

## Task 147 design upgraded: the kit gets a STANDING committed context/DECISIONS.md

**When:** 2026-06-12 · **Fact:** `P-aUDDN4WP`
**Why:** A standing journal puts each decision line in the PR diff that captured it (reviewable), travels with git clone, and needs no tooling to read - the same reasons the build repo hand-maintains its own DECISION-LOG

<!-- decision:P-ZRQRa277 -->

## kit needs decisions.md feature

**When:** 2026-06-12 · **Fact:** `P-ZRQRa277`

<!-- decision:P-7FV4EYaW -->

## npm v12 Script Approval: Project vs. Global Configuration Paths

**When:** 2026-06-12 · **Fact:** `P-7FV4EYaW`
**Why:** Dual-path architecture means different remediation per install type. Verified against GitHub changelog (2026-06-09) and community discussion #198547.

<!-- decision:P-BDES4aW7 -->

## Install-time consent for better-sqlite3 binding (replaces error → doctor round-trip)

**When:** 2026-06-12 · **Fact:** `P-BDES4aW7`
**Why:** User objected to original UX (npm install error → doctor command → error again → discovery left to an obscure tool). This change prioritizes inline, immediate resolution at the moment of install. Their feedback shaped the design before it shipped.

<!-- decision:P-XBB4aELR -->

## Dependabot Cannot Approve allowScripts in Strict Repos

**When:** 2026-06-12 · **Fact:** `P-XBB4aELR`
**Why:** Affects approval fatigue and long-term security posture in strict-mode npm repos.

<!-- decision:P-aZH2NRSE -->

## Task Pipeline Stages

**When:** 2026-06-12 · **Fact:** `P-aZH2NRSE`
**Why:** Recurring structure observed across Tasks 74, 144, 145; understanding stages helps predict throughput and identify bottlenecks

<!-- decision:P-E6J7aYH5 -->

## skill-review Imported-Facts Staleness Bug Fixed

**When:** 2026-06-12 · **Fact:** `P-E6J7aYH5`
**Why:** Correctness of the memory system depends on imported facts remaining fresh. This bug threatened that invariant.

<!-- decision:P-2aD2YHMB -->

## Modular Skill Architecture: Read/Write Separation

**When:** 2026-06-13 · **Fact:** `P-2aD2YHMB`
**Why:** Separating read from write reduces blast radius and prevents accidental memory corruption. The boundary is a first-class design principle, not an implementation detail.

<!-- decision:P-2JMVXJ3a -->

## Task 146: Concurrent Swarm Support Testing

**When:** 2026-06-13 · **Fact:** `P-2JMVXJ3a`
**Why:** The kit's strength is as a shared memory layer for many independent agents. Concurrent safety is the missing validation needed before swarm support is proven.

<!-- decision:P-4aG26CRV -->

## npm 12 & the 141a/141b Migration Strategy

**When:** 2026-06-13 · **Fact:** `P-4aG26CRV`
**Why:** npm-12 is a hard blocker for better-sqlite3. 141b removes the problem entirely; no native deps = install anywhere, forever.

<!-- decision:P-ZXaUQRaS -->

## Conditional Tech Adoption Discipline

**When:** 2026-06-13 · **Fact:** `P-ZXaUQRaS`
**Why:** Prevents trading UX/performance for technical elegance or convenience on faith. Forces explicit data-driven decisions.

<!-- decision:P-9YGaCE66 -->

## Post-Merge Clean-Build Verification

**When:** 2026-06-14 · **Fact:** `P-9YGaCE66`
**Why:** Dev tree may have transient state; only a clean build from main branch proves the product is correct

<!-- decision:P-VREAaST9 -->

## vitest can show a module-resolution failure (Cannot find module /@id/...) on the

**When:** 2026-06-14 · **Fact:** `P-VREAaST9`
**Why:** It LOOKS like a test failure in CI/stress, and the lazy reflex is to wave it off as 'known transient' — but that exact reflex is what hid a real CodeQL high-sev alert on this same PR #179. Never assume transient.

<!-- decision:P-D7aTRN9U -->

## v0.3.1 Release: Final Workflow

**When:** 2026-06-14 · **Fact:** `P-D7aTRN9U`
**Why:** This is the fully mapped workflow for v0.3.1 release; provides a template for subsequent releases and ensures no steps are skipped.

<!-- decision:P-CFA7ZXAa -->

## Session 1 Post-Execution Guardrails

**When:** 2026-06-14 · **Fact:** `P-CFA7ZXAa`
**Why:** Confirms Stop hook and auto-memory extraction system are functioning; validates that durable facts are captured with reasoning sections

<!-- decision:P-4aRS5H6T -->

## Clean-Start Procedure for Session 1 Test

**When:** 2026-06-14 · **Fact:** `P-4aRS5H6T`
**Why:** Ensures B3/B4 cross-project persona capture can verify uv/ruff rule lands from zero; prevents pre-seeding contamination

<!-- decision:P-WaCZ7REY -->

## cmk install --with-semantic Scaffolds Semantic Recall

**When:** 2026-06-14 · **Fact:** `P-WaCZ7REY`
**Why:** Semantic search adds hybrid matching (keyword + semantic) to memory recall, improving relevance of facts retrieved across sessions.

<!-- decision:P-a2BSC7NG -->

## Description Field Length — Root Cause and Fix

**When:** 2026-06-14 · **Fact:** `P-a2BSC7NG`
**Why:** Long descriptions were silently breaking the YAML structure or exceeding token/parsing limits. This was discovered by code inspection (challenge 1: "Did you check the docs?").

<!-- decision:P-AaTGXLHE -->

## cmk install modes affect cold-open search behavior

**When:** 2026-06-14 · **Fact:** `P-AaTGXLHE`
**Why:** Testing fixes under different configurations than the original bug report creates false-negative risk (test appears to fail when fix is actually working)

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-ENQSa3T9 -->

## SonarCloud Zero-Coverage From Missing Cache Step

**When:** 2026-06-15 · **Fact:** `P-ENQSa3T9`
**Why:** Failure cascade was non-obvious and blocked the v0.3.1 gate; worth capturing for future SonarCloud troubleshooting.

<!-- decision:P-DY6aUA7A -->

## Task-Lane Consistency Audit Workflow

**When:** 2026-06-15 · **Fact:** `P-DY6aUA7A`
**Why:** Tasks can acquire lane context without being formally assigned to a version, creating shadow state. A side-by-side comparison of both files catches these silently-laned-but-unassigned tasks.

<!-- decision:P-YLWTT5aG -->

## TencentDB-Agent-Memory Write/Search Implementation Comparison

**When:** 2026-06-15 · **Fact:** `P-YLWTT5aG`
**Why:** Comparative code-level review of adjacent implementation reveals convergence areas (no action) and architectural alternatives (design patterns for roadmap).

<!-- decision:P-GATKYaHT -->

## Task 50 Research-Revisit Gate and Multi-Agent Pattern

**When:** 2026-06-15 · **Fact:** `P-GATKYaHT`
**Why:** Leverage existing multi-agent research; avoid re-derivation. Taskmaster provides actionable blueprints before Task 50 starts.

<!-- decision:P-ZDR9EQRa -->

## v0.4.x Versioning Roadmap

**When:** 2026-06-15 · **Fact:** `P-ZDR9EQRa`
**Why:** Clarifies v0.4.0 ships infrastructure + first integration. Explains tail strategy: agents are patch-level, numbered only at ship time.

<!-- decision:P-DYa3YF7X -->

## Qdrant Vector Database — Re-rejected (ADR-0015 reaffirmed)

**When:** 2026-06-15 · **Fact:** `P-DYa3YF7X`
**Why:** Prevents future re-litigations; clarifies architectural vs technical reasons for rejection

<!-- decision:P-FaMS2LTW -->

## D-144 (housekeeping) is the post-Task-129 step in the remaining v0.3.x queue

**When:** 2026-06-15 · **Fact:** `P-FaMS2LTW`

<!-- decision:P-aRUCEJ6E -->

## FTS5 Query Sanitization (Task 153)

**When:** 2026-06-15 · **Fact:** `P-aRUCEJ6E`
**Why:** production bug affecting search UX when version strings or dotted terms appear in queries

<!-- decision:P-JXRTNTaG -->

## v0.3.2 Scope Locked; Strict Task-Order Discipline

**When:** 2026-06-15 · **Fact:** `P-JXRTNTaG`
**Why:** Dependencies and risk management. Spike results for 141b decide whether it ships in v0.3.2 or defers to v0.3.3.

<!-- decision:P-2Qa3JA5W -->

## FTS5 Query Sanitization — Per-Token Quoting Design

**When:** 2026-06-15 · **Fact:** `P-2Qa3JA5W`
**Why:** Per-token quoting preserves implicit-AND between words (better recall for multi-word queries like "layered architecture"), while whole-query quoting forces strict phrase matching. Grounded in SQLite FTS5 primary docs.

<!-- decision:P-LaJYSMLa -->

## Reject ponytail plugin; philosophical conflict with project design

**When:** 2026-06-15 · **Fact:** `P-LaJYSMLa`
**Why:** The kit's value derives from deliberate rigor; Ponytail optimizes in the opposite direction. Adopting it would undermine the project's architectural philosophy and create decision-making conflicts on every tool/code choice.

<!-- decision:P-3C9V6a76 -->

## DECISIONS.md is append-only permanent journal not regenerated

**When:** 2026-06-15 · **Fact:** `P-3C9V6a76`
**Why:** Arrived at by reasoning through what happens when a decision-fact is superseded/forgotten over time. A regenerated-from-live DECISIONS.md (my first instinct, mirroring INDEX.md) would erase superseded decisions — destroying the journal's entire value (the why-we-changed trail). The MEMORY.md parking model also must NOT apply: old decisions are the MOST valuable part of a decision log, so it's unbounded and never rolls. Append-permanent for the journal vs regenerate for the digest — the difference IS the MEMORY.md-vs-decision-log distinction. Squad appends because it has no DB; the kit appends-with-structure (links/supersession/no-junk) because it does.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-YL3LWC69 -->

## D-126 (.gitattributes CRLF prevention follow-up) is the final v0.3.x queue item

**When:** 2026-06-15 · **Fact:** `P-YL3LWC69`

<!-- decision:P-YUCE6EAH -->

## Merge workflow for this PR: squash merge + delete branch

**When:** 2026-06-15 · **Fact:** `P-YUCE6EAH`

<!-- decision:P-9SN5DHQT -->

## For v0.3.2, only proceed with node:sqlite migration (141b) if perf tests show p9

**When:** 2026-06-15 · **Fact:** `P-9SN5DHQT`

<!-- decision:P-TLTURYF7 -->

## Start v0.3.2 now and include Task 153 (FTS5 parse fix) in this release

**When:** 2026-06-15 · **Fact:** `P-TLTURYF7`

<!-- decision:P-ZVQEMWJA -->

## Confirmed proposed v0.3.2 scope is better (tasks 153, 152, 134, gitattributes, c

**When:** 2026-06-15 · **Fact:** `P-ZVQEMWJA`

<!-- decision:P-F94ZJMYV -->

## Always monitor CI without asking for permission or pausing to confirm; this is t

**When:** 2026-06-15 · **Fact:** `P-F94ZJMYV`

<!-- decision:P-TAPT7BH7 -->

## Expand condensed content to 2 lines when it feels cramped; prioritize breathing

**When:** 2026-06-15 · **Fact:** `P-TAPT7BH7`

<!-- decision:P-7Q5U4XTK -->

## Rename README section "What it does" to "Features" — clearer language for capabi

**When:** 2026-06-15 · **Fact:** `P-7Q5U4XTK`

<!-- decision:P-SC3W3ZDV -->

## Autopilot merge rules for install-surface changes

**When:** 2026-06-15 · **Fact:** `P-SC3W3ZDV`
**Why:** Future sessions need to know which changes require user approval and which proceed automatically, to avoid unintended ship-surface deployments.

<!-- decision:P-T42VTJBJ -->

## Task 141b spike results node:sqlite migration

**When:** 2026-06-15 · **Fact:** `P-T42VTJBJ`
**Why:** The three 141b gates were the precondition for the node:sqlite migration. Two pass cleanly; the perf gate is inconclusive on this hardware (noise >> the 3% bar). Cherry-picking a passing run would be the lazy-framing failure — the honest result is 'can't measure 3% here.' The decision now needs either a clean machine or a user call on other grounds.

<!-- decision:P-3U4WSVEM -->

## Autopilot Stop-Condition for Install-Surface Decisions

**When:** 2026-06-15 · **Fact:** `P-3U4WSVEM`
**Why:** Install-surface changes have high blast radius and warrant explicit user judgment.

<!-- decision:P-DSRXEXRL -->

## Task 141b Spike Results — Perf Inconclusive on Dev Machine

**When:** 2026-06-15 · **Fact:** `P-DSRXEXRL`
**Why:** Stable measurement impossible on variable dev machine. Cannot proceed without clean data (guessing or cherry-picking would be the trap).

<!-- decision:P-AE2R9TUU -->

## v0.3.2 Release Status

**When:** 2026-06-15 · **Fact:** `P-AE2R9TUU`
**Why:** v0.3.2 is release-ready without 141b. Task 141a already covers npm-12 pain. 141b ships later with stable perf data.

<!-- decision:P-PMJYQEC5 -->

## sqlite-vec Incompatibility Between better-sqlite3 and node:sqlite

**When:** 2026-06-15 · **Fact:** `P-PMJYQEC5`
**Why:** Explains why the 141b benchmark produced ±50% variance and why detecting the target 3% perf difference was impossible. Documents a hard constraint on how these libraries can be compared.

<!-- decision:P-66XJQTaM -->

## Benchmark Noise Floor on Dev Laptop

**When:** 2026-06-15 · **Fact:** `P-66XJQTaM`
**Why:** Migration 141b depends on verifying D-147. The user will not push an unverified gate; data quality is the blocker.

<!-- decision:P-5UJHaH4F -->

## Benchmark Harness Noise Floor Rule (3% RSD threshold)

**When:** 2026-06-15 · **Fact:** `P-5UJHaH4F`
**Why:** Implemented to ensure harness honesty after the user's earlier question "do you get the same results?" This prevents false verdicts on noisy hardware and makes measurement limits transparent.

<!-- decision:P-5NZCD94Q -->

## v0.3.2 Release Scope and 141b Gate

**When:** 2026-06-16 · **Fact:** `P-5NZCD94Q`
**Why:** v0.3.2 scope is locked; 141b is the sole pending decision before release can be cut

<!-- decision:P-CUV74RDV -->

## Task 141b node:sqlite migration rejected on perf

**When:** 2026-06-16 · **Fact:** `P-CUV74RDV`
**Why:** The whole migration was gated on D-147's three spikes; the perf gate is decisive. CI gave clean measurement (noise « the 3% bar) showing node:sqlite is ~10% slower on FTS5 keyword search — the hot path users pay every query. The kit's core purpose is fast local recall; a permanent 10% search regression to avoid a one-time npm-12 install prompt is the wrong trade (the user's settled principle). This closes 141b honestly on real data, not laptop noise.

<!-- decision:P-WB2VQPWN -->

## 141b Is Rejected — Decision Rationale

**When:** 2026-06-16 · **Fact:** `P-WB2VQPWN`
**Why:** Decision grounded in clean, repeatable CI data. User's persistent questioning of noisy laptop results led to escalating to CI, which provided the definitive answer.

<!-- decision:P-LF5GNVaZ -->

## CI Triggering Capability

**When:** 2026-06-16 · **Fact:** `P-LF5GNVaZ`
**Why:** Assistant was over-cautious about automation scope. This capability exists and is faster than asking user to click.

<!-- decision:P-6AW7LDQH -->

## v0.3.2 Release Scope Locked

**When:** 2026-06-16 · **Fact:** `P-6AW7LDQH`
**Why:** All planned tasks completed; 141b rejected on clean data. Release is unblocked pending manual tag push.

<!-- decision:P-B4CANFVU -->

## Cut-Gate Verification Probes

**When:** 2026-06-16 · **Fact:** `P-B4CANFVU`
**Why:** These probes verify the built artifact before publishing. Knowing their names helps locate them in the release guide.

<!-- decision:P-7T2BCHL6 -->

## Release Workflow: Commit, Cut-Gate, Tag-Push

**When:** 2026-06-16 · **Fact:** `P-7T2BCHL6`
**Why:** This is the repeatable release process. Capturing the workflow and ownership boundaries avoids re-deriving at the next release.

<!-- decision:P-AUF4MDTR -->

## Doctor Health Check Baseline (Fresh Install)

**When:** 2026-06-16 · **Fact:** `P-AUF4MDTR`
**Why:** Distinguishes expected vs. actual health issues early in setup validation.

<!-- decision:P-FGJMCQNP -->

## v0.3.2 New Validation Gates

**When:** 2026-06-16 · **Fact:** `P-FGJMCQNP`
**Why:** These are new features shipped in 0.3.2; knowing their guide locations ensures they are tested during release validation.

<!-- decision:P-6VTN4QSS -->

## Windows npm Uninstall – better_sqlite3.node Lock

**When:** 2026-06-16 · **Fact:** `P-6VTN4QSS`
**Why:** Helps distinguish a non-blocker (EPERM on .node) from actual failures during uninstall/install cycles.

<!-- decision:P-2CFEBV9Y -->

## Cut-Gate Pre-Release Validation Checklist (G0-G7)

**When:** 2026-06-16 · **Fact:** `P-2CFEBV9Y`
**Why:** These gates catch breaking changes, misconfiguration, and integration regressions before user-facing Session 1. They form the kit's cut validation checklist.

<!-- decision:P-5PC4DaJF -->

## Windows npm Uninstall EPERM With better_sqlite3

**When:** 2026-06-16 · **Fact:** `P-5PC4DaJF`
**Why:** EPERM during teardown/rebuild is a frequent false alarm on Windows. Knowing it is harmless and expected prevents misdiagnosis and unnecessary re-runs.

<!-- decision:P-6JFTXAPN -->

## G4 Gate Upgraded to Mandatory Full-Sweep

**When:** 2026-06-16 · **Fact:** `P-6JFTXAPN`
**Why:** Prevent accidentally committed secrets/paths in public release. The upgrade ensures this cannot be missed.

<!-- decision:P-DRaNKRTM -->

## Three-Tier Memory Architecture

**When:** 2026-06-16 · **Fact:** `P-DRaNKRTM`
**Why:** Understanding the tier structure is essential for correct memory placement and avoiding committed-tier leaks.

<!-- decision:P-ZFEHNQY7 -->

## First-Time MCP Server Approval in Claude Code

**When:** 2026-06-16 · **Fact:** `P-ZFEHNQY7`
**Why:** Claude Code enforces this security policy on all MCP servers defined in committed config

<!-- decision:P-UBV99YJ7 -->

## MCP Server and Settings File Organization

**When:** 2026-06-16 · **Fact:** `P-UBV99YJ7`
**Why:** Project-scoped tools must travel with `git clone` so all teammates get the same MCP servers, while user-specific customizations remain local

<!-- decision:P-aD27LQ3H -->

## journaledIds Regex Incompleteness — Unbounded DECISIONS.md Growth (DJ2)

**When:** 2026-06-16 · **Fact:** `P-aD27LQ3H`
**Why:** Regression-test gap—fixtures didn't exercise the real alphabet. Ship-blocker for v0.3.2 (digest/journaling is a headline feature). Fix lands on main before tag.

<!-- decision:P-DPLXZCXJ -->

## Capture-completeness vs capture-perception gap (persona-queue delay)

**When:** 2026-06-16 · **Fact:** `P-DPLXZCXJ`
**Why:** User's instinct about incompleteness is valid as a UX signal, but correctly identified as a promotion/visibility issue rather than a missing-facts issue.

<!-- decision:P-9HCCG4RQ -->

## Release Validation Gate Structure

**When:** 2026-06-16 · **Fact:** `P-9HCCG4RQ`
**Why:** Separates repeatable, fast validation from expensive manual review. Unblocks parallel work and provides clear visibility into validation progress.

<!-- decision:P-9PXGBNLT -->

## F-7 Spec vs Code Mismatch: Tombstone Reading in cmk get

**When:** 2026-06-16 · **Fact:** `P-9PXGBNLT`
**Why:** Future cut-gate specification updates or F-7 work could accidentally claim unimplemented behavior. The spec must reflect the intentional live-only design.

<!-- decision:P-VUC9TB6X -->

## MCP Server Staleness Workaround

**When:** 2026-06-16 · **Fact:** `P-VUC9TB6X`
**Why:** MCP servers can drift out of sync mid-session, causing queries to fail against pre-fix code even though the fix is deployed. Quick restart avoids confusion when debugging apparent regressions.

<!-- decision:P-YFUW6ABE -->

## Read Path Inconsistency — `get` Lacks Deleted_at Filter

**When:** 2026-06-16 · **Fact:** `P-YFUW6ABE`
**Why:** Flagged during fact-probing work as a gap: the CLI and MCP surfaces have different coverage, surfacing this inconsistency. If recovery features are added, this pattern should be fixed.

<!-- decision:P-MEVGaRK7 -->

## Tombstone Data Lifecycle — Forget vs. Purge

**When:** 2026-06-16 · **Fact:** `P-MEVGaRK7`
**Why:** Product decision pending on recovery surfaces. Current architecture is the constraint: data exists (kept by design), so recovery would be a read operation, not a reconstruct. This context informs scope and feasibility.

<!-- decision:P-49BQNG9V -->

## Automatic recall never reads tombstones; recovery is human-only opt-in

**When:** 2026-06-16 · **Fact:** `P-49BQNG9V`
**Why:** Memory flagged this as an unsettled gap (the journal-vs-digest visibility split was decided in D-161, but whether the snapshot injector / mk_search hard-exclude tombstoned facts was never decided). Settling it: tombstones invisible to auto-recall because confidently-wrong recall (resurfacing a deleted fact) is catastrophic for a memory product; the negative-knowledge case has a better home (retract-in-place). Distinguishes forget (delete) from supersede (evolve) cleanly.

<!-- decision:P-XZSUPBWU -->

## Auto-recall agents are blind to tombstoned facts

**When:** 2026-06-16 · **Fact:** `P-XZSUPBWU`
**Why:** An agent confidently recalling a fact the user explicitly deleted is the worst failure mode a memory product can have. Keeping tombstones invisible to agents enforces the invariant that "forget" is truly permanent from the agent's perspective.

<!-- decision:P-ZVZ5a6RK -->

## Retracts and forgets are semantically distinct

**When:** 2026-06-16 · **Fact:** `P-ZVZ5a6RK`
**Why:** These two deletion modes serve different needs. Retracts preserve the story of how decisions evolved (important for continuity). Forgets remove visibility entirely (important for cleaning up unwanted facts). Conflating them leads to either losing decision history or accidentally auto-recovering deleted facts.

<!-- decision:P-JYH2P5QC -->

## DECISIONS.md is write-only for AI recall — not in any recall directive or test

**When:** 2026-06-16 · **Fact:** `P-JYH2P5QC`
**Why:** Task 147 built DECISIONS.md as a human-readable decision journal, but the AI's recall directives were never updated to consult it, and it's not indexed for search — so the journal's unique value (decision evolution, retracted/rejected decisions) is unreachable by automatic recall. This is the same class as the tombstone gap: a surface exists but recall doesn't reach it. Surfaced by the user asking 'when I mention Kamal, where do you look, and when would you go to DECISIONS.md?' — answer: never, today.

<!-- decision:P-GHN4aLTN -->

## Task 156 DECISIONS.md recall is v0.3.3 the next version firm

**When:** 2026-06-16 · **Fact:** `P-GHN4aLTN`
**Why:** I initially slotted the DECISIONS.md-recall gap vaguely as "v0.3.3/v0.4"; the user pushed back wanting it to be the NEXT version, not punted. Firming to v0.3.3 because leaving a just-shipped headline feature (the decision journal) un-recallable by the AI across two minor versions is the wrong call — it completes v0.3.2's feature.

<!-- decision:P-FCK9J9CM -->

## RESUME v0.3.2 cut-gate in progress

**When:** 2026-06-16 · **Fact:** `P-FCK9J9CM`
**Why:** A long multi-thread cut-gate session with high context-loss risk; if it compacts or VS Code restarts, the next session needs to know exactly where the cut stands — what passed, what's left, that main is uncut, and the next outward step — without re-deriving it from scratch. This is the kit's own amnesia-prevention applied to its own release.

<!-- decision:P-9N4JG45F -->

## The journal/decision-recall feature's PRIMARY value is automatic AI recall when

**When:** 2026-06-16 · **Fact:** `P-9N4JG45F`

<!-- decision:P-H33RCKS4 -->

## Rebuild+Reinstall Before Session 2 (Release Cut Workflow)

**When:** 2026-06-16 · **Fact:** `P-H33RCKS4`
**Why:** Session 2 tests recall via `mk_search` (MCP server). Stale server = stale code = re-hitting fixed bugs. The release-cut chain is: fix → save → verify-on-current-code.

<!-- decision:P-A396Z6JP -->

## Windows DLL Lock Blocks NPM Reinstall (better_sqlite3.node)

**When:** 2026-06-16 · **Fact:** `P-A396Z6JP`
**Why:** The Node.js native module loads the DLL into the process; the file stays locked until the process exits.

<!-- decision:P-X2VUTU3Z -->

## Close VS Code to close Claude Code on cut-gate14

**When:** 2026-06-16 · **Fact:** `P-X2VUTU3Z`
**Why:** Environment-specific constraint relevant to session lifecycle and testing procedures.

<!-- decision:P-MV3GBMZ2 -->

## FQ1 (FTS5 fix) in installed 0.3.2, ready for Session 2 recall tests

**When:** 2026-06-16 · **Fact:** `P-MV3GBMZ2`
**Why:** Session 2 tests recall via `mk_search` (MCP server), which requires FQ1. Clarifies that rebuild is unnecessary for S2.

<!-- decision:P-FKVJZZQL -->

## MCP server may retain stale code in memory after package updates

**When:** 2026-06-16 · **Fact:** `P-FKVJZZQL`
**Why:** Session 2 recall tests use `mk_search` (MCP server). Stale server can error even if fixes are on disk.

<!-- decision:P-F7XQXFKL -->

## VS Code Windows Are Independent Claude Code Sessions

**When:** 2026-06-16 · **Fact:** `P-F7XQXFKL`
**Why:** Critical for parallel work and troubleshooting; prevents confusion about session/server state; allows independent problem-solving in different windows without risk to other conversations

<!-- decision:P-N9FJU9Ta -->

## Project Configuration & Tech Stack

**When:** 2026-06-16 · **Fact:** `P-N9FJU9Ta`
**Why:** Standing configuration that every session should apply consistently to maintain code quality and structure.

<!-- decision:P-JY9ZGT5C -->

## Three-Session Release Validation Methodology

**When:** 2026-06-16 · **Fact:** `P-JY9ZGT5C`
**Why:** Validates that memory recall, memory-search skill, and persona transfer are working correctly before release.

<!-- decision:P-YFBTYUPQ -->

## Session 2 recall passed; broken install root-caused + recovered

**When:** 2026-06-16 · **Fact:** `P-YFBTYUPQ`
**Why:** Session 2 is a cut-gate milestone (recall is the kit's wow). Recording that recall passed strongly even through a broken install, that the two scary-looking findings (cmk crash + DECISIONS.md dup) were both the stale-install root cause not new bugs, and how the reinstall recovered — so the cut can proceed and a future session doesn't re-investigate.

<!-- decision:P-VTLX4QYR -->

## v0.3.2 cut-gate complete E1 wedge passed ready to tag

**When:** 2026-06-16 · **Fact:** `P-VTLX4QYR`
**Why:** The cold-open (E1) is the kit's single most important gate — the wedge that justifies the whole product. It passed live with the best-case result (persona transferred to a zero-history project, even the subtle repo-exception nuance). Recording that all gates passed + the bugs the cut-gate caught means the cut decision is fully traceable and a future session knows v0.3.2 was properly gated.

<!-- decision:P-RHaM3HDa -->

## Release & Publish Workflow (Git Tag to npm)

**When:** 2026-06-16 · **Fact:** `P-RHaM3HDa`
**Why:** Repeatable, verifiable release process ensures consistency, transparency, and auditability

<!-- decision:P-AX32FX5V -->

## v0.3.2 Release Inventory & v0.3.3 Feature Queue

**When:** 2026-06-16 · **Fact:** `P-AX32FX5V`
**Why:** Clear record of what shipped vs. what's in flight; documents feature readiness gates

<!-- decision:P-9TVaG53C -->

## onnxruntime-node CI Download Flakiness

**When:** 2026-06-16 · **Fact:** `P-9TVaG53C`
**Why:** Distinguishes transient network flakes from real code/release problems; prevents false alarm investigation

<!-- decision:P-B93GXMBD -->

## v0.3.2 published to npm with provenance

**When:** 2026-06-16 · **Fact:** `P-B93GXMBD`
**Why:** Closes the v0.3.2 release loop — records what shipped, that the cut-gate caught 3 bugs, and the transient onnxruntime-node ETIMEDOUT publish failure + its retry fix (so a future cut doesn't panic when publish.yml fails on that dependency's network install).

<!-- decision:P-Q2GaW43C -->

## Cut-Gate Process Validated Release Quality

**When:** 2026-06-16 · **Fact:** `P-Q2GaW43C`
**Why:** Cut-gate is the quality checkpoint that prevents bugs from reaching users. This session proved it catches real problems—it earned its keep.

<!-- decision:P-6GK6PZ2Z -->

## node:sqlite Migration Decision

**When:** 2026-06-16 · **Fact:** `P-6GK6PZ2Z`
**Why:** Search is a critical operation; existing implementation met all requirements. The regression eliminated any benefit from the migration.

<!-- decision:P-SURaZQS4 -->

## Tombstone Auto-Recall Design Decision

**When:** 2026-06-16 · **Fact:** `P-SURaZQS4`
**Why:** Respects user intent and data integrity—deleted records should not auto-surface in the AI system.

<!-- decision:P-UCG4RKNL -->

## Two post-v0.3.2 bugs index corruption and stale snapshot for v0.3.3

**When:** 2026-06-16 · **Fact:** `P-UCG4RKNL`
**Why:** Context is about to auto-compact (2% left); these two bugs ARE the cross-session-amnesia failure the kit exists to prevent, found on the kit itself right after shipping v0.3.2. Must be durable so the next session (which may itself hit the stale snapshot) can pick up the diagnosis and fix, not re-investigate.

<!-- decision:P-T6Q2QWHE -->

## Version Snapshot in recent.md Guards Against Cross-Session Amnesia

**When:** 2026-06-16 · **Fact:** `P-T6Q2QWHE`
**Why:** New sessions load memory to understand project state. A stale version snapshot would make them think an older version is current (e.g., v0.3.1 when v0.3.2 shipped). The snapshot is a guard rail for session continuity.

<!-- decision:P-64UMEVFG -->

## User questions whether kept branches are necessary; signals active concern about

**When:** 2026-06-16 · **Fact:** `P-64UMEVFG`

<!-- decision:P-N5AC9UXY -->

## Cut-Gate Review Process

**When:** 2026-06-17 · **Fact:** `P-N5AC9UXY`
**Why:** The project distinguishes live-tested (real data) from synthetic-tested (fixtures) from untested (behavioral). Unverified items are explicitly flagged rather than claimed complete.

<!-- decision:P-RR5a6aER -->

## Testing Verification Levels

**When:** 2026-06-17 · **Fact:** `P-RR5a6aER`
**Why:** Prevents false claims of completeness. Unverified paths are flagged for cut-gate review.

<!-- decision:P-AZa9JRMS -->

## Contract-Lock Testing Pattern

**When:** 2026-06-17 · **Fact:** `P-AZa9JRMS`
**Why:** Status-code tests verify the happy/error paths but miss contract violations; contract-lock tests catch edge cases and breaches directly.

<!-- decision:P-aFKRUUYV -->

## D-163 Invariant — Agent Must Never See Forgotten Facts

**When:** 2026-06-17 · **Fact:** `P-aFKRUUYV`
**Why:** Agent leaking recovered forgotten facts would be a critical privacy breach; the invariant must be enforced by-default, not remembered.

<!-- decision:P-2QSPCZCX -->

## Five Focus Questions Code Review Framework

**When:** 2026-06-17 · **Fact:** `P-2QSPCZCX`
**Why:** These five areas are the highest-risk surface for new features — privacy leaks, path traversal, invariant violations, shape mutations, default-enabled footguns.

<!-- decision:P-4EZT6FPU -->

## Graceful Degrade on Malformed Archive Data

**When:** 2026-06-17 · **Fact:** `P-4EZT6FPU`
**Why:** Recovery happens *because* something went wrong; crashing would prevent recovery. A graceful-degrade contract should be locked by test.

<!-- decision:P-UBU2NFWX -->

## Path Traversal Protection — Anchored ID Pattern + Validate-Before-Join

**When:** 2026-06-17 · **Fact:** `P-UBU2NFWX`
**Why:** Whitelist-pattern validation before path construction is the correct defense; the ordering prevents regressions.

<!-- decision:P-GF2UaLAH -->

## Scope Documentation Discipline — Record *Why*, Not Just *What*

**When:** 2026-06-17 · **Fact:** `P-GF2UaLAH`
**Why:** Future reader (or user months later) understands the decision and won't re-open the question or accidentally build the deferred feature in ad-hoc ways.

<!-- decision:P-DYCCQG9H -->

## Release Trigger: Tag Push Publishes

**When:** 2026-06-17 · **Fact:** `P-DYCCQG9H`
**Why:** Separates user control over release timing from deterministic automation, preventing accidental early releases while keeping the publish step hands-free.

<!-- decision:P-CATHYC5L -->

## Release Workflow for claude-memory-kit

**When:** 2026-06-17 · **Fact:** `P-CATHYC5L`
**Why:** This is the established pattern for shipping claude-memory-kit releases. v0.3.3 is the current example. The tag push is the critical "outward step" where work transitions from local to external/public.

<!-- decision:P-6NLDRFYV -->

## DECISIONS.md Cut-Gate Structure (DJ1–DJ4)

**When:** 2026-06-17 · **Fact:** `P-6NLDRFYV`
**Why:** Ensures DECISIONS.md recall is reliable across the full lifecycle (create, digest, forget, recall-as-retracted). The mechanism/behavior split acknowledges what can vs cannot be auto-tested.

<!-- decision:P-XK4aDSCY -->

## DJ4 Verification Prompts (DECISIONS.md Recall Gate)

**When:** 2026-06-17 · **Fact:** `P-XK4aDSCY`
**Why:** DJ4 is a behavioral gate that cannot be auto-tested. These prompts operationalize the manual verification step, making it repeatable and executable.

<!-- decision:P-QBWYD2Q9 -->

## Behavioral Gate Standard Pattern (v0.3.3)

**When:** 2026-06-17 · **Fact:** `P-QBWYD2Q9`
**Why:** Vague gates ("ask a history question") are not executable by humans running manual pre-release verification. Every gate must be runnable by someone without deep project context.

<!-- decision:P-KQ9WE2AU -->

## v0.3.3 Release Staging State

**When:** 2026-06-17 · **Fact:** `P-KQ9WE2AU`
**Why:** Accurate pre-tagging state; unblocks final release step.

<!-- decision:P-BPSaKX7V -->

## Release Workflow with Destructive Manual Steps

**When:** 2026-06-17 · **Fact:** `P-BPSaKX7V`
**Why:** Workflow has irreversible steps; next session needs to know the release is staged but requires explicit user choice on scope before proceeding

<!-- decision:P-EYGaT423 -->

## PowerShell UTF-8 Display Artifact in cmk Cut-Gate Validation

**When:** 2026-06-17 · **Fact:** `P-EYGaT423`
**Why:** Prevents future cmk setup runs from falsely failing gate checks due to display artifacts masking correct file state on Windows

<!-- decision:P-TTKBJN2D -->

## Cut-Gate Testing Structure (Terminal vs Live-Session Gates)

**When:** 2026-06-17 · **Fact:** `P-TTKBJN2D`
**Why:** Determines what can run in CI/headless vs what needs user interaction; gate placement guides future test additions

<!-- decision:P-GZUSMZVQ -->

## PowerShell UTF-8 Encoding Fix for Cut-Gate G4 Reads

**When:** 2026-06-17 · **Fact:** `P-GZUSMZVQ`
**Why:** Get-Content on Windows console displays UTF-8 middots/emdashes as mojibake characters, causing false-positive "corruption" flags during verification

<!-- decision:P-LCZ6Q27C -->

## Version 0.3.3 Release Features and Test Coverage

**When:** 2026-06-17 · **Fact:** `P-LCZ6Q27C`
**Why:** Next session needs exact test coverage before final release; live gates are blocking for 0.3.3 tag

<!-- decision:P-AW7WKGVT -->

## Multi-Site Home-Path Slug-Leak Bug Class (v0.3.3 Cut-Blocker)

**When:** 2026-06-17 · **Fact:** `P-AW7WKGVT`
**Why:** Usernames/home paths in committed fact filenames compromise privacy—auto-extract is highest risk because it runs automatically on every conversation turn with zero user action. This is confirmed as v0.3.3 cut-blocker, not just the single-site remember-core issue.

<!-- decision:P-647JJL4R -->

## Session 2 Validation Gates (cut-gate15)

**When:** 2026-06-17 · **Fact:** `P-647JJL4R`
**Why:** Validates v0.3.3 headline features (memory-search skill auto-trigger, DECISIONS.md scope, recall directives) behaviorally; remaining gates require live Claude session to drive conversational flows.

<!-- decision:P-7KRR6B6E -->

## Memory Kit Validation Gates (D1–W4 + DJ4 Live Gate)

**When:** 2026-06-17 · **Fact:** `P-7KRR6B6E`
**Why:** Each gate tests a distinct recall layer (rule search, decision recall, paraphrase matching, decision history); passing all gates confirms end-to-end function. DJ4 specifically validates that decision-history (DECISIONS.md) recall fires in *live* sessions, not just at design time — a headline v0.3.3 feature.

<!-- decision:P-KHB93CGB -->

## DJ4 Live-Gate Test Passed (v0.3.3 Headline Feature)

**When:** 2026-06-17 · **Fact:** `P-KHB93CGB`
**Why:** DJ4 is the headline verification for v0.3.3. Confirms feature design is sound; infrastructure gotcha does not block the tag.

<!-- decision:P-UTBXMFWR -->

## June 17 11:12 Build: decisions Scope Implemented

**When:** 2026-06-17 · **Fact:** `P-UTBXMFWR`
**Why:** Distinguishes current-build capabilities from stale-process behavior when testing scope-based features.

<!-- decision:P-SZX5LG7P -->

## MCP Server Staleness Gotcha (D-80)

**When:** 2026-06-17 · **Fact:** `P-SZX5LG7P`
**Why:** Affects feature testing and verification during development, especially when iterating on schema or scope changes. First encountered during DJ4 (v0.3.3 headline feature) testing on Jun 17.

<!-- decision:P-XCN5JURQ -->

## DJ4-Live Test Prerequisites

**When:** 2026-06-18 · **Fact:** `P-XCN5JURQ`
**Why:** Without DECISIONS.md, `mk_search {scope:"decisions"}` has nothing to return; restarting picks up the current build and avoids stale-process masking; testing against a retracted decision exercises the journal's unique value over fact-based recall

<!-- decision:P-MaWYNV6F -->

## Stale MCP Process Workaround After Build Updates

**When:** 2026-06-18 · **Fact:** `P-MaWYNV6F`
**Why:** The processes are long-lived and bound to the binary they loaded with; new sessions spawn fresh processes, but old sessions continue serving the outdated version

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-3FEV3J72 -->

## Probes for honest assessment of testing coverage — what was actually live-tested

**When:** 2026-06-17 · **Fact:** `P-3FEV3J72`

<!-- decision:P-AZZD4XCF -->

## Before tagging v0.3.3, user wants comprehensive confirmation that all vague gate

**When:** 2026-06-17 · **Fact:** `P-AZZD4XCF`

<!-- decision:P-aCAV54FE -->

## Don't assume execution scope without explicit permission; user corrected "i didn

**When:** 2026-06-17 · **Fact:** `P-aCAV54FE`

<!-- decision:P-YZZWTMEP -->

## Renamed `$env:USERPROFILE\.claude-memory-kit` as backup before running destructi

**When:** 2026-06-17 · **Fact:** `P-YZZWTMEP`

<!-- decision:P-5UMXLADZ -->

## Specified clear scope boundary — execute all steps up to "## 2. Session 1," stop

**When:** 2026-06-17 · **Fact:** `P-5UMXLADZ`

<!-- decision:P-9X52U9EP -->

## Prefers centralized helpers over code duplication (affirmed for multi-site bug f

**When:** 2026-06-17 · **Fact:** `P-9X52U9EP`

<!-- decision:P-4KZ72VGV -->

## Task Done-Goal Explicitness Rule

**When:** 2026-06-18 · **Fact:** `P-4KZ72VGV`
**Why:** D-169 was missed because automatic behavior was tested, but every test ran `cmk digest` manually first — masking that the automatic hook wasn't implemented. Explicit checkboxes make gaps impossible to ignore. This rule bookends the existing "live-test every task" rule.

<!-- decision:P-6ZS6ZAL6 -->

## Test Anti-pattern — Setup Commands Masking Automation

**When:** 2026-06-18 · **Fact:** `P-6ZS6ZAL6`
**Why:** D-169: DECISIONS.md auto-population was fully tested but every test started with manual `cmk digest`. The feature worked in tests, failed in real use.

<!-- decision:P-4SVME7QG -->

## cut-guide.md should be minimal, easy to read; use for live manual testing; move

**When:** 2026-06-18 · **Fact:** `P-4SVME7QG`

<!-- decision:P-4XHUNa9W -->

## Scaffolded Skills Drift After Binary Updates Without cmk install

**When:** 2026-06-18 · **Fact:** `P-4XHUNa9W`
**Why:** Stale skills silently under-perform (don't trigger), causing the agent to bypass them and hand-solve instead. This is also a real cmk doctor gap worth addressing for all users.

<!-- decision:P-ZZNLF7US -->

## lost track of what Task 159 was doing; signals confusion promptly rather than co

**When:** 2026-06-18 · **Fact:** `P-ZZNLF7US`

<!-- decision:P-79TK4TaF -->

## Memory Kit Index File (INDEX.md) Architecture

**When:** 2026-06-18 · **Fact:** `P-79TK4TaF`
**Why:** This is the kit's internal architecture. Understanding it is key to designing efficient session-start logic (e.g., Task 159's decision journal refresh).

<!-- decision:P-6RaEC34F -->

## prioritizes finishing v0.3.3 and moving on; willing to defer semantic search to

**When:** 2026-06-18 · **Fact:** `P-6RaEC34F`

<!-- decision:P-VVUK5RU7 -->

## Task 159: Auto-Updating Decision Journal

**When:** 2026-06-18 · **Fact:** `P-VVUK5RU7`
**Why:** v0.3.3 release blocker. Manual decision logs don't scale; automation keeps the journal honest.

<!-- decision:P-PZ4LH3CW -->

## CMK Decision Trail Requires Divergence Recording

**When:** 2026-06-18 · **Fact:** `P-PZ4LH3CW`
**Why:** Traceability and informed review. Future maintainers must know both the original decision and the reasons for change; prevents the same design question from being reconsidered.

<!-- decision:P-C5SL7RaW -->

## Journal Staleness Check Uses INDEX.md Mtime Proxy

**When:** 2026-06-18 · **Fact:** `P-C5SL7RaW`
**Why:** Session-start budget is tight; INDEX.md is a required artifact maintained by kit infrastructure anyway.

<!-- decision:P-LTCCJKT9 -->

## Journal Staleness Detection Uses Separate Boolean, Not Verdict

**When:** 2026-06-18 · **Fact:** `P-LTCCJKT9`
**Why:** Single-verdict slot constraint makes shared detection impossible for independent concerns. This is a compositional invariant of the kit's architecture.

<!-- decision:P-XZLFTK2A -->

## Decision-Trail Recording Convention for Divergences

**When:** 2026-06-18 · **Fact:** `P-XZLFTK2A`
**Why:** Maintains traceability and accountability; enables future context recovery and decision history.

<!-- decision:P-754HQESG -->

## Decision-trail work (A) is non-negotiable priority—"no matter what is a must."

**When:** 2026-06-18 · **Fact:** `P-754HQESG`

<!-- decision:P-QF6B7HQW -->

## New Skills System & Auto-Invocation Gap

**When:** 2026-06-18 · **Fact:** `P-QF6B7HQW`
**Why:** Skills exist to prevent silent divergences and improve discipline, but the auto-invocation layer isn't working as designed.

<!-- decision:P-4aSAFL3J -->

## User accepts technical divergences from research/design IF they were reasoned ag

**When:** 2026-06-18 · **Fact:** `P-4aSAFL3J`

<!-- decision:P-JTWUL9ZX -->

## Don't invent new documentation structures; follow the established documentation

**When:** 2026-06-18 · **Fact:** `P-JTWUL9ZX`

<!-- decision:P-FWFK4ARZ -->

## Documentation-map Spine drifts while DECISION-LOG stays current

**When:** 2026-06-18 · **Fact:** `P-FWFK4ARZ`
**Why:** Drift occurs because releases are cut and documented elsewhere without proactively refreshing the Spine. This repeats the same error class as Task 159 triplication and cut-gate-as-journal — state in multiple places, not maintained in the designated home.

<!-- decision:P-2TSXUZHR -->

## `.claude/skills/` Gitignore Creates Broken CLAUDE.md References on Clone

**When:** 2026-06-18 · **Fact:** `P-2TSXUZHR`
**Why:** The dev-skills are durable tools referenced in a standing instruction document. When the tools are gitignored but the doc is committed, fresh clones get broken pointers silently. This is structural drift, not content drift.

<!-- decision:P-QRHBWWLH -->

## Skill Adoption Verification Standard

**When:** 2026-06-18 · **Fact:** `P-QRHBWWLH`
**Why:** Grounds tool-keeping decisions in evidence rather than theory; prevents accumulation of unused tools

<!-- decision:P-TaFGHHD9 -->

## Skills Don't Trigger From CLAUDE.md or Hooks

**When:** 2026-06-18 · **Fact:** `P-TaFGHHD9`
**Why:** It's non-obvious. Most would expect CLAUDE.md or hooks to be the invocation mechanism. Understanding the real mechanism prevents wasted attempts and false assumptions.

<!-- decision:P-V33QABGS -->

## Use the official installer (npx skills@latest add) rather than manual commands f

**When:** 2026-06-18 · **Fact:** `P-V33QABGS`

<!-- decision:P-FJZFLaP9 -->

## adopt-third-party-skills-via-installer-personal-tier

**When:** 2026-06-18 · **Fact:** `P-FJZFLaP9`
**Why:** This session botched it twice: first hand-copied 6 of a 33-skill interdependent system into the gitignored project `.claude/skills/` (missing the installer, CONTEXT.md, sibling skills, the user-invoked grill-me entry points), then I judged them worthless WITHOUT reading them. Primary-source research (Claude Code skills+hooks docs + mattpocock's writing-great-skills + README) showed the correct model: installer → personal tier → auto-discovery → author's descriptions do the triggering. The user: "dont do it manually you are suppose to use the installer" and "read the readme for fuck sake."

<!-- decision:P-MB6XBZRR -->

## Task 159 Multi-Stage Verification Gate

**When:** 2026-06-18 · **Fact:** `P-MB6XBZRR`
**Why:** Task 159 is performance-critical with subtle interactions (lazy bin + journal sync). Multi-stage gate catches issues unit tests alone miss; the I1 fix was only visible in live-test, and skill-review caught a separate issue self-review missed.

<!-- decision:P-6L5CWR9G -->

## CI Pipeline Configuration

**When:** 2026-06-18 · **Fact:** `P-6L5CWR9G`
**Why:** These define what "CI is green" means in this repo; understanding the full matrix is essential for release QA, troubleshooting, and future expansion

<!-- decision:P-3GPCJWXQ -->

## Cut-Gate Sandbox Isolation

**When:** 2026-06-18 · **Fact:** `P-3GPCJWXQ`
**Why:** Install flows write memory files. Testing against real setup risks data loss or corruption.

<!-- decision:P-YHQU4aTH -->

## Cut-Gate Test Workflow

**When:** 2026-06-18 · **Fact:** `P-YHQU4aTH`
**Why:** Established pattern used consistently across 15+ test runs; proven reliable

<!-- decision:P-4JXMa5HF -->

## cmk install --with-semantic Command

**When:** 2026-06-18 · **Fact:** `P-4JXMa5HF`
**Why:** Core setup command for semantic search with documented graceful degradation on DLL lock failure.

<!-- decision:P-MQMPUBBN -->

## Cut-Gate 16 — Setup & Terminal Tests Complete

**When:** 2026-06-18 · **Fact:** `P-MQMPUBBN`
**Why:** Clear checkpoint. Terminal half is done; prevents re-deriving setup in next session. Signals readiness for in-chat testing phase.

<!-- decision:P-WX5WPTTJ -->

## cmk-compress-session requires SessionEnd hook invocation; manual terminal runs hang

**When:** 2026-06-18 · **Fact:** `P-WX5WPTTJ`
**Why:** Manual invocation during cut-gate testing created hung node processes. Understanding the hook-based design and correct testing patterns prevents this in future work.

<!-- decision:P-32TD3JaT -->

## CMK Tool Invocation: cmk-compress-session vs cmk-compress-lazy

**When:** 2026-06-18 · **Fact:** `P-32TD3JaT`
**Why:** Manual testing of cmk-compress-session led to confusion and hung processes; understanding the tool's intended context prevents wasted debugging.

<!-- decision:P-GD3QTG9V -->

## Version 0.3.3 Release — cut-gate16 Test Session State

**When:** 2026-06-18 · **Fact:** `P-GD3QTG9V`
**Why:** Clear record of final validation state before release.

<!-- decision:P-AZKXQRHC -->

## cut-gate16 Test Workflow Phases

**When:** 2026-06-18 · **Fact:** `P-AZKXQRHC`
**Why:** The phases are a structured verification checklist for the memory kit's core functionality. Running them in-chat (not terminal) lets Claude Code exercise its memory integration directly.

<!-- decision:P-JQ76A4W6 -->

## Doc Version Strings Should Be Parameterized

**When:** 2026-06-18 · **Fact:** `P-JQ76A4W6`
**Why:** Docs go stale; the tarball example in the guide had 0.3.2 but the actual install is 0.3.3. Parameterized docs are maintenance-free.

<!-- decision:P-ZXF759KP -->

## §5 Test Scorecard — Gates W1 through D6

**When:** 2026-06-18 · **Fact:** `P-ZXF759KP`
**Why:** Tracks which parts of the kit test plan have passed, which are blocked by harness issues, and which remain.

<!-- decision:P-XVEYV7a4 -->

## D6 Fail-Safe Behavior on Compress Timeout

**When:** 2026-06-18 · **Fact:** `P-XVEYV7a4`
**Why:** D6 gate failure is acceptable because the kit does not corrupt or lose state; it degrades gracefully.

<!-- decision:P-YZHN6DP6 -->

## Nested-claude Spawn Timeout in Test Harness

**When:** 2026-06-18 · **Fact:** `P-YZHN6DP6`
**Why:** D6 gate failed with `haiku_timeout`, but the failure pattern (timing out when called from inside Claude Code) repeats across multiple test attempts. Points to harness artifact, not kit bug.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-WSD3WEUY -->

## Skills installation complete — user ran `npx skills@latest add mattpocock/skills

**When:** 2026-06-18 · **Fact:** `P-WSD3WEUY`

<!-- decision:P-PRCXC9EQ -->

## expects GitHub CI automation to run on PR/merge

**When:** 2026-06-18 · **Fact:** `P-PRCXC9EQ`

<!-- decision:P-N5NPMLYY -->

## Test prompts should use natural language with subtle behavioral triggers, not ex

**When:** 2026-06-18 · **Fact:** `P-N5NPMLYY`

<!-- decision:P-9Z63AQE7 -->

## `claude --print` Haiku Latency & Compression Timeout Margin

**When:** 2026-06-18 · **Fact:** `P-9Z63AQE7`
**Why:** The 50s timeout was calibrated against expected latency (21–50s). Actual latency has degraded significantly, causing compressions to time out and now.md to grow unbounded if failures recur across sessions.

<!-- decision:P-D6YGVW9L -->

## Compression Retry Mechanism

**When:** 2026-06-18 · **Fact:** `P-D6YGVW9L`
**Why:** If compression times out, the feature fails safely but silently — input is not lost. However, if failures are consistent (e.g., due to persistent CLI latency), now.md accumulates unbounded across sessions until a compression finally beats the timeout clock.

<!-- decision:P-RX6DWHZD -->

## System-touching features are skipped in automated verification runs

**When:** 2026-06-18 · **Fact:** `P-RX6DWHZD`
**Why:** Protects the user's real system and data from unintended side effects during automated testing.

<!-- decision:P-VZF4U3TP -->

## Tag-ready criterion: core features pass; known issues cleanly deferred

**When:** 2026-06-18 · **Fact:** `P-VZF4U3TP`
**Why:** Allows shipping working features while deferring known architectural issues to future releases without false urgency or version coupling.

<!-- decision:P-KRGYHRUX -->

## Decisions Scope Semantic Fallback Warning (Task 156 Bug)

**When:** 2026-06-18 · **Fact:** `P-KRGYHRUX`
**Why:** Headline feature (Task 156, decisions recall) works but looks broken. Cosmetic defect in flagship feature kills user confidence on first impression.

<!-- decision:P-a2QWV6V4 -->

## Decisions Scope Uses Direct File Read, Not Vector DB

**When:** 2026-06-18 · **Fact:** `P-a2QWV6V4`
**Why:** Task 156 established this design to reuse the file-read precedent and maintain the journal as a live markdown view. Semantic search requires indexed data; the journal is neither indexed nor stored as table rows.

<!-- decision:P-5M3QY5B6 -->

## v0.3.3 Bug — Semantic Backend Attempted for Keyword-Only Decisions Scope

**When:** 2026-06-18 · **Fact:** `P-5M3QY5B6`
**Why:** The default search mode is hybrid (attempts semantic first), and the code does not short-circuit for decisions scope before attempting semantic. `search.mjs:163` has explicit validation that decisions is keyword-only, but `subcommands.mjs` ignores this and tries semantic anyway, generating a false-failure warning for expected behavior.

<!-- decision:P-RRENWMU7 -->

## Fix for `--scope decisions` Warning Bug in Memory Search

**When:** 2026-06-18 · **Fact:** `P-RRENWMU7`
**Why:** This is a real CLI bug affecting the v0.3.3 cut-gate; the fix and test metrics are durable reference for similar scope-handling issues.

<!-- decision:P-497V47QC -->

## Claude Memory Kit Update Workflow

**When:** 2026-06-18 · **Fact:** `P-497V47QC`
**Why:** Users need a clear process to adopt new versions; the kit has no `cmk update` wrapper command yet (v0.3.3)

<!-- decision:P-FBXSRRa9 -->

## Kit Update & Drift Detection Gaps (v0.3.4 Task)

**When:** 2026-06-18 · **Fact:** `P-FBXSRRa9`
**Why:** Basic product expectation ("how do I update?") has no answer; v0.3.3 ready to ship but these are gaps for v0.3.4

<!-- decision:P-MXZUV2UY -->

## Windows EBUSY on npm Global Update

**When:** 2026-06-18 · **Fact:** `P-MXZUV2UY`
**Why:** Real user blocker — cryptic error with no guidance if they try to update the global binary while IDE is open

<!-- decision:P-5PJXVSSG -->

## Plugin Install and Bootstrap Are Separate One-Time Steps

**When:** 2026-06-18 · **Fact:** `P-5PJXVSSG`
**Why:** Clarifies why two commands are required and prevents confusion about whether bootstrap is redundant or a plugin issue.

<!-- decision:P-7GQ4N9NJ -->

## Updating CMK Requires Re-running Bootstrap on Project Files

**When:** 2026-06-18 · **Fact:** `P-7GQ4N9NJ`
**Why:** The two-step update process (global machinery + per-project scaffold) is not obvious; users will expect a single update command to handle everything and will hit stale memory files.

<!-- decision:P-JZ3JaU7L -->

## Windows EBUSY When Updating CMK During Claude Code Runtime

**When:** 2026-06-18 · **Fact:** `P-JZ3JaU7L`
**Why:** Real blocker for Windows users. The EBUSY error is cryptic with no guidance on the cause or fix.

<!-- decision:P-5ZRXEHUW -->

## Release Gate-Test Pattern (claude-memory-kit)

**When:** 2026-06-18 · **Fact:** `P-5ZRXEHUW`
**Why:** Prevents shipping half-baked features; ensures solid user experience and builds user trust in kit quality.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-P9XLPJ2X -->

## Assistant has a pattern of running without sufficient thought/planning ("running

**When:** 2026-06-18 · **Fact:** `P-P9XLPJ2X`

<!-- decision:P-RDZ6SE7C -->

## User explicitly prefers concise responses; doesn't want walls of text

**When:** 2026-06-18 · **Fact:** `P-RDZ6SE7C`

<!-- decision:P-4D76WXZP -->

## Approved cleanup and ready to proceed to next phase (VS Code on cut-gate16)

**When:** 2026-06-18 · **Fact:** `P-4D76WXZP`

<!-- decision:P-MaPBRMaZ -->

## Installation command for this project updated to: cmk install --with-semantic

**When:** 2026-06-18 · **Fact:** `P-MaPBRMaZ`

<!-- decision:P-E4HX6VVU -->

## Corrects mechanism-only testing (bash) by steering toward behavioral testing via

**When:** 2026-06-18 · **Fact:** `P-E4HX6VVU`

<!-- decision:P-4LCSC9ZY -->

## Release verification must include testing the actual installed/packaged artifact

**When:** 2026-06-18 · **Fact:** `P-4LCSC9ZY`

<!-- decision:P-2GRPQKFa -->

## Research Documentation Convention

**When:** 2026-06-18 · **Fact:** `P-2GRPQKFa`
**Why:** Shows what was originally asked vs. what was actually researched; prevents re-checking systems; documents decision rationale and scope changes transparently

<!-- decision:P-FDATL4KY -->

## Task 161 Decision D-173 — Bound Compaction Input

**When:** 2026-06-18 · **Fact:** `P-FDATL4KY`
**Why:** 17-of-19 system convergence validates bounded-input as proven, safe path. Closes gap from design inception.

<!-- decision:P-5KXaLFDC -->

## Context Buffer Stabilization: 19 Systems Classified by Approach

**When:** 2026-06-18 · **Fact:** `P-5KXaLFDC`
**Why:** The proposed A+B+C+D exceeds what 17/19 systems do. The two most-similar systems validate A+B+C but not D. This opens a simplification fork: is full A+B+C justified, or does B+C (with defensive A) suffice?

<!-- decision:P-MYDY3DXF -->

## A+C-Core Design Pivot (Memsearch-Anchored, B Dropped)

**When:** 2026-06-18 · **Fact:** `P-MYDY3DXF`
**Why:** 19-system union was overengineered; anchoring on the two most-similar systems (memsearch + Letta) reveals the core is just input-cap + recent-window, not four mechanisms.

<!-- decision:P-BBEZ4YaD -->

## Overflow-Handling Caveat—Single Buffer vs. Memsearch's Many Files

**When:** 2026-06-18 · **Fact:** `P-BBEZ4YaD`
**Why:** A+C alone work for memsearch's shape (many files) but `now.md` is single growing buffer; trimmed overflow needs explicit handling, not just window-keep.

<!-- decision:P-M9J9M9LZ -->

## Proposed Turn-Based Memory Roll Design

**When:** 2026-06-18 · **Fact:** `P-M9J9M9LZ`
**Why:** Kit uses single-file model, unlike memsearch/Letta/MemoryOS; using existing rolling window more frequently (per turn, not per session) fits actual architecture better than borrowing cap-the-buffer pattern.

<!-- decision:P-6WEYN2TM -->

## Compression Spiral Bug at Three Identical Call Sites

**When:** 2026-06-18 · **Fact:** `P-6WEYN2TM`
**Why:** The bug is systemic at three sites, not localized to one verb. Per-verb or per-buffer fixes are incomplete; the root issue is unbound input to backend.compress.

<!-- decision:P-6M26BR9S -->

## Durable Tiers Enable Safe Buffer Trimming

**When:** 2026-06-18 · **Fact:** `P-6M26BR9S`
**Why:** When bounding input to compression, the "where does overflow go?" concern dissolves. Old content can be safely trimmed from derived buffers because it's already in the durable record.

<!-- decision:P-PAKDAWVL -->

## NOW_MD_ASSISTANT_CAP Precedent

**When:** 2026-06-18 · **Fact:** `P-PAKDAWVL`
**Why:** Shows the kit isn't starting from zero on input bounding — the precedent already exists. The solution should extend this pattern rather than invent a new mechanism.

<!-- decision:P-F9SUD9EG -->

## Prefers option 2 (bound inside CompressorBackend.compress implementation, not a

**When:** 2026-06-18 · **Fact:** `P-F9SUD9EG`

<!-- decision:P-GSRN46VV -->

## Requires overflow handling be comprehensive — don't shift problem from now.md to

**When:** 2026-06-18 · **Fact:** `P-GSRN46VV`

<!-- decision:P-DTS22L9D -->

## Wants research re-visited before final commit — pick direction, validate sources

**When:** 2026-06-18 · **Fact:** `P-DTS22L9D`

<!-- decision:P-SFaECJRK -->

## Compression Timeout Root Cause: Environmental Contention, Not Input Size

**When:** 2026-06-19 · **Fact:** `P-SFaECJRK`
**Why:** The original design premise (A+C to cap input size and prevent "compounding spiral") is falsified. Failures hit 8KB and 329-byte inputs equally. The buffer grows only because failures leave it un-drained; failures are transient/environmental, not size-induced.

<!-- decision:P-PVAPFJMR -->

## Compress Logger Observability Gap

**When:** 2026-06-19 · **Fact:** `P-PVAPFJMR`
**Why:** Without stderr/exit-code in the log, the kit can't diagnose actual failure reasons. This prevents knowing whether failures are transient (worth retrying) or deterministic (unfixable by retry).

<!-- decision:P-TASRaWE2 -->

## Structured Error Logging for Compress Failures

**When:** 2026-06-19 · **Fact:** `P-TASRaWE2`
**Why:** Observability gap prevented distinguishing transient failures (retry helps) from deterministic ones (retry re-fails). Structured logging enables data-driven retry design instead of assumptions.

<!-- decision:P-7KJS5Q7K -->

## Compression Retry Strategy for claude-memory-kit

**When:** 2026-06-19 · **Fact:** `P-7KJS5Q7K`
**Why:** Transient failures (timeouts, 5xx) are non-deterministic and retry-recoverable; deterministic failures need design fixes, not retries. The ecosystem confirms this pattern.

<!-- decision:P-6SESSZ33 -->

## SessionEnd Hook No-Retry Constraint

**When:** 2026-06-19 · **Fact:** `P-6SESSZ33`
**Why:** Protect concurrent persona call latency SLA while maintaining compression safety and reliability.

<!-- decision:P-YCA3aZYT -->

## Decision Trail and Knowledge Preservation System

**When:** 2026-06-19 · **Fact:** `P-YCA3aZYT`
**Why:** The team frequently revisits decisions (e.g., size-cap design may return if future measurements show different constraints). Recording full context prevents re-deriving analysis and makes fallback decisions safe. Builds institutional memory and supports learning.

<!-- decision:P-AV5aYUZJ -->

## Live Cut-Gate Requirement — Unit-Green ≠ Works-on-Real-Input

**When:** 2026-06-19 · **Fact:** `P-AV5aYUZJ`
**Why:** Unit mocks diverge from production behavior; transient Haiku failures are real and can only be validated by exercising the real service.

<!-- decision:P-GL7A4BXS -->

## Retry Configuration Strategy by Path

**When:** 2026-06-19 · **Fact:** `P-GL7A4BXS`
**Why:** The ceiling-free paths have time budget for retry; SessionEnd-hook is constrained and must fail fast to stay under 60s ceiling, shifting retry burden to the lazy path.

<!-- decision:P-63V2GTPD -->

## Stress Gate Requirement for Spawn-Boundary Changes

**When:** 2026-06-19 · **Fact:** `P-63V2GTPD`
**Why:** Spawn-boundary code is concurrency-sensitive and unit tests alone do not surface race conditions or transient spawn failures under load.

<!-- decision:P-F6KQVPPR -->

## Task 161.11 Retry Implementation Live Verification (Passed)

**When:** 2026-06-19 · **Fact:** `P-F6KQVPPR`
**Why:** Retry logic near spawn boundaries is high-risk; transient vs. permanent failures must be classified correctly. Windows and POSIX have different exit-code semantics. Conservative default prevents loops; logging gaps must be tracked.

<!-- decision:P-YBJRDa6H -->

## "autopilot" — user empowers assistant to decide scope for update-path documentat

**When:** 2026-06-19 · **Fact:** `P-YBJRDa6H`

<!-- decision:P-SaAAX7XL -->

## Claude-Memory-Kit Update Paths (npm vs Plugin)

**When:** 2026-06-19 · **Fact:** `P-SaAAX7XL`
**Why:** This decision point (which path to document/support) requires honest accounting of both user experiences. Both paths share the same fundamental workflow; both have identical "forgotten per-project step" failure mode.

<!-- decision:P-ZKH65YMH -->

## Known Quirks and Solutions

**When:** 2026-06-19 · **Fact:** `P-ZKH65YMH`
**Why:** These surface in real usage and block smooth UX in both paths (or are path-specific friction).

<!-- decision:P-UG3CSVUB -->

## Version Stamping and Scaffold Isolation

**When:** 2026-06-19 · **Fact:** `P-UG3CSVUB`
**Why:** This explains the silent failure: users update globally but forget per-project re-stamping, leaving mismatched versions. The separation is fundamental to the architecture.

<!-- decision:P-NDWKVJ27 -->

## User questioned whether the update task is necessary and doesn't remember the or

**When:** 2026-06-19 · **Fact:** `P-NDWKVJ27`

<!-- decision:P-DYPWAPD5 -->

## Cut-Gate Testing Practice

**When:** 2026-06-19 · **Fact:** `P-DYPWAPD5`
**Why:** Real sessions expose integration issues, edge cases, and interactions that sandbox tests cannot. Task 161's compression-retry behavior only surfaced in actual use, not in isolated test suites.

<!-- decision:P-W75PJXBP -->

## Release Process for claude-memory-kit

**When:** 2026-06-19 · **Fact:** `P-W75PJXBP`
**Why:** Ensures consistent, repeatable release process with automated publishing via GitHub Actions.

<!-- decision:P-2MSZRDP7 -->

## User chose docs+drift-check now (not defer) — clear priority decision

**When:** 2026-06-19 · **Fact:** `P-2MSZRDP7`

<!-- decision:P-LaG5aW75 -->

## Layered Backend Pattern

**When:** 2026-06-19 · **Fact:** `P-LaG5aW75`
**Why:** Separates concerns so services are testable/reusable without FastAPI; prevents architectural decay.

<!-- decision:P-KYTE5Q9V -->

## .venv Setup Requirement

**When:** 2026-06-19 · **Fact:** `P-KYTE5Q9V`
**Why:** Isolates dependencies; prevents version conflicts across projects.

<!-- decision:P-NNNBBSJZ -->

## Two Promotion Paths Route Facts Differently

**When:** 2026-06-19 · **Fact:** `P-NNNBBSJZ`
**Why:** The two capture mechanisms have different routing strategies — not a v0.3.4 code change (verified zero persona-related changes in v0.3.4), but which *mechanism fired* on that run. Auto-persona spreads; explicit-promote concentrates. This finding sharpens Task 151 for v0.4.

<!-- decision:P-J4LZZ2YG -->

## Backup Location and Naming Convention

**When:** 2026-06-19 · **Fact:** `P-J4LZZ2YG`
**Why:** Keeps versioned persona snapshots organized and easily findable during cut-gate testing and version comparisons; establishes a durable artifact location outside transient temp directories

<!-- decision:P-V9KUSZJM -->

## Fact Currency and Auto-Supersession Not Yet Implemented

**When:** 2026-06-19 · **Fact:** `P-V9KUSZJM`
**Why:** Projects evolve and generate multiple generations of design docs; the kit needs a way to surface current facts authoritatively. Task 66/95 planned for v0.4.

<!-- decision:P-WZMCCFLE -->

## Down-payment + full-redesign split pattern (D-154 precedent, v0.3.1)

**When:** 2026-06-19 · **Fact:** `P-WZMCCFLE`
**Why:** Captures urgency and ships the wedge-critical part without diluting committed minors or re-opening settled decisions.

<!-- decision:P-FG56FKV2 -->

## One-differentiator-per-minor rule (D-146)

**When:** 2026-06-19 · **Fact:** `P-FG56FKV2`
**Why:** Keeps release scope clear and focused. Violations delay both features and diffuse impact.

<!-- decision:P-JYBXNXE7 -->

## Task 151 classification and strategic weight

**When:** 2026-06-19 · **Fact:** `P-JYBXNXE7`
**Why:** Soft spots in foundational features affect downstream systems. New evidence (D-177 data) raises Task 151's importance relative to curation work.

<!-- decision:P-XXYKQaRS -->

## v0.3.5 patch vs v0.4.0 versioning logic

**When:** 2026-06-19 · **Fact:** `P-XXYKQaRS`
**Why:** Preserves single-differentiator rule, ships important fixes sooner, doesn't delay committed work.

<!-- decision:P-MSZXZ6VS -->

## Project Origin and Core Problem

**When:** 2026-06-19 · **Fact:** `P-MSZXZ6VS`
**Why:** This origin story is the foundation of all design decisions and prioritization. The kit exists to solve the user's real problem (forgetting context across sessions), not for its own sake. The video's thesis (recall reliability is the most important layer) validates why injection-layer quality is core product value.

<!-- decision:P-SPBREG3F -->

## HC-9 Drift After Claude Code Update (v0.3.4)

**When:** 2026-06-20 · **Fact:** `P-SPBREG3F`
**Why:** v0.3.4 detects when tool updates diverge the cached state and provides a simple recovery path. A future session encountering this drift needs to know it's not indicative of a real problem.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-NWG4PSPL -->

## Always create .venv for Python projects; install packages into it, not globally

**When:** 2026-06-19 · **Fact:** `P-NWG4PSPL`

<!-- decision:P-TLKQFR7Z -->

## Layered backend architecture: routes (thin, orchestrate transport only), service

**When:** 2026-06-19 · **Fact:** `P-TLKQFR7Z`

<!-- decision:P-LHNFGNQX -->

## Prefer paying architectural cost upfront to avoid maintenance friction later—"ra

**When:** 2026-06-19 · **Fact:** `P-LHNFGNQX`

<!-- decision:P-GAaL225G -->

## User's convention: claude-memory-kit backups go to ~\ (not temp directories)

**When:** 2026-06-19 · **Fact:** `P-GAaL225G`

<!-- decision:P-KQGKWQUT -->

## User reconsidering whether Task 151 (persona-redesign) should enter v0.4.0 despi

**When:** 2026-06-19 · **Fact:** `P-KQGKWQUT`

<!-- decision:P-HP6UTS9X -->

## Don't do v0.3.5 down-payment (full work/tests, no kit payoff); do full 151 redes

**When:** 2026-06-19 · **Fact:** `P-HP6UTS9X`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-F29TVCRT -->

## FQ1 test coverage gap — the cut-gate probe is CLI-only, not MCP tool (the actual

**When:** 2026-06-20 · **Fact:** `P-F29TVCRT`

<!-- decision:P-D2BR4VYX -->

## Auto-recall agents do not and should not read tombstoned facts; recovery is alwa

**When:** 2026-06-20 · **Fact:** `P-D2BR4VYX`

<!-- decision:P-K6DKFXP4 -->

## Check documentation to verify technical claims rather than reasoning through unc

**When:** 2026-06-20 · **Fact:** `P-K6DKFXP4`

<!-- decision:P-Y9DZXM3D -->

## Tasks 156 (DECISIONS.md AI-recall) and 155 (tombstone recovery flag) queued for

**When:** 2026-06-20 · **Fact:** `P-Y9DZXM3D`

<!-- decision:P-DEQV4AUL -->

## v0.3.2 ships FTS5 query fix (Task 153) + validate-index (Task 152)

**When:** 2026-06-20 · **Fact:** `P-DEQV4AUL`

<!-- decision:P-N6ZTVDUC -->

## v0.3.2 shipped to npm (@lh8ppl/claude-memory-kit@0.3.2) with SLSA provenance and

**When:** 2026-06-20 · **Fact:** `P-N6ZTVDUC`

<!-- decision:P-CLTKNaVa -->

## Memory routing gap caught — I was writing to harness slug path instead of kit's

**When:** 2026-06-20 · **Fact:** `P-CLTKNaVa`

<!-- decision:P-KKYS67aQ -->

## node:sqlite migration rejected—clean CI perf data showed 10% slower search perfo

**When:** 2026-06-20 · **Fact:** `P-KKYS67aQ`

<!-- decision:P-aG3GHZBE -->

## v0.3.3 roadmap: Task 156 (DECISIONS.md AI-recall journal completion), Task 155 (

**When:** 2026-06-20 · **Fact:** `P-aG3GHZBE`

<!-- decision:P-BFTDUAQT -->

## DECISIONS.md is the decision journal; Task 159 makes it auto-update automaticall

**When:** 2026-06-20 · **Fact:** `P-BFTDUAQT`

<!-- decision:P-94DQYLBM -->

## INDEX.md is the kit's metadata index of all 307 memory facts; touched on every f

**When:** 2026-06-20 · **Fact:** `P-94DQYLBM`

<!-- decision:P-DCP2GLQY -->

## Task 159 made two undocumented divergences from research spec: used `isJournalSt

**When:** 2026-06-20 · **Fact:** `P-DCP2GLQY`

<!-- decision:P-UY6XTETK -->

## Expects implementation choices to be traceable to (or explicitly justified again

**When:** 2026-06-20 · **Fact:** `P-UY6XTETK`

<!-- decision:P-HGAHKL9H -->

## 6 mattpocock skills (tdd, grilling, diagnosing-bugs, codebase-design, domain-mod

**When:** 2026-06-20 · **Fact:** `P-HGAHKL9H`

<!-- decision:P-WCBPVNEa -->

## Skills available but not invoked despite matching work; violates Skill agency ru

**When:** 2026-06-20 · **Fact:** `P-WCBPVNEa`

<!-- decision:P-6DNYCTB2 -->

## Code-review-excellence is pre-existing skill, not one of 6 newly adopted; produc

**When:** 2026-06-20 · **Fact:** `P-6DNYCTB2`

<!-- decision:P-A2XCSPSa -->

## CHANGELOG date for v0.3.3 is 2026-06-18

**When:** 2026-06-20 · **Fact:** `P-A2XCSPSa`

<!-- decision:P-54X6D2DM -->

## cmk-compress-session must be invoked by Claude Code at session-end, not manually

**When:** 2026-06-20 · **Fact:** `P-54X6D2DM`

<!-- decision:P-YA74AXRJ -->

## Nested-`claude` invocations from inside an active Claude Code session timeout at

**When:** 2026-06-20 · **Fact:** `P-YA74AXRJ`

<!-- decision:P-DV52LVVN -->

## D6 (now→today roll) fail-safe behavior confirmed: timeout logs cleanly, now.md i

**When:** 2026-06-20 · **Fact:** `P-DV52LVVN`

<!-- decision:P-LD7RPCTX -->

## Honest uncertainty flagging: can't be 100% sure whether compress timeout is envi

**When:** 2026-06-20 · **Fact:** `P-LD7RPCTX`

<!-- decision:P-KKALEZCP -->

## Only 2 of 19 systems (memsearch, Letta) cleanly implement A+B+C (buffer cap + de

**When:** 2026-06-20 · **Fact:** `P-KKALEZCP`

<!-- decision:P-5WHKZPR3 -->

## Kit's memory system uses a `now → today → recent → archive` rolling window; `now

**When:** 2026-06-20 · **Fact:** `P-5WHKZPR3`

<!-- decision:P-WYEEXZRN -->

## Root cause: roll mechanism fires only at SessionStart/SessionEnd, not turn bound

**When:** 2026-06-20 · **Fact:** `P-WYEEXZRN`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-4TGBBBPB -->

## 200KB input compresses in ~15s standalone (no contention); real-world failures o

**When:** 2026-06-20 · **Fact:** `P-4TGBBBPB`

<!-- decision:P-MXSa47QX -->

## User prefers memory designs tailored to kit's actual architecture over patterns

**When:** 2026-06-20 · **Fact:** `P-MXSa47QX`

<!-- decision:P-E7AL69YL -->

## observability-first approach — captures real failure data before implementing de

**When:** 2026-06-20 · **Fact:** `P-E7AL69YL`

<!-- decision:P-ZMRE4MSU -->

## Cascade-Starvation: Lazy Distill Limitation on Busy Repos

**When:** 2026-06-20 · **Fact:** `P-ZMRE4MSU`
**Why:** Known limitation (Task 105/D-75). Surfaces as unexpected staleness on high-activity projects. Lazy SessionStart fallback is insufficient as *sole* distill mechanism for hierarchical compression.

<!-- decision:P-2RaREHLR -->

## CMK Health Check Status (2026-06-20)

**When:** 2026-06-20 · **Fact:** `P-2RaREHLR`
**Why:** Captures current health state. Staleness is caused by two compounding issues: (1) cascade-starvation where stale-now verdict blocks stale-daily/weekly refresh cycles, (2) unretried haiku_timeout on weekly compression (predates v0.3.4). Cron not registered means no scheduled background distill; only lazy fallback on SessionStart. Native auto-memory running in parallel with kit layers.

<!-- decision:P-BKCWY2C6 -->

## Cron Job Registration Feature (HC-5)

**When:** 2026-06-20 · **Fact:** `P-BKCWY2C6`
**Why:** Without cron, lazy SessionStart fallback is the only automatic distill path, which starves on busy repos (cascade-starvation). Scheduled cron runs provide reliable daily/weekly cycles — the real fix for staleness on high-activity dogfood/test projects.

<!-- decision:P-BDQ7XNU5 -->

## Weekly Compression Timeout and v0.3.4 Retry Logic

**When:** 2026-06-20 · **Fact:** `P-BDQ7XNU5`
**Why:** Large compressions can timeout; v0.3.4 added retry recovery. The unretried timeout in this session predates the fix. With new install, future timeouts should auto-retry.

<!-- decision:P-ABWV2PS7 -->

## LLM Timeout Retries: Backoff Interval Strategy

**When:** 2026-06-20 · **Fact:** `P-ABWV2PS7`
**Why:** Short backoff intervals (< 1s) don't give slow LLM windows time to pass; they just hammer with back-to-back requests. Long waits (5–10s) align with field practice and let transient slowness resolve naturally.

<!-- decision:P-6U7SCR5a -->

## Register Crons for Staleness/Starvation Prevention

**When:** 2026-06-20 · **Fact:** `P-6U7SCR5a`
**Why:** Crons are the designed fix for staleness and cascade-starvation; background distill-curate cycle prevents memory degradation over time

<!-- decision:P-Ta2YJJaB -->

## Tag and Publish v0.3.5 Release

**When:** 2026-06-20 · **Fact:** `P-Ta2YJJaB`
**Why:** Release commit b4ecf78 is on main and ready; tagging is the publish gate that automates npm and GitHub release

<!-- decision:P-WQDKTWEG -->

## Close Claude Code Before Global cmk Install to Avoid EBUSY

**When:** 2026-06-20 · **Fact:** `P-WQDKTWEG`
**Why:** Claude Code's MCP processes hold file locks; npm needs exclusive DLL access during installation. DLL contention occurs on Windows.

<!-- decision:P-NZE35AKR -->

## Local Tarball Testing Path (Pre-Publish Gate)

**When:** 2026-06-20 · **Fact:** `P-NZE35AKR`
**Why:** Catches bugs before they reach npm; reduces risk of bad versions going public; aligns with established cut-gate.md pattern, proven effective for v0.3.5.

<!-- decision:P-2WWX4ZHY -->

## v0.3.5 Release Verified and Ready

**When:** 2026-06-20 · **Fact:** `P-2WWX4ZHY`
**Why:** Confirms end-to-end fix works and no blockers remain; safe to publish.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-TSBAKGD7 -->

## Expects comprehensive accounting of work—what was kept, what was superseded but

**When:** 2026-06-20 · **Fact:** `P-TSBAKGD7`

<!-- decision:P-9YCUW5QH -->

## Distill Performance Baselines (Slow vs Healthy Haiku)

**When:** 2026-06-20 · **Fact:** `P-9YCUW5QH`
**Why:** Manual distill run on 2026-06-20 took 240s and succeeded, confirming the v0.3.5 retry fix handles slow-Haiku windows where v0.3.4 would have failed entirely. This is the exact scenario the timeout/backoff tuning targets.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-XM9YAKRW -->

## httpx2 deprecation in FastAPI TestClient — need to replace httpx dependency with

**When:** 2026-06-20 · **Fact:** `P-XM9YAKRW`

<!-- decision:P-WMN3HFPF -->

## Prefer using recorded memory lookups and CLI tools (cmk search) instead of manua

**When:** 2026-06-20 · **Fact:** `P-WMN3HFPF`

<!-- decision:P-7RV4P6CR -->

## Accepted two-lever fix recommendation (120s timeout + 5s CEILING_FREE_BACKOFF_MS

**When:** 2026-06-20 · **Fact:** `P-7RV4P6CR`

<!-- decision:P-LSJG9NCK -->

## Established testing path in cut-gate.md (local tarball pack → install → verify)

**When:** 2026-06-20 · **Fact:** `P-LSJG9NCK`

<!-- decision:P-CRUFQECT -->

## Before closing VS Code to reopen, user wants everything documented in RESUME-HER

**When:** 2026-06-20 · **Fact:** `P-CRUFQECT`

<!-- decision:P-2YP75JAJ -->

## v0.3.5 verified: all 9 health checks pass; compress fix proven (recent.md 4h fre

**When:** 2026-06-20 · **Fact:** `P-2YP75JAJ`

<!-- decision:P-K4BM4YYX -->

## Project Tracking Structure

**When:** 2026-06-20 · **Fact:** `P-K4BM4YYX`
**Why:** Explicit tracking + session markers let sessions resume without re-deriving state.

<!-- decision:P-AGV23NTY -->

## Task 50 cross-agent seam: target Kiro CLI agent-hooks (agentSpawn=SessionStart-i

**When:** 2026-06-20 · **Fact:** `P-AGV23NTY`
**Why:** The kit's whole inject-at-start/capture-at-turn-end model only ports to the CLI agent-hook surface; building against the IDE surface would mean no session-start trigger + an undocumented on-disk format.

<!-- decision:P-SAX2JDHY -->

## Task 50 adapter architecture: do NOT build a uniform Installer base class across

**When:** 2026-06-20 · **Fact:** `P-SAX2JDHY`
**Why:** Full-corpus survey: only claude-mem actually multi-agent-installs and its code is bespoke-per-agent; an Installer.install() interface is a leaky abstraction whose bodies share zero code. The generalizable part is the config-write primitive, which maps to the kit's existing marker-block byte-preservation + over-mutation-guard rules.

<!-- decision:P-RT2G5VAY -->

## Task 50 highest unverified risk: Kiro transcript format is UNKNOWN. The kit's ex

**When:** 2026-06-20 · **Fact:** `P-RT2G5VAY`
**Why:** The transcript layer is the one part of the Claude-Code integration that is deeply host-coupled and was NOT verifiable from docs; it gates the capture half of the kit's model on Kiro.

<!-- decision:P-NC2URWTD -->

## Kiro transcript format RESOLVED (verified on a real Kiro install, D-180 follow-u

**When:** 2026-06-20 · **Fact:** `P-NC2URWTD`
**Why:** This was flagged as Task 50's highest unverified risk (kit hardcodes Claude-Code transcript touchpoints). Now resolved to LOW — the format is clean + parseable; only 3 per-agent params change (transcript dir, workspace->dir base64url mapping, JSON .history parse shape).

<!-- decision:P-VSTZ4B6M -->

## Decision-Trail Preservation Rule

**When:** 2026-06-20 · **Fact:** `P-VSTZ4B6M`
**Why:** Preserves decision history and makes changes traceable; enables future readers to understand the reasoning and evolution

<!-- decision:P-EJ2VUaJL -->

## Documentation Structure and Authoritative Homes

**When:** 2026-06-20 · **Fact:** `P-EJ2VUaJL`
**Why:** Distributed documentation ensures each finding type lives in its canonical location and remains discoverable for future sessions

<!-- decision:P-3H5NPLNC -->

## README/CHANGELOG Update Timing

**When:** 2026-06-20 · **Fact:** `P-3H5NPLNC`
**Why:** Prevents "lazy-framing-as-docs anti-pattern" of documenting unshipped features as if they're already live

<!-- decision:P-HVL7EQZS -->

## Kiro CLI hooks gap (D-181 follow-up, found by reading kiro.dev/docs/cli/custom-a

**When:** 2026-06-20 · **Fact:** `P-HVL7EQZS`
**Why:** The kit's whole thesis (D-85/D-164) is memory that works automatically with no manual command. A hook that only fires under a manually-selected agent fails that — the same automatic-path failure class as D-169. The hook schema itself is correct ({hooks:{agentSpawn:[{command}],stop:[{command}]}}) but the DELIVERY mechanism (custom agent) is manual-only.

<!-- decision:P-FSJ93TaZ -->

## Kiro CLI auto-loading verified (D-181 follow-up, kiro.dev/docs/cli/steering prim

**When:** 2026-06-20 · **Fact:** `P-FSJ93TaZ`
**Why:** The current Kiro profile writes a custom steering file assuming inclusion:always auto-loads it (IDE convention). The CLI docs contradict this: custom steering needs agent-resources inclusion; AGENTS.md is the auto-loaded surface. So the profile's instruction leg is wired to a file the CLI won't auto-read.

<!-- decision:P-6E53DZRM -->

## Kiro IDE vs CLI hooks (verified quote from an AWS-builders article the user foun

**When:** 2026-06-20 · **Fact:** `P-6E53DZRM`
**Why:** The user correctly called out that I was confusing Claude Code's model with Kiro's. Kiro IDE and Kiro CLI are two surfaces sharing MCP+steering but differing on hooks. Real working implementations exist (AWS bash-hooks memory, langfuse integration, AgentCore memory blog) that should be studied before designing the kit's Kiro path.

<!-- decision:P-N39ZJ69D -->

## Kiro IDE hooks are a BETTER fit for the kit than I first concluded (verified acr

**When:** 2026-06-20 · **Fact:** `P-N39ZJ69D`
**Why:** This reverses my earlier 'CLI hooks are the target' conclusion. The IDE surface has automatic turn-end + shell-command-with-context-injection — a cleaner fit for the kit's auto-memory model than CLI custom-agent hooks (manual). The cost: the .kiro.hook format is undocumented, so it must be reverse-engineered from real repos + live-verified (the §5.1 convergent-third-party rule — and here even docs fail, so REAL files are the only primary source).

<!-- decision:P-WJRUQVSW -->

## Kiro IDE .kiro.hook on-disk format VERIFIED from a real hook created in the Kiro

**When:** 2026-06-20 · **Fact:** `P-WJRUQVSW`
**Why:** The docs refused to document the .kiro.hook format (UI-first). A real file from the user's Kiro install is the only primary source — and it reveals IDE hooks ARE installable from a file, which reopens the IDE-hooks path as a real option for the kit (automatic agentStop, no default-agent needed). The when/then structure differs from the CLI agent-config hook array.

<!-- decision:P-55ZLLX6T -->

## Decision (the user, 2026-06-21): rework Kiro support PROPERLY before v0.4.0 ship

**When:** 2026-06-20 · **Fact:** `P-55ZLLX6T`
**Why:** The user chose correctness-now over ship-broken. The default-agent decision needs the 'what did others do' evidence before deciding — AgentCore (a memory system, our closest analog) sets it; the non-memory tools don't. That suggests a memory kit SHOULD set it, but it's invasive (every kiro-cli session uses cmk's agent), so present it as the AgentCore-precedented recommendation with an opt-out.

<!-- decision:P-X974ZW97 -->

## Kiro has FOUR install surfaces, not three (the user's correction 2026-06-21): HO

**When:** 2026-06-20 · **Fact:** `P-X974ZW97`
**Why:** The user corrected my mental model: Kiro = hooks + steerings + skills + MCP. I'd been mapping only 3 of 4 surfaces. Skills is a real Kiro surface the kit should consider mapping its own skills to. Steering coexistence with agents is now verified from real DesignerPunk agent files (resources re-add).

<!-- decision:P-4FLCNCaX -->

## Kiro skills map NEARLY 1:1 to Claude Code skills (verified from real files 2026-

**When:** 2026-06-20 · **Fact:** `P-4FLCNCaX`
**Why:** The user's 4-surface correction (hooks/steering/skills/mcp) surfaced skills as a leg the kit's adapter omitted. Real-file inspection shows Kiro skills ≈ Claude Code skills (SKILL.md + frontmatter), so the kit's memory skills port directly — a high-value, low-risk leg that gives the model the memory-search/memory-write capabilities on Kiro the same way as on Claude Code.

<!-- decision:P-YKG4GF25 -->

## Decision (the user, 2026-06-21): the kit's Kiro support wires ALL FOUR surfaces 

**When:** 2026-06-20 · **Fact:** `P-YKG4GF25`
**Why:** The kit's thesis is automatic, deterministic memory (D-85/D-164). A skills/steering-only recall+capture would be model-compliance-dependent (the model has to choose to call memory-write). Hooks give the same deterministic capture-at-turn-end the kit relies on for Claude Code. The user chose completeness over install-simplicity — consistent with the kit's architecture-first values (U-VMASJQ55: accept upfront cost to avoid future friction).

<!-- decision:P-P9FL3NYB -->

## Kiro install path SETTLED (D-182, 2026-06-21, from a 14-real-project survey + th

**When:** 2026-06-20 · **Fact:** `P-P9FL3NYB`
**Why:** The user's push to check 15+ real projects + clone them settled the install path with EVIDENCE (a tally) not theory, and surfaced the authoritative source (Amazon-Q Rust) that corrects the stale published JSON schema. CLI-agent-config wins because IDE hooks can't do deterministic capture (askAgent only) — the kit's whole thesis is deterministic auto-capture.

<!-- decision:P-WG6SMMV7 -->

## CORRECTION to D-182 (2026-06-21): the survey's claim 'IDE .kiro.hook is disquali

**When:** 2026-06-20 · **Fact:** `P-WG6SMMV7`
**Why:** I let the research collapse to CLI-only and disqualified the IDE on a false premise (askAgent-only). The user caught it: 'why are you only talking about kiro cli and not kiro ide?'. Most Kiro users use the IDE; it was the original v0.4 target. The user's real hook proves IDE runCommand works. 3 of 4 surfaces (MCP/steering/skills) are SHARED IDE+CLI anyway; only hooks differ, and BOTH support deterministic capture.

<!-- decision:P-F4WFAXAQ -->

## Decision (the user, 2026-06-21): the Kiro rework wires BOTH IDE + CLI hook surfa

**When:** 2026-06-20 · **Fact:** `P-F4WFAXAQ`
**Why:** The user chose complete coverage over phased. Kiro IDE is the primary surface (their main work IDE) + CLI for terminal users. Both hook surfaces support deterministic capture (the runCommand correction). Consistent with the all-4-surfaces + rework-properly decisions — architecture-first completeness (U-VMASJQ55).

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-BEWVGQJH -->

## Published v0.3.5 via git tag + push (straightforward execution of tested fix).

**When:** 2026-06-20 · **Fact:** `P-BEWVGQJH`

<!-- decision:P-N2PGMBaF -->

## CRITICAL Kiro-on-Windows hook constraint (LIVE-DISCOVERED 2026-06-21, would neve

**When:** 2026-06-21 · **Fact:** `P-N2PGMBaF`
**Why:** This is the kind of cross-platform composition failure (the kit's binding cross-platform rule) that ONLY live-testing finds — the whole reason the user pushed for live tests. A Kiro hook command that works on macOS/Linux (native bash) breaks on Windows (WSL routing + no node). The kit must emit a hook command that runs in Kiro's actual execution environment per-platform.

<!-- decision:P-AU9A6457 -->

## Kiro IDE hooks live-test WINS (2026-06-21, the user ran it in C:\Projects\Spec-D

**When:** 2026-06-21 · **Fact:** `P-AU9A6457`
**Why:** The live test the user ran validated the core IDE-hook mechanism end-to-end: hooks auto-fire on agentStop, runCommand executes, the kit's .kiro.hook format loads. Only the per-platform command form (Windows WSL) needs solving — a contained, solvable problem, not an architecture flaw. This is exactly the live verification that turns 'should work per docs' into 'verified fires'.

<!-- decision:P-3K6D62MS -->

## Windows Kiro Hooks Execute via WSL; Require cmd.exe /c Prefix

**When:** 2026-06-21 · **Fact:** `P-3K6D62MS`
**Why:** Discovered via live test on 2026-06-21 in Spec-Driven-Workshop. The probe `.kiro.hook` fired but failed with `node: not found`, surfacing the WSL layer. Static analysis alone would not have caught this cross-platform behavior.

<!-- decision:P-PM2CD6CB -->

## SOLVED — the Windows Kiro-hook command form (LIVE-VERIFIED 2026-06-21): 'cmd.exe

**When:** 2026-06-21 · **Fact:** `P-PM2CD6CB`
**Why:** This closes the only blocker found in the Kiro IDE live-test. The WSL/no-node problem (which only live-testing surfaced) is solved by cmd.exe /c forcing the Windows shell. Now the kit can emit a Kiro hook command that actually fires cmk on every platform.

<!-- decision:P-CW9CLD2a -->

## Kiro .kiro.hook path lesson (2026-06-21): paths in a .kiro.hook command string m

**When:** 2026-06-21 · **Fact:** `P-CW9CLD2a`
**Why:** A hand-written probe hook with C:\tmp\... single-backslashed broke Kiro's JSON parser. The kit must never emit a backslash path into a .kiro.hook. JSON.stringify + forward-slash paths is the safe pattern.

<!-- decision:P-CJYGTQYR -->

## Kiro hook ENVIRONMENT verified live (2026-06-21, the probe captured it before ha

**When:** 2026-06-21 · **Fact:** `P-CJYGTQYR`
**Why:** This is the load-bearing payload-shape question, answered live. Kiro's hook model (env+argv+transcript-file) is fundamentally DIFFERENT from Claude Code's (stdin JSON with assistant_response). The cmk hook bin must adapt per-agent: Claude Code reads stdin JSON; Kiro reads env+argv+transcript. Building it to expect a Kiro stdin payload would hang or capture nothing (the probe proved the hang).

<!-- decision:P-4aNa5TZB -->

## Kiro hook prior-art survey conclusion (2026-06-21, the boilerplate article + kir

**When:** 2026-06-21 · **Fact:** `P-4aNa5TZB`
**Why:** Confirms the kit is doing something novel (deterministic runCommand capture) that no published Kiro project does — they all use askAgent. So the probe is the ground truth + the kit can't lean on examples for the runCommand input model. The restart-to-activate-hooks detail is a real install-UX requirement to document.

<!-- decision:P-XaPRJFWE -->

## Kiro hook AUTHORITATIVE confirmations (2026-06-21, from the AWS builder article 

**When:** 2026-06-21 · **Fact:** `P-XaPRJFWE`
**Why:** This AWS primary-source article confirms every probe finding (USER_PROMPT env, runCommand→stdout→context, agentStop, exit-0-or-block) and surfaces a security requirement: the kit must sanitize USER_PROMPT before using it in a command. It also validates the kit's whole approach (runCommand deterministic capture is THE recommended pattern).

<!-- decision:P-RZR74Pa2 -->

## Kiro Hook Activation and Git Commit Cycle

**When:** 2026-06-21 · **Fact:** `P-RZR74Pa2`
**Why:** This is the documented Kiro lifecycle. Hooks are not hot-reloaded; the cycle is part of the system design.

<!-- decision:P-aRER5PY3 -->

## Kiro Hook Security Design is Injection-Safe

**When:** 2026-06-21 · **Fact:** `P-aRER5PY3`
**Why:** AWS's "Mastering Agent Hooks" article confirmed this approach is the authoritative best practice, not novel/risky. The security concern from the AWS article (sanitizing prompts) is already handled by the kit's existing infrastructure.

<!-- decision:P-NTDLMK74 -->

## PR-1 Task-50 Kiro Rework — Completion State (2026-06-21)

**When:** 2026-06-21 · **Fact:** `P-NTDLMK74`
**Why:** Modular approach lets each surface be verified before final orchestration. Orchestrator is the glue layer that enables the full user workflow.

<!-- decision:P-9D56CKBV -->

## PR Organization: Separate IDE (PR-1) and CLI (PR-2) Surfaces

**When:** 2026-06-21 · **Fact:** `P-9D56CKBV`
**Why:** IDE and CLI integration require different documentation and config models. Separating them maintains clear scope and prevents review confusion. IDE is now production-ready and deployable independently.

<!-- decision:P-Y7Q532UC -->

## SonarCloud as Security Gate for ReDoS Detection

**When:** 2026-06-21 · **Fact:** `P-Y7Q532UC`
**Why:** SonarCloud provides security-focused static analysis. Understanding its role and historical effectiveness (catching ReDoS) explains why it's the final merge gate.

<!-- decision:P-JHZ6ZT27 -->

## SonarCloud `then`-in-object False Positive (Schema Fields)

**When:** 2026-06-21 · **Fact:** `P-JHZ6ZT27`
**Why:** This rule fires reliably on any field named `then`. Without knowing it's a false positive in this context, developers may over-fix or be confused by the flag during CI.

<!-- decision:P-GVUWGQKL -->

## Claude Code vs Kiro Hook and Integration Differences

**When:** 2026-06-21 · **Fact:** `P-GVUWGQKL`
**Why:** Each agent has a different plugin/integration API and execution context; these differences are fundamental to how each tool works

<!-- decision:P-HFQPUGUD -->

## Shared Core + Thin Adapter Architecture Pattern

**When:** 2026-06-21 · **Fact:** `P-HFQPUGUD`
**Why:** Different agents have fundamentally different input/output contracts; the core must be shared for consistency and maintainability, but the adapters must differ

<!-- decision:P-7QBE6A6M -->

## Kiro vs Claude Code integration: the CORE is shared (verified 2026-06-21), only 

**When:** 2026-06-21 · **Fact:** `P-7QBE6A6M`
**Why:** The user asked 'isn't the kiro integration code supposed to be the same as claude code integration code?' — the answer (verified in code): YES for the core (it IS the same, reused not reimplemented), NO for the adapter (Claude Code and Kiro are different programs with different hook config/input/transcript contracts). The thin adapter is the only divergence, and every difference maps to a real tool difference.

<!-- decision:P-FA4ALL42 -->

## Plan (the user, 2026-06-21): do the manual Kiro live-capture test ONCE, after AL

**When:** 2026-06-21 · **Fact:** `P-FA4ALL42`
**Why:** The user prefers one consolidated live-test session over two. PR-1 proved the hook RUNS (cmd.exe /c cmk --version → 0.3.5); the capture-fires-end-to-end test waits until PR-2 lands so both IDE + CLI surfaces are verified together at the v0.4.0 cut.

<!-- decision:P-3Y6MCN2B -->

## Kiro CLI agent-config goes to ~/.aws/amazonq/cli-agents/ (Amazon Q's real locati

**When:** 2026-06-21 · **Fact:** `P-3Y6MCN2B`
**Why:** A user-tier write (the Kiro CLI agent at ~/.aws) needs the same sandbox-isolation as MEMORY_KIT_USER_DIR. The live-test rule (run against a sandbox that can't touch real state) caught this — the routing's undefined userTier fell through to the real home. This is the test-isolation discipline applied to a NEW user-tier location (~/.aws).

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-BK5H9TP6 -->

## Check broader product research corpus; don't rely on 2 cherry-picked exemplars

**When:** 2026-06-20 · **Fact:** `P-BK5H9TP6`

<!-- decision:P-3SJHATQG -->

## Original task iterations preserved with "decision-trail" markers when tasks rest

**When:** 2026-06-20 · **Fact:** `P-3SJHATQG`

<!-- decision:P-B7AHUBR5 -->

## Tasks must have explicit done-criteria as checkboxes defined at task START befor

**When:** 2026-06-20 · **Fact:** `P-B7AHUBR5`

<!-- decision:P-ZJZYKX6F -->

## Checks for comprehensive documentation as a quality gate (research, decisions, d

**When:** 2026-06-20 · **Fact:** `P-ZJZYKX6F`

<!-- decision:P-LZEDDB4W -->

## For multi-surface builds (like Kiro IDE/CLI): prefers sub-tasks, start with IDE

**When:** 2026-06-20 · **Fact:** `P-LZEDDB4W`

<!-- decision:P-GXB5XYKV -->

## Deferred manual live-testing until v0.4.0 code completion, rather than increment

**When:** 2026-06-21 · **Fact:** `P-GXB5XYKV`

<!-- decision:P-7T5EJATL -->

## 5× Concurrency Stress Gate as Pre-PR Verification

**When:** 2026-06-21 · **Fact:** `P-7T5EJATL`
**Why:** Concurrency bugs are hard to trigger in single runs; stress gates reliably expose them.

<!-- decision:P-PRaLBB4a -->

## Windows EPERM/Spawn-Concurrency Flake Class and Fix Pattern

**When:** 2026-06-21 · **Fact:** `P-PRaLBB4a`
**Why:** These are concurrency-class bugs that only surface under stress; the stress gate reliably flushes them before PR.

<!-- decision:P-J37A3AY6 -->

## Stress Gate Test Harness — Binding 5× Rule for Merge

**When:** 2026-06-21 · **Fact:** `P-J37A3AY6`
**Why:** The two pre-existing concurrency flakes prove why 5× is non-negotiable — they would have shipped without it.

<!-- decision:P-Z5TZW33W -->

## Flake Root Causes — Windows-EPERM / Spawn-Concurrency

**When:** 2026-06-21 · **Fact:** `P-Z5TZW33W`
**Why:** Prevents false CI negatives; establishes these as environmental quirks, not code defects.

<!-- decision:P-XT9KMHaA -->

## Kiro v0.4.0 Release — Code Complete, Pre-Release Checkpoints

**When:** 2026-06-21 · **Fact:** `P-XT9KMHaA`
**Why:** Ensures IDE and CLI surfaces work together before shipping; user's stated release requirement.

<!-- decision:P-VDNG6QTR -->

## Manual live-test required before releasing — stated as "do the manual check when

**When:** 2026-06-21 · **Fact:** `P-VDNG6QTR`

<!-- decision:P-GaPYPMLa -->

## Structure of cut-gate-kiro.md (Kiro Installation Verification Gate)

**When:** 2026-06-21 · **Fact:** `P-GaPYPMLa`
**Why:** Cut-gate docs are manual verification checklists before release; separate files avoid conditional complexity and keep IDE-specific flows self-contained and readable

<!-- decision:P-GVYE3WV9 -->

## Test-Gate Protocol — Backup Real Paths Instead of Env-Var Sandbox

**When:** 2026-06-21 · **Fact:** `P-GVYE3WV9`
**Why:** Testing real default paths catches real-world bugs that env-var sandboxing hides — the same principle as the "test real input" rule.

<!-- decision:P-W372LWJa -->

## cut-gate-backup-convention

**When:** 2026-06-21 · **Fact:** `P-W372LWJa`
**Why:** Flat backups cluttered the home dir, had no structure, and were easy to fat-finger in cleanup. Central + structured = safe to bulk-manage and AFTER-snapshots are evidence to diff against the next run.

<!-- decision:P-GWQBHT2H -->

## Release Cut Verification Checklist (claude-memory-kit)

**When:** 2026-06-21 · **Fact:** `P-GWQBHT2H`
**Why:** Prevents version-drift bugs and ensures clean release artifacts

<!-- decision:P-6X7CCNCW -->

## Release-Cut Workflow for claude-memory-kit

**When:** 2026-06-21 · **Fact:** `P-6X7CCNCW`
**Why:** This workflow is repeatable and ensures releases are clean (only version and changelog land), verified before committing, and properly tagged for automation.

<!-- decision:P-EVZ5BUYa -->

## Two-Phase Release: Commit/Gate, Then Tag/Publish

**When:** 2026-06-21 · **Fact:** `P-EVZ5BUYa`
**Why:** Safety model — allows full testing and gate checks (§0a/§0b/§0c) before npm goes live; prevents accidental releases

<!-- decision:P-MGMaR2MH -->

## npm pack + Global Install for Artifact Testing (§0b)

**When:** 2026-06-21 · **Fact:** `P-MGMaR2MH`
**Why:** Ensures the production tarball builds correctly and the global CLI binary is the new version before any integration testing.

<!-- decision:P-XULJP7RH -->

## Publish Trigger is Git Tag Push, Not Branch Commit

**When:** 2026-06-21 · **Fact:** `P-XULJP7RH`
**Why:** The safety model depends on decoupling the ordinary commit from the publish trigger. A bundled tag+push risks publishing before all gates have run.

<!-- decision:P-5SACW7MP -->

## Release Workflow Multi-Gate Process (§0a → §0c)

**When:** 2026-06-21 · **Fact:** `P-5SACW7MP`
**Why:** Separating commit and tag ensures no publish occurs until the entire gate sequence succeeds. Clear rollback point if any gate fails.

<!-- decision:P-BEVBLNaP -->

## Removes automatic destructive operations from scripts (Remove-Item) to prevent a

**When:** 2026-06-21 · **Fact:** `P-BEVBLNaP`

<!-- decision:P-L6JWNSFM -->

## Gate/Restore Logic: q_cli_default.json Presence Determines Behavior

**When:** 2026-06-21 · **Fact:** `P-L6JWNSFM`
**Why:** The capture/restore logic is conditional on pre-gate state; the guide needs users to record this fact in NOTES.md

<!-- decision:P-G92GKGUD -->

## PowerShell 5.1 `-Format o` Requirement for ISO 8601 Date Format

**When:** 2026-06-21 · **Fact:** `P-G92GKGUD`
**Why:** The gate's NOTES.md header line was failing due to this ambiguity; documented fix is now in the guide

<!-- decision:P-WSCLNW49 -->

## PowerShell Glob Behavior: Explicit Filename Required for .tgz

**When:** 2026-06-21 · **Fact:** `P-WSCLNW49`
**Why:** Real-run gotcha; scripts relying on `*.tgz` glob fail silently on Windows

<!-- decision:P-YMYUa2QG -->

## HC-1 False-FAIL on Kiro (Recursive Agent-Awareness Bug)

**When:** 2026-06-21 · **Fact:** `P-YMYUa2QG`
**Why:** Skill-review caught a real cut-blocker self-review missed. The gate's output validity depends on doctor being correct across all agent surfaces. Hidden sub-bug within a fix.

<!-- decision:P-PHDPCC2W -->

## Rebuild Artifact After Bug Fix (Without Re-cutting Release)

**When:** 2026-06-21 · **Fact:** `P-PHDPCC2W`
**Why:** Global `cmk` is the pre-fix binary. Bug fixes are content-only; version stays unchanged. The binary must be re-packed and re-installed.

<!-- decision:P-RPaCVQAN -->

## CMK Version Bumping Convention

**When:** 2026-06-21 · **Fact:** `P-RPaCVQAN`
**Why:** Version increments only for feature releases or breaking changes; bug fixes are part of the same release

<!-- decision:P-N3QLT54B -->

## Global Binary Lag After Code Merge

**When:** 2026-06-21 · **Fact:** `P-N3QLT54B`
**Why:** npm maintains a local cache of global packages; merging to main does not trigger automatic re-installation

<!-- decision:P-JZa9NZDF -->

## Rebuilding the Global CMK Binary After Code Changes

**When:** 2026-06-21 · **Fact:** `P-JZa9NZDF`
**Why:** Global npm installs are cached locally; source changes don't propagate to the installed binary

<!-- decision:P-7aNNUU4Z -->

## npm uninstall EBUSY Error with better_sqlite3.node on Rebuild

**When:** 2026-06-21 · **Fact:** `P-7aNNUU4Z`
**Why:** This is a recurring papercut during rebuilds on Windows; users will hit it unpredictably depending on what's running in their session.

<!-- decision:P-453YJ3aW -->

## BOM Handling in Config File Readers

**When:** 2026-06-21 · **Fact:** `P-453YJ3aW`
**Why:** BOM is a recurring, silent, high-impact failure in Windows; cascades across multiple subsystems causing corrupted behavior or false refusals

<!-- decision:P-a4J4QGEC -->

## Verification Gate: Two-Phase Approach

**When:** 2026-06-21 · **Fact:** `P-a4J4QGEC`
**Why:** Decouples fast scaffolding checks from slow live-environment checks; allows gate to flow while environment setup happens

<!-- decision:P-NQYBBLXL -->

## Live-test gate structure and blocker findings

**When:** 2026-06-21 · **Fact:** `P-NQYBBLXL`
**Why:** The live-test gate is the release-validation step that prevents shipping broken builds. Early phases catch input-handling bugs; later phases verify IDE/CLI integration works.

<!-- decision:P-L6DTEQRG -->

## Post-#215 merge workflow (gate continuation)

**When:** 2026-06-21 · **Fact:** `P-L6DTEQRG`
**Why:** This is the planned workflow to complete the live-test gate and verify full IDE/CLI integration before release.

<!-- decision:P-VJL254MX -->

## EBUSY Workaround for Global Package Reinstalls (Native Bindings)

**When:** 2026-06-21 · **Fact:** `P-VJL254MX`
**Why:** Windows prevents overwriting files held open by processes; native Node bindings remain locked by running interpreters even after a process "exits" if the shared object is still referenced

<!-- decision:P-ZWDH5NKZ -->

## Kiro Configuration Structure: AGENTS.md, Not .claude/

**When:** 2026-06-21 · **Fact:** `P-ZWDH5NKZ`
**Why:** claude-memory-kit was generating unnecessary `.claude/` structure for Kiro projects, which Kiro ignores. Proper setup uses AGENTS.md at root only.

<!-- decision:P-PJP9Z4B4 -->

## Install System Dual-Agent Workflows (Cases A–D)

**When:** 2026-06-21 · **Fact:** `P-PJP9Z4B4`
**Why:** These four cases define the practical multi-agent usage patterns users will encounter. The install system must support all of them cleanly without manual workarounds or file litter.

<!-- decision:P-EGMSHW6X -->

## Install System Requirements Matrix (v0.4.0+)

**When:** 2026-06-21 · **Fact:** `P-EGMSHW6X`
**Why:** The install design is additive — Claude Code and Kiro coexist on the same repo. These requirements ensure neither agent's install mutates the other's surfaces and `context/` is treated as immutable.

<!-- decision:P-QURQGMAV -->

## Conservative uninstall scope — managed surfaces only, never `context/`

**When:** 2026-06-21 · **Fact:** `P-QURQGMAV`
**Why:** Minimizes accidental data loss and respects shared-brain architecture. Symmetric design makes tool behavior predictable and safe.

<!-- decision:P-AC75HR2B -->

## Semantic config is shared agent-neutral setting in `context/settings.json`

**When:** 2026-06-21 · **Fact:** `P-AC75HR2B`
**Why:** Semantic recall is a shared-brain feature. One config, one brain, both agents benefit. Idempotent setup prevents accidental loss of capability.

<!-- decision:P-NJW35EEG -->

## Confirms preference for 2-PR approach (PR-1 IDE surfaces, then PR-2 CLI hooks se

**When:** 2026-06-21 · **Fact:** `P-NJW35EEG`

<!-- decision:P-R6WKXMBK -->

## Values code reuse; questions why Kiro integration differs from Claude Code integ

**When:** 2026-06-21 · **Fact:** `P-R6WKXMBK`

<!-- decision:P-U5NUXZAU -->

## v0.4.0 release workflow: `npm run release -- minor` (assistant runs), then user

**When:** 2026-06-21 · **Fact:** `P-U5NUXZAU`

<!-- decision:P-QXMKJZGD -->

## Separate gate files per IDE to avoid conditionals (cut-gate.md for Claude Code,

**When:** 2026-06-21 · **Fact:** `P-QXMKJZGD`

<!-- decision:P-R5DMD4JK -->

## Coverage Gate Fix Workflow

**When:** 2026-06-21 · **Fact:** `P-R5DMD4JK`
**Why:** Systematic approach that addresses missing tests rather than superficial fixes; yields complete coverage.

<!-- decision:P-VXG4XGXP -->

## Log Sink Injection Pattern Across Install/Uninstall

**When:** 2026-06-21 · **Fact:** `P-VXG4XGXP`
**Why:** Allows tests to inject custom logging; maintains behavioral consistency across related tools.

<!-- decision:P-LKBB3BNU -->

## runUninstall Branch Coverage Map

**When:** 2026-06-21 · **Fact:** `P-LKBB3BNU`
**Why:** Missing branch coverage causes gate failure; all paths must be tested for SonarCloud to pass.

<!-- decision:P-9GBJ6NUQ -->

## SonarCloud Coverage Gate Threshold

**When:** 2026-06-21 · **Fact:** `P-9GBJ6NUQ`
**Why:** Hard constraint on the release process; future PRs will fail without adequate coverage.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-ZV4H36YB -->

## Rebuild Global CMK CLI Binary (Release Process)

**When:** 2026-06-22 · **Fact:** `P-ZV4H36YB`
**Why:** The installed global binary is what gate tests validate and what IDE/CLI actually invoke. This rebuild ensures all merged fixes are live before live-test sessions.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-HRFKJPPC -->

## Release script correctly bumps version (0.3.5 → 0.4.0), updates CHANGELOG.md wit

**When:** 2026-06-21 · **Fact:** `P-HRFKJPPC`

<!-- decision:P-XPE6SMR3 -->

## Context files (MEMORY.md, INDEX.md, queues/review.md) are excluded from release

**When:** 2026-06-21 · **Fact:** `P-XPE6SMR3`

<!-- decision:P-YSEUSMB4 -->

## kiro-uninstall-husk-cleanup-followup

**When:** 2026-06-22 · **Fact:** `P-YSEUSMB4`
**Why:** Found dogfooding cmk uninstall --ide kiro on the dev repo (D-189). Empty husks are ugly and could confuse a user into thinking uninstall failed.

<!-- decision:P-Pa6U2LUB -->

## Fixed bugs in task-50-kiro-console-flash branch

**When:** 2026-06-22 · **Fact:** `P-Pa6U2LUB`
**Why:** Uninstall correctness and data-loss prevention are critical; these fixes are verified and ready

<!-- decision:P-X4FPE7CK -->

## Uninstall end-to-end verification results

**When:** 2026-06-22 · **Fact:** `P-X4FPE7CK`
**Why:** Answers the open question "does uninstall actually work?" with live-verified results; D-191/B1 was a real data-loss risk

<!-- decision:P-5HMMCC3F -->

## Code-Path Divergence Pattern in V0.4.0 Bug Fixes

**When:** 2026-06-22 · **Fact:** `P-5HMMCC3F`
**Why:** Indicates asymmetric feature coverage between Code and Kiro implementations. Understanding this pattern informs test strategy and code-review focus for remaining v0.4.0 work.

<!-- decision:P-4M7YD3MK -->

## Artifact rebuild for v0.4.0

**When:** 2026-06-22 · **Fact:** `P-4M7YD3MK`
**Why:** Deploy latest cross-agent fixes (D-185–191) to the global binary before running KH/KC live tests.

<!-- decision:P-ZC7V6VV7 -->

## v0.4.0 final gate — KH/KC live hook-firing tests

**When:** 2026-06-22 · **Fact:** `P-ZC7V6VV7`
**Why:** These test whether hooks actually fire in the real IDE/CLI — cannot be unit-tested.

<!-- decision:P-UERZGMVJ -->

## No Gitignore Changes for Memory System

**When:** 2026-06-22 · **Fact:** `P-UERZGMVJ`
**Why:** User's existing backup redundancy (Google Drive sync) already provides resilience. Adding more git-level logic post-incident introduces complexity without additional safety benefit and erodes trust after a scare.

<!-- decision:P-RE6969aV -->

## Data-Loss Bug Pattern: echo && rm Laundering

**When:** 2026-06-22 · **Fact:** `P-RE6969aV`
**Why:** This specific vulnerability pattern represents a real risk the project has encountered. Future reviews should watch for it.

<!-- decision:P-MJDKT4TT -->

## Guardrail Review Process: Two-Pass + Primary-Source Verification

**When:** 2026-06-22 · **Fact:** `P-MJDKT4TT`
**Why:** The two-pass review with primary-source verification is the project's quality gate for guardrail PRs.

<!-- decision:P-2BNaJT5X -->

## v0.4.0 Remaining Work

**When:** 2026-06-22 · **Fact:** `P-2BNaJT5X`
**Why:** Scopes the remaining v0.4.0 work so future sessions know what's left before release.

<!-- decision:P-4E9E9P42 -->

## Decision Logs and Context Checkpoints

**When:** 2026-06-22 · **Fact:** `P-4E9E9P42`
**Why:** With large codebases, Claude's context is periodically compressed. Decision logs and checkpoint files provide durable recovery points outside the conversation thread.

<!-- decision:P-Ua3U9EYU -->

## Markdown Link Case Sensitivity Issue

**When:** 2026-06-22 · **Fact:** `P-Ua3U9EYU`
**Why:** Linux CI runners enforce case-sensitive path matching, unlike Windows. Documentation links must match actual path case.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-BFMAB3GZ -->

## Windows PowerShell doesn't expand `*` in npm install paths; use explicit filenam

**When:** 2026-06-21 · **Fact:** `P-BFMAB3GZ`

<!-- decision:P-7N6aAPR6 -->

## User expects documentation (guides/CLAUDE.md) to be updated with real-run gotcha

**When:** 2026-06-21 · **Fact:** `P-7N6aAPR6`

<!-- decision:P-2WR6CWJQ -->

## Expressed concern about rebuild errors ("that is alot of errors") — skeptical of

**When:** 2026-06-21 · **Fact:** `P-2WR6CWJQ`

<!-- decision:P-79C7TQYP -->

## user questions why `.claude/` folder exists on kiro-gate — signals it's unexpect

**When:** 2026-06-21 · **Fact:** `P-79C7TQYP`

<!-- decision:P-A3U2RTF9 -->

## Removed old C:\Temp\kiro-gate directory; starting fresh install for Session 1 in

**When:** 2026-06-22 · **Fact:** `P-A3U2RTF9`

<!-- decision:P-ZTPYaJGJ -->

## No gitignore or transcript-commit changes to the memory system going forward.

**When:** 2026-06-22 · **Fact:** `P-ZTPYaJGJ`

<!-- decision:P-a7Wa5MDE -->

## Memory Review Discipline Before Commit

**When:** 2026-06-22 · **Fact:** `P-a7Wa5MDE`
**Why:** Manual review gates ensure auto-extracted facts are accurate, well-formed, and reflect genuine intent — prevents stale or incorrect captures from being recorded as durable knowledge.

<!-- decision:P-a3WZNTCG -->

## Doc-Completeness Validator — Hook Behavior Coverage Gap

**When:** 2026-06-22 · **Fact:** `P-a3WZNTCG`
**Why:** The guardrail shipped in #218 as a hook behavior but was missing from README and CLI docs. The validator only checked verb and tool coverage, not hook coverage, so the gap went undetected.

<!-- decision:P-PHFV2EYC -->

## Guardrail — Hook-Based Design vs. MCP Protection

**When:** 2026-06-22 · **Fact:** `P-PHFV2EYC`
**Why:** Readers and future maintainers may conflate the two protections. Clarity on implementation and scope prevents confusion about which layer is responsible for what.

<!-- decision:P-EYMP4U6F -->

## v0.4.0 Release Workflow — Gate Testing and Tag Push

**When:** 2026-06-22 · **Fact:** `P-EYMP4U6F`
**Why:** Kiro testing needs real IDE/CLI exercise. Tag push is user-controlled public action. Clear boundaries prevent deadlock.

<!-- decision:P-NARQETJP -->

## Kiro-Gate Testing Ritual: §0b (build) → §1 (fresh install) → Session 1

**When:** 2026-06-22 · **Fact:** `P-NARQETJP`
**Why:** This is the canonical gate for verifying the published npm artifact works end-to-end in a real environment before release

<!-- decision:P-3EUEDZV2 -->

## I do not run Kiro; Claude/assistant drives live Kiro sessions in this project

**When:** 2026-06-22 · **Fact:** `P-3EUEDZV2`

<!-- decision:P-SSM3G7RN -->

## Windows NPM EBUSY on Better-SQLite3 Lock — Expected and Harmless

**When:** 2026-06-22 · **Fact:** `P-SSM3G7RN`
**Why:** Gate test (§0b line 60-62) warns of this pattern. Understanding it prevents false alarms on Windows systems and future gate runs.

<!-- decision:P-F6GJP2QT -->

## Claude-Memory-Kit: 5 Surfaces Architecture

**When:** 2026-06-22 · **Fact:** `P-F6GJP2QT`
**Why:** Kit completeness and functionality depend on all 5 surfaces being present, configured, and connected. They form the "surface layer" of validation (distinct from the "3 tiers" depth model).

<!-- decision:P-Y4SVHUKL -->

## Claude-Memory-Kit: Health Check Suite (HC-1 through HC-9)

**When:** 2026-06-22 · **Fact:** `P-Y4SVHUKL`
**Why:** Health checks surface misconfigurations, missing setup, and version skew. They gate readiness and help triage failures.

<!-- decision:P-6GYCY7TY -->

## cmk install: Scaffolding and Wiring

**When:** 2026-06-22 · **Fact:** `P-6GYCY7TY`
**Why:** `cmk install` is the initialization step that scaffolds the kit and wires all integration points. Knowing what it creates is essential for validating completeness (via `cmk doctor`) and troubleshooting wiring issues.

<!-- decision:P-KL9G3TGV -->

## 4-Stage FastAPI Build Plan with Embedded Rules

**When:** 2026-06-22 · **Fact:** `P-KL9G3TGV`
**Why:** Session 1 workflow; captures reasoning in hooks for future sessions' context.

<!-- decision:P-FCN3SZZR -->

## Kiro + CMK Setup Checklist (Pre-Session-1)

**When:** 2026-06-22 · **Fact:** `P-FCN3SZZR`
**Why:** Hooks are file-written but not loaded in IDE until restart; must restart to activate capture layer.

<!-- decision:P-N6WZLTVT -->

## Automated Capture via agentStop Hook

**When:** 2026-06-22 · **Fact:** `P-N6WZLTVT`
**Why:** Core test of automation: hook must work without polluting user utterances with memory syntax

<!-- decision:P-XaK442KW -->

## Kiro Gate Testing Workflow

**When:** 2026-06-22 · **Fact:** `P-XaK442KW`
**Why:** KH1 is the core live validation — ensures memory capture is fully automated via hooks, requiring no manual memory syntax in user utterances

<!-- decision:P-TMFHERHX -->

## User confirmed verbatim sync of gate docs (commit ea1a5a8); established standard

**When:** 2026-06-22 · **Fact:** `P-TMFHERHX`

<!-- decision:P-65NMVNVA -->

## `cmk-guard-memory` is an internal hook binary, not a hand-run command (now clari

**When:** 2026-06-22 · **Fact:** `P-65NMVNVA`

<!-- decision:P-FTBVREBE -->

## Test suite scale: full suite 2223/0 (all pass), stress gate 5/5 (all pass)

**When:** 2026-06-22 · **Fact:** `P-FTBVREBE`

<!-- decision:P-Z27PS9PP -->

## cmake/cmk doctor validation passed all 11 file/config checks; ready for Session

**When:** 2026-06-22 · **Fact:** `P-Z27PS9PP`

<!-- decision:P-7G3EZ5HM -->

## Kiro IDE must be restarted after hook + MCP write to load them; open `C:\Temp\ki

**When:** 2026-06-22 · **Fact:** `P-7G3EZ5HM`

<!-- decision:P-ECF3UXBP -->

## Kiro Hook Trust Quirks & Design Lessons (D-194)

**When:** 2026-06-22 · **Fact:** `P-ECF3UXBP`
**Why:** These quirks represent edge cases + gotchas discovered in live testing; design principles prevent future bugs and security issues.

<!-- decision:P-QB9MR3MK -->

## Kiro Hook Trust System Configuration (D-194)

**When:** 2026-06-22 · **Fact:** `P-QB9MR3MK`
**Why:** Understanding the trust mechanism is essential for configuring Kiro hooks and avoiding "Run / Reject" prompts; the design preserves user customizations and prevents accidental overwrite.

<!-- decision:P-5J3RE6YQ -->

## Post-D194 artifact update workflow for Kiro trust fix verification

**When:** 2026-06-22 · **Fact:** `P-5J3RE6YQ`
**Why:** The Kiro IDE trust system requires kiroAgent.trustedCommands to be pre-configured in .vscode/settings.json. The D-194 fix adds this during cmk install --ide kiro. Pre-D-194 artifacts cannot exercise this behavior.

<!-- decision:P-DM9VMNBE -->

## D-194 Fix Merged to Main (PR #219, commit 96f57c9)

**When:** 2026-06-22 · **Fact:** `P-DM9VMNBE`
**Why:** This fix resolves the Run/Reject blocker. Live verification (KH-trust) requires the new code on disk, not the old artifact.

<!-- decision:P-aSFM9AR2 -->

## skill-md-yaml-colon-space-bug

**When:** 2026-06-22 · **Fact:** `P-aSFM9AR2`
**Why:** Found live in the v0.4.0 cut-gate-kiro (50.M) — 7th cross-agent cut-blocker, the Claude-tolerated/Kiro-strict class. KG4 only checked that Claude-only frontmatter keys were ABSENT, never that the YAML actually parses, so the gate missed it too.

<!-- decision:P-JVBPP36Z -->

## Strict YAML Validation — validate-skill-sources.mjs Enhancement

**When:** 2026-06-23 · **Fact:** `P-JVBPP36Z`
**Why:** Previous gap masked errors for months: Claude Code accepted invalid YAML while Kiro rejected it. This caused D-195. Strict validation upstream prevents cross-tool incompatibilities.

<!-- decision:P-TEBXURXZ -->

## Global `cmk` Artifact Version and Template Sync

**When:** 2026-06-23 · **Fact:** `P-TEBXURXZ`
**Why:** The global artifact and main branch can drift, so a fresh reinstall does not guarantee you get the latest template. This sync lag is especially problematic when testing fixes in a gate or test environment.

<!-- decision:P-GATV2CKW -->

## SKILL.md Description Block Scalar Format

**When:** 2026-06-23 · **Fact:** `P-GATV2CKW`
**Why:** Block scalars are the correct YAML format for multi-line text. Using plain strings breaks strict YAML validation.

<!-- decision:P-WFF3CFAa -->

## YAML Validator Lenient Parser Blind Spot

**When:** 2026-06-23 · **Fact:** `P-WFF3CFAa`
**Why:** Custom parsers can be dangerously lenient and hide real validation bugs, especially risky for YAML where strictness matters.

<!-- decision:P-Z9KHPV72 -->

## CI Lint Check Configuration

**When:** 2026-06-23 · **Fact:** `P-Z9KHPV72`
**Why:** Previously, lint checks existed but were invisible (buried in the full test suite) and used a lenient parser. The new explicit, fast-failing CI job provides immediate feedback and makes lint failures visible in PR status checks.

<!-- decision:P-DTVMCA59 -->

## Precise, Domain-Aware Validators Over Generic Tools

**When:** 2026-06-23 · **Fact:** `P-DTVMCA59`
**Why:** Generic linters do not understand the kit's contracts (SKILL.md structure, Kiro integration); precise, custom validators catch errors that off-the-shelf tools would miss.

<!-- decision:P-WMRV9JB5 -->

## Linting Memory Files Produces Excessive Noise

**When:** 2026-06-23 · **Fact:** `P-WMRV9JB5`
**Why:** Machine-generated memory has formatting constraints different from hand-authored docs. The kit deliberately ships memory templates with formatting that linters would flag. Linting them misidentifies intentional structure as violations.

<!-- decision:P-ECVPNG2R -->

## Markdown/YAML/Spell Linting Disabled in CI by Design

**When:** 2026-06-23 · **Fact:** `P-ECVPNG2R`
**Why:** Documented architectural decision that prevents accidental reintroduction of generic linters. Explains why actionlint + ShellCheck are the right CI additions (they don't touch memory files).

<!-- decision:P-Da3BNKFC -->

## user-ci-lints-memory-files-gap

**When:** 2026-06-23 · **Fact:** `P-Da3BNKFC`
**Why:** Surfaced by the user 2026-06-23: "if our memory files can not be inspected by a linter, then whoever uses this kit is going to have the same problem... at my work CI/CD my linter doesn't do a distinction, and it will flag our files." A real adoption blocker — not hypothetical (the user's own workplace CI). Never raised/decided before (checked DECISION-LOG + research).

<!-- decision:P-9TRG76ST -->

## scratchpad-inline-html-provenance-is-the-lint-outlier

**When:** 2026-06-23 · **Fact:** `P-9TRG76ST`
**Why:** The user pushed: "it cant be that we are so stupidly unique... dont just check their lint config, check their memory output." The actual-file check (6 cloned systems in /c/tmp) proved them right and narrowed the problem: our fact files match the field; only our scratchpad inline-comment provenance diverges + trips linters (MD033 inline-HTML, MD041 first-line-not-H1, MD013 long lines).

<!-- decision:P-7NRWT77M -->

## User has realized that kit users will encounter the same linter-failure problem,

**When:** 2026-06-23 · **Fact:** `P-7NRWT77M`

<!-- decision:P-EPA4NQEK -->

## User's CI linter does not distinguish or exempt context/ files — all files are s

**When:** 2026-06-23 · **Fact:** `P-EPA4NQEK`

<!-- decision:P-H332ZKHJ -->

## memory-lint-portability-research-28-projects

**When:** 2026-06-23 · **Fact:** `P-H332ZKHJ`
**Why:** The user (correctly) pushed back that the earlier conclusion rested on only 6 repos with no web research: "did you check more than 20? deep research on the web? actual code, configs, memory files, outputs?" The full research corrected a real error (MD033 false premise) and grounded the fix in ecosystem-canonical practice + a 28-project primary-source survey.

<!-- decision:P-S43CB7UN -->

## Expects claims substantiated through source inspection (code, configs, memory fi

**When:** 2026-06-23 · **Fact:** `P-S43CB7UN`

<!-- decision:P-VDSWaMS4 -->

## Lint Exemption for Committed Memory Files

**When:** 2026-06-23 · **Fact:** `P-VDSWaMS4`
**Why:** Memory format uses inline comments for per-bullet provenance lifecycle. Markdownlint rules MD041 + MD013 flag these. Disable-directive signals "tool-managed file" (standard in ecosystem) and aligns with how other projects handle generated markdown.

<!-- decision:P-VMVAYVHJ -->

## adr-0009-inline-provenance-was-deliberate-but-lint-cost-unweighed

**When:** 2026-06-23 · **Fact:** `P-VMVAYVHJ`
**Why:** The user challenged the 'we're ahead of the field' framing as rationalization: 'this could also mean we took the wrong turn... they didn't do a convoluted way, they did it how md/yaml/json work.' Reading ADR-0009 showed the truth is BOTH: deliberate trade-off (token budget) AND a cost (lint-portability) the original decision never weighed. Honest reconciliation, not defense.

<!-- decision:P-R7YX4WLU -->

## Challenges the reasoning: "they avoid it" ≠ "we're ahead"; other systems may sim

**When:** 2026-06-23 · **Fact:** `P-R7YX4WLU`

<!-- decision:P-7PAWD7H5 -->

## Prefers solutions aligned with format/system design naturally, not workarounds f

**When:** 2026-06-23 · **Fact:** `P-7PAWD7H5`

<!-- decision:P-CAKHLMRY -->

## scratchpad-provenance-format-RESOLVED-keep-inline

**When:** 2026-06-23 · **Fact:** `P-CAKHLMRY`
**Why:** The user refused to defer the design question (rightly — deferral = it dies, like Task 150) and demanded real research over my framing: 'deep research on best practices, other projects, anything... the original thinking isn't wrong, just how we did it.' The research vindicated the original mechanism AND corrected a real error in our docs (MD033/MD041 don't fire) — so the decision is now evidence-grounded, not opinion.

<!-- decision:P-GAPEQDQ3 -->

## real-markdownlint-output-on-memory-MD007-not-MD013

**When:** 2026-06-23 · **Fact:** `P-GAPEQDQ3`
**Why:** The user insisted on checking actual outputs over theory ('check their memory output... actual code'). Running real markdownlint proved the provenance comment trips MD007 (indentation), NOT the MD013/MD033/MD041 the entire thread (and CLAUDE.md, and the research agents) assumed. Ground truth beats convergent theory.

<!-- decision:P-Q3FHXP5B -->

## Memory Format Linting Fix (MD007)

**When:** 2026-06-23 · **Fact:** `P-Q3FHXP5B`
**Why:** Original decision (ADR-0009) was made on incomplete information. Real linter output differs from theory. This fix uses linter's intended mechanism (per-directory config), not a workaround.

<!-- decision:P-9LA7PNVS -->

## User explicitly states: decide design questions now, not later. Deferral leads t

**When:** 2026-06-23 · **Fact:** `P-9LA7PNVS`

<!-- decision:P-AQEa5CEM -->

## md007-is-model-output-indent-not-provenance-format

**When:** 2026-06-23 · **Fact:** `P-AQEa5CEM`
**Why:** The user pushed back on 'just ignore all memory files = the fix'. Reading the actual MD007 lines proved the provenance format is innocent — the errors are auto-extract model output (2-space sublists, bare URLs). This reframes the fix from 'exempt our format' to 'either relax prose-rules for data files OR make the model output lint-clean'.

<!-- decision:P-BaBYLP4N -->

## Fix Auto-Extract Output Quality, Not Just Lint Config

**When:** 2026-06-23 · **Fact:** `P-BaBYLP4N`
**Why:** The memory files don't fail because of the kit format; they fail because auto-extract prose is unpolished. Fixing the tool's output quality is more principled than configuring away linter rules.

<!-- decision:P-ER7TUY96 -->

## User rejected "ignore all memory files" as a valid fix — confirms that blanket d

**When:** 2026-06-23 · **Fact:** `P-ER7TUY96`

<!-- decision:P-L6WGWP39 -->

## User wants Super-Linter run on claude-memory-kit repo with all rules ON, no supp

**When:** 2026-06-23 · **Fact:** `P-L6WGWP39`

<!-- decision:P-U2AD3CX4 -->

## Super-Linter Ground-Truth Validation

**When:** 2026-06-23 · **Fact:** `P-U2AD3CX4`
**Why:** Actual linter output is definitive; theorizing without empirical data is incomplete

<!-- decision:P-6aN7PGVG -->

## super-linter-real-run-1058-md-findings-context-included

**When:** 2026-06-23 · **Fact:** `P-6aN7PGVG`
**Why:** The user demanded I run the REAL super-linter product instead of theorizing ('why are you theorizing... you can check docs and do live checks'). The run proved: code/workflows/yaml/json are clean (actionlint etc. find nothing), but markdown has 1058 findings incl. 824 in context/ — dominated by MD022 (842) from the compact heading style in both docs and committed memory. The provenance comments are innocent; the heading/list/URL STYLE is the real lint surface.

<!-- decision:P-Y77aBUFL -->

## Super-Linter Results and `.markdownlint.json` Fix

**When:** 2026-06-23 · **Fact:** `P-Y77aBUFL`
**Why:** Real tool evidence proves memory tier markdown collides with default rules. Users get hundreds of lint warnings immediately on kit install. A shipped `.markdownlint.json` unblocks adoption.

<!-- decision:P-MY52BNZ4 -->

## lint-clean-memory-output-plan-and-progress

**When:** 2026-06-23 · **Fact:** `P-MY52BNZ4`
**Why:** The user rejected 'relax the cosmetic rules' in favor of 'just fix it — emit correct markdown, add rules to the skill so the AI writes md the right way.' Right call: fixing at source means no config to ship, no exemption to explain, and the memory is genuinely clean markdown like every other system. Captured durably because the user explicitly warned this kind of task gets deferred-and-lost (like Task 150) — it must not.

<!-- decision:P-F5LRAPF3 -->

## lint-clean-full-process-directive

**When:** 2026-06-23 · **Fact:** `P-F5LRAPF3`
**Why:** The user rejected both 'relax the rules' and a rushed multi-file patch; wants the kit's own disciplined process (plan→design→tasks→TDD→implement→test→review) on the full 38-file format-contract surface, done locally due to flaky internet.

<!-- decision:P-HVLU2aLG -->

## read-side-audit-blank-in-pair-catastrophic-search-bug

**When:** 2026-06-23 · **Fact:** `P-HVLU2aLG`
**Why:** The user demanded the FULL surface (write + read + add/update/remove). The read-side audit proved the safe fix (blank-around-headings) is safe everywhere, the dangerous changes (blank-in-bullet-pair, bullet reindent) must NEVER happen, and surfaced a pre-existing LIVE bug (search.mjs retraction detection broken since DECISIONS.md went to ##). This is the safety map the whole reformat depends on.

<!-- decision:P-TR9J39LM -->

## Stress Test Gating Rule for PR Approval

**When:** 2026-06-23 · **Fact:** `P-TR9J39LM`
**Why:** Stress testing is critical for regression prevention. The jitter exception rule prevents random failures in unrelated code paths from incorrectly blocking PRs while ensuring real regressions are caught.

<!-- decision:P-4WTWMTaK -->

## stress-flake-self-induced-load-not-regression

**When:** 2026-06-23 · **Fact:** `P-4WTWMTaK`
**Why:** During Task 164's pre-PR stress gate, two 4/5 runs with different unrelated timing tests looked alarming but were machine-load artifacts from running stress alongside other background work — not a code regression. Worth recording so a future session doesn't misread a load-flake as a real concurrency bug (or waste the two-consecutive-clears clause on the wrong failure class).

<!-- decision:P-EaGXETZL -->

## v0.4.0 Local Installation Workflow

**When:** 2026-06-23 · **Fact:** `P-EaGXETZL`
**Why:** v0.4.0 bundles all durable fixes (SKILL.md valid YAML, Kiro hooks pre-trusted, memory lint-clean). Local install confirms artifact before publishing.

<!-- decision:P-4HZAJ9X9 -->

## Backup Strategy for Kiro Gate Testing

**When:** 2026-06-23 · **Fact:** `P-4HZAJ9X9`
**Why:** The Kiro gate test requires a clean environment without existing user config, but the real config and credentials must remain restorable. This approach enables both safely.

<!-- decision:P-7MZ3G4EN -->

## §1 Gate Run Verification — Expected Health Checks and Session 1 Handoff

**When:** 2026-06-23 · **Fact:** `P-7MZ3G4EN`
**Why:** The gate run proved all three blockers are fixed and working (D-195 SKILL.md valid, D-194 trusted-commands, Task 164 memory lint-clean). Silent hook firing is the critical confirmation before Session 1 proceeds.

<!-- decision:P-EJFDYMR9 -->

## task-164-followup-claude-md-template-md022

**When:** 2026-06-23 · **Fact:** `P-EJFDYMR9`
**Why:** Found while running the regular cut-gate (cut-gate18) on the post-Task-164 artifact. Task 164.8 made the 6 MEMORY/SOUL/USER/HABITS/LESSONS/INDEX templates lint-clean but didn't include CLAUDE.md.template (a Claude-Code instruction file, not a memory tier). The regression guard (checkTemplateLintClean) also doesn't cover it.

<!-- decision:P-RBRAJMPX -->

## kiro-mcp-autoapprove-missing-cut-blocker

**When:** 2026-06-23 · **Fact:** `P-RBRAJMPX`
**Why:** Found live by the user in Kiro Session 1: hooks auto-run (D-194 works) but MCP tool calls (mk_remember etc.) still prompt Reject/Trust/Run because Kiro has a SEPARATE trust gate for MCP tools vs shell hooks. The kit never wired it. User clicked Trust manually and asked to add it to the template.

<!-- decision:P-NFH69QSF -->

## MCP Tool Auto-Approve (D-196) Merged But Requires Artifact Rebuild for Live Sessions

**When:** 2026-06-23 · **Fact:** `P-NFH69QSF`
**Why:** D-196 is the 8th cross-agent gate cut-blocker. Live session proved 4 prior fixes work. MCP-tool approval test verifies config-level fix—final piece before shipping. Deferring rebuild keeps Session 1 feedback loop tight.

<!-- decision:P-2B64YN7R -->

## resume-v0-4-0-kiro-gate-8-fixes-shipped

**When:** 2026-06-23 · **Fact:** `P-2B64YN7R`
**Why:** Context hit 2% — checkpoint so the next session resumes the v0.4.0 Kiro live-gate exactly here without re-deriving. All 8 cross-agent cut-blockers found+fixed this session are merged; only the live Kiro session + tag-push remain (both user-driven).

<!-- decision:P-FD93HDaQ -->

## kiro-live-test-session1-d194-d196-proven

**When:** 2026-06-23 · **Fact:** `P-FD93HDaQ`
**Why:** The cut-gate-kiro 50.M live test — the surfaces unit tests can't reach. Session 1 on the post-D-196 artifact proved the hooks AND the MCP tools both run prompt-free by config (no manual Trust clicks), which is the whole point of D-194+D-196. Last session M1 prompted; this session it's silent.

<!-- decision:P-V63LVV3H -->

## kiro-session1-complete-wedge-proven-live

**When:** 2026-06-23 · **Fact:** `P-V63LVV3H`
**Why:** Session 1 of the cut-gate-kiro live test (50.M). Beyond the D-194/D-196 prompt-free proofs, it proved the WEDGE (cross-project promotion via mk_lessons_promote), rich linked facts, and memory-aware conflict-detection all work in a REAL Kiro session — the deep features unit tests can't reach.

<!-- decision:P-3G3D55C9 -->

## Kiro CLI V3 Trust-Model Incompatibility (V2 Config Format)

**When:** 2026-06-23 · **Fact:** `P-3G3D55C9`
**Why:** This is a version transition issue as Kiro shipped V3 early-access mid-flight. The kit's terminal surface remains functional, but version-specific behavior requires updating config. KC1 and KC2 gate proofs confirm the kit's core injection and memory recall work; V3 CLI just needs config format migration.

<!-- decision:P-XPYaGJU4 -->

## kiro-cli-allowedtools-doc-correct-but-still-prompts

**When:** 2026-06-23 · **Fact:** `P-XPYaGJU4`
**Why:** Corrects my earlier WRONG 'V3' finding (the banner was an ad; kiro-cli is 2.8.1). The real gap: allowedTools:@cmk is doc-verified-correct format yet the MCP tool still prompts in kiro-cli, while the IDE autoApprove works. A genuine kiro-cli MCP-trust gap to diagnose, but not a v0.4.0 blocker.

<!-- decision:P-GMNRDK7C -->

## kg-guard-kiro-cli-two-gates-rm-rewritten-to-removeitem

**When:** 2026-06-23 · **Fact:** `P-GMNRDK7C`
**Why:** The live KG-guard test (D-192/193 in kiro-cli). Surfaced that (a) kiro-cli has its OWN shell-approval gate before our preToolUse guard, and (b) the model rewrites rm -rf → Remove-Item on Windows — which our guard's dual-pattern coverage already anticipates. Awaiting the post-approval result to confirm our guard fires.

<!-- decision:P-JHJXFDBJ -->

## kg-guard-FAILED-matcher-pipe-alternation-not-literal

**When:** 2026-06-23 · **Fact:** `P-JHJXFDBJ`
**Why:** The live KG-guard test FAILED — our delete-guardrail let a Remove-Item delete context/sessions in kiro-cli. Root-caused to the preToolUse matcher being a pipe-alternation ("execute_bash|executeBash|shell") when kiro-cli matchers are LITERAL strings (no alternation) — so it matched nothing and never fired. Exactly the D-193 I3 risk. A real v0.4.0 cut-blocker on a headline safety feature.

<!-- decision:P-HaQ9X72G -->

## kiro-cli PreToolUse Matcher Syntax (Literal Strings Only)

**When:** 2026-06-23 · **Fact:** `P-HaQ9X72G`
**Why:** PR #224 discovered this during guardrail testing; the bug went undetected until explicitly tested, confirming it was a critical cut-blocker.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-9UJBANXP -->

## Should run the actual tool (ground truth) FIRST, rather than theorizing beforeha

**When:** 2026-06-23 · **Fact:** `P-9UJBANXP`

<!-- decision:P-PCW3J9PX -->

## Prefers to continue pushing through complex multi-step work rather than pausing

**When:** 2026-06-23 · **Fact:** `P-PCW3J9PX`

<!-- decision:P-GZG5U2PN -->

## Standard gate procedure includes `cmk install --with-semantic` to enable semanti

**When:** 2026-06-23 · **Fact:** `P-GZG5U2PN`

<!-- decision:P-GE2TD65T -->

## User manually approved MCP tool by clicking "always add it" button (workaround f

**When:** 2026-06-23 · **Fact:** `P-GE2TD65T`

<!-- decision:P-7TMEXMA3 -->

## User is not on Kiro CLI V3; user is on kiro-cli 2.8.1 (the V3 banner was just an

**When:** 2026-06-23 · **Fact:** `P-7TMEXMA3`

<!-- decision:P-WEMBP2VE -->

## executed the permission test to validate guardrail behavior

**When:** 2026-06-23 · **Fact:** `P-WEMBP2VE`

<!-- decision:P-5GY3KT29 -->

## Expects tool recommendations backed by verification of actual tool behavior, not

**When:** 2026-06-23 · **Fact:** `P-5GY3KT29`

<!-- decision:P-Ra5D4F96 -->

## Actual linter output is MD007 (not assumed MD013/MD033/MD041); fix: committed co

**When:** 2026-06-23 · **Fact:** `P-Ra5D4F96`

<!-- decision:P-Z3BU5T69 -->

## User identified genuine cost (lint-portability) not originally weighed in inline

**When:** 2026-06-23 · **Fact:** `P-Z3BU5T69`

<!-- decision:P-53VHE5Z6 -->

## PR #224 opened with guardrail fix (matcher syntax corrected from pipe-alternatio

**When:** 2026-06-23 · **Fact:** `P-53VHE5Z6`

<!-- decision:P-AD7CZaKC -->

## Uses `failure#` naming convention for failed experiment directories — renamed ki

**When:** 2026-06-23 · **Fact:** `P-AD7CZaKC`

<!-- decision:P-C6YZVTNX -->

## Dogfood Memory Architecture — Session Recall vs. Authoritative Docs

**When:** 2026-06-23 · **Fact:** `P-C6YZVTNX`
**Why:** This separation avoids polluting the authoritative record with session scaffolding while preserving the option to capture valuable session context. Manual commits keep signal-to-noise ratio high in the repo.

<!-- decision:P-AAXE5QX3 -->

## D-197 Delete-Guardrail Matcher Fix (PR #224, Commit 0dae3f3)

**When:** 2026-06-23 · **Fact:** `P-AAXE5QX3`
**Why:** The old matcher pattern failed to consistently intercept delete commands. The wildcard matcher is more robust and catches all deletion attempts.

<!-- decision:P-CJ556YPJ -->

## D-197 End-to-End Live Re-test Workflow

**When:** 2026-06-23 · **Fact:** `P-CJ556YPJ`
**Why:** This workflow is the only proof that the guard fix works live in the real Kiro environment. Unit tests pass, but this test confirms the config, artifact, and hook integration all work end-to-end.

<!-- decision:P-G39LPLQG -->

## kg-guard-retest-failed-was-stale-artifact-not-fix

**When:** 2026-06-23 · **Fact:** `P-G39LPLQG`
**Why:** Prevents misreading the D-197 re-test: the matcher '*' fix is correct on main, but the live test ran the STALE pre-merge installed cmk (old pipe-string matcher), so it failed. Not a fix failure — a deploy gap. The live-test-current-repo-code rule applied to the install artifact.

<!-- decision:P-GHNBU9J4 -->

## Live KG-guard Config Location and Verification

**When:** 2026-06-23 · **Fact:** `P-GHNBU9J4`
**Why:** KG-guard reads this live config, not the source code. An outdated config means the test exercises old behavior even if the code was fixed.

<!-- decision:P-ESQMFH5J -->

## Testing Workflow for claude-memory-kit Fixes

**When:** 2026-06-23 · **Fact:** `P-ESQMFH5J`
**Why:** Until you rebuild the tgz after a merge, every live test runs pre-merge code. Testing against a stale global install will fail even if the fix is correct in the repository.

<!-- decision:P-KZ5YCCGB -->

## guard-code-proven-correct-ps-pipe-exit0-was-artifact

**When:** 2026-06-23 · **Fact:** `P-KZ5YCCGB`
**Why:** Corrects a scary mid-diagnosis false alarm: a PowerShell-pipe exit-0 made it look like the delete-guard logic was broken even in the current build. It is NOT — proven 3 ways (in-process block, file-redirect bin block exit 2, dev-repo guard blocking my own commands live). The live KG-guard failure was purely the stale installed artifact (old pipe-string matcher), which the merged '*' fix + a rebuild resolves.

<!-- decision:P-36CEKTXX -->

## better_sqlite3 EPERM Cleanup Warning

**When:** 2026-06-23 · **Fact:** `P-36CEKTXX`
**Why:** This warning is expected/ignorable—failure during cleanup doesn't mean the build or installation failed. Knowing this prevents unnecessary troubleshooting or reinstallation attempts in future testing cycles.

<!-- decision:P-2J2UHV2L -->

## kg-guard-still-fails-with-star-matcher-hook-not-firing-or-env-payload

**When:** 2026-06-23 · **Fact:** `P-2J2UHV2L`
**Why:** The '*' matcher fix (D-197) did NOT make KG-guard pass — matcher confirmed '*' live, bin proven to block, yet kiro-cli still deleted memory. Root cause is now genuinely uncertain between (H1) '*' not honored → use literal 'execute_bash', and (H2) kiro-cli 2.8.1 passes the payload via _HOOK_EVENT env var not stdin → our stdin-reading bin fail-opens. Must instrument to decide, not guess. The guardrail is a headline safety feature still broken in kiro-cli.

<!-- decision:P-LTKSACUC -->

## KG-guard kiro-cli failure — diagnosis plan (D-197 incomplete)

**When:** 2026-06-23 · **Fact:** `P-LTKSACUC`
**Why:** Root cause unknown; hypothesis-driven diagnosis settles the issue in one test cycle vs. continued guessing.

<!-- decision:P-YXPPE2Z7 -->

## TRUE-root-cause-kiro-cli-agent-config-wrong-location-no-hooks-fire

**When:** 2026-06-23 · **Fact:** `P-YXPPE2Z7`
**Why:** The instrumented probe proved NO hooks fire in kiro-cli, and `kiro-cli agent list` showed the active agent is the built-in 'kiro_default' from ~/.kiro/agents/ — while the kit writes q_cli_default.json to the OLD ~/.aws/amazonq/cli-agents/ location that 2.8.1 ignores. This supersedes D-197's incomplete 'matcher' root cause: the real bug is the config LOCATION + default-agent resolution, which is why the guard, agentSpawn, and stop hooks all silently never ran. A real v0.4.0 cut-blocker for the kiro-cli surface.

<!-- decision:P-EC97GY7E -->

## d198-fix-built-kiro-dir-location-open-file-uri-resolution-question

**When:** 2026-06-24 · **Fact:** `P-EC97GY7E`
**Why:** The real root-cause fix (D-198: agent config to ~/.kiro/agents/ + cli.json default registration) is built, unit-green, and SCHEMA-validated against real kiro-cli (which caught the includeMcpJson dup + the managedBy rejection). But a runtime path-resolution question remains: kiro-cli resolves file:// resources relative to the agent-file dir, which would break our project-root AGENTS.md/steering refs — must verify before claiming inject works.

<!-- decision:P-XNG4DaB2 -->

## kiro-cli-rejects-bom-in-agent-config-ps-convertto-json-adds-it

**When:** 2026-06-24 · **Fact:** `P-XNG4DaB2`
**Why:** A BOM from PowerShell ConvertTo-Json broke the live cmk agent ('invalid agent config' → fell back to kiro_default), looking like the D-198 fix failed when it hadn't. kiro-cli's own config reader is NOT BOM-tolerant (the inverse of the kit's D-187 read-tolerance). The kit writes clean UTF-8 so production is unaffected; only hand-editing via PowerShell injects the BOM.

<!-- decision:P-9DYNAHaZ -->

## Kiro-CLI Agent Configuration and Verification

**When:** 2026-06-24 · **Fact:** `P-9DYNAHaZ`
**Why:** Configuration location and verification approach are essential for kiro-cli agent setup debugging and fix validation

<!-- decision:P-WZMQDPUU -->

## D-198 Fix — agentSpawn Hook Now Fires

**When:** 2026-06-24 · **Fact:** `P-WZMQDPUU`
**Why:** Confirms the fix resolved the "agent cmk not found" issue; agent resolution now works correctly

<!-- decision:P-RVCKGMZV -->

## Hook Payload Delivery — stdin, Not Environment

**When:** 2026-06-24 · **Fact:** `P-RVCKGMZV`
**Why:** Clarifies payload delivery mechanism; guides how to capture/parse hooks in probes or guards

<!-- decision:P-BKZ97QGE -->

## d198-proven-agentspawn-fires-but-pretooluse-not-on-2.9.0-execute-command-rename

**When:** 2026-06-24 · **Fact:** `P-BKZ97QGE`
**Why:** D-198 (the location fix) is PROVEN correct — agentSpawn fires, cmk is the resolved default. But on kiro-cli 2.9.0 the shell tool was renamed execute_bash→execute_command and preToolUse did not fire even with matcher '*'; the docs still say execute_bash so they lag the binary. The guardrail leg's live status on 2.9.0 is the last open question; agentSpawn/inject/capture work.

<!-- decision:P-6JXPBCLV -->

## kiro-cli 2.9.0 Tool Renaming and preToolUse Matcher Configuration

**When:** 2026-06-24 · **Fact:** `P-6JXPBCLV`
**Why:** The hook location fix (D-198) was confirmed correct, but hooks weren't firing because the matcher didn't align with the actual 2.9.0 tool name. This explains the discrepancy between docs and runtime behavior.

<!-- decision:P-WS9FXPZK -->

## FINAL-kiro-cli-v3-redesigned-hooks-pretooluse-superseded-by-permissions-yaml

**When:** 2026-06-24 · **Fact:** `P-WS9FXPZK`
**Why:** Definitive: the kiro-cli guardrail can't work via preToolUse on 2.9.0 because V3 redesigned hooks (breaking change: standalone .kiro/hooks/*.json + PascalCase triggers + permissions.yaml for tool-blocking). Our V2 embedded preToolUse is unsupported for blocking there. BUT D-198's location fix is proven correct — agentSpawn/stop fire, so capture+inject (the core memory value) work on V3. D-198 ships; the guardrail-on-V3 is a separate follow-up.

<!-- decision:P-U5QSXFNa -->

## d198-shipped-pr225-kiro-cli-capture-inject-proven-live

**When:** 2026-06-24 · **Fact:** `P-U5QSXFNa`
**Why:** D-198 (the real root-cause fix for kiro-cli hooks not firing) is built, two-pass-reviewed, and PROVEN live (agentSpawn fires, cmk is the resolved default). Capture+inject — the core automatic-memory value — now work on kiro-cli. Shipped to PR #225. The guardrail-on-V3 gap is consciously deferred to Task 166 with Kiro's native fallback documented honestly.

<!-- decision:P-NSAE3H4P -->

## Agent capture/inject proven live across Claude Code, Kiro IDE, and kiro-cli

**When:** 2026-06-24 · **Fact:** `P-NSAE3H4P`
**Why:** Confirms core functionality works; unblocks v0.4.0 finalization after E1 (cold-open) and KU1/KU2 (uninstall flows).

<!-- decision:P-LZZa6KWT -->

## kiro-cli agent config reads from ~/.kiro/agents/ (not ~/.aws/amazonq/cli-agents/)

**When:** 2026-06-24 · **Fact:** `P-LZZa6KWT`
**Why:** Root cause of "cmk agent not firing in kiro-cli" despite D-197's logic fix being correct; explains the "dead file" symptom. Critical for debugging agent-not-found issues going forward.

<!-- decision:P-FM4YBQNC -->

## Kiro V3 hooks redesigned; first-class delete-guard fallback to shell-approval

**When:** 2026-06-24 · **Fact:** `P-FM4YBQNC`
**Why:** Breaking platform change; scopes v0.4.0 functionality and expectation. Honest limitation worth documenting rather than shipping broken behavior.

<!-- decision:P-CSJNFQaK -->

## User wants direct, hands-on verification before accepting completion — "i didnt

**When:** 2026-06-24 · **Fact:** `P-CSJNFQaK`

<!-- decision:P-2SPaSRR7 -->

## Gate Guides as Standalone Documentation Siblings

**When:** 2026-06-24 · **Fact:** `P-2SPaSRR7`
**Why:** Modularity ensures users can follow ONE gate variant without needing to understand or reference the others. Each guide is a complete, independent resource.

<!-- decision:P-2XR9VMNM -->

## kiro-cli Agent Configuration and Debugging Techniques

**When:** 2026-06-24 · **Fact:** `P-2XR9VMNM`
**Why:** Each check/technique corresponds to a real bug discovered this session (D-198, BOM corruption, location misdiagnosis). Baking them into the gate prevents re-discovery in future debugging.

<!-- decision:P-A26UKEUT -->

## Prefers gate guides as standalone siblings without cross-references between Clau

**When:** 2026-06-24 · **Fact:** `P-A26UKEUT`

<!-- decision:P-THB4NE6Z -->

## EBUSY Lock on better_sqlite3.node During Global Install

**When:** 2026-06-24 · **Fact:** `P-THB4NE6Z`
**Why:** Prior session's install "succeeded" but left stale code due to EBUSY; npm output is misleading. The verify check prevents repeating this silent failure.

<!-- decision:P-ETG53B43 -->

## npm install works with Claude Code open in this repo

**When:** 2026-06-24 · **Fact:** `P-ETG53B43`
**Why:** User feedback + repeated successful pattern validate this as safe; file-locking concerns do not apply here

<!-- decision:P-Q7YRKUF6 -->

## User always reinstalls npm while Claude Code is open; established workflow that

**When:** 2026-06-24 · **Fact:** `P-Q7YRKUF6`

<!-- decision:P-9LPPCKBT -->

## kiro-cli-hook-cmd-exe-popup-window-flash-ux-bug

**When:** 2026-06-24 · **Fact:** `P-9LPPCKBT`
**Why:** The clean gate surfaced a real UX bug: kiro-cli hooks flash a visible cmd.exe console window every fire on Windows because the command is `cmd.exe /c cmk hook`. The cmd.exe wrapper exists for the IDE's WSL hop but is shared with the CLI agent, which may not need it. Annoying for every kiro-cli user on Windows.

<!-- decision:P-G3VXJKVP -->

## User encountered annoying popup when running kiro-cli and wants it removed

**When:** 2026-06-24 · **Fact:** `P-G3VXJKVP`

<!-- decision:P-CGEE2XSH -->

## kiro-cli-popup-real-cause-cmk-is-npm-shim-not-exe-mcp-and-hook-spawns-flash

**When:** 2026-06-24 · **Fact:** `P-CGEE2XSH`
**Why:** The popup is NOT just the hook's cmd.exe/c (removing it didn't help). The real cause: cmk is an npm .ps1/.cmd shim (no native cmk.exe), so every kiro-cli launch of cmk — the MCP server AND hooks — gets shell-wrapped by Windows and flashes a console window (both cmd.exe + PowerShell). A Windows-shim interaction, needs a real fix (hidden-window shim, native exe, or a kiro-cli setting), not a config tweak.

<!-- decision:P-FK5RXGDE -->

## kiro-cli spawns MCP in cmd.exe wrapper; Claude Code spawns headless

**When:** 2026-06-24 · **Fact:** `P-FK5RXGDE`
**Why:** Understanding the spawn mechanism directs the fix strategy — it's a launcher integration problem, not an MCP problem

<!-- decision:P-44DQF4BX -->

## node-direct MCP invocation workaround — applied but unvalidated in kiro-cli UI

**When:** 2026-06-24 · **Fact:** `P-44DQF4BX`
**Why:** Attempting to eliminate the cmd.exe window on startup without modifying kiro-cli's launcher

<!-- decision:P-UAFX77EF -->

## kiro-cli-popup-fix-is-task81-node-direct-windowshide-pattern-already-in-kit

**When:** 2026-06-24 · **Fact:** `P-UAFX77EF`
**Why:** Corrects my wrong claim that Claude Code never had the popup. It DID — Task 81 fixed it with node-direct (process.execPath + .mjs path, never the cmk shim) + windowsHide. The kiro-cli MCP + hook popups are the SAME root cause (cmk is an npm shim Windows wraps in cmd.exe) and take the SAME established fix. This makes the kiro-cli popup a clean code fix following the kit's own proven pattern, not a new invention.

<!-- decision:P-GELYMC3Q -->

## kiro-cli-mcp-popup-is-6th-cross-agent-instance-mcp-command-never-node-direct

**When:** 2026-06-24 · **Fact:** `P-GELYMC3Q`
**Why:** The docs trail (Task 81 + D-190) shows the popup class was fixed twice — but only for the lazy-compress detached spawn, NEVER for the MCP server registration (still command:'cmk' in install-agent.mjs + install-kiro.mjs). Claude Code tolerates command:'cmk' (headless spawn); kiro-cli wraps it in cmd.exe → the persistent window. This is the 6th instance of the documented Claude-tolerated/Kiro-breaks cross-agent class, with the SAME established node-direct fix.

<!-- decision:P-J7QS7HRQ -->

## Fixed the same cmd.exe window issue across Claude Code CLI and MCP components, c

**When:** 2026-06-24 · **Fact:** `P-J7QS7HRQ`

<!-- decision:P-U7UUPTA2 -->

## Kiro-CLI MCP Registration Configuration Gap

**When:** 2026-06-24 · **Fact:** `P-U7UUPTA2`
**Why:** Without conversion, kiro-cli shows persistent cmd.exe window on spawn. Claude Code avoids it by spawning headless, which masks the gap in headless contexts.

<!-- decision:P-C3RVE6LD -->

## Node-Direct Process Spawning To Prevent Cmd.exe Windows

**When:** 2026-06-24 · **Fact:** `P-C3RVE6LD`
**Why:** Cmd.exe wrappers create visible persistent windows on Windows, breaking UX—especially critical for CLI tools. Claude Code success validates the approach.

<!-- decision:P-BCFL24PC -->

## Prefers direct, action-oriented responses; dislikes verbose context re-hashing—w

**When:** 2026-06-24 · **Fact:** `P-BCFL24PC`

<!-- decision:P-V2CQQLQQ -->

## FINAL-mcp-popup-is-kiro-cli-wraps-all-mcp-in-cmd-exe-not-kit-bug

**When:** 2026-06-24 · **Fact:** `P-V2CQQLQQ`
**Why:** Corrects my earlier '6th cross-agent instance / node-direct fix' framing — that was WRONG. Live proof: kiro-cli wraps EVERY stdio MCP server in cmd.exe /C (the user's mcp-remote + mcp-server-memory get it too, not just cmk), so the console window is kiro-cli's OWN launch mechanism, not controllable by the kit's command string (node-direct didn't help). It's a kiro-cli-on-Windows cosmetic affecting all MCP servers, not a kit defect — don't block v0.4.0 on it.

<!-- decision:P-XXHHNAMD -->

## AWS guardrail sample repo as reference for task 166 investigation

**When:** 2026-06-24 · **Fact:** `P-XXHHNAMD`
**Why:** The project's V3 guardrail hooks may have format issues or be broken on 2.9.0. AWS's official working example provides a baseline for comparison to identify root cause.

<!-- decision:P-ZDBaD7AT -->

## kiro-cli wraps MCP servers in cmd.exe (undocumented platform behavior)

**When:** 2026-06-24 · **Fact:** `P-ZDBaD7AT`
**Why:** Users and developers may initially interpret the cmd.exe popup as a bug or misconfiguration issue. Identifying it as inherent platform behavior prevents wasted investigation and explains why configuration-level fixes don't exist.

<!-- decision:P-GRTXENC5 -->

## CUT-BLOCKER-mcp-mk-remember-silent-dataloss-kiro-cli-claude-project-dir-only

**When:** 2026-06-24 · **Fact:** `P-GRTXENC5`
**Why:** The clean gate surfaced a SILENT DATA-LOSS bug: mk_remember in kiro-cli says 'saved' but nothing persists to the project, because the MCP server resolves projectRoot from CLAUDE_PROJECT_DIR (Claude-Code-only) and falls back to process.cwd() (kiro-cli's cwd, not the project). The 6th instance of the Claude-tolerated/Kiro-breaks cross-agent class, and the worst kind. A v0.4.0 cut-blocker — the core capture path silently fails in kiro-cli.

<!-- decision:P-RJ2QDBCQ -->

## mk-remember-kiro-cli-fix-cmk-project-dir-env-project-local-agent

**When:** 2026-06-24 · **Fact:** `P-RJ2QDBCQ`
**Why:** Confirmed the mk_remember silent-data-loss root cause (kiro launches MCP from non-project cwd; CLAUDE_PROJECT_DIR is Claude-only) and the fix direction: the agent mcpServers entry supports `env` (not cwd), and a project-local kiro agent can bake env:{CMK_PROJECT_DIR:<absPath>} which mcp serve must honor. A v0.4.0 cut-blocker — capture must persist in kiro-cli.

<!-- decision:P-WQ4TBSYG -->

## mk-remember-fix-self-review-agent-config-inline-mcp-composition-risk

**When:** 2026-06-24 · **Fact:** `P-WQ4TBSYG`
**Why:** Self-review caught that the kiro-cli agent-config has its OWN env-less inline mcpServers.cmk entry (global, can't bake a path). The docs are ambiguous on whether kiro uses the agent's entry or the project mcp.json (which has the env). So the fix is proven for the project-mcp.json path but the agent-config composition is unverified — must live-test which entry kiro launches before claiming the cut-blocker is fully closed.

<!-- decision:P-9APUUDZY -->

## kiro-cli MCP Server Source Consolidation Strategy

**When:** 2026-06-24 · **Fact:** `P-9APUUDZY`
**Why:** Ambiguous MCP source selection creates composition bugs that static tests cannot detect. Only live integration testing caught the silent data-loss risk. Consolidating eliminates ambiguity and makes the system predictable.

<!-- decision:P-YQ4CN37B -->

## Global CLI Rebuild and Reinstall Workflow

**When:** 2026-06-24 · **Fact:** `P-YQ4CN37B`
**Why:** Needed to test CLI changes without npm publish. The uninstall+install cycle ensures clean state and avoids stale cached behavior.

<!-- decision:P-WL22GQ9J -->

## kiro-cli Integration Test Gate and Reinstall

**When:** 2026-06-24 · **Fact:** `P-WL22GQ9J`
**Why:** Interactive session testing is the authoritative proof of memory persistence. Code inspection alone is insufficient.

<!-- decision:P-CGLT2JD7 -->

## Memory Persistence Validation Workflow (End-to-End)

**When:** 2026-06-24 · **Fact:** `P-CGLT2JD7`
**Why:** This workflow empirically proves memory persistence works end-to-end. It's the definitive test — if facts land in context/ after a live session, the fix is working.

<!-- decision:P-4RGSVUAN -->

## always use bare `kiro-cli` command; `chat` subcommand is default and unnecessary

**When:** 2026-06-24 · **Fact:** `P-4RGSVUAN`

<!-- decision:P-DK6C2GKG -->

## Prefer fresh, isolated test folders over reusing existing folders contaminated b

**When:** 2026-06-24 · **Fact:** `P-DK6C2GKG`

<!-- decision:P-2F6HQJHF -->

## Binary Test Outcome Framework for Feature Validation

**When:** 2026-06-24 · **Fact:** `P-2F6HQJHF`
**Why:** Binary outcomes eliminate guesswork and remove the need for follow-up debugging; each result is actionable and complete.

<!-- decision:P-4JQZL6HE -->

## MCP Server State Isolation in Testing

**When:** 2026-06-24 · **Fact:** `P-4JQZL6HE`
**Why:** Without isolation, a test result can be false-positive or false-negative due to stale env state from a prior run. Killing old servers ensures the test truly validates the current code path, not cached behavior.

<!-- decision:P-Y3LNUP3A -->

## DEFINITIVE-kiro-cli-does-not-pass-mcp-json-env-to-stdio-server

**When:** 2026-06-24 · **Fact:** `P-Y3LNUP3A`
**Why:** Exhaustively proven: kiro-cli does not deliver the mcp.json `env` field to the spawned MCP server, so CMK_PROJECT_DIR never reaches it, so mk_remember silently fails (agent says "saved", nothing persists). The kit's code fix is correct (proven by a direct env-set test that DID land) but kiro doesn't provide the lever. A kiro-cli platform bug, not a kit bug — but it breaks MCP-driven capture in kiro-cli.

<!-- decision:P-GB6HWR94 -->

## Always use uv for Python packages in this project, never pip.

**When:** 2026-06-24 · **Fact:** `P-GB6HWR94`

<!-- decision:P-67N3M6LT -->

## kiro-cli Does Not Pass MCP Environment Variables

**When:** 2026-06-24 · **Fact:** `P-67N3M6LT`
**Why:** Breaks reliable memory capture via kiro-cli; confirmed by direct testing

<!-- decision:P-RP9NNKAY -->

## kiro-cli-env-only-flows-for-registry-type-not-stdio-mcp-feed-json-proof

**When:** 2026-06-24 · **Fact:** `P-RP9NNKAY`
**Why:** kiro-cli's own changelog (feed.json) proves it: mcp.json `env` only flows to REGISTRY-TYPE MCP servers, not personal/stdio ones like ours. So CMK_PROJECT_DIR is silently dropped → mk_remember silent-data-loss. Primary-source confirmation of the kiro-cli limitation behind the cut-blocker; the kit's code fix is correct but kiro won't deliver the env to a stdio server.

<!-- decision:P-WH4B9VPD -->

## kiro-cli MCP server env passing limitation

**When:** 2026-06-24 · **Fact:** `P-WH4B9VPD`
**Why:** Root cause of MCP capture failures in kiro v0.4.0. The blocking issue is upstream in kiro-cli, not in the kit's code (which was correct).

<!-- decision:P-FFQDSQEV -->

## kiro-cli env-passing limitation

**When:** 2026-06-24 · **Fact:** `P-FFQDSQEV`
**Why:** This limitation was discovered during debugging and is documented in kiro's own changelog. It is a hard constraint of how kiro-cli routes configuration to MCP servers.

<!-- decision:P-YX5A7RWJ -->

## kiro-cli --project workaround for project-path passing

**When:** 2026-06-24 · **Fact:** `P-YX5A7RWJ`
**Why:** env is not passed to stdio servers by kiro. The --project arg was proven to work in code (suite 2268/0) and is the only lever that kiro-cli cannot drop.

<!-- decision:P-5D5PDC5E -->

## Live test workflow for kiro-cli --project fix

**When:** 2026-06-24 · **Fact:** `P-5D5PDC5E`
**Why:** This is the definitive live test to prove whether kiro-cli passes command-line args to stdio MCP servers. Designed to run after code commit.

<!-- decision:P-6WKMHaB6 -->

## User trusts assistant to take autonomous action; delegates decisively with "just

**When:** 2026-06-24 · **Fact:** `P-6WKMHaB6`

<!-- decision:P-XA74FDKH -->

## Cut-Blocker Fix: --project Routing and @claude-memory-kit Approval

**When:** 2026-06-24 · **Fact:** `P-XA74FDKH`
**Why:** These are the two-part root cause of the cut-blocker. Validation proves both are wired correctly and facts flow end-to-end. Unblocks merge.

<!-- decision:P-5SDX2A4Y -->

## kiro-cli-mcp-list-reveals-agent-server-link-broken-includemcpjson-shows-legacy

**When:** 2026-06-24 · **Fact:** `P-5SDX2A4Y`
**Why:** kiro-cli mcp list shows the cmk agent's server as [legacy] and the real attachment on kiro_default not cmk — so includeMcpJson:true (Option B) doesn't properly wire the project mcp.json server to the cmk agent, and mk_remember calls go nowhere. The server itself is correct (direct calls write); the agent→server link is broken. Likely Option B (dropping the agent's inline mcpServers) was wrong; a project-local agent with inline mcpServers may be the real fix.

<!-- decision:P-234QKaCL -->

## CONFIRMED-kiro-bugs-5873-5662-custom-agents-dont-get-mcp-tools

**When:** 2026-06-24 · **Fact:** `P-234QKaCL`
**Why:** The user's call to check upstream found the definitive root cause: kiro-cli issues #5873 + #5662 confirm custom agents (.kiro/agents/*.json) do NOT receive MCP tools — only kiro_default does — and NEITHER inline mcpServers NOR includeMcpJson works for them. So mk_remember silently fails in kiro-cli by a CONFIRMED KIRO BUG, not a kit bug, and no kit config fixes it. This kills the project-local-agent fix and settles the v0.4.0 stance.

<!-- decision:P-9TBJ9J5P -->

## chose option A — proceed with merge and documentation of the Kiro CLI limitation

**When:** 2026-06-24 · **Fact:** `P-9TBJ9J5P`

<!-- decision:P-aPAXAYVX -->

## Kiro CLI: Known Limitation — Bug #5873 Blocks Manual mk_remember

**When:** 2026-06-24 · **Fact:** `P-aPAXAYVX`
**Why:** Future sessions need to know kiro-cli's primary working feature (automatic capture) and why manual saves are unavailable, so docs reflect reality and users have clear guidance.

<!-- decision:P-GJ6NK9QE -->

## THE-FIX-use-cmk-remember-cli-not-mk-remember-mcp-in-kiro-cli

**When:** 2026-06-24 · **Fact:** `P-GJ6NK9QE`
**Why:** The user's insight cracked the cut-blocker: `cmk remember` (CLI shell command) bypasses the Kiro MCP bug (#5873) that breaks the mk_remember MCP tool. PROVEN to land in gate4. The skill already has a CLI fallback but doesn't trigger it because the MCP server looks connected (no error). So instructing Kiro to prefer the CLI `cmk remember` makes explicit capture work in kiro-cli NOW, without waiting for Kiro to fix #5873.

<!-- decision:P-3JGE7aaB -->

## cli-route-fix-prompt-vs-skill-conflict-ide-cli-share-skill

**When:** 2026-06-24 · **Fact:** `P-3JGE7aaB`
**Why:** The user asked how IDE vs cli are distinguished — surfacing that my CLI-route prompt (kiro-cli-only, correct) conflicts with the shared .kiro/skills/memory-write skill which says 'prefer MCP'. The same skill is read by the IDE (MCP works) and kiro-cli (MCP broken), so it can't simply be flipped. Must resolve whether the agent prompt outranks the skill, or make the skill agent-aware.

<!-- decision:P-UB6G75DX -->

## Kiro Bug #5873 — Explicit Tool Route Blocked

**When:** 2026-06-24 · **Fact:** `P-UB6G75DX`
**Why:** Tool is unavailable; CLI workaround is functional and documented.

<!-- decision:P-96D7W57M -->

## Kiro-CLI Memory Integration — Test Procedure

**When:** 2026-06-24 · **Fact:** `P-96D7W57M`
**Why:** Kiro bug #5873 blocks explicit tool route; CLI route is workaround. Live test confirms full integration before merge.

<!-- decision:P-DRML7RX3 -->

## v0.4.0-decision-remove-mcp-from-kiro-cli-agent-includemcpjson-false-document-gap

**When:** 2026-06-24 · **Fact:** `P-DRML7RX3`
**Why:** User chose: remove MCP from kiro-cli + document, ship v0.4.0. Hooks work in kiro-cli (automatic memory functions); both explicit-save routes (MCP #5873, CLI cmk remember cwd-flaky) are broken by kiro V3 bugs. The popup is kiro's MCP launcher. The fix: includeMcpJson:false on the kiro-cli agent stops the MCP spawn (no popup) without touching the IDE (which reads mcp.json directly + where MCP works).

<!-- decision:P-JBaZNZ95 -->

## kiro-cli Explicit Save Limitation (Known)

**When:** 2026-06-24 · **Fact:** `P-JBaZNZ95`
**Why:** Testing showed `cmk remember` facts didn't land due to kiro's shell cwd behavior — not a cmk defect, but an environment constraint.

<!-- decision:P-T5SJYZVa -->

## kiro-cli MCP Configuration — Disable to Kill Popup

**When:** 2026-06-24 · **Fact:** `P-T5SJYZVa`
**Why:** kiro-cli was spawning a non-functional MCP server, causing an annoying popup (issue #5873). Disabling MCP here removes dead weight while preserving MCP for other surfaces.

<!-- decision:P-QJLBaF99 -->

## Memory Routes by Execution Surface

**When:** 2026-06-24 · **Fact:** `P-QJLBaF99`
**Why:** Execution contexts differ in capabilities. kiro-cli cannot reliably use MCP but captures memory via shell hooks.

<!-- decision:P-H4KU6775 -->

## Disable MCP in IDE Wrappers With includeMcpJson: false

**When:** 2026-06-24 · **Fact:** `P-H4KU6775`
**Why:** Some IDEs don't support MCP or users want a minimal footprint; the fix improves UX. Memory capture still works via hooks.

<!-- decision:P-4GB6NFMA -->

## cmk-remember-needs-project-flag-cwd-unreliable-in-kiro-cli-shell

**When:** 2026-06-24 · **Fact:** `P-4GB6NFMA`
**Why:** cmk remember resolves project from process.cwd() only; kiro-cli's shell runs `cd /c/Temp/gate5 && cmk remember` unreliably (bash path + kiro terminal cwd), so the fact writes to the wrong project — "Remembered" but lost. The fix: a --project flag on cmk remember/search (like mcp serve got) + the agent prompt passing the absolute path. Popup already fixed (includeMcpJson:false); hooks work; this is the last explicit-save gap.

<!-- decision:P-C3MJVGP5 -->

## FINAL-kiro-doesnt-execute-shell-commands-for-custom-agents-explicit-memory-dead

**When:** 2026-06-24 · **Fact:** `P-C3MJVGP5`
**Why:** The user's 'did you read the code?' push led to the definitive root cause: reading subcommands.mjs:983 proved cmk remember is cwd-only (correct), and running the agent's EXACT command manually LANDED — but the session's identical command did NOTHING (0 audit, no now.md) and the model used a hallucinated tool name + fabricated '✅ Remembered'. So kiro doesn't execute shell commands for custom agents either (parallel to MCP #5873) — the model fakes it. ALL model-initiated explicit memory is dead in kiro-cli; only hooks (kiro-run, not model-run) work. No kit fix helps.

<!-- decision:P-NBWU27JQ -->

## Kiro-cli automatic memory capture works

**When:** 2026-06-24 · **Fact:** `P-NBWU27JQ`
**Why:** The whole point of the kit is "fire and forget" memory across sessions; this is the feature that matters most and the one that works

<!-- decision:P-U9SMNCL4 -->

## Kiro-cli custom agent tool limitation

**When:** 2026-06-24 · **Fact:** `P-U9SMNCL4`
**Why:** This explains why the manual "remember this" command appears to succeed but doesn't actually persist (the assistant sees a fake ✅ but nothing runs). Future sessions need to know this is by design (platform limit), not a kit defect.

<!-- decision:P-Z94F92ZE -->

## CORRECTED-cd-prefix-breaks-allowlist-kiro-4579-project-flag-is-the-fix

**When:** 2026-06-24 · **Fact:** `P-Z94F92ZE`
**Why:** The user's question (what do projects do for in-chat scripts) led to confirmed Kiro bug #4579: cd-prefixed commands break the start-anchored allowedCommands match. Our agent ran `cd ... && cmk remember`, which fails our `^cmk remember` allowlist → blocked. So commands DO work for custom agents; the cd prefix is the specific breakage — and it's FIXABLE: tell the agent to use `cmk remember --project <abs>` with NO cd. My earlier 'custom agents can't run commands / it's unfixable' conclusion was WRONG; the --project flag I was building is the correct fix.

<!-- decision:P-D6E2HXN3 -->

## Kiro #4579 Workaround: Replace `cd` with `--project` Flag

**When:** 2026-06-24 · **Fact:** `P-D6E2HXN3`
**Why:** Unblocks explicit memory save in kiro-cli custom-agent contexts (critical blocker resolved)

<!-- decision:P-E2WMaTAE -->

## TRULY-FINAL-kiro-windows-allowlist-bug-5376-7431-blocks-correct-commands-unfixable

**When:** 2026-06-24 · **Fact:** `P-E2WMaTAE`
**Why:** Evidence-complete: the agent ran the perfect command (--project, no cd, matches the allowlist) and kiro STILL blocked it (no audit, no tool_result), while the identical command lands when I run it. This is confirmed Kiro Windows allowlist bugs #5376/#7431 — kiro rejects commands that genuinely match allowedCommands. Every kit lever (MCP/CLI/--project/no-cd/allowlist) is correct; kiro blocks anyway. Not fixable from the kit. Hooks work (kiro runs them). Ship with automatic memory + documented explicit gap.

<!-- decision:P-5NAAPaWR -->

## design-correction-project-flag-is-outside-chat-not-model-in-chat-command

**When:** 2026-06-24 · **Fact:** `P-5NAAPaWR`
**Why:** The user clarified: --project is for outside-the-chat invocation (hooks/scripts), and putting it in the model's in-chat command is wrong design — it relies on the model running commands (blocked by kiro's allowlist bug) and is fragile. The right design: memory is automatic via hooks (which work); the model never runs memory commands. This sidesteps kiro's bug entirely and matches how real kiro projects (AgentCore) work.

<!-- decision:P-SLa3TB2R -->

## --project flag is supposed to run outside the chat context, not within it

**When:** 2026-06-24 · **Fact:** `P-SLa3TB2R`

<!-- decision:P-6YCQPD3K -->

## THE-ACTUAL-BUG-missing-tools-field-agent-had-no-shell-tool-enabled

**When:** 2026-06-24 · **Fact:** `P-6YCQPD3K`
**Why:** The user's reframe (cmk remember is just a tool like ls — how do you run tools in chat?) led to the real bug: our kiro-cli agent had NO `tools` field, so the custom agent had zero tools enabled and literally couldn't run shell commands — every '✅ Remembered' was the model pretending. Kiro's docs: tools is the capability set; must include 'shell' or '*'. This was never a kiro bug; we forgot to enable tools. All my 'confirmed kiro bugs' diagnoses were wrong.

<!-- decision:P-63PNEKQQ -->

## Looking for the native way to run tools (like cmk_remember) in kiro-cli chat, eq

**When:** 2026-06-24 · **Fact:** `P-63PNEKQQ`

<!-- decision:P-5CXRTFVP -->

## Questioning whether their approach is wrong, if there's a bug, or if the system

**When:** 2026-06-24 · **Fact:** `P-5CXRTFVP`

<!-- decision:P-AKRHWKJB -->

## Tool Execution in kiro-cli Requires `tools: ['*']` Config

**When:** 2026-06-24 · **Fact:** `P-AKRHWKJB`
**Why:** Tool execution was mysteriously failing (no error, just inert calls) because the permission gate was missing entirely — invisible until explicitly diagnosed

<!-- decision:P-GP54J2UE -->

## CUT-BLOCKER-CLOSED-kiro-cli-explicit-memory-works-tools-star-fix-proven

**When:** 2026-06-24 · **Fact:** `P-GP54J2UE`
**Why:** PROVEN LIVE: tools:['*'] was the fix — the model ran cmk remember and it really executed (P-DTRaa79G rich fact landed in gate7, cmk search finds it). The whole multi-hour kiro-bug saga was misdiagnosis; the agent just had no tools enabled. kiro-cli is now fully working: popup fixed, automatic + explicit memory both work. Ship v0.4.0.

<!-- decision:P-CJCM9CJM -->

## confirmed tests passed ("run all the commands nad the response looks promising")

**When:** 2026-06-24 · **Fact:** `P-CJCM9CJM`

<!-- decision:P-F2GYBEY5 -->

## Gate-Folder Testing Methodology

**When:** 2026-06-24 · **Fact:** `P-F2GYBEY5`
**Why:** Numbered gates decouple testing from active development and make regression detection obvious. The pattern is repeatable and traceable.

<!-- decision:P-UaE4C5MH -->

## Missing `tools: ['*']` Field Was the Shell Blocker

**When:** 2026-06-24 · **Fact:** `P-UaE4C5MH`
**Why:** Understanding the root cause prevents regression and explains why prior refactors stalled. The fix is minimal and isolated.

<!-- decision:P-SSULEHW2 -->

## CHECKPOINT-kiro-cli-fully-works-tools-fix-cleanup-done-ready-for-pr

**When:** 2026-06-24 · **Fact:** `P-SSULEHW2`
**Why:** Context at 2% — durable checkpoint. kiro-cli now fully works (tools:['*'] was the fix, proven live; popup fixed; explicit memory via cmk remember/search works) and the dead MCP machinery is cleaned up (committed a60b11a). All 3 agents work. Remaining: test the bare-no-project question, two-pass review, docs, correct the misdiagnosis notes, consolidate → PR → v0.4.0 tag.

<!-- decision:P-SXSPGGEC -->

## Kiro-CLI Agent `tools` Field Configuration Fix

**When:** 2026-06-24 · **Fact:** `P-SXSPGGEC`
**Why:** Agents without `tools` cannot execute tools; they can only return text and may fake success responses.

<!-- decision:P-ATGVZCWS -->

## Kiro-CLI Fully Functional State (Commit a60b11a)

**When:** 2026-06-24 · **Fact:** `P-ATGVZCWS`
**Why:** Represents the end state of a long debugging cycle; system is stable and proven.

<!-- decision:P-GLSAMG6N -->

## User principle: don't defer bugs to v0.5.0, because deferred work doesn't get re

**When:** 2026-06-24 · **Fact:** `P-GLSAMG6N`

<!-- decision:P-aPBH9EMa -->

## kiro-cli cut gate procedure

**When:** 2026-06-24 · **Fact:** `P-aPBH9EMa`
**Why:** Test leftovers (esp. `cmk.json`) mask whether the shipped code works on a genuinely fresh install; backing up first makes it safe to clean before testing

<!-- decision:P-SVXNQMZK -->

## Test artifacts can contaminate fresh-install testing

**When:** 2026-06-24 · **Fact:** `P-SVXNQMZK`
**Why:** A gate test needs to simulate a real user's first install; pre-existing config defeats that simulation

<!-- decision:P-LWJQU7a6 -->

## Cutgate Fresh Install Test Sequence

**When:** 2026-06-24 · **Fact:** `P-LWJQU7a6`
**Why:** Tests that the kit ships and installs cleanly on a fresh system without test state contamination skewing results

<!-- decision:P-XML7J7a5 -->

## Kit Shell Permission & Command Trust Boundary

**When:** 2026-06-24 · **Fact:** `P-XML7J7a5`
**Why:** Security boundary: kit commands are internal and trusted; user commands need approval. D-199 eliminated unnecessary prompts for kit's own memory operations.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-9HAX6LAX -->

## agentSpawn hook verified firing; D-198 configuration fix confirmed working; Kiro

**When:** 2026-06-24 · **Fact:** `P-9HAX6LAX`

<!-- decision:P-VRJ9JMX5 -->

## kiro-cli only passes env overrides to registry-type MCP servers, not stdio-type;

**When:** 2026-06-24 · **Fact:** `P-VRJ9JMX5`

<!-- decision:P-ZXUWSZWJ -->

## The kit's code fix is correct; the blocking issue is kiro-cli's env-passing arch

**When:** 2026-06-24 · **Fact:** `P-ZXUWSZWJ`

<!-- decision:P-A79KMP6L -->

## Only mk_remember MCP-tool calls are affected; CLI hooks (agentSpawn inject + sto

**When:** 2026-06-24 · **Fact:** `P-A79KMP6L`

<!-- decision:P-TBKTT7FS -->

## Kiro bug #5873 blocks manual `mk_remember` tool from routing to custom assistant

**When:** 2026-06-24 · **Fact:** `P-TBKTT7FS`

<!-- decision:P-H4KXTZTX -->

## Cross-Project Rules Auto-Promote at Session End (Stop Hook)

**When:** 2026-06-24 · **Fact:** `P-H4KXTZTX`
**Why:** Understanding the auto-promotion flow prevents confusion: users don't need manual promotion commands to land cross-project rules in HABITS.md. The kit handles promotion automatically at session close, reducing friction.

<!-- decision:P-A4JSRQYE -->

## Kiro IDE Hook Architecture — 10 Available, 2 Currently Used

**When:** 2026-06-25 · **Fact:** `P-A4JSRQYE`
**Why:** Kiro's full hook surface is now understood; reveals capacity for remaining features without architectural surprises.

<!-- decision:P-LUHU6TQQ -->

## Kit Status After Cut Gate — Core Merged and Proven

**When:** 2026-06-25 · **Fact:** `P-LUHU6TQQ`
**Why:** Establishes stable baseline for next phase; clarifies which core features are locked in vs. still under development.

<!-- decision:P-322V34Q2 -->

## Task 50.N Completion State — Kiro Parity Campaign

**When:** 2026-06-25 · **Fact:** `P-322V34Q2`
**Why:** Next session will resume from exact state. IDE appears structurally done but live verification is the actual done-gate. Backup location + test count critical for safety.

<!-- decision:P-PaVAMD9H -->

## Pre-gate rebuild and server shutdown sequence

**When:** 2026-06-25 · **Fact:** `P-PaVAMD9H`
**Why:** npm can silently retain old code; MCP locking prevents clean rebuilds; user state must be captured before fresh install; on-disk checks reduce manual gate work.

<!-- decision:P-9PPTD9RE -->

## Two-phase gate workflow pattern

**When:** 2026-06-25 · **Fact:** `P-9PPTD9RE`
**Why:** User system-specific actions (rebuild, local state) must be done by the user; assistant can automate the rest. Clear phase separation reduces gate failures from missed setup steps.

<!-- decision:P-ZGJTAGBD -->

## v0.4.0 cut-gate structure and coverage

**When:** 2026-06-25 · **Fact:** `P-ZGJTAGBD`
**Why:** User's installed versions determine which probes are active vs skipped. IDE v1 is not in scope yet but is explicitly documented as such.

<!-- decision:P-9TJHaTBG -->

## Gate Testing Decision — Quick vs. Comprehensive Path

**When:** 2026-06-25 · **Fact:** `P-9TJHaTBG`
**Why:** This session added v1 IDE integration; gate testing should verify it or explicitly acknowledge it unverified

<!-- decision:P-C7VPU7BC -->

## Kiro-CLI Dual-Emit Architecture

**When:** 2026-06-25 · **Fact:** `P-C7VPU7BC`
**Why:** Provides flexibility in testing; choice is scope (quick/legacy vs. comprehensive/modern), not compatibility

<!-- decision:P-7U47a2QG -->

## Kiro IDE 1.0.52 Agent Hooks v2 Format Verification Gate

**When:** 2026-06-25 · **Fact:** `P-7U47a2QG`
**Why:** The v2 label indicates format change from v1. Documentation is authoritative; format mismatches could break hook system integration.

<!-- decision:P-NSM4THF5 -->

## Kiro 1.0 Hook Format Discovery via IDE-Generated Files

**When:** 2026-06-25 · **Fact:** `P-NSM4THF5`
**Why:** Documentation may be incomplete or out of sync with actual implementation. Reading what the tool itself writes is authoritative.

<!-- decision:P-YW3DSPJ3 -->

## Kiro 1.0 v1 Hook Schema and Installation Naming

**When:** 2026-06-25 · **Fact:** `P-YW3DSPJ3`
**Why:** Live IDE 1.0 gate confirmed v1 schema guesses and caught bug #231 (installer generating wrong filenames). This ground truth will guide all v1 hook generation; backward-compat safety is now proven.

<!-- decision:P-CGX3WDW4 -->

## Gate Project Ready for KHv1-load Validation

**When:** 2026-06-25 · **Fact:** `P-CGX3WDW4`
**Why:** Confirms fresh `cmk install` produces v1 hooks that IDE auto-loads.

<!-- decision:P-9K72LLAW -->

## Kiro IDE 1.0 Hook v1 Validation Protocol

**When:** 2026-06-25 · **Fact:** `P-9K72LLAW`
**Why:** Live validation that cmk install output produces working v1 hooks auto-loaded in Kiro IDE (different from migration-script test)

<!-- decision:P-4WHH6D72 -->

## CLI Installation Verification Workflow

**When:** 2026-06-25 · **Fact:** `P-4WHH6D72`
**Why:** Global CLI must be rebuilt after changes; verification ensures fix is active before testing downstream (Kiro IDE hooks, gate projects)

<!-- decision:P-A52S4L4E -->

## Kiro Caching Behavior & Workaround

**When:** 2026-06-25 · **Fact:** `P-A52S4L4E`
**Why:** Kiro spawns hook subprocesses, so it caches the *hook definition*, not always the CLI binary. Restart flushes Kiro's internal state.

<!-- decision:P-XESLC4LQ -->

## Kiro IDE Hook Testing — Multi-Step Gate Sequence

**When:** 2026-06-25 · **Fact:** `P-XESLC4LQ`
**Why:** Hooks may appear installed but not actually execute; fresh folder + systematic verification avoids false passes from stale state

<!-- decision:P-RSXX6JWW -->

## Global Install Auto-Recreates User-Tier Directory

**When:** 2026-06-25 · **Fact:** `P-RSXX6JWW`
**Why:** Observed during post-rebuild verification; important for test design and cleanup between runs

<!-- decision:P-YZWV75GZ -->

## Memory Tier System: Project-to-Cross-Project Promotion

**When:** 2026-06-25 · **Fact:** `P-YZWV75GZ`
**Why:** Allows validated workspace facts to surface as standing rules across all future projects.

<!-- decision:P-MZMJWDC6 -->

## PRs #232–#233: Kiro IDE 1.0 Integration Complete

**When:** 2026-06-25 · **Fact:** `P-MZMJWDC6`
**Why:** IDE 1.0 changed session storage location and introduced a new permission model; these fixes align the kit.

<!-- decision:P-3JNMR9QC -->

## CMK Workspace Rename Invalidates Per-Workspace Permissions Hash

**When:** 2026-06-25 · **Fact:** `P-3JNMR9QC`
**Why:** Renaming without re-installing silently breaks the permission binding. Re-installing immediately after rename keeps the permissions hash in sync with the folder's absolute path.

<!-- decision:P-5ZSWJRRD -->

## kiro-cli V3 Delete-Guardrail (preToolUse) Known Limitation

**When:** 2026-06-25 · **Fact:** `P-5ZSWJRRD`
**Why:** Prevents shipping with an uncaught assumption that the guardrail works everywhere. Limitations must be explicit and justified.

<!-- decision:P-EDZEJ3TZ -->

## Kiro v0.4.0 Multi-Surface Trust Mechanism Architecture

**When:** 2026-06-25 · **Fact:** `P-EDZEJ3TZ`
**Why:** v0.4.0 unifies memory behavior across three implementations. Live testing confirmed they work in isolation without conflicts. An implicit assumption (that kiro-cli would use the same mechanism as Kiro IDE) was caught by testing.

<!-- decision:P-C27GVXL9 -->

## Delete-Guardrail: Memory Protection via preToolUse Hook

**When:** 2026-06-25 · **Fact:** `P-C27GVXL9`
**Why:** Motivated by D-192 incident — an accidental `rm` after a `cd` deleted a repo's session/transcript memory. The guardrail makes such unintended deletions impossible.

<!-- decision:P-JAP3QEMD -->

## kiro-cli V3 Hook Redesign: Guard Dormant, Fallback Active

**When:** 2026-06-25 · **Fact:** `P-JAP3QEMD`
**Why:** Kiro CLI V3's hook redesign is a breaking change for the kit's V2-era `preToolUse` approach, but V3's own safety prompts activate as fallback — users remain protected via a different gate.

<!-- decision:P-KWGTaLYN -->

## Frozen Decision Log Philosophy

**When:** 2026-06-25 · **Fact:** `P-KWGTaLYN`
**Why:** Decision logs and research are records of *thinking at a point in time*; rewriting them erases that history. Inline change notes in operational docs serve future readers without corrupting the audit trail.

<!-- decision:P-7USAABP2 -->

## Multi-Surface Documentation Architecture

**When:** 2026-06-25 · **Fact:** `P-7USAABP2`
**Why:** The tool supports multiple agents (Claude Code, Kiro IDE, kiro-cli), so docs must span multiple entry points and use cases. Validators prevent drift as the codebase evolves.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-VaK5DNNa -->

## The rolling session summary (recent.md) does NOT retire RESOLVED threads — a com

**When:** 2026-06-25 · **Fact:** `P-VaK5DNNa`
**Why:** A stale 'pending' line in the injected context is the cross-session-amnesia failure the kit exists to kill, applied to the kit's own session summaries. The next session reads a resolved epic as still-open.

<!-- decision:P-YCBLRF9U -->

## Memory Kit Architecture — Complementary Kit and CLAUDE.md

**When:** 2026-06-25 · **Fact:** `P-YCBLRF9U`
**Why:** This project dogfoods its own memory architecture. The dual-system design ensures facts are routed correctly (always-on enforcement vs. discoverable recall) and appropriately reinforced.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-LRC5G3V6 -->

## Clarifying scope — asking whether kiro-ide and claude-code are still pending fix

**When:** 2026-06-24 · **Fact:** `P-LRC5G3V6`

<!-- decision:P-VK9WUZX6 -->

## Kiro IDE 1.0.52 is available for Windows download (user discovered on download p

**When:** 2026-06-25 · **Fact:** `P-VK9WUZX6`

<!-- decision:P-25BQ2BVY -->

## User chose to upgrade to Kiro IDE 1.0.52; will perform upgrade, rebuild, and clo

**When:** 2026-06-25 · **Fact:** `P-25BQ2BVY`

<!-- decision:P-7BXYT6ZP -->

## Prefers clean, isolated test folders over reusing existing ones

**When:** 2026-06-25 · **Fact:** `P-7BXYT6ZP`

<!-- decision:P-DASHLKGA -->

## Always use uv for package management, never pip — stated as standing rule for al

**When:** 2026-06-25 · **Fact:** `P-DASHLKGA`

<!-- decision:P-BWHEKQ2D -->

## User set aside memory fragments across multiple test/check/version cycles and lo

**When:** 2026-06-25 · **Fact:** `P-BWHEKQ2D`

<!-- decision:P-43S5U24A -->

## Kit core legs now fully working + merged (inject, capture, auto-extract, wedge,

**When:** 2026-06-25 · **Fact:** `P-43S5U24A`

<!-- decision:P-GTCNZECK -->

## Next step is a choice: build parity legs first, or resume live cut-gate first to

**When:** 2026-06-25 · **Fact:** `P-GTCNZECK`

<!-- decision:P-PRHD66CF -->

## Discovery: Kiro IDE exposes 10 available hooks (Pre Tool Use, File Save, + 8 oth

**When:** 2026-06-25 · **Fact:** `P-PRHD66CF`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-T4X5L2LP -->

## Lazy-on-SessionStart Roll Doesn't Fire on Size-Bloated now.md

**When:** 2026-06-25 · **Fact:** `P-T4X5L2LP`
**Why:** The kit's core promise is self-refreshing snapshots. This is a gap — bloated snapshots can break the durability contract across session boundaries.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-BLSBXKGL -->

## Auto-load of .kiro/hooks/cmk.kiro.hook.json hooks is the critical verification p

**When:** 2026-06-25 · **Fact:** `P-BLSBXKGL`

<!-- decision:P-4H5WZL6N -->

## The kit dual-emits to support both IDE 0.x and 1.0+; either version can run the

**When:** 2026-06-25 · **Fact:** `P-4H5WZL6N`

<!-- decision:P-UBW47JKA -->

## Maintaining backward compatibility across Kiro IDE versions (0.x → 1.0) is value

**When:** 2026-06-25 · **Fact:** `P-UBW47JKA`

<!-- decision:P-DXZE3XDY -->

## npm pack and global install of 0.4.0 succeeded; tarball includes all required mo

**When:** 2026-06-25 · **Fact:** `P-DXZE3XDY`

<!-- decision:P-BGAC9PQX -->

## Verifies whether proper tools (cmk kit) vs shortcuts (bash) were used — indicate

**When:** 2026-06-25 · **Fact:** `P-BGAC9PQX`

<!-- decision:P-Ma5V7DXV -->

## now.md Bloat Creates Silent-Failure Trap in Lazy Roll

**When:** 2026-06-25 · **Fact:** `P-Ma5V7DXV`
**Why:** Future sessions may encounter stale injected context because the roll failed silently. Diagnosing this requires understanding the trap; recovery requires knowing about the manual command. This is critical for session health troubleshooting.

<!-- decision:P-W7B3A3FK -->

## Task 167 - Lazy Roll Robustness Extension (v0.4.x)

**When:** 2026-06-25 · **Fact:** `P-W7B3A3FK`
**Why:** Task 105 works reliably at ~10 KB scale, but fails silently at 400+ KB. Task 167 extends the mechanism to be robust at scale.

<!-- decision:P-DZDQSDQG -->

## now.md bloat root cause was cron-active short-circuit not timeout

**When:** 2026-06-25 · **Fact:** `P-DZDQSDQG`
**Why:** I first guessed "the Haiku roll timed out on 410 KB" and wrote that into the task. Reading lazy-compress.log corrected me: the roll was SKIPPED every time (cron-active, then cooldown), never attempted. A registered-but-dead cron disabled the only working compression path. This is the "did you check the primary source?" lesson applied to a root-cause claim — the log is the primary source; my recall was wrong.

<!-- decision:P-PY2TL4GZ -->

## Auto-Heal Path for v0.4.1 (Task 167) — D-169 Binding

**When:** 2026-06-25 · **Fact:** `P-PY2TL4GZ`
**Why:** User's question exposed a gap in initial 167.C spec (manual command violated D-169). Redesign ensures shipped path is automatic.

<!-- decision:P-DGBPG6PG -->

## Questioned whether fix is truly automatic and requires no user intervention.

**When:** 2026-06-25 · **Fact:** `P-DGBPG6PG`

<!-- decision:P-X362NWKX -->

## Compaction-State Module — v0.4.1 Core Architecture Refactoring

**When:** 2026-06-25 · **Fact:** `P-X362NWKX`
**Why:** Scattered state-ownership is the root cause of the bug. Architecture review and bug analysis converged on the same solution.

<!-- decision:P-46FTFCCW -->

## architecture review priorities and the persona-routing-into-151 fold

**When:** 2026-06-25 · **Fact:** `P-46FTFCCW`
**Why:** The /improve-codebase-architecture review found 6 deepening candidates. #2 (persona-routing) overlaps directly with Task 151's planned rewrite of the persona-promotion surface — doing it standalone in v0.4.1 would refactor code 151 rewrites in v0.4.2. The user agreed #1/#2/#3 are all worth doing but #2's timing must align with 151 to avoid churn.

<!-- decision:P-T4aUHMXa -->

## Values research-grounded recommendations with clear, honest attribution of sourc

**When:** 2026-06-25 · **Fact:** `P-T4aUHMXa`

<!-- decision:P-Q9MSP5YP -->

## Derive-vs-Stamp Design Rule

**When:** 2026-06-25 · **Fact:** `P-Q9MSP5YP`
**Why:** ADR-0002 prefers state encoded in artifacts; explicit markers should be minimal and justified. Reduces marker bloat and keeps artifacts as source of truth.

<!-- decision:P-SGSDY7A6 -->

## OpenWolf — Scheduled-Job Architecture Peer

**When:** 2026-06-25 · **Fact:** `P-SGSDY7A6`
**Why:** Real-world validation that heartbeat approach works at scale; confirms both architecture fit and derive-from-artifact strategy.

<!-- decision:P-7ZMV7DYS -->

## Requires design decisions to be grounded in research; pushes back on assumptions

**When:** 2026-06-25 · **Fact:** `P-7ZMV7DYS`

<!-- decision:P-U3SBN4DY -->

## Three-Tier Research Evaluation System

**When:** 2026-06-25 · **Fact:** `P-U3SBN4DY`
**Why:** Clarifies how research sources are evaluated and prevents conflating peer architecture with mechanism precedent with novelty.

<!-- decision:P-B3HBA67G -->

## EverOS comparison — same thesis opposite architecture not better

**When:** 2026-06-25 · **Fact:** `P-B3HBA67G`
**Why:** The user asked "is this better than us?" after finding EverOS. The honest answer requires separating product class from quality: EverOS is more capable as a standalone memory backend but gave up the kit's entire edge (zero-server, zero-setup, no-key, hooks-into-the-agent). Judging "better" without that distinction would be the lazy-framing class. EverOS also validates ADR-0002 by convergence and offers a reflection model worth borrowing for Task 151.

<!-- decision:P-WA6L3E4M -->

## Learn from EverOS to validate and improve kit architecture across the project.

**When:** 2026-06-25 · **Fact:** `P-WA6L3E4M`

<!-- decision:P-7KDNP4NS -->

## Reflection Model Upgrade: `deprecated_by` Frontmatter

**When:** 2026-06-25 · **Fact:** `P-7KDNP4NS`
**Why:** Task 151 (persona consolidation) needs a robust reflection strategy; EverOS's pattern is proven and more systematic.

<!-- decision:P-5NAPNM6G -->

## Zero-Server + Local-First Is the Kit's Deliberate Design

**When:** 2026-06-25 · **Fact:** `P-5NAPNM6G`
**Why:** Design choice (D-23) is validated by peer comparison. Zero-infrastructure is the kit's value prop and differentiator from peer systems.

<!-- decision:P-D6CCPVXQ -->

## npm v12 Install-Scripts Breaking Change (July 2026 Deadline)

**When:** 2026-06-25 · **Fact:** `P-D6CCPVXQ`
**Why:** npm v12 is a shipping reality; once it releases, any user installing the kit without the fix will silently fail. This is a critical production risk with an immovable deadline.

<!-- decision:P-JNYKR9YS -->

## Agent Research Resources Location

**When:** 2026-06-25 · **Fact:** `P-JNYKR9YS`
**Why:** Avoids redundant research per new agent; existing documentation is the authoritative source.

<!-- decision:P-aRHH7Va5 -->

## ADR-0002: Derive State from Artifacts, Avoid Markers

**When:** 2026-06-25 · **Fact:** `P-aRHH7Va5`
**Why:** Artifact mtimes are durable and already integrated into the system; markers add failure modes and sync risks.

<!-- decision:P-EJGWN6U5 -->

## Deep-Module Principle: Smaller Interfaces via Internal Hiding

**When:** 2026-06-25 · **Fact:** `P-EJGWN6U5`
**Why:** smaller interfaces reduce cognitive load, avoid two-writer hazards, and clarify intent; richer returns provide diagnostics without method proliferation

<!-- decision:P-YY4A9JAK -->

## Initial spec (167.C) violated D-169 (automatic-path rule) by naming manual `cmk

**When:** 2026-06-25 · **Fact:** `P-YY4A9JAK`

<!-- decision:P-YZQD9K4U -->

## Task 167 compaction-state module interface — two methods rich return

**When:** 2026-06-25 · **Fact:** `P-YZQD9K4U`
**Why:** Grilling the compaction-state deep module (architecture review #1 = Task 167.A). The fork was 2 methods vs 3 (a standalone isCronAlive). The deep-module principle + the Task 167 bug class itself (two sources of one truth disagreeing) make 2-with-a-rich-return correct: richness lives in the return value, not extra buttons, so there's exactly one place the cron-liveness rule is computed. The user needed the doctor to still get the liveness info — solved by the rich return, not a 3rd method.

<!-- decision:P-U6G6HABS -->

## Compaction Logic Redesign: 7-Question Fork Analysis

**When:** 2026-06-25 · **Fact:** `P-U6G6HABS`
**Why:** Prevents compound bloat bug while maintaining fast startup for normal cases. Synchronous drain is rare safety net, not common case.

<!-- decision:P-EJP5KTP3 -->

## Cooldown Marker Bug — Fires on Both Success and Failure

**When:** 2026-06-25 · **Fact:** `P-EJP5KTP3`
**Why:** This is the 167.F sibling bug discovered in audit. Failed calls shouldn't trigger cooldown blocking since they didn't consume resources and should be allowed to retry.

<!-- decision:P-UPJDK2UN -->

## Task 167 cooldown — success-only touch + sync-drain bypasses it

**When:** 2026-06-25 · **Fact:** `P-UPJDK2UN`
**Why:** Grilling Task 167 Q5. The cooldown today (touched on success AND failure by 5 callers) both blocks failed-call retries and could block the very stale-content heal Q4 said must happen now. Resolving with the 'we're in the memory business' principle (P-9V3K7KEA): the cooldown is a cost guard, correctness beats cost, so the urgent drain bypasses it while the opportunistic compress still respects it.

<!-- decision:P-M7CY5H6V -->

## Cut-Gate Test Pattern for Automatic Cron-Drain Healing

**When:** 2026-06-25 · **Fact:** `P-M7CY5H6V`
**Why:** The original D-169 bug shipped with green tests because every test pre-ran `cmk compress`, making the automatic path invisible to the test suite.

<!-- decision:P-7PNY7XKE -->

## Test Hierarchy for Automatic-Path Verification

**When:** 2026-06-25 · **Fact:** `P-7PNY7XKE`
**Why:** Integration bugs (mechanism works, but never triggers automatically) are invisible to unit tests alone. The D-169 root cause was exactly this gap.

<!-- decision:P-6PGKSVT3 -->

## Task 167 testing — agent-run unit + live agent-loop, user does nothing

**When:** 2026-06-25 · **Fact:** `P-6PGKSVT3`
**Why:** The user: 'cant we do an agent loop live test like cut-gate, me doing all this testing will kill me' then 'i dont even need to say go, this is part of the tests'. Correct on both: testing is the agent's job (binding rule), and the live end-to-end check IS part of 'tested' (the binding live-test-every-task rule), not an optional extra. The original bug shipped green because every test ran the compaction command first — so the live test must fire ONLY a session and forbid any manual drain call, or it masks the automatic path again.

<!-- decision:P-E9GEZARN -->

## HC-10: Proactive Dead Cron Detection (Question 7)

**When:** 2026-06-25 · **Fact:** `P-E9GEZARN`
**Why:** Catches scheduler liveness independently from bloat state. Distinguishes reactive safety (automatic heal) from proactive optimization (scheduled compaction). Single source prevents drift and future confusion about where truth lives.

<!-- decision:P-GYFDaTKF -->

## Billing Model: Subscription (No API Token Cost)

**When:** 2026-06-25 · **Fact:** `P-GYFDaTKF`
**Why:** Removes token cost as a gating factor when designing testing strategy. Tests can be gated on wall-clock time and rate-limits instead of cost.

<!-- decision:P-DDRMSBPC -->

## Task 167 — drop HC-10 doctor check, keep only the free auto log

**When:** 2026-06-25 · **Fact:** `P-DDRMSBPC`
**Why:** Grilling Task 167 Q7. I proposed a proactive cmk doctor HC-10 for dead-cron detection; the user cut it as redundant ceremony aimed at the wrong audience (only power users run doctor; the heal already fixes the real problem). Keeps 167 focused on the automatic fix that helps everyone, not an opt-in warning for the few who need it least.

<!-- decision:P-QVG7KT6J -->

## HC-10 — Compaction Liveness Diagnostic (Dev Nice-to-Have)

**When:** 2026-06-25 · **Fact:** `P-QVG7KT6J`
**Why:** User confirmed it as a nice-to-have; valuable for observability without blocking correctness flow.

<!-- decision:P-YGSF2T6T -->

## Task 167 Design Resolved — Implementation Ready

**When:** 2026-06-25 · **Fact:** `P-YGSF2T6T`
**Why:** Core design is final. Unblocks build. Future sessions need locked decisions without re-deriving.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-aa2R6AR6 -->

## Gate test for v0.4.1 must prove healing with only SessionStart (no manual comman

**When:** 2026-06-25 · **Fact:** `P-aa2R6AR6`

<!-- decision:P-7QH7CQPU -->

## Research evaluation tiers (Tier 1 = kit peers, Tier 2 = mechanism refs, Tier 3 =

**When:** 2026-06-25 · **Fact:** `P-7QH7CQPU`

<!-- decision:P-aM5ZNHVE -->

## OpenWolf independently built the exact heartbeat fix (last_heartbeat via mtimeMs

**When:** 2026-06-25 · **Fact:** `P-aM5ZNHVE`

<!-- decision:P-WYZ57UX4 -->

## Q2 design rule (GNU make §4.8): derive when product carries signal; stamp for "r

**When:** 2026-06-25 · **Fact:** `P-WYZ57UX4`

<!-- decision:P-MTVVY5FT -->

## Cron-Liveness Fix (167.A) Solves Root Problem; Sync-Drain Is Secondary

**When:** 2026-06-26 · **Fact:** `P-MTVVY5FT`
**Why:** 167.A eliminates the *cause* of the original compounding bug (dead cron blocks roll). This makes synchronous drain (insurance against mid-session compounding) redundant.

<!-- decision:P-MHHNDDZD -->

## SessionStart Hook Ceiling Constrains Synchronous Operations

**When:** 2026-06-26 · **Fact:** `P-MHHNDDZD`
**Why:** The live test (real `claude --print`, actual call latency) exposed that Q4's synchronous-drain goal cannot fit the hook ceiling. This is a hard architectural constraint determining solution viability.

<!-- decision:P-U32aXXFV -->

## Peer Systems Synchronize Consolidation on Stop Hook (Session END)

**When:** 2026-06-26 · **Fact:** `P-U32aXXFV`
**Why:** Resolves tension between Q4 ("correctness over speed") and live-test ceiling conflict. Peers validate this works; kit already has the SessionEnd infrastructure.

<!-- decision:P-A677aTMU -->

## Task 167 shipped — live test overturned the grilled Q4 sync-drain (D-208)

**When:** 2026-06-26 · **Fact:** `P-A677aTMU`
**Why:** The biggest meta-lesson of the Task 167 build: a confident 7-question grilling + a green unit suite still shipped an INFEASIBLE mechanism (synchronous SessionStart drain). Only the real claude --print live test caught it — the live-test-every-task rule + the lazy-framing rule applied to our OWN grilled decision. A grilled decision is not immune to being wrong; the live test is the primary source that can overturn it.

<!-- decision:P-P9HT6G2U -->

## 30s Hook Ceiling Constraint & Real Haiku Roll Timing

**When:** 2026-06-26 · **Fact:** `P-P9HT6G2U`
**Why:** Hard environmental constraints (hook timeouts, resource limits) emerge only during real execution, not during design phases.

<!-- decision:P-TQMDL5KK -->

## Cron-Liveness Gate by Heartbeat Age (Task 167.A)

**When:** 2026-06-26 · **Fact:** `P-TQMDL5KK`
**Why:** Existence checks don't distinguish "never ran" from "dead." Age-based gates are resilient to process death and match production anacron behavior.

<!-- decision:P-G6GWaMaZ -->

## Pre-Existing Issue Triage

**When:** 2026-06-26 · **Fact:** `P-G6GWaMaZ`
**Why:** Bundling obscures which failures the current change caused vs. which predate it. Separate filing prevents silent accumulation.

<!-- decision:P-FXY7PLY5 -->

## Two-Pass Review Catches Concurrency Bugs

**When:** 2026-06-26 · **Fact:** `P-FXY7PLY5`
**Why:** Composition-level thinking (logic flow) and code-level thinking (implementation, cleanup, concurrency) catch different bug classes.

<!-- decision:P-SEZYAQE5 -->

## Extract Shared Discovery Logic to Prevent Drift

**When:** 2026-06-26 · **Fact:** `P-SEZYAQE5`
**Why:** Prevents the two implementations from diverging over time, which introduces subtle bugs.

<!-- decision:P-5YNFGAUM -->

## Project Root Discovery Must Stop at $HOME Boundary

**When:** 2026-06-26 · **Fact:** `P-5YNFGAUM`
**Why:** This was a real footgun: project discovery should be contained within its own tree, not escape upward into unrelated user directories.

<!-- decision:P-K356XCRP -->

## Windows Short-Name Path Canonicalization in Discovery

**When:** 2026-06-26 · **Fact:** `P-K356XCRP`
**Why:** Without this, project discovery could fail intermittently depending on how cwd was specified (short vs long form), especially on Windows.

<!-- decision:P-VWaBFP75 -->

## Kit Delete-Guardrail False Positive on Commit Messages

**When:** 2026-06-26 · **Fact:** `P-VWaBFP75`
**Why:** Prioritizes safety over user friction

<!-- decision:P-Q2GEGHBU -->

## Step 0b Backup Implementation (Not Delete)

**When:** 2026-06-26 · **Fact:** `P-Q2GEGHBU`
**Why:** Implements the standing backup-not-wipe rule for the gate process (user explicitly preferred this over deletion)

<!-- decision:P-M2GBXRG3 -->

## v0.4.1 Release & Gate Workflow

**When:** 2026-06-26 · **Fact:** `P-M2GBXRG3`
**Why:** v0.4.1 introduces new now-roll and discovery gates; staged verification ensures all checks pass before publication

<!-- decision:P-U72QNAYa -->

## Gate Check G0: CLI Version Verification

**When:** 2026-06-26 · **Fact:** `P-U72QNAYa`
**Why:** Confirms the packed `.tgz` was correctly installed to the global npm scope. Failure indicates a broken install that must be fixed before proceeding.

<!-- decision:P-AMWUC52V -->

## Release Workflow: Tag Timing (After Gates)

**When:** 2026-06-26 · **Fact:** `P-AMWUC52V`
**Why:** Prevents publishing to npm/GitHub until all gates confirm the artifact is sound. Provides a natural rollback point (do not tag if gates fail).

<!-- decision:P-XHYR6U54 -->

## npm Glob Expansion Fails in PowerShell; Use Explicit Filename

**When:** 2026-06-26 · **Fact:** `P-XHYR6U54`
**Why:** This is a fundamental difference between PowerShell (which does not auto-expand globs in command arguments) and bash (which does). npm relies on the shell to expand patterns, so it receives the literal string and cannot find the file.

<!-- decision:P-9RRaRPE5 -->

## npm Uninstall EPERM Error with sqlite-vec DLL on Windows

**When:** 2026-06-26 · **Fact:** `P-9RRaRPE5`
**Why:** Native bindings (`.dll` files) on Windows remain locked if any process has loaded them. npm cannot unlink a locked file.

<!-- decision:P-U6Qa2BJZ -->

## Now-Roll Self-Heal (v0.4.1 Headline Feature)

**When:** 2026-06-26 · **Fact:** `P-U6Qa2BJZ`
**Why:** Claude releases change output format; the kit must detect and adapt automatically to avoid breaking memory extraction in live sessions

<!-- decision:P-K97X42ZV -->

## Pre-Session-1 Gate Procedure (v0.4.1)

**When:** 2026-06-26 · **Fact:** `P-K97X42ZV`
**Why:** v0.4.1 is a robustness release; these gates verify the kit's core safety, feature, and boundary guarantees before live testing

<!-- decision:P-G9KA7B72 -->

## Kit Install Pre-Configuration Expectation

**When:** 2026-06-26 · **Fact:** `P-G9KA7B72`
**Why:** The kit's design contract is zero-friction setup — once installed, tools work without friction. Prompts after install violate this and signal a broken install or incompatibility.

<!-- decision:P-RXFPBRQC -->

## Allow-list Entries Centralized in settings-hooks.mjs

**When:** 2026-06-26 · **Fact:** `P-RXFPBRQC`
**Why:** Centralization prevents drift and inconsistency between distributions, making the kit maintainable and responsive to upstream changes.

<!-- decision:P-L5LP3UW6 -->

## Claude Code 2.1.191 Requires Both Skill() Forms in Allow-list

**When:** 2026-06-26 · **Fact:** `P-L5LP3UW6`
**Why:** The kit has used only the bare form since Task 90 (byte-unchanged). Claude Code 2.1.x changed its Skill() permission matching logic, requiring the kit to track this upstream change (as it does for Kiro hook-format updates). This is a real breaking change for end-users.

<!-- decision:P-BU4L6RGR -->

## Claude Code 2.1.x needs Skill(name:*) wildcard to suppress skill prompts

**When:** 2026-06-26 · **Fact:** `P-BU4L6RGR`
**Why:** The v0.4.1 cut-gate caught the kit's prompt-free capture breaking on CC 2.1.191 — the bare Skill(memory-write) the kit shipped since Task 90 stopped working. This is upstream format drift the kit must track (like Kiro hook formats), and it's invisible to unit tests (no test drives a live CC skill-approval), so only the live gate caught it.

<!-- decision:P-NaE3TNXZ -->

## Re-Pack + Verify Workflow for Cut-Gate Testing

**When:** 2026-06-26 · **Fact:** `P-NaE3TNXZ`
**Why:** The installed global cmk version has the old code. Re-packing + reinstalling ensures the gate tests the merged fix. Deleting settings.local.json prevents manual overrides from masking the real behavior.

<!-- decision:P-FB9LL5S6 -->

## CMK Fix Verification Workflow (Fresh Folder, v0.4.1)

**When:** 2026-06-26 · **Fact:** `P-FB9LL5S6`
**Why:** The `:*` fix to the allow-list needs end-to-end verification in a clean environment.

<!-- decision:P-EEFMZVXB -->

## cmk install --with-semantic trusts npm exit code not the actual embedder import (Task 170)

**When:** 2026-06-26 · **Fact:** `P-EEFMZVXB`
**Why:** The v0.4.1 cut-gate showed --with-semantic reporting failure while semantic search actually worked. This is the D-199 class (a tool's exit/success not matching reality) and it bites real Windows users: a locked-DLL cleanup EBUSY after a successful install makes the kit silently NOT enable semantic, even though the embedder is present and functional. The user caught it by asking 'are you sure semantic is not working?'.

<!-- decision:P-JL4LU2VZ -->

## Verification Sequence for Task 169 & 170 (Fresh Folder Gate)

**When:** 2026-06-26 · **Fact:** `P-JL4LU2VZ`
**Why:** Proves 0.4.1 tarball contains both fixes live, working despite DLL lock; fresh folder isolates test from session state

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-QUD4MMJ7 -->

## Confirmed preference for 2-button design (richer return value) over 3-button app

**When:** 2026-06-25 · **Fact:** `P-QUD4MMJ7`

<!-- decision:P-K6XCJKFF -->

## HC-10 cut because it's redundant with auto-heal and only high-end users would ad

**When:** 2026-06-25 · **Fact:** `P-K6XCJKFF`

<!-- decision:P-7TCUN4G4 -->

## Will not ship a version with bugs — a stated quality mandate

**When:** 2026-06-26 · **Fact:** `P-7TCUN4G4`

<!-- decision:P-X7ESVWDL -->

## Always deploy .venv and install all Python packages into it

**When:** 2026-06-26 · **Fact:** `P-X7ESVWDL`

<!-- decision:P-W4YMBJ5Z -->

## Kit install should pre-allow memory-write skill; appearance of permission prompt

**When:** 2026-06-26 · **Fact:** `P-W4YMBJ5Z`

<!-- decision:P-aE2QMEUG -->

## User follows "new-folder rule" — each test gate gets a fresh isolated folder (pe

**When:** 2026-06-26 · **Fact:** `P-aE2QMEUG`

<!-- decision:P-KWZMaGB5 -->

## Prefers simpler, more direct explanations; proactively asks for clarification wh

**When:** 2026-06-26 · **Fact:** `P-KWZMaGB5`

<!-- decision:P-LCUA399S -->

## All 6 sub-tasks of task-167 completed; unit-tested, reviewed, skill-review caugh

**When:** 2026-06-26 · **Fact:** `P-LCUA399S`

<!-- decision:P-BCEHTFEP -->

## 0.4.1 release gate workflow is: 0a (commit/push) → 0b (pack/install) → backup →

**When:** 2026-06-26 · **Fact:** `P-BCEHTFEP`

<!-- decision:P-LMNRQW2E -->

## v0.4.1 all pre-Session-1 gates PASS; headline features (now-roll self-heal, HC-1

**When:** 2026-06-26 · **Fact:** `P-LMNRQW2E`

<!-- decision:P-DPZAN24U -->

## Session 1 ready to begin in C:\Temp\cut-gate-v041 after Claude Code restart; gat

**When:** 2026-06-26 · **Fact:** `P-DPZAN24U`

<!-- decision:P-GWK57K7M -->

## Skill Permission Wildcard Syntax

**When:** 2026-06-26 · **Fact:** `P-GWK57K7M`
**Why:** The docs at code.claude.com/docs/en/permissions definitively show the space form. Using the wrong syntax could explain why permission rules appear present but still prompt.

<!-- decision:P-BWJKTNQY -->

## Workspace Trust Requirement for `.claude/skills/`

**When:** 2026-06-26 · **Fact:** `P-BWJKTNQY`
**Why:** This is a security model in Claude Code. The trust dialog gates all permission rules and skill load for untrusted folders, preventing execution of unreviewed code.

<!-- decision:P-JFS5DA2J -->

## Diagnostic Test: `:*` Allow-List vs Workspace-Trust

**When:** 2026-06-26 · **Fact:** `P-JFS5DA2J`
**Why:** Determine root cause — is the allow-list rule broken (doesn't match `:*`/bare forms) or is workspace-trust the blocking gate?

<!-- decision:P-P4JR23RD -->

## Before/After Config Diff to Reveal Tool Behavior

**When:** 2026-06-26 · **Fact:** `P-P4JR23RD`
**Why:** Tool docs are often ambiguous or outdated; the tool's actual output is authoritative.

<!-- decision:P-4UG42PaQ -->

## Two-Sub-Test Method for Isolating Skill Permission Gating

**When:** 2026-06-26 · **Fact:** `P-4UG42PaQ`
**Why:** Kit behavior depends on what Claude Code actually writes, not docs. Sub-tests isolate tool initialization from kit correctness.

<!-- decision:P-Z9LPQS3G -->

## Workspace Trust and Skill Permissions Are Independent Gates

**When:** 2026-06-26 · **Fact:** `P-Z9LPQS3G`
**Why:** Kit settings are inert until folder trust accepted; testing Skill behavior before accepting trust produces false negatives.

<!-- decision:P-TBUDHYTT -->

## Diagnostic Test Statement for Skill Capture

**When:** 2026-06-26 · **Fact:** `P-TBUDHYTT`
**Why:** Isolates skill-permission behavior from other Session 1 elements. Prevents test contamination: if prompt-free capture works for one rule, full Session 1 can proceed cleanly.

<!-- decision:P-L5WHXB9H -->

## CC 2.1.x mcp__server__* wildcard does not auto-approve MCP tools — need specific tool names

**When:** 2026-06-26 · **Fact:** `P-L5WHXB9H`
**Why:** The whole prompt-free promise broke at the v0.4.1 gate. We chased the Skill() form (Task 169) but the live ground-truth test proved the Skill allow-list was already correct — the real gap is the MCP wildcard mcp__cmk__* not suppressing per-tool prompts on CC 2.1.x. Caught only by watching what CC itself writes (the read-what-the-tool-wrote technique), not by docs (which claim the wildcard works).

<!-- decision:P-DW4Y4DLS -->

## Claude Code 2.1.x MCP Wildcard Auto-Approve Change

**When:** 2026-06-27 · **Fact:** `P-DW4Y4DLS`
**Why:** CC's upstream security tightening; explains the v0.4.1 regression and why Bug 171 happened

<!-- decision:P-DEaC6AAS -->

## Fresh Folder Verification Workflow for claude-memory-kit Releases

**When:** 2026-06-27 · **Fact:** `P-DEaC6AAS`
**Why:** End-to-end verification that all three v0.4.1 fixes work together (Skill form, npm exit, MCP wildcards). Unit tests can't catch these; only live prompts will.

<!-- decision:P-J9EDJSE7 -->

## v0.4.1 Fixed Three Prompt-Free Installation Bugs

**When:** 2026-06-27 · **Fact:** `P-J9EDJSE7`
**Why:** None of these three breaks are visible to unit tests (they require live Skill prompts or real locked-DLL installs). The cut-gate found them by live testing; they drove D-209/210/211 and Tasks 169/170/171.

<!-- decision:P-HGAQN79P -->

## SESSION CHECKPOINT v0.4.1 cut-gate — 3 fixes merged, awaiting CC update retest

**When:** 2026-06-27 · **Fact:** `P-HGAQN79P`
**Why:** Context at 0% / auto-compact imminent. The v0.4.1 gate found 3 real prompt-free/install bugs (all merged) but is NOT done: the user is about to update Claude Code, which may fix the skill/MCP prompt at the source — so we must retest on a fresh folder before deciding whether Task 171 is even needed. Durable-state-first so the next session resumes exactly here.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-YFTGDDA5 -->

## CC update does not fix MCP prompt — Task 171 validated

**When:** 2026-06-27 · **Fact:** `P-YFTGDDA5`
**Why:** The user wanted to know whether the Claude Code update alone fixes the prompt-free regression before deciding if Task 171 is load-bearing. The live test answers it definitively: it does not.

<!-- decision:P-27PL2ZB5 -->

## mk_remember links param InputValidationError (rough edge)

**When:** 2026-06-27 · **Fact:** `P-27PL2ZB5`
**Why:** A tool that rejects the model's natural input on first try and forces a retry is a UX rough edge worth fixing — even though it self-recovers, it wastes a turn and could confuse a less-capable model.

<!-- decision:P-YQX7SDVV -->

## OPEN: cmk MCP per-tool prompt — systematic investigation pending

**When:** 2026-06-27 · **Fact:** `P-YQX7SDVV`
**Why:** Two wrong theories were chased today (Task 171 allow-list; a false 'dev repo is prompt-free' reference). The corrected facts must survive the restart so the investigation resumes from verified ground truth, not from a faded or wrong assumption.

<!-- decision:P-B5XGGC3M -->

## MCP prompt = two-gate model; Gate 1 (server approval) is the untested fix

**When:** 2026-06-27 · **Fact:** `P-B5XGGC3M`
**Why:** Re-reading all five CC docs end-to-end (the user's request) revealed the prompt is a two-independent-gate model. The kit clears Gate 2 (tool allow-list) correctly but never clears Gate 1 (server approval) — which is the likely real cause, and is cleared by a settings field the kit does not currently write.

<!-- decision:P-PV532NCU -->

## SOLVED: enableAllProjectMcpServers:true = prompt-free MCP capture

**When:** 2026-06-27 · **Fact:** `P-PV532NCU`
**Why:** This is the answer to the whole-session-long prompt-free regression. Live-proven via a controlled single-variable test on a fresh folder — the kit's core promise (automatic, prompt-free capture) depends on it, and it must be the documented fix going forward, superseding the disproven Task 171 theory.

<!-- decision:P-JJRQT9V7 -->

## CONFIRMED: enabledMcpjsonServers:["cmk"] narrow form = prompt-free + safer

**When:** 2026-06-27 · **Fact:** `P-JJRQT9V7`
**Why:** Both the broad (enableAllProjectMcpServers) and narrow (enabledMcpjsonServers:[cmk]) forms tested prompt-free; the narrow form is chosen because it approves only the kit's own server, the correct security posture for a tool shipped to others.

<!-- decision:P-La4E54JK -->

## SKILL gate: docs say Skill(name *) space; kit writes Skill(name:*) colon — plus workspace-trust prereq

**When:** 2026-06-27 · **Fact:** `P-La4E54JK`
**Why:** The skill-use prompt is a distinct second gate from the MCP gate and still fires in every fresh folder. The skills doc documents a space-form prefix syntax that differs from the colon form the kit writes, AND a workspace-trust prerequisite — either or both could be the cause; it must be observed live, not guessed.

<!-- decision:P-GWVaLVBE -->

## SKILL gate is likely workspace-trust (one-time), not rule syntax — space form ruled out

**When:** 2026-06-27 · **Fact:** `P-GWVaLVBE`
**Why:** The space-form Skill rule didn't suppress the prompt, ruling out the syntax theory; the folder has no trust record, pointing at the documented workspace-trust prerequisite as the real skill-gate cause. Must confirm whether it clears after one approval.

<!-- decision:P-X6HLUKGM -->

## SKILL gate: clicking allow persists nothing → workspace-trust is the suspect, not syntax

**When:** 2026-06-27 · **Fact:** `P-X6HLUKGM`
**Why:** The skill prompt re-fires every session because clicking allow stores no approval — distinct from the MCP gate which did persist. All three Skill rule forms are present and still prompt, which per the docs points to the workspace-trust prerequisite, not rule syntax. The trust state is the one unconfirmed variable.

<!-- decision:P-LRRM4RPF -->

## SKILL prompt = model-auto-invoke confirmation, not allow-list-governed; auto-extract hook path is already prompt-free

**When:** 2026-06-27 · **Fact:** `P-LRRM4RPF`
**Why:** After ruling out every Skill rule form and confirming clicking allow persists nothing, the skill prompt is the model-invoke confirmation layer, outside permissions.allow. The kit's core automatic capture rides the Stop hook (prompt-free); only the explicit skill path shows this confirmation — which reframes whether it's even a blocker.

<!-- decision:P-MY56XZZ2 -->

## DECISIVE: automatic capture (Stop hook → headless --print → in-process writeFact) is structurally prompt-free

**When:** 2026-06-27 · **Fact:** `P-MY56XZZ2`
**Why:** This resolves whether the skill/MCP prompts threaten the kit's core promise: they do not. The default auto-extract path uses a background hook + a headless toolless claude --print + direct JS writes, none of which can show a user prompt. The prompts only affect the explicit/agentic paths.

<!-- decision:P-aDFRNUMD -->

## ROOT CAUSE: SKILL.md allowed-tools frontmatter triggers the approval prompt (changelog 3140)

**When:** 2026-06-27 · **Fact:** `P-aDFRNUMD`
**Why:** The CC changelog states skills with no additional permissions run without approval; the kit's SKILL.md declares allowed-tools (additional permissions), which forces the Use-skill approval. This is the real, primary-source-grounded cause — not rule syntax or workspace trust — and explains why every allow-list attempt failed.

<!-- decision:P-ZFY7KYAW -->

## Skill fix works (allowed-tools removed); now MCP cold-start race on first call

**When:** 2026-06-27 · **Fact:** `P-ZFY7KYAW`
**Why:** Removing allowed-tools fixed the skill prompt but surfaced an MCP cold-start race: the on-screen 'server isn't connected yet' message indicates the first mk_remember call beats the stdio server's connection on a fresh session, despite enabledMcpjsonServers being set.

<!-- decision:P-Z5NMSKZZ -->

## TENSION: skill allowed-tools pre-grants MCP tools — removing it fixes skill prompt but un-fixes MCP tools

**When:** 2026-06-27 · **Fact:** `P-Z5NMSKZZ`
**Why:** v041g/h were fully prompt-free WITH the skill's allowed-tools, which was pre-granting the MCP tools during skill execution; removing allowed-tools (to fix the skill prompt) reintroduced per-tool MCP prompts. The two prompts are coupled, so the fix must address both together, not one at a time.

<!-- decision:P-ZBS4a23S -->

## CORRECTION: per-tool MCP first-use prompt within one turn (no 2nd message); only skill allowed-tools suppresses it

**When:** 2026-06-27 · **Fact:** `P-ZBS4a23S`
**Why:** My prior note implied a second user message and a cold-start race; the user clarified no second preference was given — Claude chained mk_remember then mk_lessons_promote autonomously, and each distinct MCP tool prompts on first use. The settings.json allow-list does not suppress these; only the skill's allowed-tools grant did, for the tools it lists.

<!-- decision:P-3URUGUAa -->

## ANSWERED: MCP per-tool 'allow' does NOT persist across sessions (dev repo: 0 stored approvals despite dozens of clicks)

**When:** 2026-06-27 · **Fact:** `P-3URUGUAa`
**Why:** The user asked whether allow persists across sessions — the answer determines whether the prompt is a one-time cost or a recurring annoyance. Disk proof from the heavily-clicked dev repo shows zero persisted approvals, so it recurs every session; the settings allow-list does not suppress it, making the skill's per-run allowed-tools grant the most viable suppression for the agentic path.

<!-- decision:P-NT3M2GYT -->

## ZERO-popup route: steer capture to Bash cmk CLI (allow-listed, same safe path) not the MCP tools

**When:** 2026-06-27 · **Fact:** `P-NT3M2GYT`
**Why:** The user's actual goal is no popup at all, not one-click. The MCP per-tool popup is unsuppressable on 2.1.195, but Bash(cmk:*) is allow-listed and cmk remember writes through the identical safe path — so steering capture to the CLI instead of MCP achieves true zero-popup. The skill currently steers to MCP, which is the root of the popups.

<!-- decision:P-P49LTJYC -->

## RESOLVED: --from-file gives shell-proof AND popup-free capture — no MCP-vs-Bash trade-off

**When:** 2026-06-27 · **Fact:** `P-P49LTJYC`
**Why:** The shell-escaping concern was the only real reason to keep the popup-causing MCP path; the kit's existing --from-file path is both shell-proof (D-81-safe) and popup-free (Bash allow-listed), eliminating the trade-off and clearing the way to a fully prompt-free capture design.

<!-- decision:P-S7ML4UPH -->

## BEST FIX: PermissionRequest hook auto-approving mcp__cmk__* (keeps MCP path, narrow scope, matches existing hook pattern)

**When:** 2026-06-27 · **Fact:** `P-S7ML4UPH`
**Why:** The user proposed a PermissionRequest auto-approve hook and asked if it beats re-steering to Bash. It does: it kills the MCP popup while KEEPING the superior structured-param MCP path, persists across sessions, is narrowly scoped to the kit's own tools (not invasive), and matches the kit's existing PreToolUse hook pattern. Re-steering to Bash works but downgrades the capture path.

<!-- decision:P-4ZNAMQM9 -->

## allowed-tools history: Task 108 introduced the MCP popup; Task 69 original was Bash-CLI-only (prompt-free)

**When:** 2026-06-27 · **Fact:** `P-4ZNAMQM9`
**Why:** Tracing when allowed-tools changed shows the MCP-popup behavior is not original — Task 108 added MCP tools to the skill grant and steered toward them. The original Task 69 skill was Bash-CLI-only and prompt-free, which reframes the Bash-CLI fix as a restore rather than a downgrade and confirms where any skill edit must land (4 copies).

<!-- decision:P-6HARUCU5 -->

## Q1: popup is a CC 2.1.x change not a kit regression; Q2: allowed-tools (skill-scoped) ≠ permissions.allow (project-scoped), needn't match

**When:** 2026-06-27 · **Fact:** `P-6HARUCU5`
**Why:** The user asked whether the popup came from a kit change (it didn't — git shows months-stable config, so it's CC 2.1.x) and whether allowed-tools must match permissions.allow (it doesn't — they're different-scoped mechanisms evaluated by different machinery, which is why the skill grant suppresses the popup but the project rule doesn't).

<!-- decision:P-GSNNFRNE -->

## External proof: allowed-tools for MCP tools is a known unresolved CC bug (#17499, #18837→#14956 cluster)

**When:** 2026-06-27 · **Fact:** `P-GSNNFRNE`
**Why:** Two GitHub issues from other developers confirm auto-approving MCP tools via skill allowed-tools is a known, unresolved Claude Code problem — Anthropic explicitly left the MCP case unaddressed (#17499) and allowed-tools enforcement is a recurring bug cluster (#18837/#14956). This means the kit must not depend on that surface and should use a different documented mechanism (PermissionRequest hook or Bash CLI).

<!-- decision:P-4HQTBYFK -->

## COMPLETE design: one PermissionRequest hook (mcp__cmk__.* + Skill matchers) kills both popups, documented mechanism

**When:** 2026-06-27 · **Fact:** `P-4HQTBYFK`
**Why:** Docs confirm PermissionRequest matches any tool name including Skill, so a single hook mechanism can auto-approve both the MCP popup and the skill popup — using the documented auto-approve path, not the buggy allowed-tools surface. This is the complete zero-popup design for Task 172.

<!-- decision:P-MYNFF2PW -->

## SOLVED: PermissionRequest hook (mcp__cmk__.* + Skill) = prompt-free capture, live-proven on 2.1.195

**When:** 2026-06-27 · **Fact:** `P-MYNFF2PW`
**Why:** This is the resolution of the whole-day prompt-free hunt: the user's PermissionRequest hook idea, live-proven on a fresh folder, auto-approves both the MCP and skill popups so capture completes with no click — using the documented hook mechanism (not the buggy allowed-tools), keeping the MCP path, safely scoped, and persistent across sessions.

<!-- decision:P-BQ57723C -->

## DECISION: keep all layers (allow-list + allowed-tools) + ADD the hook — defense-in-depth, future-proof for CC bug fixes

**When:** 2026-06-27 · **Fact:** `P-BQ57723C`
**Why:** The user chose to keep every rule added (allow-list + skill allowed-tools) as harmless belt-and-suspenders that will activate natively once Claude Code fixes its known allowed-tools/wildcard bugs, and add the PermissionRequest hook as the working fix today. Additive, not subtractive — keeps the superior MCP path and future-proofs.

<!-- decision:P-YAEV66UK -->

## BLOCKER: claude.exe Windows-incompatible after CC update — live spawn-smokes + live-verify can't run here

**When:** 2026-06-27 · **Fact:** `P-YAEV66UK`
**Why:** The 4 full-suite failures are the live claude --print spawn-smokes failing because the Claude Code native binary is Windows-incompatible after today's update — not a kit bug and not jitter (suite is green skipping live Haiku; the diff doesn't touch that path). This blocks the live-Haiku gate and the final live-verify until the binary is fixed; recording it honestly rather than dismissing it.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-FTWRHF7H -->

## Claude.cmd Shim Workaround in .local/bin

**When:** 2026-06-27 · **Fact:** `P-FTWRHF7H`
**Why:** The broken @anthropic-ai/claude-code npm global install was being found by `claude.cmd` calls in tests. Uninstalling it alone would break `claude.cmd`. The shim ensures continuity without re-installing via npm.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-aPH3CKPU -->

## EBUSY on vec0.dll is cosmetic; npm install succeeds despite it (proven by `cmk -

**When:** 2026-06-26 · **Fact:** `P-aPH3CKPU`

<!-- decision:P-RUT3975R -->

## install.mjs grew from 26.9kB to 28.5kB in 0.4.1 tarball, confirming Task 170 fix

**When:** 2026-06-26 · **Fact:** `P-RUT3975R`

<!-- decision:P-VLC9D4Ya -->

## Claude Code only prompts for permissions when something triggers it (when user s

**When:** 2026-06-26 · **Fact:** `P-VLC9D4Ya`

<!-- decision:P-4T6WJBUF -->

## hadn't started `code .` yet; commands ended at `cmk install`

**When:** 2026-06-26 · **Fact:** `P-4T6WJBUF`

<!-- decision:P-MBKF3ZVK -->

## Do not ship fixes mid-diagnosis without consulting first — explore alternative s

**When:** 2026-06-27 · **Fact:** `P-MBKF3ZVK`

<!-- decision:P-DCaNUaDK -->

## Document everything exhaustively when context is near capacity to enable clean h

**When:** 2026-06-27 · **Fact:** `P-DCaNUaDK`

<!-- decision:P-J3GFMTAQ -->

## Task 172 live-verified from packed kit (no popup) — full suite + stress green — shipping

**When:** 2026-06-28 · **Fact:** `P-J3GFMTAQ`
**Why:** The prompt-free fix is proven end-to-end from the shipped artifact (packed → installed → default install auto-wires → no-click capture), with the full suite + stress green and the two-pass review complete. This closes the whole-day diagnosis and clears Task 172 to merge.

<!-- decision:P-PYaMHTAR -->

## Kit changes should be replicated to the live project after shipping in the kit (

**When:** 2026-06-28 · **Fact:** `P-PYaMHTAR`

<!-- decision:P-LLFCMSDM -->

## Do not include LICENSE/CONTRIBUTING/CHANGELOG sections in README; those have ded

**When:** 2026-06-28 · **Fact:** `P-LLFCMSDM`

<!-- decision:P-H3Ga44XJ -->

## README Structure for v0.4.1

**When:** 2026-06-28 · **Fact:** `P-H3Ga44XJ`
**Why:** README is scannable and progressive; secondary detail deferred to purpose-built docs; agent claims are explicit/verified

<!-- decision:P-aWBaP97F -->

## Secondary detail (Kiro reference) should live in separate docs (docs/KIRO.md), n

**When:** 2026-06-28 · **Fact:** `P-aWBaP97F`

<!-- decision:P-VPHZMR4X -->

## Use GFM + GitHub admonition syntax for formatting

**When:** 2026-06-28 · **Fact:** `P-VPHZMR4X`

<!-- decision:P-L3EaTHK7 -->

## Wants README structured like sinedied/tool-README repos (Azure serverless, run-o

**When:** 2026-06-28 · **Fact:** `P-L3EaTHK7`

<!-- decision:P-4MW445N2 -->

## Don't proactively restructure documentation without explicit approval; user pref

**When:** 2026-06-28 · **Fact:** `P-4MW445N2`

<!-- decision:P-PRD9U7T3 -->

## Documentation Structure & Tradeoff in claude-memory-kit

**When:** 2026-06-28 · **Fact:** `P-PRD9U7T3`
**Why:** npm landing page serves a different audience than root — people evaluating the package need enough info to decide without clicks elsewhere. Consistency vs. comprehensiveness at each landing page is a real structural tension in this project.

<!-- decision:P-NWJFG9HH -->

## npm Tarball & Doc Availability Strategy

**When:** 2026-06-28 · **Fact:** `P-NWJFG9HH`
**Why:** Balances fast npm installs (lean tarball) with a complete npm landing page for package evaluation; GitHub is the canonical deep-docs home

<!-- decision:P-CRRQ4RT2 -->

## Avoid Duplicating Authoritative Docs in Temp Locations

**When:** 2026-06-28 · **Fact:** `P-CRRQ4RT2`
**Why:** Only the authoritative doc is maintained; duplicates become stale and can mislead future sessions.

<!-- decision:P-AV4F6Sa9 -->

## User proactively checked whether newly-created checklist duplicates the authorit

**When:** 2026-06-28 · **Fact:** `P-AV4F6Sa9`

<!-- decision:P-ZB2AUXAV -->

## Claude Code `cd &&` Compound Command Prompting Edge

**When:** 2026-06-28 · **Fact:** `P-ZB2AUXAV`
**Why:** This is a documented edge case (gate doc D-80 / §16.57). It does NOT indicate a capture flow failure; gate sessions 1-2 confirmed the actual capture sequences were prompt-free. Future sessions may encounter this when running verification commands.

<!-- decision:P-G45AQZYN -->

## Session 3 (E1) Cold-Open Test Procedure

**When:** 2026-06-28 · **Fact:** `P-G45AQZYN`
**Why:** E1 is the final gate before v0.4.1 release. It validates that user preferences (layered, uv, ruff) promoted to the tool's default persona in Session 1 are correctly baked in.

<!-- decision:P-99XQ63aR -->

## v0.4.1 cut-gate FULLY PASSED — all CLI + Sessions 1-3 green, E1 wedge proven

**When:** 2026-06-28 · **Fact:** `P-99XQ63aR`
**Why:** The full v0.4.1 cut-gate passed end-to-end from the packed artifact, including the prompt-free capture headline (Task 172) holding through a real build flow and the cold-open wedge proven — the kit is verified ready to tag and publish.

<!-- decision:P-5BTBD4aX -->

## FastAPI Layered Backend Scaffold (Async PostgreSQL, SQLAlchemy 2.0)

**When:** 2026-06-28 · **Fact:** `P-5BTBD4aX`
**Why:** Validated scaffold matching user's recorded architecture preferences (thin routes → services → repos, Pydantic boundaries). Includes non-obvious patterns: flush-vs-commit in repos, expire_on_commit=False, shared SQLite fixture for request-scoped sessions in tests.

<!-- decision:P-7PX7BTVZ -->

## GitHub Repository SEO Optimization — Topics & About

**When:** 2026-06-28 · **Fact:** `P-7PX7BTVZ`
**Why:** GitHub SEO guides and community best practices confirm these optimizations improve discoverability for developers searching for memory tools, semantic search, Claude/Kiro integration, and local-first solutions.

<!-- decision:P-JCWYH36Z -->

## GitHub About/Topics Require Manual Paste

**When:** 2026-06-28 · **Fact:** `P-JCWYH36Z`
**Why:** GitHub repo metadata is only editable by the owner via the web UI. This is a permissions constraint, not a Claude limitation, but it creates a two-step workflow that's easy to overlook.

<!-- decision:P-3J72ZCKA -->

## Claude-memory-kit: GitHub About Configuration & User Tier Initialization

**When:** 2026-06-28 · **Fact:** `P-3J72ZCKA`
**Why:** Configures GitHub repo's public metadata for discoverability; initializes fresh persona tracking state for ongoing habit capture

<!-- decision:P-M5BFNR3R -->

## Two Distinct Memory-Recall Mechanisms in the Kit

**When:** 2026-06-28 · **Fact:** `P-M5BFNR3R`
**Why:** When describing or pitching the kit, conflating these mechanisms under a single "recall" concept obscures both its architecture and its value. The auto-load is often the more surprising and valuable feature.

<!-- decision:P-6MRTBLBH -->

## CLAUDE.md CI/Validator Binding Rule

**When:** 2026-06-28 · **Fact:** `P-6MRTBLBH`
**Why:** A prior publish-failure revealed CI was not checked on direct-to-main, and validators only caught the issue post-release. This rule prevents recurrence.

<!-- decision:P-aV37WG9C -->

## Dependency PR Decision Process

**When:** 2026-06-28 · **Fact:** `P-aV37WG9C`
**Why:** Merging breaking changes for currency alone wastes time and risk. The hard gate is CI green + compelling value, not "latest version."

<!-- decision:P-BYMDWX97 -->

## Security Scanning Stack

**When:** 2026-06-28 · **Fact:** `P-BYMDWX97`
**Why:** The project has comprehensive, automated security coverage. Future sessions need to know what safety gates are in place and trust them.

<!-- decision:P-3AE6UM2W -->

## CodeQL Alerts Close on Main Commit, Not NPM Release

**When:** 2026-06-28 · **Fact:** `P-3AE6UM2W`
**Why:** Clarifies the relationship between CodeQL workflow and release management; the previous entry expected alerts to auto-close but didn't explain the mechanism or its independence from npm versioning

<!-- decision:P-5AFG567T -->

## RESUME: commit the in-loop setDeep guard to main to close CodeQL #29 (v0.4.2 shipped but #29 still open)
_(retracted 2026-06-29)_

**When:** 2026-06-28 · **Fact:** `P-5AFG567T`
**Why:** Context ran out mid-decision. v0.4.2 published but CodeQL #29 (prototype-pollution) didn't actually close because the first guard was pre-loop; the corrected in-loop guard is done+tested but uncommitted. The alert closes on a main push (CodeQL re-scans main), independent of npm — so it needs only a commit to main, not a release.

<!-- decision:P-BEJQYEaZ -->

## CodeQL Alert #29 Fix—In-Loop Guard Requirement

**When:** 2026-06-28 · **Fact:** `P-BEJQYEaZ`
**Why:** Loop placement is non-obvious; shipping v0.4.2 claimed "3 alerts resolved" before CodeQL's docs were checked, leaving the actual fix incomplete. Future CodeQL alert work must consult query-help first.

<!-- decision:P-MLNREYVT -->

## PR #243—Final Checkpoint for Session Completion

**When:** 2026-06-28 · **Fact:** `P-MLNREYVT`
**Why:** Ensures continuity for next session. Clear termination condition (CodeQL re-scan closes #29).

<!-- decision:P-MNA5QMCG -->

## RESUME: PR #244 (direct === guard) to close CodeQL #37 — if it re-flags again, DISMISS as false-positive
_(retracted 2026-06-29)_

**When:** 2026-06-28 · **Fact:** `P-MNA5QMCG`
**Why:** The CodeQL prototype-pollution alert keeps re-flagging through 3 guard forms; PR #244 uses CodeQL's exact documented === pattern (highest confidence). Context ran out, so the next session must verify the merge closes it, with a clear stop-condition: dismiss as false-positive if a 4th re-flag occurs (the runtime guard is sound + tested; not exploitable).

<!-- decision:P-3WXW2EK4 -->

## CodeQL Prototype-Pollution Guard Recognition

**When:** 2026-06-28 · **Fact:** `P-3WXW2EK4`
**Why:** PR #244 uses the direct `===` form per CodeQL's documented sanitizer. Previous attempts (#29, #37) with Set-lookup caused repeated re-flagging; took 3 iterations to discover the constraint.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-FHAULU6M -->

## Current session is test/gate data only ("not really me"); proceeding with v0.4.1

**When:** 2026-06-28 · **Fact:** `P-FHAULU6M`

<!-- decision:P-Na6U7TPJ -->

## Injection (passive, session-start auto-load) and active recall (user-initiated s

**When:** 2026-06-28 · **Fact:** `P-Na6U7TPJ`

<!-- decision:P-LCYCaKMS -->

## User pushed back on dropping "relevant" from product pitch—values precision over

**When:** 2026-06-28 · **Fact:** `P-LCYCaKMS`

<!-- decision:P-M7EGA36Z -->

## Requesting documentation of current session state before auto-context-compaction

**When:** 2026-06-28 · **Fact:** `P-M7EGA36Z`

<!-- decision:P-G69aAGXa -->

## Proposing to merge PR #243 now and bundle both #29 and #151 into single v0.4.3 r

**When:** 2026-06-28 · **Fact:** `P-G69aAGXa`

<!-- decision:P-YNFFNRSC -->

## ADR-0012: Deferred Product Rename (Cross-Agent Trigger)

**When:** 2026-06-28 · **Fact:** `P-YNFFNRSC`
**Why:** Rename deliberately deferred while design matured. Trigger condition is now live; next major release is the natural rebranding moment.

<!-- decision:P-JRAF6ZV7 -->

## Borrowable Ideas from awrshift/claude-memory-kit

**When:** 2026-06-28 · **Fact:** `P-JRAF6ZV7`
**Why:** awrshift/claude-memory-kit is ahead on warmth (tour, proposal phrasing) and has one automation gap (git backfill) we lack. Comparison clarifies our strengths (rigor, automation, npm, breadth) and identifies real feature gaps.

<!-- decision:P-WML7VSB6 -->

## D-169: No Manual End-of-Day Rituals (Automation-First)

**When:** 2026-06-28 · **Fact:** `P-WML7VSB6`
**Why:** Manual rituals are fragile; design should self-correct instead of relying on users to remember to run commands.

<!-- decision:P-PU6T9CCK -->

## Already at v0.4.2; workflow uses tasks.md + decision log + version-lane

**When:** 2026-06-28 · **Fact:** `P-PU6T9CCK`

<!-- decision:P-KWQV23N7 -->

## Before implementing, will verify fit against actual tasks, version plan, and cod

**When:** 2026-06-28 · **Fact:** `P-KWQV23N7`

<!-- decision:P-XS5QEL2G -->

## Silent Auto-Drain + Optional Warmth Design Pattern

**When:** 2026-06-28 · **Fact:** `P-XS5QEL2G`
**Why:** Combines external warmth (proposing promotions) with internal automation philosophy (no manual trigger required). Tested decision: D-169 forbids manual rituals; optional mention adds transparency without gating.

<!-- decision:P-LP3NBRXa -->

## Three Borrowed Ideas Laned to Tasks + Versions

**When:** 2026-06-28 · **Fact:** `P-LP3NBRXa`
**Why:** Brainstorm comparison with awrshift/claude-memory-kit exposed three good ideas and one anti-pattern (manual `/close-day` ritual, rejected per D-169). Each idea now has a home in the roadmap.

<!-- decision:P-JKPFY539 -->

## Deep-Read Process for Evaluating Competing Projects

**When:** 2026-06-28 · **Fact:** `P-JKPFY539`
**Why:** README is marketing material. Biggest advantages are often buried in secondary docs or undocumented in code. A rigorous read surfaces true design vs pitch. Prior: the "awrshift" comparison suffered from surface-level claims.

<!-- decision:P-D3aLJF4T -->

## Read code and secondary docs (architecture, ADRs, design notes), not just README

**When:** 2026-06-28 · **Fact:** `P-D3aLJF4T`

<!-- decision:P-R3X4TBLZ -->

## Research→ADR→Build Workflow for Feature Adoption

**When:** 2026-06-28 · **Fact:** `P-R3X4TBLZ`
**Why:** Prevents premature build commitment; makes design decisions explicit; keeps research findings organized in release planning

<!-- decision:P-ZYQVKVHZ -->

## user's established practice is to run a cut-gate (full live verification) before

**When:** 2026-06-28 · **Fact:** `P-ZYQVKVHZ`

<!-- decision:P-6HFUXBJN -->

## Chose to finish the publish before updating About/topics, prioritizing critical

**When:** 2026-06-28 · **Fact:** `P-6HFUXBJN`

<!-- decision:P-BFVNEYaQ -->

## User questioned the decision to mirror npm README to root's lean structure, impl

**When:** 2026-06-28 · **Fact:** `P-BFVNEYaQ`

<!-- decision:P-BR5RAVUF -->

## CI gates merge decisions; red CI blocks merging.

**When:** 2026-06-28 · **Fact:** `P-BR5RAVUF`

<!-- decision:P-5KL5UKaE -->

## Better-sqlite3 is a native binary; test changes before merge.

**When:** 2026-06-28 · **Fact:** `P-5KL5UKaE`

<!-- decision:P-XZ469SEJ -->

## Project uses Dependabot for automated dependency bumps.

**When:** 2026-06-28 · **Fact:** `P-XZ469SEJ`

<!-- decision:P-9BPX64ZQ -->

## 13 Stuck Tasks — Categorization and Supersession Map

**When:** 2026-06-28 · **Fact:** `P-9BPX64ZQ`
**Why:** Risk of re-laning work that is already dead (superseded) or not actually needed. Group C requires investigation before committing; Groups A/B can move forward in parallel.

<!-- decision:P-7YE23aRT -->

## Concurrent-Write Race (Task 146) Severity Tied to Agent Multiplicity

**When:** 2026-06-28 · **Fact:** `P-7YE23aRT`
**Why:** Timing of 146 matters for risk/urgency. It's not needed for v0.4.0, but becomes load-bearing as agent count grows.

<!-- decision:P-MMY4ESK6 -->

## Release Laning and Task Dependencies (v0.4.4 + v0.5)

**When:** 2026-06-28 · **Fact:** `P-MMY4ESK6`
**Why:** Task assignment clarity prevents blocked work and surprises at release boundaries. Task 150 validates the principle: "design first, version second" prevents silent failures.

<!-- decision:P-XRWUWG5W -->

## SessionStart Hook Re-Injection (Accidental Mechanic, Untested)

**When:** 2026-06-28 · **Fact:** `P-XRWUWG5W`
**Why:** Re-injection is de-facto working but fragile and undocumented. Future maintainers might unknowingly break it.

<!-- decision:P-FT6QKCBS -->

## Task Gating Criteria (Decision Blockers and Gates)

**When:** 2026-06-28 · **Fact:** `P-FT6QKCBS`
**Why:** These are legitimate parked states (not forgotten). Each has a clear gate that, when crossed, unblocks the task. Makes the backlog legible.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-Ba5UKVX6 -->

## Preference for bundling related fixes into fewer releases rather than creating s

**When:** 2026-06-28 · **Fact:** `P-Ba5UKVX6`

<!-- decision:P-JHCKXJVE -->

## Three borrowed ideas now laned: Task 174 (git backfill, v0.4.x), Task 175 (/tour

**When:** 2026-06-28 · **Fact:** `P-JHCKXJVE`

<!-- decision:P-B46Y2M6S -->

## No naming collision with awrshift/claude-memory-kit; rename planned in ADR-0012

**When:** 2026-06-28 · **Fact:** `P-B46Y2M6S`

<!-- decision:P-SF3FLWM2 -->

## Will not skim the front page; will check primary sources (code/docs) before clai

**When:** 2026-06-28 · **Fact:** `P-SF3FLWM2`

<!-- decision:P-4AL3BZXW -->

## Tasks should be pinned to actual versions, not left vague or undocumented.

**When:** 2026-06-28 · **Fact:** `P-4AL3BZXW`

<!-- decision:P-P7TXKNa2 -->

## Link and Reference Triage Workflow

**When:** 2026-06-29 · **Fact:** `P-P7TXKNa2`
**Why:** External input must be evaluated systematically and logged to prevent re-examining the same idea, preserve decision reasoning, and enable audits for dropped concepts.

<!-- decision:P-WaB3AMYQ -->

## Research Base for Design Validation

**When:** 2026-06-29 · **Fact:** `P-WaB3AMYQ`
**Why:** Real-world implementations reveal hidden constraints, validate untested ideas, and prevent overconfidence. Grounding decisions in research provides justification for adoption, rejection, or deferral.

<!-- decision:P-75XLTRDa -->

## Memory-loop vision — continuous autonomous memory improvement

**When:** 2026-06-29 · **Fact:** `P-75XLTRDa`
**Why:** This frames a core architectural ambition for the kit — memory should improve autonomously between sessions, not just accumulate stale data

<!-- decision:P-PNPUTUSW -->

## Four Flavors of Memory-Improvement Systems

**When:** 2026-06-29 · **Fact:** `P-PNPUTUSW`
**Why:** Provides a framework to prioritize and sequence memory-improvement work. Task 179 will decide if these are one unified loop or separate complementary features.

<!-- decision:P-BS9S9KJ5 -->

## Hermes Is Skill-Library Curation, Not Memory Self-Improvement

**When:** 2026-06-29 · **Fact:** `P-BS9S9KJ5`
**Why:** Clarifies Hermes's scope; prevents confusion when Task 179 positions both memory improvement AND skill curation as separate but related features.

<!-- decision:P-VaVCPL2W -->

## Task 179 — Umbrella Task for Memory-Improvement Sequencing

**When:** 2026-06-29 · **Fact:** `P-VaVCPL2W`
**Why:** Consolidates scattered effort; ensures each flavor (A/B/C/D) is positioned correctly—either as a unified pipeline or as complementary features.

<!-- decision:P-AGSCLWSP -->

## Memclaw's 6 Passive Outcome Signals (3 Already Produced)

**When:** 2026-06-29 · **Fact:** `P-AGSCLWSP`
**Why:** Breaks a design blocker long-standing blocker. Passive signals are reachable without changing the core constraint.

<!-- decision:P-CBRTVKDQ -->

## Multi-Project Survey: 6 External Links + 1 Revisit Yields 10 Revisit-Notes

**When:** 2026-06-29 · **Fact:** `P-CBRTVKDQ`
**Why:** Documents ROI of multi-project external surveys and validates the discipline of re-checking live sources.

<!-- decision:P-J76QQ3KL -->

## Distinguish Code Gems From Pitch Copy

**When:** 2026-06-29 · **Fact:** `P-J76QQ3KL`
**Why:** Ensures captured knowledge is routed to the right place the first time, making it findable and actionable for its intended use (execution vs positioning).

<!-- decision:P-NKHH5BYD -->

## Pitch-Line Copy Candidates (D-224)

**When:** 2026-06-29 · **Fact:** `P-NKHH5BYD`
**Why:** Both are clean, memorable metaphors that directly explain core positioning. Worth preserving for the next README/About polish cycle.

<!-- decision:P-DUSJXHRY -->

## Article Verdict Pattern for Task Ingestion

**When:** 2026-06-29 · **Fact:** `P-DUSJXHRY`
**Why:** Ensures each ingested article's relevance, scope, and relationship to prior work are clear; enables principled decisions about what to keep, revise, or discard

<!-- decision:P-A3E5WU9F -->

## "Memory-as-Tool" Pattern — External Validation

**When:** 2026-06-29 · **Fact:** `P-A3E5WU9F`
**Why:** Our Task 149 "when-to-recall" fork (judgment-pulled vs always-search) is validated by external literature as a deliberate design pattern, suggesting the approach is sound and positions us alongside best practices.

<!-- decision:P-7NUMKYFH -->

## Post-Retrieval Filtering & Query Expansion (HyDE)

**When:** 2026-06-29 · **Fact:** `P-7NUMKYFH`
**Why:** The ML Mastery articles on context-aware search and effective context engineering document real techniques that directly address the paraphrase-recall problem (Task 65/99 already measures this gap).

<!-- decision:P-7EQa5V6Z -->

## RAPTOR — Hierarchical Summarization for Multi-Hop Reasoning

**When:** 2026-06-29 · **Fact:** `P-7EQa5V6Z`
**Why:** The "beyond vector search" ML Mastery article names the 5 next-gen RAG strategies; RAPTOR is the one genuinely new to our research (others — GraphRAG, ColBERT, HyDE, Agentic RAG — already appear in our task list).

<!-- decision:P-E3UELCGM -->

## RRF Configuration & Fusion Strategy

**When:** 2026-06-29 · **Fact:** `P-E3UELCGM`
**Why:** The ML Mastery hybrid-search tutorial encodes real implementation details that avoid subtle correctness bugs.

<!-- decision:P-AT4NHAQA -->

## Claude-Memory-Kit: Core Patent Novelty Research Queries

**When:** 2026-06-29 · **Fact:** `P-AT4NHAQA`
**Why:** Early positioning signal: determine whether ideas are Open (novel), Crowded, or Saturated in prior art.

<!-- decision:P-C2BJ2ZEZ -->

## Rust Crate Installation Workflow with C++ Dependencies on Windows

**When:** 2026-06-29 · **Fact:** `P-C2BJ2ZEZ`
**Why:** Understanding the build process and download cache behavior saves iteration time across install/reinstall cycles.

<!-- decision:P-GL75LQ73 -->

## Windows Terminal PATH Refresh After Visual Studio Build Tools Install

**When:** 2026-06-29 · **Fact:** `P-GL75LQ73`
**Why:** Windows/PowerShell-specific behavior: PATH caching requires full shell restart to load new binaries into the process environment.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-NR2KFGZM -->

## User confirms design-first approach for task 150 ("your instinct is right"); acc

**When:** 2026-06-28 · **Fact:** `P-NR2KFGZM`

<!-- decision:P-SBa6Y46Q -->

## User audits work for completeness/dropped concepts ("what about all the other id

**When:** 2026-06-29 · **Fact:** `P-SBa6Y46Q`

<!-- decision:P-X3AWXG6Z -->

## File tasks early (assign IDs, enter backlog) to track ideas and prevent loss (us

**When:** 2026-06-29 · **Fact:** `P-X3AWXG6Z`

<!-- decision:P-5SW9AKAL -->

## Brief affirmation confirms revisit-notes approach and validates instinct to re-c

**When:** 2026-06-29 · **Fact:** `P-5SW9AKAL`

<!-- decision:P-Y3B322DW -->

## Batch git commits across multiple projects/articles; wait until finishing at lea

**When:** 2026-06-29 · **Fact:** `P-Y3B322DW`

<!-- decision:P-FKL749WV -->

## Markdown/Git-Native Memory Space Now Crowded, Not Empty

**When:** 2026-06-29 · **Fact:** `P-FKL749WV`
**Why:** Refines our positioning. Differentiator is execution depth (auto-capture rigor, trust mechanisms, breadth) not novelty.

<!-- decision:P-H5HUXKX6 -->

## Patent Tool Is Too Noisy for Prior-Art Sweeps

**When:** 2026-06-29 · **Fact:** `P-H5HUXKX6`
**Why:** Time spent deep-reading 38 results × multiple queries yields diminishing returns. Better to use tool for breadth only and cherry-pick top results.

<!-- decision:P-7J94CRGR -->

## Capture Source — Agent Task-State via PostToolUse Hook

**When:** 2026-06-29 · **Fact:** `P-7J94CRGR`
**Why:** Reveals an underexplored capture channel. Task state is metadata-rich and orthogonal to user messaging; complements conversation-turn extraction.

<!-- decision:P-32Q5YHHV -->

## Concurrency Pattern — Partition-by-Writer (Tasks 146/50/148)

**When:** 2026-06-29 · **Fact:** `P-32Q5YHHV`
**Why:** Directly applicable to multi-agent scenarios (Tasks 146/50/148). Avoids distributed-systems complexity by enforcing ownership-based write safety.

<!-- decision:P-HJEBaWGL -->

## Market Finding — Git-Native Markdown Memory Space is Now Crowded

**When:** 2026-06-29 · **Fact:** `P-HJEBaWGL`
**Why:** Informs roadmap prioritization and competitive positioning. Category-first positioning no longer holds; depth and capture quality become the moat.

<!-- decision:P-47SKPKG7 -->

## Task 176 Reference — Typed Graph with Auto-Edge Maintenance on File Change

**When:** 2026-06-29 · **Fact:** `P-47SKPKG7`
**Why:** Direct reference implementation for Task 176's core requirement (auto-derive edges from markdown changes without explicit schema).

<!-- decision:P-YAQT3ER9 -->

## D-177 Self-Defeating Loop in Persona Graduation

**When:** 2026-06-29 · **Fact:** `P-YAQT3ER9`
**Why:** Known degradation causing personas to vanish; core problem Task 151 redesign addresses

<!-- decision:P-BMLU6Ga3 -->

## Task 151 Implementation Cadence

**When:** 2026-06-29 · **Fact:** `P-BMLU6Ga3`
**Why:** User review before implementation reduces rework and ensures design intent is clear

<!-- decision:P-WF2SKRFP -->

## Four-Move Redesign for D-177 (Persona Graduation Loop)

**When:** 2026-06-29 · **Fact:** `P-WF2SKRFP`
**Why:** Task 151 is fixing D-177, a self-defeating loop where high-trust persona traits are evicted due to cap overflow. The redesign is research-backed (Hermes/captain-claw precedents) and complete — all four moves are decided and grounded.

<!-- decision:P-3VGQYFZT -->

## letta memory model (code-read 2026-06-29): TWO durable tiers + a message buffer.

**When:** 2026-06-29 · **Fact:** `P-3VGQYFZT`
**Why:** Background-loop reference (Task 179) + 'core memory exempt from eviction' precedent (Task 151 Move 2). The maintainer is deciding whether to protect high-value memory from a cap-relief sweep; letta's answer is: durable tiers are never swept, only the message buffer is.

<!-- decision:P-BT9BNCQS -->

## Link-Out Convention for Design.md Evidence

**When:** 2026-06-29 · **Fact:** `P-BT9BNCQS`
**Why:** Prevents recurring mistakes of inlining large evidence blocks into the Spine, which bloats the critical design.md file. Future sessions need explicit guidance.

<!-- decision:P-M7PHRC7G -->

## ADR-0016 Clarification — Recurrence Gate vs. LLM Role

**When:** 2026-06-29 · **Fact:** `P-M7PHRC7G`
**Why:** User returned for clarification; prior explanation risked misdirecting task-151 and option choice. Corrected framing is essential for sound implementation.

<!-- decision:P-La4FVXJY -->

## Comparative Memory System Analysis — TencentDB as Counter-Example

**When:** 2026-06-29 · **Fact:** `P-La4FVXJY`
**Why:** Concrete counter-examples prevent overconfidence; TencentDB proves fragility is structural to LLM gates, not judgment rubric

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-3HD39BL2 -->

## v0.4.3 Build Checkpoint — Ready to Resume at 151.3

**When:** 2026-06-29 · **Fact:** `P-3HD39BL2`
**Why:** Clean checkpoint for next session; no re-derivation needed on resume. All context (decision, design, tests, task tracking) is locked in place.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-ULVXZUXA -->

## User prefers durable written capture of research findings; signals this with "wr

**When:** 2026-06-29 · **Fact:** `P-ULVXZUXA`

<!-- decision:P-752LM39L -->

## Bridge-Study Research Question — Synthesized Trait Recurrence Signal

**When:** 2026-06-29 · **Fact:** `P-752LM39L`
**Why:** The recurrence signal is critical to the promotion gate. Current code assumes a pattern that may not match how the 5 systems actually work; bridge study avoids guessing.

<!-- decision:P-WDaaVEFF -->

## Task 151 Structure and Status (In-Progress Multi-Part Implementation)

**When:** 2026-06-29 · **Fact:** `P-WDaaVEFF`
**Why:** Tracking multi-part staged implementation; need location + scope for resume

<!-- decision:P-C72TUV9Z -->

## Resume point Task 151.3 recurrence gate

**When:** 2026-06-29 · **Fact:** `P-C72TUV9Z`

<!-- decision:P-MB6NX5EP -->

## Task 151.3 bridge answer cite-and-sum

**When:** 2026-06-29 · **Fact:** `P-MB6NX5EP`

<!-- decision:P-JBDL39TN -->

## Trait Recurrence Gating Design (151.3)

**When:** 2026-06-29 · **Fact:** `P-JBDL39TN`
**Why:** This design was the open question blocking 151.3. The 15-system study empirically validated it. Saving this prevents re-deriving the same analysis.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-FQNMDSZN -->

## Resume point Task 151.4 (Move 2 demote-not-evict)

**When:** 2026-06-30 · **Fact:** `P-FQNMDSZN`

<!-- decision:P-U3JGW7WP -->

## Memory Commit Workflow — Hygiene & Privacy Validation

**When:** 2026-06-30 · **Fact:** `P-U3JGW7WP`
**Why:** Memory system integrity requires clean signal separation, privacy assurance, and gitignore discipline.

<!-- decision:P-ZVBQV4NG -->

## Persona Tier-U Cap Relief — Condense In Place (151.4)

**When:** 2026-06-30 · **Fact:** `P-ZVBQV4NG`
**Why:** Cap overflow + invisibility at cold-open was a real bug (confirmed pre-fix). In-place condense preserves tier-U visibility.

<!-- decision:P-WG2UHVZX -->

## Resume point Task 151.7 (trust update rule)

**When:** 2026-06-30 · **Fact:** `P-WG2UHVZX`

<!-- decision:P-ZTaNPL3T -->

## Decision Logging in Task Entries

**When:** 2026-06-30 · **Fact:** `P-ZTaNPL3T`
**Why:** Preserves reasoning across sessions; prevents re-deriving the same design decision or losing dependency chains that feed into later work.

<!-- decision:P-7D2GKaBC -->

## Memory System Dogfooding — Internal Use as Test Case

**When:** 2026-06-30 · **Fact:** `P-7D2GKaBC`
**Why:** Ensures the memory system works for real workflows and scale, not just theory; dogfooding drives product design and reveals gaps.

<!-- decision:P-S2SHMDGK -->

## Research-Faithful Design in Sweep Order Implementation

**When:** 2026-06-30 · **Fact:** `P-S2SHMDGK`
**Why:** Grounding design decisions in research rather than intuition produces more robust, maintainable systems; research captures known best practices.

<!-- decision:P-SZE7EEYa -->

## Vitest Pool Corruption — Transient Load Failures

**When:** 2026-06-30 · **Fact:** `P-SZE7EEYa`
**Why:** Distinguishes transient vitest infrastructure issues from real code failures; prevents false-alarm debugging when all loads fail but no actual tests fail.

<!-- decision:P-MY66RUPW -->

## Documentation Architecture — Authoritative Files and Verification Checklist

**When:** 2026-06-30 · **Fact:** `P-MY66RUPW`
**Why:** Complete doc trail prevents shipping with missing context. CHANGELOG is particularly easy to miss when features are mostly internal mechanism, but recurrence promotion + persona persistence ARE user-visible.

<!-- decision:P-aAPTRPN4 -->

## Release Lane Independence Pattern

**When:** 2026-06-30 · **Fact:** `P-aAPTRPN4`
**Why:** Allows efficient release batching (multiple independent features per version) while maintaining clear traceability, decision ownership, and accountability per task.

<!-- decision:P-PKQY4FNJ -->

## Resume point Task 151.13 (last 151 sub-task)

**When:** 2026-06-30 · **Fact:** `P-PKQY4FNJ`

<!-- decision:P-YRNXAYa9 -->

## Resume point v0.4.3 pre-merge (code-complete)

**When:** 2026-06-30 · **Fact:** `P-YRNXAYa9`

<!-- decision:P-L3X6TPYY -->

## npm run stress — Transient Flake and Fresh-Run Workaround

**When:** 2026-06-30 · **Fact:** `P-L3X6TPYY`
**Why:** Tool quirk affecting pre-merge gate reliability; must rule out false negatives

<!-- decision:P-ZZ3GYLUY -->

## Two Minor Review Fixes (Commit 9d785d3)

**When:** 2026-06-30 · **Fact:** `P-ZZ3GYLUY`
**Why:** Resolved minor review findings; ensures consistent initialization and resource efficiency

<!-- decision:P-NLDPRW9Z -->

## Whole-Branch Architecture Verification Passed

**When:** 2026-06-30 · **Fact:** `P-NLDPRW9Z`
**Why:** Holistic coherence check required before merge to confirm integration is sound

<!-- decision:P-JHCFGZ7U -->

## Manual Verification Gates for Tasks 74 and 151

**When:** 2026-06-30 · **Fact:** `P-JHCFGZ7U`
**Why:** Features depend on runtime agent/session state that cannot be simulated. Honest caveats prevent over-claiming automation; live verification required before production.

<!-- decision:P-LLZZSBP3 -->

## Release Workflow and Commands for Production

**When:** 2026-06-30 · **Fact:** `P-LLZZSBP3`
**Why:** Multi-step release with specific tooling; npm script is canonical (prevents hand-edits). Tag push triggers automated CI. Stress test must pass 5/5 before merge.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-EM6G7Q53 -->

## Prefers to limit research scope and skip deep-reading when signal-to-noise is lo

**When:** 2026-06-29 · **Fact:** `P-EM6G7Q53`

<!-- decision:P-A6RZGSWP -->

## User confirms v0.4.3 (Task 151 persona-promotion redesign) as next release targe

**When:** 2026-06-29 · **Fact:** `P-A6RZGSWP`

<!-- decision:P-EENQ2YUU -->

## Expects complete research backing, not partial examples — flagged incomplete 2-s

**When:** 2026-06-29 · **Fact:** `P-EENQ2YUU`

<!-- decision:P-WKC2NJCT -->

## chose "two fields" for persona promotion (recurrence-heat for promotion, outcome

**When:** 2026-06-29 · **Fact:** `P-WKC2NJCT`

<!-- decision:P-X95HB2BQ -->

## User doesn't recall ADR-0016 specifics; gap in persistent context around gate/LL

**When:** 2026-06-29 · **Fact:** `P-X95HB2BQ`

<!-- decision:P-EDXCNY3L -->

## User's standing directive — document all major decisions/workflow in the Spine (

**When:** 2026-06-29 · **Fact:** `P-EDXCNY3L`

<!-- decision:P-KUF6CPPL -->

## Release Workflow with cut-gate Testing

**When:** 2026-06-30 · **Fact:** `P-KUF6CPPL`
**Why:** The cut-gate design decouples artifact testing from publishing, allowing full validation of the real, version-correct artifact before the irreversible step (tag push).

<!-- decision:P-7PPKYDGG -->

## User conceptualizes memory linking as a graph structure ("isn't this like the st

**When:** 2026-06-30 · **Fact:** `P-7PPKYDGG`

<!-- decision:P-U5HYTaHY -->

## Release Ownership Role Boundary

**When:** 2026-06-30 · **Fact:** `P-U5HYTaHY`
**Why:** Ensures transparency and user control over outward-facing actions (npm publish, GitHub Release, git tags); prevents accidental commits to wrong branch or publishing wrong version

<!-- decision:P-J2TSSZQJ -->

## Triage Workflow for New Findings

**When:** 2026-06-30 · **Fact:** `P-J2TSSZQJ`
**Why:** Keeps backlog organized and ties new discoveries to active planning; reduces "nice to do" ideas getting lost between releases

<!-- decision:P-SLYA3XLY -->

## Cut-gate v0.4.3 Verification Checks

**When:** 2026-06-30 · **Fact:** `P-SLYA3XLY`
**Why:** This is the baseline gate for v0.4.3; documents what was verified before release and establishes the pattern for future gate iterations.

<!-- decision:P-LTPJG9K5 -->

## Release Command Sequence for npm Packages

**When:** 2026-06-30 · **Fact:** `P-LTPJG9K5`
**Why:** This is the standard release workflow for claude-memory-kit; next releases (0.4.4, 0.5.0) will follow the same pattern.

<!-- decision:P-NDEA4RL4 -->

## Tool Quirks Discovered in v0.4.3 Testing

**When:** 2026-06-30 · **Fact:** `P-NDEA4RL4`
**Why:** These are non-obvious behaviors discovered under live testing; future workflows or gate checks need to account for them.

<!-- decision:P-64M9a7VM -->

## Release Testing Procedure (cut-gate.md)

**When:** 2026-06-30 · **Fact:** `P-64M9a7VM`
**Why:** Self-contained release procedure guards against publishing incomplete/untested builds; centralized source of truth for release workflow.

<!-- decision:P-DVV326E3 -->

## User-Tier Memory Backup Before Testing

**When:** 2026-06-30 · **Fact:** `P-DVV326E3`
**Why:** Test probes write to user memory; without backup, real memory state can be overwritten or corrupted during testing.

<!-- decision:P-GAAY4WKJ -->

## Release Workflow: Full Sequence for v0.4.3 and Future Cuts

**When:** 2026-06-30 · **Fact:** `P-GAAY4WKJ`
**Why:** This is the canonical release workflow. It ensures features are validated via cut-gate before any publication. The backup prevents test writes from corrupting real user memory.

<!-- decision:P-5MAE2QYJ -->

## Pre-Release CI Gate

**When:** 2026-06-30 · **Fact:** `P-5MAE2QYJ`
**Why:** Ensures code quality and documentation consistency before shipping

<!-- decision:P-A7K5HNM7 -->

## Release Workflow (npm script + git)

**When:** 2026-07-01 · **Fact:** `P-A7K5HNM7`
**Why:** Script automates CHANGELOG + version management (prevents manual errors); reverting (not force-push) is safer for pure version-bump commits on main.

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-Y3P5YUE6 -->

## Gathers research from multiple sources (articles, URLs) and shares collections w

**When:** 2026-06-30 · **Fact:** `P-Y3P5YUE6`

<!-- decision:P-MJW2TBYQ -->

## Proceeding with full `patent` installation over manual registry sweep option (in

**When:** 2026-06-30 · **Fact:** `P-MJW2TBYQ`

<!-- decision:P-RHJaAYYU -->

## 151.4 shipped (8390c33); persona tier-U cap-relief bug fixed + CRLF regression-t

**When:** 2026-06-30 · **Fact:** `P-RHJaAYYU`

<!-- decision:P-QLCRTNWP -->

## Next: 151.5 (sweep order — low-trust-AND-stale first, high-trust persona never s

**When:** 2026-06-30 · **Fact:** `P-QLCRTNWP`

<!-- decision:P-W9ZULZMJ -->

## Pre-Release Testing Setup

**When:** 2026-07-01 · **Fact:** `P-W9ZULZMJ`
**Why:** Protects user data during pre-release testing and enables rollback if issues arise.

<!-- decision:P-EHXTGB2K -->

## Fresh CMK Install: Expected `cmk doctor` Baseline

**When:** 2026-07-01 · **Fact:** `P-EHXTGB2K`
**Why:** Future sessions running cut-gates or debugging health issues reference this baseline. A fresh install is healthy if it matches this pattern. HC-9 is essential for confirming v0.4.3 deployment integrity.

<!-- decision:P-FQNHPTPY -->

## Security & Data Integrity Validation Checklist

**When:** 2026-07-01 · **Fact:** `P-FQNHPTPY`
**Why:** The memory system must safely handle real credentials, workspace paths, and user data without accidental leaks or crashes in production.

<!-- decision:P-E4aYXK5P -->

## v0.4.3 Cut-Gate Multi-Phase Validation Structure

**When:** 2026-07-01 · **Fact:** `P-E4aYXK5P`
**Why:** This structured workflow ensures v0.4.3 passes both deterministic safety checks and live-session recall quality before release.

<!-- decision:P-NJHYLX3P -->

## Why LLM-Driven Gates Are Live-Test Flags, Not Assertions

**When:** 2026-07-01 · **Fact:** `P-NJHYLX3P`
**Why:** Live LLM decisions are inherently non-deterministic. The project deliberately accepts this tradeoff for the benefit of real LLM-driven classification in the promotion gate.

<!-- decision:P-7ZUCXDCQ -->

## Recurrence Mechanism: Fact Re-capture, Not Behavioral Repetition

**When:** 2026-07-01 · **Fact:** `P-7ZUCXDCQ`
**Why:** The kit's pitch—"traits you demonstrate but never declare get promoted"—could mislead users into expecting behavioral-pattern inference that doesn't exist. Recurrence counts fact re-emergence ≥3× in captures, not inferred action patterns. This gap between user intuition and actual design is meaningful to document before release.

<!-- decision:P-GL9NTCZ9 -->

## Cut-Gate Process for v0.4.3

**When:** 2026-07-01 · **Fact:** `P-GL9NTCZ9`
**Why:** Ensures discoveries made during development are captured before shipping, preventing data loss and enabling v0.4.4 planning.

<!-- decision:P-YP3XEYaP -->

## Shipping Principle: Fix Core-Promise Gaps Before Release

**When:** 2026-07-01 · **Fact:** `P-YP3XEYaP`
**Why:** Project opposes the lazy-framing move of shipping a product known to be broken against its headline claims. Honesty about capabilities vs. promises is foundational.

<!-- decision:P-XFKJ6QTV -->

## Release Triage: Broken Promises vs Future Features

**When:** 2026-07-01 · **Fact:** `P-XFKJ6QTV`
**Why:** Prevents shipping false headlines (broken core promises) while protecting against scope creep from features that look important but aren't load-bearing. A small, verified fix to an existing promise is worth doing before tag; everything else belongs in the next cycle.

<!-- decision:P-XFN5Q73F -->

## TDD Workflow for v0.4.3 Fixes (Tasks 182, 183)

**When:** 2026-07-01 · **Fact:** `P-XFN5Q73F`
**Why:** Small, verified fixes for core-promise gaps before shipping. Task 182 is load-bearing (persona search broken); 183 is cosmetic. Both high-confidence, low-risk changes.

<!-- decision:P-2KJXNF25 -->

## D-157 Rule — Version Assignment at Shipment

**When:** 2026-07-01 · **Fact:** `P-2KJXNF25`
**Why:** Pre-numbering creates false structure that misrepresents development reality and can lead to incorrect release planning.

<!-- decision:P-YT4aa3YD -->

## Deferred Task Decision Gate (Backlog Sweep Rule)

**When:** 2026-07-01 · **Fact:** `P-YT4aa3YD`
**Why:** User identified a real problem — 18+ tasks since v0.1 still unshipped because "ready" is not testable. This rule adds a forcing function: named triggers + mandatory sweep → prevents indefinite deferral.

<!-- decision:P-KaZ79ATN -->

## Task Planning & Laning Workflow

**When:** 2026-07-01 · **Fact:** `P-KaZ79ATN`
**Why:** Current state has tasks "fuzzy and in the air" without clear version placement. Explicit planning ensures a transparent, deterministic roadmap instead of deferring decisions during work.

<!-- decision:P-ULHVR7L2 -->

## Canonical Registry for Persona Search

**When:** 2026-07-01 · **Fact:** `P-ULHVR7L2`
**Why:** Hardcoding paths risks divergence when the registry changes. Using the canonical registry prevents drift.

<!-- decision:P-7W4CWPSD -->

## Release Handoff: PR Creation vs. Merge

**When:** 2026-07-01 · **Fact:** `P-7W4CWPSD`
**Why:** User retains final control over what ships to production.

<!-- decision:P-G4DGSZQC -->

## Task 185 Backlog-Triage Trigger

**When:** 2026-07-01 · **Fact:** `P-G4DGSZQC`
**Why:** Automates backlog cleanup after each release, preventing accumulation of stuck tasks.

<!-- decision:P-GJ9MU9DQ -->

## Two-Pass Review Discipline

**When:** 2026-07-01 · **Fact:** `P-GJ9MU9DQ`
**Why:** Skill-review provides a second perspective that catches issues the author's self-review misses. The discipline consistently adds value.

<!-- decision:P-5Y9QQ4GK -->

## Release Workflow — Cold-Open Testing Discipline

**When:** 2026-07-01 · **Fact:** `P-5Y9QQ4GK`
**Why:** Catches bugs that pass CI in dev repo but fail in real installs (learned from a prior release incident)

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`

<!-- decision:P-RES031CG -->

## RESUME — v0.3.1 cut-gate near-complete; PR

**When:** 2026-06-14 · **Fact:** `P-RES031CG`
