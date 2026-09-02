import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AtomicJournalCreateRequest,
  AtomicJournalEditRequest,
} from "./entry-contracts";
import {
  ATOMIC_JOURNAL_EDIT_PROTOCOL,
  ATOMIC_JOURNAL_EDIT_PROTOCOL_HEADER,
} from "./entry-contracts";
import {
  LocalJournalMediaCoordinator,
  type EncodedJournalImage,
  type LocalJournalMediaStager,
} from "./local-journal-media-coordinator";
import {
  useLocalJournalComposer,
  type LocalJournalComposerController,
} from "./use-local-journal-composer";

const SESSION_ID = "00000000-0000-4000-8000-000000000100";
const MEDIA_ID = "00000000-0000-4000-8000-000000000101";
const PUBLISH_ID = "00000000-0000-4000-8000-000000000102";
const MUTATION_ID = "00000000-0000-4000-8000-000000000103";
const SECOND_MUTATION_ID = "00000000-0000-4000-8000-000000000105";

function Probe({
  fetcher,
  onRender,
}: {
  fetcher: typeof fetch;
  onRender(value: LocalJournalComposerController): void;
}) {
  onRender(
    useLocalJournalComposer({
      enabled: true,
      dirty: true,
      fallbackReturnTo: "/garden",
      dependencies: {
        fetcher,
        createId: idSequence(SESSION_ID, MEDIA_ID, PUBLISH_ID, MUTATION_ID),
        createCoordinator: ({ stagingSessionId, createId }) =>
          new LocalJournalMediaCoordinator({
            stagingSessionId,
            createId,
            encoder: { encode: vi.fn(async () => encodedImage()) },
            stager: fakeStager(),
            createObjectURL: () => "blob:exact-final-webp",
            revokeObjectURL: vi.fn(),
          }),
        currentLocation: () => "/garden?space=current#space-journal",
      },
    }),
  );
  return null;
}

describe("local-only atomic journal composer", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("does not write before Publish, inserts media immediately, freezes exact order, and replays one identity", async () => {
    const requests: AtomicJournalCreateRequest[] = [];
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        requests.push(
          JSON.parse(String(init?.body)) as AtomicJournalCreateRequest,
        );
        return Response.json({
          entryId: PUBLISH_ID,
          slug: "public-entry-00000000",
          revision: 1,
          card: {
            entryId: PUBLISH_ID,
            title: "Bloom",
            bodyPreview: "Today",
            entryDate: "2026-08-23",
            coverUrl: null,
            publicPath: "/uk/journal/public-entry-00000000",
          },
          returnTo: "/garden?space=current#space-journal",
        });
      },
    ) as unknown as typeof fetch;
    let current!: LocalJournalComposerController;
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <Probe fetcher={fetcher} onRender={(value) => (current = value)} />,
      );
    });

    let selection!: ReturnType<LocalJournalComposerController["selectImage"]>;
    await act(async () => {
      const startedAt = performance.now();
      selection = current.selectImage(
        new File([new Uint8Array([1])], "secret.jpg"),
        "b_image",
      );
      expect(performance.now() - startedAt).toBeLessThan(100);
      expect(selection.mediaAssetId).toBe(MEDIA_ID);
      await selection.ready;
    });
    expect(current.media.items[0]).toMatchObject({
      mediaAssetId: MEDIA_ID,
      status: "ready",
    });
    expect(fetcher).not.toHaveBeenCalled();

    const request = publicationRequest(MEDIA_ID);
    await act(async () => {
      await current.publish(request);
      await current.publish(request);
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(requests[0]).toMatchObject({
      publishId: PUBLISH_ID,
      clientMutationId: MUTATION_ID,
      mediaClaimReceipts: ["receipt-current"],
      returnTo: "/garden?space=current#space-journal",
    });
    expect(requests[1]?.publishId).toBe(requests[0]?.publishId);
    expect(requests[1]?.clientMutationId).toBe(requests[0]?.clientMutationId);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/garden/entries",
      expect.objectContaining({ method: "POST", redirect: "error" }),
    );
    expect(JSON.stringify(requests)).not.toContain("secret.jpg");
    await act(async () => renderer.unmount());
  });

  it("cancels a bounded publish wait back to editable idle state and ignores the late failure", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true },
          );
        }),
    ) as unknown as typeof fetch;
    let current!: LocalJournalComposerController;
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <Probe fetcher={fetcher} onRender={(value) => (current = value)} />,
      );
    });

    let publication!: Promise<unknown>;
    await act(async () => {
      publication = current.publish(publicationRequestWithoutMedia());
      await Promise.resolve();
    });
    expect(current.state.status).toBe("publishing");

    await act(async () => {
      current.cancelPublishing();
      await expect(publication).rejects.toMatchObject({
        code: "publication_cancelled",
      });
    });
    expect(current.state).toEqual({ status: "idle", errorCode: null });
    expect(current.readOnly).toBe(false);

    await act(async () => renderer.unmount());
  });

  it("publishes an atomic edit with retained existing media and only the replacement claim receipt", async () => {
    const requests: AtomicJournalEditRequest[] = [];
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        requests.push(
          JSON.parse(String(init?.body)) as AtomicJournalEditRequest,
        );
        expect(
          new Headers(init?.headers).get(ATOMIC_JOURNAL_EDIT_PROTOCOL_HEADER),
        ).toBe(ATOMIC_JOURNAL_EDIT_PROTOCOL);
        return Response.json({
          entryId: PUBLISH_ID,
          slug: "public-entry-00000000",
          revision: 5,
          card: {
            entryId: PUBLISH_ID,
            title: "Bloom revised",
            bodyPreview: "Today again",
            entryDate: "2026-08-23",
            coverUrl: "https://media.over.garden/replacement.webp",
            publicPath: "/uk/journal/public-entry-00000000",
          },
          returnTo: "/uk/journal/public-entry-00000000",
        });
      },
    ) as unknown as typeof fetch;
    let current!: LocalJournalComposerController;
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <ProbeEdit fetcher={fetcher} onRender={(value) => (current = value)} />,
      );
    });

    await act(async () => {
      await current.replaceImage(
        MEDIA_ID,
        new File([new Uint8Array([4])], "replacement.jpg"),
      ).ready;
      await current.publishEdit({
        entryId: PUBLISH_ID,
        expectedRevision: 4,
        title: "Bloom revised",
        entryDate: "2026-08-23",
        document: {
          schemaVersion: 1,
          blocks: [
            {
              id: "b_text",
              type: "paragraph",
              spans: [{ text: "Today again" }],
            },
            { id: "b_image", type: "image", mediaAssetId: MEDIA_ID },
          ],
        },
        coverMediaAssetId: MEDIA_ID,
        focalPoints: [{ mediaAssetId: MEDIA_ID, x: 0.25, y: 0.75 }],
        returnTo: "/uk/journal/public-entry-00000000",
      });
    });

    expect(fetcher).toHaveBeenCalledWith(
      `/api/garden/entries/${PUBLISH_ID}`,
      expect.objectContaining({ method: "PATCH", redirect: "error" }),
    );
    expect(requests).toEqual([
      expect.objectContaining({
        publishId: PUBLISH_ID,
        clientMutationId: MUTATION_ID,
        expectedRevision: 4,
        newMediaClaimReceipts: ["receipt-current"],
        retainedMediaAssetIds: [MEDIA_ID],
        removedMediaAssetIds: [],
        focalPoints: [{ mediaAssetId: MEDIA_ID, x: 0.25, y: 0.75 }],
      }),
    ]);
    await act(async () => renderer.unmount());
  });

  it("refreezes a new edit identity after a failed claim and same-slot replacement", async () => {
    const requests: AtomicJournalEditRequest[] = [];
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        requests.push(
          JSON.parse(String(init?.body)) as AtomicJournalEditRequest,
        );
        if (requests.length === 1) {
          return Response.json({ code: "claim_timeout" }, { status: 503 });
        }
        return Response.json({
          entryId: PUBLISH_ID,
          slug: "public-entry-00000000",
          revision: 5,
          card: {
            entryId: PUBLISH_ID,
            title: "Bloom revised",
            bodyPreview: "Today again",
            entryDate: "2026-08-23",
            coverUrl: "https://media.over.garden/replacement.webp",
            publicPath: "/uk/journal/public-entry-00000000",
          },
          returnTo: "/uk/journal/public-entry-00000000",
        });
      },
    ) as unknown as typeof fetch;
    const stager: LocalJournalMediaStager = {
      stage: vi.fn(async ({ generation }) => ({
        stagingReceipt: `receipt-generation-${generation}`,
        deleteCapability: `delete-generation-${generation}`,
      })),
      delete: vi.fn(async () => undefined),
    };
    let current!: LocalJournalComposerController;
    let renderer!: ReactTestRenderer;
    const edit = {
      entryId: PUBLISH_ID,
      expectedRevision: 4,
      title: "Bloom revised",
      entryDate: "2026-08-23",
      document: {
        schemaVersion: 1 as const,
        blocks: [
          {
            id: "b_text",
            type: "paragraph" as const,
            spans: [{ text: "Today again" }],
          },
          { id: "b_image", type: "image" as const, mediaAssetId: MEDIA_ID },
        ],
      },
      coverMediaAssetId: MEDIA_ID,
      focalPoints: [{ mediaAssetId: MEDIA_ID, x: 0.25, y: 0.75 }],
      returnTo: "/uk/journal/public-entry-00000000",
    };

    await act(async () => {
      renderer = create(
        <ProbeEdit
          fetcher={fetcher}
          stager={stager}
          onRender={(value) => (current = value)}
        />,
      );
    });
    await act(async () => {
      await current.replaceImage(MEDIA_ID, new File(["first"], "first.jpg"))
        .ready;
      await expect(current.publishEdit(edit)).rejects.toMatchObject({
        code: "claim_timeout",
      });
      await current.replaceImage(MEDIA_ID, new File(["second"], "second.jpg"))
        .ready;
      await current.publishEdit(edit);
    });

    expect(requests.map((request) => request.newMediaClaimReceipts)).toEqual([
      ["receipt-generation-5"],
      ["receipt-generation-5"],
    ]);
    expect(requests.map((request) => request.clientMutationId)).toEqual([
      MUTATION_ID,
      SECOND_MUTATION_ID,
    ]);
    await act(async () => renderer.unmount());
  });

  it("cancels pending local media work before returning the composer to editing", async () => {
    const pending = deferred<EncodedJournalImage>();
    const stage = vi.fn(async () => ({
      stagingReceipt: "receipt-current",
      deleteCapability: "delete-current",
    }));
    let current!: LocalJournalComposerController;
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <ProbeWithCoordinator
          fetcher={vi.fn() as unknown as typeof fetch}
          encoder={{ encode: vi.fn(() => pending.promise) }}
          stager={{ stage, delete: vi.fn(async () => undefined) }}
          onRender={(value) => (current = value)}
        />,
      );
    });

    let selection!: ReturnType<LocalJournalComposerController["selectImage"]>;
    let publication!: Promise<unknown>;
    await act(async () => {
      selection = current.selectImage(
        new File([new Uint8Array([1])], "secret.jpg"),
        "b_image",
      );
      publication = current.publish(publicationRequest(MEDIA_ID));
      await Promise.resolve();
    });
    expect(current.state.status).toBe("waiting_media");

    await act(async () => {
      current.cancelPublishing();
      await expect(publication).rejects.toMatchObject({
        code: "publication_cancelled",
      });
      await expect(selection.ready).rejects.toMatchObject({
        code: "publication_cancelled",
      });
    });
    pending.resolve(encodedImage());
    await Promise.resolve();
    await Promise.resolve();
    expect(stage).not.toHaveBeenCalled();
    expect(current.readOnly).toBe(false);
    expect(current.media.items[0]).toMatchObject({
      status: "failed",
      failureCode: "publication_cancelled",
    });

    await act(async () => renderer.unmount());
  });

  it("keeps the publication deadline active while the response body is stalled", async () => {
    vi.useFakeTimers();
    let stalledBody!: ReadableStreamDefaultController<Uint8Array>;
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              stalledBody = controller;
              init?.signal?.addEventListener(
                "abort",
                () =>
                  controller.error(new DOMException("deadline", "AbortError")),
                { once: true },
              );
            },
          }),
        ),
    ) as unknown as typeof fetch;
    let current!: LocalJournalComposerController;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <Probe fetcher={fetcher} onRender={(value) => (current = value)} />,
      );
    });

    const publication = current.publish(publicationRequestWithoutMedia());
    let observed: unknown = null;
    void publication.catch((error) => {
      observed = error;
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(70_001);
      await Promise.resolve();
    });
    const deadlineOutcome = observed;
    if (observed === null) {
      stalledBody.error(new DOMException("test cleanup", "AbortError"));
    }
    await act(async () => {
      renderer.unmount();
      await publication.catch(() => undefined);
    });
    vi.useRealTimers();

    expect(deadlineOutcome).toMatchObject({ code: "publication_timeout" });
  });
});

function ProbeWithCoordinator({
  fetcher,
  encoder,
  stager,
  onRender,
}: {
  fetcher: typeof fetch;
  encoder: ConstructorParameters<
    typeof LocalJournalMediaCoordinator
  >[0]["encoder"];
  stager: LocalJournalMediaStager;
  onRender(value: LocalJournalComposerController): void;
}) {
  onRender(
    useLocalJournalComposer({
      enabled: true,
      dirty: true,
      fallbackReturnTo: "/garden",
      dependencies: {
        fetcher,
        createId: idSequence(SESSION_ID, MEDIA_ID, PUBLISH_ID, MUTATION_ID),
        createCoordinator: ({ stagingSessionId, createId }) =>
          new LocalJournalMediaCoordinator({
            stagingSessionId,
            createId,
            encoder,
            stager,
            createObjectURL: () => "blob:exact-final-webp",
            revokeObjectURL: vi.fn(),
          }),
        currentLocation: () => "/garden?space=current#space-journal",
      },
    }),
  );
  return null;
}

function ProbeEdit({
  fetcher,
  stager = fakeStager(),
  onRender,
}: {
  fetcher: typeof fetch;
  stager?: LocalJournalMediaStager;
  onRender(value: LocalJournalComposerController): void;
}) {
  onRender(
    useLocalJournalComposer({
      enabled: true,
      dirty: true,
      fallbackReturnTo: "/garden",
      existingMedia: [
        {
          mediaAssetId: MEDIA_ID,
          blockId: "b_image",
          generation: 4,
          previewUrl: "https://media.over.garden/existing.webp",
          width: 1200,
          height: 800,
        },
      ],
      dependencies: {
        fetcher,
        createId: idSequence(SESSION_ID, MUTATION_ID, SECOND_MUTATION_ID),
        createCoordinator: ({ stagingSessionId, createId, existingItems }) =>
          new LocalJournalMediaCoordinator({
            stagingSessionId,
            createId,
            existingItems,
            encoder: { encode: vi.fn(async () => encodedImage()) },
            stager,
            createObjectURL: () => "blob:replacement-webp",
            revokeObjectURL: vi.fn(),
          }),
        currentLocation: () => "/garden/entries/current/edit",
      },
    }),
  );
  return null;
}

function publicationRequest(mediaAssetId: string) {
  return {
    context: {
      target: "plant_object_entry" as const,
      plantObjectId: "00000000-0000-4000-8000-000000000104",
      entryDate: "2026-08-23",
    },
    title: "Bloom",
    document: {
      schemaVersion: 1 as const,
      blocks: [
        {
          id: "b_text",
          type: "paragraph" as const,
          spans: [{ text: "Today" }],
        },
        { id: "b_image", type: "image" as const, mediaAssetId },
      ],
    },
    coverMediaAssetId: mediaAssetId,
    disclosureAccepted: true,
  };
}

function publicationRequestWithoutMedia() {
  return {
    context: {
      target: "plant_object_entry" as const,
      plantObjectId: "00000000-0000-4000-8000-000000000104",
      entryDate: "2026-08-23",
    },
    title: "Bloom",
    document: {
      schemaVersion: 1 as const,
      blocks: [
        {
          id: "b_text",
          type: "paragraph" as const,
          spans: [{ text: "Today" }],
        },
      ],
    },
    coverMediaAssetId: null,
    disclosureAccepted: true,
  };
}

function encodedImage(): EncodedJournalImage {
  return {
    blob: new Blob([new Uint8Array([8, 2])], { type: "image/webp" }),
    width: 100,
    height: 80,
    sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    sourceKind: "jpeg",
    lossless: false,
    quality: 82,
    durationMs: 4,
  };
}

function fakeStager(): LocalJournalMediaStager {
  return {
    stage: vi.fn(async () => ({
      stagingReceipt: "receipt-current",
      deleteCapability: "delete-current",
    })),
    delete: vi.fn(async () => undefined),
  };
}

function idSequence(...ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? crypto.randomUUID();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
