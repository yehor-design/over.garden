import type { ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Link from "next/link";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  dispatchEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <span role="link" data-href={href}>
      {children}
    </span>
  ),
}));

import {
  DOCUMENT_OWNER_CHANGED_EVENT,
  DocumentMutationActionForm,
  DocumentMutationGenerationProvider,
  createDocumentMutationRequestHeaders,
  useDocumentMutationGeneration,
} from "./document-mutation-recovery";

function Probe({
  onReady,
}: {
  onReady: (value: ReturnType<typeof useDocumentMutationGeneration>) => void;
}) {
  const value = useDocumentMutationGeneration();
  onReady(value);
  return (
    <>
      <Link href="/garden">Garden navigation link</Link>
      <input aria-label="Journal draft editing control" />
    </>
  );
}

describe("document mutation recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", { dispatchEvent: mocks.dispatchEvent });
    vi.stubGlobal(
      "Event",
      class Event {
        constructor(public type: string) {}
      },
    );
  });

  it("carries the opaque generation only on same-origin request headers", () => {
    expect(createDocumentMutationRequestHeaders("opaque-generation")).toEqual({
      "x-overgarden-document-generation": "opaque-generation",
    });
    expect(createDocumentMutationRequestHeaders(null)).toEqual({});
  });

  it.each(["uk", "bg", "ru"] as const)(
    "retains usable controls and exposes localized recovery in %s",
    async (locale) => {
      let current!: ReturnType<typeof useDocumentMutationGeneration>;
      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(
          <DocumentMutationGenerationProvider
            locale={locale}
            transport="opaque-generation"
          >
            <Probe onReady={(value) => (current = value)} />
          </DocumentMutationGenerationProvider>,
        );
      });

      await act(async () => {
        current.handleTransportResult("MUTATION_ADMISSION_UNAVAILABLE");
      });

      expect(
        renderer.root.findByProps({ role: "link" }).props["data-href"],
      ).toBe("/garden");
      expect(renderer.root.findByType("input").props.disabled).not.toBe(true);
      expect(
        renderer.root.findByProps({ role: "status" }).children.join(""),
      ).toMatch(/спроб|опит|повтор|връз|връзката|соедин|подключ/iu);
      expect(mocks.refresh).not.toHaveBeenCalled();

      await act(async () => renderer.unmount());
    },
  );

  it("refreshes recoverable protocol/session results at most once per code", async () => {
    let current!: ReturnType<typeof useDocumentMutationGeneration>;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DocumentMutationGenerationProvider
          locale="uk"
          transport="opaque-generation"
        >
          <Probe onReady={(value) => (current = value)} />
        </DocumentMutationGenerationProvider>,
      );
    });

    await act(async () => {
      current.handleTransportResult("DOCUMENT_PROTOCOL_REFRESH_REQUIRED");
      current.handleTransportResult("DOCUMENT_PROTOCOL_REFRESH_REQUIRED");
      current.handleTransportResult("DOCUMENT_SESSION_REFRESH_REQUIRED");
      current.handleTransportResult("DOCUMENT_SESSION_REFRESH_REQUIRED");
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(2);

    await act(async () => renderer.unmount());
  });

  it("does not re-handle one stale Server Action result after transport refresh", async () => {
    const action = vi.fn(async () => ({
      documentMutationAdmission:
        "DOCUMENT_PROTOCOL_REFRESH_REQUIRED" as const,
    }));
    let renderer!: ReactTestRenderer;
    const render = (transport: string) => (
      <DocumentMutationGenerationProvider locale="uk" transport={transport}>
        <DocumentMutationActionForm action={action}>
          <button type="submit">Save</button>
        </DocumentMutationActionForm>
      </DocumentMutationGenerationProvider>
    );
    await act(async () => {
      renderer = create(render("opaque-generation-a1"));
    });

    await act(async () => {
      await renderer.root.findByType("form").props.action(new FormData());
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();

    await act(async () => {
      renderer.update(render("opaque-generation-a2"));
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();

    await act(async () => renderer.unmount());
  });

  it("retries one durable idempotent row once after a fresh same-owner generation", async () => {
    let current!: ReturnType<typeof useDocumentMutationGeneration>;
    const retry = vi.fn();
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json(
        { code: "DOCUMENT_SESSION_REFRESH_REQUIRED" },
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    let renderer!: ReactTestRenderer;
    const render = (transport: string) => (
      <DocumentMutationGenerationProvider locale="uk" transport={transport}>
        <Probe onReady={(value) => (current = value)} />
      </DocumentMutationGenerationProvider>
    );
    await act(async () => {
      renderer = create(render("opaque-generation-a1"));
    });

    await act(async () => {
      expect(
        current.handleIdempotentTransportResult({
          retryKey: "durable-row-1",
          result: "DOCUMENT_SESSION_REFRESH_REQUIRED",
          retry,
        }),
      ).toBe(true);
    });
    expect(retry).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledOnce();

    await act(async () => {
      renderer.update(render("opaque-generation-a2"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(retry).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledWith("opaque-generation-a2");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/document-mutation-admission/continuity",
    );
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get(
        "x-overgarden-document-generation",
      ),
    ).toBe("opaque-generation-a1");

    await act(async () => {
      expect(
        current.handleIdempotentTransportResult({
          retryKey: "durable-row-1",
          result: "DOCUMENT_SESSION_REFRESH_REQUIRED",
          retry,
        }),
      ).toBe(false);
      renderer.update(render("opaque-generation-a3"));
    });
    expect(retry).toHaveBeenCalledOnce();

    await act(async () => renderer.unmount());
  });

  it.each([
    "DOCUMENT_OWNER_CHANGED",
    "DOCUMENT_PROTOCOL_REFRESH_REQUIRED",
    "AUTHENTICATION_REQUIRED",
    "MUTATION_ADMISSION_UNAVAILABLE",
  ] as const)(
    "never automatically retries idempotent work for %s",
    async (result) => {
      let current!: ReturnType<typeof useDocumentMutationGeneration>;
      const retry = vi.fn();
      let renderer!: ReactTestRenderer;
      const render = (transport: string) => (
        <DocumentMutationGenerationProvider locale="uk" transport={transport}>
          <Probe onReady={(value) => (current = value)} />
        </DocumentMutationGenerationProvider>
      );
      await act(async () => {
        renderer = create(render("opaque-generation-a1"));
      });
      await act(async () => {
        expect(
          current.handleIdempotentTransportResult({
            retryKey: "durable-row-1",
            result,
            retry,
          }),
        ).toBe(false);
        renderer.update(render("opaque-generation-a2"));
      });
      expect(retry).not.toHaveBeenCalled();
      await act(async () => renderer.unmount());
    },
  );

  it("never retries an A row when refresh resolves under owner B", async () => {
    let current!: ReturnType<typeof useDocumentMutationGeneration>;
    const retry = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ code: "DOCUMENT_OWNER_CHANGED" }, { status: 409 }),
      ),
    );
    let renderer!: ReactTestRenderer;
    const render = (transport: string) => (
      <DocumentMutationGenerationProvider locale="uk" transport={transport}>
        <Probe onReady={(value) => (current = value)} />
      </DocumentMutationGenerationProvider>
    );
    await act(async () => {
      renderer = create(render("opaque-generation-a1"));
    });
    await act(async () => {
      expect(
        current.handleIdempotentTransportResult({
          retryKey: "owner-a-durable-row",
          result: "DOCUMENT_SESSION_REFRESH_REQUIRED",
          retry,
        }),
      ).toBe(true);
    });

    await act(async () => {
      renderer.update(render("opaque-generation-b1"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(retry).not.toHaveBeenCalled();
    expect(mocks.dispatchEvent).toHaveBeenCalledOnce();
    expect(mocks.dispatchEvent.mock.calls[0]?.[0]).toMatchObject({
      type: DOCUMENT_OWNER_CHANGED_EVENT,
    });
    await act(async () => renderer.unmount());
  });

  it("emits a confirmed owner transition exactly once into the existing boundary", async () => {
    let current!: ReturnType<typeof useDocumentMutationGeneration>;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DocumentMutationGenerationProvider
          locale="uk"
          transport="opaque-generation"
        >
          <Probe onReady={(value) => (current = value)} />
        </DocumentMutationGenerationProvider>,
      );
    });

    await act(async () => {
      current.handleTransportResult("DOCUMENT_OWNER_CHANGED");
      current.handleTransportResult("DOCUMENT_OWNER_CHANGED");
    });

    expect(mocks.dispatchEvent).toHaveBeenCalledOnce();
    expect(mocks.dispatchEvent.mock.calls[0]?.[0]).toMatchObject({
      type: DOCUMENT_OWNER_CHANGED_EVENT,
    });
    await act(async () => renderer.unmount());
  });
});
