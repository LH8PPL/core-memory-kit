---
description: Tour this project's memory — what's captured, where it lives, how to recall it (core-memory-kit)
allowed-tools: Bash(cmk tour *), Bash(cmk tour)
---

Run `cmk tour` and present its output to the user conversationally.

Rules:

- Run the command; do NOT invent or embellish what the memory contains — the
  tour reads the user's real files, and your narration must stay faithful to
  its output (the kit's no-fabrication contract).
- Keep the presentation scannable: the tier table, what's captured (with the
  real examples the tour shows), how recall works, next steps.
- If the tour reports nothing captured yet, say so plainly and point at the
  ways it fills (automatic capture, "remember this", `cmk import-sessions`).
- `cmk doctor` is the health check; the tour is the explainer — if the user
  asks "is it working?", suggest doctor.
