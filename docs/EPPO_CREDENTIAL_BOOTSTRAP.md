# EPPO credential bootstrap

> Retained under `docs/adr/ADR-0025-stable-registry-retired.md` (2026-09-05):
> the EPPO observed capture, its tables, tooling and credential stay; the
> Stable Registry release model that once consumed them is retired. Read the
> capture and verify steps here as current; ignore any Foundation, edition,
> extension-pack or Release Center step.

## Purpose

`EPPO_DATA_PORTAL_API_KEY` is the single server-only credential for the EPPO
Global Database API v2. It enables no catalog import by itself. The credential
bootstrap is a bounded operator action that proves access to the documented
read-only `getGDTaxon` operation for taxon code `LYPES`.

Do not paste an EPPO account password, API key, authorization header, or
provider response into chat, Linear, shell arguments, a local environment file,
or a repository document.

## Prerequisites

1. Create an EPPO Data Portal account, accept the EPPO Open Data Licence, and
   generate an API key in the provider dashboard.
2. Confirm the implementation commit is contained in current `origin/main` and
   the required mainline closeout checks pass.
3. Run the command from an authenticated terminal in the linked OverGarden
   Vercel project. The command must first show a zero-secret plan.

## One-paste setup

```bash
cd apps/web
pnpm eppo:credentials:setup -- --environment production --confirm-environment production --apply
```

The command:

1. reads Vercel Production metadata without reading a value;
2. fetches and structurally verifies the current official OpenAPI v2 document;
3. prints a plan with the main SHA, OpenAPI digest, operation identity, target
   state, rollback method, and approval digest;
4. prompts once for a hidden, single-line API key;
5. validates that candidate directly against
   `GET /taxons/taxon/LYPES/overview` using the documented `X-Api-Key` header;
6. writes the validated credential bytes exactly once to the standard encrypted
   Vercel Production environment variable, without a terminal newline and never
   a public variable or a Vercel Sensitive variable;
7. re-runs the same verifier through `vercel env run -e production`, allowing
   at most three bounded read-backs for Vercel environment propagation without
   ever repeating the secret write; and
8. returns a redacted receipt only.

Stop if the plan reports an unexpected target state, a legacy EPPO alias, an
OpenAPI drift, an unrecognized operation, or any result other than
`completed`/`already_configured_and_verified`.

## Rotation, rollback, and revocation

The command validates a replacement before a write. For an existing canonical
credential it retains the prior value only in process memory, restores it if
runtime validation fails, and clears temporary buffers before exit. It never
prints or stores that prior value.

To revoke access, first generate and prove a replacement through the same
command. If provider access must be stopped immediately, revoke the key in the
EPPO dashboard and remove the Vercel Production variable through the authorized
incident procedure; then rerun the redacted target read-back. Do not replace a
value manually with a placeholder, and do not create `EPPO_API_KEY` or
`EPPO_DATA_SERVICES_TOKEN` aliases.

## Receipt policy

Allowed receipt fields are current-main SHA, OpenAPI SHA-256, operation id,
Production target class, secret-name existence class, HTTP status class,
duration, fingerprint prefix, rollback class, and cleanup class. Forbidden
fields include credentials, headers, request or response bodies, account
identifiers, URLs with tokens, and provider capability payloads.
