#!/usr/bin/env node
//
// PreToolUse hook — guarantees the frozen memory snapshot loads
// before the first tool call of each session, without relying on
// Claude obeying CLAUDE.md's session-startup checklist.
//
// Reads context/USER.md, context/SOUL.md, context/MEMORY.md,
// context/memory/INDEX.md, and today's session log (if exists),
// formats them as a single block, and emits the block as
// additionalContext via the hook's output protocol.
//
// Fires once per session — uses a /tmp flag file to suppress subsequent
// firings within the same session. The flag is keyed by session_id when
// available, falling back to a per-day flag.

const fs = require('fs');
const path = require('path');
const os = require('os');

try {
  const raw = fs.readFileSync(0, 'utf8');
  if (!raw) process.exit(0);
  const input = JSON.parse(raw);

  // Resolve project dir.
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const ctx = path.join(projectDir, 'context');

  // Per-project flag prefix. Allows multiple projects to coexist on the
  // same machine without their session flags colliding.
  const projectSlug = path.basename(projectDir).replace(/[^a-z0-9-]/gi, '_');

  // One-per-session guard.
  const sid = input.session_id || input.sessionId || `day-${new Date().toISOString().slice(0, 10)}`;
  const flagPath = path.join(os.tmpdir(), `cmk-${projectSlug}-mem-injected-${sid.replace(/[^a-z0-9-]/gi, '_')}`);
  if (fs.existsSync(flagPath)) {
    process.exit(0);
  }

  const parts = [];
  const safeRead = (p, label) => {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      if (content.trim()) {
        parts.push(`\n--- ${label} (${p.replace(projectDir, '').replace(/^[/\\]+/, '')}) ---\n${content}`);
      }
    }
  };

  safeRead(path.join(ctx, 'SOUL.md'), 'Project soul (persona / disposition)');
  safeRead(path.join(ctx, 'USER.md'), 'User profile');
  safeRead(path.join(ctx, 'MEMORY.md'), 'Working memory (scratchpad)');
  safeRead(path.join(ctx, 'memory', 'INDEX.md'), 'Granular memory index');
  const today = new Date().toISOString().slice(0, 10);
  safeRead(path.join(ctx, 'sessions', `${today}.md`), `Today's session log`);

  if (parts.length === 0) {
    process.exit(0);
  }

  const block = [
    '# Memory snapshot (auto-injected on first tool call)',
    '',
    'The following files form this session\'s frozen memory snapshot. Reference them when responding; mid-session edits to these files persist to disk but take effect at the NEXT session.',
    parts.join('\n'),
  ].join('\n');

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: block,
    },
  }));

  try { fs.writeFileSync(flagPath, String(Date.now())); } catch {}
} catch (e) {
  process.exit(0);
}
