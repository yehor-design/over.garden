"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Search, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  createDocumentMutationRequestHeaders,
  useOptionalDocumentMutationGeneration,
} from "@/components/auth/document-mutation-recovery";
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
import { useInterfaceLocaleChangeFormState } from "@/components/site-shell/interface-locale-change-boundary";
import type { PlantObjectKind } from "@/db/schema";
import { useScrollToHashOnMount } from "@/lib/browser/hash-scroll";
import {
  buildGardenCatalogTrustMetadata,
  getGardenWorkspaceCopy,
  type GardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
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
import {
  defaultObjectKindForCatalogSelection,
  objectKindAfterCatalogSelection,
} from "@/lib/garden/catalog-object-kind";
import { COMPOSER_PHOTO_ACCEPT } from "@/lib/garden/composer-photo-selection";
import {
  LocalJournalComposerError,
  useLocalJournalComposer,
} from "@/lib/garden/use-local-journal-composer";
import {
  catalogItemIdForSelection,
  parseCatalogTypeaheadResponse,
  parseCatalogTypeaheadState,
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
import { JournalObjectKindSelector } from "./journal-object-kind-selector";

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
type CatalogStatus =
  | "idle"
  | "searching"
  | "ready"
  | "empty"
  | "degraded"
  | "selected"
  | "saving"
  | "saved"
  | "failed";

type CatalogSuggestion = FirstEntryCatalogSelection;

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
  const atomicCopy = getAtomicJournalCreateCopy(locale);
  const documentMutation = useOptionalDocumentMutationGeneration();
  const localPersistenceEnabled = enableServerPersistence;
  useScrollToHashOnMount("first-entry-composer");
  const router = useRouter();
  const titleEditedByUserRef = useRef(false);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const structuredComposerRef = useRef<StructuredJournalComposerHandle | null>(
    null,
  );
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const localeMutationCountRef = useRef(0);
  const [draft, setDraft] = useState<FirstEntryDraftFields>({
    spaceId: initialSpace?.id ?? null,
    spaceName: initialSpace?.displayName ?? "",
    plantName: "",
    objectKind: initialCatalogItem
      ? defaultObjectKindForCatalogSelection(
          initialCatalogItem.catalogKind,
          initialCatalogItem.source,
        )
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
  const [catalogQuery, setCatalogQuery] = useState(
    initialCatalogItem?.displayName ?? "",
  );
  const [catalogSuggestions, setCatalogSuggestions] = useState<
    CatalogSuggestion[]
  >([]);
  const [selectedCatalogItem, setSelectedCatalogItem] =
    useState<CatalogSuggestion | null>(initialCatalogItem);
  const [userAddedCatalogName, setUserAddedCatalogName] = useState<
    string | null
  >(null);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("idle");
  const [catalogSearchRevision, setCatalogSearchRevision] = useState(0);
  const [activeMentionToken, setActiveMentionToken] =
    useState<ActiveMentionToken | null>(null);
  const [mentionSelections, setMentionSelections] = useState<
    JournalMentionSelection[]
  >([]);
  const [topicTagInput, setTopicTagInput] = useState("");
  const [mentionSuggestions, setMentionSuggestions] = useState<
    JournalMentionSuggestion[]
  >([]);
  const [mentionStatus, setMentionStatus] =
    useState<MentionTypeaheadStatus>("idle");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [primaryMediaAssetId, setPrimaryMediaAssetId] = useState<string | null>(
    null,
  );
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState(atomicCopy.localOnly);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [localeMutationPending, setLocaleMutationPending] = useState(false);
  const local = useLocalJournalComposer({
    documentMutationGeneration: documentMutation?.transport,
    enabled: localPersistenceEnabled,
    fallbackReturnTo: "/garden",
    dirty: Boolean(
      draft.plantName ||
      draft.title ||
      draft.body ||
      draft.contentDocument?.blocks.length ||
      photoFile ||
      catalogQuery,
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
  const persistenceFrozen = local.readOnly;

  useInterfaceLocaleChangeFormState({
    id: "first-entry-composer-mutation",
    dirty: false,
    pending: localeMutationPending,
  });

  function beginLocaleMutation() {
    localeMutationCountRef.current += 1;
    setLocaleMutationPending(true);
  }

  function endLocaleMutation() {
    localeMutationCountRef.current = Math.max(
      0,
      localeMutationCountRef.current - 1,
    );
    if (localeMutationCountRef.current === 0) setLocaleMutationPending(false);
  }

  useEffect(() => {
    const query = catalogQuery.trim();

    if (
      query.length < 2 ||
      (selectedCatalogItem && query === selectedCatalogItem.displayName) ||
      (userAddedCatalogName && query === userAddedCatalogName)
    ) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCatalogStatus("searching");

      try {
        const response = await fetch(
          `/api/garden/catalog/typeahead?q=${encodeURIComponent(query)}&kind=${draft.objectKind}`,
          { signal: controller.signal },
        );

        if (!response.ok) throw new Error("Catalog suggestions unavailable.");

        const body = (await response.json()) as unknown;
        setCatalogSuggestions(parseCatalogTypeaheadResponse(body));
        setCatalogStatus(parseCatalogTypeaheadState(body));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCatalogSuggestions([]);
        setCatalogStatus("failed");
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    catalogQuery,
    catalogSearchRevision,
    draft.objectKind,
    selectedCatalogItem,
    userAddedCatalogName,
  ]);

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
            headers: createDocumentMutationRequestHeaders(
              documentMutation?.transport,
            ),
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

  const photoHelp = localizedAtomicPhotoHelp(atomicCopy, {
    fileName: photoFile?.name ?? null,
    photoError,
    ready: primaryMediaAssetId !== null,
  });
  const catalogAliasCollisionKeys = useMemo(
    () => catalogSuggestionAliasCollisionKeys(catalogSuggestions),
    [catalogSuggestions],
  );
  const selectedCatalogTrust = selectedCatalogItem
    ? buildGardenCatalogTrustMetadata(locale, selectedCatalogItem)
    : null;
  const userAddedCatalogTrust = buildGardenCatalogTrustMetadata(locale, {
    status: "provisional",
    source: "user_added",
    catalogKind: "plant_variety",
    locale: "und",
  });

  const hasSelectedPhoto = Boolean(photoFile || primaryMediaAssetId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isComposerPersistenceFrozen()) return;

    beginLocaleMutation();
    try {
      if (photoError) {
        setSubmitState("failed");
        setMessage(photoError);
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
            catalogItemId: catalogItemIdForSelection(selectedCatalogItem),
            userAddedCatalogName:
              !selectedCatalogItem && userAddedCatalogName
                ? userAddedCatalogName
                : null,
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
        setMessage(atomicCopy.failed);
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
      typeof error.details?.documentMutationAdmission === "string"
    ) {
      documentMutation?.handleTransportResult(
        error.details.documentMutationAdmission as Parameters<
          NonNullable<typeof documentMutation>["handleTransportResult"]
        >[0],
      );
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

  function updateSpaceChoice(value: string) {
    if (isComposerPersistenceFrozen()) return;
    setDraft((current) =>
      value === initialSpace?.id
        ? {
            ...current,
            spaceId: initialSpace.id,
            spaceName: initialSpace.displayName,
          }
        : { ...current, spaceId: null, spaceName: "" },
    );
  }

  function updateObjectKind(value: PlantObjectKind) {
    if (isComposerPersistenceFrozen()) return;
    setDraft((current) => ({ ...current, objectKind: value }));

    if (selectedCatalogItem) {
      setSelectedCatalogItem(null);
      setCatalogQuery("");
    }
    if (userAddedCatalogName) {
      setUserAddedCatalogName(null);
      setCatalogQuery("");
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

  function updateCatalogQuery(value: string) {
    if (isComposerPersistenceFrozen()) return;
    setCatalogQuery(value);

    if (selectedCatalogItem && value !== selectedCatalogItem.displayName) {
      setSelectedCatalogItem(null);
    }

    if (userAddedCatalogName && value !== userAddedCatalogName) {
      setUserAddedCatalogName(null);
    }

    if (value.trim().length < 2) {
      setCatalogSuggestions([]);
      setCatalogStatus("idle");
    }
  }

  function selectCatalogSuggestion(suggestion: CatalogSuggestion) {
    if (isComposerPersistenceFrozen()) return;
    setSelectedCatalogItem(suggestion);
    setUserAddedCatalogName(null);
    setCatalogQuery(suggestion.displayName);
    setDraft((current) =>
      withSuggestedTitle(
        {
          ...current,
          objectKind:
            suggestion.objectKind ??
            objectKindAfterCatalogSelection(
              current.objectKind,
              suggestion.catalogKind,
              suggestion.source,
            ),
        },
        { catalogLabel: suggestion.displayName },
      ),
    );
    setCatalogSuggestions([]);
    setCatalogStatus("selected");
  }

  function addMissingCatalogName() {
    if (isComposerPersistenceFrozen()) return;
    const displayName = catalogQuery.trim().replace(/\s+/g, " ");
    if (displayName.length < 1) return;

    setSelectedCatalogItem(null);
    setUserAddedCatalogName(displayName);
    setCatalogQuery(displayName);
    setDraft((current) =>
      withSuggestedTitle(current, { catalogLabel: displayName }),
    );
    setCatalogSuggestions([]);
    setCatalogStatus("idle");
  }

  function chooseUnknownCatalog() {
    if (isComposerPersistenceFrozen()) return;
    setSelectedCatalogItem(null);
    setUserAddedCatalogName(null);
    setCatalogQuery("");
    setDraft((current) => withSuggestedTitle(current, { catalogLabel: null }));
    setCatalogSuggestions([]);
    setCatalogStatus("idle");
  }

  function retryCatalogSearch() {
    if (isComposerPersistenceFrozen() || catalogQuery.trim().length < 2) return;
    setCatalogSearchRevision((current) => current + 1);
  }

  function handlePhotoChange(file: File | undefined) {
    if (isComposerPersistenceFrozen()) return;
    setPhotoError(null);

    if (!file) {
      clearPhotoSelection(false);
      return;
    }

    try {
      const selected = primaryMediaAssetId
        ? local.replaceImage(primaryMediaAssetId, file)
        : local.selectImage(file, `cover_${crypto.randomUUID()}`);
      setPhotoFile(file);
      setPrimaryMediaAssetId(selected.mediaAssetId);
      setCoverSelection({
        mode: "separate",
        mediaAssetId: selected.mediaAssetId,
        previewUrl: null,
      });
      setDraft((current) => withSuggestedTitle(current, { hasPhoto: true }));
      void selected.ready.catch(() => {
        setPhotoError(atomicCopy.photoFailed);
      });
    } catch {
      setPhotoFile(null);
      setPhotoError(atomicCopy.photoFailed);
      resetPhotoInput();
      setDraft((current) => withSuggestedTitle(current, { hasPhoto: false }));
    }
  }

  function clearPhotoSelection(resetInput = true) {
    if (isComposerPersistenceFrozen()) return;
    if (primaryMediaAssetId) void local.removeImage(primaryMediaAssetId);
    setPhotoFile(null);
    setPrimaryMediaAssetId(null);
    if (
      coverSelection.mode === "separate" &&
      coverSelection.mediaAssetId === primaryMediaAssetId
    ) {
      setCoverSelection({ mode: "automatic" });
    }
    setPhotoError(null);
    if (resetInput) resetPhotoInput();
    setDraft((current) => withSuggestedTitle(current, { hasPhoto: false }));
  }

  function resetPhotoInput() {
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
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
        : (selectedCatalogItem?.displayName ?? userAddedCatalogName);
    const suggestion = suggestJournalEntryTitle({
      entryDate: nextDraft.entryDate,
      objectLabel: nextDraft.plantName,
      catalogLabel,
      body: nextDraft.body,
      hasPhoto: options.hasPhoto ?? Boolean(photoFile || primaryMediaAssetId),
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
    if (
      coverSelection.mode === "separate" &&
      coverSelection.mediaAssetId &&
      (next.mode !== "separate" ||
        next.mediaAssetId !== coverSelection.mediaAssetId)
    ) {
      void local.removeImage(coverSelection.mediaAssetId);
      if (primaryMediaAssetId === coverSelection.mediaAssetId) {
        setPrimaryMediaAssetId(null);
        setPhotoFile(null);
      }
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
        copy={atomicCopy}
        onCancelPublishing={local.cancelPublishing}
      />

      <fieldset disabled={persistenceFrozen} className="contents">
        <JournalObjectKindSelector
          locale={locale}
          value={draft.objectKind}
          onChange={updateObjectKind}
        />

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
            {copy.composer.fields.name}
            <input
              name="plantName"
              data-auth-intent-control="create_object"
              required
              maxLength={120}
              value={draft.plantName}
              onChange={(event) => updateDraft("plantName", event.target.value)}
              className="h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
              placeholder={
                draft.objectKind === "animal"
                  ? copy.composer.fields.animalPlaceholder
                  : copy.composer.fields.plantPlaceholder
              }
            />
          </label>

          {initialSpace ? (
            <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
              {copy.composer.fields.space}
              <select
                name="spaceChoice"
                value={draft.spaceId ?? "new"}
                onChange={(event) => updateSpaceChoice(event.target.value)}
                className="h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
              >
                <option value={initialSpace.id}>
                  {initialSpace.displayName}
                </option>
                <option value="new">
                  {copy.composer.fields.createNewSpace}
                </option>
              </select>
            </label>
          ) : null}
        </div>

        {!draft.spaceId ? (
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
            {copy.composer.fields.newSpaceName}
            <input
              name="spaceName"
              required
              maxLength={120}
              value={draft.spaceName}
              onChange={(event) => updateDraft("spaceName", event.target.value)}
              className="h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
              placeholder={copy.composer.fields.spacePlaceholder}
            />
            <span className="text-xs leading-5 font-normal text-muted-foreground">
              {copy.composer.fields.spaceHelp}
            </span>
          </label>
        ) : (
          <input type="hidden" name="spaceId" value={draft.spaceId} />
        )}

        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              {copy.composer.fields.firstUpdate}
            </span>
          </div>
          <input type="hidden" name="body" value={draft.body} required />
          <StructuredJournalComposer
            locale={locale}
            labels={getStructuredJournalComposerLabels(locale)}
            initialDocument={draft.contentDocument ?? undefined}
            bindingReady
            disabled={persistenceFrozen}
            composerRef={structuredComposerRef}
            imageInsertionMode="immediate"
            imageStates={imageStates}
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
              label: `${coverCopy.useAsCover} ${index + 1}`,
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

        <div className="flex flex-col gap-2 border-y border-border py-3">
          <span className="text-sm font-medium text-foreground">
            {copy.composer.fields.optionalPhoto}
          </span>
          <input
            ref={photoInputRef}
            type="file"
            accept={COMPOSER_PHOTO_ACCEPT}
            capture="environment"
            aria-label={copy.composer.photo.choose}
            onChange={(event) =>
              handlePhotoChange(event.currentTarget.files?.[0])
            }
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            className="self-start"
            data-photo-picker-control="true"
            onClick={() => photoInputRef.current?.click()}
          >
            <UploadCloud className="size-4" />
            {copy.composer.photo.choose}
          </Button>
          {hasSelectedPhoto ? (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => clearPhotoSelection()}
            >
              <X className="size-4" />
              {copy.composer.fields.removePhoto}
            </Button>
          ) : null}
          <p
            className={
              photoError
                ? "text-xs leading-5 text-destructive"
                : "text-xs leading-5 text-muted-foreground"
            }
          >
            {photoHelp}
          </p>
        </div>

        <details className="group min-w-0 border-y border-border py-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-foreground marker:text-muted-foreground sm:min-h-0">
            {copy.composer.fields.moreDetails}
            <span className="ml-2 font-normal text-muted-foreground">
              {copy.composer.fields.detailsHint}
            </span>
          </summary>
          <div
            data-composer-details-content
            className="mt-4 grid min-w-0 gap-4"
          >
            {draft.spaceId ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {copy.composer.fields.selectedSpacePrivacy}
              </p>
            ) : (
              <div
                data-composer-details-grid="location"
                className="grid min-w-0 gap-3 sm:grid-cols-2"
              >
                <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
                  {copy.composer.fields.location}
                  <select
                    name="locationVisibility"
                    value={draft.locationVisibility}
                    onChange={(event) =>
                      updateLocationVisibility(event.target.value)
                    }
                    className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
                  >
                    <option value="hidden">
                      {copy.composer.fields.hidden}
                    </option>
                    <option value="region">
                      {copy.composer.fields.region}
                    </option>
                  </select>
                  <span className="text-xs leading-5 font-normal text-muted-foreground">
                    {draft.locationVisibility === "region"
                      ? copy.composer.locationHelp.region
                      : copy.composer.locationHelp.hidden}
                  </span>
                </label>

                <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
                  {copy.composer.fields.coarseRegion}
                  <select
                    name="coarseRegionCode"
                    required={draft.locationVisibility === "region"}
                    disabled={draft.locationVisibility === "hidden"}
                    value={draft.coarseRegionCode}
                    onChange={(event) =>
                      updateDraft("coarseRegionCode", event.target.value)
                    }
                    className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 sm:h-10"
                  >
                    <option value="">
                      {copy.composer.fields.chooseRegion}
                    </option>
                    {getLocalizedCoarseRegionOptions(locale).map((region) => (
                      <option key={region.value} value={region.value}>
                        {region.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div className="flex min-w-0 flex-col gap-2">
              <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
                {copy.composer.fields.catalogMatch}
                <span className="relative block min-w-0">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    name="catalogQuery"
                    maxLength={120}
                    value={catalogQuery}
                    onChange={(event) => updateCatalogQuery(event.target.value)}
                    className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-9 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
                    placeholder={copy.composer.fields.catalogPlaceholder}
                    autoComplete="off"
                  />
                  {catalogQuery ? (
                    <button
                      type="button"
                      onClick={chooseUnknownCatalog}
                      className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={copy.composer.fields.clearCatalogMatch}
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </span>
              </label>

              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                {selectedCatalogItem ? (
                  <span
                    className="inline-flex max-w-full flex-col gap-0.5 rounded-md border border-border px-2 py-1 text-foreground"
                    data-catalog-serve-class={selectedCatalogItem.serveClass}
                  >
                    <span>
                      {copy.composer.fields.matchedInCatalog}{" "}
                      {selectedCatalogItem.displayName} ·{" "}
                      {selectedCatalogTrust?.trustLabel} ·{" "}
                      {localizedCatalogKindLabel(
                        selectedCatalogItem.catalogKind,
                        draft.objectKind,
                        copy,
                        selectedCatalogItem.source,
                      )}{" "}
                      · {localizedObjectKindLabel(draft.objectKind, copy)}
                    </span>
                    <span className="text-muted-foreground">
                      {selectedCatalogTrust?.disambiguationLabel} ·{" "}
                      {selectedCatalogTrust?.sourceCaveat}
                    </span>
                  </span>
                ) : userAddedCatalogName ? (
                  <span className="inline-flex max-w-full flex-col gap-0.5 rounded-md border border-border px-2 py-1 text-foreground">
                    <span>
                      {copy.composer.fields.savedWithCatalogName}{" "}
                      {userAddedCatalogName} ·{" "}
                      {userAddedCatalogTrust.trustLabel}
                    </span>
                    <span className="text-muted-foreground">
                      {userAddedCatalogTrust.sourceCaveat}
                    </span>
                  </span>
                ) : (
                  <span className="max-w-full rounded-md border border-border px-2 py-1 break-words text-muted-foreground">
                    {copy.composer.fields.noCatalogMatch}
                  </span>
                )}
                <button
                  type="button"
                  onClick={chooseUnknownCatalog}
                  className="min-h-11 rounded-md border border-border px-2 py-1 font-medium text-foreground hover:bg-muted sm:min-h-0"
                >
                  {copy.composer.fields.keepWithoutMatch}
                </button>
                {!selectedCatalogItem && catalogQuery.trim().length >= 2 ? (
                  <button
                    type="button"
                    onClick={addMissingCatalogName}
                    className="min-h-11 rounded-md border border-border px-2 py-1 font-medium text-foreground hover:bg-muted sm:min-h-0"
                  >
                    {copy.composer.fields.useThisName}
                  </button>
                ) : null}
                {catalogStatus === "degraded" || catalogStatus === "failed" ? (
                  <button
                    type="button"
                    onClick={retryCatalogSearch}
                    data-catalog-retry="true"
                    className="min-h-11 rounded-md border border-border px-2 py-1 font-medium text-foreground hover:bg-muted sm:min-h-0"
                  >
                    {copy.composer.fields.retrySearch}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={chooseUnknownCatalog}
                  data-catalog-continue-unknown="true"
                  className="min-h-11 rounded-md border border-border px-2 py-1 font-medium text-foreground hover:bg-muted sm:min-h-0"
                >
                  {copy.composer.fields.continueWithUnknown}
                </button>
                <span
                  aria-live="polite"
                  data-catalog-status={catalogStatus}
                  className={
                    catalogStatus === "failed"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }
                >
                  {catalogStatus === "searching"
                    ? copy.composer.fields.searching
                    : catalogStatus === "degraded" || catalogStatus === "failed"
                      ? copy.composer.fields.suggestionsUnavailable
                      : ""}
                </span>
              </div>

              {catalogSuggestions.length > 0 ? (
                <ul className="grid gap-2" aria-live="polite">
                  {catalogSuggestions.map((suggestion) => {
                    const trust = buildGardenCatalogTrustMetadata(
                      locale,
                      suggestion,
                    );
                    const hasAliasCollision = catalogAliasCollisionKeys.has(
                      catalogSuggestionAliasCollisionKey(suggestion),
                    );

                    return (
                      <li key={suggestion.id}>
                        <button
                          type="button"
                          onClick={() => selectCatalogSuggestion(suggestion)}
                          data-catalog-serve-class={suggestion.serveClass}
                          className="flex min-h-11 w-full items-start justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground">
                              {suggestion.displayName}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {suggestion.canonicalName} ·{" "}
                              {trust.disambiguationLabel}
                            </span>
                            {hasAliasCollision ? (
                              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                {copy.composer.fields.aliasCollision}
                              </span>
                            ) : null}
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              {trust.sourceCaveat}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                            {trust.trustLabel}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>

            <div
              data-composer-details-grid="entry-metadata"
              className="grid min-w-0 gap-3 sm:grid-cols-3"
            >
              <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground sm:col-span-2">
                {copy.composer.fields.entryTitle}
                <input
                  name="title"
                  required
                  maxLength={140}
                  value={draft.title}
                  onChange={(event) => updateTitle(event.target.value)}
                  className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
                  placeholder={copy.composer.fields.titlePlaceholder}
                />
              </label>

              <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
                {copy.composer.fields.date}
                <input
                  type="date"
                  name="entryDate"
                  value={draft.entryDate}
                  onChange={(event) =>
                    updateDraft("entryDate", event.target.value)
                  }
                  className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
                />
              </label>
            </div>

            <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
              {copy.composer.fields.tags}
              <input
                name="topicTags"
                maxLength={160}
                value={topicTagInput}
                onChange={(event) => updateTopicTagInput(event.target.value)}
                className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
                placeholder={copy.composer.fields.tagsPlaceholder}
              />
            </label>
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

      <p
        className={
          submitState === "failed"
            ? "text-sm text-destructive"
            : "text-sm text-muted-foreground"
        }
      >
        {message}
      </p>

      <div className="sticky bottom-2 z-10 flex items-center gap-2 border border-border bg-background p-3 shadow-sm sm:static sm:flex-wrap sm:border-0 sm:p-0 sm:shadow-none">
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
          className="min-h-11 shrink-0 text-muted-foreground sm:min-h-8"
        >
          {copy.composer.actions.cancel}
        </Button>
      </div>
    </form>
  );
}

function localizedAtomicPhotoHelp(
  copy: ReturnType<typeof getAtomicJournalCreateCopy>,
  {
    fileName,
    photoError,
    ready,
  }: {
    fileName: string | null;
    photoError: string | null;
    ready: boolean;
  },
) {
  if (photoError) return photoError;
  if (ready) return copy.photoReady;
  if (!fileName) return copy.photoEmpty;
  return copy.photoPreparing;
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

function localizedObjectKindLabel(
  value: PlantObjectKind,
  copy: GardenWorkspaceCopy,
) {
  if (value === "animal") return copy.composer.objectKind.animal.label;
  return copy.composer.objectKind.plant.label;
}

function localizedCatalogKindLabel(
  value: string | null | undefined,
  objectKind: PlantObjectKind,
  copy: GardenWorkspaceCopy,
  catalogSource?: string | null,
) {
  if (value === "breed") {
    if (catalogSource === "ua_official_bee_breed") {
      return copy.composer.catalogKinds.beeBreed;
    }
    if (
      objectKind === "animal" ||
      catalogSource === "vertebrate_breed_ontology"
    ) {
      return copy.composer.catalogKinds.animalBreed;
    }
    return copy.composer.catalogKinds.breed;
  }
  if (value === "species") return copy.composer.catalogKinds.species;
  if (value === "plant_variety") return copy.composer.catalogKinds.plantVariety;
  return copy.composer.catalogKinds.match;
}

function catalogSuggestionAliasCollisionKeys(suggestions: CatalogSuggestion[]) {
  const counts = new Map<string, number>();

  for (const suggestion of suggestions) {
    const key = catalogSuggestionAliasCollisionKey(suggestion);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return new Set(
    [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key),
  );
}

function catalogSuggestionAliasCollisionKey(suggestion: CatalogSuggestion) {
  return suggestion.displayName.trim().replace(/\s+/g, " ").toLowerCase();
}
