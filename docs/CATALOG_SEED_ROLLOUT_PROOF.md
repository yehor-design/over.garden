# Catalog Seed Rollout Proof

Status: active runbook
Started by: OVE-69
Primary command: `cd apps/web && pnpm catalog:sources:seed-rollout-proof`

## Purpose

Catalog source code being deployed is not the same thing as an environment being seeded.
This runbook is the repeatable proof that an explicitly named environment has received the approved source-backed catalog proof set and that the real app path can see it without exposing internal source fields.

## Current Seed State

- Local proof DB: can be seeded and verified with the command below.
- Staging: no checked-in evidence currently claims a staging seed run.
- Production: seeded and proven on 2026-07-01 by OVE-78 against `https://over.garden`.
  The rollout command reported code SHA `08db4d0adf8586fb91f8c4f29bf2f55ade15473d`,
  branch `main`, environment `production`, generated timestamp `2026-07-01T12:16:18.722Z`,
  idempotent product identity for every seed command, duplicate same-concept suggestions absent,
  real `/garden` readback status `200` for every smoke case, and leak check `passed`.
- Deployed code: prove separately through commit SHA, CI, and deployment metadata. Do not infer catalog rows from deployment alone.

Exact next operational action for staging or production: point the shell at that environment's approved database/app env through the secure provider tooling, run the command with the matching environment flags, and paste only the final redacted JSON output plus CI/deployment proof into Linear. Never paste child importer output, database URLs, env values, invite URLs, cookies, emails, source-record rows, raw payload hashes, or user identifiers.

## Approved Rollout Seed Set

The rollout command seeds the product-availability proof set:

- OVE-57 UA State Register official variety: `Ботсадівський`
- OVE-58 species backbone: `Solanum lycopersicum L.` with `помідор` and `домат` aliases
- OVE-60 official bee breed seed: `Карпатська бджола`
- OVE-61 BG official variety proof subset: `Садово 1`
- OVE-62 GRIN/NPGS promoted long-tail candidate: `Red Cherry tomato`

The command intentionally does not bulk-seed conditional, internal-validation-only, rejected, vendor, marketplace, or non-promoted rows. The OVE-56 `Bergeron 1` sample remains a lower-level quarantine harness proof, not part of this environment-availability rollout command.

## Production Proof Evidence

OVE-78 seeded the production proof set with the non-local guarded command:

```bash
cd apps/web
pnpm catalog:sources:seed-rollout-proof -- --environment production --confirm-environment production --allow-non-local-mutation --base-url https://over.garden
```

The final redacted evidence recorded these product-visible rows:

| Source set | Canonical name | Catalog kind | Product catalog item ID | Public slug |
| --- | --- | --- | --- | --- |
| OVE-57 UA State Register official variety | `Ботсадівський` | `plant_variety` | `b56745df-a726-4425-b2d1-7209e4bd6c76` | `botsadivskyi-ua-register-83070006` |
| OVE-58 species backbone | `Solanum lycopersicum L.` | `species` | `0a512046-b52d-46d8-9f67-e785895b1806` | `solanum-lycopersicum-species-backbone` |
| OVE-60 official bee breed seed | `Карпатська бджола` | `breed` | `ec7bee1c-078c-4851-aff4-e43188abcc31` | `karpatska-bdzhola-ua-official-breed` |
| OVE-61 BG official variety proof subset | `Садово 1` | `plant_variety` | `3b59681d-228a-40e5-b59c-302e952923b7` | `sadovo-1-bg-official-variety` |
| OVE-62 GRIN/NPGS promoted long-tail candidate | `Red Cherry tomato` | `plant_variety` | `63e9e0e7-126e-421f-825f-3e9c208bc614` | `red-cherry-tomato-grin-genebank-candidate` |

The real app smoke selected and read back `Ботсадівський`, `помідор`, `домат`, `Карпатська бджола`, `Садово 1`, and `Red Cherry tomato` from `https://over.garden/garden`. `помідор` and `домат` both resolved to the same `species` catalog identity for `Solanum lycopersicum L.` without duplicate same-concept suggestions.

Production setup note: before the successful OVE-78 proof, production schema bootstrap was rerun non-destructively because the source-catalog tables required by the rollout command were missing from the live database. No schema drop, bulk delete, restore-over-production, or source/user data export was performed. The OVE-78 code also hardened the species and UA register importers so production reruns write the expected `catalog_kind` explicitly instead of relying on database defaults.

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
- verifies `Ботсадівський`, `помідор`, `Карпатська`, `Садово 1`, and `Red Cherry`;
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
- real app smoke results with query, selected text, canonical name, catalog kind, object kind, readback status, duplicate absence, and leak check.

It must not record secrets, connection strings, raw importer stdout, source-record identifiers, raw payload hashes, source-only metadata, exact location data, emails, cookies, invite URLs, user identifiers, media keys, IP addresses, user agents, or referrers.
