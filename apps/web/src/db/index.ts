import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Runtime Drizzle client.
 *
 * Serverless connection discipline (TECH_STACK §2.5):
 *  - `DATABASE_URL` is the Supavisor **transaction-mode** pooler URI (port 6543).
 *  - `{ prepare: false }` is REQUIRED — transaction mode does not support
 *    prepared statements (the single most common breakage for this stack).
 *  - ONE client per cold-start container: the client is created at module scope
 *    and reused across warm invocations. Never instantiate per request, or
 *    Postgres connections exhaust.
 *
 * Migrations use a DIFFERENT, DIRECT connection — see `drizzle.config.ts`.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Surfaced lazily so the app can boot for non-DB routes while Supabase is
  // not yet wired (the platform projects are connected later).
  console.warn(
    "[db] DATABASE_URL is not set — database access will fail until Supabase is wired.",
  );
}

const client = postgres(connectionString ?? "", { prepare: false });

export const db = drizzle({ client, schema });
export { schema };
