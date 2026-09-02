import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Bookmark, NotebookPen } from "lucide-react";

import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import { PublicVarietySourceCredits } from "@/app/variety/[slug]/source-credits";
import { addCatalogPublicSlugToWishlistAction } from "@/app/wishlist/actions";
import { OwnerScopedActionForm } from "@/components/auth/owner-scope";
import { buttonVariants } from "@/components/ui/button";
import type { CatalogKind } from "@/db/schema";
import {
  gardenCatalogPreselectionPath,
  gardenFirstEntryPreselectionPath,
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
  publicCatalogStatusLabel,
} from "@/lib/public-surface-localization";
import { getEngagementSummary } from "@/server/engagement-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
  resolvePublicSurfacePayloadWithDeadline,
  resolveUnresolvedPublicSurfaceDiscovery,
} from "@/server/public-surface-discovery";
import { buildPublicVarietySurfaceMetadata } from "@/server/public-variety-metadata";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import {
  buildPublicVarietyDiscoverySource,
  getPublicVarietyPage,
} from "@/server/public-variety-repository";
import { getSiteShellSessionState } from "@/server/site-shell-session";

export interface PublicCatalogEvidenceRouteProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

const getCachedPublicCatalogEvidencePage = cache(
  (slug: string, catalogKind: CatalogKind, locale: InterfaceLocale) =>
    getPublicVarietyPage(slug, catalogKind, undefined, locale),
);

export async function generatePublicCatalogEvidenceMetadata(
  catalogKind: CatalogKind,
  { params }: PublicCatalogEvidenceRouteProps,
): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([
    params,
    getRequestInterfaceLocale(),
  ]);
  const routeCopy = getCatalogEvidenceCopy(locale, catalogKind);
  const bounded = await resolvePublicSurfacePayloadWithDeadline({
    consumerId: "catalog_evidence",
    evaluatedAt: new Date(),
    deadlineMs: PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
    load: async () => {
      const page = await getCachedPublicCatalogEvidencePage(
        slug,
        catalogKind,
        locale,
      );
      if (!page) throw new Error("Public catalog evidence unavailable.");
      return {
        source: buildPublicVarietyDiscoverySource(page, "catalog_evidence"),
        payload: page,
      };
    },
  });
  const page = bounded.payload;

  if (!page) {
    const missingIndexState =
      resolveUnresolvedPublicSurfaceDiscovery("catalog_evidence").decision;

    return {
      title: `${routeCopy.title} | OverGarden`,
      robots: missingIndexState.robots,
    };
  }

  const surface = buildPublicVarietySurfaceMetadata(page, locale, bounded);
  return {
    ...surface.metadata,
    title: `${page.catalog.canonicalName} · ${routeCopy.metadataSuffix} | OverGarden`,
    description: `${routeCopy.title}: ${page.catalog.canonicalName}.`,
  };
}

export async function renderPublicCatalogEvidenceRoute(
  catalogKind: CatalogKind,
  { params, searchParams }: PublicCatalogEvidenceRouteProps,
) {
  const [{ slug }, query, locale, shellSession] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
    getSiteShellSessionState(),
  ]);
  const publicCopy = getPublicSurfaceCopy(locale);
  const routeCopy = getCatalogEvidenceCopy(locale, catalogKind);
  const page = await getCachedPublicCatalogEvidencePage(
    slug,
    catalogKind,
    locale,
  );

  if (!page) notFound();

  const publicPath = publicCatalogEvidencePath(
    page.catalog.catalogKind,
    page.catalog.publicSlug,
  );
  const surface = buildPublicVarietySurfaceMetadata(page, locale);
  const serializedJsonLd = serializePublicSurfaceJsonLd(surface.jsonLd);
  const isPlantVariety = catalogKind === "plant_variety";
  const wishlistStatus = firstParam(query.wishlist);
  const engagementStatus = firstParam(query.engagement);
  const resumeAction = normalizeAuthIntentResumeAction(query.authIntent);
  const resumeControl = normalizeAuthIntentResumeControl(query.authControl);
  const engagementTarget = {
    kind: "variety" as const,
    ref: page.catalog.publicSlug,
  };
  const engagement = isPlantVariety
    ? await getEngagementSummary(engagementTarget)
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
          summary={engagement}
          returnTo={publicPath}
          status={engagementStatus}
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
              <Image
                src={entry.media.publicUrl}
                alt={`${entry.title} · ${publicCopy.passport.publicPhotoSuffix}`}
                width={448}
                height={252}
                sizes="(min-width: 640px) 14rem, 100vw"
                unoptimized
                className="aspect-video w-full rounded-md border border-border object-cover sm:w-56"
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
