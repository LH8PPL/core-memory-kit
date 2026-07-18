---
id: P-HMF9AEQD
type: project
shape: State
title: 'SonarCloud exit-3 crash RESOLVED 2026-07-18 (D-350, overturning D-341): the trig'
created_at: 2026-07-18T07:02:53Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 68e4222aa7cd54988358b7c26a4a66aadf67550b2a6fd183e73193f275ce5745
---

SonarCloud exit-3 crash RESOLVED 2026-07-18 (D-350, overturning D-341): the trigger was OUR OWN test fixtures — projectRoot Windows-path literals in cli-register-crons.test.js that the A3S context collector partial-evaluates through join(projectRoot,'context',...) in the analyzed source, chasing caller values into EXCLUDED test files, then opendir'ing the derived phantom path. Proven by the crash path following two fixture renames and folding through a map+join obfuscator; fixed by making the fixtures runtime mkdtemp dirs (PR #299, first green scan since 2026-07-11). Earlier facts blaming a server-side flag / stale web-UI path were WRONG on reachability (the flag was only the necessary condition) and are tombstoned.

**Why:** The wrong server-side conclusion survived three sessions because the flag-rollout correlation was real but incomplete; the original grep missed backslash-escaped fixtures (grep BOTH path-separator forms)

**How to apply:** If a Sonar scan crashes on a phantom path again: grep the repo for the path in BOTH slash forms including escaped variants; suspect fixture literals flowing into path-joins of analyzed sources; runtime temp dirs defeat the constant-folder where string obfuscation does not
