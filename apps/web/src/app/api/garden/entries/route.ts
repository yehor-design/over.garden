import { revalidatePath } from "next/cache";

import {
  activationSurfaceKindForSource,
  normalizeActivationSourceValue,
} from "@/lib/garden/activation";
import type {
  ActivationSource,
  FirstPlantEntryRequest,
  FirstPlantEntryResponse,
} from "@/lib/garden/entry-contracts";
import type {
  EntryScope,
  EntrySyncStatus,
  LocationVisibility,
  PlantObjectKind,
  VarietyState,
} from "@/db/schema";
import {
  isBackdatedEntryDate,
  recordAnalyticsEventSafely,
  recordEntryLoggedEventSafely,
} from "@/server/analytics-events";
import {
  PilotWriteAccessError,
  requireWriteEligibleRequestScope,
} from "@/server/pilot-write-access";
import type { RequestScope } from "@/server/request-scope";
import {
  createFirstPlantEntry,
  createPlantObjectJournalEntry,
} from "@/server/journal-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let scope: RequestScope;
  try {
    scope = await requireWriteEligibleRequestScope();
  } catch (error) {
    if (error instanceof PilotWriteAccessError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    return Response.json(
      { error: "Sign in to save an entry." },
      { status: 401 },
    );
  }

  const body = (await request
    .json()
    .catch(() => null)) as Partial<FirstPlantEntryRequest> | null;

  if (!body) {
    return Response.json(
      { error: "Entry payload is required." },
      { status: 400 },
    );
  }

  try {
    const syncStatus = normalizeSyncStatus(body.syncStatus);
    const activationSource = normalizeActivationSource(body.activationSource);
    const target = normalizeTarget(body.target, body.plantObjectId);
    const result =
      target === "plant_object_entry"
        ? await createPlantObjectJournalEntry(scope, {
            plantObjectId: body.plantObjectId ?? "",
            title: body.title ?? "",
            body: body.body ?? "",
            entryDate: body.entryDate ?? "",
            clientMutationId: body.clientMutationId ?? "",
            mediaAssetId: body.mediaAssetId ?? "",
            mentionSelections: body.mentionSelections ?? [],
          })
        : await createFirstPlantEntry(scope, {
            spaceName: body.spaceName ?? "",
            plantName: body.plantName ?? "",
            objectKind: body.objectKind ?? "",
            catalogItemId: body.catalogItemId ?? "",
            userAddedCatalogName: body.userAddedCatalogName ?? "",
            varietyText: body.varietyText ?? "",
            title: body.title ?? "",
            body: body.body ?? "",
            entryDate: body.entryDate ?? "",
            locationVisibility: body.locationVisibility ?? "",
            coarseRegionCode: body.coarseRegionCode ?? "",
            clientMutationId: body.clientMutationId ?? "",
            mediaAssetId: body.mediaAssetId ?? "",
            mentionSelections: body.mentionSelections ?? [],
          });
    const readbackUrl = `/garden/objects/${result.plantObject.id}`;
    const followUpValuePulse =
      target === "plant_object_entry" &&
      result.isNewEntry &&
      result.priorObjectEntryCount > 0
        ? { journalEntryId: result.entry.id }
        : null;

    if (target === "plant_object_entry") {
      await recordPlantObjectEntryEvents(scope, result, syncStatus);
    } else {
      await recordFirstPlantEntryEvents(
        scope,
        result,
        syncStatus,
        activationSource,
      );
    }

    revalidatePath("/garden");
    revalidatePath(readbackUrl);

    const response: FirstPlantEntryResponse = {
      space: {
        id: result.space.id,
        displayName: result.space.display_name,
        locationVisibility: result.space.location_visibility,
        coarseRegionCode: result.space.coarse_region_code,
      },
      plantObject: {
        id: result.plantObject.id,
        displayName: result.plantObject.display_name,
        objectKind: result.plantObject.object_kind as PlantObjectKind,
        catalogItemId: result.plantObject.catalog_item_id,
        varietyText: result.plantObject.variety_text,
        varietyState: result.plantObject.variety_state,
        locationVisibility: result.plantObject.location_visibility,
        coarseRegionCode: result.plantObject.coarse_region_code,
      },
      entry: {
        id: result.entry.id,
        title: result.entry.title,
        body: result.entry.body,
        entryDate: normalizeResponseDate(result.entry.entry_date),
        clientMutationId: result.entry.client_mutation_id,
      },
      readbackUrl,
      followUpValuePulse,
    };

    return Response.json(response);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Entry could not be saved.",
      },
      { status: 400 },
    );
  }
}

function normalizeResponseDate(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function normalizeSyncStatus(value: unknown): EntrySyncStatus {
  return value === "offline_synced" ? "offline_synced" : "online";
}

function normalizeActivationSource(value: unknown): ActivationSource | null {
  return normalizeActivationSourceValue(value);
}

function normalizeTarget(target: unknown, plantObjectId: unknown) {
  return target === "plant_object_entry" || typeof plantObjectId === "string"
    ? "plant_object_entry"
    : "first_plant_entry";
}

async function recordFirstPlantEntryEvents(
  scope: RequestScope,
  result: Awaited<ReturnType<typeof createFirstPlantEntry>>,
  syncStatus: EntrySyncStatus,
  activationSource: ActivationSource | null,
) {
  if (!result.isNewEntry) return;

  const activationProperties = activationSource
    ? {
        activation_source: activationSource,
        source_surface_kind: activationSurfaceKindForSource(activationSource),
      }
    : {};
  const sharedEntryProperties = {
    entry_scope: result.entry.entry_scope as EntryScope,
    has_photo: result.mediaAttached,
    is_backdated: isBackdatedEntryDate(result.entry.entry_date),
    location_visibility_level: result.plantObject
      .location_visibility as LocationVisibility,
    sync_status: syncStatus,
    variety_state: result.plantObject.variety_state as VarietyState,
    object_kind: result.plantObject.object_kind,
    ...activationProperties,
  };
  const eventTarget = {
    spaceId: result.space.id,
    plantObjectId: result.plantObject.id,
    journalEntryId: result.entry.id,
  };

  await recordAnalyticsEventSafely(scope, {
    eventName: "space_created",
    properties: {
      location_visibility_level: result.space
        .location_visibility as LocationVisibility,
    },
    spaceId: result.space.id,
  });
  await recordAnalyticsEventSafely(scope, {
    eventName: "object_created",
    properties: {
      location_visibility_level: result.plantObject
        .location_visibility as LocationVisibility,
      variety_state: result.plantObject.variety_state as VarietyState,
      object_kind: result.plantObject.object_kind,
    },
    spaceId: result.space.id,
    plantObjectId: result.plantObject.id,
  });
  await recordEntryLoggedEventSafely(scope, {
    properties: sharedEntryProperties,
    ...eventTarget,
  });

  if (result.mediaAttached) {
    await recordAnalyticsEventSafely(scope, {
      eventName: "entry_photo_attached",
      properties: sharedEntryProperties,
      ...eventTarget,
    });
  }

  if (syncStatus === "offline_synced") {
    await recordAnalyticsEventSafely(scope, {
      eventName: "offline_entry_queued",
      properties: {
        ...sharedEntryProperties,
        sync_status: "offline_queued",
      },
      ...eventTarget,
    });
    await recordAnalyticsEventSafely(scope, {
      eventName: "offline_entry_synced",
      properties: sharedEntryProperties,
      ...eventTarget,
    });
  }

  await recordAnalyticsEventSafely(scope, {
    eventName: "progress_screen_shown",
    properties: sharedEntryProperties,
    ...eventTarget,
  });
}

async function recordPlantObjectEntryEvents(
  scope: RequestScope,
  result: Awaited<ReturnType<typeof createPlantObjectJournalEntry>>,
  syncStatus: EntrySyncStatus,
) {
  if (!result.isNewEntry) return;

  const sharedEntryProperties = {
    entry_scope: result.entry.entry_scope as EntryScope,
    has_photo: result.mediaAttached,
    is_backdated: isBackdatedEntryDate(result.entry.entry_date),
    location_visibility_level: result.plantObject
      .location_visibility as LocationVisibility,
    sync_status: syncStatus,
    variety_state: result.plantObject.variety_state as VarietyState,
  };
  const eventTarget = {
    spaceId: result.space.id,
    plantObjectId: result.plantObject.id,
    journalEntryId: result.entry.id,
  };

  await recordEntryLoggedEventSafely(scope, {
    properties: sharedEntryProperties,
    ...eventTarget,
  });

  if (result.mediaAttached) {
    await recordAnalyticsEventSafely(scope, {
      eventName: "entry_photo_attached",
      properties: sharedEntryProperties,
      ...eventTarget,
    });
  }

  if (syncStatus === "offline_synced") {
    await recordAnalyticsEventSafely(scope, {
      eventName: "offline_entry_queued",
      properties: {
        ...sharedEntryProperties,
        sync_status: "offline_queued",
      },
      ...eventTarget,
    });
    await recordAnalyticsEventSafely(scope, {
      eventName: "offline_entry_synced",
      properties: sharedEntryProperties,
      ...eventTarget,
    });
  }

  await recordAnalyticsEventSafely(scope, {
    eventName: "progress_screen_shown",
    properties: sharedEntryProperties,
    ...eventTarget,
  });
}
