/**
 * The address manifest: every slug namespace, declared once (ADR-0029 D12).
 *
 * Before this file the repository held five slug generators. Two of them
 * decomposed the text with `NFKD` and stripped the combining marks, which is
 * how `календарної` became `календарноі` — `ї` is `і` plus a diaeresis, the
 * diaeresis is a combining mark, and `й` loses its breve the same way. Two
 * appended a hash or a register's application number. None of them agreed on
 * a length, a character set, or what to do with an apostrophe, and the SQL
 * `CHECK` that was supposed to catch the difference existed on three of the
 * four slug columns and said something different on each.
 *
 * This module is the sole declaration. `pnpm address:contract:build` renders
 * it into the TypeScript guard, the SQL `CHECK` expressions and the
 * banned-literal rule, the way `job-queue-manifest.ts` and
 * `pnpm queue:contract:build` already do; `pnpm address:contract:check` fails
 * when what is on disk differs. Nothing downstream restates a pattern, a
 * budget or a reserved word.
 */

export const ADDRESS_MANIFEST_VERSION = "ove425.address.v1";

/**
 * `latin` romanizes the source before slugifying; `native` keeps the
 * gardener's own alphabet (ADR-0029 D4). The distinction is about whose words
 * the slug is made of, not about who reads it: a scientific name and a
 * registered denomination are Latin by definition, and an entry title, an
 * object name, a tag and a community name are the author's own.
 */
export type AddressScript = "latin" | "native";

/**
 * Where a slug has to be unique. `perSpecies` is ADR-0029 D7: two cultivars
 * called *Advance* under different species are two different organisms and
 * both keep the name. `perAuthorHandle` is what makes `/@{handle}/{slug}`
 * possible — the handle is already unique, so the pair is.
 */
export type AddressUniquenessScope = "global" | "perSpecies" | "perAuthorHandle";

/**
 * `hyphenated` is `word-word-word` over the namespace's alphabet: no leading,
 * trailing or doubled hyphen, because the pattern spells the separator
 * between two non-empty runs rather than admitting it anywhere.
 * `handle` is the profile handle's own older shape, which uses `_` and has a
 * minimum length.
 */
export type AddressSlugShape = "hyphenated" | "handle";

/**
 * Every lower-case Cyrillic letter the three interface languages write, in
 * code-point order: U+0430–U+044F, then `ё`, `є`, `і`, `ї`, `ґ`.
 *
 * Spelled out rather than written as the range `а-я`, because a range inside a
 * bracket expression is interpreted in the database's collation rather than in
 * code-point order, and this database's collation is `en_US.UTF-8` — a range
 * is not a promise the generated `CHECK` can keep. Spelled out rather than
 * written as `[[:lower:]]`, too: that class is Unicode-correct in this
 * database (executed against production on 2026-09-11, where it accepts `ї`
 * and `ъ` and rejects `П`, `'`, `–` and a space), but it also admits every
 * other script's lower case, and the slugifier's output set is exactly this
 * one.
 *
 * `ъ` and `ы` and `э` are here because Russian is a real authoring language
 * (`BULGARIA_PUBLIC_LOCALES` is bg/ru) and `ъ` is ordinary Bulgarian prose.
 */
export const CYRILLIC_LOWERCASE_INVENTORY =
  "абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ";

/** The ASCII half every namespace admits. A proven-safe bracket range. */
export const LATIN_LOWERCASE_RANGE = "a-z0-9";

/**
 * The characters a slug of each script may contain, as a bracket expression
 * body. Both the JavaScript `RegExp` and the SQL `~` pattern are rendered
 * from this one string, so the two cannot drift apart.
 */
export const ADDRESS_ALPHABETS: Readonly<Record<AddressScript, string>> = {
  latin: LATIN_LOWERCASE_RANGE,
  native: `${LATIN_LOWERCASE_RANGE}${CYRILLIC_LOWERCASE_INVENTORY}`,
};

/**
 * The slug budget, measured after percent-encoding (ADR-0029 D5).
 *
 * Both bounds hold at once, so whichever binds first wins: an ASCII slug gets
 * sixty characters, and a Cyrillic one about thirty, because one Cyrillic
 * character costs six characters encoded. `OVE-377` is why the encoded half
 * exists — a capability token embedded a Cyrillic slug under the old
 * ninety-six-character rule, overflowed its own bound, and answered `500` on
 * seven of eight entries.
 */
export interface AddressBudget {
  readonly decodedCharacters: number;
  readonly encodedCharacters: number;
}

export const DEFAULT_ADDRESS_BUDGET: AddressBudget = {
  decodedCharacters: 60,
  encodedCharacters: 180,
};

/**
 * The column a namespace is stored in, and the bound the generated `CHECK`
 * enforces there.
 *
 * `maxCharacters` is deliberately not the budget. A `CHECK` has to admit the
 * rows the table already holds, and the slugs written before this manifest
 * existed run to ninety-six characters; the budget is a rule about what the
 * slugifier may *produce*, enforced by the slugifier and its tests. Narrowing
 * the column to the budget is `OVE-429`'s job, once the rows it refuses have
 * been moved.
 */
export interface AddressStorage {
  readonly table: string;
  readonly column: string;
  readonly constraint: string;
  readonly nullable: boolean;
  readonly maxCharacters: number;
  /**
   * The migration that installs the generated `CHECK` on this column, or
   * `null` while the column still carries an older, hand-written one.
   *
   * Recorded rather than left implicit because three of the four columns are
   * in exactly that state: the contract describes the shape the address law
   * wants, and the schema catches up one migration at a time. A block nobody
   * has installed says so in the generated SQL instead of reading as applied.
   */
  readonly checkInstalledBy: string | null;
}

export interface AddressNamespaceEntry {
  readonly namespace: AddressNamespace;
  readonly script: AddressScript;
  readonly shape: AddressSlugShape;
  readonly uniquenessScope: AddressUniquenessScope;
  readonly budget: AddressBudget;
  readonly reservedWords: readonly string[];
  /** What the base is made of, in one line, for the generated contract. */
  readonly source: string;
  /** The route prefix this namespace answers under, and who spells it. */
  readonly pathPrefix: string;
  readonly pathBuilder: string;
  /**
   * Older prefixes the same namespace still answers under, behind a 308.
   *
   * They are part of the address law even though nothing builds them any more:
   * a reader's bookmark and a crawler's index still carry them, so the case
   * rule and the banned-literal rule have to know about them too.
   */
  readonly legacyPathPrefixes: readonly string[];
  /** `null` while the namespace has no column of its own yet. */
  readonly storage: AddressStorage | null;
  readonly notes: string;
}

export type AddressNamespace =
  | "species"
  | "form"
  | "journalEntry"
  | "object"
  | "topic"
  | "community"
  | "profileHandle";

export const ADDRESS_NAMESPACES: readonly AddressNamespace[] = [
  "species",
  "form",
  "journalEntry",
  "object",
  "topic",
  "community",
  "profileHandle",
];

export const ADDRESS_MANIFEST: readonly AddressNamespaceEntry[] = [
  {
    namespace: "species",
    script: "latin",
    shape: "hyphenated",
    uniquenessScope: "global",
    budget: DEFAULT_ADDRESS_BUDGET,
    reservedWords: [],
    source: "the accepted scientific name, without authorship",
    pathPrefix: "/species/",
    pathBuilder: "publicCatalogEvidencePath",
    legacyPathPrefixes: [],
    storage: {
      table: "catalog_items",
      column: "public_slug",
      constraint: "catalog_items_public_slug_check",
      nullable: true,
      maxCharacters: 96,
      // 0001 held the same pattern without a length bound; migration `0071`
      // installs the generated one, after OVE-429 moved every address that a
      // register number or a digest had made longer than a name.
      checkInstalledBy: "0071",
    },
    notes:
      "Shares a column, a unique index and a history table with `form`: a bare /species/{slug} request is looked up in both, so one slug names one organism.",
  },
  {
    namespace: "form",
    script: "latin",
    shape: "hyphenated",
    // The *address* is per species — `/species/{species}/{form}`, ADR-0029 D7
    // — and the *name* is platform-unique, for the same reason the journal
    // entry's is (migration `0070`). `resolvePublicCatalogAddress` finds a
    // form by its slug alone, in `catalog_item_slug_history`, and only then
    // compares the requested path with the canonical one; the column and the
    // history table are both globally unique. Making the name ambiguous needs
    // the resolver to take the species first and both uniqueness keys to grow
    // a species column. Until then two cultivars named *Advance* under
    // different species get `advance` and `advance-2`, which is the counter
    // D6 prescribes — 1 228 of the 15 914 addresses moved in OVE-429 took one.
    uniquenessScope: "global",
    budget: DEFAULT_ADDRESS_BUDGET,
    reservedWords: [],
    source: "the registered denomination, romanized",
    pathPrefix: "/species/",
    pathBuilder: "publicCatalogEvidencePath",
    // A form answered at `/variety/{slug}` and a breed at `/breed/{slug}`
    // before ADR-0026 D8 gave them a species to live under. Both still 308.
    legacyPathPrefixes: ["/variety/", "/breed/"],
    storage: {
      table: "catalog_items",
      column: "public_slug",
      constraint: "catalog_items_public_slug_check",
      nullable: true,
      maxCharacters: 96,
      checkInstalledBy: "0071",
    },
    notes:
      "ADR-0029 D7. Two cultivars named Advance under different species both keep the name; within one species they are almost certainly the same cultivar from two registers, so the collision counter is a reconciliation signal (ADR-0026 D4).",
  },
  {
    namespace: "journalEntry",
    script: "native",
    shape: "hyphenated",
    // The *address* is author-scoped; the *name* is still platform-unique, and
    // migration `0070` says at length why. Three readers identify an entry by
    // its slug and nothing else — the engagement target ref a like is stored
    // against, the Meilisearch document id, and the proxy's bounded lookup —
    // and making the slug ambiguous before those move to the entry id would
    // let two gardeners' likes land on one row.
    uniquenessScope: "global",
    budget: DEFAULT_ADDRESS_BUDGET,
    // OVE-428 puts object passports at /@{handle}/objects/{slug}, so an entry
    // may never take `objects` from under its own author.
    reservedWords: ["objects"],
    source: "the entry title at first publish",
    // An entry lives under its author (ADR-0029 D9). `/journal/{slug}` was the
    // flat, global namespace that forced a random suffix into every URL.
    pathPrefix: "/@",
    pathBuilder: "publicJournalEntryPath",
    legacyPathPrefixes: ["/journal/"],
    storage: {
      table: "journal_entries",
      column: "public_slug",
      constraint: "journal_entries_public_slug_check",
      nullable: true,
      maxCharacters: 96,
      checkInstalledBy: "0068",
    },
    notes:
      "The only slug column that has never carried a CHECK; migration 0068 gave it one. Migration 0070 made the uniqueness per author and gave the namespace its history table, which is what let the publish-id suffix go.",
  },
  {
    namespace: "object",
    script: "native",
    shape: "hyphenated",
    uniquenessScope: "perAuthorHandle",
    budget: DEFAULT_ADDRESS_BUDGET,
    reservedWords: [],
    source: "the object display name",
    // `/@{handle}/objects/{slug}` (ADR-0029 D9). `/lineage/objects/{uuid}` put
    // a database identifier in a public URL and told a reader nothing.
    pathPrefix: "/@",
    pathBuilder: "publicObjectPassportPath",
    legacyPathPrefixes: ["/lineage/objects/"],
    storage: {
      table: "plant_objects",
      column: "public_slug",
      constraint: "plant_objects_public_slug_check",
      nullable: true,
      maxCharacters: 96,
      checkInstalledBy: "0070",
    },
    notes:
      "A passport is addressed by slug from OVE-428. The column is nullable because a private object has no public address, and only an object with a public entry is given one.",
  },
  {
    namespace: "topic",
    script: "native",
    shape: "hyphenated",
    uniquenessScope: "global",
    budget: DEFAULT_ADDRESS_BUDGET,
    reservedWords: [],
    source: "the gardener's own tag label",
    pathPrefix: "/topics/",
    pathBuilder: "publicTopicPath",
    legacyPathPrefixes: [],
    storage: {
      table: "journal_topics",
      column: "slug",
      constraint: "journal_topics_slug_check",
      nullable: false,
      maxCharacters: 64,
      // OVE-426, migration 0069. Until then the column is ASCII-only and a
      // Cyrillic tag becomes a hash.
      checkInstalledBy: "0069",
    },
    notes:
      "The column's CHECK is still ASCII-only, which is why a Cyrillic tag becomes a hash today. OVE-426 widens it in migration 0069; this manifest already declares the shape it will widen to.",
  },
  {
    namespace: "community",
    script: "native",
    shape: "hyphenated",
    uniquenessScope: "global",
    budget: DEFAULT_ADDRESS_BUDGET,
    reservedWords: [],
    source: "the community name",
    pathPrefix: "/communities/",
    pathBuilder: "publicCommunityPath",
    legacyPathPrefixes: [],
    storage: {
      table: "communities",
      column: "slug",
      constraint: "communities_slug_check",
      nullable: false,
      maxCharacters: 64,
      // Nothing authors a community yet, so nothing needs the wider shape.
      checkInstalledBy: null,
    },
    notes:
      "Communities are seeded, not authored, so every slug is ASCII today; the namespace is native because the next one need not be.",
  },
  {
    namespace: "profileHandle",
    script: "latin",
    shape: "handle",
    uniquenessScope: "global",
    budget: { decodedCharacters: 30, encodedCharacters: 30 },
    reservedWords: [],
    source: "the gardener's chosen handle, unchanged",
    pathPrefix: "/@",
    pathBuilder: "publicProfileBasePath",
    legacyPathPrefixes: [],
    storage: null,
    notes:
      "Already `^[a-z0-9][a-z0-9_]{2,29}$` and validated where it is written. Declared here so the address law has no gap, not to change it.",
  },
];

/**
 * The bracket-expression body a namespace's characters come from. Rendering
 * both regexes from this is the whole point of the manifest: a pattern that
 * exists in two hand-written copies is a pattern that will differ in two.
 */
export function addressAlphabet(entry: AddressNamespaceEntry): string {
  return ADDRESS_ALPHABETS[entry.script];
}

/**
 * The pattern, as a string, in the one dialect both readers understand.
 *
 * Postgres regexes are advanced regular expressions, so `(?:…)` is a
 * non-capturing group there exactly as it is in JavaScript, and this single
 * rendering is what the guard and the `CHECK` both use. Nothing here uses a
 * Unicode property escape: `\p{…}` is PCRE, and in a Postgres regex it
 * matches the literal letters `p`, `{`, … without erroring.
 */
export function addressSlugPattern(entry: AddressNamespaceEntry): string {
  if (entry.shape === "handle") return "^[a-z0-9][a-z0-9_]{2,29}$";
  const alphabet = addressAlphabet(entry);
  return `^[${alphabet}]+(?:-[${alphabet}]+)*$`;
}

/**
 * Every prefix under which a segment must already be lower case, with the
 * namespace that owns it.
 *
 * Every alphabet in this manifest is lower case, so an upper-case address is
 * not a different page — it is the same page at a second address. Today
 * `/bg/topics/PLANTS` and `/bg/@YEHOR` both answer `200, index, follow`, and
 * `matchPublicCatalogAddressPath` says so out loud: it leaves an upper-case
 * slug "to the route families' catch-alls", and a catch-all under Cache
 * Components answers 200 with a `noindex` body rather than a 404.
 */
export function addressLowerCasePathPrefixes(): readonly {
  readonly prefix: string;
  readonly namespaces: readonly AddressNamespace[];
}[] {
  const byPrefix = new Map<string, AddressNamespace[]>();
  for (const entry of ADDRESS_MANIFEST) {
    for (const prefix of [entry.pathPrefix, ...entry.legacyPathPrefixes]) {
      byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), entry.namespace]);
    }
  }
  // Longest first, so `/lineage/objects/` is tested before nothing else would
  // match it, and `/@` — which three namespaces share — is tested last.
  return [...byPrefix.entries()]
    .sort((left, right) => right[0].length - left[0].length)
    .map(([prefix, namespaces]) => ({ prefix, namespaces }));
}

export function addressManifestEntry(
  namespace: AddressNamespace,
): AddressNamespaceEntry {
  const entry = ADDRESS_MANIFEST.find(
    (candidate) => candidate.namespace === namespace,
  );
  if (!entry) throw new Error(`No address namespace ${namespace}.`);
  return entry;
}

/**
 * Every namespace is declared once, every storage binding names a
 * conventionally shaped constraint Postgres can hold, and two namespaces that
 * share a column agree about it. Called by the builder before it renders
 * anything, the way `assertMatchingQueueConsistency` guards the queue
 * contract.
 */
export function assertAddressManifestConsistency(): void {
  const declared = ADDRESS_MANIFEST.map((entry) => entry.namespace);
  for (const namespace of ADDRESS_NAMESPACES) {
    if (declared.filter((value) => value === namespace).length !== 1) {
      throw new Error(`Address namespace ${namespace} is not declared once.`);
    }
  }
  for (const namespace of declared) {
    if (!ADDRESS_NAMESPACES.includes(namespace)) {
      throw new Error(`Address namespace ${namespace} is not in the set.`);
    }
  }

  const byConstraint = new Map<string, AddressNamespaceEntry[]>();
  for (const entry of ADDRESS_MANIFEST) {
    if (!entry.storage) continue;
    const { constraint, table, column } = entry.storage;
    if (!/^[a-z0-9_]+_check$/u.test(constraint)) {
      throw new Error(`Constraint ${constraint} is not conventionally named.`);
    }
    if (constraint.length > 63) {
      throw new Error(`Constraint ${constraint} exceeds the Postgres limit.`);
    }
    if (!constraint.startsWith(`${table}_${column}`)) {
      throw new Error(
        `Constraint ${constraint} does not name ${table}.${column}.`,
      );
    }
    byConstraint.set(constraint, [
      ...(byConstraint.get(constraint) ?? []),
      entry,
    ]);
  }

  // `species` and `form` deliberately share one column, so they must agree on
  // every part of it — a second CHECK under the same name would silently
  // replace the first.
  for (const [constraint, entries] of byConstraint) {
    const rendered = new Set(
      entries.map(
        (entry) =>
          `${addressSlugPattern(entry)}|${entry.storage!.maxCharacters}|${entry.storage!.nullable}|${entry.storage!.checkInstalledBy}`,
      ),
    );
    if (rendered.size > 1) {
      throw new Error(
        `Namespaces sharing ${constraint} disagree about its shape.`,
      );
    }
  }

  for (const entry of ADDRESS_MANIFEST) {
    if (entry.budget.decodedCharacters < 1) {
      throw new Error(`Namespace ${entry.namespace} has an empty budget.`);
    }
    for (const word of entry.reservedWords) {
      if (!new RegExp(addressSlugPattern(entry), "u").test(word)) {
        throw new Error(
          `Reserved word ${word} is not a ${entry.namespace} slug, so nothing could ever collide with it.`,
        );
      }
    }
  }
}
