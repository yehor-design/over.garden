import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read Next's env automatically — load it explicitly.
// `.env.local` is the local runtime file; `.env` is a fallback.
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Migrations run over the DIRECT (non-pooler, port 5432) connection.
    // DDL needs a real session — NEVER the Supavisor transaction pooler.
    // `drizzle-kit generate` does NOT need this; only `migrate`/`push` do.
    url: process.env.DIRECT_URL!,
  },
  verbose: true,
  strict: true,
});
