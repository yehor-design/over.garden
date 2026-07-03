# MVP Privacy, Support, And Retention Policy

Status: founder-approved MVP copy
Date: 2026-07-03
Owner: founder/operator
Support contact: `support.overgarden@gmail.com`

This document is the developer-facing source for the OVE-128 MVP privacy, support, erasure, and retention wording. It is written/generated internally and approved by the founder for MVP learning. It is not final lawyer-approved public policy.

## Product Assumption

A gardener is more likely to publish and keep journaling when OverGarden explains, in plain language, what becomes public, what stays private, how erasure works, who to contact, and how long sensitive operational evidence is retained. The trust risk is highest around location, media originals, support evidence, account erasure, and external search/crawler copies.

## Public User Copy Rules

- `/privacy`, `/{locale}/privacy`, `/erasure`, `/first-publication-disclosure`, and `/support` must show founder-approved MVP copy, not placeholder or public-release-blocked pilot copy.
- The visible support/privacy contact is `support.overgarden@gmail.com`.
- First-publication wording is versioned as `first-publication-v4`.
- Erasure intake wording is versioned as `erasure-request-mvp-v1`.
- Legal, support, erasure, and diagnostic routes stay `noindex` unless a later public-surface SEO policy deliberately promotes them.
- Lawyer review is deferred until after MVP learning; material copy changes must bump the relevant disclosure version.
- Monetization terms are out of scope for this MVP policy.

## Retention Rules

| Data class | MVP retention rule | Developer boundary |
| --- | --- | --- |
| Private quarantine originals | Delete after successful processing or after 7 failed-processing days. | Quarantine keys and original object keys must stay out of public HTML, search documents, analytics, support evidence, and operator readouts. |
| Public photo derivatives | Stay while the related public entry is active; remove from public surfaces after archive or erasure. | Public pages may render derivative URLs only. Erasure removes OverGarden-controlled objects when their keys are still known. |
| Operator audit logs | Keep for 1 year. | Evidence may include bounded ids, roles, actions, reasons, and timestamps only. |
| Erasure handling evidence | Keep for 1 year. | Evidence may include status, request reference, data-class counts, dry-run review, approval checkpoint, and handled outcome only. |
| Analytics events | Keep for up to 13 months. | Payloads must remain enum/bounded and must not include journal text, exact location, raw URLs, referrers, or contact data. |

## Erasure Semantics

The public `/erasure` form records an operator-reviewed request. It does not automatically delete data. The approved workflow is:

1. User submits an erasure/anonymization request.
2. Operator reviews a non-destructive dry-run preview of affected data classes.
3. Maintainer-approved operator executes irreversible erasure or anonymization only after dry-run review and request-specific approval.
4. Archive removes public OverGarden surfaces first.
5. Approved erasure deletes or anonymizes current-schema account, garden, journal, media, analytics, catalog-provisional, and search-job references where OverGarden controls them.
6. Search-engine, crawler, or AI copies outside OverGarden are removal best-effort only.

## Forbidden Evidence

Operator, support, legal, smoke, audit, and erasure evidence must not include:

- private journal text
- precise location
- private email addresses
- IP addresses
- user agents
- media keys
- raw tokens

Public support contact text may show `support.overgarden@gmail.com`; that exception does not allow copying user emails into evidence.

## Implementation Pointers

- Shared copy/constants: `apps/web/src/lib/privacy/disclosures.ts`
- Public privacy notice: `apps/web/src/app/privacy/page.tsx`
- Localized privacy notice: `apps/web/src/app/[locale]/privacy/page.tsx`
- Erasure request page: `apps/web/src/app/erasure/page.tsx`
- First-publication disclosure: `apps/web/src/app/first-publication-disclosure/page.tsx`
- Support page: `apps/web/src/app/support/page.tsx`
- Operator erasure workflow: `apps/web/src/app/garden/privacy/erasure-requests/page.tsx`

## Verification

Run the focused disclosure/page tests after changing policy copy:

```bash
cd apps/web
pnpm test src/lib/privacy/disclosures.test.ts src/app/privacy/page.test.tsx 'src/app/[locale]/privacy/page.test.tsx' src/app/erasure/page.test.tsx src/app/first-publication-disclosure/page.test.tsx src/app/support/page.test.tsx src/app/auth/help/page.test.tsx
```

Before closing related Linear work, also run:

```bash
cd apps/web
pnpm mainline:closeout:check
pnpm lint
pnpm typecheck
pnpm test
BETTER_AUTH_SECRET="$(openssl rand -base64 32)" pnpm build
```
