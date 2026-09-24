import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Link } from "@/components/ui/link";
import { cn } from "@/lib/utils";

/**
 * One authored entry, in a list of them.
 *
 * ## The order is the reading order (`OVE-492`, OG-UX-014)
 *
 * Threads' hierarchy, top to bottom, and a screen reader meets it in the same
 * order:
 *
 * 1. **Who and when** — the author's avatar and name, then the date. The date
 *    is when the observation happened; when the entry was published on
 *    another day, that day follows, named as such (OG-UX-016), because the
 *    feed sorts by it and a backdated entry must not look out of order.
 * 2. **Where it belongs** — the living object, its kind and a coarse region.
 * 3. **What was written** — the title and an excerpt, and "Read more" when the
 *    excerpt stopped short of the entry.
 * 4. **The photographs, if any** — at their own proportions, bounded, never a
 *    box drawn for a picture that does not exist: a short note is a short
 *    card (OG-UX-041).
 * 5. The topics, then **the actions**.
 *
 * An entry without a public author — a gardener whose profile is hidden, or
 * an editorial item — starts at the date: the card never invents a person.
 *
 * ## The contract
 *
 * The feed, the followed feed, the journals directory, a community and a
 * profile consume this component, so the props are the contract:
 *
 * - **Every string arrives localized.** The card formats nothing: no date, no
 *   count, no label (DESIGN.md §4.2.5 — no business rule in a primitive).
 * - **`id` is required** because the `<article>` owes a reader an accessible
 *   name, and an `aria-labelledby` needs a stable id on the server.
 * - **`lang` is the gardener's words only** (OG-UX-030): the title and the
 *   excerpt. The dates, the byline and every label around them are the
 *   interface's and stay in the page's language.
 * - **A photograph's box is reserved before it arrives** from its intrinsic
 *   size, clamped between 4:5 and 16:9 and never taller than the reading
 *   column allows, so a late image shifts nothing (DESIGN.md §2.10).
 * - **`engagement` is a slot, not a built-in bar.** Like, bookmark, follow and
 *   comment are Server Actions (ADR-0024 D3); the page resolves them and hands
 *   the rendered controls down.
 * - **No link inside a link.** The title is the entry's link; the author, the
 *   object, a topic and each action are links of their own, side by side.
 */

export interface EntryCardCover {
  src: string;
  /** `<img srcset>` candidates from `buildPublicMediaSourceSet` (ADR-0022 D2). */
  srcSet?: string | null;
  sizes?: string;
  /**
   * `publicCardMediaAltText` builds it: the gardener's own description of the
   * photograph, or `""` when there is none — the card's linked title already
   * names the entry, and saying it twice describes nothing (OG-UX-029).
   */
  alt: string;
  /** The 16 px WebP data URI painted until the photograph arrives. */
  placeholderDataUri?: string | null;
  focalX?: number | null;
  focalY?: number | null;
  intrinsicWidth?: number | null;
  intrinsicHeight?: number | null;
}

export interface EntryCardSubject {
  /** The living object, organism or community the entry is about. */
  label: string;
  href?: string;
  /** "Рослина" / "Тварина" — the kind, already in the reader's language. */
  kindLabel: string;
  /** The kind's own icon. */
  icon?: React.ReactNode;
  /** One more fact about the subject, e.g. a coarse region. */
  meta?: React.ReactNode;
}

export interface EntryCardAuthor {
  displayName: string;
  href: string;
  avatarUrl?: string | null;
}

export interface EntryCardTopic {
  label: string;
  href: string;
}

/** Photographs a card shows; the entry page shows the rest. */
export const ENTRY_CARD_PHOTO_LIMIT = 3;

export interface EntryCardProps extends Omit<
  React.ComponentProps<"article">,
  "id" | "title"
> {
  /** Stable across renders: the entry's id. Names the article for a reader. */
  id: string;
  /** The entry's permanent address (ADR-0029). */
  href: string;
  title: React.ReactNode;
  /**
   * The language the gardener wrote in, when it is not the page's. A Bulgarian
   * entry in a Ukrainian feed is read aloud in Bulgarian or it is read aloud
   * wrong (WCAG 3.1.2). Pass nothing when the two agree.
   */
  contentLanguage?: string;
  subject?: EntryCardSubject | null;
  /** When the observation happened, machine-readable, for `<time datetime>`. */
  dateTime: string;
  /** The same moment in the reader's language. */
  dateLabel: string;
  /**
   * When it was published, if on another day than the observation — whole
   * phrase, localized ("Опубліковано 12 вер."). Omitted when the two agree.
   */
  published?: { dateTime: string; label: string } | null;
  excerpt?: React.ReactNode;
  /**
   * "Читати далі", shown when the excerpt stopped short of the entry. Its
   * accessible name also carries the entry's title, so a list of them is not
   * a list of identical links.
   */
  readMoreLabel?: string;
  /** The entry's photographs, first first; the card shows at most three. */
  media?: readonly EntryCardCover[];
  /** One photograph: the older single-cover form of `media`. */
  cover?: EntryCardCover | null;
  author?: EntryCardAuthor | null;
  /** "Автор" — kept for a byline that reads better with it. */
  authorPrefix?: string;
  topics?: readonly EntryCardTopic[];
  /** The engagement controls, rendered by the page. See the contract above. */
  engagement?: React.ReactNode;
  /**
   * `2` in a page whose `h1` is the page title; `3` inside a named section.
   * Heading levels never skip (DESIGN.md §8).
   */
  headingLevel?: 2 | 3;
  /** The first photographed card in a viewport, which must not be lazy. */
  priority?: boolean;
}

function EntryCard({
  className,
  id,
  href,
  title,
  contentLanguage,
  subject,
  dateTime,
  dateLabel,
  published,
  excerpt,
  readMoreLabel,
  media,
  cover,
  author,
  authorPrefix,
  topics,
  engagement,
  headingLevel = 2,
  priority = false,
  ...props
}: EntryCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const titleId = `entry-card-${id}-title`;
  const readMoreId = `entry-card-${id}-read-more`;
  const photos = (media ?? (cover ? [cover] : [])).slice(
    0,
    ENTRY_CARD_PHOTO_LIMIT,
  );
  const ugcLang = contentLanguage ? { lang: contentLanguage } : {};

  return (
    <Card
      as="article"
      data-slot="entry-card"
      data-entry-card={id}
      aria-labelledby={titleId}
      className={cn("grid gap-3 p-4 sm:p-5", className)}
      {...props}
    >
      {/* 1. Who and when. */}
      <div
        data-entry-card-byline="true"
        className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted"
      >
        {author ? (
          <Link
            href={author.href}
            variant="muted"
            // The prefix lives in the link's name, not in a visually hidden
            // span beside the name: Chromium drops the space between an
            // out-of-flow span and the text after it, and Orca read
            // «АвторОлена» as one word (`OVE-478`). The visible name stays at
            // the start of what is heard after the prefix (WCAG 2.5.3).
            aria-label={
              authorPrefix
                ? `${authorPrefix} ${author.displayName}`
                : undefined
            }
            className="inline-flex min-h-11 min-w-0 items-center gap-2 text-body-sm font-medium text-text"
          >
            {/* The picture is the name's, which follows it: announcing its
                initials as well would read the author twice. */}
            <span aria-hidden="true" className="contents">
              <Avatar
                src={author.avatarUrl}
                name={author.displayName}
                size="sm"
              />
            </span>
            <span className="truncate">{author.displayName}</span>
          </Link>
        ) : null}
        {author ? <span aria-hidden="true">·</span> : null}
        <time dateTime={dateTime} className="tabular-nums">
          {dateLabel}
        </time>
        {published ? (
          <>
            <span aria-hidden="true">·</span>
            <time
              dateTime={published.dateTime}
              data-entry-card-published="true"
              className="tabular-nums"
            >
              {published.label}
            </time>
          </>
        ) : null}
      </div>

      {/* 2. Where it belongs. */}
      {subject ? (
        <p
          data-entry-card-subject="true"
          className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-caption text-text-muted"
        >
          {subject.href ? (
            <Link
              href={subject.href}
              variant="muted"
              className="font-medium text-text-secondary"
            >
              {subject.label}
            </Link>
          ) : (
            <span className="font-medium text-text-secondary">
              {subject.label}
            </span>
          )}
          <span aria-hidden="true">·</span>
          <span>{subject.kindLabel}</span>
          {subject.meta ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                {subject.meta}
              </span>
            </>
          ) : null}
        </p>
      ) : null}

      {/* 3. What was written — the gardener's words, in their language. */}
      <div {...ugcLang} className="grid gap-1.5">
        <Heading
          id={titleId}
          className="text-h3 text-balance text-text-heading"
        >
          <Link href={href} variant="quiet" className="text-text-heading">
            {title}
          </Link>
        </Heading>
        {excerpt ? (
          <p className="line-clamp-4 text-body text-text-secondary">
            {excerpt}
          </p>
        ) : null}
      </div>
      {readMoreLabel ? (
        // Named by its own words and the entry's title — "Читати далі
        // Підсумок тижня" — so a list of them is not a list of identical
        // links, and the title keeps its language where it stands.
        <Link
          href={href}
          data-entry-card-read-more="true"
          aria-labelledby={`${readMoreId} ${titleId}`}
          className="w-fit text-body-sm font-medium"
        >
          <span id={readMoreId}>{readMoreLabel}</span>
        </Link>
      ) : null}

      {/* 4. The photographs, if there are any. */}
      {photos.length > 0 ? (
        <EntryCardMedia photos={photos} priority={priority} />
      ) : null}

      {topics && topics.length > 0 ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-text-muted">
          {topics.map((topic) => (
            <li key={topic.href}>
              <Link
                href={topic.href}
                variant="muted"
                className="inline-flex min-h-6 items-center"
              >
                #{topic.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {/* 5. What a reader can do. */}
      {engagement ? (
        <footer
          data-entry-card-actions="true"
          className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border pt-2"
        >
          {engagement}
        </footer>
      ) : null}
    </Card>
  );
}

/** Portrait no taller than 4:5, landscape no flatter than 16:9. */
const MIN_RATIO = 4 / 5;
const MAX_RATIO = 16 / 9;
/** The tallest a single photograph stands in the reading column. */
const MAX_PHOTO_HEIGHT_REM = 32;

export function entryCardPhotoRatio(photo: EntryCardCover): number {
  const width = photo.intrinsicWidth ?? 0;
  const height = photo.intrinsicHeight ?? 0;
  // A photograph without its size keeps the card ratio the pipeline used to
  // assume, rather than guessing a shape.
  if (width <= 0 || height <= 0) return 4 / 3;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height));
}

/**
 * The photographs, each in a box reserved before it arrives.
 *
 * One photograph stands at its own proportions, clamped, and never taller
 * than 32 rem: a portrait narrows rather than towering over the text, a
 * landscape takes the column's width. Two or three sit side by side as
 * squares cropped around their focal points — a uniform box is right where
 * the job is to show that there are several.
 */
function EntryCardMedia({
  photos,
  priority,
}: {
  photos: readonly EntryCardCover[];
  priority: boolean;
}) {
  if (photos.length === 1) {
    const [photo] = photos as [EntryCardCover];
    const ratio = entryCardPhotoRatio(photo);
    return (
      <div
        data-entry-card-media="single"
        className="relative overflow-hidden rounded-lg border border-border bg-surface-sunken"
        style={{
          aspectRatio: String(ratio),
          width: `min(100%, ${(MAX_PHOTO_HEIGHT_REM * ratio).toFixed(3)}rem)`,
        }}
      >
        <EntryCardPhoto
          photo={photo}
          priority={priority}
          sizes="(max-width: 767px) 92vw, 672px"
        />
      </div>
    );
  }

  return (
    <div
      data-entry-card-media="grid"
      data-entry-card-media-count={photos.length}
      className={cn(
        "grid gap-1.5 overflow-hidden rounded-lg",
        photos.length === 2 ? "grid-cols-2" : "grid-cols-3",
      )}
    >
      {photos.map((photo, index) => (
        <div
          key={photo.src}
          className="relative aspect-square overflow-hidden border border-border bg-surface-sunken first:rounded-l-lg last:rounded-r-lg"
        >
          <EntryCardPhoto
            photo={photo}
            priority={priority && index === 0}
            sizes={
              photos.length === 2
                ? "(max-width: 767px) 46vw, 336px"
                : "(max-width: 767px) 31vw, 224px"
            }
          />
        </div>
      ))}
    </div>
  );
}

function EntryCardPhoto({
  photo,
  priority,
  sizes,
}: {
  photo: EntryCardCover;
  priority: boolean;
  sizes: string;
}) {
  return (
    <SubjectAwareMediaImage
      src={photo.src}
      srcSet={photo.srcSet ?? undefined}
      alt={photo.alt}
      sizes={photo.sizes ?? sizes}
      placeholderDataUri={photo.placeholderDataUri}
      focalX={photo.focalX}
      focalY={photo.focalY}
      intrinsicWidth={photo.intrinsicWidth}
      intrinsicHeight={photo.intrinsicHeight}
      presentationMode="cover"
      priority={priority}
      fill
      unoptimized
    />
  );
}

export { EntryCard };
