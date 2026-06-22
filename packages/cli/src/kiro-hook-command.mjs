// kiro-hook-command.mjs — the platform-correct `cmk hook <event>` command string.
//
// Shared by BOTH Kiro hook surfaces (the IDE .kiro.hook writer + the CLI
// agent-config writer) so the platform logic lives in ONE place (the
// shared-module discipline).
//
// LIVE-VERIFIED 2026-06-21 (P-PM2CD6CB): Kiro runs a hook command through WSL on
// Windows, and WSL has no node, so a bare `cmk hook stop` fails ("node: not
// found"). Forcing the Windows-native shell with `cmd.exe /c` reaches the real
// node+cmk (proven: `cmd.exe /c cmk --version` → 0.3.5 in the Kiro chat). On
// macOS/Linux there's no WSL hop, so the native `cmk` runs directly.
//   Windows → `cmd.exe /c cmk hook <event>`
//   macOS/Linux → `cmk hook <event>`
//
// platform-commands: ignore (the Kiro-hook command runs in KIRO's shell, not the
//   kit's — this is the deliberate cmd.exe form; it keys on the INSTALL host's
//   process.platform, the right signal for "which OS will run these hooks").

const IS_WINDOWS = process.platform === 'win32';

/** Build the `cmk hook <event>` command, platform-wrapped. */
export function kiroHookCommand(event, cmkCmd = 'cmk') {
  const inner = `${cmkCmd} hook ${event}`;
  return IS_WINDOWS ? `cmd.exe /c ${inner}` : inner;
}

/**
 * Build the memory delete-guardrail command (D-192), platform-wrapped. Kiro's
 * `preToolUse` delivers `{ tool_name, tool_input: { command } }` on STDIN — the
 * SAME shape as Claude Code (verified from the real oh-my-kiro + vibekit
 * preToolUse hooks). So the `cmk-guard-memory` bin (which reads that stdin and
 * exits 2 to BLOCK) guards BOTH agents — no Kiro-specific adapter needed.
 */
export function kiroGuardCommand(binCmd = 'cmk-guard-memory') {
  return IS_WINDOWS ? `cmd.exe /c ${binCmd}` : binCmd;
}

/**
 * The kit's hook commands as CLI agent-config `toolsSettings.shell.allowedCommands`
 * REGEX patterns (D-194). Distinct from the IDE `kiroAgent.trustedCommands` shape:
 * the CLI agent-config uses REGEX (per the Kiro agent config reference —
 * `deniedCommands: ["git commit .*"]`), the IDE uses wildcard PREFIX. Without these,
 * the kiro-cli default agent prompts to approve its OWN inject/capture/guard hooks.
 * We escape the `cmd.exe` dot and anchor each to the kit's own commands only —
 * never a blanket `.*`.
 */
export function kiroCliAllowedCommands() {
  // Regex, START-ANCHORED (`^`) to mirror the IDE side's prefix-from-start
  // semantics (skill-review M2 — an unanchored `cmk hook .*` could match a
  // command that merely CONTAINS the phrase mid-string). `.` in cmd.exe is
  // escaped; `.*` matches the hook event / guard tail.
  const base = IS_WINDOWS
    ? ['^cmd\\.exe /c cmk hook .*', '^cmd\\.exe /c cmk-guard-memory']
    : ['^cmk hook .*', '^cmk-guard-memory'];
  return base;
}
