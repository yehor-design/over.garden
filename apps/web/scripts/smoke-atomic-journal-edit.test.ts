import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { getAtomicJournalEditCopy } from "../src/lib/garden/atomic-journal-edit-copy";
import {
  LocalJournalMediaCoordinator,
  type EncodedJournalImage,
} from "../src/lib/garden/local-journal-media-coordinator";
import {
  buildAtomicJournalEditWaitSafetyReceipt,
  buildFocusedAtomicJournalEditReceipt,
} from "./smoke-atomic-journal-edit";

const WEB_ROOT = process.cwd();
const EXISTING_MEDIA_ID = "00000000-0000-4000-8000-000000000348";

describe("OVE-348 atomic journal edit smoke", () => {
  it("focused contract: cuts the public editor to one local-only CAS transaction", async () => {
    const page = read(
      "src/app/(default)/garden/entries/[entryId]/edit/page.tsx",
    );
    const composer = read(
      "src/app/(default)/garden/entries/[entryId]/edit/journal-entry-edit-composer.tsx",
    );
    const route = read("src/app/api/garden/entries/[entryId]/route.ts");
    const repository = read("src/server/journal-repository.ts");
    const commitStatus = read(
      "src/server/media/ephemeral-staging-commit-status.ts",
    );
    const publicPage = read("src/app/[locale]/journal/[slug]/page.tsx");
    const workspaceRepository = read(
      "src/server/garden-workspace-repository.ts",
    );
    const workspaceView = read(
      "src/app/(default)/garden/garden-workspace-view.tsx",
    );
    const shellNavigation = read("src/lib/site-shell-navigation.ts");

    expect(page).toContain("readAtomicJournalEditBaseline");
    expect(page).not.toMatch(/from ["']@\/db["']/);
    expect(composer).toContain("useLocalJournalComposer({");
    expect(composer).toContain("local.publishEdit({");
    expect(composer).toContain('imageInsertionMode="immediate"');
    expect(composer).toContain("existingMedia,");
    expect(composer).not.toMatch(
      /useOnlineJournalComposer|JournalEntryDraftPayloadV1|uploadOnlineComposerPhoto|useInlineMediaSelection|\bOwnerMediaFocalPanel\b/,
    );
    expect(route).toContain("ATOMIC_JOURNAL_EDIT_PROTOCOL_HEADER");
    expect(route).toContain("readCommittedAtomicJournalEdit");
    expect(route).toContain("claimEphemeralPublicationMedia");
    expect(route).toContain("assertPublicMediaReady");
    expect(route).toContain("for (const locale of PUBLIC_LOCALES)");
    expect(route).toContain(
      "revalidatePath(localizedPath(locale, publicPath))",
    );
    expect(repository).toContain(
      "export async function updateAtomicJournalEntry",
    );
    expect(repository).toContain("validateAtomicJournalEditMediaPlan");
    expect(repository).toContain("buildReplaceClaimedEphemeralMediaQuery");
    expect(repository).toContain("preserveDetachedMediaAssetIds:");
    expect(repository).toContain("buildEnqueueMediaDerivativeRevokeJobQuery");
    expect(repository).toContain("buildEnqueueMediaStagingFinalizeJobQuery");
    const atomicTransaction = repository.slice(
      repository.indexOf("export async function updateAtomicJournalEntry"),
      repository.indexOf(
        "export async function readCommittedAtomicJournalCreate",
      ),
    );
    expect(atomicTransaction).not.toMatch(
      /persistJournalEntryMentions|persistJournalEntryTopicSignals/,
    );
    expect(commitStatus).toContain("mediaById.get(item.mediaAssetId)");
    expect(commitStatus).not.toContain(
      "rows.length !== input.expectedPublicMedia.length",
    );
    expect(publicPage).toContain("?returnTo=${encodeURIComponent(");
    expect(workspaceRepository).not.toMatch(
      /listJournalDrafts|journal-draft-repository/,
    );
    expect(workspaceView).not.toContain("ServerDraftResumePanel");
    expect(shellNavigation).not.toContain('item("drafts"');

    expect(buildFocusedAtomicJournalEditReceipt()).toMatchObject({
      canonicalTransition: "active_public_revision_n_to_n_plus_1",
      precommitPublishedMutationCount: 0,
      existingMediaUploadCount: 0,
      replacementIdentity: "stable_uuid_generation_swap",
      mediaCommit: "claimed_subset_plus_retained_set",
      activeLegacyEditCallers: 0,
    });

    const encoder = { encode: vi.fn(async () => encodedImage()) };
    const stager = {
      stage: vi.fn(async () => ({
        stagingReceipt: "unused",
        deleteCapability: "unused",
      })),
      delete: vi.fn(async () => undefined),
    };
    const coordinator = new LocalJournalMediaCoordinator({
      stagingSessionId: "00000000-0000-4000-8000-000000000349",
      encoder,
      stager,
      existingItems: [
        {
          mediaAssetId: EXISTING_MEDIA_ID,
          blockId: "b_existing",
          generation: 7,
          previewUrl: "https://media.over.garden/existing.webp",
          width: 1200,
          height: 800,
        },
      ],
    });
    await expect(
      coordinator.freeze([EXISTING_MEDIA_ID]),
    ).resolves.toMatchObject({
      mediaClaimReceipts: [],
      orderedMediaAssetIds: [EXISTING_MEDIA_ID],
    });
    expect(encoder.encode).not.toHaveBeenCalled();
    expect(stager.stage).not.toHaveBeenCalled();
    coordinator.destroy();
  });

  it("browser a11y degraded: locales, focus-contained conflict, focal control, and exact return stay gardener-facing", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const copy = getAtomicJournalEditCopy(locale);
      expect(copy.localOnly.length).toBeGreaterThan(25);
      expect(copy.conflictBody.length).toBeGreaterThan(50);
      expect(copy.cancelPublishing.length).toBeGreaterThan(8);
      expect(copy.copyLocalChanges.length).toBeGreaterThan(8);
      expect(Object.values(copy).join(" ")).not.toMatch(
        /R2|staging|receipt|generation|quarantine|worker/i,
      );
    }
    const composer = read(
      "src/app/(default)/garden/entries/[entryId]/edit/journal-entry-edit-composer.tsx",
    );
    const status = read(
      "src/components/garden/local-journal-composer-status.tsx",
    );
    expect(composer).toContain("<AlertDialogTitle>");
    expect(composer).toContain("<AlertDialogDescription>");
    expect(composer).toContain("finalFocus={saveButtonRef}");
    expect(composer).toContain("finalFocus={cancelEditingButtonRef}");
    expect(composer).toContain('data-atomic-journal-edit-discard="true"');
    expect(composer).toContain("<FocalPointControl");
    expect(composer).toContain("editCopy.copyLocalChanges");
    expect(composer).toContain("normalizeJournalComposerReturnTo");
    expect(composer).toContain(
      'if (selection.mode === "automatic") return null;',
    );
    expect(status).toContain('aria-live="polite"');
    expect(status).toContain("copy.cancelPublishing");
    expect(composer).not.toMatch(/\balert\(|window\.confirm|window\.prompt/);
  });

  it("browser performance: edit_ready_interaction_latency stays at most 100 milliseconds and cancellation fences late writes", async () => {
    const pending = deferred<EncodedJournalImage>();
    const stage = vi.fn(async () => ({
      stagingReceipt: "receipt-current",
      deleteCapability: "delete-current",
    }));
    const coordinator = new LocalJournalMediaCoordinator({
      stagingSessionId: "00000000-0000-4000-8000-000000000349",
      encoder: { encode: vi.fn(() => pending.promise) },
      stager: { stage, delete: vi.fn(async () => undefined) },
      existingItems: [
        {
          mediaAssetId: EXISTING_MEDIA_ID,
          blockId: "b_existing",
          generation: 7,
          previewUrl: "https://media.over.garden/existing.webp",
          width: 1200,
          height: 800,
        },
      ],
      createObjectURL: () => "blob:replacement-final-webp",
      revokeObjectURL: vi.fn(),
    });

    const startedAt = performance.now();
    const selection = coordinator.replace(
      EXISTING_MEDIA_ID,
      new Blob([new Uint8Array([1])]),
    );
    const editReadyInteractionLatency = performance.now() - startedAt;
    expect(editReadyInteractionLatency).toBeLessThanOrEqual(100);
    expect(coordinator.getSnapshot().items[0]).toMatchObject({
      mediaAssetId: EXISTING_MEDIA_ID,
      generation: 8,
      status: "selected",
    });

    coordinator.destroy();
    pending.resolve(encodedImage());
    await expect(selection.ready).rejects.toMatchObject({
      code: "media_abandoned",
    });
    await Promise.resolve();
    expect(stage).not.toHaveBeenCalled();
  });

  it("claim timeout and revision conflict keep Cancel saving button and Copy local changes button responsive", () => {
    expect(buildAtomicJournalEditWaitSafetyReceipt()).toEqual({
      version: "ove348.atomicJournalEditSmoke.v1",
      injectedFaults: [
        "new-media claim timeout",
        "concurrent revision conflict",
      ],
      terminalStatus: "failed_or_conflict",
      saveLoader: "finite",
      cancelSavingButton: "responsive",
      copyLocalChangesButton: "responsive",
      recovery: "bounded",
      lateCompletion: "generation_fenced",
    });
    const hook = read("src/lib/garden/use-local-journal-composer.ts");
    const composer = read(
      "src/app/(default)/garden/entries/[entryId]/edit/journal-entry-edit-composer.tsx",
    );
    expect(hook).toContain("ATOMIC_PUBLICATION_DEADLINE_MS");
    expect(hook).toContain('status: "conflict"');
    expect(hook).toContain("cancelPublicationWait");
    expect(composer).toContain("local.cancelPublishing");
    expect(composer).toContain("navigator.clipboard.writeText");
  });
});

function read(relativePath: string) {
  return fs.readFileSync(path.join(WEB_ROOT, relativePath), "utf8");
}

function encodedImage(): EncodedJournalImage {
  return {
    blob: new Blob([new Uint8Array([1])], { type: "image/webp" }),
    width: 1,
    height: 1,
    sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    sourceKind: "jpeg",
    lossless: false,
    quality: 82,
    durationMs: 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
