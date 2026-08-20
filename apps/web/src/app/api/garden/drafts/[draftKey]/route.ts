import {
  JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
  JOURNAL_ENTRY_PAYLOAD_MAX_BYTES,
  JOURNAL_DRAFT_REQUEST_MAX_BYTES,
  journalDraftPublicationBody,
  journalDraftPayloadSha256,
  journalEntryPayloadByteLength,
  type DeleteJournalEntryDraftRequestV1,
  type JournalEntryDraftContext,
  type JournalEntryDraftKind,
  type JournalEntryDraftPayloadV1,
  type SaveJournalEntryDraftRequestV1,
} from "@/lib/garden/entry-contracts";
import { normalizeJournalDocumentOrThrow } from "@/lib/garden/journal-document";
import { INTERFACE_LOCALE_REQUEST_HEADER } from "@/lib/interface-localization";
import { preciseLocationRejectionMessage } from "@/lib/privacy/precise-location-copy";
import {
  assertNoPreciseLocationTextInValues,
  isPreciseLocationTextError,
} from "@/lib/privacy/precise-location-text";
import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import {
  BoundedJsonInvalidError,
  BoundedJsonPayloadTooLargeError,
  readBoundedJsonRequest,
} from "@/server/bounded-json-request";
import {
  deleteJournalDraft,
  JournalDraftContextForbiddenError,
  readJournalDraft,
  saveJournalDraft,
  type DeleteJournalDraftResult,
  type SaveJournalDraftResult,
} from "@/server/journal-draft-repository";

export const runtime = "nodejs";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
const DRAFT_KINDS = new Set<JournalEntryDraftKind>([
  "first_entry",
  "follow_up",
  "space_entry",
  "edit_entry",
]);
const CREATE_REQUEST_KEYS = new Set([
  "target",
  "plantObjectId",
  "spaceId",
  "spaceName",
  "plantName",
  "objectKind",
  "catalogItemId",
  "userAddedCatalogName",
  "varietyText",
  "title",
  "body",
  "contentDocument",
  "expectedRevision",
  "entryDate",
  "locationVisibility",
  "coarseRegionCode",
  "clientMutationId",
  "mediaAssetId",
  "cover",
  "syncStatus",
  "activationSource",
  "mentionSelections",
  "topicTags",
  "mentionedPlantObjectIds",
]);
const EDIT_REQUEST_KEYS = new Set([
  "entryId",
  "title",
  "body",
  "contentDocument",
  "entryDate",
  "clientMutationId",
  "expectedRevision",
  "cover",
  "mentionSelections",
  "topicTags",
]);
const COMPOSER_STATE_KEYS = new Set([
  "catalogQuery",
  "selectedCatalogItem",
  "userAddedCatalogName",
  "topicTagInput",
]);

type RouteContext = { params: Promise<{ draftKey: string }> };

export async function GET(request: Request, context: RouteContext) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromRequest(request),
  });
  if (admission.status === "rejected") {
    return documentMutationAdmissionResponse(admission);
  }

  try {
    const { draftKey } = await context.params;
    assertDraftKey(draftKey);
    const draft = await readJournalDraft(admission.scope, draftKey);
    if (!draft) {
      return privateJson({ code: "JOURNAL_DRAFT_NOT_FOUND" }, 404);
    }
    return privateJson({ draft }, 200);
  } catch (error) {
    return safeDraftError(error, request);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromRequest(request),
  });
  if (admission.status === "rejected") {
    return documentMutationAdmissionResponse(admission);
  }

  try {
    const { draftKey } = await context.params;
    assertDraftKey(draftKey);
    const raw = await readBoundedJsonRequest(
      request,
      JOURNAL_DRAFT_REQUEST_MAX_BYTES,
    );
    const input = normalizeSaveRequest(raw);
    const computedHash = await journalDraftPayloadSha256(input.payload);
    if (computedHash !== input.payloadSha256) {
      return privateJson({ code: "JOURNAL_DRAFT_HASH_MISMATCH" }, 409);
    }
    const result = await saveJournalDraft(admission.scope, {
      draftKey,
      ...input,
    });
    return saveResultResponse(result);
  } catch (error) {
    return safeDraftError(error, request);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromRequest(request),
  });
  if (admission.status === "rejected") {
    return documentMutationAdmissionResponse(admission);
  }

  try {
    const { draftKey } = await context.params;
    assertDraftKey(draftKey);
    const input = normalizeDeleteRequest(
      await readBoundedJsonRequest(request, JOURNAL_DRAFT_REQUEST_MAX_BYTES),
    );
    const result = await deleteJournalDraft(admission.scope, draftKey, input);
    return deleteResultResponse(result);
  } catch (error) {
    return safeDraftError(error, request);
  }
}

function saveResultResponse(result: SaveJournalDraftResult) {
  if (result.outcome === "conflict") {
    return privateJson(
      {
        code: "JOURNAL_DRAFT_CONFLICT",
        reason: result.reason,
        current: result.current ? boundedReceipt(result.current) : null,
      },
      409,
    );
  }
  return privateJson(result, 200);
}

function deleteResultResponse(result: DeleteJournalDraftResult) {
  if (result.outcome === "not_found") {
    return privateJson({ code: "JOURNAL_DRAFT_NOT_FOUND" }, 404);
  }
  if (result.outcome === "conflict") {
    return privateJson(
      {
        code: "JOURNAL_DRAFT_CONFLICT",
        reason: result.reason,
        current: boundedReceipt(result.current),
      },
      409,
    );
  }
  return privateJson({ outcome: "deleted" }, 200);
}

function boundedReceipt(receipt: {
  generation: number;
  payloadSha256: string;
  serverRevision: number;
  updatedAt: string;
}) {
  return {
    generation: receipt.generation,
    payloadSha256: receipt.payloadSha256,
    serverRevision: receipt.serverRevision,
    updatedAt: receipt.updatedAt,
  };
}

function normalizeSaveRequest(input: unknown): SaveJournalEntryDraftRequestV1 {
  const record = objectRecord(input, "Journal draft payload is required.");
  assertAllowedKeys(record, [
    "draftKind",
    "context",
    "payload",
    "generation",
    "payloadSha256",
    "expectedServerRevision",
  ]);
  if (!DRAFT_KINDS.has(record.draftKind as JournalEntryDraftKind)) {
    throw new JournalDraftRequestError("Journal draft kind is invalid.");
  }
  const draftKind = record.draftKind as JournalEntryDraftKind;
  const context = normalizeContext(record.context);
  const payload = normalizePayload(record.payload, draftKind, context);
  const generation = positiveInteger(record.generation, "Draft generation");
  const payloadSha256 = payloadHash(record.payloadSha256);
  const expectedServerRevision =
    record.expectedServerRevision == null
      ? null
      : positiveInteger(record.expectedServerRevision, "Server revision");
  if (
    journalEntryPayloadByteLength(journalDraftPublicationBody(payload)) >
    JOURNAL_ENTRY_PAYLOAD_MAX_BYTES
  ) {
    throw new JournalDraftTooLargeError();
  }
  assertNoPreciseLocationTextInValues(stringValues(payload), "queue_payload");
  return {
    draftKind,
    context,
    payload,
    generation,
    payloadSha256,
    expectedServerRevision,
  };
}

function normalizeDeleteRequest(
  input: unknown,
): DeleteJournalEntryDraftRequestV1 {
  const record = objectRecord(
    input,
    "Journal draft delete receipt is required.",
  );
  assertAllowedKeys(record, [
    "generation",
    "payloadSha256",
    "expectedServerRevision",
  ]);
  return {
    generation: positiveInteger(record.generation, "Draft generation"),
    payloadSha256: payloadHash(record.payloadSha256),
    expectedServerRevision: positiveInteger(
      record.expectedServerRevision,
      "Server revision",
    ),
  };
}

function normalizePayload(
  input: unknown,
  draftKind: JournalEntryDraftKind,
  context: JournalEntryDraftContext,
): JournalEntryDraftPayloadV1 {
  const record = objectRecord(input, "Journal draft content is required.");
  assertAllowedKeys(record, [
    "schemaVersion",
    "draftKind",
    "request",
    "composerState",
  ]);
  if (
    record.schemaVersion !== JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION ||
    record.draftKind !== draftKind
  ) {
    throw new JournalDraftRequestError("Journal draft protocol is invalid.");
  }
  const request = objectRecord(
    record.request,
    "Journal draft request is invalid.",
  );
  assertAllowedKeys(
    request,
    draftKind === "edit_entry" ? EDIT_REQUEST_KEYS : CREATE_REQUEST_KEYS,
  );
  const composerState =
    record.composerState == null
      ? undefined
      : normalizeComposerState(record.composerState);
  const normalizedRequest = { ...request };
  if (request.contentDocument != null) {
    normalizedRequest.contentDocument = normalizeJournalDocumentOrThrow(
      request.contentDocument,
    );
  }
  assertString(normalizedRequest.clientMutationId, "Client mutation id", 200);
  if (normalizedRequest.title != null) {
    assertString(normalizedRequest.title, "Journal title", 140, true);
  }

  switch (draftKind) {
    case "first_entry":
      if (request.target !== "first_plant_entry") invalidContext();
      if (context.plantObjectId || context.journalEntryId) invalidContext();
      if (optionalUuid(request.spaceId) !== context.spaceId) {
        invalidContext();
      }
      break;
    case "follow_up":
      if (
        request.target !== "plant_object_entry" ||
        request.plantObjectId !== context.plantObjectId ||
        context.spaceId ||
        context.journalEntryId
      ) {
        invalidContext();
      }
      break;
    case "space_entry":
      if (
        request.target !== "space_entry" ||
        request.spaceId !== context.spaceId ||
        context.plantObjectId ||
        context.journalEntryId
      ) {
        invalidContext();
      }
      break;
    case "edit_entry":
      if (
        request.entryId !== context.journalEntryId ||
        context.spaceId ||
        context.plantObjectId
      ) {
        invalidContext();
      }
      break;
  }

  return {
    schemaVersion: JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
    draftKind,
    request: normalizedRequest,
    ...(composerState ? { composerState } : {}),
  } as JournalEntryDraftPayloadV1;
}

function normalizeContext(input: unknown): JournalEntryDraftContext {
  const record =
    input == null ? {} : objectRecord(input, "Draft context is invalid.");
  assertAllowedKeys(record, ["spaceId", "plantObjectId", "journalEntryId"]);
  return {
    spaceId: optionalUuid(record.spaceId),
    plantObjectId: optionalUuid(record.plantObjectId),
    journalEntryId: optionalUuid(record.journalEntryId),
  };
}

function normalizeComposerState(input: unknown) {
  const record = objectRecord(input, "Composer state is invalid.");
  assertAllowedKeys(record, COMPOSER_STATE_KEYS);
  return record;
}

function safeDraftError(error: unknown, request: Request) {
  if (
    error instanceof JournalDraftTooLargeError ||
    error instanceof BoundedJsonPayloadTooLargeError
  ) {
    return privateJson({ code: "JOURNAL_DRAFT_TOO_LARGE" }, 413);
  }
  if (isPreciseLocationTextError(error)) {
    return privateJson(
      {
        code: error.code,
        error: preciseLocationRejectionMessage(
          error.surface,
          request.headers.get(INTERFACE_LOCALE_REQUEST_HEADER),
        ),
      },
      400,
    );
  }
  if (error instanceof JournalDraftContextForbiddenError) {
    return privateJson({ code: "JOURNAL_DRAFT_CONTEXT_FORBIDDEN" }, 403);
  }
  if (
    error instanceof JournalDraftRequestError ||
    error instanceof BoundedJsonInvalidError
  ) {
    return privateJson({ code: "JOURNAL_DRAFT_INVALID" }, 400);
  }
  return privateJson({ code: "JOURNAL_DRAFT_UNAVAILABLE" }, 500);
}

function privateJson(body: unknown, status: number) {
  return Response.json(body, { status, headers: PRIVATE_NO_STORE });
}

function objectRecord(
  input: unknown,
  message: string,
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new JournalDraftRequestError(message);
  }
  return input as Record<string, unknown>;
}

function assertAllowedKeys(
  record: Record<string, unknown>,
  allowedInput: Iterable<string>,
) {
  const allowed = new Set(allowedInput);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new JournalDraftRequestError(
      "Journal draft contains unknown fields.",
    );
  }
}

function optionalUuid(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new JournalDraftRequestError("Journal draft context is invalid.");
  }
  return value.toLowerCase();
}

function positiveInteger(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new JournalDraftRequestError(`${label} is invalid.`);
  }
  return value;
}

function payloadHash(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new JournalDraftRequestError(
      "Journal draft payload hash is invalid.",
    );
  }
  return value;
}

function assertString(
  value: unknown,
  label: string,
  max: number,
  allowEmpty = false,
) {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.length < 1) ||
    value.length > max
  ) {
    throw new JournalDraftRequestError(`${label} is invalid.`);
  }
}

function assertDraftKey(value: unknown) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240) {
    throw new JournalDraftRequestError("Journal draft key is invalid.");
  }
}

function invalidContext(): never {
  throw new JournalDraftRequestError("Journal draft context is invalid.");
}

function* stringValues(value: unknown): Generator<string> {
  if (typeof value === "string") {
    yield value;
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) yield* stringValues(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      yield* stringValues(item);
    }
  }
}

class JournalDraftRequestError extends Error {}
class JournalDraftTooLargeError extends JournalDraftRequestError {}
