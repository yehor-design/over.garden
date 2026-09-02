import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BellPlus, GitBranch } from "lucide-react";

import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import { OwnerScopedActionForm } from "@/components/auth/owner-scope";
import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
import {
  LivingObjectPassportContextRail,
  LivingObjectPassportOverview,
  PublicLivingObjectPassportTimeline,
} from "@/components/living-object-passport/living-object-passport";
import { buttonVariants } from "@/components/ui/button";
import {
  buildAuthIntentAnchor,
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
  type AuthIntentAction,
} from "@/lib/auth/auth-intent-contract";
import {
  publicLineageObjectPath,
  publicVarietyPath,
} from "@/lib/garden/public-paths";
import {
  getPublicSurfaceCopy,
  publicObjectKindLabel,
} from "@/lib/public-surface-localization";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { getEngagementSummary } from "@/server/engagement-repository";
import { listLineageInteractionTargets } from "@/server/lineage-interactions-repository";
import {
  getPublicLineageGraphPage,
  type PublicLineageEdge,
  type PublicLineageGraphPage,
  type PublicLineageNode,
} from "@/server/public-lineage-repository";
import {
  getPublicObjectPassportPage,
  type PublicObjectPassportPage,
} from "@/server/public-object-passport-repository";
import { buildPublicObjectPassportPresentation } from "@/server/public-object-passport-presentation";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfacePayload,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import { scopedToUser } from "@/server/request-scope";
import { askLineageQuestionAction, followLineageNodeAction } from "./actions";

export const dynamic = "force-dynamic";

interface PublicLineageObjectRouteProps {
  params: Promise<{ objectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_PUBLIC_LINEAGE_SEARCH_PARAMS: Record<
  string,
  string | string[] | undefined
> = {};

const getCachedPublicObjectPassportPage = cache(
  (objectId: string, locale: InterfaceLocale) =>
    getPublicObjectPassportPage(objectId, undefined, locale),
);

const getCachedPublicLineageGraphPage = cache((objectId: string) =>
  getPublicLineageGraphPage(objectId),
);

export async function generateMetadata({
  params,
}: PublicLineageObjectRouteProps): Promise<Metadata> {
  const [{ objectId }, locale] = await Promise.all([
    params,
    getRequestInterfaceLocale(),
  ]);
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
  const [{ objectId }, query, locale] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(EMPTY_PUBLIC_LINEAGE_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
  ]);
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
  const returnTo = publicLineageObjectPath(passport.object.plantObjectId);
  const engagement = await getEngagementSummary(engagementTarget, scope, {
    commentCursor: firstParam(query.cursor),
  });
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
      className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-4 py-4 sm:px-6 sm:py-5"
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

      <section
        id="passport-provenance"
        className="grid gap-4 border-t border-border pt-5"
      >
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <GitBranch className="size-4" />
            {getPublicSurfaceCopy(locale).passport.confirmedProvenance}
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {getPublicSurfaceCopy(locale).passport.publicLineage}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {getPublicSurfaceCopy(locale).passport.publicLineageDescription}
          </p>
        </div>

        {edges.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {getPublicSurfaceCopy(locale).passport.noConfirmedPublicLineage}
          </p>
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
      </section>

      <PublicEngagementPanel
        isAuthenticated={Boolean(userId)}
        target={engagementTarget}
        summary={engagement}
        returnTo={returnTo}
        status={firstParam(query.engagement)}
        locale={locale}
        resumeAction={resumeAction}
        resumeControl={resumeControl}
      />
    </main>
  );
}

function buildLineageObjectSurface(
  locale: InterfaceLocale,
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
    canonicalPath: publicLineageObjectPath(page.object.plantObjectId),
    equivalentLocales: [],
  };
}

function PublicLineageEdgeCard({
  edge,
  subject,
  source,
  rootPlantObjectId,
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
    <li className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {source.displayName} → {subject.displayName}
        </h3>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            {copy.passport.depth} {edge.depth}
          </span>
          <time className="rounded-md border border-border px-2 py-1">
            {formatDate(edge.createdAt, locale)}
          </time>
        </div>
      </div>

      <dl className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
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
          target={interactionTarget}
          isAuthenticated={isAuthenticated}
          canInteract={canInteract}
          resumeAction={resumeAction}
          resumeControl={resumeControl}
          status={status}
          locale={locale}
        />
      ) : null}
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
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">
          {copy.passport.lineageUpdatesFrom} {target.displayName}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          {copy.passport.lineageQuestionSafety}
        </p>
      </div>

      {status === "lineage-question-rate-limited" ||
      status === "interaction-unavailable" ? (
        <p className="text-sm text-muted-foreground" role="status">
          {status === "lineage-question-rate-limited"
            ? copy.passport.lineageQuestionRateLimited
            : copy.passport.interactionUnavailable}
        </p>
      ) : null}

      {canInteract ? (
        <div className="grid gap-3 md:grid-cols-2">
          <OwnerScopedActionForm action={followLineageNodeAction}>
            <input type="hidden" name="edgeId" value={edge.id} />
            <input
              type="hidden"
              name="targetPlantObjectId"
              value={target.plantObjectId}
            />
            <input
              type="hidden"
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
                variant: "outline",
                className: "w-full md:w-auto",
              })}
            >
              {copy.passport.followUpdates}
            </button>
          </OwnerScopedActionForm>

          <OwnerScopedActionForm
            action={askLineageQuestionAction}
            className="grid gap-2"
          >
            <input type="hidden" name="edgeId" value={edge.id} />
            <input
              type="hidden"
              name="targetPlantObjectId"
              value={target.plantObjectId}
            />
            <input
              type="hidden"
              name="rootPlantObjectId"
              value={rootPlantObjectId}
            />
            <input
              type="hidden"
              name="clientMutationId"
              value={crypto.randomUUID()}
            />
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-foreground">
                {copy.passport.askWithinLineage}
              </span>
              <textarea
                name="questionText"
                required
                maxLength={360}
                rows={3}
                placeholder={copy.passport.lineageQuestionPlaceholder}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm leading-6"
              />
            </label>
            <button
              type="submit"
              className={buttonVariants({ className: "justify-self-start" })}
            >
              {copy.passport.sendQuestion}
            </button>
          </OwnerScopedActionForm>
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
          className="text-sm text-muted-foreground"
        >
          {copy.passport.followRequiresWriteAccess}
        </p>
      ) : (
        <AuthIntentTrigger
          action="follow"
          returnTo={publicLineageObjectPath(rootPlantObjectId)}
          target={{ kind: "object", ref: target.plantObjectId }}
          control={followControl}
          label={copy.passport.followUpdates}
          icon={<BellPlus aria-hidden="true" />}
          variant="outline"
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
    <div className="grid gap-1">
      <dt className="text-xs uppercase">{label}</dt>
      <dd className="font-medium text-foreground">{node.displayName}</dd>
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
      className={`flex flex-wrap gap-2 text-xs text-muted-foreground ${
        compact ? "" : "mt-1"
      }`}
    >
      {meta.map((item) => (
        <span key={item} className="rounded-md border border-border px-2 py-1">
          {item}
        </span>
      ))}
      {node.catalogPublicSlug ? (
        <Link
          href={publicVarietyPath(node.catalogPublicSlug)}
          className="rounded-md border border-border px-2 py-1 font-medium text-primary underline-offset-4 hover:underline"
        >
          {node.catalogCanonicalName ??
            getPublicSurfaceCopy(locale).passport.publicCatalog}
        </Link>
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
    safeLocationLabel: passport.object.safeLocationLabel,
  };
  const nodes = lineagePage?.nodes ?? [rootNode];

  return new Map(nodes.map((node) => [node.plantObjectId, node]));
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
