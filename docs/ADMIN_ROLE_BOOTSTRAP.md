# Admin Role Bootstrap

OVE-108 adds a durable admin role foundation for the internal `/admin` control
plane. Admin access is tied to a Better Auth user through
`admin_user_roles.user_id`; it is never inferred from email domain, display
name, provider, cookies, or client state.

## Roles

The initial role enum is:

- `owner`
- `admin`
- `moderator`
- `viewer`

`owner` can manage future role grants. `viewer` can read the admin entry and
viewer-safe operator readouts, but cannot mutate operator state. Server code
must check capabilities before any admin or operator mutation.

## Operator Surfaces

OVE-109 moves the existing internal operator surfaces behind this shared role
model:

- `/garden/pilot-smoke`, `/garden/pilot-health`, and
  `/garden/pilot-learning/decision` require `operator:read`.
- `/garden/pilot-learning/interviews` allows `operator:read` for readback and
  requires `operator:mutate` for new interview capture.
- `/garden/catalog/curation` requires `operator:mutate`.
- `/garden/privacy/erasure-requests` allows `operator:read` for minimized
  readback, requires `operator:mutate` for review/status actions, and requires
  `erasure:execute` for maintainer-approved irreversible erasure.

`CATALOG_CURATOR_USER_IDS` is not the long-term admin authorization model. Do
not add new operator surfaces to that env allowlist pattern.

## Owner Bootstrap

1. Sign in once through the normal Better Auth flow so the owner user exists.
2. Obtain the user id from a secure operator-only channel. Do not paste it into
   docs, Linear, screenshots, logs, commits, or chat.
3. Run:

```bash
cd apps/web
pnpm admin:bootstrap-owner -- --user-id "$OVERGARDEN_OWNER_USER_ID"
```

The script also accepts:

```bash
pnpm admin:bootstrap-owner -- --env-file .env.production.local --user-id "$OVERGARDEN_OWNER_USER_ID"
pnpm admin:bootstrap-owner -- --ca-file /secure/path/ca.pem --user-id "$OVERGARDEN_OWNER_USER_ID"
```

The script validates that the Better Auth user exists, upserts `role = owner`,
and prints only redacted JSON evidence. It must not print user IDs, emails,
cookies, tokens, connection strings, env values, IP addresses, user agents, or
request metadata.

## Redaction Boundary

`/admin` is a navigation and status surface only. It must not render:

- raw journal title/body
- private media storage keys
- user emails or contact fields
- cookies, tokens, session IDs, IP addresses, or user agents
- precise coordinates
- env values or connection strings

Existing operator surfaces must keep using the shared role/capability model.
