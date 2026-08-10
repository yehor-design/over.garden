import type { ComponentProps } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteOfflineDraft: vi.fn(),
  listOfflineDraftSummaries: vi.fn(),
  listOfflineMutationSummaries: vi.fn(),
  registerContextRail: vi.fn(),
  listeners: new Map<string, () => void>(),
  timers: [] as Array<() => void>,
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
  SiteShellContextRailRegistration: ({ modules }: { modules: unknown }) => {
    mocks.registerContextRail(modules);
    return null;
  },
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
  listOfflineDraftSummaries: mocks.listOfflineDraftSummaries,
  OFFLINE_DRAFTS_CHANGED_EVENT: "overgarden-offline-drafts-changed",
}));

vi.mock("@/lib/offline/queue", () => ({
  listOfflineMutationSummaries: mocks.listOfflineMutationSummaries,
  OFFLINE_QUEUE_CHANGED_EVENT: "overgarden:offline-queue-changed",
}));

import { GardenWorkspaceLocalState } from "./garden-workspace-local-state";

const OWNER = "00000000-0000-4000-8000-0000000000a1";

describe("garden workspace local summaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listeners.clear();
    mocks.timers.length = 0;
    mocks.deleteOfflineDraft.mockResolvedValue(undefined);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", {
      addEventListener: (name: string, listener: () => void) => {
        mocks.listeners.set(name, listener);
      },
      removeEventListener: vi.fn(),
      setTimeout: (callback: () => void) => {
        mocks.timers.push(callback);
        return mocks.timers.length;
      },
      clearTimeout: vi.fn(),
    });
  });

  it("renders only bounded blob-free summary values and pages without payload hydration", async () => {
    mocks.listOfflineDraftSummaries.mockResolvedValue({
      items: Array.from({ length: 24 }, (_, index) => draftSummary(index)),
      hasMore: true,
      page: 1,
      pageSize: 24,
    });
    mocks.listOfflineMutationSummaries.mockResolvedValue({
      items: Array.from({ length: 24 }, (_, index) => mutationSummary(index)),
      hasMore: false,
      page: 1,
      pageSize: 24,
    });

    const renderer = await renderWorkspace();
    await runTimer();

    expect(mocks.listOfflineDraftSummaries).toHaveBeenCalledWith(OWNER, {
      page: 1,
    });
    expect(mocks.listOfflineMutationSummaries).toHaveBeenCalledWith(OWNER, {
      page: 1,
      statuses: ["queued", "syncing", "failed"],
    });
    expect(renderer.root.findAllByType("li")).toHaveLength(48);
    expect(
      renderer.root
        .findAllByType("p")
        .some((paragraph) => paragraph.props["aria-live"] === "polite"),
    ).toBe(true);
    expect(text(renderer)).not.toContain("Private draft body");
    expect(text(renderer)).not.toContain("private photo bytes");

    await click(renderer, "Далі");
    await runTimer();
    expect(mocks.listOfflineDraftSummaries).toHaveBeenLastCalledWith(OWNER, {
      page: 2,
    });
    await act(async () => renderer.unmount());
  });

  it("coalesces an event storm into one post-flight refresh and fences unmounted state", async () => {
    const firstDrafts = deferred<ReturnType<typeof summaryPage>>();
    const firstMutations = deferred<ReturnType<typeof mutationPage>>();
    mocks.listOfflineDraftSummaries
      .mockReturnValueOnce(firstDrafts.promise)
      .mockResolvedValue(summaryPage());
    mocks.listOfflineMutationSummaries
      .mockReturnValueOnce(firstMutations.promise)
      .mockResolvedValue(mutationPage());

    const renderer = await renderWorkspace();
    await runTimer();
    expect(mocks.listOfflineDraftSummaries).toHaveBeenCalledTimes(1);

    for (const event of [
      "overgarden-offline-drafts-changed",
      "overgarden:offline-queue-changed",
      "focus",
      "online",
      "offline",
    ]) {
      mocks.listeners.get(event)?.();
    }
    await runTimer();
    expect(mocks.listOfflineDraftSummaries).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstDrafts.resolve(summaryPage());
      firstMutations.resolve(mutationPage());
      await Promise.all([firstDrafts.promise, firstMutations.promise]);
    });
    await runTimer();
    expect(mocks.listOfflineDraftSummaries).toHaveBeenCalledTimes(2);

    await act(async () => renderer.unmount());
    expect(text(renderer)).not.toContain("Private draft body");
  });

  it("keeps the last ready page and enabled recovery controls when a refresh fails", async () => {
    mocks.listOfflineDraftSummaries.mockResolvedValue(summaryPage());
    mocks.listOfflineMutationSummaries.mockResolvedValue(mutationPage());

    const renderer = await renderWorkspace();
    await runTimer();
    expect(text(renderer)).toContain("Чернетка продовження");

    mocks.listOfflineDraftSummaries.mockRejectedValueOnce(
      new Error("private storage failure"),
    );
    mocks.listOfflineMutationSummaries.mockRejectedValueOnce(
      new Error("private storage failure"),
    );
    mocks.listeners.get("focus")?.();
    await runTimer();

    expect(text(renderer)).toContain("Чернетка продовження");
    expect(text(renderer)).not.toContain("private storage failure");
    const retry = renderer.root
      .findAllByType("button")
      .find((candidate) =>
        textContent(candidate.props.children).includes("Спробувати"),
      );
    expect(retry?.props.disabled).not.toBe(true);
    await act(async () => renderer.unmount());
  });

  it("reports an unavailable vault without translating it into empty or synchronized work", async () => {
    mocks.listOfflineDraftSummaries.mockRejectedValue(
      new Error("owner vault unavailable"),
    );
    mocks.listOfflineMutationSummaries.mockRejectedValue(
      new Error("owner vault unavailable"),
    );

    const renderer = await renderWorkspace();
    await runTimer();

    expect(text(renderer)).toContain("Локальний стан недоступний");
    expect(text(renderer)).not.toContain(
      "На цьому пристрої все синхронізовано",
    );
    expect(text(renderer)).not.toContain(
      "Локальних чернеток або змін у черзі немає",
    );
    const modules = mocks.registerContextRail.mock.calls.at(-1)?.[0] as Array<{
      key: string;
      items: Array<{ meta?: string }>;
    }>;
    const localModule = modules.find((module) => module.key === "garden-local");
    expect(localModule?.items.map((item) => item.meta)).toContain("—");
    expect(localModule?.items.map((item) => item.meta)).not.toContain("0");
    await act(async () => renderer.unmount());
  });

  it("removes the prior owner's in-memory summary before a new owner can read IndexedDB", async () => {
    const renderer = await renderWorkspaceWithInitialState(OWNER, {
      online: true,
      drafts: [
        {
          id: "first-entry",
          title: "Prior owner private draft",
          subtitle: "Private draft body",
          href: "/garden#first-entry-composer",
        },
      ],
      mutations: [],
    });

    expect(text(renderer)).toContain("Prior owner private draft");
    await act(async () => {
      renderer.update(
        <GardenWorkspaceLocalState
          ownerUserId="00000000-0000-4000-8000-0000000000b2"
          locale="uk"
          nextAction={{ href: "/garden", label: "Next" }}
          recent={[]}
          inbox={null}
          media={null}
          initialState={{
            online: true,
            drafts: [
              {
                id: "first-entry",
                title: "Prior owner private draft",
                subtitle: "Private draft body",
                href: "/garden#first-entry-composer",
              },
            ],
            mutations: [],
          }}
        />,
      );
    });

    expect(text(renderer)).not.toContain("Prior owner private draft");
    expect(text(renderer)).not.toContain("Private draft body");
    await act(async () => renderer.unmount());
  });
});

async function renderWorkspace() {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <GardenWorkspaceLocalState
        ownerUserId={OWNER}
        locale="uk"
        nextAction={{ href: "/garden", label: "Next" }}
        recent={[]}
        inbox={null}
        media={null}
      />,
    );
  });
  return renderer!;
}

async function renderWorkspaceWithInitialState(
  ownerUserId: string,
  initialState: ComponentProps<
    typeof GardenWorkspaceLocalState
  >["initialState"],
) {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <GardenWorkspaceLocalState
        ownerUserId={ownerUserId}
        locale="uk"
        nextAction={{ href: "/garden", label: "Next" }}
        recent={[]}
        inbox={null}
        media={null}
        initialState={initialState}
      />,
    );
  });
  return renderer!;
}

async function runTimer() {
  const timer = mocks.timers.shift();
  expect(timer).toBeDefined();
  await act(async () => {
    timer?.();
    await Promise.resolve();
  });
}

async function click(renderer: ReactTestRenderer, label: string) {
  const button = renderer.root
    .findAllByType("button")
    .find((candidate) => textContent(candidate.props.children) === label);
  expect(button).toBeDefined();
  await act(async () => {
    button?.props.onClick();
    await Promise.resolve();
  });
}

function summaryPage() {
  return {
    items: [draftSummary(0)],
    hasMore: false,
    page: 1,
    pageSize: 24,
  };
}

function mutationPage() {
  return {
    items: [mutationSummary(0)],
    hasMore: false,
    page: 1,
    pageSize: 24,
  };
}

function draftSummary(index: number) {
  return {
    id: `follow-up-entry:object-${index}`,
    ownerUserId: OWNER,
    kind: "follow_up_entry" as const,
    createdAt: index,
    updatedAt: index,
    entryDate: "2026-08-01",
    targetObjectId: `object-${index}`,
    targetSpaceId: null,
  };
}

function mutationSummary(index: number) {
  return {
    id: `mutation-${index}`,
    ownerUserId: OWNER,
    kind: "journal_entry" as const,
    status: "queued" as const,
    workspaceVisible: 1,
    createdAt: index,
    updatedAt: index,
    target: "plant_object_entry" as const,
    targetObjectId: `object-${index}`,
    targetSpaceId: null,
  };
}

function text(renderer: ReactTestRenderer) {
  return renderer.toJSON() ? JSON.stringify(renderer.toJSON()) : "";
}

function textContent(value: unknown): string {
  return Array.isArray(value)
    ? value.map(textContent).join("")
    : typeof value === "string"
      ? value
      : "";
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
