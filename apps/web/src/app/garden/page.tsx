import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BookOpenText, CirclePlus, Compass, Sprout } from "lucide-react";

import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import { buttonVariants } from "@/components/ui/button";
import { SpaceEntryComposer } from "@/app/garden/space-entry-composer";
import {
  activationSurfaceKindForSource,
  normalizeActivationSourceParam,
} from "@/lib/garden/activation";
import type { FirstEntryCatalogSelection } from "@/lib/garden/entry-contracts";
import { gardenFirstEntryPreselectionPath } from "@/lib/garden/public-paths";
import { normalizeSaveProgressMomentKind } from "@/lib/garden/save-progress-moment";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import { isFacebookSignInEnabled } from "@/lib/auth/facebook-oauth";
import { isGoogleSignInEnabled } from "@/lib/auth/google-oauth";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  isInterfaceSafeFlushFailureVisualFixtureValue,
  isInterfaceSafeFlushTimeoutVisualFixtureValue,
  isInterfaceServerActionPendingVisualFixtureSearchParams,
} from "@/lib/localization/localization-visual-fixture";
import {
  formatGardenWorkspaceDate,
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
  type GardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import { localizedPath } from "@/lib/public-localization";
import {
  formatTrustTemplate,
  getLocalizedOAuthErrorMessage,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
import { resolveVisualGardenWorkspaceScenario } from "@/lib/visual-fixtures/garden-workspace-scenarios";
import { resolveVisualJournalCreationScenario } from "@/lib/visual-fixtures/journal-creation-scenarios";
import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";
import type {
  VisualFixtureCreationScenarioEvidence,
  VisualFixtureWorkspaceScenarioEvidence,
} from "@/lib/visual-fixtures/manifest";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { findSelectableCatalogItemByPublicSlug } from "@/server/catalog-repository";
import {
  loadGardenWorkspace,
  withGardenWorkspaceDeadline,
} from "@/server/garden-workspace-repository";
import { scheduleGardenWorkspaceActivationAnalytics } from "@/server/garden-workspace-after-response";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  getMySpaceJournalTimeline,
  type SpaceJournalTimeline,
} from "@/server/journal-repository";
import { resolvePilotWriteAccess } from "@/server/pilot-write-access";
import { scopedToUser } from "@/server/request-scope";
import { addCatalogPublicSlugToWishlistAction } from "../wishlist/actions";
import { ClosedPilotWriteCallout } from "./closed-pilot-write-callout";
import { FirstEntryComposer } from "./first-entry-composer";
import { GardenAuthPanel } from "./garden-auth-panel";
import { GardenWorkspaceView } from "./garden-workspace-view";
import type { GardenWorkspaceLocalStateSnapshot } from "./garden-workspace-local-state";
import { GardenLoadingView } from "./loading";
import { InterfaceSafeFlushFailureFixture } from "./interface-safe-flush-failure-fixture";
import { InterfaceSafeFlushTimeoutFixture } from "./interface-safe-flush-timeout-fixture";
import { holdInterfaceServerActionPendingVisualFixtureAction } from "./interface-server-action-pending-fixture-action";
import { InterfaceServerActionPendingFixture } from "./interface-server-action-pending-fixture";
import { SaveProgressMoment } from "./save-progress-moment";

export const dynamic = "force-dynamic";

type GardenSearchParams = Record<string, string | string[] | undefined>;
const EMPTY_GARDEN_SEARCH_PARAMS: GardenSearchParams = {};
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_GARDEN_PAGE = 100;

interface GardenPageProps {
  searchParams?: Promise<GardenSearchParams>;
}

export default async function GardenPage({ searchParams }: GardenPageProps) {
  const [session, params, locale] = await Promise.all([
    getCurrentSession(),
    searchParams ?? Promise.resolve(EMPTY_GARDEN_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
  ]);
  const visualScenario = resolveVisualGardenWorkspaceScenario(
    params.visualWorkspace,
    process.env,
  );
  const visualFixtureEnvironment = tryResolveVisualFixtureEnvironment(
    process.env,
  );
  const safeFlushFailureFixture = Boolean(
    visualFixtureEnvironment &&
    isInterfaceSafeFlushFailureVisualFixtureValue(params.visualLocaleState),
  );
  const safeFlushTimeoutFixture = Boolean(
    visualFixtureEnvironment &&
    isInterfaceSafeFlushTimeoutVisualFixtureValue(params.visualLocaleState),
  );
  const serverActionPendingFixture = Boolean(
    visualFixtureEnvironment?.target === "local" &&
    isInterfaceServerActionPendingVisualFixtureSearchParams(params),
  );
  const creationScenario = resolveVisualJournalCreationScenario(
    params.visualCreate,
    "first-entry",
    process.env,
  );
  if (visualScenario?.state === "loading") {
    return <GardenLoadingView locale={locale} />;
  }

  const userId =
    creationScenario?.ownerActorId ??
    visualScenario?.ownerActorId ??
    session?.user?.id;
  const engagementAuthMessage = engagementAuthPrompt(locale, params.engagement);
  const engagementPostAuthPath = engagementAuthMessage
    ? normalizeGardenReturnToParam(params.returnTo)
    : null;
  const [initialCatalogItem, pendingWishlistItem] = await Promise.all([
    resolveInitialCatalogSelection(params),
    resolvePendingWishlistSelection(params),
  ]);
  const activationSource = normalizeActivationSourceParam(params.source, {
    hasResolvedCatalogSelection: Boolean(initialCatalogItem),
  });
  const oauthMessage = getLocalizedOAuthErrorMessage(locale, params.error);

  if (
    userId &&
    !visualScenario &&
    engagementPostAuthPath &&
    engagementPostAuthPath !== "/garden"
  ) {
    redirect(engagementPostAuthPath);
  }

  if (!userId) {
    return (
      <GuestGardenEntry
        locale={locale}
        activationSource={activationSource}
        catalogName={initialCatalogItem?.displayName}
        initialMessage={
          oauthMessage ??
          engagementAuthMessage ??
          (pendingWishlistItem
            ? formatTrustTemplate(
                getTrustSurfaceCopy(locale).gardenGuest.wishlistPrompt,
                { catalogName: pendingWishlistItem.canonicalName },
              )
            : null)
        }
        postAuthPath={engagementPostAuthPath}
        safeFlushFailureFixture={safeFlushFailureFixture}
        safeFlushTimeoutFixture={safeFlushTimeoutFixture}
        serverActionPendingFixture={serverActionPendingFixture}
      />
    );
  }

  const scope = scopedToUser(
    userId,
    visualScenario || creationScenario ? null : getSessionId(session),
  );
  const loadOptions = {
    inventoryExpanded: firstParam(params.inventory) === "all",
    inventoryPage: positivePage(params.inventoryPage),
    spacesExpanded: firstParam(params.spaces) === "all",
    spacesPage: positivePage(params.spacesPage),
    faultSections: visualScenario?.faultSections ?? [],
  };
  const [writeAccess, workspace] = await Promise.all([
    visualScenario || creationScenario
      ? Promise.resolve({
          canWrite: true,
          invited: false,
          actorClass: "visual_fixture" as const,
        })
      : resolvePilotWriteAccess(scope),
    loadGardenWorkspace(scope, loadOptions),
  ]);
  const workspaceForView = applyVisualWorkspaceSummary(
    workspace,
    visualScenario,
  );
  const requestedSpaceId = uuidParam(params.space);
  const defaultSpaceId =
    workspaceForView.spaces.status === "ready"
      ? (workspaceForView.spaces.value.spaces[0]?.id ?? null)
      : null;
  const selectedSpaceId =
    requestedSpaceId || creationScenario?.spaceId || defaultSpaceId;
  const initialSpace =
    workspaceForView.spaces.status === "ready"
      ? (workspaceForView.spaces.value.spaces.find(
          (space) => space.id === selectedSpaceId,
        ) ?? null)
      : null;
  const today =
    visualScenario || creationScenario
      ? "2026-07-12"
      : new Date().toISOString().slice(0, 10);

  if (!visualScenario && !creationScenario) {
    scheduleGardenWorkspaceActivationAnalytics(scope, {
      eventName: "activation_started",
      properties: {
        activation_source: activationSource,
        source_surface_kind: activationSurfaceKindForSource(activationSource),
        actor_class: writeAccess.actorClass,
      },
    });
  }

  return (
    <>
      <AuthIntentFocus
        action={normalizeAuthIntentResumeAction(params.authIntent)}
        control={normalizeAuthIntentResumeControl(params.authControl)}
      />
      {safeFlushTimeoutFixture ? <InterfaceSafeFlushTimeoutFixture /> : null}
      <GardenWorkspaceView
        ownerUserId={userId}
        canWrite={writeAccess.canWrite}
        locale={locale}
        today={today}
        workspace={workspaceForView}
        localState={visualLocalState(visualScenario, locale)}
      >
        {writeAccess.canWrite && pendingWishlistItem ? (
          <PendingWishlistIntentPanel
            item={pendingWishlistItem}
            locale={locale}
          />
        ) : null}
        <GardenWriteTools
          canWrite={writeAccess.canWrite}
          today={today}
          locale={locale}
          activationSource={activationSource}
          initialCatalogItem={initialCatalogItem}
          initialSpace={
            initialSpace
              ? { id: initialSpace.id, displayName: initialSpace.displayName }
              : null
          }
          visualScenario={creationScenario}
          enableOfflinePersistence={!visualScenario && !creationScenario}
          ownerUserId={userId}
        >
          {selectedSpaceId ? (
            <Suspense fallback={null}>
              <GardenSelectedSpaceTimeline
                canWrite={writeAccess.canWrite}
                locale={locale}
                ownerUserId={userId}
                scope={scope}
                spaceId={selectedSpaceId}
                today={today}
                enableOfflinePersistence={!visualScenario && !creationScenario}
                showSaveProgress={
                  writeAccess.canWrite &&
                  normalizeSaveProgressMomentKind(params.saveProgress) ===
                    "space-entry"
                }
              />
            </Suspense>
          ) : null}
        </GardenWriteTools>
      </GardenWorkspaceView>
    </>
  );
}

function applyVisualWorkspaceSummary(
  workspace: Awaited<ReturnType<typeof loadGardenWorkspace>>,
  scenario: VisualFixtureWorkspaceScenarioEvidence | null,
) {
  if (!scenario || workspace.media.status !== "ready") return workspace;

  return {
    ...workspace,
    media: {
      status: "ready" as const,
      value: {
        processingCount: scenario.mediaProcessingCount,
        failedCount: scenario.mediaFailedCount,
      },
    },
  };
}

function visualLocalState(
  scenario: VisualFixtureWorkspaceScenarioEvidence | null,
  locale: InterfaceLocale,
): GardenWorkspaceLocalStateSnapshot | undefined {
  if (!scenario) return undefined;
  const copy = getGardenWorkspaceCopy(locale);

  const objectId = scenario.expectedObjectIds[0] ?? "fixture-first-object";
  const objectHref = `/garden/objects/${encodeURIComponent(objectId)}#follow-up-composer`;
  const drafts = Array.from({ length: scenario.draftCount }, (_, index) => ({
    id: `synthetic-workspace-draft-${index + 1}`,
    title: `Synthetic draft ${index + 1}`,
    subtitle:
      index === 0
        ? `${copy.localState.drafts.objectUpdate} · ${formatGardenWorkspaceDate(
            locale,
            "2026-07-12",
            "short",
          )}`
        : `${copy.localState.drafts.firstObject} · ${formatGardenWorkspaceDate(
            locale,
            "2026-07-11",
            "short",
          )}`,
    href: index === 0 ? objectHref : "/garden#first-entry-composer",
  }));
  const queued = Array.from({ length: scenario.queuedCount }, (_, index) => ({
    id: `synthetic-workspace-queued-${index + 1}`,
    title: `Synthetic queued update ${index + 1}`,
    status: "queued" as const,
    href: objectHref,
  }));
  const failed = Array.from({ length: scenario.failedCount }, (_, index) => ({
    id: `synthetic-workspace-failed-${index + 1}`,
    title: `Synthetic failed update ${index + 1}`,
    status: "failed" as const,
    href: objectHref,
  }));

  return {
    online: scenario.online,
    drafts,
    mutations: [...queued, ...failed],
  };
}

function GuestGardenEntry({
  locale,
  activationSource,
  catalogName,
  initialMessage,
  postAuthPath,
  safeFlushFailureFixture,
  safeFlushTimeoutFixture,
  serverActionPendingFixture,
}: {
  locale: InterfaceLocale;
  activationSource: Parameters<typeof GardenAuthPanel>[0]["activationSource"];
  catalogName?: string | null;
  initialMessage?: string | null;
  postAuthPath?: string | null;
  safeFlushFailureFixture: boolean;
  safeFlushTimeoutFixture: boolean;
  serverActionPendingFixture: boolean;
}) {
  const copy = getTrustSurfaceCopy(locale).gardenGuest;

  return (
    <main
      lang={locale}
      data-garden-workspace="guest"
      className="mx-auto grid w-full max-w-4xl gap-8 px-4 py-6 sm:px-6 sm:py-8"
    >
      {safeFlushFailureFixture ? <InterfaceSafeFlushFailureFixture /> : null}
      {safeFlushTimeoutFixture ? <InterfaceSafeFlushTimeoutFixture /> : null}
      {serverActionPendingFixture ? (
        <InterfaceServerActionPendingFixture
          action={holdInterfaceServerActionPendingVisualFixtureAction}
        />
      ) : null}
      <header className="border-b border-border pb-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase">
          {copy.eyebrow}
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-foreground">
          {copy.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <GardenAuthPanel
            embedded
            activationSource={activationSource}
            catalogName={catalogName}
            facebookSignInEnabled={isFacebookSignInEnabled()}
            googleSignInEnabled={isGoogleSignInEnabled()}
            initialMessage={initialMessage}
            locale={locale}
            postAuthPath={postAuthPath}
            title={copy.panelTitle}
            prompt={copy.panelPrompt}
          />
        </div>
        <aside className="border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            {copy.exploreEyebrow}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            {copy.exploreTitle}
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href={localizedPath(locale, "/journals")}
              className={buttonVariants({
                variant: "outline",
                className: "justify-start",
              })}
            >
              <BookOpenText aria-hidden="true" />
              {copy.publicJournals}
            </Link>
            <Link
              href={localizedPath(locale, "/objects")}
              className={buttonVariants({
                variant: "outline",
                className: "justify-start",
              })}
            >
              <Sprout aria-hidden="true" />
              {copy.livingObjects}
            </Link>
            <Link
              href={localizedPath(locale, "/knowledge")}
              className={buttonVariants({
                variant: "outline",
                className: "justify-start",
              })}
            >
              <Compass aria-hidden="true" />
              {copy.knowledge}
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}

function GardenWriteTools({
  ownerUserId,
  canWrite,
  today,
  locale,
  activationSource,
  initialCatalogItem,
  initialSpace,
  visualScenario,
  enableOfflinePersistence,
  children,
}: {
  ownerUserId: string;
  canWrite: boolean;
  today: string;
  locale: InterfaceLocale;
  activationSource: Parameters<
    typeof FirstEntryComposer
  >[0]["activationSource"];
  initialCatalogItem: FirstEntryCatalogSelection | null;
  initialSpace: { id: string; displayName: string } | null;
  visualScenario: VisualFixtureCreationScenarioEvidence | null;
  enableOfflinePersistence: boolean;
  children?: React.ReactNode;
}) {
  const copy = getGardenWorkspaceCopy(locale);
  return (
    <div className="flex flex-col gap-10 border-t border-border pt-8">
      <section id="first-entry-composer" className="scroll-mt-20">
        <p className="text-xs font-semibold text-muted-foreground uppercase">
          {copy.page.creation.eyebrow}
        </p>
        <h2 className="mt-1 text-xl font-semibold text-foreground">
          {copy.page.creation.title}
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.page.creation.description}
        </p>
        <div className="mt-5" id="write-access">
          {canWrite ? (
            <FirstEntryComposer
              ownerUserId={ownerUserId}
              locale={locale}
              key={initialCatalogItem?.id ?? "first-entry"}
              today={today}
              initialClientMutationId={crypto.randomUUID()}
              initialSpace={initialSpace}
              initialCatalogItem={initialCatalogItem}
              activationSource={activationSource}
              visualScenario={visualScenario}
              enableOfflinePersistence={enableOfflinePersistence}
            />
          ) : (
            <ClosedPilotWriteCallout locale={locale} />
          )}
        </div>
      </section>

      {children}
    </div>
  );
}

async function GardenSelectedSpaceTimeline({
  canWrite,
  locale,
  ownerUserId,
  scope,
  spaceId,
  today,
  enableOfflinePersistence,
  showSaveProgress,
}: {
  canWrite: boolean;
  locale: InterfaceLocale;
  ownerUserId: string;
  scope: ReturnType<typeof scopedToUser>;
  spaceId: string;
  today: string;
  enableOfflinePersistence: boolean;
  showSaveProgress: boolean;
}) {
  const timeline = await withGardenWorkspaceDeadline(() =>
    getMySpaceJournalTimeline(scope, spaceId, {
      objectLimit: 20,
      entryLimit: 5,
    }),
  ).catch(() => null);
  if (!timeline) return null;

  const copy = getGardenWorkspaceCopy(locale);
  return (
    <>
      {showSaveProgress ? (
        <SaveProgressMoment
          locale={locale}
          kind="space-entry"
          entryCount={timeline.entries.length}
          spaceName={timeline.space.display_name}
          primaryHref="#space-journal"
          primaryLabel={copy.page.postSave.returnToSpaceJournal}
          secondaryHref="#first-entry-composer"
          secondaryLabel={copy.page.postSave.addAnotherObject}
        />
      ) : null}
      <SpaceJournalTools
        canWrite={canWrite}
        locale={locale}
        ownerUserId={ownerUserId}
        timeline={timeline}
        today={today}
        enableOfflinePersistence={enableOfflinePersistence}
      />
    </>
  );
}

function SpaceJournalTools({
  canWrite,
  locale,
  ownerUserId,
  timeline,
  today,
  enableOfflinePersistence,
}: {
  canWrite: boolean;
  locale: InterfaceLocale;
  ownerUserId: string;
  timeline: SpaceJournalTimeline;
  today: string;
  enableOfflinePersistence: boolean;
}) {
  const copy = getGardenWorkspaceCopy(locale);
  return (
    <section id="space-journal" className="scroll-mt-20">
      <p className="text-xs font-semibold text-muted-foreground uppercase">
        {copy.page.spaceJournal.eyebrow}
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {timeline.space.display_name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy.page.spaceJournal.description}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatGardenWorkspaceTemplate(copy.page.spaceJournal.showing, {
            count: timeline.entries.length,
          })}
        </span>
      </div>

      {canWrite && timeline.objects.length > 0 ? (
        <SpaceEntryComposer
          locale={locale}
          ownerUserId={ownerUserId}
          spaceId={timeline.space.id}
          today={today}
          enableOfflinePersistence={enableOfflinePersistence}
          objects={timeline.objects.map((object) => ({
            id: object.id,
            displayName: object.displayName,
            objectKindLabel: `${localizedPageObjectKind(object.objectKind, copy)} · ${
              object.varietyText ?? copy.page.spaceJournal.unknownIdentity
            }`,
          }))}
        />
      ) : null}

      {timeline.entries.length > 0 ? (
        <ol className="divide-y divide-border border-b border-border">
          {timeline.entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {entry.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.visibility === "public"
                    ? copy.page.spaceJournal.public
                    : copy.page.spaceJournal.private}
                  {entry.lifecycle_state === "archived"
                    ? ` · ${copy.page.spaceJournal.archived}`
                    : ""}
                </p>
              </div>
              <time className="shrink-0 text-xs text-muted-foreground">
                {formatGardenWorkspaceDate(locale, entry.entry_date)}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="border-b border-dashed border-border py-5 text-sm text-muted-foreground">
          {copy.page.spaceJournal.empty}
        </p>
      )}
    </section>
  );
}

async function resolveInitialCatalogSelection(
  searchParams: GardenSearchParams,
): Promise<FirstEntryCatalogSelection | null> {
  const publicSlug = firstParam(searchParams.catalog);
  if (!publicSlug) return null;
  const item = await findSelectableCatalogItemByPublicSlug(publicSlug);
  if (!item) return null;
  return {
    id: item.id,
    displayName: item.canonicalName,
    canonicalName: item.canonicalName,
    catalogKind: item.catalogKind,
    locale: item.locale,
    status: item.status,
    source: item.source,
  };
}

async function resolvePendingWishlistSelection(
  searchParams: GardenSearchParams,
) {
  const publicSlug = firstParam(searchParams.wishlist);
  if (!publicSlug) return null;
  const item = await findSelectableCatalogItemByPublicSlug(publicSlug);
  return item?.publicSlug ? item : null;
}

function PendingWishlistIntentPanel({
  item,
  locale,
}: {
  item: Awaited<ReturnType<typeof resolvePendingWishlistSelection>>;
  locale: InterfaceLocale;
}) {
  if (!item?.publicSlug) return null;
  const copy = getGardenWorkspaceCopy(locale).page.pendingWishlist;
  return (
    <section className="border-y border-border py-5">
      <h2 className="text-lg font-semibold text-foreground">{copy.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatGardenWorkspaceTemplate(copy.description, {
          name: item.canonicalName,
        })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={addCatalogPublicSlugToWishlistAction}>
          <input
            type="hidden"
            name="catalogPublicSlug"
            value={item.publicSlug}
          />
          <input type="hidden" name="locale" value={locale} />
          <input
            type="hidden"
            name="returnTo"
            value={localizedPath(locale, "/wishlist")}
          />
          <button type="submit" className={buttonVariants()}>
            {copy.save}
          </button>
        </form>
        <Link
          href={gardenFirstEntryPreselectionPath(item.publicSlug)}
          className={buttonVariants({ variant: "outline" })}
        >
          <CirclePlus aria-hidden="true" />
          {copy.startFirstEntry}
        </Link>
      </div>
    </section>
  );
}

function engagementAuthPrompt(
  locale: InterfaceLocale,
  value: string | string[] | undefined,
) {
  const intent = firstParam(value);
  const copy = getTrustSurfaceCopy(locale).gardenGuest;
  if (intent === "comment-auth") return copy.commentPrompt;
  if (intent === "bookmark-auth") return copy.bookmarkPrompt;
  return null;
}

function normalizeGardenReturnToParam(value: string | string[] | undefined) {
  return normalizeInternalReturnPath(firstParam(value), "/garden");
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return typeof value === "string" ? value.trim() : "";
}

function positivePage(value: string | string[] | undefined) {
  const parsed = Number.parseInt(firstParam(value), 10);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, MAX_GARDEN_PAGE)
    : 1;
}

function uuidParam(value: string | string[] | undefined) {
  const candidate = firstParam(value);
  return UUID_PATTERN.test(candidate) ? candidate : "";
}

function localizedPageObjectKind(value: string, copy: GardenWorkspaceCopy) {
  if (value === "animal") return copy.composer.objectKind.animal.label;
  return copy.composer.objectKind.plant.label;
}
