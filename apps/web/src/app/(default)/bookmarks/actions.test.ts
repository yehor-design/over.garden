import { postgresRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { publicEngagementChangeTags } from "@/lib/public-cache-tags";

const mocks = vi.hoisted(() => ({
  setEngagementBookmark: vi.fn(),
  resolveMutationScope: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: vi.fn(),
  updateTag: mocks.updateTag,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: vi.fn(() => null),
}));

// Only the write is mocked: the target is read by the repository's own
// normalizer, so a form the shelf could not have drawn is refused here too.
vi.mock("@/server/engagement-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/engagement-repository")>()),
  setEngagementBookmark: mocks.setEngagementBookmark,
}));

const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};
const ENTRY = "10000000-0000-4000-8000-0000000000e1";
const VARIETY = "pomidor-cheri-0000000101";

function shelfForm(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries({
    targetKind: "journal_entry",
    targetRef: ENTRY,
    locale: "uk",
    ...fields,
  })) {
    formData.set(name, value);
  }
  return formData;
}

describe("the bookmark shelf's removal and Undo (OVE-502)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: SCOPE,
    });
    mocks.setEngagementBookmark.mockResolvedValue({ active: false });
  });

  it("takes a bookmark off and comes back to the view it was pressed in, naming what it removed", async () => {
    const { removeBookmarkFromShelfAction } = await import("./actions");

    await removeBookmarkFromShelfAction(
      undefined,
      shelfForm({
        // The id arrives as the form carried it and is written normalized.
        targetRef: ENTRY.toUpperCase(),
        locale: "bg",
        // The previous press's outcome rides in the view the form was
        // rendered with; it is not carried into the next one.
        returnTo:
          "/bg/bookmarks?kind=journal_entry&page=2&outcome=failed&action=remove&target=topic%3Atomaty",
      }),
    );

    expect(mocks.setEngagementBookmark).toHaveBeenCalledWith(SCOPE, {
      target: { kind: "journal_entry", ref: ENTRY },
      bookmarkState: "removed",
    });
    for (const tag of publicEngagementChangeTags("journal_entry", ENTRY)) {
      expect(mocks.updateTag).toHaveBeenCalledWith(tag);
    }
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/bg/bookmarks");
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    // No fragment: the row is gone, and the toast is what says so.
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/bg/bookmarks?kind=journal_entry&page=2&outcome=removed&action=remove&target=journal_entry%3A${ENTRY}`,
    );
  });

  it("puts a bookmark back and lands on its row", async () => {
    mocks.setEngagementBookmark.mockResolvedValue({ active: true });
    const { restoreBookmarkToShelfAction } = await import("./actions");

    await restoreBookmarkToShelfAction(
      undefined,
      shelfForm({
        targetKind: "variety",
        targetRef: VARIETY,
        returnTo: "/bookmarks?kind=variety",
      }),
    );

    expect(mocks.setEngagementBookmark).toHaveBeenCalledWith(SCOPE, {
      target: { kind: "variety", ref: VARIETY },
      bookmarkState: "active",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/bookmarks");
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/bookmarks?kind=variety&outcome=restored&action=restore&target=variety%3A${VARIETY}#saved-variety-${VARIETY}`,
    );
  });

  it.each([
    // A refused removal lands on its row, which is still on the shelf; a
    // refused Undo on the notice above the list, because its row is not.
    [
      "removeBookmarkFromShelfAction",
      "remove",
      `#saved-journal_entry-${ENTRY}`,
    ],
    ["restoreBookmarkToShelfAction", "restore", "#shelf-outcome"],
  ] as const)(
    "lands a write the database refused (%s) as failed where it is said, and revalidates nothing",
    async (actionName, action, fragment) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.setEngagementBookmark.mockRejectedValue(postgresRejection("57014"));
      const actions = await import("./actions");

      // It used to escape as the shelf's error page, and the whole shelf went
      // with it; now it is an answer like the other two.
      await expect(
        actions[actionName](
          undefined,
          shelfForm({ locale: "ru", returnTo: "/ru/bookmarks?page=2" }),
        ),
      ).resolves.toBeUndefined();

      expect(mocks.redirect).toHaveBeenCalledWith(
        `/ru/bookmarks?page=2&outcome=failed&action=${action}&target=journal_entry%3A${ENTRY}${fragment}`,
      );
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(mocks.updateTag).not.toHaveBeenCalled();
      // A refused write is not a silent one.
      expect(log).toHaveBeenCalledWith(
        "[bookmarks] shelf write failed",
        expect.objectContaining({ kind: "journal_entry" }),
      );
      log.mockRestore();
    },
  );

  it("sends an ended session to sign-in and back to the same view, and writes nothing", async () => {
    mocks.resolveMutationScope.mockResolvedValue({
      status: "rejected",
      code: "session_required",
      statusCode: 401,
    });
    const { removeBookmarkFromShelfAction } = await import("./actions");

    await removeBookmarkFromShelfAction(
      undefined,
      shelfForm({
        locale: "bg",
        returnTo: "/bg/bookmarks?kind=topic&page=3&outcome=removed",
      }),
    );

    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/auth/sign-in?next=%2Fbg%2Fbookmarks%3Fkind%3Dtopic%26page%3D3",
    );
    expect(mocks.setEngagementBookmark).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers a tab whose account changed with the scope code, and writes nothing", async () => {
    mocks.resolveMutationScope.mockResolvedValue({
      status: "rejected",
      code: "session_account_changed",
      statusCode: 409,
    });
    const { restoreBookmarkToShelfAction } = await import("./actions");

    await expect(
      restoreBookmarkToShelfAction(
        undefined,
        shelfForm({ returnTo: "/bookmarks?kind=journal_entry" }),
      ),
    ).resolves.toEqual({ mutationScope: "session_account_changed" });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.setEngagementBookmark).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    "https://evil.example/bookmarks",
    "//evil.example/bookmarks",
    "/bookmarks/../garden",
    "/notifications?kind=species",
    "/garden",
  ])(
    "comes back to the shelf itself from the return path %s",
    async (returnTo) => {
      const { removeBookmarkFromShelfAction } = await import("./actions");

      await removeBookmarkFromShelfAction(
        undefined,
        shelfForm({ locale: "ru", returnTo }),
      );

      expect(mocks.revalidatePath).toHaveBeenCalledWith("/ru/bookmarks");
      expect(mocks.redirect).toHaveBeenCalledWith(
        `/ru/bookmarks?outcome=removed&action=remove&target=journal_entry%3A${ENTRY}`,
      );
    },
  );

  it.each([
    ["user", "00000000-0000-4000-8000-000000000002"],
    ["journal_entry", "first-ripe-cluster"],
    ["variety", "../../etc"],
  ])(
    "refuses a %s target it could not have drawn, before asking who is signed in",
    async (targetKind, targetRef) => {
      const { removeBookmarkFromShelfAction } = await import("./actions");

      await expect(
        removeBookmarkFromShelfAction(
          undefined,
          shelfForm({ targetKind, targetRef, returnTo: "/bookmarks" }),
        ),
      ).rejects.toThrow("Engagement target is not available.");
      expect(mocks.resolveMutationScope).not.toHaveBeenCalled();
      expect(mocks.setEngagementBookmark).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );
});
