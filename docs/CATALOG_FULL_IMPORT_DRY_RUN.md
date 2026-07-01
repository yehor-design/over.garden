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
- `vernacular-alias-expansion`
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

For UA State Register, the dry-run now reports the OVE-81 full approved wave: 15,177 source rows read, 15,177 raw/source records captured, 15,177 product concepts projected, 61,105 safe aliases projected, zero review-needed rows, zero parser rejects, and 759 repeated official denomination clusters assigned to OVE-89 entity-resolution review.

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

For OVE-83, use the explicit alias target:

```bash
cd apps/web
pnpm catalog:sources:dry-run -- --environment local --confirm-environment local --target vernacular-alias-expansion
```

The `vernacular-alias-expansion` target reports reviewed local-name expansion over the existing species-backbone source set. It does not claim new raw taxonomy rows or new species concepts. It reports 31 alias candidates, 21 product-visible vernacular aliases, 2 review-needed aliases, 4 rejected aliases, 10 blocked aliases, and the OVE-89 duplicate/collision review dependency. Only accepted aliases can be linked to `catalog_item_names`; review-needed, rejected, generated, and curator-only rows stay in `catalog_alias_projections`.

For OVE-84/OVE-85, the `bg-official-variety` target remains a bounded OVE-61 proof target only. `fullImportReadiness.bgOfficialVarietyBulkGate` currently reports `fullRawImportAllowed = false` and `productProjectionAllowed = false` for the broader BG official variety path. A BG dry-run can therefore prove the existing `Садово 1` projection and the blocked low-confidence row, but it cannot be attached as evidence for a full BG import until the OVE-84 gate is changed by a fresh source/export/legal/parser proof.

OVE-90 must not claim full catalog availability until the relevant dry-run reports, source-family imports, OVE-89 entity-resolution QA, and production seed proof all agree.
