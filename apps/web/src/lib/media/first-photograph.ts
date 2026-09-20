/**
 * Which card of a listing holds the photograph a reader sees first.
 *
 * A page's first photograph is asked for at once — `priority`: eager, a high
 * fetch priority, a preload in `<head>` — and every other one is lazy. "The
 * first card" is not that rule. A first card without a photograph leaves the
 * second card's photograph the largest thing on the first screen *and* lazy,
 * and a lazy image is not requested until layout has found it near the
 * viewport: on production on 2026-09-20 that cost an organism card 2.9 s of its
 * LCP before a byte of the photograph was asked for (`OVE-470`).
 *
 * Only among the first `within` cards. A photograph further down is below the
 * first screen at every width, and asking for it early takes the link from
 * what the reader is looking at.
 *
 * Returns `-1` when none of those cards has a photograph.
 */
export function firstPhotographIndex<Card>(
  cards: readonly Card[],
  hasPhotograph: (card: Card) => boolean,
  within = 2,
): number {
  return cards.slice(0, within).findIndex(hasPhotograph);
}
