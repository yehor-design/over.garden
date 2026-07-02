# Catalog Full Import Dry-Run

Status: OVE-80 operator preflight
Primary command: `cd apps/web && pnpm catalog:sources:dry-run`
Readiness authority: `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json`

OVE-80 adds the redacted dry-run report that must be produced before later full-import slices mutate a source-family import or project new product-visible catalog concepts.

The default report is a preflight contract, not an importer. It does not connect to the database, does not read `.env.local`, does not call external source APIs, and does not write staging, preview, production, or local data. It summarizes the current proof importers and source-family gates so the operator can see the import shape before any bulk command runs.

OVE-101 adds one explicit live inventory target: `eu-official-journal-common-catalogue`. That target fetches only public official EUR-Lex / Official Journal discovery artifacts, computes checksums, and reports fetch/parse readiness. It still performs no product projection and writes no catalog rows.

OVE-102 extends the same target with Formex parser QA. It discovers the Publications Office Formex XML ZIP from the EUR-Lex XML notice, parses the OJ-derived variety rows, and reports accepted/review-needed/rejected confidence buckets.

OVE-103 turns that target into the source-backed EU OJ product projection preflight. Accepted rows are counted as product concepts and aliases that the importer may project through `eu_oj_eur_lex_common_catalogue`; review-needed and rejected rows remain blocked/source-only. The dry-run still does not mutate data.

OVE-87 adds one explicit gate target: `pgr-genebank-bulk-gate`. It reports the GRIN/Genesys/EURISCO source-use boundary before OVE-88. It performs no source-row capture and no product projection.

OVE-89 adds the database-backed entity-resolution QA successor report. It reviews the already imported source-backed catalog state for likely duplicates, alias collisions, source disagreements, blocked projection rows, and manual-review groups before OVE-90 may claim full catalog availability.

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
- `bg-official-varieties`
- `genebank-long-tail`
- `pgr-genebank-bulk-gate`
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
- optional OVE-102 source inventory and parser QA plus OVE-103 projection counts for explicit EUR-Lex/OJ runs;
- a fail-closed leak check.

For UA State Register, the dry-run now reports the OVE-81 full approved wave: 15,177 source rows read, 15,177 raw/source records captured, 15,177 product concepts projected, 61,105 safe aliases projected, zero review-needed rows, zero parser rejects, and 759 repeated official denomination clusters assigned to OVE-89 entity-resolution review.

## Redaction Rules

The report is safe to paste into Linear only if `leakCheck = "passed"`.

The report must not include raw payloads, source row bodies, internal source row keys, source snapshot IDs, precise coordinates, EXIF/GPS markers, source-only identifiers, journal text, owner/user data, media keys, secrets, email addresses, tokens, user agents, or referrers.

If any forbidden evidence marker appears, the command fails closed instead of printing a partial success report.

## Downstream Usage

Before OVE-81, OVE-82, OVE-83, OVE-86, OVE-87, OVE-88, OVE-103, or a later source-family expansion mutates data, the operator must run this dry-run or a target-specific successor report and confirm:

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

For OVE-86, use the breed target:

```bash
cd apps/web
pnpm catalog:sources:dry-run -- --environment local --confirm-environment local --target breed-seed
```

The `breed-seed` target now reports the approved breed expansion, not the older one-row OVE-60 proof. It includes three manual official Ukrainian bee breed concepts plus the VBO-supported animal-breed subset for `Ukrainian Grey (Cattle)` and `Bulgarian Rhodope (Cattle)`. It reports 5 source rows, 5 product-visible breed concepts, 13 accepted aliases, 8 review-needed aliases, 8 blocked alias rows, VBO readiness evidence, and the OVE-89 duplicate/kind-mapping review dependency. DAD-IS/EFABIS remains internal-validation-only; no DAD-IS/EFABIS row is product-projected by this target.

For OVE-84, the current `bg-official-variety` target remains a bounded OVE-61 proof target only. `fullImportReadiness.bgOfficialVarietyBulkGate` reports `fullRawImportAllowed = false` and `productProjectionAllowed = false` for IASAS and EU Plant Variety Portal-only BG rows. OVE-100 adds the separate `eu-oj-eur-lex-common-catalogue` legal-source path; OVE-103 is the importer path that must prove stable EUR-Lex/data.europa.eu ELI source URLs, parser counts/checksums, attribution, legal-value caveat mapping, and rejected/review-needed source-only handling. The existing bounded target can still prove `Садово 1` and the blocked low-confidence row, but it is not full BG import evidence.

For OVE-87, use the PGR/genebank gate target:

```bash
cd apps/web
pnpm catalog:sources:dry-run -- --environment local --confirm-environment local --target pgr-genebank-bulk-gate
```

The `pgr-genebank-bulk-gate` target reports GRIN as the only raw/quarantine and curator-candidate-approved PGR source for OVE-88. Genesys and EURISCO remain internal-validation-only/legal-blocked. The target reads no external data, captures no raw rows, projects no product concepts, and exists to prove that broad genebank/PGR availability has not become broad typeahead availability.

For OVE-88, use the bounded GRIN/NPGS quarantine successor target:

```bash
cd apps/web
pnpm catalog:sources:dry-run -- --environment local --confirm-environment local --target genebank-long-tail
```

The `genebank-long-tail` target reports 12 curated GRIN/NPGS proof rows, 12 raw/quarantine captures, three approved plant-variety projections, nine safe aliases, and held/review-needed/rejected/blocked rows that must stay out of product typeahead unless a later explicit curator/legal gate promotes them.

For OVE-89, run the entity-resolution QA report after the relevant source-family imports:

```bash
cd apps/web
pnpm catalog:sources:entity-resolution-qa
```

The report uses schema `ove89.catalogEntityResolutionQa.v1` and must show `leakCheck = "passed"` before its output is attached to Linear. It reads only safe catalog/source-review fields, not raw payloads or source-only metadata. Any duplicate, alias-collision, source-disagreement, blocked, or manual-review cluster is evidence for operator review before OVE-90 production proof.

For OVE-85, use the BG-specific successor target:

```bash
cd apps/web
pnpm catalog:sources:dry-run -- --environment local --confirm-environment local --target bg-official-varieties
```

This target still consumes only the approved `eu-oj-eur-lex-common-catalogue` source path. It filters the OVE-102 parser QA country summary to Bulgaria (`countryCode = BG`) and reports BG source rows, accepted product projections, review-needed rows, rejected rows, blocked rows, attribution, and the OVE-89 duplicate-risk dependency. It does not upgrade IASAS PDF rows or EU Plant Variety Portal-only rows.

The matching import and app smoke are:

```bash
cd apps/web
pnpm catalog:sources:import-bg-official-variety
pnpm catalog:sources:import-eu-oj-common-catalogue
pnpm smoke:garden-bg-official-varieties
```

The first command keeps the OVE-61 `Садово 1` bounded proof stable. The second command imports the approved Official Journal / EUR-Lex Common Catalogue rows. The smoke verifies a Bulgaria-relevant OJ-backed variety beyond `Садово 1`, legacy `Садово 1` stability, product dedupe in `/garden` typeahead, source attribution/caveat readback, and absence of review-needed/rejected OJ rows plus IASAS-only rows from product selection.

For OVE-101/OVE-102/OVE-103, use `eu-official-journal-common-catalogue`. It discovers the latest agricultural Supplement A and vegetable Supplement H links from the official DG SANTE Common Catalogue page, then fetches the corresponding EUR-Lex/OJ source pages, EUR-Lex XML notices, Publications Office Formex ZIPs, and fallback CELEX RDF metadata. The output includes source family, supplement type, publication date, EUR-Lex URL, OJ/ELI/CELEX identifiers when available, language, artifact format, checksum for fetched artifacts, fetch/parse status, OVE-102 parser QA counts, and OVE-103 product projection counts. Accepted rows count toward `productConceptsWouldProject` and `aliasesWouldProject`; review-needed and rejected rows count toward blocked rows and must remain source-only.

The OVE-102 fetch strategy is:

- DG SANTE Common Catalogue page: scoped official seed list for the latest Supplement A/H candidates.
- EUR-Lex ELI/OJ pages: canonical source pages for OJ citation, publication date, CELEX, ELI, Cellar id, language, HTML fallback, and authentic PDF link.
- EUR-Lex XML notice endpoint (`legal-content/EN/TXT/XML/?uri=CELEX:...`): manifestation discovery artifact; checksum and byte length are preserved.
- Publications Office Formex XML ZIP: primary machine-readable parser artifact for Common Catalogue table rows.
- Publications Office CELEX RDF plus Cellar REST/SPARQL: metadata fallback when EUR-Lex HTML/XML is temporarily unavailable or when OVE-103 needs work/expression/manifest metadata beyond the XML notice. Use it to resolve publication date, title, Cellar ids, and available representations, not to bypass the ELI/OJ source boundary.
- `data.europa.eu` yearly OJ CSV lists: broad official discovery aid for yearly OJ inventory reconciliation. Use them to cross-check that DG SANTE-linked CELEX/ELI candidates are not missing, then resolve back to EUR-Lex/Cellar artifacts before parsing.
- EUR-Lex webservice: metadata search and CELEX discovery support. It can help find candidate legal resources, but file downloads still resolve through EUR-Lex/Cellar/ELI artifacts before checksums are trusted.

The OVE-102 parser preserves variety denomination, species/crop, notifier/admission field, country code when present, admission action, market extension date when present, register/supplement type, OJ citation, EUR-Lex source URL, publication date, Formex artifact checksum, parser version, extraction confidence, and status reasons. Confidence thresholds are explicit: `accepted >= 0.98`, `review_needed >= 0.90 and < 0.98`, and `rejected < 0.90` or missing required core fields. Rows whose action is inferred only from a Formex table header are review-needed, not accepted.

The dry-run reports row counts by supplement, species/crop, country, notifier, and confidence bucket. IASAS-only, EU Plant Variety Portal-only, CPVO/UPOV, or missing-provenance rows cannot be upgraded through this parser path; the parser accepts only official EUR-Lex or `data.europa.eu` ELI source URLs. Unavailable XML/Formex, missing CELEX/ELI, HTML-only evidence, PDF-only evidence, or ambiguous artifact format is reported as `review_needed`. Do not silently skip a supplement family.

OVE-90 must not claim full catalog availability until the relevant dry-run reports, source-family imports, OVE-89 entity-resolution QA, production `/garden` smoke, and production search/index proof all agree.

The OVE-90 gate command is:

```bash
cd apps/web
pnpm catalog:sources:production-rollout-proof -- --environment production --confirm-environment production --allow-non-local-mutation --base-url https://over.garden
```

It emits schema `ove90.fullCatalogProductionRolloutProof.v1`. A passing OVE-78 seed proof alone is not enough for OVE-90 because the final gate must also cover production source-family availability without new source ingestion, the OVE-85 EU OJ/BG official-varieties path, OVE-89 entity-resolution QA, deterministic Meilisearch `catalog_typeahead` rebuild, and both Postgres fallback plus Meilisearch freshness.
