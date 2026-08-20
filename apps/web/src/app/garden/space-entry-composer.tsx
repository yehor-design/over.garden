"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useOptionalDocumentMutationGeneration } from "@/components/auth/document-mutation-recovery";
import {
  JournalCoverControls,
  journalCoverSelectionToClaimInput,
  type JournalCoverSelectionState,
} from "@/components/garden/journal-cover-controls";
import { OnlineJournalComposerStatus } from "@/components/garden/online-journal-composer-status";
import { StructuredJournalComposer } from "@/components/garden/structured-journal-composer";
import type { StructuredJournalComposerHandle } from "@/components/garden/structured-journal-composer";
import { Button } from "@/components/ui/button";
import {
  JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
  type JournalEntryDraftPayloadV1,
  type JournalEntryDraftReceiptV1,
} from "@/lib/garden/entry-contracts";
import {
  createComposerPhotoIntent,
  type OnlineComposerPhotoIntent,
} from "@/lib/garden/composer-photo-selection";
import { getJournalCoverControlsCopy } from "@/lib/garden/journal-cover-controls-copy";
import {
  createEmptyJournalDocument,
  extractJournalDocumentPlainText,
  listJournalDocumentImageMediaIds,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import {
  OnlineJournalSubmitError,
  uploadOnlineComposerPhoto,
} from "@/lib/garden/online-journal-submit";
import { useInlineMediaSelection } from "@/lib/garden/use-inline-media-selection";
import { useOnlineJournalComposer } from "@/lib/garden/use-online-journal-composer";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
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
  /** False only for deterministic visual fixtures, which must not write. */
  enableServerPersistence?: boolean;
}

interface SpaceEntryFields {
  title: string;
  body: string;
  contentDocument: JournalDocumentV1 | null;
  entryDate: string;
}

export function SpaceEntryComposer({
  locale,
  ownerUserId,
  spaceId,
  objects,
  today,
  enableServerPersistence = true,
}: SpaceEntryComposerProps) {
  const copy = getGardenWorkspaceCopy(locale);
  const labels = getStructuredJournalComposerLabels(locale);
  const coverCopy = getJournalCoverControlsCopy(locale);
  const documentMutation = useOptionalDocumentMutationGeneration();
  const router = useRouter();
  const structuredComposerRef = useRef<StructuredJournalComposerHandle | null>(
    null,
  );
  const inlineMedia = useInlineMediaSelection(ownerUserId);
  const [clientMutationId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState<SpaceEntryFields>({
    title: "",
    body: "",
    contentDocument: null,
    entryDate: today,
  });
  const [mentionedPlantObjectIds, setMentionedPlantObjectIds] = useState<
    string[]
  >([]);
  const [coverSelection, setCoverSelection] =
    useState<JournalCoverSelectionState>({ mode: "automatic" });
  const [pendingCoverInlineRemoval, setPendingCoverInlineRemoval] = useState<{
    mediaAssetId: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const draftPayload = useMemo(
    () =>
      spaceDraftPayload({
        spaceId,
        mentionedPlantObjectIds,
        draft,
        clientMutationId,
        cover: coverSelection,
      }),
    [clientMutationId, coverSelection, draft, mentionedPlantObjectIds, spaceId],
  );
  const online = useOnlineJournalComposer({
    draftKey: `space-entry:${spaceId}`,
    draftKind: "space_entry",
    context: { spaceId },
    payload: draftPayload,
    documentMutationGeneration: documentMutation?.transport,
    enabled: enableServerPersistence,
    onHydrated: hydrateServerDraft,
  });

  function hydrateServerDraft(receipt: JournalEntryDraftReceiptV1) {
    if (
      receipt.draftKind !== "space_entry" ||
      receipt.payload.draftKind !== "space_entry" ||
      receipt.payload.request.spaceId !== spaceId
    ) {
      return;
    }
    const request = receipt.payload.request;
    setDraft({
      title: request.title,
      body: request.body ?? "",
      contentDocument: request.contentDocument ?? null,
      entryDate: request.entryDate ?? today,
    });
    setMentionedPlantObjectIds(request.mentionedPlantObjectIds ?? []);
    setCoverSelection(coverSelectionFromRequest(request.cover));
    setMessage(copy.composer.draftRestored);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const flushed =
        (await structuredComposerRef.current?.flushLatest()) ??
        draft.contentDocument;
      const body = flushed
        ? extractJournalDocumentPlainText(flushed)
        : draft.body;
      if (!body.trim() && !flushed) {
        setMessage(copy.composer.messages.genericSaveError);
        return;
      }
      if (mentionedPlantObjectIds.length === 0) {
        setMessage(copy.page.spaceJournal.mentionedObjects);
        return;
      }
      if (!enableServerPersistence) {
        setMessage(copy.composer.messages.visualDraftSaved);
        return;
      }
      const result = await online.publish(
        spaceDraftPayload({
          spaceId,
          mentionedPlantObjectIds,
          draft: { ...draft, body, contentDocument: flushed },
          clientMutationId,
          cover: coverSelection,
        }),
      );
      if ("readbackUrl" in result && typeof result.readbackUrl === "string") {
        window.location.assign(result.readbackUrl);
      } else {
        router.push("/garden");
        router.refresh();
      }
    } catch (error) {
      handleTransportBoundary(error);
      setMessage(labels.failureBody);
    } finally {
      setSaving(false);
    }
  }

  function handleTransportBoundary(error: unknown) {
    if (
      error instanceof OnlineJournalSubmitError &&
      error.documentMutationAdmission
    ) {
      documentMutation?.handleTransportResult(error.documentMutationAdmission);
    }
    if (error instanceof OnlineJournalSubmitError && error.authIntentUrl) {
      window.location.assign(error.authIntentUrl);
    }
  }

  async function uploadPhoto(intent: OnlineComposerPhotoIntent) {
    const transport = documentMutation?.transport;
    if (!transport) throw new Error("Document session is not ready.");
    try {
      return await uploadOnlineComposerPhoto({
        intent,
        authReturnTo: "/garden",
        documentMutationGeneration: transport,
      });
    } catch (error) {
      handleTransportBoundary(error);
      online.reportConnectionRequired(error);
      throw error;
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
      data-online-composer-kind="space_entry"
      className="mt-5 grid gap-3 border-y border-border py-5"
    >
      <OnlineJournalComposerStatus
        state={online.state}
        locale={locale}
        copy={copy}
        unsavedText={[draft.title, draft.entryDate, draft.body]
          .filter(Boolean)
          .join("\n")}
        navigationHref="/garden"
        onRetry={online.retry}
        onCancel={() => router.push("/garden")}
      />

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
            disabled={online.readOnly}
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
            disabled={online.readOnly}
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
          bindingReady={online.state.hydrated}
          disabled={online.readOnly}
          composerRef={structuredComposerRef}
          onDocumentChange={(document) => {
            const body = extractJournalDocumentPlainText(document);
            setDraft((current) => ({
              ...current,
              body,
              contentDocument: document,
            }));
          }}
          onSelectImageFile={async (file, blockId) => {
            const reservation = inlineMedia.reserve(file, {});
            try {
              const intent = await createComposerPhotoIntent(file);
              const uploaded = await uploadPhoto(intent);
              const previewUrl = URL.createObjectURL(file);
              inlineMedia.commit(reservation, blockId, previewUrl);
              return {
                mediaAssetId: uploaded.mediaAssetId,
                previewUrl,
              };
            } catch (error) {
              inlineMedia.release(reservation);
              throw error;
            }
          }}
          onRemoveImageBlock={(blockId) => {
            inlineMedia.revoke(blockId);
            const block = draft.contentDocument?.blocks.find(
              (item) => item.id === blockId,
            );
            const mediaId = block?.type === "image" ? block.mediaAssetId : null;
            if (
              mediaId &&
              coverSelection.mode === "explicit_inline" &&
              coverSelection.mediaAssetId === mediaId
            ) {
              setPendingCoverInlineRemoval({ mediaAssetId: mediaId });
            }
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
          disabled={saving || online.readOnly}
          onSelectSeparateFile={async (intent) => {
            const uploaded = await uploadPhoto(intent);
            return {
              mediaAssetId: uploaded.mediaAssetId,
              previewUrl: uploaded.publicUrl,
            };
          }}
          pendingInlineRemoval={pendingCoverInlineRemoval}
          onChange={setCoverSelection}
          onResolveInlineRemoval={(choice) => {
            if (!pendingCoverInlineRemoval) return;
            if (choice === "cancel") {
              setPendingCoverInlineRemoval(null);
              return;
            }
            setCoverSelection(
              choice === "keep_as_cover"
                ? {
                    mode: "separate",
                    mediaAssetId: pendingCoverInlineRemoval.mediaAssetId,
                    previewUrl: null,
                  }
                : { mode: "automatic" },
            );
            setPendingCoverInlineRemoval(null);
          }}
        />
      </div>

      <fieldset className="grid gap-2" disabled={online.readOnly}>
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

      <Button type="submit" disabled={saving || online.readOnly}>
        {saving
          ? copy.composer.messages.savingPrivate
          : copy.page.spaceJournal.save}
      </Button>
    </form>
  );
}

function spaceDraftPayload(input: {
  spaceId: string;
  mentionedPlantObjectIds: string[];
  draft: SpaceEntryFields;
  clientMutationId: string;
  cover: JournalCoverSelectionState;
}): JournalEntryDraftPayloadV1 {
  return {
    schemaVersion: JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
    draftKind: "space_entry",
    request: {
      target: "space_entry",
      spaceId: input.spaceId,
      mentionedPlantObjectIds: input.mentionedPlantObjectIds,
      title: input.draft.title,
      body: input.draft.body,
      contentDocument: input.draft.contentDocument,
      entryDate: input.draft.entryDate,
      clientMutationId: input.clientMutationId,
      syncStatus: "online",
      cover: journalCoverSelectionToClaimInput(input.cover),
    },
  };
}

function coverSelectionFromRequest(
  cover: JournalEntryDraftPayloadV1["request"]["cover"],
): JournalCoverSelectionState {
  if (!cover || cover.mode === "automatic") return { mode: "automatic" };
  if (cover.mode === "none") return { mode: "none" };
  if (cover.mode === "explicit_inline") {
    return { mode: "explicit_inline", mediaAssetId: cover.mediaAssetId };
  }
  return { mode: "separate", mediaAssetId: cover.mediaAssetId };
}
