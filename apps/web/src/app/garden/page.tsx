import Link from "next/link";

import {
  activationSurfaceKindForSource,
  normalizeActivationSourceParam,
} from "@/lib/garden/activation";
import { isFacebookSignInEnabled } from "@/lib/auth/facebook-oauth";
import { isGoogleSignInEnabled } from "@/lib/auth/google-oauth";
import { oauthErrorRecoveryMessage } from "@/lib/auth/social-oauth";
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
import {
  listMyPlantObjects,
  listMySpaceJournalTimelines,
  type SpaceJournalTimeline,
} from "@/server/journal-repository";
import { resolvePilotWriteAccess } from "@/server/pilot-write-access";
import { scopedToUser } from "@/server/request-scope";
import { ClosedPilotWriteCallout } from "./closed-pilot-write-callout";
import { createSpaceJournalEntryAction } from "./actions";
import { GardenDraftResumePanel } from "./draft-resume-panel";
import { FirstEntryComposer } from "./first-entry-composer";
import { GardenAuthPanel, SocialAccountLinkPanel } from "./garden-auth-panel";

export const dynamic = "force-dynamic";

type GardenSearchParams = Record<string, string | string[] | undefined>;
const EMPTY_GARDEN_SEARCH_PARAMS: GardenSearchParams = {};

interface GardenPageProps {
  searchParams?: Promise<GardenSearchParams>;
}

export default async function GardenPage({ searchParams }: GardenPageProps) {
  const [session, params] = await Promise.all([
    getCurrentSession(),
    searchParams ?? Promise.resolve(EMPTY_GARDEN_SEARCH_PARAMS),
  ]);
  const userId = session?.user?.id;
  const initialCatalogItem = await resolveInitialCatalogSelection(params);
  const activationSource = normalizeActivationSourceParam(params.source, {
    hasResolvedCatalogSelection: Boolean(initialCatalogItem),
  });
  const facebookSignInEnabled = isFacebookSignInEnabled();
  const googleSignInEnabled = isGoogleSignInEnabled();
  const oauthMessage = oauthErrorRecoveryMessage(params.error);
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const writeAccess = scope
    ? await resolvePilotWriteAccess(scope)
    : { invited: false };
  const objects = scope ? await listMyPlantObjects(scope, 12) : [];
  const spaceTimelines = scope ? await listMySpaceJournalTimelines(scope) : [];
  const hasObjects = objects.length > 0;
  const today = new Date().toISOString().slice(0, 10);

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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-2 border-b border-border pb-5">
        <p className="text-sm font-medium text-muted-foreground">OverGarden</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Garden journal
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {hasObjects
                ? "Continue the living record for objects you already started."
                : "Capture one real living record with its place, object, and first dated note."}
            </p>
          </div>
          {session?.user?.email ? (
            <p className="text-sm text-muted-foreground">
              {session.user.email}
            </p>
          ) : null}
        </div>
      </header>

      {!userId ? (
        <GardenAuthPanel
          activationSource={activationSource}
          catalogName={initialCatalogItem?.displayName}
          facebookSignInEnabled={facebookSignInEnabled}
          googleSignInEnabled={googleSignInEnabled}
          initialMessage={oauthMessage}
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
        writeAccess.invited ? (
          <>
            <GardenDraftResumePanel />
            <div className="grid gap-6 lg:grid-cols-3">
              {hasObjects ? (
                <section className="flex flex-col gap-4 rounded-lg border border-border p-4 lg:col-span-2">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-semibold text-foreground">
                      Continue an object
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Open an existing object to add the next dated entry,
                      including recovery when the connection is unstable and an
                      optional photo.
                    </p>
                  </div>

                  <ul className="grid gap-3 sm:grid-cols-2">
                    {objects.map((object) => (
                      <li key={object.id}>
                        <Link
                          href={`/garden/objects/${object.id}`}
                          className="flex h-full flex-col justify-between gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-muted/60"
                        >
                          <span className="flex flex-col gap-1">
                            <span className="text-base font-semibold text-foreground">
                              {object.displayName}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {object.spaceDisplayName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {plantObjectKindLabel(object.objectKind)} ·{" "}
                              {object.varietyText
                                ? `${catalogIdentityLabel(
                                    object.catalogKind,
                                    object.objectKind,
                                  )}: ${object.varietyText}`
                                : "Unknown catalog match"}{" "}
                              · {varietyStateLabel(object.varietyState)}
                            </span>
                          </span>
                          <span className="text-sm font-medium text-primary">
                            Add follow-up
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section
                id="first-entry-composer"
                className={`flex flex-col gap-4 rounded-lg border border-border p-4 ${
                  hasObjects ? "" : "lg:col-span-2"
                }`}
              >
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold text-foreground">
                    {hasObjects ? "Start another object" : "First entry"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {hasObjects
                      ? "Create a new object only when you are starting a separate living record."
                      : "Save the first note with a catalog match, your own catalog name, or no match yet."}
                  </p>
                </div>

                <FirstEntryComposer
                  key={initialCatalogItem?.id ?? "first-entry"}
                  today={today}
                  initialClientMutationId={crypto.randomUUID()}
                  initialCatalogItem={initialCatalogItem}
                  activationSource={activationSource}
                />
              </section>

              <aside className="flex flex-col gap-3">
                <h2 className="text-base font-semibold text-foreground">
                  Living objects
                </h2>
                {!hasObjects ? (
                  <p className="rounded-lg border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">
                    No living objects yet. Save the first entry to create one.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {objects.map((object) => (
                      <li key={object.id}>
                        <Link
                          href={`/garden/objects/${object.id}`}
                          className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/60"
                        >
                          <span className="block text-sm font-medium text-foreground">
                            {object.displayName}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {plantObjectKindLabel(object.objectKind)} ·{" "}
                            {object.spaceDisplayName}
                            {` · ${
                              object.varietyText
                                ? `${catalogIdentityLabel(object.catalogKind)}: ${
                                    object.varietyText
                                  }`
                                : "Unknown"
                            }`}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </div>

            {hasObjects ? (
              <section className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold text-foreground">
                    Space journals
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Write one dated story for a whole space and mention the
                    objects it covers.
                  </p>
                </div>

                <div className="grid gap-4">
                  {spaceTimelines.map((timeline) => (
                    <SpaceTimelinePanel
                      key={timeline.space.id}
                      timeline={timeline}
                      today={today}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <ClosedPilotWriteCallout />
        )
      ) : null}
    </main>
  );
}

function SpaceTimelinePanel({
  timeline,
  today,
}: {
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

      {timeline.objects.length > 0 ? (
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

function normalizeFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return typeof value === "string" ? value.trim() : "";
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
