# Catalog Source Readiness Gate

Status: OVE-55 live gate
Verification date: 2026-06-29
Machine-readable manifest: `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json`
Repeatable verifier: `cd apps/web && pnpm catalog:sources:verify`

This gate decides which catalog sources later ingestion slices may consume. It is not a bulk import and it does not approve live product dependencies on external APIs.

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

## Privacy Boundary

External occurrence or distribution coordinates are not OverGarden user/product location data. When a source license later allows capture, coordinates may exist only in isolated raw/source snapshots with provenance, license, checksum, and usage flags. They must not enter canonical product projections, public pages, Meilisearch, analytics, logs, or UI without a later explicit ADR and SDD slice.

## Live Verification Summary

`pnpm catalog:sources:verify` passed on 2026-06-29:

- Live checks passed for UA State Register landing and byte-range CSV sample, CoL release metadata and nameusage sample, WFO Zenodo release, GBIF dataset metadata and species match, EPPO data services/licence/taxon pages, Wikidata EntityData, GRIN taxonomy page, VBO OLS metadata, IASAS official list page, EU Plant Variety Portal, PESI portal, EOL Zenodo vernacular metadata, iNaturalist taxa API, DAD-IS data page, EURISCO terms/full-dump pages, and Genesys terms.
- Vendor/marketplace paths are intentionally manual-gated: no approved endpoint exists, so no scrape/API probe was run.
- Result counts: 17 sources; USE=8; USE-WITH-CONDITIONS=4; INTERNAL-VALIDATION-ONLY=4; REJECT=1.

## Downstream Gates

- OVE-56 built the source snapshot quarantine contract from a tiny approved UA Register sample: raw/source records keep license, checksum, parser, and source-only fields; product-facing catalog/typeahead receives only the allowlisted `Bergeron 1` projection.
- OVE-57 consumes `ua-state-register` for the first official UA variety path: exact approved register file download, UTF-16LE decode, full-file checksum/row count, idempotent `RegisterVarietis:83070006` canonical projection, official Ukrainian/transliteration typeahead, selected garden readback, and operator provenance readback.
- OVE-58 consumes CoL, WFO, GBIF Backbone, EPPO, and Wikidata as one bounded species-backbone seed. `pnpm catalog:sources:import-species-backbone` imports `Solanum lycopersicum L.` idempotently, preserves `col_id`, `wfo_id`, `gbif_taxon_key`, `eppo_code`, and `wikidata_id` in internal allowed projection/provenance, projects only the accepted scientific name, one source-backed synonym, and reviewed safe aliases to catalog/typeahead, proves selected garden readback, and keeps GBIF occurrence coordinates, EPPO distribution text, raw payloads, and non-reviewed aliases source-only. Conflict/precedence rules are documented in `docs/product-research/SPECIES_BACKBONE_POLICY.md`.
- OVE-59 promotes only accepted source-backed aliases from the approved OVE-55 source set into typeahead while recording all alias candidates in `catalog_alias_projections` with status, language/script, source method, source record key, confidence, license, attribution, and notes. `помідор`, `томати`, `домат`, `Tomato`, and the accepted scientific/synonym names resolve to the canonical `Solanum lycopersicum L.` item; `garden tomato` stays `review_needed`, `love apple` stays `rejected`, and generated `помидор` stays review-only. Operator provenance can inspect these states without raw payload fields, and Meilisearch/typeahead rejects alias curation metadata if it appears in a hit.
- OVE-63 adds the source-attribution projection gate for imported catalog facts. Future source snapshots that can feed canonical product projection must carry source name, source version/snapshot, source URL, license, `license_url`, `attribution_required`, and `attribution_text` when attribution is required. Public/authenticated product surfaces may render only the safe credit fields from the dedicated read model; raw payloads, source-only fields, source record keys, external source IDs, checksums, restricted fields, occurrence/distribution coordinates, journal data, owner data, analytics, and media internals must stay out of public HTML, JSON-LD, Meilisearch/typeahead documents, and product UI.
- OVE-64 adds source refresh diff proof for an already imported source. Refresh uses stored snapshots only; canonical identity uses stable source-record keys rather than snapshot-versioned product IDs; diff/audit rows distinguish `new`, `unchanged`, `changed`, `removed_upstream`, `parser_reject`, `review_needed`, and `projection_blocked`; accepted new/safe-alias changes can reach typeahead after reindex, while canonical-name drift, parser rejects, and license/status drift stay out of product projection until review.
- OVE-65 hardens the post-seed read model before additional source expansion. Product typeahead must dedupe source-backed rows by canonical concept so repeated proof fixtures and parser/snapshot versions produce one selectable suggestion per real catalog concept. Operator provenance should show the latest/current safe proof per concept record with an audit-link count, while retaining full source snapshots, records, links, and refresh rows internally.
- OVE-68 adds the source-expansion product-projection guard. Any importer that writes source-backed `catalog_items` or product-visible `catalog_item_names` must pass the OVE-55 manifest check first: the source must be `USE` and include `canonical_product_projection`, unless a named source-specific gate allows one bounded source/version/record path. The OVE-60 official bee manual seed and OVE-61 BG reviewed subset are explicit bounded exceptions, not bulk approvals. `eu-common-catalogue`, IASAS/BG rows outside the OVE-61 accepted proof row, DAD-IS/EFABIS, EURISCO, Genesys, vendor/marketplace paths, unknown sources, and manifest entries missing `canonical_product_projection` stay raw/internal/quarantined until a fresh gate clears that exact use.
- OVE-60 consumes the safe manual official UA bee breed path first: `pnpm catalog:sources:import-breed-seed` imports `Карпатська бджола` as `catalogKind = breed`, proves typeahead/readback/provenance, keeps VBO as a future vertebrate-only backbone, and keeps DAD-IS/EFABIS validation notes source-only/internal-only.
- OVE-61 consumes only a bounded EU/BG official-variety proof subset, not a full IASAS/EU import. `pnpm catalog:sources:import-bg-official-variety` imports one reviewed `Садово 1` row as `eu_common_catalogue_bg`, captures EU Plant Variety Portal attribution/legal-caveat metadata plus IASAS 2026 OSL PDF proof metadata in source provenance, proves BG/Latin typeahead and selected garden readback, and keeps low-confidence or IASAS legal-conditional PDF rows quarantined out of typeahead. The broader IASAS and EU source entries remain `USE-WITH-CONDITIONS` for bulk/catalog expansion until stable export/parser and reuse blockers are closed.
- OVE-62 consumes only the OVE-55-approved GRIN/NPGS path as a bounded curated proof subset, not a live scraper or bulk genebank import. `pnpm catalog:sources:import-genebank-long-tail` imports one promotable `Red Cherry` candidate plus one held landrace candidate into quarantine-first source records, proves the held row stays out of typeahead, promotes only the explicitly curator-approved candidate into `catalogKind = plant_variety`, proves English/scientific-alias typeahead plus selected garden readback, and reads operator provenance from safe source/license/review metadata without accession/source-only fields. GRIN germplasm distribution policy remains a source caveat only and is not a product availability claim. Genesys/EURISCO remain `INTERNAL-VALIDATION-ONLY` until legal blockers are closed.
- Vendor/marketplace paths must not promote conditional/internal-only data until the specific blockers in the manifest are closed.
