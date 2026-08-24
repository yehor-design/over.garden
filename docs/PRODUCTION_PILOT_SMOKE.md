# Production Verification Contract

Status: current self-serve production contract after OVE-349
Legacy filename retained only because earlier immutable receipts link to it.
Last updated: 2026-08-24

Connectivity addendum (2026-08-20): ADR-0017 makes journal writes
network-required. Every former offline-retry proof is replaced by
`network_unavailable_save_refused`; OVE-323 re-pinned the operator smoke step
and removed the legacy runtime.

## OVE-314 supersession

OverGarden no longer has a closed-pilot product-access model or a pilot/admin
control-plane UI. The historical implementation and its operating instructions
are retired, not hidden behind feature flags.

The following routes must return an exact `404` for guests, ordinary gardeners,
and the sealed owner, for both `GET` and `HEAD`:

- `/admin`
- `/admin/users`
- `/garden/pilot-health`
- `/garden/pilot-smoke`
- `/garden/pilot-learning/interviews`
- `/garden/pilot-learning/decision`
- `/join`

Do not recreate an invite token, invite cookie, product-access grant, founder
rehearsal cohort, pilot status page, pilot readiness page, interview form,
decision form, admin landing page, or owner-status page. Product access is
self-serve through email/password or Google. Lineage invitations are a distinct
provenance feature and remain supported.

The sealed owner uses the same avatar menu as every signed-in gardener. The
server adds exactly these four links only after authoritative owner access
passes:

- `/admin/communities`
- `/admin/moderation/comments`
- `/garden/catalog/curation`
- `/garden/privacy/erasure-requests`

Menu visibility is not authorization. Every destination repeats the sealed
owner capability check. Session or owner lookup failure renders the ordinary
menu without an empty owner section.

## Supported first-user journey

The current production journey is:

1. A visitor opens the canonical `https://over.garden` product.
2. The visitor registers or signs in with email/password or Google.
3. The gardener creates an object and first journal entry through the canonical
   garden mutation path without an invite, grant, or cohort prerequisite.
4. Optional media is converted once to the final WebP in the browser, uploaded
   directly to short-lived edge staging, and committed with the public journal
   by one atomic Publish. Image bytes do not cross a Vercel Function.
5. The gardener can return to the same object, edit atomically, archive,
   receive `network_unavailable_save_refused` without false success when the
   server is unavailable, retry the server-authoritative request, and sign out
   through the shared convergence boundary.
6. A valid lineage invitation can still be claimed through
   `/garden/lineage/invitations/claim`; its token stays in the client-only URL
   fragment and never becomes product-access authority.

Synthetic production smokes, visual fixtures, editorial seeds, and automated
bots remain explicit learning exclusions. Real product learning uses the single
`real_self_serve` cohort. There is no owner-facing learning dashboard; bounded
operator reports run through the existing CLI/Cron contracts in
`docs/MVP_LEARNING_SIGNALS.md`.

## Required exact-SHA proof

Before any production claim:

1. Record the implementation SHA once.
2. Require all exact-head GitHub checks to pass.
3. Merge without bypass and prove that SHA is an ancestor of current
   `origin/main`.
4. Require a Vercel production deployment with state `READY`, the same Git SHA,
   and canonical aliases including `https://over.garden`.
5. Run the repository gates and browser proof against that deployment.
6. Retain only aggregate counts, booleans, closed state classes, durations,
   digests, HTTP/header classes, and exact code/deployment identifiers.

Repository gates:

```bash
cd apps/web
pnpm auth:security:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm mainline:closeout:check
```

Focused self-serve and owner-boundary checks:

```bash
cd apps/web
pnpm smoke:self-serve-providers
pnpm smoke:admin-role
pnpm test:a11y
pnpm localization:coverage:browser
```

Authenticated browser evidence must prove, without recording identities or
credentials:

- email/password registration and return sign-in work without product-access
  state;
- Google authorization starts once and returns through the canonical callback;
- an ordinary gardener never receives the four owner links and receives the
  generic direct-route denial;
- the sealed owner receives exactly the four links and every destination works;
- all seven retired routes return exact `404` for guest, gardener, and owner in
  Ukrainian, Bulgarian, and Russian;
- profile and sign-out controls remain available if owner capability lookup
  fails;
- one lineage invitation/claim fixture retains its pre-OVE-314 semantics.

## OVE-314 database and provider retirement

Migration `0021_ove314_retire_obsolete_control_plane.sql` is forward-only. It
maps historical real closed-pilot attribution to `real_self_serve`, founder
rehearsal attribution to `production_smoke`, and retired activation surfaces to
the direct garden surface. It then narrows constraints, removes outbox hint
columns, and drops `public.pilot_invite_grants`. It does not delete users,
journals, objects, media, lineage, or other product content.

The approved production preflight is aggregate-only:

- 43 grant rows total;
- 6 historical closed-pilot rows;
- 37 historical founder-rehearsal rows;
- zero outbox, hinted, and unfinished-hinted rows;
- zero incoming foreign keys and zero view dependencies;
- authorization receipt digest
  `fc250128d02809526becee2d3b83c3c8406b2321f2c04c4b6b0f8a2d4498fe55`.

After the exact-SHA route/menu/deployment proof, export only closed proof classes
and run the read-only plan:

```bash
export OVE314_ROUTE_ABSENCE_CLASS=exact_404
export OVE314_MENU_CONTRACT_CLASS=sealed_owner_exact_four
# The authenticated read-back found the retired name on production only.
export OVE314_VERCEL_ENV_TARGET_CLASS=mixed
export OVE314_CONTAINED_IMPLEMENTATION_SHA="$OVE314_IMPLEMENTATION_SHA"
export OVE314_VERCEL_READY_SHA="$OVE314_IMPLEMENTATION_SHA"

vercel env run -e production -- pnpm exec tsx \
  scripts/retire-obsolete-control-plane.ts \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE314_IMPLEMENTATION_SHA" \
  --plan
```

Apply only when the plan state is exactly `code_deployed` and every aggregate
matches:

```bash
vercel env run -e production -- pnpm exec tsx \
  scripts/retire-obsolete-control-plane.ts \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE314_IMPLEMENTATION_SHA" \
  --apply \
  --approval-digest \
  fc250128d02809526becee2d3b83c3c8406b2321f2c04c4b6b0f8a2d4498fe55
```

The controller uses a task-specific advisory transaction lock, a five-second
lock timeout, a thirty-second process deadline, a second locked snapshot, and
post-apply preservation checks. Any count, shape, dependency, target, SHA,
route, menu, authorization, or environment drift fails before effect. Output is
aggregate-only and never includes a user id, email, token, cookie, segment,
connection string, content, or precise location.

Only after database completion is read back may the operator remove
`PILOT_INVITE_SIGNING_SECRET` from Vercel production, preview, and development.
Read target-name absence twice without reading or recording the value. Do not
touch Better Auth, Google, lineage, R2, database, matching, analytics, or any
unrelated environment setting.

Final database proof requires:

- `public.pilot_invite_grants` absent;
- `learning_attribution_outbox.cohort` and `.segment` absent;
- zero retired durable or analytics actor/source/surface values;
- unchanged aggregate user, journal, object, and media counts;
- migration replay has no additional effect.

Rollback after database apply is forward-fix only. Never restore invite
admission, retired UI, the dropped table/columns, or the retired Vercel setting
without a new explicit product decision, SDD task, and migration.

## Historical receipts

Earlier Git commits, Linear comments, the mainline ledger, and dated review
documents may mention pilot routes, grants, invitations, cohorts, or smoke
pages. They are immutable provenance only. They are not current product
requirements, runtime instructions, route inventory, configuration guidance,
or permission to restore retired behavior.

Durable production capabilities established by those releases—managed
Postgres, R2 derivative privacy, Meilisearch projection boundaries, server
idempotency, honest network-failure recovery, public lifecycle, self-serve auth, consent, and
exact-main deployment proof—remain governed by their current focused runbooks
and `docs/MAINLINE_CLOSEOUT.md`.
