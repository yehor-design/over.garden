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

export interface JournalImageEncoderResultMessage {
  type: "result";
  mediaAssetId: string;
  generation: number;
  bytes: ArrayBuffer;
  width: number;
  height: number;
  sha256: string;
  sourceKind: ClientImageSourceKind;
  lossless: boolean;
  quality: number;
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
  | JournalImageEncoderResultMessage
  | JournalImageEncoderErrorMessage;
