// Shared cooldown-marker helpers (Task 27 checkpoint extraction).
//
// Before this module, `touchCooldownMarker` + `isCooldownActive` lived
// inline in compress-session.mjs and were ONLY called from there.
// auto-extract.mjs never touched the marker — even though
// compress-session.mjs's design rationale explicitly documents that
// auto-extract participates in the cooldown ("the auto-extract
// subagent may have just spent the budget on a Stop-hook fire").
// That gap meant the cooldown only fired on SessionEnd→SessionEnd
// within 120s — which doesn't happen in practice — instead of the
// documented Stop→SessionEnd guarding. Each session paid ~2x the
// budgeted Haiku cost.
//
// This module is the single source of truth for cooldown state.
// Both compress-session and auto-extract import from here.

import {
  existsSync,
  mkdirSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

const COOLDOWN_RELATIVE = ['context', '.locks', 'last-haiku-call.ts'];

export const DEFAULT_COOLDOWN_MS = 120_000;

export function cooldownMarkerPath(projectRoot) {
  return join(projectRoot, ...COOLDOWN_RELATIVE);
}

export function isCooldownActive({ projectRoot, now, cooldownMs }) {
  const marker = cooldownMarkerPath(projectRoot);
  if (!existsSync(marker)) return false;
  let mtime;
  try {
    mtime = statSync(marker).mtimeMs;
  } catch {
    return false;
  }
  const nowMs = new Date(now).getTime();
  return nowMs - mtime < cooldownMs;
}

export function touchCooldownMarker({ projectRoot, now }) {
  const marker = cooldownMarkerPath(projectRoot);
  mkdirSync(dirname(marker), { recursive: true });
  if (!existsSync(marker)) {
    writeFileSync(marker, '', 'utf8');
  }
  const ts = new Date(now);
  try {
    utimesSync(marker, ts, ts);
  } catch {
    // utimes can fail on exotic filesystems; the existence of the
    // marker is the load-bearing signal — mtime drift by a few
    // seconds doesn't break cooldown logic.
  }
}
