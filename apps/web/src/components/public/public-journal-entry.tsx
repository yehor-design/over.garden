import { DirectoryReturnLink } from "@/components/public/directory-return-link";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon as ArrowLeft } from "@/components/icons/ArrowLeft";
import { ArrowRightIcon as ArrowRight } from "@/components/icons/ArrowRight";
import { MapPinIcon as MapPin } from "@/components/icons/MapPin";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { GearIcon as Settings } from "@/components/icons/Gear";
import { PlantIcon as Sprout } from "@/components/icons/Plant";

import { buildPublicMediaSourceSet } from "@/lib/media/derivative-keys";
import {
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { JournalDocumentRenderer } from "@/components/garden/journal-document-renderer";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MediaFigure } from "@/components/ui/media-figure";
import { Section } from "@/components/ui/section";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import {
  legacyBodyToJournalDocumentV1,
  listJournalDocumentImageMediaIds,
  normalizeJournalDocument,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import { getCoarseRegionLabel } from "@/lib/garden/regions";
import type { PublicJournalEntryCopy } from "@/lib/public-journal-entry-copy";
import type { PublicLocale } from "@/lib/public-localization";
import { publicMediaAltText } from "@/lib/public-media-alt";
import { cn } from "@/lib/utils";
import type {
  PublicJournalEntryObject,
  PublicJournalEntryPage,
} from "@/server/journal-repository";

/** The owner's link to the editor, for the slot `PublicJournalEntryView` offers. */
export function OwnerEntryControlLink({
  managePath,
  label,
}: {
  managePath: string;
  label: string;
}) {
  return (
    <Link
      href={managePath}
      className={buttonVariants({ variant: "secondary", size: "sm" })}
    >
      <Settings aria-hidden="true" />
      {label}
    </Link>
  );
}

/**
 * The page the whole product exists to produce.
 *
 * A 704 px reading column at 18/29, a byline saying who kept this journal and
 * when, photographs at the column's full width, and the object and the
 * organism it is about reachable in one press. Most of its readers will arrive
 * from a search engine, on a phone, and see it once.
 *
 * ## Two boundaries this file does not cross
 *
 * **The document's HTML is not the page's.** `JournalDocumentRenderer` is
 * untouched by this redesign and is handed **no `className`**, because ADR-0028
 * promises that an entry published before Slice 26 renders byte for byte what
 * it rendered before. The reading column's typography therefore sits on the
 * ancestor of the renderer, never on the renderer. `journal-document-renderer.test.tsx`
 * holds the golden file that keeps that true.
 *
 * **The engagement controls are not this component's.** They arrive as
 * `children` from the route, which resolves the viewer's like state beside its
 * own reads, and each one is a `<form action={serverAction}>` on a real
 * endpoint (ADR-0024 D3).
 *
 * ## Why there is no inline copy of the context rail
 *
 * The rail is absent below `xl` and nothing in it is the only route to
 * anything: the object, the organism, the topics and the author are all linked
 * from "what this entry is about" in the column, and the author's other
 * entries are the related strip. The feed keeps an inline copy because its
 * rail holds destinations the feed does not otherwise offer; this page does
 * not need one, and rendering it twice would give a reader the same four links
 * twice on a phone.
 */
export function PublicJournalEntryView({
  locale,
  copy,
  page,
  directoryReturnTo,
  ownerControl = null,
  children,
}: {
  locale: PublicLocale;
  copy: PublicJournalEntryCopy;
  page: PublicJournalEntryPage;
  directoryReturnTo: string;
  /**
   * The owner's way into the editor. A slot, not data: whether the reader owns
   * this entry is request data, and the entry is a static document
   * (ADR-0032 D2), so the route fills this from a region that reads the
   * session and the article itself never asks. See `OwnerEntryControlLink`.
   */
  ownerControl?: ReactNode;
  children?: ReactNode;
}) {
  const contextModules = buildContextModules(page, copy);
  const location = getSafeLocation(page, copy);
  const mentionedProfiles = page.mentionedProfiles ?? [];

  // A photograph the story already shows is never shown again (`OVE-471`).
  // Since the composer became Notion-shaped a photograph *is* a block of the
  // document, and the cover is usually the first of them — so the page drew it
  // above the story and the story drew it again directly underneath, and the
  // gallery at the foot repeated the rest. A cover uploaded on its own is in
  // no block, so it still has this page as its only way onto the screen.
  const entryDocument = resolveEntryDocument(page);
  const inDocument = photographsTheDocumentShows(entryDocument, page.media);
  const [cover, ...rest] = page.media.filter(
    (item) => !inDocument.includes(item.id),
  );
  // Removing the cover must not cost the page its LCP element: whatever is
  // drawn first is asked for first (DESIGN.md §9).
  const leadPhotographId = cover ? null : (inDocument[0] ?? null);

  return (
    <main
      // The gardener's language, not the reader's (ADR-0029 D11). This element
      // holds the entry's own words, so a `lang` taken from the interface told
      // a screen reader to read Ukrainian with Bulgarian phonetics whenever a
      // Bulgarian reader opened a Ukrainian entry.
      lang={page.entry.sourceLanguage}
      data-public-journal-entry="true"
      data-entry-context={page.context.kind}
      className="flex w-full min-w-0 flex-col gap-8 px-4 py-8 sm:px-6 md:py-12"
    >
      <SiteShellContextRailRegistration modules={contextModules} />

      <nav
        aria-label={copy.journal}
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <DirectoryReturnLink href={directoryReturnTo} label={copy.journals} />
        {ownerControl}
      </nav>

      <article className="grid min-w-0 gap-6">
        <header className="grid gap-4">
          <p className="text-overline text-text-muted uppercase">
            {page.context.kind === "object"
              ? copy.objectJournal
              : copy.spaceJournal}
          </p>
          {/* The page's one `h1`. A level-1 heading inside the document
              renders as an `h2` (ADR-0028), so this stays the only one. */}
          <h1 className="text-display text-balance text-text-heading">
            {page.entry.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-text-muted">
            <time dateTime={serializeDate(page.entry.entryDate)}>
              {formatDate(page.entry.entryDate, locale)}
            </time>
            <span className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden="true" className="size-4" />
              {location}
            </span>
          </div>
          {page.author ? (
            <Link
              href={page.author.profilePath}
              className="flex w-fit items-center gap-2 text-body-sm text-text-secondary underline-offset-2 hover:text-text-link hover:underline"
            >
              <Avatar
                src={page.author.avatarUrl}
                name={page.author.displayName}
                size="md"
              />
              <span>
                {copy.by} <strong>{page.author.displayName}</strong>
                {/* A gardener who has set no display name is shown by their
                    handle, and then the mention beside it is the same string
                    twice. */}
                {page.author.mention === page.author.displayName ? null : (
                  <span className="text-text-muted">
                    {" "}
                    {page.author.mention}
                  </span>
                )}
              </span>
            </Link>
          ) : null}
        </header>

        {cover ? (
          <MediaFigure
            src={buildPublicMediaSourceSet(cover).src}
            srcSet={buildPublicMediaSourceSet(cover).srcSet}
            alt={publicMediaAltText(cover, page.entry.title)}
            caption={cover.caption}
            placeholderDataUri={cover.placeholderDataUri}
            focalX={cover.focalX}
            focalY={cover.focalY}
            intrinsicWidth={cover.intrinsicWidth}
            intrinsicHeight={cover.intrinsicHeight}
            aspect="cover"
            priority
            data-journal-cover="true"
          />
        ) : null}

        {/* The reading column's typography, on the ancestor of the renderer
            and never on the renderer itself — see the note at the top. */}
        <div
          data-journal-prose="true"
          className="grid gap-5 text-body-lg text-text"
        >
          <PublicJournalEntryBody
            locale={locale}
            page={page}
            copy={copy}
            entryDocument={entryDocument}
            leadPhotographId={leadPhotographId}
          />
        </div>

        {rest.length > 0 ? (
          <Section
            id="journal-entry-media"
            title={copy.media}
            headingClassName="sr-only"
            data-journal-media-count={page.media.length}
          >
            <ul className="grid min-w-0 gap-4 sm:grid-cols-2">
              {rest.map((media) => (
                <li key={media.id} className="min-w-0">
                  <MediaFigure
                    src={buildPublicMediaSourceSet(media).src}
                    srcSet={buildPublicMediaSourceSet(media).srcSet}
                    alt={publicMediaAltText(media, page.entry.title)}
                    caption={media.caption}
                    placeholderDataUri={media.placeholderDataUri}
                    focalX={media.focalX}
                    focalY={media.focalY}
                    intrinsicWidth={media.intrinsicWidth}
                    intrinsicHeight={media.intrinsicHeight}
                    aspect="card"
                    sizes="(max-width: 639px) 100vw, 336px"
                  />
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <JournalAboutBlock page={page} copy={copy} location={location} />

        {mentionedProfiles.length > 0 ? (
          <Section
            id="journal-entry-mentioned-gardeners"
            title={copy.mentionedGardeners}
            data-dynamic-person-mentions="stable-user-id"
          >
            <ul className="flex flex-wrap gap-2">
              {mentionedProfiles.map((profile) => (
                <li key={profile.handle}>
                  <Link
                    href={profile.profilePath}
                    className={buttonVariants({
                      variant: "secondary",
                      size: "sm",
                    })}
                  >
                    <span>{profile.displayName}</span>
                    <span className="text-text-muted">{profile.mention}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </article>

      {children}

      <JournalChronology page={page} copy={copy} locale={locale} />

      {page.relatedEntries.length > 0 ? (
        <Section id="related-journal-history" title={copy.relatedHistory}>
          <ol className="grid list-none gap-3 sm:grid-cols-2">
            {page.relatedEntries.map((entry) => (
              <li key={entry.id} className="min-w-0">
                <Card as="section" interactive className="h-full p-4">
                  <time className="text-caption text-text-muted">
                    {formatDate(entry.entryDate, locale)}
                  </time>
                  <h3 className="mt-1 text-h4 text-text-heading">
                    <Link
                      href={entry.publicPath}
                      className="underline-offset-2 hover:text-text-link hover:underline"
                    >
                      {entry.title}
                    </Link>
                  </h3>
                  <p className="mt-1 line-clamp-2 text-body-sm text-text-muted">
                    {entry.bodyPreview}
                  </p>
                </Card>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
    </main>
  );
}

/**
 * What this entry is about: the object, the organism, the place and the
 * topics, each a link, each already in the entity graph the SEO work built.
 *
 * It replaces the strip that sat above the title. A reader arriving from a
 * search engine wants the entry first and its context after it, and a
 * crawler wants both — putting the context above the `h1` pushed the thing
 * they came for below the fold on a phone.
 */
function JournalAboutBlock({
  page,
  copy,
  location,
}: {
  page: PublicJournalEntryPage;
  copy: PublicJournalEntryCopy;
  location: string;
}) {
  const object = page.context.kind === "object" ? page.context.object : null;
  const organismPath = object ? getJournalEntryCatalogPath(object) : null;
  const mentioned =
    page.context.kind === "space" ? page.context.mentionedObjects : [];

  return (
    <Section
      id="journal-entry-about"
      title={copy.aboutTitle}
      className="rounded-lg border border-border p-4"
    >
      <dl className="grid gap-3 text-body-sm sm:grid-cols-2">
        {object ? (
          <div className="grid min-w-0 gap-1">
            <dt className="text-caption text-text-muted">
              {copy.contextObject}
            </dt>
            <dd className="min-w-0">
              <Link
                href={object.publicPath}
                className="inline-flex items-center gap-1.5 text-text underline-offset-2 hover:text-text-link hover:underline"
              >
                <ObjectKindIcon kind={object.objectKind} />
                {object.displayName}
              </Link>
            </dd>
          </div>
        ) : (
          <div className="grid min-w-0 gap-1">
            <dt className="text-caption text-text-muted">
              {copy.contextSpace}
            </dt>
            <dd className="min-w-0 text-text">
              {page.context.space.displayName}
            </dd>
          </div>
        )}

        {object?.catalogCanonicalName ? (
          <div className="grid min-w-0 gap-1">
            <dt className="text-caption text-text-muted">{copy.identity}</dt>
            <dd className="min-w-0">
              {/* A species' canonical name is Latin and says so; a variety's
                  or a breed's is a cultivar name in somebody's language and is
                  left unmarked (DESIGN.md §6). */}
              <ScientificName
                name={object.catalogCanonicalName}
                isSpecies={object.catalogKind === "species"}
                href={organismPath}
              />
            </dd>
          </div>
        ) : object ? (
          <div className="grid min-w-0 gap-1">
            <dt className="text-caption text-text-muted">{copy.identity}</dt>
            <dd className="min-w-0 text-text-muted">
              {object.varietyText ?? copy.identityPending}
            </dd>
          </div>
        ) : null}

        <div className="grid min-w-0 gap-1">
          <dt className="text-caption text-text-muted">{copy.safeRegion}</dt>
          <dd className="min-w-0 text-text">{location}</dd>
        </div>

        {page.topics.length > 0 ? (
          <div className="grid min-w-0 gap-1">
            <dt className="text-caption text-text-muted">{copy.topics}</dt>
            <dd className="min-w-0">
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {page.topics.map((topic) => (
                  <li key={topic.slug}>
                    <Link
                      href={topic.publicPath}
                      className="text-text underline-offset-2 hover:text-text-link hover:underline"
                    >
                      #{topic.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}

        {mentioned.length > 0 ? (
          <div className="grid min-w-0 gap-1 sm:col-span-2">
            <dt className="text-caption text-text-muted">
              {copy.mentionedObjects}
            </dt>
            <dd className="min-w-0">
              <ul className="flex flex-wrap gap-2">
                {mentioned.map((item) => (
                  <li key={item.plantObjectId}>
                    <Link
                      href={item.publicPath}
                      className={buttonVariants({
                        variant: "secondary",
                        size: "sm",
                      })}
                    >
                      <ObjectKindIcon kind={item.objectKind} />
                      {item.displayName}
                    </Link>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
      {object ? (
        <Link
          href={object.publicPath}
          className={buttonVariants({
            variant: "secondary",
            size: "sm",
            className: "w-fit",
          })}
        >
          {copy.openObject}
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Link>
      ) : null}
    </Section>
  );
}

/** A scientific name, marked as Latin only when it is one. */
function ScientificName({
  name,
  isSpecies,
  href,
}: {
  name: string;
  isSpecies: boolean;
  href: string | null;
}) {
  const label = (
    <span
      {...(isSpecies ? { lang: "la" } : {})}
      className={isSpecies ? "italic" : undefined}
    >
      {name}
    </span>
  );
  return href ? (
    <Link
      href={href}
      className="text-text underline-offset-2 hover:text-text-link hover:underline"
    >
      {label}
    </Link>
  ) : (
    <span className="text-text">{label}</span>
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
      className="grid min-w-0 gap-3 sm:grid-cols-2"
    >
      {adjacent.map((entry) => (
        <Link
          key={`${entry.label}:${entry.id}`}
          href={entry.publicPath}
          className={cn(
            "flex min-h-20 max-w-full min-w-0 items-center gap-3 rounded-lg border border-border p-4 transition-colors duration-instant ease-out hover:bg-surface-hover",
            entry.align === "end" && "sm:col-start-2 sm:text-right",
          )}
        >
          {entry.align === "start" ? entry.icon : null}
          <span className="min-w-0 flex-1">
            <span className="block text-caption text-text-muted">
              {entry.label} · {formatDate(entry.entryDate, locale)}
            </span>
            <strong className="mt-1 block truncate text-body-sm text-text-heading">
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
          // Same string twice reads as noise and overflows a 300 px rail.
          meta:
            page.author.mention === page.author.displayName
              ? undefined
              : page.author.mention,
        },
      ],
    });
  }

  // A module with nothing in it is a heading with nothing under it, and the
  // rail is discardable by design — so an empty one is dropped rather than
  // drawn. `journal-context` keeps its `emptyLabel`, which is the space's name.
  return modules.filter(
    (module) => module.items.length > 0 || module.emptyLabel !== undefined,
  );
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

/**
 * The entry's story, as one of three things: the document the gardener wrote,
 * the notice that it cannot be read, or the plain paragraphs of an entry from
 * before there were documents.
 *
 * Resolved once, above the page, because the page has to know **which
 * photographs the story shows** before it decides what to draw around it.
 */
type EntryDocument =
  | { kind: "document"; document: JournalDocumentV1 }
  | { kind: "unavailable" }
  | { kind: "paragraphs" };

function resolveEntryDocument(page: PublicJournalEntryPage): EntryDocument {
  if (page.entry.contentDocument != null) {
    const normalized = normalizeJournalDocument(page.entry.contentDocument);
    return normalized.ok
      ? { kind: "document", document: normalized.document }
      : { kind: "unavailable" };
  }
  const legacy = legacyBodyToJournalDocumentV1(page.entry.body);
  return legacy.blocks.length > 0
    ? { kind: "document", document: legacy }
    : { kind: "paragraphs" };
}

/**
 * The entry's photographs that the story itself shows, in the order it shows
 * them. A block naming a photograph this reader may not see — revoked, or of
 * another entry — renders nothing, so it is not one of them and the page keeps
 * its own copy.
 */
function photographsTheDocumentShows(
  entryDocument: EntryDocument,
  media: PublicJournalEntryPage["media"],
): string[] {
  if (entryDocument.kind !== "document") return [];
  const visible = new Set(media.map((item) => item.id));
  return listJournalDocumentImageMediaIds(entryDocument.document).filter((id) =>
    visible.has(id),
  );
}

function PublicJournalEntryBody({
  locale,
  page,
  copy,
  entryDocument,
  leadPhotographId,
}: {
  locale: PublicLocale;
  page: PublicJournalEntryPage;
  copy: PublicJournalEntryCopy;
  entryDocument: EntryDocument;
  leadPhotographId: string | null;
}) {
  const imagesByMediaId = new Map(
    page.media.map((item) => [
      item.id,
      {
        mediaAssetId: item.id,
        src: item.publicUrl,
        // A photograph in the story is served from the same ladder as one the
        // page draws: the reading column is 704 px and the primary rendition
        // is up to 2560 px wide (ADR-0022 D2). Photographs with no variants —
        // every one uploaded before the ladder existed — get `null` and the
        // one file there is.
        srcSet: buildPublicMediaSourceSet(item).srcSet,
        alt: publicMediaAltText(item, page.entry.title),
        caption: item.caption,
        placeholderDataUri: item.placeholderDataUri,
        // Its own ratio, so the box is the photograph's rather than the 4:3
        // the renderer falls back to (DESIGN.md §2.10).
        width: item.intrinsicWidth ?? undefined,
        height: item.intrinsicHeight ?? undefined,
        focalX: item.focalX,
        focalY: item.focalY,
      },
    ]),
  );

  if (entryDocument.kind === "unavailable") {
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

  if (entryDocument.kind === "document") {
    return (
      <JournalDocumentRenderer
        document={entryDocument.document}
        imagesByMediaId={imagesByMediaId}
        leadImageMediaId={leadPhotographId}
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
    return <PawPrint className="size-4" aria-hidden="true" />;
  }
  return <Sprout className="size-4" aria-hidden="true" />;
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
  return publicCatalogEvidencePath({
    catalogKind: object.catalogKind,
    publicSlug: object.catalogPublicSlug,
    speciesSlug: object.catalogSpeciesSlug,
  });
}
