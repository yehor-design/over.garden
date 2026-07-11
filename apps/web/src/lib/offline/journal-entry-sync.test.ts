import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FirstPlantEntryRequest } from "@/lib/garden/entry-contracts";
import { appendVoiceTranscriptToBody } from "@/lib/garden/voice-to-text";
import {
  enqueueOfflineMutation,
  getOfflineMutation,
  offlineDb,
  type OfflineJournalEntryPayload,
} from "./queue";
import {
  buildJournalEntryRequestBodyForSync,
  journalEntryAuthReturnTo,
  JournalEntrySyncError,
  submitJournalEntryPayload,
  syncOfflineJournalEntryMutation,
} from "./journal-entry-sync";

const AUTH_RETURN_HEADER = "x-overgarden-auth-return";
const OBJECT_ID = "00000000-0000-4000-8000-000000000201";

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
    await offlineDb?.drafts.clear();
    vi.unstubAllGlobals();
  });

  it("builds retry requests with the queue idempotency key", () => {
    const body = buildJournalEntryRequestBodyForSync(
      payload,
      "queue-entry-id",
      "media-1",
    );

    expect(body.clientMutationId).toBe("queue-entry-id");
    expect(body.objectKind).toBe("plant");
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

  it("keeps bounded topic tags in retry requests", () => {
    const body = buildJournalEntryRequestBodyForSync(
      {
        ...payload,
        topicTags: ["watering", "seedlings"],
        syncStatus: "offline_queued",
      },
      "queue-entry-id",
      null,
    );

    expect(body.topicTags).toEqual(["watering", "seedlings"]);
    expect(JSON.stringify(body.topicTags)).not.toMatch(
      /email|phone|coordinate|latitude|longitude|media_key|token/i,
    );
  });

  it("saves dictated body text as normal body text without audio metadata", () => {
    const body = buildJournalEntryRequestBodyForSync(
      {
        ...payload,
        body: appendVoiceTranscriptToBody(
          "Started by typing.",
          "two new flower clusters after rain",
        ),
        syncStatus: "offline_queued",
      },
      "queue-entry-id",
      null,
    );
    const serialized = JSON.stringify(body);

    expect(body.body).toBe(
      "Started by typing.\ntwo new flower clusters after rain",
    );
    expect(serialized).not.toMatch(/audio|recording|speechBlob/i);
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
    expect(body.objectKind).toBeUndefined();
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

  it("uses the garden as the first-entry authentication return target", () => {
    expect(journalEntryAuthReturnTo(payload)).toBe("/garden");
  });

  it("uses the exact object as a follow-up authentication return target", () => {
    expect(
      journalEntryAuthReturnTo({
        target: "plant_object_entry",
        plantObjectId: OBJECT_ID,
        title: "Second flowering wave",
        body: "The same plant has stronger new leaves.",
        entryDate: "2026-06-27",
        clientMutationId: "payload-entry-id",
      }),
    ).toBe(`/garden/objects/${OBJECT_ID}`);
  });

  it("falls back to the garden when a follow-up object id is malformed", () => {
    expect(
      journalEntryAuthReturnTo({
        target: "plant_object_entry",
        plantObjectId: "not-a-safe-route-id",
        title: "Second flowering wave",
        body: "The same plant has stronger new leaves.",
        entryDate: "2026-06-27",
        clientMutationId: "payload-entry-id",
      }),
    ).toBe("/garden");
  });

  it("syncs a queued entry through the canonical create endpoint", async () => {
    const requests: FirstPlantEntryRequest[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("/api/garden/entries");
        expect(new Headers(init?.headers).get(AUTH_RETURN_HEADER)).toBe(
          "/garden",
        );
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
            objectKind: "plant",
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

  it("surfaces an opaque re-auth destination without copying the draft into it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: "Sign in to save an entry.",
            authIntentUrl: "/auth/intent?intent=opaque-save-intent",
          },
          { status: 401 },
        ),
      ),
    );

    let received: unknown;
    try {
      await submitJournalEntryPayload(payload);
    } catch (error) {
      received = error;
    }

    expect(received).toBeInstanceOf(JournalEntrySyncError);
    expect(received).toMatchObject({
      status: 401,
      authIntentUrl: "/auth/intent?intent=opaque-save-intent",
    });
    expect(JSON.stringify(received)).not.toMatch(
      /Two new flower clusters|Cherry tomato|payload-entry-id/i,
    );
  });

  it("preserves a photo draft when authentication expires before upload", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("/api/media/uploads");
        expect(new Headers(init?.headers).get(AUTH_RETURN_HEADER)).toBe(
          "/garden",
        );
        return Response.json(
          {
            error: "Sign in to continue this photo save.",
            authIntentUrl: "/auth/intent?intent=opaque-media-intent",
          },
          { status: 401 },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const photoPayload: OfflineJournalEntryPayload = {
      ...payload,
      photoIntent: {
        fileName: "private-garden-photo.jpg",
        contentType: "image/jpeg",
        size: 123,
        blob: new Blob(["private-photo-bytes"], { type: "image/jpeg" }),
      },
    };

    let received: unknown;
    try {
      await submitJournalEntryPayload(photoPayload);
    } catch (error) {
      received = error;
    }

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(received).toBeInstanceOf(JournalEntrySyncError);
    expect(received).toMatchObject({
      status: 401,
      authIntentUrl: "/auth/intent?intent=opaque-media-intent",
    });
    expect(JSON.stringify(received)).not.toMatch(
      /private-garden-photo|private-photo-bytes|Two new flower clusters/i,
    );
  });

  it("syncs a queued existing-object follow-up through the canonical endpoint", async () => {
    const requests: FirstPlantEntryRequest[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("/api/garden/entries");
        expect(new Headers(init?.headers).get(AUTH_RETURN_HEADER)).toBe(
          `/garden/objects/${OBJECT_ID}`,
        );
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
            objectKind: "plant",
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
        plantObjectId: OBJECT_ID,
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
    expect(requests[0]?.plantObjectId).toBe(OBJECT_ID);
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

  it("retries a failed mutation with the same canonical idempotency key", async () => {
    const requests: FirstPlantEntryRequest[] = [];
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("/api/garden/entries");
        requests.push(JSON.parse(String(init?.body)) as FirstPlantEntryRequest);
        attempt += 1;

        if (attempt === 1) {
          return Response.json(
            { error: "Temporary network edge failure." },
            { status: 503 },
          );
        }

        return Response.json({
          space: {
            id: "space-1",
            displayName: "Balcony",
            locationVisibility: "hidden",
          },
          plantObject: {
            id: "object-1",
            displayName: "Cherry tomato",
            objectKind: "plant",
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
      payload: { ...payload, syncStatus: "offline_queued" },
      idempotencyKey: "queue-entry-id",
    });

    await expect(syncOfflineJournalEntryMutation(mutation)).rejects.toThrow(
      "Temporary network edge failure.",
    );
    const failed = await getOfflineMutation(mutation.id);
    if (!failed) throw new Error("Expected failed mutation to remain stored.");

    const result = await syncOfflineJournalEntryMutation(failed);
    const synced = await getOfflineMutation(mutation.id);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.clientMutationId).toBe("queue-entry-id");
    expect(requests[1]?.clientMutationId).toBe("queue-entry-id");
    expect(requests[1]?.syncStatus).toBe("offline_synced");
    expect(result.readbackUrl).toBe("/garden/objects/object-1");
    expect(synced?.status).toBe("synced");
  });

  it("stores processed media before final entry create so retry reuses it", async () => {
    const requests: FirstPlantEntryRequest[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/media/uploads") {
          expect(new Headers(init?.headers).get(AUTH_RETURN_HEADER)).toBe(
            "/garden",
          );
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
          expect(new Headers(init?.headers).get(AUTH_RETURN_HEADER)).toBe(
            "/garden",
          );
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
          expect(new Headers(init?.headers).get(AUTH_RETURN_HEADER)).toBe(
            "/garden",
          );
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
              objectKind: "plant",
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
    expect(JSON.stringify(requests[0])).not.toContain("quarantine");
    expect(JSON.stringify(requests[0])).not.toContain("upload.example");
    expect(JSON.stringify(requests[0])).not.toContain("derivatives/photo");
    expect(JSON.stringify(requests[0])).not.toContain("tomato.jpg");
    expect(JSON.stringify(requests[0])).not.toContain("photoIntent");
    expect(
      (synced?.payload as OfflineJournalEntryPayload).processedMediaAssetId,
    ).toBe("media-1");
    expect(synced?.status).toBe("synced");
  });
});
