# Localization Coverage Baseline

Status: completed binding baseline and regression gate through OVE-171
Date: 2026-07-16

## Purpose

This document prevents later product slices from rebuilding localization work
that already exists. It records the code-backed `uk`/`bg`/`ru` baseline after
OVE-164 through OVE-171 and the OVE-172 through OVE-185 product
reconstruction.

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
- OVE-166 adds `trust-surface-copy.ts` as the exact-parity `uk`/`bg`/`ru`
  contract for authentication, intent resume, account linking, recovery,
  support, erasure, privacy/consent, and publication disclosure. Raw auth and
  OAuth transport errors no longer render as interface copy. OVE-204 extends
  that same namespace with current-session, unsynced-work, destructive-choice,
  retry, and operator-utility copy; My Account, desktop/mobile shell, and real
  excluded operator surfaces consume one locale-aware sign-out state machine.
- OVE-167 adds `garden-workspace-copy.ts` as the exact-parity `uk`/`bg`/`ru`
  contract for the owner workspace, inventory, first-object creation, local
  drafts, offline queue, media recovery, coarse-region labels, and save
  feedback. The existing OVE-187 v8 corpus proves owner-scoped workspace and
  creation states without changing repositories, draft payloads, media
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
- OVE-170 adds `operator-copy.ts`, `operator-pilot-copy.ts`,
  `operator-smoke-copy.ts`, `operator-erasure-copy.ts`, and
  `operator-curation-copy.ts` as exact-parity `uk`/`bg`/`ru` contracts for
  admin, community moderation, catalog curation, pilot health/learning/smoke,
  erasure operations, and diagnostics. Every unprefixed operator route consumes
  the OVE-164 selected request locale while existing authorization,
  repositories, actions, audits, source provenance, erasure semantics, and
  diagnostic contracts remain unchanged.
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

## Current Coverage Matrix

| Surface                                                                                       | Current evidence                                                                                                                                                                                                                           | Classification | Remaining owner                                             |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ----------------------------------------------------------- |
| Locale resolution and continuity                                                              | `interface-localization.ts`, server resolver, Proxy tests, root layout language, HTTP-only preference                                                                                                                                      | Preserve       | OVE-171 regression gate only                                |
| Shared site shell and navigation                                                              | `site-shell.tsx`, `site-shell-navigation.ts`, OVE-172 shell tests                                                                                                                                                                          | Preserve       | OVE-171 regression gate only                                |
| Public home/feed                                                                              | localized route/content contract from OVE-173                                                                                                                                                                                              | Preserve       | OVE-171 regression gate only                                |
| Public living-object catalog                                                                  | `public-object-catalog-copy.ts` and route tests                                                                                                                                                                                            | Preserve       | OVE-171 regression gate only                                |
| Public journal directory                                                                      | `public-journal-directory-copy.ts` and route tests                                                                                                                                                                                         | Preserve       | OVE-171 regression gate only                                |
| Public knowledge hub                                                                          | `public-knowledge-copy.ts` and route tests                                                                                                                                                                                                 | Preserve       | OVE-171 regression gate only                                |
| Public passport, journal readback, variety, profile, engagement, and 404/410                  | `public-surface-localization.ts`, `living-object-passport.ts`, `public-journal-entry-copy.ts`, `public-profile-copy.ts`, lifecycle copy/tests                                                                                              | Preserve       | OVE-171; owning delta issue only when the gate proves a gap |
| Followed feed, notifications, bookmarks, and wishlist                                         | `social-surface-copy.ts`, localized route metadata, and OVE-183/OVE-169 route tests                                                                                                                                                        | Preserve       | OVE-171 regression gate only                                |
| Guest community directory/detail                                                              | `community-copy.ts` and OVE-184/OVE-169 regression tests                                                                                                                                                                                   | Preserve       | OVE-171 regression gate only                                |
| Public and owner profile presentation/editor                                                  | `public-profile-copy.ts`, `PublicProfileView`, owner profile `COPY` map, and OVE-169 regression tests                                                                                                                                      | Preserve       | OVE-171 regression gate only                                |
| Auth intent, account linking, current-session sign-out, recovery, support, erasure, privacy, and publication disclosure | `trust-surface-copy.ts`, localized route metadata, inherited signed-in locale, safe auth/OAuth error classification, exact auth-intent resume, owner-local unsynced-work choices, privacy/consent and disclosure route tests | Preserve       | OVE-171 regression gate only                                |
| Owner garden workspace and first-object creation                                              | `garden-workspace-copy.ts`, localized inventory/continuity, local-state and draft recovery, first-entry composer, kind/voice/mention controls, region labels, safe recovery errors, and save-progress tests across `uk`/`bg`/`ru`          | Preserve       | OVE-171 regression gate only                                |
| Owner living-object continuity and follow-up                                                  | `owner-object-copy.ts`, localized owner route/actions, follow-up composer, privacy/catalog/provenance controls, progress/value moments, source chrome, lifecycle consequences, and locale-aware public continuations across `uk`/`bg`/`ru` | Preserve       | OVE-171 regression gate only                                |
| Owner lineage claims, invitation handoff, and questions                                       | `owner-lineage-copy.ts`, localized route metadata/dates/states/actions, secure handoff copy, and exact intent/security regression tests across `uk`/`bg`/`ru`                                                                              | Preserve       | OVE-171 regression gate only                                |
| Admin, curation, pilot, erasure-operator, and health UI                                       | Exact-parity operator copy namespaces, selected-locale route/component tests, localized dates/status explanations/actions, and unchanged authorization/source/evidence boundaries across every current operator route                      | Preserve       | OVE-171 regression gate only                                |
| Whole-product route/state coverage gate                                                       | `localization-coverage.ts`, exact route/copy registries, AST authored-copy scan, mutation tests, redacted report, CI check, and shared OVE-185/186 browser proof                                                                           | Complete       | Automated OVE-171 regression gate                           |

## Operator Route And Literal-Value Registry

The OVE-171 gate retains route/state coverage for `/admin`, `/admin/users`,
`/admin/communities`, `/admin/communities/:slug`,
`/garden/catalog/curation`, `/garden/pilot-health`,
`/garden/pilot-learning/interviews`, `/garden/pilot-learning/decision`,
`/garden/pilot-smoke`, `/garden/privacy/erasure-requests`, and `/health`.

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

## Implementation Rules

1. OVE-164 through OVE-170 are completed regression inputs. New work must
   extend their copy contracts and canonical components instead of creating a
   second localization system.
2. A `Preserve` surface is out of implementation scope unless a focused test or
   the OVE-171 gate reports a concrete missing key/state. It remains in
   regression scope.
3. Do not rebuild repositories, authorization, routing, mutation, offline,
   lifecycle, media, indexing, or privacy behavior merely to localize UI copy.
4. Move remaining authored copy into typed locale bundles with exact key parity.
   Keep UGC, catalog/scientific names, official sources, literal evidence, and
   stable machine values unchanged.
5. The OVE-171 gate ingests the existing contracts and tests. It must not
   require already localized surfaces to be translated again.
6. Estimates and acceptance criteria refer only to the remaining delta plus
   regression proof, not to rebuilding the shipped baseline.

The binding extension procedure is
`docs/LOCALIZATION_COVERAGE_WORKFLOW.md`.
