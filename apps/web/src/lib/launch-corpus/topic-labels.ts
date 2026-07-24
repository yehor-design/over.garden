/**
 * Localize curated topic slugs so English enum labels never leak to UI.
 */

import type { PublicLocale } from "@/lib/public-localization";

const CURATED_TOPIC_LABELS: Record<
  string,
  Record<PublicLocale, string>
> = {
  plants: { uk: "Рослини", bg: "Растения", ru: "Растения" },
  animals: { uk: "Тварини", bg: "Животни", ru: "Животные" },
  "plant-varieties": {
    uk: "Сорти рослин",
    bg: "Сортове растения",
    ru: "Сорта растений",
  },
  species: { uk: "Види", bg: "Видове", ru: "Виды" },
  breeds: { uk: "Породи", bg: "Породи", ru: "Породы" },
};

export function localizeCuratedTopicLabel(
  slug: string,
  fallbackLabel: string,
  locale: PublicLocale,
): string {
  const localized = CURATED_TOPIC_LABELS[slug]?.[locale];
  if (localized) return localized;
  // Never surface English enum stubs when a curated map exists for another locale.
  if (/^(Plants|Animals|Species|Breeds|Plant varieties)$/i.test(fallbackLabel)) {
    return CURATED_TOPIC_LABELS[slug]?.uk ?? fallbackLabel;
  }
  return fallbackLabel;
}
