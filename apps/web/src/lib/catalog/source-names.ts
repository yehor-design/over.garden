import type { PublicLocale } from "@/lib/public-localization";

/**
 * What a reader is shown for a catalogue source, an identifier scheme and a
 * registration fact (`OVE-497`).
 *
 * The ingest's own words — `ua_state_register`, `UA_REGISTER`,
 * `RegisterVarietis:08040055`, `registered (UA)` — are keys, and the organism
 * page printed them as text. A source is named the way it names itself; a
 * scheme the way a reader would look it up; a number the way it is printed on
 * a seed packet; a country and a language in the reader's own language.
 */

/**
 * `catalog_items.source` for the organisms a named source imported. The names
 * are the sources' own, as their snapshots record them.
 */
const ITEM_SOURCE_NAMES: Readonly<Record<string, string>> = {
  ua_state_register: "Ukraine State Register of Plant Varieties",
  eu_oj_eur_lex_common_catalogue:
    "EU Official Journal / EUR-Lex Common Catalogue",
  eu_common_catalogue_bg: "EU Plant Variety Portal",
  ua_official_bee_breed: "Ukraine Law on Beekeeping",
  vertebrate_breed_ontology: "Vertebrate Breed Ontology",
  grin_genebank_candidate: "USDA GRIN-Global",
};

/**
 * Everything else — the species backbone assembled from several sources, and
 * the catalogue's own seeds — is the catalogue speaking for itself, and says
 * so rather than claiming a source it cannot name.
 */
const THE_CATALOGUE: Readonly<Record<PublicLocale, string>> = {
  uk: "Каталог OverGarden",
  bg: "Каталогът на OverGarden",
  ru: "Каталог OverGarden",
};

export function catalogItemSourceName(
  source: string,
  locale: PublicLocale,
): string {
  return ITEM_SOURCE_NAMES[source] ?? THE_CATALOGUE[locale];
}

const REGISTER_SCHEMES: Readonly<
  Record<string, Readonly<Record<PublicLocale, string>>>
> = {
  ua_register: {
    uk: "Держреєстр України",
    bg: "Държавен регистър на Украйна",
    ru: "Госреестр Украины",
  },
  eu_common_catalogue: {
    uk: "Спільний каталог ЄС",
    bg: "Общ каталог на ЕС",
    ru: "Общий каталог ЕС",
  },
};

const SCHEME_NAMES: Readonly<Record<string, string>> = {
  col: "Catalogue of Life",
  gbif: "GBIF",
  wfo: "World Flora Online",
  eppo: "EPPO",
  wikidata: "Wikidata",
  grin: "GRIN-Global",
  vbo: "Vertebrate Breed Ontology",
};

/** The scheme beside an identifier: the register or database it points into. */
export function catalogIdentifierSchemeName(
  scheme: string,
  locale: PublicLocale,
): string {
  return (
    REGISTER_SCHEMES[scheme]?.[locale] ??
    SCHEME_NAMES[scheme] ??
    scheme.toUpperCase()
  );
}

/**
 * The number a reader would quote, out of the identifier the ingest stored.
 *
 * `RegisterVarietis:09040016` is a scheme and a number, and only the number is
 * on the paper; the EU reference is an ELI with a row digest, whose last
 * segment says nothing to anybody, so that one keeps its document reference.
 */
export function registerNumber(value: string | null): string | null {
  if (!value) return null;
  const ua = /^RegisterVarietis:(\d+)$/u.exec(value);
  if (ua) return ua[1]!;
  const eli = /^EUR-Lex:(ELI:[^:]+):row:[0-9a-f]+$/u.exec(value);
  if (eli) return eli[1]!;
  return value;
}

const REGISTRATION_STATUS: Readonly<
  Record<PublicLocale, Readonly<Record<string, string>>>
> = {
  uk: { registered: "зареєстровано", withdrawn: "вилучено з реєстру" },
  bg: { registered: "регистриран", withdrawn: "заличен от регистъра" },
  ru: { registered: "зарегистрирован", withdrawn: "исключён из реестра" },
};

/** A fact's value in words, where the catalogue knows the words for it. */
export function catalogFactValue(
  predicate: string,
  value: string,
  locale: PublicLocale,
): string {
  if (predicate === "registration_status") {
    return REGISTRATION_STATUS[locale][value.trim().toLowerCase()] ?? value;
  }
  return value;
}

/**
 * A qualifier in the reader's language: a two-letter region is a country, a
 * language tag is a language. Anything else — a unit, a scope — as it came.
 */
export function catalogQualifierName(
  qualifier: string,
  kind: "name" | "fact" | "identifier",
  locale: PublicLocale,
): string {
  try {
    if (kind === "fact" && /^[A-Z]{2}$/u.test(qualifier)) {
      return (
        new Intl.DisplayNames([locale], { type: "region" }).of(qualifier) ??
        qualifier
      );
    }
    if (kind === "name" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/u.test(qualifier)) {
      return (
        new Intl.DisplayNames([locale], { type: "language" }).of(qualifier) ??
        qualifier
      );
    }
  } catch {
    // A tag the runtime cannot name is shown as it came.
  }
  return qualifier;
}
