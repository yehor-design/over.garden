import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Link } from "@/components/ui/link";
import { cn } from "@/lib/utils";

/**
 * One authored entry, in a list of them.
 *
 * The anatomy is what Substack, Digg and Threads converged on for a feed of
 * authored posts — object and kind above, then the title, the date, the cover,
 * the byline, and the engagement bar beneath — and the reason it survives is
 * that **the photograph is the only coloured thing in it** (DESIGN.md §1.1,
 * ADR-0031 D3). Everything around the picture is neutral on purpose.
 *
 * ## The contract
 *
 * Four page families consume this component (`OVE-448`, `OVE-450`, `OVE-454`
 * and the feed itself), so the props are the contract and not an accident:
 *
 * - **Every string arrives localized.** The card formats nothing: no date, no
 *   count, no label. A component that formatted its own date would need the
 *   reader's locale, and then every consumer would have to agree about where
 *   that comes from (DESIGN.md §4.2.5 — no business rule in a primitive).
 * - **`id` is required** because the `<article>` owes a reader an accessible
 *   name, and an `aria-labelledby` needs a stable id on the server. A `useId`
 *   would make this a client component for the sake of one attribute.
 * - **The cover's box is reserved either way.** With a photograph or without
 *   one, the same `aspect-video` box is drawn, so a late image shifts nothing
 *   and the measured CLS stays inside the §9 budget. The typed fallback is
 *   what fills it when there is no photograph — the kind's own icon, not a
 *   grey rectangle pretending an image failed.
 * - **`engagement` is a slot, not a built-in bar.** Like, bookmark, follow and
 *   comment are Server Actions on real endpoints (ADR-0024 D3) and a card in a
 *   feed has no business reading a viewer's like state — the page resolves that
 *   beside its own reads and hands the rendered controls down. The feed passes a
 *   link into the entry's own discussion; the entry page passes the real
 *   `EngagementBar`.
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
  /** The kind's own icon, reused in the cover fallback. */
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
  /** Machine-readable, for `<time datetime>`. */
  dateTime: string;
  /** The same moment in the reader's language. */
  dateLabel: string;
  excerpt?: React.ReactNode;
  cover?: EntryCardCover | null;
  author?: EntryCardAuthor | null;
  /** "Автор" — the word before the name. */
  authorPrefix?: string;
  topics?: readonly EntryCardTopic[];
  /** The engagement controls, rendered by the page. See the contract above. */
  engagement?: React.ReactNode;
  /**
   * `2` in a page whose `h1` is the page title; `3` inside a named section.
   * Heading levels never skip (DESIGN.md §8).
   */
  headingLevel?: 2 | 3;
  /** The first cards in a viewport, which must not be lazy-loaded. */
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
  excerpt,
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

  return (
    <Card
      as="article"
      data-slot="entry-card"
      data-entry-card={id}
      aria-labelledby={titleId}
      className={cn("grid gap-4 overflow-hidden p-4 sm:p-5", className)}
      {...props}
    >
      {subject ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-caption text-text-muted">
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
        </div>
      ) : null}

      {/* The gardener's own words. `lang` appears only when the entry's
          language differs from the page's, so a Ukrainian feed of Ukrainian
          entries stays free of a redundant attribute on every card. */}
      <div
        {...(contentLanguage ? { lang: contentLanguage } : {})}
        className="grid gap-2"
      >
        <Heading
          id={titleId}
          className="text-h3 text-balance text-text-heading"
        >
          <Link href={href} variant="quiet" className="text-text-heading">
            {title}
          </Link>
        </Heading>
        <time
          dateTime={dateTime}
          className="text-caption text-text-muted tabular-nums"
        >
          {dateLabel}
        </time>
        {excerpt ? (
          <p className="line-clamp-3 text-body-sm text-text-secondary">
            {excerpt}
          </p>
        ) : null}
      </div>

      <EntryCardMedia
        cover={cover}
        fallbackIcon={subject?.icon}
        priority={priority}
      />

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

      {author || engagement ? (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          {author ? (
            <Link
              href={author.href}
              variant="muted"
              className="inline-flex min-h-11 min-w-0 items-center gap-2 text-body-sm"
            >
              <Avatar
                src={author.avatarUrl}
                name={author.displayName}
                size="sm"
              />
              <span className="truncate">
                {authorPrefix ? `${authorPrefix} ` : ""}
                {author.displayName}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {engagement ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {engagement}
            </div>
          ) : null}
        </footer>
      ) : null}
    </Card>
  );
}

/**
 * The photograph, or the box it would have occupied.
 *
 * Both branches draw the same box, at the **4:3 card ratio** of DESIGN.md
 * §2.10 — 16:9 is the ratio of a *cover*, which is the entry page's hero, not
 * a card's picture. Reserving the box either way is the whole point: a card
 * that reserves space only when it has a photograph shifts the list the moment
 * one arrives, and a list of mixed cards would shift twice.
 *
 * It bleeds to the card's own edges. That is the Substack and Digg shape, it
 * is what makes principle 1 true on a feed — the photograph is the only
 * coloured thing and now also the largest — and it has a measured consequence:
 * at 375 px the full-bleed 4:3 picture is 88,000 px² against the consent
 * banner's 76,000, so the *photograph* becomes the page's largest contentful
 * paint instead of a cookie notice that arrives after hydration. That one
 * change is worth about two seconds of LCP on a slow connection.
 */
function EntryCardMedia({
  cover,
  fallbackIcon,
  priority,
}: {
  cover?: EntryCardCover | null;
  fallbackIcon?: React.ReactNode;
  priority: boolean;
}) {
  if (!cover) {
    return (
      <div
        data-entry-card-media="fallback"
        aria-hidden="true"
        className="-mx-4 flex aspect-card items-center justify-center bg-surface-sunken text-text-disabled sm:-mx-5"
      >
        {fallbackIcon}
      </div>
    );
  }

  return (
    <div
      data-entry-card-media="cover"
      className="relative -mx-4 aspect-card overflow-hidden bg-surface-sunken sm:-mx-5"
    >
      <SubjectAwareMediaImage
        src={cover.src}
        srcSet={cover.srcSet ?? undefined}
        alt={cover.alt}
        sizes={cover.sizes ?? "(max-width: 767px) 100vw, 704px"}
        placeholderDataUri={cover.placeholderDataUri}
        focalX={cover.focalX}
        focalY={cover.focalY}
        intrinsicWidth={cover.intrinsicWidth}
        intrinsicHeight={cover.intrinsicHeight}
        presentationMode="cover"
        priority={priority}
        fill
        unoptimized
      />
    </div>
  );
}

export { EntryCard };
