// @doors: 1
// Door 2 N/A: pure readers — no disk writes, no state mutation.
// Door 3 N/A: no subprocess.
// Door 4 N/A: no NDJSON/audit surface.
// Door 5 N/A: no message-queue.

// Tests for read-json.mjs — BOM-tolerant JSON config reading (Task 50 / D-187).
//
// The cut-gate-kiro live-test found that a user's `settings.json` written by a
// Windows editor with a UTF-8 BOM (EF BB BF) broke the kit's bare
// `JSON.parse(readFileSync(...))` — the Kiro default-agent guard silently
// failed to detect `chat.defaultAgent` and clobbered the user's default. A BOM
// on a Windows config file is common; the kit's config readers must tolerate it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripBom, parseJsonFile } from '../packages/cli/src/read-json.mjs';

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cmk-read-json-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const BOM = '﻿';

describe('stripBom', () => {
  it('strips a leading UTF-8 BOM', () => {
    expect(stripBom(`${BOM}{"a":1}`)).toBe('{"a":1}');
  });
  it('leaves BOM-free text untouched', () => {
    expect(stripBom('{"a":1}')).toBe('{"a":1}');
  });
  it('only strips a LEADING bom, not a mid-string one', () => {
    expect(stripBom(`{"a":"${BOM}"}`)).toBe(`{"a":"${BOM}"}`);
  });
  it('handles empty / non-string input gracefully', () => {
    expect(stripBom('')).toBe('');
    expect(stripBom(undefined)).toBe(undefined);
    expect(stripBom(null)).toBe(null);
  });
});

describe('parseJsonFile', () => {
  it('parses a normal (BOM-free) JSON file', () => {
    const p = join(dir, 'a.json');
    writeFileSync(p, '{"chat.defaultAgent":"their-agent"}', 'utf8');
    expect(parseJsonFile(p)).toEqual({ 'chat.defaultAgent': 'their-agent' });
  });

  it('parses a JSON file WITH a leading UTF-8 BOM (the Windows-editor case)', () => {
    const p = join(dir, 'bom.json');
    // exactly what PowerShell `Set-Content -Encoding utf8` / many Win editors write
    writeFileSync(p, `${BOM}{"chat.defaultAgent":"their-agent"}`, 'utf8');
    expect(parseJsonFile(p)).toEqual({ 'chat.defaultAgent': 'their-agent' });
  });

  it('returns the fallback for a missing file (no throw)', () => {
    expect(parseJsonFile(join(dir, 'nope.json'), { fallback: null })).toBe(null);
    expect(parseJsonFile(join(dir, 'nope.json'))).toBe(undefined); // default fallback
  });

  it('returns the fallback for malformed JSON (no throw)', () => {
    const p = join(dir, 'bad.json');
    writeFileSync(p, '{ broken,,,', 'utf8');
    expect(parseJsonFile(p, { fallback: null })).toBe(null);
  });
});
