import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

/**
 * `health` — the ONLY model in this pre-MVP scaffold.
 *
 * It is an infrastructure tracer (id · text · timestamp) used to prove the
 * Postgres ↔ Drizzle ↔ Supabase seam end to end. It is NOT a product model and
 * will be deleted once the real, page-doc-driven schema arrives. Do not grow it.
 *
 * RLS posture (Variant D — ADR-0012): RLS is a NARROW FLOOR, not the primary
 * gate. Primary authorization lives in the server-tier data-access layer
 * (see `src/server/health-repository.ts`); the browser never queries this table
 * directly. `.enableRLS()` makes the table deny-by-default: with RLS on and no
 * permissive policy, the `anon`/`authenticated` roles get nothing. The single
 * policy below grants the `authenticated` role read-only access (`using`); no
 * write policy is declared, so INSERT/UPDATE/DELETE through those roles are
 * denied — only a privileged server/migration role writes. A future write
 * policy MUST use `withCheck`.
 */
export const health = pgTable(
  "health",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  () => [
    pgPolicy("health_authenticated_read", {
      for: "select",
      to: authenticatedRole,
      using: sql`true`,
    }),
  ],
).enableRLS();

export type Health = typeof health.$inferSelect;
export type NewHealth = typeof health.$inferInsert;
