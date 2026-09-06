import { renderServerHtml } from "@test/render-server-html";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const NODE_A = "22222222-2222-4222-8222-222222222222";
const NODE_B = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocale: vi.fn(),
  resolveWorkspaceViewer: vi.fn(),
  resolveWorkspaceAdminAccess: vi.fn(),
  assertAdminCapabilityForScope: vi.fn(),
  hasAdminCapability: vi.fn(() => true),
  listOpenCurationQueue: vi.fn(),
  countOpenCurationQueue: vi.fn(),
  listRecentAutomaticActions: vi.fn(),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceViewer: mocks.resolveWorkspaceViewer,
  resolveWorkspaceAdminAccess: mocks.resolveWorkspaceAdminAccess,
}));
vi.mock("@/server/admin-access", () => ({
  assertAdminCapabilityForScope: mocks.assertAdminCapabilityForScope,
  hasAdminCapability: mocks.hasAdminCapability,
}));
vi.mock("@/server/catalog-curation-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/catalog-curation-repository")>()),
  listOpenCurationQueue: mocks.listOpenCurationQueue,
  countOpenCurationQueue: mocks.countOpenCurationQueue,
  listRecentAutomaticActions: mocks.listRecentAutomaticActions,
}));
vi.mock("./actions", () => ({
  acceptCatalogQueueItemAction: vi.fn(),
  rejectCatalogQueueItemAction: vi.fn(),
  skipCatalogQueueItemAction: vi.fn(),
  revertCatalogActionAction: vi.fn(),
}));

function node(id: string, name: string, objectCount = 3) {
  return {
    catalogItemId: id,
    canonicalName: name,
    catalogKind: "species",
    nodeKind: "taxon",
    kingdom: "Plantae",
    rank: "species",
    publicSlug: name.toLowerCase().replace(/\s+/gu, "-"),
    speciesSlug: null,
    objectCount,
    entryCount: 2,
    identifiers: [{ scheme: "eppo", value: "LYPES" }],
  };
}

function queueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    itemType: "node_merge" as const,
    subjectLabel: null,
    confidence: 0.93,
    reasons: ["canonical_same_kingdom_rank"],
    impactScore: 12,
    createdAt: new Date("2026-09-06T08:00:00.000Z"),
    subject: node(NODE_A, "Lycopersicon esculentum"),
    target: node(NODE_B, "Solanum lycopersicum"),
    labelObjectCount: 0,
    sourceSlug: null,
    ...overrides,
  };
}

async function render(searchParams: Record<string, string> = {}) {
  const { default: Page } = await import("./page");
  return renderServerHtml(
    await Page({ searchParams: Promise.resolve(searchParams) }),
  );
}

describe("owner curation queue (ADR-0026 D10)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "ready",
      scope: { userId: "owner-1" },
    });
    mocks.resolveWorkspaceAdminAccess.mockResolvedValue({
      status: "allowed",
      access: { role: "owner", mode: "sealed", capabilities: [] },
    });
    mocks.hasAdminCapability.mockReturnValue(true);
    mocks.listOpenCurationQueue.mockResolvedValue([queueItem()]);
    mocks.countOpenCurationQueue.mockResolvedValue({
      total: 3,
      byType: { node_merge: 2, label_link: 1 },
    });
    mocks.listRecentAutomaticActions.mockResolvedValue([]);
  });

  it("shows one decision with both cards, its reasons and four controls", async () => {
    const html = await render();

    expect(html).toContain('data-operator-surface="catalog-queue"');
    expect(html).toContain('data-operator-access-state="allowed"');
    expect(html).toContain(`data-catalog-queue-item="${ITEM_ID}"`);
    expect(html).toContain("Lycopersicon esculentum");
    expect(html).toContain("Solanum lycopersicum");
    expect(html).toContain("canonical_same_kingdom_rank");
    expect(html).toContain("0.93");
    for (const action of ["accept", "reject", "skip"]) {
      expect(html, action).toContain(`data-catalog-queue-action="${action}"`);
    }
    // Every control is a real form, so the queue decides before hydration.
    expect(html.match(/<form/gu)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(mocks.listOpenCurationQueue).toHaveBeenCalledWith({
      itemType: null,
      limit: 20,
    });
  });

  it("asks once before a merge that moves more than fifty gardener objects", async () => {
    mocks.listOpenCurationQueue.mockResolvedValue([
      queueItem({ subject: node(NODE_A, "Lycopersicon esculentum", 51) }),
    ]);

    const asked = await render();
    expect(asked).toContain('data-catalog-queue-action="confirm"');
    expect(asked).not.toContain('data-catalog-queue-action="accept"');

    const confirmed = await render({ confirm: "merge" });
    expect(confirmed).toContain('data-catalog-queue-action="accept"');
    expect(confirmed).toContain('name="confirmMerge"');
  });

  it("filters by type and says so in the link it renders", async () => {
    await render({ type: "label_link" });
    expect(mocks.listOpenCurationQueue).toHaveBeenCalledWith({
      itemType: "label_link",
      limit: 20,
    });

    mocks.listOpenCurationQueue.mockClear();
    await render({ type: "not-a-type" });
    expect(mocks.listOpenCurationQueue).toHaveBeenCalledWith({
      itemType: null,
      limit: 20,
    });
  });

  it("lists the week's automatic decisions with an undo, and marks a reverted one", async () => {
    mocks.listRecentAutomaticActions.mockResolvedValue([
      {
        actionId: "action-1",
        actionType: "link",
        itemType: "label_link",
        ruleCode: "denomination_equal",
        reasons: ["denomination_equal"],
        subjectNames: ["Де Барао"],
        performedAt: new Date("2026-09-05T10:00:00.000Z"),
        automatic: true,
        reverted: false,
      },
      {
        actionId: "action-2",
        actionType: "merge",
        itemType: "node_merge",
        ruleCode: "shared_identifier",
        reasons: [],
        subjectNames: ["A", "B"],
        performedAt: new Date("2026-09-04T10:00:00.000Z"),
        automatic: true,
        reverted: true,
      },
    ]);

    const html = await render();

    expect(html).toContain('data-catalog-automatic-undo="action-1"');
    expect(html).not.toContain('data-catalog-automatic-undo="action-2"');
    expect(html).toContain("Де Барао");
    expect(html).toContain("скасовано");
  });

  it("walks the stream with links, so J and K browse without deciding", async () => {
    const second = "44444444-4444-4444-8444-444444444444";
    mocks.listOpenCurationQueue.mockResolvedValue([
      queueItem(),
      queueItem({ id: second, impactScore: 4 }),
    ]);

    const first = await render();
    expect(first).toContain(`data-catalog-queue-item="${ITEM_ID}"`);
    expect(first).toContain(`/garden/catalog/queue?item=${second}`);
    expect(first).toContain('data-catalog-queue-nav="next"');
    expect(first).not.toContain('data-catalog-queue-nav="previous"');
    expect(first).toContain("1/2");

    const later = await render({ item: second, type: "node_merge" });
    expect(later).toContain(`data-catalog-queue-item="${second}"`);
    expect(later).toContain('data-catalog-queue-nav="previous"');
    expect(later).toContain(`type=node_merge&amp;item=${ITEM_ID}`);
    expect(later).toContain("2/2");

    // A cursor whose item was decided elsewhere falls back, never errors.
    const stale = await render({ item: "55555555-5555-4555-8555-555555555555" });
    expect(stale).toContain(`data-catalog-queue-item="${ITEM_ID}"`);
  });

  it("says the queue is empty rather than showing an empty card", async () => {
    mocks.listOpenCurationQueue.mockResolvedValue([]);
    mocks.countOpenCurationQueue.mockResolvedValue({ total: 0, byType: {} });

    const html = await render();

    expect(html).toContain('data-catalog-queue-empty="true"');
    expect(html).not.toContain("data-catalog-queue-item=");
  });

  it("refuses anyone who is not the owner and asks a signed-out visitor to sign in", async () => {
    mocks.resolveWorkspaceAdminAccess.mockResolvedValue({ status: "denied" });
    const denied = await render();
    expect(denied).toContain('data-operator-access-state="denied"');
    expect(denied).not.toContain("data-catalog-queue=");

    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "sign-in-required",
    });
    const signedOut = await render();
    expect(signedOut).toContain('data-operator-access-state="sign-in-required"');
  });

  it("renders a failure state with a retry instead of an empty page", async () => {
    mocks.listOpenCurationQueue.mockRejectedValue(new Error("database away"));
    const html = await render();
    expect(html).toContain('data-operator-access-state="allowed"');
    expect(html).toContain("/garden/catalog/queue");
    expect(html).not.toContain("data-catalog-queue-item=");
  });
});
