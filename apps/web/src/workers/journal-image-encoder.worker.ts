/// <reference lib="webworker" />

import { encodeJournalImage } from "@/lib/media/journal-image-codec";
import type {
  JournalImageEncoderErrorMessage,
  JournalImageEncoderPhaseMessage,
  JournalImageEncoderPreviewMessage,
  JournalImageEncoderResultMessage,
  JournalImageEncoderStartMessage,
} from "@/lib/media/journal-image-encoder-protocol";

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener(
  "message",
  (event: MessageEvent<JournalImageEncoderStartMessage>) => {
    if (event.data?.type !== "start") return;
    void encode(event.data);
  },
);

async function encode(input: JournalImageEncoderStartMessage) {
  const startedAt = performance.now();
  try {
    const result = await encodeJournalImage(input.source, {
      onPhase: (phase) => {
        const message: JournalImageEncoderPhaseMessage = {
          type: "phase",
          mediaAssetId: input.mediaAssetId,
          generation: input.generation,
          phase,
        };
        workerScope.postMessage(message);
      },
      onPreview: (preview) => {
        const message: JournalImageEncoderPreviewMessage = {
          type: "preview",
          mediaAssetId: input.mediaAssetId,
          generation: input.generation,
          ...preview,
        };
        workerScope.postMessage(message, [message.bytes]);
      },
    });
    const message: JournalImageEncoderResultMessage = {
      type: "result",
      mediaAssetId: input.mediaAssetId,
      generation: input.generation,
      ...result,
      durationMs: Math.round(performance.now() - startedAt),
    };
    workerScope.postMessage(message, [
      message.bytes,
      ...message.variants.map((variant) => variant.bytes),
    ]);
  } catch (error) {
    const message: JournalImageEncoderErrorMessage = {
      type: "error",
      mediaAssetId: input.mediaAssetId,
      generation: input.generation,
      code: safeErrorCode(error),
    };
    workerScope.postMessage(message);
  }
}

function safeErrorCode(error: unknown) {
  const code = error instanceof Error ? error.message : "encode_failed";
  return /^[a-z][a-z0-9_]{2,63}$/.test(code) ? code : "encode_failed";
}
