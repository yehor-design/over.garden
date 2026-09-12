/**
 * Builds every downstream copy of the address law from the one place that
 * declares it (ADR-0029 D12).
 *
 * The shape is `pnpm queue:contract:build`'s, for the same reason: a contract
 * that lives in several hand-written copies is a contract that will differ in
 * several. `pnpm address:contract:build` writes the JSON contract, the
 * TypeScript guard and the SQL `CHECK` expressions;
 * `pnpm address:contract:check` renders them in memory and fails when what is
 * on disk differs, so a regeneration is never optional.
 *
 * Migration `0068` carries one of those `CHECK` expressions as its own text,
 * because a migration must be reviewable as the statement it runs rather than
 * as a call into a generator. `src/lib/address/address-contract.test.ts`
 * asserts the two are identical, so the migration cannot drift from the
 * manifest either.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  ADDRESS_MANIFEST,
  ADDRESS_MANIFEST_VERSION,
  addressAlphabet,
  addressLowerCasePathPrefixes,
  addressSlugPattern,
  assertAddressManifestConsistency,
} from "../src/lib/address/address-manifest";

const WEB_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPOSITORY_ROOT = path.resolve(WEB_ROOT, "../..");

export const ADDRESS_CONTRACT_SCHEMA = "overgarden.addressContract.v1";

export const ADDRESS_CONTRACT_JSON_PATH = path.join(
  REPOSITORY_ROOT,
  "contracts/address/address.contract.v1.json",
);
export const ADDRESS_CONTRACT_SQL_PATH = path.join(
  REPOSITORY_ROOT,
  "contracts/address/address-slug-checks.generated.sql",
);
export const ADDRESS_CONTRACT_TYPESCRIPT_PATH = path.join(
  WEB_ROOT,
  "src/lib/address/address-contract.generated.ts",
);

export interface AddressConstraintDefinition {
  readonly constraint: string;
  readonly table: string;
  readonly column: string;
  readonly nullable: boolean;
  readonly maxCharacters: number;
  readonly pattern: string;
  readonly checkInstalledBy: string | null;
  readonly namespaces: readonly string[];
}

export function buildAddressContractDocument() {
  assertAddressManifestConsistency();

  const namespaces = ADDRESS_MANIFEST.map((entry) => ({
    namespace: entry.namespace,
    script: entry.script,
    shape: entry.shape,
    alphabet: addressAlphabet(entry),
    pattern: addressSlugPattern(entry),
    uniquenessScope: entry.uniquenessScope,
    budget: {
      decodedCharacters: entry.budget.decodedCharacters,
      encodedCharacters: entry.budget.encodedCharacters,
    },
    reservedWords: [...entry.reservedWords],
    source: entry.source,
    pathPrefix: entry.pathPrefix,
    pathBuilder: entry.pathBuilder,
    legacyPathPrefixes: [...entry.legacyPathPrefixes],
    storage: entry.storage
      ? {
          table: entry.storage.table,
          column: entry.storage.column,
          constraint: entry.storage.constraint,
          nullable: entry.storage.nullable,
          maxCharacters: entry.storage.maxCharacters,
          checkInstalledBy: entry.storage.checkInstalledBy,
        }
      : null,
    notes: entry.notes,
  }));

  return {
    schema: ADDRESS_CONTRACT_SCHEMA,
    manifestVersion: ADDRESS_MANIFEST_VERSION,
    namespaces,
    constraints: collectConstraints(),
    bannedPathLiterals: collectBannedPathLiterals(),
    lowerCasePathPrefixes: addressLowerCasePathPrefixes().map((entry) => ({
      prefix: entry.prefix,
      namespaces: [...entry.namespaces],
    })),
  };
}

/** One definition per column, even where two namespaces share it. */
function collectConstraints(): AddressConstraintDefinition[] {
  const byConstraint = new Map<string, AddressConstraintDefinition>();
  for (const entry of ADDRESS_MANIFEST) {
    if (!entry.storage) continue;
    const existing = byConstraint.get(entry.storage.constraint);
    if (existing) {
      byConstraint.set(entry.storage.constraint, {
        ...existing,
        namespaces: [...existing.namespaces, entry.namespace],
      });
      continue;
    }
    byConstraint.set(entry.storage.constraint, {
      constraint: entry.storage.constraint,
      table: entry.storage.table,
      column: entry.storage.column,
      nullable: entry.storage.nullable,
      maxCharacters: entry.storage.maxCharacters,
      pattern: addressSlugPattern(entry),
      checkInstalledBy: entry.storage.checkInstalledBy,
      namespaces: [entry.namespace],
    });
  }
  return [...byConstraint.values()].sort((left, right) =>
    left.constraint.localeCompare(right.constraint),
  );
}

/**
 * The literals no call site may spell, and the builder each one belongs to.
 *
 * A path written by hand is a path that cannot be moved: `OVE-428` renames two
 * of these and `OVE-429` renames a third, and every literal is a place the
 * rename has to be remembered. Two namespaces answering under one prefix name
 * both of their builders.
 */
function collectBannedPathLiterals() {
  const byPrefix = new Map<string, Set<string>>();
  for (const entry of ADDRESS_MANIFEST) {
    for (const prefix of [entry.pathPrefix, ...entry.legacyPathPrefixes]) {
      byPrefix.set(
        prefix,
        (byPrefix.get(prefix) ?? new Set<string>()).add(entry.pathBuilder),
      );
    }
  }
  return [...byPrefix.entries()]
    .map(([literal, builders]) => ({
      literal,
      builders: [...builders].sort(),
    }))
    .sort((left, right) => left.literal.localeCompare(right.literal));
}

function renderJson(
  document: ReturnType<typeof buildAddressContractDocument>,
): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * The `CHECK` expression for one column, as Postgres holds it.
 *
 * Idempotent by construction: the constraint is dropped when it exists and
 * added back, so replaying the migration on a database that already has it is
 * a no-operation rather than a `42710`. `char_length` bounds the decoded
 * length; the pattern already forbids a leading, trailing or doubled hyphen,
 * because it spells the separator between two non-empty runs rather than
 * admitting it anywhere.
 */
export function renderConstraintSql(
  definition: AddressConstraintDefinition,
): string {
  const body = `char_length(${definition.column}) between 1 and ${definition.maxCharacters}
        and ${definition.column} ~ '${definition.pattern}'`;
  const guarded = definition.nullable
    ? `${definition.column} is null
      or (
        ${body}
      )`
    : body.replace(/\n        /gu, "\n      ");
  return `do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = '${definition.constraint}'
      and conrelid = '${definition.table}'::regclass
  ) then
    alter table ${definition.table}
      drop constraint ${definition.constraint};
  end if;

  alter table ${definition.table}
    add constraint ${definition.constraint}
    check (
      ${guarded}
    );
end $$;`;
}

function renderSql(
  document: ReturnType<typeof buildAddressContractDocument>,
): string {
  const blocks = document.constraints
    .map(
      (definition) =>
        `-- ${definition.constraint} — ${definition.namespaces.join(", ")}\n-- ${
          definition.checkInstalledBy
            ? `installed by migration ${definition.checkInstalledBy}`
            : "declared only: no migration installs this block yet, and the column keeps the narrower CHECK it already has"
        }\n${renderConstraintSql(definition)}`,
    )
    .join("\n\n");
  return `-- Generated from apps/web/src/lib/address/address-manifest.ts. Do not edit.
--
-- Regenerate with \`pnpm address:contract:build\` from apps/web;
-- \`pnpm address:contract:check\` fails when this file and the manifest
-- disagree. A migration that installs one of these blocks copies its text
-- verbatim, and a test asserts the copy is identical.

${blocks}
`;
}

function typescriptString(value: string): string {
  return JSON.stringify(value);
}

function renderTypescript(
  document: ReturnType<typeof buildAddressContractDocument>,
): string {
  const patterns = document.namespaces
    .map(
      (entry) =>
        `  ${entry.namespace}: ${typescriptString(entry.pattern)},`,
    )
    .join("\n");
  const maxima = document.namespaces
    .map(
      (entry) =>
        `  ${entry.namespace}: ${entry.storage?.maxCharacters ?? entry.budget.decodedCharacters},`,
    )
    .join("\n");
  const budgets = document.namespaces
    .map(
      (entry) =>
        `  ${entry.namespace}: { decodedCharacters: ${entry.budget.decodedCharacters}, encodedCharacters: ${entry.budget.encodedCharacters} },`,
    )
    .join("\n");
  const reserved = document.namespaces
    .map(
      (entry) =>
        `  ${entry.namespace}: [${entry.reservedWords.map(typescriptString).join(", ")}],`,
    )
    .join("\n");
  const constraints = document.constraints
    .map(
      (definition) =>
        `  ${typescriptString(definition.constraint)}: ${typescriptString(renderConstraintSql(definition))},`,
    )
    .join("\n");
  const lowerCase = document.lowerCasePathPrefixes
    .map(
      (entry) =>
        `  { prefix: ${typescriptString(entry.prefix)}, namespaces: [${entry.namespaces.map(typescriptString).join(", ")}] },`,
    )
    .join("\n");
  const banned = document.bannedPathLiterals
    .map(
      (entry) =>
        `  { literal: ${typescriptString(entry.literal)}, builders: [${entry.builders
          .map(typescriptString)
          .join(", ")}] },`,
    )
    .join("\n");

  return `/**
 * Generated from src/lib/address/address-manifest.ts. Do not edit.
 *
 * Regenerate with \`pnpm address:contract:build\` from apps/web;
 * \`pnpm address:contract:check\` fails when this file and the manifest
 * disagree, the same way \`db:types:check\` guards \`src/db/generated.ts\`.
 */
import type { AddressNamespace } from "@/lib/address/address-manifest";

export const ADDRESS_CONTRACT_SCHEMA = ${typescriptString(document.schema)};
export const ADDRESS_CONTRACT_MANIFEST_VERSION = ${typescriptString(
    document.manifestVersion,
  )};

/** The pattern source, identical to the one the SQL \`CHECK\` holds. */
export const ADDRESS_SLUG_PATTERN_SOURCE: Readonly<
  Record<AddressNamespace, string>
> = {
${patterns}
};

/** What the column admits, which is not the budget — see the manifest. */
export const ADDRESS_SLUG_MAX_CHARACTERS: Readonly<
  Record<AddressNamespace, number>
> = {
${maxima}
};

export const ADDRESS_SLUG_BUDGETS: Readonly<
  Record<
    AddressNamespace,
    { readonly decodedCharacters: number; readonly encodedCharacters: number }
  >
> = {
${budgets}
};

export const ADDRESS_RESERVED_WORDS: Readonly<
  Record<AddressNamespace, readonly string[]>
> = {
${reserved}
};

export const ADDRESS_SLUG_CHECK_SQL: Readonly<Record<string, string>> = {
${constraints}
};

export const BANNED_ADDRESS_PATH_LITERALS: readonly {
  readonly literal: string;
  readonly builders: readonly string[];
}[] = [
${banned}
];

/** Prefixes under which every following segment is already lower case. */
export const ADDRESS_LOWER_CASE_PATH_PREFIXES: readonly {
  readonly prefix: string;
  readonly namespaces: readonly AddressNamespace[];
}[] = [
${lowerCase}
];

const COMPILED: Readonly<Record<AddressNamespace, RegExp>> = Object.fromEntries(
  Object.entries(ADDRESS_SLUG_PATTERN_SOURCE).map(([namespace, pattern]) => [
    namespace,
    new RegExp(pattern, "u"),
  ]),
) as Record<AddressNamespace, RegExp>;

/** The one guard: shape and length, from the same declaration as the CHECK. */
export function isAddressSlug(
  namespace: AddressNamespace,
  value: unknown,
): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0) return false;
  if ([...value].length > ADDRESS_SLUG_MAX_CHARACTERS[namespace]) return false;
  return COMPILED[namespace].test(value);
}

/** A slug a route segment already owns. Taken, not invalid — see slugify.ts. */
export function isReservedAddressSlug(
  namespace: AddressNamespace,
  value: string,
): boolean {
  return ADDRESS_RESERVED_WORDS[namespace].includes(value);
}
`;
}

export function renderAddressContractArtifacts() {
  const document = buildAddressContractDocument();
  return {
    document,
    files: [
      { path: ADDRESS_CONTRACT_JSON_PATH, contents: renderJson(document) },
      { path: ADDRESS_CONTRACT_SQL_PATH, contents: renderSql(document) },
      {
        path: ADDRESS_CONTRACT_TYPESCRIPT_PATH,
        contents: renderTypescript(document),
      },
    ],
  };
}

async function main() {
  const check = process.argv.includes("--check");
  const { files } = renderAddressContractArtifacts();
  const stale: string[] = [];

  for (const file of files) {
    if (check) {
      const current = await readFile(file.path, "utf8").catch(() => null);
      if (current !== file.contents) {
        stale.push(path.relative(REPOSITORY_ROOT, file.path));
      }
      continue;
    }
    await mkdir(path.dirname(file.path), { recursive: true });
    await writeFile(file.path, file.contents, "utf8");
  }

  if (check && stale.length > 0) {
    console.error(
      `The address contract is stale in ${stale.length} file(s):\n${stale
        .map((name) => `  ${name}`)
        .join("\n")}\nRun \`pnpm address:contract:build\` and commit the result.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    check
      ? "address contract: generated artifacts match the manifest"
      : `address contract: wrote ${files.length} generated artifacts`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
