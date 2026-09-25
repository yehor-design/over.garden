/**
 * Write the standard species base into the catalogue (OVE-530, ADR-0035 D3).
 *
 * Reads `data/standard-species/standard-species.v1.json`, finds or makes each
 * row's organism, records membership, and makes the base's everyday names the
 * primary vernaculars in uk, bg and ru. A dry run by default: everything is
 * done in one transaction and rolled back after counting. `--apply` commits.
 *
 * From `apps/web`:
 *
 *   pnpm exec tsx scripts/load-standard-species.ts
 *   pnpm exec tsx scripts/load-standard-species.ts --apply
 *   pnpm exec tsx scripts/load-standard-species.ts --apply \
 *     --env-file /abs/path/prod.env --environment production \
 *     --confirm-environment production --allow-non-local-mutation
 *
 * The production flags are the ones every importer in this repository takes,
 * checked the same way: a non-local database without them is refused before
 * a row is read. A second run over the same file changes nothing.
 */
import "./neutralise-server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import {
  loadStandardSpeciesBase,
  type StandardSpeciesFile,
} from "../src/server/catalog-source/standard-species-load";

export const STANDARD_SPECIES_FILE = path.join(
  import.meta.dirname,
  "..",
  "data",
  "standard-species",
  "standard-species.v1.json",
);

export interface LoadStandardSpeciesArgs {
  file: string;
  apply: boolean;
  envFile: string | undefined;
  environment: "local" | "production";
  allowNonLocalMutation: boolean;
}

export function parseLoadStandardSpeciesArgs(
  argv: readonly string[],
): LoadStandardSpeciesArgs {
  const valueFor = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const environment = valueFor("--environment") ?? "local";
  if (environment !== "local" && environment !== "production") {
    throw new Error("standard_species_environment_invalid");
  }
  if ((valueFor("--confirm-environment") ?? environment) !== environment) {
    throw new Error("standard_species_environment_not_confirmed");
  }
  return {
    file: valueFor("--file") ?? STANDARD_SPECIES_FILE,
    apply: argv.includes("--apply"),
    envFile: valueFor("--env-file"),
    environment,
    allowNonLocalMutation: argv.includes("--allow-non-local-mutation"),
  };
}

/** Loopback unless the operator said production out loud, twice and by flag. */
export function assertStandardSpeciesEnvironment(
  args: LoadStandardSpeciesArgs,
  connectionString: string,
): { databaseHost: "loopback" | "remote" } {
  const host = new URL(connectionString).hostname;
  const loopback = new Set(["127.0.0.1", "localhost", "::1"]).has(host);
  if (loopback) {
    if (args.environment !== "local")
      throw new Error("standard_species_local_database_refused");
    return { databaseHost: "loopback" };
  }
  if (args.environment !== "production" || !args.allowNonLocalMutation) {
    throw new Error("standard_species_non_local_mutation_refused");
  }
  return { databaseHost: "remote" };
}

async function main() {
  const args = parseLoadStandardSpeciesArgs(process.argv.slice(2));
  if (args.envFile) loadEnv({ path: args.envFile, override: true });
  if (process.env.DATABASE_SSL_CA) process.env.DATABASE_SSL = "true";
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString)
    throw new Error("standard_species_database_url_missing");
  const { databaseHost } = assertStandardSpeciesEnvironment(
    args,
    connectionString,
  );

  const payload = readFileSync(args.file, "utf8");
  const file = JSON.parse(payload) as StandardSpeciesFile;
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  try {
    const startedAt = Date.now();
    const summary = await loadStandardSpeciesBase(db, {
      file,
      payload,
      apply: args.apply,
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          class: "standard_species_load",
          environment: args.environment,
          databaseHost,
          seconds: Math.round((Date.now() - startedAt) / 1000),
          ...summary,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await db.destroy();
  }
}

if (process.argv[1]?.endsWith("load-standard-species.ts") === true) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        class: "standard_species_load_error",
        detail: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
