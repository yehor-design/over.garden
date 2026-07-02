# Catalog Seed Rollout Proof

Status: active runbook
Started by: OVE-69
Primary seed command: `cd apps/web && pnpm catalog:sources:seed-rollout-proof`
Full production proof command: `cd apps/web && pnpm catalog:sources:production-rollout-proof`

## Purpose

Catalog source code being deployed is not the same thing as an environment being seeded.
This runbook is the repeatable proof that an explicitly named environment has received the approved source-backed catalog proof set and that the real app path can see it without exposing internal source fields.

## Current Seed State

- Local proof DB: can be seeded and verified with the command below.
- Staging: no checked-in evidence currently claims a staging seed run.
- Production seed proof: seeded and proven on 2026-07-01 by OVE-78 against `https://over.garden`.
  The rollout command reported code SHA `08db4d0adf8586fb91f8c4f29bf2f55ade15473d`,
  branch `main`, environment `production`, generated timestamp `2026-07-01T12:16:18.722Z`,
  idempotent product identity for every seed command, duplicate same-concept suggestions absent,
  real `/garden` readback status `200` for every smoke case, and leak check `passed`.
  This is historical proof for the OVE-78 seed set; after OVE-81 and OVE-83, a fresh production rollout proof is required before claiming production has the full UA State Register wave or the reviewed species alias expansion.
- Full production rollout proof: OVE-90 uses `pnpm catalog:sources:production-rollout-proof` as the final gate. It reruns the guarded seed proof, imports the approved EU OJ/Common Catalogue rows, runs the BG official-varieties `/garden` smoke, reads the OVE-89 entity-resolution QA report, and verifies the `catalog_typeahead` result through both Postgres fallback and Meilisearch. A passing seed proof alone is not enough to close OVE-90.
- Deployed code: prove separately through commit SHA, CI, and deployment metadata. Do not infer catalog rows from deployment alone.

Exact next operational action for staging or production: point the shell at that environment's approved database/app env through the secure provider tooling, run the command with the matching environment flags, and paste only the final redacted JSON output plus CI/deployment proof into Linear. Never paste child importer output, database URLs, env values, invite URLs, cookies, emails, source-record rows, raw payload hashes, or user identifiers.

## Approved Rollout Seed Set

The rollout command seeds the product-availability proof set:

- OVE-81 UA State Register official variety wave: 15,177 official variety concepts from the approved file, including the existing `Ботсадівський` proof row and representative `Kaiser`, `7 ФОР 7`, and `ЕС ЯСМІНІС КЛП` smoke cases
- OVE-58/82/83 species backbone: tomato, cucumber, sunflower, and basil species with reviewed Ukrainian, Bulgarian, English, and scientific/synonym aliases such as `помідор`, `помідори`, `домат`, `домати`, `огірок звичайний`, `common sunflower`, `сонях`, `sweet basil`, `базилік духмяний`, and `обикновен босилек`
- OVE-60/86 approved breed seed: official Ukrainian bee breeds including `Карпатська бджола`, plus the VBO animal-breed subset including `Ukrainian Grey (Cattle)`
- OVE-61 BG official variety proof subset: `Садово 1`
- OVE-62 GRIN/NPGS promoted long-tail candidate: `Red Cherry tomato`

The command intentionally does not bulk-seed conditional, internal-validation-only, rejected, vendor, marketplace, or non-promoted rows. The OVE-56 `Bergeron 1` sample remains a lower-level quarantine harness proof, not part of this environment-availability rollout command.

## Production Proof Evidence

OVE-78 seeded the production proof set with the non-local guarded command:

```bash
cd apps/web
pnpm catalog:sources:seed-rollout-proof -- --environment production --confirm-environment production --allow-non-local-mutation --base-url https://over.garden
```

The historical OVE-78 final redacted evidence recorded these product-visible rows:

| Source set                                    | Canonical name            | Catalog kind    | Product catalog item ID                | Public slug                                 |
| --------------------------------------------- | ------------------------- | --------------- | -------------------------------------- | ------------------------------------------- |
| OVE-57 UA State Register official variety     | `Ботсадівський`           | `plant_variety` | `b56745df-a726-4425-b2d1-7209e4bd6c76` | `botsadivskyi-ua-register-83070006`         |
| OVE-58 species backbone                       | `Solanum lycopersicum L.` | `species`       | `0a512046-b52d-46d8-9f67-e785895b1806` | `solanum-lycopersicum-species-backbone`     |
| OVE-60 official bee breed seed                | `Карпатська бджола`       | `breed`         | `ec7bee1c-078c-4851-aff4-e43188abcc31` | `karpatska-bdzhola-ua-official-breed`       |
| OVE-61 BG official variety proof subset       | `Садово 1`                | `plant_variety` | `3b59681d-228a-40e5-b59c-302e952923b7` | `sadovo-1-bg-official-variety`              |
| OVE-62 GRIN/NPGS promoted long-tail candidate | `Red Cherry tomato`       | `plant_variety` | `63e9e0e7-126e-421f-825f-3e9c208bc614` | `red-cherry-tomato-grin-genebank-candidate` |

The historical OVE-78 real app smoke selected and read back `Ботсадівський`, `помідор`, `домат`, `Карпатська бджола`, `Садово 1`, and `Red Cherry tomato` from `https://over.garden/garden`. `помідор` and `домат` both resolved to the same `species` catalog identity for `Solanum lycopersicum L.` without duplicate same-concept suggestions. OVE-81 expands the current smoke to include additional UA State Register cases beyond the proof row, OVE-83 expands it with reviewed species aliases plus blocked-alias absence checks, and OVE-86 expands it with `Ukrainian Grey (Cattle)` as an `animal` breed readback. Production proof must be rerun before those expanded cases are claimed on `https://over.garden`.

Production setup note: before the successful OVE-78 proof, production schema bootstrap was rerun non-destructively because the source-catalog tables required by the rollout command were missing from the live database. No schema drop, bulk delete, restore-over-production, or source/user data export was performed. The OVE-78 code also hardened the species and UA register importers so production reruns write the expected `catalog_kind` explicitly instead of relying on database defaults.

## OVE-104 EU OJ Local Smoke Gate

OVE-104 adds a local/main smoke gate for the OVE-103 Official Journal / EUR-Lex Common Catalogue projection before OVE-85-90 resume. This is not a staging or production rollout claim; OVE-90 remains the production proof issue for the full catalog rollout.

Local proof sequence:

```bash
cd apps/web
pnpm catalog:sources:import-eu-oj-common-catalogue
BETTER_AUTH_SECRET=local_ove104_build_secret_32_chars_minimum pnpm build
BETTER_AUTH_SECRET=local_ove104_build_secret_32_chars_minimum pnpm start --hostname localhost --port 3000
pnpm smoke:garden-eu-oj-common-catalogue -- --base-url http://localhost:3000
```

The smoke signs in through the real app, opens `/garden`, searches the authenticated typeahead for an EU OJ-backed variety, saves it through `/api/garden/entries`, reads back `/garden/objects/[objectId]`, and verifies the approved text: `Source: Official Journal of the European Union / EUR-Lex. Normalized by OverGarden.` It also verifies the legal-value caveat is visible and that IASAS-only blocked rows do not reach product typeahead through the legacy `eu_common_catalogue_bg` source.

If the current approved OJ artifacts contain a Bulgaria-relevant accepted row, the smoke uses that row. If not, the smoke reports the absence explicitly and uses another accepted EU OJ row without claiming BG coverage.

OVE-85-90 may resume only after this OVE-104 gate is committed, pushed, and verified on `main`.

## OVE-90 Full Production Rollout Proof

OVE-90 is the final full-catalog production availability gate. It must be run from a clean current `main` checkout after the prerequisite source-family issues are done and after CI has passed for the code being used for proof.

Production command:

```bash
cd apps/web
pnpm catalog:sources:production-rollout-proof -- --environment production --confirm-environment production --allow-non-local-mutation --base-url https://over.garden
```

The command is intentionally stricter than `catalog:sources:seed-rollout-proof`:

- it requires the same explicit non-local mutation confirmation and HTTPS base URL;
- it refuses a production/staging/preview proof if the selected database connection is local;
- it reruns the approved OVE-78/81/82/83/86/88 seed/import proof set;
- it imports the approved Official Journal / EUR-Lex Common Catalogue projection used by OVE-85;
- it runs the real BG official-varieties `/garden` smoke and proves a Bulgaria-relevant OJ-backed variety beyond `Садово 1`;
- it reads the OVE-89 entity-resolution QA report and fails on unresolved likely-duplicate or source-disagreement clusters;
- it rebuilds the derived Meilisearch `catalog_typeahead` index from safe catalog rows and waits for the indexing task;
- it verifies representative UA variety, species, breed, GRIN/NPGS, and EU OJ/BG rows through both direct Postgres typeahead fallback and Meilisearch `catalog_typeahead`;
- it emits one `ove90.fullCatalogProductionRolloutProof.v1` JSON object safe for Linear/docs.

OVE-90 closeout must include the final commit SHA on `main`, CI proof for that commit, the production proof command output summary, the production app URL used for smoke (`https://over.garden` unless explicitly changed), and a redaction/privacy note. Do not paste child importer stdout, environment values, database URLs, invite links, cookies, emails, raw payload identifiers, source-only fields, source-row keys, precise coordinates, media keys, user-agent/referrer fields, or Meilisearch credentials.

## Local Proof Command

Start from a clean current checkout, then run the local bootstrap and production server in one terminal:

```bash
cd apps/web
pnpm local:bootstrap
BETTER_AUTH_SECRET=local_ove69_build_secret_32_chars_minimum pnpm build
BETTER_AUTH_SECRET=local_ove69_build_secret_32_chars_minimum pnpm start --hostname 127.0.0.1 --port 3000
```

In a second terminal, run the rollout proof:

```bash
cd apps/web
pnpm catalog:sources:seed-rollout-proof -- --environment local --confirm-environment local --base-url http://localhost:3000
```

The command:

- runs the approved seed/import scripts with captured output;
- emits only a redacted rollout summary;
- runs the real `/garden` catalog UX smoke against the provided base URL;
- verifies `Ботсадівський`, `Kaiser`, `7 ФОР 7`, `ЕС ЯСМІНІС КЛП`, `помідор`, `помідори`, `домати`, `огірок звичайний`, `common sunflower`, `sweet basil`, `Карпатська`, `Садово 1`, `Red Cherry`, `Bulgarian Carrot`, and `Odessa Market`;
- verifies blocked/review-only aliases and source candidates such as `garden tomato`, `love apple`, `помидор`, `gherkin`, `pickle`, `holy basil`, `Unreviewed NPGS landrace proof row`, `Balkan dry bean proof row`, `Kyiv Long cucumber proof row`, and rejected/blocked genebank proof names do not appear as product alias suggestions;
- reports idempotent product identity and absence of duplicate same-concept suggestions;
- fails if final evidence contains source-record IDs, raw payload fields, exact location markers, emails, tokens, user-agent/referrer fields, media keys, or other forbidden proof markers.

## Non-Local Proof Command

Use this only after deliberately selecting the environment and confirming that the current shell points to that environment's database and app URL. This mutates the selected database.

```bash
cd apps/web
pnpm catalog:sources:seed-rollout-proof -- --environment production --confirm-environment production --allow-non-local-mutation --base-url https://over.garden
```

For staging or preview, replace both environment flags and the base URL accordingly. Non-local runs require HTTPS and `--allow-non-local-mutation`.

## Evidence Contract

The final JSON output is the only command output intended for Linear or docs. It records:

- issue id and generated timestamp;
- selected environment and app base URL;
- commit SHA, branch, and working-tree state;
- product-visible catalog item IDs, public slugs, canonical names, catalog kind, source family, alias counts, reindex intent, and idempotency booleans;
- sources intentionally not seeded by the rollout command;
- real app smoke results with query, selected text, canonical name, catalog kind, object kind, readback status, duplicate absence, blocked-alias absence, and leak check.

It must not record secrets, connection strings, raw importer stdout, source-record identifiers, raw payload hashes, source-only metadata, exact location data, emails, cookies, invite URLs, user identifiers, media keys, IP addresses, user agents, or referrers.
