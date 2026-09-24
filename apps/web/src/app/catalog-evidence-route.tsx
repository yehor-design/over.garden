import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound, permanentRedirect, unstable_rethrow } from "next/navigation";
import { cache, Suspense } from "react";
import { BookmarkSimpleIcon as Bookmark } from "@/components/icons/BookmarkSimple";
import { ArrowSquareOutIcon as ExternalLink } from "@/components/icons/ArrowSquareOut";
import { CaretRightIcon as ChevronRight } from "@/components/icons/CaretRight";
import { PlusIcon as Plus } from "@/components/icons/Plus";

import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import { PublicVarietySourceCredits } from "@/app/(default)/variety/[slug]/source-credits";
import { addCatalogPublicSlugToWishlistAction } from "@/app/(default)/wishlist/actions";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { publicCatalogRegisterHubPath } from "@/lib/catalog/addresses";
import {
  catalogFactValue,
  catalogIdentifierSchemeName,
  catalogQualifierName,
  registerNumber,
} from "@/lib/catalog/source-names";
import { getPublicCatalogBrowseCopy } from "@/lib/public-catalog-browse-copy";
import { buildPublicMediaSourceSet } from "@/lib/media/derivative-keys";
import { firstPhotographIndex } from "@/lib/media/first-photograph";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/components/ui/link";
import { MediaFigure } from "@/components/ui/media-figure";
import { Section } from "@/components/ui/section";
import {
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { catalogIdentifierUrl } from "@/lib/catalog/addresses";
import { CATALOG_BROWSE_PATH } from "@/lib/public-catalog-browse";
import { publicRegionLabel } from "@/lib/garden/regions";
import { cn } from "@/lib/utils";
import type { CatalogKind } from "@/db/schema";
import {
  gardenObjectSetupPreselectionPath,
  publicCatalogEvidencePath,
} from "@/lib/garden/public-paths";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatPublicCount,
  getPublicSurfaceCopy,
} from "@/lib/public-surface-localization";
import { readViewerLikeState } from "@/app/engagement/engagement-viewer";
import {
  resolvePublicSurfacePayload,
  resolveUnresolvedPublicSurfaceDiscovery,
} from "@/server/public-surface-discovery";
import { buildPublicVarietySurfaceMetadata } from "@/server/public-variety-metadata";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import {
  formatOrganismDate,
  formatOrganismFactParagraph,
  organismRoleFor,
} from "@/lib/public-organism-copy";
import {
  hasAcceptedNameDisagreement,
  type PublicOrganismAssertionLine,
} from "@/server/public-organism-card-query";
import {
  buildPublicVarietyDiscoverySource,
  type PublicVarietyPage,
} from "@/server/public-variety-repository";
import { getSiteShellSessionState } from "@/server/site-shell-session";
import { isOwnerUserId } from "@/server/admin-access";
import {
  listCatalogCardNames,
  listOwnerActionAudit,
} from "@/server/owner-action-audit";
import { CatalogOwnerCardControls } from "@/app/catalog-owner-card-controls";
import {
  describeWorkspaceFailure,
  recordWorkspaceSectionFailure,
} from "@/server/workspace-failure";
import {
  readGuestEngagementSummary,
  readPublicCatalogAddress,
  readPublicVarietyPageByCatalogItemId,
} from "@/server/public-cache";
import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";
import {
  deferWithoutDatabase,
  STATIC_PARAMS_PLACEHOLDER,
} from "@/server/public-prerender";
import {
  deferStaticRenderAfterFailure,
  deferStaticRenderWithoutDatabase,
  renderStaticPublicPage,
  StaticRenderDeferred,
  type PublicRenderPhase,
} from "@/server/static-public-page";
import type { PublicCatalogAddressRequest } from "@/lib/catalog/addresses";
import {
  contentLanguageAttribute,
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { HiddenField } from "@/components/ui/hidden-field";

export interface PublicCatalogEvidenceRouteProps {
  params: Promise<{ slug: string; form?: string; locale?: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** The route family a page file serves; the address it resolves may differ. */
export type PublicCatalogEvidenceFamily = CatalogKind;

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

const getCachedCatalogAddress = cache((request: PublicCatalogAddressRequest) =>
  readPublicCatalogAddress(request),
);

const getCachedPublicCatalogEvidencePage = cache(
  (catalogItemId: string, locale: InterfaceLocale) =>
    readPublicVarietyPageByCatalogItemId(catalogItemId, locale),
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
   * throwing (`renderStaticPublicPage`); its metadata has no boundary to return, so
   * without a database it waits for the request the way it always has.
   */
  phase: PublicRenderPhase | "metadata",
) {
  // Not the query string: a card is a static document (ADR-0032), and the
  // three things on it that read `searchParams` are regions of their own.
  const { slug, form, locale: localeParam } = await props.params;
  // The route family decides the language, never the reader's cookie
  // (ADR-0029 D10). The unprefixed family is the default locale's.
  //
  // Reading the cookie here meant the shared CDN copy of an unprefixed card
  // held whichever language populated it first: on 2026-09-10 the canonical uk
  // address served a fully Bulgarian document, with `<html lang="uk">` and
  // `Content-Language: bg`, to every reader including a crawler.
  const locale: InterfaceLocale | null = localeParam
    ? isPublicLocale(localeParam)
      ? localeParam
      : null
    : DEFAULT_PUBLIC_LOCALE;
  // The route family decides the canonical and every redirect target: a
  // prefixed page stays prefixed, the unprefixed page stays unprefixed
  // whatever the cookie locale says.
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
    title: `${getCatalogEvidenceCopy(locale ?? "uk", family).title} | OverGarden`,
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
      const page = await getCachedPublicCatalogEvidencePage(
        address.catalogItemId,
        locale,
      );
      if (!page) throw new Error("Public catalog evidence unavailable.");
      return {
        source: buildPublicVarietyDiscoverySource(
          page,
          "catalog_evidence",
          routeLocale,
        ),
        payload: page,
      };
    },
  });
  const page = bounded.payload;
  if (!page) return missing();

  const routeCopy = getCatalogEvidenceCopy(locale, page.catalog.catalogKind);
  const surface = buildPublicVarietySurfaceMetadata(page, locale, {
    routeLocale,
    discovery: bounded,
  });
  return {
    ...surface.metadata,
    title: `${page.catalog.canonicalName} · ${routeCopy.metadataSuffix} | OverGarden`,
    // The fact paragraph, which says what the organism is and whether anyone
    // here wrote about it, rather than "Публічний вид: …" (`OVE-497`).
    description: organismFactParagraph(page, locale),
  };
}

/** One placeholder sample per card family: see `STATIC_PARAMS_PLACEHOLDER`. */
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
    render: (phase) => renderCatalogEvidenceCard(family, props, phase),
  });
}

/**
 * The card, attempted as a static render and, failing that, at request time
 * (`renderStaticPublicPage`). Every read comes before the first element.
 */
async function renderCatalogEvidenceCard(
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
  const { locale, routeLocale, address, placeholder } =
    await resolveCatalogEvidenceRequest(family, props, phase).catch(
      notPrerendered,
    );
  // A sampled path renders nothing rather than `notFound()`, whose render is
  // static and turns the document's session read into a build error.
  if (placeholder) return null;
  if (!locale || !address || address.status === "not_found") notFound();
  if (address.status === "redirect") {
    permanentRedirect(localizedPath(routeLocale, address.canonicalPath));
  }
  const page = await getCachedPublicCatalogEvidencePage(
    address.catalogItemId,
    locale,
  ).catch(notPrerendered);
  if (!page) notFound();

  const catalogKind = page.catalog.catalogKind;
  const publicCopy = getPublicSurfaceCopy(locale);
  const publicPath = localizedPath(routeLocale, page.catalog.canonicalPath);
  const surface = buildPublicVarietySurfaceMetadata(page, locale, {
    routeLocale,
  });
  const serializedJsonLd = serializePublicSurfaceJsonLd(surface.jsonLd);
  const isPlantVariety = catalogKind === "plant_variety";
  const engagementTarget = {
    kind: "variety" as const,
    ref: page.catalog.publicSlug,
  };
  // A variety is a public engagement target only once it has public entries
  // (`buildPublicVarietyTargetQuery`): an organism without them renders with
  // no panel, and a refused panel never takes the page down. This is the
  // guest's summary — what the document carries in its bytes; the reader's own
  // like state arrives in the region below it.
  const engagement =
    isPlantVariety && page.entryCount > 0
      ? await readGuestEngagementSummary(engagementTarget, null).catch(
          (reason: unknown) => {
            unstable_rethrow(reason);
            // Never prerendered: a card without its panel would otherwise be
            // what every reader gets until the cache ran out (ADR-0032 D4).
            deferStaticRenderAfterFailure(phase);
            recordWorkspaceSectionFailure(describeWorkspaceFailure(reason), {
              surface: "engagement_panel",
              section: "summary",
            });
            return null;
          },
        )
      : null;

  const cardCopy = publicCopy.organism;
  // ADR-0026 D11: a node EPPO says is a pest of something is called a pest or
  // a disease, not "species". The hosts are the role; the kingdom is the word.
  const organismRole = organismRoleFor({
    kingdom: page.catalog.kingdom,
    hostCount: page.card.hosts.length,
  });
  const factParagraph = organismFactParagraph(page, locale);
  const hasExperience = page.entries.length > 0 || page.card.regions.length > 0;
  const firstPhotograph = firstPhotographIndex(page.entries, (entry) =>
    Boolean(entry.media),
  );
  const relationGroups = [
    { key: "forms", heading: cardCopy.sections.forms, items: page.card.forms },
    { key: "pests", heading: cardCopy.sections.pests, items: page.card.pests },
    { key: "hosts", heading: cardCopy.sections.hosts, items: page.card.hosts },
  ].filter((group) => group.items.length > 0);
  const disagreement = hasAcceptedNameDisagreement(
    page.card.acceptedNameClaims,
  );
  // The name a gardener knows it by leads (`OVE-497`): a species' own name
  // in the reader's language when the catalogue holds one, with the
  // scientific name beneath it. A form's name is its own — a cultivar is
  // called what it was registered as — and a name the catalogue does not
  // hold is never a blank: it is the accepted name.
  const displayName =
    catalogKind === "species" && page.catalog.vernacularName
      ? capitalizeFirst(page.catalog.vernacularName, locale)
      : page.catalog.canonicalName;
  const showsScientificName = displayName !== page.catalog.canonicalName;
  // What a gardener can keep: a cultivar, a breed, a plant or an animal —
  // and not a pest or a disease of one. Nothing is offered for the rest
  // (`OVE-496`, the rows).
  const keepable =
    organismRole === null &&
    (catalogKind === "plant_variety" ||
      catalogKind === "breed" ||
      page.catalog.kingdom === "Plantae" ||
      page.catalog.kingdom === "Animalia");
  const species = page.catalog.species;
  const speciesPath = species
    ? localizedPath(
        routeLocale,
        publicCatalogEvidencePath({
          catalogKind: "species",
          publicSlug: species.publicSlug,
          speciesSlug: null,
        }),
      )
    : null;
  const formsPath = localizedPath(
    routeLocale,
    publicCatalogRegisterHubPath(
      species?.publicSlug ?? page.catalog.publicSlug,
    ),
  );

  return (
    <main
      lang={locale}
      data-public-organism-card="true"
      className="flex w-full min-w-0 flex-col gap-8 px-4 py-8 sm:px-6 md:py-12"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      {/* The contents rail above `xl` (`OVE-452`). It is the shell's own rail,
          so it is absent below `xl` and nothing in it is the only route to
          anything — every entry points at a section that is on this page and
          open. */}
      <SiteShellContextRailRegistration
        modules={buildOrganismCardContextModules(cardCopy, {
          experience: hasExperience,
          relations: relationGroups.length > 0,
          presence: page.card.presence.length > 0,
          mentions: page.card.mentionPressure.length > 0,
          namesAndSources: page.card.sourceGroups.length > 0,
        })}
      />
      <header
        data-organism-section="facts"
        className="flex flex-col gap-5 border-b border-border pb-6"
      >
        <div className="flex flex-col gap-3">
          {/* Where this organism sits, and the way back up: the catalogue,
              and for a form its species and every other form of it — the
              register view, whose search and page the browser's own Back
              keeps (`OVE-497`). */}
          <nav aria-label={cardCopy.crumbsLabel} className="min-w-0">
            <ol className="flex min-w-0 list-none flex-wrap items-center gap-1.5 text-caption text-text-muted">
              <li className="flex min-w-0 items-center gap-1.5">
                <Link
                  href={localizedPath(routeLocale, CATALOG_BROWSE_PATH)}
                  variant="muted"
                  data-organism-crumb="catalogue"
                >
                  {getPublicCatalogBrowseCopy(routeLocale).eyebrow}
                </Link>
              </li>
              {species && speciesPath ? (
                <>
                  <li className="flex min-w-0 items-center gap-1.5">
                    <ChevronRight
                      className="size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <Link
                      href={speciesPath}
                      variant="muted"
                      data-organism-crumb="species"
                      className="max-w-52 truncate"
                    >
                      {capitalizeFirst(species.displayName, locale)}
                    </Link>
                  </li>
                  <li className="flex min-w-0 items-center gap-1.5">
                    <ChevronRight
                      className="size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <Link
                      href={formsPath}
                      variant="muted"
                      data-organism-crumb="forms"
                    >
                      {cardCopy.sections.allForms}
                    </Link>
                  </li>
                </>
              ) : null}
            </ol>
          </nav>
          <p className="text-overline text-text-muted uppercase">
            {organismRole
              ? cardCopy.fact.role[organismRole]
              : cardCopy.fact.kind[catalogKind]}
          </p>
          {/* A species' canonical name is a Latin binomial and is marked as
              one (WCAG 3.1.2), so a screen reader does not read it with
              Ukrainian or Bulgarian phonetics — whether it is the heading or
              the line beneath the heading. A variety's or a breed's name is
              a cultivar or a breed name in somebody's language and is
              deliberately left unmarked: claiming Latin for it would be a
              different error in the same place. */}
          <h1
            {...(catalogKind === "species" && !showsScientificName
              ? { lang: "la" }
              : {})}
            className="text-h1 break-words text-text-heading"
          >
            {displayName}
          </h1>
          {showsScientificName ? (
            <p
              lang="la"
              data-organism-scientific-name="true"
              className="-mt-2 text-body-lg break-words text-text-secondary italic"
            >
              {page.catalog.canonicalName}
            </p>
          ) : null}
          {/* The fact-only first paragraph, built from structured fields
              (ADR-0026 D9). It is the page's answer, so it is first and it is
              prose — not a table, not behind anything. */}
          <p data-organism-fact className="max-w-prose text-body-lg text-text">
            {factParagraph}
          </p>
          {/* Counts of nothing are not facts about an organism (DESIGN.md
              §5.10): the paragraph above already says nobody has written. */}
          {page.entryCount > 0 || page.photoCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {page.entryCount > 0 ? (
                <Badge tone="neutral">
                  {formatPublicCount(locale, "entry", page.entryCount)}
                </Badge>
              ) : null}
              {page.photoCount > 0 ? (
                <Badge tone="neutral">
                  {formatPublicCount(locale, "photo", page.photoCount)}
                </Badge>
              ) : null}
            </div>
          ) : null}
          {keepable ? (
            // Object setup, which first offers the objects of this organism
            // the reader already keeps — each a link to write about it —
            // and otherwise adds one (`OVE-485`).
            <NextLink
              href={gardenObjectSetupPreselectionPath(page.catalog.publicSlug)}
              data-organism-add-to-garden="true"
              className={cn(buttonVariants({ size: "lg" }), "mt-2 w-fit")}
            >
              <Plus aria-hidden="true" />
              {getPublicCatalogBrowseCopy(routeLocale).addToGarden}
            </NextLink>
          ) : null}
          {isPlantVariety ? (
            <OwnerScopedProgressiveForm
              action={addCatalogPublicSlugToWishlistAction}
            >
              <HiddenField
                name="catalogPublicSlug"
                value={page.catalog.publicSlug}
              />
              <HiddenField name="locale" value={locale} />
              <HiddenField name="returnTo" value={publicPath} />
              <button
                type="submit"
                className={buttonVariants({
                  variant: "secondary",
                  className: "self-start",
                })}
              >
                <Bookmark aria-hidden="true" />
                {publicCopy.variety.saveToWishlist}
              </button>
            </OwnerScopedProgressiveForm>
          ) : null}
          {isPlantVariety ? (
            <Suspense fallback={null}>
              <WishlistSavedReceipt
                searchParams={props.searchParams}
                label={publicCopy.variety.savedToWishlist}
              />
            </Suspense>
          ) : null}
        </div>
      </header>

      {hasExperience ? (
        <Section
          id="organism-experience"
          data-organism-section="experience"
          className="border-b border-border pb-6"
          level={2}
          title={cardCopy.sections.experience}
        >
          {isPlantVariety && engagement ? (
            <Suspense
              fallback={
                <PublicEngagementPanel
                  isAuthenticated={false}
                  target={engagementTarget}
                  // A document has no reader: the guest's count, not pressed.
                  // Without a like state the control is not drawn at all, and
                  // the form is what works before hydration (ADR-0024 D3).
                  likeState={{
                    activeLikeCount: engagement.activeLikeCount,
                    viewerLiked: false,
                  }}
                  summary={engagement}
                  returnTo={publicPath}
                  locale={locale}
                  resumeAction={null}
                  resumeControl={null}
                />
              }
            >
              <ViewerCardEngagementPanel
                locale={locale}
                target={engagementTarget}
                summary={engagement}
                returnTo={publicPath}
                searchParams={props.searchParams}
              />
            </Suspense>
          ) : null}

          {page.card.regions.length > 0 ? (
            <div className="grid gap-2">
              <h3 className="text-h3 text-text-heading">
                {cardCopy.sections.spread}
              </h3>
              <ul
                data-organism-spread
                className="grid list-none gap-1 text-body-sm text-text sm:grid-cols-2"
              >
                {page.card.regions.map((region) => (
                  <li
                    key={region.code}
                    className="flex flex-wrap justify-between gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <span>{region.label ?? region.code}</span>
                    <span className="text-text-muted tabular-nums">
                      {formatPublicCount(locale, "object", region.objectCount)}
                      {" · "}
                      {formatPublicCount(
                        locale,
                        "gardener",
                        region.gardenerCount,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {page.entries.length > 0 ? (
            <ol className="grid list-none gap-4">
              {page.entries.map((entry, entryIndex) => (
                <li key={entry.id} className="min-w-0">
                  <Card
                    as="article"
                    aria-labelledby={`organism-entry-${entry.id}-title`}
                    className={cn(
                      "grid min-w-0 gap-4 p-4",
                      entry.media ? "sm:grid-cols-3" : "",
                    )}
                  >
                    <div
                      className={cn(
                        "flex min-w-0 flex-col gap-3",
                        entry.media ? "sm:col-span-2" : "",
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
                          <time dateTime={organismIsoDate(entry.entryDate)}>
                            {formatDate(entry.entryDate, locale)}
                          </time>
                          {entry.safeRegionCode ? (
                            <span>
                              {publicRegionLabel(locale, entry.safeRegionCode)}
                            </span>
                          ) : null}
                          <span>
                            {entry.varietyText ?? page.catalog.canonicalName}
                          </span>
                        </div>
                        <h3
                          id={`organism-entry-${entry.id}-title`}
                          className="text-h3 break-words text-text-heading"
                          // The gardener's words keep the gardener's language;
                          // the date, region and name above them are the
                          // page's (ADR-0029 D11).
                          {...contentLanguageAttribute(
                            entry.sourceLanguage,
                            locale,
                          )}
                        >
                          {entry.title}
                        </h3>
                      </div>
                      <p
                        className="max-w-prose text-body-sm whitespace-pre-wrap text-text"
                        {...contentLanguageAttribute(
                          entry.sourceLanguage,
                          locale,
                        )}
                      >
                        {entry.body}
                      </p>
                      <Link
                        href={entry.publicPath}
                        className="self-start text-body-sm font-medium"
                      >
                        {publicCopy.variety.openSourceEntry}
                      </Link>
                    </div>

                    {entry.media ? (
                      // The gardener's photograph is the only colour on the
                      // page (ADR-0031 D3), and its box is reserved before
                      // the bytes land (DESIGN.md §2.10).
                      <MediaFigure
                        aspect="cover"
                        className="overflow-hidden rounded-lg border border-border"
                        src={entry.media.publicUrl}
                        srcSet={buildPublicMediaSourceSet(entry.media).srcSet}
                        placeholderDataUri={entry.media.placeholderDataUri}
                        alt={`${entry.title} · ${publicCopy.passport.publicPhotoSuffix}`}
                        sizes="(min-width: 640px) 14rem, 100vw"
                        intrinsicWidth={entry.media.intrinsicWidth}
                        intrinsicHeight={entry.media.intrinsicHeight}
                        // The first gardener photograph is the largest thing
                        // on a phone's first screen of a card that has one —
                        // and it was `loading="lazy"`. Measured on production
                        // on 2026-09-20: it was the LCP element, and it was not
                        // even requested for 2.9 s (`OVE-470`).
                        priority={entryIndex === firstPhotograph}
                      />
                    ) : null}
                  </Card>
                </li>
              ))}
            </ol>
          ) : null}
        </Section>
      ) : null}

      {isPlantVariety && page.seedProof ? (
        // The editors' note, after what gardeners wrote and labelled as the
        // editors' (`OVE-497`): it is orientation, not a first-hand journal,
        // and a reader should never have to guess which of the two they are
        // reading.
        <Section
          id="organism-growing"
          data-organism-section="editorial"
          className="border-b border-border pb-6"
          level={2}
          title={page.seedProof.title}
          description={page.seedProof.summary}
        >
          <p
            data-organism-editorial="true"
            className="text-caption text-text-muted"
          >
            {cardCopy.sections.editorial}
            {page.seedProof.sourceLabel
              ? ` · ${page.seedProof.sourceLabel}`
              : ""}
          </p>
          <p className="max-w-prose text-body-sm whitespace-pre-wrap text-text">
            {page.seedProof.body}
          </p>
        </Section>
      ) : null}

      {relationGroups.length > 0 ? (
        <Section
          id="organism-relations"
          data-organism-section="relations"
          className="border-b border-border pb-6"
          level={2}
          title={cardCopy.sections.relations}
        >
          {relationGroups.map((group) => (
            <div key={group.key} className="grid gap-2">
              <h3 className="text-h3 text-text-heading">{group.heading}</h3>
              <ul
                data-organism-relations={group.key}
                className="flex list-none flex-wrap gap-2"
              >
                {group.items.map((item) => (
                  <li key={item.catalogItemId}>
                    <Link
                      href={localizedPath(routeLocale, item.publicPath)}
                      variant="quiet"
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-body-sm"
                    >
                      <span>{item.canonicalName}</span>
                      {item.hostClass ? (
                        <span className="text-caption text-text-muted">
                          · {hostClassLabel(cardCopy, item.hostClass)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
              {group.key === "forms" && catalogKind === "species" ? (
                // A dozen forms, the written-about first, and the way to all
                // of them (`OVE-497`): the register view searches and pages,
                // and carries the registration number a seed packet quotes,
                // which this card cannot hold. 621 chips were the page.
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Link
                    href={formsPath}
                    data-organism-register-hub="true"
                    variant="quiet"
                    className="inline-flex min-h-11 w-fit items-center rounded-lg border border-border px-3 text-body-sm font-medium"
                  >
                    {`${cardCopy.sections.allForms} (${page.card.formCount.toLocaleString(locale)})`}
                  </Link>
                  {page.card.formCount > group.items.length ? (
                    <p
                      data-organism-forms-shown="true"
                      className="text-body-sm text-text-muted"
                    >
                      {cardCopy.sections.formsShown
                        .replace(
                          "{shown}",
                          group.items.length.toLocaleString(locale),
                        )
                        .replace(
                          "{total}",
                          page.card.formCount.toLocaleString(locale),
                        )}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </Section>
      ) : null}

      {page.card.presence.length > 0 ? (
        <Section
          id="organism-presence"
          data-organism-section="presence"
          className="border-b border-border pb-6"
          level={2}
          title={cardCopy.sections.presence}
        >
          <ul className="flex list-none flex-wrap gap-2">
            {page.card.presence.map((entry) => {
              const observed = formatOrganismDate(locale, entry.observedAt);
              return (
                <li
                  key={entry.regionCode}
                  data-organism-presence={entry.regionCode}
                  data-organism-presence-status={entry.status}
                  className="rounded-lg border border-border px-3 py-2 text-body-sm text-text"
                >
                  <span className="font-medium">
                    {presenceRegionLabel(cardCopy, entry.regionCode)}
                  </span>{" "}
                  <span>{cardCopy.presence[entry.status]}</span>{" "}
                  {/* What EPPO wrote, so a badge is never surer than its source. */}
                  <span className="ml-1 text-caption text-text-muted">
                    {entry.sourceName}: {entry.verbatim}
                    {observed
                      ? ` · ${cardCopy.sections.observedOn}: ${observed}`
                      : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {page.card.mentionPressure.length > 0 ? (
        <Section
          id="organism-mentions"
          data-organism-section="mentions"
          className="border-b border-border pb-6"
          level={2}
          title={cardCopy.sections.mentions}
          description={cardCopy.sections.mentionsHint}
        >
          {page.card.mentionPressure.map((subject) => (
            <div
              key={subject.catalogItemId}
              data-organism-mentions={subject.catalogItemId}
              className="grid gap-2 rounded-lg border border-border p-4"
            >
              {subject.name ? (
                <p className="font-medium text-text">
                  {subject.publicPath ? (
                    <Link
                      href={localizedPath(routeLocale, subject.publicPath)}
                      variant="quiet"
                    >
                      {subject.name}
                    </Link>
                  ) : (
                    subject.name
                  )}
                </p>
              ) : null}
              <ul className="flex list-none flex-wrap gap-2">
                {subject.regions.map((region) => (
                  <li
                    key={region.code ?? "unknown"}
                    data-organism-mention-region={region.code ?? ""}
                    className="rounded-lg border border-border px-3 py-2 text-body-sm text-text"
                  >
                    <span className="font-medium">
                      {region.label ?? cardCopy.sections.spread}
                    </span>{" "}
                    <span data-organism-mention-count={region.mentions}>
                      {region.mentions}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-caption text-text-muted tabular-nums">
                {cardCopy.sections.mentionWeeks}:{" "}
                {subject.weeks
                  .map((week) => `${week.isoWeek} · ${week.mentions}`)
                  .join(", ")}
              </p>
            </div>
          ))}
        </Section>
      ) : null}

      {page.card.sourceGroups.length > 0 ? (
        // ADR-0026 D9 wrote this section as "collapsed". It is open now, and
        // the reason is `OVE-452`'s own criterion 6: a collapsed section is
        // invisible to a crawler even though it is in the DOM, and everything
        // in here — the identifiers `sameAs` is built from, the source each
        // fact came from, the licence attribution — is a fact that matters for
        // indexing. A card whose provenance a search engine cannot read is a
        // card that asks to be trusted without showing why.
        <Section
          id="organism-names-and-sources"
          data-organism-section="names-and-sources"
          className="border-b border-border pb-6"
          level={2}
          title={cardCopy.sections.namesAndSources}
          description={cardCopy.sections.namesAndSourcesHint}
        >
          <div className="grid gap-5">
            {disagreement ? (
              <div
                data-organism-disagreement
                className="rounded-lg border border-border bg-surface-sunken px-3 py-2 text-body-sm"
              >
                <p className="font-medium text-text">
                  {cardCopy.sections.disagreement}
                </p>
                <ul className="mt-1 grid list-none gap-1 text-text-muted">
                  {page.card.acceptedNameClaims.map((claim) => (
                    <li key={`${claim.sourceName}:${claim.name}`}>
                      {claim.sourceName}:{" "}
                      {/* A taxonomic source's accepted name is a scientific
                          name whatever the card's own kind is. */}
                      <span lang="la" className="text-text italic">
                        {claim.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {page.catalog.identifiers.length > 0 ? (
              // Quiet monospace secondary data rather than a wall of links
              // (`OVE-452`): an identifier is a string a reader copies, and a
              // proportional font makes two of them hard to tell apart. These
              // are the same five the JSON-LD's `sameAs` is built from, which
              // is unchanged — this only makes them visible to a reader.
              <div className="grid gap-2" data-organism-identifiers="true">
                <h3 className="text-h3 text-text-heading">
                  {cardCopy.sections.identifiers}
                </h3>
                <ul className="grid list-none gap-1">
                  {page.catalog.identifiers.map((identifier) => {
                    const href = catalogIdentifierUrl(
                      identifier.scheme,
                      identifier.value,
                    );
                    return (
                      <li
                        key={`${identifier.scheme}:${identifier.value}`}
                        data-organism-identifier={identifier.scheme}
                        className="flex flex-wrap items-baseline gap-x-2 text-body-sm"
                      >
                        <span className="text-text-muted">
                          {catalogIdentifierSchemeName(
                            identifier.scheme,
                            locale,
                          )}
                        </span>
                        {href ? (
                          <Link
                            href={href}
                            className="text-code inline-flex min-h-6 items-center gap-1 font-mono"
                            rel="noreferrer"
                            target="_blank"
                          >
                            {registerNumber(identifier.value) ??
                              identifier.value}
                            <ExternalLink
                              className="size-4"
                              aria-hidden="true"
                            />
                          </Link>
                        ) : (
                          <span className="text-code font-mono text-text">
                            {registerNumber(identifier.value) ??
                              identifier.value}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            {page.card.sourceGroups.map((group) => {
              const observed = formatOrganismDate(locale, group.observedAt);
              return (
                <div
                  key={`${group.sourceSlug ?? "catalog"}:${group.sourceVersion ?? ""}`}
                  className="grid gap-2"
                >
                  <h3 className="text-h3 text-text-heading">
                    {/* Spaces inside the text, not only margins: a lone
                        space after text is dropped from the heading's name
                        (`OVE-478`). */}
                    {group.sourceVersion || observed
                      ? `${group.sourceName} `
                      : group.sourceName}
                    {group.sourceVersion ? (
                      <span className="ml-1 text-body-sm font-normal text-text-muted">
                        {`${publicCopy.sourceCredits.versionLabel}: ${group.sourceVersion}`}
                      </span>
                    ) : null}
                    {group.sourceVersion && observed ? " " : null}
                    {observed ? (
                      <span className="ml-1 text-body-sm font-normal text-text-muted">
                        {`${cardCopy.sections.observedOn}: ${observed}`}
                      </span>
                    ) : null}
                  </h3>
                  <ul className="grid list-none gap-1 text-body-sm">
                    {group.lines.map((line, index) => (
                      <li
                        key={`${line.kind}:${line.label}:${index}`}
                        className="flex flex-wrap gap-x-2"
                      >
                        <span className="text-text-muted">
                          {assertionLabel(cardCopy, line, locale)}:
                        </span>
                        {/* A name is written in a language, and the source
                            says which one — so the markup says it too (WCAG
                            3.1.2). A fact or an identifier is not a name and
                            gets no `lang`: claiming one would be the same
                            error in the other direction. */}
                        <span
                          {...(line.kind === "name" &&
                          isLanguageQualifier(line.qualifier)
                            ? { lang: line.qualifier }
                            : {})}
                          className="text-text"
                        >
                          {assertionValue(line, locale)}
                        </span>
                        {line.qualifier ? (
                          <span className="text-text-muted">
                            {`(${catalogQualifierName(
                              line.qualifier,
                              line.kind,
                              locale,
                            )})`}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {page.card.attributions.length > 0 ? (
              <ul
                data-organism-attributions
                className="grid list-none gap-1 border-t border-border pt-3 text-caption text-text-muted"
              >
                {page.card.attributions.map((attribution) => {
                  const downloaded = formatOrganismDate(
                    locale,
                    attribution.downloadedAt,
                  );
                  return (
                    <li
                      key={attribution.sourceSlug}
                      data-organism-attribution={attribution.sourceSlug}
                    >
                      {attribution.text}
                      {downloaded
                        ? ` · ${cardCopy.sections.downloadedOn}: ${downloaded}`
                        : ""}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </Section>
      ) : null}

      {/* The owner's edit controls (ADR-0026 D10) render only for the owner's
          own session; a signed-in gardener and a guest see the same card
          without them — and so does the static document. */}
      <Suspense fallback={null}>
        <OwnerCardControlsRegion
          locale={locale}
          catalogItemId={page.catalog.catalogItemId}
          canonicalName={page.catalog.canonicalName}
          indexableOverride={page.card.indexableOverride}
        />
      </Suspense>

      <PublicVarietySourceCredits
        locale={locale}
        credits={page.sourceCredits}
        contentUpdatedAt={page.catalog.contentUpdatedAt}
      />
    </main>
  );
}

/** The fact-only first paragraph (ADR-0026 D9), for the page and its description. */
function organismFactParagraph(
  page: PublicVarietyPage,
  locale: InterfaceLocale,
) {
  const species = page.catalog.species;
  return formatOrganismFactParagraph(locale, {
    canonicalName: page.catalog.canonicalName,
    catalogKind: page.catalog.catalogKind,
    // A form's species as its reader knows it, quoted the way the language
    // quotes a name — "сорт виду «помідор їстівний»" — and its accepted name
    // when the catalogue holds no other (`OVE-497`).
    speciesName: species
      ? species.displayName !== species.canonicalName
        ? quotedName(species.displayName, locale)
        : species.canonicalName
      : null,
    formCount: page.card.formCount,
    gardenerCount: page.card.gardenerCount,
    regionCount: page.card.regions.length,
    organismRole: organismRoleFor({
      kingdom: page.catalog.kingdom,
      hostCount: page.card.hosts.length,
    }),
  });
}

/** "Saved to your wishlist" — a receipt the redirect leaves in the address. */
export async function WishlistSavedReceipt({
  searchParams,
  label,
}: {
  searchParams: PublicCatalogEvidenceRouteProps["searchParams"];
  label: string;
}) {
  const query = (await searchParams) ?? EMPTY_SEARCH_PARAMS;
  if (firstParam(query.wishlist) !== "saved") return null;

  return (
    <p className="text-body-sm text-text-muted" role="status">
      {label}
    </p>
  );
}

/** The panel for this reader: their like state and their held action. */
async function ViewerCardEngagementPanel({
  locale,
  target,
  summary,
  returnTo,
  searchParams,
}: {
  locale: InterfaceLocale;
  target: { kind: "variety"; ref: string };
  summary: NonNullable<Awaited<ReturnType<typeof readGuestEngagementSummary>>>;
  returnTo: string;
  searchParams: PublicCatalogEvidenceRouteProps["searchParams"];
}) {
  const [query, shellSession, likeState] = await Promise.all([
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
    getSiteShellSessionState(),
    readViewerLikeState(target),
  ]);

  return (
    <PublicEngagementPanel
      isAuthenticated={shellSession.isAuthenticated}
      target={target}
      likeState={likeState}
      summary={summary}
      returnTo={returnTo}
      locale={locale}
      resumeAction={normalizeAuthIntentResumeAction(query.authIntent)}
      resumeControl={normalizeAuthIntentResumeControl(query.authControl)}
    />
  );
}

/**
 * The owner's controls, for the owner. Two owner-only reads, and only for the
 * owner: the names the card can pin and what has already been done to it. A
 * failure costs the controls their lists, never the card.
 */
async function OwnerCardControlsRegion({
  locale,
  catalogItemId,
  canonicalName,
  indexableOverride,
}: {
  locale: InterfaceLocale;
  catalogItemId: string;
  canonicalName: string;
  indexableOverride: React.ComponentProps<
    typeof CatalogOwnerCardControls
  >["indexableOverride"];
}) {
  const shellSession = await getSiteShellSessionState();
  const isOwner = shellSession.ownerUserId
    ? await isOwnerUserId(shellSession.ownerUserId).catch(() => false)
    : false;
  if (!isOwner) return null;

  const [names, audit] = await Promise.all([
    listCatalogCardNames(catalogItemId).catch(() => []),
    listOwnerActionAudit({ catalogItemId, limit: 8 }).catch(() => []),
  ]);

  return (
    <CatalogOwnerCardControls
      locale={locale}
      catalogItemId={catalogItemId}
      canonicalName={canonicalName}
      indexableOverride={indexableOverride}
      names={names}
      audit={audit}
    />
  );
}

type OrganismCopy = ReturnType<typeof getPublicSurfaceCopy>["organism"];

function hostClassLabel(copy: OrganismCopy, hostClass: string) {
  return (copy.hostClass as Record<string, string>)[hostClass] ?? hostClass;
}

function presenceRegionLabel(copy: OrganismCopy, regionCode: string) {
  return (
    (copy.presenceRegion as Record<string, string>)[regionCode] ?? regionCode
  );
}

function assertionLabel(
  copy: OrganismCopy,
  line: PublicOrganismAssertionLine,
  locale: InterfaceLocale,
) {
  if (line.kind === "name") {
    return (copy.nameType as Record<string, string>)[line.label] ?? line.label;
  }
  if (line.kind === "fact") {
    return (copy.predicate as Record<string, string>)[line.label] ?? line.label;
  }
  // The register or database the number points into, by its name — not
  // `UA_REGISTER` (`OVE-497`).
  return catalogIdentifierSchemeName(line.label, locale);
}

/** A line's value as a reader would say it: a number as printed, a status in words. */
function assertionValue(
  line: PublicOrganismAssertionLine,
  locale: InterfaceLocale,
) {
  if (line.kind === "identifier") {
    return registerNumber(line.value) ?? line.value;
  }
  if (line.kind === "fact") {
    return catalogFactValue(line.label, line.value, locale);
  }
  return line.value;
}

/** A name in the quotation marks its language uses. */
function quotedName(value: string, locale: InterfaceLocale) {
  return locale === "bg" ? `„${value}“` : `«${value}»`;
}

/**
 * A name as a heading writes it. The catalogue stores common names as a
 * dictionary does — "помідор їстівний" — and a heading starts with a capital
 * in all three languages.
 */
function capitalizeFirst(value: string, locale: InterfaceLocale) {
  return value.charAt(0).toLocaleUpperCase(locale) + value.slice(1);
}

function getCatalogEvidenceCopy(
  locale: InterfaceLocale,
  catalogKind: CatalogKind,
) {
  const publicCopy = getPublicSurfaceCopy(locale);
  if (catalogKind === "plant_variety") {
    return {
      title: publicCopy.variety.title,
      metadataSuffix: publicCopy.variety.metadataSuffix,
    };
  }

  return CATALOG_EVIDENCE_COPY[locale][catalogKind];
}

const CATALOG_EVIDENCE_COPY = {
  uk: {
    species: {
      title: "Публічний вид",
      metadataSuffix: "вид",
    },
    breed: {
      title: "Публічна порода або лінія",
      metadataSuffix: "порода або лінія",
    },
  },
  bg: {
    species: {
      title: "Публичен вид",
      metadataSuffix: "вид",
    },
    breed: {
      title: "Публична порода или линия",
      metadataSuffix: "порода или линия",
    },
  },
  ru: {
    species: {
      title: "Публичный вид",
      metadataSuffix: "вид",
    },
    breed: {
      title: "Публичная порода или линия",
      metadataSuffix: "порода или линия",
    },
  },
} as const;

function formatDate(value: Date | string, locale: InterfaceLocale) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * True when an assertion line's qualifier is a language tag.
 *
 * The qualifier carries whatever the source said about the line — a language
 * for a name, a unit or a scope for a fact — so `lang` is only written when
 * the shape is a BCP-47 tag and the line is a name.
 */
function isLanguageQualifier(qualifier: string | null): qualifier is string {
  return (
    qualifier !== null && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/u.test(qualifier)
  );
}

/** `<time datetime>` wants ISO, whatever the row holds. */
function organismIsoDate(value: Date | string | null | undefined) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

/**
 * The card's contents, for the shell's rail above `xl` (`OVE-452`).
 *
 * Every entry points at a section that is on this page and **open**: the rail
 * is a way to move within a document a reader already has, not a way to reach
 * something the page is hiding. A section with nothing in it is not listed,
 * because a contents entry that leads to an empty heading is worse than no
 * entry at all.
 */
function buildOrganismCardContextModules(
  cardCopy: ReturnType<typeof getPublicSurfaceCopy>["organism"],
  present: {
    experience: boolean;
    relations: boolean;
    presence: boolean;
    mentions: boolean;
    namesAndSources: boolean;
  },
): SiteShellContextRailModule[] {
  const items = [
    present.experience
      ? { href: "#organism-experience", label: cardCopy.sections.experience }
      : null,
    present.relations
      ? { href: "#organism-relations", label: cardCopy.sections.relations }
      : null,
    present.presence
      ? { href: "#organism-presence", label: cardCopy.sections.presence }
      : null,
    present.mentions
      ? { href: "#organism-mentions", label: cardCopy.sections.mentions }
      : null,
    present.namesAndSources
      ? {
          href: "#organism-names-and-sources",
          label: cardCopy.sections.namesAndSources,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return [
    {
      key: "organism-contents",
      title: cardCopy.sections.onThisPage,
      items,
      emptyLabel: cardCopy.sections.onThisPage,
    },
  ];
}
