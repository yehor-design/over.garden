# Localization Coverage Baseline

Status: preserved historical baseline; current route/copy inventory reconciled by OVE-323 and OVE-338
Date: 2026-08-25

## Purpose

This document prevents later product slices from rebuilding localization work
that already exists. It records the code-backed `uk`/`bg`/`ru` copy baseline
after OVE-164 through OVE-171 and the OVE-172 through OVE-185 product
reconstruction. OVE-205 preserves those namespaces and exact copy contracts,
but supersedes the old locale-first resolution, universal language-choice, and
page/route-only coverage assumptions with the market-first contract in
`docs/INTERFACE_LOCALE_CONTRACT.md`.

A localized route or a `locale` prop is not, by itself, proof of complete copy
coverage. `Preserve` below means the existing typed copy contract and behavior
are implementation inputs that must not be replaced wholesale. `Partial` means
locale plumbing exists but visible authored copy still has verified gaps.
`Missing` means the surface has no complete locale-aware UI contract yet.

## Shipped Evidence

- `766e2ab47` (`feat(localization): preserve interface locale across routes`)
  delivered the OVE-164 resolver, persistence, root document language,
  signed-in continuity, shared shell/workspace/object copy foundation, and
  focused tests.
- `82fafb8af` (`feat(localization): localize public readback surfaces`)
  delivered the OVE-165 public journal, passport, variety, profile,
  engagement, source-credit, and public failure-state copy contract.
- OVE-172 through OVE-185 added typed locale bundles while rebuilding the
  production UI: site shell (`e4ce8d814`), public catalog (`d993d9c90`),
  journal directory (`4a63537d9`), knowledge (`d98034763`), living-object
  passport (`6b52ae02e`), journal entry (`dcaafac3e`), gardener profile
  (`dac896e89`), social return loop (`36a25479c`), and communities
  (`14f1831e9`).
- Connectivity reconciliation (2026-08-21): ADR-0017 removes local drafts,
  offline-queue, unsynced-work, and media-recovery copy from the current
  localization coverage input set. This retired copy leaves the coverage input set.
  OVE-323 completes the runtime/copy removal, re-pins the visual manifest to
  `ove187-v9`, and recounts 101 classified route modules, 135 classified app
  surface modules, and 139 registered surfaces with zero localization gaps;
  dated rows below remain historical evidence.
- OVE-166 adds `trust-surface-copy.ts` as the exact-parity `uk`/`bg`/`ru`
  contract for authentication, intent resume, account linking, recovery,
  support, erasure, privacy/consent, and publication disclosure. Raw auth and
  OAuth transport errors no longer render as interface copy. OVE-204 extends
  that same namespace with historical current-session/unsynced-work, destructive-choice,
  retry, and operator-utility copy; My Account, desktop/mobile shell, and real
  excluded operator surfaces consume one locale-aware sign-out state machine.
- OVE-167 added `garden-workspace-copy.ts` as the exact-parity `uk`/`bg`/`ru`
  contract for the owner workspace, inventory, first-object creation,
  coarse-region labels, and save feedback. OVE-323 removes its historical
  local-draft/queue copy and re-pins the OVE-187 v9 corpus to server-draft and
  connection-required states without changing canonical repositories, media
  boundaries, or idempotency behavior.
- OVE-168 adds `owner-object-copy.ts` as the exact-parity `uk`/`bg`/`ru`
  contract for owner object follow-up, privacy, catalog resolution, provenance,
  source-attribution chrome, progress/value moments, and lifecycle actions. It
  preserves the canonical follow-up mutation, owner/public repository split,
  publication and archive semantics, locale-aware public continuations, UGC,
  catalog identity, official source names, provenance values, and processed
  derivative media.
- OVE-169 adds `owner-lineage-copy.ts` as the exact-parity `uk`/`bg`/`ru`
  contract for owner claim inboxes, invitation claim and secure browser
  handoff, consent outcomes, lineage questions/follows, metadata, dates,
  loading/retry/unavailable copy, and catalog-kind summaries. It preserves
  object names, varieties, pending-identity labels, question text, exact
  intent resume, encrypted HttpOnly invitation handoff, consent/visibility
  behavior, and owner/private repository boundaries. Its focused audit also
  moves the four remaining followed-feed, notification, bookmark, and wishlist
  metadata titles onto the existing `social-surface-copy.ts` contract without
  rebuilding those surfaces.
- OVE-170 historically localized the then-current operator control plane.
  OVE-314 deletes the obsolete admin landing/user-status and pilot
  health/learning/smoke routes plus their dedicated copy modules. Surviving
  community/comment moderation, catalog curation, and erasure operations retain
  exact `uk`/`bg`/`ru` copy. `operator-menu-copy.ts` owns the four sealed-owner
  links inside the ordinary avatar menu.
- OVE-171 adds the `ove171-v1` deterministic completion gate. Baseline hash
  `c3207b180d9e202a45b74fd769ff4613339898cadec10475136936477c15e594`
  registers all 92 current route modules, 66 rendered routes, 22 existing copy
  namespaces, three locales, 171 OVE-187 v8 scenarios, and 13 owner/edge
  browser probes. The report distinguishes 82 preserved-baseline route modules
  from 10 route modules closed by OVE-171 and records six grouped deltas. CI now fails on a
  new unclassified route, stale registration, locale/key/value drift, direct
  unowned authored UI or metadata copy, missing state/owner proof, or an
  invalid literal exclusion. Browser proof covers 642 route/viewport checks,
  26 explicit 320/1440 owner checks, 104 axe checks, 668
  `lang`/`Content-Language` contracts, canonical/hreflang, and mutation-intent
  locale continuity for `uk`, `bg`, and `ru`.
- OVE-205 behavior commit
  `b6145c1a3c176df5ef8634961b5d5642d5b87cbf` ships the schema-v3
  fail-closed market-first extension. Exact-SHA proof covers 171 scenarios,
  642 page checks across eight viewports, 136 Axe checks, 732 route contracts,
  90 owner probes, 90 market cases, 90 control contracts, all 23 coordinator
  interactions, full CI/build/tests, a READY production deployment, default-A1
  browser switching, Ukraine route decisions, resolver parity, and a real hard
  `410` lifecycle response.

## OVE-205 Corrective Boundary (2026-07-22)

The pre-OVE-205 evidence above remains valid for typed copy ownership, literal
exclusions, and the routes/states it actually exercised, but it was not by
itself an OVE-205 completion claim. The exact OVE-205 evidence is bound to the
behavior commit named above.

The schema-v3 report exposes a green static-regression signal separately from
candidate-SHA browser freshness. The mandatory browser run remained an explicit
OVE-205 completion reason instead of being collapsed into a hard-coded success;
the fresh `b6145c1...` artifact discharged it. Downstream real UI remains
visible in a typed ownership ledger with `blocksCurrentIssue: false`; it is not
OVE-205 evidence and did not block its closeout.

- Resolve the interface market before locale. Ukraine allows only `uk`, uses
  unprefixed public canonical URLs, and renders no language control. Bulgaria
  defaults to `bg`, allows `bg|ru`, and renders exactly one shared control on
  every application-owned user-facing page/state.
- `/bg` and `/ru` remain explicit localized Bulgaria public routes. `/uk` is a
  legacy redirect only and cannot appear as a canonical, hreflang, sitemap, or
  generated navigation target.
- Canonical unprefixed product/auth/garden/operator routes use the one narrow
  preference POST boundary; localized public routes use equivalent document
  links with allowlisted query/fragment preservation.
- OVE-205 extended fail-closed discovery beyond the 92 page/route modules in the
  OVE-171 report to layouts, loading/error/not-found/global-error boundaries,
  and application-owned raw `404`/`410`/lifecycle HTML.
- OVE-205 added the shared dirty/in-flight locale-change coordinator and proved
  current product states. It did not claim final structured-editor,
  block-reorder, ten-inline-photo, or separate-cover UI proof; OVE-202, OVE-206,
  and OVE-207 retain that unimplemented downstream work.

The `ove171-v1` totals and 13 owner probes therefore describe a preserved
historical baseline, not the target size or sufficiency of the OVE-205 gate.

## Current Coverage Matrix

| Surface                                                                                                                 | Current evidence                                                                                                                                                                                                                           | Classification   | Current status / next owner                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Locale resolution and continuity                                                                                        | OVE-164 resolver, server boundary, Proxy tests, root layout language, and bounded preference persistence remain copy/plumbing inputs; their locale-first precedence is superseded                                                          | Corrective delta | Shipped by OVE-205 at `b6145c1a3c176df5ef8634961b5d5642d5b87cbf`                                                                   |
| Shared site shell and navigation                                                                                        | `site-shell.tsx`, `site-shell-navigation.ts`, OVE-172 shell tests; current happy-path ownership remains a baseline only                                                                                                                    | Corrective delta | OVE-205 shipped zero/exactly-one control ownership across every registered rendered state                                          |
| Public home/feed                                                                                                        | localized route/content contract from OVE-173                                                                                                                                                                                              | Preserve         | OVE-171 regression gate only                                                                                                       |
| Public living-object catalog                                                                                            | `public-object-catalog-copy.ts` and route tests                                                                                                                                                                                            | Preserve         | OVE-171 regression gate only                                                                                                       |
| Public journal directory                                                                                                | `public-journal-directory-copy.ts` and route tests                                                                                                                                                                                         | Preserve         | OVE-171 regression gate only                                                                                                       |
| Public knowledge hub                                                                                                    | `public-knowledge-copy.ts` and route tests                                                                                                                                                                                                 | Preserve         | OVE-171 regression gate only                                                                                                       |
| Public passport, journal readback, variety, profile, engagement, and 404/410                                            | Existing public copy namespaces and lifecycle tests remain exact-copy inputs; raw/application-owned lifecycle renderers were not all in the old module registry                                                                            | Corrective delta | OVE-205 shipped localized switch safety and complete lifecycle-state registration                                                  |
| Followed feed, notifications, bookmarks, and wishlist                                                                   | `social-surface-copy.ts`, localized route metadata, and OVE-183/OVE-169 route tests                                                                                                                                                        | Preserve         | OVE-171 regression gate only                                                                                                       |
| Guest community directory/detail                                                                                        | `community-copy.ts` and OVE-184/OVE-169 regression tests                                                                                                                                                                                   | Preserve         | OVE-171 regression gate only                                                                                                       |
| Public and owner profile presentation/editor                                                                            | `public-profile-copy.ts`, `PublicProfileView`, owner profile `COPY` map, and OVE-169 regression tests                                                                                                                                      | Preserve         | OVE-171 regression gate only                                                                                                       |
| Auth intent, account linking, current-session sign-out, recovery, support, erasure, privacy, and publication disclosure | Existing exact-parity copy, auth safety, intent continuity, and OVE-204 sign-out behavior remain regression inputs                                                                                                                         | Corrective delta | OVE-205 shipped Bulgaria control and dirty/in-flight coordination on auth/account states                                           |
| Owner garden workspace and first-object creation                                                                        | Current exact-parity workspace, server-draft, connection-required, and media-state copy; historical offline/local-draft copy is provenance only                                                                                            | Corrective delta | OVE-323 shipped runtime/copy removal and the exact zero-gap coverage recount                                                       |
| Owner living-object continuity and follow-up                                                                            | `owner-object-copy.ts`, localized owner route/actions, follow-up composer, privacy/catalog/provenance controls, progress/value moments, source chrome, lifecycle consequences, and locale-aware public continuations across `uk`/`bg`/`ru` | Preserve         | OVE-171 regression gate only                                                                                                       |
| Owner lineage claims, invitation handoff, and questions                                                                 | `owner-lineage-copy.ts`, localized route metadata/dates/states/actions, secure handoff copy, and exact intent/security regression tests across `uk`/`bg`/`ru`                                                                              | Preserve         | OVE-171 regression gate only                                                                                                       |
| Owner avatar menu; community/comment moderation; curation; erasure operator UI                                          | `operator-menu-copy.ts` plus surviving operator copy modules and sealed-owner route tests                                                                                                                                                  | Corrective delta | OVE-338 moved moderation into account routes, retired the complete admin namespace, and preserves exact four-link owner projection |
| Whole-product route/state coverage gate                                                                                 | OVE-171 page/route registry, copy scan, report, and browser proof remain a historical regression baseline                                                                                                                                  | Corrective delta | OVE-205 shipped the fail-closed route/state/lifecycle/raw-renderer gate                                                            |

## Operator Route And Literal-Value Registry

The current gate retains route/state coverage for `/account/communities`,
`/account/communities/:slug`, `/account/moderation/comments`,
`/garden/catalog/curation`, `/garden/privacy/erasure-requests`, and `/health`.
It separately proves exact `404` for the complete `/admin` namespace,
`/garden/pilot-health`, `/garden/pilot-smoke`,
`/garden/pilot-learning/interviews`, `/garden/pilot-learning/decision`, and
`/join` in all three interface locales and for every session class.

The following values are deliberate literal exclusions, not untranslated UI:

- user-, catalog-, scientific-, and source-authored names and notes;
- official legal, source, license, and attribution values;
- enum and wire values in hidden form payloads or explicit technical evidence;
- IDs, slugs, URLs, emails, source record keys, parser/source versions, and
  build or commit values;
- redacted smoke/health evidence, logs, diagnostic codes, SQL/system
  identifiers, and provider/product proper names.

Their surrounding headings, explanations, states, actions, accessibility
names, and destructive consequences are localized. Tests must keep literal
values exact and visibly distinguish them from authored explanations.

## Cross-Project Sequencing

- OVE-161 and OVE-167 are complete. The approved alias, locale-variant, trust,
  and no-match behavior is now covered by the first-entry localization
  contract and remains an OVE-171 regression input.
- OVE-161 and OVE-168 are complete. The owner catalog resolve/readback copy now
  targets the final canonical selection and ambiguity contract and remains an
  OVE-171 regression input.
- OVE-163 and OVE-170 are complete. OVE-170 localizes the final matching queue,
  approval, alias, duplicate-review, rollout-proof, and failure states from
  OVE-158 through OVE-163.
- OVE-166 through OVE-171 are complete. OVE-171 consumed OVE-166 through
  OVE-170 directly and retains the completed OVE-161 and OVE-163 behavior
  transitively through their localized gardener and operator consumers.
- OVE-205 completed the corrective slice on
  `b6145c1a3c176df5ef8634961b5d5642d5b87cbf`. It preserves the completed copy
  contracts while changing market precedence, control ownership, switch
  security, dirty/in-flight coordination, and coverage discovery.
- The founder-approved 2026-07-22 clarification assigns final Editor.js and
  ten-inline proof to OVE-202, final reorder proof to OVE-206, and final cover
  plus combined ten-inline-plus-one-cover proof to OVE-207. The dependency
  order remains unchanged. Do not fabricate browser evidence for nonexistent
  UI, and do not treat those downstream-owned entries as OVE-205 blockers.

## Implementation Rules

1. OVE-164 through OVE-170 are completed regression inputs. New work must
   extend their copy contracts and canonical components instead of creating a
   second localization system.
2. OVE-205 may change route/control policy around a `Preserve` copy surface.
   It must not rewrite that surface's domain behavior or duplicate its locale
   namespace merely because the old OVE-171 coverage model was incomplete.
3. Do not rebuild repositories, authorization, routing, mutation, local-retirement,
   lifecycle, media, indexing, or privacy behavior merely to localize UI copy.
4. Move remaining authored copy into typed locale bundles with exact key parity.
   Keep UGC, catalog/scientific names, official sources, literal evidence, and
   stable machine values unchanged.
5. The OVE-205 gate ingests OVE-171 contracts and tests, then fails closed over
   the expanded route/state/lifecycle inventory. It must not require already
   localized surfaces to be translated again.
6. Estimates and acceptance criteria refer only to the corrective delta plus
   regression proof, not to rebuilding the shipped baseline. Completion still
   requires real current-state and exact-SHA release evidence.

The binding extension procedure is
`docs/LOCALIZATION_COVERAGE_WORKFLOW.md`.
