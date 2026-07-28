/**
 * Shared public-surface predicate for launch-safe journal content classes.
 */

import { sql, type Expression, type SqlBool } from "kysely";

import { PUBLIC_LAUNCH_CONTENT_CLASSES } from "@/lib/launch-corpus/content-class";
import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";

export const PUBLIC_LAUNCH_SURFACE_POLICY_VERSION =
  "ove221.publicLaunchSurface.v1" as const;

export function publicLaunchContentClassPredicate(
  column: Expression<string | null> = sql`journal_entries.content_class`,
): Expression<SqlBool> {
  const contentClasses = tryResolveVisualFixtureEnvironment(process.env)
    ? [...PUBLIC_LAUNCH_CONTENT_CLASSES, "visual_fixture"]
    : PUBLIC_LAUNCH_CONTENT_CLASSES;
  return sql<SqlBool>`${column} in (${sql.join(
    contentClasses.map((value) => sql.lit(value)),
  )})`;
}

/** Alias kept for call sites that want the full launch-surface gate. */
export function publicLaunchSurfacePredicates(
  column?: Expression<string | null>,
): Expression<SqlBool> {
  return publicLaunchContentClassPredicate(column);
}
