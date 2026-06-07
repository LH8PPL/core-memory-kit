// @doors: 1
// Door 2 N/A: pure functions — body/slug shaping + parsing a string. No disk
//   writes here; the on-disk State door for auto-extracted rich facts is owned
//   by cli-auto-extract.test.js (the routeRichFact → writeFact integration).
// Door 3 N/A: no subprocess — pure string functions.
// Door 4 N/A: no message-queue surface.
// Door 5 N/A: no NDJSON observability — the log surface is owned by cli-auto-extract.test.js.
//
// Task 103 — rich auto-extract facts ride the native-immune Stop-hook path.
//
// This file unit-tests the two PURE surfaces the feature rests on:
//   1. rich-fact.mjs — buildRichFactBody / slugifyFact, the shared body+slug
//      shaping extracted from subcommands.mjs so the explicit (`cmk remember`)
//      and automatic (auto-extract) rich-capture paths build identical files.
//   2. parseRichFacts (auto-extract.mjs) — parses the BEGIN_FACT…END_FACT blocks
//      the extraction Haiku emits for durable project KNOWLEDGE. Lives next to
//      buildExtractionInstructions (the prompt that defines the format), same as
//      parseCandidates does for the terse TRUST_ lines.

import { describe, it, expect } from 'vitest';
import { buildRichFactBody, slugifyFact } from '../packages/cli/src/rich-fact.mjs';
import { parseRichFacts } from '../packages/cli/src/auto-extract.mjs';

describe('Task 103 — rich-fact.mjs shared shaping', () => {
  describe('slugifyFact', () => {
    it('lowercases + collapses non-alphanumerics to single dashes', () => {
      expect(slugifyFact('Backend Architecture: Layered FastAPI')).toBe(
        'backend-architecture-layered-fastapi',
      );
    });

    it('never produces a doubled or edge dash', () => {
      const s = slugifyFact('  ***Hello___World!!!  ');
      expect(s).not.toMatch(/--/);
      expect(s.startsWith('-')).toBe(false);
      expect(s.endsWith('-')).toBe(false);
      expect(s).toBe('hello-world');
    });

    it('caps at 60 chars and falls back to "fact" when empty', () => {
      expect(slugifyFact('!!!').length).toBeGreaterThan(0);
      expect(slugifyFact('!!!')).toBe('fact');
      expect(slugifyFact('a'.repeat(200)).length).toBeLessThanOrEqual(60);
    });
  });

  describe('buildRichFactBody', () => {
    it('headline only → just the trimmed text', () => {
      expect(buildRichFactBody({ text: '  hello  ' })).toBe('hello');
    });

    it('appends **Why:** and **How to apply:** blocks when present', () => {
      const body = buildRichFactBody({
        text: 'Use uv, never pip',
        why: 'reproducible + fast',
        how: 'run uv sync on clone',
      });
      expect(body).toContain('Use uv, never pip');
      expect(body).toContain('**Why:** reproducible + fast');
      expect(body).toContain('**How to apply:** run uv sync on clone');
      // headline first, then why, then how, blank-line separated
      expect(body.indexOf('Use uv')).toBeLessThan(body.indexOf('**Why:**'));
      expect(body.indexOf('**Why:**')).toBeLessThan(body.indexOf('**How to apply:**'));
    });

    it('omits a blank Why/How rather than emitting an empty label', () => {
      const body = buildRichFactBody({ text: 'x', why: '   ', how: '' });
      expect(body).toBe('x');
      expect(body).not.toContain('**Why:**');
      expect(body).not.toContain('**How to apply:**');
    });

    it('preserves a multi-line (structured) body verbatim', () => {
      const structured = 'Layered backend:\n- Routes: thin HTTP\n- Services: logic';
      const body = buildRichFactBody({ text: structured, why: 'testable' });
      expect(body).toContain('- Routes: thin HTTP');
      expect(body).toContain('- Services: logic');
      expect(body).toContain('**Why:** testable');
    });
  });
});

describe('Task 103 — parseRichFacts (BEGIN_FACT…END_FACT blocks)', () => {
  it('parses a single complete block into all fields', () => {
    const out = [
      'BEGIN_FACT',
      'type: project',
      'title: Layered FastAPI backend',
      'body: Routes call services call repositories.',
      'why: keeps each layer testable + swappable',
      'how: new endpoints add a route→service→repo slice',
      'END_FACT',
    ].join('\n');
    const facts = parseRichFacts(out);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      type: 'project',
      title: 'Layered FastAPI backend',
      body: 'Routes call services call repositories.',
      why: 'keeps each layer testable + swappable',
      how: 'new endpoints add a route→service→repo slice',
    });
  });

  it('captures a multi-line / bulleted body until the next recognized key', () => {
    const out = [
      'BEGIN_FACT',
      'title: Backend layering',
      'body: The backend is layered:',
      '- Routes: thin HTTP layer, no logic',
      '- Services: business logic',
      '- Repositories: DB access',
      'why: separation of concerns',
      'END_FACT',
    ].join('\n');
    const facts = parseRichFacts(out);
    expect(facts).toHaveLength(1);
    expect(facts[0].body).toContain('The backend is layered:');
    expect(facts[0].body).toContain('- Routes: thin HTTP layer, no logic');
    expect(facts[0].body).toContain('- Repositories: DB access');
    // the body must NOT swallow the why: field
    expect(facts[0].body).not.toContain('separation of concerns');
    expect(facts[0].why).toBe('separation of concerns');
  });

  it('strips a YAML block-scalar indicator and dedents (real Haiku emits `body: |`)', () => {
    // Observed live: Haiku formats a multi-line body as a YAML block scalar.
    // The parser must not keep the literal `|` or the 2-space indentation.
    const out = [
      'BEGIN_FACT',
      'type: project',
      'title: Backend Architecture',
      'body: |',
      '  **Pattern:** layered FastAPI',
      '  - routes call services',
      '  - services call repositories',
      'why: core architecture',
      'END_FACT',
    ].join('\n');
    const facts = parseRichFacts(out);
    expect(facts).toHaveLength(1);
    expect(facts[0].body).not.toMatch(/^\|/); // no leading block-scalar indicator
    expect(facts[0].body.startsWith('**Pattern:** layered FastAPI')).toBe(true);
    expect(facts[0].body).toContain('- routes call services');
    expect(facts[0].body).not.toContain('  - routes'); // dedented
    expect(facts[0].why).toBe('core architecture');
  });

  it('treats an INDENTED key-like line as body content, not a field (key must be at line start)', () => {
    const out = [
      'BEGIN_FACT',
      'title: T',
      'body: summary',
      '  why: this is an indented bullet, still body',
      'why: the real rationale',
      'END_FACT',
    ].join('\n');
    const facts = parseRichFacts(out);
    expect(facts).toHaveLength(1);
    expect(facts[0].body).toContain('why: this is an indented bullet, still body');
    expect(facts[0].why).toBe('the real rationale');
  });

  it('allows optional whitespace before the colon (`title : x`)', () => {
    const facts = parseRichFacts('BEGIN_FACT\ntitle : Spaced\nbody: b\nEND_FACT');
    expect(facts).toHaveLength(1);
    expect(facts[0].title).toBe('Spaced');
  });

  it('parses multiple blocks in one output', () => {
    const out = [
      'BEGIN_FACT',
      'title: First',
      'body: one',
      'END_FACT',
      'BEGIN_FACT',
      'title: Second',
      'body: two',
      'END_FACT',
    ].join('\n');
    const facts = parseRichFacts(out);
    expect(facts).toHaveLength(2);
    expect(facts.map((f) => f.title)).toEqual(['First', 'Second']);
  });

  it('treats why/how as optional (a block with just title+body is valid)', () => {
    const facts = parseRichFacts('BEGIN_FACT\ntitle: T\nbody: B\nEND_FACT');
    expect(facts).toHaveLength(1);
    expect(facts[0].why).toBeFalsy();
    expect(facts[0].how).toBeFalsy();
  });

  it('defaults an absent or invalid type to "project"', () => {
    const noType = parseRichFacts('BEGIN_FACT\ntitle: T\nbody: B\nEND_FACT');
    expect(noType[0].type).toBe('project');
    const badType = parseRichFacts('BEGIN_FACT\ntype: nonsense\ntitle: T\nbody: B\nEND_FACT');
    expect(badType[0].type).toBe('project');
  });

  it('skips a block missing title or body (writeFact requires both)', () => {
    expect(parseRichFacts('BEGIN_FACT\nbody: orphan body\nEND_FACT')).toEqual([]);
    expect(parseRichFacts('BEGIN_FACT\ntitle: orphan title\nEND_FACT')).toEqual([]);
  });

  it('returns [] for output with no blocks (e.g. only terse TRUST_ lines)', () => {
    expect(parseRichFacts('TRUST_HIGH user: prefers uv\nSKIP')).toEqual([]);
    expect(parseRichFacts('')).toEqual([]);
    expect(parseRichFacts(null)).toEqual([]);
  });

  it('does not let a block missing END_FACT swallow a following block', () => {
    // Defensive: a missing END_FACT closes the block at the next BEGIN_FACT.
    const out = [
      'BEGIN_FACT',
      'title: A',
      'body: a',
      'BEGIN_FACT',
      'title: B',
      'body: b',
      'END_FACT',
    ].join('\n');
    const facts = parseRichFacts(out);
    expect(facts).toHaveLength(2);
    expect(facts.map((f) => f.title)).toEqual(['A', 'B']);
    expect(facts[0].body).toBe('a');
  });
});
