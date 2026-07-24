import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CalendarDays,
  MapPin,
  PawPrint,
  Settings,
  Sprout,
  UserRound,
} from "lucide-react";

import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import {
  SiteShellContextRailModules,
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { JournalDocumentRenderer } from "@/components/garden/journal-document-renderer";
import { buttonVariants } from "@/components/ui/button";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import {
  legacyBodyToJournalDocumentV1,
  normalizeJournalDocument,
} from "@/lib/garden/journal-document";
import { getCoarseRegionLabel } from "@/lib/garden/regions";
import type { PublicJournalEntryCopy } from "@/lib/public-journal-entry-copy";
import type { PublicLocale } from "@/lib/public-localization";
import { cn } from "@/lib/utils";
import type {
  PublicJournalEntryObject,
  PublicJournalEntryPage,
} from "@/server/journal-repository";
import type { OwnerJournalEntryControl } from "@/server/owner-journal-entry-control";

export function PublicJournalEntryView({
  locale,
  copy,
  page,
  directoryReturnTo,
  ownerControl,
  children,
}: {
  locale: PublicLocale;
  copy: PublicJournalEntryCopy;
  page: PublicJournalEntryPage;
  directoryReturnTo: string;
  ownerControl: OwnerJournalEntryControl | null;
  children?: ReactNode;
}) {
  const contextModules = buildContextModules(page, copy);
  const location = getSafeLocation(page, copy);
  const mentionedProfiles = page.mentionedProfiles ?? [];

  return (
    <main
      lang={locale}
      data-public-journal-entry="true"
      data-entry-context={page.context.kind}
      className="mx-auto flex w-full max-w-4xl flex-col px-4 py-4 sm:px-6 sm:py-5"
    >
      <SiteShellContextRailRegistration modules={contextModules} />

      <nav
        aria-label={copy.journal}
        className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3"
      >
        <Link
          href={directoryReturnTo}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeft aria-hidden="true" />
          {copy.journals}
        </Link>
        {ownerControl ? (
          <Link
            href={ownerControl.managePath}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Settings aria-hidden="true" />
            {copy.manageEntry}
          </Link>
        ) : null}
      </nav>

      <JournalContextStrip page={page} copy={copy} location={location} />

      <article className="min-w-0">
        <header className="grid gap-4 border-b border-border py-5 sm:py-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {page.context.kind === "object"
                ? copy.objectJournal
                : copy.spaceJournal}
            </span>
            <time
              dateTime={serializeDate(page.entry.entryDate)}
              className="inline-flex items-center gap-1.5"
            >
              <CalendarDays className="size-4" aria-hidden="true" />
              {formatDate(page.entry.entryDate, locale)}
            </time>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden="true" />
              {location}
            </span>
          </div>

          <h1 className="max-w-3xl text-3xl leading-tight font-semibold text-foreground sm:text-4xl">
            {page.entry.title}
          </h1>

          {page.author ? (
            <Link
              href={page.author.profilePath}
              className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-primary"
            >
              <span className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                {page.author.avatarUrl ? (
                  <Image
                    src={page.author.avatarUrl}
                    alt=""
                    width={32}
                    height={32}
                    unoptimized
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRound className="size-4" aria-hidden="true" />
                )}
              </span>
              <span>
                {copy.by} <strong>{page.author.displayName}</strong>
                <span className="ml-1">{page.author.mention}</span>
              </span>
            </Link>
          ) : null}
        </header>

        {page.media.length > 0 ? (
          <JournalMediaGallery page={page} copy={copy} />
        ) : null}

        <div className="grid gap-5 py-6 text-base leading-8 text-foreground sm:text-lg sm:leading-8">
          <PublicJournalEntryBody locale={locale} page={page} copy={copy} />
        </div>

        {mentionedProfiles.length > 0 ? (
          <section
            aria-labelledby="journal-entry-mentioned-gardeners"
            data-dynamic-person-mentions="stable-user-id"
            className="border-t border-border py-4"
          >
            <h2
              id="journal-entry-mentioned-gardeners"
              className="mb-2 text-xs font-semibold text-muted-foreground uppercase"
            >
              {copy.mentionedGardeners}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {mentionedProfiles.map((profile) => (
                <li key={profile.handle}>
                  <Link
                    href={profile.profilePath}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    <UserRound aria-hidden="true" />
                    <span>{profile.displayName}</span>
                    <span className="text-muted-foreground">
                      {profile.mention}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {page.topics.length > 0 ? (
          <section
            aria-labelledby="journal-entry-topics"
            className="border-t border-border py-4"
          >
            <h2
              id="journal-entry-topics"
              className="mb-2 text-xs font-semibold text-muted-foreground uppercase"
            >
              {copy.topics}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {page.topics.map((topic) => (
                <li key={topic.slug}>
                  <Link
                    href={topic.publicPath}
                    className={buttonVariants({
                      variant: "secondary",
                      size: "sm",
                    })}
                  >
                    {topic.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>

      <JournalChronology page={page} copy={copy} locale={locale} />

      {page.relatedEntries.length > 0 ? (
        <section
          aria-labelledby="related-journal-history"
          className="grid gap-3 border-t border-border py-5"
        >
          <h2
            id="related-journal-history"
            className="text-lg font-semibold text-foreground"
          >
            {copy.relatedHistory}
          </h2>
          <ol className="grid gap-3 sm:grid-cols-2">
            {page.relatedEntries.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={entry.publicPath}
                  className="grid h-full gap-2 rounded-md border border-border p-3 transition-colors hover:border-primary"
                >
                  <time className="text-xs text-muted-foreground">
                    {formatDate(entry.entryDate, locale)}
                  </time>
                  <strong className="text-sm text-foreground">
                    {entry.title}
                  </strong>
                  <span className="line-clamp-2 text-sm leading-5 text-muted-foreground">
                    {entry.bodyPreview}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {children}

      <aside className="border-t border-border py-5 xl:hidden">
        <SiteShellContextRailModules modules={contextModules} />
      </aside>
    </main>
  );
}

function JournalContextStrip({
  page,
  copy,
  location,
}: {
  page: PublicJournalEntryPage;
  copy: PublicJournalEntryCopy;
  location: string;
}) {
  if (page.context.kind === "space") {
    return (
      <section className="grid gap-3 border-b border-border py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <BookOpenText className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{copy.contextSpace}</p>
            <h2 className="truncate text-base font-semibold text-foreground">
              {page.context.space.displayName}
            </h2>
            <p className="text-xs text-muted-foreground">{location}</p>
          </div>
        </div>
        {page.context.mentionedObjects.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {copy.mentionedObjects}
            </span>
            {page.context.mentionedObjects.map((mentioned) => (
              <Link
                key={mentioned.plantObjectId}
                href={mentioned.publicPath}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ObjectKindIcon kind={mentioned.objectKind} />
                {mentioned.displayName}
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  const object = page.context.object;
  const identity = object.catalogCanonicalName ?? object.varietyText;

  return (
    <section className="flex min-w-0 flex-col gap-3 border-b border-border py-4 sm:flex-row sm:items-center sm:justify-between">
      <Link
        href={object.publicPath}
        className="flex min-w-0 items-center gap-3 hover:text-primary"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <ObjectKindIcon kind={object.objectKind} />
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">
            {copy.contextObject}
          </span>
          <strong className="block truncate text-base text-foreground">
            {object.displayName}
          </strong>
          <span className="block truncate text-xs text-muted-foreground">
            {identity ?? copy.identityPending} · {location}
          </span>
        </span>
      </Link>
      <Link
        href={object.publicPath}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        {copy.openObject}
        <ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}

function JournalMediaGallery({
  page,
  copy,
}: {
  page: PublicJournalEntryPage;
  copy: PublicJournalEntryCopy;
}) {
  return (
    <section
      aria-labelledby="journal-entry-media"
      data-journal-media-count={page.media.length}
      className="grid gap-2 border-b border-border py-5"
    >
      <h2 id="journal-entry-media" className="sr-only">
        {copy.media}
      </h2>
      <figure className="grid gap-2">
        <SubjectAwareMediaImage
          src={page.media[0]!.publicUrl}
          alt={page.media[0]!.altText ?? `${page.entry.title}, 1`}
          width={1200}
          height={900}
          sizes="(min-width: 1280px) 48rem, 100vw"
          priority
          unoptimized
          presentationMode="contain"
          focalX={page.media[0]!.focalX}
          focalY={page.media[0]!.focalY}
          intrinsicWidth={page.media[0]!.intrinsicWidth}
          intrinsicHeight={page.media[0]!.intrinsicHeight}
          className="aspect-4/3 w-full rounded-md border border-border bg-muted"
        />
        {page.media[0]!.caption ? (
          <figcaption className="text-sm text-muted-foreground">
            {page.media[0]!.caption}
          </figcaption>
        ) : null}
      </figure>
      {page.media.length > 1 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {page.media.slice(1).map((media, index) => (
            <li key={media.id}>
              <figure className="grid gap-1.5">
                <SubjectAwareMediaImage
                  src={media.publicUrl}
                  alt={media.altText ?? `${page.entry.title}, ${index + 2}`}
                  width={720}
                  height={540}
                  sizes="(min-width: 640px) 15rem, 50vw"
                  unoptimized
                  presentationMode="contain"
                  focalX={media.focalX}
                  focalY={media.focalY}
                  intrinsicWidth={media.intrinsicWidth}
                  intrinsicHeight={media.intrinsicHeight}
                  className="aspect-4/3 w-full rounded-md border border-border bg-muted"
                />
                {media.caption ? (
                  <figcaption className="text-xs text-muted-foreground">
                    {media.caption}
                  </figcaption>
                ) : null}
              </figure>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function JournalChronology({
  page,
  copy,
  locale,
}: {
  page: PublicJournalEntryPage;
  copy: PublicJournalEntryCopy;
  locale: PublicLocale;
}) {
  const adjacent = [
    page.adjacentEntries.older
      ? {
          ...page.adjacentEntries.older,
          label: copy.previousEntry,
          icon: <ArrowLeft aria-hidden="true" />,
          align: "start" as const,
        }
      : null,
    page.adjacentEntries.newer
      ? {
          ...page.adjacentEntries.newer,
          label: copy.nextEntry,
          icon: <ArrowRight aria-hidden="true" />,
          align: "end" as const,
        }
      : null,
  ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (adjacent.length === 0) return null;

  return (
    <nav
      aria-label={copy.contextHistory}
      data-journal-chronology="true"
      className="grid min-w-0 gap-3 border-t border-border py-5 sm:grid-cols-2"
    >
      {adjacent.map((entry) => (
        <Link
          key={`${entry.label}:${entry.id}`}
          href={entry.publicPath}
          className={cn(
            "flex min-h-20 max-w-full min-w-0 items-center gap-3 rounded-md border border-border p-3 transition-colors hover:border-primary",
            entry.align === "end" && "sm:col-start-2 sm:text-right",
          )}
        >
          {entry.align === "start" ? entry.icon : null}
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">
              {entry.label} · {formatDate(entry.entryDate, locale)}
            </span>
            <strong className="mt-1 block truncate text-sm text-foreground">
              {entry.title}
            </strong>
          </span>
          {entry.align === "end" ? entry.icon : null}
        </Link>
      ))}
    </nav>
  );
}

function buildContextModules(
  page: PublicJournalEntryPage,
  copy: PublicJournalEntryCopy,
): SiteShellContextRailModule[] {
  const contextItems =
    page.context.kind === "object"
      ? [
          {
            href: page.context.object.publicPath,
            label: page.context.object.displayName,
            meta:
              page.context.object.catalogCanonicalName ??
              page.context.object.varietyText ??
              undefined,
          },
          page.context.object.catalogCanonicalName &&
          getJournalEntryCatalogPath(page.context.object)
            ? {
                href: getJournalEntryCatalogPath(page.context.object)!,
                label: page.context.object.catalogCanonicalName,
                meta: copy.identity,
              }
            : null,
        ].filter((item): item is NonNullable<typeof item> => item !== null)
      : page.context.mentionedObjects.map((object) => ({
          href: object.publicPath,
          label: object.displayName,
          meta: object.catalogCanonicalName ?? object.varietyText ?? undefined,
        }));
  const modules: SiteShellContextRailModule[] = [
    {
      key: "journal-context",
      title:
        page.context.kind === "object" ? copy.contextObject : copy.contextSpace,
      items: contextItems,
      emptyLabel: page.context.space.displayName,
    },
    {
      key: "journal-history",
      title: copy.contextHistory,
      items: page.relatedEntries.map((entry) => ({
        href: entry.publicPath,
        label: entry.title,
      })),
    },
    {
      key: "journal-topics",
      title: copy.contextTopics,
      items: page.topics.map((topic) => ({
        href: topic.publicPath,
        label: topic.label,
      })),
    },
  ];

  if (page.author) {
    modules.push({
      key: "journal-author",
      title: copy.contextAuthor,
      items: [
        {
          href: page.author.profilePath,
          label: page.author.displayName,
          meta: page.author.mention,
        },
      ],
    });
  }

  return modules;
}

function getSafeLocation(
  page: PublicJournalEntryPage,
  copy: PublicJournalEntryCopy,
) {
  const locationSource =
    page.context.kind === "object" ? page.context.object : page.context.space;
  if (locationSource.locationVisibility !== "region") {
    return copy.locationHidden;
  }

  const code =
    locationSource.coarseRegionCode ??
    (page.context.space.locationVisibility === "region"
      ? page.context.space.coarseRegionCode
      : null);
  const label = getCoarseRegionLabel(code);
  return label ? `${copy.safeRegion}: ${label}` : copy.locationHidden;
}

function PublicJournalEntryBody({
  locale,
  page,
  copy,
}: {
  locale: PublicLocale;
  page: PublicJournalEntryPage;
  copy: PublicJournalEntryCopy;
}) {
  const imagesByMediaId = new Map(
    page.media.map((item, index) => [
      item.id,
      {
        mediaAssetId: item.id,
        src: item.publicUrl,
        alt: item.altText?.trim() || `${page.entry.title} ${index + 1}`,
        caption: item.caption,
      },
    ]),
  );

  if (page.entry.contentDocument != null) {
    const normalized = normalizeJournalDocument(page.entry.contentDocument);
    if (!normalized.ok) {
      return (
        <JournalDocumentRenderer
          document={null}
          unavailable
          copy={{
            unavailableTitle: copy.journal,
            unavailableBody: page.entry.body,
          }}
        />
      );
    }
    return (
      <JournalDocumentRenderer
        document={normalized.document}
        imagesByMediaId={imagesByMediaId}
        copy={{
          unavailableTitle: copy.journal,
          unavailableBody: page.entry.body,
        }}
      />
    );
  }

  const legacy = legacyBodyToJournalDocumentV1(page.entry.body);
  if (legacy.blocks.length > 0) {
    return (
      <JournalDocumentRenderer
        document={legacy}
        imagesByMediaId={imagesByMediaId}
        copy={{
          unavailableTitle: copy.journal,
          unavailableBody: page.entry.body,
        }}
      />
    );
  }

  return (
    <>
      {splitBody(page.entry.body).map((paragraph, index) => (
        <p
          key={`${page.entry.id}:paragraph:${index}`}
          className="whitespace-pre-line"
          lang={locale}
        >
          {paragraph}
        </p>
      ))}
    </>
  );
}

function ObjectKindIcon({
  kind,
}: {
  kind: PublicJournalEntryObject["objectKind"];
}) {
  if (kind === "animal") {
    return <PawPrint className="size-5" aria-hidden="true" />;
  }
  return <Sprout className="size-5" aria-hidden="true" />;
}

function splitBody(body: string) {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return paragraphs.length > 0 ? paragraphs : [body];
}

function formatDate(value: Date | string, locale: PublicLocale) {
  return new Intl.DateTimeFormat(
    locale === "uk" ? "uk-UA" : locale === "bg" ? "bg-BG" : "ru-RU",
    { day: "numeric", month: "long", year: "numeric" },
  ).format(new Date(value));
}

function serializeDate(value: Date | string) {
  return new Date(value).toISOString();
}

export function getJournalEntryCatalogPath(object: PublicJournalEntryObject) {
  if (!object.catalogKind || !object.catalogPublicSlug) return null;
  return publicCatalogEvidencePath(
    object.catalogKind,
    object.catalogPublicSlug,
  );
}
