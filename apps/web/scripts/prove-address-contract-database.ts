/**
 * Executes the address law's database half instead of compiling it.
 *
 * A slug pattern is exactly the kind of thing that reads correctly and behaves
 * otherwise, and this repository has the receipts. Migration `0067` was
 * written with `\p{Cyrillic}` in it; Postgres regexes are POSIX-derived, not
 * PCRE, so that class matches the literal letters `p`, `{`, `C` … and would
 * have classified every journal entry as Bulgarian **without erroring**. A
 * bracket range like `а-я` has the same shape of problem: inside a bracket
 * expression a range is interpreted in the database's collation, not in
 * code-point order, and this database collates `en_US.UTF-8`.
 *
 * So the generated `CHECK` is run against a real Postgres and given rows to
 * refuse. Every case below is one the JavaScript guard already decides; the
 * point is that the database decides it the same way.
 *
 * It builds its own disposable database and drops it, so it never writes to
 * the database whose connection string it borrows.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import { isAddressSlug } from "../src/lib/address/address-contract.generated";
import {
  buildAddressContractDocument,
  renderConstraintSql,
} from "./build-address-contract";

/**
 * One table per namespace that has a column, with only the slug column on it.
 * The proof is about the constraint, not about the tables it will live on, and
 * a stand-in keeps it independent of every unrelated migration.
 */
const STAND_IN_TABLES = `
  create table catalog_items (public_slug text);
  create table journal_entries (public_slug text);
  create table plant_objects (public_slug text);
  create table journal_topics (slug text not null);
  create table communities (slug text not null);
`;

interface SlugCase {
  readonly value: string;
  readonly expect: "accepted" | "refused";
  readonly why: string;
}

/** Cases every `native` namespace must decide identically. */
const NATIVE_CASES: readonly SlugCase[] = [
  {
    value: "полив-без-календарної-пастки",
    expect: "accepted",
    why: "the Ukrainian entry title this whole slice is named after, ї intact",
  },
  {
    value: "кратък-и-отговорен-запис",
    expect: "accepted",
    why: "Bulgarian prose, ъ and all",
  },
  {
    value: "наблюдение-действие",
    expect: "accepted",
    why: "й survives, so one word stays one word",
  },
  { value: "ёлка-и-ъ", expect: "accepted", why: "Russian ё" },
  { value: "solanum-lycopersicum", expect: "accepted", why: "plain ASCII" },
  { value: "томат-2", expect: "accepted", why: "the collision counter's shape" },
  {
    value: "Полив",
    expect: "refused",
    why: "upper case is a second address for the same page",
  },
  { value: "-полив", expect: "refused", why: "leading hyphen" },
  { value: "полив-", expect: "refused", why: "trailing hyphen" },
  { value: "полив--без", expect: "refused", why: "doubled hyphen" },
  { value: "полив плюс", expect: "refused", why: "a space" },
  {
    value: "полив/плюс",
    expect: "refused",
    why: "a slash escapes the route segment",
  },
  { value: "полив.json", expect: "refused", why: "a dot" },
  { value: "зав'язування", expect: "refused", why: "an apostrophe" },
  { value: "café-noir", expect: "refused", why: "an unfolded Latin diacritic" },
  {
    value: "й".normalize("NFD"),
    expect: "refused",
    why: "a decomposed й: the combining breve is not one of the thirty-seven",
  },
  { value: "", expect: "refused", why: "the empty string is not an address" },
];

/** The Latin namespaces refuse everything the native ones accept in Cyrillic. */
const LATIN_ONLY_REFUSALS: readonly SlugCase[] = [
  {
    value: "полив-без-календарної-пастки",
    expect: "refused",
    why: "a Latin namespace holds romanized names only",
  },
];

async function insert(
  pool: Pool,
  table: string,
  column: string,
  value: string,
) {
  await pool.query(`insert into ${table} (${column}) values ($1)`, [value]);
  await pool.query(`delete from ${table} where ${column} = $1`, [value]);
}

export async function runAddressContractDatabaseProof() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);

  const disposable = `overgarden_address_contract_${randomUUID().replaceAll("-", "")}`;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 1 });

  try {
    await pool.query(STAND_IN_TABLES);

    const document = buildAddressContractDocument();
    for (const definition of document.constraints) {
      await pool.query(renderConstraintSql(definition));
      // Replaying the same block must be a no-operation rather than a 42710,
      // because a migration that installs it is replayed on every bootstrap.
      await pool.query(renderConstraintSql(definition));
    }

    const failures: string[] = [];
    let caseCount = 0;

    for (const definition of document.constraints) {
      const namespace = definition.namespaces[0]!;
      const script = document.namespaces.find(
        (entry) => entry.namespace === namespace,
      )!.script;
      const cases =
        script === "native"
          ? NATIVE_CASES
          : [
              ...NATIVE_CASES.filter((slugCase) =>
                /^[a-z0-9-]*$/u.test(slugCase.value),
              ),
              ...LATIN_ONLY_REFUSALS,
            ];

      for (const slugCase of cases) {
        caseCount += 1;
        const observed = await insert(
          pool,
          definition.table,
          definition.column,
          slugCase.value,
        )
          .then(() => "accepted" as const)
          .catch((error: unknown) =>
            // 23514 is check_violation. Anything else is a broken proof, not a
            // refused row, and must never read as a pass.
            error instanceof Error && "code" in error && error.code === "23514"
              ? ("refused" as const)
              : (`error:${(error as { code?: string }).code ?? "unknown"}` as const),
          );
        if (observed !== slugCase.expect) {
          failures.push(
            `${definition.constraint} ${JSON.stringify(slugCase.value)}: expected ${slugCase.expect}, got ${observed} (${slugCase.why})`,
          );
        }

        // The database and the guard have to agree, or one of them is the
        // address law and the other is a second opinion.
        const guard = isAddressSlug(
          namespace as Parameters<typeof isAddressSlug>[0],
          slugCase.value,
        )
          ? "accepted"
          : "refused";
        if (guard !== slugCase.expect) {
          failures.push(
            `isAddressSlug(${namespace}, ${JSON.stringify(slugCase.value)}): expected ${slugCase.expect}, got ${guard}`,
          );
        }
      }
    }

    // The length bound is the other half of the CHECK, and the only one that
    // needs a row longer than any title anybody would type.
    for (const definition of document.constraints) {
      caseCount += 1;
      const tooLong = "a".repeat(definition.maxCharacters + 1);
      const observed = await insert(
        pool,
        definition.table,
        definition.column,
        tooLong,
      )
        .then(() => "accepted" as const)
        .catch(() => "refused" as const);
      if (observed !== "refused") {
        failures.push(
          `${definition.constraint}: accepted ${definition.maxCharacters + 1} characters`,
        );
      }
    }

    // `0069` widens a column a gardener will write Cyrillic into, so its
    // rollback has to be honest about what it cannot undo. The migration's own
    // down file re-adds the ASCII constraint and lets Postgres validate it: a
    // Cyrillic topic makes that fail, which is correct — a schema change is
    // reversible exactly while nothing has used it, and transliterating or
    // deleting the row would take a public address or a gardener's tag away.
    caseCount += 1;
    await pool.query("insert into journal_topics (slug) values ('помідори')");
    const rollback = readFileSync(
      path.join(
        process.cwd(),
        "sql/rollback/0069_ove426_journal_topic_slug_check.down.sql",
      ),
      "utf8",
    );
    const rolledBack = await pool
      .query(rollback)
      .then(() => "accepted" as const)
      .catch((error: unknown) =>
        error instanceof Error && "code" in error && error.code === "23514"
          ? ("refused" as const)
          : (`error:${(error as { code?: string }).code ?? "unknown"}` as const),
      );
    if (rolledBack !== "refused") {
      failures.push(
        `0069 rollback: expected refused while a Cyrillic topic exists, got ${rolledBack}`,
      );
    }
    await pool.query("delete from journal_topics");
    const rolledBackClean = await pool
      .query(rollback)
      .then(() => "accepted" as const)
      .catch(
        (error: unknown) =>
          `error:${(error as { code?: string }).code ?? "unknown"}` as const,
      );
    caseCount += 1;
    if (rolledBackClean !== "accepted") {
      failures.push(
        `0069 rollback: expected accepted on an empty table, got ${rolledBackClean}`,
      );
    }

    return {
      schemaVersion: "overgarden.addressContractDatabaseProof.v1",
      status: failures.length === 0 ? "pass" : "fail",
      constraints: document.constraints.map(
        (definition) => definition.constraint,
      ),
      caseCount,
      failures,
    };
  } finally {
    await pool.end().catch(() => undefined);
    await admin
      .query(`drop database if exists "${disposable}" with (force)`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

async function main() {
  const receipt = await runAddressContractDatabaseProof();
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.status !== "pass") process.exitCode = 1;
}

if (process.argv[1]?.endsWith("prove-address-contract-database.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
