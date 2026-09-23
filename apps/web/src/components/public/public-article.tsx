import {
  SiteShellContextRailModules,
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { Callout } from "@/components/ui/callout";
import { Link } from "@/components/ui/link";
import { MediaFigure } from "@/components/ui/media-figure";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import { cn } from "@/lib/utils";
import type { PublicLocale } from "@/lib/public-localization";

/**
 * One article shape, for everything the product publishes that is not a
 * gardener's entry (`OVE-453`): the blog, the guides and the answers.
 *
 * They had three shapes and three type scales between them. This is the
 * reading column `OVE-449` established, reused rather than re-derived — 704 px
 * at 18/29 — with one byline row, one `MediaFigure`, and the same contents
 * rail above `xl`.
 *
 * Three rules it carries, and each was a defect in one of the three pages:
 *
 * 1. **A section heading is a real heading with a real id.** The rail links to
 *    them, a screen reader lists them, and a reader can share one. A bold
 *    paragraph is none of those things.
 * 2. **The rail is above `xl` only, and it is never the only route.** Every
 *    entry in it points at a heading that is on the page and open; below `xl`
 *    the same list renders at the foot of the article (DESIGN.md §3.2).
 * 3. **A reference page with no photograph is type and space** (ADR-0031 D3),
 *    so there is no decorative illustration slot here at all. `cover` is a
 *    gardener's or an editor's real photograph or it is absent.
 */

export interface PublicArticleSection {
  /** Used as the heading's `id` and as the rail's anchor. */
  id: string;
  heading: string;
  body?: React.ReactNode;
  /** A numbered step renders its ordinal beside the heading. */
  ordinal?: number;
}

export interface PublicArticleMeta {
  label: string;
  value: React.ReactNode;
}

export interface PublicArticleCover {
  src: string;
  srcSet?: string | null;
  alt: string;
  caption?: React.ReactNode;
  placeholderDataUri?: string | null;
  intrinsicWidth?: number | null;
  intrinsicHeight?: number | null;
}

export interface PublicArticleProps {
  locale: PublicLocale;
  /** "Довідник · Посібник" — uppercase metadata, never a sentence. */
  eyebrow?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** The byline row: author, source, updated. Empty values are dropped. */
  meta?: readonly PublicArticleMeta[];
  cover?: PublicArticleCover | null;
  /** One sentence of what the reader will have when they finish. */
  outcome?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  sections: readonly PublicArticleSection[];
  /** The rail's own name, in the reader's language. */
  contentsLabel: string;
  /**
   * Headings `children` renders after the body — gardeners' entries, what a
   * text rests on, what to read next — listed in the contents after the
   * sections, so the contents are the page's headings and not only the
   * body's. Each `id` must be on a heading the children render.
   */
  contentsAfter?: readonly Pick<PublicArticleSection, "id" | "heading">[];
  /** Anything after the body: evidence, related links, a mention block. */
  children?: React.ReactNode;
  jsonLd?: Record<string, unknown> | null;
  /** `data-trust-state` and friends: the page says what kind it is. */
  dataset?: Record<string, string>;
  className?: string;
}

export function PublicArticle({
  locale,
  eyebrow,
  title,
  description,
  meta = [],
  cover = null,
  outcome,
  backHref,
  backLabel,
  sections,
  contentsLabel,
  contentsAfter = [],
  children,
  jsonLd,
  dataset = {},
  className,
}: PublicArticleProps) {
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);
  const shownMeta = meta.filter((entry) => Boolean(entry.value));
  const contents = buildArticleContextModules(contentsLabel, [
    ...sections,
    ...contentsAfter,
  ]);

  return (
    <main
      lang={locale}
      data-public-article="true"
      className={cn(
        "flex w-full min-w-0 flex-col gap-8 px-4 py-8 sm:px-6 md:py-12",
        className,
      )}
      {...dataset}
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      <SiteShellContextRailRegistration modules={contents} />

      <header className="flex flex-col gap-4 border-b border-border pb-6">
        {backHref && backLabel ? (
          <Link
            href={backHref}
            variant="muted"
            className="inline-flex min-h-11 w-fit items-center text-body-sm font-medium"
          >
            {backLabel}
          </Link>
        ) : null}
        {eyebrow ? (
          <p className="text-overline text-text-muted uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="text-h1 break-words text-text-heading">{title}</h1>
        {description ? (
          <p className="max-w-prose text-body-lg text-text-secondary">
            {description}
          </p>
        ) : null}
        {shownMeta.length > 0 ? (
          <dl className="grid gap-x-6 gap-y-2 border-t border-border pt-4 sm:grid-cols-3">
            {shownMeta.map((entry) => (
              <div key={entry.label} className="min-w-0">
                <dt className="text-caption text-text-muted">{entry.label}</dt>
                <dd className="text-body-sm break-words text-text">
                  {entry.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>

      {cover ? (
        <MediaFigure
          aspect="cover"
          data-article-cover="true"
          src={cover.src}
          srcSet={cover.srcSet}
          alt={cover.alt}
          caption={cover.caption}
          placeholderDataUri={cover.placeholderDataUri}
          intrinsicWidth={cover.intrinsicWidth}
          intrinsicHeight={cover.intrinsicHeight}
          priority
        />
      ) : null}

      {outcome ? (
        <Callout tone="success" data-article-outcome="true">
          <p>{outcome}</p>
        </Callout>
      ) : null}

      {/* The reading column: 18/29 in the shell's 704 px, the same measure a
          gardener's entry is set in (DESIGN.md §2.6). */}
      <article
        data-article-prose="true"
        className="grid gap-7 text-body-lg text-text"
      >
        {sections.map((section) => (
          <section key={section.id} className="grid gap-2">
            <h2
              id={section.id}
              className="scroll-mt-20 text-h2 text-balance text-text-heading"
            >
              {section.ordinal === undefined ? null : (
                <span className="mr-2 text-text-muted tabular-nums">
                  {section.ordinal}.
                </span>
              )}
              {section.heading}
            </h2>
            {/* A string body is prose and becomes a paragraph; anything
                else is already structured — a list, a definition list, a
                control block — and is placed as it is. Wrapping the first in
                a `<div>` left the reading column with no paragraph in it at
                all, which is also what the measure is read from. */}
            {typeof section.body === "string" ? (
              <p className="max-w-prose whitespace-pre-wrap">{section.body}</p>
            ) : section.body ? (
              <div className="max-w-prose">{section.body}</div>
            ) : null}
          </section>
        ))}
      </article>

      {children}

      {/* Below `xl` the rail has nowhere to be, so its contents are here —
          which is also what keeps rule 2 true: nothing is rail-only. */}
      {contents[0]?.items.length ? (
        <div className="border-t border-border pt-6 xl:hidden">
          <SiteShellContextRailModules modules={contents} />
        </div>
      ) : null}
    </main>
  );
}

/** The article's own headings, as the rail's one module. */
export function buildArticleContextModules(
  contentsLabel: string,
  sections: readonly Pick<PublicArticleSection, "id" | "heading">[],
): SiteShellContextRailModule[] {
  return [
    {
      key: "article-contents",
      title: contentsLabel,
      items: sections.map((section) => ({
        href: `#${section.id}`,
        label: section.heading,
      })),
      emptyLabel: contentsLabel,
    },
  ];
}

/**
 * A heading id built from the heading itself.
 *
 * Deterministic, so the same article always produces the same anchors and a
 * shared link keeps working. Non-Latin headings fall back to their position,
 * because a percent-encoded Cyrillic fragment is not a link anybody types.
 */
export function articleSectionId(prefix: string, heading: string, index: number) {
  const slug = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug.length >= 2 ? `${prefix}-${slug}` : `${prefix}-${index + 1}`;
}
