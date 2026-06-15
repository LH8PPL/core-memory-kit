---
title: FTS5 query preparation — SQLite primary source + basic-memory implementation
date: 2026-06-15
topic: search / FTS5 query sanitization (Task 153)
sources:
  - https://www.sqlite.org/fts5.html (§3 query syntax — PRIMARY)
  - https://github.com/basicmachines-co/basic-memory (sqlite_search_repository.py — closest design analog, FTS5 + markdown-native)
---

# FTS5 query preparation — what the spec says + what basic-memory ships

**Why this note:** Task 153 (the `mk_search "v0.3 …"` crash) needs a query-sanitization
layer. Before committing to an approach, checked the **SQLite FTS5 spec** (primary source)
AND **basic-memory's real implementation** (our closest design analog — Python, FTS5,
markdown-native, in our research base since 2026-05-22). Both corrected a latent assumption
(my training said "wrap the whole query in quotes" → that forces strict-phrase semantics and
hurts multi-word recall). Borrowed-implementation + non-obvious → worth recording (D-158).

## SQLite FTS5 spec (sqlite.org/fts5 §3) — the authority

- **Special tokens:** `"` (phrase delim), `*` (prefix), `+` (phrase concat), `^` (anchor),
  `:` (column filter), `-` (negative column filter), `AND`/`OR`/`NOT` (reserved, **case-sensitive**),
  `NEAR(...)`, `,` (NEAR arg sep), `( )` (grouping), `{ }` (multi-column filter), whitespace (implicit AND).
- **Bareword charset:** letters, digits, underscore, non-ASCII, the substitute char (cp 26).
  **A bareword may not be `AND`/`OR`/`NOT`.** Anything else (`.`, `-`, `:`, …) in a bareword → **syntax error**.
- **Quoting is the sanctioned escape:** a double-quoted string accepts any chars; the tokenizer
  (unicode61) then treats `.`/`-`/etc. as **separators**. So `"v0.3"` → tokens `v0` + `3`;
  `"user-explicit"` → `user` + `explicit`. The query parses AND finds the literal content.
- **Embedded `"` is escaped SQL-style by doubling it (`""`)** — NOT backslash. Non-obvious; easy to miss.
- Dot is a **separator**, not part of a bareword — which is exactly why a bare `v0.3` errors
  (`v0` then `.3` → the `.` violates the bareword grammar).

## basic-memory's implementation (sqlite_search_repository.py) — convergent + richer

`_prepare_search_term(term, is_prefix=True)`:

1. **Preserve explicit boolean queries.** If ` AND `/` OR `/` NOT ` appears (space-bounded),
   route to `_prepare_boolean_query` — split on the operators, quote only the *terms*, keep
   the operators. A power user's `pnpm OR npm` still works as a boolean.
2. **Per-token, not whole-query.** Multi-word simple queries become `word1* AND word2*`
   (implicit-AND preserved), NOT a strict `"word1 word2"` phrase. Confirms the per-token
   refinement over my original whole-query-quote plan.
3. **Two char classes:** `problematic_chars` (`" ' ( ) [ ] { } + ! @ # $ % ^ & = | \ ~ ``) and
   `needs_quoting_chars` (space `.` `:` `;` `,` `< > ? /` **and `-`**). Their comment on the
   hyphen: *"FTS5 can have issues with hyphens followed by wildcards"* — the exact `user-explicit` class.
4. **Escape then quote:** `escaped = term.replace('"', '""')` → `f'"{escaped}"'` (matches the spec).
5. **Prefix wildcards (`*`).** They append `*` for prefix matching on simple terms — a *recall
   enhancement* beyond the bug fix. Optional for us (broadens matches + shifts ranking).

## Decision for Task 153 (kit-specific)

Adopt the **per-token quote-when-special** core (validated by both the spec and basic-memory),
scoped to the kit's minimal need:

- Tokenize on whitespace. Leave already-`"`-quoted phrases as-is.
- A token containing any FTS5-special char OR equal to a bare `AND`/`OR`/`NOT` → escape embedded
  `"` (double it) + wrap in `"…"`. Plain barewords pass through untouched (multi-word stays implicit-AND).
- Apply in ONE shared helper before BOTH `runKeywordSearch` and `runTranscriptKeywordSearch`
  (the two `MATCH @query` sites in search.mjs).
- The existing `FTS5ParseError` path STAYS as the final fallback for anything still unparseable.
- **Defer prefix-`*` wildcards** — that's a recall-broadening feature, not part of the crash fix;
  revisit if recall benchmarks (Task 99) show it helps. (Keeping the diff to "make valid queries
  work," not "change ranking.")

This flips the 3 existing FTS5-error tests (`user-explicit`/`AND`/`badcol:hello`) from
asserting-error to asserting-success — the intended better behavior (recall "just works"),
documented as a justified test change, not a test-to-pass-the-code change.

## Tangential but important — flags Task 141b (node:sqlite migration, conditional)

Found openclaw issue #62328: **"node:sqlite missing FTS5 module — memory search keyword
fallback broken."** Real-world signal that `node:sqlite` builds may NOT ship the FTS5 module
that `better-sqlite3`'s prebuilt binaries include by default. **This is a THIRD gate for Task
141b** beyond the two already specced (perf bake-off + sqlite-vec loadExtension): confirm
`node:sqlite` has FTS5 compiled in on all three platforms, or the whole keyword-search layer
breaks. Added to the 141b spike checklist.

## Sources
- [SQLite FTS5 documentation §3 (query syntax)](https://www.sqlite.org/fts5.html)
- [basic-memory `sqlite_search_repository.py`](https://github.com/basicmachines-co/basic-memory/blob/main/src/basic_memory/repository/sqlite_search_repository.py)
- [openclaw #62328 — node:sqlite missing FTS5](https://github.com/openclaw/openclaw/issues/62328) (141b signal)
