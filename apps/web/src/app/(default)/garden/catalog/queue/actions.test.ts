import { postgresRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminAccessDeniedError } from "@/server/admin-access";
import type { CurationQueueItemSummary } from "@/server/catalog-curation-repository";
import { describeWorkspaceFailure } from "@/server/workspace-failure";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublicCacheTags: vi.fn(),
  announceCatalogCard: vi.fn(),
  resolveMutationScope: vi.fn(),
  ownerUserIdFromFormData: vi.fn(),
  resolveWorkspaceAdminAccess: vi.fn(),
  assertAdminCapabilityForScope: vi.fn(),
  applyCatalogQueueItem: vi.fn(),
  revertCatalogAction: vi.fn(),
  rejectCatalogQueueItem: vi.fn(),
  skipCatalogQueueItem: vi.fn(),
  countObjectsOnCatalogItem: vi.fn(),
  readCurationQueueItemSummary: vi.fn(),
  readCurationActionSummary: vi.fn(),
  readQueueItemActionSubjects: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/public-cache-revalidation", () => ({
  revalidatePublicCacheTags: mocks.revalidatePublicCacheTags,
}));
vi.mock("@/server/indexnow-public-addresses", () => ({
  announceCatalogCard: mocks.announceCatalogCard,
}));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: mocks.ownerUserIdFromFormData,
}));
vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceAdminAccess: mocks.resolveWorkspaceAdminAccess,
}));
// The real module's refusal class, so the real owner check (swapped in by one
// case below) can tell a refusal from an outage.
vi.mock("@/server/admin-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/admin-access")>()),
  assertAdminCapabilityForScope: mocks.assertAdminCapabilityForScope,
}));
vi.mock("@/server/catalog-curation-repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/catalog-curation-repository")
  >()),
  applyCatalogQueueItem: mocks.applyCatalogQueueItem,
  revertCatalogAction: mocks.revertCatalogAction,
  rejectCatalogQueueItem: mocks.rejectCatalogQueueItem,
  skipCatalogQueueItem: mocks.skipCatalogQueueItem,
  countObjectsOnCatalogItem: mocks.countObjectsOnCatalogItem,
  readCurationQueueItemSummary: mocks.readCurationQueueItemSummary,
  readCurationActionSummary: mocks.readCurationActionSummary,
  readQueueItemActionSubjects: mocks.readQueueItemActionSubjects,
}));
// Nothing here may open a pool or load Better Auth: every read is a mock.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
}));

import {
  acceptCatalogQueueItemAction,
  rejectCatalogQueueItemAction,
  revertCatalogActionAction,
  skipCatalogQueueItemAction,
} from "./actions";

const QUEUE = "/garden/catalog/queue";
const ITEM = "11111111-1111-4111-8111-111111111111";
const NEXT = "44444444-4444-4444-8444-444444444444";
const NODE = "22222222-2222-4222-8222-222222222222";
const OTHER_NODE = "33333333-3333-4333-8333-333333333333";
const ACTION = "55555555-5555-4555-8555-555555555555";
const REVERT = "66666666-6666-4666-8666-666666666666";

const scope = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};
/** Another signed-in account: a second owner session never shares an id. */
const OTHER_USER = "00000000-0000-4000-8000-000000000002";
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

const DECISIONS = [
  ["accept", acceptCatalogQueueItemAction],
  ["reject", rejectCatalogQueueItemAction],
  ["skip", skipCatalogQueueItemAction],
] as const;

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

function openItem(
  overrides: Partial<CurationQueueItemSummary> = {},
): CurationQueueItemSummary {
  return {
    id: ITEM,
    itemType: "label_link",
    state: "open",
    subjectLabel: "Де Барао",
    subjectCatalogItemId: null,
    subjectName: null,
    targetName: "Solanum lycopersicum",
    decidedByUserId: null,
    decidedAt: null,
    ...overrides,
  };
}

function openMerge(): CurationQueueItemSummary {
  return openItem({
    itemType: "node_merge",
    subjectLabel: null,
    subjectCatalogItemId: NODE,
    subjectName: "Lycopersicon esculentum",
  });
}

/**
 * Where the action sent the owner. The mock throws the way the framework's
 * `redirect` does, so nothing after it runs — and a redirect swallowed by a
 * `catch` would show up as a second call or a missing rejection.
 */
async function redirectedTo(pending: Promise<unknown>): Promise<string> {
  await expect(pending).rejects.toThrow("NEXT_REDIRECT");
  expect(mocks.redirect).toHaveBeenCalledTimes(1);
  return String(mocks.redirect.mock.calls[0]?.[0]);
}

function expectNothingWritten() {
  expect(mocks.applyCatalogQueueItem).not.toHaveBeenCalled();
  expect(mocks.rejectCatalogQueueItem).not.toHaveBeenCalled();
  expect(mocks.skipCatalogQueueItem).not.toHaveBeenCalled();
  expect(mocks.revertCatalogAction).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
  expect(mocks.revalidatePublicCacheTags).not.toHaveBeenCalled();
  expect(mocks.announceCatalogCard).not.toHaveBeenCalled();
}

describe("curation queue actions (ADR-0026 D10, OVE-506)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mocks.ownerUserIdFromFormData.mockReturnValue(scope.userId);
    mocks.resolveMutationScope.mockResolvedValue({ status: "admitted", scope });
    // An allowed owner check still runs the load it was given, so the suite
    // sees which capability was asked for, and for whom.
    mocks.resolveWorkspaceAdminAccess.mockImplementation(
      async (load: () => Promise<unknown>) => ({
        status: "allowed",
        access: await load(),
      }),
    );
    mocks.assertAdminCapabilityForScope.mockResolvedValue(OWNER_ACCESS);
    mocks.readCurationQueueItemSummary.mockResolvedValue(openItem());
    mocks.applyCatalogQueueItem.mockResolvedValue({
      actionId: ACTION,
      subjectCatalogItemIds: [NODE],
    });
    mocks.rejectCatalogQueueItem.mockResolvedValue({ changed: true });
    mocks.skipCatalogQueueItem.mockResolvedValue({ changed: true });
    mocks.revertCatalogAction.mockResolvedValue({
      revertActionId: REVERT,
      subjectCatalogItemIds: [NODE],
    });
    mocks.readCurationActionSummary.mockResolvedValue(null);
    mocks.readQueueItemActionSubjects.mockResolvedValue([NODE]);
  });

  describe("accept", () => {
    it("applies an open item through the SQL function and lands on the next decision with the answer", async () => {
      const url = await redirectedTo(
        acceptCatalogQueueItemAction(
          undefined,
          form({ queueItemId: ITEM, nextItem: NEXT, view: "label_link" }),
        ),
      );

      expect(mocks.resolveMutationScope).toHaveBeenCalledWith({
        expectedOwnerUserId: scope.userId,
        authoritative: true,
      });
      expect(mocks.assertAdminCapabilityForScope).toHaveBeenCalledWith(
        scope,
        "operator:mutate",
      );
      expect(mocks.readCurationQueueItemSummary).toHaveBeenCalledWith(ITEM);
      expect(mocks.applyCatalogQueueItem).toHaveBeenCalledTimes(1);
      expect(mocks.applyCatalogQueueItem).toHaveBeenCalledWith({
        queueItemId: ITEM,
        actorUserId: scope.userId,
        automatic: false,
      });
      expect(mocks.revalidatePublicCacheTags).toHaveBeenCalledWith(
        [`organism:${NODE}`, "organism-slugs", "catalog", "sitemap"],
        "expire",
      );
      expect(mocks.announceCatalogCard).toHaveBeenCalledWith(NODE);
      expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
      expect(mocks.revalidatePath).toHaveBeenCalledWith(QUEUE);
      expect(url).toBe(
        `${QUEUE}?type=label_link&item=${NEXT}&result=accepted&decided=${ITEM}#queue-outcome`,
      );
    });

    it("names the item the way the page reads it back", async () => {
      const url = await redirectedTo(
        acceptCatalogQueueItemAction(
          undefined,
          form({ queueItemId: ` ${ITEM.toUpperCase()} ` }),
        ),
      );

      expect(mocks.applyCatalogQueueItem).toHaveBeenCalledWith(
        expect.objectContaining({ queueItemId: ITEM }),
      );
      expect(url).toBe(
        `${QUEUE}?result=accepted&decided=${ITEM}#queue-outcome`,
      );
    });

    it.each([
      ["decided in another tab", openItem({ state: "accepted" })],
      ["gone from the record", null],
    ])(
      "says stale and writes nothing for an item %s",
      async (_label, summary) => {
        mocks.readCurationQueueItemSummary.mockResolvedValue(summary);

        const url = await redirectedTo(
          acceptCatalogQueueItemAction(
            undefined,
            form({ queueItemId: ITEM, nextItem: NEXT }),
          ),
        );

        expect(url).toBe(
          `${QUEUE}?item=${NEXT}&result=stale&decided=${ITEM}#queue-outcome`,
        );
        expectNothingWritten();
      },
    );

    it("asks before a merge of more than fifty objects, counting the item's own subject, never the form's", async () => {
      mocks.readCurationQueueItemSummary.mockResolvedValue(openMerge());
      mocks.countObjectsOnCatalogItem.mockResolvedValue(51);

      const url = await redirectedTo(
        acceptCatalogQueueItemAction(
          undefined,
          form({
            queueItemId: ITEM,
            nextItem: NEXT,
            view: "node_merge",
            // A stale or forged form cannot choose what is counted.
            mergeSubjectCatalogItemId: OTHER_NODE,
            subjectCatalogItemId: OTHER_NODE,
          }),
        ),
      );

      expect(mocks.countObjectsOnCatalogItem).toHaveBeenCalledTimes(1);
      expect(mocks.countObjectsOnCatalogItem).toHaveBeenCalledWith(NODE);
      // The same item stays on screen, asking — and with no grant in hand.
      expect(url).toBe(
        `${QUEUE}?type=node_merge&item=${ITEM}&result=confirm&decided=${ITEM}#queue-outcome`,
      );
      expect(url).not.toContain("confirm=merge");
      expectNothingWritten();
    });

    it("applies a confirmed merge without counting again", async () => {
      mocks.readCurationQueueItemSummary.mockResolvedValue(openMerge());
      mocks.countObjectsOnCatalogItem.mockResolvedValue(51);

      const url = await redirectedTo(
        acceptCatalogQueueItemAction(
          undefined,
          form({ queueItemId: ITEM, nextItem: NEXT, confirmMerge: "yes" }),
        ),
      );

      expect(mocks.countObjectsOnCatalogItem).not.toHaveBeenCalled();
      expect(mocks.applyCatalogQueueItem).toHaveBeenCalledTimes(1);
      expect(url).toBe(
        `${QUEUE}?item=${NEXT}&result=accepted&decided=${ITEM}#queue-outcome`,
      );
    });

    it("treats anything but the word yes as no confirmation", async () => {
      mocks.readCurationQueueItemSummary.mockResolvedValue(openMerge());
      mocks.countObjectsOnCatalogItem.mockResolvedValue(51);

      const url = await redirectedTo(
        acceptCatalogQueueItemAction(
          undefined,
          form({ queueItemId: ITEM, confirmMerge: "true" }),
        ),
      );

      expect(url).toContain("result=confirm");
      expect(mocks.applyCatalogQueueItem).not.toHaveBeenCalled();
    });

    it("never asks about fifty objects or fewer, or about an item that is not a merge", async () => {
      mocks.readCurationQueueItemSummary.mockResolvedValue(openMerge());
      mocks.countObjectsOnCatalogItem.mockResolvedValue(50);
      expect(
        await redirectedTo(
          acceptCatalogQueueItemAction(undefined, form({ queueItemId: ITEM })),
        ),
      ).toContain("result=accepted");
      expect(mocks.applyCatalogQueueItem).toHaveBeenCalledTimes(1);

      vi.clearAllMocks();
      mocks.redirect.mockImplementation(() => {
        throw new Error("NEXT_REDIRECT");
      });
      mocks.readCurationQueueItemSummary.mockResolvedValue(
        openItem({ subjectCatalogItemId: NODE }),
      );
      expect(
        await redirectedTo(
          acceptCatalogQueueItemAction(undefined, form({ queueItemId: ITEM })),
        ),
      ).toContain("result=accepted");
      expect(mocks.countObjectsOnCatalogItem).not.toHaveBeenCalled();
    });

    it("keeps the item on screen to retry when the apply fails and the item is still open", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        mocks.applyCatalogQueueItem.mockRejectedValue(
          new Error("catalog_apply_queue_item: statement timeout"),
        );
        mocks.readCurationQueueItemSummary
          .mockResolvedValueOnce(openItem())
          .mockResolvedValueOnce(openItem());

        const url = await redirectedTo(
          acceptCatalogQueueItemAction(
            undefined,
            form({ queueItemId: ITEM, nextItem: NEXT }),
          ),
        );

        expect(url).toBe(
          `${QUEUE}?item=${ITEM}&result=failed&decided=${ITEM}#queue-outcome`,
        );
        expect(mocks.readCurationQueueItemSummary).toHaveBeenCalledTimes(2);
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
        expect(mocks.revalidatePublicCacheTags).not.toHaveBeenCalled();
      } finally {
        logged.mockRestore();
      }
    });

    it("says stale when the apply was refused because the item was decided meanwhile", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        mocks.applyCatalogQueueItem.mockRejectedValue(
          new Error("queue item is not open"),
        );
        mocks.readCurationQueueItemSummary
          .mockResolvedValueOnce(openItem())
          .mockResolvedValueOnce(openItem({ state: "rejected" }));

        const url = await redirectedTo(
          acceptCatalogQueueItemAction(
            undefined,
            form({ queueItemId: ITEM, nextItem: NEXT }),
          ),
        );

        expect(url).toBe(
          `${QUEUE}?item=${NEXT}&result=stale&decided=${ITEM}#queue-outcome`,
        );
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
      } finally {
        logged.mockRestore();
      }
    });

    it("says accepted when the apply committed and only the read after it failed", async () => {
      // The function's own statement committed; the read of its subjects did
      // not. The item is accepted, by this owner, a moment ago: that is this
      // decision, and "already decided" would disown it.
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        mocks.applyCatalogQueueItem.mockRejectedValue(
          postgresRejection("08006"),
        );
        mocks.readCurationQueueItemSummary
          .mockResolvedValueOnce(openItem())
          .mockResolvedValueOnce(
            openItem({
              state: "accepted",
              decidedByUserId: scope.userId,
              decidedAt: new Date(),
            }),
          );

        const url = await redirectedTo(
          acceptCatalogQueueItemAction(
            undefined,
            form({ queueItemId: ITEM, nextItem: NEXT }),
          ),
        );

        expect(url).toBe(
          `${QUEUE}?item=${NEXT}&result=accepted&decided=${ITEM}#queue-outcome`,
        );
        expect(mocks.revalidatePath).toHaveBeenCalledWith(QUEUE);
        // The function never handed its cards back, so they are read from the
        // decision's action row and expired all the same.
        expect(mocks.readQueueItemActionSubjects).toHaveBeenCalledWith(ITEM);
        expect(mocks.revalidatePublicCacheTags).toHaveBeenCalledWith(
          expect.arrayContaining([expect.stringContaining(NODE)]),
          "expire",
        );
        expect(mocks.announceCatalogCard).toHaveBeenCalledWith(NODE);
      } finally {
        logged.mockRestore();
      }
    });

    it.each([
      [
        "by another account",
        { decidedByUserId: OTHER_USER, decidedAt: new Date() },
      ],
      [
        "by this owner, long ago",
        {
          decidedByUserId: scope.userId,
          decidedAt: new Date(Date.now() - 60 * 60_000),
        },
      ],
    ] as const)(
      "says stale for an item accepted %s",
      async (_label, decided) => {
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
          mocks.applyCatalogQueueItem.mockRejectedValue(
            new Error("queue item is accepted"),
          );
          mocks.readCurationQueueItemSummary
            .mockResolvedValueOnce(openItem())
            .mockResolvedValueOnce(openItem({ state: "accepted", ...decided }));

          const url = await redirectedTo(
            acceptCatalogQueueItemAction(
              undefined,
              form({ queueItemId: ITEM, nextItem: NEXT }),
            ),
          );

          expect(url).toBe(
            `${QUEUE}?item=${NEXT}&result=stale&decided=${ITEM}#queue-outcome`,
          );
          expect(mocks.revalidatePath).not.toHaveBeenCalled();
        } finally {
          logged.mockRestore();
        }
      },
    );

    it("recognises its own earlier accept when the item is no longer open at the start", async () => {
      // The first press committed and its answer was lost; the owner pressed
      // again. That is their decision, not someone else's.
      mocks.readCurationQueueItemSummary.mockResolvedValue({
        ...openMerge(),
        state: "accepted",
        decidedByUserId: scope.userId,
        decidedAt: new Date(Date.now() - 30_000),
      });
      mocks.countObjectsOnCatalogItem.mockResolvedValue(500);

      const url = await redirectedTo(
        acceptCatalogQueueItemAction(
          undefined,
          form({ queueItemId: ITEM, nextItem: NEXT, view: "node_merge" }),
        ),
      );

      expect(url).toBe(
        `${QUEUE}?type=node_merge&item=${NEXT}&result=accepted&decided=${ITEM}#queue-outcome`,
      );
      // Nothing is applied twice, and a decided merge is not counted again.
      expect(mocks.applyCatalogQueueItem).not.toHaveBeenCalled();
      expect(mocks.countObjectsOnCatalogItem).not.toHaveBeenCalled();
      expect(mocks.readCurationQueueItemSummary).toHaveBeenCalledTimes(1);
      expect(mocks.revalidatePath).toHaveBeenCalledWith(QUEUE);
      // Its cards are expired from the decision's action row.
      expect(mocks.announceCatalogCard).toHaveBeenCalledWith(NODE);
    });

    it("still answers accepted when the recognised decision's cards cannot be read", async () => {
      // Expiring the cards is best effort: the card intents the function
      // recorded refresh them within a day. The owner's answer does not wait.
      mocks.readCurationQueueItemSummary.mockResolvedValue({
        ...openItem(),
        state: "accepted",
        decidedByUserId: scope.userId,
        decidedAt: new Date(),
      });
      mocks.readQueueItemActionSubjects.mockRejectedValue(
        postgresRejection("08006"),
      );

      const url = await redirectedTo(
        acceptCatalogQueueItemAction(
          undefined,
          form({ queueItemId: ITEM, nextItem: NEXT }),
        ),
      );

      expect(url).toBe(
        `${QUEUE}?item=${NEXT}&result=accepted&decided=${ITEM}#queue-outcome`,
      );
      expect(mocks.revalidatePublicCacheTags).not.toHaveBeenCalled();
    });

    it.each([
      [
        "another account accepted",
        {
          state: "accepted",
          decidedByUserId: OTHER_USER,
          decidedAt: new Date(),
        },
      ],
      [
        "the owner accepted long ago",
        {
          state: "accepted",
          decidedByUserId: scope.userId,
          decidedAt: new Date(Date.now() - 60 * 60_000),
        },
      ],
      [
        "the owner rejected just now",
        {
          state: "rejected",
          decidedByUserId: scope.userId,
          decidedAt: new Date(),
        },
      ],
      [
        "the worker applied",
        { state: "auto_applied", decidedByUserId: null, decidedAt: new Date() },
      ],
    ] as const)(
      "says stale, applying nothing, for an item not open at the start that %s",
      async (_label, decided) => {
        mocks.readCurationQueueItemSummary.mockResolvedValue(openItem(decided));

        const url = await redirectedTo(
          acceptCatalogQueueItemAction(
            undefined,
            form({ queueItemId: ITEM, nextItem: NEXT }),
          ),
        );

        expect(url).toBe(
          `${QUEUE}?item=${NEXT}&result=stale&decided=${ITEM}#queue-outcome`,
        );
        expectNothingWritten();
      },
    );

    it.each([
      ["119 999 ms ago", "accepted", 119_999],
      ["exactly two minutes ago", "stale", 120_000],
    ] as const)(
      "answers the owner's own accept made %s with %s",
      async (_label, result, ago) => {
        const now = new Date("2026-09-23T12:00:00.000Z");
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(now);
        try {
          mocks.readCurationQueueItemSummary.mockResolvedValue(
            openItem({
              state: "accepted",
              decidedByUserId: scope.userId,
              decidedAt: new Date(now.getTime() - ago),
            }),
          );

          const url = await redirectedTo(
            acceptCatalogQueueItemAction(
              undefined,
              form({ queueItemId: ITEM, nextItem: NEXT }),
            ),
          );

          expect(url).toBe(
            `${QUEUE}?item=${NEXT}&result=${result}&decided=${ITEM}#queue-outcome`,
          );
        } finally {
          vi.useRealTimers();
        }
      },
    );

    it.each([
      [
        "an ISO string",
        (): string => new Date(Date.now() - 30_000).toISOString(),
        "accepted",
      ],
      ["an unreadable string", (): string => "yesterday-ish", "stale"],
    ] as const)(
      "reads a decision time given as %s",
      async (_label, decidedAt, result) => {
        mocks.readCurationQueueItemSummary.mockResolvedValue(
          openItem({
            state: "accepted",
            decidedByUserId: scope.userId,
            decidedAt: decidedAt(),
          }),
        );

        const url = await redirectedTo(
          acceptCatalogQueueItemAction(
            undefined,
            form({ queueItemId: ITEM, nextItem: NEXT }),
          ),
        );

        expect(url).toContain(`result=${result}`);
        expect(mocks.applyCatalogQueueItem).not.toHaveBeenCalled();
      },
    );

    it("treats an item that cannot be read as a failure to retry, never as decided", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        mocks.readCurationQueueItemSummary.mockRejectedValue(
          postgresRejection("08006"),
        );

        const url = await redirectedTo(
          acceptCatalogQueueItemAction(
            undefined,
            form({ queueItemId: ITEM, nextItem: NEXT }),
          ),
        );

        expect(url).toBe(
          `${QUEUE}?item=${ITEM}&result=failed&decided=${ITEM}#queue-outcome`,
        );
        expectNothingWritten();
      } finally {
        logged.mockRestore();
      }
    });

    it("says stale without touching the repository when the form names no item it can read", async () => {
      const url = await redirectedTo(
        acceptCatalogQueueItemAction(
          undefined,
          form({ queueItemId: "item-1", view: "not-a-type" }),
        ),
      );

      expect(url).toBe(`${QUEUE}?result=stale#queue-outcome`);
      expect(mocks.readCurationQueueItemSummary).not.toHaveBeenCalled();
      expectNothingWritten();
    });
  });

  describe("reject and skip", () => {
    it.each([
      ["reject", rejectCatalogQueueItemAction, "rejected"],
      ["skip", skipCatalogQueueItemAction, "skipped"],
    ] as const)(
      "%s records the owner's answer on the item and moves to the next decision",
      async (_label, action, result) => {
        const url = await redirectedTo(
          action(
            undefined,
            form({ queueItemId: ITEM, nextItem: NEXT, view: "node_merge" }),
          ),
        );

        const write =
          result === "rejected"
            ? mocks.rejectCatalogQueueItem
            : mocks.skipCatalogQueueItem;
        expect(write).toHaveBeenCalledTimes(1);
        expect(write).toHaveBeenCalledWith({
          queueItemId: ITEM,
          actorUserId: scope.userId,
        });
        expect(mocks.assertAdminCapabilityForScope).toHaveBeenCalledWith(
          scope,
          "operator:mutate",
        );
        // No and later never touch the graph.
        expect(mocks.applyCatalogQueueItem).not.toHaveBeenCalled();
        expect(mocks.revalidatePublicCacheTags).not.toHaveBeenCalled();
        expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
        expect(mocks.revalidatePath).toHaveBeenCalledWith(QUEUE);
        expect(url).toBe(
          `${QUEUE}?type=node_merge&item=${NEXT}&result=${result}&decided=${ITEM}#queue-outcome`,
        );
      },
    );

    it.each([
      [
        "reject",
        rejectCatalogQueueItemAction,
        "rejectCatalogQueueItem",
        "rejected",
      ],
      ["skip", skipCatalogQueueItemAction, "skipCatalogQueueItem", "skipped"],
    ] as const)(
      "%s says stale, with no cache effect, when another account had already decided the item",
      async (_label, action, write, state) => {
        mocks[write].mockResolvedValue({ changed: false });
        mocks.readCurationQueueItemSummary.mockResolvedValue(
          openItem({
            state,
            decidedByUserId: OTHER_USER,
            decidedAt: new Date(),
          }),
        );

        const url = await redirectedTo(
          action(undefined, form({ queueItemId: ITEM, nextItem: NEXT })),
        );

        // Nothing changed, so what happened is read from the record.
        expect(mocks.readCurationQueueItemSummary).toHaveBeenCalledWith(ITEM);
        expect(url).toBe(
          `${QUEUE}?item=${NEXT}&result=stale&decided=${ITEM}#queue-outcome`,
        );
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
      },
    );

    describe.each([
      [
        "reject",
        rejectCatalogQueueItemAction,
        "rejectCatalogQueueItem",
        "rejected",
        "skipped",
      ],
      [
        "skip",
        skipCatalogQueueItemAction,
        "skipCatalogQueueItem",
        "skipped",
        "rejected",
      ],
    ] as const)(
      "%s when nothing changed or the write raised",
      (_label, action, write, decision, otherDecision) => {
        const outcomes = [
          [
            "reported no change",
            () => mocks[write].mockResolvedValue({ changed: false }),
          ],
          [
            "raised",
            () => mocks[write].mockRejectedValue(postgresRejection("08006")),
          ],
        ] as const;

        it.each(outcomes)(
          "recognises the owner's own decision of a moment ago after the write %s",
          async (_how, arrange) => {
            const logged = vi
              .spyOn(console, "error")
              .mockImplementation(() => {});
            try {
              arrange();
              // The earlier press committed; its answer never arrived.
              mocks.readCurationQueueItemSummary.mockResolvedValue(
                openItem({
                  state: decision,
                  decidedByUserId: scope.userId,
                  decidedAt: new Date(Date.now() - 30_000),
                }),
              );

              const url = await redirectedTo(
                action(
                  undefined,
                  form({
                    queueItemId: ITEM,
                    nextItem: NEXT,
                    view: "label_link",
                  }),
                ),
              );

              expect(url).toBe(
                `${QUEUE}?type=label_link&item=${NEXT}&result=${decision}&decided=${ITEM}#queue-outcome`,
              );
              expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
              expect(mocks.revalidatePath).toHaveBeenCalledWith(QUEUE);
              expect(mocks.applyCatalogQueueItem).not.toHaveBeenCalled();
            } finally {
              logged.mockRestore();
            }
          },
        );

        it.each(outcomes)(
          "keeps the item on screen to retry when it is still open after the write %s",
          async (_how, arrange) => {
            const logged = vi
              .spyOn(console, "error")
              .mockImplementation(() => {});
            try {
              arrange();
              mocks.readCurationQueueItemSummary.mockResolvedValue(openItem());

              const url = await redirectedTo(
                action(undefined, form({ queueItemId: ITEM, nextItem: NEXT })),
              );

              expect(url).toBe(
                `${QUEUE}?item=${ITEM}&result=failed&decided=${ITEM}#queue-outcome`,
              );
              expect(mocks.revalidatePath).not.toHaveBeenCalled();
            } finally {
              logged.mockRestore();
            }
          },
        );

        it.each(outcomes)(
          "says failed when the item cannot be read back after the write %s",
          async (_how, arrange) => {
            const logged = vi
              .spyOn(console, "error")
              .mockImplementation(() => {});
            try {
              arrange();
              mocks.readCurationQueueItemSummary.mockRejectedValue(
                postgresRejection("08006"),
              );

              const url = await redirectedTo(
                action(undefined, form({ queueItemId: ITEM, nextItem: NEXT })),
              );

              expect(url).toBe(
                `${QUEUE}?item=${ITEM}&result=failed&decided=${ITEM}#queue-outcome`,
              );
              expect(mocks.revalidatePath).not.toHaveBeenCalled();
            } finally {
              logged.mockRestore();
            }
          },
        );

        it.each([
          [
            "another account's",
            {
              state: decision,
              decidedByUserId: OTHER_USER,
              decidedAt: new Date(),
            },
          ],
          [
            "the owner's own, from long ago,",
            {
              state: decision,
              decidedByUserId: scope.userId,
              decidedAt: new Date(Date.now() - 60 * 60_000),
            },
          ],
          [
            "the owner's own, but the other answer,",
            {
              state: otherDecision,
              decidedByUserId: scope.userId,
              decidedAt: new Date(),
            },
          ],
          [
            "the worker's",
            {
              state: "auto_applied",
              decidedByUserId: null,
              decidedAt: new Date(),
            },
          ],
          [
            "an undated",
            { state: decision, decidedByUserId: scope.userId, decidedAt: null },
          ],
        ] as const)(
          "says stale for %s decision after the write raised",
          async (_whose, decided) => {
            const logged = vi
              .spyOn(console, "error")
              .mockImplementation(() => {});
            try {
              mocks[write].mockRejectedValue(postgresRejection("08006"));
              mocks.readCurationQueueItemSummary.mockResolvedValue(
                openItem(decided),
              );

              const url = await redirectedTo(
                action(undefined, form({ queueItemId: ITEM, nextItem: NEXT })),
              );

              expect(url).toBe(
                `${QUEUE}?item=${NEXT}&result=stale&decided=${ITEM}#queue-outcome`,
              );
              expect(mocks.revalidatePath).not.toHaveBeenCalled();
            } finally {
              logged.mockRestore();
            }
          },
        );

        it("says stale when the item is gone from the record", async () => {
          mocks[write].mockResolvedValue({ changed: false });
          mocks.readCurationQueueItemSummary.mockResolvedValue(null);

          const url = await redirectedTo(
            action(undefined, form({ queueItemId: ITEM, nextItem: NEXT })),
          );

          expect(url).toBe(
            `${QUEUE}?item=${NEXT}&result=stale&decided=${ITEM}#queue-outcome`,
          );
        });
      },
    );
  });

  describe("undo", () => {
    it("reverts through the SQL function, expires the same cards and comes back to the view", async () => {
      const url = await redirectedTo(
        revertCatalogActionAction(
          undefined,
          form({ actionId: ACTION, view: "node_merge", item: ITEM }),
        ),
      );

      expect(mocks.revertCatalogAction).toHaveBeenCalledWith({
        actionId: ACTION,
        actorUserId: scope.userId,
      });
      expect(mocks.revalidatePublicCacheTags).toHaveBeenCalledWith(
        [`organism:${NODE}`, "organism-slugs", "catalog", "sitemap"],
        "expire",
      );
      expect(mocks.announceCatalogCard).toHaveBeenCalledWith(NODE);
      expect(mocks.revalidatePath).toHaveBeenCalledWith(QUEUE);
      expect(mocks.applyCatalogQueueItem).not.toHaveBeenCalled();
      expect(url).toBe(
        `${QUEUE}?type=node_merge&item=${ITEM}&result=reverted&action=${ACTION}#automatic-outcome`,
      );
    });

    it.each([
      [
        "already undone",
        "stale",
        { actionId: ACTION, reverted: true, subjectNames: [] },
      ],
      [
        "still in force",
        "failed",
        { actionId: ACTION, reverted: false, subjectNames: [] },
      ],
      ["gone from the record", "failed", null],
    ] as const)(
      "reads the action back when the revert fails: %s answers %s",
      async (_label, result, summary) => {
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
          mocks.revertCatalogAction.mockRejectedValue(
            new Error("action already reverted"),
          );
          mocks.readCurationActionSummary.mockResolvedValue(summary);

          const url = await redirectedTo(
            revertCatalogActionAction(undefined, form({ actionId: ACTION })),
          );

          expect(mocks.readCurationActionSummary).toHaveBeenCalledWith(ACTION);
          expect(url).toBe(
            `${QUEUE}?result=${result}&action=${ACTION}#automatic-outcome`,
          );
          expect(mocks.revalidatePath).not.toHaveBeenCalled();
          expect(mocks.revalidatePublicCacheTags).not.toHaveBeenCalled();
        } finally {
          logged.mockRestore();
        }
      },
    );

    it("says reverted when the revert committed and only the read after it failed", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        mocks.revertCatalogAction.mockRejectedValue(postgresRejection("08006"));
        mocks.readCurationActionSummary.mockResolvedValue({
          actionId: ACTION,
          reverted: true,
          subjectNames: ["Де Барао"],
          subjectCatalogItemIds: [NODE],
          revertedByUserId: scope.userId,
          revertedAt: new Date(),
        });

        const url = await redirectedTo(
          revertCatalogActionAction(undefined, form({ actionId: ACTION })),
        );

        expect(url).toBe(
          `${QUEUE}?result=reverted&action=${ACTION}#automatic-outcome`,
        );
        expect(mocks.revalidatePath).toHaveBeenCalledWith(QUEUE);
        // Its own undo: the cards it touched are expired all the same.
        expect(mocks.revalidatePublicCacheTags).toHaveBeenCalledWith(
          expect.arrayContaining([expect.stringContaining(NODE)]),
          "expire",
        );
        expect(mocks.announceCatalogCard).toHaveBeenCalledWith(NODE);
      } finally {
        logged.mockRestore();
      }
    });

    it.each([
      [
        "another account, just now",
        { revertedByUserId: OTHER_USER, revertedAt: new Date() },
      ],
      [
        "this owner, long ago",
        {
          revertedByUserId: scope.userId,
          revertedAt: new Date(Date.now() - 60 * 60_000),
        },
      ],
      [
        "this owner, at no recorded time",
        { revertedByUserId: scope.userId, revertedAt: null },
      ],
    ] as const)(
      "says stale for an action undone by %s",
      async (_label, undone) => {
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
          mocks.revertCatalogAction.mockRejectedValue(
            new Error("action already reverted"),
          );
          mocks.readCurationActionSummary.mockResolvedValue({
            actionId: ACTION,
            reverted: true,
            subjectNames: ["Де Барао"],
            ...undone,
          });

          const url = await redirectedTo(
            revertCatalogActionAction(undefined, form({ actionId: ACTION })),
          );

          expect(url).toBe(
            `${QUEUE}?result=stale&action=${ACTION}#automatic-outcome`,
          );
          expect(mocks.revalidatePath).not.toHaveBeenCalled();
        } finally {
          logged.mockRestore();
        }
      },
    );

    it("says failed when neither the revert nor its read-back can reach the database", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        mocks.revertCatalogAction.mockRejectedValue(postgresRejection("08006"));
        mocks.readCurationActionSummary.mockRejectedValue(
          postgresRejection("08006"),
        );

        const url = await redirectedTo(
          revertCatalogActionAction(undefined, form({ actionId: ACTION })),
        );

        expect(url).toBe(
          `${QUEUE}?result=failed&action=${ACTION}#automatic-outcome`,
        );
      } finally {
        logged.mockRestore();
      }
    });

    it("says stale without reverting anything when the form names no action it can read", async () => {
      const url = await redirectedTo(
        revertCatalogActionAction(undefined, form({ actionId: "action-1" })),
      );

      expect(url).toBe(`${QUEUE}?result=stale#automatic-outcome`);
      expectNothingWritten();
    });
  });

  describe("who may decide", () => {
    it.each(DECISIONS)(
      "%s: a member's press is a refusal with nothing written, on the same item",
      async (_label, action) => {
        mocks.resolveWorkspaceAdminAccess.mockResolvedValue({
          status: "denied",
        });

        const url = await redirectedTo(
          action(
            undefined,
            form({ queueItemId: ITEM, nextItem: NEXT, view: "label_link" }),
          ),
        );

        expect(url).toBe(
          `${QUEUE}?type=label_link&item=${ITEM}&result=denied&decided=${ITEM}#queue-outcome`,
        );
        expect(mocks.readCurationQueueItemSummary).not.toHaveBeenCalled();
        expect(mocks.countObjectsOnCatalogItem).not.toHaveBeenCalled();
        expectNothingWritten();
      },
    );

    it("an undo from a member is refused with nothing reverted", async () => {
      mocks.resolveWorkspaceAdminAccess.mockResolvedValue({ status: "denied" });

      const url = await redirectedTo(
        revertCatalogActionAction(
          undefined,
          form({ actionId: ACTION, item: ITEM }),
        ),
      );

      expect(url).toBe(
        `${QUEUE}?item=${ITEM}&result=denied&action=${ACTION}#automatic-outcome`,
      );
      expect(mocks.readCurationActionSummary).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it.each(DECISIONS)(
      "%s: an owner check that cannot be read is a failure to retry, not a refusal",
      async (_label, action) => {
        mocks.resolveWorkspaceAdminAccess.mockResolvedValue({
          status: "unavailable",
          failure: describeWorkspaceFailure(postgresRejection("08006")),
        });

        const url = await redirectedTo(
          action(undefined, form({ queueItemId: ITEM, nextItem: NEXT })),
        );

        expect(url).toBe(
          `${QUEUE}?item=${ITEM}&result=failed&decided=${ITEM}#queue-outcome`,
        );
        expectNothingWritten();
      },
    );

    it("tells a refused owner check from one that could not be read", async () => {
      const actual = await vi.importActual<
        typeof import("@/server/workspace-access")
      >("@/server/workspace-access");
      mocks.resolveWorkspaceAdminAccess.mockImplementation(
        actual.resolveWorkspaceAdminAccess,
      );

      mocks.assertAdminCapabilityForScope.mockRejectedValue(
        new AdminAccessDeniedError(),
      );
      expect(
        await redirectedTo(
          acceptCatalogQueueItemAction(undefined, form({ queueItemId: ITEM })),
        ),
      ).toBe(
        `${QUEUE}?item=${ITEM}&result=denied&decided=${ITEM}#queue-outcome`,
      );

      mocks.redirect.mockClear();
      mocks.assertAdminCapabilityForScope.mockRejectedValue(
        postgresRejection("08006"),
      );
      expect(
        await redirectedTo(
          acceptCatalogQueueItemAction(undefined, form({ queueItemId: ITEM })),
        ),
      ).toBe(
        `${QUEUE}?item=${ITEM}&result=failed&decided=${ITEM}#queue-outcome`,
      );

      expect(mocks.assertAdminCapabilityForScope).toHaveBeenCalledWith(
        scope,
        "operator:mutate",
      );
      expectNothingWritten();
    });

    it.each([
      ...DECISIONS.map(
        ([label, action]) =>
          [
            label,
            action,
            { queueItemId: ITEM, nextItem: NEXT, view: "node_merge" },
          ] as const,
      ),
      [
        "undo",
        revertCatalogActionAction,
        { actionId: ACTION, item: ITEM, view: "node_merge" },
      ] as const,
    ])(
      "%s: an ended session goes to sign-in and comes back to the queue view, with nothing written",
      async (_label, action, fields) => {
        mocks.resolveMutationScope.mockResolvedValue({
          status: "rejected",
          code: "session_required",
          statusCode: 401,
        });

        const url = new URL(
          await redirectedTo(action(undefined, form(fields))),
          "https://over.garden",
        );

        expect(url.pathname).toBe("/auth/sign-in");
        expect(url.searchParams.get("next")).toBe(
          `${QUEUE}?type=node_merge&item=${ITEM}`,
        );
        expect(mocks.resolveWorkspaceAdminAccess).not.toHaveBeenCalled();
        expect(mocks.assertAdminCapabilityForScope).not.toHaveBeenCalled();
        expect(mocks.readCurationQueueItemSummary).not.toHaveBeenCalled();
        expectNothingWritten();
      },
    );

    it.each([...DECISIONS, ["undo", revertCatalogActionAction] as const])(
      "%s: a tab signed into another account is answered in place, with nothing written",
      async (_label, action) => {
        mocks.resolveMutationScope.mockResolvedValue({
          status: "rejected",
          code: "session_account_changed",
          statusCode: 409,
        });

        await expect(
          action(undefined, form({ queueItemId: ITEM, actionId: ACTION })),
        ).resolves.toEqual({ mutationScope: "session_account_changed" });

        expect(mocks.redirect).not.toHaveBeenCalled();
        expect(mocks.resolveWorkspaceAdminAccess).not.toHaveBeenCalled();
        expectNothingWritten();
      },
    );
  });
});
