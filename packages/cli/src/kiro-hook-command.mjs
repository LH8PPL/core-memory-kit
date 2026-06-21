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
