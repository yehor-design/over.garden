"""A thin wrapper around the gnparser binary (ADR-0026 D4).

The reconciliation ladder's second rung compares scientific names after a
real parser has split the canonical name from its authorship. gnparser is
installed from a pinned GitHub release (``scripts/install-gnparser.sh``) into
the image, both CI runners and a developer's machine; this module only runs
it. It is not a fallback parser: when the binary is missing the caller gets
``GnParserUnavailable`` and the rung that needs it is skipped with a reason,
never a guess.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from typing import Sequence

GNPARSER_ENV = "GNPARSER_PATH"


class GnParserUnavailable(RuntimeError):
    """The gnparser binary is not installed where the runtime can find it."""


@dataclass(frozen=True)
class ParsedName:
    verbatim: str
    parsed: bool
    canonical_simple: str
    canonical_full: str
    authorship: str
    rank: str | None
    cardinality: int
    quality: int

    @property
    def genus(self) -> str | None:
        if not self.parsed or self.cardinality < 1:
            return None
        return self.canonical_simple.split(" ", 1)[0].casefold() or None


def gnparser_path() -> str:
    configured = os.environ.get(GNPARSER_ENV)
    if configured:
        if os.access(configured, os.X_OK):
            return configured
        raise GnParserUnavailable(f"{GNPARSER_ENV} names no executable")
    found = shutil.which("gnparser")
    if found is None:
        raise GnParserUnavailable("gnparser is not on PATH")
    return found


def parse_names(names: Sequence[str]) -> list[ParsedName]:
    """Parse names in order; blank input yields an unparsed entry."""
    cleaned = [" ".join(name.split()) for name in names]
    to_parse = [name for name in cleaned if name]
    parsed_by_verbatim: dict[str, ParsedName] = {}
    if to_parse:
        completed = subprocess.run(
            [gnparser_path(), "-f", "compact"],
            input="\n".join(to_parse) + "\n",
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
        if completed.returncode != 0:
            raise GnParserUnavailable(
                f"gnparser exited with {completed.returncode}: {completed.stderr.strip()[:200]}"
            )
        for line in completed.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            parsed = _from_record(record)
            parsed_by_verbatim.setdefault(parsed.verbatim, parsed)
    return [
        parsed_by_verbatim.get(name, _unparsed(name)) for name in cleaned
    ]


def parse_name(name: str) -> ParsedName:
    return parse_names([name])[0]


def _from_record(record: dict) -> ParsedName:
    verbatim = str(record.get("verbatim", ""))
    if not record.get("parsed"):
        return _unparsed(verbatim)
    canonical = record.get("canonical") or {}
    authorship = record.get("authorship") or {}
    return ParsedName(
        verbatim=verbatim,
        parsed=True,
        canonical_simple=str(canonical.get("simple") or ""),
        canonical_full=str(canonical.get("full") or canonical.get("simple") or ""),
        authorship=" ".join(str(authorship.get("normalized") or "").split()),
        rank=_rank(record),
        cardinality=int(record.get("cardinality") or 0),
        quality=int(record.get("quality") or 0),
    )


def _rank(record: dict) -> str | None:
    cardinality = int(record.get("cardinality") or 0)
    if cardinality == 1:
        return "genus"
    if cardinality == 2:
        return "species"
    if cardinality >= 3:
        return "infraspecies"
    return None


def _unparsed(verbatim: str) -> ParsedName:
    return ParsedName(
        verbatim=verbatim,
        parsed=False,
        canonical_simple="",
        canonical_full="",
        authorship="",
        rank=None,
        cardinality=0,
        quality=0,
    )
