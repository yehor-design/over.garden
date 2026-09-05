import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  EppoArchiveDetail,
  EppoArchiveExplorer,
  type EppoArchiveExplorerState,
} from "@/components/public/public-eppo-archive-explorer";
import { getEppoArchiveCopy } from "@/lib/catalog-source/eppo-archive-copy";
import { isEppoArchiveEnabled } from "@/lib/catalog-source/eppo-archive-gate";
import {
  localizedPath,
  PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  findPublicEppoSourceRecord,
  listPublicEppoSourcePage,
  parseEppoArchiveRequest,
  type EppoArchivePage,
  type EppoArchiveRequest,
  type PublicEppoSourceRecord,
} from "@/server/catalog-source/public-eppo-explorer-repository";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfacePayload,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";

/**
 * The public EPPO archive: `/sources/eppo` and `/sources/eppo/[code]` in every
 * public locale. It is the retained reader of the EPPO observed capture
 * (ADR-0025 D2). A visible record is source evidence and says so; nothing
 * here promotes a record into a catalog identity.
 */

const BROWSE_CONSUMER_ID = "eppo_archive_browse";
const DETAIL_CONSUMER_ID = "eppo_archive_detail";

export async function renderEppoArchiveExplorer(
  locale: PublicLocale,
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  if (!isEppoArchiveEnabled()) notFound();
  const parsed = parseEppoArchiveRequest(searchParams);
  if (parsed.error) {
    return (
      <EppoArchiveExplorer
        locale={locale}
        page={emptyExplorerPage(parsed.request)}
        state="degraded"
        message="invalid_query"
        jsonLd={null}
      />
    );
  }

  const resolved = await loadExplorerWithDiscovery(locale, parsed.request);
  const state: EppoArchiveExplorerState = resolved.payload
    ? resolved.payload.records.length > 0
      ? "ready"
      : "empty"
    : "degraded";
  const page = resolved.payload ?? emptyExplorerPage(parsed.request);
  const surfaceMetadata = buildExplorerSurfaceMetadata(locale, page, resolved);

  return (
    <EppoArchiveExplorer
      locale={locale}
      page={page}
      state={state}
      message={state === "degraded" ? "unavailable" : undefined}
      jsonLd={surfaceMetadata.jsonLd}
    />
  );
}

export async function eppoArchiveExplorerMetadata(
  locale: PublicLocale,
): Promise<Metadata> {
  if (!isEppoArchiveEnabled()) {
    return {
      title: "OverGarden",
      robots: resolveUnresolvedPublicSurfaceDiscovery(BROWSE_CONSUMER_ID)
        .decision.robots,
    };
  }
  const request = parseEppoArchiveRequest({}).request;
  const resolved = await loadExplorerWithDiscovery(locale, request);
  const page = resolved.payload ?? emptyExplorerPage(request);
  return buildExplorerSurfaceMetadata(locale, page, resolved).metadata;
}

export function renderEppoArchiveDetail(
  locale: PublicLocale,
  record: PublicEppoSourceRecord,
) {
  const discovery = resolveDetailDiscovery(
    buildDetailDiscoverySource(locale, record),
  );
  const metadata = buildPublicSurfaceMetadata({
    discovery: {
      consumerId: DETAIL_CONSUMER_ID,
      candidateInput: discovery.candidateInput,
      decision: discovery.decision,
    },
    locale,
    contentLocale: null,
    title: `${record.displayName} | OverGarden`,
    description: getEppoArchiveCopy(locale).evidenceDescription[
      record.evidenceState
    ],
    visibleFacts: {
      type: "ItemPage",
      name: record.displayName,
      description: getEppoArchiveCopy(locale).evidenceDescription[
        record.evidenceState
      ],
      dateModified: record.observedAt,
    },
  });

  return (
    <EppoArchiveDetail locale={locale} record={record} jsonLd={metadata.jsonLd} />
  );
}

export async function loadEppoArchiveDetail(
  locale: PublicLocale,
  eppoCode: string,
): Promise<PublicEppoSourceRecord | null> {
  if (!isEppoArchiveEnabled()) return null;
  try {
    return await findPublicEppoSourceRecord(eppoCode, locale);
  } catch {
    return null;
  }
}

export async function eppoArchiveDetailMetadata(
  locale: PublicLocale,
  eppoCode: string,
): Promise<Metadata> {
  const record = await loadEppoArchiveDetail(locale, eppoCode);
  if (!record) {
    return {
      title: "OverGarden",
      robots: resolveUnresolvedPublicSurfaceDiscovery(DETAIL_CONSUMER_ID)
        .decision.robots,
    };
  }
  const discovery = resolveDetailDiscovery(
    buildDetailDiscoverySource(locale, record),
  );
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    contentLocale: null,
    title: `${record.displayName} | OverGarden`,
    description: getEppoArchiveCopy(locale).evidenceDescription[
      record.evidenceState
    ],
    visibleFacts: {
      type: "ItemPage",
      name: record.displayName,
      description: getEppoArchiveCopy(locale).evidenceDescription[
        record.evidenceState
      ],
      dateModified: record.observedAt,
    },
  }).metadata;
}

async function loadExplorerWithDiscovery(
  locale: PublicLocale,
  request: EppoArchiveRequest,
) {
  return resolvePublicSurfacePayload({
    consumerId: BROWSE_CONSUMER_ID,
    load: async () => {
      const page = await listPublicEppoSourcePage(request, locale);
      return {
        payload: page,
        source: buildExplorerDiscoverySource(locale, page),
      };
    },
  });
}

function emptyExplorerPage(request: EppoArchiveRequest): EppoArchivePage {
  return { request, records: [], nextCursor: null, qualityClass: "partial" };
}

function buildExplorerDiscoverySource(
  locale: PublicLocale,
  page: EppoArchivePage,
): PublicSurfaceDiscoverySource {
  const copy = getEppoArchiveCopy(locale);
  return {
    consumerId: BROWSE_CONSUMER_ID,
    candidateState: "candidate",
    visibleText: page.records.flatMap((record) => [
      record.displayName,
      record.scientificName ?? "",
      record.taxonomicRank ?? "",
      record.parentDisplayName ?? "",
      ...record.aliases,
      copy.evidenceDescription[record.evidenceState],
    ]),
    distinctPublicEntityIds: page.records.map((record) => record.eppoCode),
    canonicalPath: localizedPath(locale, "/sources/eppo"),
    equivalentLocales: PUBLIC_LOCALES,
  };
}

function buildDetailDiscoverySource(
  locale: PublicLocale,
  record: PublicEppoSourceRecord,
): PublicSurfaceDiscoverySource {
  const copy = getEppoArchiveCopy(locale);
  return {
    consumerId: DETAIL_CONSUMER_ID,
    candidateState: "candidate",
    visibleText: [
      record.displayName,
      record.scientificName ?? "",
      record.taxonomicRank ?? "",
      record.parentDisplayName ?? "",
      ...record.aliases,
      copy.evidenceDescription[record.evidenceState],
    ],
    distinctPublicEntityIds: [record.eppoCode],
    canonicalPath: localizedPath(
      locale,
      `/sources/eppo/${encodeURIComponent(record.eppoCode)}`,
    ),
    equivalentLocales: PUBLIC_LOCALES,
  };
}

function buildExplorerSurfaceMetadata(
  locale: PublicLocale,
  page: EppoArchivePage,
  discovery: PublicSurfaceDiscoveryResult,
) {
  const copy = getEppoArchiveCopy(locale);
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    contentLocale: null,
    title: `${copy.title} | OverGarden`,
    description: copy.intro,
    visibleFacts: {
      type: "CollectionPage",
      name: copy.title,
      description: copy.intro,
      itemNames: page.records.map((record) => record.displayName),
    },
  });
}

function resolveDetailDiscovery(source: PublicSurfaceDiscoverySource) {
  // Keep the call through the shared discovery owner; the policy's threshold
  // decides indexability instead of an ad-hoc route-level rule.
  return resolvePublicSurfaceDiscoveryForRequest(source);
}
