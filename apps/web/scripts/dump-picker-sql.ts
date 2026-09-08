import "./neutralise-server-only";

/**
 * Prints the picker's compiled statement and its parameters, so the query a
 * gardener's keystroke runs can be explained against a real database.
 *
 *   pnpm exec tsx scripts/dump-picker-sql.ts "том" > picker.json
 *
 * The statement is assembled by `buildCatalogTypeaheadStatement` out of five
 * CTEs and sixteen parameters; retyping it by hand to explain it is how a
 * measurement ends up describing a query nobody runs. Compiling it against a
 * dummy driver reaches no database and needs no environment.
 *
 * Written on 2026-09-07, when the route reported ~200 ms of server time and
 * the question was whether the statement or the connection was responsible.
 * It was the connection: the statement explains in 26 ms against production,
 * 8 of them planning. See the OVE-387 card for the full measurement.
 */

import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";

import { buildCatalogTypeaheadStatement } from "../src/server/catalog-repository";

const db = new Kysely<never>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (d) => new PostgresIntrospector(d),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});
// Optional second and third arguments: the reader's locale and the object
// kind, so a bg or an animal fixture query compiles the statement it actually
// runs. Without them the old defaults stand.
const localeArg = process.argv[3];
const kindArg = process.argv[4];
const compiled = buildCatalogTypeaheadStatement({
  normalizedQuery: process.argv[2] ?? "том",
  locale: localeArg === "bg" || localeArg === "ru" ? localeArg : "uk",
  objectKind: kindArg === "animal" ? "animal" : "plant",
  limit: 8,
}).compile(db);
process.stdout.write(
  JSON.stringify({ sql: compiled.sql, parameters: compiled.parameters }, null, 2),
);
