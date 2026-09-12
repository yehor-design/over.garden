/**
 * Generated from src/lib/address/address-manifest.ts. Do not edit.
 *
 * Regenerate with `pnpm address:contract:build` from apps/web;
 * `pnpm address:contract:check` fails when this file and the manifest
 * disagree, the same way `db:types:check` guards `src/db/generated.ts`.
 */
import type { AddressNamespace } from "@/lib/address/address-manifest";

export const ADDRESS_CONTRACT_SCHEMA = "overgarden.addressContract.v1";
export const ADDRESS_CONTRACT_MANIFEST_VERSION = "ove425.address.v1";

/** The pattern source, identical to the one the SQL `CHECK` holds. */
export const ADDRESS_SLUG_PATTERN_SOURCE: Readonly<
  Record<AddressNamespace, string>
> = {
  species: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
  form: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
  journalEntry: "^[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+(?:-[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+)*$",
  object: "^[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+(?:-[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+)*$",
  topic: "^[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+(?:-[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+)*$",
  community: "^[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+(?:-[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+)*$",
  profileHandle: "^[a-z0-9][a-z0-9_]{2,29}$",
};

/** What the column admits, which is not the budget — see the manifest. */
export const ADDRESS_SLUG_MAX_CHARACTERS: Readonly<
  Record<AddressNamespace, number>
> = {
  species: 96,
  form: 96,
  journalEntry: 96,
  object: 96,
  topic: 64,
  community: 64,
  profileHandle: 30,
};

export const ADDRESS_SLUG_BUDGETS: Readonly<
  Record<
    AddressNamespace,
    { readonly decodedCharacters: number; readonly encodedCharacters: number }
  >
> = {
  species: { decodedCharacters: 60, encodedCharacters: 180 },
  form: { decodedCharacters: 60, encodedCharacters: 180 },
  journalEntry: { decodedCharacters: 60, encodedCharacters: 180 },
  object: { decodedCharacters: 60, encodedCharacters: 180 },
  topic: { decodedCharacters: 60, encodedCharacters: 180 },
  community: { decodedCharacters: 60, encodedCharacters: 180 },
  profileHandle: { decodedCharacters: 30, encodedCharacters: 30 },
};

export const ADDRESS_RESERVED_WORDS: Readonly<
  Record<AddressNamespace, readonly string[]>
> = {
  species: [],
  form: ["register"],
  journalEntry: ["objects"],
  object: [],
  topic: [],
  community: [],
  profileHandle: [],
};

export const ADDRESS_SLUG_CHECK_SQL: Readonly<Record<string, string>> = {
  "catalog_items_public_slug_check": "do $$\nbegin\n  if exists (\n    select 1\n    from pg_constraint\n    where conname = 'catalog_items_public_slug_check'\n      and conrelid = 'catalog_items'::regclass\n  ) then\n    alter table catalog_items\n      drop constraint catalog_items_public_slug_check;\n  end if;\n\n  alter table catalog_items\n    add constraint catalog_items_public_slug_check\n    check (\n      public_slug is null\n      or (\n        char_length(public_slug) between 1 and 96\n        and public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'\n      )\n    );\nend $$;",
  "communities_slug_check": "do $$\nbegin\n  if exists (\n    select 1\n    from pg_constraint\n    where conname = 'communities_slug_check'\n      and conrelid = 'communities'::regclass\n  ) then\n    alter table communities\n      drop constraint communities_slug_check;\n  end if;\n\n  alter table communities\n    add constraint communities_slug_check\n    check (\n      char_length(slug) between 1 and 64\n      and slug ~ '^[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+(?:-[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+)*$'\n    );\nend $$;",
  "journal_entries_public_slug_check": "do $$\nbegin\n  if exists (\n    select 1\n    from pg_constraint\n    where conname = 'journal_entries_public_slug_check'\n      and conrelid = 'journal_entries'::regclass\n  ) then\n    alter table journal_entries\n      drop constraint journal_entries_public_slug_check;\n  end if;\n\n  alter table journal_entries\n    add constraint journal_entries_public_slug_check\n    check (\n      public_slug is null\n      or (\n        char_length(public_slug) between 1 and 96\n        and public_slug ~ '^[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+(?:-[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+)*$'\n      )\n    );\nend $$;",
  "journal_topics_slug_check": "do $$\nbegin\n  if exists (\n    select 1\n    from pg_constraint\n    where conname = 'journal_topics_slug_check'\n      and conrelid = 'journal_topics'::regclass\n  ) then\n    alter table journal_topics\n      drop constraint journal_topics_slug_check;\n  end if;\n\n  alter table journal_topics\n    add constraint journal_topics_slug_check\n    check (\n      char_length(slug) between 1 and 64\n      and slug ~ '^[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+(?:-[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+)*$'\n    );\nend $$;",
  "plant_objects_public_slug_check": "do $$\nbegin\n  if exists (\n    select 1\n    from pg_constraint\n    where conname = 'plant_objects_public_slug_check'\n      and conrelid = 'plant_objects'::regclass\n  ) then\n    alter table plant_objects\n      drop constraint plant_objects_public_slug_check;\n  end if;\n\n  alter table plant_objects\n    add constraint plant_objects_public_slug_check\n    check (\n      public_slug is null\n      or (\n        char_length(public_slug) between 1 and 96\n        and public_slug ~ '^[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+(?:-[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+)*$'\n      )\n    );\nend $$;",
};

export const BANNED_ADDRESS_PATH_LITERALS: readonly {
  readonly literal: string;
  readonly builders: readonly string[];
}[] = [
  { literal: "/@", builders: ["publicJournalEntryPath", "publicObjectPassportPath", "publicProfileBasePath"] },
  { literal: "/breed/", builders: ["publicCatalogEvidencePath"] },
  { literal: "/communities/", builders: ["publicCommunityPath"] },
  { literal: "/journal/", builders: ["publicJournalEntryPath"] },
  { literal: "/lineage/objects/", builders: ["publicObjectPassportPath"] },
  { literal: "/species/", builders: ["publicCatalogEvidencePath"] },
  { literal: "/topics/", builders: ["publicTopicPath"] },
  { literal: "/variety/", builders: ["publicCatalogEvidencePath"] },
];

/** Prefixes under which every following segment is already lower case. */
export const ADDRESS_LOWER_CASE_PATH_PREFIXES: readonly {
  readonly prefix: string;
  readonly namespaces: readonly AddressNamespace[];
}[] = [
  { prefix: "/lineage/objects/", namespaces: ["object"] },
  { prefix: "/communities/", namespaces: ["community"] },
  { prefix: "/species/", namespaces: ["species", "form"] },
  { prefix: "/variety/", namespaces: ["form"] },
  { prefix: "/journal/", namespaces: ["journalEntry"] },
  { prefix: "/topics/", namespaces: ["topic"] },
  { prefix: "/breed/", namespaces: ["form"] },
  { prefix: "/@", namespaces: ["journalEntry", "object", "profileHandle"] },
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
