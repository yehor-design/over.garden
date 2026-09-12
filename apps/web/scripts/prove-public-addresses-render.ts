/**
 * Fetches every published address and asserts the page itself came back.
 *
 * `OVE-428` moved entries and object passports under their authors and proved
 * the move with `curl -sI`: all eleven old addresses `308`, all eleven new ones
 * `200`. Every one of those numbers was right, and every object passport was
 * serving the not-found page inside that `200` — for a day, until this script
 * existed. A status line cannot see it: the proxy decides the status from its
 * own bounded lookup (ADR-0029 D3), answers `200` because the address is real,
 * and the shell streams before the page runs, so a `notFound()` afterwards
 * changes nothing a header can carry.
 *
 * So this reads the body. For each address it asserts the response is `200`,
 * that the page's own heading is in the HTML, and that the surface carries its
 * JSON-LD (ADR-0029 D13) — three facts that are only true when the page
 * rendered.
 *
 * Read-only against the database, one bounded statement, and plain `GET`s
 * against the site. Point it at any deployment:
 *
 *   pnpm exec tsx scripts/prove-public-addresses-render.ts \
 *     --env-file /abs/path/prod.env --base-url https://over.garden
 */
import "./neutralise-server-only";

import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import {
  publicJournalEntryPath,
  publicObjectPassportPath,
  publicProfileBasePath,
} from "../src/lib/garden/public-paths";
import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";

interface Address {
  readonly kind: "profile" | "entry" | "passport";
  readonly path: string;
  readonly name: string;
}

interface Result extends Address {
  readonly status: number;
  readonly bytes: number;
  readonly heading: string | null;
  readonly jsonLdBlocks: number;
  readonly ok: boolean;
  readonly why: string | null;
}

function valueFor(argv: readonly string[], flag: string) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

export async function listPublishedAddresses(
  db: Kysely<Database>,
): Promise<Address[]> {
  const entries = await sql<{
    handle: string;
    slug: string;
    title: string;
  }>`
    select
      handles.normalized_handle as handle,
      entries.public_slug as slug,
      entries.title as title
    from journal_entries as entries
    join user_handle_registry as handles
      on handles.user_id = entries.owner_user_id
     and handles.lifecycle_state = 'current'
    where entries.visibility = 'public'
      and entries.lifecycle_state = 'active'
      and entries.public_slug is not null
    order by entries.published_at desc
  `.execute(db);

  const passports = await sql<{
    handle: string;
    slug: string;
    name: string;
  }>`
    select
      handles.normalized_handle as handle,
      objects.public_slug as slug,
      objects.display_name as name
    from plant_objects as objects
    join user_handle_registry as handles
      on handles.user_id = objects.owner_user_id
     and handles.lifecycle_state = 'current'
    where objects.public_slug is not null
    order by objects.created_at asc
  `.execute(db);

  const handles = new Set<string>();
  for (const row of entries.rows) handles.add(row.handle);
  for (const row of passports.rows) handles.add(row.handle);

  return [
    ...[...handles].map((handle) => ({
      kind: "profile" as const,
      path: publicProfileBasePath(handle),
      name: `@${handle}`,
    })),
    ...entries.rows.map((row) => ({
      kind: "entry" as const,
      path: publicJournalEntryPath(row.handle, row.slug),
      name: row.title,
    })),
    ...passports.rows.map((row) => ({
      kind: "passport" as const,
      path: publicObjectPassportPath(row.handle, row.slug),
      name: row.name,
    })),
  ];
}

/**
 * A page rendered, as opposed to a shell that apologised.
 *
 * The heading is the page's own `h1`; the not-found page has one too, so its
 * text is compared against the surface the address names rather than merely
 * counted. The JSON-LD is the second half: an indexable public surface carries
 * a graph, and the not-found page carries none.
 */
export function judgeRenderedPage(
  address: Address,
  status: number,
  html: string,
): Result {
  const heading =
    /<h1[^>]*>([\s\S]*?)<\/h1>/u
      .exec(html)?.[1]
      ?.replace(/<[^>]+>/gu, "")
      .trim() ?? null;
  const jsonLdBlocks = (
    html.match(/type="application\/ld\+json"/gu) ?? []
  ).length;

  const why =
    status !== 200
      ? `status ${status}`
      : heading === null
        ? "no heading in the HTML"
        : jsonLdBlocks === 0
          ? "no JSON-LD on an indexable surface"
          : null;

  return {
    ...address,
    status,
    bytes: html.length,
    heading,
    jsonLdBlocks,
    ok: why === null,
    why,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const envFile = valueFor(argv, "--env-file");
  const baseUrl = (valueFor(argv, "--base-url") ?? "https://over.garden").replace(
    /\/+$/u,
    "",
  );
  if (envFile) loadEnv({ path: envFile, override: true });
  else loadEnv({ path: ".env.local", quiet: true });
  if (process.env.DATABASE_SSL_CA) process.env.DATABASE_SSL = "true";

  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("public_addresses_database_url_missing");

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
    connectionTimeoutMillis: 15_000,
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  let addresses: Address[] = [];
  try {
    await db.connection().execute(async (connection) => {
      await sql`begin read only`.execute(connection);
      await sql`set local statement_timeout = '30s'`.execute(connection);
      addresses = await listPublishedAddresses(connection as never);
      await sql`rollback`.execute(connection);
    });
  } finally {
    await db.destroy().catch(() => undefined);
  }

  const results: Result[] = [];
  for (const address of addresses) {
    const response = await fetch(`${baseUrl}${address.path}`, {
      redirect: "follow",
      headers: { "user-agent": "overgarden-address-render-proof" },
    });
    results.push(
      judgeRenderedPage(address, response.status, await response.text()),
    );
  }

  const failures = results.filter((result) => !result.ok);
  console.log(
    JSON.stringify(
      {
        schemaVersion: "overgarden.addressRenderProof.v1",
        baseUrl,
        checked: results.length,
        failed: failures.length,
        byKind: {
          profile: results.filter((r) => r.kind === "profile").length,
          entry: results.filter((r) => r.kind === "entry").length,
          passport: results.filter((r) => r.kind === "passport").length,
        },
        failures: failures.map((result) => ({
          kind: result.kind,
          path: result.path,
          name: result.name,
          status: result.status,
          bytes: result.bytes,
          heading: result.heading,
          why: result.why,
        })),
      },
      null,
      2,
    ),
  );
  if (failures.length > 0) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("prove-public-addresses-render.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
