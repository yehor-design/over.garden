import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  draftSummaries: [] as ReturnType<typeof draftSummary>[],
  mutationSummaries: [] as ReturnType<typeof mutationSummary>[],
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
  deleteOfflineDraft: vi.fn(),
  FIRST_ENTRY_DRAFT_ID: "first-entry",
  listOfflineDraftSummaries: async (
    _ownerUserId: string,
    options: { page?: number },
  ) => summaryPage(mocks.draftSummaries, options.page),
  OFFLINE_DRAFTS_CHANGED_EVENT: "overgarden-offline-drafts-changed",
}));

vi.mock("@/lib/offline/queue", () => ({
  listOfflineMutationSummaries: async (
    _ownerUserId: string,
    options: { page?: number },
  ) => summaryPage(mocks.mutationSummaries, options.page),
  OFFLINE_QUEUE_CHANGED_EVENT: "overgarden:offline-queue-changed",
}));

import { GardenWorkspaceLocalState } from "./garden-workspace-local-state";

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const SUMMARY_PAGE_SIZE = 24;
const FIXTURE_SIZE = 5_000;

describe("garden workspace summary render budget", () => {
  beforeEach(() => {
    mocks.timers.length = 0;
    mocks.draftSummaries = Array.from({ length: FIXTURE_SIZE }, (_, index) =>
      draftSummary(index),
    );
    mocks.mutationSummaries = Array.from({ length: FIXTURE_SIZE }, (_, index) =>
      mutationSummary(index),
    );
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout: (callback: () => void) => {
        mocks.timers.push(callback);
        return mocks.timers.length;
      },
      clearTimeout: vi.fn(),
    });
  });

  it("renders only two fixed summary pages from a 5,000 plus 5,000 fixture within 200ms", async () => {
    const startedAt = performance.now();
    const renderer = await renderWorkspace();
    await runTimer();
    const duration = performance.now() - startedAt;

    expect(renderer.root.findAllByType("li")).toHaveLength(48);
    expect(duration).toBeLessThanOrEqual(200);
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

async function runTimer() {
  const timer = mocks.timers.shift();
  expect(timer).toBeDefined();
  await act(async () => {
    timer?.();
    await Promise.resolve();
  });
}

function summaryPage<T>(items: readonly T[], page = 1) {
  const offset = (Math.max(1, page) - 1) * SUMMARY_PAGE_SIZE;
  const window = items.slice(offset, offset + SUMMARY_PAGE_SIZE + 1);
  return {
    items: window.slice(0, SUMMARY_PAGE_SIZE),
    hasMore: window.length > SUMMARY_PAGE_SIZE,
    page,
    pageSize: SUMMARY_PAGE_SIZE,
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
    workspaceVisible: 1 as const,
    createdAt: index,
    updatedAt: index,
    target: "plant_object_entry" as const,
    targetObjectId: `object-${index}`,
    targetSpaceId: null,
  };
}
