// A button-shaped link keeps `next/link` directly: the design system's
// `Link` carries link typography, and `buttonVariants` would have to fight it.
import NextLink from "next/link";
import type { ReactNode } from "react";
import { BookOpenIcon as BookOpen } from "@/components/icons/BookOpen";
import { CaretRightIcon as ChevronRight } from "@/components/icons/CaretRight";
import { ImageBrokenIcon as ImageOff } from "@/components/icons/ImageBroken";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { PlantIcon as Sprout } from "@/components/icons/Plant";

import {
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/components/ui/link";
import { MediaFigure } from "@/components/ui/media-figure";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatLivingObjectPassportDate,
  formatLivingObjectPassportEntryCount,
  getLivingObjectPassportCopy,
  getLivingObjectPassportDomain,
  type LivingObjectPassportPresentation,
  type LivingObjectPassportTimelineEntry,
  type OwnerLivingObjectPassportPresentation,
  type PublicLivingObjectPassportPresentation,
} from "@/lib/living-object-passport";
import { buildPublicMediaSourceSet } from "@/lib/media/derivative-keys";
import { cn } from "@/lib/utils";

/**
 * The passport of one living object — the page an object earns by being the
 * spine of every entry written about it (`OVE-450`).
 *
 * It is one component behind two addresses. `/@{handle}/objects/{slug}` is the
 * readable one and `/lineage/objects/{uuid}` is the one the graph uses
 * (ADR-0029 D9); the second delegates to the first's route, so what is drawn
 * here is what both of them draw, for a visitor and for the object's own
 * caretaker.
 *
 * Three things are the same rules the rest of the redesign follows, and they
 * are why this file has so little styling of its own:
 *
 * - **Every photograph is a `MediaFigure`** at the 4:3 card ratio, so the box
 *   is reserved before the bytes land (DESIGN.md §2.10) and the `srcset` the
 *   media pipeline built survives (ADR-0022 D2).
 * - **The identity is a name, and a scientific name is Latin.** `lang="la"`
 *   goes on a binomial and on nothing else, so a screen reader does not read
 *   *Solanum lycopersicum* with Ukrainian phonetics — and does not read a
 *   gardener's Ukrainian variety name with Latin ones either.
 * - **A chronology is a list of observations, not a feed.** The body of an
 *   observation is the substance of it, so it is shown in full rather than
 *   clamped into a card's excerpt; only a long one folds behind a disclosure.
 */

const TIMELINE_PREVIEW_SIZE = 5;

export function LivingObjectPassportContextRail({
  passport,
  locale,
}: {
  passport: LivingObjectPassportPresentation;
  locale: InterfaceLocale;
}) {
  return (
    <SiteShellContextRailRegistration
      modules={buildLivingObjectPassportContextModules(passport, locale)}
    />
  );
}

export function LivingObjectPassportOverview({
  passport,
  locale,
  headingLevel = 1,
}: {
  passport: LivingObjectPassportPresentation;
  locale: InterfaceLocale;
  /** `2` inside a workspace shell, whose own heading is the page's `h1`. */
  headingLevel?: 1 | 2;
}) {
  const copy = getLivingObjectPassportCopy(locale);
  const domain = getLivingObjectPassportDomain(locale, passport.objectKind);

  return (
    <section
      id="passport-overview"
      data-living-object-passport="overview"
      data-passport-audience={passport.audience}
      data-object-kind={passport.objectKind}
      className="grid gap-6"
    >
      <div className="grid gap-5 md:grid-cols-3 md:items-start">
        <PassportCover passport={passport} noPhotoLabel={copy.noPhoto} />

        <div className="grid min-w-0 gap-4 md:col-span-2">
          <PageHeader
            className="border-b-0 pb-0"
            level={headingLevel}
            breadcrumb={
              <PassportBreadcrumbs
                passport={passport}
                label={passport.passportLabel}
              />
            }
            eyebrow={`${passport.passportLabel} · ${domain.kindLabel}`}
            title={passport.displayName}
            description={
              <>
                {passport.identity.label}:{" "}
                <ScientificName identity={passport.identity} />
              </>
            }
            actions={
              passport.primaryAction || passport.secondaryActions.length > 0 ? (
                <>
                  {passport.primaryAction ? (
                    <NextLink
                      href={passport.primaryAction.href}
                      className={buttonVariants({ size: "sm" })}
                    >
                      <BookOpen aria-hidden="true" />
                      {passport.primaryAction.label}
                    </NextLink>
                  ) : null}
                  {passport.secondaryActions.map((action) => (
                    <NextLink
                      key={`${action.href}:${action.label}`}
                      href={action.href}
                      className={buttonVariants({
                        variant: "secondary",
                        size: "sm",
                      })}
                    >
                      {action.label}
                    </NextLink>
                  ))}
                </>
              ) : null
            }
          />

          {/* Whose it is comes right after what it is (`OVE-495`,
              criterion 1): a reader meets the gardener before the badges.
              On the owner's own page the caretaker is always "you": the
              line says nothing there, so only a reader sees it (`OVE-491`). */}
          {passport.audience === "public" ? (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                src={passport.caretaker.avatarUrl}
                name={passport.caretaker.displayName}
                size="lg"
              />
              <div className="min-w-0">
                <p className="text-caption text-text-muted">{copy.caretaker}</p>
                {passport.caretaker.profilePath ? (
                  <Link
                    href={passport.caretaker.profilePath}
                    variant="quiet"
                    className="block truncate text-body-sm font-semibold text-text-heading"
                  >
                    {passport.caretaker.displayName}
                  </Link>
                ) : (
                  <p className="truncate text-body-sm font-semibold text-text-heading">
                    {passport.caretaker.displayName}
                  </p>
                )}
                {passport.caretaker.mention ? (
                  <p className="truncate text-caption text-text-muted">
                    {passport.caretaker.mention}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {/* A status is a word before it is a colour (DESIGN.md §8). */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              <ObjectKindIcon kind={passport.objectKind} />
              {passport.status.label}
            </Badge>
            <Badge tone="info">{passport.identity.state}</Badge>
            {passport.status.latestDate ? (
              <span className="text-caption text-text-muted">
                {copy.latestObservation}:{" "}
                <time
                  dateTime={dateTimeValue(passport.status.latestDate)}
                  className="tabular-nums"
                >
                  {formatLivingObjectPassportDate(
                    passport.status.latestDate,
                    locale,
                  )}
                </time>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-4 border-y border-border py-4 sm:grid-cols-2 xl:grid-cols-3">
        {passport.facts.map((fact) => (
          <div key={fact.key} className="min-w-0">
            <dt className="text-caption text-text-muted">{fact.label}</dt>
            <dd className="mt-1 text-body-sm font-medium break-words text-text">
              {fact.href ? (
                <Link href={fact.href} variant="quiet">
                  {fact.value}
                </Link>
              ) : (
                fact.value
              )}
            </dd>
          </div>
        ))}
      </dl>

      {passport.gallery.length > 1 ? (
        <Section
          id="passport-gallery"
          title={copy.mediaGallery}
          level={2}
          headingClassName="text-h3"
        >
          <ul className="grid list-none grid-cols-2 gap-3 sm:grid-cols-3">
            {passport.gallery.slice(0, 6).map((media) => (
              <li key={media.publicUrl} className="min-w-0">
                <MediaFigure
                  aspect="card"
                  className="overflow-hidden rounded-lg border border-border"
                  src={media.publicUrl}
                  srcSet={buildPublicMediaSourceSet(media).srcSet}
                  placeholderDataUri={media.placeholderDataUri ?? null}
                  alt={media.alt}
                  sizes="(min-width: 1024px) 14rem, 45vw"
                  focalX={media.focalX}
                  focalY={media.focalY}
                  intrinsicWidth={media.intrinsicWidth}
                  intrinsicHeight={media.intrinsicHeight}
                />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </section>
  );
}

export function PublicLivingObjectPassportTimeline({
  passport,
  locale,
}: {
  passport: PublicLivingObjectPassportPresentation;
  locale: InterfaceLocale;
}) {
  return <PassportTimeline passport={passport} locale={locale} />;
}

export function OwnerLivingObjectPassportTimeline({
  passport,
  locale,
  renderEntryActions,
}: {
  passport: OwnerLivingObjectPassportPresentation;
  locale: InterfaceLocale;
  renderEntryActions: (entry: LivingObjectPassportTimelineEntry) => ReactNode;
}) {
  return (
    <PassportTimeline
      passport={passport}
      locale={locale}
      renderEntryActions={renderEntryActions}
    />
  );
}

export function buildLivingObjectPassportContextModules(
  passport: LivingObjectPassportPresentation,
  locale: InterfaceLocale,
): SiteShellContextRailModule[] {
  const copy = getLivingObjectPassportCopy(locale);
  const objectItems = [
    passport.identity.catalogPath
      ? {
          href: passport.identity.catalogPath,
          label: passport.identity.value,
          meta: passport.identity.state,
        }
      : {
          href: "#passport-overview",
          label: passport.identity.value,
          meta: passport.status.label,
        },
    // As in the overview: on the owner's own page the caretaker is "you".
    passport.audience === "public" && passport.caretaker.profilePath
      ? {
          href: passport.caretaker.profilePath,
          label: passport.caretaker.displayName,
          meta: copy.caretaker,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  const journalItems = passport.timeline.entries.slice(0, 3).map((entry) => ({
    href: entry.href,
    label: entry.title,
    meta: formatLivingObjectPassportDate(entry.entryDate, locale),
  }));

  return [
    {
      key: "passport-object",
      title: passport.displayName,
      items: objectItems,
    },
    {
      key: "passport-journal",
      title: copy.chronology,
      items: journalItems,
      emptyLabel:
        passport.audience === "owner"
          ? copy.noOwnerEntries
          : copy.noPublicEntries,
    },
    // A reader is not shown a count of nothing: with no confirmed
    // provenance the public page has no provenance section to point at
    // (`OVE-495`, criterion 2). The owner still sees where to add one.
    ...(passport.audience === "owner" || passport.provenance.count > 0
      ? [
          {
            key: "passport-provenance",
            title: passport.provenance.label,
            items: [
              {
                href: passport.provenance.href ?? "#passport-provenance",
                label: passport.provenance.label,
                meta: String(passport.provenance.count),
              },
            ],
          },
        ]
      : []),
  ];
}

function PassportBreadcrumbs({
  passport,
  label,
}: {
  passport: LivingObjectPassportPresentation;
  label: string;
}) {
  if (passport.breadcrumbs.length === 0) return null;
  const last = passport.breadcrumbs.length - 1;

  return (
    <nav aria-label={label} className="min-w-0">
      <ol className="flex min-w-0 list-none flex-wrap items-center gap-1.5 text-caption text-text-muted">
        {passport.breadcrumbs.map((item, index) => (
          <li
            key={`${item.label}:${index}`}
            className="flex min-w-0 items-center gap-1.5"
          >
            {index > 0 ? (
              <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
            ) : null}
            {item.href ? (
              <Link
                href={item.href}
                variant="muted"
                className="max-w-52 truncate"
              >
                {item.label}
              </Link>
            ) : (
              /* The last crumb is this page. `aria-current` is what says so
                 to a screen reader; truncation only says it to the eye. */
              <span
                className="max-w-52 truncate text-text"
                {...(index === last ? { "aria-current": "page" as const } : {})}
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * The identified name, with `lang="la"` when — and only when — it is one.
 *
 * A binomial is Latin whatever the page's language, and a screen reader that
 * reads it with Ukrainian phonetics reads a different word (WCAG 3.1.2). A
 * variety name a gardener wrote is *not* Latin, so `catalogKind` decides
 * rather than the shape of the string.
 */
function ScientificName({
  identity,
}: {
  identity: LivingObjectPassportPresentation["identity"];
}) {
  if (identity.catalogKind === "species") {
    return (
      <span lang="la" className="italic">
        {identity.value}
      </span>
    );
  }
  return <span>{identity.value}</span>;
}

function PassportCover({
  passport,
  noPhotoLabel,
}: {
  passport: LivingObjectPassportPresentation;
  noPhotoLabel: string;
}) {
  if (!passport.cover) {
    return (
      <div className="flex aspect-card w-full items-center justify-center rounded-lg border border-dashed border-border bg-surface-sunken text-text-muted">
        <span className="flex flex-col items-center gap-2 text-body-sm">
          <ImageOff className="size-6" aria-hidden="true" />
          {noPhotoLabel}
        </span>
      </div>
    );
  }

  return (
    <MediaFigure
      aspect="card"
      className="overflow-hidden rounded-lg border border-border"
      src={passport.cover.publicUrl}
      srcSet={buildPublicMediaSourceSet(passport.cover).srcSet}
      placeholderDataUri={passport.cover.placeholderDataUri ?? null}
      alt={passport.cover.alt}
      sizes="(min-width: 768px) 20rem, 100vw"
      focalX={passport.cover.focalX}
      focalY={passport.cover.focalY}
      intrinsicWidth={passport.cover.intrinsicWidth}
      intrinsicHeight={passport.cover.intrinsicHeight}
      priority
    />
  );
}

function PassportTimeline({
  passport,
  locale,
  renderEntryActions,
}: {
  passport: LivingObjectPassportPresentation;
  locale: InterfaceLocale;
  renderEntryActions?: (entry: LivingObjectPassportTimelineEntry) => ReactNode;
}) {
  const copy = getLivingObjectPassportCopy(locale);
  const preview = passport.timeline.entries.slice(0, TIMELINE_PREVIEW_SIZE);
  const continuation = passport.timeline.entries.slice(TIMELINE_PREVIEW_SIZE);

  return (
    <Section
      id="passport-timeline"
      className="border-t border-border pt-6"
      level={2}
      title={
        passport.audience === "owner"
          ? copy.ownerChronology
          : copy.publicChronology
      }
      description={formatLivingObjectPassportEntryCount(
        locale,
        passport.timeline.totalCount,
      )}
    >
      {preview.length === 0 ? (
        <EmptyState
          variant={passport.audience === "owner" ? "first-run" : "no-results"}
          illustration={null}
          title={
            passport.audience === "owner"
              ? copy.noOwnerEntries
              : copy.noPublicEntries
          }
        />
      ) : (
        <>
          <ol className="grid list-none gap-4">
            {renderTimelineEntries(
              preview,
              locale,
              copy,
              renderEntryActions,
              undefined,
              true,
            )}
          </ol>
          {continuation.length > 0 ? (
            <details className="group grid gap-4 border-t border-border pt-4">
              <summary
                className={cn(
                  "flex min-h-11 cursor-pointer list-none items-center gap-2",
                  "text-link text-body-sm font-semibold hover:underline",
                )}
              >
                {passport.timeline.hasMore ? copy.showRecent : copy.showAll} ·{" "}
                {formatLivingObjectPassportEntryCount(
                  locale,
                  passport.timeline.loadedCount,
                )}
              </summary>
              <ol className="grid list-none gap-4">
                {renderTimelineEntries(
                  continuation,
                  locale,
                  copy,
                  renderEntryActions,
                  preview.at(-1)?.year,
                )}
              </ol>
            </details>
          ) : null}
        </>
      )}
    </Section>
  );
}

function renderTimelineEntries(
  entries: LivingObjectPassportTimelineEntry[],
  locale: InterfaceLocale,
  copy: ReturnType<typeof getLivingObjectPassportCopy>,
  renderEntryActions?: (entry: LivingObjectPassportTimelineEntry) => ReactNode,
  precedingYear?: string,
  eagerFirstMedia = false,
) {
  return entries.map((entry, index) => {
    const showYear =
      entry.year &&
      entry.year !== (index === 0 ? precedingYear : entries[index - 1]?.year);
    // A note this long buries the next observation. Anything shorter is read
    // in place — folding a three-line note behind a control costs a press and
    // saves nothing.
    const longBody = entry.body.length > 320;
    const titleId = `passport-entry-${entry.id}-title`;

    return (
      <li key={entry.id} className="grid gap-2">
        {showYear ? (
          <p className="text-overline text-text-muted tabular-nums">
            {entry.year}
          </p>
        ) : null}
        <Card
          as="article"
          id={`passport-entry-${entry.id}`}
          aria-labelledby={titleId}
          className="grid min-w-0 gap-3 p-4 sm:flex sm:items-start sm:gap-4"
        >
          <div className="text-caption text-text-muted sm:w-28 sm:shrink-0">
            <time
              dateTime={dateTimeValue(entry.entryDate)}
              className="font-medium text-text tabular-nums"
            >
              {formatLivingObjectPassportDate(entry.entryDate, locale)}
            </time>
            <p className="mt-1">{entry.relationLabel}</p>
            <p className="mt-0.5">{entry.stateLabel}</p>
          </div>

          <div className="min-w-0 sm:flex-1">
            <div className="grid gap-3 sm:flex sm:items-start sm:gap-4">
              <div className="min-w-0 sm:flex-1">
                <h3
                  id={titleId}
                  className="text-h3 break-words text-text-heading"
                >
                  <Link href={entry.href} variant="quiet">
                    {entry.title}
                  </Link>
                </h3>
                {longBody ? (
                  <details className="group/note mt-2">
                    <summary className="min-h-11 cursor-pointer list-none text-body-sm text-text">
                      <span className="line-clamp-3 whitespace-pre-wrap">
                        {entry.body}
                      </span>
                      <span className="text-link mt-1 inline-block text-caption font-semibold group-open/note:hidden">
                        {copy.readFullNote}
                      </span>
                    </summary>
                    <p className="mt-2 max-w-prose text-body-sm whitespace-pre-wrap text-text">
                      {entry.body}
                    </p>
                  </details>
                ) : (
                  <p className="mt-2 max-w-prose text-body-sm whitespace-pre-wrap text-text">
                    {entry.body}
                  </p>
                )}
              </div>
              {entry.mediaPublicUrl ? (
                <MediaFigure
                  aspect="card"
                  className="overflow-hidden rounded-lg border border-border sm:w-32 sm:shrink-0"
                  src={entry.mediaPublicUrl}
                  srcSet={
                    buildPublicMediaSourceSet({
                      publicUrl: entry.mediaPublicUrl,
                      intrinsicWidth: entry.mediaIntrinsicWidth,
                      intrinsicHeight: entry.mediaIntrinsicHeight,
                      variantLongEdges: entry.mediaVariantLongEdges,
                    }).srcSet
                  }
                  placeholderDataUri={entry.mediaPlaceholderDataUri ?? null}
                  alt={copy.entryPhotoAlt.replace("{title}", entry.title)}
                  sizes="(min-width: 640px) 8rem, 100vw"
                  focalX={entry.mediaFocalX}
                  focalY={entry.mediaFocalY}
                  intrinsicWidth={entry.mediaIntrinsicWidth}
                  intrinsicHeight={entry.mediaIntrinsicHeight}
                  priority={eagerFirstMedia && index === 0}
                />
              ) : null}
            </div>

            {entry.newer || entry.older ? (
              <nav
                aria-label={`${copy.chronology}: ${entry.title}`}
                className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-caption"
              >
                {entry.newer ? (
                  <Link
                    href={entry.newer.href}
                    variant="muted"
                    className="inline-flex min-h-11 min-w-0 items-center gap-1"
                  >
                    <span className="truncate">
                      ← {copy.newer}: {entry.newer.title}
                    </span>
                  </Link>
                ) : null}
                {entry.older ? (
                  <Link
                    href={entry.older.href}
                    variant="muted"
                    className="inline-flex min-h-11 min-w-0 items-center gap-1"
                  >
                    <span className="truncate">
                      {copy.older}: {entry.older.title} →
                    </span>
                  </Link>
                ) : null}
              </nav>
            ) : null}

            {renderEntryActions ? (
              <div className="mt-3 border-t border-border pt-3">
                {renderEntryActions(entry)}
              </div>
            ) : null}
          </div>
        </Card>
      </li>
    );
  });
}

function ObjectKindIcon({
  kind,
}: {
  kind: LivingObjectPassportPresentation["objectKind"];
}) {
  if (kind === "animal") {
    return <PawPrint aria-hidden="true" />;
  }
  return <Sprout aria-hidden="true" />;
}

function dateTimeValue(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}
