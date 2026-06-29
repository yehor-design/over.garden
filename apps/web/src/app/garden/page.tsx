import Link from "next/link";

import {
  activationSurfaceKindForSource,
  normalizeActivationSourceParam,
} from "@/lib/garden/activation";
import type { FirstEntryCatalogSelection } from "@/lib/garden/entry-contracts";
import { varietyStateLabel } from "@/lib/garden/pilot-ux-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { recordAnalyticsEventSafely } from "@/server/analytics-events";
import { findSelectableCatalogItemByPublicSlug } from "@/server/catalog-repository";
import { listMyPlantObjects } from "@/server/journal-repository";
import { resolvePilotWriteAccess } from "@/server/pilot-write-access";
import { scopedToUser } from "@/server/request-scope";
import { ClosedPilotWriteCallout } from "./closed-pilot-write-callout";
import { FirstEntryComposer } from "./first-entry-composer";
import { GardenAuthPanel } from "./garden-auth-panel";

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
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const writeAccess = scope
    ? await resolvePilotWriteAccess(scope)
    : { invited: false };
  const objects = scope ? await listMyPlantObjects(scope, 12) : [];
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
                ? "Continue the living record for plants you already started."
                : "Capture one real plant record with its place, object, and first dated note."}
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
        />
      ) : null}

      {userId ? (
        writeAccess.invited ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {hasObjects ? (
            <section className="flex flex-col gap-4 rounded-lg border border-border p-4 lg:col-span-2">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-foreground">
                  Continue a plant
                </h2>
                <p className="text-sm text-muted-foreground">
                  Open an existing object to add the next dated entry, including
                  recovery when the connection is unstable and an optional
                  photo.
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
                          {object.varietyText ?? "Unknown variety"} ·{" "}
                          {varietyStateLabel(object.varietyState)}
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
            className={`flex flex-col gap-4 rounded-lg border border-border p-4 ${
              hasObjects ? "" : "lg:col-span-2"
            }`}
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                {hasObjects ? "Start another plant" : "First plant entry"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {hasObjects
                  ? "Create a new object only when you are starting a new plant record."
                  : "Save the first plant note with a catalog match, your own variety name, or no match yet."}
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
              Plant objects
            </h2>
            {!hasObjects ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">
                No plant objects yet. Save the first entry to create one.
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
                        {object.spaceDisplayName}
                        {` · ${object.varietyText ?? "Unknown"}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
        ) : (
          <ClosedPilotWriteCallout />
        )
      ) : null}
    </main>
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
    locale: item.locale,
    status: item.status,
    source: item.source,
  };
}

function normalizeFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return typeof value === "string" ? value.trim() : "";
}
