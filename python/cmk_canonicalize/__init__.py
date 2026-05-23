"""cmk-canonicalize — deterministic text canonicalization + content-addressed ID generation.

Python parallel to the Node @cmk/canonicalize package. Byte-identical output against
fixtures/canonicalize-vectors.json. Used by Layer 4+ Python scripts (cron, auto-extract).

Public API:
    canonicalize(text) -> str
    generate_id(tier, text) -> str
    encode_base32(data) -> str
    BASE32_ALPHABET: str
"""

from __future__ import annotations

import hashlib
import re

__all__ = ["BASE32_ALPHABET", "canonicalize", "encode_base32", "generate_id"]

BASE32_ALPHABET: str = "2345679ABCDEFGHJKLMNPQRSTUVWXYZa"

_VALID_TIERS: frozenset[str] = frozenset({"U", "P", "L"})

_RE_HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_RE_BACKREF = re.compile(r"\(([PUL])-[A-Za-z0-9]{8}\)")
_RE_BULLET_MARKER = re.compile(r"^\s*[-*+]\s+")
_RE_WHITESPACE = re.compile(r"\s+")
_RE_TRAILING_PUNCT_WS = re.compile(r"[\s.,;]+$")


def canonicalize(text: str | None) -> str:
    """Return the canonical form of *text* per design §3.2.

    Steps (deterministic, mirrors the Node implementation byte-for-byte):
        1. Strip HTML comments (<!--...-->)
        2. Strip citation backrefs ((P|U|L)-XXXXXXXX)
        3. Strip leading bullet marker (tolerates leading whitespace)
        4. Collapse whitespace runs to single space
        5. Trim leading/trailing whitespace
        6. ASCII lowercase (non-ASCII passthrough)
        7. Strip trailing punctuation (., ,, ;) and any preceding whitespace
    """
    if text is None:
        return ""
    s = str(text)
    s = _RE_HTML_COMMENT.sub("", s)
    s = _RE_BACKREF.sub("", s)
    s = _RE_BULLET_MARKER.sub("", s)
    s = _RE_WHITESPACE.sub(" ", s)
    s = s.strip()
    s = "".join(c.lower() if "A" <= c <= "Z" else c for c in s)
    s = _RE_TRAILING_PUNCT_WS.sub("", s)
    return s


def encode_base32(data: bytes) -> str:
    """Encode *data* using the kit's custom 32-char alphabet (5 bits per char, MSB-first)."""
    bits = 0
    value = 0
    out: list[str] = []
    for b in data:
        value = (value << 8) | b
        bits += 8
        while bits >= 5:
            out.append(BASE32_ALPHABET[(value >> (bits - 5)) & 0x1F])
            bits -= 5
    if bits > 0:
        out.append(BASE32_ALPHABET[(value << (5 - bits)) & 0x1F])
    return "".join(out)


def generate_id(tier: str, text: str | None) -> str:
    """Return ``<tier>-<8-char-hash>`` for *text* per design §3.1.

    Raises ValueError if *tier* is not one of 'U', 'P', 'L'.
    """
    if tier not in _VALID_TIERS:
        raise ValueError(f"Invalid tier: {tier!r}. Must be 'U', 'P', or 'L'.")
    canonical = canonicalize(text)
    digest = hashlib.sha256(canonical.encode("utf-8")).digest()
    return f"{tier}-{encode_base32(digest)[:8]}"
