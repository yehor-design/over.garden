# Managed Recovery Drill (OVE-230)

Status: strict v2 executable contract
Policy: ove230.managedRecovery.v2 / ove230.restore-readiness.v2
Targets: RPO at most 1 hour; RTO at most 4 hours

OVE-230 restores production PostgreSQL into one new DigitalOcean fork, runs the exact contained main application against it with fresh loopback-only MinIO and Meilisearch, proves the synthetic gardener/public/archive path, and deletes the exact fork. It never fails over, restores over, bootstraps, reconfigures, or writes production.

## Safety model

- plan reads the authenticated production ID/name/engine/version/region/status/size, requires exact target-name cardinality zero, selects a restore point five minutes earlier, binds the contained implementation SHA and maintainer approval digest, and persists canonical redacted JSON plus its SHA-256.
- execute reproduces that digest, takes the single-host lock, rechecks source/target facts, and creates at most one overgarden-pitr-drill-YYYYMMDD fork.
- Every database effect re-reads target ID/name/engine/region/status and provider hostname and compares it with the parsed DATABASE_URL hostname. Production-ID equality refuses.
- Fork credential env and CA are mode 0600 temporary files. Raw provider output, credentials, CA body, DB URL, host IP, restored rows, synthetic identity/content/keys, cookies, and request metadata never enter evidence.
- Next binds 127.0.0.1:13000; Meilisearch binds 127.0.0.1:17700; MinIO binds 127.0.0.1:19000. Containers and volumes have a random OVE-230 suffix, start empty, and are deleted on every terminal path. Production R2/search/matching/email/analytics/social endpoints are disabled or refused.
- No general worker runs. Initial OVE-227 parity projects only canonical public-safe rows into the fresh index. Synthetic publish/archive uses the canonical durable public-projection owner for only that entity.
- Teardown freshly verifies exact target identity, deletes only its ID, and polls an authenticated provider list until exact-ID cardinality is zero. Authentication, permission, throttle, and provider-server failures are not absence.

## Commands

Run only after the implementation SHA is merged and contained in origin/main:

    git fetch origin main
    git merge-base --is-ancestor "$OVE230_IMPLEMENTATION_SHA" origin/main
    cd apps/web
    pnpm mainline:closeout:check
    pnpm smoke:restore-readiness -- plan --environment recovery-drill --confirm-environment recovery-drill --approval-digest e87bd9c0118bcf88a6fac07c069b01396b5b2c0322b7c961f058b016554a31ae --implementation-sha "$OVE230_IMPLEMENTATION_SHA"
    pnpm smoke:restore-readiness -- execute --environment recovery-drill --confirm-environment recovery-drill --approval-digest e87bd9c0118bcf88a6fac07c069b01396b5b2c0322b7c961f058b016554a31ae --implementation-sha "$OVE230_IMPLEMENTATION_SHA"

During any wait, these commands bypass the execution lock and use the fenced state:

    pnpm smoke:restore-readiness -- status
    pnpm smoke:restore-readiness -- cancel

## Terminal admission

Green requires all of the following in one same-target/SHA receipt:

- authoritative RPO from provider fork acceptance UTC minus selected restore point UTC, at most 3600000 ms;
- monotonic RTO from fork-command start through final product/parity/readiness, corroborated by ordered UTC timestamps within 30 seconds, at most 14400000 ms;
- normalized pg_catalog manifest equal to the fresh exact-SHA reference plus named identity, learning, media, queue, projection, document, cover, and erasure predicates;
- protected restored-row aggregates unchanged by bootstrap and job_queue lifecycle fingerprint unchanged by product proof, with zero processing rows and valid terminal metadata;
- real JPEG quarantine upload, stripped WebP derivative HeadObject success, original HeadObject 404, owner save/readback, public 200, archive 410, and exact final OVE-227 zeroGap=true;
- authenticated target absence plus production database and canonical /health online before and after.

The actual post-merge receipt belongs in Linear. The repository JSON is a schema/redaction fixture, not a fabricated live result.
