import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteOfflineDraft,
  upsertOfflineDraft,
  type FirstEntryDraftPayload,
} from "./drafts";
import {
  createDurableOwnerComposerPersistenceController,
  type OwnerComposerDurabilityWriteContext,
} from "./owner-composer-participants";
import {
  OWNER_COMPOSER_DURABILITY_PROTOCOL,
  fingerprintOwnerComposerPayload,
  OwnerComposerDurabilityUnconfirmedError,
  type OwnerComposerDurabilityReceipt,
} from "./owner-composer-durability";
import { hydrateOwnerOfflineActivitySession } from "./owner-session-lifecycle";
import { offlineDb } from "./queue";

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const PARTICIPANT_NONCE = "participant-ove293-test-000000000001";
const DRAFT_ID = "first-entry";

describe("owner composer durability", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await offlineDb?.mutations.clear();
    await offlineDb?.mutationSummaries.clear();
    await offlineDb?.drafts.clear();
    await offlineDb?.draftSummaries.clear();
    await offlineDb?.composerDurability.clear();
    await offlineDb?.ownerActivity.clear();
    await hydrateOwnerOfflineActivitySession(
      OWNER,
      "test-session-generation-owner-a-1234",
    );
  });

  it("admits a stored generation only after commit and an independent exact read-back", async () => {
    const context: OwnerComposerDurabilityWriteContext = {
      durability: {
        ownerUserId: OWNER,
        draftId: DRAFT_ID,
        participantNonce: PARTICIPANT_NONCE,
        generation: 7,
      },
    };
    const receipt = await upsertOfflineDraft(
      {
        ownerUserId: OWNER,
        id: DRAFT_ID,
        kind: "first_entry",
        payload: draftPayload(
          new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" }),
        ),
      },
      context,
    );

    expect(receipt).toEqual({
      status: "confirmed",
      protocol: OWNER_COMPOSER_DURABILITY_PROTOCOL,
      participantNonce: PARTICIPANT_NONCE,
      generation: 7,
      disposition: "stored",
      storedByteLength: expect.any(Number),
      storedDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      vaultGeneration: expect.any(String),
    });
    expect(receipt.storedByteLength).toBeGreaterThan(4);
    expect(await offlineDb?.composerDurability.get([OWNER, DRAFT_ID])).toEqual(
      expect.objectContaining({
        ownerUserId: OWNER,
        draftId: DRAFT_ID,
        participantNonce: PARTICIPANT_NONCE,
        generation: 7,
        disposition: "stored",
        storedDigest: receipt.storedDigest,
      }),
    );
  });

  it("rejects a committed write when the separate receipt read-back is stale", async () => {
    const staleRead = vi
      .spyOn(offlineDb!.composerDurability, "get")
      .mockResolvedValueOnce(undefined);

    await expect(
      upsertOfflineDraft(
        {
          ownerUserId: OWNER,
          id: DRAFT_ID,
          kind: "first_entry",
          payload: draftPayload(null),
        },
        {
          durability: {
            ownerUserId: OWNER,
            draftId: DRAFT_ID,
            participantNonce: PARTICIPANT_NONCE,
            generation: 3,
          },
        },
      ),
    ).rejects.toBeInstanceOf(OwnerComposerDurabilityUnconfirmedError);

    expect(staleRead).toHaveBeenCalledOnce();
    expect(await offlineDb?.drafts.get([OWNER, DRAFT_ID])).toBeDefined();
  });

  it("rejects owner or draft drift before any IndexedDB effect", async () => {
    await expect(
      upsertOfflineDraft(
        {
          ownerUserId: OWNER,
          id: DRAFT_ID,
          kind: "first_entry",
          payload: draftPayload(null),
        },
        {
          durability: {
            ownerUserId: "00000000-0000-4000-8000-0000000000b2",
            draftId: "another-draft",
            participantNonce: PARTICIPANT_NONCE,
            generation: 1,
          },
        },
      ),
    ).rejects.toMatchObject({ reason: "corrupt_record" });
    expect(await offlineDb?.drafts.get([OWNER, DRAFT_ID])).toBeUndefined();
    expect(
      await offlineDb?.composerDurability.get([OWNER, DRAFT_ID]),
    ).toBeUndefined();
  });

  it("keeps a mismatched generation retryable instead of advancing persistence", async () => {
    let returnExactReceipt = false;
    const persist = vi.fn(
      async (
        _snapshot: { body: string },
        context: OwnerComposerDurabilityWriteContext,
      ): Promise<OwnerComposerDurabilityReceipt> => ({
        status: "confirmed",
        protocol: OWNER_COMPOSER_DURABILITY_PROTOCOL,
        participantNonce: context.durability.participantNonce,
        generation: returnExactReceipt
          ? context.durability.generation
          : context.durability.generation - 1,
        disposition: "stored",
        storedByteLength: 12,
        storedDigest: "a".repeat(64),
        vaultGeneration: "ove293-shared-v6",
      }),
    );
    const controller = createDurableOwnerComposerPersistenceController({
      ownerUserId: OWNER,
      draftId: DRAFT_ID,
      participantNonce: PARTICIPANT_NONCE,
      persist,
    });
    controller.updateSnapshot({ body: "latest" });

    await expect(controller.persistLatest()).rejects.toBeInstanceOf(
      OwnerComposerDurabilityUnconfirmedError,
    );
    returnExactReceipt = true;
    await expect(controller.persistLatest()).resolves.toBeUndefined();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(
      persist.mock.calls.map((call) => call[1].durability.generation),
    ).toEqual([1, 1]);
    controller.dispose();
  });

  it("proves an empty composer disposition through a tombstone read-back", async () => {
    await upsertOfflineDraft({
      ownerUserId: OWNER,
      id: DRAFT_ID,
      kind: "first_entry",
      payload: draftPayload(null),
    });

    const receipt = await deleteOfflineDraft(OWNER, DRAFT_ID, {
      durability: {
        ownerUserId: OWNER,
        draftId: DRAFT_ID,
        participantNonce: PARTICIPANT_NONCE,
        generation: 9,
      },
    });

    expect(receipt).toEqual(
      expect.objectContaining({
        status: "confirmed",
        participantNonce: PARTICIPANT_NONCE,
        generation: 9,
        disposition: "deleted",
        storedByteLength: 0,
        storedDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(await offlineDb?.drafts.get([OWNER, DRAFT_ID])).toBeUndefined();
  });

  it("invalidates an older receipt when an ordinary write cannot prove its generation", async () => {
    await upsertOfflineDraft(
      {
        ownerUserId: OWNER,
        id: DRAFT_ID,
        kind: "first_entry",
        payload: draftPayload(null),
      },
      {
        durability: {
          ownerUserId: OWNER,
          draftId: DRAFT_ID,
          participantNonce: PARTICIPANT_NONCE,
          generation: 1,
        },
      },
    );

    await upsertOfflineDraft({
      ownerUserId: OWNER,
      id: DRAFT_ID,
      kind: "first_entry",
      payload: { ...draftPayload(null), catalogQuery: "new unproved state" },
    });

    expect(
      await offlineDb?.composerDurability.get([OWNER, DRAFT_ID]),
    ).toBeUndefined();
  });

  it("fails closed when fingerprint traversal touches its hard bound", async () => {
    await expect(
      fingerprintOwnerComposerPayload(
        Array.from({ length: 9_999 }, (_, index) => ({ index })),
      ),
    ).rejects.toMatchObject({ reason: "inventory_bounded" });
  });

  it("keeps every production composer on the exact-receipt factory", async () => {
    const sources = await Promise.all([
      readComposerSource("../../app/garden/first-entry-composer.tsx"),
      readComposerSource("../../app/garden/space-entry-composer.tsx"),
      readComposerSource(
        "../../app/garden/objects/[objectId]/follow-up-entry-composer.tsx",
      ),
    ]);

    for (const source of sources) {
      expect(source).toContain(
        "createDurableOwnerComposerPersistenceController",
      );
      expect(source).not.toMatch(
        /createOwnerComposerPersistenceController\s*</,
      );
    }
  });
});

function readComposerSource(relativePath: string) {
  return readFile(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

function draftPayload(blob: Blob | null): FirstEntryDraftPayload {
  return {
    clientMutationId: "composer-durability-test",
    draft: {
      spaceName: "",
      plantName: "Tomato",
      objectKind: "plant",
      title: "",
      body: "private body",
      entryDate: "2026-08-10",
      locationVisibility: "hidden",
      coarseRegionCode: "",
    },
    catalogQuery: "",
    selectedCatalogItem: null,
    userAddedCatalogName: null,
    activationSource: null,
    photoIntent: blob
      ? {
          fileName: "private.webp",
          contentType: "image/webp",
          size: blob.size,
          blob,
        }
      : null,
  };
}
