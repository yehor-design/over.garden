"""Canonical matching queue capability manifest.

This module is the single source of truth shared by dispatch, runtime proof,
worker heartbeats, deployment preflight, and the production smoke contract.
Kinds and attempt bounds come from the OVE-194 job queue manifest.
"""

from __future__ import annotations

from app.job_queue_manifest import MATCHING_MANIFEST_ENTRIES

SUPPORTED_JOB_KINDS = tuple(
    sorted(str(entry["kind"]) for entry in MATCHING_MANIFEST_ENTRIES)
)
