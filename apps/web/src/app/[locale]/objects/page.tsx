import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  PublicObjectCatalog,
  type PublicObjectCatalogState,
} from "@/components/public/public-object-catalog";
import { getPublicObjectCatalogCopy } from "@/lib/public-object-catalog-copy";
import {
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import { resolveVisualFixturePublicObjectCatalogMode } from "@/lib/visual-fixtures/public-object-catalog-scenarios";
import {
  listPublicObjectCatalogPage,
  normalizePublicObjectCatalogRequest,
  type PublicObjectCatalogPage,
} from "@/server/public-object-catalog-repository";
import {
  latestMeaningfulContentTimestamp,
  PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfaceDiscoveryWithDeadline,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";

interface PublicObjectsRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PublicObjectsRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) {
    return {
      title: "OverGarden",
      robots: resolveUnresolvedPublicSurfaceDiscovery(
        "localized_catalog_browse",
      ).decision.robots,
    };
  }

  const request = normalizePublicObjectCatalogRequest({});
  const discovery = await resolvePublicSurfaceDiscoveryWithDeadline({
    consumerId: "localized_catalog_browse",
    evaluatedAt: new Date(),
    deadlineMs: PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
    loadSource: async () =>
      buildObjectCatalogDiscoverySource(
        localeParam,
        await listPublicObjectCatalogPage(request, localeParam),
        false,
      ),
  });
  return buildObjectCatalogSurface(
    localeParam,
    emptyPublicObjectCatalogPage(request),
    discovery,
  ).metadata;
}

export async function renderPublicObjectsPage(
  locale: PublicLocale,
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  const request = normalizePublicObjectCatalogRequest(searchParams);
  const visualMode = resolveVisualFixturePublicObjectCatalogMode(
    searchParams,
    process.env,
  );
  if (visualMode) {
    const page = emptyPublicObjectCatalogPage(request);
    const discovery = resolvePublicSurfaceDiscoveryForRequest(
      buildObjectCatalogDiscoverySource(locale, page, true),
    );
    const surface = buildObjectCatalogSurface(locale, page, discovery);
    return (
      <PublicObjectCatalog
        locale={locale}
        copy={getPublicObjectCatalogCopy(locale)}
        page={page}
        state={visualMode}
        jsonLd={surface.jsonLd}
      />
    );
  }
  const result = await Promise.allSettled([
    listPublicObjectCatalogPage(request, locale),
  ]);
  const resolved = result[0];
  const page: PublicObjectCatalogPage =
    resolved.status === "fulfilled"
      ? resolved.value
      : emptyPublicObjectCatalogPage(request);
  const state: PublicObjectCatalogState =
    resolved.status === "rejected"
      ? "error"
      : page.cards.length === 0
        ? "empty"
        : "ready";
  const discovery = resolvePublicSurfaceDiscoveryForRequest(
    buildObjectCatalogDiscoverySource(locale, page, false),
  );
  const surface = buildObjectCatalogSurface(locale, page, discovery);

  return (
    <PublicObjectCatalog
      locale={locale}
      copy={getPublicObjectCatalogCopy(locale)}
      page={page}
      state={state}
      jsonLd={surface.jsonLd}
    />
  );
}

export default async function PublicObjectsRoute({
  params,
  searchParams,
}: PublicObjectsRouteProps) {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) notFound();

  return renderPublicObjectsPage(localeParam, (await searchParams) ?? {});
}

function emptyPublicObjectCatalogPage(
  request: ReturnType<typeof normalizePublicObjectCatalogRequest>,
): PublicObjectCatalogPage {
  return {
    request,
    cards: [],
    totalCount: 0,
    totalPages: 1,
    hasPreviousPage: request.page > 1,
    hasNextPage: false,
    qualityClass: "unverified",
  };
}

function buildObjectCatalogDiscoverySource(
  locale: PublicLocale,
  page: PublicObjectCatalogPage,
  isVisualFixture: boolean,
): PublicSurfaceDiscoverySource {
  const copy = getPublicObjectCatalogCopy(locale);
  return {
    consumerId: "localized_catalog_browse",
    candidateState: isVisualFixture ? "not_public_candidate" : "candidate",
    qualityClass: page.qualityClass ?? "unverified",
    visibleText: [
      copy.metadataTitle,
      copy.metadataDescription,
      copy.heading,
      copy.intro,
      ...page.cards.flatMap((card) => [
        card.identityName ?? "",
        card.representativeObject.displayName,
        card.latestJournal.title,
      ]),
    ],
    distinctPublicEntityIds: page.cards.flatMap((card) => [
      card.key,
      card.representativeObject.path,
      card.latestJournal.path,
    ]),
    meaningfulContentAt: latestMeaningfulContentTimestamp(
      page.cards.map((card) => card.latestJournal.entryDate),
    ),
    canonicalPath: localizedPath(locale, "/objects"),
    equivalentLocales: [locale],
  };
}

function buildObjectCatalogSurface(
  locale: PublicLocale,
  page: PublicObjectCatalogPage,
  discovery: PublicSurfaceDiscoveryResult,
) {
  const copy = getPublicObjectCatalogCopy(locale);
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    contentLocale: null,
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    visibleFacts: {
      type: "CollectionPage",
      name: copy.heading,
      description: copy.intro,
      itemNames: page.cards.map(
        (card) => card.identityName ?? card.representativeObject.displayName,
      ),
    },
  });
}
