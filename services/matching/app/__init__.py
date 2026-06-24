"""OverGarden matching tier (isolated Python service).

Variant A (ADR-0001): the Cyrillic-aware matching/dedup libraries live ONLY in
Python. This package is the FastAPI service (`app.main`) plus the queue worker
(`app.worker`); search-index helpers live in `app.search`.
"""
