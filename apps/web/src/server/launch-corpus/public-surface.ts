/**
 * Shared public-surface predicate for launch-safe journal content classes.
 */

import { sql, type Expression, type SqlBool } from "kysely";

import { PUBLIC_LAUNCH_CONTENT_CLASSES } from "@/lib/launch-corpus/content-class";

export function publicLaunchContentClassPredicate(
  column: Expression<string | null> = sql`journal_entries.content_class`,
): Expression<SqlBool> {
  return sql<SqlBool>`${column} in (${sql.join(
    PUBLIC_LAUNCH_CONTENT_CLASSES.map((value) => sql.lit(value)),
  )})`;
}

/** Alias kept for call sites that want the full launch-surface gate. */
export function publicLaunchSurfacePredicates(): Expression<SqlBool> {
  return publicLaunchContentClassPredicate();
}
