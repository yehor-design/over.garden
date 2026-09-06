import type { CatalogKind } from "@/db/schema";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatPublicCount,
  getPublicSurfaceCopy,
} from "@/lib/public-surface-localization";

export interface OrganismFactParagraphInput {
  canonicalName: string;
  catalogKind: CatalogKind;
  /** The species a form belongs to, when known. */
  speciesName: string | null;
  formCount: number;
  gardenerCount: number;
  regionCount: number;
  /**
   * ADR-0026 D11: what this organism is to a garden, when EPPO says it is a
   * pest of something. The kingdom decides the word: an animal is a pest, a
   * fungus, bacterium or virus is a disease. Absent, the card says species.
   */
  organismRole?: "pest" | "disease" | null;
}

/** The word a card uses for an organism that is a pest of something (D11). */
export function organismRoleFor(input: {
  kingdom: string | null;
  hostCount: number;
}): "pest" | "disease" | null {
  if (input.hostCount <= 0) return null;
  if (!input.kingdom) return null;
  // A gardener calls the beetle a pest and the blight a disease; the kingdom
  // is the only structured field that tells the two apart.
  return input.kingdom === "Animalia" || input.kingdom === "Plantae"
    ? "pest"
    : "disease";
}

/**
 * The fact-only first paragraph (ADR-0026 D9): a template per kind and
 * locale filled from structured fields alone. A sentence whose value is
 * absent from the data is left out; nothing is generated.
 */
export function formatOrganismFactParagraph(
  locale: InterfaceLocale,
  input: OrganismFactParagraphInput,
): string {
  const copy = getPublicSurfaceCopy(locale).organism.fact;
  const sentences: string[] = [];
  const kind = input.organismRole
    ? copy.role[input.organismRole]
    : copy.kind[input.catalogKind];
  sentences.push(
    input.catalogKind !== "species" && input.speciesName
      ? fill(copy.identityWithSpecies, {
          name: input.canonicalName,
          kind,
          species: input.speciesName,
        })
      : fill(copy.identity, { name: input.canonicalName, kind }),
  );
  if (input.catalogKind === "species" && input.formCount > 0) {
    sentences.push(
      fill(copy.forms, {
        forms: formatPublicCount(locale, "form", input.formCount),
      }),
    );
  }
  if (input.gardenerCount > 0) {
    const gardeners = formatPublicCount(
      locale,
      "gardener",
      input.gardenerCount,
    );
    sentences.push(
      input.regionCount > 0
        ? fill(copy.gardenersWithRegions, {
            gardeners,
            regions: formatPublicCount(locale, "region", input.regionCount),
          })
        : fill(copy.gardeners, { gardeners }),
    );
  } else {
    sentences.push(copy.noGardeners);
  }
  return sentences.join(" ");
}

export function formatOrganismDate(
  locale: InterfaceLocale,
  value: Date | string | null | undefined,
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function fill(template: string, values: Record<string, string>) {
  return (
    template
      .replace(/\{(\w+)\}/gu, (match, key: string) =>
        Object.hasOwn(values, key) ? values[key]! : match,
      )
      // A name that ends in an abbreviation ("L.") must not double the period.
      .replace(/\.\s*\.$/u, ".")
  );
}
