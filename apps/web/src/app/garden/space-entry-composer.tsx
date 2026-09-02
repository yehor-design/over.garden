"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useOptionalOwnerScope } from "@/components/auth/owner-scope";
import {
  JournalCoverControls,
  type JournalCoverSelectionState,
} from "@/components/garden/journal-cover-controls";
import {
  LocalJournalComposerStatus,
  LocalJournalPublicationDisclosure,
} from "@/components/garden/local-journal-composer-status";
import { StructuredJournalComposer } from "@/components/garden/structured-journal-composer";
import type { StructuredJournalComposerHandle } from "@/components/garden/structured-journal-composer";
import { Button } from "@/components/ui/button";
import { getAtomicJournalCreateCopy } from "@/lib/garden/atomic-journal-create-copy";
import { getJournalCoverControlsCopy } from "@/lib/garden/journal-cover-controls-copy";
import {
  createEmptyJournalDocument,
  extractJournalDocumentPlainText,
  listJournalDocumentImageMediaIds,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import {
  LocalJournalComposerError,
  useLocalJournalComposer,
} from "@/lib/garden/use-local-journal-composer";
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
  requiresFirstPublicationDisclosure: boolean;
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
  spaceId,
  objects,
  today,
  requiresFirstPublicationDisclosure,
  enableServerPersistence = true,
}: SpaceEntryComposerProps) {
  const copy = getGardenWorkspaceCopy(locale);
  const atomicCopy = getAtomicJournalCreateCopy(locale);
  const labels = getStructuredJournalComposerLabels(locale);
  const coverCopy = getJournalCoverControlsCopy(locale);
  const documentMutation = useOptionalOwnerScope();
  const router = useRouter();
  const structuredComposerRef = useRef<StructuredJournalComposerHandle | null>(
    null,
  );
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
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const local = useLocalJournalComposer({
    fallbackReturnTo: "/garden",
    enabled: enableServerPersistence,
    dirty: Boolean(
      draft.title ||
      draft.body ||
      draft.contentDocument?.blocks.length ||
      mentionedPlantObjectIds.length,
    ),
  });
  const imageStates = useMemo(
    () =>
      new Map(
        local.media.items.map((item) => [
          item.mediaAssetId,
          {
            status: item.status,
            previewUrl: item.previewUrl,
            failureCode: item.failureCode,
          },
        ]),
      ),
    [local.media],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    try {
      const document =
        (await structuredComposerRef.current?.flushLatest()) ??
        draft.contentDocument ??
        createEmptyJournalDocument();
      const body = extractJournalDocumentPlainText(document);
      if (
        !body.trim() &&
        listJournalDocumentImageMediaIds(document).length === 0
      ) {
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
      const result = await local.publish({
        context: {
          target: "space_entry",
          spaceId,
          mentionedPlantObjectIds,
          entryDate: draft.entryDate,
        },
        title: draft.title,
        document,
        coverMediaAssetId: selectedCoverMediaAssetId(coverSelection, document),
        disclosureAccepted,
      });
      router.push(result.returnTo);
      router.refresh();
    } catch (error) {
      handleTransportBoundary(error);
      if (
        error instanceof LocalJournalComposerError &&
        error.code === "publication_cancelled"
      ) {
        setMessage(atomicCopy.localOnly);
        return;
      }
      setMessage(atomicCopy.failed);
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

  function toggleMention(objectId: string) {
    if (local.readOnly) return;
    setMentionedPlantObjectIds((current) =>
      current.includes(objectId)
        ? current.filter((id) => id !== objectId)
        : [...current, objectId],
    );
  }

  function changeCover(next: JournalCoverSelectionState) {
    if (
      coverSelection.mode === "separate" &&
      coverSelection.mediaAssetId &&
      (next.mode !== "separate" ||
        next.mediaAssetId !== coverSelection.mediaAssetId)
    ) {
      void local.removeImage(coverSelection.mediaAssetId);
    }
    setCoverSelection(next);
  }

  const coverWithPreview = withLocalCoverPreview(coverSelection, imageStates);

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      data-local-composer-kind="space_entry"
      className="mt-5 grid gap-3 border-y border-border py-5"
    >
      <LocalJournalComposerStatus
        state={local.state}
        copy={atomicCopy}
        onCancelPublishing={local.cancelPublishing}
      />

      <fieldset disabled={local.readOnly} className="contents">
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
            bindingReady
            disabled={local.readOnly}
            composerRef={structuredComposerRef}
            imageInsertionMode="immediate"
            imageStates={imageStates}
            onDocumentChange={(document) => {
              setDraft((current) => ({
                ...current,
                body: extractJournalDocumentPlainText(document),
                contentDocument: document,
              }));
            }}
            onSelectImageFile={async (file, blockId, mediaAssetId) => {
              const selected = local.selectImage(file, blockId, mediaAssetId);
              const ready = await selected.ready;
              return {
                mediaAssetId: selected.mediaAssetId,
                previewUrl: ready.previewUrl ?? undefined,
              };
            }}
            onRetryImage={(mediaAssetId) => local.retryImage(mediaAssetId)}
            onReplaceImage={(mediaAssetId, file) =>
              local.replaceImage(mediaAssetId, file)
            }
            onSetImageAsCover={(mediaAssetId) =>
              setCoverSelection({ mode: "explicit_inline", mediaAssetId })
            }
            onRemoveImageBlock={(_blockId, mediaAssetId) => {
              if (
                coverSelection.mode === "explicit_inline" &&
                coverSelection.mediaAssetId === mediaAssetId
              ) {
                setPendingCoverInlineRemoval({ mediaAssetId });
                return;
              }
              void local.removeImage(mediaAssetId);
            }}
          />
          <JournalCoverControls
            copy={coverCopy}
            selection={coverWithPreview}
            eligibleInline={listJournalDocumentImageMediaIds(
              draft.contentDocument ?? createEmptyJournalDocument(),
            ).map((mediaAssetId, index) => ({
              mediaAssetId,
              previewUrl: imageStates.get(mediaAssetId)?.previewUrl ?? null,
              label: `${coverCopy.useAsCover} ${index + 1}`,
            }))}
            disabled={local.readOnly}
            selectedLocalMediaState={
              coverSelection.mode === "explicit_inline" ||
              coverSelection.mode === "separate"
                ? imageStates.get(coverSelection.mediaAssetId ?? "")
                : undefined
            }
            onRetrySelectedLocal={(mediaAssetId) =>
              local.retryImage(mediaAssetId)
            }
            onSelectLocalSeparateFile={async (file) => {
              const currentId =
                coverSelection.mode === "separate"
                  ? coverSelection.mediaAssetId
                  : null;
              const selected = currentId
                ? local.replaceImage(currentId, file)
                : local.selectImage(file, `cover_${crypto.randomUUID()}`);
              return { mediaAssetId: selected.mediaAssetId };
            }}
            pendingInlineRemoval={pendingCoverInlineRemoval}
            onChange={changeCover}
            onResolveInlineRemoval={(choice) => {
              if (!pendingCoverInlineRemoval) return;
              if (choice === "keep_as_cover") {
                setCoverSelection({
                  mode: "separate",
                  mediaAssetId: pendingCoverInlineRemoval.mediaAssetId,
                  previewUrl:
                    imageStates.get(pendingCoverInlineRemoval.mediaAssetId)
                      ?.previewUrl ?? null,
                });
              } else if (choice === "remove_everywhere") {
                void local.removeImage(pendingCoverInlineRemoval.mediaAssetId);
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

        {requiresFirstPublicationDisclosure ? (
          <LocalJournalPublicationDisclosure
            accepted={disclosureAccepted}
            disabled={local.readOnly}
            copy={atomicCopy}
            onChange={setDisclosureAccepted}
          />
        ) : null}
      </fieldset>

      {message ? (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={
          local.readOnly ||
          (requiresFirstPublicationDisclosure && !disclosureAccepted)
        }
      >
        {atomicCopy.publish}
      </Button>
    </form>
  );
}

function selectedCoverMediaAssetId(
  selection: JournalCoverSelectionState,
  document: JournalDocumentV1,
) {
  if (selection.mode === "none") return null;
  if (selection.mode === "automatic") {
    return listJournalDocumentImageMediaIds(document)[0] ?? null;
  }
  return selection.mediaAssetId ?? null;
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
