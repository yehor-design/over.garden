# Localization Coverage Baseline

Status: binding implementation baseline for OVE-167 through OVE-171
Date: 2026-07-16

## Purpose

This document prevents the remaining localization slices from rebuilding work
that already exists. It records the current code-backed `uk`/`bg`/`ru`
baseline after OVE-164 through OVE-166 and the OVE-172 through OVE-185
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

## Current Coverage Matrix

| Surface                                                                                       | Current evidence                                                                                                                                                                                                                                         | Classification | Remaining owner                                             |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------- |
| Locale resolution and continuity                                                              | `interface-localization.ts`, server resolver, Proxy tests, root layout language, HTTP-only preference                                                                                                                                                    | Preserve       | OVE-171 regression gate only                                |
| Shared site shell and navigation                                                              | `site-shell.tsx`, `site-shell-navigation.ts`, OVE-172 shell tests                                                                                                                                                                                        | Preserve       | OVE-171 regression gate only                                |
| Public home/feed                                                                              | localized route/content contract from OVE-173                                                                                                                                                                                                            | Preserve       | OVE-171 regression gate only                                |
| Public living-object catalog                                                                  | `public-object-catalog-copy.ts` and route tests                                                                                                                                                                                                          | Preserve       | OVE-171 regression gate only                                |
| Public journal directory                                                                      | `public-journal-directory-copy.ts` and route tests                                                                                                                                                                                                       | Preserve       | OVE-171 regression gate only                                |
| Public knowledge hub                                                                          | `public-knowledge-copy.ts` and route tests                                                                                                                                                                                                               | Preserve       | OVE-171 regression gate only                                |
| Public passport, journal readback, variety, profile, engagement, and 404/410                  | `public-surface-localization.ts`, `living-object-passport.ts`, `public-journal-entry-copy.ts`, `public-profile-copy.ts`, lifecycle copy/tests                                                                                                            | Preserve       | OVE-171; owning delta issue only when the gate proves a gap |
| Followed feed, notifications, bookmarks, and wishlist                                         | `social-surface-copy.ts` and OVE-183 route tests                                                                                                                                                                                                         | Preserve       | OVE-169 audits residual action/error states only            |
| Guest community directory/detail                                                              | `community-copy.ts` and OVE-184 route tests                                                                                                                                                                                                              | Preserve       | OVE-169 audits residual action/error states only            |
| Public and owner profile presentation/editor                                                  | `public-profile-copy.ts`, `PublicProfileView`, owner profile `COPY` map and tests                                                                                                                                                                        | Preserve       | OVE-169 regression coverage only                            |
| Auth intent, account linking, recovery, support, erasure, privacy, and publication disclosure | `trust-surface-copy.ts`, localized route metadata, inherited signed-in locale, safe auth/OAuth error classification, exact auth-intent resume, privacy/consent and disclosure route tests                                                                | Preserve       | OVE-171 regression gate only                                |
| Owner garden workspace and first-object creation                                              | `/garden` layout/top chrome and selected labels use OVE-164 copy; V2 workspace receives `locale`; workspace sections, local-state panel, first-entry composer, drafts, kind/voice/mention controls, and save feedback retain English copy                | Partial        | OVE-167                                                     |
| Owner living-object continuity and follow-up                                                  | Owner route resolves locale and reuses a small shared object copy subset; public passport/journal are localized; owner controls, follow-up composer, catalog/privacy/provenance labels, progress/value states, and lifecycle actions retain English copy | Partial        | OVE-168                                                     |
| Owner lineage claims, invitation handoff, and questions                                       | Public lineage/passport evidence is localized; owner claim/invitation/question routes have no complete typed locale copy contract                                                                                                                        | Partial        | OVE-169                                                     |
| Admin, curation, pilot, erasure-operator, and health UI                                       | Shared shell can resolve locale, but the operator pages do not have a complete locale-aware authored-copy contract                                                                                                                                       | Missing        | OVE-170                                                     |
| Whole-product route/state coverage gate                                                       | Existing copy-key and route tests are distributed; no unified route/state inventory or zero-gap CI report exists                                                                                                                                         | Missing        | OVE-171                                                     |

## Remaining Verified Gap Examples

These examples identify ownership; they are not an exhaustive string list:

- `garden-workspace-view.tsx` receives `locale` but still renders labels such as
  `Garden summary`, `Spaces`, and `Recent continuity` directly.
- `first-entry-composer.tsx` has direct English labels, placeholders,
  validation/recovery copy, and save states.
- The owner object route localizes only a small shared subset while the
  follow-up composer and catalog/privacy/provenance controls retain direct
  English copy.
- Operator routes still expose authored English labels such as `Access denied`
  and unlocalized form/status copy.

## Cross-Project Sequencing

- OVE-161 blocks OVE-167 because approved aliases, locale variants, trust
  metadata, and no-match behavior change the real first-entry typeahead states
  that OVE-167 localizes.
- OVE-161 blocks OVE-168 because the owner catalog resolve/readback copy must
  target the same final canonical selection and ambiguity contract.
- OVE-163 blocks OVE-170 because OVE-158 through OVE-162 add the operator
  matching queue, approval, alias, duplicate-review, rollout-proof, and failure
  states that OVE-170 must cover.
- OVE-166 is complete. OVE-169 remains independent of deterministic matching.
  OVE-171 stays blocked directly by OVE-167 through OVE-170 and retains the
  completed OVE-166 contract as a regression input; OVE-161 and OVE-163 are
  inherited transitively to keep the DAG explicit without duplicate blockers.

## Implementation Rules

1. OVE-166 through OVE-170 are incremental delta slices. They must extend or
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
