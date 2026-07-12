import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Hexagon,
  ImageOff,
  PawPrint,
  Sprout,
  UserRound,
} from "lucide-react";

import {
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { buttonVariants } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

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
}: {
  passport: LivingObjectPassportPresentation;
  locale: InterfaceLocale;
}) {
  const copy = getLivingObjectPassportCopy(locale);
  const domain = getLivingObjectPassportDomain(locale, passport.objectKind);
  const longestTitleToken = passport.displayName
    .split(/\s+/u)
    .reduce(
      (longest, token) => (token.length > longest.length ? token : longest),
      "",
    );
  const hasLongTitle =
    passport.displayName.length > 56 || longestTitleToken.length > 18;

  return (
    <section
      id="passport-overview"
      data-living-object-passport="overview"
      data-passport-audience={passport.audience}
      data-object-kind={passport.objectKind}
      className="grid gap-5"
    >
      <nav aria-label={passport.passportLabel} className="min-w-0">
        <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {passport.breadcrumbs.map((item, index) => (
            <li
              key={`${item.label}:${index}`}
              className="flex min-w-0 items-center gap-1.5"
            >
              {index > 0 ? (
                <ChevronRight
                  className="size-3.5 shrink-0"
                  aria-hidden="true"
                />
              ) : null}
              {item.href ? (
                <Link
                  href={item.href}
                  className="max-w-52 truncate hover:text-foreground hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="max-w-52 truncate text-foreground">
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <header className="grid gap-5 border-b border-border pb-5 md:grid-cols-3 md:items-start">
        <PassportCover passport={passport} noPhotoLabel={copy.noPhoto} />

        <div className="flex min-w-0 flex-col gap-4 md:col-span-2">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
              <ObjectKindIcon kind={passport.objectKind} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                {passport.passportLabel} · {domain.kindLabel}
              </p>
              <h1
                className={cn(
                  "mt-1 font-semibold break-words text-foreground",
                  hasLongTitle
                    ? "text-xl leading-tight sm:text-3xl"
                    : "text-3xl leading-tight",
                )}
              >
                {passport.displayName}
              </h1>
              <p className="mt-1 text-sm break-words text-muted-foreground">
                {passport.identity.label}: {passport.identity.value}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md border border-border px-2 py-1 font-medium text-foreground">
              {passport.status.label}
            </span>
            <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
              {passport.identity.state}
            </span>
            {passport.status.latestDate ? (
              <time className="px-1 text-muted-foreground">
                {copy.latestObservation}:{" "}
                {formatLivingObjectPassportDate(
                  passport.status.latestDate,
                  locale,
                )}
              </time>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {passport.primaryAction ? (
              <Link
                href={passport.primaryAction.href}
                className={buttonVariants({ size: "sm" })}
              >
                <BookOpen aria-hidden="true" />
                {passport.primaryAction.label}
              </Link>
            ) : null}
            {passport.secondaryActions.map((action) => (
              <Link
                key={`${action.href}:${action.label}`}
                href={action.href}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {action.label}
              </Link>
            ))}
          </div>

          <div className="flex min-w-0 items-center gap-3 border-t border-border pt-3">
            <CaretakerAvatar passport={passport} />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{copy.caretaker}</p>
              {passport.caretaker.profilePath ? (
                <Link
                  href={passport.caretaker.profilePath}
                  className="block truncate text-sm font-semibold text-foreground hover:text-primary hover:underline"
                >
                  {passport.caretaker.displayName}
                </Link>
              ) : (
                <p className="truncate text-sm font-semibold text-foreground">
                  {passport.caretaker.displayName}
                </p>
              )}
              {passport.caretaker.mention ? (
                <p className="truncate text-xs text-muted-foreground">
                  {passport.caretaker.mention}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <dl className="grid border-y border-border sm:grid-cols-2 xl:grid-cols-3">
        {passport.facts.map((fact) => (
          <div
            key={fact.key}
            className="min-w-0 border-b border-border px-3 py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:[&:nth-last-child(-n+3)]:border-b-0"
          >
            <dt className="text-xs text-muted-foreground">{fact.label}</dt>
            <dd className="mt-1 text-sm font-medium break-words text-foreground">
              {fact.href ? (
                <Link
                  href={fact.href}
                  className="hover:text-primary hover:underline"
                >
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
        <section
          aria-labelledby="passport-gallery-title"
          className="grid gap-3"
        >
          <h2
            id="passport-gallery-title"
            className="text-base font-semibold text-foreground"
          >
            {copy.mediaGallery}
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {passport.gallery.slice(0, 6).map((media) => (
              <li key={media.publicUrl} className="min-w-0">
                <Image
                  src={media.publicUrl}
                  alt={media.alt}
                  width={640}
                  height={480}
                  sizes="(min-width: 1024px) 14rem, 45vw"
                  unoptimized
                  className="aspect-4/3 w-full rounded-md border border-border bg-muted object-contain"
                />
              </li>
            ))}
          </ul>
        </section>
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
    passport.caretaker.profilePath
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
    {
      key: "passport-provenance",
      title: passport.provenance.label,
      items: [
        {
          href: "#passport-provenance",
          label: passport.provenance.label,
          meta: String(passport.provenance.count),
        },
      ],
    },
  ];
}

function PassportCover({
  passport,
  noPhotoLabel,
}: {
  passport: LivingObjectPassportPresentation;
  noPhotoLabel: string;
}) {
  return passport.cover ? (
    <Image
      src={passport.cover.publicUrl}
      alt={passport.cover.alt}
      width={960}
      height={720}
      sizes="(min-width: 768px) 20rem, 100vw"
      loading="eager"
      unoptimized
      className="aspect-4/3 w-full rounded-md border border-border object-cover"
    />
  ) : (
    <div className="flex aspect-4/3 w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground">
      <span className="flex flex-col items-center gap-2 text-sm">
        <ImageOff className="size-6" aria-hidden="true" />
        {noPhotoLabel}
      </span>
    </div>
  );
}

function CaretakerAvatar({
  passport,
}: {
  passport: LivingObjectPassportPresentation;
}) {
  return passport.caretaker.avatarUrl ? (
    <Image
      src={passport.caretaker.avatarUrl}
      alt=""
      width={40}
      height={40}
      unoptimized
      className="size-10 rounded-full border border-border object-cover"
    />
  ) : (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <UserRound className="size-5" aria-hidden="true" />
    </span>
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
    <section
      id="passport-timeline"
      className="grid gap-4 border-t border-border pt-5"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            {copy.chronology}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            {passport.audience === "owner"
              ? copy.ownerChronology
              : copy.publicChronology}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatLivingObjectPassportEntryCount(
            locale,
            passport.timeline.totalCount,
          )}
        </p>
      </div>

      {preview.length === 0 ? (
        <div className="flex min-h-28 items-center rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          {passport.audience === "owner"
            ? copy.noOwnerEntries
            : copy.noPublicEntries}
        </div>
      ) : (
        <>
          <ol className="grid gap-3">
            {renderTimelineEntries(preview, locale, copy, renderEntryActions)}
          </ol>
          {continuation.length > 0 ? (
            <details className="group border-t border-border pt-3">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground hover:text-primary">
                <span>
                  {passport.timeline.hasMore ? copy.showRecent : copy.showAll} ·{" "}
                  {formatLivingObjectPassportEntryCount(
                    locale,
                    passport.timeline.loadedCount,
                  )}
                </span>
                <ChevronDown
                  className="size-4 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <ol className="mt-3 grid gap-3">
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
    </section>
  );
}

function renderTimelineEntries(
  entries: LivingObjectPassportTimelineEntry[],
  locale: InterfaceLocale,
  copy: ReturnType<typeof getLivingObjectPassportCopy>,
  renderEntryActions?: (entry: LivingObjectPassportTimelineEntry) => ReactNode,
  precedingYear?: string,
) {
  return entries.map((entry, index) => {
    const showYear =
      entry.year &&
      entry.year !== (index === 0 ? precedingYear : entries[index - 1]?.year);
    const longBody = entry.body.length > 320;

    return (
      <li key={entry.id} className="grid gap-2">
        {showYear ? (
          <p className="pt-1 text-xs font-semibold text-muted-foreground">
            {entry.year}
          </p>
        ) : null}
        <article
          id={`passport-entry-${entry.id}`}
          className="grid min-w-0 gap-3 rounded-md border border-border p-3 sm:flex sm:items-start"
        >
          <div className="text-xs text-muted-foreground sm:w-28 sm:shrink-0">
            <time className="font-medium text-foreground">
              {formatLivingObjectPassportDate(entry.entryDate, locale)}
            </time>
            <p className="mt-1">{entry.relationLabel}</p>
            <p className="mt-0.5">{entry.stateLabel}</p>
          </div>

          <div className="min-w-0 sm:flex-1">
            <div className="grid gap-3 sm:flex sm:items-start">
              <div className="min-w-0 sm:flex-1">
                <h3 className="text-base font-semibold break-words text-foreground">
                  <Link
                    href={entry.href}
                    className="hover:text-primary hover:underline"
                  >
                    {entry.title}
                  </Link>
                </h3>
                {longBody ? (
                  <details className="group/note mt-2">
                    <summary className="cursor-pointer list-none text-sm leading-6 text-foreground">
                      <span className="line-clamp-3 whitespace-pre-wrap">
                        {entry.body}
                      </span>
                      <span className="mt-1 inline-block text-xs font-semibold text-primary group-open/note:hidden">
                        {copy.readFullNote}
                      </span>
                    </summary>
                    <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-foreground">
                      {entry.body}
                    </p>
                  </details>
                ) : (
                  <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-foreground">
                    {entry.body}
                  </p>
                )}
              </div>
              {entry.mediaPublicUrl ? (
                <Image
                  src={entry.mediaPublicUrl}
                  alt={`${entry.title} photo`}
                  width={240}
                  height={180}
                  sizes="(min-width: 640px) 8rem, 100vw"
                  unoptimized
                  className="aspect-4/3 w-full rounded-md border border-border object-cover sm:w-32"
                />
              ) : null}
            </div>

            <nav
              aria-label={`${copy.chronology}: ${entry.title}`}
              className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-2 text-xs"
            >
              {entry.newer ? (
                <Link
                  href={entry.newer.href}
                  className="flex min-w-0 items-center gap-1 text-muted-foreground hover:text-primary"
                >
                  <ChevronLeft
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="truncate">
                    {copy.newer}: {entry.newer.title}
                  </span>
                </Link>
              ) : null}
              {entry.older ? (
                <Link
                  href={entry.older.href}
                  className="flex min-w-0 items-center gap-1 text-muted-foreground hover:text-primary"
                >
                  <span className="truncate">
                    {copy.older}: {entry.older.title}
                  </span>
                  <ChevronRight
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                </Link>
              ) : null}
            </nav>

            {renderEntryActions ? (
              <div className="mt-3 border-t border-border pt-3">
                {renderEntryActions(entry)}
              </div>
            ) : null}
          </div>
        </article>
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
    return <PawPrint className="size-5" aria-hidden="true" />;
  }
  if (kind === "bee_colony") {
    return <Hexagon className="size-5" aria-hidden="true" />;
  }
  return <Sprout className="size-5" aria-hidden="true" />;
}
