# Catalog Full Import Dry-Run

Status: OVE-80 operator preflight
Primary command: `cd apps/web && pnpm catalog:sources:dry-run`
Readiness authority: `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json`

OVE-80 adds the redacted dry-run report that must be produced before later full-import slices mutate a source-family import or project new product-visible catalog concepts.

The default report is a preflight contract, not an importer. It does not connect to the database, does not read `.env.local`, does not call external source APIs, and does not write staging, preview, production, or local data. It summarizes the current proof importers and source-family gates so the operator can see the import shape before any bulk command runs.

OVE-101 adds one explicit live inventory target: `eu-official-journal-common-catalogue`. That target fetches only public official EUR-Lex / Official Journal discovery artifacts, computes checksums, and reports fetch/parse readiness. It still performs no product projection and writes no catalog rows.

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

EUR-Lex / Official Journal inventory preflight:

```bash
cd apps/web
pnpm catalog:sources:dry-run -- --environment local --confirm-environment local --target eu-official-journal-common-catalogue
```

Allowed targets:

- `catalog-source-sample`
- `ua-register-variety`
- `species-backbone`
- `vernacular-alias-expansion`
- `breed-seed`
- `bg-official-variety`
- `genebank-long-tail`
- `eu-official-journal-common-catalogue`

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
- optional OVE-101 source inventory for explicit EUR-Lex/OJ inventory runs;
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

For OVE-84/OVE-85, the current `bg-official-variety` target remains a bounded OVE-61 proof target only. `fullImportReadiness.bgOfficialVarietyBulkGate` reports `fullRawImportAllowed = false` and `productProjectionAllowed = false` for IASAS and EU Plant Variety Portal-only BG rows. OVE-100 adds the separate `eu-oj-eur-lex-common-catalogue` legal-source path; an OVE-85 full BG import must use a target-specific successor report that proves stable EUR-Lex/data.europa.eu ELI source URLs, parser counts/checksums, attribution, legal-value caveat mapping, and rejected/review-needed source-only handling. The existing bounded target can still prove `Садово 1` and the blocked low-confidence row, but it is not full BG import evidence.

For OVE-101, use `eu-official-journal-common-catalogue`. It discovers the latest agricultural Supplement A and vegetable Supplement H links from the official DG SANTE Common Catalogue page, then fetches the corresponding EUR-Lex/OJ source pages and EUR-Lex XML notices. The output includes source family, supplement type, publication date, EUR-Lex URL, OJ/ELI/CELEX identifiers when available, language, artifact format, checksum for fetched artifacts, and fetch/parse status. The target reports `productConceptsWouldProject = 0`, `aliasesWouldProject = 0`, and `checkedProjectionRequests = 0`; it is inventory only.

The OVE-101 fetch strategy is:

- DG SANTE Common Catalogue page: scoped official seed list for the latest Supplement A/H candidates.
- EUR-Lex ELI/OJ pages: canonical source pages for OJ citation, publication date, CELEX, ELI, Cellar id, language, HTML fallback, and authentic PDF link.
- EUR-Lex XML notice endpoint (`legal-content/EN/TXT/XML/?uri=CELEX:...`): preferred machine-readable inventory artifact before any parser work; checksum and byte length are preserved.
- Publications Office CELEX RDF plus Cellar REST/SPARQL: metadata fallback when EUR-Lex HTML/XML is temporarily unavailable or when OVE-85 needs work/expression/manifest metadata beyond the XML notice. Use it to resolve publication date, title, Cellar ids, and available representations, not to bypass the ELI/OJ source boundary.
- `data.europa.eu` yearly OJ CSV lists: broad official discovery aid for yearly OJ inventory reconciliation. Use them to cross-check that DG SANTE-linked CELEX/ELI candidates are not missing, then resolve back to EUR-Lex/Cellar artifacts before parsing.
- EUR-Lex webservice: metadata search and CELEX discovery support. It can help find candidate legal resources, but file downloads still resolve through EUR-Lex/Cellar/ELI artifacts before checksums are trusted.

Unavailable XML/Formex, missing CELEX/ELI, or ambiguous artifact format is reported as `review_needed`. Do not silently skip a supplement family.

OVE-90 must not claim full catalog availability until the relevant dry-run reports, source-family imports, OVE-89 entity-resolution QA, and production seed proof all agree.
