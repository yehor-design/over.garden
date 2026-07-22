# MVP Scope Recheck 2026-07-03

Status: current scope reconciliation note
Date: 2026-07-03; localization clarification added 2026-07-22
Owner: founder/operator

## Purpose

This note records the founder/operator decisions confirmed in chat on 2026-07-03 after the product/code/research audit follow-up. It exists to prevent future agents from following older MVP assumptions that were intentionally superseded.

This note is a scope and planning record. It does not claim the listed product work is implemented.

## Product Thinking Gate

Context files used for this reconciliation:

- `docs/product-research/README.md`
- `docs/product-research/OverGarden_MVP_PRD_v0.md`
- `docs/product-research/OverGarden_PAGE_ARCHITECTURE_v1.md`
- `docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md`

Product assumption: the fastest useful MVP now requires the single-player journal loop plus public discovery, localization, social proof/lineage mechanics, lower composer friction, and self-serve entry without introducing monetization before usefulness and public behavior are proven.

User job and trust concern: gardeners need a durable, low-friction growing memory that can become publicly useful without exposing precise location, private identity, raw media metadata, or unsafe thin UGC to search engines.

## Confirmed Decisions

- Public SEO/AEO starts at MVP launch. Blog, guides, market landings, and useful answer pages may be public and indexable from day one. Thin UGC, variety, topic, lineage, and profile pages must stay `noindex` until explicit quality gates promote them.
- OVE-53 field-run gate is closed from founder-provided redacted evidence: 8 invited, 8 started, 8 created a first entry, and 6 created a same-object follow-up. The decision is to continue with the same segment set.
- The segment set remains: micro/one-pot growers, Gen Z and young beginners, burned-out IT/knowledge workers/digital exiles, practical beginners with land/new dacha owners, urban balcony/patio/small-space gardeners, plant collectors and rare plant people, food self-reliance beginners, homestead/smallholding aspirants, and experienced gardeners/farmers/animal keepers/DIY practitioners.
- Lineage/social graph is MVP now, not post-MVP. The scope includes provenance edges, chains, claim inbox, invitations, public-safe handles/profiles, cross-user mention/typeahead, lineage readback, follow, ask-the-lineage, followed feed, and bounded notifications.
- Localization is MVP under the OVE-205 market-first contract. Ukraine is
  Ukrainian-only, uses unprefixed canonical public URLs, and has no language
  control; `/uk` is a legacy redirect only. Bulgaria defaults to Bulgarian,
  supports Bulgarian/Russian on explicit `/bg` and `/ru` public routes, and
  has exactly one shared language control on every user-facing page/state.
  Canonical unprefixed product/auth/garden/operator routes retain their URLs
  and persist a Bulgaria-market `bg|ru` choice through a narrow POST boundary.
  UGC is never translated.
- Self-serve auth is MVP. Email auth uses Resend. Google and Facebook auth are already part of the active auth surface. Apple Sign-In is not MVP after the 2026-07-04 founder decision to avoid AppleID login for launch; revisit it only after MVP if native App Store distribution or a fresh sign-in access requirement makes it necessary.
- Full M:N journaling is MVP: a space-level entry can mention multiple objects and appear in the relevant timelines without duplicated entries.
- Composer friction work is MVP now: draft persistence, draft-through-auth, photo-start, title prefill, and voice-to-text.
- MVP legal/privacy copy is founder-approved for MVP, written/generated internally, with lawyer review deferred until after MVP. Public support contact is `support.overgarden@gmail.com`.
- Retention policy for MVP: private quarantine originals are deleted after successful processing or after 7 failed-processing days; public derivatives remain while active and are removed from public surfaces after archive/erasure; operator audit logs and erasure evidence are retained for 1 year; analytics events are retained for up to 13 months; operator evidence must not include private journal text, precise location, emails, IP/user-agent, media keys, or raw tokens.
- Catalog trust UX is MVP: curated/source-backed/candidate/user-added/quarantined/rejected states, clear ambiguous-name handling, alias-collision handling, hidden quarantined rows, and visible source caveats where needed.
- Monetization is not MVP. The first launch must prove usefulness and public behavior before payment or business-model surfaces are built.

## 2026-07-22 Localization Clarification

This dated clarification supersedes the older shorthand that described three
equivalent canonical language folders or a universal language switcher. The
interface market is resolved before locale: a stale locale cannot move a
visitor between Ukraine and Bulgaria, Ukraine cannot render Russian, and the
Bulgaria default remains `bg` even when `Accept-Language` prefers Russian.

OVE-205 owns the market resolver, one-control/zero-control invariant, safe
public target building, unprefixed preference mutation, dirty/in-flight
locale-change coordination, and fail-closed coverage of routes, rendered
states, and application lifecycle HTML. The typed `uk`/`bg`/`ru` copy
contracts shipped by OVE-164 through OVE-171 remain regression inputs.

The founder-approved 2026-07-22 clarification assigns final real-product
browser proof to the slice that implements each downstream surface while
preserving the existing dependency order. OVE-202 owns Editor.js, IME,
serialization, inline-photo, conflict, and offline transition proof; OVE-206
owns pointer/touch/keyboard reorder proof; OVE-207 owns automatic,
explicit-inline, and separate-cover proof plus the combined ten-inline-plus-one
cover state. Each slice must extend the shared coordinator and replace only its
own schema-v3 ownership-ledger entry with real browser scenarios before Done.
Those entries remain visible but do not block OVE-205, and OVE-205 must not
claim that the downstream UI was exercised.

## Linear Coverage

Already documented before this recheck:

- `OVE-114`: scope reconciliation docs
- `OVE-115`: public SEO/AEO surface policy
- `OVE-116`: SEO/AEO content foundation
- `OVE-117`: localization foundation
- `OVE-118`: draft persistence
- `OVE-119`: photo-start and title prefill
- `OVE-120`: voice-to-text
- `OVE-121`: full M:N space journal
- `OVE-122` through `OVE-126`: lineage edge, claim inbox, invitations, graph readback, follow, and ask-the-lineage
- `OVE-127`: Resend email auth
- `OVE-128`: MVP legal/privacy and retention policy
- `OVE-129`: catalog trust UX
- `OVE-130`: promoted variety and topic pages
- `OVE-131`: production owner and public-smoke proof
- `OVE-132`: canceled; Apple Sign-In removed from MVP after founder opted out of AppleID login for launch

Added during the recheck because they were approved by product docs/chat but not explicit enough in Linear:

- `OVE-133`: public-safe `@handle` identity and noindex profile
- `OVE-134`: cross-user `@mention` typeahead for own objects, public objects, handles, and catalog
- `OVE-135`: followed feed and notification center
- `OVE-136`: wishlist shelf
- `OVE-137`: save progress/win moment
- `OVE-138`: comments, bookmarks, and anonymous cosmetic likes with auth/privacy boundaries
- `OVE-139`: topic/tag capture feeding promoted topic pages safely

## Current Warning

`docs/LINEAGE_SCOPE_DECISION.md` was created on 2026-07-01 to block lineage/social graph from current MVP execution. That decision is now superseded by the 2026-07-03 founder/operator decision recorded here. Future agents must not use the older OVE-96 decision as a reason to defer lineage/social graph MVP work.
