/**
 * OVE-234 — localized, actionable refusal copy for the precise-location
 * firewall.
 *
 * The copy tells the gardener what to do (describe the place by region) and
 * never echoes the rejected value, so an error page, a toast, or a screen
 * reader announcement cannot become a second disclosure channel.
 */

import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  type PublicLocale,
} from "@/lib/public-localization";
import type { PreciseLocationTextSurface } from "@/lib/privacy/precise-location-text";

export type PreciseLocationCopyGroup =
  | "journal"
  | "comment"
  | "profile"
  | "lineage"
  | "generic";

const SURFACE_GROUP: Record<
  PreciseLocationTextSurface,
  PreciseLocationCopyGroup
> = {
  journal_title: "journal",
  journal_body: "journal",
  journal_document: "journal",
  journal_media_text: "journal",
  comment: "comment",
  profile_bio: "profile",
  profile_display_name: "profile",
  lineage_source_label: "lineage",
  lineage_question: "lineage",
  interview_note: "generic",
  community_search: "generic",
  public_search_document: "generic",
  notification: "generic",
  queue_payload: "generic",
};

const COPY: Record<
  PublicLocale,
  Record<PreciseLocationCopyGroup, string>
> = {
  uk: {
    journal:
      "Приберіть точні координати із запису. Опишіть місце лише областю або регіоном.",
    comment:
      "Приберіть точні координати з коментаря. Опишіть місце лише регіоном.",
    profile:
      "Приберіть точні координати з профілю. Вкажіть лише область або регіон.",
    lineage:
      "Приберіть точні координати з тексту походження. Вкажіть лише регіон.",
    generic:
      "Приберіть точні координати. OverGarden зберігає лише рівень регіону.",
  },
  bg: {
    journal:
      "Премахнете точните координати от записа. Опишете мястото само с област или регион.",
    comment:
      "Премахнете точните координати от коментара. Опишете мястото само с регион.",
    profile:
      "Премахнете точните координати от профила. Посочете само област или регион.",
    lineage:
      "Премахнете точните координати от текста за произход. Посочете само регион.",
    generic:
      "Премахнете точните координати. OverGarden пази само ниво регион.",
  },
  ru: {
    journal:
      "Уберите точные координаты из записи. Опишите место только областью или регионом.",
    comment:
      "Уберите точные координаты из комментария. Опишите место только регионом.",
    profile:
      "Уберите точные координаты из профиля. Укажите только область или регион.",
    lineage:
      "Уберите точные координаты из текста происхождения. Укажите только регион.",
    generic:
      "Уберите точные координаты. OverGarden хранит только уровень региона.",
  },
};

export function preciseLocationRejectionMessage(
  surface: PreciseLocationTextSurface,
  locale: string | null | undefined,
): string {
  const resolved =
    typeof locale === "string" && isPublicLocale(locale)
      ? locale
      : DEFAULT_PUBLIC_LOCALE;
  return COPY[resolved][SURFACE_GROUP[surface] ?? "generic"];
}
