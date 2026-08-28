import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  PublicStableRegistryDetail,
  PublicStableRegistryExplorer,
  type PublicStableRegistryExplorerState,
} from "@/components/public/public-stable-registry-explorer";
import {
  getPublicStableRegistryExplorerCopy,
  publicStableRegistrySurfaceCopy,
} from "@/lib/stable-registry/public-explorer-copy";
import { isStableRegistryPublicDiscoveryEnabled } from "@/lib/stable-registry/feature-gate";
import {
  localizedPath,
  PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  findPublicEppoSourceRecord,
  listPublicEppoSourcePage,
  parsePublicStableRegistryRequest,
  PUBLIC_STABLE_REGISTRY_QUERY_DEADLINE_MS,
  type PublicEppoSourceRecord,
  type PublicStableRegistrySurface,
} from "@/server/catalog-source/public-eppo-explorer-repository";
import {
  findPublicStableCatalogRecord,
  listPublicStableCatalogPage,
  type PublicStableCatalogRecord,
  type PublicStableRegistryPage,
} from "@/server/stable-registry/public-catalog-repository";
import {
  latestMeaningfulContentTimestamp,
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfacePayloadWithDeadline,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";

type ExplorerRecord = PublicStableCatalogRecord | PublicEppoSourceRecord;

export async function renderStableRegistryExplorer(
  locale: PublicLocale,
  surface: PublicStableRegistrySurface,
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  if (!isStableRegistryPublicDiscoveryEnabled()) notFound();
  const parsed = parsePublicStableRegistryRequest(searchParams);
  if (parsed.error) {
    const page = emptyExplorerPage(parsed.request, surface);
    return (
      <PublicStableRegistryExplorer
        locale={locale}
        surface={surface}
        page={page}
        state="degraded"
        message="invalid_query"
        jsonLd={null}
      />
    );
  }

  const resolved = await loadExplorerWithDiscovery(
    locale,
    surface,
    parsed.request,
  );
  const state: PublicStableRegistryExplorerState =
    resolved.terminalClass === "resolved" && resolved.payload
      ? resolved.payload.records.length > 0
        ? "ready"
        : "empty"
      : "degraded";
  const page = resolved.payload ?? emptyExplorerPage(parsed.request, surface);
  const surfaceMetadata = buildExplorerSurfaceMetadata(
    locale,
    surface,
    page,
    resolved,
  );

  return (
    <PublicStableRegistryExplorer
      locale={locale}
      surface={surface}
      page={page}
      state={state}
      message={state === "degraded" ? "unavailable" : undefined}
      jsonLd={surfaceMetadata.jsonLd}
    />
  );
}

export async function stableRegistryExplorerMetadata(
  locale: PublicLocale,
  surface: PublicStableRegistrySurface,
): Promise<Metadata> {
  if (!isStableRegistryPublicDiscoveryEnabled()) {
    return {
      title: "OverGarden",
      robots: resolveUnresolvedPublicSurfaceDiscovery(consumerId(surface))
        .decision.robots,
    };
  }
  const request = parsePublicStableRegistryRequest({}).request;
  const resolved = await loadExplorerWithDiscovery(locale, surface, request);
  const page = resolved.payload ?? emptyExplorerPage(request, surface);
  return buildExplorerSurfaceMetadata(locale, surface, page, resolved).metadata;
}

export function renderStableRegistryDetail(
  locale: PublicLocale,
  surface: PublicStableRegistrySurface,
  record: ExplorerRecord,
) {
  const discovery = buildDetailDiscoverySource(locale, surface, record);
  const metadata = buildPublicSurfaceMetadata({
    discovery: {
      consumerId: detailConsumerId(surface),
      candidateInput: resolveDetailDiscovery(discovery).candidateInput,
      decision: resolveDetailDiscovery(discovery).decision,
    },
    locale,
    contentLocale: null,
    title: `${record.displayName} | OverGarden`,
    description:
      getPublicStableRegistryExplorerCopy(locale).evidenceDescription[
        record.evidenceState
      ],
    visibleFacts: {
      type: "ItemPage",
      name: record.displayName,
      description:
        getPublicStableRegistryExplorerCopy(locale).evidenceDescription[
          record.evidenceState
        ],
      dateModified: record.observedAt,
    },
  });

  return (
    <PublicStableRegistryDetail
      locale={locale}
      surface={surface}
      record={record}
      jsonLd={metadata.jsonLd}
    />
  );
}

export async function loadPublicStableRegistryDetail(
  locale: PublicLocale,
  surface: PublicStableRegistrySurface,
  identifier: string,
): Promise<ExplorerRecord | null> {
  if (!isStableRegistryPublicDiscoveryEnabled()) return null;
  return loadDetail(surface, identifier, locale);
}

export async function stableRegistryDetailMetadata(
  locale: PublicLocale,
  surface: PublicStableRegistrySurface,
  identifier: string,
): Promise<Metadata> {
  const record = await loadPublicStableRegistryDetail(
    locale,
    surface,
    identifier,
  );
  if (!record) {
    return {
      title: "OverGarden",
      robots: resolveUnresolvedPublicSurfaceDiscovery(detailConsumerId(surface))
        .decision.robots,
    };
  }
  const discovery = resolveDetailDiscovery(
    buildDetailDiscoverySource(locale, surface, record),
  );
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    contentLocale: null,
    title: `${record.displayName} | OverGarden`,
    description:
      getPublicStableRegistryExplorerCopy(locale).evidenceDescription[
        record.evidenceState
      ],
    visibleFacts: {
      type: "ItemPage",
      name: record.displayName,
      description:
        getPublicStableRegistryExplorerCopy(locale).evidenceDescription[
          record.evidenceState
        ],
      dateModified: record.observedAt,
    },
  }).metadata;
}

async function loadExplorerWithDiscovery(
  locale: PublicLocale,
  surface: PublicStableRegistrySurface,
  request: PublicStableRegistryPage<ExplorerRecord>["request"],
) {
  return resolvePublicSurfacePayloadWithDeadline({
    consumerId: consumerId(surface),
    evaluatedAt: new Date(),
    deadlineMs: PUBLIC_STABLE_REGISTRY_QUERY_DEADLINE_MS,
    load: async () => {
      const page =
        surface === "catalog"
          ? await listPublicStableCatalogPage(request, locale)
          : await listPublicEppoSourcePage(request, locale);
      return {
        payload: page as PublicStableRegistryPage<ExplorerRecord>,
        source: buildExplorerDiscoverySource(locale, surface, page),
      };
    },
  });
}

async function loadDetail(
  surface: PublicStableRegistrySurface,
  identifier: string,
  locale: PublicLocale,
): Promise<ExplorerRecord | null> {
  try {
    return surface === "catalog"
      ? await findPublicStableCatalogRecord(identifier, locale)
      : await findPublicEppoSourceRecord(identifier, locale);
  } catch {
    return null;
  }
}

function emptyExplorerPage(
  request: PublicStableRegistryPage<ExplorerRecord>["request"],
  surface: PublicStableRegistrySurface,
): PublicStableRegistryPage<ExplorerRecord> {
  return {
    request,
    records: [],
    nextCursor: null,
    qualityClass: surface === "catalog" ? "verified" : "partial",
  };
}

function buildExplorerDiscoverySource(
  locale: PublicLocale,
  surface: PublicStableRegistrySurface,
  page: PublicStableRegistryPage<ExplorerRecord>,
): PublicSurfaceDiscoverySource {
  const copy = getPublicStableRegistryExplorerCopy(locale);
  const surfaceCopy = publicStableRegistrySurfaceCopy(copy, surface);
  return {
    consumerId: consumerId(surface),
    candidateState: "candidate",
    qualityClass: page.qualityClass,
    visibleText: [
      surfaceCopy.title,
      surfaceCopy.intro,
      surfaceCopy.resultsTitle,
      ...page.records.flatMap((record) => [
        record.displayName,
        record.scientificName ?? "",
        record.taxonomicRank ?? "",
        record.parentDisplayName ?? "",
        ...record.aliases,
        copy.evidenceDescription[record.evidenceState],
      ]),
    ],
    distinctPublicEntityIds: page.records.map((record) =>
      "stableTaxon" in record ? record.stableTaxon : record.eppoCode,
    ),
    meaningfulContentAt: latestMeaningfulContentTimestamp(
      page.records.map((record) => record.observedAt),
    ),
    canonicalPath: localizedPath(
      locale,
      surface === "catalog" ? "/catalog" : "/sources/eppo",
    ),
    equivalentLocales: PUBLIC_LOCALES,
  };
}

function buildDetailDiscoverySource(
  locale: PublicLocale,
  surface: PublicStableRegistrySurface,
  record: ExplorerRecord,
): PublicSurfaceDiscoverySource {
  const copy = getPublicStableRegistryExplorerCopy(locale);
  const identifier =
    "stableTaxon" in record ? record.stableTaxon : record.eppoCode;
  return {
    consumerId: detailConsumerId(surface),
    candidateState: "candidate",
    qualityClass: record.qualityClass,
    visibleText: [
      record.displayName,
      record.scientificName ?? "",
      record.taxonomicRank ?? "",
      record.parentDisplayName ?? "",
      ...record.aliases,
      copy.evidenceDescription[record.evidenceState],
    ],
    distinctPublicEntityIds: [identifier],
    meaningfulContentAt: record.observedAt,
    canonicalPath: localizedPath(
      locale,
      surface === "catalog"
        ? `/catalog/${encodeURIComponent(identifier)}`
        : `/sources/eppo/${encodeURIComponent(identifier)}`,
    ),
    equivalentLocales: PUBLIC_LOCALES,
  };
}

function buildExplorerSurfaceMetadata(
  locale: PublicLocale,
  surface: PublicStableRegistrySurface,
  page: PublicStableRegistryPage<ExplorerRecord>,
  discovery: PublicSurfaceDiscoveryResult,
) {
  const copy = getPublicStableRegistryExplorerCopy(locale);
  const surfaceCopy = publicStableRegistrySurfaceCopy(copy, surface);
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    contentLocale: null,
    title: `${surfaceCopy.title} | OverGarden`,
    description: surfaceCopy.intro,
    visibleFacts: {
      type: "CollectionPage",
      name: surfaceCopy.title,
      description: surfaceCopy.intro,
      itemNames: page.records.map((record) => record.displayName),
    },
  });
}

function resolveDetailDiscovery(source: PublicSurfaceDiscoverySource) {
  // Keep the call through the shared discovery owner; the policy's threshold
  // decides indexability instead of an ad-hoc route-level rule.
  return resolvePublicSurfaceDiscoveryForRequest(source);
}

function consumerId(surface: PublicStableRegistrySurface) {
  return surface === "catalog"
    ? "stable_registry_catalog_browse"
    : "stable_registry_eppo_browse";
}

function detailConsumerId(surface: PublicStableRegistrySurface) {
  return surface === "catalog"
    ? "stable_registry_catalog_detail"
    : "stable_registry_eppo_detail";
}
