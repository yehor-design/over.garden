# Production matching release runbook

This directory is the committed OVE-190 release and rollback boundary for the
DigitalOcean Linux matching host. It uses Docker Compose because that host is a
Linux production runtime (`production-linux-required` in
`docs/CONTAINER_RUNTIME_POLICY.md`), not a supported-Mac local runtime. Local
OverGarden development remains Apple Container-first.

## Release contract

`.github/workflows/matching-image.yml` is the only supported publisher. For one
exact 40-character commit already contained in `main`, it:

1. installs the frozen Python dependency graph with `uv==0.11.24`;
2. compiles every Python module, runs frozen Ruff, and runs the full matching
   test suite before any registry write;
3. builds one shared API/worker image with OCI revision, creation time, schema
   compatibility, runtime-contract, and unique workflow-run labels;
4. pushes a unique `sha-<full-sha>-run-<run-id>-<attempt>` tag to the private
   GitHub Container Registry and captures its immutable registry digest;
5. executes `python -m app.runtime capabilities` inside that exact digest and
   refuses any handler set other than the six OVE-190 handlers;
6. uploads a 90-day GitHub Actions artifact containing `release.json`, the safe
   capability manifest, and a checksummed compressed Docker archive of that
   exact digest.

No `latest` tag is produced. The droplet does not need a persistent GHCR token:
an authenticated operator downloads the private Actions artifact and transfers
only that sealed artifact to the host. `matching-release install` verifies the
archive checksum, portable archive-config digest, exact source SHA, OCI labels,
schema class, registry digest, and six-handler capability file before creating
a digest-qualified local image reference. Docker daemon image IDs are not
portable across classic and containerd-backed image stores, so the installer
records the receiving daemon's loaded image ID only after the archive identity
passes. The registry digest remains the canonical identity; the local
full-SHA/digest-prefix reference exists only because `docker save` does not
preserve a private registry authentication session.

## One-time installation on the production Linux host

Install the committed files without copying any environment content back to a
workstation or log:

```bash
sudo install -d -m 0755 /opt/overgarden
sudo install -m 0755 infra/production-worker/matching-release /opt/overgarden/matching-release
sudo install -m 0644 infra/production-worker/docker-compose.release.yml /opt/overgarden/docker-compose.release.yml
sudo install -m 0444 infra/production-worker/0003_job_queue_dead_letter.sql /opt/overgarden/0003_job_queue_dead_letter.sql
```

The existing `/opt/overgarden/worker.env`, `overgarden_default` network,
Meilisearch, and Caddy remain in place. Never print or copy `worker.env` into CI,
chat, Linear, or release evidence.

The production host must expose at least 2.5 GiB of combined RAM and active
swap, 1 GiB of currently available RAM plus free swap, and 5 GiB plus the
compressed archive size on both the release and Docker-root filesystems before
an image can be installed or normally activated. Explicit rollback bypasses
this normal capacity gate so recovery is not rejected solely by that gate. The
current 1 GiB matching droplet therefore requires a persistent 2 GiB
`/swapfile` with a low swappiness value; the live value and `/etc/fstab` entry
must be verified without logging host or environment details. This safety net
prevents short Docker/Meilisearch memory-pressure bursts from making SSH and
HTTPS unresponsive. It is not a substitute for a later capacity-driven droplet
resize. Archive verification, staging copy, decompression, and the Docker import
client run at reduced CPU/I/O priority and fail closed after a 30-minute bound;
the Docker daemon itself is not priority-throttled, so the capacity gate remains
mandatory.

## Build and download two rollback-qualified releases

The first push of the final OVE-190 commit to `main` produces release A. Run the
same workflow once more with `workflow_dispatch` and the same exact full SHA to
produce release B. The workflow-run label guarantees different immutable
digests while both images contain the identical tested source and full runtime
contract. This is deliberate: B can be deployed, rolled back to the immediately
prior A digest, and forwarded to B without temporarily restoring a legacy image
that lacks OVE-190 readiness.

Download each private artifact with GitHub CLI, then transfer it through the
authenticated production-host path. Keep the artifact directory intact. Do not
paste `release.json` if its non-secret registry identifiers are not needed in
the operator record.

## Install, deploy, rollback, and forward

On the host:

```bash
sudo /opt/overgarden/matching-release install /path/to/release-a
sudo /opt/overgarden/matching-release install /path/to/release-b
sudo /opt/overgarden/matching-release migrate <release-a-key>
sudo /opt/overgarden/matching-release deploy <release-a-key>
sudo /opt/overgarden/matching-release deploy <release-b-key>
sudo /opt/overgarden/matching-release rollback
sudo /opt/overgarden/matching-release forward
sudo /opt/overgarden/matching-release status
```

The install output supplies the release key. It is the full commit SHA plus the
first 16 digest characters; it is not a secret.

`migrate` and `deploy` apply the committed minimal
`0002_matching_worker_heartbeats.sql` migration and, when present,
`0003_job_queue_dead_letter.sql`. Both are additive and idempotent and
contain no full-bootstrap replay. Every activation then runs
`python -m app.runtime preflight` from the candidate image
against the existing production DB/schema/queue and Meilisearch before it can
replace either service. API and worker are then recreated from the same exact
host-loaded image ID. Both must pass `python -m app.runtime ready`, both
container image IDs must equal that verified host-loaded image ID, and the live capability
manifest must report the exact SHA, digest, schema class, queue, and six
handlers. A failed activation restores the prior `active.env` and recreates the
prior services. Release pointer files are changed only after readiness passes.

During the first sealed activation only, there is not yet a sealed
`current.json`. The script therefore requires the pre-OVE-190
`/opt/overgarden/docker-compose.yml` as a bounded emergency restore target. If
the first candidate fails after replacement, it recreates the old API/worker
and proves both containers plus API liveness before reporting failure. After
release A passes, every later failure restoration is stricter: it must pass the
unchanged sealed current pointer's exact readiness and capability contract.

`rollback` accepts no target: it can activate only the immediately prior digest.
`forward` accepts no target: it can activate only the digest saved by the last
successful rollback. Installed release directories are immutable and cannot be
overwritten by this script.

## Redacted proof boundary

Allowed evidence:

- exact public commit SHA and immutable image digest;
- safe schema compatibility and runtime contract classes;
- six public job-handler names;
- dependency/readiness classes and queue count/lag buckets emitted by the safe
  runtime contract;
- `install`, `deploy`, `rollback`, `forward`, and `status` pass/fail outcomes.

Forbidden evidence:

- database or Meilisearch URLs, passwords, tokens, or env-file contents;
- job payloads, journal text, catalog source data, row IDs, user IDs, or emails;
- precise location, IP addresses, hostnames, user agents, or raw exception text.

The release script suppresses Compose, image-load, preflight, and readiness
stdout. Do not add `set -x`, `docker inspect` dumps, container environment dumps,
or raw database queries to the production proof.
