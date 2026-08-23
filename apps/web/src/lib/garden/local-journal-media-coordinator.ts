"use client";

import type { ClientImageSourceKind } from "@/lib/media/client-webp-policy";
import { isUuid } from "@/lib/media/ephemeral-staging-contract";

export const LOCAL_JOURNAL_MEDIA_MAX_ITEMS = 10;
export const LOCAL_JOURNAL_MEDIA_MAX_RETRIES = 3;

export type LocalJournalMediaPhase = "decoding" | "encoding";
export type LocalJournalMediaStatus =
  | "selected"
  | "decoding"
  | "encoding"
  | "staging"
  | "ready"
  | "failed";

export interface EncodedJournalImage {
  blob: Blob;
  width: number;
  height: number;
  sha256: string;
  sourceKind: ClientImageSourceKind;
  lossless: boolean;
  quality: number;
  durationMs: number;
}

export interface LocalJournalImageEncoder {
  encode(input: {
    source: Blob;
    mediaAssetId: string;
    generation: number;
    signal: AbortSignal;
    onPhase(phase: LocalJournalMediaPhase): void;
  }): Promise<EncodedJournalImage>;
}

export interface LocalJournalMediaStager {
  stage(input: {
    stagingSessionId: string;
    mediaAssetId: string;
    generation: number;
    blob: Blob;
    sha256: string;
    width: number;
    height: number;
    signal: AbortSignal;
  }): Promise<{ stagingReceipt: string; deleteCapability: string }>;
  delete(input: {
    stagingSessionId: string;
    mediaAssetId: string;
    generation: number;
    deleteCapability: string;
  }): Promise<void>;
}

export interface LocalJournalMediaItemSnapshot {
  mediaAssetId: string;
  blockId: string;
  generation: number;
  status: LocalJournalMediaStatus;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  failureCode: string | null;
  retryCount: number;
}

export interface LocalJournalMediaSnapshot {
  items: LocalJournalMediaItemSnapshot[];
}

export interface LocalJournalMediaSelection {
  mediaAssetId: string;
  blockId: string;
  generation: number;
  ready: Promise<LocalJournalMediaItemSnapshot>;
}

export class LocalJournalMediaError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "LocalJournalMediaError";
  }
}

interface InternalGeneration {
  ready: Promise<LocalJournalMediaItemSnapshot>;
  resolve(value: LocalJournalMediaItemSnapshot): void;
  reject(error: LocalJournalMediaError): void;
  settled: boolean;
}

interface InternalItem {
  mediaAssetId: string;
  blockId: string;
  generation: number;
  retryCount: number;
  source: Blob;
  status: LocalJournalMediaStatus;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  failureCode: string | null;
  stagingReceipt: string | null;
  deleteCapability: string | null;
  controller: AbortController;
  operation: InternalGeneration;
}

export class LocalJournalMediaCoordinator {
  private readonly items = new Map<string, InternalItem>();
  private readonly listeners = new Set<() => void>();
  private snapshot: LocalJournalMediaSnapshot = { items: [] };
  private destroyed = false;
  private publicationFrozen = false;

  constructor(
    private readonly options: {
      stagingSessionId: string;
      encoder: LocalJournalImageEncoder;
      stager: LocalJournalMediaStager;
      createObjectURL?: (blob: Blob) => string;
      revokeObjectURL?: (url: string) => void;
      createId?: () => string;
    },
  ) {}

  getSnapshot = (): LocalJournalMediaSnapshot => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  add(
    source: Blob,
    input: { blockId: string; mediaAssetId?: string },
  ): LocalJournalMediaSelection {
    this.assertMutable();
    if (this.items.size >= LOCAL_JOURNAL_MEDIA_MAX_ITEMS) {
      throw new LocalJournalMediaError("media_limit_exceeded");
    }
    const mediaAssetId = input.mediaAssetId ?? this.createId();
    if (!isUuid(mediaAssetId)) {
      throw new LocalJournalMediaError("media_identity_invalid");
    }
    if (this.items.has(mediaAssetId)) {
      throw new LocalJournalMediaError("media_identity_conflict");
    }
    const operation = createGeneration();
    const item: InternalItem = {
      mediaAssetId,
      blockId: input.blockId,
      generation: 1,
      retryCount: 0,
      source,
      status: "selected",
      previewUrl: null,
      width: null,
      height: null,
      failureCode: null,
      stagingReceipt: null,
      deleteCapability: null,
      controller: new AbortController(),
      operation,
    };
    this.items.set(mediaAssetId, item);
    this.publish();
    queueMicrotask(() => void this.run(item));
    return selectionFor(item);
  }

  replace(mediaAssetId: string, source: Blob): LocalJournalMediaSelection {
    this.assertMutable();
    const current = this.requireItem(mediaAssetId);
    this.retireOperation(current, "generation_replaced");
    this.revokePreview(current);
    this.deleteStagedBestEffort(current);
    const item: InternalItem = {
      ...current,
      generation: current.generation + 1,
      retryCount: 0,
      source,
      status: "selected",
      previewUrl: null,
      width: null,
      height: null,
      failureCode: null,
      stagingReceipt: null,
      deleteCapability: null,
      controller: new AbortController(),
      operation: createGeneration(),
    };
    this.items.set(mediaAssetId, item);
    this.publish();
    queueMicrotask(() => void this.run(item));
    return selectionFor(item);
  }

  retry(mediaAssetId: string): LocalJournalMediaSelection {
    this.assertMutable();
    const current = this.requireItem(mediaAssetId);
    if (current.status !== "failed") {
      throw new LocalJournalMediaError("media_not_failed");
    }
    if (current.retryCount >= LOCAL_JOURNAL_MEDIA_MAX_RETRIES) {
      throw new LocalJournalMediaError("retry_limit_exceeded");
    }
    this.revokePreview(current);
    const item: InternalItem = {
      ...current,
      retryCount: current.retryCount + 1,
      status: "selected",
      previewUrl: null,
      width: null,
      height: null,
      failureCode: null,
      stagingReceipt: null,
      deleteCapability: null,
      controller: new AbortController(),
      operation: createGeneration(),
    };
    this.items.set(mediaAssetId, item);
    this.publish();
    queueMicrotask(() => void this.run(item));
    return selectionFor(item);
  }

  async remove(mediaAssetId: string): Promise<void> {
    this.assertMutable();
    const item = this.items.get(mediaAssetId);
    if (!item) return;
    this.items.delete(mediaAssetId);
    this.retireOperation(item, "media_removed");
    this.revokePreview(item);
    this.publish();
    await this.deleteStaged(item).catch(() => undefined);
  }

  async freeze(mediaAssetIds: readonly string[]): Promise<{
    stagingSessionId: string;
    mediaClaimReceipts: string[];
    orderedMediaAssetIds: string[];
  }> {
    this.assertMutable();
    this.publicationFrozen = true;
    try {
      if (new Set(mediaAssetIds).size !== mediaAssetIds.length) {
        throw new LocalJournalMediaError("media_order_invalid");
      }
      const captured = mediaAssetIds.map((mediaAssetId) => {
        const item = this.requireItem(mediaAssetId);
        if (item.status === "failed") {
          throw new LocalJournalMediaError("media_not_ready");
        }
        return {
          mediaAssetId,
          generation: item.generation,
          ready: item.operation.ready,
        };
      });
      await Promise.all(captured.map(({ ready }) => ready));
      const receipts = captured.map(({ mediaAssetId, generation }) => {
        const item = this.requireItem(mediaAssetId);
        if (
          item.generation !== generation ||
          item.status !== "ready" ||
          !item.stagingReceipt
        ) {
          throw new LocalJournalMediaError("media_not_ready");
        }
        return item.stagingReceipt;
      });
      return {
        stagingSessionId: this.options.stagingSessionId,
        mediaClaimReceipts: receipts,
        orderedMediaAssetIds: [...mediaAssetIds],
      };
    } catch (error) {
      this.publicationFrozen = false;
      throw error;
    }
  }

  /**
   * Releases the immutable publication snapshot after a bounded server failure
   * so the gardener can retry, replace, remove, or continue editing.
   */
  releasePublicationFreeze(): void {
    if (this.destroyed) return;
    this.publicationFrozen = false;
  }

  /**
   * Cancels every pending local generation involved in a Publish wait. A clone
   * replaces each active item before aborting so a non-cooperative codec or
   * upload cannot publish late state into the current generation.
   */
  cancelPublicationWait(): void {
    if (this.destroyed) return;
    this.publicationFrozen = false;
    let changed = false;
    for (const [mediaAssetId, item] of this.items) {
      if (item.status === "ready" || item.status === "failed") continue;
      const failed: InternalItem = {
        ...item,
        status: "failed",
        failureCode: "publication_cancelled",
      };
      this.items.set(mediaAssetId, failed);
      this.retireOperation(item, "publication_cancelled");
      changed = true;
    }
    if (changed) this.publish();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const item of this.items.values()) {
      this.retireOperation(item, "media_abandoned");
      this.revokePreview(item);
      this.deleteStagedBestEffort(item);
    }
    this.items.clear();
    this.publish();
    this.listeners.clear();
  }

  /**
   * Publication has crossed the canonical commit boundary. Release browser
   * resources without exercising delete capabilities that belonged only to
   * the pre-commit staging lifecycle.
   */
  completePublication(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.publicationFrozen = false;
    for (const item of this.items.values()) {
      item.controller.abort();
      this.revokePreview(item);
    }
    this.items.clear();
    this.publish();
    this.listeners.clear();
  }

  private async run(item: InternalItem): Promise<void> {
    try {
      this.updateCurrent(item, { status: "decoding", failureCode: null });
      const encoded = await this.options.encoder.encode({
        source: item.source,
        mediaAssetId: item.mediaAssetId,
        generation: item.generation,
        signal: item.controller.signal,
        onPhase: (phase) => this.updateCurrent(item, { status: phase }),
      });
      this.assertCurrent(item);
      const previewUrl = this.createObjectURL(encoded.blob);
      this.updateCurrent(item, {
        status: "staging",
        previewUrl,
        width: encoded.width,
        height: encoded.height,
      });
      const staged = await this.options.stager.stage({
        stagingSessionId: this.options.stagingSessionId,
        mediaAssetId: item.mediaAssetId,
        generation: item.generation,
        blob: encoded.blob,
        sha256: encoded.sha256,
        width: encoded.width,
        height: encoded.height,
        signal: item.controller.signal,
      });
      this.assertCurrent(item);
      item.status = "ready";
      item.stagingReceipt = staged.stagingReceipt;
      item.deleteCapability = staged.deleteCapability;
      item.failureCode = null;
      this.publish();
      settleGeneration(item.operation, "resolve", publicItem(item));
    } catch (error) {
      const normalized = normalizeError(error);
      if (!this.isCurrent(item)) {
        settleGeneration(item.operation, "reject", normalized);
        return;
      }
      item.status = "failed";
      item.failureCode = normalized.code;
      this.publish();
      settleGeneration(item.operation, "reject", normalized);
    }
  }

  private updateCurrent(
    item: InternalItem,
    patch: Partial<
      Pick<
        InternalItem,
        "status" | "previewUrl" | "width" | "height" | "failureCode"
      >
    >,
  ) {
    this.assertCurrent(item);
    Object.assign(item, patch);
    this.publish();
  }

  private assertCurrent(item: InternalItem) {
    if (!this.isCurrent(item)) {
      throw new LocalJournalMediaError("generation_replaced");
    }
    if (item.controller.signal.aborted) {
      throw new LocalJournalMediaError("operation_aborted");
    }
  }

  private isCurrent(item: InternalItem) {
    return this.items.get(item.mediaAssetId) === item && !this.destroyed;
  }

  private retireOperation(item: InternalItem, code: string) {
    item.controller.abort();
    settleGeneration(
      item.operation,
      "reject",
      new LocalJournalMediaError(code),
    );
  }

  private revokePreview(item: InternalItem) {
    if (!item.previewUrl) return;
    this.revokeObjectURL(item.previewUrl);
    item.previewUrl = null;
  }

  private deleteStagedBestEffort(item: InternalItem) {
    void this.deleteStaged(item).catch(() => undefined);
  }

  private async deleteStaged(item: InternalItem) {
    if (!item.deleteCapability) return;
    await this.options.stager.delete({
      stagingSessionId: this.options.stagingSessionId,
      mediaAssetId: item.mediaAssetId,
      generation: item.generation,
      deleteCapability: item.deleteCapability,
    });
  }

  private requireItem(mediaAssetId: string) {
    const item = this.items.get(mediaAssetId);
    if (!item) throw new LocalJournalMediaError("media_not_found");
    return item;
  }

  private assertMutable() {
    if (this.destroyed) throw new LocalJournalMediaError("media_abandoned");
    if (this.publicationFrozen) {
      throw new LocalJournalMediaError("publication_frozen");
    }
  }

  private createId() {
    const value = (this.options.createId ?? (() => crypto.randomUUID()))();
    if (!isUuid(value)) {
      throw new LocalJournalMediaError("media_identity_invalid");
    }
    return value;
  }

  private createObjectURL(blob: Blob) {
    return (this.options.createObjectURL ?? URL.createObjectURL)(blob);
  }

  private revokeObjectURL(url: string) {
    (this.options.revokeObjectURL ?? URL.revokeObjectURL)(url);
  }

  private publish() {
    this.snapshot = {
      items: [...this.items.values()].map(publicItem),
    };
    for (const listener of this.listeners) listener();
  }
}

function publicItem(item: InternalItem): LocalJournalMediaItemSnapshot {
  return {
    mediaAssetId: item.mediaAssetId,
    blockId: item.blockId,
    generation: item.generation,
    status: item.status,
    previewUrl: item.previewUrl,
    width: item.width,
    height: item.height,
    failureCode: item.failureCode,
    retryCount: item.retryCount,
  };
}

function selectionFor(item: InternalItem): LocalJournalMediaSelection {
  return {
    mediaAssetId: item.mediaAssetId,
    blockId: item.blockId,
    generation: item.generation,
    ready: item.operation.ready,
  };
}

function createGeneration(): InternalGeneration {
  let resolve!: (value: LocalJournalMediaItemSnapshot) => void;
  let reject!: (error: LocalJournalMediaError) => void;
  const ready = new Promise<LocalJournalMediaItemSnapshot>(
    (resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    },
  );
  return { ready, resolve, reject, settled: false };
}

function settleGeneration(
  generation: InternalGeneration,
  kind: "resolve" | "reject",
  value: LocalJournalMediaItemSnapshot | LocalJournalMediaError,
) {
  if (generation.settled) return;
  generation.settled = true;
  if (kind === "resolve") {
    generation.resolve(value as LocalJournalMediaItemSnapshot);
  } else {
    generation.reject(value as LocalJournalMediaError);
  }
}

function normalizeError(error: unknown): LocalJournalMediaError {
  if (error instanceof LocalJournalMediaError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new LocalJournalMediaError("operation_aborted");
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return new LocalJournalMediaError((error as { code: string }).code);
  }
  return new LocalJournalMediaError("media_preparation_failed");
}
