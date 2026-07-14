# OVE-185 Responsive And Accessibility Hardening Design

Status: implemented and verification-gated
Date: 2026-07-14
Issue: OVE-185

## User Behavior And Product Bet

A guest or signed-in gardener can complete the same read, create, publish,
engage, privacy, and safety journey on mobile, keyboard, screen reader, large
text, reduced motion, and desktop. The product bet is that OverGarden's journal
loop frequently happens outdoors or under interruption, so mobile parity and
accessibility are core behavior rather than later polish.

The implementation preserves the Drive2-derived read-open, write-gated loop
without copying Drive2's identity or location posture. Public evidence remains
available before authentication; state-changing actions preserve the shared
intent boundary; privacy, report, and block controls never become desktop-only.

## Scope And Architecture

The slice hardens completed OVE-173 through OVE-184 production surfaces:

- shared shell, navigation, drawer, bottom navigation, and auth intent;
- public feed, catalog, journal directory, knowledge, object passports,
  journal entries, profiles, and communities;
- owner workspace, first-object and follow-up creation, offline states,
  comments, followed feed, notifications, bookmarks, wishlist, report, block,
  and moderation controls;
- global focus, reduced-motion, safe-area, touch-target, and text-reflow rules;
- a deterministic browser and accessibility gate that runs in CI.

Responsive variants use the same server components, scoped repositories,
authorization predicates, route state, and mutation handlers. There is no
mobile-only read model, private cache, safety bypass, fixture-only component,
or CSS branch keyed to a fixture scenario.

## Manifest-Backed Evidence Matrix

`CORE_JOURNEY_SCENARIOS` is derived from the unchanged OVE-187 v8 manifest,
version `ove187-v8`, SHA-256
`6ab79d02c843b79a74fff9109b9409e5e02bcce331fab3915957ea37b95a4710`.
It binds 171 stable scenario IDs across thirteen archetypes: shell, feed,
catalog, journal directory, knowledge, object passport, journal entry, profile,
workspace, creation, auth intent, social, and community.

Every scenario runs at 320px and 1440px. High-risk dense, long-copy, loading,
error, pagination, composer, social, and moderation scenarios additionally run
at 360px, 390px, 640px, 768px, 1024px, and 1280px. This produces 642
route/viewport checks. The 640px viewport is the CSS-pixel reflow equivalent of
a 1280px page at 200% zoom; a separate interaction check applies a 200% root
text scale and proves that the creation path retains every required control.

The matrix includes empty, sparse, typical, dense, long-text, no-media,
mixed-media, loading, recoverable-error, hard 404/410, guest, authenticated,
pagination, offline, privacy, blocked, archived, and moderation states. Routes
come only from stable manifest scenario IDs and are tested with identical
records across viewports.

## Automated Failure Gates

Each browser route must have exactly one rendered `main` landmark and one H1,
no duplicate IDs, no horizontal document overflow, no visible interactive
control outside the viewport unless contained by an intentional scroll region,
the expected route response, and no uncaught page error. The runner uses a
fresh page per scenario and clears cookies plus browser storage so one fixture
state cannot contaminate another.

High-risk scenarios run Axe at 320px and 1440px against WCAG 2 A/AA, WCAG 2.1
A/AA, and WCAG 2.2 AA tags; critical or serious violations fail the run.
Interaction gates separately prove:

- the localized skip link is first in keyboard order and focuses content;
- the mobile Sheet traps focus in both directions, closes with Escape, restores
  trigger focus, and retains the privacy route;
- reduced-motion preference caps animation and transition duration without
  removing state feedback;
- 200% text scaling retains the file input, progressive detail, and save action
  without horizontal page scroll or lost controls;
- a guest mutation reaches the shared `/auth/intent` boundary and remains
  keyboard reachable;
- report and block controls stay visible, reachable, and non-overflowing at
  320px.

Next.js streamed not-found and redirect flows require one explicit browser
status allowance: profile not-found UI and intent start routes can return the
initial document as HTTP 200 while still rendering the canonical noindex
not-found or redirect outcome. Their fixture contracts and final UI state remain
verified; other 404/410 routes must return their literal expected status.

## UI Corrections

The shared shell gains localized skip navigation, a focusable content target,
safe-area-aware mobile content clearance, a stable bottom-navigation stacking
layer, global visible focus, and reduced-motion handling. Header actions move
to their full-text desktop form only when width can support 200% text.

Shared shadcn Button sizing provides a 44px mobile target while retaining the
existing compact desktop density. Labels wrap instead of clipping, and the
destructive variant uses a solid high-contrast treatment. Dense workspace,
passport provenance, profile safety menus, and first/follow-up composer grids
gain explicit `min-width: 0` and mobile-bounded controls. Icon-only media,
pagination, catalog, and community links receive semantic accessible names;
loading surfaces expose status semantics; invalid definition-list semantics
are replaced by list semantics.

## Privacy And Evidence Boundaries

The browser runner refuses `over.garden` and all non-loopback hosts unless an
isolated Preview opt-in is explicit. Evidence paths are relative, stable,
redacted, and tested to reject credentials, auth tokens, precise coordinates,
quarantine keys, and email-like identities. OVE-187 continues to own fixture
seed/reset boundaries and production refusal; OVE-185 does not broaden them.

## CI And Reproduction

CI builds the production app, starts Postgres, Meilisearch, and MinIO service
containers, seeds OVE-187, starts the built Next.js server on loopback, installs
the pinned Playwright Chromium runtime, and runs:

```bash
cd apps/web
pnpm test:a11y
```

Optional screenshot evidence is written only when
`ACCESSIBILITY_EVIDENCE_DIR` is set. The deterministic captures cover mobile
dense feed, desktop creation, mobile dense community, and 200%-reflow creation.
The gate fails closed on navigation, structure, Axe, interaction, or fixture
contract errors and never targets Production.
