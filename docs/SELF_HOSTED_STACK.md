# Self-hosted stack

Status: executable runbook
Owner: OVE-358
Definition: `infra/docker-compose.stack.yml`
Entry point: `infra/overgarden-stack`
Scope: the composed stack and its proven restore. **No provider is provisioned,
no DNS changes, no production data moves, and the managed database is not
retired.**

## Why this exists

The project could describe a self-hosted stack and could not start one.

`infra/docker-compose.yml` is a development convenience: three services, no
pooler, no Postgres TLS, no reverse proxy, no worker. The production definition
is split across two files that each assume a managed database beside them.

And the only proven recovery path belonged to the provider the project intends
to leave. `docs/MANAGED_RECOVERY_DRILL.md` restores by forking one managed
cluster, and `apps/web/src/server/restore-readiness/provider.ts` executes that
provider's command line directly. Leaving managed hosting would have removed not
just the backups but the proof that recovery works.

## The one rule

**A backup is only a backup once it has been restored and the product read back
from it.**

Everything before `verify` is preparation. A row count, a schema manifest, a
process that starts, or a database that exists are all things that can be true
while a gardener's journal is gone.

## Running it

```bash
infra/overgarden-stack up
infra/overgarden-stack status
infra/overgarden-stack backup
infra/overgarden-stack verify <digest>
infra/overgarden-stack down
```

`up` generates a certificate authority on first run and keeps it. Regenerating
it every start would hand the application a new authority each time, and an
authority that changes silently is indistinguishable from one that was swapped.

`backup` names each backup by the digest of its own bytes, so repeating a backup
of unchanged data produces the same object rather than a second one.

`verify` restores into a disposable database, serves the canonical product read
model against it, measures the elapsed time, and **deletes the target on every
terminal path — including the failing one**.

`restore` never writes to the live database. The only names it will touch match
`overgarden_stack_restore_*`, which is the one naming rule that keeps a rehearsal
from becoming an incident.

## The services

| Service | Reachable from | Why |
| -- | -- | -- |
| `postgres` | internal only | TLS on, even to the pooler on the same host |
| `pgbouncer` | internal only | the pooler the managed database used to supply |
| `meilisearch` | internal only | derived projection, rebuilt from Postgres |
| `matching-worker` | internal only | claims jobs, converges the projection outbox |
| `caddy` | **the host** | the only published port |

## The pooler, and the one service that must bypass it

The application connects to PgBouncer, never to Postgres directly. Without a
pooler a serverless deployment opens one connection per instance until Postgres
refuses — which is what the managed database was quietly preventing.

`POOL_MODE` is `transaction`, because that is the mode that makes the saving
real. It is also the reason **the matching worker must not come through it**.

`LISTEN`/`NOTIFY` needs a session that outlives a transaction, and transaction
pooling does not give it one. A worker routed through the pooler would stop
waking, its bounded fallback poll would quietly cover for it, and nothing would
report a problem. So the worker gets `DIRECT_URL` and everything else gets
`DATABASE_URL` — the split the application already had.

`MAX_PREPARED_STATEMENTS` is `0`: the application uses unnamed parameterised
statements, which transaction pooling carries safely. A client that named them
would need `session` mode instead.

## Postgres TLS

The stack generates a self-signed authority and a server certificate whose
subject alternative names cover `postgres`, `localhost`, and `127.0.0.1` —
`postgres` because that is the name the pooler and the worker resolve on the
internal network, and `verify-full` checks it.

The application needs no change: `apps/web/src/db/connection.ts` already accepts
an explicit authority through `DATABASE_SSL_CA` and uses strict verification.
Set `DATABASE_SSL=true` explicitly — the resolver treats a loopback connection
string as plaintext otherwise.

The private key is generated `chmod 600` and owned by uid 70, because Postgres
refuses to start with a key any other account can read.

## The search image pin

The composed stack pins the **OCI index** digest:

```
getmeili/meilisearch:v1.48.1@sha256:ad98ec0ab2a387da5c140fe9d935eadc6e3a42aee185b4249dfafd985fb49e1c
```

`infra/production-worker/docker-compose.meilisearch.yml` pins
`sha256:93ea15e3…`, which is the **linux/amd64 manifest alone**. That pull fails
outright on an ARM host, and ARM is exactly what the cheap and free tiers offer.

| | Digest |
| -- | -- |
| Index (multi-architecture) | `sha256:ad98ec0a…` |
| linux/amd64 | `sha256:93ea15e3…` |
| linux/arm64 | `sha256:24896770…` |

The index digest is equally immutable and resolves to the right architecture.
The production file keeps its own pin until a separate cutover moves it.

## What the proof actually checks

```bash
cd apps/web
node --conditions=react-server --import tsx \
  scripts/prove-composed-stack-restore.ts --mode verify --database
```

The `react-server` condition is needed because the read-back calls the real
catalog repository, which is `server-only`.

| Claim | How |
| -- | -- |
| A real backup is taken | `pg_dump --format=custom` against a populated database |
| The digest verifies | SHA-256 over the bytes that would reach object storage |
| A real restore happens | `pg_restore` into an empty disposable database |
| **The product comes back** | the canonical repository functions, all three locales |
| The identity is stable | a suggestion resolves back to the same catalog UUID |
| The index is rebuilt, not restored | the reindex-rows query reads the restored Postgres |
| History stays history | a retired release's rows return but never reach the product |
| The live source is untouched | a product fingerprint, byte-identical before and after |
| Nothing is left behind | both disposable databases deleted on every path |

`pg_dump` and `pg_restore` are not installed on a typical developer host, and
asking someone to install a matching client just to rehearse a restore is how
rehearsals stop happening. The proof runs the server's own tooling inside its
container — which is also the version that will actually read the dump.

## The proof is not vacuous

| Mutation | Result |
| -- | -- |
| Restored `--schema-only` — every table, no rows | `restored_target_did_not_serve_the_product_read_back` |

That is the exact failure the contract calls out as insufficient proof: a
database that exists. It is caught by asking the product a question rather than
counting rows.

## What "product read-back" means here

The canonical product **read model** — `searchActiveStableRegistryProductSuggestions`
and `findActiveStableRegistryProductCatalogItem`, the same functions the picker
calls — run against the restored database, once per shared locale.

It is not an HTTP route render. Rendering routes would add a Next.js server to a
restore rehearsal without answering a question the read model does not already
answer: whether the identities, their localized names, and their stable UUIDs
survived the round trip.

## Rollback

Stop the stack and delete its disposable target. The managed database, its
backups, and every production byte are untouched at every step, so rollback needs
no data recovery.

If the composed stack turns out to be the wrong answer, nothing has been spent
except the unused definition.

## Boundaries

- No provider is provisioned. No DNS or certificate changes on any public
  hostname. No production data moves. The managed database is not retired.
- `docs/MANAGED_RECOVERY_DRILL.md` keeps ownership of the managed-provider drill
  while the managed database is live. This extends it rather than replacing it.
- `infra/docker-compose.yml` stays the development-only local runtime.
- `infra/production-worker/*` keeps ownership of the current managed-host
  services until a separate cutover retires them.
- Meilisearch is a derived projection. It is rebuilt from Postgres on restore and
  is never treated as a backup source.
- The stack is `production-linux-required` under
  `docs/CONTAINER_RUNTIME_POLICY.md`. Apple Container remains the preferred
  supported-Mac local runtime; a Linux host running this stack is the recorded
  platform-bound exception, which is why the definition is a portable Compose
  recipe rather than a runtime-specific one.

## Not yet proven

The achievable restore duration on a real self-hosted host is unmeasured. The
local rehearsal completes in about one second against a small corpus, which
bounds nothing about the full 129,188-record corpus on a small ARM instance.

The declared budget is one hour, against the managed baseline of a five-minute
recovery point and an eleven-minute recovery time measured under OVE-201. Before
anything depends on this stack, that measurement has to be repeated on the host
that will actually hold it.
