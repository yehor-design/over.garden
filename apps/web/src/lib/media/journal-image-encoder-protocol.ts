import type { ClientImageSourceKind } from "./client-webp-policy";

export interface JournalImageEncoderStartMessage {
  type: "start";
  mediaAssetId: string;
  generation: number;
  source: Blob;
}

export interface JournalImageEncoderPhaseMessage {
  type: "phase";
  mediaAssetId: string;
  generation: number;
  phase: "decoding" | "encoding";
}

/** A small WebP of the decoded bitmap, posted before the final encode. */
export interface JournalImageEncoderPreviewMessage {
  type: "preview";
  mediaAssetId: string;
  generation: number;
  bytes: ArrayBuffer;
  width: number;
  height: number;
}

export interface JournalImageEncoderResultVariant {
  /** The target long edge (1280, 480); never larger than the primary. */
  longEdge: number;
  width: number;
  height: number;
  bytes: ArrayBuffer;
  sha256: string;
}

export interface JournalImageEncoderResultMessage {
  type: "result";
  mediaAssetId: string;
  generation: number;
  bytes: ArrayBuffer;
  width: number;
  height: number;
  sha256: string;
  variants: JournalImageEncoderResultVariant[];
  placeholderDataUri: string | null;
  sourceKind: ClientImageSourceKind;
  lossless: boolean;
  quality: number;
  codecPath: "native" | "fallback";
  durationMs: number;
}

export interface JournalImageEncoderErrorMessage {
  type: "error";
  mediaAssetId: string;
  generation: number;
  code: string;
}

export type JournalImageEncoderResponseMessage =
  | JournalImageEncoderPhaseMessage
  | JournalImageEncoderPreviewMessage
  | JournalImageEncoderResultMessage
  | JournalImageEncoderErrorMessage;
