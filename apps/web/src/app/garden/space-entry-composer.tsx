"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  JournalCoverControls,
  journalCoverSelectionToOfflinePayload,
  type JournalCoverSelectionState,
} from "@/components/garden/journal-cover-controls";
import { StructuredJournalComposer } from "@/components/garden/structured-journal-composer";
import type { StructuredJournalComposerHandle } from "@/components/garden/structured-journal-composer";
import { Button } from "@/components/ui/button";
import { getJournalCoverControlsCopy } from "@/lib/garden/journal-cover-controls-copy";
import {
  createEmptyJournalDocument,
  extractJournalDocumentPlainText,
  listJournalDocumentImageMediaIds,
} from "@/lib/garden/journal-document";
import { createComposerPhotoIntent } from "@/lib/garden/composer-photo-selection";
import {
  getGardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  deleteOfflineDraft,
  getOfflineDraft,
  hasPersistableSpaceEntryDraft,
  spaceEntryDraftId,
  upsertOfflineDraft,
  type SpaceEntryDraftFields,
  type SpaceEntryDraftPayload,
} from "@/lib/offline/drafts";
import {
  JournalEntrySyncError,
  submitOnlineJournalEntryPayload,
} from "@/lib/offline/journal-entry-sync";
import {
  assertOfflinePhotoQuotaAllows,
  sumOfflinePhotoIntentBytes,
} from "@/lib/offline/offline-media-quota";
import {
  createOwnerComposerPersistenceController,
  type OwnerComposerPersistenceController,
  type OwnerComposerPersistenceWriteContext,
} from "@/lib/offline/owner-composer-participants";
import { registerOwnerPreviewObjectUrl } from "@/lib/offline/owner-session-lifecycle";
import {
  enqueueOfflineMutation,
  type OfflinePhotoIntent,
  type OfflineSpaceEntryPayload,
} from "@/lib/offline/queue";
import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";

interface SpaceObjectOption {
  id: string;
  displayName: string;
  objectKindLabel: string;
}

interface SpaceEntryComposerProps {
  locale: InterfaceLocale;
  ownerUserId: string;
  spaceId: string;
  objects: SpaceObjectOption[];
  today: string;
  enableOfflinePersistence?: boolean;
}

type SubmitState = "idle" | "saving" | "queued" | "failed";

export function SpaceEntryComposer({
  locale,
  ownerUserId,
  spaceId,
  objects,
  today,
  enableOfflinePersistence = true,
}: SpaceEntryComposerProps) {
  const copy = getGardenWorkspaceCopy(locale);
  const labels = getStructuredJournalComposerLabels(locale);
  const draftId = spaceEntryDraftId(spaceId);
  const structuredComposerRef =
    useRef<StructuredJournalComposerHandle | null>(null);
  const draftPersistencePausedRef = useRef(false);
  const persistenceControllerRef =
    useRef<OwnerComposerPersistenceController<SpaceComposerPersistenceSnapshot> | null>(
      null,
    );
  const [clientMutationId, setClientMutationId] = useState(() =>
    crypto.randomUUID(),
  );
  const [draft, setDraft] = useState<SpaceEntryDraftFields>({
    title: "",
    body: "",
    contentDocument: null,
    entryDate: today,
  });
  const [mentionedPlantObjectIds, setMentionedPlantObjectIds] = useState<
    string[]
  >([]);
  const [photoIntentsByBlockId, setPhotoIntentsByBlockId] = useState<
    Record<string, OfflinePhotoIntent>
  >({});
  const [coverSelection, setCoverSelection] =
    useState<JournalCoverSelectionState>({ mode: "automatic" });
  const [pendingCoverInlineRemoval, setPendingCoverInlineRemoval] = useState<{
    mediaAssetId: string;
  } | null>(null);
  const coverCopy = getJournalCoverControlsCopy(locale);
  const [storedPhotoIntent, setStoredPhotoIntent] =
    useState<OfflinePhotoIntent | null>(null);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine,
  );
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(
    !enableOfflinePersistence,
  );

  useEffect(() => {
    if (!enableOfflinePersistence) return;

    const controller =
      createOwnerComposerPersistenceController<SpaceComposerPersistenceSnapshot>(
        {
          ownerUserId,
          persist: async (snapshot, context) => {
            await persistSpaceComposerSnapshot(snapshot, context);
          },
          shouldPersistAutomatically: () => !draftPersistencePausedRef.current,
        },
      );
    persistenceControllerRef.current = controller;
    return () => {
      if (persistenceControllerRef.current === controller) {
        persistenceControllerRef.current = null;
      }
      controller.dispose();
    };
  }, [enableOfflinePersistence, ownerUserId]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!enableOfflinePersistence) return;

    let cancelled = false;
    void getOfflineDraft<SpaceEntryDraftPayload>(ownerUserId, draftId)
      .then((stored) => {
        if (cancelled) return;
        if (stored && stored.payload.spaceId === spaceId) {
          setClientMutationId(stored.payload.clientMutationId);
          setDraft(stored.payload.draft);
          setMentionedPlantObjectIds(stored.payload.mentionedPlantObjectIds);
          setStoredPhotoIntent(stored.payload.photoIntent);
          setPhotoIntentsByBlockId(stored.payload.photoIntentsByBlockId ?? {});
          setMessage(copy.composer.draftRestored);
        }
        setDraftHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setDraftHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [
    copy.composer.draftRestored,
    draftId,
    enableOfflinePersistence,
    ownerUserId,
    spaceId,
  ]);

  useLayoutEffect(() => {
    if (!enableOfflinePersistence) return;

    const payload: SpaceEntryDraftPayload = {
      clientMutationId,
      spaceId,
      mentionedPlantObjectIds,
      draft,
      photoIntent: storedPhotoIntent,
      photoIntentsByBlockId,
    };
    const controller = persistenceControllerRef.current;
    if (!controller) return;
    controller.updateSnapshot({
      ownerUserId,
      draftId,
      payload,
      defaultEntryDate: today,
      hydrated: draftHydrated,
    });
    if (!draftHydrated) return;
    const timer = window.setTimeout(() => {
      if (draftPersistencePausedRef.current) return;
      void controller.persistLatest().catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    clientMutationId,
    draft,
    draftHydrated,
    draftId,
    enableOfflinePersistence,
    mentionedPlantObjectIds,
    ownerUserId,
    photoIntentsByBlockId,
    spaceId,
    storedPhotoIntent,
    today,
  ]);

  async function buildPayload(): Promise<OfflineSpaceEntryPayload> {
    const flushed =
      (await structuredComposerRef.current?.flushLatest()) ??
      draft.contentDocument;
    const plain = flushed
      ? extractJournalDocumentPlainText(flushed)
      : draft.body;
    return {
      target: "space_entry",
      spaceId,
      mentionedPlantObjectIds,
      title: draft.title,
      body: plain,
      contentDocument: flushed ?? undefined,
      entryDate: draft.entryDate,
      clientMutationId,
      syncStatus: isOnline ? "online" : "offline_queued",
      photoIntent: storedPhotoIntent,
      photoIntentsByBlockId:
        Object.keys(photoIntentsByBlockId).length > 0
          ? photoIntentsByBlockId
          : undefined,
      cover: journalCoverSelectionToOfflinePayload(coverSelection),
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState("saving");
    setMessage(null);
    try {
      const payload = await buildPayload();
      if (!payload.body.trim() && !payload.contentDocument) {
        setSubmitState("failed");
        setMessage(copy.composer.messages.genericSaveError);
        return;
      }
      if (mentionedPlantObjectIds.length === 0) {
        setSubmitState("failed");
        setMessage(copy.page.spaceJournal.mentionedObjects);
        return;
      }

      if (!isOnline) {
        await enqueueOfflineMutation({
          ownerUserId,
          kind: "journal_entry",
          payload,
          idempotencyKey: clientMutationId,
        });
        setSubmitState("queued");
        setMessage(copy.composer.messages.visualQueued);
        return;
      }

      const result = await submitOnlineJournalEntryPayload(payload, {
        ownerUserId,
        idempotencyKey: clientMutationId,
      });
      await deleteOfflineDraft(ownerUserId, draftId);
      setClientMutationId(crypto.randomUUID());
      setDraft({ title: "", body: "", contentDocument: null, entryDate: today });
      setMentionedPlantObjectIds([]);
      setPhotoIntentsByBlockId({});
      setStoredPhotoIntent(null);
      setSubmitState("idle");
      window.location.assign(result.readbackUrl);
    } catch (error) {
      if (error instanceof JournalEntrySyncError && error.authIntentUrl) {
        setSubmitState("idle");
        setMessage(copy.composer.messages.signInToContinue);
        window.location.assign(error.authIntentUrl);
        return;
      }
      setSubmitState("failed");
      setMessage(
        error instanceof Error ? error.message : labels.failureBody,
      );
    }
  }

  function toggleMention(objectId: string) {
    setMentionedPlantObjectIds((current) =>
      current.includes(objectId)
        ? current.filter((id) => id !== objectId)
        : [...current, objectId],
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="mt-5 grid gap-3 border-y border-border py-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">
            {copy.page.spaceJournal.title}
          </span>
          <input
            name="title"
            required
            maxLength={140}
            value={draft.title}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            placeholder={copy.page.spaceJournal.titlePlaceholder}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">
            {copy.page.spaceJournal.date}
          </span>
          <input
            type="date"
            name="entryDate"
            value={draft.entryDate}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                entryDate: event.target.value,
              }))
            }
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="grid gap-1 text-sm">
        <span className="font-medium text-foreground">
          {copy.page.spaceJournal.story}
        </span>
        <StructuredJournalComposer
          locale={locale}
          labels={labels}
          initialDocument={draft.contentDocument ?? undefined}
          composerRef={structuredComposerRef}
          onDocumentChange={(document) => {
            const plain = extractJournalDocumentPlainText(document);
            setDraft((current) => ({
              ...current,
              body: plain || current.body,
              contentDocument: document,
            }));
          }}
          onSelectImageFile={async (file, blockId) => {
            const existingBytes = sumOfflinePhotoIntentBytes(
              Object.values(photoIntentsByBlockId),
            );
            await assertOfflinePhotoQuotaAllows({
              existingBytes,
              nextBytes: file.size,
            });
            const mediaAssetId = crypto.randomUUID();
            const intent = await createComposerPhotoIntent(file);
            setPhotoIntentsByBlockId((current) => ({
              ...current,
              [mediaAssetId]: intent,
              [blockId]: intent,
            }));
            setStoredPhotoIntent(intent);
            const previewUrl = URL.createObjectURL(file);
            registerOwnerPreviewObjectUrl(ownerUserId, previewUrl);
            return { mediaAssetId, previewUrl };
          }}
          onRemoveImageBlock={(blockId) => {
            const mediaId = (() => {
              const block = draft.contentDocument?.blocks.find(
                (item) => item.id === blockId,
              );
              return block?.type === "image" ? block.mediaAssetId : null;
            })();
            if (
              mediaId &&
              coverSelection.mode === "explicit_inline" &&
              coverSelection.mediaAssetId === mediaId
            ) {
              setPendingCoverInlineRemoval({ mediaAssetId: mediaId });
            }
            setPhotoIntentsByBlockId((current) => {
              const next = { ...current };
              const removed = next[blockId];
              delete next[blockId];
              if (removed) {
                for (const [key, value] of Object.entries(next)) {
                  if (value === removed) delete next[key];
                }
              }
              return next;
            });
          }}
        />
        <JournalCoverControls
          copy={coverCopy}
          selection={coverSelection}
          eligibleInline={listJournalDocumentImageMediaIds(
            draft.contentDocument ?? createEmptyJournalDocument(),
          ).map((mediaAssetId, index) => ({
            mediaAssetId,
            previewUrl: null,
            label: `${coverCopy.useAsCover} ${index + 1}`,
          }))}
          disabled={submitState === "saving"}
          pendingInlineRemoval={pendingCoverInlineRemoval}
          onChange={setCoverSelection}
          onResolveInlineRemoval={(choice) => {
            if (!pendingCoverInlineRemoval) return;
            if (choice === "cancel") {
              setPendingCoverInlineRemoval(null);
              return;
            }
            if (choice === "keep_as_cover") {
              setCoverSelection({
                mode: "separate",
                mediaAssetId: pendingCoverInlineRemoval.mediaAssetId,
                previewUrl: null,
              });
            } else {
              setCoverSelection({ mode: "automatic" });
            }
            setPendingCoverInlineRemoval(null);
          }}
        />
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium text-foreground">
          {copy.page.spaceJournal.mentionedObjects}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {objects.map((object) => (
            <label
              key={object.id}
              className="flex items-start gap-2 border-y border-border px-1 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={mentionedPlantObjectIds.includes(object.id)}
                onChange={() => toggleMention(object.id)}
                className="mt-1 size-4 rounded border-border"
              />
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">
                  {object.displayName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {object.objectKindLabel}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}

      <Button type="submit" disabled={submitState === "saving"}>
        {submitState === "saving"
          ? copy.composer.messages.savingPrivate
          : copy.page.spaceJournal.save}
      </Button>
    </form>
  );
}

interface SpaceComposerPersistenceSnapshot {
  ownerUserId: string;
  draftId: string;
  payload: SpaceEntryDraftPayload;
  defaultEntryDate: string;
  hydrated: boolean;
}

async function persistSpaceComposerSnapshot(
  snapshot: SpaceComposerPersistenceSnapshot,
  context: OwnerComposerPersistenceWriteContext,
) {
  if (!snapshot.hydrated) {
    throw new Error("The space draft is not hydrated yet.");
  }

  if (hasPersistableSpaceEntryDraft(snapshot.payload, snapshot.defaultEntryDate)) {
    await upsertOfflineDraft(
      {
        ownerUserId: snapshot.ownerUserId,
        id: snapshot.draftId,
        kind: "space_entry",
        payload: snapshot.payload,
      },
      context,
    );
    return;
  }

  await deleteOfflineDraft(snapshot.ownerUserId, snapshot.draftId, context);
}
