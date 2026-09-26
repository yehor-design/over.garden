/**
 * What the picker offers for the words gardeners type (OVE-530, ADR-0035 D3).
 *
 * Runs the picker's own statement — `buildCatalogTypeaheadStatement`, the one
 * `/api/public/catalog/typeahead` runs — for the 2026-09-25 probe words and
 * prints the first rows each returns, then times the picker's fingerprint
 * queries with every prefix from two characters up, as a gardener types them.
 * Everything runs in one read-only transaction; nothing is written, not even
 * a search miss.
 *
 * From `apps/web`:
 *
 *   pnpm exec tsx scripts/probe-standard-species.ts
 *   pnpm exec tsx scripts/probe-standard-species.ts \
 *     --env-file /abs/path/prod.env --environment production \
 *     --confirm-environment production
 *
 * The output is the before/after table of the task: run it before the base is
 * loaded and after, against the same database.
 */
import "./neutralise-server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import type { PlantObjectKind } from "../src/db/schema";
import type { PublicLocale } from "../src/lib/public-localization";
import {
  buildCatalogTypeaheadStatement,
  normalizeCatalogQuery,
} from "../src/server/catalog-repository";

/** The words of the 2026-09-25 production probe, and the rows each must find first. */
export const STANDARD_SPECIES_PROBE_WORDS: ReadonlyArray<{
  locale: PublicLocale;
  objectKind: PlantObjectKind;
  word: string;
}> = [
  ...[
    "помідор",
    "перець",
    "болгарський перець",
    "полуниця",
    "кабачок",
    "броколі",
    "троянда",
    "вишня",
    "картопля",
    "огірок",
  ].map((word) => ({
    locale: "uk" as const,
    objectKind: "plant" as const,
    word,
  })),
  ...["курка", "коза", "кролик", "собака", "папуга"].map((word) => ({
    locale: "uk" as const,
    objectKind: "animal" as const,
    word,
  })),
  ...["домат", "пипер", "ягода", "тиквичка"].map((word) => ({
    locale: "bg" as const,
    objectKind: "plant" as const,
    word,
  })),
  { locale: "bg", objectKind: "animal", word: "кокошка" },
  ...["помидор", "перец", "клубника", "кабачок"].map((word) => ({
    locale: "ru" as const,
    objectKind: "plant" as const,
    word,
  })),
  { locale: "ru", objectKind: "animal", word: "курица" },
];

interface ProbeArgs {
  envFile: string | undefined;
  environment: "local" | "production";
  rows: number;
}

export function parseProbeArgs(argv: readonly string[]): ProbeArgs {
  const valueFor = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const environment = valueFor("--environment") ?? "local";
  if (environment !== "local" && environment !== "production") {
    throw new Error("probe_environment_invalid");
  }
  if ((valueFor("--confirm-environment") ?? environment) !== environment) {
    throw new Error("probe_environment_not_confirmed");
  }
  const rows = Number(valueFor("--rows") ?? 3);
  if (!Number.isSafeInteger(rows) || rows < 1 || rows > 8)
    throw new Error("probe_rows_invalid");
  return { envFile: valueFor("--env-file"), environment, rows };
}

function fingerprintQueries() {
  const contract = JSON.parse(
    readFileSync(
      path.join(
        process.cwd(),
        "..",
        "..",
        "contracts",
        "catalog",
        "typeahead-fingerprint-queries.json",
      ),
      "utf8",
    ),
  ) as {
    queries: Array<{ locale: string; query: string; objectKind?: string }>;
  };
  const expanded: Array<{
    query: string;
    locale: PublicLocale;
    objectKind: PlantObjectKind;
  }> = [];
  for (const entry of contract.queries) {
    const locale =
      entry.locale === "bg" || entry.locale === "ru" ? entry.locale : "uk";
    const objectKind = entry.objectKind === "animal" ? "animal" : "plant";
    const characters = Array.from(entry.query);
    for (let length = 2; length <= characters.length; length += 1) {
      expanded.push({
        query: characters.slice(0, length).join(""),
        locale,
        objectKind,
      });
    }
  }
  return expanded;
}

function percentile(values: number[], share: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)] ??
    0
  );
}

async function main() {
  const args = parseProbeArgs(process.argv.slice(2));
  if (args.envFile) loadEnv({ path: args.envFile, override: true });
  if (process.env.DATABASE_SSL_CA) process.env.DATABASE_SSL = "true";
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("probe_database_url_missing");
  const host = new URL(connectionString).hostname;
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(host);
  if (loopback !== (args.environment === "local"))
    throw new Error("probe_environment_mismatch");

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  try {
    const report = await db.transaction().execute(async (trx) => {
      await sql`set transaction read only`.execute(trx);
      await sql`set local statement_timeout = '5s'`.execute(trx);
      const probes = [];
      for (const probe of STANDARD_SPECIES_PROBE_WORDS) {
        const statement = buildCatalogTypeaheadStatement({
          normalizedQuery: normalizeCatalogQuery(probe.word),
          locale: probe.locale,
          objectKind: probe.objectKind,
        });
        const rows = (await statement.execute(trx)).rows.slice(0, args.rows);
        probes.push({
          ...probe,
          rows: rows.map((row) =>
            [
              row.display_name,
              row.node_kind === "taxon" ? null : row.node_kind,
              row.parent_display_name ? `← ${row.parent_display_name}` : null,
            ]
              .filter(Boolean)
              .join(" "),
          ),
        });
      }
      const timings: number[] = [];
      for (const entry of fingerprintQueries()) {
        const statement = buildCatalogTypeaheadStatement({
          normalizedQuery: normalizeCatalogQuery(entry.query),
          locale: entry.locale,
          objectKind: entry.objectKind,
        });
        const startedAt = performance.now();
        await statement.execute(trx);
        timings.push(performance.now() - startedAt);
      }
      return {
        probes,
        latency: {
          queries: timings.length,
          p50Ms: Math.round(percentile(timings, 0.5)),
          p95Ms: Math.round(percentile(timings, 0.95)),
          maxMs: Math.round(Math.max(...timings)),
        },
      };
    });
    process.stdout.write(
      `${JSON.stringify({ class: "standard_species_probe", environment: args.environment, ...report }, null, 1)}\n`,
    );
  } finally {
    await db.destroy();
  }
}

if (process.argv[1]?.endsWith("probe-standard-species.ts") === true) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        class: "standard_species_probe_error",
        detail: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
