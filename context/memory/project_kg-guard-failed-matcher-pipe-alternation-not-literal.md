---
id: P-JHJXFDBJ
type: project
title: kg-guard-FAILED-matcher-pipe-alternation-not-literal
created_at: 2026-06-23T19:21:42Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 6412743b0226e35764f12428ac532e0974f57f8333f453c02fe0731a39f76d99
related: [kg-guard-kiro-cli-two-gates-rm-rewritten-to-removeitem, kiro-session1-complete-wedge-proven-live]
---

CUT-BLOCKER CONFIRMED + ROOT-CAUSED (KG-guard FAILED in kiro-cli 2.8.1, 2026-06-23): the delete-guardrail did NOT block `Remove-Item -Recurse -Force context/sessions` — context/sessions was DELETED. The data-loss guardrail (D-192/193, the whole reason it exists) does NOT protect a kiro-cli user. ROOT CAUSE (primary-source confirmed, kiro.dev/docs/cli/hooks): the preToolUse `matcher` is a LITERAL STRING, NOT a regex/glob — pipe alternation is NOT supported. Our matcher is "execute_bash|executeBash|shell" (a pipe alternation) → kiro-cli looks for a tool literally named "execute_bash|executeBash|shell", finds none → the hook NEVER FIRES → the destructive command runs unblocked. This is EXACTLY the I3 risk flagged in D-193 ("Kiro matcher alternation unverified — KG-guard covers it"). The IDE side worked because IDE hooks use a different matcher mechanism. THE FIX: change the kiro-cli preToolUse matcher from "execute_bash|executeBash|shell" to "*" (match ALL tools — safest, catches every shell variant + future tool names) OR "execute_bash" (the literal canonical shell name; "shell" is its alias). Docs: "*"=all tools, "@builtin"=all built-in, no-matcher-field=all tools. THIS IS A REAL v0.4.0 cut-blocker — the guardrail is a headline safety feature that's silently broken in kiro-cli. Note: kiro-cli has its OWN shell-approval gate (it DID prompt "shell requires approval"), so the user wasn't unprotected — but OUR guard must also work.

**Why:** The live KG-guard test FAILED — our delete-guardrail let a Remove-Item delete context/sessions in kiro-cli. Root-caused to the preToolUse matcher being a pipe-alternation ("execute_bash|executeBash|shell") when kiro-cli matchers are LITERAL strings (no alternation) — so it matched nothing and never fired. Exactly the D-193 I3 risk. A real v0.4.0 cut-blocker on a headline safety feature.

**How to apply:** Fix kiro-cli-agent.mjs: change the preToolUse matcher from 'execute_bash|executeBash|shell' to '*' (match ALL tools — safest + future-proof) or 'execute_bash' (literal canonical). Recommend '*' since the guard's decideGuard already filters to destructive+memory commands regardless of tool, so matching all tools costs nothing and catches every shell-tool variant. Test-first (assert the matcher is not a pipe-alternation). Update the kiro-ide-hooks matcher too if it has the same issue (IDE worked, but verify). Then re-test KG-guard live. Update D-193 (I3 resolved). This blocks the v0.4.0 tag.
