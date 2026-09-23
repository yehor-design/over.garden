import type { PublicLocale } from "@/lib/public-localization";

/**
 * The names of the topics the product itself files entries under, in each
 * language the product speaks (OVE-426 follow-up, 2026-09-13).
 *
 * A topic's slug is its address and stays what it is — `/topics/plants` is
 * stable, typeable and in every sitemap — but its *label* is chrome, and the
 * five system topics shipped with a single stored label: `Plants`, `Animals`,
 * `Species`, `Plant varieties` in English, `Спостереження і догляд` in
 * Ukrainian, shown as-is on `/bg/…` and `/ru/…`, on pages that declare
 * `hreflang` to each other. A gardener's own tag is not in this map and is
 * never translated: it is the gardener's word, and the address carries it.
 *
 * One map, not two. The feed carried a second copy of this table with five of
 * the six slugs, so a Russian reader's feed rail read «Спостереження і догляд»
 * among Russian labels — the sixth topic fell through to its stored Ukrainian
 * name. A name has one builder (2026-09-17).
 */
const SYSTEM_TOPIC_LABELS: Readonly<
  Record<string, Readonly<Record<PublicLocale, string>>>
> = {
  plants: { uk: "Рослини", bg: "Растения", ru: "Растения" },
  animals: { uk: "Тварини", bg: "Животни", ru: "Животные" },
  species: { uk: "Види", bg: "Видове", ru: "Виды" },
  "plant-varieties": {
    uk: "Сорти рослин",
    bg: "Сортове растения",
    ru: "Сорта растений",
  },
  breeds: { uk: "Породи", bg: "Породи", ru: "Породы" },
  "observation-and-care": {
    uk: "Спостереження і догляд",
    bg: "Наблюдения и грижи",
    ru: "Наблюдения и уход",
  },
};

export const SYSTEM_TOPIC_SLUGS: readonly string[] = Object.keys(
  SYSTEM_TOPIC_LABELS,
);

export function isSystemTopicSlug(slug: string): boolean {
  return Object.hasOwn(SYSTEM_TOPIC_LABELS, slug);
}

/**
 * The two system topics that are the plant-or-animal split again (`OVE-492`,
 * OG-UX-015). A listing that already offers plants or animals as a mode or a
 * facet does not offer them a second time as topics — the same choice under
 * two names reads as two concepts. The one in the URL is still shown, so a
 * reader can remove it.
 */
const KIND_TOPIC_SLUGS: ReadonlySet<string> = new Set(["plants", "animals"]);

export function isKindTopicSlug(slug: string): boolean {
  return KIND_TOPIC_SLUGS.has(slug);
}

/** The label a page in `locale` shows for a topic; the stored one unless the topic is the product's. */
export function localizeTopicLabel(
  locale: PublicLocale,
  slug: string,
  storedLabel: string,
): string {
  return SYSTEM_TOPIC_LABELS[slug]?.[locale] ?? storedLabel;
}

/** The stored (Ukrainian, primary) label a system topic is created with. */
export function systemTopicPrimaryLabel(slug: string): string | null {
  return SYSTEM_TOPIC_LABELS[slug]?.uk ?? null;
}
