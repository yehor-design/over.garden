# Admin Role Bootstrap

OVE-108 adds a durable admin role foundation for the internal `/admin` control
plane. Admin access is tied to a Better Auth user through
`admin_user_roles.user_id`; it is never inferred from email domain, display
name, provider, cookies, or client state.

OVE-113 seals the admin boundary to one configured owner account:
`OVERGARDEN_ADMIN_OWNER_USER_ID` must match the single `admin_user_roles.owner`
row. The owner account must have a verified email and exactly one
email/password (`credential`) account with a password hash. Google or any other
remain gardener sign-in options, but a user with any linked social provider
account is denied by `/admin`, and no social-created or social-linked user can
become an admin-capable account.

## Roles

The live role enum is:

- `owner`

There are no grantable admin roles in the product. Historical audit rows may
contain older bounded role/reason labels, but the runtime gate accepts only the
configured credential-only owner.

## Operator Surfaces

OVE-109 moves the existing internal operator surfaces behind this sealed owner
gate:

- `/garden/pilot-smoke` and `/garden/pilot-health` require `operator:read`.
- `/garden/catalog/curation` requires `operator:mutate`.
- `/garden/privacy/erasure-requests` allows `operator:read` for minimized
  readback, requires `operator:mutate` for review/status actions, and requires
  `erasure:execute` for maintainer-approved irreversible erasure.

Only the configured owner can receive those capabilities.

`CATALOG_CURATOR_USER_IDS` is not the long-term admin authorization model. Do
not add new operator surfaces to that env allowlist pattern.

## Sealed Owner Status

OVE-110 originally introduced `/admin/users`; OVE-113 seals it into a read-only
owner status and audit surface. It cannot grant or revoke roles, it is not a
broad user search or CRM surface, and it must not infer roles from email,
provider claim, URL parameter, or client state. Server-side grant/revoke
requests fail closed even for the owner.

Every role change writes `admin_role_audit_log` with actor user id, target user
id, bounded action/reason/role enums, timestamp, and a one-way hash of the
actor session id. The audit table and UI must not store or render emails,
cookies, raw session ids, provider tokens, IP/user-agent fields, private
journal/media content, precise coordinates, or env values.

Owner creation remains a bootstrap-controlled operation. All non-owner admin
role rows are treated as drift and are not accepted by the runtime gate.

## Owner Bootstrap

1. Complete the normal Better Auth email/password sign-up and email-verification
   flow so the owner user exists with `emailVerified = true`. Do not bootstrap
   an unverified, Google-created, other social-linked, passwordless,
   or duplicate-credential account.
2. Obtain the user id from a secure operator-only channel. Do not paste it into
   docs, Linear, screenshots, logs, commits, or chat.
3. Set `OVERGARDEN_ADMIN_OWNER_USER_ID` in the target environment to that user
   id. Do not record the value in evidence.
4. Run:

```bash
cd apps/web
pnpm admin:bootstrap-owner -- --user-id "$OVERGARDEN_OWNER_USER_ID"
```

The script also accepts:

```bash
pnpm admin:bootstrap-owner -- --env-file .env.production.local --user-id "$OVERGARDEN_OWNER_USER_ID"
pnpm admin:bootstrap-owner -- --ca-file /secure/path/ca.pem --user-id "$OVERGARDEN_OWNER_USER_ID"
```

Before any role mutation, the script validates that the Better Auth user exists,
the email is verified, the env matches the user id, and the user has exactly one
credential row with a password hash and no linked social provider. It then
removes stale non-owner admin rows, upserts `role = owner`, and prints only
redacted JSON evidence, including the truthful booleans `emailVerified: true`
and `credentialOnlyVerified: true`. It must not print user IDs, emails, cookies,
tokens, connection strings, env values, IP addresses, user agents, or request
metadata. Any failed identity invariant exits before changing role rows.
Failure output is a fixed redacted message because database and network errors
can embed private hosts, identifiers, or connection details; investigate the
operator environment privately rather than copying raw errors into evidence.

## Redaction Boundary

`/admin` is a navigation and status surface only. It must not render:

- raw journal title/body
- private media storage keys
- user emails or contact fields
- cookies, tokens, session IDs, IP addresses, or user agents
- precise coordinates
- env values or connection strings

Existing operator surfaces must keep using the sealed owner capability model.
`/admin/users` may render shortened internal user references for owner
readback, but evidence and docs must not copy live user ids.
