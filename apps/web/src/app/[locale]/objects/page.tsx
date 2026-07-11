import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  PublicObjectCatalog,
  type PublicObjectCatalogState,
} from "@/components/public/public-object-catalog";
import { getPublicObjectCatalogCopy } from "@/lib/public-object-catalog-copy";
import {
  buildLanguageAlternates,
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
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

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
      robots: evaluatePublicSurfaceIndexability({ kind: "missing" }).robots,
    };
  }

  const copy = getPublicObjectCatalogCopy(localeParam);
  const indexState = evaluatePublicSurfaceIndexability({
    kind: "catalog_browse",
  });

  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    alternates: {
      canonical: localizedPath(localeParam, "/objects"),
      languages: buildLanguageAlternates("/objects"),
    },
    robots: indexState.robots,
    openGraph: { locale: localeParam },
  };
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
    return (
      <PublicObjectCatalog
        locale={locale}
        copy={getPublicObjectCatalogCopy(locale)}
        page={emptyPublicObjectCatalogPage(request)}
        state={visualMode}
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

  return (
    <PublicObjectCatalog
      locale={locale}
      copy={getPublicObjectCatalogCopy(locale)}
      page={page}
      state={state}
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
  };
}
