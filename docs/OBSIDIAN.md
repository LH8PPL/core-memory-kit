# Browse your memory in Obsidian

Your project memory is already plain markdown with YAML frontmatter.

[Obsidian](https://obsidian.md) opens any folder of markdown as a **vault** — with search, backlinks, and a graph view — so you can *look at* what the kit has remembered, no extra tool to install and nothing to export.

This is a **companion**, not the kit's own viewer. Obsidian is great at arrangement; it doesn't know about trust tiers, conflict queues, or doctor status. Browse here; let the kit do the writing.

---

## Open it (30 seconds)

1. Install [Obsidian](https://obsidian.md) (free).
2. **Open folder as vault** → pick **`context/memory/`** inside your repo.
3. That's it. Every fact is a note; the graph and backlinks work immediately.

**Open `context/memory/`, not `context/`.** The `memory/` folder is your facts, two generated helper notes, and an `archive/` subfolder (superseded facts and tombstones the kit keeps for history — they'll appear in the file list and search; add `archive/` to Obsidian's **Settings → Files & Links → Excluded files** if you'd rather hide them). The parent `context/` also holds locks, the search index, queues, and raw session logs — noise you don't want in a browse view. See [Keep the clutter out](#keep-the-clutter-out) if you'd rather open the whole `context/`.

---

## What you'll see

| Note | What it is |
| --- | --- |
| `<type>_<slug>.md` (e.g. `project_milvus-version.md`) | One durable fact per file — title, the fact, its *Why* and *How to apply*, and provenance frontmatter. These are your memory. |
| `MAP.md` | A **generated map note** — every fact as a clickable `[[link]]`, grouped by type, with each fact's related-links and supersession shown, plus a **`## Cited anchors`** section that clusters facts under the decisions (`D-nnn`), tasks, and ADRs they cite. This is what lights up the graph. Do not edit it (see below). |
| `INDEX.md` | The kit's generated pointer index (title + one-line hook per fact). Also generated; also don't edit. |

**Graph view** (the sidebar orbit icon): open it and you'll see every fact connected through `MAP.md`, with related facts clustered and browsable constellations forming around the decision/task anchors your facts cite most. **Backlinks** (bottom of any note): "linked mentions" shows what points at the fact you're reading.

---

## Read vs write — the one rule that matters

**Reading and browsing are completely safe.** Click around, search, follow the graph. Nothing you do while browsing changes your memory.

**Writing is different — don't hand-edit fact files in Obsidian.** Not because it "won't work" (it does — the kit re-reads the markdown on its next reindex, so a hand-edit is *picked up*, never lost; markdown is the source of truth). The problem is what a hand-edit **skips**:

- **Secret screening** — the kit's write path (`cmk remember`, or the agent via `mk_remember`) runs a Poison_Guard scan that catches API keys/tokens before they land in a committed file. A hand-typed secret goes straight in.
- **Home-path abstraction** — the write path rewrites `C:\Users\you\…` / `/home/you/…` to `~`, so a committed fact never ships your username. A hand-edit keeps the raw path.
- **Dedup + conflict detection** — the write path catches a fact you already have, or one that contradicts an existing fact, and routes it to a queue. A hand-edit can silently duplicate or contradict.
- **Audit trail** — every kit write is logged. A hand-edit is invisible to the audit log.

**So:** browse in Obsidian, but **capture through the kit** — say "remember this" to your agent, or run `cmk remember "<fact>"`. That keeps the screening, the privacy scrub, and the audit trail intact. (If you *do* hand-edit — say, fixing a typo — it's safe and will be re-indexed; you just bypassed the screens for that one change.)

---

## Keep the clutter out

If you prefer to open the **whole `context/`** folder (so session logs and decisions are in the same vault), hide the machinery so it doesn't crowd your file list and graph.

In Obsidian: **Settings → Files and links → Excluded files**, add these patterns:

```
.locks
.index
archive/tombstones
queues
```

Excluded files are dimmed in search and dropped from the graph. (This is Obsidian config — the kit ships no `.obsidian/` folder, so nothing about your vault setup is committed or forced on teammates.)

Simplest of all: just open `context/memory/` and skip this entirely.

---

## How the links light up (the honest details)

The kit stores links between facts, but a fact file is named `<type>_<slug>.md` while the links reference the bare slug or an id — which Obsidian wouldn't resolve on its own. Two things bridge that, **without rewriting any existing fact file**:

- **`MAP.md`** renders every fact and its links using the resolvable `[[<type>_<slug>]]` form, so the *whole* corpus — including facts written long before you installed Obsidian — shows up in the graph and is clickable. It's regenerated on every memory write and is byte-stable (clean diffs).
- **New facts carry an id alias.** Each fact the kit writes from now on lists its own id in an Obsidian `aliases:` field, so an `[[P-XXXX]]` id reference (how facts cross-reference each other) resolves to the right note.

Because `MAP.md` and `INDEX.md` are **generated**, they're rewritten from your fact files on every reindex — edits to them are overwritten. Edit facts, not the generated notes.

### What Obsidian can and can't show

- **Can:** titled notes, full-text search, the graph, backlinks, following links between facts.
- **Can't:** trust tiers, the recall fire-rate, conflict queues, `cmk doctor` status, live supersession semantics — those are kit concepts Obsidian has no idea about. The kit's own viewer (a separate, later piece of work) is where those will live.

---

## See also

- [`docs/CLI.md`](CLI.md) — `cmk remember`, `cmk search`, `cmk links`, and the rest.
- [`specs/glossary.md`](../specs/glossary.md) — *vault map*, *edges table*, *provenance frontmatter*.
- [`README.md`](../README.md) — what the kit is and how it works.
