# Catalog Source Readiness Gate

Status: OVE-55 live gate plus OVE-79 full-import readiness gate plus OVE-100 EU OJ/EUR-Lex source-path approval plus OVE-87 PGR/genebank source-use gate plus OVE-89 entity-resolution QA gate plus OVE-105 EU OJ production landing gate plus OVE-253 EPPO full-corpus source-contract decision (`blocked_manifest`)
Verification date: OVE-55 on 2026-06-29; OVE-79 full-import recheck on 2026-07-01; OVE-100 EUR-Lex path check on 2026-07-01; OVE-87 PGR/genebank check on 2026-07-02; OVE-105 production landing on 2026-07-02; OVE-253 EPPO decision on 2026-08-03
Machine-readable manifest: `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json`
Repeatable verifier: `cd apps/web && pnpm catalog:sources:verify`
Full-import dry-run: `cd apps/web && pnpm catalog:sources:dry-run -- --environment local --confirm-environment local`
Entity-resolution QA: `cd apps/web && pnpm catalog:sources:entity-resolution-qa`
Production rollout proof: `cd apps/web && pnpm catalog:sources:production-rollout-proof -- --environment production --confirm-environment production --allow-non-local-mutation --base-url https://over.garden`

This gate decides which catalog sources later ingestion slices may consume. It is not a bulk import and it does not approve live product dependencies on external APIs.

OVE-79 extends the original OVE-55 source gate for the founder's full-import goal. The full-import decision is still controlled: raw/source quarantine comes first, then dry-run counts/leak checks, then source-family projection slices, then entity-resolution QA, then production rollout proof.

## Operator Decision

Approved first ingestion sources:

- `ua-state-register` - USE. Official UA plant varieties. Approved for raw snapshot and canonical product projection with CC-BY attribution. OVE-57 may consume it after raw snapshot quarantine confirms full-file checksum, row count, and UTF-16LE decoding.
- `catalogue-of-life-checklistbank` - USE. Species backbone. Current live release proof: COL26.6, DOI `10.48580/dgy4k`, CC-BY.
- `world-flora-online` - USE. Plant species backbone. Current live release proof: World Flora Online Plant List June 2026, DOI `10.5281/zenodo.20782718`, CC0.
- `gbif-backbone` - USE. Species backbone. Current dataset proof: GBIF Backbone Taxonomy, DOI `10.15468/39omei`, CC-BY 4.0. Occurrence data is not approved for product projection by this gate.
- `eppo-codes` - USE only for the existing bounded species/code proof. Attribution is mandatory and distribution metadata is raw/source-only. OVE-253 blocks full EPPO-corpus acquisition and projection until EPPO publishes an official versioned checksum manifest and complete closure method.
- `wikidata` - USE. Supplemental aliases/entity IDs under CC0. Use as corroborating source, not sole canonical truth.
- `grin-global` - USE. Supplemental taxonomy/economic-plant backbone plus OVE-87-cleared GRIN/NPGS candidate path. Use official export/dump paths or bounded curated proof files later; do not scrape interactive pages. Product projection is curator-only and must carry GRIN/NPGS provenance.
- `vertebrate-breed-ontology` - USE. Vertebrate breed backbone only. It is English-only and does not cover bees.
- `eu-oj-eur-lex-common-catalogue` - USE. Official Journal / EUR-Lex Common Catalogue source path. Product projection is allowed only for rows with stable EUR-Lex or `data.europa.eu` ELI links, recorded attribution, legal-value caveat, parser proof, and source provenance.

Conditional or blocked:

- `iasas-bg-official-variety-list` - USE-WITH-CONDITIONS. Reachable official BG list, but PDF/HTML-only and commercial reuse basis must be captured before canonical projection.
- `eu-common-catalogue` - USE-WITH-CONDITIONS. The EU Plant Variety Portal path is reachable but remains information-only/no-legal-value for product projection unless backed row-by-row by the `eu-oj-eur-lex-common-catalogue` source path.
- `pesi-euro-med` - INTERNAL-VALIDATION-ONLY. Technically reachable, but commercial reuse license is not captured.
- `eol-vernaculars` - USE-WITH-CONDITIONS. Zenodo metadata is reachable, but license is not specified at dump level; needs license-filter pipeline.
- `inaturalist` - USE-WITH-CONDITIONS. Taxa API reachable; do not ingest observations, users, photos, or coordinates.
- `dad-is-efabis` - INTERNAL-VALIDATION-ONLY. Use only to validate small breed/bee decisions unless legal basis changes.
- `eurisco` - INTERNAL-VALIDATION-ONLY. Terms/full-dump pages reachable, but anti-compete/flow-down terms block raw bulk capture and product ingestion without legal review or written permission.
- `genesys-pgr` - INTERNAL-VALIDATION-ONLY. Terms page reachable and includes redistribution restriction; legal basis or written permission is required before any raw bulk capture or product ingestion.
- `vendor-marketplace-paths` - REJECT. No scraping or bulk vendor ingestion without partner feed, official API contract, or written permission.

## OVE-253 EPPO Full-Corpus Source Contract

Verdict: `blocked_manifest`. The 2026-08-03 serial, read-only verifier confirmed the official OpenAPI and Open Licence document, plus documented list, overview, names, and taxonomy capability classes. It recorded only digests, class status, and the aggregate current taxonomy count in `fullImportReadiness.eppoFullCorpusContract`.

That proof is deliberately insufficient to mirror the corpus. The documented API pagination does not supply an official versioned checksum manifest or a complete-corpus closure method. Therefore `rawCorpusAcquisitionAllowed = false` and `productProjectionAllowed = false` in the separate full-corpus contract; OVE-254 and OVE-255 remain blocked. The historical bounded EPPO code/name path is unaffected. No browser-session export, undocumented endpoint, HTML scraping, corpus enumeration, parser, source snapshot, database write, search write, or product projection is authorized for a new complete corpus by this decision.

This does not revoke the historical bounded species/code evidence or alter existing gardener behavior. It stops only a new full-corpus path. Reopen OVE-253 after EPPO publishes the missing official authority; a fresh `contract_approved` receipt must update the manifest before downstream work starts.

The repeatable operator command is:

```bash
cd apps/web
pnpm eppo:source-contract:verify -- --mode live-contract --timeout-ms 21600000 --max-attempts 2 --concurrency 1
```

Run it only through an environment that injects `EPPO_DATA_PORTAL_API_KEY` without printing or writing the value. The command is serial, temporary-lock guarded, cancellation-fenced, and emits no raw payload, identifier, header, credential, location, or product data.

## OVE-79 Full-Import Waves

The machine-readable `fullImportReadiness` section is the current import-wave contract for OVE-80 through OVE-90:

- `raw_quarantine_allowed`: `ua-state-register`, `catalogue-of-life-checklistbank`, `world-flora-online`, `gbif-backbone`, `eppo-codes`, `wikidata`, `grin-global`, `vertebrate-breed-ontology`, `iasas-bg-official-variety-list`, `eu-common-catalogue`, `eu-oj-eur-lex-common-catalogue`, `eol-vernaculars`, and `inaturalist`.
- `product_projection_allowed`: `ua-state-register`, `catalogue-of-life-checklistbank`, `world-flora-online`, `gbif-backbone`, `eppo-codes`, `wikidata`, `grin-global`, `vertebrate-breed-ontology`, and `eu-oj-eur-lex-common-catalogue`.
- `operator_review_required`: `wikidata`, `grin-global`, `iasas-bg-official-variety-list`, `eu-common-catalogue`, `eol-vernaculars`, and `inaturalist`.
- `legal_blocked`: `iasas-bg-official-variety-list`, `eu-common-catalogue`, `pesi-euro-med`, `eol-vernaculars`, `inaturalist`, `dad-is-efabis`, `eurisco`, `genesys-pgr`, and `vendor-marketplace-paths`.
- `parser_blocked`: `iasas-bg-official-variety-list`, `eu-common-catalogue`, `eol-vernaculars`, and `inaturalist`.
- `rejected`: `vendor-marketplace-paths`.

Import order:

1. OVE-80 must run dry-run row counts, projection counts, duplicate-risk checks, and forbidden-field leak checks before any full-volume mutation.
2. OVE-81 may expand the UA State Register only after full-file checksum, row count, UTF-16LE parser proof, and dry-run leak proof.
3. OVE-82 remains the historical bounded species-backbone proof. A new full EPPO corpus cannot start until OVE-253 changes its `blocked_manifest` contract to `contract_approved`; OVE-254 and OVE-255 then own schema and acquisition respectively, alongside CoL/WFO/GBIF release/export, attribution, coordinate-exclusion, and OVE-89 entity-resolution gates.
4. OVE-83 may expand product aliases only through approved Wikidata/EPPO-backed species records with machine-checked language, claim, license, and ambiguity filters. EOL/iNaturalist vernacular data remains out of product projection until a later gate explicitly clears its parser/license boundary.
5. OVE-100 closes the legal-source path decision for EU OJ/EUR-Lex. OVE-103 may import official EU Common Catalogue variety rows only from rows satisfying the `eu-oj-eur-lex-common-catalogue` policy; OVE-85 consumes that same approved path as the BG official-varieties subset proof. IASAS and EU Plant Variety Portal-only rows remain blocked until a later gate clears them.
6. OVE-86 may expand breed concepts only for source/object-kind mappings cleared by the manifest; DAD-IS/EFABIS remains internal validation only until legal clearance.
7. OVE-87 clears only the GRIN/NPGS boundary for OVE-88: GRIN raw quarantine and curator-only candidate projection are allowed with provenance and source-only caveats; Genesys and EURISCO remain legally blocked/internal-validation-only.
8. OVE-89 must review duplicate clusters, canonical conflicts, ambiguous aliases, and cross-source identity risk before OVE-90 production proof claims full catalog availability.
9. OVE-105 must explicitly land approved Official Journal / EUR-Lex Common Catalogue rows in production with the non-local import guard and redacted evidence. OVE-106 must then prove those rows through the production `/garden` UX/search path.
10. OVE-90 must run the explicit production rollout proof command only after the source-family rows are already landed. That command reads existing production source-family rows without source ingestion, consumes the OVE-89 QA report, rebuilds the derived Meilisearch typeahead index from safe catalog rows, and proves representative catalog rows through both Postgres fallback and Meilisearch before the source-readiness gate can be considered product-visible in production.

Concrete blocker evidence required before promotion:

- Conditional BG/EU sources need exact reuse basis, export/API path, parser confidence, attribution text, and legal-value caveat handling.
- EOL and iNaturalist need row-level license/terms filtering, explicit observation/photo/user/coordinate exclusion, and alias ambiguity review.
- PESI/Euro+Med needs commercial reuse license and coverage proof.
- DAD-IS/EFABIS needs legal confirmation and official export/API terms before any product ingestion.
- EURISCO and Genesys need legal review or written permission because accession/redistribution terms currently block both raw bulk capture and product projection.
- Vendor/marketplace paths need written permission, partner feed, official API contract, and explicit maintainer approval; scraping remains rejected.

## OVE-84 BG Official Variety Bulk Gate

Verdict: blocked for IASAS and EU Plant Variety Portal-only full BG raw import and blocked for product projection. The bounded OVE-61 proof row remains allowed, but it is not bulk clearance. OVE-100 supersedes only one part of the earlier blocker: the approved product source path is now Official Journal / EUR-Lex, not IASAS PDFs or portal-only rows.

Live OVE-84 checks on 2026-07-01 confirmed that the IASAS OSL 1 - 2026 8 PDF is reachable as a PDF (`Last-Modified: 2026-06-26`, `Content-Length: 4,716,785`) and that the EU Plant Variety Portal plus legal page are reachable. The EU legal page states that the portal is for information purposes only, has no legal value, and that the legally binding Common Catalogue source is the Official Journal of the European Union.

This blocks the IASAS/portal-only bulk path for five concrete reasons:

- no approved structured IASAS export/API path is cleared for all Bulgarian rows, and EU portal-only rows have no legal value;
- IASAS commercial reuse basis is not explicit enough for automatic OverGarden product projection;
- EU Plant Variety Portal legal-value caveat is not mapped into a safe product projection policy;
- full-volume IASAS PDF parser QA is not proven with row count, checksum, accepted/review/reject counts, and threshold evidence;
- attribution and legal-value caveat handling are not mapped row-by-row.

Machine-checkable result lives in `fullImportReadiness.bgOfficialVarietyBulkGate` in the manifest: `fullRawImportAllowed = false`, `productProjectionAllowed = false`, `boundedProofProjectionAllowed = true`, accepted parser confidence would need `>= 0.98`, rows below that require review, rows below `0.90` are rejected, and all IASAS/portal-only fields beyond the OVE-61 projection remain source-only.

Evidence that would change the IASAS/portal-only decision: stable official IASAS export/API with explicit reuse basis, parser QA report with counts/checksums/thresholds, row-level attribution and caveat mapping, and an OVE-85 or later importer proof that rejected/review-needed rows stay source-only.

## OVE-100 EU OJ / EUR-Lex Common Catalogue Gate

Verdict: approved source path for BG/EU official-variety projection, with strict provenance. The approved source slug is `eu-oj-eur-lex-common-catalogue`; the legacy `eu-common-catalogue` portal slug and `iasas-bg-official-variety-list` remain raw/source-only.

The machine-readable entry requires:

- `sourceUrl` starting with `https://eur-lex.europa.eu/eli/`, `https://data.europa.eu/eli/`, or `http://data.europa.eu/eli/`;
- `sourceVersion`, `sourceRecordKey`, `productSource`, and `productSourceId` on every projected row;
- `productSource = eu_oj_eur_lex_common_catalogue`;
- source record keys starting with `EUR-Lex:ELI:` or `data.europa.eu:ELI:`;
- attribution text and the legal-value caveat stating that the EU Plant Variety Portal has no legal value and the legally binding Common Catalogue source is the Official Journal.

Exact blocker language: only legal-source Official Journal / EUR-Lex Common Catalogue rows with stable EUR-Lex or `data.europa.eu` ELI links may project. IASAS PDFs, EU Plant Variety Portal-only rows, CPVO/UPOV rows, and missing-provenance rows remain source-only.

OVE-87 closeout note: current CLI fetches to the EUR-Lex legal notice/reuse page and sample OJ page receive a CloudFront WAF HTTP 202 challenge. Those checks are manual-gated in the manifest rather than falsely accepting the challenge as legal/source proof. Future EU OJ importer claims still need browser/manual proof or a machine-readable path that returns the expected legal/OJ body.

## OVE-87 PGR / Genebank Bulk Gate

Verdict: partially allowed. GRIN/NPGS may feed OVE-88 as raw/source quarantine plus curator-only candidate projection; Genesys and EURISCO remain internal-validation-only and legally blocked. Broad genebank/PGR availability is not broad typeahead availability.

The approved GRIN/NPGS path requires:

- `sourceUrl` under `https://npgsweb.ars-grin.gov/gringlobal/`;
- `sourceVersion`, `sourceRecordKey`, `productSource`, and `productSourceId` on every projected row;
- `productSource = grin_genebank_candidate`;
- source record keys starting with `GRIN:NPGS:OVE62:` or `GRIN:NPGS:OVE88:`;
- curator-approved candidate name, safe species/crop alias, review status, and source provenance only.

The following fields stay source-only and must not enter product typeahead/search/UI: accession identifiers, germplasm distribution policy, donor/geographic metadata, raw source rows, and terms-only validation evidence. NPGS germplasm distribution policy is a legal/source caveat, not a product availability claim.

Genesys and EURISCO are reachable enough for terms evidence, but that does not clear raw capture or product projection:

- Genesys live terms include a redistribution restriction.
- EURISCO terms/full-dump path is reachable, but anti-compete and flow-down constraints remain unresolved.
- Both need written permission or a legal memo covering OverGarden raw storage, redistribution, field-level reuse, and product projection before a later PGR issue can consume them.

Machine-checkable result lives in `fullImportReadiness.pgrGenebankBulkGate` in the manifest. The OVE-87 dry-run target is:

```bash
cd apps/web
pnpm catalog:sources:dry-run -- --environment local --confirm-environment local --target pgr-genebank-bulk-gate
```

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
- `vernacular-alias-expansion`
- `breed-seed`
- `bg-official-variety`
- `genebank-long-tail`
- `pgr-genebank-bulk-gate`
- `eu-official-journal-common-catalogue`

The report includes source row counts, raw/quarantine capture counts, product projection counts, review-needed counts, rejected/blocked counts, attribution-required counts, OVE-79 source verdicts, projection-guard status, duplicate-risk clusters, and a fail-closed leak check. UA State Register now reports the OVE-81 full approved import wave: 15,177 safe official variety concepts, 61,105 product aliases, no parser rejects, and repeated denomination clusters assigned to OVE-89 review.

Later full-import issues must attach this report or a target-specific successor report before mutating source-family imports or projecting new product-visible concepts. `leakCheck = "passed"` is required before the output can be pasted into Linear.

## Privacy Boundary

External occurrence or distribution coordinates are not OverGarden user/product location data. When a source license later allows capture, coordinates may exist only in isolated raw/source snapshots with provenance, license, checksum, and usage flags. They must not enter canonical product projections, public pages, Meilisearch, analytics, logs, or UI without a later explicit ADR and SDD slice.

## Live Verification Summary

`pnpm catalog:sources:verify` passed on 2026-07-02:

- Live checks passed for UA State Register landing and byte-range CSV sample, CoL release metadata and nameusage sample, WFO Zenodo release, GBIF dataset metadata and species match, EPPO data services/licence/taxon pages, Wikidata EntityData, GRIN accession search/detail/taxonomy pages, VBO OLS metadata, IASAS official list page, EU Plant Variety Portal, PESI portal, EOL Zenodo vernacular metadata, iNaturalist taxa API, DAD-IS data page, EURISCO terms/full-dump pages, and Genesys terms.
- OVE-84 BG checks additionally verify the IASAS 2026 OSL PDF byte range and EU Plant Variety Portal legal-value caveat page; both are reachability/legal-caveat proof, not bulk import clearance.
- OVE-100 checks verify EUR-Lex legal notice authenticity and reuse language, DG SANTE Common Catalogue update links, the EU Plant Variety Portal legal-value caveat, and an EUR-Lex OJ sample page for Supplement H 2026/1.
- As of the OVE-87 closeout run, the EUR-Lex legal/OJ HTML checks are manual-gated because CLI fetches receive CloudFront WAF HTTP 202 challenge responses. The verifier does not count that challenge page as source proof.
- OVE-87 checks verify GRIN/NPGS accession and taxonomy reachability, require a GRIN-only curator-candidate projection policy, and keep Genesys/EURISCO internal-validation-only/legal-blocked.
- Vendor/marketplace paths are intentionally manual-gated: no approved endpoint exists, so no scrape/API probe was run.
- OVE-55/OVE-100 result counts: 18 sources; USE=9; USE-WITH-CONDITIONS=4; INTERNAL-VALIDATION-ONLY=4; REJECT=1.
- OVE-79 import-wave counts: raw=13; product=9; review=6; legal=9; parser=4; rejected=1.

## Downstream Gates

- OVE-56 built the source snapshot quarantine contract from a tiny approved UA Register sample: raw/source records keep license, checksum, parser, and source-only fields; product-facing catalog/typeahead receives only the allowlisted `Bergeron 1` projection.
- OVE-57 consumes `ua-state-register` for the first official UA variety path: exact approved register file download, UTF-16LE decode, full-file checksum/row count, idempotent `RegisterVarietis:83070006` canonical projection, official Ukrainian/transliteration typeahead, selected garden readback, and operator provenance readback.
- OVE-81 expands the same approved UA State Register file into the full official-variety wave. `pnpm catalog:sources:import-ua-register-variety` verifies the approved file proof, imports 15,177 valid official variety concepts idempotently, projects only official names/transliterations and taxon-qualified aliases, proves representative `/garden` typeahead/readback across several crops and scripts, records 759 repeated denomination clusters for OVE-89 entity-resolution review, and keeps source-only register fields out of typeahead, Meilisearch, UI, docs, and Linear-safe evidence.
- OVE-58 consumes CoL, WFO, GBIF Backbone, EPPO, and Wikidata as one bounded species-backbone seed for `Solanum lycopersicum L.`. OVE-82 expands the same approved source-family path into the current full planned species wave: tomato, cucumber, sunflower, and basil. OVE-83 expands reviewed vernacular aliases over that same source-backed wave: local Ukrainian, Bulgarian, English, and scientific/synonym lookup names resolve to the same canonical species concepts only when the alias status is `accepted`. `pnpm catalog:sources:import-species-backbone` imports all planned species idempotently, preserves `col_id`, `wfo_id`, `gbif_taxon_key`, `eppo_code`, and `wikidata_id` in internal allowed projection/provenance, projects only accepted scientific names, reviewed source-backed aliases, and safe English/Ukrainian/Bulgarian gardener-facing aliases to catalog/typeahead, proves selected garden readback, and keeps GBIF occurrence coordinates, EPPO distribution text, raw payloads, source record keys, checksums, and non-reviewed aliases source-only. Conflict/precedence rules are documented in `docs/product-research/SPECIES_BACKBONE_POLICY.md`.
- OVE-59 promotes only accepted source-backed aliases from the approved OVE-55 source set into typeahead while recording all alias candidates in `catalog_alias_projections` with status, language/script, source method, source record key, confidence, license, attribution, and notes. OVE-83 extends that accepted set with reviewed local aliases across tomato, cucumber, sunflower, and basil, including `помідори`, `домати`, `огірок звичайний`, `common sunflower`, `сонях`, `sweet basil`, `базилік духмяний`, and `обикновен босилек`; `garden tomato` and `gherkin` stay `review_needed`, `love apple`, `pickle`, and `holy basil` stay `rejected`, and generated variants such as `помидор` stay review-only. Operator provenance can inspect these states without raw payload fields, and Meilisearch/typeahead rejects alias curation metadata if it appears in a hit.
- OVE-63 adds the source-attribution projection gate for imported catalog facts. Future source snapshots that can feed canonical product projection must carry source name, source version/snapshot, source URL, license, `license_url`, `attribution_required`, and `attribution_text` when attribution is required. Public/authenticated product surfaces may render only the safe credit fields from the dedicated read model; raw payloads, source-only fields, source record keys, external source IDs, checksums, restricted fields, occurrence/distribution coordinates, journal data, owner data, analytics, and media internals must stay out of public HTML, JSON-LD, Meilisearch/typeahead documents, and product UI.
- OVE-64 adds source refresh diff proof for an already imported source. Refresh uses stored snapshots only; canonical identity uses stable source-record keys rather than snapshot-versioned product IDs; diff/audit rows distinguish `new`, `unchanged`, `changed`, `removed_upstream`, `parser_reject`, `review_needed`, and `projection_blocked`; accepted new/safe-alias changes can reach typeahead after reindex, while canonical-name drift, parser rejects, and license/status drift stay out of product projection until review.
- OVE-65 hardens the post-seed read model before additional source expansion. Product typeahead must dedupe source-backed rows by canonical concept so repeated proof fixtures and parser/snapshot versions produce one selectable suggestion per real catalog concept. Operator provenance should show the latest/current safe proof per concept record with an audit-link count, while retaining full source snapshots, records, links, and refresh rows internally.
- OVE-66 adds the first internal source-candidate review lane to `/garden/catalog/curation`. Operators can inspect grouped source candidates from safe `allowed_projection` metadata, see source/legal/status context and a safe projection preview, promote the approved GRIN/NPGS proof candidate through a server action, or hold/reject quarantined review rows. The read model and UI do not select or render raw payloads, source-only fields, external coordinates, journal text, media internals, owner data, analytics, or precise location; product typeahead changes only after explicit promotion and reindex enqueue.
- OVE-67 proves the real `/garden` catalog UX against the imported seed set. After OVE-81, OVE-82, and OVE-83, the smoke covers representative UA official varieties beyond the original proof row plus accepted species aliases across Ukrainian, Bulgarian, English, and scientific/synonym lookup names; it also checks blocked alias inputs such as `garden tomato`, `love apple`, `помидор`, `gherkin`, `pickle`, and `holy basil`. The smoke verifies one deduped selectable suggestion per intended catalog concept, saves each accepted suggestion through the canonical first-entry path, and checks authenticated readback for kind-correct labels (`Plant variety`, `Plant species`, `Bee breed`), expected object kind including `bee_colony`, selected catalog identity, hidden location, and no source-only/operator metadata in proof output. The typeahead route falls back to canonical Postgres search when the derived Meilisearch index is stale or empty.
- OVE-68 adds the source-expansion product-projection guard. Any importer that writes source-backed `catalog_items` or product-visible `catalog_item_names` must pass the manifest check first: the source must be `USE` and include `canonical_product_projection`, unless a named source-specific gate allows one bounded source/version/record path. The OVE-60 official bee manual seed and OVE-61 BG reviewed subset are explicit bounded exceptions, not bulk approvals. OVE-100 adds a manifest policy for `eu-oj-eur-lex-common-catalogue`: it may project only with stable EUR-Lex/data.europa.eu ELI source URLs and required provenance. OVE-87 adds a manifest policy for `grin-global`: it may project only OVE-62/OVE-88 GRIN/NPGS curator-promoted candidate rows with GRIN source URL provenance and `grin_genebank_candidate` source IDs. `eu-common-catalogue`, IASAS/BG rows outside the OVE-61 accepted proof row, DAD-IS/EFABIS, EURISCO, Genesys, vendor/marketplace paths, unknown sources, and manifest entries missing `canonical_product_projection` stay raw/internal/quarantined until a fresh gate clears that exact use.
- OVE-103 adds the source-backed EU OJ product projection importer. `pnpm catalog:sources:import-eu-oj-common-catalogue` reuses the OVE-101/OVE-102 DG SANTE/EUR-Lex/Formex path, imports accepted Common Catalogue rows as `eu_oj_eur_lex_common_catalogue` plant-variety concepts, stores source attribution, ELI/OJ source URL, source version, publication date, extraction version, parser version, and the OverGarden normalization/no-legal-value caveats in provenance, and keeps review-needed/rejected rows source-only. Product typeahead and Meilisearch receive only safe catalog identity fields; raw payloads, source record keys, parser diagnostics, checksums, notifier/action fields, legal caveats, and source-only metadata remain out of search/UI.
- OVE-104 adds the local/main `/garden` smoke gate for those OVE-103 rows before OVE-85-90 resume. `pnpm smoke:garden-eu-oj-common-catalogue` signs in through the real app, searches authenticated typeahead, saves an EU OJ-backed selected variety through the canonical first-entry API, reads back `/garden/objects/[objectId]`, and verifies the approved attribution text plus legal-value caveat. The smoke uses a Bulgaria-relevant accepted OJ row when the current approved artifact contains one; otherwise it reports that absence explicitly and does not claim BG coverage. IASAS-only/portal-only rows remain source-only unless they are the existing bounded OVE-61 proof row or a later committed gate supersedes this note. This is not production rollout evidence; OVE-90 remains the production proof issue.
- OVE-105 adds the explicit production landing gate for the approved EU OJ importer. `pnpm catalog:sources:import-eu-oj-common-catalogue -- --environment production --confirm-environment production --allow-non-local-mutation --base-url https://over.garden` must be run through the approved production env provider path, refuses local/non-local database mixups, projects only accepted Official Journal / EUR-Lex Common Catalogue rows, proves idempotency and source provenance, and emits `ove105.euOjProductionLanding.v1` redacted evidence. OVE-106 owns the production UX/search proof before OVE-90 resumes.
- OVE-85 adds the BG official-varieties subset proof over the approved OVE-103 importer. `pnpm catalog:sources:dry-run -- --environment local --confirm-environment local --target bg-official-varieties` reports Bulgaria-notified OJ parser rows and accepted/review/reject counts; `pnpm smoke:garden-bg-official-varieties` verifies a Bulgaria-relevant OJ-backed `plant_variety` suggestion beyond `Садово 1`, keeps the OVE-61 `Садово 1` proof stable, proves source attribution/legal-value caveat readback, and confirms review-needed/rejected OJ rows plus IASAS-only/portal-only rows have no product selection path.
- OVE-69 adds the repeatable environment seed rollout proof. Operators must explicitly name and confirm `local`, `staging`, `preview`, or `production`; non-local runs require an extra mutation flag. The command seeds only the approved product proof set, captures verbose importer output privately, emits a redacted evidence contract, and runs the real `/garden` smoke against the selected app URL. The checked-in state does not claim staging or production rows exist until a run against that environment is recorded.
- OVE-70 isolates proof-harness semantics for source-import reruns. The GRIN/NPGS proof now labels clean-state absence as `cleanStateProof.status = passed` only when the promotable candidate is still quarantined and absent from product typeahead; reruns with an existing projection report `cleanStateProof.status = skipped_existing_projection` plus `rerunExistingProjection` instead of reusing a misleading `typeaheadBeforePromotion` field. Operators can add `--require-clean-state` to fail loudly when a clean-state precondition is required.
- OVE-60 consumes the safe manual official UA bee breed path first: `pnpm catalog:sources:import-breed-seed` imports `Карпатська бджола` as `catalogKind = breed`, proves typeahead/readback/provenance, keeps VBO as a future vertebrate-only backbone, and keeps DAD-IS/EFABIS validation notes source-only/internal-only.
- OVE-86 expands the breed path only inside the approved boundaries: the manual official Ukrainian bee seed now includes `Карпатська бджола`, `Українська степова бджола`, and `Поліська бджола`, while the VBO-supported animal subset projects `Ukrainian Grey (Cattle)` and `Bulgarian Rhodope (Cattle)` with `objectKind = animal`. Review-only Latin bee mappings, generated/localized VBO aliases, country-reported DAD-IS/EFABIS rows, and DAD-IS/EFABIS validation notes remain source-only or review-only.
- OVE-61 consumes only a bounded EU/BG official-variety proof subset, not a full IASAS/EU import. `pnpm catalog:sources:import-bg-official-variety` imports one reviewed `Садово 1` row as `eu_common_catalogue_bg`, captures EU Plant Variety Portal attribution/legal-caveat metadata plus IASAS 2026 OSL PDF proof metadata in source provenance, proves BG/Latin typeahead and selected garden readback, and keeps low-confidence or IASAS legal-conditional PDF rows quarantined out of typeahead. The broader IASAS and EU source entries remain `USE-WITH-CONDITIONS` for bulk/catalog expansion until stable export/parser and reuse blockers are closed.
- OVE-62 consumes only the OVE-55/OVE-87-approved GRIN/NPGS path as a bounded curated proof subset, not a live scraper or bulk genebank import. `pnpm catalog:sources:import-genebank-long-tail` imports one promotable `Red Cherry` candidate plus one held landrace candidate into quarantine-first source records, proves the held row stays out of typeahead, promotes only the explicitly curator-approved candidate into `catalogKind = plant_variety`, proves English/scientific-alias typeahead plus selected garden readback, and reads operator provenance from safe source/license/review metadata without accession/source-only fields. GRIN germplasm distribution policy remains a source caveat only and is not a product availability claim. Genesys/EURISCO remain `INTERNAL-VALIDATION-ONLY` and legally blocked until written permission or a legal memo clears raw storage and product projection.
- OVE-88 expands that same GRIN/NPGS-only path into a bounded bulk quarantine proof, not a broad PGR import. `pnpm catalog:sources:import-genebank-long-tail` imports 12 curated GRIN/NPGS proof rows, promotes only the three approved plant-variety candidates (`Red Cherry tomato`, `Bulgarian Carrot pepper`, `Odessa Market tomato`), and proves held, review-needed, rejected, and blocked rows remain absent from product typeahead. Accession identifiers, germplasm distribution caveats, Genesys/EURISCO terms evidence, raw payloads, restricted/source-only fields, and product availability claims remain source-only. `/garden/catalog/curation` adds aggregate-safe status counts and filters for the source-candidate review lane.
- OVE-89 adds the source-backed entity-resolution QA gate. `pnpm catalog:sources:entity-resolution-qa` reads the current database state and emits a redacted `ove89.catalogEntityResolutionQa.v1` report covering likely duplicates, alias collisions, source disagreements, blocked projection groups, and manual-review rows. `/garden/catalog/curation` renders the same safe report for allowlisted operators. The report must keep raw payloads, source-only fields, source record keys, journal text, owner data, media internals, precise location, and unsafe source metadata out of Linear-safe evidence. OVE-90 cannot claim production full-catalog availability unless this report is attached and any unresolved clusters are explicitly resolved or accepted as blockers.
- Current implementation note (2026-07-15): OVE-162 supersedes the runtime report with `ove162.catalogEntityResolutionQa.v2`, preserving every OVE-89 group and adding deterministic RapidFuzz `fuzzy_duplicate` pairs. Same-locale pairs are merge-review recommendations only; cross-locale and stale pairs are held. The worker persists advisory evidence only, the curation/report surfaces expose bounded safe labels/scores/reasons/source-family/locale state, and no automatic merge, alias publication, search mutation, or private/source-only evidence is permitted.
- Vendor/marketplace paths must not promote conditional/internal-only data until the specific blockers in the manifest are closed.
