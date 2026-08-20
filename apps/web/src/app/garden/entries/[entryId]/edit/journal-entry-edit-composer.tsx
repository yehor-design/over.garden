"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  JournalCoverControls,
  journalCoverSelectionToClaimInput,
  type JournalCoverSelectionState,
} from "@/components/garden/journal-cover-controls";
import { OnlineJournalComposerStatus } from "@/components/garden/online-journal-composer-status";
import { OwnerMediaFocalPanel } from "@/components/media/owner-media-focal-panel";
import { StructuredJournalComposer } from "@/components/garden/structured-journal-composer";
import type { StructuredJournalComposerHandle } from "@/components/garden/structured-journal-composer";
import { Button } from "@/components/ui/button";
import { useOptionalDocumentMutationGeneration } from "@/components/auth/document-mutation-recovery";
import { getJournalCoverControlsCopy } from "@/lib/garden/journal-cover-controls-copy";
import { getOwnerMediaFocalPanelCopy } from "@/lib/media/owner-media-focal-copy";
import type { JournalDocumentV1 } from "@/lib/garden/journal-document";
import {
  extractJournalDocumentPlainText,
  listJournalDocumentImageMediaIds,
} from "@/lib/garden/journal-document";
import {
  createComposerPhotoIntent,
  type OnlineComposerPhotoIntent,
} from "@/lib/garden/composer-photo-selection";
import { useInlineMediaSelection } from "@/lib/garden/use-inline-media-selection";
import {
  OnlineJournalSubmitError,
  uploadOnlineComposerPhoto,
} from "@/lib/garden/online-journal-submit";
import { useOnlineJournalComposer } from "@/lib/garden/use-online-journal-composer";
import {
  JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
  type JournalDraftEditEntryRequest,
  type JournalEntryDraftPayloadV1,
  type JournalEntryDraftReceiptV1,
} from "@/lib/garden/entry-contracts";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import type { PublicLocale } from "@/lib/public-localization";
import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";

export function JournalEntryEditComposer({
  locale,
  entryId,
  title: initialTitle,
  entryDate: initialEntryDate,
  expectedRevision: initialRevision,
  initialDocument,
  documentUnavailable,
  imagePreviewUrls,
  initialCoverMediaAssetId = null,
}: {
  locale: PublicLocale;
  entryId: string;
  title: string;
  entryDate: string;
  expectedRevision: number;
  initialDocument: JournalDocumentV1 | null;
  documentUnavailable: boolean;
  imagePreviewUrls: Record<string, string>;
  initialCoverMediaAssetId?: string | null;
}) {
  const router = useRouter();
  const documentMutation = useOptionalDocumentMutationGeneration();
  const composerRef = useRef<StructuredJournalComposerHandle | null>(null);
  const inlineMedia = useInlineMediaSelection(entryId);
  const [title, setTitle] = useState(initialTitle);
  const [entryDate, setEntryDate] = useState(initialEntryDate);
  const [document, setDocument] = useState<JournalDocumentV1 | null>(
    initialDocument,
  );
  const [expectedRevision, setExpectedRevision] = useState(initialRevision);
  const [clientMutationId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cover, setCover] = useState<JournalCoverSelectionState>(() => {
    if (!initialCoverMediaAssetId) return { mode: "automatic" };
    const inlineIds = initialDocument
      ? listJournalDocumentImageMediaIds(initialDocument)
      : [];
    if (inlineIds.includes(initialCoverMediaAssetId)) {
      return {
        mode: "explicit_inline",
        mediaAssetId: initialCoverMediaAssetId,
        previewUrl: imagePreviewUrls[initialCoverMediaAssetId] ?? null,
      };
    }
    return {
      mode: "separate",
      mediaAssetId: initialCoverMediaAssetId,
      previewUrl: imagePreviewUrls[initialCoverMediaAssetId] ?? null,
    };
  });
  const [pendingInlineRemoval, setPendingInlineRemoval] = useState<{
    mediaAssetId: string;
  } | null>(null);
  const labels = getStructuredJournalComposerLabels(locale);
  const workspaceCopy = getGardenWorkspaceCopy(locale);
  const coverCopy = getJournalCoverControlsCopy(locale);
  const focalCopy = getOwnerMediaFocalPanelCopy(locale);
  const previewMap = useMemo(
    () => new Map(Object.entries(imagePreviewUrls)),
    [imagePreviewUrls],
  );
  const focalTarget = useMemo(() => {
    if (cover.mode === "explicit_inline" || cover.mode === "separate") {
      const mediaAssetId = cover.mediaAssetId;
      if (!mediaAssetId) return null;
      const previewUrl =
        cover.previewUrl ?? previewMap.get(mediaAssetId) ?? null;
      if (!previewUrl) return null;
      return { mediaAssetId, previewUrl };
    }
    const firstInline = document
      ? listJournalDocumentImageMediaIds(document)[0]
      : null;
    if (!firstInline) return null;
    const previewUrl = previewMap.get(firstInline) ?? null;
    if (!previewUrl) return null;
    return { mediaAssetId: firstInline, previewUrl };
  }, [cover, document, previewMap]);
  const eligibleInline = useMemo(() => {
    if (!document) return [];
    return listJournalDocumentImageMediaIds(document).map(
      (mediaAssetId, index) => ({
        mediaAssetId,
        previewUrl: previewMap.get(mediaAssetId) ?? null,
        label: `${coverCopy.useAsCover} ${index + 1}`,
      }),
    );
  }, [coverCopy.useAsCover, document, previewMap]);

  const draftPayload = useMemo(
    () =>
      editDraftPayload({
        entryId,
        title,
        entryDate,
        expectedRevision,
        document,
        clientMutationId,
        cover,
      }),
    [
      clientMutationId,
      cover,
      document,
      entryDate,
      entryId,
      expectedRevision,
      title,
    ],
  );
  const online = useOnlineJournalComposer({
    draftKey: `edit-entry:${entryId}`,
    draftKind: "edit_entry",
    context: { journalEntryId: entryId },
    payload: draftPayload,
    documentMutationGeneration: documentMutation?.transport,
    enabled: !documentUnavailable,
    onHydrated: hydrateEditDraft,
  });

  function hydrateEditDraft(receipt: JournalEntryDraftReceiptV1) {
    if (
      receipt.draftKind !== "edit_entry" ||
      receipt.payload.draftKind !== "edit_entry" ||
      receipt.payload.request.entryId !== entryId
    ) {
      return;
    }
    const request = receipt.payload.request;
    if (typeof request.title === "string") setTitle(request.title);
    if (typeof request.entryDate === "string") setEntryDate(request.entryDate);
    if (request.contentDocument) setDocument(request.contentDocument);
    if (typeof request.expectedRevision === "number") {
      setExpectedRevision(request.expectedRevision);
    }
    setCover(coverSelectionFromRequest(request.cover, imagePreviewUrls));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const flushed = (await composerRef.current?.flushLatest()) ?? document;
      if (!flushed) {
        setMessage(labels.failureBody);
        return;
      }
      const payload = editDraftPayload({
        entryId,
        title,
        entryDate,
        expectedRevision,
        document: flushed,
        clientMutationId,
        cover,
      });
      const result = await online.publish(payload);
      if (result.entry.journalRevision) {
        setExpectedRevision(result.entry.journalRevision);
      }
      setMessage(labels.saveLabel);
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
        authReturnTo: `/garden/entries/${entryId}/edit`,
        documentMutationGeneration: transport,
      });
    } catch (error) {
      handleTransportBoundary(error);
      online.reportConnectionRequired(error);
      throw error;
    }
  }

  if (documentUnavailable) {
    return (
      <section className="grid gap-3">
        <h1 className="text-2xl font-medium">{labels.unavailableTitle}</h1>
        <p className="text-muted-foreground">{labels.unavailableBody}</p>
      </section>
    );
  }

  return (
    <section
      className="grid gap-4"
      data-journal-entry-edit="true"
      data-online-composer-kind="edit_entry"
    >
      <label className="grid gap-1">
        <span className="text-sm font-medium">{labels.titleLabel}</span>
        <input
          className="h-10 rounded-md border border-input px-3"
          value={title}
          disabled={online.readOnly}
          onChange={(event) => setTitle(event.target.value)}
          aria-label={labels.titleLabel}
        />
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-medium">{labels.dateLabel}</span>
        <input
          type="date"
          className="h-10 rounded-md border border-input px-3"
          value={entryDate}
          disabled={online.readOnly}
          onChange={(event) => setEntryDate(event.target.value)}
          aria-label={labels.dateLabel}
        />
      </label>
      <StructuredJournalComposer
        locale={locale}
        labels={labels}
        initialDocument={document}
        bindingReady={online.state.hydrated}
        disabled={online.readOnly}
        imagePreviewUrls={previewMap}
        composerRef={composerRef}
        onDocumentChange={setDocument}
        onSelectImageFile={async (file, blockId) => {
          const reservation = inlineMedia.reserve(file, {});
          try {
            const intent = await createComposerPhotoIntent(file);
            const { mediaAssetId } = await uploadPhoto(intent);
            const previewUrl = URL.createObjectURL(file);
            inlineMedia.commit(reservation, blockId, previewUrl);
            return { mediaAssetId, previewUrl };
          } catch (error) {
            inlineMedia.release(reservation);
            throw error;
          }
        }}
        onRemoveImageBlock={(blockId) => {
          inlineMedia.revoke(blockId);
          const block = document?.blocks.find((item) => item.id === blockId);
          const mediaId = block?.type === "image" ? block.mediaAssetId : null;
          if (
            mediaId &&
            cover.mode === "explicit_inline" &&
            cover.mediaAssetId === mediaId
          ) {
            setPendingInlineRemoval({ mediaAssetId: mediaId });
          }
        }}
      />
      <JournalCoverControls
        copy={coverCopy}
        selection={cover}
        eligibleInline={eligibleInline}
        disabled={saving || online.readOnly}
        onSelectSeparateFile={async (intent) => {
          const result = await uploadPhoto(intent);
          return {
            mediaAssetId: result.mediaAssetId,
            previewUrl: result.publicUrl,
          };
        }}
        pendingInlineRemoval={pendingInlineRemoval}
        onChange={setCover}
        onResolveInlineRemoval={(choice) => {
          if (!pendingInlineRemoval) return;
          if (choice === "cancel") {
            setPendingInlineRemoval(null);
            return;
          }
          if (choice === "keep_as_cover") {
            setCover({
              mode: "separate",
              mediaAssetId: pendingInlineRemoval.mediaAssetId,
              previewUrl:
                previewMap.get(pendingInlineRemoval.mediaAssetId) ?? null,
            });
          } else {
            setCover({ mode: "automatic" });
          }
          setPendingInlineRemoval(null);
        }}
      />
      {focalTarget ? (
        <OwnerMediaFocalPanel
          mediaAssetId={focalTarget.mediaAssetId}
          imageUrl={focalTarget.previewUrl}
          expectedRevision={expectedRevision}
          copy={focalCopy}
          disabled={saving || online.readOnly}
          onSaved={({ journalRevision }) => {
            if (journalRevision != null) setExpectedRevision(journalRevision);
          }}
        />
      ) : null}
      <OnlineJournalComposerStatus
        state={online.state}
        locale={locale}
        copy={workspaceCopy}
        unsavedText={[
          title,
          entryDate,
          document ? extractJournalDocumentPlainText(document) : "",
        ]
          .filter(Boolean)
          .join("\n")}
        navigationHref="/garden"
        onRetry={online.retry}
        onCancel={() => router.push("/garden")}
      />
      <div className="flex items-center gap-3">
        <Button
          type="button"
          disabled={saving || online.readOnly}
          onClick={() => void save()}
        >
          {labels.saveLabel}
        </Button>
        {message ? (
          <p className="text-sm text-muted-foreground">{message}</p>
        ) : null}
      </div>
    </section>
  );
}

function editDraftPayload(input: {
  entryId: string;
  title: string;
  entryDate: string;
  expectedRevision: number;
  document: JournalDocumentV1 | null;
  clientMutationId: string;
  cover: JournalCoverSelectionState;
}): JournalEntryDraftPayloadV1 {
  const request: JournalDraftEditEntryRequest = {
    entryId: input.entryId,
    title: input.title,
    entryDate: input.entryDate,
    contentDocument: input.document,
    body: input.document ? extractJournalDocumentPlainText(input.document) : "",
    expectedRevision: input.expectedRevision,
    clientMutationId: input.clientMutationId,
    cover: journalCoverSelectionToClaimInput(input.cover),
  };
  return {
    schemaVersion: JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
    draftKind: "edit_entry",
    request,
  };
}

function coverSelectionFromRequest(
  cover: JournalDraftEditEntryRequest["cover"],
  imagePreviewUrls: Record<string, string>,
): JournalCoverSelectionState {
  if (!cover || cover.mode === "automatic") return { mode: "automatic" };
  if (cover.mode === "none") return { mode: "none" };
  if (cover.mode === "explicit_inline") {
    return {
      mode: "explicit_inline",
      mediaAssetId: cover.mediaAssetId,
      previewUrl: imagePreviewUrls[cover.mediaAssetId] ?? null,
    };
  }
  return {
    mode: "separate",
    mediaAssetId: cover.mediaAssetId,
    previewUrl: imagePreviewUrls[cover.mediaAssetId] ?? null,
  };
}
