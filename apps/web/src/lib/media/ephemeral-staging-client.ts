"use client";

import { ownerScopeHeaders } from "@/lib/auth/session-signal";
import {
  BoundedJsonResponseError,
  readBoundedJsonResponse,
} from "@/lib/bounded-json-response";
import type { LocalJournalMediaStager } from "@/lib/garden/local-journal-media-coordinator";
import {
  EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
  EPHEMERAL_MEDIA_UPLOAD_DEADLINE_MS,
  ephemeralMediaUploadPath,
  isEphemeralMediaCapabilityToken,
  parseEphemeralMediaUploadReservation,
} from "./ephemeral-staging-contract";

const STAGING_PRODUCTION_ORIGIN = "https://media-stage.over.garden";

export class EphemeralStagingClientError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "EphemeralStagingClientError";
  }
}

/**
 * Returns the bounded refusal class of a staging failure, so a caller can record
 * why a handoff was refused instead of discarding the reason. Anything that is
 * not a staging refusal reports `staging_unexpected_error` rather than leaking a
 * message that may carry a URL, a capability, or user content.
 */
export function ephemeralStagingFailureCode(error: unknown): string {
  return error instanceof EphemeralStagingClientError
    ? error.code
    : "staging_unexpected_error";
}

export class BrowserEphemeralMediaStager implements LocalJournalMediaStager {
  private readonly uploadUrls = new Map<string, string>();

  constructor(
    private readonly options: {
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
            ...ownerScopeHeaders(),
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
      const validatedReservation = parseEphemeralMediaUploadReservation(
        reservation,
        {
          expectedOrigin: this.stagingOrigin,
          binding: {
            stagingSessionId: input.stagingSessionId,
            mediaAssetId: input.mediaAssetId,
            generation: input.generation,
          },
          nowSeconds: Math.floor(Date.now() / 1_000),
        },
      );
      if (!validatedReservation) {
        throw new EphemeralStagingClientError("staging_reservation_invalid");
      }
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
        !isEphemeralMediaCapabilityToken(uploaded.stagingReceipt) ||
        !isEphemeralMediaCapabilityToken(uploaded.deleteCapability)
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
    if (!isEphemeralMediaCapabilityToken(input.deleteCapability)) {
      throw new EphemeralStagingClientError("delete_capability_invalid");
    }
    const key = identityKey(input);
    const uploadUrl =
      this.uploadUrls.get(key) ??
      new URL(
        ephemeralMediaUploadPath({
          stagingSessionId: input.stagingSessionId,
          mediaAssetId: input.mediaAssetId,
          generation: input.generation,
        }),
        this.stagingOrigin,
      ).toString();
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
