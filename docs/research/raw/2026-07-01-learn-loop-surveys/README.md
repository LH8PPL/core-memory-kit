# Raw survey evidence — the 2026-07-01 learn-loop research arc (FROZEN RECORDS)

The unedited multi-agent workflow outputs behind the two synthesized research notes. The notes are the
readable synthesis; **these are the evidence** — per-system verbatim code quotes, exact `file:line`
references, mechanism analyses, and transferability verdicts for ~40 systems, plus the 4-lens
open-question study. Preserved because regenerating them cost ~4M subagent tokens and the notes'
citations (e.g. "Memoria dampens at `store.rs:4216`") should trace to their source forever.

| File | What it is | Feeds |
| --- | --- | --- |
| `wave1-9-system-convenience-pass.json` | The first 9-system pass (mem0, letta, graphiti, memclaw, MemOS, ReasoningBank, ReMe, MemRL, A-Mem) + its synthesis | [failure-learning field survey](../../2026-07-01-failure-learning-field-survey.md) |
| `wave1b-field-survey-79-enum-18-deepreads.json` | The full-field wave: 79 systems enumerated from primary sources, 18 deep-read, 29 triaged-passive (synthesis agent died on a session limit — synthesized by hand in the note) | same |
| `wave2-9-system-rereads.json` | The re-run of the wave-1b targets cut off by the session limit (MUSE, Evo-Memory, EvoTest, SkillRL, SkillRevise, SkillAdaptor, Negative-Knowledge, Where-Agents-Fail, Memento-recheck) + synthesis | same |
| `comparative-judgment-10-cohort-4-lenses.json` | The "earned A>B" study: 10 skill-memory systems mined + 4 outside lenses (preference-learning, cognitive-science, bandits, epistemics) + synthesis | [comparative-judgment study](../../2026-07-01-comparative-judgment-earned-method-preference.md) |

**Frozen by design** (the point-in-time-records rule): never edit these to match later understanding —
they are what the agents found on 2026-07-01, including any errors the notes' honesty sections flag
(e.g. paper-level vs code-level evidence grading). Screened before commit: no secrets, no home paths,
no usernames, maintainer-name guard green.

_Relates: D-251/D-252, ADR-0017, SYSTEM-MAP §6, the two research notes above._
