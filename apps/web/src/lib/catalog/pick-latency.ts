import type { InterfaceLocale } from "@/lib/interface-localization";

/**
 * How much measuring it takes before a figure about picking may be called one
 * (`OVE-506`, OG-UX-039).
 *
 * Production showed a median and a P95 of 29672 ms each — from one attempt. A
 * percentile of one observation is that observation printed twice, and an
 * owner deciding whether the picker works reads it as a trend. These are the
 * smallest samples each figure is shown for; below them the page says how
 * many there were and how many it needs, and never prints the number.
 *
 * - A median of fewer than five is an anecdote.
 * - Below twenty, the 95th percentile interpolates between the two slowest
 *   picks: it is the maximum wearing a statistic's name.
 * - A share of fewer than five attempts is "1 of 1", not "100%".
 */
export const PICK_MEDIAN_MIN_SAMPLE = 5;
export const PICK_P95_MIN_SAMPLE = 20;
export const PICK_SHARE_MIN_SAMPLE = 5;

export type PickFigure =
  | { status: "measured"; value: number; sample: number }
  | { status: "insufficient"; sample: number; needed: number }
  | { status: "none" };

/** A statistic over `sample` observations, or why it is not one yet. */
export function readPickFigure(
  value: number | null,
  sample: number,
  needed: number,
): PickFigure {
  if (sample <= 0 || value === null) return { status: "none" };
  if (sample < needed) return { status: "insufficient", sample, needed };
  return { status: "measured", value, sample };
}

/** A share, or null when there are too few attempts to call it one. */
export function pickSharePercent(part: number, whole: number): number | null {
  if (whole < PICK_SHARE_MIN_SAMPLE || whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

const UNITS: Record<InterfaceLocale, { seconds: string; minutes: string }> = {
  uk: { seconds: "с", minutes: "хв" },
  bg: { seconds: "с", minutes: "мин" },
  ru: { seconds: "с", minutes: "мин" },
};

/**
 * A duration as a person says it: "0,4 с", "29,7 с", "2 хв 5 с". The raw
 * milliseconds were five digits an owner had to divide in their head.
 */
export function formatPickDuration(
  ms: number,
  locale: InterfaceLocale,
): string {
  const units = UNITS[locale];
  const safe = Math.max(0, ms);
  // Decided on the rounded value, so 59 960 ms is "1 хв", never "60,0 с".
  const tenths = Math.round(safe / 100);
  if (tenths < 600) {
    const seconds = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(tenths / 10);
    return `${seconds} ${units.seconds}`;
  }
  const totalSeconds = Math.round(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0
    ? `${minutes} ${units.minutes}`
    : `${minutes} ${units.minutes} ${seconds} ${units.seconds}`;
}
