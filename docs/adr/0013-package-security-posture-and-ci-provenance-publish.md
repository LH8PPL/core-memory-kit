---
adr: 0013
title: Package security posture (SCA + SAST + secrets) and CI provenance publish
status: accepted
date: 2026-05-29
deciders:
  - the maintainer
  - Claude Opus 4.8
supersedes: null
superseded_by: null
related:
  - 0012-npm-publish-name-and-cross-agent-future.md
  - 0008-bank-airgap-deferred-to-future-version.md
tags:
  - security
  - supply-chain
  - sast
  - secrets
  - npm
  - provenance
  - ci
---

# 0013 — Package security posture and CI provenance publish

## Context

After v0.1.0 shipped to npm, the kit is a **published package that runs hooks on users' machines, spawns subprocesses, and auto-extracts conversation into _committed_ files**. The runtime poison-guard (PG-001..013, NFR-9) screens auto-extract writes, but there was **no repo/supply-chain-level security gate**, and the v0.1.0 publish leaked a bypass-2FA npm token (pasted into a file, then revoked). The user required a real security task before the v0.1.1 publish, and asked it be backed by **established tools** ("so we know nothing's missed"), explicitly comparing to the **Artifactory Xray + SonarQube** stack his team uses.

## Decision

Adopt a **GitHub-native / OSS security stack** — the same three pillars as Xray + SonarQube, without the enterprise infra — and move publishing to a **CI flow with signed provenance**.

| Pillar | Enterprise analogue | Chosen tool |
| --- | --- | --- |
| SCA — dependency CVEs / supply chain | Artifactory Xray | `osv-scanner` (OSV.dev) + `npm audit --audit-level=high` (hard gate) + Dependabot |
| SAST — code-level vulns | SonarQube | **CodeQL** (JavaScript) |
| Secrets | (JFrog Advanced Sec / add-on) | `gitleaks` + the GitGuardian app already on the repo |
| Publish integrity | (artifact signing) | CI `npm publish --provenance` via GitHub OIDC |

**Publish flow (the headline change):**

- **Original plan (pre-2026-05-29): local publish.** `npm publish` run from a contributor's machine, authenticating via a bypass-2FA token in `~/.npmrc`. This is what shipped v0.1.0 — and the token storage (plaintext on disk) is what leaked.
- **Implementation pivot 2026-05-29: CI provenance publish.** `.github/workflows/publish.yml` publishes on a `v*` tag from GitHub Actions with `permissions: id-token: write`, runs the full test suite as a gate, then `npm publish --provenance --access public`. The credential is a **least-privilege granular npm token** stored only as the encrypted `NPM_TOKEN` GitHub Actions secret. Rationale: (1) signed provenance proves each tarball came from this repo+commit; (2) the token never touches a laptop disk (the actual leak vector); (3) the publish is gated behind CI + scans. The old local path is preserved here for the decision trail but is no longer the sanctioned route.

  Note: CI is non-interactive, so the token **must** bypass 2FA (a runner can't enter an OTP). The security improvement is **scope + storage** (granular, expiring, encrypted-in-CI), **not** removing the bypass-2FA capability.

## Alternatives considered

- **Artifactory Xray** — rejected for this package: needs an Artifactory instance to host/scan artifacts; overkill for a public npm package. `osv-scanner` + Dependabot cover the same CVE/SCA ground for free, reporting into GitHub's Security tab. (License-compliance, which Xray also does, is deferred — add `license-checker` later if wanted.)
- **SonarCloud (hosted SonarQube)** for SAST — offered (free for public repos; matches the user's work tooling). The user chose **CodeQL** (GitHub-native, no external account/infra). SonarCloud's *quality/coverage/maintainability* dimension is a distinct concern, split to candidate Task 54, not folded into security.
- **Third-party `mukul975/Anthropic-Cybersecurity-Skills`** — rejected: verified to be 754 reference playbooks for an agent to *perform* security work, not executable package-scanning tooling; adopting 754 skills is the tool-bloat the project guards against.
- **Keep local publish, add scans only** — rejected by the user in favor of doing the full hardening (incl. provenance) before v0.1.1.

## Consequences

- v0.1.1 (and onward) ships only via the tagged CI publish, with provenance. **One-time setup required**: create a least-privilege granular npm token, add it as the `NPM_TOKEN` GH Actions secret, and revoke the old local token. (Documented in `SECURITY.md` + the build-log retrospective.)
- Every push/PR runs gitleaks + osv-scanner + `npm audit` (high/critical) + CodeQL; Dependabot opens weekly update PRs. The dev-only `vitest`/`vite`/`esbuild` moderates are **not shipped** and so are not gated — tracked via Dependabot.
- New surfaces are validator-pinned by `tests/security-posture.test.js` so the gates can't silently disappear.
