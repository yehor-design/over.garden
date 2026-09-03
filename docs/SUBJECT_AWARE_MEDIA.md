# Subject-Aware Media (OVE-197)

Status: shipped on main after production canary
Authority: additive `media_assets` focal/intrinsic columns + shared presentation contract

## Contract

- `media_assets.intrinsic_width` / `intrinsic_height` — final browser-generated WebP pixels with orientation already baked into the stored artifact.
- `media_assets.focal_x` / `focal_y` — normalized subject point in `[0,1]`, default `0.5/0.5`.
- Presentation modes (never raw CSS from clients):
  - `cover` → `object-fit: cover` + `object-position` from clamped focal
  - `contain` → full-image visibility; focal ignored for fit (position fail-closes to center)
- Invalid/out-of-range focal → center fail-closed.
- Browser codec policy rejects images outside the bounded final-WebP dimensions;
  there is no separate server quality-admission gate.
- `media_assets.placeholder_data_uri` (OVE-371) — a 16 px WebP data URI, at
  most 400 bytes, painted behind the `<img>` until it loads.
- `media_assets.variant_long_edges` (OVE-371) — which of the 1280/480 variants
  were promoted next to the primary; keys are derived, never stored twice.
- `SubjectAwareMediaImage` is a plain `<img>` since OVE-371: `srcSet` comes
  from `buildPublicMediaSourceSet` (variant widths at the encoder's rounding,
  primary last), `sizes` stays with the call site, `fill`/`priority` keep their
  `next/image` meaning.

## Surfaces

Shared helpers:

- `apps/web/src/lib/media/presentation-contract.ts`
- `apps/web/src/components/media/subject-aware-media-image.tsx`
- Owner control: `PATCH /api/media/[mediaAssetId]/focal` + `OwnerMediaFocalPanel`

Cover identity remains OVE-207. OVE-197 only crops the already-chosen derivative.

Meilisearch does **not** store focal fields (no matching redeploy). Discovery cards use Postgres cover URLs + SSR presentation.

## Production catch-up

Apply `apps/web/sql/0006_ove197_media_focal_presentation.sql` once per environment.
Apply `apps/web/sql/0047_ove371_media_variants.sql` for the placeholder and
variant columns; the deploy is safe before it (the columns are probed).

## Smoke

```bash
cd apps/web
pnpm smoke:media-focal-presentation -- --environment local --confirm-environment local
# production canary (redacted booleans only):
pnpm smoke:media-focal-presentation -- --environment production --confirm-environment production --base-url https://over.garden --path /journals
```

## Explicit non-claims

- No AI subject detection
- No video
- No per-surface crop files
- No OVE-186 Done
- No Meili schema upgrade for focal
- No EXIF / original / quarantine leak into UI, search, analytics, or evidence
