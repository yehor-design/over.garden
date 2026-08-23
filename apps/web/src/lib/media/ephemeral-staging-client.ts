"use client";

import { DOCUMENT_MUTATION_GENERATION_HEADER } from "@/lib/auth/document-mutation-generation-transport";
import {
  BoundedJsonResponseError,
  readBoundedJsonResponse,
} from "@/lib/bounded-json-response";
import type { LocalJournalMediaStager } from "@/lib/garden/local-journal-media-coordinator";
import {
  EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
  EPHEMERAL_MEDIA_UPLOAD_DEADLINE_MS,
} from "./ephemeral-staging-contract";

const STAGING_PRODUCTION_ORIGIN = "https://media-stage.over.garden";
const TOKEN = /^[A-Za-z0-9_.-]{40,4096}$/;

class EphemeralStagingClientError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "EphemeralStagingClientError";
  }
}

export class BrowserEphemeralMediaStager implements LocalJournalMediaStager {
  private readonly uploadUrls = new Map<string, string>();

  constructor(
    private readonly options: {
      documentMutationGeneration: string;
      fetcher?: typeof fetch;
      stagingOrigin?: string;
      uploadDeadlineMs?: number;
      controlDeadlineMs?: number;
    },
  ) {}

  async stage(input: Parameters<LocalJournalMediaStager["stage"]>[0]) {
    if (input.blob.type !== "image/webp") {
      throw new EphemeralStagingClientError("staging_blob_invalid");
    }
    const stageController = linkedDeadlineController(
      input.signal,
      this.options.uploadDeadlineMs ?? EPHEMERAL_MEDIA_UPLOAD_DEADLINE_MS,
    );
    try {
      const reservationResponse = await this.fetcher(
        "/api/media/staging/reservations",
        {
          method: "POST",
          redirect: "error",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "content-type": "application/json",
            [DOCUMENT_MUTATION_GENERATION_HEADER]:
              this.options.documentMutationGeneration,
          },
          body: JSON.stringify({
            stagingSessionId: input.stagingSessionId,
            mediaAssetId: input.mediaAssetId,
            generation: input.generation,
            sha256: input.sha256,
            sizeBytes: input.blob.size,
            width: input.width,
            height: input.height,
          }),
          signal: stageController.signal,
        },
      );
      const reservation = await boundedJson(reservationResponse, 8_192);
      if (!reservationResponse.ok) {
        throw new EphemeralStagingClientError(responseCode(reservation));
      }
      const validatedReservation = validateUploadReservation(reservation, {
        expectedOrigin: this.stagingOrigin,
        stagingSessionId: input.stagingSessionId,
        mediaAssetId: input.mediaAssetId,
        generation: input.generation,
      });
      const uploadUrl = validatedReservation.uploadUrl;
      const uploadResponse = await this.fetcher(uploadUrl, {
        method: "PUT",
        redirect: "error",
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        headers: {
          authorization: `Bearer ${validatedReservation.uploadCapability}`,
          "content-type": "image/webp",
          "content-sha256": input.sha256,
        },
        body: input.blob,
        signal: stageController.signal,
      });
      const uploaded = await boundedJson(uploadResponse, 8_192);
      if (!uploadResponse.ok) {
        throw new EphemeralStagingClientError(responseCode(uploaded));
      }
      if (
        !isRecord(uploaded) ||
        uploaded.status !== "staged" ||
        !validToken(uploaded.stagingReceipt) ||
        !validToken(uploaded.deleteCapability)
      ) {
        throw new EphemeralStagingClientError("staging_response_invalid");
      }
      this.uploadUrls.set(identityKey(input), uploadUrl);
      return {
        stagingReceipt: uploaded.stagingReceipt,
        deleteCapability: uploaded.deleteCapability,
      };
    } catch (error) {
      if (stageController.signal.aborted && !input.signal.aborted) {
        throw new EphemeralStagingClientError("staging_upload_timeout");
      }
      throw error;
    } finally {
      stageController.dispose();
    }
  }

  async delete(input: Parameters<LocalJournalMediaStager["delete"]>[0]) {
    if (!validToken(input.deleteCapability)) {
      throw new EphemeralStagingClientError("delete_capability_invalid");
    }
    const key = identityKey(input);
    const uploadUrl =
      this.uploadUrls.get(key) ??
      `${this.stagingOrigin}/v1/staging/${input.stagingSessionId}/${input.mediaAssetId}/${input.generation}`;
    const deleteController = linkedDeadlineController(
      null,
      this.options.controlDeadlineMs ?? EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
    );
    try {
      const response = await this.fetcher(uploadUrl, {
        method: "DELETE",
        redirect: "error",
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        headers: { authorization: `Bearer ${input.deleteCapability}` },
        signal: deleteController.signal,
      });
      const body = await boundedJson(response, 4_096);
      if (!response.ok) {
        throw new EphemeralStagingClientError(responseCode(body));
      }
      this.uploadUrls.delete(key);
    } catch (error) {
      if (deleteController.signal.aborted) {
        throw new EphemeralStagingClientError("staging_delete_timeout");
      }
      throw error;
    } finally {
      deleteController.dispose();
    }
  }

  private get fetcher() {
    return this.options.fetcher ?? fetch;
  }

  private get stagingOrigin() {
    return this.options.stagingOrigin ?? STAGING_PRODUCTION_ORIGIN;
  }
}

function validateUploadReservation(
  value: unknown,
  expected: {
    expectedOrigin: string;
    stagingSessionId: string;
    mediaAssetId: string;
    generation: number;
  },
) {
  if (
    !isRecord(value) ||
    !validToken(value.uploadCapability) ||
    typeof value.uploadUrl !== "string" ||
    !Number.isSafeInteger(value.expiresAt)
  ) {
    throw new EphemeralStagingClientError("staging_reservation_invalid");
  }
  let url: URL;
  let origin: URL;
  try {
    url = new URL(value.uploadUrl);
    origin = new URL(expected.expectedOrigin);
  } catch {
    throw new EphemeralStagingClientError("staging_reservation_invalid");
  }
  const exactPath = `/v1/staging/${expected.stagingSessionId}/${expected.mediaAssetId}/${expected.generation}`;
  if (
    url.origin !== origin.origin ||
    url.pathname !== exactPath ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new EphemeralStagingClientError("staging_reservation_invalid");
  }
  return {
    uploadUrl: url.toString(),
    uploadCapability: value.uploadCapability,
  };
}

function linkedDeadlineController(
  source: AbortSignal | null,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  source?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      source?.removeEventListener("abort", abort);
    },
  };
}

async function boundedJson(response: Response, maxBytes: number) {
  try {
    return await readBoundedJsonResponse(response, maxBytes);
  } catch (error) {
    if (
      error instanceof BoundedJsonResponseError &&
      error.code === "too_large"
    ) {
      throw new EphemeralStagingClientError("staging_response_too_large");
    }
    if (!(error instanceof BoundedJsonResponseError)) throw error;
    throw new EphemeralStagingClientError("staging_response_invalid");
  }
}

function responseCode(value: unknown) {
  return isRecord(value) && typeof value.code === "string"
    ? value.code
    : "staging_request_failed";
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function identityKey(input: {
  stagingSessionId: string;
  mediaAssetId: string;
  generation: number;
}) {
  return `${input.stagingSessionId}:${input.mediaAssetId}:${input.generation}`;
}
