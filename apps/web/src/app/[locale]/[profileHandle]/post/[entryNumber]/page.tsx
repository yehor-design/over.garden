import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";

import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import { PublicJournalEntryView } from "@/components/public/public-journal-entry";
import { getPublicJournalEntryCopy } from "@/lib/public-journal-entry-copy";
import { normalizePublicJournalDirectoryReturnTo } from "@/lib/public-journal-directory-navigation";
import { isPublicLocale, type PublicLocale } from "@/lib/public-localization";
import type { PublicJournalEntryPage } from "@/server/journal-repository";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfacePayload,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { publicMediaAltText } from "@/lib/public-media-alt";
import { logAddressRefusal } from "@/server/address-refusal-log";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";
import { STATIC_PARAMS_PLACEHOLDER } from "@/server/public-prerender";
import {
  deferStaticRenderAfterFailure,
  deferStaticRenderWithoutDatabase,
  renderStaticPublicPage,
  StaticRenderDeferred,
  type PublicRenderPhase,
} from "@/server/static-public-page";
import {
  readGuestEngagementSummary,
  readPublicJournalEntry,
} from "@/server/public-cache";
import { matchAuthorScopedEntryPath } from "@/lib/address/match-address-path";
import { routeHandleSegment } from "@/lib/address/route-segments";
import { publicCatalogPermalinkPath } from "@/lib/catalog/addresses";
import {
  PUBLIC_JOURNAL_ENTRY_SEGMENT,
  publicCatalogEvidencePath,
  publicProfileBasePath,
} from "@/lib/garden/public-paths";
import { absolutePublicUrl } from "@/lib/garden/public-url";

import { OwnerEntryControl, ViewerEngagementPanel } from "./entry-regions";

/**
 * An entry at its address: `/@{handle}/post/{n}` (ADR-0029 D9, amendment of
 * 2026-09-18).
 *
 * The author's handle and the entry's number are the key, so there is no
 * second gardener to check the entry against: `/@someone-else/post/{n}` names
 * a different entry or none, where `/@someone-else/{slug}` could be typed over
 * a real one. The segments still go through the address matcher rather than
 * being trusted, because a route receives whatever the URL carried — `/post/012`
 * and `/post/1a` reach this file too when a request skips the proxy's
 * document-navigation check, and neither is an address.
 */
interface PublicJournalEntryRouteProps {
  params: Promise<{
    locale: string;
    profileHandle: string;
    entryNumber: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function resolveAddress(input: { profileHandle: string; entryNumber: string }) {
  // The handle is decoded — `@` arrives as itself or as `%40` — and the number
  // is not: digits are ASCII, `%31` is not how anything spells `1`, and the
  // proxy refuses it on a document request, so the route refuses it too.
  return matchAuthorScopedEntryPath(
    `${publicProfileBasePath(routeHandleSegment(input.profileHandle))}/${PUBLIC_JOURNAL_ENTRY_SEGMENT}/${input.entryNumber}`,
  );
}

export async function generateMetadata({
  params,
}: PublicJournalEntryRouteProps): Promise<Metadata> {
  const { locale: localeParam, ...segments } = await params;
  if (!isPublicLocale(localeParam)) return missingMetadata();
  const address = resolveAddress(segments);
  if (!address) return missingMetadata(localeParam);

  const bounded = await resolvePublicSurfacePayload({
    consumerId: "localized_journal_entry",
    // Prerendered with the page it describes (ADR-0032 D4).
    document: "static",
    load: async () => {
      const lookup = await readPublicJournalEntry(
        address.handle,
        address.entryNumber,
        localeParam,
      );
      if (lookup.status !== "active") {
        throw new Error("Public journal entry unavailable.");
      }
      return {
        source: buildJournalDiscoverySource(lookup.page, localeParam),
        payload: lookup.page,
      };
    },
  });
  if (!bounded.payload) return missingMetadata(localeParam);

  return buildJournalSurface(localeParam, bounded.payload, bounded).metadata;
}

/**
 * One sample, so the route is one Next prerenders per address (ADR-0032 D6).
 *
 * Without `generateStaticParams` an address's params are request data: the
 * route has only its fallback shell, and an entry's words and photograph
 * stream into it on every request. With a sample, the first request for an
 * entry renders it whole and the result is kept — every reader after that gets
 * the entry in the served bytes, and a mutation's cache tags expire it.
 *
 * The sample is a placeholder rather than a row: a build must not need a
 * database (a Vercel Preview has none), and the route refuses the placeholder
 * before it reads anything.
 */
export function generateStaticParams() {
  return [
    {
      profileHandle: STATIC_PARAMS_PLACEHOLDER,
      entryNumber: STATIC_PARAMS_PLACEHOLDER,
    },
  ];
}

export default async function PublicJournalEntryRoute({
  params,
  searchParams,
}: PublicJournalEntryRouteProps) {
  const { locale: localeParam, ...segments } = await params;
  if (!isPublicLocale(localeParam)) {
    logAddressRefusal({
      route: "journal_entry",
      reason: "locale_not_public",
      detail: { locale: localeParam, ...segments },
    });
    notFound();
  }
  // The build's one sample. It renders nothing rather than `notFound()`: a
  // not-found render of a sampled path is a *static* render, where the
  // document's session read is an error instead of a hole (18 of them in the
  // build log, measured). No request reaches here — the proxy answers 404 to
  // an address that spells neither a handle nor a number.
  if (segments.profileHandle === STATIC_PARAMS_PLACEHOLDER) return null;
  const address = resolveAddress(segments);
  if (!address) {
    logAddressRefusal({
      route: "journal_entry",
      reason: "address_unparsed",
      detail: { locale: localeParam, ...segments },
    });
    notFound();
  }

  const locale: PublicLocale = localeParam;
  return renderStaticPublicPage({
    fallback: <RootLoadingSkeleton />,
    render: (phase) =>
      renderPublicJournalEntry(locale, address, searchParams, phase),
  });
}

/**
 * The entry, attempted as a static render and, failing that, at request time
 * (`renderStaticPublicPage`). Every read comes before the first element, so an
 * attempt that cannot finish has rendered nothing.
 */
async function renderPublicJournalEntry(
  locale: PublicLocale,
  address: NonNullable<ReturnType<typeof resolveAddress>>,
  searchParams: PublicJournalEntryRouteProps["searchParams"],
  phase: PublicRenderPhase,
) {
  await deferStaticRenderWithoutDatabase(phase);
  // A read that fails is not prerendered (ADR-0032 D4): statically it defers
  // to the request, and at request time it is the error this reader sees.
  const notPrerendered = (error: unknown): never => {
    unstable_rethrow(error);
    if (error instanceof StaticRenderDeferred) throw error;
    deferStaticRenderAfterFailure(phase);
    throw error;
  };
  const lookup = await readPublicJournalEntry(
    address.handle,
    address.entryNumber,
    locale,
  ).catch(notPrerendered);
  if (lookup.status !== "active") {
    logAddressRefusal({
      route: "journal_entry",
      reason: `lookup_${lookup.status}`,
      detail: {
        locale,
        handle: address.handle,
        entryNumber: String(address.entryNumber),
      },
    });
    notFound();
  }

  // The entry's id (the engagement ref since `0073`): a like stored against
  // the slug was orphaned the day the slug moved under the author.
  const engagementTarget = {
    kind: "journal_entry" as const,
    ref: lookup.page.entry.id,
  };
  // What a guest sees, which is also what the document carries in its bytes
  // and what stays on screen for a reader without JavaScript: the counts, the
  // first page of comments, and controls that post to real endpoints. A failed
  // read is not prerendered (ADR-0032 D4).
  const guestEngagement = await readGuestEngagementSummary(
    engagementTarget,
    null,
  ).catch(notPrerendered);
  const engagementReturnTo = lookup.page.entry.publicPath;
  // A share sends the entry's one address — absolute, with no return path,
  // cursor or sign-in intent — whatever the reader's address bar says.
  const share = {
    url: absolutePublicUrl(lookup.page.entry.publicPath),
    title: lookup.page.entry.title,
  };
  const surface = buildJournalSurface(locale, lookup.page);
  const serializedJsonLd = serializePublicSurfaceJsonLd(surface.jsonLd);

  return (
    <>
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      <PublicJournalEntryView
        locale={locale}
        copy={getPublicJournalEntryCopy(locale)}
        page={lookup.page}
        directoryReturnTo={normalizePublicJournalDirectoryReturnTo(
          undefined,
          locale,
        )}
        ownerControl={
          <Suspense fallback={null}>
            <OwnerEntryControl
              locale={locale}
              publicSlug={lookup.page.entry.publicSlug}
              publicPath={lookup.page.entry.publicPath}
            />
          </Suspense>
        }
      >
        {/* The one part of the page that depends on who is reading and on the
            query string. It is below the article, so nothing a reader came for
            waits on it, and its fallback is the guest's panel — the swap
            changes the controls' state, not the page's shape. */}
        <Suspense
          fallback={
            <PublicEngagementPanel
              isAuthenticated={false}
              locale={locale}
              target={engagementTarget}
              summary={guestEngagement}
              // The like control is drawn only with a like state, and a
              // document has no reader: the count is the guest's, nobody has
              // pressed it, and the form still posts to a real endpoint
              // (ADR-0024 D3). The reader's own state replaces it below.
              likeState={{
                activeLikeCount: guestEngagement.activeLikeCount,
                viewerLiked: false,
              }}
              returnTo={engagementReturnTo}
              share={share}
              resumeAction={null}
              resumeControl={null}
            />
          }
        >
          <ViewerEngagementPanel
            locale={locale}
            target={engagementTarget}
            returnTo={engagementReturnTo}
            share={share}
            searchParams={searchParams}
          />
        </Suspense>
      </PublicJournalEntryView>
    </>
  );
}

function missingMetadata(locale?: PublicLocale): Metadata {
  return {
    title: locale
      ? `${getPublicJournalEntryCopy(locale).metadataTitleSuffix} | OverGarden`
      : "OverGarden",
    robots: resolveUnresolvedPublicSurfaceDiscovery("localized_journal_entry")
      .decision.robots,
  };
}

function buildJournalSurface(
  locale: PublicLocale,
  page: PublicJournalEntryPage,
  discovery: PublicSurfaceDiscoveryResult = resolvePublicSurfaceDiscoveryForRequest(
    buildJournalDiscoverySource(page, locale),
  ),
) {
  const copy = getPublicJournalEntryCopy(locale);
  const subject = entrySubject(page);
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    // The entry's own language, not the reader's. `contentLocale` becomes
    // `inLanguage` in the graph, and it was explicitly suppressed here because
    // there was no honest value to put in it (ADR-0029 D11).
    contentLocale: page.entry.sourceLanguage,
    title: `${page.entry.title} · ${copy.metadataTitleSuffix} | OverGarden`,
    description: summarize(page.entry.body),
    visibleFacts: {
      type: "BlogPosting",
      name: page.entry.title,
      description: summarize(page.entry.body),
      datePublished: toIsoTimestamp(page.entry.publishedAt),
      // The entry's whole graph used to be three facts: a name, a headline and
      // a date. For a product whose claim is first-hand experience from real
      // gardeners, nothing said who wrote it or what it was about (D13).
      ...(page.author
        ? {
            author: {
              // The `@id` is the unprefixed profile address, so an entry read
              // in Bulgarian and the profile page read in Ukrainian name the
              // same person. A locale-prefixed `@id` would make three.
              id: absolutePublicUrl(
                publicProfileBasePath(page.author.handle),
              ),
              name: page.author.displayName,
              url: absolutePublicUrl(page.author.profilePath),
              ...(page.author.avatarUrl
                ? { image: page.author.avatarUrl }
                : {}),
            },
          }
        : {}),
      ...(subject ? { about: subject } : {}),
      // Every photo the page shows, with the caption a reader sees beneath it.
      // The same sentence the page shows under the photo and gives a screen
      // reader (OVE-432) — one rule, so the graph cannot describe a picture
      // differently from the page it is on.
      images: (page.media ?? []).map((media) => ({
        url: media.publicUrl,
        caption: publicMediaAltText(media, page.entry.title),
      })),
      breadcrumbs: breadcrumbsFor(page),
    },
  });
}

function buildJournalDiscoverySource(
  page: PublicJournalEntryPage,
  servedLocale: PublicLocale,
): PublicSurfaceDiscoverySource {
  const context = page.context;
  const topics = page.topics ?? [];
  const relatedEntries = page.relatedEntries ?? [];
  const objectIds =
    context?.kind === "object"
      ? [context.object.plantObjectId]
      : context?.kind === "space"
        ? context.mentionedObjects.map((object) => object.plantObjectId)
        : [];
  const contextText =
    context?.kind === "object"
      ? [
          context.object.displayName,
          context.object.catalogCanonicalName ?? "",
          context.object.varietyText ?? "",
        ]
      : context?.kind === "space"
        ? context.mentionedObjects.flatMap((object) => [
            object.displayName,
            object.catalogCanonicalName ?? "",
            object.varietyText ?? "",
          ])
        : [];
  return {
    consumerId: "localized_journal_entry",
    candidateState: "candidate",
    visibleText: [
      page.entry.title,
      page.entry.body,
      context?.space.displayName ?? "",
      ...contextText,
      ...topics.map((topic) => topic.label),
      ...relatedEntries.flatMap((entry) => [entry.title, entry.bodyPreview]),
    ],
    distinctPublicEntityIds: [
      page.entry.id,
      ...objectIds,
      ...topics.map((topic) => `topic:${topic.slug}`),
    ],
    // A gardener's entry is never translated, so it has one address — under
    // its author, with no locale prefix (ADR-0029 D9, D10). `publicPath` is
    // that address, built where the handle is known; every other spelling of
    // it 308s here.
    canonicalPath: page.entry.publicPath,
    servedLocale,
    equivalentLocales: [],
  };
}

function summarize(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= 160) return normalized;
  return `${normalized.slice(0, 157).trimEnd()}...`;
}

/**
 * The organism the entry is about, by the permalink that survives every rename
 * and merge (ADR-0029 D13).
 *
 * Only an object-scoped entry has one, and only when its object has been
 * matched to a card: a gardener's free-text "помідор" is a name, not a subject,
 * and pointing `about` at nothing would be worse than saying nothing.
 */
function entrySubject(page: PublicJournalEntryPage) {
  const context = page.context;
  if (context?.kind !== "object") return null;
  const { catalogItemId, catalogCanonicalName, catalogPublicSlug } =
    context.object;
  if (!catalogItemId || !catalogCanonicalName || !catalogPublicSlug) {
    return null;
  }
  return {
    id: absolutePublicUrl(publicCatalogPermalinkPath(catalogItemId)),
    name: catalogCanonicalName,
    url: absolutePublicUrl(
      publicCatalogEvidencePath({
        catalogKind: context.object.catalogKind ?? "plant_variety",
        publicSlug: catalogPublicSlug,
        speciesSlug: context.object.catalogSpeciesSlug,
      }),
    ),
  };
}

/**
 * Home → author → entry. Both links are on the page: the shell's home link and
 * the author line under the title (ADR-0022 D3). An entry with no author — a
 * space-scoped one written before handles — stops at home.
 */
function breadcrumbsFor(page: PublicJournalEntryPage) {
  return [
    { name: "OverGarden", url: absolutePublicUrl("/") },
    ...(page.author
      ? [
          {
            name: page.author.displayName,
            url: absolutePublicUrl(page.author.profilePath),
          },
        ]
      : []),
    { name: page.entry.title, url: absolutePublicUrl(page.entry.publicPath) },
  ];
}

function toIsoTimestamp(value: Date | string | null | undefined) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}
