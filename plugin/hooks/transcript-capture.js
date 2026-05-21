#!/usr/bin/env node
//
// Stop hook (plugin version) — fires after every assistant turn.
// Same logic as the standalone version but loads the auto-extract script
// from the plugin root (CLAUDE_PLUGIN_ROOT) so the user's project doesn't
// need a copy of the .sh file.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

try {
  const raw = fs.readFileSync(0, 'utf8');
  if (!raw) process.exit(0);
  const input = JSON.parse(raw);

  const text =
    (typeof input.response === 'string' && input.response) ||
    (typeof input.assistant_message === 'string' && input.assistant_message) ||
    (typeof input.last_assistant_message === 'string' && input.last_assistant_message) ||
    '';

  if (!text.trim()) process.exit(0);

  const today = new Date().toISOString().slice(0, 10);
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');

  // ---- Step 1 — transcript capture (synchronous) ----
  const tDir = path.join(projectDir, 'context', 'transcripts');
  const tFile = path.join(tDir, `${today}.md`);
  try {
    fs.mkdirSync(tDir, { recursive: true });
    const summary = text.slice(0, 500).replace(/\n{3,}/g, '\n\n');
    const timestamp = new Date().toISOString().slice(11, 19);
    fs.appendFileSync(tFile, `\n## ${timestamp}\n${summary}\n`);
  } catch {}

  // ---- Step 2 — auto-extract (background) ----
  try {
    const tmp = path.join(projectDir, 'context', 'transcripts', `.extract-${Date.now()}.tmp`);
    fs.writeFileSync(tmp, text, 'utf8');

    const extractScript = path.join(pluginRoot, 'bin', 'auto-extract-memory.sh');
    if (fs.existsSync(extractScript)) {
      const child = spawn('bash', [extractScript, tmp], {
        detached: true,
        stdio: 'ignore',
        cwd: projectDir,
        env: { ...process.env, CMK_PROJECT_DIR: projectDir },
      });
      child.unref();
    } else {
      try { fs.unlinkSync(tmp); } catch {}
    }
  } catch {}
} catch {}

process.exit(0);
