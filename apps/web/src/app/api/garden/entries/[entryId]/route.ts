import { revalidatePath } from "next/cache";

import {
  ATOMIC_JOURNAL_EDIT_PROTOCOL,
  ATOMIC_JOURNAL_EDIT_PROTOCOL_HEADER,
  JOURNAL_ENTRY_PAYLOAD_MAX_BYTES,
  atomicJournalProtocolRequiredResponse,
  type AtomicJournalEditRequest,
  type AtomicJournalEditResponse,
} from "@/lib/garden/entry-contracts";
import {
  listJournalDocumentImageMediaIds,
  normalizeJournalDocumentOrThrow,
} from "@/lib/garden/journal-document";
import { normalizeJournalComposerReturnTo } from "@/lib/garden/journal-composer-return";
import { journalEntryDateInputValue } from "@/lib/garden/journal-entry-date";
import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import { bytesToBase64Url } from "@/lib/media/ephemeral-staging-contract";
import { stableJson } from "@/lib/media/ephemeral-staging-crypto";
import { localizedPath, PUBLIC_LOCALES } from "@/lib/public-localization";
import { getPublicDerivativeUrl } from "@/lib/storage";
import {
  claimedMediaFromPhotos,
  listClaimedPublicPaths,
} from "@/lib/media/claimed-media";
import {
  EPHEMERAL_MEDIA_MAX_OBJECTS_PER_PHOTO,
  EPHEMERAL_MEDIA_MAX_PER_SESSION,
  isEphemeralMediaPlaceholderDataUri,
} from "@/lib/media/ephemeral-staging-contract";
import {
  BoundedJsonPayloadTooLargeError,
  readBoundedJsonRequest,
} from "@/server/bounded-json-request";
import {
  JournalAggregateConflictError,
  readAtomicJournalEditBaseline,
  readCommittedAtomicJournalEdit,
  updateAtomicJournalEntry,
} from "@/server/journal-repository";
import {
  journalRevisionNumber,
  resolveJournalContentForWrite,
} from "@/server/journal-document-persistence";
import { recordComposerLearningSignalsSafely } from "@/server/mvp-learning/composer-signals";
import { scheduleLearningAttributionDrain } from "@/server/mvp-learning/attribution-after-response";
import {
  claimEphemeralPublicationMedia,
  finalizeEphemeralPublicationMedia,
  verifyEphemeralPublicationReceipts,
} from "@/server/media/ephemeral-publication-handoff";
import { validateAtomicJournalEditMediaPlan } from "@/server/atomic-journal-edit-contract";
import { convergePublicProjectionsNow } from "@/server/search/public-projection-outbox";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { publicEntryChangeTags } from "@/lib/public-cache-tags";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await context.params;
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    return privateNoStore(mutationScopeResponse(admission));
  }
  if (
    request.headers.get(ATOMIC_JOURNAL_EDIT_PROTOCOL_HEADER) !==
    ATOMIC_JOURNAL_EDIT_PROTOCOL
  ) {
    return privateNoStore(atomicJournalProtocolRequiredResponse());
  }

  let raw: unknown;
  try {
    raw = await readBoundedJsonRequest(
      request,
      JOURNAL_ENTRY_PAYLOAD_MAX_BYTES,
    );
  } catch (error) {
    if (error instanceof BoundedJsonPayloadTooLargeError) {
      return privateNoStore(
        Response.json({ code: "JOURNAL_ENTRY_TOO_LARGE" }, { status: 413 }),
      );
    }
    return privateNoStore(
      Response.json({ code: "atomic_edit_request_invalid" }, { status: 400 }),
    );
  }

  try {
    const body = parseAtomicJournalEditRequest(raw, entryId);
    const title = body.title.trim();
    const content = resolveJournalContentForWrite({
      contentDocument: normalizeJournalDocumentOrThrow(body.document),
      requireStructured: true,
    });
    const document = content.document;
    const finalMediaAssetIds = listJournalDocumentImageMediaIds(document);
    if (
      body.coverMediaAssetId &&
      !finalMediaAssetIds.includes(body.coverMediaAssetId)
    ) {
      finalMediaAssetIds.push(body.coverMediaAssetId);
    }
    const receiptSetDigest = await digestReceiptSet(body.newMediaClaimReceipts);
    const requestDigest = await atomicEditRequestDigest({
      ...body,
      title,
      document,
      receiptSetDigest,
    });
    const mutationPrefix = `atomic-edit:${body.clientMutationId}:`;
    const mutationReceiptId = `${mutationPrefix}${requestDigest}`;
    const replay = await readCommittedAtomicJournalEdit(admission.scope, {
      entryId,
      mutationPrefix,
      mutationReceiptId,
      expectedRevision: body.expectedRevision,
      title,
      entryDate: body.entryDate,
      document,
      coverMediaAssetId: body.coverMediaAssetId,
      finalMediaAssetIds,
      focalPoints: body.focalPoints,
      receiptSetDigest,
    });
    if (replay) {
      if (replay.finalizeHandoff) {
        await finalizeEphemeralPublicationMedia({
          ownerUserId: admission.scope.userId,
          publishId: entryId,
          ...replay.finalizeHandoff,
        });
      }
      await assertPublicMediaReady(replay.publicMedia);
      await convergeAndRevalidate(replay.entry);
      return privateNoStore(
        Response.json(buildAtomicEditResponse(request, body, replay)),
      );
    }

    const baseline = await readAtomicJournalEditBaseline(
      admission.scope,
      entryId,
    );
    const baselineRevision = journalRevisionNumber(
      baseline.entry.journal_revision,
    );
    if (baselineRevision !== body.expectedRevision) {
      throw new JournalAggregateConflictError(baselineRevision);
    }
    const verified =
      body.newMediaClaimReceipts.length === 0
        ? null
        : await verifyEphemeralPublicationReceipts({
            ownerUserId: admission.scope.userId,
            stagingReceipts: body.newMediaClaimReceipts,
          });
    const verifiedMedia = claimedMediaFromPhotos(verified?.photos ?? []);
    validateAtomicJournalEditMediaPlan({
      currentMedia: baseline.media,
      finalMediaAssetIds,
      retainedMediaAssetIds: body.retainedMediaAssetIds,
      removedMediaAssetIds: body.removedMediaAssetIds,
      claimedMedia: verifiedMedia,
      focalPoints: body.focalPoints,
    });

    const handoff = verified
      ? await claimEphemeralPublicationMedia({
          ownerUserId: admission.scope.userId,
          publishId: entryId,
          stagingSessionId: verified.stagingSessionId,
          stagingReceipts: body.newMediaClaimReceipts,
          orderedMediaAssetIds: verified.photos.map(
            (photo) => photo.primary.mediaAssetId,
          ),
        })
      : null;
    if (handoff) {
      for (const item of handoff.publicMedia) {
        item.placeholderDataUri =
          body.mediaPlaceholders?.[item.mediaAssetId] ?? null;
      }
    }
    const result = await updateAtomicJournalEntry(admission.scope, {
      entryId,
      mutationPrefix,
      mutationReceiptId,
      expectedRevision: body.expectedRevision,
      title,
      entryDate: body.entryDate,
      document,
      coverMediaAssetId: body.coverMediaAssetId,
      finalMediaAssetIds,
      retainedMediaAssetIds: body.retainedMediaAssetIds,
      removedMediaAssetIds: body.removedMediaAssetIds,
      focalPoints: body.focalPoints,
      handoff,
    });

    if (handoff) {
      await finalizeEphemeralPublicationMedia({
        ownerUserId: admission.scope.userId,
        publishId: entryId,
        stagingSessionId: handoff.stagingSessionId,
        receiptSetDigest: handoff.receiptSetDigest,
      });
    }
    await assertPublicMediaReady(result.publicMedia);
    if (!result.isReplay && result.learning) {
      scheduleLearningAttributionDrain(async () => {
        await recordComposerLearningSignalsSafely(admission.scope, {
          journalEntryId: result.entry.id,
          plantObjectId: result.entry.plant_object_id,
          spaceId: result.entry.space_id,
          document: result.learning!.document,
          coverSource: result.learning!.nextCoverSource,
          priorCoverSource: result.learning!.priorCoverSource,
          priorBlockOrderHash: result.learning!.priorBlockOrderHash,
          nextBlockOrderHash: result.learning!.nextBlockOrderHash,
          mutationOutcome: "succeeded",
        });
      });
    } else if (!result.isReplay) {
      scheduleLearningAttributionDrain();
    }
    await convergeAndRevalidate(result.entry);
    return privateNoStore(
      Response.json(buildAtomicEditResponse(request, body, result)),
    );
  } catch (error) {
    if (error instanceof JournalAggregateConflictError) {
      return privateNoStore(
        Response.json(
          {
            code: error.code,
            currentRevision: error.currentRevision,
          },
          { status: 409 },
        ),
      );
    }
    const code = safeAtomicEditErrorCode(error);
    return privateNoStore(
      Response.json({ code }, { status: atomicEditErrorStatus(code) }),
    );
  }
}

function parseAtomicJournalEditRequest(
  value: unknown,
  entryId: string,
): AtomicJournalEditRequest {
  if (!isRecord(value)) throw invalidRequest();
  const allowed = new Set([
    "publishId",
    "clientMutationId",
    "expectedRevision",
    "title",
    "entryDate",
    "document",
    "coverMediaAssetId",
    "newMediaClaimReceipts",
    "mediaPlaceholders",
    "retainedMediaAssetIds",
    "removedMediaAssetIds",
    "focalPoints",
    "returnTo",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw invalidRequest();
  }
  if (
    value.publishId !== entryId ||
    !isUuid(value.publishId) ||
    !isUuid(value.clientMutationId) ||
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 1 ||
    typeof value.title !== "string" ||
    value.title.trim().length === 0 ||
    value.title.length > 140 ||
    typeof value.entryDate !== "string" ||
    !isCalendarDate(value.entryDate) ||
    !isRecord(value.document) ||
    !(value.coverMediaAssetId === null || isUuid(value.coverMediaAssetId)) ||
    !validTokenList(value.newMediaClaimReceipts) ||
    !validPlaceholderMap(value.mediaPlaceholders) ||
    !validUuidList(value.retainedMediaAssetIds, 11) ||
    !validUuidList(value.removedMediaAssetIds, 11) ||
    !validFocalPoints(value.focalPoints) ||
    typeof value.returnTo !== "string" ||
    value.returnTo.length > 2_048
  ) {
    throw invalidRequest();
  }
  return value as unknown as AtomicJournalEditRequest;
}

async function atomicEditRequestDigest(
  input: AtomicJournalEditRequest & { receiptSetDigest: string | null },
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      stableJson({
        publishId: input.publishId,
        clientMutationId: input.clientMutationId,
        expectedRevision: input.expectedRevision,
        title: input.title,
        entryDate: input.entryDate,
        document: input.document,
        coverMediaAssetId: input.coverMediaAssetId,
        retainedMediaAssetIds: input.retainedMediaAssetIds,
        removedMediaAssetIds: input.removedMediaAssetIds,
        focalPoints: input.focalPoints,
        receiptSetDigest: input.receiptSetDigest,
      }),
    ),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

async function digestReceiptSet(receipts: readonly string[]) {
  if (receipts.length === 0) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(receipts.join("\0")),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

function buildAtomicEditResponse(
  request: Request,
  body: AtomicJournalEditRequest,
  result: {
    entry: {
      id: string;
      title: string;
      body: string;
      entry_date: Date | string;
      public_slug: string | null;
      journal_revision: number | string | null;
    };
    publicMedia: readonly { mediaAssetId: string; publicPath: string }[];
  },
): AtomicJournalEditResponse {
  if (!result.entry.public_slug) throw new Error("atomic_edit_incomplete");
  const cover =
    result.publicMedia.find(
      (media) => media.mediaAssetId === body.coverMediaAssetId,
    ) ??
    result.publicMedia[0] ??
    null;
  return {
    entryId: result.entry.id,
    slug: result.entry.public_slug,
    revision: Number(result.entry.journal_revision ?? 1),
    card: {
      entryId: result.entry.id,
      title: result.entry.title,
      bodyPreview: result.entry.body.slice(0, 240),
      entryDate: normalizeResponseDate(result.entry.entry_date),
      coverUrl: cover ? getPublicDerivativeUrl(cover.publicPath) : null,
      publicPath: publicJournalEntryPath(result.entry.public_slug),
    },
    returnTo: normalizeJournalComposerReturnTo(
      body.returnTo,
      "/garden",
      new URL(request.url).origin,
    ),
  };
}

async function assertPublicMediaReady(
  media: readonly {
    publicPath: string;
    variants?: readonly { publicPath: string }[];
  }[],
) {
  await Promise.all(
    listClaimedPublicPaths(media).map(async (publicPath) => {
      const response = await fetch(getPublicDerivativeUrl(publicPath), {
        method: "HEAD",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      if (
        !response.ok ||
        response.headers.get("content-type")?.split(";", 1)[0] !== "image/webp"
      ) {
        throw new Error("public_media_not_ready");
      }
    }),
  );
}

function validPlaceholderMap(value: unknown) {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= EPHEMERAL_MEDIA_MAX_PER_SESSION &&
    entries.every(
      ([mediaAssetId, placeholder]) =>
        isUuid(mediaAssetId) && isEphemeralMediaPlaceholderDataUri(placeholder),
    )
  );
}

async function convergeAndRevalidate(entry: {
  id: string;
  plant_object_id?: string | null;
  public_slug?: string | null;
}) {
  revalidatePath("/garden");
  if (entry.plant_object_id) {
    revalidatePath(`/garden/objects/${entry.plant_object_id}`);
  }
  revalidatePublicCacheTags(
    publicEntryChangeTags({
      entryId: entry.id,
      publicSlug: entry.public_slug,
      plantObjectId: entry.plant_object_id,
    }),
    "expire",
  );
  if (entry.public_slug) {
    const publicPath = publicJournalEntryPath(entry.public_slug);
    for (const locale of PUBLIC_LOCALES) {
      revalidatePath(localizedPath(locale, publicPath));
    }
  }
  await convergePublicProjectionsNow([entry.id]).catch(() => undefined);
}

function validTokenList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <=
      EPHEMERAL_MEDIA_MAX_PER_SESSION * EPHEMERAL_MEDIA_MAX_OBJECTS_PER_PHOTO &&
    value.every(
      (token) =>
        typeof token === "string" && token.length >= 40 && token.length <= 4096,
    )
  );
}

function validUuidList(value: unknown, max: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    new Set(value).size === value.length &&
    value.every(isUuid)
  );
}

function validFocalPoints(
  value: unknown,
): value is AtomicJournalEditRequest["focalPoints"] {
  if (!Array.isArray(value) || value.length > 11) return false;
  const seen = new Set<string>();
  return value.every((item) => {
    if (!isRecord(item)) return false;
    const keys = Object.keys(item).sort().join("\0");
    if (keys !== ["mediaAssetId", "x", "y"].sort().join("\0")) return false;
    if (!isUuid(item.mediaAssetId) || seen.has(item.mediaAssetId)) return false;
    seen.add(item.mediaAssetId);
    return (
      typeof item.x === "number" &&
      Number.isFinite(item.x) &&
      item.x >= 0 &&
      item.x <= 1 &&
      typeof item.y === "number" &&
      Number.isFinite(item.y) &&
      item.y >= 0 &&
      item.y <= 1
    );
  });
}

function invalidRequest() {
  return Object.assign(new Error("atomic_edit_request_invalid"), {
    code: "atomic_edit_request_invalid",
  });
}

function safeAtomicEditErrorCode(error: unknown) {
  const candidate =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : error instanceof Error
        ? error.message
        : null;
  const allowed = new Set([
    "atomic_edit_request_invalid",
    "atomic_edit_unavailable",
    "atomic_edit_incomplete",
    "idempotency_mismatch",
    "atomic_media_partition_mismatch",
    "atomic_media_claim_mismatch",
    "atomic_media_generation_mismatch",
    "atomic_media_focal_mismatch",
    "receipt_set_invalid",
    "receipt_invalid",
    "receipt_mismatch",
    "receipt_expired",
    "claim_timeout",
    "staging_request_timeout",
    "staging_request_unavailable",
    "public_object_collision",
    "public_media_not_ready",
  ]);
  return typeof candidate === "string" && allowed.has(candidate)
    ? candidate
    : "atomic_edit_failed";
}

function atomicEditErrorStatus(code: string) {
  if (code === "atomic_edit_request_invalid") return 400;
  if (code === "atomic_edit_unavailable") return 404;
  if (code === "public_object_collision") return 409;
  if (
    code === "idempotency_mismatch" ||
    code.includes("mismatch") ||
    code.includes("receipt")
  ) {
    return 409;
  }
  return 503;
}

function normalizeResponseDate(value: Date | string) {
  return journalEntryDateInputValue(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonth[month - 1]!;
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
