import type { InterfaceLocale } from "@/lib/interface-localization";

/**
 * The words of a species page (`OVE-519`): the heading over the entries, the
 * text under the names until the owner writes a description, and the one
 * line an unpublished page shows where its entries would be.
 *
 * The text is the page's meta description too — nothing on the page is for a
 * search engine only. The rules of Slice 29 hold: no counts, no scarcity
 * words, no guess about what gardeners write.
 */
export type SpeciesPageSubject =
  /** A species of plants, and anything that is neither animal nor form. */
  | "plant"
  | "animal"
  /** A cultivar under its species. */
  | "cultivar"
  | "breed"
  /** A species outside both kingdoms: a fungus, a bacterium. */
  | "species";

export interface SpeciesPageCopy {
  /** The visible heading over the list. */
  entriesHeading: string;
  /**
   * Approved for plants and animals in Ukrainian (2026-09-25); the cultivar,
   * breed and other-kingdom lines follow them and go to the owner with the PR.
   */
  placeholder: Record<SpeciesPageSubject, string>;
  /** What an unpublished page shows under «Записи». For the owner's approval. */
  empty: string;
}

const COPY: Record<InterfaceLocale, SpeciesPageCopy> = {
  uk: {
    entriesHeading: "Записи",
    placeholder: {
      plant:
        "Записи про цю рослину від людей, які ведуть її журнал на Overgarden.",
      animal:
        "Записи про цю тварину від людей, які ведуть її журнал на Overgarden.",
      cultivar:
        "Записи про цей сорт від людей, які ведуть його журнал на Overgarden.",
      breed:
        "Записи про цю породу від людей, які ведуть її журнал на Overgarden.",
      species:
        "Записи про цей вид від людей, які ведуть його журнал на Overgarden.",
    },
    empty: "Публічних записів ще немає.",
  },
  bg: {
    entriesHeading: "Записи",
    placeholder: {
      plant:
        "Записи за това растение от хора, които водят дневника му в Overgarden.",
      animal:
        "Записи за това животно от хора, които водят дневника му в Overgarden.",
      cultivar:
        "Записи за този сорт от хора, които водят дневника му в Overgarden.",
      breed:
        "Записи за тази порода от хора, които водят дневника ѝ в Overgarden.",
      species:
        "Записи за този вид от хора, които водят дневника му в Overgarden.",
    },
    empty: "Още няма публични записи.",
  },
  ru: {
    entriesHeading: "Записи",
    placeholder: {
      plant:
        "Записи об этом растении от людей, которые ведут его журнал на Overgarden.",
      animal:
        "Записи об этом животном от людей, которые ведут его журнал на Overgarden.",
      cultivar:
        "Записи об этом сорте от людей, которые ведут его журнал на Overgarden.",
      breed:
        "Записи об этой породе от людей, которые ведут её журнал на Overgarden.",
      species:
        "Записи об этом виде от людей, которые ведут его журнал на Overgarden.",
    },
    empty: "Публичных записей пока нет.",
  },
};

export function getSpeciesPageCopy(locale: InterfaceLocale): SpeciesPageCopy {
  return COPY[locale];
}

/** Which placeholder a page takes: by what it is, then by its kingdom. */
export function speciesPageSubject(input: {
  catalogKind: "species" | "plant_variety" | "breed";
  kingdom: string | null;
}): SpeciesPageSubject {
  if (input.catalogKind === "plant_variety") return "cultivar";
  if (input.catalogKind === "breed") return "breed";
  if (input.kingdom === "Plantae") return "plant";
  if (input.kingdom === "Animalia") return "animal";
  return "species";
}
