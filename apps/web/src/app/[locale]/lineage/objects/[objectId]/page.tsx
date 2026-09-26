import {
  LineageInteractionPanel,
  ViewerLineageInteraction,
  PassportOwnerBar,
  PassportViewerEngagement,
} from "./passport-regions";
import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";
import {
  deferStaticRenderAfterFailure,
  deferStaticRenderWithoutDatabase,
  renderStaticPublicPage,
  StaticRenderDeferred,
  type PublicRenderPhase,
} from "@/server/static-public-page";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { cache, Suspense, type ReactNode } from "react";
import { GitBranchIcon as GitBranch } from "@/components/icons/GitBranch";

import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import {
  LivingObjectPassportContextRail,
  LivingObjectPassportOverview,
  PublicLivingObjectPassportTimeline,
} from "@/components/living-object-passport/living-object-passport";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Link as TextLink } from "@/components/ui/link";
import { Section } from "@/components/ui/section";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import { publicRegionLabel } from "@/lib/garden/regions";
import {
  getPublicSurfaceCopy,
  publicObjectKindLabel,
} from "@/lib/public-surface-localization";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  type PublicLineageEdge,
  type PublicLineageGraphPage,
  type PublicLineageNode,
} from "@/server/public-lineage-repository";
import { type PublicObjectPassportPage } from "@/server/public-object-passport-repository";
import { buildPublicObjectPassportPresentation } from "@/server/public-object-passport-presentation";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfacePayload,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import { cn } from "@/lib/utils";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import {
  readGuestEngagementSummary,
  readPublicLineageGraphPage,
  readPublicObjectPassportPage,
} from "@/server/public-cache";
import { ReportContentLink } from "@/components/public/report-content-link";
import { parseReportAddress } from "@/lib/moderation/report-contract";
import { getReportCopy } from "@/lib/moderation/report-copy";

interface PublicLineageObjectRouteProps {
  params: Promise<{ locale: string; objectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const getCachedPublicObjectPassportPage = cache(
  (objectId: string, locale: InterfaceLocale) =>
    readPublicObjectPassportPage(objectId, locale),
);

const getCachedPublicLineageGraphPage = cache((objectId: string) =>
  readPublicLineageGraphPage(objectId),
);

export async function generateMetadata({
  params,
}: PublicLineageObjectRouteProps): Promise<Metadata> {
  const { locale: localeParam, objectId } = await params;
  // The served locale comes from the address, never from the cookie: this page
  // is prerendered and shared by every reader of that URL, so reading the
  // cookie here served one visitor's language to everyone (ADR-0029 D10).
  const locale = isPublicLocale(localeParam)
    ? localeParam
    : DEFAULT_PUBLIC_LOCALE;
  const copy = getPublicSurfaceCopy(locale);
  const bounded = await resolvePublicSurfacePayload({
    consumerId: "lineage_object",
    document: "static",
    load: async () => {
      const page = await getCachedPublicObjectPassportPage(objectId, locale);
      if (!page) throw new Error("Public lineage object unavailable.");
      return {
        source: buildLineageObjectDiscoverySource(page, locale),
        payload: page,
      };
    },
  });
  const page = bounded.payload;
  const unresolved = resolveUnresolvedPublicSurfaceDiscovery("lineage_object");

  if (!page) {
    return {
      title: `${copy.passport.title} | OverGarden`,
      robots: unresolved.decision.robots,
    };
  }

  return buildLineageObjectSurface(locale, page, bounded).metadata;
}

export default async function PublicLineageObjectRoute({
  params,
  searchParams,
}: PublicLineageObjectRouteProps) {
  const { locale: localeParam, objectId } = await params;
  if (!isPublicLocale(localeParam)) notFound();
  return renderStaticPublicPage({
    fallback: <RootLoadingSkeleton />,
    render: (phase) =>
      renderPassport(objectId, localeParam, searchParams, phase),
  });
}

export async function renderPassport(
  objectId: string,
  locale: PublicLocale,
  searchParams: PublicLineageObjectRouteProps["searchParams"],
  phase: PublicRenderPhase,
) {
  await deferStaticRenderWithoutDatabase(phase);
  const notPrerendered = (error: unknown): never => {
    unstable_rethrow(error);
    if (error instanceof StaticRenderDeferred) throw error;
    deferStaticRenderAfterFailure(phase);
    throw error;
  };
  const passport = await getCachedPublicObjectPassportPage(
    objectId,
    locale,
  ).catch(notPrerendered);
  if (!passport) notFound();
  const lineagePage = await getCachedPublicLineageGraphPage(
    passport.object.plantObjectId,
  ).catch(notPrerendered);
  const nodesById = buildPublicLineageNodeMap(passport, lineagePage);
  const edges = lineagePage?.edges ?? [];
  const engagementTarget = {
    kind: "lineage_object" as const,
    ref: passport.object.plantObjectId,
  };
  const returnTo = passport.object.publicPath;
  const engagement = await readGuestEngagementSummary(
    engagementTarget,
    null,
  ).catch(notPrerendered);
  const presentation = buildPublicObjectPassportPresentation(passport, locale, {
    confirmedProvenanceCount: edges.length,
  });
  const surface = buildLineageObjectSurface(locale, passport);
  const serializedJsonLd = serializePublicSurfaceJsonLd(surface.jsonLd);

  return (
    <main
      lang={locale}
      className="mx-auto grid w-full max-w-5xl gap-7 px-4 py-6 sm:px-6 sm:py-8"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      <LivingObjectPassportContextRail
        passport={presentation}
        locale={locale}
      />
      <LivingObjectPassportOverview passport={presentation} locale={locale} />
      <Suspense fallback={null}>
        <PassportOwnerBar
          plantObjectId={passport.object.plantObjectId}
          locale={locale}
        />
      </Suspense>
      <PublicLivingObjectPassportTimeline
        passport={presentation}
        locale={locale}
      />

      {/* Provenance only when there is some: an empty "no confirmed
          lineage" block under the observations told a reader nothing about
          this object and read like a missing field (`OVE-495`, criterion 2).
          Only confirmed edges are ever listed, and the section says what
          "confirmed" means — two gardeners agreeing, not a genetic test. */}
      {edges.length > 0 ? (
        <Section
          id="passport-provenance"
          className="border-t border-border pt-6"
          level={2}
          title={
            <span className="inline-flex items-center gap-2">
              <GitBranch className="size-5" aria-hidden="true" />
              {getPublicSurfaceCopy(locale).passport.publicLineage}
            </span>
          }
          description={
            getPublicSurfaceCopy(locale).passport.publicLineageDescription
          }
        >
          <ol className="grid gap-4">
            {edges.map((edge) => {
              const subject = nodesById.get(edge.subjectPlantObjectId);
              const source = nodesById.get(edge.sourcePlantObjectId);
              if (!subject || !source) return null;
              const publicInteractionTarget =
                edge.subjectPlantObjectId === passport.object.plantObjectId
                  ? source
                  : subject;

              return (
                <PublicLineageEdgeCard
                  key={edge.id}
                  edge={edge}
                  subject={subject}
                  source={source}
                  rootPlantObjectId={passport.object.plantObjectId}
                  interactionSlot={
                    <Suspense
                      fallback={
                        <LineageInteractionPanel
                          edge={edge}
                          rootPlantObjectId={passport.object.plantObjectId}
                          rootPublicPath={returnTo}
                          target={publicInteractionTarget}
                          isAuthenticated={false}
                          canInteract={false}
                          resumeAction={null}
                          resumeControl={null}
                          status={null}
                          locale={locale}
                        />
                      }
                    >
                      <ViewerLineageInteraction
                        edge={edge}
                        edges={edges}
                        nodesById={nodesById}
                        rootPlantObjectId={passport.object.plantObjectId}
                        rootPublicPath={returnTo}
                        target={publicInteractionTarget}
                        locale={locale}
                        searchParams={searchParams}
                      />
                    </Suspense>
                  }
                  locale={locale}
                />
              );
            })}
          </ol>
        </Section>
      ) : null}

      <Suspense
        fallback={
          <PublicEngagementPanel
            isAuthenticated={false}
            target={engagementTarget}
            summary={engagement}
            likeState={{
              activeLikeCount: engagement.activeLikeCount,
              viewerLiked: false,
            }}
            returnTo={returnTo}
            locale={locale}
          />
        }
      >
        <PassportViewerEngagement
          locale={locale}
          target={engagementTarget}
          returnTo={returnTo}
          searchParams={searchParams}
        />
      </Suspense>
      {/* ADR-0038 D5: anyone may report the passport, signed in or not. A
          passport still addressed by its id has no author-scoped address
          the form can look up, so it offers nothing rather than a dead end. */}
      {parseReportAddress(returnTo) ? (
        <ReportContentLink
          address={returnTo}
          label={getReportCopy(locale).link}
          className="justify-self-start"
        />
      ) : null}
    </main>
  );
}

function buildLineageObjectSurface(
  locale: PublicLocale,
  page: PublicObjectPassportPage,
  discovery: PublicSurfaceDiscoveryResult = resolvePublicSurfaceDiscoveryForRequest(
    buildLineageObjectDiscoverySource(page, locale),
  ),
) {
  const copy = getPublicSurfaceCopy(locale);
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    contentLocale: null,
    title: `${page.object.displayName} · ${copy.passport.metadataSuffix} | OverGarden`,
    description: `${copy.passport.title}: ${page.object.displayName}.`,
    visibleFacts: {
      type: "ItemPage",
      name: page.object.displayName,
      description: `${copy.passport.title}: ${page.object.displayName}.`,
      trustQualifier: "Public object history with confirmed provenance only",
    },
  });
}

function buildLineageObjectDiscoverySource(
  page: PublicObjectPassportPage,
  locale: PublicLocale,
): PublicSurfaceDiscoverySource {
  const journals = [...page.journalPreview, ...page.journalContinuation];
  return {
    consumerId: "lineage_object",
    candidateState: "candidate",
    visibleText: [
      page.object.displayName,
      page.object.catalogCanonicalName ?? "",
      page.object.varietyText ?? "",
      publicRegionLabel(locale, page.object.safeRegionCode) ?? "",
      ...journals.flatMap((entry) => [entry.title, entry.bodyPreview]),
    ],
    distinctPublicEntityIds: [
      page.object.plantObjectId,
      ...journals.map((entry) => entry.id),
    ],
    // A passport is never translated, so it has one address — under its
    // author, with no locale prefix (ADR-0029 D9, D10) — and no `hreflang`
    // (OVE-423), exactly as an entry has. `publicPath` is that address, built
    // where the handle and the slug are known; every other spelling of it,
    // `/lineage/objects/{uuid}` and the prefixed ones included, 308s to it in
    // the proxy. The canonical used to name the id path, which is itself a
    // redirect — a canonical that redirects is a duplicate signal a crawler
    // discards.
    canonicalPath: page.object.publicPath,
    equivalentLocales: [],
  };
}

function PublicLineageEdgeCard({
  edge,
  subject,
  source,
  rootPlantObjectId,
  interactionSlot,
  locale,
}: {
  edge: PublicLineageEdge;
  subject: PublicLineageNode;
  source: PublicLineageNode;
  rootPlantObjectId: string;
  interactionSlot: ReactNode;
  locale: InterfaceLocale;
}) {
  const copy = getPublicSurfaceCopy(locale);

  return (
    <li className="min-w-0">
      <Card as="article" className="grid gap-4 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          {/* A sentence, not an arrow: "Томат походить від Томату" says the
              relationship, and each name says whose it is — related objects
              are often called the same thing (`OVE-495`, criteria 5, 12). */}
          <h3 className="text-h4 break-words text-text-heading">
            {copy.passport.lineageSentence
              .replace("{subject}", subject.displayName)
              .replace("{source}", source.displayName)}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              {`${copy.passport.depth} ${edge.depth}`}
            </Badge>
            <time
              dateTime={edgeDateTime(edge.createdAt)}
              className="text-caption text-text-muted tabular-nums"
            >
              {formatDate(edge.createdAt, locale)}
            </time>
          </div>
        </div>

        <dl className="grid gap-4 md:grid-cols-2">
          <PublicLineageNodeDescription
            label={copy.passport.source}
            node={source}
            isCurrent={source.plantObjectId === rootPlantObjectId}
            locale={locale}
          />
          <PublicLineageNodeDescription
            label={copy.passport.grownObject}
            node={subject}
            isCurrent={subject.plantObjectId === rootPlantObjectId}
            locale={locale}
          />
        </dl>

        <p className="text-caption text-text-muted">
          {copy.passport.lineageConfirmedBy}
        </p>

        {interactionSlot}
      </Card>
    </li>
  );
}

function PublicLineageNodeDescription({
  label,
  node,
  isCurrent,
  locale,
}: {
  label: string;
  node: PublicLineageNode;
  /**
   * This page's own object. Related objects are often called the same thing —
   * every tomato is "Томат" — so the one being read says so (`OVE-495`,
   * criterion 12). Other gardeners are not named here: the public lineage
   * reads no identity (`public-lineage-repository.test.ts`).
   */
  isCurrent: boolean;
  locale: InterfaceLocale;
}) {
  const copy = getPublicSurfaceCopy(locale);
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-overline text-text-muted uppercase">{label}</dt>
      <dd className="text-body-sm font-medium break-words text-text">
        {/* The space is in the name's own text: a margin adds none, and a
            lone space after text is dropped from what a screen reader reads
            (`OVE-478`). */}
        {isCurrent ? `${node.displayName} ` : node.displayName}
        {isCurrent ? (
          <span className="ml-1 text-caption font-normal text-text-muted">
            {copy.passport.thisObject}
          </span>
        ) : null}
      </dd>
      <dd>
        <PublicLineageNodeMeta node={node} compact locale={locale} />
      </dd>
    </div>
  );
}

function PublicLineageNodeMeta({
  node,
  compact = false,
  locale,
}: {
  node: PublicLineageNode;
  compact?: boolean;
  locale: InterfaceLocale;
}) {
  const meta = [
    publicObjectKindLabel(locale, node.objectKind),
    node.varietyText ??
      node.catalogCanonicalName ??
      getPublicSurfaceCopy(locale).journal.catalogMatchPending,
    publicRegionLabel(locale, node.safeRegionCode),
  ].filter(Boolean);

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", compact ? "" : "mt-1")}
    >
      {meta.map((item) => (
        <Badge key={item} tone="neutral">
          {item}
        </Badge>
      ))}
      {node.catalogPublicSlug && node.catalogKind ? (
        /* The catalog entry is a link, not a badge: a reader can open the
           organism this object was identified as, and DESIGN.md §5.2 says a
           badge is never a control. */
        <TextLink
          href={publicCatalogEvidencePath({
            catalogKind: node.catalogKind,
            publicSlug: node.catalogPublicSlug,
            speciesSlug: node.catalogSpeciesSlug,
          })}
          className="inline-flex min-h-6 items-center text-caption font-medium"
        >
          {node.catalogCanonicalName ??
            getPublicSurfaceCopy(locale).passport.publicCatalog}
        </TextLink>
      ) : null}
    </div>
  );
}

function buildPublicLineageNodeMap(
  passport: PublicObjectPassportPage,
  lineagePage: PublicLineageGraphPage | null,
) {
  const rootNode: PublicLineageNode = {
    plantObjectId: passport.object.plantObjectId,
    displayName: passport.object.displayName,
    objectKind: passport.object.objectKind,
    varietyText: passport.object.varietyText,
    varietyState: passport.object.varietyState,
    catalogKind: passport.object.catalogKind,
    catalogCanonicalName: passport.object.catalogCanonicalName,
    catalogPublicSlug: passport.object.catalogPublicSlug,
    catalogSpeciesSlug: passport.object.catalogSpeciesSlug,
    safeRegionCode: passport.object.safeRegionCode,
  };
  const nodes = lineagePage?.nodes ?? [rootNode];

  return new Map(nodes.map((node) => [node.plantObjectId, node]));
}

function edgeDateTime(value: Date | string) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function formatDate(value: Date | string, locale: InterfaceLocale) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
