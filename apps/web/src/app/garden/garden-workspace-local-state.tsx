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

import { SiteShellContextRailRegistration } from "@/components/site-shell/site-shell-context-rail";
import { Button, buttonVariants } from "@/components/ui/button";
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
  const [localState, setLocalState] = useState(
    initialState ?? EMPTY_LOCAL_STATE,
  );

  const refresh = useCallback(async () => {
    if (initialState) return;

    try {
      const [drafts, mutations] = await Promise.all([
        listOfflineDrafts(ownerUserId, ["first_entry", "follow_up_entry"]),
        listOfflineMutations(ownerUserId, ["queued", "syncing", "failed"]),
      ]);

      setLocalState({
        online: navigator.onLine,
        drafts: drafts.map(summarizeDraft),
        mutations: mutations.map((mutation) => ({
          id: mutation.id,
          title: mutationTitle(mutation.payload),
          status: mutation.status,
          href: mutationHref(mutation.payload),
        })),
      });
    } catch {
      setLocalState({ ...EMPTY_LOCAL_STATE, online: navigator.onLine });
    }
  }, [initialState, ownerUserId]);

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
              Drafts and sync
            </p>
            <h2 className="mt-1 text-base font-semibold text-foreground">
              {hasLocalWork
                ? "Work waiting on this device"
                : "Everything on this device is clear"}
            </h2>
          </div>
          <ConnectionState online={localState.online} />
        </div>

        {hasLocalWork ? (
          <div className="mt-4 grid gap-5 lg:mt-2 lg:grid-cols-2 lg:gap-3">
            <LocalDraftList
              ownerUserId={ownerUserId}
              drafts={localState.drafts}
              onRefresh={refresh}
            />
            <LocalMutationList mutations={localState.mutations} />
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            No local drafts or queued changes. Canonical server readback remains
            the saved record.
          </p>
        )}

        {media && (media.processingCount > 0 || media.failedCount > 0) ? (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground lg:mt-2 lg:pt-2">
            {media.processingCount > 0 ? (
              <span>{media.processingCount} photo processing</span>
            ) : null}
            {media.failedCount > 0 ? (
              <span className="text-destructive">
                {media.failedCount} photo needs attention
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground lg:mt-2 lg:pt-2 xl:hidden">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Drafts stay on this device until sync succeeds.
          </span>
          <Link
            href={localizedPath(locale, "/privacy")}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Privacy
          </Link>
        </div>
      </section>
    </>
  );
}

function LocalDraftList({
  ownerUserId,
  drafts,
  onRefresh,
}: {
  ownerUserId: string;
  drafts: GardenWorkspaceDraftView[];
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="min-w-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
        Drafts on this device
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
                  Resume
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void discardDraft(ownerUserId, draft.id, onRefresh)
                  }
                >
                  Discard
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No drafts.</p>
      )}
    </div>
  );
}

function LocalMutationList({
  mutations,
}: {
  mutations: GardenWorkspaceMutationView[];
}) {
  return (
    <div className="min-w-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CloudUpload
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
        Queued locally
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
                  {mutationStatusLabel(mutation.status)} · Not saved to the
                  server yet
                </p>
              </div>
              <Link
                href={mutation.href}
                className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Review
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No queued work.</p>
      )}
    </div>
  );
}

function ConnectionState({ online }: { online: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
      {online ? (
        <CloudUpload className="size-3.5" aria-hidden="true" />
      ) : (
        <WifiOff className="size-3.5" aria-hidden="true" />
      )}
      {online ? "Online" : "Offline"}
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

function summarizeDraft(draft: JournalDraftRecord): GardenWorkspaceDraftView {
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
        ) ?? "First entry draft",
      subtitle: ["First object", payload.draft.entryDate]
        .filter(Boolean)
        .join(" · "),
      href: "/garden#first-entry-composer",
    };
  }

  const payload = draft.payload as FollowUpEntryDraftPayload;
  return {
    id: draft.id,
    title: firstNonEmpty(payload.draft.title) ?? "Follow-up draft",
    subtitle: ["Object update", payload.draft.entryDate]
      .filter(Boolean)
      .join(" · "),
    href: `/garden/objects/${encodeURIComponent(payload.plantObjectId)}#follow-up-composer`,
  };
}

function mutationTitle(payload: unknown) {
  const candidate = payload as Partial<OfflineJournalEntryPayload>;
  return firstNonEmpty(candidate.title) ?? "Queued journal update";
}

function mutationHref(payload: unknown) {
  const candidate = payload as Partial<OfflineJournalEntryPayload>;
  return candidate.target === "plant_object_entry" && candidate.plantObjectId
    ? `/garden/objects/${encodeURIComponent(candidate.plantObjectId)}#follow-up-composer`
    : "/garden#first-entry-composer";
}

function mutationStatusLabel(status: OfflineMutationStatus) {
  switch (status) {
    case "queued":
      return "Waiting for sync";
    case "syncing":
      return "Syncing now";
    case "failed":
      return "Sync needs attention";
    case "synced":
      return "Synced";
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
  const pendingMutations = localState.mutations.filter(
    (mutation) => mutation.status !== "synced",
  );

  return [
    {
      key: "garden-next",
      title: "Next action",
      items: [{ href: nextAction.href, label: nextAction.label }],
    },
    {
      key: "garden-recent",
      title: "Recent continuity",
      items: recent.slice(0, 3).map((entry) => ({
        href: entry.objectId
          ? `/garden/objects/${entry.objectId}`
          : `/garden#space-${entry.spaceId}`,
        label: entry.title,
        meta: shortDate(entry.entryDate),
      })),
      emptyLabel: "No dated updates yet.",
    },
    {
      key: "garden-local",
      title: "On this device",
      items: [
        ...localState.drafts.slice(0, 3).map((draft) => ({
          href: draft.href,
          label: draft.title,
          meta: "Draft",
        })),
        ...(localState.drafts.length === 0
          ? [
              {
                href: "/garden#drafts",
                label: "Drafts",
                meta: "0",
              },
            ]
          : []),
        {
          href: "/garden#drafts",
          label: "Queued or failed",
          meta: String(pendingMutations.length),
        },
        ...(media?.processingCount
          ? [
              {
                href: "/garden#drafts",
                label: "Photos processing",
                meta: String(media.processingCount),
              },
            ]
          : []),
        ...(media?.failedCount
          ? [
              {
                href: "/garden#drafts",
                label: "Photos need attention",
                meta: String(media.failedCount),
              },
            ]
          : []),
      ],
    },
    {
      key: "garden-inbox",
      title: "Inbox",
      items: [
        {
          href: localizedPath(locale, "/notifications"),
          label: "Notifications",
          meta: inbox ? String(inbox.notificationCount) : "—",
        },
        {
          href: "/garden/lineage/claims",
          label: "Lineage claims",
          meta: inbox ? String(inbox.claimCount) : "—",
        },
      ],
    },
    {
      key: "garden-privacy",
      title: "Privacy",
      items: [
        {
          href: localizedPath(locale, "/privacy"),
          label: "Privacy controls",
        },
      ],
    },
  ];
}

function shortDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", { month: "short", day: "numeric" });
}

export function GardenWorkspaceLocalStateError() {
  return (
    <span className="flex items-center gap-1.5 text-xs text-destructive">
      <AlertCircle className="size-3.5" aria-hidden="true" />
      Local state unavailable
    </span>
  );
}
