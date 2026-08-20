import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  commitLocalExit: vi.fn(),
  sealVaults: vi.fn(),
  publishLocalExit: vi.fn(),
  dispatchReconciliation: vi.fn(),
  reconcileLocalExit: vi.fn(),
  acquireLease: vi.fn(),
  releaseLease: vi.fn(),
  getTabId: vi.fn(),
  createOperationId: vi.fn(),
  locationReplace: vi.fn(),
  flushSync: vi.fn((callback: () => void) => callback()),
  localeFormState: vi.fn(),
}));

vi.mock("react-dom", () => ({ flushSync: mocks.flushSync }));

vi.mock("@/components/site-shell/interface-locale-change-boundary", () => ({
  useInterfaceLocaleChangeFormState: mocks.localeFormState,
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: Record<string, unknown>) => {
    const buttonProps = { ...props };
    delete buttonProps.variant;
    delete buttonProps.size;
    return <button {...buttonProps} />;
  },
}));
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
  AlertDialogContent: (props: React.ComponentProps<"div">) => (
    <div {...props} />
  ),
  AlertDialogDescription: (props: React.ComponentProps<"div">) => (
    <div {...props} />
  ),
  AlertDialogTitle: (props: React.ComponentProps<"h2">) => <h2 {...props} />,
}));
vi.mock("@/lib/auth/sign-out-contract", () => ({
  dispatchLocalExitReconciliation: mocks.dispatchReconciliation,
  reconcileLocalExitSession: mocks.reconcileLocalExit,
  localizedPublicRoot: (locale: string) =>
    locale === "uk" ? "/" : `/${locale}`,
}));
vi.mock("@/lib/auth/session-invalidation-marker", () => ({
  commitLocalExitInvalidationMarker: mocks.commitLocalExit,
}));
vi.mock("@/lib/auth/session-convergence", () => ({
  acquireAuthenticatedSessionTabLease: mocks.acquireLease,
  getCurrentAuthenticatedSessionTabId: mocks.getTabId,
  createSignOutOperationId: mocks.createOperationId,
  publishLocalExitCommitted: mocks.publishLocalExit,
}));
vi.mock("@/lib/garden/online-journal-composer-participants", () => ({
  sealOnlineJournalComposerParticipantsForExit: mocks.sealVaults,
}));

import type { InterfaceLocale } from "@/lib/interface-localization";
import { SignOutProvider, useSignOut } from "./sign-out-provider";

const MARKER = Object.freeze({
  status: "present" as const,
  persistence: "persistent" as const,
  kind: "local_exit" as const,
});
const BINDING = "A".repeat(43);

describe("immediate retain-only sign-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", {
      location: {
        replace: mocks.locationReplace,
      },
    });
    mocks.commitLocalExit.mockReturnValue({
      status: "persisted",
      marker: MARKER,
    });
    mocks.sealVaults.mockReturnValue(1);
    mocks.acquireLease.mockReturnValue({
      tabId: "tab-provider-test-1234",
      release: mocks.releaseLease,
    });
    mocks.getTabId.mockReturnValue("tab-provider-test-1234");
    mocks.createOperationId.mockReturnValue("op-provider-test-1234");
    mocks.dispatchReconciliation.mockReturnValue("dispatched");
    mocks.reconcileLocalExit.mockResolvedValue("response_observed");
  });

  it("does nothing before confirmation and Cancel returns to idle", async () => {
    const renderer = await renderProvider("uk");

    await click(renderer, "trigger", { confirm: false });
    expect(button(renderer, "Вийти")).toBeDefined();
    expect(mocks.commitLocalExit).not.toHaveBeenCalled();
    expect(mocks.sealVaults).not.toHaveBeenCalled();
    expect(mocks.dispatchReconciliation).not.toHaveBeenCalled();

    await click(renderer, "Залишитися в обліковому записі");
    expect(button(renderer, "trigger")).toBeDefined();
    expect(mocks.locationReplace).not.toHaveBeenCalled();
  });

  it("commits marker, seals retained vaults, broadcasts and unmounts before navigation or reconciliation", async () => {
    const order: string[] = [];
    mocks.commitLocalExit.mockImplementation(() => {
      order.push("marker");
      return { status: "persisted", marker: MARKER };
    });
    mocks.sealVaults.mockImplementation(() => void order.push("seal"));
    mocks.publishLocalExit.mockImplementation(() => void order.push("publish"));
    mocks.flushSync.mockImplementation((callback: () => void) => {
      order.push("flush");
      callback();
    });
    mocks.locationReplace.mockImplementation(() => void order.push("replace"));
    mocks.dispatchReconciliation.mockImplementation(() => {
      order.push("reconcile");
      return "dispatched";
    });
    const renderer = await renderProvider("uk");

    await click(renderer, "trigger");

    expect(order).toEqual([
      "marker",
      "seal",
      "publish",
      "flush",
      "replace",
      "reconcile",
    ]);
    expect(renderer.root.findAllByType(Probe)).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ "data-local-exit-public-safe": "true" }),
    ).toHaveLength(1);
    expect(mocks.dispatchReconciliation).toHaveBeenCalledWith(BINDING, MARKER);
  });

  it.each([
    ["uk", "/"],
    ["bg", "/bg"],
    ["ru", "/ru"],
  ] as const)(
    "hard-replaces %s at the localized public root",
    async (locale, root) => {
      const renderer = await renderProvider(locale);
      await click(renderer, "trigger");
      expect(mocks.locationReplace).toHaveBeenCalledWith(root);
    },
  );

  it("exits locally with no cookie or network dependency when the document binding is unavailable", async () => {
    const renderer = await renderProvider("uk", null);

    await click(renderer, "trigger");

    expect(mocks.commitLocalExit).toHaveBeenCalledOnce();
    expect(mocks.sealVaults).toHaveBeenCalledOnce();
    expect(mocks.locationReplace).toHaveBeenCalledWith("/");
    expect(mocks.dispatchReconciliation).toHaveBeenCalledWith(null, MARKER);
  });

  it("keeps a volatile-only exit in the public-safe document until a response is observed", async () => {
    const reconciliation = deferred<"response_observed">();
    mocks.commitLocalExit.mockReturnValue({
      status: "volatile_only",
      marker: MARKER,
    });
    mocks.reconcileLocalExit.mockReturnValue(reconciliation.promise);
    const renderer = await renderProvider("bg");

    await click(renderer, "trigger");

    expect(mocks.locationReplace).not.toHaveBeenCalled();
    expect(mocks.dispatchReconciliation).not.toHaveBeenCalled();
    expect(mocks.reconcileLocalExit).toHaveBeenCalledWith(BINDING, MARKER);
    expect(
      renderer.root.findAllByProps({ "data-local-exit-public-safe": "true" }),
    ).toHaveLength(1);

    await act(async () => {
      reconciliation.resolve("response_observed");
      await Promise.resolve();
    });
    expect(mocks.locationReplace).toHaveBeenCalledWith("/bg");
  });

  it("locks duplicate confirmation synchronously", async () => {
    const renderer = await renderProvider("uk");
    await click(renderer, "trigger", { confirm: false });
    const confirmation = renderer.root
      .findAllByType("button")
      .find((candidate) => candidate.props["data-sign-out-confirm-action"]);
    if (!confirmation) throw new Error("Missing sign-out confirmation action");

    await act(async () => {
      confirmation.props.onClick();
      confirmation.props.onClick();
    });

    expect(mocks.commitLocalExit).toHaveBeenCalledOnce();
    expect(mocks.locationReplace).toHaveBeenCalledOnce();
    expect(mocks.dispatchReconciliation).toHaveBeenCalledOnce();
  });

  it("removes the private tree within the 100 millisecond local budget even when reconciliation never settles", async () => {
    mocks.dispatchReconciliation.mockImplementation(() => "dispatched");
    const renderer = await renderProvider("uk");
    const startedAt = performance.now();

    await click(renderer, "trigger");

    expect(performance.now() - startedAt).toBeLessThanOrEqual(100);
    expect(renderer.root.findAllByType(Probe)).toHaveLength(0);
    expect(
      renderer.root.findAll(
        (node) => node.props.role === "status" || node.props.role === "alert",
      ),
    ).toHaveLength(0);
  });
});

function Probe() {
  const { phase, requestSignOut } = useSignOut();
  return (
    <button type="button" onClick={requestSignOut}>
      {phase === "idle" ? "trigger" : `trigger:${phase}`}
    </button>
  );
}

async function renderProvider(
  locale: InterfaceLocale,
  currentSessionBinding: string | null = BINDING,
) {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <SignOutProvider
        locale={locale}
        currentSessionBinding={currentSessionBinding}
      >
        <Probe />
      </SignOutProvider>,
    );
  });
  return renderer!;
}

async function click(
  renderer: ReactTestRenderer,
  label: string,
  { confirm = true }: { confirm?: boolean } = {},
) {
  const target = button(renderer, label);
  await act(async () => {
    target.props.onClick();
  });
  if (label !== "trigger" || !confirm) return;
  const confirmation = renderer.root
    .findAllByType("button")
    .find((candidate) => candidate.props["data-sign-out-confirm-action"]);
  if (!confirmation) throw new Error("Missing sign-out confirmation action");
  await act(async () => {
    confirmation.props.onClick();
  });
}

function button(renderer: ReactTestRenderer, label: string) {
  const target = renderer.root
    .findAllByType("button")
    .find((candidate) => textContent(candidate.props.children) === label);
  if (!target) throw new Error(`Missing test button: ${label}`);
  return target;
}

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (value && typeof value === "object" && "props" in value) {
    return textContent(
      (value as { props: { children?: unknown } }).props.children,
    );
  }
  return "";
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
