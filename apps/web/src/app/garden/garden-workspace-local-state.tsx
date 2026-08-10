"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CloudUpload,
  FileText,
  ShieldCheck,
  WifiOff,
} from "lucide-react";

import { useInterfaceLocaleChangeFormState } from "@/components/site-shell/interface-locale-change-boundary";
import { SiteShellContextRailRegistration } from "@/components/site-shell/site-shell-context-rail";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  formatGardenWorkspaceDate,
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
  type GardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { localizedPath } from "@/lib/public-localization";
import {
  deleteOfflineDraft,
  FIRST_ENTRY_DRAFT_ID,
  listOfflineDraftSummaries,
  OFFLINE_DRAFTS_CHANGED_EVENT,
} from "@/lib/offline/drafts";
import {
  listOfflineMutationSummaries,
  OFFLINE_QUEUE_CHANGED_EVENT,
  type OfflineMutationSummary,
  type OfflineDraftSummary,
  type OfflineMutationStatus,
} from "@/lib/offline/queue";
import type {
  GardenWorkspaceInboxSummary,
  GardenWorkspaceMediaSummary,
  GardenWorkspaceRecentEntry,
} from "@/server/garden-workspace-repository";

export interface GardenWorkspaceDraftView {
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export interface GardenWorkspaceMutationView {
  id: string;
  title: string;
  status: OfflineMutationStatus;
  href: string;
}

export interface GardenWorkspaceLocalStateSnapshot {
  online: boolean;
  drafts: GardenWorkspaceDraftView[];
  mutations: GardenWorkspaceMutationView[];
}

interface GardenWorkspaceLocalStateProps {
  ownerUserId: string;
  locale: InterfaceLocale;
  nextAction: { href: string; label: string };
  recent: GardenWorkspaceRecentEntry[];
  inbox: GardenWorkspaceInboxSummary | null;
  media: GardenWorkspaceMediaSummary | null;
  initialState?: GardenWorkspaceLocalStateSnapshot;
}

const EMPTY_LOCAL_STATE: GardenWorkspaceLocalStateSnapshot = {
  online: true,
  drafts: [],
  mutations: [],
};

interface GardenWorkspaceLocalPages {
  drafts: number;
  mutations: number;
  draftsHasMore: boolean;
  mutationsHasMore: boolean;
  error: boolean;
}

const INITIAL_LOCAL_PAGES: GardenWorkspaceLocalPages = {
  drafts: 1,
  mutations: 1,
  draftsHasMore: false,
  mutationsHasMore: false,
  error: false,
};

const LOCAL_SUMMARY_REFRESH_DEBOUNCE_MS = 100;

export function GardenWorkspaceLocalState({
  ownerUserId,
  locale,
  nextAction,
  recent,
  inbox,
  media,
  initialState,
}: GardenWorkspaceLocalStateProps) {
  const copy = getGardenWorkspaceCopy(locale);
  const [localState, setLocalState] = useState(
    initialState ?? EMPTY_LOCAL_STATE,
  );
  const [localStateOwnerUserId, setLocalStateOwnerUserId] = useState(
    initialState ? ownerUserId : null,
  );
  const [localPages, setLocalPages] = useState(INITIAL_LOCAL_PAGES);
  const [pendingLocalMutationCount, setPendingLocalMutationCount] = useState(0);
  const mountedRef = useRef(false);
  const ownerRef = useRef(ownerUserId);
  const refreshInFlightRef = useRef(false);
  const refreshRequestedRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const localPagesRef = useRef(INITIAL_LOCAL_PAGES);
  const lastReadyPagesRef = useRef(INITIAL_LOCAL_PAGES);
  const lastReadyOwnerRef = useRef<string | null>(
    initialState ? ownerUserId : null,
  );
  const refreshRef = useRef<() => void>(() => undefined);

  const refresh = useCallback(async () => {
    if (initialState) return;
    if (refreshInFlightRef.current) {
      refreshRequestedRef.current = true;
      return;
    }

    refreshInFlightRef.current = true;
    const requestedOwner = ownerUserId;
    const requestedPages = localPagesRef.current;

    try {
      const [draftPage, mutationPage] = await Promise.all([
        listOfflineDraftSummaries(requestedOwner, {
          page: requestedPages.drafts,
        }),
        listOfflineMutationSummaries(requestedOwner, {
          page: requestedPages.mutations,
          statuses: ["queued", "syncing", "failed"],
        }),
      ]);

      if (!mountedRef.current || ownerRef.current !== requestedOwner) return;
      setLocalStateOwnerUserId(requestedOwner);
      setLocalState({
        online: navigator.onLine,
        drafts: draftPage.items.map((draft) =>
          summarizeDraft(draft, locale, copy),
        ),
        mutations: mutationPage.items.map((mutation) =>
          summarizeMutation(mutation, copy),
        ),
      });
      const nextPages = {
        ...requestedPages,
        draftsHasMore: draftPage.hasMore,
        mutationsHasMore: mutationPage.hasMore,
        error: false,
      };
      localPagesRef.current = nextPages;
      lastReadyPagesRef.current = nextPages;
      lastReadyOwnerRef.current = requestedOwner;
      setLocalPages(nextPages);
    } catch {
      if (!mountedRef.current || ownerRef.current !== requestedOwner) return;
      if (lastReadyOwnerRef.current !== requestedOwner) {
        setLocalStateOwnerUserId(requestedOwner);
        setLocalState({ ...EMPTY_LOCAL_STATE, online: navigator.onLine });
      }
      const nextPages = { ...lastReadyPagesRef.current, error: true };
      localPagesRef.current = nextPages;
      setLocalPages(nextPages);
    } finally {
      refreshInFlightRef.current = false;
      if (
        refreshRequestedRef.current &&
        mountedRef.current &&
        refreshTimerRef.current === null
      ) {
        refreshRequestedRef.current = false;
        refreshTimerRef.current = window.setTimeout(() => {
          refreshTimerRef.current = null;
          refreshRef.current();
        }, LOCAL_SUMMARY_REFRESH_DEBOUNCE_MS);
      }
    }
  }, [copy, initialState, locale, ownerUserId]);

  useEffect(() => {
    refreshRef.current = () => {
      void refresh();
    };
  }, [refresh]);

  const scheduleRefresh = useCallback(() => {
    if (initialState || refreshTimerRef.current !== null) return;
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      refreshRef.current();
    }, LOCAL_SUMMARY_REFRESH_DEBOUNCE_MS);
  }, [initialState]);

  const handleDiscardDraft = useCallback(
    async (id: string) => {
      setPendingLocalMutationCount((count) => count + 1);
      try {
        await discardDraft(ownerUserId, id, scheduleRefresh);
      } finally {
        setPendingLocalMutationCount((count) => Math.max(0, count - 1));
      }
    },
    [ownerUserId, scheduleRefresh],
  );

  const changePage = useCallback(
    (key: "drafts" | "mutations", page: number) => {
      const nextPages = {
        ...localPagesRef.current,
        [key]: Math.max(1, page),
        error: false,
      };
      localPagesRef.current = nextPages;
      scheduleRefresh();
    },
    [scheduleRefresh],
  );

  useInterfaceLocaleChangeFormState({
    id: "garden-workspace-local-mutation",
    dirty: false,
    pending: pendingLocalMutationCount > 0,
  });

  useEffect(() => {
    if (initialState) return;

    mountedRef.current = true;
    ownerRef.current = ownerUserId;
    localPagesRef.current = INITIAL_LOCAL_PAGES;
    lastReadyPagesRef.current = INITIAL_LOCAL_PAGES;
    scheduleRefresh();
    const handleConnection = () => scheduleRefresh();
    window.addEventListener(OFFLINE_DRAFTS_CHANGED_EVENT, handleConnection);
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, handleConnection);
    window.addEventListener("focus", handleConnection);
    window.addEventListener("online", handleConnection);
    window.addEventListener("offline", handleConnection);

    return () => {
      mountedRef.current = false;
      refreshRequestedRef.current = false;
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      window.removeEventListener(
        OFFLINE_DRAFTS_CHANGED_EVENT,
        handleConnection,
      );
      window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, handleConnection);
      window.removeEventListener("focus", handleConnection);
      window.removeEventListener("online", handleConnection);
      window.removeEventListener("offline", handleConnection);
    };
  }, [initialState, ownerUserId, scheduleRefresh]);

  // The old owner's in-memory view must disappear in the render that receives
  // a new owner, before the asynchronous IndexedDB summary read can complete.
  const visibleLocalState =
    localStateOwnerUserId === ownerUserId ? localState : EMPTY_LOCAL_STATE;
  const visibleLocalPages =
    localStateOwnerUserId === ownerUserId ? localPages : INITIAL_LOCAL_PAGES;

  const modules = useMemo(
    () =>
      buildContextModules({
        locale,
        nextAction,
        recent,
        inbox,
        media,
        localState: visibleLocalState,
        localStateUnavailable: visibleLocalPages.error,
      }),
    [
      inbox,
      locale,
      media,
      nextAction,
      recent,
      visibleLocalPages.error,
      visibleLocalState,
    ],
  );
  const hasLocalWork =
    visibleLocalState.drafts.length > 0 ||
    visibleLocalState.mutations.length > 0;
  const localStateTitle = visibleLocalPages.error
    ? copy.localState.error
    : hasLocalWork
      ? copy.localState.hasWorkTitle
      : copy.localState.clearTitle;

  return (
    <>
      <SiteShellContextRailRegistration modules={modules} />

      <section
        id="drafts"
        data-garden-local-state="true"
        className="border-y border-border bg-muted/20 px-4 py-4 sm:px-6 lg:py-3 xl:hidden"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              {copy.localState.eyebrow}
            </p>
            <h2 className="mt-1 text-base font-semibold text-foreground">
              {localStateTitle}
            </h2>
          </div>
          <ConnectionState copy={copy} online={visibleLocalState.online} />
        </div>
        <p className="sr-only" aria-live="polite">
          {localStateTitle}
        </p>

        {hasLocalWork ? (
          <div className="mt-4 grid gap-5 lg:mt-2 lg:grid-cols-2 lg:gap-3">
            <LocalDraftList
              copy={copy}
              drafts={visibleLocalState.drafts}
              page={visibleLocalPages.drafts}
              hasMore={visibleLocalPages.draftsHasMore}
              pending={pendingLocalMutationCount > 0}
              onDiscard={handleDiscardDraft}
              onPrevious={() =>
                changePage("drafts", visibleLocalPages.drafts - 1)
              }
              onNext={() => changePage("drafts", visibleLocalPages.drafts + 1)}
            />
            <LocalMutationList
              copy={copy}
              mutations={visibleLocalState.mutations}
              page={visibleLocalPages.mutations}
              hasMore={visibleLocalPages.mutationsHasMore}
              onPrevious={() =>
                changePage("mutations", visibleLocalPages.mutations - 1)
              }
              onNext={() =>
                changePage("mutations", visibleLocalPages.mutations + 1)
              }
            />
          </div>
        ) : !visibleLocalPages.error ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {copy.localState.emptyDescription}
          </p>
        ) : null}

        {visibleLocalPages.error ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <GardenWorkspaceLocalStateError locale={locale} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={scheduleRefresh}
            >
              {copy.workspace.sectionError.retry}
            </Button>
          </div>
        ) : null}

        {media && (media.processingCount > 0 || media.failedCount > 0) ? (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground lg:mt-2 lg:pt-2">
            {media.processingCount > 0 ? (
              <span>
                {formatGardenWorkspaceTemplate(
                  copy.localState.media.processing,
                  { count: media.processingCount },
                )}
              </span>
            ) : null}
            {media.failedCount > 0 ? (
              <span className="text-destructive">
                {formatGardenWorkspaceTemplate(
                  copy.localState.media.attention,
                  { count: media.failedCount },
                )}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground lg:mt-2 lg:pt-2 xl:hidden">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-4" aria-hidden="true" />
            {copy.localState.safety}
          </span>
          <Link
            href={localizedPath(locale, "/privacy")}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {copy.localState.privacy}
          </Link>
        </div>
      </section>
    </>
  );
}

function LocalDraftList({
  copy,
  drafts,
  page,
  hasMore,
  pending,
  onDiscard,
  onPrevious,
  onNext,
}: {
  copy: GardenWorkspaceCopy;
  drafts: GardenWorkspaceDraftView[];
  page: number;
  hasMore: boolean;
  pending: boolean;
  onDiscard: (id: string) => Promise<void>;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="min-w-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
        {copy.localState.drafts.title}
      </h3>
      {drafts.length > 0 ? (
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {drafts.map((draft) => (
            <li
              key={draft.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3 lg:py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {draft.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {draft.subtitle}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={draft.href}
                  className={buttonVariants({ size: "sm" })}
                >
                  {copy.localState.drafts.resume}
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => void onDiscard(draft.id)}
                >
                  {copy.localState.drafts.discard}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {copy.localState.drafts.empty}
        </p>
      )}
      <WorkspaceSummaryPagination
        copy={copy}
        page={page}
        hasMore={hasMore}
        section={copy.localState.drafts.title}
        onPrevious={onPrevious}
        onNext={onNext}
      />
    </div>
  );
}

function LocalMutationList({
  copy,
  mutations,
  page,
  hasMore,
  onPrevious,
  onNext,
}: {
  copy: GardenWorkspaceCopy;
  mutations: GardenWorkspaceMutationView[];
  page: number;
  hasMore: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="min-w-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CloudUpload
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
        {copy.localState.queue.title}
      </h3>
      {mutations.length > 0 ? (
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {mutations.map((mutation) => (
            <li
              key={mutation.id}
              className="flex min-w-0 items-center justify-between gap-3 py-3 lg:py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {mutation.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {mutationStatusLabel(mutation.status, copy)} ·{" "}
                  {copy.localState.queue.notSaved}
                </p>
              </div>
              <Link
                href={mutation.href}
                className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {copy.localState.queue.review}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {copy.localState.queue.empty}
        </p>
      )}
      <WorkspaceSummaryPagination
        copy={copy}
        page={page}
        hasMore={hasMore}
        section={copy.localState.queue.title}
        onPrevious={onPrevious}
        onNext={onNext}
      />
    </div>
  );
}

function WorkspaceSummaryPagination({
  copy,
  page,
  hasMore,
  section,
  onPrevious,
  onNext,
}: {
  copy: GardenWorkspaceCopy;
  page: number;
  hasMore: boolean;
  section: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (page === 1 && !hasMore) return null;

  return (
    <div
      className="mt-3 flex items-center gap-2"
      aria-label={formatGardenWorkspaceTemplate(
        copy.workspace.pagination.ariaLabel,
        {
          section,
        },
      )}
    >
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={page === 1}
        onClick={onPrevious}
      >
        {copy.workspace.pagination.previous}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!hasMore}
        onClick={onNext}
      >
        {copy.workspace.pagination.next}
      </Button>
    </div>
  );
}

function ConnectionState({
  copy,
  online,
}: {
  copy: GardenWorkspaceCopy;
  online: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
      {online ? (
        <CloudUpload className="size-3.5" aria-hidden="true" />
      ) : (
        <WifiOff className="size-3.5" aria-hidden="true" />
      )}
      {online
        ? copy.localState.connection.online
        : copy.localState.connection.offline}
    </span>
  );
}

async function discardDraft(
  ownerUserId: string,
  id: string,
  refresh: () => void,
) {
  await deleteOfflineDraft(ownerUserId, id);
  refresh();
}

function summarizeDraft(
  draft: OfflineDraftSummary,
  locale: InterfaceLocale,
  copy: GardenWorkspaceCopy,
): GardenWorkspaceDraftView {
  if (draft.id === FIRST_ENTRY_DRAFT_ID && draft.kind === "first_entry") {
    return {
      id: draft.id,
      title: copy.localState.drafts.firstEntryDraft,
      subtitle: [
        copy.localState.drafts.firstObject,
        draftDate(draft.entryDate, locale),
      ]
        .filter(Boolean)
        .join(" · "),
      href: "/garden#first-entry-composer",
    };
  }

  return {
    id: draft.id,
    title:
      draft.kind === "space_entry"
        ? copy.localState.drafts.firstEntryDraft
        : copy.localState.drafts.followUpDraft,
    subtitle: [
      draft.kind === "space_entry"
        ? copy.localState.drafts.firstEntry
        : copy.localState.drafts.objectUpdate,
      draftDate(draft.entryDate, locale),
    ]
      .filter(Boolean)
      .join(" · "),
    href: draft.targetObjectId
      ? `/garden/objects/${encodeURIComponent(draft.targetObjectId)}#follow-up-composer`
      : "/garden#first-entry-composer",
  };
}

function summarizeMutation(
  mutation: OfflineMutationSummary,
  copy: GardenWorkspaceCopy,
): GardenWorkspaceMutationView {
  return {
    id: mutation.id,
    title: copy.localState.queue.fallbackTitle,
    status: mutation.status,
    href:
      mutation.target === "plant_object_entry" && mutation.targetObjectId
        ? `/garden/objects/${encodeURIComponent(mutation.targetObjectId)}#follow-up-composer`
        : "/garden#first-entry-composer",
  };
}

function mutationStatusLabel(
  status: OfflineMutationStatus,
  copy: GardenWorkspaceCopy,
) {
  switch (status) {
    case "queued":
      return copy.localState.queue.statuses.queued;
    case "syncing":
      return copy.localState.queue.statuses.syncing;
    case "failed":
      return copy.localState.queue.statuses.failed;
    case "synced":
      return copy.localState.queue.statuses.synced;
  }
}

function buildContextModules({
  locale,
  nextAction,
  recent,
  inbox,
  media,
  localState,
  localStateUnavailable,
}: {
  locale: InterfaceLocale;
  nextAction: { href: string; label: string };
  recent: GardenWorkspaceRecentEntry[];
  inbox: GardenWorkspaceInboxSummary | null;
  media: GardenWorkspaceMediaSummary | null;
  localState: GardenWorkspaceLocalStateSnapshot;
  localStateUnavailable: boolean;
}) {
  const copy = getGardenWorkspaceCopy(locale);
  const pendingMutations = localState.mutations.filter(
    (mutation) => mutation.status !== "synced",
  );

  return [
    {
      key: "garden-next",
      title: copy.localState.context.nextAction,
      items: [{ href: nextAction.href, label: nextAction.label }],
    },
    {
      key: "garden-recent",
      title: copy.localState.context.recent,
      items: recent.slice(0, 3).map((entry) => ({
        href: entry.objectId
          ? `/garden/objects/${entry.objectId}`
          : `/garden#space-${entry.spaceId}`,
        label: entry.title,
        meta: formatGardenWorkspaceDate(locale, entry.entryDate, "short"),
      })),
      emptyLabel: copy.localState.context.noRecent,
    },
    {
      key: "garden-local",
      title: copy.localState.context.onDevice,
      items: [
        ...localState.drafts.slice(0, 3).map((draft) => ({
          href: draft.href,
          label: draft.title,
          meta: copy.localState.context.draft,
        })),
        ...(localState.drafts.length === 0
          ? [
              {
                href: "/garden#drafts",
                label: copy.localState.context.drafts,
                meta: localStateUnavailable ? "—" : "0",
              },
            ]
          : []),
        {
          href: "/garden#drafts",
          label: copy.localState.context.queuedOrFailed,
          meta: localStateUnavailable ? "—" : String(pendingMutations.length),
        },
        ...(media?.processingCount
          ? [
              {
                href: "/garden#drafts",
                label: copy.localState.context.photosProcessing,
                meta: String(media.processingCount),
              },
            ]
          : []),
        ...(media?.failedCount
          ? [
              {
                href: "/garden#drafts",
                label: copy.localState.context.photosNeedAttention,
                meta: String(media.failedCount),
              },
            ]
          : []),
      ],
    },
    {
      key: "garden-inbox",
      title: copy.localState.context.inbox,
      items: [
        {
          href: localizedPath(locale, "/notifications"),
          label: copy.localState.context.notifications,
          meta: inbox ? String(inbox.notificationCount) : "—",
        },
        {
          href: "/garden/lineage/claims",
          label: copy.localState.context.lineageClaims,
          meta: inbox ? String(inbox.claimCount) : "—",
        },
      ],
    },
    {
      key: "garden-privacy",
      title: copy.localState.context.privacy,
      items: [
        {
          href: localizedPath(locale, "/privacy"),
          label: copy.localState.context.privacyControls,
        },
      ],
    },
  ];
}

function draftDate(value: string | null | undefined, locale: InterfaceLocale) {
  return value ? formatGardenWorkspaceDate(locale, value, "short") : null;
}

export function GardenWorkspaceLocalStateError({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  const copy = getGardenWorkspaceCopy(locale);
  return (
    <span className="flex items-center gap-1.5 text-xs text-destructive">
      <AlertCircle className="size-3.5" aria-hidden="true" />
      {copy.localState.error}
    </span>
  );
}
