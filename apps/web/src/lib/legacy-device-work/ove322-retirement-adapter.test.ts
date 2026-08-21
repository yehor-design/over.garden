import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  FirstEntryDraftPayload,
  FollowUpEntryDraftPayload,
  SpaceEntryDraftPayload,
} from "@/lib/offline/drafts";
import { offlineDb, type OfflineMutation } from "@/lib/offline/queue";
import {
  OWNER_VAULT_CONTROL_DATABASE,
  offlineOwnerVaultDatabaseName,
  OwnerVaultDb,
} from "@/lib/offline/owner-vault";
import {
  createOve322LegacyDeviceRetirementPort,
  legacyDraftToServerPayload,
  legacyMutationToOnlineRequest,
  stableRetirementUploadGenerationId,
} from "./ove322-retirement-adapter";
import type { LegacyRetirementIdentity } from "@/lib/retirement/legacy-device-retirement";
import type { KnownClientStorageEnvironment } from "@/lib/retirement/known-client-storage";

const OWNER = "00000000-0000-4000-8000-000000000322";
const FOREIGN_OWNER = "00000000-0000-4000-8000-000000000323";
const BINDING = "B".repeat(43);
const FOREIGN_BINDING = "F".repeat(43);
const IDENTITY: LegacyRetirementIdentity = {
  ownerUserId: OWNER,
  ownerVaultBinding: BINDING,
  sessionGeneration: "S".repeat(43),
  documentMutationGeneration: "signed-document-generation",
};

describe("OVE-322 read-only legacy adapter", () => {
  beforeEach(async () => {
    await clearDatabases();
  });

  afterEach(async () => {
    await clearDatabases();
  });

  it("maps all three legacy draft kinds to the OVE-321 server draft contract", () => {
    expect(
      legacyDraftToServerPayload(
        legacyDraft("first-entry", "first_entry", firstDraftPayload()),
      ),
    ).toMatchObject({
      draftKey: "first-entry",
      draftKind: "first_entry",
      context: { spaceId: null },
      payload: {
        schemaVersion: 1,
        draftKind: "first_entry",
        request: {
          target: "first_plant_entry",
          clientMutationId: "mutation-first",
          title: "First title",
          body: "First body",
          syncStatus: "online",
        },
      },
    });
    expect(
      legacyDraftToServerPayload(
        legacyDraft(
          "follow-up-entry:00000000-0000-4000-8000-000000000010",
          "follow_up_entry",
          followUpDraftPayload(),
        ),
      ),
    ).toMatchObject({
      draftKind: "follow_up",
      context: { plantObjectId: "00000000-0000-4000-8000-000000000010" },
      payload: {
        draftKind: "follow_up",
        request: { target: "plant_object_entry" },
      },
    });
    expect(
      legacyDraftToServerPayload(
        legacyDraft(
          "space-entry:00000000-0000-4000-8000-000000000020",
          "space_entry",
          spaceDraftPayload(),
        ),
      ),
    ).toMatchObject({
      draftKind: "space_entry",
      context: { spaceId: "00000000-0000-4000-8000-000000000020" },
      payload: {
        draftKind: "space_entry",
        request: {
          target: "space_entry",
          mentionedPlantObjectIds: ["00000000-0000-4000-8000-000000000010"],
        },
      },
    });
  });

  it("maps every legacy journal row state to the positive online request", () => {
    for (const status of ["queued", "syncing", "failed", "synced"] as const) {
      const request = legacyMutationToOnlineRequest(
        mutation(`mutation-${status}`, status),
      );
      expect(request).toMatchObject({
        target: "plant_object_entry",
        clientMutationId: `idempotency-${status}`,
        syncStatus: "online",
      });
    }
  });

  it("derives stable RFC-4122 upload generations without exposing source keys", async () => {
    const first = await stableRetirementUploadGenerationId(
      "opaque-item-token",
      "inline:block-1",
    );
    const retry = await stableRetirementUploadGenerationId(
      "opaque-item-token",
      "inline:block-1",
    );
    const other = await stableRetirementUploadGenerationId(
      "opaque-item-token",
      "cover",
    );

    expect(first).toBe(retry);
    expect(first).not.toBe(other);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first).not.toMatch(/opaque|block|cover/);
  });

  it("does not create a legacy database while inspecting an empty browser without enumeration", async () => {
    offlineDb?.close();
    await Dexie.delete("overgarden-offline");
    await Dexie.delete(offlineOwnerVaultDatabaseName(BINDING));
    await Dexie.delete(OWNER_VAULT_CONTROL_DATABASE);
    const port = createOve322LegacyDeviceRetirementPort({
      fetchImpl: vi.fn(),
      databaseNames: async () => null,
    });

    await expect(
      port.inspect(IDENTITY, new AbortController().signal),
    ).resolves.toMatchObject({
      items: [],
      capability: "enumeration_unavailable",
    });
    await expect(Dexie.exists("overgarden-offline")).resolves.toBe(false);
    await expect(
      Dexie.exists(offlineOwnerVaultDatabaseName(BINDING)),
    ).resolves.toBe(false);
    await expect(Dexie.exists(OWNER_VAULT_CONTROL_DATABASE)).resolves.toBe(
      false,
    );
  });

  it("retains an unattributable pre-owner shared database without upgrading or clearing it", async () => {
    offlineDb?.close();
    await Dexie.delete("overgarden-offline");
    const legacy = new Dexie("overgarden-offline");
    legacy.version(2).stores({
      mutations: "id, kind, status, idempotencyKey, createdAt, updatedAt",
      drafts: "id, kind, createdAt, updatedAt",
    });
    await legacy.open();
    await legacy.table("mutations").put({
      id: "unattributable-mutation",
      kind: "journal_entry",
      status: "queued",
      idempotencyKey: "legacy-key",
      payload: { title: "Private legacy title" },
      createdAt: 1,
      updatedAt: 1,
    });
    await legacy.table("drafts").put({
      id: "unattributable-draft",
      kind: "first_entry",
      payload: { title: "Private legacy draft" },
      createdAt: 1,
      updatedAt: 1,
    });
    legacy.close();
    const port = createOve322LegacyDeviceRetirementPort({
      fetchImpl: vi.fn(),
      databaseNames: async () => ["overgarden-offline"],
    });

    await expect(
      port.inspect(IDENTITY, new AbortController().signal),
    ).resolves.toMatchObject({
      items: [],
      foreignOwnerResidueCount: 1,
    });

    const readback = new Dexie("overgarden-offline");
    await readback.open();
    expect(readback.verno).toBe(2);
    await expect(readback.table("mutations").count()).resolves.toBe(1);
    await expect(readback.table("drafts").count()).resolves.toBe(1);
    readback.close();
  });

  it("reads an owner-scoped v3 shared database without creating summary or durability records", async () => {
    offlineDb?.close();
    await Dexie.delete("overgarden-offline");
    const legacy = new Dexie("overgarden-offline");
    legacy.version(3).stores({
      mutations:
        "id, ownerUserId, &[ownerUserId+idempotencyKey], [ownerUserId+status], createdAt, updatedAt",
      drafts:
        "[ownerUserId+id], ownerUserId, [ownerUserId+kind], createdAt, updatedAt",
    });
    await legacy.open();
    await legacy.table("mutations").put(mutation("legacy-v3", "queued"));
    await legacy
      .table("drafts")
      .put(legacyDraft("first-entry", "first_entry", firstDraftPayload()));
    legacy.close();
    const port = createOve322LegacyDeviceRetirementPort({
      fetchImpl: vi.fn(),
      databaseNames: async () => ["overgarden-offline"],
    });

    const inventory = await port.inspect(
      IDENTITY,
      new AbortController().signal,
    );
    expect(inventory.items.map(({ kind }) => kind).sort()).toEqual([
      "draft",
      "mutation",
    ]);

    const readback = new Dexie("overgarden-offline");
    await readback.open();
    expect(readback.verno).toBe(3);
    expect(readback.tables.map(({ name }) => name).sort()).toEqual([
      "drafts",
      "mutations",
    ]);
    await expect(readback.table("mutations").count()).resolves.toBe(1);
    await expect(readback.table("drafts").count()).resolves.toBe(1);
    readback.close();
  });

  it("inventories only current-owner content while reporting foreign residue opaquely", async () => {
    await offlineDb!.drafts.bulkPut([
      legacyDraft("first-entry", "first_entry", firstDraftPayload()),
      {
        ...legacyDraft("foreign", "first_entry", firstDraftPayload()),
        ownerUserId: FOREIGN_OWNER,
      },
    ]);
    await offlineDb!.mutations.put(mutation("mutation-current", "queued"));
    const ownerVault = new OwnerVaultDb(BINDING);
    await ownerVault.open();
    await ownerVault.drafts.put(
      legacyDraft(
        "follow-up-entry:00000000-0000-4000-8000-000000000010",
        "follow_up_entry",
        followUpDraftPayload(),
      ),
    );
    ownerVault.close();
    const foreignVault = new OwnerVaultDb(FOREIGN_BINDING);
    await foreignVault.open();
    foreignVault.close();

    const port = createOve322LegacyDeviceRetirementPort({
      fetchImpl: vi.fn(),
      databaseNames: async () => [
        "overgarden-offline",
        offlineOwnerVaultDatabaseName(BINDING),
        offlineOwnerVaultDatabaseName(FOREIGN_BINDING),
      ],
    });
    const inventory = await port.inspect(
      IDENTITY,
      new AbortController().signal,
    );

    expect(inventory.items).toHaveLength(3);
    expect(inventory.items.map(({ kind }) => kind).sort()).toEqual([
      "draft",
      "draft",
      "mutation",
    ]);
    expect(inventory.foreignOwnerResidueCount).toBeGreaterThan(0);
    expect(inventory.foreignBindingCount).toBe(1);
    expect(JSON.stringify(inventory)).not.toContain(FOREIGN_OWNER);
    expect(JSON.stringify(inventory)).not.toMatch(/First body|First title/);
  });

  it("verifies a server effect before deleting only the exact current-owner rows", async () => {
    const current = mutation("mutation-current", "queued");
    await offlineDb!.mutations.bulkPut([
      current,
      { ...mutation("mutation-foreign", "queued"), ownerUserId: FOREIGN_OWNER },
    ]);
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url === "/api/offline/owner-vault-binding") {
          return Response.json({
            protocol: "ove288.owner-vault-binding.v1",
            binding: BINDING,
            sessionGeneration: IDENTITY.sessionGeneration,
          });
        }
        if (url === "/api/garden/entries" && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          return Response.json({
            entry: {
              id: "00000000-0000-4000-8000-000000000099",
              clientMutationId: body.clientMutationId,
            },
            space: {},
            plantObject: {},
            readbackUrl: "/garden",
          });
        }
        if (url.startsWith("/api/garden/entries?")) {
          return Response.json({
            entry: {
              id: "00000000-0000-4000-8000-000000000099",
              clientMutationId: current.idempotencyKey,
            },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    const port = createOve322LegacyDeviceRetirementPort({
      fetchImpl: fetchImpl as typeof fetch,
      databaseNames: async () => ["overgarden-offline"],
      storageEnvironment: fakeKnownStorageEnvironment(),
    });
    const inventory = await port.inspect(
      IDENTITY,
      new AbortController().signal,
    );
    const item = inventory.items.find(({ kind }) => kind === "mutation")!;

    await expect(
      port.transferAndVerify(item, IDENTITY, new AbortController().signal),
    ).resolves.toEqual({ status: "verified" });
    await port.deleteVerifiedBatch(
      [item],
      IDENTITY,
      new AbortController().signal,
    );

    await expect(offlineDb!.mutations.get(current.id)).resolves.toBeUndefined();
    await expect(
      offlineDb!.mutations.get("mutation-foreign"),
    ).resolves.toMatchObject({ ownerUserId: FOREIGN_OWNER });
    const journalRequest = fetchImpl.mock.calls.find(([input, init]) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      return url === "/api/garden/entries" && init?.method === "POST";
    });
    expect(
      new Headers(journalRequest?.[1]?.headers).get(
        "x-overgarden-online-journal-protocol",
      ),
    ).toBe("ove321.server-authoritative-journal.v1");

    await expect(
      port.finalize(IDENTITY, new AbortController().signal),
    ).resolves.toEqual({
      status: "completed",
      absenceReads: 2,
      foreignOwnerResidue: true,
      foreignOrOrphanRetained: false,
    });
    await expect(Dexie.exists("overgarden-offline")).resolves.toBe(true);
    await expect(Dexie.exists(OWNER_VAULT_CONTROL_DATABASE)).resolves.toBe(
      false,
    );
  });
});

function legacyDraft(
  id: string,
  kind: "first_entry" | "follow_up_entry" | "space_entry",
  payload:
    | FirstEntryDraftPayload
    | FollowUpEntryDraftPayload
    | SpaceEntryDraftPayload,
) {
  return {
    id,
    ownerUserId: OWNER,
    kind,
    payload,
    createdAt: 1_786_381_100_000,
    updatedAt: 1_786_381_200_000,
  };
}

function firstDraftPayload(): FirstEntryDraftPayload {
  return {
    clientMutationId: "mutation-first",
    draft: {
      spaceId: null,
      spaceName: "Balcony",
      plantName: "Tomato",
      objectKind: "plant",
      title: "First title",
      body: "First body",
      entryDate: "2026-08-20",
      locationVisibility: "hidden",
      coarseRegionCode: "",
    },
    catalogQuery: "tomato",
    selectedCatalogItem: null,
    userAddedCatalogName: "Tomato",
    activationSource: "direct_garden",
    mentionSelections: [],
    topicTagInput: "watering",
    photoIntent: null,
  };
}

function followUpDraftPayload(): FollowUpEntryDraftPayload {
  return {
    clientMutationId: "mutation-follow-up",
    plantObjectId: "00000000-0000-4000-8000-000000000010",
    draft: {
      title: "Follow-up title",
      body: "Follow-up body",
      entryDate: "2026-08-20",
    },
    mentionSelections: [],
    topicTagInput: "growth",
    photoIntent: null,
  };
}

function spaceDraftPayload(): SpaceEntryDraftPayload {
  return {
    clientMutationId: "mutation-space",
    spaceId: "00000000-0000-4000-8000-000000000020",
    mentionedPlantObjectIds: ["00000000-0000-4000-8000-000000000010"],
    draft: {
      title: "Space title",
      body: "Space body",
      entryDate: "2026-08-20",
    },
    topicTagInput: "balcony",
    photoIntent: null,
  };
}

function mutation(
  id: string,
  status: OfflineMutation["status"],
): OfflineMutation {
  return {
    id,
    ownerUserId: OWNER,
    kind: "journal_entry",
    idempotencyKey: `idempotency-${status}`,
    status,
    payload: {
      target: "plant_object_entry",
      plantObjectId: "00000000-0000-4000-8000-000000000010",
      title: "Legacy title",
      body: "Legacy body",
      entryDate: "2026-08-20",
      clientMutationId: `payload-${status}`,
      syncStatus: status === "queued" ? "offline_queued" : "online",
    },
    createdAt: 1_786_381_100_000,
    updatedAt: 1_786_381_200_000,
  };
}

async function clearDatabases() {
  offlineDb?.close();
  await Dexie.delete("overgarden-offline");
  await Dexie.delete(offlineOwnerVaultDatabaseName(BINDING));
  await Dexie.delete(offlineOwnerVaultDatabaseName(FOREIGN_BINDING));
  await Dexie.delete(OWNER_VAULT_CONTROL_DATABASE);
  await offlineDb?.open();
}

function fakeKnownStorageEnvironment(): KnownClientStorageEnvironment {
  const factory = indexedDB as IDBFactory & {
    databases(): Promise<IDBDatabaseInfo[]>;
  };
  return {
    origin: "https://over.garden",
    indexedDb: {
      databases: () => factory.databases(),
      deleteDatabase: (name) => factory.deleteDatabase(name) as never,
    },
    caches: { keys: async () => [] },
    serviceWorker: null,
  };
}
