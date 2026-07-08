// @doors: 1
// Door 2 N/A: pure string-transform module — no disk state; the redactions-log
//   WRITE happens at the call sites (capture-turn/memory-write), asserted in
//   their own suites (cli-capture-turn / cli-transcript-screen).
// Door 3 N/A: no subprocess — deterministic regex/set operations only.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: no NDJSON emission from this module (call sites own the log).
//
// Tests for Task 148.1 (ADR-0019, design §6.10) — the L1 deterministic PII
// pattern layer. Boundary: scanPii / maskPii. The contract under test:
//   - EMAIL/PHONE/USERNAME masked in place with stable placeholders;
//     HOME_PATH delegates to the existing sanitizeHomePaths (`~`).
//   - findings carry category + offsets, NEVER the matched text (memclaw —
//     an audit built from findings structurally cannot leak).
//   - redactions[] carries original→placeholder for the gitignored
//     redactions.log (the recovery surface) — the ONE place originals survive.
//   - invisible-Unicode/bidi stripped from the RAW string BEFORE pattern
//     matching (hermes — normalization/matching must not be evadable).
//   - over-mutation guard: text outside matched spans is byte-identical.

import { describe, it, expect } from 'vitest';
import {
  scanPii,
  maskPii,
  PII_PLACEHOLDERS,
  MAX_SCAN_CHARS,
} from '../packages/cli/src/pii-patterns.mjs';

describe('Task 148.1 — L1 PII patterns (pure, Door 1)', () => {
  describe('EMAIL', () => {
    it('masks an email with the stable placeholder and records category-only findings', () => {
      const input = 'authors = [{ name = "A Person", email = "someuser@gmail.com" }]';
      const { text, findings, redactions } = maskPii(input);
      expect(text).toContain(`email = "${PII_PLACEHOLDERS.EMAIL}"`);
      expect(text).not.toContain('someuser@gmail.com');
      // findings: category + offsets, never the matched text
      const f = findings.find((x) => x.category === 'EMAIL');
      expect(f).toBeTruthy();
      expect(typeof f.start).toBe('number');
      expect(typeof f.end).toBe('number');
      expect(JSON.stringify(findings)).not.toContain('someuser');
      // redactions: the recovery record DOES carry the original
      const r = redactions.find((x) => x.category === 'EMAIL');
      expect(r.original).toBe('someuser@gmail.com');
      expect(r.placeholder).toBe(PII_PLACEHOLDERS.EMAIL);
    });

    it('allowlists bot/example emails (noreply@, example.com/org, users.noreply.github.com)', () => {
      const input = [
        'Co-Authored-By: Claude <noreply@anthropic.com>',
        'docs use user@example.com and admin@example.org',
        'gh shows 12345+bot@users.noreply.github.com',
      ].join('\n');
      const { text, findings } = maskPii(input);
      expect(text).toBe(input); // untouched
      expect(findings.filter((f) => f.category === 'EMAIL')).toHaveLength(0);
    });
  });

  describe('PHONE (conservative — separators or + required)', () => {
    it('masks international and separator-formatted numbers', () => {
      const a = maskPii('call me at +972 54-123-4567 tomorrow');
      expect(a.text).toContain(PII_PLACEHOLDERS.PHONE);
      expect(a.text).not.toContain('54-123-4567');
      const b = maskPii('office: (555) 123-4567.');
      expect(b.text).toContain(PII_PLACEHOLDERS.PHONE);
    });

    it('does NOT mask versions, ports, dates, or bare digit runs (false-positive guard)', () => {
      const input = 'v0.5.0 on port 8000, built 2026-07-07, id 1234567890';
      const { text, findings } = maskPii(input);
      expect(text).toBe(input);
      expect(findings.filter((f) => f.category === 'PHONE')).toHaveLength(0);
    });
  });

  describe('HOME_PATH (delegates to sanitizeHomePaths)', () => {
    it('abstracts a home-dir prefix to ~ inside larger text', () => {
      const { text } = maskPii('set projects["C:/Temp/x"] in C:\\Users\\someuser\\.claude.json please');
      expect(text).toContain('~\\.claude.json');
      expect(text).not.toContain('C:\\Users\\someuser');
    });
  });

  describe('USERNAME (caller-supplied local usernames, token-bounded)', () => {
    it('masks the bare username token as it appears in ls/tool output', () => {
      const input = '-rw-r--r-- 1 some.username 197121 5740 Jul  7 22:22 CLAUDE.md';
      const { text, redactions } = maskPii(input, { usernames: ['some.username'] });
      expect(text).toContain(`1 ${PII_PLACEHOLDERS.USERNAME} 197121`);
      expect(text).not.toContain('some.username');
      expect(redactions.find((r) => r.category === 'USERNAME').original).toBe('some.username');
    });

    it('does not mask substrings inside larger words, and ignores usernames shorter than 3 chars', () => {
      const { text } = maskPii('the usernamespace module', { usernames: ['username', 'ab'] });
      expect(text).toBe('the usernamespace module');
      const { text: t2 } = maskPii('ab is short', { usernames: ['ab'] });
      expect(t2).toBe('ab is short');
    });
  });

  describe('invisible Unicode / bidi (checked on the RAW string, stripped before matching)', () => {
    it('strips zero-width/bidi chars and records the finding — so obfuscated PII cannot evade', () => {
      // zero-width space splits the email so a naive regex would miss it
      const input = 'mail some​user@gma​il.com now';
      const { text, findings } = maskPii(input);
      expect(text).not.toContain('​');
      expect(findings.some((f) => f.category === 'INVISIBLE_UNICODE')).toBe(true);
      // after stripping, the email pattern catches it
      expect(text).toContain(PII_PLACEHOLDERS.EMAIL);
      expect(text).not.toContain('someuser@gmail.com');
    });
  });

  describe('contracts', () => {
    it('over-mutation guard: everything outside matched spans is byte-identical', () => {
      const before = 'alpha beta someuser@gmail.com gamma delta';
      const { text } = maskPii(before);
      expect(text.startsWith('alpha beta ')).toBe(true);
      expect(text.endsWith(' gamma delta')).toBe(true);
    });

    it('scanPii is read-only (reports findings, never mutates)', () => {
      const input = 'reach someuser@gmail.com';
      const { findings } = scanPii(input);
      expect(findings.some((f) => f.category === 'EMAIL')).toBe(true);
      expect(input).toBe('reach someuser@gmail.com');
    });

    it('non-string input passes through unchanged (optional-field callers)', () => {
      expect(maskPii(undefined).text).toBe(undefined);
      expect(maskPii(null).text).toBe(null);
    });

    it('clean text: zero findings, zero redactions, identical output', () => {
      const input = 'refactor the service layer per the layered rule';
      const out = maskPii(input);
      expect(out.text).toBe(input);
      expect(out.findings).toHaveLength(0);
      expect(out.redactions).toHaveLength(0);
    });

    it('bounded scan: content past MAX_SCAN_CHARS is passed through unscanned (advisory guard, bounded worst case)', () => {
      const email = 'someuser@gmail.com';
      const pad = 'x'.repeat(MAX_SCAN_CHARS);
      const { text } = maskPii(pad + ' ' + email);
      // the tail past the bound is untouched — documented, not silent
      expect(text.endsWith(email)).toBe(true);
    });
  });
});
