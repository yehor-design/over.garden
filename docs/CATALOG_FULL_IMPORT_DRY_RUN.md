# Catalog Full Import Dry-Run

Status: OVE-80 operator preflight
Primary command: `cd apps/web && pnpm catalog:sources:dry-run`
Readiness authority: `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json`

OVE-80 adds the redacted dry-run report that must be produced before later full-import slices mutate a source-family import or project new product-visible catalog concepts.

The report is a preflight contract, not an importer. It does not connect to the database, does not read `.env.local`, does not call external source APIs, and does not write staging, preview, production, or local data. It summarizes the current proof importers and source-family gates so the operator can see the import shape before any bulk command runs.

## Commands

Local preflight:

```bash
cd apps/web
pnpm catalog:sources:dry-run -- --environment local --confirm-environment local
```

Production, staging, or preview preflight:

```bash
cd apps/web
pnpm catalog:sources:dry-run -- --environment production --confirm-environment production --preflight-only
```

Single-target preflight:

```bash
cd apps/web
pnpm catalog:sources:dry-run -- --environment local --confirm-environment local --target ua-register-variety
```

Allowed targets:

- `catalog-source-sample`
- `ua-register-variety`
- `species-backbone`
- `breed-seed`
- `bg-official-variety`
- `genebank-long-tail`

## Report Contract

The JSON report uses `schemaVersion = "ove80.catalogFullImportDryRun.v1"` and includes:

- environment confirmation with `mutation = "blocked_by_design"`;
- OVE-79 readiness gate issue/date/path;
- one normalized target row per existing proof importer;
- source rows that would be read and raw/quarantine rows that would be captured;
- product concepts and aliases that would be projected by the current safe proof path;
- review-needed, rejected, blocked, and attribution-required counts;
- OVE-79 source verdicts for every readiness-governed source;
- projection-guard status using the existing source projection guard;
- duplicate-risk clusters that must be reviewed by OVE-89;
- a fail-closed leak check.

For UA State Register, the dry-run reports the full verified source-file count as raw/quarantine volume and the current proof projection count separately. This prevents OVE-81 from treating the old one-row proof as the full raw import shape.

## Redaction Rules

The report is safe to paste into Linear only if `leakCheck = "passed"`.

The report must not include raw payloads, source row bodies, internal source row keys, source snapshot IDs, precise coordinates, EXIF/GPS markers, source-only identifiers, journal text, owner/user data, media keys, secrets, email addresses, tokens, user agents, or referrers.

If any forbidden evidence marker appears, the command fails closed instead of printing a partial success report.

## Downstream Usage

Before OVE-81, OVE-82, OVE-83, OVE-85, OVE-86, or OVE-88 expands a source family, the operator must run this dry-run or a target-specific successor report and confirm:

- OVE-79 still allows raw quarantine for the source family;
- OVE-79 allows product projection, or the issue is explicitly bounded by an existing source-specific gate;
- row/projection/review/blocked counts match the intended import wave;
- duplicate-risk clusters are either absent or assigned to OVE-89 review;
- `leakCheck = "passed"`.

For OVE-82, the `species-backbone` target is the current planned species wave, not the older one-species OVE-58 proof. Its dry-run counts must include all planned CoL/WFO/GBIF/EPPO/Wikidata source rows, all projected species concepts, accepted aliases, and review-only/rejected/generated aliases.

OVE-90 must not claim full catalog availability until the relevant dry-run reports, source-family imports, OVE-89 entity-resolution QA, and production seed proof all agree.
