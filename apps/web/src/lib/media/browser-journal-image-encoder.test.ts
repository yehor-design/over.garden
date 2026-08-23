import { describe, expect, it, vi } from "vitest";

import {
  BrowserJournalImageEncoder,
  type JournalImageEncoderWorker,
} from "./browser-journal-image-encoder";

function fakeWorker() {
  let messageListener: ((event: MessageEvent) => void) | null = null;
  let errorListener: ((event: ErrorEvent) => void) | null = null;
  const worker: JournalImageEncoderWorker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener(type, listener) {
      if (type === "message") messageListener = listener as (event: MessageEvent) => void;
      if (type === "error") errorListener = listener as (event: ErrorEvent) => void;
    },
    removeEventListener: vi.fn(),
  };
  return {
    worker,
    message(data: unknown) {
      messageListener?.({ data } as MessageEvent);
    },
    error() {
      errorListener?.({} as ErrorEvent);
    },
  };
}

describe("BrowserJournalImageEncoder", () => {
  it("terminates the dedicated worker after a successful exact-generation result", async () => {
    const controlled = fakeWorker();
    const encoder = new BrowserJournalImageEncoder({
      createWorker: () => controlled.worker,
    });
    const phases: string[] = [];
    const promise = encoder.encode({
      source: new Blob([new Uint8Array([1])], { type: "image/jpeg" }),
      mediaAssetId: "8f5fa87d-b94e-4217-b68d-28303827ad89",
      generation: 2,
      signal: new AbortController().signal,
      onPhase: (phase) => phases.push(phase),
    });

    controlled.message({
      type: "phase",
      mediaAssetId: "8f5fa87d-b94e-4217-b68d-28303827ad89",
      generation: 2,
      phase: "encoding",
    });
    controlled.message({
      type: "result",
      mediaAssetId: "8f5fa87d-b94e-4217-b68d-28303827ad89",
      generation: 2,
      bytes: new Uint8Array([82, 73, 70, 70]).buffer,
      width: 1,
      height: 1,
      sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      sourceKind: "jpeg",
      lossless: false,
      quality: 82,
      durationMs: 12,
    });

    await expect(promise).resolves.toMatchObject({ width: 1, height: 1 });
    expect(phases).toEqual(["encoding"]);
    expect(controlled.worker.terminate).toHaveBeenCalledOnce();
  });

  it("terminates without accepting a late result when the selection is cancelled", async () => {
    const controlled = fakeWorker();
    const encoder = new BrowserJournalImageEncoder({
      createWorker: () => controlled.worker,
    });
    const controller = new AbortController();
    const promise = encoder.encode({
      source: new Blob([new Uint8Array([1])]),
      mediaAssetId: "8f5fa87d-b94e-4217-b68d-28303827ad89",
      generation: 1,
      signal: controller.signal,
      onPhase: vi.fn(),
    });

    controller.abort();
    controlled.message({ type: "result" });

    await expect(promise).rejects.toMatchObject({ code: "encode_cancelled" });
    expect(controlled.worker.terminate).toHaveBeenCalledOnce();
  });

  it("fails closed and terminates at the hard timeout", async () => {
    vi.useFakeTimers();
    const controlled = fakeWorker();
    const encoder = new BrowserJournalImageEncoder({
      createWorker: () => controlled.worker,
      timeoutMs: 50,
    });
    const promise = encoder.encode({
      source: new Blob([new Uint8Array([1])]),
      mediaAssetId: "8f5fa87d-b94e-4217-b68d-28303827ad89",
      generation: 1,
      signal: new AbortController().signal,
      onPhase: vi.fn(),
    });
    const rejection = expect(promise).rejects.toMatchObject({
      code: "encode_timeout",
    });

    await vi.advanceTimersByTimeAsync(51);

    await rejection;
    expect(controlled.worker.terminate).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
