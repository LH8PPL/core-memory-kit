# ADR-0018 — Memory commit: the kit PROPOSES, the user approves, git stays the user's

- **Status:** Accepted (2026-07-02)
- **Task:** 150 (v0.4.4 rider) — "AI-judged memory-commit flow"
- **Relates:** D-235 (the pull + the manual interim), the no-auto-git position (D-122-era, 2026-06-11; reaffirmed in D-131's "curating is human-gated" and D-235), D-169 (manual rituals get forgotten), D-218 (basic-memory validation), D-260

## Context

The kit's committed tiers (`context/`) are its whole wedge — memory that travels with
`git clone`. But the capture pipeline only WRITES the files; nothing commits them. So the
durable memory a session accretes sits uncommitted until a human remembers `git add context/`
— and humans don't (the kit's own founding observation, D-169). Live precedent: during the
Task-151 build session the user had to say "commit the memories" twice, then: *"we need
something that makes you do it automatic, and not me reminding you"* (D-235). The failure
mode isn't hypothetical — memory that never lands in git doesn't survive a `git clone`,
doesn't reach teammates, and can be lost to a disk failure the rest of the repo would survive.

The standing constraint this must reconcile with: **the kit never runs git on its own.**
The no-auto-git position (D-122-era, reaffirmed since — note: later citations call it
"SETTLED D-126", a drifted number; D-126's entry is the gate-day SyntaxError bug — the
POSITION is real and settled, the number was loose) exists because a hook that silently
commits would put surprise commits in the user's history: wrong batching with unrelated
staged work, commits during a rebase, authorship confusion, and a publish gate the user
explicitly owns (their standing release rule: merge/tag/publish are the human's steps).

## Options considered

1. **Silent auto-commit hook** (SessionEnd/Stop commits `context/`). Rejected: violates the
   no-auto-git position; surprise commits; composes badly with in-flight rebases/staging;
   turns a memory tool into a git actor.
2. **A `cmk commit-memory` command the user must remember to run.** Rejected: re-creates the
   exact D-169 failure (a manual ritual nobody remembers) with an extra name to learn.
3. **PROPOSE-AND-APPROVE (adopted):** the kit DETECTS accrued uncommitted memory
   automatically and tells the MODEL at session start; Claude offers a one-tap commit in
   conversation; on the user's yes, Claude runs the ordinary `git add context/ && git commit`
   through the normal tool-permission flow — the user's tap IS the approval, and git is
   executed by the agent-with-permission, never by the kit.

Independent validation for option 3 (D-218): `basic-memory` — the most git-native
file-based competitor — arrived at the same shape (propose in chat, leave git to the user).

## Decision

Ship the **detection + proposal surface**, keep git in human-approved hands:

1. **Detection (automatic, no command):** at SessionStart, when the project is a git repo,
   `inject-context` counts uncommitted paths under `context/` (a bounded
   `git --no-optional-locks status --porcelain -uall -- context/` with a hard 400ms
   timeout — inside the hook's 500ms budget, and `--no-optional-locks` means not even
   git's opportunistic index refresh writes anything; any failure degrades to
   silence). `context.local/` never counts — it's gitignored by design.
2. **The proposal line (model-facing):** a bounded one-liner rides the injected snapshot
   (reserved out of the cap, same pattern as the temporal mention): *"N memory file(s) under
   context/ are uncommitted — offer the user a one-tap commit of their project memory; only
   act on their yes."* Claude then makes the offer in its own words at a natural moment.
3. **Execution stays ordinary:** the commit itself is a plain agent-run git command under
   the host's permission model. The kit ships no git-writing code path.
4. **The CLAUDE.md interim stands for THIS repo** (checkpoint #4's task-boundary flush with
   the pre-commit screen) — the dev repo has stricter needs (public repo, name-privacy scan)
   than the generic proposal line covers.

## Consequences

- The "did my memory actually get committed?" gap closes on the automatic path: the user is
  asked at the next session start, with a count, and answers with one word.
- No new command, no cron, no git side-effects. Non-git projects and clean trees see nothing.
- The proposal line is per-session-volatile (like the temporal mention) — it lives OUTSIDE
  the tier-block cap reserve, so snapshot cap semantics (§7.1) are unchanged.
- Deliberately NOT built: batching policy, commit-message generation in the kit, or a
  settings toggle — until live use shows the need (D-169: build the populated path first).
  If the proposal proves noisy (e.g. users who intentionally batch memory commits weekly),
  the revisit trigger is a user report of proposal fatigue; the fix candidates are a
  settings.json threshold (propose only at ≥N files) or a cooldown.

## Refinement 2026-07-11 — the pre-roll `now.md` is excluded from the offer (Task 206 / D-304 / D-315)

The v0.5.0 Kiro cut-gate proved a separately-correct-jointly-broken composition: the privacy
screen masks names on the COMMITTED sinks (transcript, `today-*.md`), but `now.md` holds the
raw turn between capture and its roll — names await the roll's compressor/L3 pass — and THIS
ADR's per-turn proposal offered `git add context/`, sweeping the unmasked buffer in if the
user accepted before the roll. Fix (direction (b) of the Task 206 entry): `buildCommitProposal`
now excludes `context/sessions/now.md` from both the dirty COUNT (a dirty-now.md-only tree
proposes nothing) and the OFFER (the proposal instructs staging context/ excluding the
pre-roll buffer — declaratively, since git stays agent-run per this ADR). Nothing is lost:
the roll drains now.md into the screened `today-*.md`, which a later proposal offers. The
Decision above is unchanged — this narrows WHAT is proposed, not WHO runs git.
