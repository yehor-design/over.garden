# Localization Coverage Baseline

Status: binding implementation baseline for OVE-170 through OVE-171
Date: 2026-07-16

## Purpose

This document prevents the remaining localization slices from rebuilding work
that already exists. It records the current code-backed `uk`/`bg`/`ru`
baseline after OVE-164 through OVE-169 and the OVE-172 through OVE-185
product reconstruction.

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
  OAuth transport errors no longer render as interface copy.
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
| Auth intent, account linking, recovery, support, erasure, privacy, and publication disclosure | `trust-surface-copy.ts`, localized route metadata, inherited signed-in locale, safe auth/OAuth error classification, exact auth-intent resume, privacy/consent and disclosure route tests                                                  | Preserve       | OVE-171 regression gate only                                |
| Owner garden workspace and first-object creation                                              | `garden-workspace-copy.ts`, localized inventory/continuity, local-state and draft recovery, first-entry composer, kind/voice/mention controls, region labels, safe recovery errors, and save-progress tests across `uk`/`bg`/`ru`          | Preserve       | OVE-171 regression gate only                                |
| Owner living-object continuity and follow-up                                                  | `owner-object-copy.ts`, localized owner route/actions, follow-up composer, privacy/catalog/provenance controls, progress/value moments, source chrome, lifecycle consequences, and locale-aware public continuations across `uk`/`bg`/`ru` | Preserve       | OVE-171 regression gate only                                |
| Owner lineage claims, invitation handoff, and questions                                       | `owner-lineage-copy.ts`, localized route metadata/dates/states/actions, secure handoff copy, and exact intent/security regression tests across `uk`/`bg`/`ru`                                                                              | Preserve       | OVE-171 regression gate only                                |
| Admin, curation, pilot, erasure-operator, and health UI                                       | Shared shell can resolve locale, but the operator pages do not have a complete locale-aware authored-copy contract                                                                                                                         | Missing        | OVE-170                                                     |
| Whole-product route/state coverage gate                                                       | Existing copy-key and route tests are distributed; no unified route/state inventory or zero-gap CI report exists                                                                                                                           | Missing        | OVE-171                                                     |

## Remaining Verified Gap Examples

These examples identify ownership; they are not an exhaustive string list:

- Operator routes still expose authored English labels such as `Access denied`
  and unlocalized form/status copy.

## Cross-Project Sequencing

- OVE-161 and OVE-167 are complete. The approved alias, locale-variant, trust,
  and no-match behavior is now covered by the first-entry localization
  contract and remains an OVE-171 regression input.
- OVE-161 and OVE-168 are complete. The owner catalog resolve/readback copy now
  targets the final canonical selection and ambiguity contract and remains an
  OVE-171 regression input.
- OVE-163 blocks OVE-170 because OVE-158 through OVE-162 add the operator
  matching queue, approval, alias, duplicate-review, rollout-proof, and failure
  states that OVE-170 must cover.
- OVE-166 through OVE-169 are complete. OVE-169 remains independent of
  deterministic matching. OVE-171 stays blocked directly by OVE-167 through
  OVE-170 and retains the completed OVE-166 and OVE-168 contracts as regression
  inputs; OVE-161 and OVE-163 are inherited transitively to keep the DAG
  explicit without duplicate blockers.

## Implementation Rules

1. OVE-170 is the remaining incremental delta slice. It must extend or
   reuse existing copy contracts and canonical components instead of creating a
   second localization system.
2. A `Preserve` surface is out of implementation scope unless a focused test or
   OVE-171 reports a concrete missing key/state. It remains in regression scope.
3. Do not rebuild repositories, authorization, routing, mutation, offline,
   lifecycle, media, indexing, or privacy behavior merely to localize UI copy.
4. Move remaining authored copy into typed locale bundles with exact key parity.
   Keep UGC, catalog/scientific names, official sources, literal evidence, and
   stable machine values unchanged.
5. OVE-171 must ingest the existing contracts and tests. It must not require
   already localized surfaces to be translated again.
6. Estimates and acceptance criteria refer only to the remaining delta plus
   regression proof, not to rebuilding the shipped baseline.
