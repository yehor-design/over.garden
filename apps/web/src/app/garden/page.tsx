import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpenText, CirclePlus, Compass, Sprout } from "lucide-react";

import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import { buttonVariants } from "@/components/ui/button";
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
import { isFacebookSignInEnabled } from "@/lib/auth/facebook-oauth";
import { isGoogleSignInEnabled } from "@/lib/auth/google-oauth";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  isInterfaceSafeFlushFailureVisualFixtureValue,
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
import { recordAnalyticsEventSafely } from "@/server/analytics-events";
import { findSelectableCatalogItemByPublicSlug } from "@/server/catalog-repository";
import { loadGardenWorkspace } from "@/server/garden-workspace-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  getMySpaceJournalTimeline,
  type SpaceJournalTimeline,
} from "@/server/journal-repository";
import { resolvePilotWriteAccess } from "@/server/pilot-write-access";
import { scopedToUser } from "@/server/request-scope";
import { addCatalogPublicSlugToWishlistAction } from "../wishlist/actions";
import { createSpaceJournalEntryAction } from "./actions";
import { ClosedPilotWriteCallout } from "./closed-pilot-write-callout";
import { FirstEntryComposer } from "./first-entry-composer";
import { GardenAuthPanel } from "./garden-auth-panel";
import { GardenWorkspaceView } from "./garden-workspace-view";
import type { GardenWorkspaceLocalStateSnapshot } from "./garden-workspace-local-state";
import { GardenLoadingView } from "./loading";
import { InterfaceSafeFlushFailureFixture } from "./interface-safe-flush-failure-fixture";
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
  const serverActionPendingFixture = Boolean(
    visualFixtureEnvironment?.target === "local" &&
    isInterfaceServerActionPendingVisualFixtureSearchParams(params),
  );
  const workspaceCopy = getGardenWorkspaceCopy(locale);
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
      ? Promise.resolve({ invited: true })
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
  const selectedSpaceTimeline = selectedSpaceId
    ? await getMySpaceJournalTimeline(scope, selectedSpaceId, {
        objectLimit: 20,
        entryLimit: 5,
      })
    : null;
  const today =
    visualScenario || creationScenario
      ? "2026-07-12"
      : new Date().toISOString().slice(0, 10);

  if (!visualScenario && !creationScenario) {
    await recordAnalyticsEventSafely(scope, {
      eventName: "activation_started",
      properties: {
        activation_source: activationSource,
        source_surface_kind: activationSurfaceKindForSource(activationSource),
      },
    });
  }

  return (
    <>
      <AuthIntentFocus
        action={normalizeAuthIntentResumeAction(params.authIntent)}
        control={normalizeAuthIntentResumeControl(params.authControl)}
      />
      <GardenWorkspaceView
        ownerUserId={userId}
        canWrite={writeAccess.invited}
        locale={locale}
        today={today}
        workspace={workspaceForView}
        localState={visualLocalState(visualScenario, locale)}
      >
        {writeAccess.invited && pendingWishlistItem ? (
          <PendingWishlistIntentPanel
            item={pendingWishlistItem}
            locale={locale}
          />
        ) : null}
        {writeAccess.invited &&
        normalizeSaveProgressMomentKind(params.saveProgress) ===
          "space-entry" ? (
          <SaveProgressMoment
            locale={locale}
            kind="space-entry"
            entryCount={selectedSpaceTimeline?.entries.length ?? 0}
            spaceName={selectedSpaceTimeline?.space.display_name}
            primaryHref="#space-journal"
            primaryLabel={workspaceCopy.page.postSave.returnToSpaceJournal}
            secondaryHref="#first-entry-composer"
            secondaryLabel={workspaceCopy.page.postSave.addAnotherObject}
          />
        ) : null}
        <GardenWriteTools
          canWrite={writeAccess.invited}
          today={today}
          locale={locale}
          activationSource={activationSource}
          initialCatalogItem={initialCatalogItem}
          selectedSpaceTimeline={selectedSpaceTimeline}
          visualScenario={creationScenario}
          ownerUserId={userId}
        />
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
  serverActionPendingFixture,
}: {
  locale: InterfaceLocale;
  activationSource: Parameters<typeof GardenAuthPanel>[0]["activationSource"];
  catalogName?: string | null;
  initialMessage?: string | null;
  postAuthPath?: string | null;
  safeFlushFailureFixture: boolean;
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
  selectedSpaceTimeline,
  visualScenario,
}: {
  ownerUserId: string;
  canWrite: boolean;
  today: string;
  locale: InterfaceLocale;
  activationSource: Parameters<
    typeof FirstEntryComposer
  >[0]["activationSource"];
  initialCatalogItem: FirstEntryCatalogSelection | null;
  selectedSpaceTimeline: SpaceJournalTimeline | null;
  visualScenario: VisualFixtureCreationScenarioEvidence | null;
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
              initialSpace={
                selectedSpaceTimeline
                  ? {
                      id: selectedSpaceTimeline.space.id,
                      displayName: selectedSpaceTimeline.space.display_name,
                    }
                  : null
              }
              initialCatalogItem={initialCatalogItem}
              activationSource={activationSource}
              visualScenario={visualScenario}
            />
          ) : (
            <ClosedPilotWriteCallout locale={locale} />
          )}
        </div>
      </section>

      {selectedSpaceTimeline ? (
        <SpaceJournalTools
          canWrite={canWrite}
          locale={locale}
          timeline={selectedSpaceTimeline}
          today={today}
        />
      ) : null}
    </div>
  );
}

function SpaceJournalTools({
  canWrite,
  locale,
  timeline,
  today,
}: {
  canWrite: boolean;
  locale: InterfaceLocale;
  timeline: SpaceJournalTimeline;
  today: string;
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
        <form
          action={createSpaceJournalEntryAction}
          className="mt-5 grid gap-3 border-y border-border py-5"
        >
          <input type="hidden" name="spaceId" value={timeline.space.id} />
          <input
            type="hidden"
            name="clientMutationId"
            value={crypto.randomUUID()}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-foreground">
                {copy.page.spaceJournal.title}
              </span>
              <input
                name="title"
                required
                maxLength={140}
                placeholder={copy.page.spaceJournal.titlePlaceholder}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-foreground">
                {copy.page.spaceJournal.date}
              </span>
              <input
                type="date"
                name="entryDate"
                defaultValue={today}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">
              {copy.page.spaceJournal.story}
            </span>
            <textarea
              name="body"
              required
              maxLength={2000}
              rows={4}
              placeholder={copy.page.spaceJournal.storyPlaceholder}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm leading-6"
            />
          </label>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-foreground">
              {copy.page.spaceJournal.mentionedObjects}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {timeline.objects.map((object) => (
                <label
                  key={object.id}
                  className="flex items-start gap-2 border-y border-border px-1 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="mentionedPlantObjectIds"
                    value={object.id}
                    className="mt-1 size-4 rounded border-border"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {object.displayName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {localizedPageObjectKind(object.objectKind, copy)} ·{" "}
                      {object.varietyText ??
                        copy.page.spaceJournal.unknownIdentity}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            className={buttonVariants({ className: "w-fit" })}
          >
            <BookOpenText aria-hidden="true" />
            {copy.page.spaceJournal.save}
          </button>
        </form>
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
  const raw = firstParam(value);
  if (
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.includes("\n") &&
    !raw.includes("\r")
  ) {
    return raw;
  }
  return "/garden";
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
  if (value === "bee_colony") return copy.composer.objectKind.beeColony.label;
  return copy.composer.objectKind.plant.label;
}
