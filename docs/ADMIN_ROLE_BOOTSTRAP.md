# Sealed Owner Bootstrap

Status: current after OVE-314
Last updated: 2026-08-11

OverGarden keeps a durable, server-authoritative sealed-owner boundary for the
few operations that must not be available to ordinary gardeners. It does not
have an admin landing page, user-management page, owner-status page, role
management UI, or separate admin navigation shell.

Admin access is tied to a Better Auth user through
`admin_user_roles.user_id`; it is never inferred from email domain, display
name, URL, cookie, provider claim, or client state. The runtime accepts only one
`owner` role row whose user id exactly matches
`OVERGARDEN_ADMIN_OWNER_USER_ID`. The account must have a verified email and
exactly one email/password (`credential`) account with a password hash. A
Google-linked or other social-linked account remains a valid gardener account
but cannot satisfy the sealed-owner boundary.

## Product behavior

Every authenticated user receives the ordinary avatar menu. After a
server-side sealed-owner check, the same menu conditionally adds exactly these
four localized links:

- `/admin/communities`
- `/admin/moderation/comments`
- `/garden/catalog/curation`
- `/garden/privacy/erasure-requests`

An ordinary gardener, guest, session-error state, non-sealed `owner` role row,
or owner lookup failure receives no owner links and no empty owner section. The
client receives only a boolean capability projection—never a role row, owner
identifier, credential-provider detail, or denial reason.

Menu visibility is not authorization. Each destination repeats the sealed
owner check and the capability required for its read or mutation. Direct access
by an ordinary gardener fails generically without mutation or private data.

The following retired pages must remain exact `404` for every role:

- `/admin`
- `/admin/users`
- `/garden/pilot-health`
- `/garden/pilot-smoke`

## Capabilities

The live role enum is exactly `owner`. Its server-side capability set protects:

- community and comment moderation;
- catalog curation;
- minimized erasure-request readback and review;
- separately maintainer-approved irreversible erasure execution.

There are no grantable admin roles in the product. `CATALOG_CURATOR_USER_IDS`
is not an authorization model and must not be used for new operator surfaces.
Historical audit rows can retain bounded provenance, but current runtime code
accepts only current enum values and the configured credential-only owner.

## Owner bootstrap

1. Complete normal Better Auth email/password signup and email verification so
   the owner exists with `emailVerified = true`. Do not use a Google-created,
   social-linked, passwordless, unverified, or duplicate-credential account.
2. Obtain the user id through a secure operator-only channel. Never paste it in
   docs, Linear, screenshots, logs, commits, or chat.
3. Set `OVERGARDEN_ADMIN_OWNER_USER_ID` in the target environment to that user
   id. Do not record the value in evidence.
4. Run:

```bash
cd apps/web
pnpm admin:bootstrap-owner -- --user-id "$OVERGARDEN_OWNER_USER_ID"
```

Optional explicit local inputs:

```bash
pnpm admin:bootstrap-owner -- \
  --env-file .env.production.local \
  --user-id "$OVERGARDEN_OWNER_USER_ID"

pnpm admin:bootstrap-owner -- \
  --ca-file /secure/path/ca.pem \
  --user-id "$OVERGARDEN_OWNER_USER_ID"
```

Before mutation, the script validates that the Better Auth user exists, the
email is verified, the environment binding matches, and the user has exactly
one credential row with a password hash and no linked social provider. It then
removes stale non-owner role rows, upserts `role = owner`, and emits only
redacted booleans and aggregate state. Any failed invariant exits before role
mutation.

Bootstrap is the only role-creation path. The product does not expose a role
grant/revoke action. A future change requires an explicit product decision, a
new vertical SDD slice, and a fresh security/privacy review.

## Audit and redaction boundary

Role changes write `admin_role_audit_log` with bounded action, reason, and role
enums, timestamps, and a one-way actor-session hash. Current reason
`operator_delegation` supersedes the retired pilot-specific label.

Owner UI and retained evidence must never expose:

- user ids, emails, contact fields, cookies, tokens, or raw session ids;
- provider credentials or account payloads;
- journal title/body or private media keys;
- IP address, user agent, exact request metadata, or connection strings;
- precise coordinates or environment values.

Failure output remains fixed and redacted because provider/database errors can
contain private hosts or identifiers. Investigate raw failures only inside the
secure operator environment.
