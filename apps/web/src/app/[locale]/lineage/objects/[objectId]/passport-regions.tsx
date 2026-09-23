import NextLink from "next/link";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { NotePencilIcon as NotePencil } from "@/components/icons/NotePencil";
import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import { readViewerLikeState } from "@/app/engagement/engagement-viewer";
import { BellRingingIcon as BellPlus } from "@/components/icons/BellRinging";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Callout } from "@/components/ui/callout";
import { HiddenField } from "@/components/ui/hidden-field";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  buildAuthIntentAnchor,
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
  type AuthIntentAction,
} from "@/lib/auth/auth-intent-contract";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { PublicLocale } from "@/lib/public-localization";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import { getEngagementSummary } from "@/server/engagement-repository";
import { listLineageInteractionTargets } from "@/server/lineage-interactions-repository";
import type {
  PublicLineageEdge,
  PublicLineageNode,
} from "@/server/public-lineage-repository";
import { readGuestEngagementSummary } from "@/server/public-cache";
import { readOwnedDestination } from "@/server/owned-destination-repository";
import { gardenObjectSectionPath } from "@/lib/garden/object-pages";
import { scopedToUser } from "@/server/request-scope";
import { askLineageQuestionAction, followLineageNodeAction } from "./actions";

type PassportSearchParams =
  | Promise<Record<string, string | string[] | undefined>>
  | undefined;
const EMPTY_PUBLIC_LINEAGE_SEARCH_PARAMS: Record<
  string,
  string | string[] | undefined
> = {};
function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function LineageInteractionPanel({
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
            <HiddenField name="rootPlantObjectId" value={rootPlantObjectId} />
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
            <HiddenField name="rootPlantObjectId" value={rootPlantObjectId} />
            <HiddenField name="clientMutationId" value={crypto.randomUUID()} />
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

export async function PassportViewerEngagement({
  locale,
  target,
  returnTo,
  searchParams,
}: {
  locale: PublicLocale;
  target: { kind: "lineage_object"; ref: string };
  returnTo: string;
  searchParams: PassportSearchParams;
}) {
  const [query, session] = await Promise.all([
    searchParams ?? Promise.resolve(EMPTY_PUBLIC_LINEAGE_SEARCH_PARAMS),
    getCurrentSession(),
  ]);
  const userId = session?.user?.id;
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const [engagement, likeState] = await Promise.all([
    scope
      ? getEngagementSummary(target, scope, {
          commentCursor: firstParam(query.cursor),
        })
      : readGuestEngagementSummary(target, firstParam(query.cursor) ?? null),
    readViewerLikeState(target),
  ]);

  return (
    <PublicEngagementPanel
      isAuthenticated={Boolean(userId)}
      locale={locale}
      target={target}
      summary={engagement}
      likeState={likeState}
      returnTo={returnTo}
      resumeAction={normalizeAuthIntentResumeAction(
        firstParam(query.authIntent) ?? undefined,
      )}
      resumeControl={normalizeAuthIntentResumeControl(
        firstParam(query.authControl) ?? undefined,
      )}
    />
  );
}

const readLineageViewer = cache(async (edges: PublicLineageEdge[]) => {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  const targets =
    userId && edges.length
      ? await listLineageInteractionTargets(
          scopedToUser(userId, getSessionId(session)),
          edges.map((edge) => edge.id),
        )
      : [];
  return { userId, targets };
});

export async function ViewerLineageInteraction({
  edge,
  edges,
  nodesById,
  target,
  rootPlantObjectId,
  rootPublicPath,
  locale,
  searchParams,
}: {
  edge: PublicLineageEdge;
  edges: PublicLineageEdge[];
  nodesById: Map<string, PublicLineageNode>;
  target: PublicLineageNode;
  rootPlantObjectId: string;
  rootPublicPath: string;
  locale: PublicLocale;
  searchParams: PassportSearchParams;
}) {
  const [{ userId, targets }, query] = await Promise.all([
    readLineageViewer(edges),
    searchParams ?? Promise.resolve(EMPTY_PUBLIC_LINEAGE_SEARCH_PARAMS),
  ]);
  const targetId = targets.find(
    (item) => item.edgeId === edge.id,
  )?.targetPlantObjectId;
  const authorizedTarget = targetId ? nodesById.get(targetId) : null;
  return (
    <LineageInteractionPanel
      edge={edge}
      target={authorizedTarget ?? target}
      rootPlantObjectId={rootPlantObjectId}
      rootPublicPath={rootPublicPath}
      locale={locale}
      isAuthenticated={Boolean(userId)}
      canInteract={Boolean(authorizedTarget)}
      resumeAction={normalizeAuthIntentResumeAction(query.authIntent)}
      resumeControl={normalizeAuthIntentResumeControl(query.authControl)}
      status={firstParam(query.engagement) ?? null}
    />
  );
}

/**
 * The passport's own gardener, reading it signed in, gets the two ways to
 * their object: a new entry about exactly this one, and its page in their
 * garden (`OVE-495`, criterion 3). The passport is one static document for
 * every reader; this streams in for the owner alone, so a guest's bytes and
 * a guest's controls are unchanged (criterion 4).
 */
export async function PassportOwnerBar({
  plantObjectId,
  locale,
}: {
  plantObjectId: string;
  locale: PublicLocale;
}) {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  if (!userId) return null;
  const owned = await readOwnedDestination(
    scopedToUser(userId, getSessionId(session)),
    { kind: "object", id: plantObjectId },
  ).catch((error: unknown) => {
    unstable_rethrow(error);
    // An owner who cannot be confirmed is shown the reader's page.
    return null;
  });
  if (!owned) return null;

  const copy = getPublicSurfaceCopy(locale).passport;
  return (
    <aside
      aria-label={copy.ownerBar}
      data-passport-owner-bar="true"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-sunken p-3"
    >
      <p className="text-body-sm text-text">{copy.ownerBar}</p>
      <NextLink
        href={`/garden/new?${new URLSearchParams({ object: plantObjectId })}`}
        className={buttonVariants({ size: "sm" })}
      >
        <NotePencil aria-hidden="true" />
        {copy.ownerWrite}
      </NextLink>
      <NextLink
        href={gardenObjectSectionPath(plantObjectId)}
        className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
      >
        {copy.ownerOpen}
      </NextLink>
    </aside>
  );
}
