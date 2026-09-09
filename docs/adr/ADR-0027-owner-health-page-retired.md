# ADR-0027 — The owner `/health` diagnostics page is retired; `/api/health` stays

- **Status:** Accepted (decision 2026-09-09) and implemented the same day by
  `OVE-410`: the page, its account-menu entry, its copy, its route policy
  entries and its proxy guard removed; no schema change.
- **Date:** 2026-09-09
- **Decision owner:** founder/owner
- **Supersedes:** the clause of ADR-0022 D5 that reads "`/health` is
  owner-only". The rest of D5 — admin is the product, operator pages live in
  the account menu under the sealed owner role and work in production — stands,
  and so does the clause that `/api/health` answers a minimal status for
  monitors. The mention of `health` in ADR-0022 D4's uncached list falls away
  with the route. Older ADRs are immutable history and are not edited.
- **Relates to:** ADR-0025, which removed the Release Center from the same
  menu.

## Context

`/health` was the walking skeleton's smoke page. It arrived on 2026-06-24 in
`8661307`, the first runtime scaffold commit, and its content never changed
shape: a server render timestamp, a Cyrillic string to prove the UTF-8 path, the
Better Auth secret class, a `select 1` ping with a count of rows in the `health`
table, and two shadcn buttons to prove the component library rendered on the
server. Every one of those was a question the project asked itself while the
stack was being assembled.

On 2026-08-31 `6c23eff` ("owner admin pages that work in production") put the
page into the owner's account menu beside community moderation, comment
moderation, the catalog queue, the catalog sources and the erasure requests.
Nothing about the page changed; it was localized into the three interface
locales, given a sealed-owner check, and listed as an owner tool.

On 2026-09-09 the owner said they had not approved that menu entry, that the
page tells them nothing they use and that they will not use it, and asked for it
to be removed from the project completely.

They are right about what it is. Every fact on the page is either answered
better elsewhere or answers nothing a person acts on:

- the render timestamp and the UTF-8 string proved a build; a deployed build
  that renders any page at all proves both;
- the shadcn buttons proved the component library was wired; the entire product
  proves that now;
- the auth secret class and the database ping are read at request time on every
  workspace page — `workspace-access.ts` classifies a workspace section with the
  same `pingDatabase` — and a failure there is visible where it matters instead
  of on a page nobody opens;
- monitors never used it. It answered a hard 404 to any request without a
  session cookie, so the three scripts that fetched it anonymously as a
  readiness probe could not have passed; `/api/health` is what a monitor reads.

A page in the owner's menu is a standing claim that the owner should look at it.
This one made that claim for two months without ever being worth opening.

## Decision

### D1. Retired

Removed from the product: the page at `/health` and its `[...missing]`
catch-all, the `health` entry in `OPERATOR_MENU_LINKS` with its uk/bg/ru labels,
the `health` block of `operator-copy.ts` and `getOperatorDatabaseAvailabilityCopy`,
`"health"` in `ROOT_ROUTE_SEGMENTS`, `"/health"` in
`INTERFACE_UTILITY_CONTROL_PREFIXES` and in the proxy's
`NO_STORE_ROUTE_PREFIXES`, `isOwnerHealthPath` and the proxy guard that
hard-404s an anonymous request to it, and the `readRecentHealth` and
`writeHealth` repository functions, whose only caller was the page.

`/health`, `/bg/health`, `/ru/health` and `/health/anything` now answer the
proxy's real 404 for every visitor, the owner included, through
`isUnknownRootPath` — the same answer the retired `/admin` namespace gives.

### D2. Retained

- `GET /api/health` — liveness only, `{ ok: true }` with `no-store`. It is the
  monitor endpoint named in ADR-0022 D5 and in
  `docs/INFRASTRUCTURE_REGISTRY.md`, and the three readiness probes that used to
  fetch the page now fetch it instead.
- `pingDatabase` in `src/server/health-repository.ts`, because
  `src/server/workspace-access.ts` classifies a workspace section with it under
  ADR-0023.
- `getAuthSecretHealth` in `src/lib/auth-secret.ts`, which decides whether
  sign-in is open at all.
- The `health` table from `0001_walking_skeleton.sql`. It now has no reader and
  no writer in the application. Dropping it is a destructive schema change and
  needs its own migration, a rollback file and the owner's explicit approval
  under `AGENTS.md` hard rule 10; it holds no product data and costs nothing
  while it waits.

### D3. What this does not decide

The compact utility shell — `AuthenticatedUtilityRegion` and the `"utility"`
interface-language-control placement — stays. `/health` was the only route that
reached it through `SiteShell`, because the one prefix left in
`INTERFACE_UTILITY_CONTROL_PREFIXES` is the erasure owner review, which
`isSafeExitRoute` intercepts first. The region is therefore unrendered by any
route today. It was built for the safe current-session sign-out (`31954a1`), not
for `/health`, so removing it is a separate decision about payload-free operator
pages and is not taken here.

## Consequences

- The owner's account menu carries five links: community moderation, comment
  moderation, the catalog decision queue, the catalog sources, and the erasure
  requests.
- `scripts/prove-owner-mvp-reset.ts` keeps probing `/health` and still expects
  404 — the assertion now guards the retirement instead of the owner gate.
- `scripts/smoke-restore-readiness.ts` and
  `scripts/smoke-fail-open-projection.ts` probe `/api/health`. This also fixes
  them: they asserted a 200 from a route that answered 404 to an anonymous
  request.
- `site-shell.test.tsx` loses its one example of the excluded shell with a
  utility region. `authenticated-utility-region.test.tsx` still covers the
  component itself.
- The `health` table survives in every database until a gated migration drops
  it. `docs/PRODUCTION_SCHEMA_STATE.md` is unchanged by this ADR.

## Superseded clauses

- ADR-0022 D5: "`/health` is owner-only" — superseded. "Admin is the product"
  and "`/api/health` answers a minimal status for monitors" stand.
- ADR-0022 D4: `health` in the list of uncached route families — the route no
  longer exists; `/api` still covers `/api/health`.
- `docs/ADMIN_ROLE_BOOTSTRAP.md`, `docs/PROJECT_STATE.md`,
  `docs/INFRASTRUCTURE_REGISTRY.md` (the app-layer cache rule) and
  `apps/web/README.md` are updated in the same change. Their dated receipts that
  record a `/health` 200 in June and July are history and stay as written.
