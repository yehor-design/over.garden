/**
 * The one sentence a photograph is described by (OVE-432).
 *
 * There were three fallbacks before this, and two of them appeared on the same
 * page: `"Томат - Sep 1, 1"` above the fold and `"Томат - Sep 1 1"` in the
 * body. A number is not a description — it tells a screen reader nothing and
 * tells image search less — and two formats for one rule is a defect on its
 * own.
 *
 * The rule now: the gardener's caption, else the entry's title, and never a
 * number. The title is a true statement about every photo in the entry — it is
 * what the gardener was writing about — and repeating it is honest where
 * `", 2"` was not.
 */
export function publicMediaAltText(
  media: { altText?: string | null; caption?: string | null },
  entryTitle: string,
): string {
  const caption = media.caption?.trim();
  if (caption) return caption;
  const altText = media.altText?.trim();
  if (altText) return altText;
  return entryTitle.trim();
}
