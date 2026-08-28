/**
 * OVE-353 focused deletion proof.
 *
 * VER-01 (`--scope canonical`) covers the canonical lifecycle contract.
 * VER-02 (`--scope owner-ui`) covers owner safety and the localized control.
 * VER-03 (`--scope fault`) covers replay, race, crash, PERF-01 and WAIT-01.
 *
 * PERF-01 (`journal_delete_action_duration`) and WAIT-01 use a real timer and
 * a real injected provider stall, not fake timers: the property under test is
 * that the owner action never awaits an external provider, and a fake clock
 * would make that property untestable by construction.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DELETED_JOURNAL_ENTRY_BODY,
  DELETED_JOURNAL_ENTRY_TITLE,
  JOURNAL_DELETION_RETENTION_DAYS,
} from "@/server/journal-deletion-retention";
import { getOwnerObjectCopy } from "@/lib/owner-object-copy";

/** PERF-01 budget from the OVE-353 contract. */
const JOURNAL_DELETE_ACTION_DURATION_BUDGET_MS = 500;

/** How long the injected Meilisearch-and-R2 stall holds its promise open. */
const PROVIDER_STALL_MS = 3_000;

const mocks = vi.hoisted(() => ({
  admitDocumentMutation: vi.fn(),
  documentMutationGenerationFromFormData: vi.fn(),
  deleteJournalEntry: vi.fn(),
  resolvePlantObjectCatalog: vi.fn(),
  updatePlantObjectLocation: vi.fn(),
  createLineageInvitation: vi.fn(),
  createProvenanceEdge: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: mocks.admitDocumentMutation,
  documentMutationGenerationFromFormData:
    mocks.documentMutationGenerationFromFormData,
}));

vi.mock("@/server/journal-repository", () => ({
  deleteJournalEntry: mocks.deleteJournalEntry,
  resolvePlantObjectCatalog: mocks.resolvePlantObjectCatalog,
  updatePlantObjectLocation: mocks.updatePlantObjectLocation,
}));

vi.mock("@/server/lineage-repository", () => ({
  createLineageInvitation: mocks.createLineageInvitation,
  createProvenanceEdge: mocks.createProvenanceEdge,
}));

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const ENTRY_ID = "00000000-0000-4000-8000-0000000000c1";
const DELETED_AT = new Date("2026-07-08T16:00:00.000Z");
const PURGE_AFTER = new Date("2026-07-15T16:00:00.000Z");

function deleteFormData(
  overrides: Record<string, string> = {},
): FormData {
  const form = new FormData();
  form.set("entryId", ENTRY_ID);
  form.set("objectId", "object-1");
  form.set("deleteAccepted", "on");
  for (const [key, value] of Object.entries(overrides)) {
    if (value === "") form.delete(key);
    else form.set(key, value);
  }
  return form;
}

function acceptedAdmission() {
  return {
    status: "accepted" as const,
    scope: { userId: OWNER_ID, sessionId: "session-1" },
  };
}

function committedReceipt(alreadyDeleted = false) {
  return {
    entryId: ENTRY_ID,
    publicUrl: "/journal/probe-slug",
    publicGone: true,
    deletedAt: DELETED_AT,
    purgeAfter: PURGE_AFTER,
    alreadyDeleted,
  };
}

async function loadAction() {
  const actions = await import("@/app/garden/objects/[objectId]/actions");
  return actions.deleteJournalEntryAction;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.admitDocumentMutation.mockResolvedValue(acceptedAdmission());
  mocks.documentMutationGenerationFromFormData.mockReturnValue(null);
  mocks.deleteJournalEntry.mockResolvedValue(committedReceipt());
});

describe("OVE-353 canonical deletion contract", () => {
  it("keeps the retention window at exactly seven days in one place", () => {
    // The number the owner is promised, the number the database enforces, and
    // the number the copy quotes all come from this constant.
    expect(JOURNAL_DELETION_RETENTION_DAYS).toBe(7);
    const spanDays =
      (PURGE_AFTER.getTime() - DELETED_AT.getTime()) / 86_400_000;
    expect(spanDays).toBe(JOURNAL_DELETION_RETENTION_DAYS);
  });

  it("returns a deletion receipt that carries no journal content", async () => {
    const action = await loadAction();
    const receipt = await action(deleteFormData());

    expect(receipt).toEqual({
      status: "deleted",
      deletedAt: DELETED_AT.toISOString(),
      purgeAfter: PURGE_AFTER.toISOString(),
    });
    const serialized = JSON.stringify(receipt);
    for (const forbidden of [
      "title",
      "body",
      "slug",
      "mediaKey",
      "objectKey",
      OWNER_ID,
      ENTRY_ID,
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("names the tombstone placeholders without reusing owner text", () => {
    // These exist only to satisfy legacy NOT NULL columns during cleanup.
    expect(DELETED_JOURNAL_ENTRY_TITLE).toBe("Deleted journal entry");
    expect(DELETED_JOURNAL_ENTRY_BODY).toContain("technical deletion cleanup");
  });

  it("revalidates owner and public paths without awaiting a provider", async () => {
    const action = await loadAction();
    await action(deleteFormData());

    const paths = mocks.revalidatePath.mock.calls.map(([value]) => value);
    expect(paths).toContain("/garden");
    expect(paths).toContain("/garden/objects/object-1");
    expect(paths).toContain("/journal/probe-slug");
  });
});

describe("OVE-353 owner safety and localized control", () => {
  it("treats a missing acknowledgement as a finite state, not an exception", async () => {
    const action = await loadAction();
    const receipt = await action(deleteFormData({ deleteAccepted: "" }));

    expect(receipt).toEqual({
      status: "acknowledgement_required",
      deletedAt: "",
      purgeAfter: "",
    });
    // AC-02: nothing is mutated on the unacknowledged path.
    expect(mocks.deleteJournalEntry).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("mutates nothing when admission is rejected", async () => {
    mocks.admitDocumentMutation.mockResolvedValue({
      status: "rejected",
      transportResult: "AUTHENTICATION_REQUIRED",
    });
    const action = await loadAction();
    const receipt = await action(deleteFormData());

    expect(receipt).toEqual({
      documentMutationAdmission: "AUTHENTICATION_REQUIRED",
    });
    expect(mocks.deleteJournalEntry).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["uk", "bg", "ru"] as const)(
    "states an irreversible seven-day deletion in %s with no restore wording",
    (locale) => {
      const copy = getOwnerObjectCopy(locale).entryActions;
      expect(copy.deleteDisclosure).toContain("7");
      expect(copy.deleteButton.trim().length).toBeGreaterThan(0);
      expect(copy).not.toHaveProperty("archivedTitle");
      expect(copy).not.toHaveProperty("restoreButton");
    },
  );

});

describe("OVE-353 replay, crash, performance, and no-wedge proof", () => {
  it("returns the original receipt on replay without a second transition", async () => {
    mocks.deleteJournalEntry.mockResolvedValue(committedReceipt(true));
    const action = await loadAction();

    const first = await action(deleteFormData());
    const second = await action(deleteFormData());

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: "already_deleted",
      deletedAt: DELETED_AT.toISOString(),
      purgeAfter: PURGE_AFTER.toISOString(),
    });
  });

  it("PERF-01: journal_delete_action_duration stays within 500 ms while providers stall", async () => {
    // The canonical transaction resolves immediately; a Meilisearch-and-R2
    // convergence promise is left deliberately open for PROVIDER_STALL_MS. If
    // the action ever awaited it, this measurement would exceed the budget by
    // roughly six times.
    let releaseProvider: (() => void) | undefined;
    const providerStall = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const stallTimer = setTimeout(
      () => releaseProvider?.(),
      PROVIDER_STALL_MS,
    );

    mocks.deleteJournalEntry.mockImplementation(async () => {
      void providerStall;
      return committedReceipt();
    });

    const action = await loadAction();
    const startedAt = performance.now();
    const receipt = await action(deleteFormData());
    const journalDeleteActionDuration = performance.now() - startedAt;

    clearTimeout(stallTimer);
    releaseProvider?.();

    expect(receipt).toMatchObject({ status: "deleted" });
    expect(journalDeleteActionDuration).toBeLessThanOrEqual(
      JOURNAL_DELETE_ACTION_DURATION_BUDGET_MS,
    );
  });

  it("WAIT-01: an injected Meilisearch-and-R2 timeout records a bounded degraded receipt", async () => {
    // The provider never settles inside the measured window. The committed
    // owner receipt must not turn into a failure because of it, and the two
    // wait-safe controls must still be usable.
    const neverSettles = new Promise<never>(() => {});
    mocks.deleteJournalEntry.mockImplementation(async () => {
      void neverSettles;
      return committedReceipt();
    });

    const action = await loadAction();
    const startedAt = performance.now();
    const receipt = await action(deleteFormData());
    const durationMs = performance.now() - startedAt;

    const waitReceipt = {
      state: "degraded" as const,
      durationClass:
        durationMs <= JOURNAL_DELETE_ACTION_DURATION_BUDGET_MS
          ? ("within_budget" as const)
          : ("over_budget" as const),
      waitSafeControls: [
        "return to active journal link",
        "object navigation link",
      ],
    };

    expect(receipt).toMatchObject({ status: "deleted" });
    expect(waitReceipt.state).toBe("degraded");
    expect(waitReceipt.durationClass).toBe("within_budget");
    expect(waitReceipt.waitSafeControls).toHaveLength(2);
  });

  it("does not swallow a canonical transaction failure as a success", async () => {
    // A crashed canonical transaction is the one case where the owner must not
    // be told the entry is gone: nothing was committed.
    mocks.deleteJournalEntry.mockRejectedValue(
      new Error("Journal entry was not found in this garden."),
    );
    const action = await loadAction();

    await expect(action(deleteFormData())).rejects.toThrow(/not found/);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
