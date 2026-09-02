"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useOptionalOwnerScope } from "@/components/auth/owner-scope";
import {
  JournalCoverControls,
  type JournalCoverSelectionState,
} from "@/components/garden/journal-cover-controls";
import { LocalJournalComposerStatus } from "@/components/garden/local-journal-composer-status";
import { StructuredJournalComposer } from "@/components/garden/structured-journal-composer";
import type { StructuredJournalComposerHandle } from "@/components/garden/structured-journal-composer";
import { FocalPointControl } from "@/components/media/focal-point-control";
import type { JournalImageUiState } from "@/components/garden/lexical-journal/journal-lexical-image-node";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { getAtomicJournalEditCopy } from "@/lib/garden/atomic-journal-edit-copy";
import { getJournalCoverControlsCopy } from "@/lib/garden/journal-cover-controls-copy";
import { normalizeJournalComposerReturnTo } from "@/lib/garden/journal-composer-return";
import {
  extractJournalDocumentPlainText,
  listJournalDocumentImageMediaIds,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import {
  LocalJournalComposerError,
  useLocalJournalComposer,
} from "@/lib/garden/use-local-journal-composer";
import { stableJson } from "@/lib/media/ephemeral-staging-crypto";
import { getOwnerMediaFocalPanelCopy } from "@/lib/media/owner-media-focal-copy";
import type { PublicLocale } from "@/lib/public-localization";
import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";

export interface JournalEntryEditExistingMedia {
  mediaAssetId: string;
  blockId: string;
  generation: number;
  previewUrl: string;
  width: number | null;
  height: number | null;
  focalX: number;
  focalY: number;
}

export function JournalEntryEditComposer({
  locale,
  entryId,
  title: initialTitle,
  entryDate: initialEntryDate,
  expectedRevision,
  initialDocument,
  existingMedia,
  initialCoverMediaAssetId = null,
  returnTo,
}: {
  locale: PublicLocale;
  entryId: string;
  title: string;
  entryDate: string;
  expectedRevision: number;
  initialDocument: JournalDocumentV1;
  existingMedia: readonly JournalEntryEditExistingMedia[];
  initialCoverMediaAssetId?: string | null;
  returnTo: string;
}) {
  const router = useRouter();
  const documentMutation = useOptionalOwnerScope();
  const composerRef = useRef<StructuredJournalComposerHandle | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelEditingButtonRef = useRef<HTMLButtonElement | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [entryDate, setEntryDate] = useState(initialEntryDate);
  const [document, setDocument] = useState(initialDocument);
  const [mediaDirty, setMediaDirty] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pendingInlineRemoval, setPendingInlineRemoval] = useState<{
    mediaAssetId: string;
  } | null>(null);
  const initialInlineIds = useMemo(
    () => listJournalDocumentImageMediaIds(initialDocument),
    [initialDocument],
  );
  const [cover, setCover] = useState<JournalCoverSelectionState>(() => {
    if (!initialCoverMediaAssetId) return { mode: "automatic" };
    if (initialInlineIds.includes(initialCoverMediaAssetId)) {
      return {
        mode: "explicit_inline",
        mediaAssetId: initialCoverMediaAssetId,
      };
    }
    return {
      mode: "separate",
      mediaAssetId: initialCoverMediaAssetId,
    };
  });
  const initialCoverKey = initialCoverMediaAssetId
    ? `media:${initialCoverMediaAssetId}`
    : "automatic";
  const [focalByMediaId, setFocalByMediaId] = useState(
    () =>
      new Map(
        existingMedia.map((media) => [
          media.mediaAssetId,
          { x: media.focalX, y: media.focalY },
        ]),
      ),
  );
  const labels = getStructuredJournalComposerLabels(locale);
  const editCopy = getAtomicJournalEditCopy(locale);
  const coverCopy = getJournalCoverControlsCopy(locale);
  const focalCopy = getOwnerMediaFocalPanelCopy(locale);
  const safeReturnTo = normalizeJournalComposerReturnTo(returnTo, "/garden");
  const dirty =
    title !== initialTitle ||
    entryDate !== initialEntryDate ||
    stableJson(document) !== stableJson(initialDocument) ||
    coverSelectionKey(cover) !== initialCoverKey ||
    mediaDirty ||
    existingMedia.some((media) => {
      const focal = focalByMediaId.get(media.mediaAssetId);
      return focal?.x !== media.focalX || focal?.y !== media.focalY;
    });
  const local = useLocalJournalComposer({
    fallbackReturnTo: safeReturnTo,
    dirty,
    existingMedia,
  });
  const imageStates = useMemo(() => {
    const states = new Map<string, JournalImageUiState>(
      existingMedia.map((media) => [
        media.mediaAssetId,
        {
          status: "ready" as const,
          previewUrl: media.previewUrl,
          failureCode: null,
        },
      ]),
    );
    for (const item of local.media.items) {
      states.set(item.mediaAssetId, {
        status: item.status,
        previewUrl: item.previewUrl,
        failureCode: item.failureCode,
      });
    }
    return states;
  }, [existingMedia, local.media.items]);
  const inlineIds = listJournalDocumentImageMediaIds(document);
  const selectedCoverId = selectedCoverMediaAssetId(cover);
  const focalTargetId = selectedCoverId ?? inlineIds[0] ?? null;
  const focalTarget = focalTargetId
    ? {
        mediaAssetId: focalTargetId,
        imageUrl: imageStates.get(focalTargetId)?.previewUrl ?? null,
        focal: focalByMediaId.get(focalTargetId) ?? { x: 0.5, y: 0.5 },
      }
    : null;
  const persistenceFrozen = local.readOnly;

  async function save(event?: FormEvent) {
    event?.preventDefault();
    const flushed = (await composerRef.current?.flushLatest()) ?? document;
    setDocument(flushed);
    setCopied(false);
    try {
      const result = await local.publishEdit({
        entryId,
        expectedRevision,
        title,
        entryDate,
        document: flushed,
        coverMediaAssetId: selectedCoverMediaAssetId(cover),
        focalPoints: finalMediaPoints(flushed, cover, focalByMediaId),
        returnTo: safeReturnTo,
      });
      router.push(result.returnTo);
      router.refresh();
    } catch (error) {
      handleTransportBoundary(error);
      if (
        error instanceof LocalJournalComposerError &&
        error.code === "journal_aggregate_conflict"
      ) {
        setConflictOpen(true);
      }
    }
  }

  function handleTransportBoundary(error: unknown) {
    if (
      error instanceof LocalJournalComposerError &&
      typeof error.details?.mutationScope === "string"
    ) {
      documentMutation?.handleActionResult(error.details);
    }
    if (
      error instanceof LocalJournalComposerError &&
      error.details?.authIntentUrl
    ) {
      window.location.assign(error.details.authIntentUrl);
    }
  }

  function ensureFocal(mediaAssetId: string) {
    setFocalByMediaId((current) => {
      if (current.has(mediaAssetId)) return current;
      const next = new Map(current);
      next.set(mediaAssetId, { x: 0.5, y: 0.5 });
      return next;
    });
  }

  function changeCover(next: JournalCoverSelectionState) {
    if (
      cover.mode === "separate" &&
      cover.mediaAssetId &&
      (next.mode !== "separate" || next.mediaAssetId !== cover.mediaAssetId)
    ) {
      void local.removeImage(cover.mediaAssetId);
      setMediaDirty(true);
    }
    setCover(next);
  }

  async function copyLocalChanges() {
    const flushed = (await composerRef.current?.flushLatest()) ?? document;
    const plainText = [
      title.trim(),
      entryDate,
      extractJournalDocumentPlainText(flushed).trim(),
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form
      className="grid gap-4"
      data-local-composer-kind="edit_entry"
      data-local-composer-read-only={persistenceFrozen || undefined}
      onSubmit={(event) => void save(event)}
    >
      <LocalJournalComposerStatus
        state={local.state}
        copy={editCopy}
        onCancelPublishing={local.cancelPublishing}
      />

      <fieldset disabled={persistenceFrozen} className="contents">
        <label className="grid gap-1">
          <span className="text-sm font-medium">{labels.titleLabel}</span>
          <input
            className="h-10 rounded-md border border-input px-3"
            value={title}
            maxLength={140}
            required
            onChange={(event) => setTitle(event.currentTarget.value)}
            aria-label={labels.titleLabel}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm font-medium">{labels.dateLabel}</span>
          <input
            type="date"
            className="h-10 rounded-md border border-input px-3"
            value={entryDate}
            required
            onChange={(event) => setEntryDate(event.currentTarget.value)}
            aria-label={labels.dateLabel}
          />
        </label>
        <StructuredJournalComposer
          locale={locale}
          labels={labels}
          initialDocument={initialDocument}
          bindingReady
          disabled={persistenceFrozen}
          composerRef={composerRef}
          imageInsertionMode="immediate"
          imageStates={imageStates}
          onDocumentChange={setDocument}
          onSelectImageFile={async (file, blockId, mediaAssetId) => {
            const selected = local.selectImage(file, blockId, mediaAssetId);
            ensureFocal(selected.mediaAssetId);
            setMediaDirty(true);
            const ready = await selected.ready;
            return {
              mediaAssetId: selected.mediaAssetId,
              previewUrl: ready.previewUrl ?? undefined,
            };
          }}
          onRetryImage={(mediaAssetId) => local.retryImage(mediaAssetId)}
          onReplaceImage={(mediaAssetId, file) => {
            setMediaDirty(true);
            local.replaceImage(mediaAssetId, file);
          }}
          onSetImageAsCover={(mediaAssetId) =>
            changeCover({ mode: "explicit_inline", mediaAssetId })
          }
          onRemoveImageBlock={(_blockId, mediaAssetId) => {
            setMediaDirty(true);
            if (
              cover.mode === "explicit_inline" &&
              cover.mediaAssetId === mediaAssetId
            ) {
              setPendingInlineRemoval({ mediaAssetId });
              return;
            }
            void local.removeImage(mediaAssetId);
          }}
        />
        <JournalCoverControls
          copy={coverCopy}
          selection={withLocalCoverPreview(cover, imageStates)}
          eligibleInline={inlineIds.map((mediaAssetId, index) => ({
            mediaAssetId,
            previewUrl: imageStates.get(mediaAssetId)?.previewUrl ?? null,
            label: `${coverCopy.useAsCover} ${index + 1}`,
          }))}
          disabled={persistenceFrozen}
          selectedLocalMediaState={
            cover.mode === "explicit_inline" || cover.mode === "separate"
              ? imageStates.get(cover.mediaAssetId ?? "")
              : undefined
          }
          onRetrySelectedLocal={(mediaAssetId) =>
            local.retryImage(mediaAssetId)
          }
          onSelectLocalSeparateFile={async (file) => {
            const currentId =
              cover.mode === "separate" ? cover.mediaAssetId : null;
            const selected = currentId
              ? local.replaceImage(currentId, file)
              : local.selectImage(file, `cover_${crypto.randomUUID()}`);
            ensureFocal(selected.mediaAssetId);
            setMediaDirty(true);
            return { mediaAssetId: selected.mediaAssetId };
          }}
          pendingInlineRemoval={pendingInlineRemoval}
          onChange={changeCover}
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
                  imageStates.get(pendingInlineRemoval.mediaAssetId)
                    ?.previewUrl ?? null,
              });
            } else {
              void local.removeImage(pendingInlineRemoval.mediaAssetId);
              setCover({ mode: "automatic" });
            }
            setPendingInlineRemoval(null);
          }}
        />
        {focalTarget?.imageUrl ? (
          <FocalPointControl
            imageUrl={focalTarget.imageUrl}
            focal={focalTarget.focal}
            copy={focalCopy}
            disabled={persistenceFrozen}
            onChange={(next) => {
              setFocalByMediaId((current) => {
                const updated = new Map(current);
                updated.set(focalTarget.mediaAssetId, next);
                return updated;
              });
            }}
          />
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          ref={saveButtonRef}
          type="submit"
          disabled={persistenceFrozen || !dirty}
        >
          {editCopy.save}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void copyLocalChanges()}
        >
          {editCopy.copyLocalChanges}
        </Button>
        <Button
          ref={cancelEditingButtonRef}
          type="button"
          variant="ghost"
          disabled={persistenceFrozen}
          onClick={() => {
            if (dirty) {
              setDiscardOpen(true);
              return;
            }
            local.abandon();
            router.push(safeReturnTo);
          }}
        >
          {editCopy.cancelEditing}
        </Button>
      </div>
      {copied ? (
        <p className="text-sm text-muted-foreground" role="status">
          {editCopy.localChangesCopied}
        </p>
      ) : null}

      <AlertDialog
        open={conflictOpen}
        onOpenChange={(open) => setConflictOpen(open)}
      >
        <AlertDialogContent
          data-atomic-journal-edit-conflict="true"
          finalFocus={saveButtonRef}
        >
          <AlertDialogTitle>{editCopy.conflictTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {editCopy.conflictBody}
          </AlertDialogDescription>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogClose className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-9">
              {editCopy.closeConflict}
            </AlertDialogClose>
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyLocalChanges()}
            >
              {editCopy.copyLocalChanges}
            </Button>
            <Button type="button" onClick={() => window.location.reload()}>
              {editCopy.reloadLatest}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={discardOpen}
        onOpenChange={(open) => setDiscardOpen(open)}
      >
        <AlertDialogContent
          data-atomic-journal-edit-discard="true"
          finalFocus={cancelEditingButtonRef}
        >
          <AlertDialogTitle>{editCopy.discardTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {editCopy.discardBody}
          </AlertDialogDescription>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogClose className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-9">
              {editCopy.keepEditing}
            </AlertDialogClose>
            <AlertDialogClose
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white hover:bg-destructive/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-9"
              onClick={() => {
                local.abandon();
                router.push(safeReturnTo);
              }}
            >
              {editCopy.discardChanges}
            </AlertDialogClose>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function selectedCoverMediaAssetId(selection: JournalCoverSelectionState) {
  if (selection.mode === "none") return null;
  // A null canonical pointer means automatic presentation. Preserve that
  // distinction during unrelated edits instead of silently pinning the first
  // inline image as an explicit cover.
  if (selection.mode === "automatic") return null;
  return selection.mediaAssetId ?? null;
}

function finalMediaPoints(
  document: JournalDocumentV1,
  cover: JournalCoverSelectionState,
  focalByMediaId: ReadonlyMap<string, { x: number; y: number }>,
) {
  const mediaIds = listJournalDocumentImageMediaIds(document);
  const coverId = selectedCoverMediaAssetId(cover);
  if (coverId && !mediaIds.includes(coverId)) mediaIds.push(coverId);
  return mediaIds.map((mediaAssetId) => ({
    mediaAssetId,
    ...(focalByMediaId.get(mediaAssetId) ?? { x: 0.5, y: 0.5 }),
  }));
}

function coverSelectionKey(selection: JournalCoverSelectionState) {
  if (selection.mode === "automatic" || selection.mode === "none") {
    return selection.mode;
  }
  return `media:${selection.mediaAssetId ?? ""}`;
}

function withLocalCoverPreview(
  selection: JournalCoverSelectionState,
  states: ReadonlyMap<string, { previewUrl: string | null }>,
): JournalCoverSelectionState {
  if (selection.mode !== "explicit_inline" && selection.mode !== "separate") {
    return selection;
  }
  return {
    ...selection,
    previewUrl: states.get(selection.mediaAssetId ?? "")?.previewUrl ?? null,
  };
}
