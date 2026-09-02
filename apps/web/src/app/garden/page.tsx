import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BookOpenText, CirclePlus, Compass, Sprout } from "lucide-react";

import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import { OwnerScopedActionForm } from "@/components/auth/owner-scope";
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
import { isGoogleSignInEnabled } from "@/lib/auth/google-oauth";
import type { InterfaceLocale } from "@/lib/interface-localization";
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
  hasPriorPublicationDisclosure,
  type SpaceJournalTimeline,
} from "@/server/journal-repository";
import { scopedToUser } from "@/server/request-scope";
import { addCatalogPublicSlugToWishlistAction } from "../wishlist/actions";
import { FirstEntryComposer } from "./first-entry-composer";
import { GardenAuthPanel } from "./garden-auth-panel";
import { GardenWorkspaceView } from "./garden-workspace-view";
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
  const userId = session?.user?.id;
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
      />
    );
  }

  const scope = scopedToUser(userId, getSessionId(session));
  const loadOptions = {
    inventoryExpanded: firstParam(params.inventory) === "all",
    inventoryPage: positivePage(params.inventoryPage),
    spacesExpanded: firstParam(params.spaces) === "all",
    spacesPage: positivePage(params.spacesPage),
    faultSections: [],
  };
  const [workspace, priorPublicationDisclosure] = await Promise.all([
    loadGardenWorkspace(scope, loadOptions),
    hasPriorPublicationDisclosure(scope).catch(() => false),
  ]);
  const writeAccess = {
    canWrite: true,
    actorClass: "real_self_serve" as const,
  };
  const workspaceForView = workspace;
  const requestedSpaceId = uuidParam(params.space);
  const defaultSpaceId =
    workspaceForView.spaces.status === "ready"
      ? (workspaceForView.spaces.value.spaces[0]?.id ?? null)
      : null;
  const selectedSpaceId = requestedSpaceId || defaultSpaceId;
  const initialSpace =
    workspaceForView.spaces.status === "ready"
      ? (workspaceForView.spaces.value.spaces.find(
          (space) => space.id === selectedSpaceId,
        ) ?? null)
      : null;
  const today = new Date().toISOString().slice(0, 10);

  scheduleGardenWorkspaceActivationAnalytics(scope, {
    eventName: "activation_started",
    properties: {
      activation_source: activationSource,
      source_surface_kind: activationSurfaceKindForSource(activationSource),
      actor_class: writeAccess.actorClass,
    },
  });

  return (
    <>
      <AuthIntentFocus
        action={normalizeAuthIntentResumeAction(params.authIntent)}
        control={normalizeAuthIntentResumeControl(params.authControl)}
      />
      <GardenWorkspaceView
        canWrite={writeAccess.canWrite}
        locale={locale}
        today={today}
        workspace={workspaceForView}
      >
        {writeAccess.canWrite && pendingWishlistItem ? (
          <PendingWishlistIntentPanel
            item={pendingWishlistItem}
            locale={locale}
          />
        ) : null}
        <GardenWriteTools
          today={today}
          locale={locale}
          activationSource={activationSource}
          initialCatalogItem={initialCatalogItem}
          initialSpace={
            initialSpace
              ? { id: initialSpace.id, displayName: initialSpace.displayName }
              : null
          }
          enableServerPersistence
          ownerUserId={userId}
          requiresFirstPublicationDisclosure={!priorPublicationDisclosure}
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
                enableServerPersistence
                requiresFirstPublicationDisclosure={!priorPublicationDisclosure}
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

function GuestGardenEntry({
  locale,
  activationSource,
  catalogName,
  initialMessage,
  postAuthPath,
}: {
  locale: InterfaceLocale;
  activationSource: Parameters<typeof GardenAuthPanel>[0]["activationSource"];
  catalogName?: string | null;
  initialMessage?: string | null;
  postAuthPath?: string | null;
}) {
  const copy = getTrustSurfaceCopy(locale).gardenGuest;

  return (
    <main
      lang={locale}
      data-garden-workspace="guest"
      className="mx-auto grid w-full max-w-4xl gap-8 px-4 py-6 sm:px-6 sm:py-8"
    >
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
  today,
  locale,
  activationSource,
  initialCatalogItem,
  initialSpace,
  enableServerPersistence,
  requiresFirstPublicationDisclosure,
  children,
}: {
  ownerUserId: string;
  today: string;
  locale: InterfaceLocale;
  activationSource: Parameters<
    typeof FirstEntryComposer
  >[0]["activationSource"];
  initialCatalogItem: FirstEntryCatalogSelection | null;
  initialSpace: { id: string; displayName: string } | null;
  enableServerPersistence: boolean;
  requiresFirstPublicationDisclosure: boolean;
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
          <FirstEntryComposer
            ownerUserId={ownerUserId}
            locale={locale}
            key={initialCatalogItem?.id ?? "first-entry"}
            today={today}
            initialClientMutationId={crypto.randomUUID()}
            initialSpace={initialSpace}
            initialCatalogItem={initialCatalogItem}
            activationSource={activationSource}
            enableServerPersistence={enableServerPersistence}
            requiresFirstPublicationDisclosure={
              requiresFirstPublicationDisclosure
            }
          />
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
  enableServerPersistence,
  requiresFirstPublicationDisclosure,
  showSaveProgress,
}: {
  canWrite: boolean;
  locale: InterfaceLocale;
  ownerUserId: string;
  scope: ReturnType<typeof scopedToUser>;
  spaceId: string;
  today: string;
  enableServerPersistence: boolean;
  requiresFirstPublicationDisclosure: boolean;
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
        enableServerPersistence={enableServerPersistence}
        requiresFirstPublicationDisclosure={requiresFirstPublicationDisclosure}
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
  enableServerPersistence,
  requiresFirstPublicationDisclosure,
}: {
  canWrite: boolean;
  locale: InterfaceLocale;
  ownerUserId: string;
  timeline: SpaceJournalTimeline;
  today: string;
  enableServerPersistence: boolean;
  requiresFirstPublicationDisclosure: boolean;
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
          enableServerPersistence={enableServerPersistence}
          requiresFirstPublicationDisclosure={
            requiresFirstPublicationDisclosure
          }
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
                  {copy.page.spaceJournal.public}
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
    serveClass: "exact",
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
        <OwnerScopedActionForm action={addCatalogPublicSlugToWishlistAction}>
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
        </OwnerScopedActionForm>
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
