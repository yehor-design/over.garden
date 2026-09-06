import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { Bookmark, NotebookPen } from "lucide-react";

import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import { PublicVarietySourceCredits } from "@/app/(default)/variety/[slug]/source-credits";
import { addCatalogPublicSlugToWishlistAction } from "@/app/(default)/wishlist/actions";
import { OwnerScopedActionForm } from "@/components/auth/owner-scope";
import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import { buildPublicMediaSourceSet } from "@/lib/media/derivative-keys";
import { buttonVariants } from "@/components/ui/button";
import type { CatalogKind } from "@/db/schema";
import {
  gardenCatalogPreselectionPath,
  gardenFirstEntryPreselectionPath,
} from "@/lib/garden/public-paths";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatPublicCount,
  getPublicSurfaceCopy,
  publicCatalogStatusLabel,
} from "@/lib/public-surface-localization";
import { getEngagementSummary } from "@/server/engagement-repository";
import { readViewerLikeState } from "@/app/engagement/engagement-viewer";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  resolvePublicSurfacePayload,
  resolveUnresolvedPublicSurfaceDiscovery,
} from "@/server/public-surface-discovery";
import { buildPublicVarietySurfaceMetadata } from "@/server/public-variety-metadata";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import { buildPublicVarietyDiscoverySource } from "@/server/public-variety-repository";
import { getSiteShellSessionState } from "@/server/site-shell-session";
import {
  describeWorkspaceFailure,
  recordWorkspaceSectionFailure,
} from "@/server/workspace-failure";
import {
  readPublicCatalogAddress,
  readPublicVarietyPageByCatalogItemId,
} from "@/server/public-cache";
import type { PublicCatalogAddressRequest } from "@/lib/catalog/addresses";
import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";

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
) {
  const [{ slug, form, locale: localeParam }, query] = await Promise.all([
    props.params,
    props.searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
  ]);
  const locale: InterfaceLocale | null = localeParam
    ? isPublicLocale(localeParam)
      ? localeParam
      : null
    : await getRequestInterfaceLocale();
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
  const address = locale ? await getCachedCatalogAddress(request) : null;
  return { locale, routeLocale, query, address };
}

export async function generatePublicCatalogEvidenceMetadata(
  family: PublicCatalogEvidenceFamily,
  props: PublicCatalogEvidenceRouteProps,
): Promise<Metadata> {
  const { locale, routeLocale, address } = await resolveCatalogEvidenceRequest(
    family,
    props,
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
    description: `${routeCopy.title}: ${page.catalog.canonicalName}.`,
  };
}

export async function renderPublicCatalogEvidenceRoute(
  family: PublicCatalogEvidenceFamily,
  props: PublicCatalogEvidenceRouteProps,
) {
  const { locale, routeLocale, query, address } =
    await resolveCatalogEvidenceRequest(family, props);
  if (!locale || !address || address.status === "not_found") notFound();
  if (address.status === "redirect") {
    permanentRedirect(localizedPath(routeLocale, address.canonicalPath));
  }
  const [shellSession, page] = await Promise.all([
    getSiteShellSessionState(),
    getCachedPublicCatalogEvidencePage(address.catalogItemId, locale),
  ]);
  if (!page) notFound();

  const catalogKind = page.catalog.catalogKind;
  const publicCopy = getPublicSurfaceCopy(locale);
  const routeCopy = getCatalogEvidenceCopy(locale, catalogKind);
  const publicPath = localizedPath(routeLocale, page.catalog.canonicalPath);
  const surface = buildPublicVarietySurfaceMetadata(page, locale, {
    routeLocale,
  });
  const serializedJsonLd = serializePublicSurfaceJsonLd(surface.jsonLd);
  const isPlantVariety = catalogKind === "plant_variety";
  const wishlistStatus = firstParam(query.wishlist);
  const resumeAction = normalizeAuthIntentResumeAction(query.authIntent);
  const resumeControl = normalizeAuthIntentResumeControl(query.authControl);
  const engagementTarget = {
    kind: "variety" as const,
    ref: page.catalog.publicSlug,
  };
  // A variety is a public engagement target only once it has public entries
  // (`buildPublicVarietyTargetQuery`): an organism without them renders with
  // no panel, and a refused panel never takes the page down.
  const engagement =
    isPlantVariety && page.entryCount > 0
      ? await getEngagementSummary(engagementTarget).catch((reason: unknown) => {
          recordWorkspaceSectionFailure(describeWorkspaceFailure(reason), {
            surface: "engagement_panel",
            section: "summary",
          });
          return null;
        })
      : null;
  const likeState = engagement
    ? await readViewerLikeState(engagementTarget)
    : null;

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      <header className="flex flex-col gap-5 border-b border-border pb-6">
        <Link
          href={`/objects?identity=${catalogKind}`}
          className="self-start rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
        >
          {routeCopy.backToCatalog}
        </Link>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            {routeCopy.title}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {page.catalog.canonicalName}
          </h1>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {formatPublicCount(locale, "entry", page.entryCount)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {formatPublicCount(locale, "photo", page.photoCount)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {publicCatalogStatusLabel(locale, page.catalog.status)}
            </span>
          </div>
          <Link
            href={
              isPlantVariety
                ? gardenFirstEntryPreselectionPath(page.catalog.publicSlug)
                : gardenCatalogPreselectionPath(page.catalog.publicSlug)
            }
            className={buttonVariants({
              size: "lg",
              className: "mt-2 self-start",
            })}
          >
            <NotebookPen className="size-4" />
            {routeCopy.logThisIdentity}
          </Link>
          {isPlantVariety ? (
            <OwnerScopedActionForm
              action={addCatalogPublicSlugToWishlistAction}
            >
              <input
                type="hidden"
                name="catalogPublicSlug"
                value={page.catalog.publicSlug}
              />
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="returnTo" value={publicPath} />
              <button
                type="submit"
                className={buttonVariants({
                  variant: "outline",
                  className: "self-start",
                })}
              >
                <Bookmark className="size-4" />
                {publicCopy.variety.saveToWishlist}
              </button>
            </OwnerScopedActionForm>
          ) : null}
          {isPlantVariety && wishlistStatus === "saved" ? (
            <p className="text-sm text-muted-foreground">
              {publicCopy.variety.savedToWishlist}
            </p>
          ) : null}
        </div>
      </header>

      {isPlantVariety && page.seedProof ? (
        <section className="grid gap-4 border-b border-border pb-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {publicCopy.variety.growingNote}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {page.seedProof.title}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {page.seedProof.summary}
            </p>
          </div>
          <p className="max-w-3xl text-sm leading-6 whitespace-pre-wrap text-foreground">
            {page.seedProof.body}
          </p>
          {page.seedProof.sourceLabel ? (
            <p className="text-xs text-muted-foreground">
              {page.seedProof.sourceLabel}
            </p>
          ) : null}
        </section>
      ) : null}

      <PublicVarietySourceCredits
        locale={locale}
        credits={page.sourceCredits}
      />

      {isPlantVariety && engagement ? (
        <PublicEngagementPanel
          isAuthenticated={shellSession.isAuthenticated}
          target={engagementTarget}
          likeState={likeState}
          summary={engagement}
          returnTo={publicPath}
          locale={locale}
          resumeAction={resumeAction}
          resumeControl={resumeControl}
        />
      ) : null}

      <ol className="grid gap-4">
        {page.entries.map((entry) => (
          <li
            key={entry.id}
            className={`grid gap-4 rounded-lg border border-border p-4 ${
              entry.media ? "sm:grid-cols-3" : ""
            }`}
          >
            <article
              className={`flex min-w-0 flex-col gap-3 ${
                entry.media ? "sm:col-span-2" : ""
              }`}
            >
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <time>{formatDate(entry.entryDate, locale)}</time>
                  {entry.safeLocationLabel ? (
                    <span>{entry.safeLocationLabel}</span>
                  ) : null}
                  <span>{entry.varietyText ?? page.catalog.canonicalName}</span>
                </div>
                <h2 className="text-lg font-semibold text-foreground">
                  {entry.title}
                </h2>
              </div>
              <p className="text-sm leading-6 whitespace-pre-wrap text-foreground">
                {entry.body}
              </p>
              <Link
                href={entry.publicPath}
                className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {publicCopy.variety.openSourceEntry}
              </Link>
            </article>

            {entry.media ? (
              <SubjectAwareMediaImage
                src={entry.media.publicUrl}
                srcSet={buildPublicMediaSourceSet(entry.media).srcSet}
                placeholderDataUri={entry.media.placeholderDataUri}
                alt={`${entry.title} · ${publicCopy.passport.publicPhotoSuffix}`}
                width={448}
                height={252}
                sizes="(min-width: 640px) 14rem, 100vw"
                presentationMode="cover"
                intrinsicWidth={entry.media.intrinsicWidth}
                intrinsicHeight={entry.media.intrinsicHeight}
                className="aspect-video w-full rounded-md border border-border sm:w-56"
              />
            ) : null}
          </li>
        ))}
      </ol>
    </main>
  );
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
      logThisIdentity: publicCopy.variety.logThisVariety,
      backToCatalog: CATALOG_EVIDENCE_COPY[locale].backToCatalog,
    };
  }

  return {
    ...CATALOG_EVIDENCE_COPY[locale][catalogKind],
    backToCatalog: CATALOG_EVIDENCE_COPY[locale].backToCatalog,
  };
}

const CATALOG_EVIDENCE_COPY = {
  uk: {
    backToCatalog: "Усі живі об'єкти",
    species: {
      title: "Публічний вид",
      metadataSuffix: "вид",
      logThisIdentity: "Записати цей вид",
    },
    breed: {
      title: "Публічна порода або лінія",
      metadataSuffix: "порода або лінія",
      logThisIdentity: "Записати цю породу або лінію",
    },
  },
  bg: {
    backToCatalog: "Всички живи обекти",
    species: {
      title: "Публичен вид",
      metadataSuffix: "вид",
      logThisIdentity: "Запишете този вид",
    },
    breed: {
      title: "Публична порода или линия",
      metadataSuffix: "порода или линия",
      logThisIdentity: "Запишете тази порода или линия",
    },
  },
  ru: {
    backToCatalog: "Все живые объекты",
    species: {
      title: "Публичный вид",
      metadataSuffix: "вид",
      logThisIdentity: "Записать этот вид",
    },
    breed: {
      title: "Публичная порода или линия",
      metadataSuffix: "порода или линия",
      logThisIdentity: "Записать эту породу или линию",
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
