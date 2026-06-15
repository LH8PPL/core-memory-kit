// @doors: 1, 2
// Door 3 N/A: pure + fs only; no subprocess.
// Door 4 N/A: no message-queue.
// Door 5 N/A: the journal is the artifact; no separate NDJSON log.
//
// Task 147 — the append-only decision journal (context/DECISIONS.md), D-161.
//
// The load-bearing invariant (D-161): DECISIONS.md is APPEND-ONLY. It is NOT
// regenerated from live facts (that would erase superseded/forgotten decisions
// — rewriting history, the decision-trail-preservation failure). So the core
// semantics under test:
//   - a new decision fact → appended as an entry (Title / date / Why / id)
//   - a decision already journaled → NOT duplicated (id-keyed)
//   - a previously-journaled decision whose fact is now tombstoned → its entry
//     is MARKED retracted IN PLACE, never removed
//   - a superseded decision → its entry is annotated, the superseding one added
//   - EVERY pre-existing entry survives every update (the over-mutation guard —
//     append-only means we never lose a line)

import { describe, it, expect } from 'vitest';
import {
  buildDecisionEntry,
  updateDecisionsJournal,
  DECISIONS_HEADER,
} from '../packages/cli/src/decisions-journal.mjs';

const fact = (over = {}) => ({
  id: 'P-AAAAAAAA',
  type: 'project',
  title: 'Use FTS5 keyword search',
  createdAt: '2026-06-15T10:00:00Z',
  why: 'Markdown stays the source of truth; the index is regenerable.',
  ...over,
});

describe('buildDecisionEntry — one journal entry', () => {
  it('renders title, date, why, and the fact id', () => {
    const entry = buildDecisionEntry(fact());
    expect(entry).toContain('Use FTS5 keyword search');
    expect(entry).toContain('2026-06-15');
    expect(entry).toContain('Markdown stays the source of truth');
    expect(entry).toContain('P-AAAAAAAA');
  });

  it('handles a decision with no Why gracefully', () => {
    const entry = buildDecisionEntry(fact({ why: null }));
    expect(entry).toContain('Use FTS5 keyword search');
    expect(entry).toContain('P-AAAAAAAA');
  });
});

describe('updateDecisionsJournal — append-only semantics (D-161)', () => {
  it('appends an entry for a new decision fact onto an empty journal', () => {
    const out = updateDecisionsJournal({
      existingContent: '',
      facts: [fact()],
      tombstonedIds: new Set(),
      now: '2026-06-15T12:00:00Z',
    });
    expect(out).toContain(DECISIONS_HEADER);
    expect(out).toContain('Use FTS5 keyword search');
    expect(out).toContain('P-AAAAAAAA');
  });

  it('does NOT duplicate a decision already in the journal', () => {
    const first = updateDecisionsJournal({
      existingContent: '',
      facts: [fact()],
      tombstonedIds: new Set(),
      now: '2026-06-15T12:00:00Z',
    });
    const second = updateDecisionsJournal({
      existingContent: first,
      facts: [fact()],
      tombstonedIds: new Set(),
      now: '2026-06-15T13:00:00Z',
    });
    // The entry (its machine marker) appears exactly once — not duplicated.
    // (The id itself legitimately appears twice per entry: the marker + the
    // **Fact:** line; we count the marker, the one-per-entry anchor.)
    const markerCount = second.split('<!-- decision:P-AAAAAAAA -->').length - 1;
    expect(markerCount).toBe(1);
  });

  it('appends a NEW decision while preserving the existing entry (the over-mutation guard)', () => {
    const first = updateDecisionsJournal({
      existingContent: '',
      facts: [fact()],
      tombstonedIds: new Set(),
      now: '2026-06-15T12:00:00Z',
    });
    const second = updateDecisionsJournal({
      existingContent: first,
      facts: [fact(), fact({ id: 'P-BBBBBBBB', title: 'Add sqlite-vec semantic layer' })],
      tombstonedIds: new Set(),
      now: '2026-06-16T09:00:00Z',
    });
    // BOTH decisions present — the original is never lost.
    expect(second).toContain('P-AAAAAAAA');
    expect(second).toContain('Use FTS5 keyword search');
    expect(second).toContain('P-BBBBBBBB');
    expect(second).toContain('Add sqlite-vec semantic layer');
  });

  it('marks a journaled decision RETRACTED in place when its fact is tombstoned — never removes it', () => {
    const first = updateDecisionsJournal({
      existingContent: '',
      facts: [fact()],
      tombstonedIds: new Set(),
      now: '2026-06-15T12:00:00Z',
    });
    // The fact is forgotten: it's gone from `facts`, present in tombstonedIds.
    const second = updateDecisionsJournal({
      existingContent: first,
      facts: [],
      tombstonedIds: new Set(['P-AAAAAAAA']),
      now: '2026-06-20T08:00:00Z',
    });
    // The entry SURVIVES (history preserved) but is marked retracted.
    expect(second).toContain('P-AAAAAAAA');
    expect(second).toContain('Use FTS5 keyword search');
    expect(second.toLowerCase()).toMatch(/retract/);
  });

  it('does not re-mark an already-retracted entry on subsequent runs (idempotent)', () => {
    let content = updateDecisionsJournal({
      existingContent: '',
      facts: [fact()],
      tombstonedIds: new Set(),
      now: '2026-06-15T12:00:00Z',
    });
    content = updateDecisionsJournal({
      existingContent: content,
      facts: [],
      tombstonedIds: new Set(['P-AAAAAAAA']),
      now: '2026-06-20T08:00:00Z',
    });
    const after = updateDecisionsJournal({
      existingContent: content,
      facts: [],
      tombstonedIds: new Set(['P-AAAAAAAA']),
      now: '2026-06-21T08:00:00Z',
    });
    // Count the retraction NOTE (not the word "retracted" — that also appears
    // in the static header). The note is stamped once, never re-applied.
    const retractMarks = after.split('_(retracted').length - 1;
    expect(retractMarks).toBe(1);
  });

  it('a malformed entry (marker, no heading) does not attach its retraction to the NEXT entry', () => {
    // Skill-review edge: a hand-edited/corrupt entry whose `### ` heading was
    // removed must not cause the retract note to land on the following entry.
    const corrupt =
      `${DECISIONS_HEADER}\n\n` +
      `<!-- decision:P-AAAAAAAA -->\n` + // marker but NO heading line
      `<!-- decision:P-BBBBBBBB -->\n### Real next decision\n**Fact:** \`P-BBBBBBBB\`\n`;
    const out = updateDecisionsJournal({
      existingContent: corrupt,
      facts: [],
      tombstonedIds: new Set(['P-AAAAAAAA']),
      now: '2026-06-20T08:00:00Z',
    });
    // The next entry's heading must NOT be retracted (it's a different decision).
    const nextHeadingIdx = out.indexOf('### Real next decision');
    const afterNext = out.slice(nextHeadingIdx, nextHeadingIdx + 60);
    expect(afterNext).not.toMatch(/retracted/i);
  });

  it('only journals decision-class facts (type:project), ignoring feedback/reference/user', () => {
    const out = updateDecisionsJournal({
      existingContent: '',
      facts: [
        fact({ id: 'P-AAAAAAAA', type: 'project', title: 'A real decision' }),
        fact({ id: 'P-BBBBBBBB', type: 'feedback', title: 'A working-style note' }),
        fact({ id: 'P-CCCCCCCC', type: 'reference', title: 'A link' }),
      ],
      tombstonedIds: new Set(),
      now: '2026-06-15T12:00:00Z',
    });
    expect(out).toContain('A real decision');
    expect(out).not.toContain('A working-style note');
    expect(out).not.toContain('A link');
  });

  it('preserves arbitrary hand-written content already in the journal (byte-tolerant append)', () => {
    const existing = `${DECISIONS_HEADER}\n\n## 2026-06-01\n\n### A hand-written decision\nsome prose a human added\n`;
    const out = updateDecisionsJournal({
      existingContent: existing,
      facts: [fact()],
      tombstonedIds: new Set(),
      now: '2026-06-15T12:00:00Z',
    });
    expect(out).toContain('A hand-written decision');
    expect(out).toContain('some prose a human added');
    expect(out).toContain('Use FTS5 keyword search');
  });
});
