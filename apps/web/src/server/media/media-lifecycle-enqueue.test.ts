import { describe, expect, it } from "vitest";

import {
  listAbandonedCoverOnlyRevokeCandidates,
  listArchiveDerivativeRevokeCandidates,
  listDetachedInlineRevokeCandidates,
  listOrphanProcessedDerivativesForEntry,
  MediaLifecycleDocumentError,
} from "./media-lifecycle-enqueue";

type Row = Record<string, unknown>;

const INLINE_1 = "11111111-1111-4111-8111-111111111111";
const INLINE_2 = "22222222-2222-4222-8222-222222222222";

function mockExecutor(
  responses: Row[][],
  onExecute?: () => void,
  onWhere?: (predicate: unknown[]) => void,
) {
  let call = 0;
  const chain = {
    selectFrom() {
      return this;
    },
    select() {
      return this;
    },
    where(...predicate: unknown[]) {
      onWhere?.(predicate);
      return this;
    },
    async execute() {
      onExecute?.();
      const rows = responses[call] ?? [];
      call += 1;
      return rows;
    },
    async executeTakeFirst() {
      const rows = await this.execute();
      return rows[0];
    },
  };
  return chain;
}

describe("media lifecycle cover/10+1 reference safety", () => {
  it("archives revoke every processed derivative regardless of cover role", async () => {
    const candidates = await listArchiveDerivativeRevokeCandidates(
      mockExecutor([
        [
          { id: "inline-1", derivative_key: "derivatives/a.webp" },
          { id: "cover-1", derivative_key: "derivatives/b.webp" },
        ],
      ]) as never,
      { journalEntryId: "entry-1", ownerUserId: "user-1" },
    );
    expect(candidates.map((row) => row.mediaAssetId)).toEqual([
      "inline-1",
      "cover-1",
    ]);
  });

  it("keeps explicit cover and document-referenced inline on orphan cleanup", async () => {
    const candidates = await listOrphanProcessedDerivativesForEntry(
      mockExecutor([
        [
          {
            id: "entry-1",
            cover_media_asset_id: "cover-1",
            content_document: {
              schemaVersion: 1,
              blocks: [
                { id: "image-1", type: "image", mediaAssetId: INLINE_1 },
                { id: "image-2", type: "image", mediaAssetId: INLINE_2 },
              ],
            },
          },
        ],
        [
          {
            id: INLINE_1,
            derivative_key: "derivatives/a.webp",
            usage_role: "inline",
            document_position: 1,
          },
          {
            id: INLINE_2,
            derivative_key: "derivatives/b.webp",
            usage_role: "inline",
            document_position: 2,
          },
          {
            id: "cover-1",
            derivative_key: "derivatives/c.webp",
            usage_role: "cover_only",
            document_position: null,
          },
          {
            id: "orphan-1",
            derivative_key: "derivatives/d.webp",
            usage_role: "cover_only",
            document_position: null,
          },
        ],
      ]) as never,
      { journalEntryId: "entry-1", ownerUserId: "user-1" },
    );
    expect(candidates).toEqual([
      {
        mediaAssetId: "orphan-1",
        bucket: "public_derivative",
        objectKey: "derivatives/d.webp",
      },
    ]);
  });

  it("keeps inline-as-cover when cover pointer equals an inline asset", async () => {
    const candidates = await listOrphanProcessedDerivativesForEntry(
      mockExecutor([
        [
          {
            id: "entry-1",
            cover_media_asset_id: INLINE_1,
            content_document: {
              schemaVersion: 1,
              blocks: [
                { id: "image-1", type: "image", mediaAssetId: INLINE_1 },
              ],
            },
          },
        ],
        [
          {
            id: INLINE_1,
            derivative_key: "derivatives/a.webp",
            usage_role: "inline",
            document_position: 1,
          },
        ],
      ]) as never,
      { journalEntryId: "entry-1", ownerUserId: "user-1" },
    );
    expect(candidates).toEqual([]);
  });

  it("lists abandoned cover-only candidates before unlink", async () => {
    const candidates = await listAbandonedCoverOnlyRevokeCandidates(
      mockExecutor([
        [{ id: "old-cover", derivative_key: "derivatives/old.webp" }],
      ]) as never,
      {
        journalEntryId: "entry-1",
        ownerUserId: "user-1",
        keepMediaAssetId: "new-cover",
      },
    );
    expect(candidates).toEqual([
      {
        mediaAssetId: "old-cover",
        bucket: "public_derivative",
        objectKey: "derivatives/old.webp",
      },
    ]);
  });

  it("lists detached inline candidates excluding keep set and cover-only", async () => {
    const candidates = await listDetachedInlineRevokeCandidates(
      mockExecutor([
        [
          {
            id: "keep-1",
            derivative_key: "derivatives/a.webp",
            usage_role: "inline",
          },
          {
            id: "drop-1",
            derivative_key: "derivatives/b.webp",
            usage_role: "inline",
          },
          {
            id: "cover-1",
            derivative_key: "derivatives/c.webp",
            usage_role: "cover_only",
          },
        ],
      ]) as never,
      {
        journalEntryId: "entry-1",
        ownerUserId: "user-1",
        keepMediaAssetIds: new Set(["keep-1"]),
      },
    );
    expect(candidates).toEqual([
      {
        mediaAssetId: "drop-1",
        bucket: "public_derivative",
        objectKey: "derivatives/b.webp",
      },
    ]);
  });

  it("no-cover entries still revoke detached inlines only", async () => {
    const candidates = await listOrphanProcessedDerivativesForEntry(
      mockExecutor([
        [
          {
            id: "entry-1",
            cover_media_asset_id: null,
            content_document: {
              schemaVersion: 1,
              blocks: [
                {
                  id: "paragraph-1",
                  type: "paragraph",
                  spans: [{ text: "hello" }],
                },
              ],
            },
          },
        ],
        [
          {
            id: "stale-1",
            derivative_key: "derivatives/a.webp",
            usage_role: "inline",
            document_position: 1,
          },
        ],
      ]) as never,
      { journalEntryId: "entry-1", ownerUserId: "user-1" },
    );
    expect(candidates.map((row) => row.mediaAssetId)).toEqual(["stale-1"]);
  });

  it("fails closed before the media query for an unsupported document", async () => {
    let queryCount = 0;
    const executor = mockExecutor(
      [
        [
          {
            id: "entry-1",
            cover_media_asset_id: null,
            content_document: { schemaVersion: 2, blocks: [] },
          },
        ],
        [
          {
            id: "must-not-be-read",
            derivative_key: "derivatives/unsafe.webp",
            usage_role: "inline",
            document_position: 1,
          },
        ],
      ],
      () => {
        queryCount += 1;
      },
    );

    await expect(
      listOrphanProcessedDerivativesForEntry(executor as never, {
        journalEntryId: "entry-1",
        ownerUserId: "user-1",
      }),
    ).rejects.toMatchObject({
      name: "MediaLifecycleDocumentError",
      code: "invalid_content_document",
    } satisfies Partial<MediaLifecycleDocumentError>);
    expect(queryCount).toBe(1);
  });

  it("returns no candidates or media query for an entry outside the owner scope", async () => {
    let queryCount = 0;
    const predicates: unknown[][] = [];
    const executor = mockExecutor(
      [
        [],
        [
          {
            id: "must-not-be-read",
            derivative_key: "derivatives/unsafe.webp",
            usage_role: "inline",
            document_position: 1,
          },
        ],
      ],
      () => {
        queryCount += 1;
      },
      (predicate) => predicates.push(predicate),
    );

    await expect(
      listOrphanProcessedDerivativesForEntry(executor as never, {
        journalEntryId: "another-owner-entry",
        ownerUserId: "current-owner",
      }),
    ).resolves.toEqual([]);
    expect(queryCount).toBe(1);
    expect(predicates).toContainEqual(["owner_user_id", "=", "current-owner"]);
  });
});
