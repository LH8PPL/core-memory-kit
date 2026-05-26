// Tests for Task 24.6 — Poison_Guard NDJSON logger.
//
// Public boundary: logPoisonGuardRejection({projectRoot, ts,
// pattern_id, source_file, source_line, redacted_excerpt}) → logPath.
// Appends one NDJSON line per call. Schema pinned per design §6.7.
//
// Security contract (load-bearing): the cleartext matched text must
// never appear in the log line. The caller produces redacted_excerpt
// from checkPoisonGuard(); this writer just appends it as-is. But we
// pin the contract here so a future refactor that accidentally adds
// a `raw_text` field surfaces in the test diff.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logPoisonGuardRejection } from '../packages/cli/src/poison-guard.mjs';

describe('Task 24.6 — logPoisonGuardRejection() boundary', () => {
  let sandbox;
  let projectRoot;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-poison-guard-log-'));
    projectRoot = join(sandbox, 'proj');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('appends an NDJSON line to <projectRoot>/context/.locks/poison-guard.log', () => {
    const logPath = logPoisonGuardRejection({
      projectRoot,
      ts: '2026-05-25T10:00:00Z',
      pattern_id: 'secret_aws_secret_access_key',
      source_file: 'auto-extract-session-123',
      source_line: 1,
      redacted_excerpt: '...aws_secret_access_key = ***EXAMPLEKEY...',
    });
    expect(logPath).toBe(
      join(projectRoot, 'context', '.locks', 'poison-guard.log'),
    );
    expect(existsSync(logPath)).toBe(true);
  });

  it('the appended line parses as JSON with the documented schema (§6.7)', () => {
    const logPath = logPoisonGuardRejection({
      projectRoot,
      ts: '2026-05-25T10:00:00Z',
      pattern_id: 'injection_role_override',
      source_file: 'user-explicit',
      source_line: 7,
      redacted_excerpt: '***',
    });
    const lines = readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({
      ts: '2026-05-25T10:00:00Z',
      pattern_id: 'injection_role_override',
      source_file: 'user-explicit',
      source_line: 7,
      action: 'rejected',
      redacted_excerpt: '***',
    });
  });

  it('multiple rejections accumulate as multiple NDJSON lines', () => {
    logPoisonGuardRejection({
      projectRoot,
      ts: '2026-05-25T10:00:00Z',
      pattern_id: 'secret_github_pat',
      source_file: 'auto-extract',
      source_line: 1,
      redacted_excerpt: '...***...',
    });
    logPoisonGuardRejection({
      projectRoot,
      ts: '2026-05-25T10:01:00Z',
      pattern_id: 'secret_openai_anthropic_key',
      source_file: 'auto-extract',
      source_line: 2,
      redacted_excerpt: '...***...',
    });
    const logPath = join(projectRoot, 'context', '.locks', 'poison-guard.log');
    const lines = readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).pattern_id).toBe('secret_github_pat');
    expect(JSON.parse(lines[1]).pattern_id).toBe('secret_openai_anthropic_key');
  });

  it('creates the .locks directory if it does not exist', () => {
    // The fixture leaves projectRoot empty (no context/ tree).
    // Logger should mkdir -p the parent.
    expect(existsSync(join(projectRoot, 'context', '.locks'))).toBe(false);
    logPoisonGuardRejection({
      projectRoot,
      ts: '2026-05-25T10:00:00Z',
      pattern_id: 'secret_pem_private_key',
      source_file: 'test',
      source_line: 1,
      redacted_excerpt: '***',
    });
    expect(existsSync(join(projectRoot, 'context', '.locks'))).toBe(true);
  });

  it('the log line does NOT contain any field named raw_text or unredacted', () => {
    // Belt-and-suspenders: if a future refactor accidentally adds a
    // cleartext field, this test surfaces it before merge.
    const logPath = logPoisonGuardRejection({
      projectRoot,
      ts: '2026-05-25T10:00:00Z',
      pattern_id: 'secret_aws_secret_access_key',
      source_file: 'test',
      source_line: 1,
      redacted_excerpt: '...aws_secret = ***...',
    });
    const entry = JSON.parse(
      readFileSync(logPath, 'utf8').split('\n').filter(Boolean)[0],
    );
    expect(entry).not.toHaveProperty('raw_text');
    expect(entry).not.toHaveProperty('unredacted');
    expect(entry).not.toHaveProperty('matched_text');
    expect(entry).not.toHaveProperty('original');
  });
});
