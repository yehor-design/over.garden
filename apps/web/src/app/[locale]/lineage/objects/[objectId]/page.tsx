import { readViewerLikeState } from "@/app/engagement/engagement-viewer";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BellPlus, GitBranch } from "lucide-react";

import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
import {
  LivingObjectPassportContextRail,
  LivingObjectPassportOverview,
  PublicLivingObjectPassportTimeline,
} from "@/components/living-object-passport/living-object-passport";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Link as TextLink } from "@/components/ui/link";
import { Section } from "@/components/ui/section";
import {
  buildAuthIntentAnchor,
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
  type AuthIntentAction,
} from "@/lib/auth/auth-intent-contract";
import {
  publicCatalogEvidencePath,
} from "@/lib/garden/public-paths";
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
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import { getEngagementSummary } from "@/server/engagement-repository";
import { listLineageInteractionTargets } from "@/server/lineage-interactions-repository";
import {
  getPublicLineageGraphPage,
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
import { scopedToUser } from "@/server/request-scope";
import { askLineageQuestionAction, followLineageNodeAction } from "./actions";
import {
  readGuestEngagementSummary,
  readPublicObjectPassportPage,
} from "@/server/public-cache";
import { HiddenField } from "@/components/ui/hidden-field";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

interface PublicLineageObjectRouteProps {
  params: Promise<{ locale: string; objectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_PUBLIC_LINEAGE_SEARCH_PARAMS: Record<
  string,
  string | string[] | undefined
> = {};

const getCachedPublicObjectPassportPage = cache(
  (objectId: string, locale: InterfaceLocale) =>
    readPublicObjectPassportPage(objectId, locale),
);

const getCachedPublicLineageGraphPage = cache((objectId: string) =>
  getPublicLineageGraphPage(objectId),
);

export async function generateMetadata({
  params,
}: PublicLineageObjectRouteProps): Promise<Metadata> {
  const { locale: localeParam, objectId } = await params;
  // The served locale comes from the address, never from the cookie: this page
  // is prerendered and shared by every reader of that URL, so reading the
  // cookie here served one visitor's language to everyone (ADR-0029 D10).
  const locale = isPublicLocale(localeParam) ? localeParam : DEFAULT_PUBLIC_LOCALE;
  const copy = getPublicSurfaceCopy(locale);
  const bounded = await resolvePublicSurfacePayload({
    consumerId: "lineage_object",
    load: async () => {
      const page = await getCachedPublicObjectPassportPage(objectId, locale);
      if (!page) throw new Error("Public lineage object unavailable.");
      return {
        source: buildLineageObjectDiscoverySource(page),
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
  const [{ locale: localeParam, objectId }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(EMPTY_PUBLIC_LINEAGE_SEARCH_PARAMS),
  ]);
  if (!isPublicLocale(localeParam)) notFound();
  const locale = localeParam;
  const passport = await getCachedPublicObjectPassportPage(objectId, locale);

  if (!passport) notFound();

  const lineagePage = await getCachedPublicLineageGraphPage(
    passport.object.plantObjectId,
  );
  const nodesById = buildPublicLineageNodeMap(passport, lineagePage);
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const edges = lineagePage?.edges ?? [];
  const interactionTargets =
    scope && edges.length > 0
      ? await listLineageInteractionTargets(
          scope,
          edges.map((edge) => edge.id),
        )
      : [];
  const interactionTargetsByEdgeId = new Map(
    interactionTargets.map((target) => [target.edgeId, target]),
  );
  const engagementTarget = {
    kind: "lineage_object" as const,
    ref: passport.object.plantObjectId,
  };
  // The passport's own address (ADR-0029 D9): a return path that 308s is a
  // hop after every sign-in, and the auth-intent contract now accepts it.
  const returnTo = passport.object.publicPath;
  const engagement = scope
    ? await getEngagementSummary(engagementTarget, scope, {
        commentCursor: firstParam(query.cursor),
      })
    : await readGuestEngagementSummary(
        engagementTarget,
        firstParam(query.cursor) ?? null,
      );
  const likeState = await readViewerLikeState(engagementTarget);
  const resumeAction = normalizeAuthIntentResumeAction(query.authIntent);
  const resumeControl = normalizeAuthIntentResumeControl(query.authControl);
  const lineageInteractionStatus = firstParam(query.engagement) ?? null;
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
      <PublicLivingObjectPassportTimeline
        passport={presentation}
        locale={locale}
      />

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
        /* Only confirmed edges are ever listed here, and the reader is told
           so rather than left to infer it from an absence (ADR-0026: the
           ladder never blocks, and an unconfirmed claim is not provenance). */
        actions={
          <Badge tone="success">
            {getPublicSurfaceCopy(locale).passport.confirmedProvenance}
          </Badge>
        }
      >
        {edges.length === 0 ? (
          /* Nothing is filtered out here — this object simply has no
             confirmed provenance, so there is no picture to show and nothing
             to clear (DESIGN.md §5.4). */
          <EmptyState
            variant="no-results"
            illustration={null}
            title={
              getPublicSurfaceCopy(locale).passport.noConfirmedPublicLineage
            }
          />
        ) : (
          <ol className="grid gap-4">
            {edges.map((edge) => {
              const subject = nodesById.get(edge.subjectPlantObjectId);
              const source = nodesById.get(edge.sourcePlantObjectId);
              if (!subject || !source) return null;
              const interactionTargetId = interactionTargetsByEdgeId.get(
                edge.id,
              )?.targetPlantObjectId;
              const authorizedInteractionTarget = interactionTargetId
                ? nodesById.get(interactionTargetId)
                : null;
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
                  rootPublicPath={passport.object.publicPath}
                  interactionTarget={
                    authorizedInteractionTarget ?? publicInteractionTarget
                  }
                  isAuthenticated={Boolean(userId)}
                  canInteract={Boolean(authorizedInteractionTarget)}
                  resumeAction={resumeAction}
                  resumeControl={resumeControl}
                  status={lineageInteractionStatus}
                  locale={locale}
                />
              );
            })}
          </ol>
        )}
      </Section>

      <PublicEngagementPanel
        isAuthenticated={Boolean(userId)}
        target={engagementTarget}
        likeState={likeState}
        summary={engagement}
        returnTo={returnTo}
        locale={locale}
        resumeAction={resumeAction}
        resumeControl={resumeControl}
      />
    </main>
  );
}

function buildLineageObjectSurface(
  locale: PublicLocale,
  page: PublicObjectPassportPage,
  discovery: PublicSurfaceDiscoveryResult = resolvePublicSurfaceDiscoveryForRequest(
    buildLineageObjectDiscoverySource(page),
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
): PublicSurfaceDiscoverySource {
  const journals = [...page.journalPreview, ...page.journalContinuation];
  return {
    consumerId: "lineage_object",
    candidateState: "candidate",
    visibleText: [
      page.object.displayName,
      page.object.catalogCanonicalName ?? "",
      page.object.varietyText ?? "",
      page.object.safeLocationLabel ?? "",
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
  rootPublicPath,
  interactionTarget,
  isAuthenticated,
  canInteract,
  resumeAction,
  resumeControl,
  status,
  locale,
}: {
  edge: PublicLineageEdge;
  subject: PublicLineageNode;
  source: PublicLineageNode;
  rootPlantObjectId: string;
  /** The root passport's own address, for the return path after sign-in. */
  rootPublicPath: string;
  interactionTarget: PublicLineageNode | null;
  isAuthenticated: boolean;
  canInteract: boolean;
  resumeAction: AuthIntentAction | null;
  resumeControl: string | null;
  status: string | null;
  locale: InterfaceLocale;
}) {
  const copy = getPublicSurfaceCopy(locale);

  return (
    <li className="min-w-0">
      <Card as="article" className="grid gap-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-h3 break-words text-text-heading">
          {source.displayName}{" "}
          <span aria-hidden="true">→</span>
          <span className="sr-only">{copy.passport.grownObject}:</span>{" "}
          {subject.displayName}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">
            {copy.passport.depth} {edge.depth}
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
          locale={locale}
        />
        <PublicLineageNodeDescription
          label={copy.passport.grownObject}
          node={subject}
          locale={locale}
        />
      </dl>

      {interactionTarget ? (
        <LineageInteractionPanel
          edge={edge}
          rootPlantObjectId={rootPlantObjectId}
          rootPublicPath={rootPublicPath}
          target={interactionTarget}
          isAuthenticated={isAuthenticated}
          canInteract={canInteract}
          resumeAction={resumeAction}
          resumeControl={resumeControl}
          status={status}
          locale={locale}
        />
      ) : null}
      </Card>
    </li>
  );
}

function LineageInteractionPanel({
  edge,
  rootPlantObjectId,
  target,
  isAuthenticated,
  canInteract,
  resumeAction,
  resumeControl,
  status,
  locale,
  rootPublicPath,
}: {
  edge: PublicLineageEdge;
  rootPlantObjectId: string;
  target: PublicLineageNode;
  isAuthenticated: boolean;
  canInteract: boolean;
  resumeAction: AuthIntentAction | null;
  resumeControl: string | null;
  status: string | null;
  locale: InterfaceLocale;
  /** The root passport's own address, for the return path after sign-in. */
  rootPublicPath: string;
}) {
  const copy = getPublicSurfaceCopy(locale);
  const followControl = createAuthIntentControlRef(
    "follow",
    `${edge.id}:${target.plantObjectId}`,
  );
  const isResumedFollow =
    resumeAction === "follow" && resumeControl === followControl;

  return (
    <div
      data-auth-intent-resumed={isResumedFollow ? "follow" : undefined}
      className="grid gap-3 border-t border-border pt-3"
    >
      <div className="grid gap-1">
        <p className="text-body-sm font-medium text-text">
          {copy.passport.lineageUpdatesFrom} {target.displayName}
        </p>
        <p className="text-caption text-text-muted">
          {copy.passport.lineageQuestionSafety}
        </p>
      </div>

      {status === "lineage-question-rate-limited" ||
      status === "interaction-unavailable" ? (
        <Callout tone="warning" live="polite">
          <p>
            {status === "lineage-question-rate-limited"
              ? copy.passport.lineageQuestionRateLimited
              : copy.passport.interactionUnavailable}
          </p>
        </Callout>
      ) : null}

      {canInteract ? (
        <div className="grid gap-3 md:grid-cols-2">
          <OwnerScopedProgressiveForm action={followLineageNodeAction}>
            <HiddenField name="edgeId" value={edge.id} />
            <HiddenField
              name="targetPlantObjectId"
              value={target.plantObjectId}
            />
            <HiddenField
              name="rootPlantObjectId"
              value={rootPlantObjectId}
            />
            <button
              id={
                isResumedFollow
                  ? buildAuthIntentAnchor("follow", followControl)
                  : undefined
              }
              data-auth-intent-control="follow"
              data-auth-intent-control-ref={followControl}
              autoFocus={isResumedFollow}
              type="submit"
              className={buttonVariants({
                variant: "secondary",
                className: "w-full md:w-auto",
              })}
            >
              {copy.passport.followUpdates}
            </button>
          </OwnerScopedProgressiveForm>

          <OwnerScopedProgressiveForm
            action={askLineageQuestionAction}
            className="grid gap-2"
          >
            <HiddenField name="edgeId" value={edge.id} />
            <HiddenField
              name="targetPlantObjectId"
              value={target.plantObjectId}
            />
            <HiddenField
              name="rootPlantObjectId"
              value={rootPlantObjectId}
            />
            <HiddenField
              name="clientMutationId"
              value={crypto.randomUUID()}
            />
            <Field label={copy.passport.askWithinLineage} required>
              <Textarea
                name="questionText"
                maxLength={360}
                rows={3}
                placeholder={copy.passport.lineageQuestionPlaceholder}
              />
            </Field>
            <button
              type="submit"
              className={buttonVariants({ className: "justify-self-start" })}
            >
              {copy.passport.sendQuestion}
            </button>
          </OwnerScopedProgressiveForm>
        </div>
      ) : isAuthenticated ? (
        <p
          id={
            isResumedFollow
              ? buildAuthIntentAnchor("follow", followControl)
              : undefined
          }
          role="status"
          tabIndex={-1}
          data-auth-intent-control="follow"
          data-auth-intent-control-ref={followControl}
          className="text-body-sm text-text-muted"
        >
          {copy.passport.followRequiresWriteAccess}
        </p>
      ) : (
        <AuthIntentTrigger
          action="follow"
          returnTo={rootPublicPath}
          target={{ kind: "object", ref: target.plantObjectId }}
          control={followControl}
          label={copy.passport.followUpdates}
          icon={<BellPlus aria-hidden="true" />}
          variant="secondary"
          className="w-fit"
        />
      )}
    </div>
  );
}

function PublicLineageNodeDescription({
  label,
  node,
  locale,
}: {
  label: string;
  node: PublicLineageNode;
  locale: InterfaceLocale;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-overline text-text-muted uppercase">{label}</dt>
      <dd className="text-body-sm font-medium break-words text-text">
        {node.displayName}
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
    node.safeLocationLabel,
  ].filter(Boolean);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        compact ? "" : "mt-1",
      )}
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
    safeLocationLabel: passport.object.safeLocationLabel,
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

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}
