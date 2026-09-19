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

export const ADDRESS_MANIFEST_VERSION = "ove465.address.v3";

/**
 * `latin` romanizes the source before slugifying; `native` keeps the
 * gardener's own alphabet.
 *
 * Every namespace *issues* `latin` since the amendment of 2026-09-18
 * (ADR-0029 D4): a browser hands the clipboard the percent-encoded form of an
 * address, six characters for every Cyrillic letter, and the address bar is
 * how a link travels here. `native` survives as a description of what was
 * issued before that — a namespace's `historicalScript` — because every one of
 * those addresses still has to answer, with one 308.
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
 * `ordinal` is a plain decimal number with no leading zero, at most nine
 * digits: a journal entry's place in its author's own count (ADR-0029 D9,
 * amendment of 2026-09-18). Nine digits is every value an `integer` column
 * holds with room to spare, and `012` is refused rather than folded into `12`
 * — a second spelling of one address is a duplicate, and nothing ever issued
 * one.
 */
export type AddressSlugShape = "hyphenated" | "handle" | "ordinal";

/** The `ordinal` shape, in the one dialect JavaScript and Postgres share. */
export const ADDRESS_ORDINAL_PATTERN = "^[1-9][0-9]{0,8}$";

/** The largest number the `ordinal` shape admits: nine nines. */
export const ADDRESS_ORDINAL_MAXIMUM = 999_999_999;

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
   * `integer` for the one namespace whose address is a number. The generated
   * `CHECK` is then a range rather than a pattern — a column that cannot hold
   * a letter needs no regular expression to refuse one — and its upper bound
   * is the same nine digits the route pattern admits, so the matcher and the
   * column cannot disagree about which numbers exist. Absent means `text`.
   */
  readonly columnType?: "text" | "integer";
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
  /**
   * The wider alphabet this namespace issued names in before it turned
   * `latin`, when it did.
   *
   * The matcher validates a segment before any lookup, so that the proxy's
   * bounded reads are only ever asked about names that could exist. The day a
   * namespace turns `latin`, every name it issued in Cyrillic stops being one
   * that "could exist" — and `/@yehor/objects/чорний-принц` answers 404 where
   * it must answer 308. This is what keeps those names matchable, for one
   * purpose only: deciding that a spelling is worth a history lookup. Nothing
   * is ever *issued* in it again, and the column's `CHECK` does not admit it
   * once the rows that held it have moved.
   */
  readonly historicalScript?: AddressScript;
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
  | "journalEntryNumber"
  | "object"
  | "topic"
  | "community"
  | "profileHandle";

export const ADDRESS_NAMESPACES: readonly AddressNamespace[] = [
  "species",
  "form",
  "journalEntry",
  "journalEntryNumber",
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
    // `/species/{species}/register` is the register hub (ADR-0029 D13 item 4,
    // OVE-433), so a cultivar named *Register* would take its own species'
    // hub with it — the same reason `objects` is reserved for an entry.
    reservedWords: ["register"],
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
    // The address is author-scoped and, since migration `0073`, so is the
    // name: two gardeners may both call an entry `мій-перший-помідор`. What
    // held the name platform-unique before were three readers that knew an
    // entry by its slug alone — the engagement target ref, the search document
    // id, and the proxy's bounded lookup — and `0073` moved the first onto
    // the entry id (the second already was), while the third reads
    // `(handle, slug)` and answers a legacy `/journal/{slug}` from history.
    uniquenessScope: "perAuthorHandle",
    budget: DEFAULT_ADDRESS_BUDGET,
    // OVE-428 puts object passports at /@{handle}/objects/{slug}, and OVE-464
    // puts the entry itself at /@{handle}/post/{n}, so an entry may never take
    // `objects` or `post` from under its own author.
    reservedWords: ["objects", "post"],
    source: "the entry title at first publish",
    // The name is no longer the address (ADR-0029 D9, amendment of
    // 2026-09-18): an entry lives at its number, `journalEntryNumber` below,
    // and both prefixes here are spellings that answer 308 to it.
    // `/journal/{slug}` was the flat, global namespace that forced a random
    // suffix into every URL; `/@{handle}/{slug}` carried the gardener's own
    // alphabet, which a clipboard receives as six characters a letter.
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
      "The entry's name, which resolves and is no longer the address. The only slug column that has never carried a CHECK; migration 0068 gave it one. Migration 0070 gave the namespace its history table, which is what let the publish-id suffix go; 0073 made the live column unique per author to match, once nothing identified an entry by its slug alone. Since OVE-464 every spelling under this namespace answers 308 to the entry's number.",
  },
  {
    namespace: "journalEntryNumber",
    // Digits are ASCII; the script says which alphabet a *name* is folded
    // into, and a number has no name to fold.
    script: "latin",
    shape: "ordinal",
    // `/@yehor/post/1` and `/@olena/post/1` are two entries. A site-wide
    // counter would be longer, would say nothing about the author, and would
    // publish the size of the platform in every link.
    uniquenessScope: "perAuthorHandle",
    budget: { decodedCharacters: 9, encodedCharacters: 9 },
    reservedWords: [],
    source:
      "the author's own count of publishes, assigned at publish, never changed and never reused",
    pathPrefix: "/@",
    pathBuilder: "publicJournalEntryPath",
    legacyPathPrefixes: [],
    storage: {
      table: "journal_entries",
      column: "author_entry_number",
      constraint: "journal_entries_author_entry_number_check",
      // Null on a row that was never an address: the development database's
      // retired `archived` rows, which no statement can write to.
      nullable: true,
      maxCharacters: 9,
      columnType: "integer",
      checkInstalledBy: "0076",
    },
    notes:
      "ADR-0029 D9, amendment of 2026-09-18. The number comes from journal_entry_number_counters through assign_journal_entry_number(uuid), called by a before-insert trigger, so no insert path can forget it and a purged entry's number is never handed to the next publish.",
  },
  {
    namespace: "object",
    script: "latin",
    // Passports were named in the gardener's own alphabet from migration
    // `0070` until OVE-465.
    historicalScript: "native",
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
      // `0070` installed the native-script CHECK; `0077` narrows it to Latin
      // once no row still holds a Cyrillic name.
      checkInstalledBy: "0077",
    },
    notes:
      "A passport is addressed by slug from OVE-428, and by a Latin one from OVE-465: the display name romanized by the language its first public entry was written in. The column is nullable because a private object has no public address, and only an object with a public entry is given one.",
  },
  {
    namespace: "topic",
    script: "latin",
    // A gardener's tag kept its alphabet from migration `0069` until OVE-465.
    historicalScript: "native",
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
      // `0069` widened the column to the native script so that a Cyrillic tag
      // stopped becoming a hash; `0077` narrows it to Latin once no row still
      // holds a Cyrillic name. The tag is readable either way — `pomidory`
      // rather than `tag-81e9f6d3034d`.
      checkInstalledBy: "0077",
    },
    notes:
      "A gardener's tag, romanized by the language of the entry that first used it (OVE-465). One topic per label: a later tag with the same label joins the topic that exists, so the address does not fork on the second tagger's language.",
  },
  {
    namespace: "community",
    script: "latin",
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
      "Communities are seeded, not authored, so every slug has always been ASCII and the column's own CHECK never admitted anything else. The namespace is Latin like every other (OVE-465); it has no historical script because it never issued one.",
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
  if (entry.shape === "ordinal") return ADDRESS_ORDINAL_PATTERN;
  const alphabet = addressAlphabet(entry);
  return `^[${alphabet}]+(?:-[${alphabet}]+)*$`;
}

/**
 * The pattern of every name this namespace has ever issued: the historical
 * alphabet where there was one, which contains the current one. `null` for a
 * namespace that has only ever issued what it issues now.
 */
export function addressHistoricalSlugPattern(
  entry: AddressNamespaceEntry,
): string | null {
  if (!entry.historicalScript || entry.shape !== "hyphenated") return null;
  const alphabet = ADDRESS_ALPHABETS[entry.historicalScript];
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
          `${addressSlugPattern(entry)}|${entry.storage!.maxCharacters}|${entry.storage!.nullable}|${entry.storage!.columnType ?? "text"}|${entry.storage!.checkInstalledBy}`,
      ),
    );
    if (rendered.size > 1) {
      throw new Error(
        `Namespaces sharing ${constraint} disagree about its shape.`,
      );
    }
  }

  // A number is stored as a number. An `ordinal` namespace over a text column
  // would need a pattern `CHECK` to keep `012` out, and an `integer` column
  // under any other shape would be handed a pattern it cannot be matched with.
  for (const entry of ADDRESS_MANIFEST) {
    if (!entry.storage) continue;
    const isInteger = entry.storage.columnType === "integer";
    if (isInteger !== (entry.shape === "ordinal")) {
      throw new Error(
        `Namespace ${entry.namespace} pairs the ${entry.shape} shape with a ${entry.storage.columnType ?? "text"} column.`,
      );
    }
    if (isInteger && entry.storage.maxCharacters !== 9) {
      throw new Error(
        `Namespace ${entry.namespace} must admit nine digits, the ordinal pattern's own bound.`,
      );
    }
  }

  // A historical script exists to keep *more* spellings matchable than the
  // current one issues. One that is narrower, or the same, is a mistake.
  for (const entry of ADDRESS_MANIFEST) {
    if (!entry.historicalScript) continue;
    if (
      entry.historicalScript === entry.script ||
      !ADDRESS_ALPHABETS[entry.historicalScript].startsWith(
        ADDRESS_ALPHABETS[entry.script],
      )
    ) {
      throw new Error(
        `Namespace ${entry.namespace} declares a historical script that does not contain the one it issues.`,
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
