# Workspace resilience proof — 2026-09

Status: generated receipt. Regenerate with `pnpm prove:workspace-resilience`.
Issue: OVE-374. Decision: `docs/adr/ADR-0023-workspace-resilience.md`.

## What was run

Every page under `/garden/**` was fetched from a local production build
(`next start`) whose `DATABASE_URL` points at a closed port, with a signed-in
session cookie. Each response had to answer `200`, carry its **own** heading,
carry at least one `data-section-failure="connection_unavailable"` section,
leave no Suspense boundary stranded, and error no boundary at all.

"Stranded" is the precise form of the check, and the precision matters. A route
with its own `loading.tsx` **always** writes that fallback into the byte
stream; React then replaces it with a completion instruction. So the question is
never whether a skeleton appears in the bytes — it always does — but whether one
was left standing. The ADR-0023 defect has exactly that signature: the fallback
is written, the stream closes, and no completion instruction ever arrives.

Nothing below is derived from a cookie, header, body, query string, or HTML
fragment: only status, presence of a heading, bounded classes, and counts.

## Result

Passed 11 of 11 surfaces.

| Surface | Status | Own heading | Classes rendered | Stranded skeleton | Boundaries completed |
| -- | -- | -- | -- | -- | -- |
| `garden-home` | 200 | yes | `connection_unavailable` | none | 3 |
| `stable-registry` | 200 | yes | `connection_unavailable` | none | 3 |
| `stable-registry-extensions` | 200 | yes | `connection_unavailable` | none | 3 |
| `stable-registry-editions` | 200 | yes | `connection_unavailable` | none | 3 |
| `object` | 200 | yes | `connection_unavailable` | none | 3 |
| `entry-edit` | 200 | yes | `connection_unavailable` | none | 3 |
| `profile` | 200 | yes | `connection_unavailable` | none | 3 |
| `lineage-claims` | 200 | yes | `connection_unavailable` | none | 3 |
| `lineage-questions` | 200 | yes | `connection_unavailable` | none | 3 |
| `lineage-invitation-claim` | 200 | yes | `connection_unavailable` | none | 3 |
| `erasure-requests` | 200 | yes | `connection_unavailable` | none | 3 |

Generated at 2026-09-03T16:48:02.906Z against `http://127.0.0.1:3011`.
