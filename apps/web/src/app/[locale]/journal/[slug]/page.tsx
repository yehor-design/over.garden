import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import { PublicJournalEntryView } from "@/components/public/public-journal-entry";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import { getPublicJournalEntryCopy } from "@/lib/public-journal-entry-copy";
import { normalizePublicJournalDirectoryReturnTo } from "@/lib/public-journal-directory-navigation";
import { isPublicLocale, type PublicLocale } from "@/lib/public-localization";
import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";
import { resolveVisualSocialScenario } from "@/lib/visual-fixtures/social-return-scenarios";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getEngagementSummary } from "@/server/engagement-repository";
import {
  getPublicJournalEntryLookup,
  type PublicJournalEntryPage,
} from "@/server/journal-repository";
import { getOwnerJournalEntryControl } from "@/server/owner-journal-entry-control";
import {
  latestMeaningfulContentTimestamp,
  PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfacePayloadWithDeadline,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import { scopedToUser } from "@/server/request-scope";

export const dynamic = "force-dynamic";

interface PublicJournalEntryRouteProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

export async function generateMetadata({
  params,
}: PublicJournalEntryRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;
  if (!isPublicLocale(localeParam)) return missingMetadata();

  const bounded = await resolvePublicSurfacePayloadWithDeadline({
    consumerId: "localized_journal_entry",
    evaluatedAt: new Date(),
    deadlineMs: PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
    load: async () => {
      const lookup = await getPublicJournalEntryLookup(
        slug,
        undefined,
        localeParam,
      );
      if (lookup.status !== "active") {
        throw new Error("Public journal entry unavailable.");
      }
      return {
        source: buildJournalDiscoverySource(lookup.page),
        payload: lookup.page,
      };
    },
  });
  if (!bounded.payload) return missingMetadata(localeParam);

  return buildJournalSurface(localeParam, bounded.payload, bounded).metadata;
}

export default async function PublicJournalEntryRoute({
  params,
  searchParams,
}: PublicJournalEntryRouteProps) {
  const [{ locale: localeParam, slug }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
  ]);
  if (!isPublicLocale(localeParam)) notFound();

  const locale: PublicLocale = localeParam;
  const lookup = await getPublicJournalEntryLookup(slug, undefined, locale);
  if (lookup.status !== "active") notFound();

  const session = await getCurrentSession();
  const visualScenario = resolveVisualSocialScenario(
    query.visualSocial,
    "journal",
    process.env,
  );
  const userId = visualScenario?.actorId ?? session?.user?.id;
  const scope = userId
    ? scopedToUser(userId, visualScenario ? null : getSessionId(session))
    : null;
  const engagementTarget = {
    kind: "journal_entry" as const,
    ref: lookup.page.entry.publicSlug,
  };
  const [engagement, ownerControl] = await Promise.all([
    getEngagementSummary(engagementTarget, scope, {
      commentCursor: firstParam(query.cursor),
    }),
    scope
      ? getOwnerJournalEntryControl(scope, lookup.page.entry.publicSlug)
      : Promise.resolve(null),
  ]);
  const directoryReturnTo = normalizePublicJournalDirectoryReturnTo(
    firstParam(query.from),
    locale,
    Boolean(tryResolveVisualFixtureEnvironment(process.env)),
  );
  const engagementReturnTo = visualScenario
    ? `${lookup.page.entry.publicPath}?visualSocial=${visualScenario.id}`
    : lookup.page.entry.publicPath;
  const editOwnerControl = ownerControl
    ? {
        ...ownerControl,
        managePath: `/garden/entries/${encodeURIComponent(ownerControl.entryId)}/edit?returnTo=${encodeURIComponent(lookup.page.entry.publicPath)}`,
      }
    : null;
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
        directoryReturnTo={directoryReturnTo}
        ownerControl={editOwnerControl}
      >
        <PublicEngagementPanel
          isAuthenticated={Boolean(userId)}
          locale={locale}
          target={engagementTarget}
          summary={engagement}
          returnTo={engagementReturnTo}
          status={firstParam(query.engagement)}
          resumeAction={normalizeAuthIntentResumeAction(
            firstParam(query.authIntent) ?? undefined,
          )}
          resumeControl={normalizeAuthIntentResumeControl(
            firstParam(query.authControl) ?? undefined,
          )}
        />
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
    buildJournalDiscoverySource(page),
  ),
) {
  const copy = getPublicJournalEntryCopy(locale);
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    contentLocale: null,
    title: `${page.entry.title} · ${copy.metadataTitleSuffix} | OverGarden`,
    description: summarize(page.entry.body),
    visibleFacts: {
      type: "BlogPosting",
      name: page.entry.title,
      description: summarize(page.entry.body),
      datePublished:
        page.entry.publishedAt instanceof Date
          ? page.entry.publishedAt.toISOString()
          : (page.entry.publishedAt ?? undefined),
    },
  });
}

function buildJournalDiscoverySource(
  page: PublicJournalEntryPage,
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
    candidateState: page.entry.publicNoindex
      ? "not_public_candidate"
      : "candidate",
    qualityClass: page.qualityClass ?? "unverified",
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
    meaningfulContentAt: latestMeaningfulContentTimestamp([
      page.entry.publishedAt,
    ]),
    canonicalPath: publicJournalEntryPath(page.entry.publicSlug),
    equivalentLocales: [],
  };
}

function summarize(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= 160) return normalized;
  return `${normalized.slice(0, 157).trimEnd()}...`;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
