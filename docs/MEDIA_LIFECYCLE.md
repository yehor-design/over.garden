# Media lifecycle (OVE-195)

Archive and retention make old public derivatives and expired retention-class
data unreachable on schedule. This is a privacy boundary: a `410` journal page
is not enough if `https://media.over.garden/...` still returns bytes.

## Model

1. Archive (and cover/orphan detach) enqueues durable `media_lifecycle`
   outbox jobs in the same DB transaction as the mutation.
2. A TypeScript consumer deletes the R2/MinIO object, purges Cloudflare URL
   cache when credentials are present, then proves the canonical custom-domain
   URL is non-2xx before marking `media_assets.revoked_at` /
   `public_unreachable_at`.
3. Erasure media deletes reuse the same revoke helper
   (`revokeMediaObjectBytes`).
4. Retention executor `ove195.retention.v1` uses identical selection for
   `dry_run` and `execute`:
   - quarantine `quarantined|failed` older than 7 days
   - analytics older than 13 months
   - admin/community audit + handled erasure evidence older than 1 year
   - dangling cover pointers / orphan cover-only classes (report + clear)

## Cover / 10+1 safety

- Archive revokes every processed public derivative on the archived entry.
- Cover replace/remove and inline detach revoke only assets that are no longer
  referenced by `cover_media_asset_id` or the current document image blocks.
- Abandoned cover-only assets are enqueued **before** `journal_entry_id` is
  cleared so they cannot become invisible orphans.
- Still-referenced cover/inline assets must remain reachable.

## Operator surfaces

```bash
cd apps/web
pnpm smoke:media-archive-retention -- --environment local --confirm-environment local
pnpm smoke:retention-workflow -- --environment local --confirm-environment local
pnpm retention:report -- --environment local --confirm-environment local
pnpm prove:r2-media-lifecycle
# production dry-run only:
pnpm retention:report -- --environment production --confirm-environment production
```

Production revoke requires Vercel env:

- `CLOUDFLARE_ZONE_ID=aa4ef4e26d4de961897f29555d20b662`
- `CLOUDFLARE_CACHE_PURGE_API_TOKEN` — Zone **Cache Purge** scoped token (strongly
  recommended once media.over.garden returns `cf-cache-status: HIT`; never commit)
- `CRON_SECRET` — bearer for `POST /api/cron/media-lifecycle`

Completion always requires canonical URL non-2xx after origin delete. Purge is
attempted when credentials are present; purge request failures fail the job
(never swallowed). Local MinIO omits purge credentials. Vercel Hobby cron is
daily (`0 3 * * *`); operators can also drain via smokes/CLI.

## Production proof gates

- Synthetic journal only (no user-content sweeps).
- After archive: page `410`/`noindex`, Meilisearch absent, canonical media URL
  non-2xx within the declared window (poll ≤ 15 min; smoke target ≤ 2 min).
- Public `r2.dev` for `overgarden-public` must be disabled after
  `media.over.garden` proof; see `docs/INFRASTRUCTURE_REGISTRY.md`.
- Evidence must stay aggregate/class-only (no object paths, identities, secrets).

## Fail gates

- Page `410` but derivative still `200`
- Cache purge / delete failure swallowed
- Retention dry-run selection ≠ execute selection
- Active/still-referenced cover or inline deleted
- `r2.dev` bypass remains enabled
