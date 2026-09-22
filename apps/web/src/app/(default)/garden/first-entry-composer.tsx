"use client";

import { DESTINATION_COPY } from "@/lib/garden/owned-destinations";
import { OwnedDestinationPicker } from "@/components/garden/owned-destination-picker";
import { SpaceSetupFlow } from "@/components/garden/space-setup-flow";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getSpaceSetupCopy } from "@/lib/space-setup-copy";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CloudArrowUpIcon as UploadCloud } from "@/components/icons/CloudArrowUp";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useOptionalOwnerScope } from "@/components/auth/owner-scope";
import {
  journalCoverPhotoLabel,
  JournalCoverControls,
  type JournalCoverSelectionState,
} from "@/components/garden/journal-cover-controls";
import {
  LocalJournalComposerStatus,
  LocalJournalPublicationDisclosure,
} from "@/components/garden/local-journal-composer-status";
import { UnpublishedWorkGuard } from "@/components/garden/unpublished-work-guard";
import {
  JournalMediaReadiness,
  journalMediaReadinessText,
  summarizeJournalMediaReadiness,
} from "@/components/garden/journal-media-readiness";
import { StructuredJournalComposer } from "@/components/garden/structured-journal-composer";
import type { StructuredJournalComposerHandle } from "@/components/garden/structured-journal-composer";
import type { PlantObjectKind } from "@/db/schema";
import { useScrollToHashOnMount } from "@/lib/browser/hash-scroll";
import {
  CatalogPicker,
  type CatalogPickOutcome,
  type CatalogSearchMiss,
} from "@/components/garden/catalog-picker";
import { materializeCatalogNodeAction } from "@/app/(default)/garden/catalog-full-catalogue-actions";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import { getJournalCoverControlsCopy } from "@/lib/garden/journal-cover-controls-copy";
import { getAtomicJournalCreateCopy } from "@/lib/garden/atomic-journal-create-copy";
import {
  extractJournalDocumentPlainText,
  listJournalDocumentImageMediaIds,
  createEmptyJournalDocument,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  type ActivationSource,
  type FirstEntryCatalogSelection,
} from "@/lib/garden/entry-contracts";
import type {
  JournalMentionSelection,
  JournalMentionSuggestion,
} from "@/lib/garden/journal-mentions";
import { objectKindAfterPickerSelection } from "@/lib/garden/catalog-object-kind";
import {
  LocalJournalComposerError,
  useLocalJournalComposer,
} from "@/lib/garden/use-local-journal-composer";
import {
  catalogItemIdForSelection,
  catalogLabelForSelection,
  type CatalogPickerSelection,
} from "@/lib/garden/catalog-typeahead-contract";
import {
  nextJournalTitleValue,
  suggestJournalEntryTitle,
} from "@/lib/garden/journal-title-prefill";
import { normalizeJournalTopicTagLabels } from "@/lib/garden/journal-topics";
import { getLocalizedCoarseRegionOptions } from "@/lib/garden/regions";
import { trackMetaMarketingEvent } from "@/lib/meta-marketing/client";
import {
  JournalMentionTypeaheadPanel,
  applyMentionSuggestion,
  mentionSelectionKey,
  parseJournalMentionSuggestions,
  toMentionSelection,
  type ActiveMentionToken,
  type MentionTypeaheadStatus,
} from "./journal-mention-typeahead";
import { recordCatalogPickEventAction } from "./catalog-pick-event-actions";
import { recordCatalogSearchMissAction } from "./catalog-search-miss-actions";
import { JournalObjectKindSelector } from "./journal-object-kind-selector";
import { HiddenField } from "@/components/ui/hidden-field";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface FirstEntryComposerProps {
  ownerUserId: string;
  locale: InterfaceLocale;
  today: string;
  initialClientMutationId: string;
  requiresFirstPublicationDisclosure: boolean;
  initialSpace?: { id: string; displayName: string } | null;
  initialCatalogItem?: FirstEntryCatalogSelection | null;
  activationSource?: ActivationSource | null;
  enableServerPersistence?: boolean;
}

type SubmitState = "idle" | "publishing" | "published" | "failed";

interface FirstEntryDraftFields {
  spaceId: string | null;
  spaceName: string;
  plantName: string;
  objectKind: PlantObjectKind;
  title: string;
  body: string;
  contentDocument: JournalDocumentV1 | null;
  entryDate: string;
  locationVisibility: "hidden" | "region";
  coarseRegionCode: string;
}

export function FirstEntryComposer({
  locale,
  today,
  requiresFirstPublicationDisclosure,
  initialSpace = null,
  initialCatalogItem = null,
  activationSource = null,
  enableServerPersistence = true,
}: FirstEntryComposerProps) {
  const copy = getGardenWorkspaceCopy(locale);
  const spaceSetupCopy = getSpaceSetupCopy(locale);
  const atomicCopy = getAtomicJournalCreateCopy(locale);
  const documentMutation = useOptionalOwnerScope();
  const localPersistenceEnabled = enableServerPersistence;
  useScrollToHashOnMount("first-entry-composer");
  const router = useRouter();
  const titleEditedByUserRef = useRef(false);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const structuredComposerRef = useRef<StructuredJournalComposerHandle | null>(
    null,
  );
  const [draft, setDraft] = useState<FirstEntryDraftFields>({
    spaceId: initialSpace?.id ?? null,
    spaceName: initialSpace?.displayName ?? "",
    plantName: "",
    objectKind: initialCatalogItem
      ? objectKindAfterPickerSelection("plant", initialCatalogItem.kind)
      : ("plant" as PlantObjectKind),
    title: "",
    body: "",
    contentDocument: null,
    entryDate: today,
    locationVisibility: "hidden",
    coarseRegionCode: "",
  });
  const [coverSelection, setCoverSelection] =
    useState<JournalCoverSelectionState>({ mode: "automatic" });
  const [pendingCoverInlineRemoval, setPendingCoverInlineRemoval] = useState<{
    mediaAssetId: string;
  } | null>(null);
  const coverCopy = getJournalCoverControlsCopy(locale);
  const [catalogSelection, setCatalogSelection] =
    useState<CatalogPickerSelection | null>(
      initialCatalogItem ? { kind: "item", row: initialCatalogItem } : null,
    );
  const [activeMentionToken, setActiveMentionToken] =
    useState<ActiveMentionToken | null>(null);
  const [mentionSelections, setMentionSelections] = useState<
    JournalMentionSelection[]
  >([]);
  const [topicTagInput, setTopicTagInput] = useState("");
  const [spaceSetupOpen, setSpaceSetupOpen] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<
    JournalMentionSuggestion[]
  >([]);
  const [mentionStatus, setMentionStatus] =
    useState<MentionTypeaheadStatus>("idle");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState(atomicCopy.localOnly);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const labels = getStructuredJournalComposerLabels(locale);
  const storyImageIds = listJournalDocumentImageMediaIds(
    draft.contentDocument ?? createEmptyJournalDocument(),
  );
  const separateCoverId =
    coverSelection.mode === "separate"
      ? (coverSelection.mediaAssetId ?? null)
      : null;
  const hasPhoto = storyImageIds.length > 0 || separateCoverId !== null;
  const dirty = Boolean(
    draft.plantName ||
    draft.title ||
    draft.body ||
    draft.contentDocument?.blocks.length ||
    separateCoverId ||
    catalogSelection,
  );
  const local = useLocalJournalComposer({
    enabled: localPersistenceEnabled,
    fallbackReturnTo: "/garden",
    dirty,
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
            source: item.source,
          },
        ]),
      ),
    [local.media],
  );
  const persistenceFrozen = local.readOnly;

  function beginLocaleMutation() {}

  function endLocaleMutation() {}

  useEffect(() => {
    if (!activeMentionToken) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setMentionStatus("loading");

      try {
        const response = await fetch(
          `/api/garden/mentions/typeahead?q=${encodeURIComponent(
            activeMentionToken.query,
          )}`,
          {
            headers: documentMutation?.headers() ?? {},
            signal: controller.signal,
          },
        );

        if (await documentMutation?.handleResponse(response)) {
          setMentionSuggestions([]);
          setMentionStatus("failed");
          return;
        }
        if (!response.ok) throw new Error("Mention suggestions unavailable.");

        const body = (await response.json()) as unknown;
        setMentionSuggestions(parseJournalMentionSuggestions(body));
        setMentionStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setMentionSuggestions([]);
        setMentionStatus("failed");
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeMentionToken, documentMutation]);

  // Every photograph Publish will send: the story's, then a cover of its own.
  const readiness = summarizeJournalMediaReadiness(
    separateCoverId && !storyImageIds.includes(separateCoverId)
      ? [...storyImageIds, separateCoverId]
      : storyImageIds,
    imageStates,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isComposerPersistenceFrozen()) return;

    beginLocaleMutation();
    try {
      // A photograph that failed is retried or removed before anything is
      // sent: Publish would otherwise wait on it and then fail as a whole.
      if (readiness.failedMediaAssetIds.length > 0) {
        setSubmitState("failed");
        setMessage(journalMediaReadinessText(readiness, labels) ?? "");
        focusPhotoAction(readiness.failedMediaAssetIds[0]!, "retry");
        return;
      }

      let document: JournalDocumentV1;
      try {
        document = await buildDocument();
      } catch {
        setSubmitState("failed");
        setMessage(copy.composer.photo.readError);
        return;
      }
      setSubmitState("publishing");
      setMessage(atomicCopy.publishing);

      try {
        const result = await local.publish({
          context: {
            target: "first_plant_entry",
            spaceId: draft.spaceId,
            spaceName: draft.spaceName,
            plantName: draft.plantName,
            objectKind: draft.objectKind,
            catalogItemId: catalogItemIdForSelection(catalogSelection),
            catalogLabel: catalogLabelForSelection(catalogSelection),
            locationVisibility: draft.locationVisibility,
            coarseRegionCode:
              draft.locationVisibility === "region"
                ? draft.coarseRegionCode
                : null,
            entryDate: draft.entryDate,
            activationSource,
            mentionSelections,
            topicTags: normalizeJournalTopicTagLabels(topicTagInput),
          },
          title: draft.title,
          document,
          coverMediaAssetId: selectedCoverMediaAssetId(
            coverSelection,
            document,
          ),
          disclosureAccepted,
        });
        setSubmitState("published");
        setMessage(atomicCopy.published);
        void trackMetaMarketingEvent("first_entry_saved", {
          browserPixel: false,
        });
        router.push(result.returnTo);
        router.refresh();
      } catch (error) {
        handleTransportBoundary(error);
        if (
          error instanceof LocalJournalComposerError &&
          error.code === "publication_cancelled"
        ) {
          setSubmitState("idle");
          setMessage(atomicCopy.localOnly);
          return;
        }
        setSubmitState("failed");
        setMessage(
          error instanceof LocalJournalComposerError &&
            error.code === "destination_unavailable"
            ? ""
            : atomicCopy.failed,
        );
      }
    } finally {
      endLocaleMutation();
    }
  }

  function handleCancel() {
    local.abandon();
    router.push("/garden");
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

  async function buildDocument(): Promise<JournalDocumentV1> {
    return (
      (await structuredComposerRef.current?.flushLatest()) ??
      draft.contentDocument ??
      createEmptyJournalDocument()
    );
  }

  function updateDraft<K extends keyof FirstEntryDraftFields>(
    field: K,
    value: FirstEntryDraftFields[K],
  ) {
    if (isComposerPersistenceFrozen()) return;
    setDraft((current) => {
      const next = { ...current, [field]: value };
      return field === "plantName" || field === "body" || field === "entryDate"
        ? withSuggestedTitle(next)
        : next;
    });
  }

  function updateObjectKind(value: PlantObjectKind) {
    if (isComposerPersistenceFrozen()) return;
    setDraft((current) => ({ ...current, objectKind: value }));

    if (catalogSelection) {
      setCatalogSelection(null);
    }
  }

  function updateTitle(value: string) {
    if (isComposerPersistenceFrozen()) return;
    titleEditedByUserRef.current = true;
    setDraft((current) => ({ ...current, title: value }));
  }

  function selectMentionSuggestion(suggestion: JournalMentionSuggestion) {
    if (isComposerPersistenceFrozen()) return;
    if (!activeMentionToken) return;

    const applied = applyMentionSuggestion(
      draft.body,
      activeMentionToken,
      suggestion,
    );

    setDraft((current) =>
      withSuggestedTitle({
        ...current,
        body: applied.body,
      }),
    );
    setMentionSelections((current) => {
      const selection = toMentionSelection(suggestion);
      return current.some(
        (item) => mentionSelectionKey(item) === mentionSelectionKey(selection),
      )
        ? current
        : [...current, selection];
    });
    setActiveMentionToken(null);
    setMentionSuggestions([]);
    setMentionStatus("idle");

    window.requestAnimationFrame(() => {
      bodyTextareaRef.current?.focus();
      bodyTextareaRef.current?.setSelectionRange(
        applied.cursorPosition,
        applied.cursorPosition,
      );
    });
  }

  function removeMentionSelection(selection: JournalMentionSelection) {
    if (isComposerPersistenceFrozen()) return;
    setMentionSelections((current) =>
      current.filter(
        (item) => mentionSelectionKey(item) !== mentionSelectionKey(selection),
      ),
    );
  }

  function updateTopicTagInput(value: string) {
    if (isComposerPersistenceFrozen()) return;
    setTopicTagInput(value);
  }

  function updateLocationVisibility(value: string) {
    if (isComposerPersistenceFrozen()) return;
    setDraft((current) => ({
      ...current,
      locationVisibility: value === "region" ? "region" : "hidden",
      coarseRegionCode: value === "region" ? current.coarseRegionCode : "",
    }));
  }

  function updateCatalogSelection(selection: CatalogPickerSelection | null) {
    if (isComposerPersistenceFrozen()) return;
    setCatalogSelection(selection);
    if (selection?.kind === "item") {
      const row = selection.row;
      setDraft((current) =>
        withSuggestedTitle(
          {
            ...current,
            // The picker is the name field, so a pick names the object. The
            // gardener can still edit it afterwards, which clears the
            // selection back to their own name — the same escape as before.
            plantName: row.displayName,
            objectKind: objectKindAfterPickerSelection(
              current.objectKind,
              row.kind,
            ),
          },
          { catalogLabel: row.displayName },
        ),
      );
      return;
    }
    setDraft((current) =>
      withSuggestedTitle(current, {
        catalogLabel: selection?.kind === "own_name" ? selection.name : null,
      }),
    );
  }

  function chooseUnknownCatalog() {
    updateCatalogSelection(null);
  }

  function reportCatalogSearchMiss(miss: CatalogSearchMiss) {
    void recordCatalogSearchMissAction({
      query: miss.query,
      locale,
      objectKind: draft.objectKind,
    }).catch(() => undefined);
  }

  function reportCatalogPickOutcome(outcome: CatalogPickOutcome) {
    void recordCatalogPickEventAction({
      outcome: outcome.outcome,
      queryLength: outcome.queryLength,
      msToPick: outcome.msToPick,
      locale,
      objectKind: draft.objectKind,
      catalogItemId: outcome.catalogItemId,
    }).catch(() => undefined);
  }

  function focusPhotoAction(mediaAssetId: string, action: string) {
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `[data-journal-image-action="${action}"][data-media-asset-id="${mediaAssetId}"]`,
        )
        ?.focus();
    });
  }

  function isComposerPersistenceFrozen() {
    return local.readOnly;
  }

  function withSuggestedTitle(
    nextDraft: FirstEntryDraftFields,
    options: {
      catalogLabel?: string | null;
      hasPhoto?: boolean;
    } = {},
  ): FirstEntryDraftFields {
    const catalogLabel =
      options.catalogLabel !== undefined
        ? options.catalogLabel
        : (catalogLabelForSelection(catalogSelection) ??
          (catalogSelection?.kind === "item"
            ? catalogSelection.row.displayName
            : null));
    const suggestion = suggestJournalEntryTitle({
      entryDate: nextDraft.entryDate,
      objectLabel: nextDraft.plantName,
      catalogLabel,
      body: nextDraft.body,
      hasPhoto: options.hasPhoto ?? hasPhoto,
    });

    return {
      ...nextDraft,
      title: nextJournalTitleValue({
        currentTitle: nextDraft.title,
        suggestion,
        titleEditedByUser: titleEditedByUserRef.current,
      }),
    };
  }

  function changeCover(next: JournalCoverSelectionState) {
    // A cover photograph of its own is in no block, so leaving it for another
    // choice is the one moment it can be let go of.
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

  return (
    <form
      onSubmit={handleSubmit}
      data-local-composer-kind="first_entry"
      data-local-composer-read-only={persistenceFrozen || undefined}
      className="grid min-w-0 gap-4"
    >
      <LocalJournalComposerStatus
        state={local.state}
        lease={local.media.lease}
        copy={
          local.state.errorCode === "destination_unavailable"
            ? { ...atomicCopy, failed: DESTINATION_COPY[locale].unavailable }
            : atomicCopy
        }
        onCancelPublishing={local.cancelPublishing}
      />
      <UnpublishedWorkGuard
        active={dirty && local.state.status !== "published"}
        copy={atomicCopy}
      />

      <fieldset disabled={persistenceFrozen} className="contents">
        <JournalObjectKindSelector
          locale={locale}
          value={draft.objectKind}
          onChange={updateObjectKind}
        />

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {/*
            The name field is the picker (ADR-0026 D7). A gardener types the
            name of their plant once; the graph offers a species, a form with
            its species implied, or their own name, and typing past all three
            leaves exactly the free-text label it always did. It used to be a
            plain input with the picker collapsed inside "more details", so
            the graph was two steps and a second typing away and most objects
            never reached it.
          */}
          <div className="flex min-w-0 flex-col gap-2">
            <CatalogPicker
              locale={locale}
              objectKind={draft.objectKind}
              copy={copy.composer.catalogPicker}
              label={copy.composer.fields.name}
              placeholder={
                draft.objectKind === "animal"
                  ? copy.composer.fields.animalPlaceholder
                  : copy.composer.fields.plantPlaceholder
              }
              clearLabel={copy.composer.fields.clearCatalogMatch}
              inputName="plantName"
              required
              authIntentControl="create_object"
              query={draft.plantName}
              onQueryChange={(value) => updateDraft("plantName", value)}
              selection={catalogSelection}
              onSelectionChange={updateCatalogSelection}
              onSearchMiss={reportCatalogSearchMiss}
              onPickOutcome={reportCatalogPickOutcome}
              materializeFromCatalogue={materializeCatalogNodeAction}
              disabled={persistenceFrozen}
            />
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-caption">
              {catalogSelection ? null : (
                <span className="max-w-full rounded-md border border-border px-2 py-1 break-words text-text-muted">
                  {copy.composer.fields.noCatalogMatch}
                </span>
              )}
              <button
                type="button"
                onClick={chooseUnknownCatalog}
                data-catalog-continue-unknown="true"
                className="min-h-11 rounded-md border border-border px-2 py-1 font-medium text-text hover:bg-surface-sunken sm:min-h-0"
              >
                {copy.composer.fields.keepWithoutMatch}
              </button>
            </div>
          </div>

          <OwnedDestinationPicker
            locale={locale}
            kind="space"
            disabled={persistenceFrozen}
            selection={
              draft.spaceId
                ? {
                    kind: "space",
                    id: draft.spaceId,
                    displayName: draft.spaceName,
                  }
                : null
            }
            onSelect={(space) => {
              if (space.kind !== "space" || isComposerPersistenceFrozen())
                return;
              setDraft((current) => ({
                ...current,
                spaceId: space.id,
                spaceName: space.displayName,
              }));
            }}
          />
          {/* A new space from inside the editor: the same progressive setup
              as /garden/spaces/new, in `propose` mode. Nothing is written —
              the answers come back here and Publish creates the space and
              the entry together, so the text being written never leaves
              memory (OVE-484, INFORMATION_ARCHITECTURE.md). */}
          <Button
            type="button"
            variant="ghost"
            disabled={persistenceFrozen}
            data-composer-new-space="true"
            onClick={() => setSpaceSetupOpen(true)}
          >
            {copy.composer.fields.createNewSpace}
          </Button>
          <Sheet open={spaceSetupOpen} onOpenChange={setSpaceSetupOpen}>
            <SheetContent
              side="bottom"
              closeLabel={spaceSetupCopy.close}
              className="max-h-svh overflow-y-auto"
            >
              <SheetHeader>
                <SheetTitle>{spaceSetupCopy.title}</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-4">
                <SpaceSetupFlow
                  locale={locale}
                  mode="propose"
                  initial={
                    draft.spaceId
                      ? {}
                      : {
                          displayName: draft.spaceName,
                          locationVisibility: draft.locationVisibility,
                          coarseRegionCode: draft.coarseRegionCode,
                        }
                  }
                  onCancel={() => setSpaceSetupOpen(false)}
                  onPropose={(values) => {
                    if (isComposerPersistenceFrozen()) return;
                    setDraft((current) => ({
                      ...current,
                      spaceId: null,
                      spaceName: values.displayName,
                      locationVisibility: values.locationVisibility,
                      coarseRegionCode:
                        values.locationVisibility === "region"
                          ? values.coarseRegionCode
                          : "",
                    }));
                    setSpaceSetupOpen(false);
                  }}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {!draft.spaceId ? (
          <Field
            label={copy.composer.fields.newSpaceName}
            description={copy.composer.fields.spaceHelp}
            required
            className="min-w-0"
          >
            <Input
              name="spaceName"
              maxLength={120}
              value={draft.spaceName}
              onChange={(event) => updateDraft("spaceName", event.target.value)}
              placeholder={copy.composer.fields.spacePlaceholder}
            />
          </Field>
        ) : (
          <HiddenField name="spaceId" value={draft.spaceId} />
        )}

        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-body-sm font-medium text-text">
              {copy.composer.fields.firstUpdate}
            </span>
          </div>
          <HiddenField name="body" value={draft.body} required />
          <StructuredJournalComposer
            locale={locale}
            labels={labels}
            initialDocument={draft.contentDocument ?? undefined}
            bindingReady
            disabled={persistenceFrozen}
            composerRef={structuredComposerRef}
            imageInsertionMode="immediate"
            imageStates={imageStates}
            coverMediaAssetId={selectedCoverMediaAssetId(
              coverSelection,
              draft.contentDocument ?? createEmptyJournalDocument(),
            )}
            onDocumentChange={(document) => {
              const plain = extractJournalDocumentPlainText(document);
              setDraft((current) => ({
                ...current,
                body: plain || current.body,
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
              changeCover({ mode: "explicit_inline", mediaAssetId })
            }
            onRemoveImageBlock={(_blockId, mediaId) => {
              if (
                coverSelection.mode === "explicit_inline" &&
                coverSelection.mediaAssetId === mediaId
              ) {
                setPendingCoverInlineRemoval({ mediaAssetId: mediaId });
                return;
              }
              void local.removeImage(mediaId);
            }}
          />
          <JournalCoverControls
            copy={coverCopy}
            selection={withLocalCoverPreview(coverSelection, imageStates)}
            eligibleInline={listJournalDocumentImageMediaIds(
              draft.contentDocument ?? createEmptyJournalDocument(),
            ).map((mediaAssetId, index) => ({
              mediaAssetId,
              previewUrl: imageStates.get(mediaAssetId)?.previewUrl ?? null,
              label: journalCoverPhotoLabel(coverCopy, index),
            }))}
            disabled={persistenceFrozen}
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
              if (choice === "cancel") {
                setPendingCoverInlineRemoval(null);
                return;
              }
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
          <JournalMentionTypeaheadPanel
            locale={locale}
            status={mentionStatus}
            suggestions={mentionSuggestions}
            selections={mentionSelections}
            onSelect={selectMentionSuggestion}
            onRemove={removeMentionSelection}
          />
        </div>

        <details className="group min-w-0 border-y border-border py-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-body-sm font-semibold text-text marker:text-text-muted sm:min-h-0">
            {copy.composer.fields.moreDetails}
            <span className="ml-2 font-normal text-text-muted">
              {copy.composer.fields.detailsHint}
            </span>
          </summary>
          <div
            data-composer-details-content
            className="mt-4 grid min-w-0 gap-4"
          >
            {draft.spaceId ? (
              <p className="text-body-sm leading-6 text-text-muted">
                {copy.composer.fields.selectedSpacePrivacy}
              </p>
            ) : (
              <div
                data-composer-details-grid="location"
                className="grid min-w-0 gap-3 sm:grid-cols-2"
              >
                <Field
                  label={copy.composer.fields.location}
                  description={
                    draft.locationVisibility === "region"
                      ? copy.composer.locationHelp.region
                      : copy.composer.locationHelp.hidden
                  }
                  className="min-w-0"
                >
                  <Select
                    name="locationVisibility"
                    value={draft.locationVisibility}
                    onChange={(event) =>
                      updateLocationVisibility(event.target.value)
                    }
                  >
                    <option value="hidden">
                      {copy.composer.fields.hidden}
                    </option>
                    <option value="region">
                      {copy.composer.fields.region}
                    </option>
                  </Select>
                </Field>

                <Field
                  label={copy.composer.fields.coarseRegion}
                  required={draft.locationVisibility === "region"}
                  className="min-w-0"
                >
                  <Select
                    name="coarseRegionCode"
                    disabled={draft.locationVisibility === "hidden"}
                    value={draft.coarseRegionCode}
                    onChange={(event) =>
                      updateDraft("coarseRegionCode", event.target.value)
                    }
                  >
                    <option value="">
                      {copy.composer.fields.chooseRegion}
                    </option>
                    {getLocalizedCoarseRegionOptions(locale).map((region) => (
                      <option key={region.value} value={region.value}>
                        {region.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}

            <div
              data-composer-details-grid="entry-metadata"
              className="grid min-w-0 gap-3 sm:grid-cols-3"
            >
              <Field
                label={copy.composer.fields.entryTitle}
                required
                className="min-w-0 sm:col-span-2"
              >
                <Input
                  name="title"
                  maxLength={140}
                  value={draft.title}
                  onChange={(event) => updateTitle(event.target.value)}
                  placeholder={copy.composer.fields.titlePlaceholder}
                />
              </Field>

              <Field label={copy.composer.fields.date} className="min-w-0">
                <Input
                  type="date"
                  name="entryDate"
                  value={draft.entryDate}
                  onChange={(event) =>
                    updateDraft("entryDate", event.target.value)
                  }
                />
              </Field>
            </div>

            <Field label={copy.composer.fields.tags} className="min-w-0">
              <Input
                name="topicTags"
                maxLength={160}
                value={topicTagInput}
                onChange={(event) => updateTopicTagInput(event.target.value)}
                placeholder={copy.composer.fields.tagsPlaceholder}
              />
            </Field>
          </div>
        </details>

        {requiresFirstPublicationDisclosure ? (
          <LocalJournalPublicationDisclosure
            accepted={disclosureAccepted}
            disabled={persistenceFrozen}
            copy={atomicCopy}
            onChange={setDisclosureAccepted}
          />
        ) : null}
      </fieldset>

      {message ? (
        <p
          role={submitState === "failed" ? "alert" : "status"}
          className={
            submitState === "failed"
              ? "text-body-sm text-danger-text"
              : "text-body-sm text-text-muted"
          }
        >
          {message}
        </p>
      ) : null}

      <JournalMediaReadiness summary={readiness} labels={labels} />

      {/* What Publish does, beside the control that does it (`OVE-458` AC3).
          The product has no drafts: an entry is public and indexable the
          moment it lands, and that belonged next to the decision rather than
          in a notice three sections away. */}
      <p
        data-publish-meaning="true"
        className="max-w-prose text-body-sm text-text-muted"
      >
        {atomicCopy.publishMeaning}
      </p>

      <div className="sticky bottom-2 z-sticky flex items-center gap-2 border border-border bg-surface p-3 shadow-xs sm:static sm:flex-wrap sm:border-0 sm:p-0 sm:shadow-none">
        <Button
          type="submit"
          data-auth-intent-control="save"
          disabled={
            submitState === "publishing" ||
            local.readOnly ||
            (requiresFirstPublicationDisclosure && !disclosureAccepted)
          }
          className="min-h-11 min-w-0 flex-1 sm:min-h-8 sm:flex-none"
        >
          <UploadCloud className="size-4" />
          {atomicCopy.publish}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleCancel}
          className="min-h-11 shrink-0 text-text-muted sm:min-h-8"
        >
          {copy.composer.actions.cancel}
        </Button>
      </div>
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
