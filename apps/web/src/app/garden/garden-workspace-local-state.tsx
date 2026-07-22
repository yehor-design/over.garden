"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  listOfflineDrafts,
  OFFLINE_DRAFTS_CHANGED_EVENT,
  type FirstEntryDraftPayload,
  type FollowUpEntryDraftPayload,
  type JournalDraftRecord,
} from "@/lib/offline/drafts";
import {
  listOfflineMutations,
  OFFLINE_QUEUE_CHANGED_EVENT,
  type OfflineJournalEntryPayload,
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
  const [pendingLocalMutationCount, setPendingLocalMutationCount] = useState(0);

  const refresh = useCallback(async () => {
    if (initialState) return;

    try {
      const [drafts, mutations] = await Promise.all([
        listOfflineDrafts(ownerUserId, ["first_entry", "follow_up_entry"]),
        listOfflineMutations(ownerUserId, ["queued", "syncing", "failed"]),
      ]);

      setLocalState({
        online: navigator.onLine,
        drafts: drafts.map((draft) => summarizeDraft(draft, locale, copy)),
        mutations: mutations.map((mutation) => ({
          id: mutation.id,
          title: mutationTitle(mutation.payload, copy),
          status: mutation.status,
          href: mutationHref(mutation.payload),
        })),
      });
    } catch {
      setLocalState({ ...EMPTY_LOCAL_STATE, online: navigator.onLine });
    }
  }, [copy, initialState, locale, ownerUserId]);

  const handleDiscardDraft = useCallback(
    async (id: string) => {
      setPendingLocalMutationCount((count) => count + 1);
      try {
        await discardDraft(ownerUserId, id, refresh);
      } finally {
        setPendingLocalMutationCount((count) => Math.max(0, count - 1));
      }
    },
    [ownerUserId, refresh],
  );

  useInterfaceLocaleChangeFormState({
    id: "garden-workspace-local-mutation",
    dirty: false,
    pending: pendingLocalMutationCount > 0,
  });

  useEffect(() => {
    if (initialState) return;

    const refreshTimer = window.setTimeout(() => void refresh(), 0);
    const handleConnection = () => void refresh();
    window.addEventListener(OFFLINE_DRAFTS_CHANGED_EVENT, handleConnection);
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, handleConnection);
    window.addEventListener("focus", handleConnection);
    window.addEventListener("online", handleConnection);
    window.addEventListener("offline", handleConnection);

    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener(
        OFFLINE_DRAFTS_CHANGED_EVENT,
        handleConnection,
      );
      window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, handleConnection);
      window.removeEventListener("focus", handleConnection);
      window.removeEventListener("online", handleConnection);
      window.removeEventListener("offline", handleConnection);
    };
  }, [initialState, refresh]);

  const modules = useMemo(
    () =>
      buildContextModules({
        locale,
        nextAction,
        recent,
        inbox,
        media,
        localState,
      }),
    [inbox, localState, locale, media, nextAction, recent],
  );
  const hasLocalWork =
    localState.drafts.length > 0 || localState.mutations.length > 0;

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
              {hasLocalWork
                ? copy.localState.hasWorkTitle
                : copy.localState.clearTitle}
            </h2>
          </div>
          <ConnectionState copy={copy} online={localState.online} />
        </div>

        {hasLocalWork ? (
          <div className="mt-4 grid gap-5 lg:mt-2 lg:grid-cols-2 lg:gap-3">
            <LocalDraftList
              copy={copy}
              drafts={localState.drafts}
              pending={pendingLocalMutationCount > 0}
              onDiscard={handleDiscardDraft}
            />
            <LocalMutationList copy={copy} mutations={localState.mutations} />
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {copy.localState.emptyDescription}
          </p>
        )}

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
  pending,
  onDiscard,
}: {
  copy: GardenWorkspaceCopy;
  drafts: GardenWorkspaceDraftView[];
  pending: boolean;
  onDiscard: (id: string) => Promise<void>;
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
    </div>
  );
}

function LocalMutationList({
  copy,
  mutations,
}: {
  copy: GardenWorkspaceCopy;
  mutations: GardenWorkspaceMutationView[];
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
  refresh: () => Promise<void>,
) {
  await deleteOfflineDraft(ownerUserId, id);
  await refresh();
}

function summarizeDraft(
  draft: JournalDraftRecord,
  locale: InterfaceLocale,
  copy: GardenWorkspaceCopy,
): GardenWorkspaceDraftView {
  if (draft.id === FIRST_ENTRY_DRAFT_ID && draft.kind === "first_entry") {
    const payload = draft.payload as FirstEntryDraftPayload;
    return {
      id: draft.id,
      title:
        firstNonEmpty(
          payload.draft.title,
          payload.draft.plantName,
          payload.selectedCatalogItem?.displayName,
          payload.userAddedCatalogName,
        ) ?? copy.localState.drafts.firstEntryDraft,
      subtitle: [
        copy.localState.drafts.firstObject,
        draftDate(payload.draft.entryDate, locale),
      ]
        .filter(Boolean)
        .join(" · "),
      href: "/garden#first-entry-composer",
    };
  }

  const payload = draft.payload as FollowUpEntryDraftPayload;
  return {
    id: draft.id,
    title:
      firstNonEmpty(payload.draft.title) ??
      copy.localState.drafts.followUpDraft,
    subtitle: [
      copy.localState.drafts.objectUpdate,
      draftDate(payload.draft.entryDate, locale),
    ]
      .filter(Boolean)
      .join(" · "),
    href: `/garden/objects/${encodeURIComponent(payload.plantObjectId)}#follow-up-composer`,
  };
}

function mutationTitle(payload: unknown, copy: GardenWorkspaceCopy) {
  const candidate = payload as Partial<OfflineJournalEntryPayload>;
  return firstNonEmpty(candidate.title) ?? copy.localState.queue.fallbackTitle;
}

function mutationHref(payload: unknown) {
  const candidate = payload as Partial<OfflineJournalEntryPayload>;
  return candidate.target === "plant_object_entry" && candidate.plantObjectId
    ? `/garden/objects/${encodeURIComponent(candidate.plantObjectId)}#follow-up-composer`
    : "/garden#first-entry-composer";
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

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.find((value) => (value ?? "").trim().length > 0)?.trim();
}

function buildContextModules({
  locale,
  nextAction,
  recent,
  inbox,
  media,
  localState,
}: {
  locale: InterfaceLocale;
  nextAction: { href: string; label: string };
  recent: GardenWorkspaceRecentEntry[];
  inbox: GardenWorkspaceInboxSummary | null;
  media: GardenWorkspaceMediaSummary | null;
  localState: GardenWorkspaceLocalStateSnapshot;
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
                meta: "0",
              },
            ]
          : []),
        {
          href: "/garden#drafts",
          label: copy.localState.context.queuedOrFailed,
          meta: String(pendingMutations.length),
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
