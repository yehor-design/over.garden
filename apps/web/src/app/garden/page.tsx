import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  BookOpen,
  Camera,
  ClipboardList,
  Clock3,
  Leaf,
  Plus,
  ShieldCheck,
  Sprout,
} from "lucide-react";

import {
  activationSurfaceKindForSource,
  normalizeActivationSourceParam,
} from "@/lib/garden/activation";
import { buttonVariants } from "@/components/ui/button";
import type { JournalEntry } from "@/db/schema";
import { isFacebookSignInEnabled } from "@/lib/auth/facebook-oauth";
import { isGoogleSignInEnabled } from "@/lib/auth/google-oauth";
import { oauthErrorRecoveryMessage } from "@/lib/auth/social-oauth";
import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import {
  gardenFirstEntryPreselectionPath,
  publicProfilePath,
} from "@/lib/garden/public-paths";
import { localizedPath } from "@/lib/public-localization";
import { normalizeSaveProgressMomentKind } from "@/lib/garden/save-progress-moment";
import type { FirstEntryCatalogSelection } from "@/lib/garden/entry-contracts";
import {
  catalogIdentityLabel,
  entryPrivacyLabel,
  entryScopeLabel,
  plantObjectKindLabel,
  varietyStateLabel,
} from "@/lib/garden/pilot-ux-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { recordAnalyticsEventSafely } from "@/server/analytics-events";
import { findSelectableCatalogItemByPublicSlug } from "@/server/catalog-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  listMyPlantObjects,
  listMyRecentJournalEntries,
  listMySpaceJournalTimelines,
  type PlantObjectSummary,
  type SpaceJournalTimeline,
} from "@/server/journal-repository";
import { resolvePilotWriteAccess } from "@/server/pilot-write-access";
import { ensureUserPublicProfile } from "@/server/public-profile-repository";
import { scopedToUser } from "@/server/request-scope";
import { ClosedPilotWriteCallout } from "./closed-pilot-write-callout";
import { addCatalogPublicSlugToWishlistAction } from "../wishlist/actions";
import { createSpaceJournalEntryAction } from "./actions";
import { GardenDraftResumePanel } from "./draft-resume-panel";
import { FirstEntryComposer } from "./first-entry-composer";
import { GardenAuthPanel, SocialAccountLinkPanel } from "./garden-auth-panel";
import { SaveProgressMoment } from "./save-progress-moment";

export const dynamic = "force-dynamic";

type GardenSearchParams = Record<string, string | string[] | undefined>;
const EMPTY_GARDEN_SEARCH_PARAMS: GardenSearchParams = {};

interface GardenPageProps {
  searchParams?: Promise<GardenSearchParams>;
}

export default async function GardenPage({ searchParams }: GardenPageProps) {
  const [session, params, locale] = await Promise.all([
    getCurrentSession(),
    searchParams ?? Promise.resolve(EMPTY_GARDEN_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
  ]);
  const copy = getInterfaceCopy(locale);
  const userId = session?.user?.id;
  const initialCatalogItem = await resolveInitialCatalogSelection(params);
  const pendingWishlistItem = await resolvePendingWishlistSelection(params);
  const engagementAuthMessage = engagementAuthPrompt(params.engagement);
  const engagementPostAuthPath = engagementAuthMessage
    ? normalizeGardenReturnToParam(params.returnTo)
    : null;
  const saveProgressKind = normalizeSaveProgressMomentKind(params.saveProgress);
  const activationSource = normalizeActivationSourceParam(params.source, {
    hasResolvedCatalogSelection: Boolean(initialCatalogItem),
  });
  const facebookSignInEnabled = isFacebookSignInEnabled();
  const googleSignInEnabled = isGoogleSignInEnabled();
  const oauthMessage = oauthErrorRecoveryMessage(params.error);
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;

  if (
    userId &&
    engagementPostAuthPath &&
    engagementPostAuthPath !== "/garden"
  ) {
    redirect(engagementPostAuthPath);
  }

  const writeAccess = scope
    ? await resolvePilotWriteAccess(scope)
    : { invited: false };
  const publicProfile = scope ? await ensureUserPublicProfile(scope) : null;
  const objects = scope ? await listMyPlantObjects(scope, 20) : [];
  const spaceTimelines = scope ? await listMySpaceJournalTimelines(scope) : [];
  const recentEntries = scope ? await listMyRecentJournalEntries(scope, 8) : [];
  const spaceJournalEntryCount = spaceTimelines.reduce(
    (count, timeline) => count + timeline.entries.length,
    0,
  );
  const hasObjects = objects.length > 0;
  const today = new Date().toISOString().slice(0, 10);
  const workspaceStats = summarizeWorkspace(objects, spaceTimelines, today);
  const nextAction = chooseWorkspaceNextAction(objects, today);
  const recentActivity = buildRecentActivityItems(
    recentEntries,
    objects,
    spaceTimelines,
  );

  if (scope) {
    await recordAnalyticsEventSafely(scope, {
      eventName: "activation_started",
      properties: {
        activation_source: activationSource,
        source_surface_kind: activationSurfaceKindForSource(activationSource),
      },
    });
  }

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8"
    >
      <header className="flex flex-col gap-2 border-b border-border pb-5">
        <p className="text-sm font-medium text-muted-foreground">OverGarden</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {copy.workspace.title}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {hasObjects
                ? copy.workspace.returningDescription
                : copy.workspace.emptyDescription}
            </p>
          </div>
          {userId ? (
            <div className="flex flex-col gap-2 text-sm sm:items-end">
              <Link
                href={localizedPath(locale, "/feed")}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {copy.navigation.followedFeed}
              </Link>
              <Link
                href={localizedPath(locale, "/notifications")}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {copy.navigation.notifications}
              </Link>
              <Link
                href={localizedPath(locale, "/bookmarks")}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {copy.navigation.bookmarks}
              </Link>
              <Link
                href="/garden/lineage/claims"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {copy.navigation.lineageClaims}
              </Link>
              {publicProfile ? (
                <Link
                  href="/garden/profile"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  @{publicProfile.handle}
                </Link>
              ) : null}
              {publicProfile ? (
                <Link
                  href={publicProfilePath(locale, publicProfile.handle)}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {copy.navigation.publicProfile}
                </Link>
              ) : null}
              {session?.user?.email ? (
                <p className="text-muted-foreground">{session.user.email}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {!userId ? (
        <GardenAuthPanel
          activationSource={activationSource}
          catalogName={initialCatalogItem?.displayName}
          facebookSignInEnabled={facebookSignInEnabled}
          googleSignInEnabled={googleSignInEnabled}
          initialMessage={
            oauthMessage ??
            engagementAuthMessage ??
            (pendingWishlistItem
              ? `Sign in to save ${pendingWishlistItem.canonicalName} to your wishlist.`
              : null)
          }
          postAuthPath={engagementPostAuthPath}
        />
      ) : null}

      {userId ? (
        <SocialAccountLinkPanel
          facebookSignInEnabled={facebookSignInEnabled}
          googleSignInEnabled={googleSignInEnabled}
          initialMessage={oauthMessage}
        />
      ) : null}

      {userId ? (
        <>
          {writeAccess.invited ? <GardenDraftResumePanel /> : null}
          {writeAccess.invited && pendingWishlistItem ? (
            <PendingWishlistIntentPanel
              item={pendingWishlistItem}
              locale={locale}
            />
          ) : null}
          {writeAccess.invited && saveProgressKind === "space-entry" ? (
            <SaveProgressMoment
              kind={saveProgressKind}
              entryCount={spaceJournalEntryCount}
              spaceName="your garden"
              primaryHref="#space-journals"
              primaryLabel="Return to space timelines"
              secondaryHref="#first-entry-composer"
              secondaryLabel="Add another entry"
            />
          ) : null}
          <WorkspaceOverview
            canWrite={writeAccess.invited}
            hasObjects={hasObjects}
            stats={workspaceStats}
            nextAction={nextAction}
          />

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
              <ObjectInventory
                canWrite={writeAccess.invited}
                objects={objects}
                today={today}
              />

              <section
                id="first-entry-composer"
                className="flex flex-col gap-4 rounded-lg border border-border p-4"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    {hasObjects ? "Add object" : "Start workspace"}
                  </p>
                  <h2 className="text-lg font-semibold text-foreground">
                    {hasObjects
                      ? "Start another living object"
                      : "First living object"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {!writeAccess.invited
                      ? "Your workspace structure is visible now; writing unlocks after a valid pilot invitation."
                      : hasObjects
                        ? "Create a separate record when the next plant, colony, or animal needs its own history."
                        : "Save the first note with a catalog match, your own catalog name, or no match yet."}
                  </p>
                </div>

                {writeAccess.invited ? (
                  <FirstEntryComposer
                    key={initialCatalogItem?.id ?? "first-entry"}
                    today={today}
                    initialClientMutationId={crypto.randomUUID()}
                    initialCatalogItem={initialCatalogItem}
                    activationSource={activationSource}
                  />
                ) : (
                  <ClosedPilotWriteCallout locale={locale} />
                )}
              </section>

              {hasObjects ? (
                <section id="space-journals" className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                      Space timeline
                    </p>
                    <h2 className="text-lg font-semibold text-foreground">
                      Space journals
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {writeAccess.invited
                        ? "Write one dated story for a whole space and mention the objects it covers."
                        : "Read the dated history for this space. New space notes unlock after write access is available."}
                    </p>
                  </div>

                  <div className="grid gap-4">
                    {spaceTimelines.map((timeline) => (
                      <SpaceTimelinePanel
                        key={timeline.space.id}
                        canWrite={writeAccess.invited}
                        timeline={timeline}
                        today={today}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-6 xl:self-start">
              <WorkspaceQuickActions
                canWrite={writeAccess.invited}
                hasObjects={hasObjects}
                nextAction={nextAction}
              />
              <RecentActivityPanel items={recentActivity} />
            </aside>
          </div>
        </>
      ) : null}
    </main>
  );
}

interface WorkspaceStats {
  objectCount: number;
  objectEntryCount: number;
  publicEntryCount: number;
  needsUpdateCount: number;
  spaceCount: number;
  spaceEntryCount: number;
}

interface WorkspaceNextAction {
  title: string;
  description: string;
  href: string;
  label: string;
  object?: PlantObjectSummary;
}

interface RecentActivityItem {
  id: string;
  title: string;
  href: string;
  context: string;
  date: Date | string;
  scopeLabel: string;
  privacyLabel: string;
}

function WorkspaceOverview({
  canWrite,
  hasObjects,
  stats,
  nextAction,
}: {
  canWrite: boolean;
  hasObjects: boolean;
  stats: WorkspaceStats;
  nextAction: WorkspaceNextAction;
}) {
  const primaryHref = canWrite ? nextAction.href : "#first-entry-composer";
  const primaryLabel = canWrite ? nextAction.label : "Check write access";

  return (
    <section className="grid gap-5 rounded-lg border border-border bg-muted/20 p-4 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-1">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Next action
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {nextAction.title}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {nextAction.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={primaryHref} className={buttonVariants()}>
            <Plus className="size-4" aria-hidden="true" />
            {primaryLabel}
          </Link>
          {hasObjects && canWrite ? (
            <Link
              href="#space-journals"
              className={buttonVariants({ variant: "outline" })}
            >
              <BookOpen className="size-4" aria-hidden="true" />
              Space note
            </Link>
          ) : null}
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
        <WorkspaceMetric
          icon={<Sprout className="size-4" aria-hidden="true" />}
          label="Living objects"
          value={stats.objectCount}
          detail={
            stats.spaceCount === 1
              ? "1 workspace space"
              : `${stats.spaceCount} workspace spaces`
          }
        />
        <WorkspaceMetric
          icon={<ClipboardList className="size-4" aria-hidden="true" />}
          label="Journal entries"
          value={stats.objectEntryCount + stats.spaceEntryCount}
          detail={`${stats.objectEntryCount} object · ${stats.spaceEntryCount} space`}
        />
        <WorkspaceMetric
          icon={<Clock3 className="size-4" aria-hidden="true" />}
          label="Need update"
          value={stats.needsUpdateCount}
          detail="No note yet or stale direct update"
        />
        <WorkspaceMetric
          icon={<ShieldCheck className="size-4" aria-hidden="true" />}
          label="Public-safe"
          value={stats.publicEntryCount}
          detail="Everything else stays private"
        />
      </dl>
    </section>
  );
}

function WorkspaceMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="flex min-w-0 gap-3 rounded-md border border-border bg-background/80 p-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground uppercase">
          {label}
        </dt>
        <dd className="mt-1 text-2xl font-semibold text-foreground">{value}</dd>
        <dd className="mt-1 truncate text-xs text-muted-foreground">
          {detail}
        </dd>
      </span>
    </div>
  );
}

function ObjectInventory({
  canWrite,
  objects,
  today,
}: {
  canWrite: boolean;
  objects: PlantObjectSummary[];
  today: string;
}) {
  if (objects.length === 0) {
    return (
      <section className="flex flex-col gap-4 rounded-lg border border-dashed border-border p-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Inventory
          </p>
          <h2 className="text-lg font-semibold text-foreground">
            No living objects yet
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {canWrite
              ? "Save the first entry to create the default space, first living object, and first dated record in one path."
              : "Your private garden workspace is ready. Writing is still invite-only, so the first object starts after write access is unlocked."}
          </p>
        </div>
        <Link
          href="#first-entry-composer"
          className={buttonVariants({ className: "w-fit" })}
        >
          <Leaf className="size-4" aria-hidden="true" />
          {canWrite ? "Start first object" : "Check write access"}
        </Link>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Inventory
          </p>
          <h2 className="text-lg font-semibold text-foreground">
            Living objects
          </h2>
          <p className="text-sm text-muted-foreground">
            A dense workspace view for the things you own or care for.
          </p>
        </div>
        <Link
          href="#first-entry-composer"
          className={buttonVariants({ variant: "outline", className: "w-fit" })}
        >
          <Plus className="size-4" aria-hidden="true" />
          {canWrite ? "Add object" : "Check write access"}
        </Link>
      </div>

      <ol className="divide-y divide-border overflow-hidden rounded-md border border-border">
        <li className="hidden grid-cols-5 gap-3 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground uppercase md:grid">
          <span>Object</span>
          <span>Context</span>
          <span>Entries</span>
          <span>Status</span>
          <span>Action</span>
        </li>
        {objects.map((object) => {
          const updateState = objectUpdateState(object, today);
          return (
            <li
              key={object.id}
              className="grid gap-3 px-3 py-3 md:grid-cols-5 md:items-center"
            >
              <div className="min-w-0">
                <Link
                  href={`/garden/objects/${object.id}`}
                  className="block truncate text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  {object.displayName}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {plantObjectKindLabel(object.objectKind)} ·{" "}
                  {object.spaceDisplayName}
                </p>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {objectCatalogSummary(object)}
              </p>
              <p className="text-sm text-foreground">
                {object.entryCount === 1
                  ? "1 entry"
                  : `${object.entryCount} entries`}
                <span className="block text-xs text-muted-foreground">
                  {objectPrivacySummary(object)}
                </span>
              </p>
              <p className="text-sm text-foreground">
                {updateState.label}
                <span className="block text-xs text-muted-foreground">
                  {updateState.detail}
                </span>
              </p>
              <Link
                href={
                  canWrite
                    ? `/garden/objects/${object.id}#follow-up-composer`
                    : `/garden/objects/${object.id}`
                }
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {canWrite ? "Add update/photo" : "View object"}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function WorkspaceQuickActions({
  canWrite,
  hasObjects,
  nextAction,
}: {
  canWrite: boolean;
  hasObjects: boolean;
  nextAction: WorkspaceNextAction;
}) {
  const primaryHref = canWrite ? nextAction.href : "#first-entry-composer";
  const primaryLabel = canWrite ? nextAction.label : "Check write access";

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground uppercase">
          Fast actions
        </p>
        <h2 className="text-base font-semibold text-foreground">
          Keep the record moving
        </h2>
      </div>
      <div className="flex flex-col gap-2">
        <Link
          href={primaryHref}
          className={buttonVariants({ className: "justify-start" })}
        >
          <Plus className="size-4" aria-hidden="true" />
          {primaryLabel}
        </Link>
        <Link
          href="#first-entry-composer"
          className={buttonVariants({
            variant: "outline",
            className: "justify-start",
          })}
        >
          <Sprout className="size-4" aria-hidden="true" />
          {canWrite ? "Add object" : "Invite details"}
        </Link>
        {hasObjects ? (
          <Link
            href="#space-journals"
            className={buttonVariants({
              variant: "outline",
              className: "justify-start",
            })}
          >
            <BookOpen className="size-4" aria-hidden="true" />
            {canWrite ? "Space journal" : "Read space timeline"}
          </Link>
        ) : null}
        {hasObjects && canWrite ? (
          <Link
            href={nextAction.href}
            className={buttonVariants({
              variant: "outline",
              className: "justify-start",
            })}
          >
            <Camera className="size-4" aria-hidden="true" />
            Attach update photo
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function RecentActivityPanel({ items }: { items: RecentActivityItem[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground uppercase">
          Recent activity
        </p>
        <h2 className="text-base font-semibold text-foreground">
          Journal timeline
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-3 text-sm leading-6 text-muted-foreground">
          No dated activity yet. The first saved entry will appear here.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0"
            >
              <Link
                href={item.href}
                className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
              >
                {item.title}
              </Link>
              <p className="text-xs leading-5 text-muted-foreground">
                {item.context} · {formatDate(item.date)}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.scopeLabel} · {item.privacyLabel}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SpaceTimelinePanel({
  canWrite,
  timeline,
  today,
}: {
  canWrite: boolean;
  timeline: SpaceJournalTimeline;
  today: string;
}) {
  const clientMutationId = crypto.randomUUID();

  return (
    <section
      id={`space-${timeline.space.id}`}
      className="grid gap-4 rounded-lg border border-border p-4"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-foreground">
          {timeline.space.display_name}
        </h3>
        <p className="text-sm text-muted-foreground">
          {timeline.objects.length === 1
            ? "1 object in this space."
            : `${timeline.objects.length} objects in this space.`}
        </p>
      </div>

      {canWrite && timeline.objects.length > 0 ? (
        <form action={createSpaceJournalEntryAction} className="grid gap-3">
          <input type="hidden" name="spaceId" value={timeline.space.id} />
          <input
            type="hidden"
            name="clientMutationId"
            value={clientMutationId}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-foreground">Title</span>
              <input
                name="title"
                required
                maxLength={140}
                placeholder="What changed across this space?"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-foreground">Date</span>
              <input
                type="date"
                name="entryDate"
                defaultValue={today}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">Note</span>
            <textarea
              name="body"
              required
              maxLength={2000}
              rows={4}
              placeholder="Write the story once, then attach the objects it mentions."
              className="rounded-md border border-input bg-background px-3 py-2 text-sm leading-6"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">Tags / topics</span>
            <input
              name="topicTags"
              maxLength={160}
              placeholder="watering, pests, seedlings"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-foreground">
              Mentioned objects
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {timeline.objects.map((object) => (
                <label
                  key={object.id}
                  className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="mentionedPlantObjectIds"
                    value={object.id}
                    className="mt-1 size-4 rounded border-border"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">
                      {object.displayName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {plantObjectKindLabel(object.objectKind)} ·{" "}
                      {object.varietyText
                        ? `${catalogIdentityLabel(
                            object.catalogKind,
                            object.objectKind,
                          )}: ${object.varietyText}`
                        : "Unknown"}{" "}
                      · {varietyStateLabel(object.varietyState)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            className="inline-flex w-fit items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Save space entry
          </button>
        </form>
      ) : null}

      <div className="grid gap-3">
        <h4 className="text-sm font-semibold text-foreground">
          Space timeline
        </h4>
        {timeline.entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No space-level entries yet.
          </p>
        ) : (
          <ol className="grid gap-3">
            {timeline.entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-border p-4"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <h5 className="text-base font-semibold text-foreground">
                    {entry.title}
                  </h5>
                  <time className="text-xs text-muted-foreground">
                    {formatDate(entry.entry_date)}
                  </time>
                </div>
                <p className="mt-3 text-sm leading-6 whitespace-pre-wrap text-foreground">
                  {entry.body}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {entryScopeLabel(entry.entry_scope)} ·{" "}
                  {entryPrivacyLabel({
                    visibility: entry.visibility,
                    isArchived: entry.lifecycle_state === "archived",
                  })}
                  {entry.mentionedObjects.length > 0
                    ? ` · Mentions ${entry.mentionedObjects
                        .map((object) => object.displayName)
                        .join(", ")}`
                    : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

async function resolveInitialCatalogSelection(
  searchParams: GardenSearchParams,
): Promise<FirstEntryCatalogSelection | null> {
  const publicSlug = normalizeFirstParam(searchParams.catalog);
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
  const publicSlug = normalizeFirstParam(searchParams.wishlist);
  if (!publicSlug) return null;

  const item = await findSelectableCatalogItemByPublicSlug(publicSlug);
  if (!item?.publicSlug) return null;

  return item;
}

function PendingWishlistIntentPanel({
  item,
  locale,
}: {
  item: Awaited<ReturnType<typeof resolvePendingWishlistSelection>>;
  locale: InterfaceLocale;
}) {
  if (!item?.publicSlug) return null;

  return (
    <section className="grid gap-3 rounded-lg border border-border p-4">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          Save for later
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Add {item.canonicalName} to your wishlist without creating a garden
          object yet.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
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
          <button
            type="submit"
            className={buttonVariants({ className: "w-fit" })}
          >
            Save to wishlist
          </button>
        </form>
        <Link
          href={gardenFirstEntryPreselectionPath(item.publicSlug)}
          className={buttonVariants({
            variant: "outline",
            className: "w-fit",
          })}
        >
          Start first entry
        </Link>
      </div>
    </section>
  );
}

function engagementAuthPrompt(value: string | string[] | undefined) {
  const intent = normalizeFirstParam(value);
  if (intent === "comment-auth") {
    return "Sign in to comment on that public page.";
  }
  if (intent === "bookmark-auth") {
    return "Sign in to bookmark that public page.";
  }
  return null;
}

function normalizeGardenReturnToParam(value: string | string[] | undefined) {
  const raw = normalizeFirstParam(value);
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

function normalizeFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return typeof value === "string" ? value.trim() : "";
}

function summarizeWorkspace(
  objects: PlantObjectSummary[],
  spaceTimelines: SpaceJournalTimeline[],
  today: string,
): WorkspaceStats {
  return {
    objectCount: objects.length,
    objectEntryCount: objects.reduce(
      (count, object) => count + object.entryCount,
      0,
    ),
    publicEntryCount:
      objects.reduce((count, object) => count + object.publicEntryCount, 0) +
      spaceTimelines.reduce(
        (count, timeline) =>
          count +
          timeline.entries.filter(
            (entry) =>
              entry.visibility === "public" &&
              entry.lifecycle_state === "active",
          ).length,
        0,
      ),
    needsUpdateCount: objects.filter((object) =>
      isObjectUpdateDue(object, today),
    ).length,
    spaceCount: spaceTimelines.length,
    spaceEntryCount: spaceTimelines.reduce(
      (count, timeline) => count + timeline.entries.length,
      0,
    ),
  };
}

function chooseWorkspaceNextAction(
  objects: PlantObjectSummary[],
  today: string,
): WorkspaceNextAction {
  if (objects.length === 0) {
    return {
      title: "Start with one living object",
      description:
        "Create the first private record before the workspace asks for anything else.",
      href: "#first-entry-composer",
      label: "Start first object",
    };
  }

  const objectNeedingUpdate =
    objects
      .filter((object) => isObjectUpdateDue(object, today))
      .sort(compareObjectsByOldestUpdate)[0] ?? null;
  const object = objectNeedingUpdate ?? objects[0];

  if (object.entryCount === 0) {
    return {
      title: `Finish first note for ${object.displayName}`,
      description:
        "This object exists, but it still needs a dated observation to become useful later.",
      href: `/garden/objects/${object.id}#follow-up-composer`,
      label: "Add first note",
      object,
    };
  }

  return {
    title: objectNeedingUpdate
      ? `Update ${object.displayName}`
      : `Continue ${object.displayName}`,
    description: objectNeedingUpdate
      ? "The last direct object update is old enough that a fresh note would make this record more useful."
      : "The workspace is current; add the next change when something observable happens.",
    href: `/garden/objects/${object.id}#follow-up-composer`,
    label: "Add update",
    object,
  };
}

function buildRecentActivityItems(
  entries: JournalEntry[],
  objects: PlantObjectSummary[],
  spaceTimelines: SpaceJournalTimeline[],
): RecentActivityItem[] {
  const objectsById = new Map(objects.map((object) => [object.id, object]));
  const spacesById = new Map(
    spaceTimelines.map((timeline) => [
      timeline.space.id,
      timeline.space.display_name,
    ]),
  );

  return entries.map((entry) => {
    const object = entry.plant_object_id
      ? objectsById.get(entry.plant_object_id)
      : null;
    const spaceName = spacesById.get(entry.space_id) ?? "Garden space";

    return {
      id: entry.id,
      title: entry.title,
      href: object
        ? `/garden/objects/${object.id}`
        : `/garden#space-${entry.space_id}`,
      context: object ? object.displayName : spaceName,
      date: entry.entry_date,
      scopeLabel: entryScopeLabel(entry.entry_scope),
      privacyLabel: entryPrivacyLabel({
        visibility: entry.visibility,
        isArchived: entry.lifecycle_state === "archived",
      }),
    };
  });
}

function objectCatalogSummary(object: PlantObjectSummary) {
  const identity = object.varietyText
    ? `${catalogIdentityLabel(object.catalogKind, object.objectKind)}: ${
        object.varietyText
      }`
    : "Unknown catalog match";

  return `${identity} · ${varietyStateLabel(object.varietyState)}`;
}

function objectPrivacySummary(object: PlantObjectSummary) {
  if (object.publicEntryCount > 0) {
    return `${object.publicEntryCount} public · ${object.privateEntryCount} private`;
  }

  return "Private record";
}

function objectUpdateState(object: PlantObjectSummary, today: string) {
  if (object.entryCount === 0 || !object.latestEntryDate) {
    return {
      label: "Needs first note",
      detail: "No direct entries yet",
    };
  }

  const daysSinceUpdate = daysBetween(object.latestEntryDate, today);
  if (daysSinceUpdate > 14) {
    return {
      label: "Needs current note",
      detail: `Last update ${formatRelativeDays(daysSinceUpdate)}`,
    };
  }

  return {
    label: "Current",
    detail: `Last update ${formatRelativeDays(daysSinceUpdate)}`,
  };
}

function isObjectUpdateDue(object: PlantObjectSummary, today: string) {
  if (object.entryCount === 0 || !object.latestEntryDate) return true;
  return daysBetween(object.latestEntryDate, today) > 14;
}

function compareObjectsByOldestUpdate(
  left: PlantObjectSummary,
  right: PlantObjectSummary,
) {
  return (
    entryTimestamp(left.latestEntryDate) - entryTimestamp(right.latestEntryDate)
  );
}

function daysBetween(left: Date | string, right: Date | string) {
  const leftDate = parseDateOnly(left);
  const rightDate = parseDateOnly(right);
  const diffMs = rightDate.getTime() - leftDate.getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

function parseDateOnly(value: Date | string) {
  if (value instanceof Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

function entryTimestamp(value: Date | string | null) {
  if (!value) return 0;
  return parseDateOnly(value).getTime();
}

function formatRelativeDays(days: number) {
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
