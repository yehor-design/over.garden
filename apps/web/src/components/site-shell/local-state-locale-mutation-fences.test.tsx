import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteOfflineDraft: vi.fn(),
  listOfflineDrafts: vi.fn(),
  listOfflineMutations: vi.fn(),
  timerCallbacks: [] as Array<() => void>,
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
vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: () => null,
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
vi.mock("@/lib/offline/drafts", () => ({
  deleteOfflineDraft: mocks.deleteOfflineDraft,
  FIRST_ENTRY_DRAFT_ID: "first-entry",
  listOfflineDrafts: mocks.listOfflineDrafts,
  OFFLINE_DRAFTS_CHANGED_EVENT: "overgarden-offline-drafts-changed",
}));
vi.mock("@/lib/offline/queue", () => ({
  listOfflineMutations: mocks.listOfflineMutations,
  OFFLINE_QUEUE_CHANGED_EVENT: "overgarden-offline-queue-changed",
}));

import { GardenDraftResumePanel } from "@/app/garden/draft-resume-panel";
import { GardenWorkspaceLocalState } from "@/app/garden/garden-workspace-local-state";
import { interfaceLocaleChangeCoordinator } from "@/lib/interface-locale-change-coordinator";

const DRAFT = {
  id: "first-entry",
  ownerUserId: "owner-test",
  kind: "first_entry",
  payload: {
    clientMutationId: "mutation-test",
    draft: {
      spaceName: "",
      plantName: "Rose",
      objectKind: "plant",
      title: "Rose note",
      body: "",
      entryDate: "2026-07-22",
      locationVisibility: "hidden",
      coarseRegionCode: "",
    },
    catalogQuery: "",
    selectedCatalogItem: null,
    userAddedCatalogName: null,
    activationSource: null,
    photoIntent: null,
  },
  createdAt: 1,
  updatedAt: 1,
} as const;

describe("local IndexedDB locale mutation fences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.timerCallbacks.length = 0;
    mocks.listOfflineDrafts.mockResolvedValue([DRAFT]);
    mocks.listOfflineMutations.mockResolvedValue([]);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout: (callback: () => void) => {
        mocks.timerCallbacks.push(callback);
        return mocks.timerCallbacks.length;
      },
      clearTimeout: vi.fn(),
    });
  });

  it("fences a resume-panel draft deletion until delete and refresh settle", async () => {
    const deletion = deferred<void>();
    mocks.deleteOfflineDraft.mockReturnValue(deletion.promise);
    const renderer = await render(
      <GardenDraftResumePanel ownerUserId="owner-test" locale="bg" />,
    );
    await runInitialTimer();

    await clickDiscard(renderer);
    expectPending("garden-draft-resume-mutation");

    await act(async () => {
      deletion.resolve();
      await deletion.promise;
      await Promise.resolve();
    });
    expectSettled();
    await act(async () => renderer.unmount());
  });

  it("fences a workspace draft deletion until the local mutation settles", async () => {
    const deletion = deferred<void>();
    mocks.deleteOfflineDraft.mockReturnValue(deletion.promise);
    const renderer = await render(
      <GardenWorkspaceLocalState
        ownerUserId="owner-test"
        locale="bg"
        nextAction={{ href: "/garden", label: "Next" }}
        recent={[]}
        inbox={null}
        media={null}
        initialState={{
          online: true,
          drafts: [
            {
              id: "first-entry",
              title: "Rose note",
              subtitle: "Draft",
              href: "/garden#first-entry-composer",
            },
          ],
          mutations: [],
        }}
      />,
    );

    await clickDiscard(renderer);
    expectPending("garden-workspace-local-mutation");

    await act(async () => {
      deletion.resolve();
      await deletion.promise;
      await Promise.resolve();
    });
    expectSettled();
    await act(async () => renderer.unmount());
  });
});

async function render(node: React.ReactElement) {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(node);
  });
  return renderer!;
}

async function runInitialTimer() {
  const timer = mocks.timerCallbacks.shift();
  expect(timer).toBeDefined();
  await act(async () => {
    timer?.();
    await Promise.resolve();
  });
}

async function clickDiscard(renderer: ReactTestRenderer) {
  const button = renderer.root
    .findAllByType("button")
    .find(
      (candidate) => textContent(candidate.props.children) === "Отхвърляне",
    );
  expect(button).toBeDefined();
  await act(async () => {
    button?.props.onClick();
    await Promise.resolve();
  });
}

function expectPending(id: string) {
  expect(interfaceLocaleChangeCoordinator.readState()).toMatchObject({
    hasInFlightMutation: true,
    inFlightParticipantIds: [id],
  });
}

function expectSettled() {
  expect(interfaceLocaleChangeCoordinator.readState().hasInFlightMutation).toBe(
    false,
  );
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
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
