import { postgresRejection } from "@test/postgres-rejection";
import { renderServerHtml } from "@test/render-server-html";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOperatorCatalogCopy } from "@/lib/operator-catalog-copy";
import { formatOperatorTemplate } from "@/lib/operator-copy";
import type {
  AppliedCurationAction,
  CuratedNodeSummary,
  CurationQueueItem,
  CurationQueueItemSummary,
} from "@/server/catalog-curation-repository";
import { describeWorkspaceFailure } from "@/server/workspace-failure";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "44444444-4444-4444-8444-444444444444";
const THIRD_ID = "66666666-6666-4666-8666-666666666666";
const MISSING_ID = "77777777-7777-4777-8777-777777777777";
const NODE_A = "22222222-2222-4222-8222-222222222222";
const NODE_B = "33333333-3333-4333-8333-333333333333";
const ACTION_APPLIED = "55555555-5555-4555-8555-555555555555";
const ACTION_REVERTED = "88888888-8888-4888-8888-888888888888";

const OWNER_SCOPE = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};
const OWNER_ACCESS = {
  mode: "sealed_owner_credential_only",
  role: "owner",
  capabilities: [
    "admin:read",
    "operator:read",
    "operator:mutate",
    "erasure:execute",
  ],
} as const;

const uk = getOperatorCatalogCopy("uk");

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocale: vi.fn(),
  resolveWorkspaceViewer: vi.fn(),
  resolveWorkspaceAdminAccess: vi.fn(),
  assertAdminCapabilityForScope: vi.fn(),
  listOpenCurationQueue: vi.fn(),
  countOpenCurationQueue: vi.fn(),
  listRecentAutomaticActions: vi.fn(),
  readCurationQueueItemSummary: vi.fn(),
  readCurationActionSummary: vi.fn(),
  readOpenCurationQueueItem: vi.fn(),
  readOldestOpenQueueItemAgeDays: vi.fn(),
}));

// Nothing here may open a pool: every read is a mock.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceViewer: mocks.resolveWorkspaceViewer,
  resolveWorkspaceAdminAccess: mocks.resolveWorkspaceAdminAccess,
}));
// The real `hasAdminCapability`, so what the page may offer follows the
// capabilities the owner check answered with.
vi.mock("@/server/admin-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/admin-access")>()),
  assertAdminCapabilityForScope: mocks.assertAdminCapabilityForScope,
}));
vi.mock("@/server/catalog-curation-repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/catalog-curation-repository")
  >()),
  listOpenCurationQueue: mocks.listOpenCurationQueue,
  countOpenCurationQueue: mocks.countOpenCurationQueue,
  listRecentAutomaticActions: mocks.listRecentAutomaticActions,
  readCurationQueueItemSummary: mocks.readCurationQueueItemSummary,
  readCurationActionSummary: mocks.readCurationActionSummary,
  readOpenCurationQueueItem: mocks.readOpenCurationQueueItem,
}));
vi.mock("@/server/catalog-health-repository", () => ({
  readOldestOpenQueueItemAgeDays: mocks.readOldestOpenQueueItemAgeDays,
}));
vi.mock("./actions", () => ({
  acceptCatalogQueueItemAction: vi.fn(),
  rejectCatalogQueueItemAction: vi.fn(),
  skipCatalogQueueItemAction: vi.fn(),
  revertCatalogActionAction: vi.fn(),
}));

function node(id: string, name: string, objectCount = 3): CuratedNodeSummary {
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

function queueItem(
  overrides: Partial<CurationQueueItem> = {},
): CurationQueueItem {
  return {
    id: ITEM_ID,
    itemType: "node_merge",
    subjectLabel: null,
    confidence: 0.93,
    reasons: ["canonical_same_kingdom_rank"],
    impactScore: 12,
    createdAt: new Date("2026-09-06T08:00:00.000Z"),
    subject: node(NODE_A, "Lycopersicon esculentum"),
    target: node(NODE_B, "Solanum lycopersicum"),
    labelObjectCount: 0,
    sourceSlug: null,
    blockedBy: null,
    ...overrides,
  };
}

/** A search miss the owner queued: a gardener's name, and no card to join. */
function missItem(
  overrides: Partial<CurationQueueItem> = {},
): CurationQueueItem {
  return queueItem({
    id: SECOND_ID,
    itemType: "label_link",
    subjectLabel: "Де Барао",
    confidence: null,
    reasons: ["search_miss"],
    impactScore: 1,
    subject: null,
    target: null,
    labelObjectCount: 2,
    sourceSlug: "catalog_search_miss",
    blockedBy: "no_target",
    ...overrides,
  });
}

function automaticAction(
  overrides: Partial<AppliedCurationAction> = {},
): AppliedCurationAction {
  return {
    actionId: ACTION_APPLIED,
    actionType: "link",
    itemType: "label_link",
    ruleCode: "denomination_equal",
    reasons: ["denomination_equal"],
    subjectNames: ["Де Барао"],
    performedAt: new Date("2026-09-05T10:00:00.000Z"),
    automatic: true,
    reverted: false,
    ...overrides,
  };
}

function decidedSummary(
  overrides: Partial<CurationQueueItemSummary> = {},
): CurationQueueItemSummary {
  return {
    id: SECOND_ID,
    itemType: "label_link",
    state: "accepted",
    subjectLabel: "Де Барао",
    subjectCatalogItemId: null,
    subjectName: null,
    targetName: "Solanum lycopersicum",
    decidedByUserId: null,
    decidedAt: null,
    ...overrides,
  };
}

async function render(searchParams: Record<string, string> = {}) {
  const { default: Page } = await import("./page");
  return renderServerHtml(
    await Page({ searchParams: Promise.resolve(searchParams) }),
  );
}

/** Text as React writes it into markup: an apostrophe is `&#x27;`. */
function markup(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

/** The opening tag of the first element that carries `attribute`. */
function openingTag(html: string, attribute: string): string {
  const at = html.indexOf(attribute);
  if (at < 0) throw new Error(`nothing carries ${attribute}`);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

/** The form a control sits in, or null when it is not inside one. */
function formAround(html: string, attribute: string): string | null {
  const at = html.indexOf(attribute);
  if (at < 0) return null;
  const start = html.lastIndexOf("<form", at);
  if (start < 0 || html.lastIndexOf("</form>", at) > start) return null;
  return html.slice(start, html.indexOf("</form>", at) + "</form>".length);
}

/** One table row, from its `<tr` to its `</tr>`. */
function rowWith(html: string, attribute: string): string {
  const at = html.indexOf(attribute);
  if (at < 0) throw new Error(`no row carries ${attribute}`);
  const start = html.lastIndexOf("<tr", at);
  return html.slice(start, html.indexOf("</tr>", at) + "</tr>".length);
}

function firstTag(fragment: string): string {
  return fragment.slice(0, fragment.indexOf(">") + 1);
}

/** The heading of the one failure panel on the page. */
function errorTitle(html: string): string {
  const at = html.indexOf('data-slot="error-state"');
  if (at < 0) throw new Error("no failure is on the page");
  const fragment = html.slice(at, html.indexOf("</h2>", at));
  return fragment.slice(fragment.lastIndexOf(">") + 1);
}

/** The detail pane of the decision on screen, up to its prev/next bar. */
function decisionPane(html: string): string {
  const start = html.indexOf("data-catalog-queue-item=");
  if (start < 0) throw new Error("no decision is on screen");
  return html.slice(
    html.lastIndexOf("<", start),
    html.indexOf("data-catalog-queue-nav-bar", start),
  );
}

/** The notice an outcome renders, and the tone of the callout inside it. */
function notice(html: string, outcome: string) {
  const at = html.indexOf(`data-action-outcome="${outcome}"`);
  if (at < 0) return null;
  const end = html.indexOf("</p>", at);
  const fragment = html.slice(at, end);
  return {
    tone: /data-tone="(\w+)"/u.exec(fragment)?.[1] ?? null,
    title: fragment.slice(fragment.lastIndexOf(">") + 1),
  };
}

describe("the owner's decision queue (ADR-0026 D10, OVE-506)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "signed-in",
      userId: OWNER_SCOPE.userId,
      scope: OWNER_SCOPE,
    });
    // An allowed owner check still runs the load it was given, so the suite
    // sees which capability was asked for.
    mocks.resolveWorkspaceAdminAccess.mockImplementation(
      async (load: () => Promise<unknown>) => ({
        status: "allowed",
        access: await load(),
      }),
    );
    mocks.assertAdminCapabilityForScope.mockResolvedValue(OWNER_ACCESS);
    mocks.listOpenCurationQueue.mockResolvedValue([queueItem()]);
    mocks.countOpenCurationQueue.mockResolvedValue({
      total: 3,
      byType: { node_merge: 2, label_link: 1 },
    });
    mocks.readOldestOpenQueueItemAgeDays.mockResolvedValue(4);
    mocks.listRecentAutomaticActions.mockResolvedValue([]);
    mocks.readCurationQueueItemSummary.mockResolvedValue(null);
    mocks.readCurationActionSummary.mockResolvedValue(null);
    mocks.readOpenCurationQueueItem.mockResolvedValue(null);
  });

  it("puts the decision on screen: the rule in words over its code, and accept, reject and skip as real forms", async () => {
    const html = await render();

    expect(html).toContain('data-operator-surface="catalog-queue"');
    expect(html).toContain('data-operator-access-state="allowed"');
    expect(mocks.assertAdminCapabilityForScope).toHaveBeenCalledWith(
      OWNER_SCOPE,
      "operator:read",
    );
    // The way to the other queue, for someone who may open it.
    expect(openingTag(html, "data-operator-cross-link=")).toContain(
      'href="/garden/catalog/sources"',
    );

    const decision = openingTag(html, `data-catalog-queue-item="${ITEM_ID}"`);
    expect(decision).toContain('data-catalog-queue-state="ready"');
    expect(decision).toContain('data-catalog-queue-item-type="node_merge"');
    expect(decision).not.toContain("data-catalog-queue-blocked");
    expect(html).toContain("Lycopersicon esculentum → Solanum lycopersicum");
    expect(html).toContain('data-catalog-queue-state-label="ready"');
    expect(html).toContain("Можна вирішити");

    // The reason as the owner reads it, and the key the logs use beneath it.
    const pane = decisionPane(html);
    expect(pane).toContain('data-catalog-reason="canonical_same_kingdom_rank"');
    expect(pane).toContain("Та сама наукова назва, царство й ранг");
    expect(pane).toContain(">canonical_same_kingdom_rank</code>");
    expect(pane).toContain('data-catalog-queue-confidence="0.93"');
    expect(pane).toContain("Впевненість: 93%");
    // Both cards a merge folds together.
    expect(pane).toContain(">Що змінюється</p>");
    expect(pane).toContain(">На що</p>");
    expect(pane).toContain('href="/species/lycopersicon-esculentum"');
    expect(pane).toContain('href="/species/solanum-lycopersicum"');

    // Every control is a real form naming its item, so the queue decides
    // before hydration and a press can only decide what is on screen.
    for (const action of ["accept", "reject", "skip"]) {
      const form = formAround(html, `data-catalog-queue-action="${action}"`);
      expect(form, action).not.toBeNull();
      expect(form, action).toContain(`name="queueItemId" value="${ITEM_ID}"`);
    }
    expect(
      formAround(html, 'data-catalog-queue-action="accept"'),
    ).not.toContain("confirmMerge");
    expect(html).not.toContain('data-catalog-queue-action="confirm"');

    expect(html).toContain('data-catalog-queue-open="3"');
    expect(html).toContain("Відкрито 3 рішення");
    expect(html).toContain('data-catalog-queue-oldest-days="4"');
    expect(html).toContain("найстарішому 4 дні");
    expect(mocks.listOpenCurationQueue).toHaveBeenCalledWith({
      itemType: null,
      limit: 20,
    });
    // No item was asked for, so none is looked up beyond the list.
    expect(mocks.readOpenCurationQueueItem).not.toHaveBeenCalled();
    // Nothing was decided, so nothing is read back and nothing is announced.
    expect(mocks.readCurationQueueItemSummary).not.toHaveBeenCalled();
    expect(mocks.readCurationActionSummary).not.toHaveBeenCalled();
    expect(html).not.toContain("data-action-outcome=");
  });

  it("walks the stream with links, and every decision names the view and the next item", async () => {
    mocks.listOpenCurationQueue.mockResolvedValue([
      queueItem(),
      queueItem({ id: SECOND_ID, impactScore: 4 }),
    ]);

    const first = await render({ type: "node_merge" });
    expect(first).toContain(`data-catalog-queue-item="${ITEM_ID}"`);
    expect(openingTag(first, 'data-catalog-queue-nav="next"')).toContain(
      `href="/garden/catalog/queue?type=node_merge&amp;item=${SECOND_ID}#decision"`,
    );
    expect(first).not.toContain('data-catalog-queue-nav="previous"');
    expect(first).toContain("Рішення 1 з 2");
    // J and K browse: a link decides nothing, so it is never a form.
    expect(formAround(first, 'data-catalog-queue-nav="next"')).toBeNull();
    for (const action of ["accept", "reject", "skip"]) {
      const form = formAround(first, `data-catalog-queue-action="${action}"`);
      expect(form, action).toContain(`name="nextItem" value="${SECOND_ID}"`);
      expect(form, action).toContain('name="view" value="node_merge"');
    }

    const last = await render({ type: "node_merge", item: SECOND_ID });
    // A listed item is walked to, never looked up on its own.
    expect(mocks.readOpenCurationQueueItem).not.toHaveBeenCalled();
    expect(last).toContain(`data-catalog-queue-item="${SECOND_ID}"`);
    expect(openingTag(last, 'data-catalog-queue-nav="previous"')).toContain(
      `href="/garden/catalog/queue?type=node_merge&amp;item=${ITEM_ID}#decision"`,
    );
    expect(last).not.toContain('data-catalog-queue-nav="next"');
    expect(last).toContain("Рішення 2 з 2");
    // After the last decision, the one before it is what comes next.
    expect(formAround(last, 'data-catalog-queue-action="reject"')).toContain(
      `name="nextItem" value="${ITEM_ID}"`,
    );

    // A cursor whose item was decided elsewhere is looked up, found no longer
    // open, and falls back to the top of the walk — never an error.
    const stale = await render({ item: MISSING_ID });
    expect(mocks.readOpenCurationQueueItem).toHaveBeenCalledTimes(1);
    expect(mocks.readOpenCurationQueueItem).toHaveBeenCalledWith(MISSING_ID);
    expect(stale).toContain(`data-catalog-queue-item="${ITEM_ID}"`);
    expect(stale).toContain("Рішення 1 з 2");
    expect(stale).not.toContain('name="view"');
  });

  it("offers no accept for a blocked item, and says why in words", async () => {
    mocks.listOpenCurationQueue.mockResolvedValue([missItem()]);
    mocks.countOpenCurationQueue.mockResolvedValue({
      total: 1,
      byType: { label_link: 1 },
    });

    const html = await render();

    const decision = openingTag(html, `data-catalog-queue-item="${SECOND_ID}"`);
    expect(decision).toContain('data-catalog-queue-state="blocked"');
    expect(decision).toContain('data-catalog-queue-blocked="no_target"');
    expect(html).toContain('data-catalog-queue-blocked-reason="no_target"');
    expect(html).toContain(markup(uk.queue.blocked.no_target));
    expect(html).toContain("Прийняти не можна");
    expect(html).toContain("«Де Барао»");
    // A press could only reach the apply function's refusal.
    expect(html).not.toContain('data-catalog-queue-action="accept"');
    expect(html).not.toContain('data-catalog-queue-action="confirm"');
    // It can still be answered.
    expect(formAround(html, 'data-catalog-queue-action="reject"')).toContain(
      `name="queueItemId" value="${SECOND_ID}"`,
    );
    expect(formAround(html, 'data-catalog-queue-action="skip"')).toContain(
      `name="queueItemId" value="${SECOND_ID}"`,
    );
    expect(
      firstTag(rowWith(html, `data-catalog-queue-row="${SECOND_ID}"`)),
    ).toContain('data-catalog-queue-row-state="blocked"');
  });

  it("names the other two blocks, and sends a split to the card it is reviewed on", async () => {
    mocks.listOpenCurationQueue.mockResolvedValue([
      queueItem({
        itemType: "split_review",
        reasons: ["col_accepted_became_synonym"],
        subject: node(NODE_B, "Solanum lycopersicum"),
        target: null,
        blockedBy: "not_applied_here",
      }),
    ]);
    const split = await render();
    expect(split).toContain(
      'data-catalog-queue-blocked-reason="not_applied_here"',
    );
    expect(split).toContain(markup(uk.queue.blocked.not_applied_here));
    expect(split).toMatch(
      /<a [^>]*href="\/species\/solanum-lycopersicum"[^>]*>Відкрити картку<\/a>/u,
    );
    expect(split).not.toContain('data-catalog-queue-action="accept"');

    mocks.listOpenCurationQueue.mockResolvedValue([
      queueItem({
        itemType: "label_link",
        subjectLabel: "Де Барао",
        subject: null,
        blockedBy: "target_inactive",
      }),
    ]);
    const inactive = await render();
    expect(inactive).toContain(
      'data-catalog-queue-blocked-reason="target_inactive"',
    );
    expect(inactive).toContain(markup(uk.queue.blocked.target_inactive));
    expect(inactive).not.toContain("Відкрити картку");
    expect(inactive).not.toContain('data-catalog-queue-action="accept"');
  });

  it("shows the two sides of a decision by what kind it is", async () => {
    // A gardener's label, and the card it would join.
    mocks.listOpenCurationQueue.mockResolvedValue([
      missItem({
        blockedBy: null,
        target: node(NODE_B, "Solanum lycopersicum"),
      }),
    ]);
    const label = decisionPane(await render());
    expect(label).toContain(">Де Барао</p>");
    expect(label).toContain(markup("Назва садівника · 2 об'єкти"));
    expect(label).toContain(">На що</p>");
    expect(label).toContain(">Solanum lycopersicum</p>");

    // A split has one side: the card under review.
    mocks.listOpenCurationQueue.mockResolvedValue([
      queueItem({
        itemType: "split_review",
        subject: node(NODE_B, "Solanum lycopersicum"),
        target: null,
        blockedBy: "not_applied_here",
      }),
    ]);
    const split = decisionPane(await render());
    expect(split).toContain(">Що змінюється</p>");
    expect(split).not.toContain(">На що</p>");
    expect(split).toContain(">Solanum lycopersicum</p>");

    // A source, and the card it would vouch for.
    mocks.listOpenCurationQueue.mockResolvedValue([
      queueItem({
        itemType: "source_link",
        reasons: ["eppo_ladder"],
        subject: node(NODE_B, "Solanum lycopersicum"),
        target: null,
        sourceSlug: "eppo-codes",
      }),
    ]);
    const source = decisionPane(await render());
    expect(source).toContain(">eppo-codes</p>");
    expect(source).toContain(`>${markup("Зв'язок із джерелом")}</p>`);
    expect(source).toContain(">Solanum lycopersicum</p>");
    expect(source).toContain("Запис EPPO збігся з карткою");
  });

  it("asks before a merge that moves more than fifty objects: the count, and a confirm bound to its item", async () => {
    mocks.listOpenCurationQueue.mockResolvedValue([
      queueItem({ subject: node(NODE_A, "Lycopersicon esculentum", 51) }),
    ]);

    const asked = await render({ type: "node_merge" });
    expect(openingTag(asked, `data-catalog-queue-item="${ITEM_ID}"`)).toContain(
      'data-catalog-queue-state="confirm"',
    );
    expect(asked).toContain("Потрібне підтвердження");
    expect(asked).not.toContain('data-catalog-queue-action="accept"');
    // This merge's own count, not the rule's fifty (`OVE-459` AC3).
    expect(asked).toContain('data-catalog-queue-confirm-objects="51"');
    expect(asked).toContain(
      markup(
        "Це об'єднання перенесе 51 об'єкт садівників. Підтвердьте, щоб продовжити.",
      ),
    );
    expect(openingTag(asked, 'data-catalog-queue-action="confirm"')).toContain(
      `href="/garden/catalog/queue?type=node_merge&amp;item=${ITEM_ID}&amp;confirm=merge#decision"`,
    );
    // No grant is needed to say no or later.
    expect(
      formAround(asked, 'data-catalog-queue-action="reject"'),
    ).not.toBeNull();
    expect(
      formAround(asked, 'data-catalog-queue-action="skip"'),
    ).not.toBeNull();

    const confirmed = await render({
      type: "node_merge",
      item: ITEM_ID,
      confirm: "merge",
    });
    const accept = formAround(confirmed, 'data-catalog-queue-action="accept"');
    expect(accept).toContain(`name="queueItemId" value="${ITEM_ID}"`);
    expect(accept).toContain('name="confirmMerge" value="yes"');
    expect(confirmed).not.toContain('data-catalog-queue-action="confirm"');
    expect(confirmed).not.toContain("data-catalog-queue-confirm-objects");
    expect(
      formAround(confirmed, 'data-catalog-queue-action="reject"'),
    ).not.toContain("confirmMerge");
  });

  it("never asks about fifty objects or fewer", async () => {
    mocks.listOpenCurationQueue.mockResolvedValue([
      queueItem({ subject: node(NODE_A, "Lycopersicon esculentum", 50) }),
    ]);

    const html = await render();

    expect(html).toContain('data-catalog-queue-state="ready"');
    expect(html).toContain('data-catalog-queue-action="accept"');
    expect(html).not.toContain('data-catalog-queue-action="confirm"');
  });

  it("treats a grant naming another item as no grant", async () => {
    mocks.listOpenCurationQueue.mockResolvedValue([
      queueItem({ subject: node(NODE_A, "Lycopersicon esculentum", 51) }),
      queueItem({
        id: SECOND_ID,
        impactScore: 4,
        subject: node(NODE_B, "Solanum esculentum", 60),
        target: node(NODE_A, "Solanum lycopersicum"),
      }),
    ]);

    // The grant names an item decided in another tab: it is looked up, no
    // longer open, and the page falls back to the highest-impact item, which
    // must not inherit the grant — before `OVE-459` confirming a merge on the
    // fifth card applied it to the first.
    const stale = await render({ item: MISSING_ID, confirm: "merge" });
    expect(mocks.readOpenCurationQueueItem).toHaveBeenCalledWith(MISSING_ID);
    expect(stale).toContain(`data-catalog-queue-item="${ITEM_ID}"`);
    expect(stale).toContain('data-catalog-queue-action="confirm"');
    expect(stale).not.toContain('data-catalog-queue-action="accept"');
    expect(stale).not.toContain('name="confirmMerge"');

    // A grant that names no item at all is no grant either.
    const bare = await render({ confirm: "merge" });
    expect(bare).not.toContain('name="confirmMerge"');
    expect(bare).not.toContain('data-catalog-queue-action="accept"');

    // A grant for the second merge is the second merge's alone.
    const second = await render({ item: SECOND_ID, confirm: "merge" });
    expect(second).toContain(`data-catalog-queue-item="${SECOND_ID}"`);
    const accept = formAround(second, 'data-catalog-queue-action="accept"');
    expect(accept).toContain(`name="queueItemId" value="${SECOND_ID}"`);
    expect(accept).toContain('name="confirmMerge" value="yes"');
  });

  it("shows a decision asked for below the listed twenty as itself, outside the walk", async () => {
    // A search miss is queued at impact 1: its "open in the queue" link used
    // to land on the top item, and the next press decided a proposal the
    // owner had not opened.
    mocks.listOpenCurationQueue.mockResolvedValue([
      queueItem(),
      queueItem({ id: SECOND_ID, impactScore: 4 }),
    ]);
    mocks.readOpenCurationQueueItem.mockResolvedValue(
      missItem({
        id: THIRD_ID,
        subjectLabel: "Бичаче серце",
        blockedBy: null,
        target: node(NODE_B, "Solanum lycopersicum"),
      }),
    );

    const html = await render({ type: "label_link", item: THIRD_ID });

    expect(mocks.readOpenCurationQueueItem).toHaveBeenCalledTimes(1);
    expect(mocks.readOpenCurationQueueItem).toHaveBeenCalledWith(THIRD_ID);
    const pane = decisionPane(html);
    expect(openingTag(pane, "data-catalog-queue-item=")).toContain(
      `data-catalog-queue-item="${THIRD_ID}"`,
    );
    expect(pane).toContain("«Бичаче серце» → Solanum lycopersicum");
    // It has no place in a walk it is not part of: no position, no previous,
    // and Next goes to the top of the list.
    expect(html).not.toContain("data-catalog-queue-position");
    expect(html).not.toMatch(/Рішення \d+ з \d+/u);
    expect(html).not.toContain('data-catalog-queue-nav="previous"');
    expect(openingTag(html, 'data-catalog-queue-nav="next"')).toContain(
      `href="/garden/catalog/queue?type=label_link&amp;item=${ITEM_ID}#decision"`,
    );
    // A press decides this item and then moves to the top of the list.
    for (const action of ["accept", "reject", "skip"]) {
      const form = formAround(html, `data-catalog-queue-action="${action}"`);
      expect(form, action).toContain(`name="queueItemId" value="${THIRD_ID}"`);
      expect(form, action).toContain(`name="nextItem" value="${ITEM_ID}"`);
    }
    // The table still lists the twenty, none of them marked as on screen.
    expect(
      [...html.matchAll(/data-catalog-queue-row="([^"]+)"/gu)].map(
        (match) => match[1],
      ),
    ).toEqual([ITEM_ID, SECOND_ID]);
    expect(html).not.toContain('aria-current="true"');
    expect(html).not.toContain("На екрані");
    expect(html).toContain(`data-catalog-queue-review="${ITEM_ID}"`);
    expect(html).toContain(`data-catalog-queue-review="${SECOND_ID}"`);
  });

  it("binds a merge grant to a decision shown outside the list", async () => {
    mocks.listOpenCurationQueue.mockResolvedValue([queueItem()]);
    mocks.readOpenCurationQueueItem.mockResolvedValue(
      queueItem({
        id: THIRD_ID,
        impactScore: 0,
        subject: node(NODE_B, "Solanum esculentum", 60),
        target: node(NODE_A, "Solanum lycopersicum"),
      }),
    );

    const asked = await render({ item: THIRD_ID });
    expect(asked).toContain('data-catalog-queue-confirm-objects="60"');
    expect(openingTag(asked, 'data-catalog-queue-action="confirm"')).toContain(
      `href="/garden/catalog/queue?item=${THIRD_ID}&amp;confirm=merge#decision"`,
    );
    expect(asked).not.toContain('data-catalog-queue-action="accept"');

    const granted = await render({ item: THIRD_ID, confirm: "merge" });
    const accept = formAround(granted, 'data-catalog-queue-action="accept"');
    expect(accept).toContain(`name="queueItemId" value="${THIRD_ID}"`);
    expect(accept).toContain('name="confirmMerge" value="yes"');
    expect(accept).toContain(`name="nextItem" value="${ITEM_ID}"`);
  });

  it("fails the decision part, not the page, when an item asked for cannot be read", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.readOpenCurationQueueItem.mockRejectedValue(
        postgresRejection("57014"),
      );
      mocks.listRecentAutomaticActions.mockResolvedValue([automaticAction()]);

      const html = await render({ item: THIRD_ID });

      expect(html).not.toContain("data-catalog-queue-item=");
      expect(html).toContain('data-section-failure="query_timeout"');
      expect(errorTitle(html)).toBe("Відкриті рішення");
      // The retry asks for the same item again.
      expect(openingTag(html, 'data-workspace-retry="section"')).toContain(
        `href="/garden/catalog/queue?item=${THIRD_ID}"`,
      );
      expect(html).toContain('data-catalog-automatic="true"');
    } finally {
      logged.mockRestore();
    }
  });

  it("prints every key it binds, beside what the key does", async () => {
    const html = await render();

    expect(html).toContain('data-catalog-queue-keys="true"');
    expect(html).toContain(">З клавіатури</h3>");
    expect(
      [...html.matchAll(/data-catalog-queue-key="(\w)"/gu)].map(
        (match) => match[1],
      ),
    ).toEqual(["y", "n", "j", "k", "u"]);
    for (const [key, label] of [
      ["y", "Прийняти"],
      ["n", "Відхилити"],
      ["j", "Наступне рішення"],
      ["k", "Попереднє рішення"],
      ["u", "Скасувати останню автоматичну дію"],
    ]) {
      expect(html, key).toMatch(
        new RegExp(
          `data-catalog-queue-key="${key}"[^>]*>${key}</kbd></dt><dd[^>]*>${label}</dd>`,
          "u",
        ),
      );
    }
    // The switch that turns them off is drawn once the browser can press
    // them, never in the server's markup.
    expect(html).not.toContain("data-catalog-queue-shortcuts=");
  });

  it("filters by type, marks the filter it is on, and counts each one", async () => {
    mocks.listOpenCurationQueue.mockResolvedValue([
      missItem({
        blockedBy: null,
        target: node(NODE_B, "Solanum lycopersicum"),
      }),
    ]);

    const html = await render({ type: "label_link" });

    expect(mocks.listOpenCurationQueue).toHaveBeenCalledWith({
      itemType: "label_link",
      limit: 20,
    });
    const current = openingTag(html, 'data-catalog-queue-filter="label_link"');
    expect(current).toContain('aria-current="page"');
    expect(current).toContain('href="/garden/catalog/queue?type=label_link"');
    expect(openingTag(html, 'data-catalog-queue-filter="all"')).not.toContain(
      "aria-current",
    );
    expect(openingTag(html, 'data-catalog-queue-filter="all"')).toContain(
      'href="/garden/catalog/queue"',
    );
    expect(html.match(/aria-current="page"/gu)).toHaveLength(1);
    expect(html).toContain("Усі типи (3)");
    expect(html).toContain("Назва садівника (1)");
    expect(html).toContain(markup("Об'єднання карток (2)"));
    expect(html).toContain(markup("Зв'язок із джерелом (0)"));
    // The view survives into the decision's forms.
    expect(formAround(html, 'data-catalog-queue-action="accept"')).toContain(
      'name="view" value="label_link"',
    );

    mocks.listOpenCurationQueue.mockClear();
    const unknown = await render({ type: "source_unmatched" });
    expect(mocks.listOpenCurationQueue).toHaveBeenCalledWith({
      itemType: null,
      limit: 20,
    });
    expect(openingTag(unknown, 'data-catalog-queue-filter="all"')).toContain(
      'aria-current="page"',
    );
  });

  it("lists every open decision with one way into each, and marks the one on screen", async () => {
    mocks.listOpenCurationQueue.mockResolvedValue([
      queueItem(),
      missItem(),
      queueItem({
        id: THIRD_ID,
        itemType: "label_link",
        subjectLabel: "Бичаче серце",
        reasons: [],
        impactScore: 1,
        subject: node(NODE_B, "Solanum lycopersicum"),
        target: null,
      }),
    ]);
    mocks.countOpenCurationQueue.mockResolvedValue({
      total: 30,
      byType: { node_merge: 10, label_link: 20 },
    });

    const html = await render();

    expect(openingTag(html, 'data-catalog-queue-table="true"')).toContain(
      'role="table"',
    );
    expect(html).toContain(
      ">Відкриті рішення, найбільший вплив згори</caption>",
    );
    expect(
      [...html.matchAll(/data-catalog-queue-row="([^"]+)"/gu)].map(
        (match) => match[1],
      ),
    ).toEqual([ITEM_ID, SECOND_ID, THIRD_ID]);

    const current = rowWith(html, `data-catalog-queue-row="${ITEM_ID}"`);
    expect(firstTag(current)).toContain('aria-current="true"');
    expect(current).toContain("На екрані");
    expect(current).not.toContain("data-catalog-queue-review=");

    const blocked = rowWith(html, `data-catalog-queue-row="${SECOND_ID}"`);
    expect(firstTag(blocked)).not.toContain("aria-current");
    const review = openingTag(
      blocked,
      `data-catalog-queue-review="${SECOND_ID}"`,
    );
    expect(review).toContain(
      `href="/garden/catalog/queue?item=${SECOND_ID}#decision"`,
    );
    expect(review).toContain('aria-label="Переглянути: «Де Барао»"');
    // The rule in words; a narrow cell does not repeat the code, which the
    // detail pane keeps.
    expect(blocked).toContain('data-catalog-reason="search_miss"');
    expect(blocked).toContain("Садівники шукали й не знайшли");
    expect(blocked).not.toContain("<code");
    expect(blocked).toContain("Прийняти не можна");

    const third = rowWith(html, `data-catalog-queue-row="${THIRD_ID}"`);
    expect(third).toContain("«Бичаче серце» → Solanum lycopersicum");
    expect(third).not.toContain("data-catalog-reason=");
    expect(openingTag(third, "data-catalog-queue-review=")).toContain(
      'aria-label="Переглянути: «Бичаче серце» → Solanum lycopersicum"',
    );

    expect(html.match(/aria-current="true"/gu)).toHaveLength(1);
    // The table holds the first twenty by impact, and says it is not all.
    expect(html).toContain('data-catalog-queue-shown="3"');
    expect(html).toContain("Показано перші 3 з 30, за впливом.");

    const moved = await render({ item: SECOND_ID });
    expect(
      firstTag(rowWith(moved, `data-catalog-queue-row="${SECOND_ID}"`)),
    ).toContain('aria-current="true"');
    expect(rowWith(moved, `data-catalog-queue-row="${ITEM_ID}"`)).toContain(
      `data-catalog-queue-review="${ITEM_ID}"`,
    );
    expect(moved.match(/aria-current="true"/gu)).toHaveLength(1);
  });

  it("names the decided item in the notice, read back from the record", async () => {
    mocks.readCurationQueueItemSummary.mockResolvedValue(decidedSummary());

    const html = await render({ result: "accepted", decided: SECOND_ID });

    expect(mocks.readCurationQueueItemSummary).toHaveBeenCalledWith(SECOND_ID);
    expect(mocks.readCurationActionSummary).not.toHaveBeenCalled();
    expect(html).toContain('id="queue-outcome"');
    expect(notice(html, "accepted")).toEqual({
      tone: "success",
      title: "Прийнято: «Де Барао» → Solanum lycopersicum.",
    });
    // The next decision is on screen beneath it.
    expect(html).toContain(`data-catalog-queue-item="${ITEM_ID}"`);
  });

  it.each([
    ["rejected", "rejected", "success"],
    ["skipped", "skipped", "success"],
    ["stale", "accepted", "info"],
    ["confirm", "open", "info"],
    ["failed", "open", "danger"],
    ["denied", "open", "danger"],
  ] as const)(
    "words a %s answer over a %s item in its own sentence and tone",
    async (result, state, tone) => {
      mocks.readCurationQueueItemSummary.mockResolvedValue(
        decidedSummary({ state }),
      );

      const html = await render({ result, decided: SECOND_ID });

      expect(notice(html, result)).toEqual({
        tone,
        title: markup(
          formatOperatorTemplate(uk.queue.outcome[result], {
            name: "«Де Барао» → Solanum lycopersicum",
          }),
        ),
      });
    },
  );

  it.each([
    ["accepted", "open"],
    ["accepted", "rejected"],
    ["rejected", "skipped"],
    ["skipped", "open"],
    ["stale", "open"],
    // The decision part never speaks of an undo.
    ["reverted", "accepted"],
  ] as const)(
    "says nothing of %s over an item the record holds as %s",
    async (result, state) => {
      mocks.readCurationQueueItemSummary.mockResolvedValue(
        decidedSummary({ state }),
      );

      const html = await render({ result, decided: SECOND_ID });

      expect(mocks.readCurationQueueItemSummary).toHaveBeenCalledWith(
        SECOND_ID,
      );
      expect(html).not.toContain("data-action-outcome=");
      expect(html).not.toContain('id="queue-outcome"');
      // The decision on screen is unaffected.
      expect(html).toContain(`data-catalog-queue-item="${ITEM_ID}"`);
    },
  );

  it.each([
    ["failed", "accepted"],
    ["confirm", "rejected"],
  ] as const)(
    "turns %s over an item the record holds as %s into already decided",
    async (result, state) => {
      mocks.readCurationQueueItemSummary.mockResolvedValue(
        decidedSummary({ state }),
      );

      const html = await render({ result, decided: SECOND_ID });

      expect(html).not.toContain(`data-action-outcome="${result}"`);
      expect(notice(html, "stale")).toEqual({
        tone: "info",
        title: markup(
          formatOperatorTemplate(uk.queue.outcome.stale, {
            name: "«Де Барао» → Solanum lycopersicum",
          }),
        ),
      });
    },
  );

  it("trusts no outcome it cannot read back", async () => {
    // A word the queue never writes.
    const unknown = await render({ result: "done", decided: SECOND_ID });
    expect(unknown).not.toContain("data-action-outcome=");
    // An item id that is not one.
    const junk = await render({ result: "accepted", decided: "item-1" });
    expect(junk).not.toContain("data-action-outcome=");
    expect(mocks.readCurationQueueItemSummary).not.toHaveBeenCalled();

    // An item the record does not hold.
    const missing = await render({ result: "accepted", decided: MISSING_ID });
    expect(mocks.readCurationQueueItemSummary).toHaveBeenCalledWith(MISSING_ID);
    expect(missing).not.toContain("data-action-outcome=");
    expect(missing).toContain(`data-catalog-queue-item="${ITEM_ID}"`);
  });

  it("lists the week's automatic decisions: undo only for one still in force, and a badge for one undone", async () => {
    mocks.listRecentAutomaticActions.mockResolvedValue([
      automaticAction(),
      automaticAction({
        actionId: ACTION_REVERTED,
        actionType: "merge",
        itemType: "node_merge",
        ruleCode: "shared_identifier",
        reasons: [],
        subjectNames: ["Lycopersicon esculentum", "Solanum lycopersicum"],
        performedAt: new Date("2026-09-04T10:00:00.000Z"),
        reverted: true,
      }),
    ]);

    const html = await render({ type: "node_merge", item: ITEM_ID });

    expect(mocks.listRecentAutomaticActions).toHaveBeenCalledWith({
      days: 7,
      limit: 25,
    });
    expect(html).toContain('data-catalog-automatic="true"');

    const applied = rowWith(
      html,
      `data-catalog-automatic-action="${ACTION_APPLIED}"`,
    );
    expect(applied).toContain('data-catalog-automatic-state="applied"');
    expect(applied).toContain(">Діє</span>");
    expect(applied).toContain('data-catalog-reason="denomination_equal"');
    expect(applied).toContain("Та сама назва сорту чи породи");
    expect(applied).not.toContain("<code");
    const undo = formAround(
      applied,
      `data-catalog-automatic-undo="${ACTION_APPLIED}"`,
    );
    expect(undo).toContain(`name="actionId" value="${ACTION_APPLIED}"`);
    // The undo comes back to the view it was pressed in.
    expect(undo).toContain('name="view" value="node_merge"');
    expect(undo).toContain(`name="item" value="${ITEM_ID}"`);
    expect(openingTag(applied, "data-catalog-automatic-undo=")).toContain(
      'aria-label="Скасувати: Де Барао"',
    );

    const reverted = rowWith(
      html,
      `data-catalog-automatic-action="${ACTION_REVERTED}"`,
    );
    expect(reverted).toContain('data-catalog-automatic-state="reverted"');
    expect(reverted).toContain(">Скасовано</span>");
    expect(reverted).toContain(
      "Lycopersicon esculentum → Solanum lycopersicum",
    );
    expect(reverted).toContain(markup("Об'єднання карток"));
    expect(reverted).toContain("Спільний зовнішній ідентифікатор");
    expect(reverted).not.toContain("data-catalog-automatic-undo");
    expect(reverted).not.toContain("<form");
    // So U, which presses the first undo, can never press a reverted one.
    expect(html.match(/data-catalog-automatic-undo=/gu)).toHaveLength(1);
  });

  it("says what an undo did, read back from the action", async () => {
    mocks.readCurationActionSummary.mockResolvedValue({
      actionId: ACTION_APPLIED,
      reverted: true,
      subjectNames: ["Де Барао"],
    });

    const undone = await render({ result: "reverted", action: ACTION_APPLIED });
    expect(mocks.readCurationActionSummary).toHaveBeenCalledWith(
      ACTION_APPLIED,
    );
    expect(mocks.readCurationQueueItemSummary).not.toHaveBeenCalled();
    expect(undone).toContain('id="automatic-outcome"');
    expect(notice(undone, "reverted")).toEqual({
      tone: "success",
      title: "Автоматичну дію скасовано: Де Барао.",
    });

    const already = await render({ result: "stale", action: ACTION_APPLIED });
    expect(notice(already, "stale")).toEqual({
      tone: "info",
      title: "Де Барао уже вирішено раніше — нічого не змінено.",
    });
  });

  it.each([
    ["reverted", false, null, null],
    ["stale", false, null, null],
    // A decision's word, sent to an undo, says nothing either.
    ["accepted", true, null, null],
    ["failed", true, "stale", "info"],
    ["failed", false, "failed", "danger"],
    ["denied", false, "denied", "danger"],
  ] as const)(
    "words an undo's %s over an action whose reverted is %s as the record bears out",
    async (result, reverted, shown, tone) => {
      mocks.readCurationActionSummary.mockResolvedValue({
        actionId: ACTION_APPLIED,
        reverted,
        subjectNames: ["Де Барао"],
        revertedByUserId: null,
        revertedAt: null,
      });

      const html = await render({ result, action: ACTION_APPLIED });

      expect(mocks.readCurationActionSummary).toHaveBeenCalledWith(
        ACTION_APPLIED,
      );
      if (shown === null) {
        expect(html).not.toContain("data-action-outcome=");
        expect(html).not.toContain('id="automatic-outcome"');
      } else {
        expect(html.match(/data-action-outcome=/gu)).toHaveLength(1);
        expect(notice(html, shown)).toEqual({
          tone,
          title: markup(
            formatOperatorTemplate(uk.queue.outcome[shown], {
              name: "Де Барао",
            }),
          ),
        });
      }
    },
  );

  it("tells an empty queue from an empty filter", async () => {
    mocks.listOpenCurationQueue.mockResolvedValue([]);
    mocks.countOpenCurationQueue.mockResolvedValue({ total: 0, byType: {} });
    mocks.readOldestOpenQueueItemAgeDays.mockResolvedValue(null);

    const empty = await render();
    expect(empty).toContain('data-catalog-queue-empty="true"');
    expect(empty).toContain(markup(uk.queue.empty));
    expect(empty).not.toContain(markup(uk.queue.emptyFiltered));
    expect(empty).toContain("Відкрито 0 рішень");
    expect(empty).not.toContain("data-catalog-queue-oldest-days");
    expect(empty).not.toContain("data-catalog-queue-item=");
    expect(empty).not.toContain("data-catalog-queue-table");

    mocks.countOpenCurationQueue.mockResolvedValue({
      total: 3,
      byType: { node_merge: 3 },
    });
    const filtered = await render({ type: "split_review" });
    expect(filtered).toContain('data-catalog-queue-empty="true"');
    expect(filtered).toContain(markup(uk.queue.emptyFiltered));
    expect(filtered).not.toContain(markup(uk.queue.empty));
    expect(filtered).not.toContain("data-catalog-queue-item=");
  });

  it("offers no control to a reader who may not decide", async () => {
    mocks.assertAdminCapabilityForScope.mockResolvedValue({
      ...OWNER_ACCESS,
      capabilities: ["operator:read"],
    });
    mocks.listRecentAutomaticActions.mockResolvedValue([automaticAction()]);

    const html = await render();

    expect(html).toContain(`data-catalog-queue-item="${ITEM_ID}"`);
    expect(html).toContain(`data-catalog-automatic-action="${ACTION_APPLIED}"`);
    expect(html).not.toContain("data-catalog-queue-controls");
    expect(html).not.toContain("data-catalog-queue-action=");
    expect(html).not.toContain("data-catalog-queue-keys");
    expect(html).not.toContain("data-catalog-automatic-undo");
    expect(html).not.toContain("<form");
  });

  it("refuses a member with the denied callout, reads nothing, and offers no way to the other queue", async () => {
    mocks.resolveWorkspaceAdminAccess.mockResolvedValue({ status: "denied" });

    const html = await render({ type: "node_merge" });

    expect(html).toContain('data-operator-access-state="denied"');
    expect(html).toContain('data-catalog-operator-denied="true"');
    expect(html).toContain("Лише для власника каталогу");
    expect(html).not.toContain("data-operator-cross-link");
    expect(html).not.toContain("data-catalog-queue=");
    expect(mocks.listOpenCurationQueue).not.toHaveBeenCalled();
    expect(mocks.countOpenCurationQueue).not.toHaveBeenCalled();
    expect(mocks.readOldestOpenQueueItemAgeDays).not.toHaveBeenCalled();
    expect(mocks.listRecentAutomaticActions).not.toHaveBeenCalled();
  });

  it.each([
    [
      "the owner check",
      () =>
        mocks.resolveWorkspaceAdminAccess.mockResolvedValue({
          status: "unavailable",
          failure: describeWorkspaceFailure(postgresRejection("08006")),
        }),
    ],
    [
      "the session",
      () =>
        mocks.resolveWorkspaceViewer.mockResolvedValue({
          status: "unavailable",
          failure: describeWorkspaceFailure(postgresRejection("08006")),
        }),
    ],
  ])(
    "says access could not be checked when %s cannot be read, never that it was refused",
    async (_label, arrange) => {
      arrange();

      const html = await render({ type: "node_merge", item: ITEM_ID });

      expect(html).toContain('data-operator-access-state="unavailable"');
      expect(errorTitle(html)).toBe("Не вдалося перевірити доступ");
      expect(html).not.toContain("Доступ заборонено");
      expect(html).not.toContain("Лише для власника каталогу");
      expect(html).toContain('data-section-failure="connection_unavailable"');
      // The retry keeps the view the owner was on.
      expect(openingTag(html, 'data-workspace-retry="section"')).toContain(
        `href="/garden/catalog/queue?type=node_merge&amp;item=${ITEM_ID}"`,
      );
      expect(html).not.toContain("data-operator-cross-link");
      expect(mocks.listOpenCurationQueue).not.toHaveBeenCalled();
      expect(mocks.listRecentAutomaticActions).not.toHaveBeenCalled();
    },
  );

  it("asks a signed-out visitor to sign in and come back to the same view", async () => {
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "sign-in-required",
    });

    const html = await render({ type: "node_merge" });

    expect(html).toContain('data-operator-access-state="sign-in-required"');
    expect(html).toContain('data-sign-in-prompt="true"');
    expect(html).toContain(
      `href="/auth/sign-in?next=${encodeURIComponent("/garden/catalog/queue?type=node_merge")}"`,
    );
    expect(html).not.toContain("data-operator-cross-link");
    expect(mocks.resolveWorkspaceAdminAccess).not.toHaveBeenCalled();
    expect(mocks.listOpenCurationQueue).not.toHaveBeenCalled();
  });

  it("keeps the week's automatic decisions when the queue cannot be read", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.listOpenCurationQueue.mockRejectedValue(postgresRejection("57014"));
      mocks.listRecentAutomaticActions.mockResolvedValue([automaticAction()]);

      const html = await render({ type: "node_merge" });

      expect(html).not.toContain('data-catalog-queue="true"');
      expect(html).not.toContain("data-catalog-queue-item=");
      expect(html).toContain('data-section-failure="query_timeout"');
      expect(errorTitle(html)).toBe("Відкриті рішення");
      expect(openingTag(html, 'data-workspace-retry="section"')).toContain(
        'href="/garden/catalog/queue?type=node_merge"',
      );
      expect(html).toContain('data-catalog-automatic="true"');
      expect(html).toContain(`data-catalog-automatic-undo="${ACTION_APPLIED}"`);
      // The log names the block that failed.
      expect(
        logged.mock.calls.some((call) =>
          String(call[0]).includes(
            '"surface":"catalog-queue","section":"queue"',
          ),
        ),
      ).toBe(true);
    } finally {
      logged.mockRestore();
    }
  });

  it("keeps the decision on screen when the automatic decisions cannot be read", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.listRecentAutomaticActions.mockRejectedValue(
        postgresRejection("08006"),
      );

      const html = await render();

      expect(html).toContain(`data-catalog-queue-item="${ITEM_ID}"`);
      expect(
        formAround(html, 'data-catalog-queue-action="accept"'),
      ).not.toBeNull();
      expect(html).not.toContain('data-catalog-automatic="true"');
      expect(html).toContain('data-section-failure="connection_unavailable"');
      // Named once, by the part's own heading above the panel.
      expect(errorTitle(html)).toBe("Цей розділ зараз недоступний");
      const panel = html.indexOf('data-slot="error-state"');
      expect(html.slice(html.lastIndexOf("<h2", panel), panel)).toContain(
        ">Застосовано автоматично за тиждень</h2>",
      );
      expect(
        logged.mock.calls.some((call) =>
          String(call[0]).includes(
            '"surface":"catalog-queue","section":"automatic"',
          ),
        ),
      ).toBe(true);
    } finally {
      logged.mockRestore();
    }
  });

  it("is never indexed", async () => {
    const { generateMetadata } = await import("./page");

    await expect(generateMetadata()).resolves.toEqual({
      title: "Черга рішень каталогу | OverGarden",
      robots: { index: false, follow: false },
    });
  });
});
