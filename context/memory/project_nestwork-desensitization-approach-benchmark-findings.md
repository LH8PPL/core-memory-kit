---
id: P-YBCB3PBC
type: project
shape: State
title: Nestwork Desensitization Approach — Benchmark Findings
created_at: 2026-07-07T19:47:31Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: f5cd3af445e135c1354945e3c51a48f4a4b510888ef9f9e06505bd6ccc156125
---

**Implementation:**
- Desensitization contract is documentation + human-review gate (no runtime enforcement)
- Automated redaction: credentials/secrets (regex) + home-path substitution (`<HOME>`)
- No pattern-based detection for names, emails, or general PII

**Reusable patterns for cmk:**
- LLM screening output shape: `desensitized_content` / `redactions[]` / `review_flags[]`
- Placeholder vocabulary: `<EMPLOYER>`, `<COLLEAGUE>`, `<INTERNAL-URL>`, etc.
- Conservative posture: redact and flag rather than pass through

**Why:** Informs cmk's PII filtering architecture. Confirms names/emails need LLM judgment (not patterns). Provides reference implementation patterns suitable for cmk's design.

**How to apply:** Use output shape and placeholders as reference when implementing cmk's LLM screening. Adopt conservative posture. Note: documentation-only enforcement is insufficient; cmk needs runtime code enforcement.
