import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  buttonVariants: () => "button",
}));

import { getPublicObjectCatalogCopy } from "@/lib/public-object-catalog-copy";
import { PublicObjectCatalogSearch } from "./public-object-catalog-search";

const copy = getPublicObjectCatalogCopy("uk");

describe("public living-object catalog search", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", {
      clearTimeout,
      setTimeout,
    });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("aborts a stale suggestion request and renders the next query without wedging search controls", async () => {
    const firstResponse = deferred<Response>();
    const signals: AbortSignal[] = [];
    mocks.fetch
      .mockImplementationOnce((_: string, init: RequestInit) => {
        signals.push(init.signal as AbortSignal);
        return firstResponse.promise;
      })
      .mockImplementationOnce((_: string, init: RequestInit) => {
        signals.push(init.signal as AbortSignal);
        return Promise.resolve(suggestionResponse("Карпатська бджола"));
      });

    const renderer = await renderSearch("be");
    await runDebounce();

    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/public/objects/suggestions?q=be&kind=animal&identity=breed",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    const input = renderer.root.findByProps({ role: "combobox" });
    expect(input.props.disabled).toBeUndefined();
    expect(submitButton(renderer).props.disabled).toBeUndefined();

    await act(async () => {
      input.props.onChange({ target: { value: "car" } });
      await Promise.resolve();
    });

    expect(signals[0]?.aborted).toBe(true);
    expect(input.props.disabled).toBeUndefined();
    expect(submitButton(renderer).props.disabled).toBeUndefined();

    await runDebounce();
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.fetch).toHaveBeenLastCalledWith(
      "/api/public/objects/suggestions?q=car&kind=animal&identity=breed",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(signals[1]?.aborted).toBe(false);
    expect(
      renderer.root.findByProps({ role: "option" }).findByType("a").props.href,
    ).toBe("/breed/carpathian-bee");

    await act(async () => renderer.unmount());
  });

  it("keeps the server search path usable when suggestions are unavailable", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("network unavailable"));
    const renderer = await renderSearch("ko");

    await runDebounce();
    await act(async () => {
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ role: "status" }).props.children).toBe(
      copy.suggestionsUnavailable,
    );
    expect(renderer.root.findByProps({ role: "search" }).props.action).toBe(
      "/objects",
    );
    expect(
      renderer.root.findByProps({ role: "combobox" }).props.disabled,
    ).toBeUndefined();
    expect(submitButton(renderer).props.disabled).toBeUndefined();

    await act(async () => renderer.unmount());
  });
});

async function renderSearch(query: string) {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <PublicObjectCatalogSearch
        locale="uk"
        copy={copy}
        query={query}
        kind="animal"
        identity="breed"
      />,
    );
  });
  return renderer!;
}

async function runDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(180);
  });
}

function submitButton(renderer: ReactTestRenderer) {
  return renderer.root
    .findAllByType("button")
    .find((button) => button.props.type === "submit")!;
}

function suggestionResponse(label: string): Response {
  return {
    ok: true,
    json: async () => ({
      suggestions: [
        {
          key: "catalog:carpathian-bee",
          label,
          href: "/breed/carpathian-bee",
          objectKind: "animal",
          identityState: "catalog",
          journalCount: 2,
        },
      ],
    }),
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
