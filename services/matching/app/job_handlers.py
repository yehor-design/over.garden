"""The matching queue capability set, as dispatch and the proofs read it.

Dispatch, the runtime proof, the worker heartbeat, deployment preflight, and the
production smoke contract all take the kind set from here. Its own source is
`app/job_queue_contract.py`, generated from
`apps/web/src/server/job-queue-manifest.ts`; this module names it once so those
five consumers cannot each grow their own copy.
"""

from __future__ import annotations

from app.job_queue_contract import (
    MATCHING_MANIFEST_ENTRIES,
    SUPPORTED_JOB_KINDS,
)

__all__ = ["MATCHING_MANIFEST_ENTRIES", "SUPPORTED_JOB_KINDS"]

# The set is generated, so the three assertions that used to guard it — one per
# Stable Registry kind, added by hand as each one landed — cannot go stale here
# and are gone. What replaces them is `pnpm queue:contract:check`, which fails
# when this file's source disagrees with the manifest at all, for every kind
# rather than the three someone remembered to name.
