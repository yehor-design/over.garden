import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  JournalEntryDraftContext,
  JournalEntryDraftPayloadV1,
  JournalEntryDraftReceiptV1,
} from "./entry-contracts";
import { startAllOnlineJournalComposerTransitionParticipants } from "./online-journal-composer-participants";
import { useOnlineJournalComposer } from "./use-online-journal-composer";

type ComposerController = ReturnType<typeof useOnlineJournalComposer>;

const documentListeners = new Map<string, () => void>();
const windowListeners = new Map<string, () => void>();

function Probe({
  payload,
  context = {},
  generation = "signed-generation",
  onRender,
}: {
  payload: JournalEntryDraftPayloadV1;
  context?: JournalEntryDraftContext;
  generation?: string;
  onRender(value: ComposerController): void;
}) {
  onRender(
    useOnlineJournalComposer({
      draftKey: "first-entry",
      draftKind: "first_entry",
      context,
      payload,
      documentMutationGeneration: generation,
      onHydrated: () => undefined,
    }),
  );
  return null;
}

describe("online journal composer lifecycle", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    documentListeners.clear();
    windowListeners.clear();
    vi.stubGlobal("document", {
      title: "Garden",
      visibilityState: "visible",
      addEventListener: vi.fn((type: string, listener: () => void) => {
        documentListeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string) => {
        documentListeners.delete(type);
      }),
    });
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      addEventListener: vi.fn((type: string, listener: () => void) => {
        windowListeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string) => {
        windowListeners.delete(type);
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hydrates, autosaves within the debounce bound, renders server time, and updates context without a second read", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") {
        return Response.json(
          { code: "JOURNAL_DRAFT_NOT_FOUND" },
          { status: 404 },
        );
      }
      const body = JSON.parse(String(init?.body));
      return Response.json({
        outcome: "saved",
        draft: receipt(body.payload, body.context, {
          generation: body.generation,
          payloadSha256: body.payloadSha256,
          serverRevision: body.expectedServerRevision == null ? 1 : 2,
        }),
      });
    });
    vi.stubGlobal("fetch", fetchImpl);
    let current!: ComposerController;
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <Probe
          payload={payload("Initial")}
          onRender={(value) => (current = value)}
        />,
      );
      await settle();
    });
    expect(current.state).toMatchObject({ status: "idle", hydrated: true });

    await act(async () => {
      renderer.update(
        <Probe
          payload={payload("First character")}
          onRender={(value) => (current = value)}
        />,
      );
      await settle();
    });
    expect(current.state.status).toBe("dirty");
    expect(document.title).toBe("● Garden");

    await act(async () => {
      await delay(300);
      await settle();
    });
    expect(current.state).toMatchObject({
      status: "saved",
      savedAt: "2026-08-20T16:00:00.000Z",
    });
    expect(document.title).toBe("Garden");

    const spaceId = "00000000-0000-4000-8000-000000000020";
    await act(async () => {
      renderer.update(
        <Probe
          payload={payload("Space changed", spaceId)}
          context={{ spaceId }}
          onRender={(value) => (current = value)}
        />,
      );
      await settle();
    });
    await act(async () => {
      await delay(300);
      await settle();
    });

    const methods = fetchImpl.mock.calls.map(([, init]) => init?.method);
    expect(methods.filter((method) => method === "GET")).toHaveLength(1);
    const finalBody = JSON.parse(
      String(fetchImpl.mock.calls.at(-1)?.[1]?.body),
    );
    expect(finalBody.context).toEqual({ spaceId });
    expect(finalBody.expectedServerRevision).toBe(1);
    await act(async () => renderer.unmount());
  });

  it("fails read-only without replay and coalesces explicit retry with the exact generation and hash", async () => {
    const bodies: string[] = [];
    let putAttempt = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") {
        return Response.json(
          { code: "JOURNAL_DRAFT_NOT_FOUND" },
          { status: 404 },
        );
      }
      const bodyText = String(init?.body);
      bodies.push(bodyText);
      putAttempt += 1;
      if (putAttempt === 1) throw new TypeError("request failed");
      const body = JSON.parse(bodyText);
      return Response.json({
        outcome: "saved",
        draft: receipt(body.payload, body.context, {
          generation: body.generation,
          payloadSha256: body.payloadSha256,
          serverRevision: 1,
        }),
      });
    });
    vi.stubGlobal("fetch", fetchImpl);
    let current!: ComposerController;
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <Probe
          payload={payload("Initial")}
          onRender={(value) => (current = value)}
        />,
      );
      await settle();
    });
    await act(async () => {
      renderer.update(
        <Probe
          payload={payload("Unsaved current-tab text")}
          onRender={(value) => (current = value)}
        />,
      );
      await settle();
    });
    await act(async () => {
      await delay(300);
      await settle();
    });

    expect(current.state.status).toBe("connection_required");
    expect(current.readOnly).toBe(true);
    expect(document.title).toBe("● Garden");
    await delay(350);
    expect(putAttempt).toBe(1);

    await act(async () => {
      const first = current.retry();
      const second = current.retry();
      await Promise.all([first, second]);
      await settle();
    });

    expect(putAttempt).toBe(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(current.state.status).toBe("saved");
    expect(current.readOnly).toBe(false);
    await act(async () => renderer.unmount());
  });

  it("serializes different payload versions through one save flight", async () => {
    const releases: Array<() => void> = [];
    let activeSaves = 0;
    let maximumActiveSaves = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") {
        return Response.json(
          { code: "JOURNAL_DRAFT_NOT_FOUND" },
          { status: 404 },
        );
      }
      activeSaves += 1;
      maximumActiveSaves = Math.max(maximumActiveSaves, activeSaves);
      await new Promise<void>((resolve) => releases.push(resolve));
      activeSaves -= 1;
      const body = JSON.parse(String(init?.body));
      return Response.json({
        outcome: "saved",
        draft: receipt(body.payload, body.context, {
          generation: body.generation,
          payloadSha256: body.payloadSha256,
          serverRevision: body.expectedServerRevision == null ? 1 : 2,
        }),
      });
    });
    vi.stubGlobal("fetch", fetchImpl);
    let current!: ComposerController;
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <Probe
          payload={payload("Initial")}
          onRender={(value) => (current = value)}
        />,
      );
      await settle();
    });

    let first!: Promise<JournalEntryDraftReceiptV1>;
    let second!: Promise<JournalEntryDraftReceiptV1>;
    await act(async () => {
      first = current.saveNow(payload("Version one"));
      second = current.saveNow(payload("Version two"));
      await delay(10);
    });
    expect(releases).toHaveLength(1);
    expect(maximumActiveSaves).toBe(1);

    releases.shift()?.();
    await act(async () => {
      await first;
      await delay(10);
    });
    expect(releases).toHaveLength(1);
    expect(maximumActiveSaves).toBe(1);

    releases.shift()?.();
    await act(async () => {
      await second;
      await settle();
    });
    expect(maximumActiveSaves).toBe(1);
    expect(
      fetchImpl.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(2);
    await act(async () => renderer.unmount());
  });

  it("persists an immutable payload snapshot when the editor mutates its object during hashing", async () => {
    const requestBodies: Array<{
      payload: JournalEntryDraftPayloadV1;
      payloadSha256: string;
    }> = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") {
        return Response.json(
          { code: "JOURNAL_DRAFT_NOT_FOUND" },
          { status: 404 },
        );
      }
      const body = JSON.parse(String(init?.body));
      requestBodies.push(body);
      return Response.json({
        outcome: "saved",
        draft: receipt(body.payload, body.context, {
          generation: body.generation,
          payloadSha256: body.payloadSha256,
          serverRevision: 1,
        }),
      });
    });
    vi.stubGlobal("fetch", fetchImpl);
    let current!: ComposerController;
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <Probe
          payload={payload("Initial")}
          onRender={(value) => (current = value)}
        />,
      );
      await settle();
    });

    const mutablePayload = payload("Snapshot at save start");
    await act(async () => {
      const saving = current.saveNow(mutablePayload);
      mutablePayload.request.title = "Mutation after save start";
      await saving;
      await settle();
    });

    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]?.payload.request.title).toBe(
      "Snapshot at save start",
    );
    await act(async () => renderer.unmount());
  });

  it("fires one keepalive final attempt when a dirty tab becomes hidden", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") {
        return Response.json(
          { code: "JOURNAL_DRAFT_NOT_FOUND" },
          { status: 404 },
        );
      }
      const body = JSON.parse(String(init?.body));
      return Response.json({
        outcome: "saved",
        draft: receipt(body.payload, body.context, {
          generation: body.generation,
          payloadSha256: body.payloadSha256,
          serverRevision: 1,
        }),
      });
    });
    vi.stubGlobal("fetch", fetchImpl);
    let current!: ComposerController;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <Probe
          payload={payload("Initial")}
          onRender={(value) => (current = value)}
        />,
      );
      await settle();
    });
    await act(async () => {
      renderer.update(
        <Probe
          payload={payload("Final attempt")}
          onRender={(value) => (current = value)}
        />,
      );
      await settle();
    });
    await act(async () => {
      Object.assign(document, { visibilityState: "hidden" });
      documentListeners.get("visibilitychange")?.();
      await settle();
    });

    const puts = fetchImpl.mock.calls.filter(
      ([, init]) => init?.method === "PUT",
    );
    expect(puts).toHaveLength(1);
    expect(puts[0]?.[1]?.keepalive).toBe(true);
    expect(current.state.status).toBe("saved");
    await act(async () => renderer.unmount());
  });

  it("stays fail-closed when a keepalive final attempt fails", async () => {
    let putAttempt = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") {
        return Response.json(
          { code: "JOURNAL_DRAFT_NOT_FOUND" },
          { status: 404 },
        );
      }
      putAttempt += 1;
      await delay(10);
      throw new TypeError("request failed");
    });
    vi.stubGlobal("fetch", fetchImpl);
    let current!: ComposerController;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <Probe
          payload={payload("Initial")}
          onRender={(value) => (current = value)}
        />,
      );
      await settle();
    });
    await act(async () => {
      renderer.update(
        <Probe
          payload={payload("Unsaved final attempt")}
          onRender={(value) => (current = value)}
        />,
      );
      await settle();
    });
    await act(async () => {
      Object.assign(document, { visibilityState: "hidden" });
      documentListeners.get("visibilitychange")?.();
      await delay(20);
      await settle();
    });

    expect(putAttempt).toBe(1);
    expect(current.state.status).toBe("connection_required");
    expect(current.readOnly).toBe(true);
    expect(document.title).toBe("● Garden");
    await act(async () => renderer.unmount());
  });

  it("never recreates a consumed draft during final document events", async () => {
    let getAttempt = 0;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Response.json({
          entry: {
            id: "00000000-0000-4000-8000-000000000099",
            clientMutationId: "stable-mutation",
            journalRevision: 1,
          },
          isReplay: false,
        });
      }
      if (init?.method === "DELETE") return Response.json({ deleted: true });
      if (init?.method === "GET") {
        getAttempt += 1;
        if (getAttempt > 2) throw new TypeError("navigation cancelled read");
        return Response.json(
          { code: "JOURNAL_DRAFT_NOT_FOUND" },
          { status: 404 },
        );
      }
      const body = JSON.parse(String(init?.body));
      return Response.json({
        outcome: "saved",
        draft: receipt(body.payload, body.context, {
          generation: body.generation,
          payloadSha256: body.payloadSha256,
          serverRevision: 1,
        }),
      });
    });
    vi.stubGlobal("fetch", fetchImpl);
    let current!: ComposerController;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <Probe
          payload={payload("Published")}
          onRender={(value) => (current = value)}
        />,
      );
      await settle();
    });
    await act(async () => {
      await current.publish(payload("Published"));
      await settle();
    });
    expect(current.state.status).toBe("consumed");

    await act(async () => {
      renderer.update(
        <Probe
          payload={payload("Published")}
          generation="rotated-generation"
          onRender={(value) => (current = value)}
        />,
      );
      await settle();
    });
    expect(current.state.status).toBe("consumed");

    await act(async () => {
      Object.assign(document, { visibilityState: "hidden" });
      documentListeners.get("visibilitychange")?.();
      windowListeners.get("beforeunload")?.();
      const preparation = startAllOnlineJournalComposerTransitionParticipants();
      await preparation.ready;
      await preparation.resume();
      await settle();
    });

    expect(
      fetchImpl.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(1);
    expect(
      fetchImpl.mock.calls.some(([url]) => url === "/api/garden/entries"),
    ).toBe(true);
    await act(async () => renderer.unmount());
  });

  it("does not create a ghost draft when navigation starts during hydration", async () => {
    let resolveHydration!: (response: Response) => void;
    const hydration = new Promise<Response>((resolve) => {
      resolveHydration = resolve;
    });
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") return hydration;
      const body = JSON.parse(String(init?.body));
      return Response.json({
        outcome: "saved",
        draft: receipt(body.payload, body.context, {
          generation: body.generation,
          payloadSha256: body.payloadSha256,
          serverRevision: 1,
        }),
      });
    });
    vi.stubGlobal("fetch", fetchImpl);
    let current!: ComposerController;
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <Probe
          payload={payload("Fresh composer")}
          onRender={(value) => (current = value)}
        />,
      );
      await settle();
    });
    expect(current.state.status).toBe("hydrating");

    await act(async () => {
      Object.assign(document, { visibilityState: "hidden" });
      documentListeners.get("visibilitychange")?.();
      windowListeners.get("beforeunload")?.();
      await settle();
    });
    expect(
      fetchImpl.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(0);

    resolveHydration(
      Response.json({ code: "JOURNAL_DRAFT_NOT_FOUND" }, { status: 404 }),
    );
    await act(async () => {
      await settle();
      renderer.unmount();
    });
  });

  it("does not persist an automatic context change in a blank fresh composer", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") {
        return Response.json(
          { code: "JOURNAL_DRAFT_NOT_FOUND" },
          { status: 404 },
        );
      }
      const body = JSON.parse(String(init?.body));
      return Response.json({
        outcome: "saved",
        draft: receipt(body.payload, body.context, {
          generation: body.generation,
          payloadSha256: body.payloadSha256,
          serverRevision: 1,
        }),
      });
    });
    vi.stubGlobal("fetch", fetchImpl);
    let current!: ComposerController;
    let renderer!: ReactTestRenderer;
    const spaceId = "00000000-0000-4000-8000-000000000020";

    await act(async () => {
      renderer = create(
        <Probe
          payload={payload("")}
          onRender={(value) => (current = value)}
        />,
      );
      await settle();
    });
    expect(current.state.status).toBe("idle");

    await act(async () => {
      renderer.update(
        <Probe
          payload={payload("", spaceId)}
          context={{ spaceId }}
          onRender={(value) => (current = value)}
        />,
      );
      await delay(300);
      await settle();
    });

    expect(
      fetchImpl.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(0);
    expect(current.state.status).toBe("idle");
    await act(async () => renderer.unmount());
  });
});

function payload(title: string, spaceId?: string): JournalEntryDraftPayloadV1 {
  return {
    schemaVersion: 1,
    draftKind: "first_entry",
    request: {
      target: "first_plant_entry",
      title,
      ...(spaceId ? { spaceId } : {}),
      clientMutationId: "stable-mutation",
    },
  };
}

function receipt(
  draftPayload: JournalEntryDraftPayloadV1,
  context: JournalEntryDraftContext,
  version: {
    generation: number;
    payloadSha256: string;
    serverRevision: number;
  },
): JournalEntryDraftReceiptV1 {
  return {
    draftKey: "first-entry",
    draftKind: "first_entry",
    context,
    payload: draftPayload,
    ...version,
    updatedAt: "2026-08-20T16:00:00.000Z",
  };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
