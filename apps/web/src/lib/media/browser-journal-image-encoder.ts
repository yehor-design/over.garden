"use client";

import type {
  EncodedJournalImage,
  LocalJournalImageEncoder,
} from "@/lib/garden/local-journal-media-coordinator";
import {
  assertClientFinalWebp,
  CLIENT_WEBP_ENCODE_TIMEOUT_MS,
} from "./client-webp-policy";
import type {
  JournalImageEncoderResponseMessage,
  JournalImageEncoderStartMessage,
} from "./journal-image-encoder-protocol";

export interface JournalImageEncoderWorker {
  postMessage(message: JournalImageEncoderStartMessage): void;
  terminate(): void;
  addEventListener(
    type: "message" | "error",
    listener: EventListenerOrEventListenerObject,
  ): void;
  removeEventListener(
    type: "message" | "error",
    listener: EventListenerOrEventListenerObject,
  ): void;
}

class BrowserJournalImageEncoderError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "BrowserJournalImageEncoderError";
  }
}

export class BrowserJournalImageEncoder implements LocalJournalImageEncoder {
  constructor(
    private readonly options: {
      createWorker?: () => JournalImageEncoderWorker;
      timeoutMs?: number;
    } = {},
  ) {}

  encode(input: Parameters<LocalJournalImageEncoder["encode"]>[0]) {
    return new Promise<EncodedJournalImage>((resolve, reject) => {
      if (input.signal.aborted) {
        reject(new BrowserJournalImageEncoderError("encode_cancelled"));
        return;
      }
      const worker = this.options.createWorker?.() ?? createEncoderWorker();
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeout);
        input.signal.removeEventListener("abort", onAbort);
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onWorkerError);
        worker.terminate();
      };
      const finish = (
        outcome:
          | { type: "resolve"; value: EncodedJournalImage }
          | { type: "reject"; error: BrowserJournalImageEncoderError },
      ) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (outcome.type === "resolve") resolve(outcome.value);
        else reject(outcome.error);
      };
      const onAbort = () =>
        finish({
          type: "reject",
          error: new BrowserJournalImageEncoderError("encode_cancelled"),
        });
      const onWorkerError = () =>
        finish({
          type: "reject",
          error: new BrowserJournalImageEncoderError("encode_worker_failed"),
        });
      const onMessage = (event: Event) => {
        const message = (event as MessageEvent<JournalImageEncoderResponseMessage>)
          .data;
        if (
          !message ||
          message.mediaAssetId !== input.mediaAssetId ||
          message.generation !== input.generation
        ) {
          return;
        }
        if (message.type === "phase") {
          input.onPhase(message.phase);
          return;
        }
        if (message.type === "preview") {
          input.onPreview?.({
            blob: new Blob([message.bytes], { type: "image/webp" }),
            width: message.width,
            height: message.height,
          });
          return;
        }
        if (message.type === "error") {
          finish({
            type: "reject",
            error: new BrowserJournalImageEncoderError(message.code),
          });
          return;
        }
        try {
          assertClientFinalWebp({
            type: "image/webp",
            size: message.bytes.byteLength,
            width: message.width,
            height: message.height,
          });
          finish({
            type: "resolve",
            value: {
              blob: new Blob([message.bytes], { type: "image/webp" }),
              width: message.width,
              height: message.height,
              sha256: message.sha256,
              variants: (message.variants ?? []).map((variant) => ({
                longEdge: variant.longEdge,
                width: variant.width,
                height: variant.height,
                blob: new Blob([variant.bytes], { type: "image/webp" }),
                sha256: variant.sha256,
              })),
              placeholderDataUri: message.placeholderDataUri ?? null,
              sourceKind: message.sourceKind,
              lossless: message.lossless,
              quality: message.quality,
              codecPath: message.codecPath ?? "fallback",
              durationMs: message.durationMs,
            },
          });
        } catch {
          finish({
            type: "reject",
            error: new BrowserJournalImageEncoderError("encode_result_invalid"),
          });
        }
      };
      const timeout = setTimeout(
        () =>
          finish({
            type: "reject",
            error: new BrowserJournalImageEncoderError("encode_timeout"),
          }),
        this.options.timeoutMs ?? CLIENT_WEBP_ENCODE_TIMEOUT_MS,
      );
      input.signal.addEventListener("abort", onAbort, { once: true });
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onWorkerError);
      worker.postMessage({
        type: "start",
        mediaAssetId: input.mediaAssetId,
        generation: input.generation,
        source: input.source,
      });
    });
  }
}

function createEncoderWorker(): JournalImageEncoderWorker {
  return new Worker(
    new URL("../../workers/journal-image-encoder.worker.ts", import.meta.url),
    { type: "module", name: "journal-image-encoder" },
  );
}
