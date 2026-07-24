/**
 * OVE-199 launch corpus content-class and source-language contract.
 */

export const JOURNAL_CONTENT_CLASSES = [
  "real_ugc",
  "founder_first_hand",
  "editorial",
  "catalog_fact",
  "production_smoke",
  "visual_fixture",
] as const;

export type JournalContentClass = (typeof JOURNAL_CONTENT_CLASSES)[number];

export const JOURNAL_SOURCE_LANGUAGES = ["uk", "bg"] as const;

export type JournalSourceLanguage = (typeof JOURNAL_SOURCE_LANGUAGES)[number];

/** Classes that may appear on guest launch surfaces as honest first-party proof. */
export const PUBLIC_LAUNCH_CONTENT_CLASSES = [
  "real_ugc",
  "founder_first_hand",
  "editorial",
] as const;

export type PublicLaunchContentClass =
  (typeof PUBLIC_LAUNCH_CONTENT_CLASSES)[number];

/** Classes that must never be presented as independent real gardeners. */
export const NON_GARDENER_CONTENT_CLASSES = [
  "production_smoke",
  "visual_fixture",
  "catalog_fact",
  "editorial",
] as const;

export const DEFAULT_JOURNAL_CONTENT_CLASS =
  "real_ugc" as const satisfies JournalContentClass;

export function isJournalContentClass(
  value: string | null | undefined,
): value is JournalContentClass {
  return (
    typeof value === "string" &&
    (JOURNAL_CONTENT_CLASSES as readonly string[]).includes(value)
  );
}

export function isJournalSourceLanguage(
  value: string | null | undefined,
): value is JournalSourceLanguage {
  return (
    typeof value === "string" &&
    (JOURNAL_SOURCE_LANGUAGES as readonly string[]).includes(value)
  );
}

export function isPublicLaunchContentClass(
  value: string | null | undefined,
): value is PublicLaunchContentClass {
  return (
    typeof value === "string" &&
    (PUBLIC_LAUNCH_CONTENT_CLASSES as readonly string[]).includes(value)
  );
}

export function requiresDeclaredSourceLanguage(
  contentClass: JournalContentClass,
): boolean {
  return (
    contentClass === "founder_first_hand" || contentClass === "editorial"
  );
}
