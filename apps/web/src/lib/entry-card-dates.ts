import type { PublicLocale } from "@/lib/public-localization";

/**
 * One meaning for a card's date, everywhere a journal entry is listed
 * (`OVE-492`, OG-UX-016).
 *
 * The date on a card is **when the observation happened** — the entry's own
 * date, the one the gardener chose. The feed orders by publication, so when an
 * entry was published on another day, the card says that too, in words: a
 * backdated note in a feed sorted by publication otherwise looks misplaced,
 * and the same entry used to show one date in the feed and another in the
 * journals directory with nothing to tell them apart.
 *
 * Formatted in UTC, like every other date in the product, so the server and
 * the reader agree about which day an `entry_date` is.
 */

const LOCALE_TAG: Record<PublicLocale, string> = {
  uk: "uk-UA",
  bg: "bg-BG",
  ru: "ru-RU",
};

const COPY: Record<PublicLocale, { published: string; readMore: string }> = {
  uk: { published: "Опубліковано {date}", readMore: "Читати далі" },
  bg: { published: "Публикувано {date}", readMore: "Прочети още" },
  ru: { published: "Опубликовано {date}", readMore: "Читать далее" },
};

export function getEntryCardCopy(locale: PublicLocale) {
  return COPY[locale];
}

export interface EntryCardDates {
  /** The observation date, `YYYY-MM-DD`, for `<time datetime>`. */
  dateTime: string;
  dateLabel: string;
  /** Present only when publication fell on another day. */
  published: { dateTime: string; label: string } | null;
}

export function entryCardDates(
  locale: PublicLocale,
  entryDate: Date | string,
  publishedAt: Date | string | null | undefined,
): EntryCardDates {
  const observed = dateColumnDay(entryDate);
  const dateLabel = formatDay(locale, observed);
  if (!publishedAt) return { dateTime: observed, dateLabel, published: null };

  const publishedInstant = new Date(publishedAt);
  const publishedDay = publishedInstant.toISOString().slice(0, 10);
  return {
    dateTime: observed,
    dateLabel,
    published:
      publishedDay === observed
        ? null
        : {
            dateTime: publishedInstant.toISOString(),
            label: COPY[locale].published.replace(
              "{date}",
              formatDay(locale, publishedDay),
            ),
          },
  };
}

/**
 * The day an `entry_date` names. node-postgres builds a `date` column as a
 * `Date` at *local* midnight, so its day is read in local parts: in UTC
 * (production) that is the UTC day, and on a machine east of Greenwich
 * `toISOString()` would have named the day before.
 */
function dateColumnDay(value: Date | string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return value;
  }
  const date = new Date(value);
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDay(locale: PublicLocale, day: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00.000Z`));
}
