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
import {
  hasCurrentOnlineJournalProtocol,
  JOURNAL_ENTRY_PAYLOAD_MAX_BYTES,
  legacyClientRetiredResponse,
} from "@/lib/garden/entry-contracts";
import { buildSaveProgressReadbackUrl } from "@/lib/garden/save-progress-moment";
import { INTERFACE_LOCALE_REQUEST_HEADER } from "@/lib/interface-localization";
import { preciseLocationRejectionMessage } from "@/lib/privacy/precise-location-copy";
import { isPreciseLocationTextError } from "@/lib/privacy/precise-location-text";
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
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import {
  BoundedJsonPayloadTooLargeError,
  readBoundedJsonRequest,
} from "@/server/bounded-json-request";
import type { RequestScope } from "@/server/request-scope";
import { scheduleLearningAttributionDrain } from "@/server/mvp-learning/attribution-after-response";
import {
  createFirstPlantEntry,
  createPlantObjectJournalEntry,
  createSpaceJournalEntry,
  findJournalEntryReceiptByClientMutationId,
} from "@/server/journal-repository";
import {
  AuthenticationRequiredError,
  requireCurrentRequestScope,
} from "@/server/auth-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return privateNoStore(await getEntryReceipt(request));
}

async function getEntryReceipt(request: Request) {
  try {
    const scope = await requireCurrentRequestScope();
    const clientMutationId = new URL(request.url).searchParams
      .get("clientMutationId")
      ?.trim();
    if (!clientMutationId || clientMutationId.length > 200) {
      return Response.json(
        { code: "journal_entry_receipt_invalid" },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const entry = await findJournalEntryReceiptByClientMutationId(
      scope,
      clientMutationId,
    );
    return Response.json(
      entry ? { entry } : { code: "journal_entry_receipt_not_found" },
      {
        status: entry ? 200 : 404,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return Response.json(
        { code: "AUTHENTICATION_REQUIRED" },
        { status: 401, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return Response.json(
      { code: "journal_entry_receipt_unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export async function POST(request: Request) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromRequest(request),
  });
  if (admission.status === "rejected") {
    return privateNoStore(documentMutationAdmissionResponse(admission));
  }
  const scope: RequestScope = admission.scope;
  if (!hasCurrentOnlineJournalProtocol(request)) {
    return privateNoStore(legacyClientRetiredResponse());
  }
  return privateNoStore(await createEntry(request, scope));
}

async function createEntry(request: Request, scope: RequestScope) {
  let body: Partial<FirstPlantEntryRequest> | null;
  try {
    body = (await readBoundedJsonRequest(
      request,
      JOURNAL_ENTRY_PAYLOAD_MAX_BYTES,
    )) as Partial<FirstPlantEntryRequest>;
  } catch (error) {
    if (error instanceof BoundedJsonPayloadTooLargeError) {
      return Response.json(
        { code: "JOURNAL_ENTRY_TOO_LARGE" },
        { status: 413 },
      );
    }
    body = null;
  }

  if (!body) {
    return Response.json(
      { error: "Entry payload is required." },
      { status: 400 },
    );
  }

  // The positive protocol marker is the primary cutoff. Keep the legacy
  // offline replay state closed as a redundant safety boundary even if a
  // retired client copies the current marker.
  if (body.syncStatus === "offline_synced") {
    return legacyClientRetiredResponse();
  }

  try {
    const syncStatus = normalizeSyncStatus(body.syncStatus);
    const activationSource = normalizeActivationSource(body.activationSource);
    const target = normalizeTarget(body.target, body.plantObjectId);

    if (target === "space_entry") {
      const result = await createSpaceJournalEntry(scope, {
        spaceId: body.spaceId ?? "",
        mentionedPlantObjectIds: body.mentionedPlantObjectIds ?? [],
        title: body.title ?? "",
        body: body.body ?? "",
        contentDocument: body.contentDocument,
        entryDate: body.entryDate ?? "",
        clientMutationId: body.clientMutationId ?? "",
        mediaAssetId: body.mediaAssetId ?? "",
        cover: body.cover ?? null,
        topicTags: body.topicTags ?? [],
      });

      scheduleLearningAttributionDrain(async () => {
        await recordSpaceEntryEvents(scope, result, syncStatus);
      });

      const anchorObject = result.mentionedObjects[0];
      if (!anchorObject) {
        return Response.json(
          { error: "Space entry requires at least one mentioned object." },
          { status: 400 },
        );
      }

      revalidatePath("/garden");
      for (const object of result.mentionedObjects) {
        revalidatePath(`/garden/objects/${object.id}`);
      }

      const response: FirstPlantEntryResponse = {
        space: {
          id: result.space.id,
          displayName: result.space.display_name,
          locationVisibility: result.space.location_visibility,
          coarseRegionCode: result.space.coarse_region_code,
        },
        plantObject: {
          id: anchorObject.id,
          displayName: anchorObject.displayName,
          objectKind: "plant",
          catalogItemId: null,
          varietyText: null,
          varietyState: "unknown",
          locationVisibility: result.space.location_visibility,
          coarseRegionCode: result.space.coarse_region_code,
        },
        entry: {
          id: result.entry.id,
          title: result.entry.title,
          body: result.entry.body,
          entryDate: normalizeResponseDate(result.entry.entry_date),
          clientMutationId: result.entry.client_mutation_id,
          journalRevision: Number(result.entry.journal_revision ?? 1),
        },
        readbackUrl: buildSaveProgressReadbackUrl("/garden", "space-entry"),
      };
      return Response.json(response);
    }

    const result =
      target === "plant_object_entry"
        ? await createPlantObjectJournalEntry(scope, {
            plantObjectId: body.plantObjectId ?? "",
            title: body.title ?? "",
            body: body.body ?? "",
            contentDocument: body.contentDocument,
            entryDate: body.entryDate ?? "",
            clientMutationId: body.clientMutationId ?? "",
            mediaAssetId: body.mediaAssetId ?? "",
            cover: body.cover ?? null,
            mentionSelections: body.mentionSelections ?? [],
            topicTags: body.topicTags ?? [],
          })
        : await createFirstPlantEntry(scope, {
            spaceId: body.spaceId ?? "",
            spaceName: body.spaceName ?? "",
            plantName: body.plantName ?? "",
            objectKind: body.objectKind ?? "",
            catalogItemId: body.catalogItemId ?? "",
            userAddedCatalogName: body.userAddedCatalogName ?? "",
            varietyText: body.varietyText ?? "",
            title: body.title ?? "",
            body: body.body ?? "",
            contentDocument: body.contentDocument,
            entryDate: body.entryDate ?? "",
            locationVisibility: body.locationVisibility ?? "",
            coarseRegionCode: body.coarseRegionCode ?? "",
            clientMutationId: body.clientMutationId ?? "",
            mediaAssetId: body.mediaAssetId ?? "",
            cover: body.cover ?? null,
            mentionSelections: body.mentionSelections ?? [],
            topicTags: body.topicTags ?? [],
          });
    const objectReadbackPath = `/garden/objects/${result.plantObject.id}`;
    const readbackUrl = buildSaveProgressReadbackUrl(
      objectReadbackPath,
      target === "plant_object_entry" ? "follow-up" : "first-entry",
    );
    const followUpValuePulse =
      target === "plant_object_entry" &&
      result.isNewEntry &&
      result.priorObjectEntryCount > 0
        ? { journalEntryId: result.entry.id }
        : null;

    scheduleLearningAttributionDrain(async () => {
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
    });

    revalidatePath("/garden");
    revalidatePath(objectReadbackPath);

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
        journalRevision: Number(result.entry.journal_revision ?? 1),
      },
      readbackUrl,
      followUpValuePulse,
    };

    return Response.json(response);
  } catch (error) {
    // OVE-234: a precise-location refusal answers with a stable code plus
    // localized guidance and never echoes the rejected text back.
    if (isPreciseLocationTextError(error)) {
      return Response.json(
        {
          error: preciseLocationRejectionMessage(
            error.surface,
            request.headers.get(INTERFACE_LOCALE_REQUEST_HEADER),
          ),
          code: error.code,
          surface: error.surface,
        },
        { status: 400 },
      );
    }
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Entry could not be saved.",
      },
      { status: 400 },
    );
  }
}

function privateNoStore(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
  if (target === "space_entry") return "space_entry" as const;
  if (target === "plant_object_entry" || typeof plantObjectId === "string") {
    return "plant_object_entry" as const;
  }
  return "first_plant_entry" as const;
}

async function recordSpaceEntryEvents(
  scope: RequestScope,
  result: Awaited<ReturnType<typeof createSpaceJournalEntry>>,
  syncStatus: EntrySyncStatus,
) {
  if (!result.isNewEntry) return;

  const properties = {
    entry_scope: result.entry.entry_scope as EntryScope,
    has_photo: false,
    is_backdated: isBackdatedEntryDate(result.entry.entry_date),
    location_visibility_level: result.space
      .location_visibility as LocationVisibility,
    sync_status: syncStatus,
  };
  const eventTarget = {
    spaceId: result.space.id,
    journalEntryId: result.entry.id,
  };

  await recordEntryLoggedEventSafely(scope, {
    properties,
    ...eventTarget,
  });
  await recordAnalyticsEventSafely(scope, {
    eventName: "progress_screen_shown",
    properties,
    ...eventTarget,
  });
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
