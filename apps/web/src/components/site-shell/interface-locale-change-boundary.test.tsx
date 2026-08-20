import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInterfaceLocaleChangeCoordinator } from "@/lib/interface-locale-change-coordinator";

const mocks = vi.hoisted(() => ({
  pathname: "/garden",
  createComposerParticipant: vi.fn(() => ({
    id: "owner-composer-drafts",
    kind: "safe-flush" as const,
    prepare: async () => ({ resume: async () => undefined }),
  })),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));
vi.mock("@/lib/garden/online-journal-composer-locale-participant", () => ({
  createOnlineJournalComposerLocaleChangeParticipant:
    mocks.createComposerParticipant,
}));

import {
  InterfaceLocaleChangeBoundary,
  observeInterfaceLocaleChangeForms,
  observeInterfaceLocaleChangeNetworkMutations,
  useInterfaceLocaleChangeFormState,
} from "./interface-locale-change-boundary";

describe("interface locale change boundary", () => {
  beforeEach(() => {
    mocks.pathname = "/garden";
    mocks.createComposerParticipant.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mounts exactly one global composer participant on rendered UI routes", async () => {
    const root = eventRoot();
    vi.stubGlobal("document", root.target);
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <InterfaceLocaleChangeBoundary>
          <main>Product</main>
        </InterfaceLocaleChangeBoundary>,
      );
    });

    expect(mocks.createComposerParticipant).toHaveBeenCalledOnce();
    expect(root.listenerCount()).toBe(4);

    await act(async () => renderer!.unmount());
    expect(root.listenerCount()).toBe(0);
  });

  it("keeps deterministic visual fixtures outside product lifecycle wiring", async () => {
    mocks.pathname = "/__visual-fixtures";
    const root = eventRoot();
    vi.stubGlobal("document", root.target);
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <InterfaceLocaleChangeBoundary>
          <main>Fixture</main>
        </InterfaceLocaleChangeBoundary>,
      );
    });

    expect(mocks.createComposerParticipant).not.toHaveBeenCalled();
    expect(root.listenerCount()).toBe(0);
    await act(async () => renderer!.unmount());
  });

  it("tracks ordinary dirty forms by static element id without reading values", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    const root = eventRoot();
    const form = formLike({ id: "owner-profile-editor" });
    const input = {
      get value(): never {
        throw new Error("form values must not be read");
      },
      matches: () => false,
      closest: () => form,
    };
    const stop = observeInterfaceLocaleChangeForms(root.target, coordinator);

    root.dispatch("input", { target: input });

    expect(coordinator.readState()).toMatchObject({
      requiresDirtyConfirmation: true,
      dirtyParticipantIds: ["dom-form:owner-profile-editor"],
    });
    const confirmation = await coordinator.prepare();
    expect(confirmation.status).toBe("confirmation-required");

    root.dispatch("reset", { target: form });
    await Promise.resolve();
    expect(coordinator.readState().requiresDirtyConfirmation).toBe(false);
    stop();
  });

  it("keeps a dirty form registered when a later reset handler cancels the reset", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    const root = eventRoot();
    const form = formLike({ id: "cancelled-profile-reset" });
    const input = { matches: () => false, closest: () => form };
    const stop = observeInterfaceLocaleChangeForms(root.target, coordinator);
    root.dispatch("input", { target: input });
    const resetEvent = { target: form, defaultPrevented: false };

    root.dispatch("reset", resetEvent);
    // The application form owns the bubble-phase decision after our capture
    // listener has run.
    resetEvent.defaultPrevented = true;
    await Promise.resolve();

    expect(coordinator.readState()).toMatchObject({
      requiresDirtyConfirmation: true,
      dirtyParticipantIds: ["dom-form:cancelled-profile-reset"],
    });
    await expect(coordinator.prepare()).resolves.toMatchObject({
      status: "confirmation-required",
    });
    stop();
  });

  it("ignores GET filters and safe-flush composer forms", () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    const root = eventRoot();
    const stop = observeInterfaceLocaleChangeForms(root.target, coordinator);
    const getForm = formLike({ id: "journal-filter", method: "get" });
    const composerForm = formLike({
      id: "journal-composer",
      composer: true,
    });

    root.dispatch("change", {
      target: { matches: () => false, closest: () => getForm },
    });
    root.dispatch("input", {
      target: { matches: () => false, closest: () => composerForm },
    });

    expect(coordinator.readState()).toMatchObject({
      requiresDirtyConfirmation: false,
      hasInFlightMutation: false,
    });
    stop();
  });

  it("blocks locale changes during conservative DOM submit lifecycle", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    const root = eventRoot();
    const stop = observeInterfaceLocaleChangeForms(root.target, coordinator);
    const form = formLike({ id: "profile-save" });

    root.dispatch("submit", { target: form });
    await Promise.resolve();

    expect(coordinator.readState()).toMatchObject({
      hasInFlightMutation: true,
      inFlightParticipantIds: ["dom-form:profile-save:submit"],
    });
    await expect(coordinator.prepare()).resolves.toMatchObject({
      status: "blocked",
      reason: "mutation-in-flight",
    });

    // Time alone is not settlement proof. Only an explicit reset/unmount or an
    // adopted boolean pending hook may release this conservative fallback.
    root.dispatch("reset", { target: form });
    await Promise.resolve();
    expect(coordinator.readState().hasInFlightMutation).toBe(false);
    stop();
  });

  it("tracks non-GET fetch mutations only until their exact settlement", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    const request = deferred<Response>();
    const browser: Pick<Window, "fetch" | "location"> = {
      fetch: vi.fn<typeof globalThis.fetch>(() => request.promise),
      location: { origin: "https://over.garden" } as Location,
    };
    const stop = observeInterfaceLocaleChangeNetworkMutations(
      browser,
      coordinator,
    );

    const mutation = browser.fetch("/api/account/update", { method: "POST" });
    expect(coordinator.readState()).toMatchObject({
      hasInFlightMutation: true,
      inFlightParticipantIds: ["network-mutation:1"],
    });
    request.resolve({ ok: true } as Response);
    await mutation;
    expect(coordinator.readState().hasInFlightMutation).toBe(false);

    await browser.fetch("/api/interface/locale", { method: "POST" });
    await browser.fetch("/api/catalog?q=rose");
    expect(coordinator.readState().hasInFlightMutation).toBe(false);

    const wrongMethod = browser.fetch("/api/interface/locale", {
      method: "PUT",
    });
    expect(coordinator.readState()).toMatchObject({
      hasInFlightMutation: true,
      inFlightParticipantIds: ["network-mutation:2"],
    });
    await wrongMethod;
    expect(coordinator.readState().hasInFlightMutation).toBe(false);

    const crossOrigin = browser.fetch(
      "https://attacker.example/api/interface/locale",
      { method: "POST" },
    );
    expect(coordinator.readState()).toMatchObject({
      hasInFlightMutation: true,
      inFlightParticipantIds: ["network-mutation:3"],
    });
    await crossOrigin;
    expect(coordinator.readState().hasInFlightMutation).toBe(false);
    stop();
  });

  it("keeps concurrent network mutations independent and clears rejected or thrown calls", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    const first = deferred<Response>();
    const second = deferred<Response>();
    const originalFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockRejectedValueOnce(new Error("network rejected"))
      .mockImplementationOnce(() => {
        throw new Error("network threw synchronously");
      });
    const browser: Pick<Window, "fetch" | "location"> = {
      fetch: originalFetch,
      location: { origin: "https://over.garden" } as Location,
    };
    const stop = observeInterfaceLocaleChangeNetworkMutations(
      browser,
      coordinator,
    );

    const firstMutation = browser.fetch("/api/first", { method: "POST" });
    const secondMutation = browser.fetch("/api/second", { method: "DELETE" });
    expect(coordinator.readState().inFlightParticipantIds).toEqual([
      "network-mutation:1",
      "network-mutation:2",
    ]);
    first.resolve({ ok: true } as Response);
    await firstMutation;
    expect(coordinator.readState().inFlightParticipantIds).toEqual([
      "network-mutation:2",
    ]);
    second.resolve({ ok: true } as Response);
    await secondMutation;
    expect(coordinator.readState().hasInFlightMutation).toBe(false);

    await expect(
      browser.fetch("/api/rejected", { method: "PATCH" }),
    ).rejects.toThrow("network rejected");
    await expect(
      browser.fetch("/api/thrown", { method: "POST" }),
    ).rejects.toThrow("network threw synchronously");
    expect(coordinator.readState().hasInFlightMutation).toBe(false);
    stop();
    expect(browser.fetch).toBe(originalFetch);
  });

  it("does not clobber a later fetch wrapper during cleanup", () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    const originalFetch = vi.fn<typeof globalThis.fetch>();
    const laterWrapper = vi.fn<typeof globalThis.fetch>();
    const browser: Pick<Window, "fetch" | "location"> = {
      fetch: originalFetch,
      location: { origin: "https://over.garden" } as Location,
    };
    const stop = observeInterfaceLocaleChangeNetworkMutations(
      browser,
      coordinator,
    );
    browser.fetch = laterWrapper;

    stop();

    expect(browser.fetch).toBe(laterWrapper);
  });

  it("exposes an explicit boolean-only hook for dirty and pending state", async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<FormStateProbe dirty pending={false} />);
    });

    const { interfaceLocaleChangeCoordinator } =
      await import("@/lib/interface-locale-change-coordinator");
    expect(interfaceLocaleChangeCoordinator.readState()).toMatchObject({
      requiresDirtyConfirmation: true,
      hasInFlightMutation: false,
    });

    await act(async () => {
      renderer!.update(<FormStateProbe dirty pending />);
    });
    expect(interfaceLocaleChangeCoordinator.readState()).toMatchObject({
      requiresDirtyConfirmation: false,
      hasInFlightMutation: true,
    });
    await act(async () => renderer!.unmount());
    expect(interfaceLocaleChangeCoordinator.readState()).toMatchObject({
      requiresDirtyConfirmation: false,
      hasInFlightMutation: false,
    });
  });

  it("invalidates an explicit dirty confirmation when its payload-free epoch advances", async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<FormStateProbe dirty pending={false} revision={0} />);
    });
    const { interfaceLocaleChangeCoordinator } =
      await import("@/lib/interface-locale-change-coordinator");
    await expect(
      interfaceLocaleChangeCoordinator.prepare(),
    ).resolves.toMatchObject({ status: "confirmation-required" });

    await act(async () => {
      renderer!.update(<FormStateProbe dirty pending={false} revision={1} />);
    });
    await expect(
      interfaceLocaleChangeCoordinator.prepare({ discardConfirmed: true }),
    ).resolves.toMatchObject({ status: "confirmation-required" });
    await act(async () => renderer!.unmount());
  });
});

function FormStateProbe({
  dirty,
  pending,
  revision = 0,
}: {
  dirty: boolean;
  pending: boolean;
  revision?: number;
}) {
  useInterfaceLocaleChangeFormState({
    id: "bounded-profile-editor",
    dirty,
    pending,
    revision,
  });
  return null;
}

function eventRoot() {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  return {
    target: {
      addEventListener(
        name: string,
        listener: EventListenerOrEventListenerObject,
      ) {
        const set = listeners.get(name) ?? new Set();
        set.add(listener as (event: Event) => void);
        listeners.set(name, set);
      },
      removeEventListener(
        name: string,
        listener: EventListenerOrEventListenerObject,
      ) {
        listeners.get(name)?.delete(listener as (event: Event) => void);
      },
    },
    dispatch(
      name: string,
      event: { target: unknown; defaultPrevented?: boolean },
    ) {
      for (const listener of listeners.get(name) ?? []) {
        listener(event as Event);
      }
    },
    listenerCount: () =>
      [...listeners.values()].reduce((count, set) => count + set.size, 0),
  };
}

function formLike({
  id,
  method,
  composer = false,
}: {
  id: string;
  method?: string;
  composer?: boolean;
}) {
  return {
    id,
    matches: (selector: string) => selector === "form",
    closest: () => null,
    getAttribute: (name: string) => {
      if (name === "method") return method ?? null;
      if (name === "data-interface-locale-form-id") return null;
      return null;
    },
    querySelector: (selector: string) =>
      composer && selector.includes("#first-entry-body") ? {} : null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
