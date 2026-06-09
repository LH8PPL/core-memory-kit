# Security Policy

`claude-memory-kit` runs inside your Claude Code sessions: it registers lifecycle **hooks**, **spawns subprocesses** (`claude --print`, the `cmk-*` bins), and **auto-extracts conversation content into files that get committed to git**. That makes its security posture matter more than a typical CLI's. This document describes the threat surfaces, what mitigates them, and how to report a vulnerability.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through **GitHub private vulnerability reporting**: the repo's **Security** tab → **Report a vulnerability** (Security Advisories). The report stays private — visible only to the maintainer — until a fix is coordinated, and the channel supports collaborating on the patch, issuing a CVE, and crediting you as the reporter.

Please include repro steps and the affected version. We aim to acknowledge within a few days and to ship a fix or mitigation before any public disclosure.

## Supported versions

The kit is pre-1.0. Security fixes target the **latest published** `0.2.x` release. Older versions are not back-patched.

## Threat surfaces & mitigations

| Surface | Risk | Mitigation |
| --- | --- | --- |
| **Hook execution** — `cmk-*` hooks run on every session/turn | A malicious or corrupted hook command runs in your shell | Hooks are PATH-resolved bare bin names (no `eval`, no shell interpolation of untrusted input). `cmk install` writes only the kit's known commands; `cmk doctor` (HC-2) verifies them. The plugin route ships the same bins under `${CLAUDE_PLUGIN_ROOT}`. |
| **Subprocess spawn** — auto-extract / compression spawn `claude --print` | Hang, resource leak, or an unbounded child | Every spawn site carries an enforced `timeoutMs` + cleanup (enforced by `scripts/validate-spawn-discipline.mjs`); detached children are bounded; the outer hook ceiling composes with inner timeouts (design §8.5). |
| **Auto-extract → committed files** — durable memory lands in `context/` (git-tracked) | A secret or injected instruction spoken in conversation gets written + committed | **Poison-guard** regex catalog (PG-001…PG-013) screens every auto-extract write for secrets + prompt-injection before it lands (NFR-9). `<private>` blocks are excluded from capture; `<retain>` forces keep. |
| **Memory poisoning** — crafted text tries to plant false "facts" or instructions | Future sessions load attacker-controlled context | Trust hierarchy (high/medium/low) with conflict + review queues; medium-trust auto-extracts route to `queues/review.md` for human promotion; provenance frontmatter on every observation for audit. |
| **MCP server** — the model drives memory ops as auto-invoked tools (`mcp__cmk__*`) | The model silently writes, or destructively tombstones, memory without the user seeing it | **Stdio-only, local** (no network listener, no auth surface to attack). Writes run the **same Poison_Guard + dedup + audit** path as the CLI. **Destructive ops are two-step**: `mk_forget` first returns a preview + a confirm token; nothing is tombstoned until a second call echoes that token — so an auto-invoking model can't silently delete. A build-time parity guard keeps the tool surface identical to the audited CLI verbs. |
| **Network** — the kit could exfiltrate memory | Silent data egress | **No silent network calls** (NFR-5): the only outbound calls are the documented Haiku compression/extraction requests. Markdown is the source of truth; indexes are local-only. |
| **Supply chain** — a dependency ships a CVE | Vulnerable code reaches users | See "Automated scanning" below. |

## Automated scanning (CI)

Every push + PR runs (see `.github/workflows/`):

- **Secrets** — `gitleaks` (full-history) + the GitGuardian app on the repo.
- **Known CVEs / supply chain** — `osv-scanner` (OSV.dev DB → Security tab) + `npm audit --audit-level=high` (**hard gate** on high/critical) + **Dependabot** (weekly update PRs for npm + GitHub Actions).
- **SAST** — `CodeQL` (JavaScript) on the kit's own source.

### Accepted, non-shipping findings

`npm audit` currently reports a small number of **moderate** advisories confined to the **dev/test toolchain** (`vitest` / `vite` / `esbuild`). These packages are **devDependencies — they are never published** in the npm tarball (the `files` whitelist ships only `bin/`, `src/`, `template/`, `README.md`). They do not reach a user's machine and so are not gated on; Dependabot tracks them for routine cleanup.

## Publishing integrity

Releases are published from CI (`.github/workflows/publish.yml`) on a `v*` tag, with a **signed npm provenance attestation** (GitHub OIDC) — proving each tarball was built from this repository at a specific commit. The publish credential is a **least-privilege granular npm token** stored only as the encrypted `NPM_TOKEN` GitHub Actions secret — never on a contributor's disk.

## Verifying what you install

```bash
npm view @lh8ppl/claude-memory-kit dist.attestations   # provenance present
npm pack @lh8ppl/claude-memory-kit --dry-run           # inspect tarball contents
```
