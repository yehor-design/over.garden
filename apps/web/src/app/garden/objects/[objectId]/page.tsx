import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import type { LocationVisibility, VarietyState } from "@/db/schema";
import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import { getCoarseRegionLabel } from "@/lib/garden/regions";
import { FIRST_PUBLICATION_DISCLOSURE_VERSION } from "@/lib/privacy/disclosures";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { recordAnalyticsEventSafely } from "@/server/analytics-events";
import {
  getPlantObjectPage,
  type PlantObjectPage,
} from "@/server/journal-repository";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../../garden-auth-panel";
import {
  archiveJournalEntryAction,
  publishJournalEntryAction,
  resolvePlantObjectCatalogAction,
  updatePlantObjectLocationAction,
} from "./actions";
import { CatalogResolveControl } from "./catalog-resolve-control";
import { FollowUpEntryComposer } from "./follow-up-entry-composer";
import { LocationPrivacyControl } from "./location-privacy-control";

export const dynamic = "force-dynamic";

interface PlantObjectPageProps {
  params: Promise<{ objectId: string }>;
}

export default async function PlantObjectReadbackPage({
  params,
}: PlantObjectPageProps) {
  const { objectId } = await params;
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8">
        <header className="flex flex-col gap-2 border-b border-border pb-5">
          <Link href="/garden" className="text-sm text-muted-foreground">
            Garden journal
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Plant object
          </h1>
        </header>
        <GardenAuthPanel />
      </main>
    );
  }

  const scope = scopedToUser(userId, getSessionId(session));
  const page = await getPlantObjectPage(scope, objectId);
  if (!page) notFound();
  await recordOwnRecordRevisited(scope, page);

  const today = new Date().toISOString().slice(0, 10);
  const locationLabel = getObjectLocationLabel(page);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-4 border-b border-border pb-5">
        <Link
          href="/garden"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          Back to journal
        </Link>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            {page.space.display_name}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {page.plantObject.display_name}
          </h1>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {locationLabel}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Variety: {page.plantObject.variety_text ?? "Unknown"}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Catalog: {page.plantObject.variety_state}
            </span>
          </div>
        </div>
      </header>

      <LocationPrivacyControl
        objectId={objectId}
        currentLocationVisibility={page.plantObject.location_visibility}
        currentCoarseRegionCode={page.plantObject.coarse_region_code}
        action={updatePlantObjectLocationAction}
      />

      {canResolveCatalogState(page.plantObject.variety_state) ? (
        <CatalogResolveControl
          objectId={page.plantObject.id}
          currentVarietyText={page.plantObject.variety_text}
          currentVarietyState={page.plantObject.variety_state as VarietyState}
          action={resolvePlantObjectCatalogAction}
        />
      ) : null}

      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            Add dated entry
          </h2>
          <p className="text-sm text-muted-foreground">
            Keep this object history in one place.
          </p>
        </div>

        <FollowUpEntryComposer
          objectId={objectId}
          today={today}
          initialClientMutationId={crypto.randomUUID()}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            Journal entries
          </h2>
          <p className="text-sm text-muted-foreground">
            {page.entries.length === 1
              ? "1 entry saved for this object."
              : `${page.entries.length} entries saved for this object.`}
          </p>
        </div>

        {page.entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No entries for this object yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {page.entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-border p-4"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <h3 className="text-base font-semibold text-foreground">
                    {entry.title}
                  </h3>
                  <time className="text-xs text-muted-foreground">
                    {formatDate(entry.entry_date)}
                  </time>
                </div>
                <p className="mt-3 text-sm leading-6 whitespace-pre-wrap text-foreground">
                  {entry.body}
                </p>
                {entry.media ? (
                  <Image
                    src={entry.media.publicUrl}
                    alt={`${entry.title} photo`}
                    width={960}
                    height={540}
                    sizes="(min-width: 640px) 36rem, 100vw"
                    unoptimized
                    className="mt-4 aspect-video w-full max-w-xl rounded-md border border-border object-cover"
                  />
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  {entry.entry_scope} · {entry.visibility} ·{" "}
                  {entry.lifecycle_state}
                  {entry.media ? " · stripped photo derivative" : ""}
                  {entry.public_gone_at ? " · public URL gone" : ""}
                </p>
                {entry.lifecycle_state === "archived" ? (
                  <div className="mt-4 flex flex-col gap-1 border-t border-border pt-3">
                    <span className="text-sm font-medium text-muted-foreground">
                      Archived privately
                    </span>
                    {entry.public_gone_at ? (
                      <span className="text-xs text-muted-foreground">
                        The previous public URL now returns 410 Gone.
                      </span>
                    ) : null}
                  </div>
                ) : entry.visibility === "public" && entry.public_slug ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">
                      Public · noindex
                    </span>
                    <Link
                      href={publicJournalEntryPath(entry.public_slug)}
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Open public page
                    </Link>
                    <form
                      action={archiveJournalEntryAction}
                      className="flex w-full flex-col gap-3 pt-1"
                    >
                      <input type="hidden" name="entryId" value={entry.id} />
                      <input type="hidden" name="objectId" value={objectId} />
                      <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                        <input
                          type="checkbox"
                          name="archiveAccepted"
                          required
                          className="mt-1 size-4 rounded border-border"
                        />
                        <span>
                          Archive this entry privately and make its public URL
                          return 410 Gone.
                        </span>
                      </label>
                      <button
                        type="submit"
                        className={buttonVariants({
                          variant: "destructive",
                          className: "self-start",
                        })}
                      >
                        Archive public entry
                      </button>
                    </form>
                  </div>
                ) : (
                  <form
                    action={publishJournalEntryAction}
                    className="mt-4 flex flex-col gap-3 border-t border-border pt-3"
                  >
                    <input type="hidden" name="entryId" value={entry.id} />
                    <input type="hidden" name="objectId" value={objectId} />
                    <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                      <input
                        type="checkbox"
                        name="publicationDisclosureAccepted"
                        required
                        className="mt-1 size-4 rounded border-border"
                      />
                      <span>
                        Publish this entry as a public, noindex page under
                        disclosure {FIRST_PUBLICATION_DISCLOSURE_VERSION}. Only
                        the stripped photo derivative can appear publicly;
                        precise location and the original photo file stay
                        private.{" "}
                        <Link
                          href="/first-publication-disclosure"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          Read disclosure
                        </Link>
                        .
                      </span>
                    </label>
                    <button
                      type="submit"
                      className={buttonVariants({ className: "self-start" })}
                    >
                      Publish entry
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

async function recordOwnRecordRevisited(
  scope: Parameters<typeof getPlantObjectPage>[0],
  page: PlantObjectPage,
) {
  const latestEntry = page.entries[0];
  if (!latestEntry) return;

  await recordAnalyticsEventSafely(scope, {
    eventName: "own_record_revisited",
    properties: {
      followed_by_action: false,
      location_visibility_level: page.plantObject
        .location_visibility as LocationVisibility,
      variety_state: page.plantObject.variety_state as VarietyState,
    },
    spaceId: page.space.id,
    plantObjectId: page.plantObject.id,
    journalEntryId: latestEntry.id,
  });
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function canResolveCatalogState(value: string) {
  return value === "unknown" || value === "user_added";
}

function getObjectLocationLabel(page: PlantObjectPage) {
  if (page.plantObject.location_visibility !== "region") {
    return "Location: Hidden";
  }

  return `Region: ${
    getCoarseRegionLabel(page.plantObject.coarse_region_code) ??
    "Unsupported region"
  }`;
}
