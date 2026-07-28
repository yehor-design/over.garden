# Public Journal Search Budget

OVE-220 makes `/journals?q=…` a bounded hybrid-search journey instead of an
unbounded database text scan.

## Runtime contract

- Meilisearch may return at most 256 UUID-only candidates and has a 400 ms
  deadline.
- Two consecutive dependency failures open the in-process circuit for 30
  seconds. One half-open request probes recovery; concurrent requests remain on
  the bounded fallback.
- Every Meilisearch ID is revalidated through canonical public Postgres
  predicates. Meilisearch is never the rendering or privacy authority.
- When Meilisearch is late or unavailable, Postgres first selects at most 256
  recent canonical public IDs without a text predicate. Only that candidate set
  is searched with ILIKE. Results and facets share the exact same candidate
  scope.
- The UI keeps useful results visible and discloses the temporary limited mode
  in Ukrainian, Bulgarian, and Russian. It does not claim complete recall.

The bounded degraded path intentionally trades recall for predictable latency
and database safety. A later successful request automatically restores the
hybrid path; no operator action or persistent state transition is required.

## Proof

Start the supported local Apple Container runtime, then run the read-only proof:

```bash
infra/container-up
cd apps/web
../../infra/run-with-local-infra-env pnpm local:bootstrap
../../infra/run-with-local-infra-env pnpm smoke:public-journal-search-budget
```

The proof uses the real local Postgres schema and repositories. Inside a single
transaction it derives 10,000 synthetic journal rows from an already-approved
local fixture, exercises the maximum 256-candidate width, and always rolls the
transaction back. It verifies the candidate cap, query ordering, and Postgres
plan, rejects a broad journal text scan, and measures 20 complete degraded
journeys after warmup. The release gate is p95 at or below 750 ms. Output
contains only aggregate counts, timing, and plan node classes; it contains no
query text, journal IDs, user text, precise location, or secrets.

## Rollback and failure gates

Rollback the OVE-220 implementation commit if the deadline/circuit causes a
regression. Do not restore the former unbounded ILIKE fallback. A failed budget
proof, a candidate set above 256, an unfenced text predicate, result/facet scope
drift, or missing degraded disclosure blocks release and Linear completion.
