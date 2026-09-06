/**
 * Attach registered cultivars and breeds to their species (OVE-395).
 *
 * The importers call the same pass at the end of a run; this entry point is
 * for the loopback rehearsal and for the rows that landed in production before
 * the pass existed. It writes only graph rows — a `form_of` relation, a
 * denomination, an identifier, a registration fact and a form slug — and never
 * touches the source layer it reads.
 *
 * From `apps/web`:
 *
 *   pnpm exec tsx scripts/attach-register-forms.ts --source ua-state-register
 *   pnpm exec tsx scripts/attach-register-forms.ts --source all --limit 500
 *   pnpm exec tsx scripts/attach-register-forms.ts --source all \
 *     --environment production --confirm-environment production \
 *     --allow-non-local-mutation
 *
 * The production flags are the ones every importer in this repository already
 * takes, and they are checked the same way: a non-local database without them
 * is refused before a row is read.
 */
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import {
  REGISTER_SOURCE_SLUGS,
  attachRegisterFormsToSpecies,
  type RegisterSourceSlug,
} from "../src/server/catalog-source/register-graph-attachment";

export interface AttachRegisterFormsArgs {
  sources: readonly RegisterSourceSlug[];
  limit: number;
  environment: "local" | "production";
  confirmEnvironment: "local" | "production";
  allowNonLocalMutation: boolean;
}

export function parseAttachRegisterFormsArgs(
  argv: readonly string[],
): AttachRegisterFormsArgs {
  const valueFor = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const source = valueFor("--source") ?? "all";
  const sources =
    source === "all"
      ? [...REGISTER_SOURCE_SLUGS]
      : source.split(",").map((value) => value.trim());
  for (const value of sources) {
    if (!(REGISTER_SOURCE_SLUGS as readonly string[]).includes(value)) {
      throw new Error(`attach_unknown_source:${value}`);
    }
  }
  const limitArgument = valueFor("--limit");
  const limit = limitArgument ? Number(limitArgument) : 100_000;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error("attach_limit_invalid");
  }
  const environment = valueFor("--environment") ?? "local";
  const confirmEnvironment = valueFor("--confirm-environment") ?? environment;
  if (environment !== "local" && environment !== "production") {
    throw new Error("attach_environment_invalid");
  }
  if (confirmEnvironment !== environment) {
    throw new Error("attach_environment_not_confirmed");
  }
  return {
    sources: sources as RegisterSourceSlug[],
    limit,
    environment,
    confirmEnvironment,
    allowNonLocalMutation: argv.includes("--allow-non-local-mutation"),
  };
}

/** Loopback unless the operator said production out loud, twice and by flag. */
export function assertAttachEnvironment(
  args: AttachRegisterFormsArgs,
  connectionString: string,
): { databaseHost: "loopback" | "remote" } {
  const host = new URL(connectionString).hostname;
  const loopback = new Set(["127.0.0.1", "localhost", "::1"]).has(host);
  if (loopback) {
    if (args.environment !== "local")
      throw new Error("attach_local_database_refused");
    return { databaseHost: "loopback" };
  }
  if (args.environment !== "production" || !args.allowNonLocalMutation) {
    throw new Error("attach_non_local_mutation_refused");
  }
  return { databaseHost: "remote" };
}

async function main() {
  const args = parseAttachRegisterFormsArgs(process.argv.slice(2));
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("attach_database_url_missing");
  const { databaseHost } = assertAttachEnvironment(args, connectionString);

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    const summaries = [];
    for (const sourceSlug of args.sources) {
      summaries.push(
        await attachRegisterFormsToSpecies(
          { sourceSlug, limit: args.limit },
          db,
        ),
      );
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          class: "register_form_attachment",
          environment: args.environment,
          databaseHost,
          summaries,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await db.destroy();
  }
}

const isEntrypoint =
  process.argv[1]?.endsWith("attach-register-forms.ts") === true;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        class: "register_form_attachment_error",
        errorClass:
          error instanceof Error &&
          /^[a-z0-9_]+(?::[a-z0-9_-]+)?$/u.test(error.message)
            ? error.message
            : "unknown_error",
        detail: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
