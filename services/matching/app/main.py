"""FastAPI service for the matching tier.

Exposes a health endpoint that also reports the loaded library versions — most
importantly PyICU's `icu.ICU_VERSION`, which proves the system libicu is present
in the image (the PyICU build trap). The actual matching endpoints are added in
the matching phase; this is the infrastructure tracer only.
"""

from __future__ import annotations

import cyrtranslit
import fastapi
import icu  # PyICU — import name is `icu`, NOT `pyicu`. Needs system libicu.
import meilisearch
import psycopg
import rapidfuzz
from fastapi import FastAPI

app = FastAPI(title="overgarden-matching-tier", version="0.1.0")


@app.get("/health")
def health() -> dict[str, object]:
    """Liveness + dependency-seam proof."""
    return {
        "status": "ok",
        "service": "matching-tier",
        "versions": {
            "fastapi": fastapi.__version__,
            "rapidfuzz": rapidfuzz.__version__,
            "cyrtranslit": getattr(cyrtranslit, "__version__", "n/a"),
            "meilisearch": getattr(meilisearch, "__version__", "n/a"),
            "psycopg": psycopg.__version__,
            "pyicu": icu.VERSION,
            # If this is missing, libicu is not in the image — the PyICU trap.
            "icu": icu.ICU_VERSION,
        },
    }
