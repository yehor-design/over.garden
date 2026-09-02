import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  activationSurfaceKindForSource,
  normalizeActivationSourceValue,
} from "@/lib/garden/activation";
import type {
  ActivationSource,
  AtomicJournalCreateRequest,
  AtomicJournalCreateResponse,
} from "@/lib/garden/entry-contracts";
import {
  ATOMIC_JOURNAL_CREATE_PROTOCOL,
  ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER,
  JOURNAL_ENTRY_PAYLOAD_MAX_BYTES,
  atomicJournalProtocolRequiredResponse,
} from "@/lib/garden/entry-contracts";
import {
  listJournalDocumentImageMediaIds,
  normalizeJournalDocumentOrThrow,
} from "@/lib/garden/journal-document";
import {
  journalCreateReturnFallback,
  normalizeJournalComposerReturnTo,
} from "@/lib/garden/journal-composer-return";
import type { EntryScope, LocationVisibility, VarietyState } from "@/db/schema";
import {
  isBackdatedEntryDate,
  recordAnalyticsEventSafely,
  recordEntryLoggedEventSafely,
} from "@/server/analytics-events";
import {
  BoundedJsonPayloadTooLargeError,
  readBoundedJsonRequest,
} from "@/server/bounded-json-request";
import type { RequestScope } from "@/server/request-scope";
import { scheduleLearningAttributionDrain } from "@/server/mvp-learning/attribution-after-response";
import {
  atomicClientMutationId,
  createFirstPlantEntry,
  createPlantObjectJournalEntry,
  createSpaceJournalEntry,
  readCommittedAtomicJournalCreate,
} from "@/server/journal-repository";
import {
  claimEphemeralPublicationMedia,
  finalizeEphemeralPublicationMedia,
} from "@/server/media/ephemeral-publication-handoff";
import { bytesToBase64Url } from "@/lib/media/ephemeral-staging-contract";
import { stableJson } from "@/lib/media/ephemeral-staging-crypto";
import { getPublicDerivativeUrl } from "@/lib/storage";
import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { publicEntryChangeTags } from "@/lib/public-cache-tags";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";

class AtomicJournalCreateError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(code);
    this.name = "AtomicJournalCreateError";
  }
}

export async function POST(request: Request) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    return privateNoStore(mutationScopeResponse(admission));
  }
  const scope: RequestScope = admission.scope;
  if (
    request.headers.get(ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER) !==
    ATOMIC_JOURNAL_CREATE_PROTOCOL
  ) {
    return privateNoStore(atomicJournalProtocolRequiredResponse());
  }
  return privateNoStore(await createEntry(request, scope));
}

async function createEntry(request: Request, scope: RequestScope) {
  let raw: unknown;
  try {
    raw = await readBoundedJsonRequest(
      request,
      JOURNAL_ENTRY_PAYLOAD_MAX_BYTES,
    );
  } catch (error) {
    if (error instanceof BoundedJsonPayloadTooLargeError) {
      return Response.json(
        { code: "JOURNAL_ENTRY_TOO_LARGE" },
        { status: 413 },
      );
    }
    return Response.json({ code: "atomic_request_invalid" }, { status: 400 });
  }

  try {
    const body = parseAtomicJournalCreateRequest(raw);
    const document = normalizeJournalDocumentOrThrow(body.document);
    const inlineMediaAssetIds = listJournalDocumentImageMediaIds(document);
    const orderedMediaAssetIds = [...inlineMediaAssetIds];
    if (
      body.coverMediaAssetId &&
      !orderedMediaAssetIds.includes(body.coverMediaAssetId)
    ) {
      orderedMediaAssetIds.push(body.coverMediaAssetId);
    }
    if (orderedMediaAssetIds.length !== body.mediaClaimReceipts.length) {
      throw new AtomicJournalCreateError("atomic_media_set_mismatch", 400);
    }

    const replayReceiptSetDigest = await atomicReceiptSetDigest(
      body.mediaClaimReceipts,
    );
    const replayRequestDigest = await atomicRequestDigest({
      ...body,
      document,
      receiptSetDigest: replayReceiptSetDigest,
    });
    const replay = await readCommittedAtomicJournalCreate(scope, {
      publishId: body.publishId,
      clientMutationId: atomicClientMutationId({
        publishId: body.publishId,
        requestDigest: replayRequestDigest,
      }),
      orderedMediaAssetIds: inlineMediaAssetIds,
      coverMediaAssetId: body.coverMediaAssetId,
    });
    if (replay) {
      if (replay.finalizeHandoff) {
        await finalizeEphemeralPublicationMedia({
          ownerUserId: scope.userId,
          publishId: body.publishId,
          ...replay.finalizeHandoff,
        });
      }
      await assertPublicMediaReady(replay.publicMedia);
      revalidateAtomicCreatePaths(body, replay.entry.plant_object_id);
      return Response.json(
        buildAtomicCreateResponse({
          request,
          body,
          entry: replay.entry,
          publicMedia: replay.publicMedia,
          plantObjectId: replay.entry.plant_object_id,
        }),
      );
    }

    const handoff =
      orderedMediaAssetIds.length === 0
        ? null
        : await claimEphemeralPublicationMedia({
            ownerUserId: scope.userId,
            publishId: body.publishId,
            stagingReceipts: body.mediaClaimReceipts,
            orderedMediaAssetIds,
          });
    const requestDigest = await atomicRequestDigest({
      ...body,
      document,
      receiptSetDigest: handoff?.receiptSetDigest ?? null,
    });
    const atomicPublication = {
      publishId: body.publishId,
      requestDigest,
      disclosureAccepted: body.disclosureAccepted,
      coverMediaAssetId: body.coverMediaAssetId,
      handoff: handoff
        ? {
            stagingSessionId: handoff.stagingSessionId,
            receiptSetDigest: handoff.receiptSetDigest,
            publicMedia: handoff.publicMedia,
          }
        : null,
    };
    const clientMutationId = atomicClientMutationId(atomicPublication);
    const cover = body.coverMediaAssetId
      ? inlineMediaAssetIds.includes(body.coverMediaAssetId)
        ? ({
            mode: "explicit_inline",
            mediaAssetId: body.coverMediaAssetId,
          } as const)
        : ({ mode: "separate", mediaAssetId: body.coverMediaAssetId } as const)
      : ({ mode: "automatic" } as const);

    const result =
      body.context.target === "space_entry"
        ? await createSpaceJournalEntry(scope, {
            ...body.context,
            title: body.title,
            contentDocument: document,
            clientMutationId,
            cover,
            internalDeterministicIds: { entryId: body.publishId },
            atomicPublication,
          })
        : body.context.target === "plant_object_entry"
          ? await createPlantObjectJournalEntry(scope, {
              ...body.context,
              title: body.title,
              contentDocument: document,
              clientMutationId,
              cover,
              internalDeterministicIds: { entryId: body.publishId },
              atomicPublication,
            })
          : await createFirstPlantEntry(scope, {
              ...body.context,
              title: body.title,
              contentDocument: document,
              clientMutationId,
              cover,
              internalDeterministicIds: {
                entryId: body.publishId,
                spaceId: randomUUID(),
                plantObjectId: randomUUID(),
              },
              atomicPublication,
            });

    if (!result.entry.public_slug) {
      throw new AtomicJournalCreateError("atomic_commit_incomplete", 503);
    }
    if (handoff) {
      await finalizeEphemeralPublicationMedia({
        ownerUserId: scope.userId,
        publishId: body.publishId,
        stagingSessionId: handoff.stagingSessionId,
        receiptSetDigest: handoff.receiptSetDigest,
      });
      await assertPublicMediaReady(handoff.publicMedia);
    }

    const response = buildAtomicCreateResponse({
      request,
      body,
      entry: result.entry,
      publicMedia: handoff?.publicMedia ?? [],
      plantObjectId: "plantObject" in result ? result.plantObject.id : null,
    });

    scheduleLearningAttributionDrain(async () => {
      if (body.context.target === "space_entry") {
        await recordSpaceEntryEvents(
          scope,
          result as Awaited<ReturnType<typeof createSpaceJournalEntry>>,
        );
      } else if (body.context.target === "plant_object_entry") {
        await recordPlantObjectEntryEvents(
          scope,
          result as Awaited<ReturnType<typeof createPlantObjectJournalEntry>>,
        );
      } else {
        await recordFirstPlantEntryEvents(
          scope,
          result as Awaited<ReturnType<typeof createFirstPlantEntry>>,
          normalizeActivationSource(body.context.activationSource),
        );
      }
    });
    revalidateAtomicCreatePaths(
      body,
      "plantObject" in result ? result.plantObject.id : null,
    );
    revalidatePublicCacheTags(
      publicEntryChangeTags({
        entryId: result.entry.id,
        publicSlug: result.entry.public_slug,
        ownerUserId: scope.userId,
        plantObjectId: "plantObject" in result ? result.plantObject.id : null,
      }),
      "expire",
    );
    return Response.json(response);
  } catch (error) {
    const code = safeAtomicErrorCode(error);
    return Response.json({ code }, { status: errorStatus(error, code) });
  }
}

function parseAtomicJournalCreateRequest(
  value: unknown,
): AtomicJournalCreateRequest {
  if (!isRecord(value))
    throw new AtomicJournalCreateError("atomic_request_invalid", 400);
  const allowed = new Set([
    "publishId",
    "clientMutationId",
    "context",
    "title",
    "document",
    "coverMediaAssetId",
    "mediaClaimReceipts",
    "returnTo",
    "disclosureAccepted",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new AtomicJournalCreateError("atomic_request_invalid", 400);
  }
  if (
    !isUuid(value.publishId) ||
    !isUuid(value.clientMutationId) ||
    !isAtomicContext(value.context) ||
    typeof value.title !== "string" ||
    value.title.trim().length === 0 ||
    value.title.length > 140 ||
    !isRecord(value.document) ||
    !(value.coverMediaAssetId === null || isUuid(value.coverMediaAssetId)) ||
    !Array.isArray(value.mediaClaimReceipts) ||
    value.mediaClaimReceipts.length > 10 ||
    value.mediaClaimReceipts.some(
      (token) =>
        typeof token !== "string" || token.length < 40 || token.length > 4096,
    ) ||
    typeof value.returnTo !== "string" ||
    value.returnTo.length > 2_048 ||
    typeof value.disclosureAccepted !== "boolean"
  ) {
    throw new AtomicJournalCreateError("atomic_request_invalid", 400);
  }
  return value as unknown as AtomicJournalCreateRequest;
}

function isAtomicContext(
  value: unknown,
): value is AtomicJournalCreateRequest["context"] {
  if (!isRecord(value)) return false;
  if (value.target === "first_plant_entry") {
    return (
      hasOnlyKeys(value, [
        "target",
        "spaceId",
        "spaceName",
        "plantName",
        "objectKind",
        "catalogItemId",
        "userAddedCatalogName",
        "locationVisibility",
        "coarseRegionCode",
        "entryDate",
        "activationSource",
        "mentionSelections",
        "topicTags",
      ]) &&
      typeof value.plantName === "string" &&
      value.plantName.trim().length > 0 &&
      value.plantName.length <= 200 &&
      (isUuid(value.spaceId) ||
        (typeof value.spaceName === "string" &&
          value.spaceName.trim().length > 0 &&
          value.spaceName.length <= 200)) &&
      isOptionalNullableUuid(value, "spaceId") &&
      isOptionalNullableText(value, "spaceName", 200) &&
      isOptionalNullableEnum(value, "objectKind", ["plant", "animal"]) &&
      isOptionalNullableUuid(value, "catalogItemId") &&
      isOptionalNullableText(value, "userAddedCatalogName", 200) &&
      isOptionalNullableEnum(value, "locationVisibility", [
        "hidden",
        "region",
      ]) &&
      isOptionalNullableText(value, "coarseRegionCode", 32) &&
      isOptionalNullableDate(value, "entryDate") &&
      isOptionalNullableEnum(value, "activationSource", [
        "homepage",
        "public_variety",
        "direct_garden",
      ]) &&
      isOptionalMentionSelections(value.mentionSelections) &&
      isOptionalTopicTags(value.topicTags)
    );
  }
  if (value.target === "plant_object_entry") {
    return (
      hasOnlyKeys(value, [
        "target",
        "plantObjectId",
        "entryDate",
        "mentionSelections",
        "topicTags",
      ]) &&
      isUuid(value.plantObjectId) &&
      isOptionalNullableDate(value, "entryDate") &&
      isOptionalMentionSelections(value.mentionSelections) &&
      isOptionalTopicTags(value.topicTags)
    );
  }
  if (value.target === "space_entry") {
    return (
      hasOnlyKeys(value, [
        "target",
        "spaceId",
        "mentionedPlantObjectIds",
        "entryDate",
        "topicTags",
      ]) &&
      isUuid(value.spaceId) &&
      Array.isArray(value.mentionedPlantObjectIds) &&
      value.mentionedPlantObjectIds.length > 0 &&
      value.mentionedPlantObjectIds.length <= 12 &&
      new Set(value.mentionedPlantObjectIds).size ===
        value.mentionedPlantObjectIds.length &&
      value.mentionedPlantObjectIds.every(isUuid) &&
      isOptionalNullableDate(value, "entryDate") &&
      isOptionalTopicTags(value.topicTags)
    );
  }
  return false;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
) {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function isOptionalNullableUuid(value: Record<string, unknown>, key: string) {
  return !(key in value) || value[key] === null || isUuid(value[key]);
}

function isOptionalNullableText(
  value: Record<string, unknown>,
  key: string,
  maxLength: number,
) {
  return (
    !(key in value) ||
    value[key] === null ||
    (typeof value[key] === "string" && value[key].length <= maxLength)
  );
}

function isOptionalNullableEnum(
  value: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
) {
  return (
    !(key in value) ||
    value[key] === null ||
    (typeof value[key] === "string" && allowed.includes(value[key]))
  );
}

function isOptionalNullableDate(value: Record<string, unknown>, key: string) {
  return (
    !(key in value) ||
    value[key] === null ||
    (typeof value[key] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value[key]))
  );
}

function isOptionalMentionSelections(value: unknown) {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 12) return false;
  return value.every(
    (selection) =>
      isRecord(selection) &&
      hasOnlyKeys(selection, ["kind", "id", "label"]) &&
      ["own_object", "public_object", "public_handle", "catalog_item"].includes(
        String(selection.kind),
      ) &&
      typeof selection.id === "string" &&
      selection.id.length > 0 &&
      selection.id.length <= 120 &&
      typeof selection.label === "string" &&
      selection.label.length > 0 &&
      selection.label.length <= 120,
  );
}

function isOptionalTopicTags(value: unknown) {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= 5 &&
      value.every(
        (tag) => typeof tag === "string" && tag.length > 0 && tag.length <= 40,
      ))
  );
}

async function atomicRequestDigest(
  input: AtomicJournalCreateRequest & {
    receiptSetDigest: string | null;
  },
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      stableJson({
        publishId: input.publishId,
        clientMutationId: input.clientMutationId,
        context: input.context,
        title: input.title,
        document: input.document,
        coverMediaAssetId: input.coverMediaAssetId,
        receiptSetDigest: input.receiptSetDigest,
        disclosureAccepted: input.disclosureAccepted,
      }),
    ),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

async function atomicReceiptSetDigest(receipts: readonly string[]) {
  if (receipts.length === 0) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(receipts.join("\0")),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

function buildAtomicCreateResponse(input: {
  request: Request;
  body: AtomicJournalCreateRequest;
  entry: {
    id: string;
    title: string;
    body: string;
    entry_date: Date | string;
    public_slug: string | null;
    journal_revision: number | string | null;
  };
  publicMedia: readonly { mediaAssetId: string; publicPath: string }[];
  plantObjectId: string | null;
}): AtomicJournalCreateResponse {
  if (!input.entry.public_slug) {
    throw new AtomicJournalCreateError("atomic_commit_incomplete", 503);
  }
  const fallback = journalCreateReturnFallback({
    target: input.body.context.target,
    plantObjectId:
      input.body.context.target === "plant_object_entry"
        ? input.body.context.plantObjectId
        : input.plantObjectId,
  });
  const returnTo = normalizeJournalComposerReturnTo(
    input.body.returnTo,
    fallback,
    new URL(input.request.url).origin,
  );
  const coverMedia =
    input.publicMedia.find(
      (media) => media.mediaAssetId === input.body.coverMediaAssetId,
    ) ??
    input.publicMedia[0] ??
    null;
  return {
    entryId: input.entry.id,
    slug: input.entry.public_slug,
    revision: Number(input.entry.journal_revision ?? 1),
    card: {
      entryId: input.entry.id,
      title: input.entry.title,
      bodyPreview: input.entry.body.slice(0, 240),
      entryDate: normalizeResponseDate(input.entry.entry_date),
      coverUrl: coverMedia
        ? getPublicDerivativeUrl(coverMedia.publicPath)
        : null,
      publicPath: publicJournalEntryPath(input.entry.public_slug),
    },
    returnTo,
  };
}

function revalidateAtomicCreatePaths(
  body: AtomicJournalCreateRequest,
  createdPlantObjectId: string | null,
) {
  revalidatePath("/garden");
  const plantObjectId =
    body.context.target === "plant_object_entry"
      ? body.context.plantObjectId
      : createdPlantObjectId;
  if (plantObjectId) revalidatePath(`/garden/objects/${plantObjectId}`);
}

async function assertPublicMediaReady(
  media: readonly { publicPath: string }[],
) {
  await Promise.all(
    media.map(async ({ publicPath }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      try {
        const response = await fetch(getPublicDerivativeUrl(publicPath), {
          method: "HEAD",
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
        });
        if (
          !response.ok ||
          response.headers.get("content-type")?.split(";", 1)[0] !==
            "image/webp"
        ) {
          throw new AtomicJournalCreateError("public_media_not_ready", 503);
        }
      } finally {
        clearTimeout(timeout);
      }
    }),
  );
}

function safeAtomicErrorCode(error: unknown) {
  if (error instanceof AtomicJournalCreateError) return error.code;
  const candidate =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : error instanceof Error
        ? error.message
        : null;
  const allowed = new Set([
    "idempotency_mismatch",
    "atomic_media_set_mismatch",
    "atomic_cover_mismatch",
    "receipt_expired",
    "claim_timeout",
    "staging_request_timeout",
    "staging_request_unavailable",
    "public_media_not_ready",
    "First-publication disclosure must be accepted.",
  ]);
  return typeof candidate === "string" && allowed.has(candidate)
    ? candidate === "First-publication disclosure must be accepted."
      ? "first_publication_disclosure_required"
      : candidate
    : "atomic_publication_failed";
}

function errorStatus(error: unknown, code: string) {
  if (error instanceof AtomicJournalCreateError) return error.statusCode;
  const originalCode =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : null;
  if (
    code === "idempotency_mismatch" ||
    code.includes("receipt") ||
    (typeof originalCode === "string" && originalCode.includes("receipt"))
  ) {
    return 409;
  }
  if (code === "first_publication_disclosure_required") return 400;
  return 503;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function normalizeActivationSource(value: unknown): ActivationSource | null {
  return normalizeActivationSourceValue(value);
}

async function recordSpaceEntryEvents(
  scope: RequestScope,
  result: Awaited<ReturnType<typeof createSpaceJournalEntry>>,
) {
  if (!result.isNewEntry) return;

  const properties = {
    entry_scope: result.entry.entry_scope as EntryScope,
    has_photo: result.mediaAttached,
    is_backdated: isBackdatedEntryDate(result.entry.entry_date),
    location_visibility_level: result.space
      .location_visibility as LocationVisibility,
  };
  const eventTarget = {
    spaceId: result.space.id,
    journalEntryId: result.entry.id,
  };

  await recordEntryLoggedEventSafely(scope, {
    properties,
    ...eventTarget,
  });
  if (result.mediaAttached) {
    await recordAnalyticsEventSafely(scope, {
      eventName: "entry_photo_attached",
      properties,
      ...eventTarget,
    });
  }
  await recordAnalyticsEventSafely(scope, {
    eventName: "progress_screen_shown",
    properties,
    ...eventTarget,
  });
}

async function recordFirstPlantEntryEvents(
  scope: RequestScope,
  result: Awaited<ReturnType<typeof createFirstPlantEntry>>,
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

  await recordAnalyticsEventSafely(scope, {
    eventName: "progress_screen_shown",
    properties: sharedEntryProperties,
    ...eventTarget,
  });
}

async function recordPlantObjectEntryEvents(
  scope: RequestScope,
  result: Awaited<ReturnType<typeof createPlantObjectJournalEntry>>,
) {
  if (!result.isNewEntry) return;

  const sharedEntryProperties = {
    entry_scope: result.entry.entry_scope as EntryScope,
    has_photo: result.mediaAttached,
    is_backdated: isBackdatedEntryDate(result.entry.entry_date),
    location_visibility_level: result.plantObject
      .location_visibility as LocationVisibility,
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

  await recordAnalyticsEventSafely(scope, {
    eventName: "progress_screen_shown",
    properties: sharedEntryProperties,
    ...eventTarget,
  });
}
