# OVE-180 Gardener Profile V2 Design

Status: approved for implementation by the OVE-180 Linear execution request
Date: 2026-07-12

## Product decision

The public gardener profile becomes an evidence index, not a biography page.
Visitors first see the living objects a keeper is responsible for and the
dated journal evidence they have published. Identity, biography, language,
safe region, relationship context, and contribution signals explain that
evidence without replacing it or requiring a real name, exact city, birthday,
or contact data.

The page transfers Drive2's object-first hierarchy, dense cross-linking, and
"profile as work history" model while keeping OverGarden terminology,
Shadcn-based components, noindex policy, and privacy boundaries. Biography is
secondary. Direct messages, reputation scores, leaderboards, and exact
geography remain out of scope.

## Architecture

1. Expand `user_public_profiles` with bounded public profile fields: bio,
   language codes, optional coarse region, visibility/lifecycle settings,
   relationship-count visibility, and an owner-consistent processed avatar
   media reference. Account identity and provider data stay in Better Auth and
   never join the public profile projection.
2. Build one public-safe profile read model from active public profile fields,
   living objects that have active public journal anchors, recent active public
   journal entries, processed derivative covers, aggregate object kinds,
   confirmed public lineage evidence, and allowed relationship counts.
3. Keep owner settings and public readback separate. The owner loader returns a
   scoped editor contract plus a nested public preview produced through the
   same presentation serializer. The editor renders that preview in visitor
   state, prevents preview-only mutations, and retains owner empty recovery.
   Private objects, drafts, account email, providers, moderation evidence, and
   exact location never enter the preview.
4. Add profile-level follow, report, block, unfollow, and unblock repositories
   as scoped, idempotent mutations. A block removes active follows in both
   directions and makes the profile unavailable to either signed-in party.
   OVE-183 will extend these primitives into followed feed, notifications, and
   other target kinds; OVE-180 does not add those downstream loops.
5. Extend the OVE-174 intent contract so guest follow, report, and block actions
   preserve a profile target and return to the exact localized profile control.
6. Add document-only profile lifecycle handling in proxy so missing, private,
   and removed profiles return a generic localized hard `404` before App Router
   streaming. Active public profiles continue through the shared SiteShell.

## Page hierarchy

- Compact identity header: safe avatar/fallback, display name, handle, optional
  coarse region, language labels, and viewer-appropriate actions.
- Object-kind evidence strip: total public objects plus plant, animal, and bee
  colony counts. Counts come from the same public object predicate as cards.
- Living objects first: six visible cards with processed cover, kind, identity,
  latest public evidence date, and passport route; a native disclosure reveals
  the bounded dense remainder without shifting the page.
- Recent journal evidence second: eight visible dated entries with object/space
  context, excerpt, optional processed cover, and journal route; a disclosure
  reveals the bounded dense remainder.
- About and trust signals last: bounded bio, languages, safe-region state,
  confirmed lineage contribution, and public relationship counts only when the
  owner allows aggregate counts.
- Context rail: in-page object/journal/about anchors plus public journals,
  followed feed, claims, and privacy/report context. Mobile repeats all safety
  controls inside the content column.

Empty profiles show no fabricated activity. Guests get read-open content and
auth intent only when they choose follow, report, or block. Owners get a clear
add-object action, scoped edit form, blocked-profile management, and the exact
public content preview before saving.

## Data and safety rules

- Public profile lookup requires `profile_visibility = 'public'`, active
  lifecycle, and no removal timestamp. Private, removed, malformed, reserved,
  and unknown handles are indistinguishable through a generic `404`.
- Public objects require at least one active, published, non-gone public entry.
  Object and journal counts use exactly those predicates; private and archived
  rows cannot affect cards, ordering, or counts.
- Media readback requires a processed derivative owned by the same actor and
  attached to eligible public evidence. Public view models contain URLs only,
  never media IDs, quarantine keys, derivative keys, or storage metadata.
- Profile region is hidden unless visibility is explicitly `region` and the
  code is a supported UA/BG coarse region. City-only administrative codes are
  reduced to country display in the public profile; ordinary oblast/province
  codes remain regional. Exact coordinates and city fields do not exist in
  this contract.
- Aggregate followers/following render only when the target profile allows
  counts. Relationship rows never reveal who follows whom on this page.
- Follow refuses self-targets, private/removed targets, and either-direction
  blocks. Report records one bounded enum reason per reporter/target. Block is
  mutual for visibility and interaction and removes follows transactionally.
- The public profile remains `noindex, nofollow` until central policy promotes
  it. No profile fixture reaches production search, people discovery,
  notifications, email, push, or analytics.

## Deterministic evidence

Version the shared fixture manifest with explicit profile settings,
relationship rows, and machine-checkable profile scenarios. The corpus covers:

- established gardener, apartment plant keeper, animal keeper, beekeeper,
  new/empty keeper, and private/unavailable profile;
- zero, one, and dense public objects and journals with exact expected IDs;
- plant-only, animal-only, bee-only, and mixed-object summaries;
- no avatar and processed raster avatar; hidden, region-level, and no region;
- short and boundary-length display name/bio; multiple language combinations;
- guest, authenticated non-owner, owner preview, blocked viewer, private,
  removed/missing `404`, dense disclosure, and empty recovery states;
- zero, one, and many real aggregate follow counts without exposing identities.

The verifier must call production public and owner loaders, assert exact public
object/journal IDs and counts, prove private/archived exclusion, exercise block
visibility, and confirm owner editor data is absent from serialized public
readback.

## Verification contract

- Repository, lifecycle, auth-intent, action, component, route, localization,
  owner-preview, manifest, seed/reset, and verifier tests follow red-green.
- Local schema bootstrap and generated Kysely types are current.
- Lint, typecheck, full tests, production build, fixture verification, diff
  checks, and the mainline closeout guard pass.
- Browser QA covers guest, non-owner, owner, blocked/private, empty, typical,
  dense, long-copy, raster/fallback avatar, all object kinds, Ukrainian,
  Bulgarian, and Russian routes at desktop, 390px, and 320px.
- Screenshot evidence includes a Drive2 profile reference, exact OverGarden
  before, desktop after, mobile after, owner state, blocked/private state, and a
  matched side-by-side comparison.
