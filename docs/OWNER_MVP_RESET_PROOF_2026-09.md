# Owner MVP reset proof (2026-09-03)

Status: receipt of `apps/web/scripts/prove-owner-mvp-reset.ts` against `https://over.garden`
Authority: ADR-0022 (OVE-373). Safe GETs and HEADs only, no credentials; counts and classes only.

| Requirement | Check | Class | Detail |
| -- | -- | -- | -- |
| D3 indexable | sampled entries index, follow with canonical and JSON-LD | pass | 8/8 index, 8/8 canonical, 8/8 JSON-LD |
| D3 sitemap | sitemap index lists entries, profiles, communities | pass | chunks present: entries, profiles, communities |
| D4 cache | x-vercel-cache HIT on the second read of four public pages | pass | /: HIT 244 ms; /journals: HIT 266 ms; /feed: HIT 216 ms; /bg/journal/%D0%B4%D0%BE%D0%BC%D0%B0%D1%82-sep-3-aecc664d3ca0: HIT 202 ms |
| D2 delivery | entry photos with variants have srcset and no /_next/image | pass | 6 entries with photos: 1/1 with variants serve srcset, 5 published before migration 0047 (primary only), 0 through the optimizer |
| D6 sessions, offline residue | no retirement or convergence-gate markers | pass | none found |
| D5 admin, D2 session contract | /admin, anonymous /health, and the retired reservations route answer 404 | pass | /admin: 404; /health: 404; /api/media/staging/reservations: 404 |
| Voice removal | no speech or microphone API in the web source | pass | 0 matches |

`pending` names a check whose runtime is shipped but whose production data is
not there yet (for example `srcset` before any photo has been published after
migration 0047).
