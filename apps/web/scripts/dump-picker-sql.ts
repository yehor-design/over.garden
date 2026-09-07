import "./neutralise-server-only";

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
const compiled = buildCatalogTypeaheadStatement({
  normalizedQuery: process.argv[2] ?? "том",
  locale: "uk",
  objectKind: "plant",
  limit: 8,
}).compile(db);
process.stdout.write(
  JSON.stringify({ sql: compiled.sql, parameters: compiled.parameters }, null, 2),
);
