"use client";

import { ownerScopeHeaders } from "@/lib/auth/session-signal";
import {
  BoundedJsonResponseError,
  readBoundedJsonResponse,
} from "@/lib/bounded-json-response";
import type { LocalJournalMediaStager } from "@/lib/garden/local-journal-media-coordinator";
import {
  EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
  EPHEMERAL_MEDIA_SESSION_RENEW_AHEAD_SECONDS,
  EPHEMERAL_MEDIA_UPLOAD_DEADLINE_MS,
  EPHEMERAL_MEDIA_UPLOAD_HEADERS,
  ephemeralMediaUploadPath,
  isEphemeralMediaCapabilityToken,
  parseEphemeralMediaStagingSession,
  type EphemeralMediaStagingSession,
} from "./ephemeral-staging-contract";

const STAGING_PRODUCTION_ORIGIN = "https://media-stage.over.garden";
const SESSIONS_ROUTE = "/api/media/staging/sessions";

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

/**
 * The browser side of the OVE-372 session contract: one capability per
 * composer session from Vercel, then every upload and touch goes straight to
 * the Worker with it. The capability is fetched once when the composer
 * prepares the session and renewed a few minutes before it expires.
 */
export class BrowserEphemeralMediaStager implements LocalJournalMediaStager {
  private readonly uploadUrls = new Map<string, string>();
  private readonly sessions = new Map<
    string,
    { promise: Promise<EphemeralMediaStagingSession>; expiresAt: number }
  >();

  constructor(
    private readonly options: {
      fetcher?: typeof fetch;
      stagingOrigin?: string;
      uploadDeadlineMs?: number;
      controlDeadlineMs?: number;
      now?: () => number;
    },
  ) {}

  /** Fetches the session capability so the first photo makes no Vercel call. */
  async prepare(stagingSessionId: string): Promise<void> {
    await this.sessionCapability(stagingSessionId);
  }

  async stage(input: Parameters<LocalJournalMediaStager["stage"]>[0]) {
    if (input.blob.type !== "image/webp") {
      throw new EphemeralStagingClientError("staging_blob_invalid");
    }
    const stageController = linkedDeadlineController(
      input.signal,
      this.options.uploadDeadlineMs ?? EPHEMERAL_MEDIA_UPLOAD_DEADLINE_MS,
    );
    try {
      const session = await this.sessionCapability(input.stagingSessionId);
      const uploadUrl = new URL(
        ephemeralMediaUploadPath({
          stagingSessionId: input.stagingSessionId,
          mediaAssetId: input.mediaAssetId,
          generation: input.generation,
          variant: input.variant ?? 0,
        }),
        this.stagingOrigin,
      ).toString();
      const uploadResponse = await this.fetcher(uploadUrl, {
        method: "PUT",
        redirect: "error",
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        headers: {
          authorization: `Bearer ${session.sessionCapability}`,
          "content-type": "image/webp",
          [EPHEMERAL_MEDIA_UPLOAD_HEADERS.sha256]: input.sha256,
          [EPHEMERAL_MEDIA_UPLOAD_HEADERS.width]: String(input.width),
          [EPHEMERAL_MEDIA_UPLOAD_HEADERS.height]: String(input.height),
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

  /** Extends the session lease at the Worker (every five minutes while mounted). */
  async touch(stagingSessionId: string): Promise<void> {
    const session = await this.sessionCapability(stagingSessionId);
    const controller = linkedDeadlineController(
      null,
      this.options.controlDeadlineMs ?? EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
    );
    try {
      const response = await this.fetcher(
        new URL(`/v1/staging/${stagingSessionId}/touch`, this.stagingOrigin).toString(),
        {
          method: "POST",
          redirect: "error",
          mode: "cors",
          cache: "no-store",
          credentials: "omit",
          headers: { authorization: `Bearer ${session.sessionCapability}` },
          signal: controller.signal,
        },
      );
      const body = await boundedJson(response, 4_096);
      if (!response.ok) {
        throw new EphemeralStagingClientError(responseCode(body));
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new EphemeralStagingClientError("staging_touch_timeout");
      }
      throw error;
    } finally {
      controller.dispose();
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

  private sessionCapability(
    stagingSessionId: string,
  ): Promise<EphemeralMediaStagingSession> {
    const nowSeconds = Math.floor(this.now() / 1_000);
    const cached = this.sessions.get(stagingSessionId);
    if (
      cached &&
      cached.expiresAt - nowSeconds > EPHEMERAL_MEDIA_SESSION_RENEW_AHEAD_SECONDS
    ) {
      return cached.promise;
    }
    const promise = this.issueSession(stagingSessionId);
    // Until the route answers, the entry is optimistic; a refusal clears it so
    // the next upload asks again instead of failing forever.
    this.sessions.set(stagingSessionId, {
      promise,
      expiresAt: Number.POSITIVE_INFINITY,
    });
    promise.then(
      (session) =>
        this.sessions.set(stagingSessionId, {
          promise,
          expiresAt: session.expiresAt,
        }),
      () => {
        if (this.sessions.get(stagingSessionId)?.promise === promise) {
          this.sessions.delete(stagingSessionId);
        }
      },
    );
    return promise;
  }

  private async issueSession(
    stagingSessionId: string,
  ): Promise<EphemeralMediaStagingSession> {
    const controller = linkedDeadlineController(
      null,
      this.options.controlDeadlineMs ?? EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
    );
    try {
      const response = await this.fetcher(SESSIONS_ROUTE, {
        method: "POST",
        redirect: "error",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          ...ownerScopeHeaders(),
        },
        body: JSON.stringify({ stagingSessionId }),
        signal: controller.signal,
      });
      const body = await boundedJson(response, 8_192);
      if (!response.ok) {
        throw new EphemeralStagingClientError(responseCode(body));
      }
      const session = parseEphemeralMediaStagingSession(body, stagingSessionId);
      if (!session) {
        throw new EphemeralStagingClientError("staging_session_invalid");
      }
      return session;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new EphemeralStagingClientError("staging_session_timeout");
      }
      throw error;
    } finally {
      controller.dispose();
    }
  }

  private get fetcher() {
    return this.options.fetcher ?? fetch;
  }

  private get stagingOrigin() {
    return this.options.stagingOrigin ?? STAGING_PRODUCTION_ORIGIN;
  }

  private now() {
    return this.options.now?.() ?? Date.now();
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
  variant?: number;
}) {
  return `${input.stagingSessionId}:${input.mediaAssetId}:${input.generation}:${input.variant ?? 0}`;
}
