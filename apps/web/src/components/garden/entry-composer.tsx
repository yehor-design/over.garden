"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { CloudArrowUpIcon as UploadCloud } from "@/components/icons/CloudArrowUp";
import { GlobeIcon as Globe } from "@/components/icons/Globe";
import { XIcon as X } from "@/components/icons/X";

import { useOptionalOwnerScope } from "@/components/auth/owner-scope";
import {
  journalCoverPhotoLabel,
  JournalCoverControls,
  type JournalCoverSelectionState,
} from "@/components/garden/journal-cover-controls";
import {
  JournalMediaReadiness,
  journalMediaReadinessText,
  summarizeJournalMediaReadiness,
} from "@/components/garden/journal-media-readiness";
import {
  LocalJournalComposerStatus,
  LocalJournalPublicationDisclosure,
} from "@/components/garden/local-journal-composer-status";
import { OwnedDestinationPicker } from "@/components/garden/owned-destination-picker";
import { StructuredJournalComposer } from "@/components/garden/structured-journal-composer";
import type { StructuredJournalComposerHandle } from "@/components/garden/structured-journal-composer";
import {
  isComposerEscape,
  stepsBackToLeave,
  UnpublishedWorkGuard,
} from "@/components/garden/unpublished-work-guard";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { HiddenField } from "@/components/ui/hidden-field";
import { Input } from "@/components/ui/input";
import { Link } from "@/components/ui/link";
import { ownerScopeHeaders } from "@/lib/auth/session-signal";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import { getAtomicJournalCreateCopy } from "@/lib/garden/atomic-journal-create-copy";
import { getJournalCoverControlsCopy } from "@/lib/garden/journal-cover-controls-copy";
import {
  createEmptyJournalDocument,
  extractJournalDocumentPlainText,
  listJournalDocumentImageMediaIds,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import {
  nextJournalTitleValue,
  suggestJournalEntryTitle,
} from "@/lib/garden/journal-title-prefill";
import { normalizeJournalTopicTagLabels } from "@/lib/garden/journal-topics";
import {
  DESTINATION_COPY,
  destinationDetail,
  type OwnedDestination,
  type OwnedDestinationPage,
} from "@/lib/garden/owned-destinations";
import {
  LocalJournalComposerError,
  useLocalJournalComposer,
} from "@/lib/garden/use-local-journal-composer";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import {
  getEntryComposerCopy,
  localCalendarDate,
} from "@/lib/entry-composer-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";

type SubmitState = "idle" | "publishing" | "published" | "failed";

interface EntryDraftFields {
  title: string;
  body: string;
  contentDocument: JournalDocumentV1 | null;
  entryDate: string;
}

/** One of a space's own objects, which a space entry must mention. */
export interface SpaceObjectOption {
  id: string;
  displayName: string;
}

export interface EntryComposerProps {
  locale: InterfaceLocale;
  /** The destination a contextual launch names; null opens the picker. */
  initialDestination: OwnedDestination | null;
  /** The server's date, replaced by the reader's own local date on mount. */
  today: string;
  requiresFirstPublicationDisclosure: boolean;
  /** Objects of the initial space, when the page has them already. */
  initialSpaceObjects?: readonly SpaceObjectOption[];
  /** Where Close returns to: the page the composer was opened from. */
  closeHref?: string | null;
  /**
   * The community this entry is written for (`OVE-500`), when the composer
   * was opened from one. It names the community, keeps the choice to a plant
   * or an animal — the only entries a community takes — and after Publish
   * returns to the community with the new entry offered first. It never adds
   * the entry anywhere by itself: that is the member's own press there.
   */
  community?: EntryComposerCommunity | null;
  /** False only for deterministic visual fixtures, which must not write. */
  enableServerPersistence?: boolean;
}

export interface EntryComposerCommunity {
  name: string;
  /** The community's own address in the reader's language. */
  returnPath: string;
  /** Open for new entries right now. */
  accepting: boolean;
  /** An active member already; otherwise the community asks them to join. */
  member: boolean;
  /** Not accepting because a moderator restricted this writer, not the community. */
  banned?: boolean;
}

/** Where a community writer lands after Publish: the step, the entry first. */
export function communityContributeHref(returnPath: string, entryId: string) {
  const [path] = returnPath.split(/[?#]/u);
  const query = new URLSearchParams({ contribute: entryId });
  return `${path}?${query.toString()}#community-contribute`;
}

/**
 * The one entry composer (`OVE-486`). Every "New entry" opens it — the global
 * Write at `/garden/new`, an object's page, a space's journal — and it writes
 * to an existing space or object.
 *
 * - **Where** is visible first and changeable at any time. A contextual launch
 *   names the destination; a global one opens the owned-destination picker at
 *   once, and a pick moves focus straight into the text — no Continue step.
 * - **Nothing typed is lost by changing where.** The text, the date, the
 *   title and every photo live above the destination, so switching from one
 *   tomato to the other, or from an object to its space, keeps all of it.
 * - **The date is the reader's own.** The server's date is a UTC day, which is
 *   yesterday in Kyiv and Sofia until two or three in the morning; on mount
 *   the untouched date becomes the local calendar date.
 * - **A space entry mentions its objects.** The server requires one to twelve
 *   of the space's own objects, so the composer asks for them, and a space
 *   with none says so and offers to add one instead of failing on Publish.
 * - **An ended session keeps the text.** A publish refused for a stale
 *   session no longer navigates away; the reader signs in in another tab and
 *   presses Publish again.
 *
 * Nothing is durable before an acknowledged Publish (ADR-0022 rule 3): no
 * draft, no autosave, no offline queue.
 */
export function EntryComposer({
  locale,
  initialDestination,
  today,
  requiresFirstPublicationDisclosure,
  initialSpaceObjects,
  closeHref = null,
  community = null,
  enableServerPersistence = true,
}: EntryComposerProps) {
  const workspaceCopy = getGardenWorkspaceCopy(locale);
  const atomicCopy = getAtomicJournalCreateCopy(locale);
  const copy = getEntryComposerCopy(locale);
  const coverCopy = getJournalCoverControlsCopy(locale);
  const documentMutation = useOptionalOwnerScope();
  const router = useRouter();
  const titleEditedByUserRef = useRef(false);
  const dateEditedByUserRef = useRef(false);
  const structuredComposerRef = useRef<StructuredJournalComposerHandle | null>(
    null,
  );
  const closeRequestRef = useRef<((leave: () => void) => void) | null>(null);
  // A community takes entries about one plant or animal, so a space named by
  // the address is not a destination here; the picker offers objects only.
  const forCommunity = community?.accepting === true;
  const startingDestination =
    forCommunity && initialDestination?.kind === "space"
      ? null
      : initialDestination;
  const [destination, setDestination] = useState<OwnedDestination | null>(
    startingDestination,
  );
  const [choosing, setChoosing] = useState(startingDestination === null);
  const [draft, setDraft] = useState<EntryDraftFields>({
    title: "",
    body: "",
    contentDocument: null,
    entryDate: today,
  });
  const [mentionedObjectIds, setMentionedObjectIds] = useState<string[]>([]);
  const [topicTagInput, setTopicTagInput] = useState("");
  const [coverSelection, setCoverSelection] =
    useState<JournalCoverSelectionState>({ mode: "automatic" });
  const [pendingCoverInlineRemoval, setPendingCoverInlineRemoval] = useState<{
    mediaAssetId: string;
  } | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState(atomicCopy.localOnly);
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [authRecoveryUrl, setAuthRecoveryUrl] = useState<string | null>(null);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [titleEdited, setTitleEdited] = useState(false);
  const labels = getStructuredJournalComposerLabels(locale);
  const storyImageIds = listJournalDocumentImageMediaIds(
    draft.contentDocument ?? createEmptyJournalDocument(),
  );
  const separateCoverId =
    coverSelection.mode === "separate"
      ? (coverSelection.mediaAssetId ?? null)
      : null;
  const hasPhoto = storyImageIds.length > 0 || separateCoverId !== null;
  // A suggested title is not the reader's work; only what they wrote is.
  const dirty = Boolean(
    (titleEdited && draft.title) ||
    draft.body ||
    draft.contentDocument?.blocks.length ||
    separateCoverId,
  );
  const local = useLocalJournalComposer({
    enabled: enableServerPersistence,
    fallbackReturnTo: closeHref ?? "/garden",
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

  // The reader's own calendar date, once, unless they have already chosen one.
  useEffect(() => {
    if (dateEditedByUserRef.current) return;
    const localToday = localCalendarDate();
    setDraft((current) =>
      current.entryDate === localToday
        ? current
        : { ...current, entryDate: localToday },
    );
  }, []);

  // Every photograph Publish will send: the story's, then a cover of its own.
  const readiness = summarizeJournalMediaReadiness(
    separateCoverId && !storyImageIds.includes(separateCoverId)
      ? [...storyImageIds, separateCoverId]
      : storyImageIds,
    imageStates,
  );

  function chooseDestination(next: OwnedDestination) {
    if (persistenceFrozen) return;
    // Another space's objects are not this space's; a mention list carries
    // over only while the space stays the same.
    if (
      !destination ||
      destination.kind !== "space" ||
      next.kind !== "space" ||
      destination.id !== next.id
    ) {
      setMentionedObjectIds([]);
    }
    setDestination(next);
    setChoosing(false);
    setDestinationError(null);
    setDraft((current) => withSuggestedTitle(current, { destination: next }));
    // A pick is the whole question: the next keystroke is the entry.
    requestAnimationFrame(() => structuredComposerRef.current?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // A form rendered in a portal inside this one (a sheet, a dialog) bubbles
    // its submit here through React; only this form's own submit publishes.
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    if (persistenceFrozen) return;
    setAuthRecoveryUrl(null);

    if (!destination) {
      setChoosing(true);
      setDestinationError(copy.chooseFirst);
      return;
    }
    if (destination.kind === "space" && mentionedObjectIds.length === 0) {
      setDestinationError(copy.spaceMentions.required);
      return;
    }
    // A photograph that failed is retried or removed before anything is sent:
    // Publish would otherwise wait on it and then fail as a whole.
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
      setMessage(workspaceCopy.composer.photo.readError);
      return;
    }
    const body = extractJournalDocumentPlainText(document);
    if (
      !body.trim() &&
      listJournalDocumentImageMediaIds(document).length === 0
    ) {
      setSubmitState("failed");
      setMessage(workspaceCopy.composer.messages.genericSaveError);
      return;
    }
    // The server requires a title; the suggestion stands in for one the
    // reader did not write, as it always has.
    const title =
      draft.title.trim() ||
      suggestJournalEntryTitle({
        entryDate: draft.entryDate,
        objectLabel: destination.displayName,
        body,
        hasPhoto,
      });
    if (!enableServerPersistence) {
      setMessage(workspaceCopy.composer.messages.visualDraftSaved);
      return;
    }

    setSubmitState("publishing");
    setMessage(atomicCopy.publishing);
    try {
      const topicTags = normalizeJournalTopicTagLabels(topicTagInput);
      const result = await local.publish({
        context:
          destination.kind === "object"
            ? {
                target: "plant_object_entry",
                plantObjectId: destination.id,
                entryDate: draft.entryDate,
                topicTags,
              }
            : {
                target: "space_entry",
                spaceId: destination.id,
                mentionedPlantObjectIds: mentionedObjectIds,
                entryDate: draft.entryDate,
                topicTags,
              },
        title,
        document,
        coverMediaAssetId: selectedCoverMediaAssetId(coverSelection, document),
        disclosureAccepted,
        returnTo:
          destination.kind === "object"
            ? `/garden/objects/${encodeURIComponent(destination.id)}`
            : `/garden/spaces/${encodeURIComponent(destination.id)}#space-history`,
      });
      setSubmitState("published");
      setMessage(atomicCopy.published);
      if (forCommunity && community) {
        // A document navigation: the community is a static public page whose
        // step reads `contribute` at request time, and a client navigation
        // could be answered from the prefetched shell (`public-query-twin.ts`).
        window.location.assign(
          communityContributeHref(community.returnPath, result.entryId),
        );
        return;
      }
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
  }

  function handleTransportBoundary(error: unknown) {
    if (
      error instanceof LocalJournalComposerError &&
      typeof error.details?.mutationScope === "string"
    ) {
      documentMutation?.handleActionResult(error.details);
    }
    // Leaving would take the text with it. The reader signs in in another
    // tab and publishes again from here (OVE-486 criterion 7).
    if (
      error instanceof LocalJournalComposerError &&
      error.details?.authIntentUrl
    ) {
      setAuthRecoveryUrl(error.details.authIntentUrl);
    } else if (
      error instanceof LocalJournalComposerError &&
      error.details?.mutationScope === "session_required"
    ) {
      setAuthRecoveryUrl(
        buildSignInHref({
          returnTo: `${window.location.pathname}${window.location.search}`,
          // The words stay in this tab; the one that opens says so and
          // does not open an empty composer beside them (`OVE-504`).
          notice: "return-to-tab",
        }),
      );
    }
  }

  // Close asks first when there is something to lose, and not otherwise:
  // the same dialog as a link out, Back and Escape (`OVE-488`).
  function handleClose() {
    const leave = () => {
      local.abandon();
      if (closeHref) router.push(closeHref);
      else window.history.go(stepsBackToLeave());
    };
    if (closeRequestRef.current) closeRequestRef.current(leave);
    else leave();
  }

  async function buildDocument(): Promise<JournalDocumentV1> {
    return (
      (await structuredComposerRef.current?.flushLatest()) ??
      draft.contentDocument ??
      createEmptyJournalDocument()
    );
  }

  function updateDate(value: string) {
    if (persistenceFrozen) return;
    dateEditedByUserRef.current = true;
    setDraft((current) => withSuggestedTitle({ ...current, entryDate: value }));
  }

  function updateTitle(value: string) {
    if (persistenceFrozen) return;
    titleEditedByUserRef.current = true;
    setTitleEdited(true);
    setDraft((current) => ({ ...current, title: value }));
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

  function withSuggestedTitle(
    nextDraft: EntryDraftFields,
    options: { hasPhoto?: boolean; destination?: OwnedDestination } = {},
  ): EntryDraftFields {
    const target = options.destination ?? destination;
    const suggestion = suggestJournalEntryTitle({
      entryDate: nextDraft.entryDate,
      objectLabel: target?.displayName ?? "",
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

  const publishBlocked =
    submitState === "publishing" ||
    persistenceFrozen ||
    (requiresFirstPublicationDisclosure && !disclosureAccepted);

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (!isComposerEscape(event)) return;
        event.preventDefault();
        handleClose();
      }}
      data-entry-composer="true"
      data-local-composer-kind={
        destination?.kind === "space" ? "space_entry" : "follow_up"
      }
      data-local-composer-read-only={persistenceFrozen || undefined}
      className="grid gap-4"
    >
      <LocalJournalComposerStatus
        state={local.state}
        lease={local.media.lease}
        copy={atomicCopy}
        onCancelPublishing={local.cancelPublishing}
      />
      <UnpublishedWorkGuard
        active={dirty && local.state.status !== "published"}
        closeRequestRef={closeRequestRef}
        copy={atomicCopy}
      />

      {community ? (
        <Callout
          tone={community.accepting ? "info" : "warning"}
          title={
            community.accepting
              ? copy.community.title(community.name)
              : undefined
          }
          data-entry-composer-community={
            community.accepting ? "accepting" : "closed"
          }
        >
          {community.accepting ? (
            <>
              <p>{copy.community.body}</p>
              {community.member ? null : <p>{copy.community.notMember}</p>}
            </>
          ) : (
            <p>
              {community.banned
                ? copy.community.banned(community.name)
                : copy.community.closed(community.name)}
            </p>
          )}
        </Callout>
      ) : null}

      <fieldset disabled={persistenceFrozen} className="contents">
        {/* Where, when and who can see it: visible before anything else. */}
        <div
          data-entry-composer-destination="true"
          className="grid gap-3 rounded-lg border border-border p-3 sm:p-4"
        >
          {destination && !choosing ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-body-sm">
                <span className="text-text-muted">{copy.writingTo}</span>{" "}
                <span
                  className="font-medium break-words text-text-heading"
                  data-entry-composer-destination-name="true"
                >
                  {destination.displayName}
                </span>
                <span className="text-text-muted">
                  {" · "}
                  {destinationDetail(destination, locale)}
                </span>
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setChoosing(true)}
                aria-label={`${copy.change}: ${destination.displayName}`}
                data-entry-composer-change="true"
              >
                {copy.change}
              </Button>
            </div>
          ) : (
            <div className="grid gap-2">
              <OwnedDestinationPicker
                locale={locale}
                selection={destination}
                onSelect={chooseDestination}
                kind={forCommunity ? "object" : "all"}
                autoFocus={startingDestination === null || choosing}
              />
              {destination ? (
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setChoosing(false)}
                  >
                    {copy.keep}: {destination.displayName}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <Field
              label={copy.date}
              description={copy.dateHelp}
              className="min-w-0"
            >
              <Input
                type="date"
                name="entryDate"
                value={draft.entryDate}
                onChange={(event) => updateDate(event.target.value)}
                data-entry-composer-date="true"
              />
            </Field>
            <Badge tone="neutral" data-entry-composer-visibility="public">
              <Globe aria-hidden="true" />
              {copy.publicBadge}
            </Badge>
          </div>
          {destinationError ? (
            <p
              role="alert"
              data-entry-composer-error="destination"
              className="text-body-sm text-danger-text"
            >
              {destinationError}
            </p>
          ) : null}
        </div>

        {destination?.kind === "space" ? (
          <SpaceMentionChecklist
            key={destination.id}
            locale={locale}
            spaceId={destination.id}
            initialObjects={
              initialDestination?.kind === "space" &&
              initialDestination.id === destination.id
                ? initialSpaceObjects
                : undefined
            }
            selected={mentionedObjectIds}
            onChange={(next) => {
              setMentionedObjectIds(next);
              if (next.length > 0) setDestinationError(null);
            }}
          />
        ) : null}

        <div className="flex flex-col gap-1">
          <span className="text-body-sm font-medium text-text">
            {destination?.kind === "space"
              ? copy.whatHappened.space
              : copy.whatHappened.object}
          </span>
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
              setDraft((current) =>
                withSuggestedTitle(
                  {
                    ...current,
                    body: plain || current.body,
                    contentDocument: document,
                  },
                  {
                    hasPhoto:
                      listJournalDocumentImageMediaIds(document).length > 0 ||
                      separateCoverId !== null,
                  },
                ),
              );
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
        </div>

        <details className="group border-y border-border py-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-h4 text-text sm:min-h-0">
            {workspaceCopy.composer.fields.moreDetails}
          </summary>
          <div className="mt-4 grid gap-4">
            <Field label={workspaceCopy.composer.fields.entryTitle}>
              <Input
                name="title"
                maxLength={140}
                value={draft.title}
                onChange={(event) => updateTitle(event.target.value)}
                placeholder={workspaceCopy.composer.fields.titlePlaceholder}
              />
            </Field>
            <Field label={workspaceCopy.composer.fields.tags}>
              <Input
                name="topicTags"
                maxLength={160}
                value={topicTagInput}
                onChange={(event) => setTopicTagInput(event.target.value)}
                placeholder={workspaceCopy.composer.fields.tagsPlaceholder}
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

      {authRecoveryUrl ? (
        <Callout
          tone="warning"
          live="assertive"
          data-entry-composer-session="ended"
          actions={
            <a
              href={authRecoveryUrl}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ size: "sm" })}
            >
              {copy.signInNewTab}
            </a>
          }
        >
          <p>{copy.sessionEnded}</p>
        </Callout>
      ) : null}

      <p
        data-entry-composer-message="true"
        className={
          submitState === "failed"
            ? "text-body-sm text-danger-text"
            : "text-body-sm text-text-muted"
        }
      >
        {message}
      </p>

      <JournalMediaReadiness summary={readiness} labels={labels} />

      {/* What Publish does, beside the control that does it (`OVE-458` AC3). */}
      <p
        data-publish-meaning="true"
        className="max-w-prose text-body-sm text-text-muted"
      >
        {atomicCopy.publishMeaning}
      </p>

      <div className="sticky above-bottom-chrome-gap z-sticky flex items-center gap-2 border border-border bg-surface p-3 shadow-xs sm:static sm:flex-wrap sm:border-0 sm:p-0 sm:shadow-none">
        <Button
          type="submit"
          data-auth-intent-control="save"
          data-entry-composer-publish="true"
          disabled={publishBlocked}
          className="min-h-11 min-w-0 flex-1 sm:min-h-8 sm:flex-none"
        >
          <UploadCloud className="size-4" />
          {atomicCopy.publish}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleClose}
          className="min-h-11 shrink-0 text-text-muted sm:min-h-8"
        >
          {workspaceCopy.composer.actions.cancel}
        </Button>
      </div>
    </form>
  );
}

/**
 * The objects a space entry mentions. A space with many objects is searched
 * rather than listed whole; the ticks survive a search (OVE-486 criterion 4).
 */
function SpaceMentionChecklist({
  locale,
  spaceId,
  initialObjects,
  selected,
  onChange,
}: {
  locale: InterfaceLocale;
  spaceId: string;
  initialObjects?: readonly SpaceObjectOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const copy = getEntryComposerCopy(locale).spaceMentions;
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    initialObjects ? "ready" : "loading",
  );
  const [objects, setObjects] = useState<readonly SpaceObjectOption[]>(
    initialObjects ?? [],
  );
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (initialObjects ?? []).map((o) => [o.id, o.displayName]),
    ),
  );
  const [attempt, setAttempt] = useState(0);
  const [hadAny, setHadAny] = useState<boolean | null>(
    initialObjects ? initialObjects.length > 0 : null,
  );

  useEffect(() => {
    if (initialObjects && !query && attempt === 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        setStatus("loading");
        try {
          const params = new URLSearchParams({ space: spaceId, q: query });
          const response = await fetch(`/api/garden/destinations?${params}`, {
            signal: controller.signal,
            headers: ownerScopeHeaders(),
            cache: "no-store",
          });
          if (!response.ok) throw new Error("unavailable");
          const page = (await response.json()) as OwnedDestinationPage;
          const rows = page.items
            .filter((item) => item.kind === "object")
            .map((item) => ({ id: item.id, displayName: item.displayName }));
          setObjects(rows);
          setNames((current) => ({
            ...current,
            ...Object.fromEntries(rows.map((row) => [row.id, row.displayName])),
          }));
          if (!query) setHadAny(rows.length > 0);
          setStatus("ready");
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setStatus("error");
        }
      },
      query ? 180 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [spaceId, query, attempt, initialObjects]);

  if (hadAny === false && !query) {
    return (
      <Callout tone="info" data-entry-composer-space-empty="true">
        <p>{copy.none}</p>
        <p className="mt-2">
          <Link
            href={`/garden/objects/new?space=${encodeURIComponent(spaceId)}`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {copy.addObject}
          </Link>
        </p>
      </Callout>
    );
  }

  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((value) => value !== id)
        : selected.length >= 12
          ? [...selected]
          : [...selected, id],
    );

  return (
    <fieldset
      data-entry-composer-mentions="true"
      className="grid gap-2 rounded-lg border border-border p-3 sm:p-4"
    >
      <legend className="px-1 text-body-sm font-medium text-text">
        {copy.label}
      </legend>
      <p className="text-caption text-text-muted">{copy.help}</p>
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={copy.label}>
          {selected.map((id) => (
            <li key={id}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => toggle(id)}
                aria-pressed="true"
              >
                {names[id] ?? id}
                <X aria-hidden="true" className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Field label={copy.search} id={searchId} className="min-w-0">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={120}
        />
      </Field>
      {status === "loading" ? (
        <p role="status" className="text-caption text-text-muted">
          {copy.loading}
        </p>
      ) : status === "error" ? (
        <p role="alert" className="text-caption text-danger-text">
          {copy.unavailable}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {DESTINATION_COPY[locale].retry}
          </button>
        </p>
      ) : (
        <ul className="grid gap-1">
          {objects.map((object) => (
            <li key={object.id}>
              <Checkbox
                name="mentionedPlantObjectIds"
                value={object.id}
                checked={selected.includes(object.id)}
                onChange={() => toggle(object.id)}
                label={object.displayName}
              />
            </li>
          ))}
        </ul>
      )}
    </fieldset>
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
