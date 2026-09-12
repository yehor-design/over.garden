import { sql, type RawBuilder } from "kysely";

/**
 * The author's handle, as a correlated scalar, for every query that builds a
 * public address (ADR-0029 D9).
 *
 * A journal entry and an object passport live under their author now, so
 * fifteen public reads that used to select a slug need a handle beside it.
 * Written as one expression rather than fifteen joins because a join is easy to
 * get subtly wrong in fifteen places: the lifecycle filter belongs in the `ON`
 * clause, and a `LEFT JOIN` that quietly becomes an inner one drops every entry
 * by a handle-less author out of the listing instead of rendering it without a
 * link.
 *
 * **A query that groups must group by the owner column too.** A correlated
 * subquery may only read a column the outer query groups by; Postgres refuses
 * the statement with `42803` at plan time otherwise, for every row, whether or
 * not any row matches. That is exactly how every object passport answered 500
 * for months. `pnpm public:reads:prove-database` executes each of these reads
 * against a real database, which is what catches it.
 *
 * `normalized_handle` is the primary key of `user_handle_registry`, so a handle
 * is never reused by a second person even after it is retired — which is what
 * makes it safe in a public address.
 */
export function publicAuthorHandleSql(
  ownerRef: string,
): RawBuilder<string | null> {
  return sql<string | null>`(
    select handle_registry.normalized_handle
    from user_handle_registry as handle_registry
    where handle_registry.user_id = ${sql.ref(ownerRef)}
      and handle_registry.lifecycle_state = 'current'
    limit 1
  )`;
}
