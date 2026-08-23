import { describe, expect, it, vi } from "vitest";

import {
  LocalJournalMediaCoordinator,
  LocalJournalMediaError,
  type EncodedJournalImage,
  type LocalJournalImageEncoder,
  type LocalJournalMediaStager,
} from "./local-journal-media-coordinator";

const SESSION_ID = "00000000-0000-4000-8000-000000000100";
const MEDIA_1 = "00000000-0000-4000-8000-000000000101";
const MEDIA_2 = "00000000-0000-4000-8000-000000000102";

describe("local-only journal media coordinator", () => {
  it("rejects malformed generated or caller-provided media identities before starting work", () => {
    const encoder: LocalJournalImageEncoder = {
      encode: vi.fn(async () => encodedImage([1])),
    };
    const stager = fakeStager();
    const malformedGenerated = new LocalJournalMediaCoordinator({
      stagingSessionId: SESSION_ID,
      encoder,
      stager,
      createId: () => "00000000-0000---------------------------",
    });
    expect(() =>
      malformedGenerated.add(photo([1]), { blockId: "b_generated" }),
    ).toThrowError(expect.objectContaining({ code: "media_identity_invalid" }));

    const malformedProvided = new LocalJournalMediaCoordinator({
      stagingSessionId: SESSION_ID,
      encoder,
      stager,
      createId: idSequence(MEDIA_1),
    });
    expect(() =>
      malformedProvided.add(photo([2]), {
        blockId: "b_provided",
        mediaAssetId: "not-a-uuid",
      }),
    ).toThrowError(expect.objectContaining({ code: "media_identity_invalid" }));
    expect(encoder.encode).not.toHaveBeenCalled();
    expect(stager.stage).not.toHaveBeenCalled();
  });

  it("publishes a stable skeleton synchronously, previews the exact encoded Blob, and stages once", async () => {
    const encoded = encodedImage([1, 9, 7]);
    const encoder: LocalJournalImageEncoder = {
      encode: vi.fn(async ({ onPhase }) => {
        onPhase("decoding");
        onPhase("encoding");
        return encoded;
      }),
    };
    const stager = fakeStager();
    const createObjectURL = vi.fn(() => "blob:exact-webp");
    const coordinator = new LocalJournalMediaCoordinator({
      stagingSessionId: SESSION_ID,
      encoder,
      stager,
      createObjectURL,
      revokeObjectURL: vi.fn(),
      createId: idSequence(MEDIA_1),
    });

    const startedAt = performance.now();
    const selection = coordinator.add(
      new File([new Uint8Array([2, 4])], "private-name.jpg", {
        type: "image/jpeg",
      }),
      { blockId: "b_first" },
    );

    expect(performance.now() - startedAt).toBeLessThan(100);
    expect(selection).toMatchObject({
      mediaAssetId: MEDIA_1,
      blockId: "b_first",
      generation: 1,
    });
    expect(coordinator.getSnapshot().items[0]).toMatchObject({
      mediaAssetId: MEDIA_1,
      blockId: "b_first",
      status: "selected",
    });

    await selection.ready;
    expect(createObjectURL).toHaveBeenCalledWith(encoded.blob);
    expect(stager.stage).toHaveBeenCalledWith(
      expect.objectContaining({
        stagingSessionId: SESSION_ID,
        mediaAssetId: MEDIA_1,
        generation: 1,
        blob: encoded.blob,
        sha256: encoded.sha256,
      }),
    );
    expect(coordinator.getSnapshot().items[0]).toMatchObject({
      status: "ready",
      previewUrl: "blob:exact-webp",
    });
    expect(JSON.stringify(coordinator.getSnapshot())).not.toContain(
      "private-name",
    );
  });

  it("fences a late generation after replacement and never stages stale bytes", async () => {
    const first = deferred<EncodedJournalImage>();
    const second = deferred<EncodedJournalImage>();
    const encoder: LocalJournalImageEncoder = {
      encode: vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise),
    };
    const stager = fakeStager();
    const revokeObjectURL = vi.fn();
    const coordinator = new LocalJournalMediaCoordinator({
      stagingSessionId: SESSION_ID,
      encoder,
      stager,
      createObjectURL: (blob) => `blob:${blob.size}`,
      revokeObjectURL,
      createId: idSequence(MEDIA_1),
    });

    const original = coordinator.add(photo([1]), { blockId: "b_first" });
    await Promise.resolve();
    const replacement = coordinator.replace(MEDIA_1, photo([8, 8]));
    expect(replacement.generation).toBe(2);

    first.resolve(encodedImage([1]));
    await expect(original.ready).rejects.toMatchObject({
      code: "generation_replaced",
    });
    expect(stager.stage).not.toHaveBeenCalled();

    second.resolve(encodedImage([8, 8]));
    await replacement.ready;
    expect(stager.stage).toHaveBeenCalledTimes(1);
    expect(stager.stage).toHaveBeenCalledWith(
      expect.objectContaining({ mediaAssetId: MEDIA_1, generation: 2 }),
    );
    expect(coordinator.getSnapshot().items[0]).toMatchObject({
      generation: 2,
      status: "ready",
    });
  });

  it("freezes the exact document order and waits for every current generation", async () => {
    const deferredFirst = deferred<EncodedJournalImage>();
    const deferredSecond = deferred<EncodedJournalImage>();
    const encoder: LocalJournalImageEncoder = {
      encode: vi
        .fn()
        .mockImplementationOnce(() => deferredFirst.promise)
        .mockImplementationOnce(() => deferredSecond.promise),
    };
    const coordinator = new LocalJournalMediaCoordinator({
      stagingSessionId: SESSION_ID,
      encoder,
      stager: fakeStager(),
      createObjectURL: () => "blob:preview",
      revokeObjectURL: vi.fn(),
      createId: idSequence(MEDIA_1, MEDIA_2),
    });
    coordinator.add(photo([1]), { blockId: "b_first" });
    coordinator.add(photo([2]), { blockId: "b_second" });

    const frozen = coordinator.freeze([MEDIA_2, MEDIA_1]);
    let settled = false;
    void frozen.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    deferredSecond.resolve(encodedImage([2]));
    deferredFirst.resolve(encodedImage([1]));
    await expect(frozen).resolves.toEqual({
      stagingSessionId: SESSION_ID,
      mediaClaimReceipts: ["receipt-2", "receipt-1"],
      orderedMediaAssetIds: [MEDIA_2, MEDIA_1],
    });
  });

  it("locks every media mutation while a publication snapshot is frozen", async () => {
    const pending = deferred<EncodedJournalImage>();
    const coordinator = new LocalJournalMediaCoordinator({
      stagingSessionId: SESSION_ID,
      encoder: { encode: vi.fn(() => pending.promise) },
      stager: fakeStager(),
      createObjectURL: () => "blob:frozen",
      revokeObjectURL: vi.fn(),
      createId: idSequence(MEDIA_1, MEDIA_2),
    });
    coordinator.add(photo([1]), { blockId: "b_first" });

    const frozen = coordinator.freeze([MEDIA_1]);
    expect(() =>
      coordinator.add(photo([2]), { blockId: "b_second" }),
    ).toThrowError(expect.objectContaining({ code: "publication_frozen" }));
    expect(() => coordinator.replace(MEDIA_1, photo([3]))).toThrowError(
      expect.objectContaining({ code: "publication_frozen" }),
    );
    await expect(coordinator.remove(MEDIA_1)).rejects.toMatchObject({
      code: "publication_frozen",
    });

    coordinator.cancelPublicationWait();
    await expect(frozen).rejects.toMatchObject({
      code: "publication_cancelled",
    });
  });

  it("cancels pending Worker or staging work, fences late completion, and leaves the block recoverable", async () => {
    const pending = deferred<EncodedJournalImage>();
    const stage = vi.fn(async () => ({
      stagingReceipt: "receipt-current",
      deleteCapability: "delete-current",
    }));
    const coordinator = new LocalJournalMediaCoordinator({
      stagingSessionId: SESSION_ID,
      encoder: { encode: vi.fn(() => pending.promise) },
      stager: { stage, delete: vi.fn(async () => undefined) },
      createObjectURL: () => "blob:late",
      revokeObjectURL: vi.fn(),
      createId: idSequence(MEDIA_1),
    });
    const selection = coordinator.add(photo([1]), { blockId: "b_first" });
    const frozen = coordinator.freeze([MEDIA_1]);

    coordinator.cancelPublicationWait();
    await expect(selection.ready).rejects.toMatchObject({
      code: "publication_cancelled",
    });
    await expect(frozen).rejects.toMatchObject({
      code: "publication_cancelled",
    });
    expect(coordinator.getSnapshot().items[0]).toMatchObject({
      status: "failed",
      failureCode: "publication_cancelled",
    });

    pending.resolve(encodedImage([9]));
    await Promise.resolve();
    await Promise.resolve();
    expect(stage).not.toHaveBeenCalled();
    await expect(coordinator.retry(MEDIA_1).ready).resolves.toMatchObject({
      status: "ready",
      mediaAssetId: MEDIA_1,
    });
    expect(stage).toHaveBeenCalledOnce();
    await expect(coordinator.remove(MEDIA_1)).resolves.toBeUndefined();
  });

  it("keeps failed media removable, retries at a fenced generation, and cleans staged data", async () => {
    const encoder: LocalJournalImageEncoder = {
      encode: vi
        .fn()
        .mockRejectedValueOnce(
          new LocalJournalMediaError("encode_timeout", "encoding failed"),
        )
        .mockResolvedValueOnce(encodedImage([7])),
    };
    const stager = fakeStager();
    const revokeObjectURL = vi.fn();
    const coordinator = new LocalJournalMediaCoordinator({
      stagingSessionId: SESSION_ID,
      encoder,
      stager,
      createObjectURL: () => "blob:retry",
      revokeObjectURL,
      createId: idSequence(MEDIA_1),
    });

    const initial = coordinator.add(photo([3]), { blockId: "b_first" });
    await expect(initial.ready).rejects.toMatchObject({
      code: "encode_timeout",
    });
    expect(coordinator.getSnapshot().items[0]).toMatchObject({
      status: "failed",
      failureCode: "encode_timeout",
    });
    await expect(coordinator.freeze([MEDIA_1])).rejects.toMatchObject({
      code: "media_not_ready",
    });

    const retry = coordinator.retry(MEDIA_1);
    expect(retry.generation).toBe(1);
    await retry.ready;
    await coordinator.remove(MEDIA_1);
    expect(stager.delete).toHaveBeenCalledWith(
      expect.objectContaining({ deleteCapability: "delete-1" }),
    );
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:retry");
    expect(coordinator.getSnapshot().items).toEqual([]);
  });

  it("revokes a failed staging preview before retrying the same generation", async () => {
    const revokeObjectURL = vi.fn();
    const stager: LocalJournalMediaStager = {
      stage: vi
        .fn()
        .mockRejectedValueOnce(new LocalJournalMediaError("staging_timeout"))
        .mockResolvedValueOnce({
          stagingReceipt: "receipt-current",
          deleteCapability: "delete-current",
        }),
      delete: vi.fn(async () => undefined),
    };
    const coordinator = new LocalJournalMediaCoordinator({
      stagingSessionId: SESSION_ID,
      encoder: { encode: vi.fn(async () => encodedImage([7])) },
      stager,
      createObjectURL: vi
        .fn()
        .mockReturnValueOnce("blob:failed-stage")
        .mockReturnValueOnce("blob:retried-stage"),
      revokeObjectURL,
      createId: idSequence(MEDIA_1),
    });

    await expect(
      coordinator.add(photo([7]), { blockId: "b_first" }).ready,
    ).rejects.toMatchObject({ code: "staging_timeout" });
    await coordinator.retry(MEDIA_1).ready;

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:failed-stage");
    expect(coordinator.getSnapshot().items[0]).toMatchObject({
      previewUrl: "blob:retried-stage",
      status: "ready",
    });
  });

  it("releases local previews after a committed publication without issuing staging deletes", async () => {
    const stager = fakeStager();
    const revokeObjectURL = vi.fn();
    const coordinator = new LocalJournalMediaCoordinator({
      stagingSessionId: SESSION_ID,
      encoder: { encode: vi.fn(async () => encodedImage([5, 6])) },
      stager,
      createObjectURL: () => "blob:committed-webp",
      revokeObjectURL,
      createId: idSequence(MEDIA_1),
    });

    await coordinator.add(photo([5, 6]), { blockId: "b_first" }).ready;
    coordinator.completePublication();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:committed-webp");
    expect(stager.delete).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot().items).toEqual([]);
    expect(() =>
      coordinator.add(photo([7]), { blockId: "b_after_publish" }),
    ).toThrowError(expect.objectContaining({ code: "media_abandoned" }));
  });
});

function encodedImage(bytes: number[]): EncodedJournalImage {
  const blob = new Blob([new Uint8Array(bytes)], { type: "image/webp" });
  return {
    blob,
    width: 1200,
    height: 800,
    sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    sourceKind: "jpeg",
    lossless: false,
    quality: 82,
    durationMs: 12,
  };
}

function photo(bytes: number[]) {
  return new File([new Uint8Array(bytes)], "never-observed.jpg", {
    type: "image/jpeg",
  });
}

function fakeStager(): LocalJournalMediaStager {
  return {
    stage: vi.fn(async ({ generation, mediaAssetId }) => {
      const identity = mediaAssetId === MEDIA_2 ? 2 : generation;
      return {
        stagingReceipt: `receipt-${identity}`,
        deleteCapability: `delete-${identity}`,
      };
    }),
    delete: vi.fn(async () => undefined),
  };
}

function idSequence(...ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? crypto.randomUUID();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
