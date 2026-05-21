#!/usr/bin/env node
//
// Stop hook — fires after every assistant turn.
//
// Does TWO things:
//   1. Captures the first ~500 chars of the turn into
//      context/transcripts/{today}.md (verbatim transcript trail).
//   2. Spawns the auto-extract helper in the background (detached, fire-
//      and-forget) which invokes `claude --print` on the turn and writes
//      any durable facts to MEMORY.md / USER.md / granular archive via
//      the memory-write skill.
//
// Step 1 is synchronous and fast. Step 2 is detached so the user never
// waits for the auto-extract subprocess to complete. If either step fails,
// the hook exits 0 — it must NEVER break the session.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

try {
  const raw = fs.readFileSync(0, 'utf8');
  if (!raw) process.exit(0);
  const input = JSON.parse(raw);

  // Defensive: payload shape varies across Claude Code versions.
  const text =
    (typeof input.response === 'string' && input.response) ||
    (typeof input.assistant_message === 'string' && input.assistant_message) ||
    (typeof input.last_assistant_message === 'string' && input.last_assistant_message) ||
    '';

  if (!text.trim()) process.exit(0);

  const today = new Date().toISOString().slice(0, 10);
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  // ---- Step 1 — transcript capture (synchronous) ----
  const tDir = path.join(projectDir, 'context', 'transcripts');
  const tFile = path.join(tDir, `${today}.md`);
  try {
    fs.mkdirSync(tDir, { recursive: true });
    const summary = text.slice(0, 500).replace(/\n{3,}/g, '\n\n');
    const timestamp = new Date().toISOString().slice(11, 19);
    fs.appendFileSync(tFile, `\n## ${timestamp}\n${summary}\n`);
  } catch {}

  // ---- Step 2 — auto-extract memory-worthy facts (background) ----
  try {
    const tmp = path.join(projectDir, 'context', 'transcripts', `.extract-${Date.now()}.tmp`);
    fs.writeFileSync(tmp, text, 'utf8');

    const extractScript = path.join(projectDir, 'scripts', 'auto-extract-memory.sh');
    if (fs.existsSync(extractScript)) {
      const child = spawn('bash', [extractScript, tmp], {
        detached: true,
        stdio: 'ignore',
        cwd: projectDir,
      });
      child.unref();
    } else {
      try { fs.unlinkSync(tmp); } catch {}
    }
  } catch {}
} catch {
  // Fire-and-forget. Never break the session.
}

process.exit(0);
