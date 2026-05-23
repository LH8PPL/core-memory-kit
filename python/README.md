# cmk-canonicalize (Python)

Python parallel to the Node `@cmk/canonicalize` package. Same public API, byte-identical output against [`../fixtures/canonicalize-vectors.json`](../fixtures/canonicalize-vectors.json).

Used by Layer 4+ Python scripts (cron, auto-extract subagent) that need to compute the same content-addressed IDs as the Node CLI.

## Install (development)

```bash
python -m pip install -e ".[test]"
```

## Public API

```python
from cmk_canonicalize import canonicalize, generate_id

canonicalize("  - Hello World  ")   # → "hello world"
generate_id("P", "Hello World")     # → "P-..." (matches Node output)
```

See [`../specs/v0.1.0/design.md`](../specs/v0.1.0/design.md) §3 for the canonicalization rules and ID format.
