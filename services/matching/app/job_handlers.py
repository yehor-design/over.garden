"""Canonical matching queue capability manifest.

This module is the single source of truth shared by dispatch, runtime proof,
worker heartbeats, deployment preflight, and the production smoke contract.
"""

from __future__ import annotations

from app.catalog_aliases import CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND
from app.catalog_fuzzy_duplicates import CATALOG_FUZZY_DUPLICATE_QA_REFRESH_KIND
from app.catalog_matching import CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND
from app.search import (
    CATALOG_TYPEAHEAD_REINDEX_KIND,
    JOURNAL_ENTRY_INDEX_KIND,
    JOURNAL_ENTRY_UNINDEX_KIND,
)

SUPPORTED_JOB_KINDS = tuple(
    sorted(
        (
            CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND,
            CATALOG_FUZZY_DUPLICATE_QA_REFRESH_KIND,
            CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND,
            CATALOG_TYPEAHEAD_REINDEX_KIND,
            JOURNAL_ENTRY_INDEX_KIND,
            JOURNAL_ENTRY_UNINDEX_KIND,
        )
    )
)
