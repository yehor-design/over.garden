import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FirstPlantEntryRequest } from "@/lib/garden/entry-contracts";
import {
  enqueueOfflineMutation,
  getOfflineMutation,
  offlineDb,
  type OfflineJournalEntryPayload,
} from "./queue";
import {
  buildJournalEntryRequestBodyForSync,
  syncOfflineJournalEntryMutation,
} from "./journal-entry-sync";

const payload: OfflineJournalEntryPayload = {
  spaceName: "Balcony",
  plantName: "Cherry tomato",
  catalogItemId: "00000000-0000-4000-8000-000000000101",
  varietyText: "Помідор чері",
  title: "First flowers",
  body: "Two new flower clusters.",
  entryDate: "2026-06-26",
  clientMutationId: "payload-entry-id",
};

describe("offline journal entry sync", () => {
  beforeEach(async () => {
    await offlineDb?.mutations.clear();
    vi.unstubAllGlobals();
  });

  it("builds retry requests with the queue idempotency key", () => {
    const body = buildJournalEntryRequestBodyForSync(
      payload,
      "queue-entry-id",
      "media-1",
    );

    expect(body.clientMutationId).toBe("queue-entry-id");
    expect(body.catalogItemId).toBe("00000000-0000-4000-8000-000000000101");
    expect(body.mediaAssetId).toBe("media-1");
    expect(body.syncStatus).toBe("online");
    expect(body.title).toBe("First flowers");
  });

  it("marks queued offline payloads as offline synced on the canonical request", () => {
    const body = buildJournalEntryRequestBodyForSync(
      { ...payload, syncStatus: "offline_queued" },
      "queue-entry-id",
      null,
    );

    expect(body.syncStatus).toBe("offline_synced");
  });

  it("builds existing-object follow-up requests without creating a new space or plant", () => {
    const body = buildJournalEntryRequestBodyForSync(
      {
        target: "plant_object_entry",
        plantObjectId: "object-1",
        title: "Second flowering wave",
        body: "The same plant has stronger new leaves.",
        entryDate: "2026-06-27",
        clientMutationId: "payload-entry-id",
        syncStatus: "offline_queued",
      },
      "queue-entry-id",
      "media-1",
    );

    expect(body.target).toBe("plant_object_entry");
    expect(body.plantObjectId).toBe("object-1");
    expect(body.clientMutationId).toBe("queue-entry-id");
    expect(body.mediaAssetId).toBe("media-1");
    expect(body.syncStatus).toBe("offline_synced");
    expect(body.spaceName).toBeUndefined();
    expect(body.plantName).toBeUndefined();
    expect(body.catalogItemId).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("latitude");
    expect(JSON.stringify(body)).not.toContain("longitude");
    expect(JSON.stringify(body)).not.toContain("referrer");
  });

  it("keeps user-added catalog names in retry requests", () => {
    const body = buildJournalEntryRequestBodyForSync(
      {
        ...payload,
        catalogItemId: null,
        userAddedCatalogName: "Бабусин перець",
        varietyText: "Бабусин перець",
      },
      "queue-entry-id",
      null,
    );

    expect(body.catalogItemId).toBeNull();
    expect(body.userAddedCatalogName).toBe("Бабусин перець");
    expect(body.varietyText).toBe("Бабусин перець");
  });

  it("keeps coarse region selection in retry requests", () => {
    const body = buildJournalEntryRequestBodyForSync(
      {
        ...payload,
        locationVisibility: "region",
        coarseRegionCode: "UA-30",
      },
      "queue-entry-id",
      null,
    );

    expect(body.locationVisibility).toBe("region");
    expect(body.coarseRegionCode).toBe("UA-30");
  });

  it("keeps privacy-safe activation source in retry requests", () => {
    const body = buildJournalEntryRequestBodyForSync(
      {
        ...payload,
        activationSource: "homepage",
      },
      "queue-entry-id",
      null,
    );

    expect(body.activationSource).toBe("homepage");
    expect(JSON.stringify(body)).not.toContain("referrer");
    expect(JSON.stringify(body)).not.toContain("user_agent");
    expect(JSON.stringify(body)).not.toContain("public_url");
  });

  it("syncs a queued entry through the canonical create endpoint", async () => {
    const requests: FirstPlantEntryRequest[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("/api/garden/entries");
        requests.push(JSON.parse(String(init?.body)) as FirstPlantEntryRequest);
        return Response.json({
          space: {
            id: "space-1",
            displayName: "Balcony",
            locationVisibility: "hidden",
          },
          plantObject: {
            id: "object-1",
            displayName: "Cherry tomato",
            catalogItemId: "00000000-0000-4000-8000-000000000101",
            varietyText: "Помідор чері",
            varietyState: "selected",
            locationVisibility: "hidden",
          },
          entry: {
            id: "entry-1",
            title: "First flowers",
            body: "Two new flower clusters.",
            entryDate: "2026-06-26",
            clientMutationId: "queue-entry-id",
          },
          readbackUrl: "/garden/objects/object-1",
        });
      }),
    );
    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload,
      idempotencyKey: "queue-entry-id",
    });

    const result = await syncOfflineJournalEntryMutation(mutation);
    const synced = await getOfflineMutation(mutation.id);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.clientMutationId).toBe("queue-entry-id");
    expect(result.readbackUrl).toBe("/garden/objects/object-1");
    expect(synced?.status).toBe("synced");
    expect(synced?.syncResult).toEqual(result);
  });

  it("syncs a queued existing-object follow-up through the canonical endpoint", async () => {
    const requests: FirstPlantEntryRequest[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("/api/garden/entries");
        requests.push(JSON.parse(String(init?.body)) as FirstPlantEntryRequest);
        return Response.json({
          space: {
            id: "space-1",
            displayName: "Balcony",
            locationVisibility: "hidden",
          },
          plantObject: {
            id: "object-1",
            displayName: "Cherry tomato",
            catalogItemId: "00000000-0000-4000-8000-000000000101",
            varietyText: "Помідор чері",
            varietyState: "selected",
            locationVisibility: "hidden",
          },
          entry: {
            id: "entry-2",
            title: "Second flowering wave",
            body: "The same plant has stronger new leaves.",
            entryDate: "2026-06-27",
            clientMutationId: "queue-entry-id",
          },
          readbackUrl: "/garden/objects/object-1",
        });
      }),
    );
    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload: {
        target: "plant_object_entry",
        plantObjectId: "object-1",
        title: "Second flowering wave",
        body: "The same plant has stronger new leaves.",
        entryDate: "2026-06-27",
        clientMutationId: "payload-entry-id",
        syncStatus: "offline_queued",
      },
      idempotencyKey: "queue-entry-id",
    });

    const result = await syncOfflineJournalEntryMutation(mutation);
    const synced = await getOfflineMutation(mutation.id);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.target).toBe("plant_object_entry");
    expect(requests[0]?.plantObjectId).toBe("object-1");
    expect(requests[0]?.spaceName).toBeUndefined();
    expect(requests[0]?.plantName).toBeUndefined();
    expect(requests[0]?.clientMutationId).toBe("queue-entry-id");
    expect(requests[0]?.syncStatus).toBe("offline_synced");
    expect(result.readbackUrl).toBe("/garden/objects/object-1");
    expect(synced?.status).toBe("synced");
    expect(synced?.syncResult).toEqual(result);
  });

  it("marks failed sync without losing entry body or photo intent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Server unavailable." }, { status: 503 }),
      ),
    );
    const failedPayload: OfflineJournalEntryPayload = {
      ...payload,
      photoIntent: {
        fileName: "tomato.jpg",
        contentType: "image/jpeg",
        size: 123,
        blob: new Blob(["photo"], { type: "image/jpeg" }),
      },
    };
    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload: failedPayload,
      idempotencyKey: "queue-entry-id",
    });

    await expect(syncOfflineJournalEntryMutation(mutation)).rejects.toThrow(
      "Server unavailable.",
    );
    const failed = await getOfflineMutation(mutation.id);

    expect(failed?.status).toBe("failed");
    expect(failed?.lastError).toBe("Server unavailable.");
    expect((failed?.payload as OfflineJournalEntryPayload).body).toBe(
      "Two new flower clusters.",
    );
    expect(
      (failed?.payload as OfflineJournalEntryPayload).photoIntent?.fileName,
    ).toBe("tomato.jpg");
  });

  it("stores processed media before final entry create so retry reuses it", async () => {
    const requests: FirstPlantEntryRequest[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/media/uploads") {
          return Response.json({
            mediaAssetId: "media-1",
            uploadUrl: "https://upload.example/quarantine/key",
          });
        }

        if (url === "https://upload.example/quarantine/key") {
          expect(init?.method).toBe("PUT");
          return new Response(null, { status: 200 });
        }

        if (url === "/api/media/process") {
          return Response.json({
            mediaAsset: {
              id: "media-1",
              status: "processed",
              derivative_key: "derivatives/photo.webp",
            },
            publicUrl: "https://media.over.garden/derivatives/photo.webp",
          });
        }

        if (url === "/api/garden/entries") {
          requests.push(
            JSON.parse(String(init?.body)) as FirstPlantEntryRequest,
          );
          return Response.json({
            space: {
              id: "space-1",
              displayName: "Balcony",
              locationVisibility: "hidden",
            },
            plantObject: {
              id: "object-1",
              displayName: "Cherry tomato",
              catalogItemId: "00000000-0000-4000-8000-000000000101",
              varietyText: "Помідор чері",
              varietyState: "selected",
              locationVisibility: "hidden",
            },
            entry: {
              id: "entry-1",
              title: "First flowers",
              body: "Two new flower clusters.",
              entryDate: "2026-06-26",
              clientMutationId: "queue-entry-id",
            },
            readbackUrl: "/garden/objects/object-1",
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const photoPayload: OfflineJournalEntryPayload = {
      ...payload,
      photoIntent: {
        fileName: "tomato.jpg",
        contentType: "image/jpeg",
        size: 123,
        blob: new Blob(["photo"], { type: "image/jpeg" }),
      },
    };
    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload: photoPayload,
      idempotencyKey: "queue-entry-id",
    });

    await syncOfflineJournalEntryMutation(mutation);
    const synced = await getOfflineMutation(mutation.id);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.clientMutationId).toBe("queue-entry-id");
    expect(requests[0]?.catalogItemId).toBe(
      "00000000-0000-4000-8000-000000000101",
    );
    expect(requests[0]?.mediaAssetId).toBe("media-1");
    expect(
      (synced?.payload as OfflineJournalEntryPayload).processedMediaAssetId,
    ).toBe("media-1");
    expect(synced?.status).toBe("synced");
  });
});
