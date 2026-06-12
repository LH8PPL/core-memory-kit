// @doors: 1
// Door 2 N/A: checkPromptAssertions is pure (maps in → error array out).
// Door 3 N/A: no subprocess.
// Door 4 N/A: no message-queue.
// Door 5 N/A: no log surface.
//
// Task 137.1 — the prompt-assertion discipline made structural ("Door 3.5",
// design §17.9). The D-122 class: capture-turn composed the dedup snapshot
// into WHAT WAS SENT to Haiku, and no test pinned the sent prompt — the
// self-poisoning composition shipped through ~10 releases. Door 3 asserts a
// subprocess was CALLED; Door 3.5 pins the PROMPT CONTENT the LLM call
// carries (input + instructions composition).
//
// Enforcement (two-factor, the exit-doors precedent): every src module that
// calls `backend.compress(` must have a test file carrying BOTH
//   (a) the `@door-3.5:` declaration marker, and
//   (b) actual assertion tokens on the sent prompt (`input` / `instructions`
//       referenced in an expect()).
// Declared-but-not-asserted and asserted-but-undeclared both fail.

import { describe, it, expect } from 'vitest';
import {
  checkPromptAssertions,
  discoverLlmSpawnSites,
} from '../scripts/validate-prompt-assertions.mjs';

const goodTest = `
// @door-3.5: prompt-assertion — pins instructions + input composition
expect(mock.calls[0].input).toContain('USER_TURN');
expect(mock.calls[0].instructions).toContain('extract');
`;

describe('checkPromptAssertions — drift detection (137.1)', () => {
  it('passes when the site test declares the marker and asserts the sent prompt', () => {
    expect(
      checkPromptAssertions([
        { module: 'auto-extract', testFile: 'tests/cli-auto-extract.test.js', testText: goodTest },
      ]),
    ).toEqual([]);
  });

  it('flags a spawn site whose test has no @door-3.5 marker', () => {
    const errors = checkPromptAssertions([
      {
        module: 'daily-distill',
        testFile: 'tests/cli-daily-distill.test.js',
        testText: "expect(mock.calls[0].input).toContain('x');",
      },
    ]);
    expect(errors.some((e) => /daily-distill.*@door-3\.5/.test(e))).toBe(true);
  });

  it('flags a marker with no actual prompt assertions (declared-but-not-asserted)', () => {
    const errors = checkPromptAssertions([
      {
        module: 'weekly-curate',
        testFile: 'tests/cli-weekly-curate.test.js',
        testText: '// @door-3.5: prompt-assertion — totally pinned, trust me',
      },
    ]);
    expect(errors.some((e) => /weekly-curate.*no prompt assertion/.test(e))).toBe(true);
  });

  it('generic matcher tokens alone do NOT satisfy the assertion factor (the toMatch hole, skill-review fix)', () => {
    // The first INPUT_PIN_RE ended in an unanchored `|toMatch/` — any file
    // with a toMatch call passed the input factor without referencing the
    // sent input at all. This pins the hole closed.
    const errors = checkPromptAssertions([
      {
        module: 'daily-distill',
        testFile: 'tests/cli-daily-distill.test.js',
        testText: [
          '// @door-3.5: prompt-assertion — claims a pin',
          "expect(instructions).toMatch(/grounded/);", // instructions pinned…
          "expect(result.action).toMatch(/distilled/);", // …but input never referenced
        ].join('\n'),
      },
    ]);
    expect(errors.some((e) => /daily-distill.*no prompt assertion/.test(e))).toBe(true);
  });

  it('flags a spawn site with no test file at all', () => {
    const errors = checkPromptAssertions([
      { module: 'new-llm-thing', testFile: null, testText: null },
    ]);
    expect(errors.some((e) => /new-llm-thing.*no test file/.test(e))).toBe(true);
  });
});

describe('the real repo: every LLM-spawn site carries the Door-3.5 pin (the live invariant)', () => {
  it('discovers the known spawn sites and finds them all pinned', () => {
    const sites = discoverLlmSpawnSites();
    const names = sites.map((s) => s.module).sort();
    // The discovery itself must bite — these five are the known LLM-prompt
    // composition surfaces (compressor.mjs is the transport, not a composer).
    expect(names).toEqual(
      expect.arrayContaining(['auto-extract', 'auto-persona', 'compress-session', 'daily-distill', 'weekly-curate']),
    );
    expect(checkPromptAssertions(sites)).toEqual([]);
  });
});
