import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const VERSIONED_SQL_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;

export interface VersionedApplicationSql {
  name: string;
  sql: string;
}

export async function loadVersionedApplicationSql(
  sqlDirectory: string,
): Promise<VersionedApplicationSql[]> {
  const names = (await readdir(sqlDirectory))
    .filter((name) => VERSIONED_SQL_FILE.test(name))
    .sort((left, right) => left.localeCompare(right, "en"));
  if (names[0] !== "0001_walking_skeleton.sql") {
    throw new Error("Versioned application SQL must start with 0001.");
  }
  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await readFile(path.join(sqlDirectory, name), "utf8"),
    })),
  );
}
