# OVE-178 Living-Object Passport V2 Plan

## Product job

A visitor or caretaker opens one living-object home and can immediately answer four questions: what is this object, who cares for it, what is safe and known about it, and what happened over time. The next useful route must be visible without requiring sign-in to read.

The repeat-use mechanism is the Drive2 object-passport loop: durable identity anchors chronological evidence. OverGarden adapts that mechanism for plants, animals, and bee colonies while keeping precise location, sensitive animal identifiers, private entries, and unprocessed media outside the public contract.

## Architecture

- Keep the public and owner loaders separate and fail closed.
- Introduce a shared presentation contract containing only public-safe identity, caretaker, fact, media, status, and timeline fields.
- Build the public presentation only from active public entries, selectable catalog identity, public profile data, confirmed public provenance, and processed derivatives.
- Build the owner presentation from the scoped owner repository. Owner-only location, catalog-resolution, publication, archive, composer, and private provenance controls remain outside the shared contract.
- Preserve public `noindex, nofollow` policy.
- Return `404` for unknown, private-only, and never-published objects. Return `410` only when an object had a public passport and every public anchor is now gone.

## UI and IA

- Taxonomy breadcrumb and compact identity header appear first.
- Cover or a stable no-media state sits beside object identity, status, caretaker, chronology, and the primary next action.
- Kind-specific facts use domain labels for plant, animal, and bee-colony passports without inventing unavailable facts.
- Timeline is chronological, supports sparse and dense states, groups history, exposes a bounded preview plus “show all,” and gives adjacent previous/next journal navigation.
- Desktop registers route-owned context modules in the SiteShell context rail. Mobile keeps identity, safe context, chronology, and action before secondary modules.
- Owner controls are clearly separated as management tools and never serialized into public output.

## Deterministic evidence

- Extend the OVE-187 manifest with explicit passport evidence for plant, animal, and bee-colony identities; confirmed, provisional, and unknown catalog states; no-media and mixed-aspect media; zero, one, and dense timelines; owner-private and archived entries; and public 404/410 lifecycle states.
- Verify expected ordered timeline IDs/counts against real public and owner repositories.
- Capture Drive2 reference, OverGarden before, and implemented desktop/mobile screenshots, then produce side-by-side comparison evidence.

## Verification

1. Focused unit and rendering tests for presentation, repositories, routes, and fixtures.
2. Privacy sweeps proving no precise location, private content, raw media keys, owner IDs, or sensitive identifiers enter public markup.
3. `pnpm lint`, `pnpm typecheck`, focused/full Vitest, fixture seed/verify, production build, and `pnpm mainline:closeout:check`.
4. Playwright/browser verification at desktop and 320 px using real fixture-backed loaders for all three object kinds and lifecycle states.
5. Push the verified commit to `main`, confirm exact remote SHA and CI/deployment health, then add Linear closeout evidence and move OVE-178 to Done.
