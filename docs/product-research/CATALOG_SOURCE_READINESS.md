# Catalog Source Readiness Gate

Status: OVE-55 live gate plus OVE-79 full-import readiness gate
Verification date: OVE-55 on 2026-06-29; OVE-79 full-import recheck on 2026-07-01
Machine-readable manifest: `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json`
Repeatable verifier: `cd apps/web && pnpm catalog:sources:verify`
Full-import dry-run: `cd apps/web && pnpm catalog:sources:dry-run -- --environment local --confirm-environment local`

This gate decides which catalog sources later ingestion slices may consume. It is not a bulk import and it does not approve live product dependencies on external APIs.

OVE-79 extends the original OVE-55 source gate for the founder's full-import goal. The full-import decision is still controlled: raw/source quarantine comes first, then dry-run counts/leak checks, then source-family projection slices, then entity-resolution QA, then production rollout proof.

## Operator Decision

Approved first ingestion sources:

- `ua-state-register` - USE. Official UA plant varieties. Approved for raw snapshot and canonical product projection with CC-BY attribution. OVE-57 may consume it after raw snapshot quarantine confirms full-file checksum, row count, and UTF-16LE decoding.
- `catalogue-of-life-checklistbank` - USE. Species backbone. Current live release proof: COL26.6, DOI `10.48580/dgy4k`, CC-BY.
- `world-flora-online` - USE. Plant species backbone. Current live release proof: World Flora Online Plant List June 2026, DOI `10.5281/zenodo.20782718`, CC0.
- `gbif-backbone` - USE. Species backbone. Current dataset proof: GBIF Backbone Taxonomy, DOI `10.15468/39omei`, CC-BY 4.0. Occurrence data is not approved for product projection by this gate.
- `eppo-codes` - USE. Species/code backbone and possible common-name support. Attribution is mandatory; distribution metadata is raw/source-only.
- `wikidata` - USE. Supplemental aliases/entity IDs under CC0. Use as corroborating source, not sole canonical truth.
- `grin-global` - USE. Supplemental taxonomy/economic-plant backbone. Use official export/dump paths later; do not scrape interactive pages.
- `vertebrate-breed-ontology` - USE. Vertebrate breed backbone only. It is English-only and does not cover bees.

Conditional or blocked:

- `iasas-bg-official-variety-list` - USE-WITH-CONDITIONS. Reachable official BG list, but PDF/HTML-only and commercial reuse basis must be captured before canonical projection.
- `eu-common-catalogue` - USE-WITH-CONDITIONS. Portal reachable, but exact reuse/export/legal-value basis must be captured before product projection.
- `pesi-euro-med` - INTERNAL-VALIDATION-ONLY. Technically reachable, but commercial reuse license is not captured.
- `eol-vernaculars` - USE-WITH-CONDITIONS. Zenodo metadata is reachable, but license is not specified at dump level; needs license-filter pipeline.
- `inaturalist` - USE-WITH-CONDITIONS. Taxa API reachable; do not ingest observations, users, photos, or coordinates.
- `dad-is-efabis` - INTERNAL-VALIDATION-ONLY. Use only to validate small breed/bee decisions unless legal basis changes.
- `eurisco` - INTERNAL-VALIDATION-ONLY. Terms/full-dump pages reachable, but anti-compete/flow-down terms block product ingestion without legal review.
- `genesys-pgr` - INTERNAL-VALIDATION-ONLY. Terms page reachable and includes redistribution restriction; legal basis required before OVE-62.
- `vendor-marketplace-paths` - REJECT. No scraping or bulk vendor ingestion without partner feed, official API contract, or written permission.

## OVE-79 Full-Import Waves

The machine-readable `fullImportReadiness` section is the current import-wave contract for OVE-80 through OVE-90:

- `raw_quarantine_allowed`: `ua-state-register`, `catalogue-of-life-checklistbank`, `world-flora-online`, `gbif-backbone`, `eppo-codes`, `wikidata`, `grin-global`, `vertebrate-breed-ontology`, `iasas-bg-official-variety-list`, `eu-common-catalogue`, `eol-vernaculars`, and `inaturalist`.
- `product_projection_allowed`: `ua-state-register`, `catalogue-of-life-checklistbank`, `world-flora-online`, `gbif-backbone`, `eppo-codes`, `wikidata`, `grin-global`, and `vertebrate-breed-ontology`.
- `operator_review_required`: `wikidata`, `grin-global`, `iasas-bg-official-variety-list`, `eu-common-catalogue`, `eol-vernaculars`, and `inaturalist`.
- `legal_blocked`: `iasas-bg-official-variety-list`, `eu-common-catalogue`, `pesi-euro-med`, `eol-vernaculars`, `inaturalist`, `dad-is-efabis`, `eurisco`, `genesys-pgr`, and `vendor-marketplace-paths`.
- `parser_blocked`: `iasas-bg-official-variety-list`, `eu-common-catalogue`, `eol-vernaculars`, and `inaturalist`.
- `rejected`: `vendor-marketplace-paths`.

Import order:

1. OVE-80 must run dry-run row counts, projection counts, duplicate-risk checks, and forbidden-field leak checks before any full-volume mutation.
2. OVE-81 may expand the UA State Register only after full-file checksum, row count, UTF-16LE parser proof, and dry-run leak proof.
3. OVE-82 may expand the species backbone only after CoL/WFO/GBIF/EPPO release/export checks, source attribution, coordinate exclusion, and OVE-89 entity-resolution QA.
4. OVE-83 may expand aliases only after Wikidata/EOL/iNaturalist language, claim, license, and ambiguity filters are machine-checked.
5. OVE-84 must close the BG/EU legal, export, parser, attribution, and legal-value caveat blockers before OVE-85 imports Bulgarian official varieties beyond the proof row.
6. OVE-86 may expand breed concepts only for source/object-kind mappings cleared by the manifest; DAD-IS/EFABIS remains internal validation only until legal clearance.
7. OVE-87 must clear genebank/PGR legal and source-use blockers before OVE-88 performs raw import and curator-only projection.
8. OVE-89 must review duplicate clusters, canonical conflicts, ambiguous aliases, and cross-source identity risk before OVE-90 production proof claims full catalog availability.

Concrete blocker evidence required before promotion:

- Conditional BG/EU sources need exact reuse basis, export/API path, parser confidence, attribution text, and legal-value caveat handling.
- EOL and iNaturalist need row-level license/terms filtering, explicit observation/photo/user/coordinate exclusion, and alias ambiguity review.
- PESI/Euro+Med needs commercial reuse license and coverage proof.
- DAD-IS/EFABIS needs legal confirmation and official export/API terms before any product ingestion.
- EURISCO and Genesys need legal review or written permission because accession/redistribution terms currently block product projection.
- Vendor/marketplace paths need written permission, partner feed, official API contract, and explicit maintainer approval; scraping remains rejected.

## OVE-80 Full-Import Dry-Run Harness

`docs/CATALOG_FULL_IMPORT_DRY_RUN.md` defines the OVE-80 operator preflight. The current command is:

```bash
cd apps/web
pnpm catalog:sources:dry-run -- --environment local --confirm-environment local
```

For staging, preview, or production preflight, add `--preflight-only`; the command never accepts a mutation flag and does not connect to the database. The report uses schema `ove80.catalogFullImportDryRun.v1`, references the OVE-79 readiness gate, and emits one normalized redacted target row for the existing proof importers:

- `catalog-source-sample`
- `ua-register-variety`
- `species-backbone`
- `breed-seed`
- `bg-official-variety`
- `genebank-long-tail`

The report includes source row counts, raw/quarantine capture counts, product projection counts, review-needed counts, rejected/blocked counts, attribution-required counts, OVE-79 source verdicts, projection-guard status, duplicate-risk clusters, and a fail-closed leak check. UA State Register reports the verified full-file count as raw/quarantine volume while keeping the current product projection count separate, so OVE-81 cannot confuse the one-row proof with the full import shape.

Later full-import issues must attach this report or a target-specific successor report before mutating source-family imports or projecting new product-visible concepts. `leakCheck = "passed"` is required before the output can be pasted into Linear.

## Privacy Boundary

External occurrence or distribution coordinates are not OverGarden user/product location data. When a source license later allows capture, coordinates may exist only in isolated raw/source snapshots with provenance, license, checksum, and usage flags. They must not enter canonical product projections, public pages, Meilisearch, analytics, logs, or UI without a later explicit ADR and SDD slice.

## Live Verification Summary

`pnpm catalog:sources:verify` passed on 2026-07-01:

- Live checks passed for UA State Register landing and byte-range CSV sample, CoL release metadata and nameusage sample, WFO Zenodo release, GBIF dataset metadata and species match, EPPO data services/licence/taxon pages, Wikidata EntityData, GRIN taxonomy page, VBO OLS metadata, IASAS official list page, EU Plant Variety Portal, PESI portal, EOL Zenodo vernacular metadata, iNaturalist taxa API, DAD-IS data page, EURISCO terms/full-dump pages, and Genesys terms.
- Vendor/marketplace paths are intentionally manual-gated: no approved endpoint exists, so no scrape/API probe was run.
- OVE-55 result counts: 17 sources; USE=8; USE-WITH-CONDITIONS=4; INTERNAL-VALIDATION-ONLY=4; REJECT=1.
- OVE-79 import-wave counts: raw=12; product=8; review=6; legal=9; parser=4; rejected=1.

## Downstream Gates

- OVE-56 built the source snapshot quarantine contract from a tiny approved UA Register sample: raw/source records keep license, checksum, parser, and source-only fields; product-facing catalog/typeahead receives only the allowlisted `Bergeron 1` projection.
- OVE-57 consumes `ua-state-register` for the first official UA variety path: exact approved register file download, UTF-16LE decode, full-file checksum/row count, idempotent `RegisterVarietis:83070006` canonical projection, official Ukrainian/transliteration typeahead, selected garden readback, and operator provenance readback.
- OVE-58 consumes CoL, WFO, GBIF Backbone, EPPO, and Wikidata as one bounded species-backbone seed for `Solanum lycopersicum L.`. OVE-82 expands the same approved source-family path into the current full planned species wave: tomato, cucumber, sunflower, and basil. `pnpm catalog:sources:import-species-backbone` imports all planned species idempotently, preserves `col_id`, `wfo_id`, `gbif_taxon_key`, `eppo_code`, and `wikidata_id` in internal allowed projection/provenance, projects only accepted scientific names, reviewed source-backed aliases, and safe English/Ukrainian/Bulgarian gardener-facing aliases to catalog/typeahead, proves selected garden readback, and keeps GBIF occurrence coordinates, EPPO distribution text, raw payloads, source record keys, checksums, and non-reviewed aliases source-only. Conflict/precedence rules are documented in `docs/product-research/SPECIES_BACKBONE_POLICY.md`.
- OVE-59 promotes only accepted source-backed aliases from the approved OVE-55 source set into typeahead while recording all alias candidates in `catalog_alias_projections` with status, language/script, source method, source record key, confidence, license, attribution, and notes. `помідор`, `томати`, `домат`, `Tomato`, and the accepted scientific/synonym names resolve to the canonical `Solanum lycopersicum L.` item; `garden tomato` stays `review_needed`, `love apple` stays `rejected`, and generated `помидор` stays review-only. Operator provenance can inspect these states without raw payload fields, and Meilisearch/typeahead rejects alias curation metadata if it appears in a hit.
- OVE-63 adds the source-attribution projection gate for imported catalog facts. Future source snapshots that can feed canonical product projection must carry source name, source version/snapshot, source URL, license, `license_url`, `attribution_required`, and `attribution_text` when attribution is required. Public/authenticated product surfaces may render only the safe credit fields from the dedicated read model; raw payloads, source-only fields, source record keys, external source IDs, checksums, restricted fields, occurrence/distribution coordinates, journal data, owner data, analytics, and media internals must stay out of public HTML, JSON-LD, Meilisearch/typeahead documents, and product UI.
- OVE-64 adds source refresh diff proof for an already imported source. Refresh uses stored snapshots only; canonical identity uses stable source-record keys rather than snapshot-versioned product IDs; diff/audit rows distinguish `new`, `unchanged`, `changed`, `removed_upstream`, `parser_reject`, `review_needed`, and `projection_blocked`; accepted new/safe-alias changes can reach typeahead after reindex, while canonical-name drift, parser rejects, and license/status drift stay out of product projection until review.
- OVE-65 hardens the post-seed read model before additional source expansion. Product typeahead must dedupe source-backed rows by canonical concept so repeated proof fixtures and parser/snapshot versions produce one selectable suggestion per real catalog concept. Operator provenance should show the latest/current safe proof per concept record with an audit-link count, while retaining full source snapshots, records, links, and refresh rows internally.
- OVE-66 adds the first internal source-candidate review lane to `/garden/catalog/curation`. Operators can inspect grouped source candidates from safe `allowed_projection` metadata, see source/legal/status context and a safe projection preview, promote the approved GRIN/NPGS proof candidate through a server action, or hold/reject quarantined review rows. The read model and UI do not select or render raw payloads, source-only fields, external coordinates, journal text, media internals, owner data, analytics, or precise location; product typeahead changes only after explicit promotion and reindex enqueue.
- OVE-67 proves the real `/garden` catalog UX against the imported seed set. The smoke covers `Ботсадівський`, `помідор`, `домат`, `Карпатська`, `Садово 1`, and `Red Cherry`, verifies one deduped selectable suggestion per intended catalog concept, saves each suggestion through the canonical first-entry path, and checks authenticated readback for kind-correct labels (`Plant variety`, `Plant species`, `Bee breed`), expected object kind including `bee_colony`, selected catalog identity, hidden location, and no source-only/operator metadata in proof output. The typeahead route falls back to canonical Postgres search when the derived Meilisearch index is stale or empty.
- OVE-68 adds the source-expansion product-projection guard. Any importer that writes source-backed `catalog_items` or product-visible `catalog_item_names` must pass the OVE-55 manifest check first: the source must be `USE` and include `canonical_product_projection`, unless a named source-specific gate allows one bounded source/version/record path. The OVE-60 official bee manual seed and OVE-61 BG reviewed subset are explicit bounded exceptions, not bulk approvals. `eu-common-catalogue`, IASAS/BG rows outside the OVE-61 accepted proof row, DAD-IS/EFABIS, EURISCO, Genesys, vendor/marketplace paths, unknown sources, and manifest entries missing `canonical_product_projection` stay raw/internal/quarantined until a fresh gate clears that exact use.
- OVE-69 adds the repeatable environment seed rollout proof. Operators must explicitly name and confirm `local`, `staging`, `preview`, or `production`; non-local runs require an extra mutation flag. The command seeds only the approved product proof set, captures verbose importer output privately, emits a redacted evidence contract, and runs the real `/garden` smoke against the selected app URL. The checked-in state does not claim staging or production rows exist until a run against that environment is recorded.
- OVE-70 isolates proof-harness semantics for source-import reruns. The GRIN/NPGS proof now labels clean-state absence as `cleanStateProof.status = passed` only when the promotable candidate is still quarantined and absent from product typeahead; reruns with an existing projection report `cleanStateProof.status = skipped_existing_projection` plus `rerunExistingProjection` instead of reusing a misleading `typeaheadBeforePromotion` field. Operators can add `--require-clean-state` to fail loudly when a clean-state precondition is required.
- OVE-60 consumes the safe manual official UA bee breed path first: `pnpm catalog:sources:import-breed-seed` imports `Карпатська бджола` as `catalogKind = breed`, proves typeahead/readback/provenance, keeps VBO as a future vertebrate-only backbone, and keeps DAD-IS/EFABIS validation notes source-only/internal-only.
- OVE-61 consumes only a bounded EU/BG official-variety proof subset, not a full IASAS/EU import. `pnpm catalog:sources:import-bg-official-variety` imports one reviewed `Садово 1` row as `eu_common_catalogue_bg`, captures EU Plant Variety Portal attribution/legal-caveat metadata plus IASAS 2026 OSL PDF proof metadata in source provenance, proves BG/Latin typeahead and selected garden readback, and keeps low-confidence or IASAS legal-conditional PDF rows quarantined out of typeahead. The broader IASAS and EU source entries remain `USE-WITH-CONDITIONS` for bulk/catalog expansion until stable export/parser and reuse blockers are closed.
- OVE-62 consumes only the OVE-55-approved GRIN/NPGS path as a bounded curated proof subset, not a live scraper or bulk genebank import. `pnpm catalog:sources:import-genebank-long-tail` imports one promotable `Red Cherry` candidate plus one held landrace candidate into quarantine-first source records, proves the held row stays out of typeahead, promotes only the explicitly curator-approved candidate into `catalogKind = plant_variety`, proves English/scientific-alias typeahead plus selected garden readback, and reads operator provenance from safe source/license/review metadata without accession/source-only fields. GRIN germplasm distribution policy remains a source caveat only and is not a product availability claim. Genesys/EURISCO remain `INTERNAL-VALIDATION-ONLY` until legal blockers are closed.
- Vendor/marketplace paths must not promote conditional/internal-only data until the specific blockers in the manifest are closed.
