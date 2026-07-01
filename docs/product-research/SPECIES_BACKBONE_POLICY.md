# Species Backbone Policy

Status: OVE-82 planned species import policy, extending the OVE-58/59/63 seed, alias-promotion, and attribution path
Scope: CoL/WFO/GBIF/EPPO/Wikidata species seed consumed by `pnpm catalog:sources:import-species-backbone`

OVE-58 proves one canonical species path through the real gardener flow: typeahead -> selected catalog item -> journal save -> readback. OVE-59 adds explicit vernacular alias promotion states for that same path. OVE-63 adds required source credits for attribution-required imported facts.

OVE-82 expands that proof into the full planned species wave for the current catalog rollout: `Solanum lycopersicum L.`, `Cucumis sativus L.`, `Helianthus annuus L.`, and `Ocimum basilicum L.`. This is a full planned import for the approved MVP species backbone wave, not a blind full global taxonomy dump. CoL/WFO/GBIF/EPPO/Wikidata remain approved source families, but each product-visible concept must pass the deterministic projection, alias review, attribution, and leak-check rules below.

## Source Precedence

For every planned OVE-82 species concept, OverGarden uses these source roles:

1. `catalogue-of-life-checklistbank` is the canonical accepted scientific-name authority for the product projection.
2. `world-flora-online` corroborates plant taxonomy and WFO identity. A WFO candidate with conflicting authorship stays source-only until curation.
3. `gbif-backbone` corroborates the species concept and preserves `gbif_taxon_key`. GBIF occurrence data is out of scope and remains raw/source-only.
4. `eppo-codes` preserves `eppo_code` and exact synonym/code support. Distribution/native-range text remains raw/source-only.
5. `wikidata` supplies safe vernacular aliases only after the species identity is corroborated by backbone sources.

## Projection Rules

The product catalog projection may include:

- Accepted scientific names for the planned species wave: `Solanum lycopersicum L.`, `Cucumis sativus L.`, `Helianthus annuus L.`, and `Ocimum basilicum L.`
- Source IDs: `col_id`, `wfo_id`, `gbif_taxon_key`, `eppo_code`, and `wikidata_id` inside internal allowed projection/provenance only.
- Source-backed synonym aliases, currently `Lycopersicon esculentum`.
- Small, gardener-facing vernacular aliases with permissive license/provenance, currently tomato/cucumber/sunflower/basil aliases in English, Ukrainian, and Bulgarian.

Projected aliases must also have an alias record with explicit language/locale, script, source slug, source method, source record key when source-backed, confidence, license, attribution flag, and one of these statuses:

- `accepted`: allowed into `catalog_item_names`, typeahead, and Meilisearch's public catalog document shape.
- `review_needed`: visible to the operator for review only; not projected to typeahead.
- `rejected`: retained as provenance for why it was not promoted; not projected to typeahead.
- `generated`: machine/generated variant candidate; never masquerades as source-backed and is not projected to typeahead unless a later curator action promotes it.
- `user_provisional`: reserved for user-added local names; the existing provisional confirm/merge flow remains separate from imported alias promotion.

The product catalog projection must not include:

- Raw source payload blobs.
- Source-only fields.
- GBIF occurrence records or coordinates.
- EPPO distribution/native-range text.
- Wikidata/EPPO aliases that have not been reviewed for local gardener language fit, including `garden tomato`, `gherkin`, `common sunflower`, `сонях`, `sweet basil`, and `базилік духмяний` while they are `review_needed`.
- Rejected aliases such as `love apple`, `pickle`, `обикновен слънчоглед`, and `holy basil`.
- Generated aliases such as `помидор`, `огурец`, `соняхи`, or `базилик` unless a later explicit curation step promotes them.
- Conditional or internal-validation-only sources such as PESI, EOL, or iNaturalist.

## Conflict Handling

When accepted names or authorship disagree, the importer keeps the conflicting value in `catalog_source_records` and does not project it to `catalog_items` or `catalog_item_names`. A later curator can promote, merge, or reject only after the source conflict is explicit in a follow-up SDD slice.

If a source link disappears or a source license changes, new imports must stop before projection. Existing projected rows should remain stable until an explicit curation/remediation task changes catalog identity.

## Runtime Boundary

User typeahead, save, and readback paths do not call live external APIs. They read only OverGarden catalog tables and the derived Meilisearch typeahead index. Source refresh/import work is offline/operator-run and must keep raw fields quarantined in `catalog_source_records`.

Typeahead is fed by `catalog_item_names`; alias review metadata is stored separately in `catalog_alias_projections`. A non-accepted alias can support operator review without becoming a public/product lookup term because it has no `catalog_item_name_id` link. Meilisearch catalog hits must also reject alias curation metadata (`aliasStatus`, source method, confidence, license, attribution, projection notes) if those fields appear accidentally.

Source credits are a separate read model, not a typeahead/search document expansion. `catalog_source_snapshots` must carry source name, source URL, source version, license, `license_url`, `attribution_required`, and `attribution_text` for attribution-required sources such as CoL, GBIF, and EPPO. `/variety/[slug]` may render those safe credit fields when the page relies on projected canonical source facts, but it must not render raw payloads, source-only fields, source record keys, external source IDs, checksums, occurrence/distribution coordinates, or restricted source fields.
