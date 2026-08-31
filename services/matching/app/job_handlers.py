"""Canonical matching queue capability manifest.

This module is the single source of truth shared by dispatch, runtime proof,
worker heartbeats, deployment preflight, and the production smoke contract.
Kinds and attempt bounds come from the OVE-194 job queue manifest.
"""

from __future__ import annotations

from app.job_queue_manifest import MATCHING_MANIFEST_ENTRIES
from app.stable_registry_extension_pack import (
    STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND,
)
from app.stable_registry_foundation import STABLE_REGISTRY_FOUNDATION_BUILD_KIND

SUPPORTED_JOB_KINDS = tuple(
    sorted(str(entry["kind"]) for entry in MATCHING_MANIFEST_ENTRIES)
)

# Imported here as well as by the worker so the canonical capability manifest
# makes the Foundation handler visible to deployment and heartbeat checks.
assert STABLE_REGISTRY_FOUNDATION_BUILD_KIND in SUPPORTED_JOB_KINDS
assert STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND in SUPPORTED_JOB_KINDS
