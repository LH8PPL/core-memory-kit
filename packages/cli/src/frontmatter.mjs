// Canonical frontmatter serializer/parser. Single js-yaml-backed pair that
// every kit module uses to read and write per-fact frontmatter + scratchpad
// HTML-comment provenance (Layer 3+ will join).
//
// Per the Layer-2 review's I2 finding, the previous code had THREE different
// naive parsers across four modules (split-on-first-colon read; verbatim
// stringify write). Output and input weren't symmetric: booleans round-tripped
// as strings, arrays didn't round-trip at all, strings with `:` truncated on
// read. js-yaml fixes all of these AND lifts the B2 minimum-fix restriction
// that PR-1 added — values with `\n` / `\r` / `:` are now quoted properly.
//
// Public surface:
//   parse(text) → {frontmatter, body, parseError?}
//     - text: full file contents (with or without `---` markers)
//     - returns frontmatter as a typed object (string/number/bool/array/etc.)
//     - returns body as the markdown after the closing `---\n` (or empty)
//     - if no frontmatter block: frontmatter is null, body is the full text
//     - if YAML parse fails: frontmatter is null, parseError carries the message
//
//   format({frontmatter, body}) → text
//     - frontmatter: typed object; key order preserved per insertion
//     - body: markdown; written verbatim after the closing `---\n`
//     - if frontmatter is null/empty: just returns body
//
// js-yaml schema: CORE_SCHEMA (no implicit timestamp/Date conversion;
// ISO strings stay as strings). Output uses flowLevel: 1 — top-level
// mapping is block style; nested arrays render as `[a, b]` (matches the
// pre-refactor visual format).

import yaml from 'js-yaml';

const DUMP_OPTIONS = Object.freeze({
  schema: yaml.CORE_SCHEMA,
  flowLevel: 1,
  lineWidth: -1, // no line wrapping
  noRefs: true, // never emit YAML anchors / refs
  sortKeys: false, // preserve insertion order
});

const LOAD_OPTIONS = Object.freeze({
  schema: yaml.CORE_SCHEMA,
});

export function parse(text) {
  if (typeof text !== 'string') return { frontmatter: null, body: '' };
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: null, body: text };
  let frontmatter;
  try {
    frontmatter = yaml.load(m[1], LOAD_OPTIONS);
  } catch (e) {
    return { frontmatter: null, body: text, parseError: e.message };
  }
  if (frontmatter === undefined || frontmatter === null) {
    return { frontmatter: null, body: m[2] ?? '' };
  }
  if (typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    return {
      frontmatter: null,
      body: text,
      parseError: 'frontmatter is not a mapping',
    };
  }
  return { frontmatter, body: m[2] ?? '' };
}

export function format({ frontmatter, body }) {
  if (!frontmatter || (typeof frontmatter === 'object' && Object.keys(frontmatter).length === 0)) {
    return body ?? '';
  }
  const yamlBody = yaml.dump(frontmatter, DUMP_OPTIONS);
  return `---\n${yamlBody}---\n${body ?? ''}`;
}
