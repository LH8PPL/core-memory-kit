# Repo read: HexmosTech/git-lrc

**Date:** 2026-07-21 · **Source:** https://github.com/HexmosTech/git-lrc, cloned to `C:/Projects/research-clones/git-lrc` at commit `dc12e677b97b77dc2b20569b9590104b9adbca38` (2026-07-08)

## Inventory

- **Language:** Go (`go 1.25.12`). No vendor dir; deps resolved via `go.sum` (module cache).
- **LOC:** 27,377 lines across `*.go` (non-vendor). Largest single file: `internal/appcore/review_runtime.go` (part of an 11,240-line `internal/appcore` package — the HTTP server + review-orchestration core). `storage/` (SQLite I/O) is ~340 lines total.
- **Stars/forks/issues (via `gh api repos/HexmosTech/git-lrc`):** 1,435 stars, 190 forks, 16 open issues. Created 2026-02-08, last push 2026-07-08.
- **License:** NOT OSI open source — a "fair-code" **Sustainable Use License (Modified)** (`LICENSE.md`): self-host/internal-use permitted, resale or redistribution as a competing service prohibited.
- **CI:** heavy — `.github/workflows/` has `gitleaks`, `osv-scanner`, `govulncheck`, `sbom`, `semgrep`, `confidence.yml`, plus a Windows AND macOS installer test and a `claude-live-smoke.yml`. Security-tooling-dense for a repo this size.

## What it claims

git-lrc bills itself as "Free, Micro AI Code Reviews That Run on Commit" — a `git commit`-hook that fires an AI review before the commit lands, with a browser-based Issue Navigator, a "Summary Deck" slide generator, per-repo `.lrc/rules/` context, and (per the README) a **feedback loop** where "thumbs up/down on each finding tunes future reviews, so signal-to-noise improves the more your team uses it." The README also uses the phrase **"institutional memory of every change without anyone maintaining a changelog"** for its Git Log Tracking feature.

## What the evidence actually shows

This is **not a memory system** in the core-memory-kit sense at all — it is a git-commit-time AI code reviewer. Every "memory"-adjacent noun in the README resolves, at the code level, to something much thinner:

1. **"Institutional memory" = one appended git-log line.** `## Git Log Tracking` (README:257) describes appending a status string to the commit message: `LiveReview Pre-Commit Check: ran (iter:3, coverage:85%)`. There is no store of *why* a change was made, no summary content, no searchable content — just an iteration count and a coverage percentage baked into the commit trailer.
2. **The SQLite "review_sessions" table is a tally, not a fact store.** `storage/attestation_review_db_io.go` opens `.git/lrc/reviews.db` (WAL mode) and has exactly ONE table, `review_sessions(id, tree_hash, branch, action, timestamp, diff_files, review_id)`. Its only queries are `COUNT(*)` by branch and an ordered select of `action='reviewed'` rows — used purely to compute the `iter`/`coverage` numbers above. No content, no embeddings, no retrieval.
3. **"Feedback loop... tunes future reviews" is an unverifiable proxy call.** `internal/appcore/review_runtime.go:832-837` and `:2906` (`handleFeedbackProxy`) show the local client does nothing but forward the browser's thumbs-up/down POST to `/api/v1/feedback` on a remote **LiveReview** API, injecting the user's API key server-side "so the browser never holds it." There is zero code in this repo implementing *how* that feedback changes anything. The tuning mechanism — if it exists — lives entirely in HexmosTech's closed-source LiveReview backend.
4. **Reviews themselves are not local/offline either.** `internal/appcore/review_runtime.go` (`loadConfigValues`, `liveReviewAuthFailureError`) shows every review submission requires authenticating against a `LiveReview` `APIURL` and a login flow (`lrc ui`). Even with "Bring Your Own AI Connector" (BYOK) configured, the request still routes through the LiveReview API, which presumably calls the configured provider server-side. This is a thin client to a hosted service, not an offline tool, despite the fair-code "self-host" license language.
5. **`.lrc/rules/` is a static, human-authored context bundle — not a learned/extracted one.** `internal/lrcrules/lrcrules.go` (`BuildRulesBundle`) concatenates `.lrc/rules/*.md` (INSTRUCTIONS.md first, then lexicographic), hard-capped at 3,000 UTF-8 bytes (`CharLimit`), each file preceded by a `## rules/<name>.md` header, sent as one instruction blob per review. `lrc config preview` shows the exact text before it's sent ("Nothing hidden"). Nothing writes to this directory automatically; a human maintains it, same as a CLAUDE.md file. **The comment on line 6-9 of that file explicitly states the actual concatenation-for-review-enforcement logic is server-side, in LiveReview's `internal/lrcconfig` package** — i.e. even the rules-injection mechanism this OSS repo *implements* is a client-side reimplementation of logic whose canonical/enforced copy is not in this repo at all.

## Graph usage — verified NO real graph store

Grepped `*.go` (non-vendor) for `graph|embed|vector|curat|consolidat|recall|forget|dream`: every non-noise hit is Go's own `embed` package (`//go:embed`) for bundling static assets, or the word "vector"/"graph" appearing in an unrelated context (a codename word-list in `internal/naming/friendly.go`; "dependency graph" as a risk-category description in the README's static-analysis checklist, `README.md:535`). **There is no persisted node/edge structure, no traversal code, no graph library import, anywhere in this repo.** "Graph" is not even a README word here the way it was for the three "graph memory" flagships the 2026-07-19 sweep (ADR-0023's research basis) caught shipping no graph — git-lrc doesn't claim graph memory at all, so there's no claims-vs-code gap on this axis; it simply has nothing to compare.

## Mechanism detail (the HOW)

- **Install:** `hooks/pre-commit.sh` / `prepare-commit-msg.sh` / `commit-msg.sh` / `post-commit.sh` + a `dispatcher.sh`, installed via `hooks/managed.go` + `hooks/operations.go`. A parallel **Claude Code integration** ships as an actual Claude Code skill: `hooks/claude/SKILL.md` (frontmatter `name: lrc`) plus `hooks/claude/blocking-review-git-commit.sh` — this installs a hook in `~/.claude/settings.json` (global) that blocks `git commit` inside a Claude Code agent session until the review UI is resolved. Repo-local enable/disable state is marker files under `.git/lrc/` (`disabled`, `disabled-git`, `disabled-claude`); global Claude wiring lives at `~/.lrc/claude/hooks/`.
- **Review flow:** `git lrc review` (or the commit-hook trigger) builds a diff, opens a local web server (`internal/appcore/review_runtime.go`, Preact UI served from an embedded FS via `internal/staticserve`), submits to the LiveReview API (authenticated), renders inline AI comments + the Issue Navigator + Summary Deck, and on Commit/Vouch/Skip writes one `review_sessions` row + the git-log trailer line.
- **Persistence surface, in full:** `.git/lrc/reviews.db` (SQLite, one table, per-repo, gitignored/local — not committed or shared with the team beyond the git-log trailer), `.lrc/` (committed, human-authored rules + ignore patterns), and the git commit-message trailer itself. That's the entire local persistence footprint.

## Relevance to core-memory-kit

**`graph_relevance: none`** — git-lrc ships zero graph store (no nodes/edges/traversal anywhere in the Go source); ADR-0023's edge-activation decision (`related:`/`[[slug]]` → an `edges()` table, recursive-CTE supersession walks) has nothing to compare against here — this repo isn't attempting relational memory at all, unlike the nine systems ADR-0023's sweep actually read.

**`task95_relevance: none`** — no dedup, no contradiction resolution, no consolidation pass, no dream/curation mechanism of any kind. The `review_sessions` SQLite table is operational metering (iteration counts for a coverage percentage), not a memory corpus; there is nothing here resembling Task 95's three-stage floor→batched-LLM-judge→AUTO/QUEUE-split design (design.md §21).

## Borrow candidates

- **`lrc config preview` — a command that shows the exact text sent to the model, verbatim, before any call happens** (`internal/lrcrules` + the `lrc config check/preview` verbs). This is a clean, cheap transparency primitive: "if it's sent to the model, you can see it first." Worth checking whether `cmk` has an equivalent for what actually gets injected into the session-start snapshot (as opposed to just reading the snapshot files after the fact) — if not, this is a plausible small addition.
- **Hard character cap on a hand-authored context bundle, enforced by a dedicated `check` command** (3,000-byte cap on `.lrc/rules/*.md`, validated offline). A reminder that a capped, offline-checkable budget on human-authored context (parallel to per-file/per-tier caps already in design §7.1) is cheap insurance against context bloat — nothing new mechanically, but the "offline check command that just validates the cap, no network call" packaging is tidy.
- **Git-log-trailer-as-audit-record** (`LiveReview Pre-Commit Check: ran (iter:3, coverage:85%)`) — embedding a compact provenance summary directly into the artifact it describes (the commit) rather than a side database, so the record travels with `git log`/`git blame` with zero extra tooling to view it. Loosely resonant with ADR-0002 (markdown/git as source of truth over opaque DB) but not directly transferable — core-memory-kit's provenance lives in frontmatter, not commit trailers, since it isn't reviewing commits.

## Reject candidates

- **The SaaS-proxy architecture itself.** Not applicable to core-memory-kit's local-first, no-server design (ADR-0002, the D-64 "no-server class" rejection cited in ADR-0023) — git-lrc's actual review and (claimed) feedback-tuning logic live in a closed-source backend the user must authenticate against; this is the opposite of the kit's markdown-source-of-truth, git-clone-portable posture.
- **The "institutional memory" / "feedback loop... tunes future reviews" marketing claims themselves**, as a *pattern to imitate in documentation*. They describe genuinely thin mechanisms (a log-line counter; an unverifiable server-side proxy) in memory-suggestive language. Worth filing alongside the D-153 "three graph-memory flagships shipped no graph" pattern as one more corpus data point: claims-vs-code drift is common enough across this corpus that it's worth treating vendor README memory-language as a hypothesis to verify, not a fact to cite, by default (which the project's own prior-art discipline already requires).

## Honest gaps

- **The actual review-request payload/response schema and the LiveReview backend's behavior are entirely unverifiable** — that logic is closed-source and not in this repo. Any claim about *how* (or whether) thumbs-up/down feedback changes future review output is unverified; I found only a proxy endpoint, not an implementation.
- I did not run the tool (no LiveReview account, no AI connector key configured) — this is a static code read only, no live-test.
- I did not read `internal/appcore/review_runtime.go` in full (11,240 lines in its package; I targeted the feedback/config/API-URL sections via grep + targeted reads, not a line-by-line pass) — it's possible there is client-side state I missed, but the grep sweep for graph/memory/consolidation keywords across the *entire* non-vendor Go tree came back clean, which is the load-bearing check for this task's question.
- Did not open any of the embedded screenshots/GIFs/video assets linked in the README (Issue Navigator GIF, Summary Deck GIF, "See It In Action" video) — visual-only claims about UI polish are unverified either way, but irrelevant to the memory/graph question this pass targets.
- Did not clone or read the non-English README translations (`readme/README.*.md`) — assumed content-parity with the English README, unverified.
