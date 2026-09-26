import type { Metadata } from "next";
import { notFound, permanentRedirect, unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { PublicFeedEntryItems } from "@/components/public/public-feed-entry-card";
import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";
import { Link } from "@/components/ui/link";
import { Section } from "@/components/ui/section";
import { ShowMoreList } from "@/components/ui/show-more-list";
import type { CatalogKind } from "@/db/schema";
import type { PublicCatalogAddressRequest } from "@/lib/catalog/addresses";
import { entryCardFeedLabels } from "@/lib/entry-card-dates";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { firstPhotographIndex } from "@/lib/media/first-photograph";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";
import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { cursorPortionHref, getShowMoreCopy } from "@/lib/show-more";
import { getSpeciesPageCopy } from "@/lib/species-page-copy";
import { loadSpeciesEntriesPortion } from "@/app/species-portion-actions";
import {
  readPublicCatalogAddress,
  readSpeciesEntries,
  readSpeciesPage,
} from "@/server/public-cache";
import type { PublicFeedEntry } from "@/server/public-feed-repository";
import {
  deferWithoutDatabase,
  STATIC_PARAMS_PLACEHOLDER,
} from "@/server/public-prerender";
import {
  resolvePublicSurfacePayload,
  resolveUnresolvedPublicSurfaceDiscovery,
} from "@/server/public-surface-discovery";
import type { SpeciesPage } from "@/server/species-page";
import {
  buildSpeciesPageDiscoverySource,
  buildSpeciesPageMetadata,
  speciesPageNames,
  speciesPageText,
} from "@/server/species-page-metadata";
import {
  deferStaticRenderAfterFailure,
  deferStaticRenderWithoutDatabase,
  renderStaticPublicPage,
  StaticRenderDeferred,
  type PublicRenderPhase,
} from "@/server/static-public-page";

export interface PublicCatalogEvidenceRouteProps {
  params: Promise<{ slug: string; form?: string; locale?: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** The route family a page file serves; the address it resolves may differ. */
export type PublicCatalogEvidenceFamily = CatalogKind;

const getCachedCatalogAddress = cache((request: PublicCatalogAddressRequest) =>
  readPublicCatalogAddress(request),
);

const getCachedSpeciesPage = cache(
  (catalogItemId: string, locale: InterfaceLocale) =>
    readSpeciesPage(catalogItemId, locale),
);

/**
 * Resolves what a page file was asked for (ADR-0026 D8). On a hard load the
 * proxy has already answered 308 or 404 with a real status; here the same
 * lookup serves client-side navigations, and the page never renders one
 * organism under another organism's address.
 */
async function resolveCatalogEvidenceRequest(
  family: PublicCatalogEvidenceFamily,
  props: PublicCatalogEvidenceRouteProps,
  /**
   * Who is asking. The page is attempted as a static render and defers by
   * throwing (`renderStaticPublicPage`); its metadata has no boundary to
   * return, so without a database it waits for the request.
   */
  phase: PublicRenderPhase | "metadata",
) {
  // Not the query string: the page is a static document (ADR-0032), and a
  // later portion of its entries renders from the `/q` twin.
  const { slug, form, locale: localeParam } = await props.params;
  // The route family decides the language, never the reader's cookie
  // (ADR-0029 D10). The unprefixed family is the default locale's.
  const locale: InterfaceLocale | null = localeParam
    ? isPublicLocale(localeParam)
      ? localeParam
      : null
    : DEFAULT_PUBLIC_LOCALE;
  // The route family decides the canonical and every redirect target.
  const routeLocale: PublicLocale =
    localeParam && isPublicLocale(localeParam)
      ? localeParam
      : DEFAULT_PUBLIC_LOCALE;
  const request: PublicCatalogAddressRequest =
    family === "species"
      ? { kind: "species", speciesSlug: slug, formSlug: form ?? null }
      : { kind: "legacy", catalogKind: family, slug };
  // The build's one sample (`generateStaticParams`): nothing to look up.
  if (slug === STATIC_PARAMS_PLACEHOLDER) {
    return { locale, routeLocale, address: null, placeholder: true as const };
  }
  if (phase === "metadata") await deferWithoutDatabase();
  else await deferStaticRenderWithoutDatabase(phase);
  const address = locale ? await getCachedCatalogAddress(request) : null;
  return { locale, routeLocale, address, placeholder: false as const };
}

/**
 * The title is the two names, the description is the text under them, the
 * canonical is the page itself — for a later portion too — and a page that is
 * not published says `noindex` (`OVE-519`).
 */
export async function generatePublicCatalogEvidenceMetadata(
  family: PublicCatalogEvidenceFamily,
  props: PublicCatalogEvidenceRouteProps,
): Promise<Metadata> {
  const { locale, routeLocale, address } = await resolveCatalogEvidenceRequest(
    family,
    props,
    "metadata",
  );
  const missing = () => ({
    title: `${getPublicSurfaceCopy(locale ?? "uk").organism.notFound} | OverGarden`,
    robots:
      resolveUnresolvedPublicSurfaceDiscovery("catalog_evidence").decision
        .robots,
  });
  if (!locale || !address || address.status !== "canonical") return missing();

  const bounded = await resolvePublicSurfacePayload({
    consumerId: "catalog_evidence",
    // Prerendered with the page it describes (ADR-0032 D4).
    document: "static",
    load: async () => {
      const page = await getCachedSpeciesPage(address.catalogItemId, locale);
      if (!page) throw new Error("Species page unavailable.");
      return {
        source: buildSpeciesPageDiscoverySource(page, locale, routeLocale),
        payload: page,
      };
    },
  });
  const page = bounded.payload;
  if (!page) return missing();
  return buildSpeciesPageMetadata(page, locale, {
    routeLocale,
    discovery: bounded,
  }).metadata;
}

/** One placeholder sample per route: see `STATIC_PARAMS_PLACEHOLDER`. */
export function generatePublicCatalogEvidenceStaticParams(
  family: PublicCatalogEvidenceFamily | "species_form",
) {
  return family === "species_form"
    ? [{ slug: STATIC_PARAMS_PLACEHOLDER, form: STATIC_PARAMS_PLACEHOLDER }]
    : [{ slug: STATIC_PARAMS_PLACEHOLDER }];
}

export function renderPublicCatalogEvidenceRoute(
  family: PublicCatalogEvidenceFamily,
  props: PublicCatalogEvidenceRouteProps,
) {
  return renderStaticPublicPage({
    fallback: <RootLoadingSkeleton />,
    render: (phase) => renderSpeciesDocument(family, props, phase),
  });
}

/**
 * The page with its first portion of entries, attempted as a static render
 * and, failing that, at request time (`renderStaticPublicPage`). Every read
 * comes before the first element.
 */
async function renderSpeciesDocument(
  family: PublicCatalogEvidenceFamily,
  props: PublicCatalogEvidenceRouteProps,
  phase: PublicRenderPhase,
) {
  // A read that fails is not prerendered (ADR-0032 D4): statically it defers
  // to the request, and at request time it is the error this reader sees.
  const notPrerendered = (error: unknown): never => {
    unstable_rethrow(error);
    if (error instanceof StaticRenderDeferred) throw error;
    deferStaticRenderAfterFailure(phase);
    throw error;
  };
  const resolved = await resolveCatalogEvidenceRequest(
    family,
    props,
    phase,
  ).catch(notPrerendered);
  // A sampled path renders nothing rather than `notFound()`, whose render is
  // static and turns the document's session read into a build error.
  if (resolved.placeholder) return null;
  const { routeLocale } = resolved;
  const { locale, catalogItemId } = canonicalCatalogItem(resolved);
  const page = await getCachedSpeciesPage(catalogItemId, locale).catch(
    notPrerendered,
  );
  if (!page) notFound();
  return (
    <SpeciesPageView
      page={page}
      locale={locale}
      routeLocale={routeLocale}
      entries={page.entries}
      nextCursor={page.nextCursor}
      firstPortion
    />
  );
}

/**
 * A later portion's own address, `?cursor=` (ADR-0032 D5): the page's `/q`
 * twin renders the same page with that portion under «Записи». The proxy has
 * answered 404 for a cursor with nothing after it and `noindex, follow` for
 * the rest; what reaches here is a portion that exists.
 */
export async function renderPublicCatalogEvidenceForRequest(
  family: PublicCatalogEvidenceFamily,
  props: PublicCatalogEvidenceRouteProps,
) {
  const query = (await props.searchParams) ?? {};
  const cursor = typeof query.cursor === "string" ? query.cursor : null;
  const resolved = await resolveCatalogEvidenceRequest(
    family,
    props,
    "request",
  );
  if (resolved.placeholder) notFound();
  const { routeLocale } = resolved;
  const { locale, catalogItemId } = canonicalCatalogItem(resolved);
  const [page, portion] = await Promise.all([
    getCachedSpeciesPage(catalogItemId, locale),
    cursor ? readSpeciesEntries(catalogItemId, cursor, locale) : null,
  ]);
  if (!page) notFound();
  return (
    <SpeciesPageView
      page={page}
      locale={locale}
      routeLocale={routeLocale}
      entries={portion?.entries ?? page.entries}
      nextCursor={portion ? portion.nextCursor : page.nextCursor}
      firstPortion={!portion}
    />
  );
}

/** The resolved address's organism, or the redirect and 404 it calls for. */
function canonicalCatalogItem(resolved: {
  locale: InterfaceLocale | null;
  routeLocale: PublicLocale;
  address: Awaited<ReturnType<typeof getCachedCatalogAddress>> | null;
}) {
  const { locale, routeLocale, address } = resolved;
  if (!locale || !address || address.status === "not_found") notFound();
  if (address.status === "redirect") {
    permanentRedirect(localizedPath(routeLocale, address.canonicalPath));
  }
  return { locale, catalogItemId: address.catalogItemId };
}

/**
 * A species page (DESIGN.md §5.18, `OVE-519`), from top to bottom and nothing
 * else: the name with the Latin name under it, a short text, the collage's
 * place, a visible «Записи» and the entries, newest first, in portions of
 * twenty. The reference is a Threads profile — a header, then posts — so the
 * header is `ProfileHeader`'s type and spacing, and the entries are the
 * feed's own card. No section, count, relation, source, «Додати в мій сад» or
 * owner control: the owner sees the page a guest sees.
 */
function SpeciesPageView({
  page,
  locale,
  routeLocale,
  entries,
  nextCursor,
  firstPortion,
}: {
  page: SpeciesPage;
  locale: InterfaceLocale;
  routeLocale: PublicLocale;
  entries: readonly PublicFeedEntry[];
  nextCursor: string | null;
  /** Only the first portion asks for its first photograph at once. */
  firstPortion: boolean;
}) {
  const copy = getSpeciesPageCopy(locale);
  const names = speciesPageNames(page, locale, routeLocale);
  const text = speciesPageText(page, locale);
  const path = localizedPath(routeLocale, page.catalog.canonicalPath);
  const serializedJsonLd = serializePublicSurfaceJsonLd(
    buildSpeciesPageMetadata(page, locale, { routeLocale }).jsonLd,
  );
  const priorityIndex = firstPortion
    ? firstPhotographIndex(entries, (entry) => entry.media.length > 0)
    : -1;

  return (
    <main
      lang={locale}
      data-species-page="true"
      data-species-published={page.published ? "true" : "false"}
      className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      <header data-species-header="true" className="grid gap-4 pb-2">
        <div className="grid min-w-0 gap-1">
          {/* A Latin binomial is marked as one (WCAG 3.1.2), whether it is
              the heading or the line under it, so a screen reader does not
              read it with Ukrainian or Bulgarian phonetics. A cultivar's or a
              breed's name is somebody's word and stays unmarked. */}
          <h1
            {...(names.headingIsLatin ? { lang: "la" } : {})}
            className="text-h1 wrap-anywhere text-text-heading"
          >
            {names.heading}
          </h1>
          {names.latin ? (
            <p
              lang="la"
              data-species-latin="true"
              className="text-body-sm wrap-anywhere text-text-muted italic"
            >
              {names.latin}
            </p>
          ) : null}
          {names.species ? (
            <p className="text-body-sm wrap-anywhere text-text-muted">
              <Link
                href={names.species.path}
                variant="muted"
                data-species-parent="true"
              >
                {/* The space is inside the name's own text: a lone space
                    after React's text marker is dropped from the link's
                    accessible name, which then reads the two as one word. */}
                {names.species.latin
                  ? `${names.species.name} `
                  : names.species.name}
                {names.species.latin ? (
                  <span lang="la" className="italic">
                    {names.species.latin}
                  </span>
                ) : null}
              </Link>
            </p>
          ) : null}
        </div>
        {/* The owner's description replaces it (29.12); until then, the
            placeholder. The meta description is this same text. */}
        <p
          data-species-text="true"
          className="max-w-prose text-body break-words text-text"
        >
          {text}
        </p>
      </header>

      {/* The collage of the latest photographs goes here (29.18, §5.27). */}

      <Section
        id="species-entries"
        data-species-entries="true"
        title={copy.entriesHeading}
        level={2}
      >
        {entries.length > 0 ? (
          <ShowMoreList
            as="ol"
            className="grid list-none gap-4"
            copy={getShowMoreCopy(locale)}
            next={
              nextCursor
                ? {
                    token: nextCursor,
                    href: cursorPortionHref(path, nextCursor),
                  }
                : null
            }
            load={loadSpeciesEntriesPortion.bind(null, {
              locale,
              catalogItemId: page.catalog.catalogItemId,
              path,
            })}
          >
            <PublicFeedEntryItems
              locale={locale}
              copy={entryCardFeedLabels(locale)}
              entries={entries}
              headingLevel={3}
              priorityIndex={priorityIndex}
            />
          </ShowMoreList>
        ) : (
          // One quiet line where the entries would be, as Threads says an
          // empty profile: not a card, not a heading, nothing to press.
          <p
            data-species-empty="true"
            className="py-10 text-center text-body-sm text-text-muted"
          >
            {copy.empty}
          </p>
        )}
      </Section>
    </main>
  );
}
