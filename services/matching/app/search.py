"""Meilisearch helpers + the Phase-7 Cyrillic typo-tolerance proof.

Meilisearch is the self-hosted derived search index (TECH_STACK §2.7). Cyrillic
typo tolerance works out of the box (the Charabia tokenizer is Unicode-aware).

PRIVACY BOUNDARY (do not violate): only PUBLIC objects/handles may ever be
indexed — a "reindex everything" job must not leak private rows. This scaffold
only indexes a throwaway tracer document.

Run the proof against a live Meilisearch:
    MEILISEARCH_HOST=http://localhost:7700 MEILISEARCH_API_KEY=... \
        python -m app.search
"""

from __future__ import annotations

import os

import meilisearch

TRACER_INDEX = "health_tracer"


def client() -> meilisearch.Client:
    host = os.environ.get("MEILISEARCH_HOST", "http://localhost:7700")
    api_key = os.environ.get("MEILISEARCH_API_KEY")
    return meilisearch.Client(host, api_key)


def prove_cyrillic_typo_tolerance() -> dict[str, object]:
    """Index a Cyrillic doc, search WITH a typo, assert a tolerant match.

    Returns the matched hit. Raises AssertionError if typo tolerance fails.
    This is the Phase-7 cross-runtime proof (requires a running Meilisearch).
    """
    c = client()
    index = c.index(TRACER_INDEX)

    task = index.add_documents(
        [
            {"id": 1, "name": "Помідори чері органічні"},  # uk: organic cherry tomatoes
            {"id": 2, "name": "Огірки свіжі"},  # uk: fresh cucumbers
        ],
        primary_key="id",
    )
    c.wait_for_task(task.task_uid)  # indexing is async — must wait before searching

    # Deliberate typo: 'помдори' (missing і) instead of 'помідори'.
    result = index.search("помдори")
    hits = result["hits"]
    assert hits and hits[0]["id"] == 1, f"typo tolerance failed: {result}"
    return hits[0]


if __name__ == "__main__":
    hit = prove_cyrillic_typo_tolerance()
    print("Cyrillic typo-tolerant match:", hit["name"])
