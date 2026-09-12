import "server-only";

import type { Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * The handle a gardener's public addresses hang from (ADR-0029 D9).
 *
 * `user_handle_registry.normalized_handle` is the table's primary key, so a
 * handle is never reused by a second person even after it is retired. That is
 * what makes it safe in an address and in the slug-history key: a row can only
 * ever name one gardener.
 *
 * `null` when the person has no current handle. Nothing published can be in
 * that state — the registry claims a generated handle at sign-up — but a row
 * written before the registry existed could be, and an address that cannot be
 * built is better than one built from a guess.
 */
export function buildPublicAuthorHandleQuery(
  executor: QueryExecutor,
  userId: string,
) {
  return executor
    .selectFrom("user_handle_registry")
    .select(["user_handle_registry.normalized_handle as handle"])
    .where("user_handle_registry.user_id", "=", userId)
    .where("user_handle_registry.lifecycle_state", "=", "current");
}

export async function getPublicAuthorHandle(
  userId: string,
  executor: QueryExecutor = db,
): Promise<string | null> {
  const row = await buildPublicAuthorHandleQuery(
    executor,
    userId,
  ).executeTakeFirst();
  return row?.handle ?? null;
}

/**
 * The join every public read uses to put the author in the address.
 *
 * Written once because it is easy to get subtly wrong in fifteen places: the
 * lifecycle filter belongs in the `ON` clause, not in `WHERE`, or a `LEFT JOIN`
 * quietly becomes an inner one and entries by a handle-less author disappear
 * from the listing instead of appearing without a link.
 */
export const PUBLIC_AUTHOR_HANDLE_JOIN = {
  table: "user_handle_registry",
  lifecycleState: "current",
} as const;
