"use client";

import Link from "next/link";
import { AlertCircle, ShieldCheck } from "lucide-react";

import { SiteShellContextRailRegistration } from "@/components/site-shell/site-shell-context-rail";
import {
  formatGardenWorkspaceDate,
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { localizedPath } from "@/lib/public-localization";
import type {
  GardenWorkspaceInboxSummary,
  GardenWorkspaceMediaSummary,
  GardenWorkspaceRecentEntry,
} from "@/server/garden-workspace-repository";

interface GardenWorkspaceServiceStateProps {
  locale: InterfaceLocale;
  nextAction: { href: string; label: string };
  recent: GardenWorkspaceRecentEntry[];
  inbox: GardenWorkspaceInboxSummary | null;
  media: GardenWorkspaceMediaSummary | null;
}

/**
 * Registers server-backed workspace context and renders media/privacy support.
 * This boundary intentionally has no browser persistence or connectivity API.
 */
export function GardenWorkspaceServiceState({
  locale,
  nextAction,
  recent,
  inbox,
  media,
}: GardenWorkspaceServiceStateProps) {
  const copy = getGardenWorkspaceCopy(locale);
  const modules = buildContextModules({
    locale,
    nextAction,
    recent,
    inbox,
    media,
  });
  const hasMediaWork =
    Boolean(media?.processingCount) || Boolean(media?.failedCount);

  return (
    <>
      <SiteShellContextRailRegistration modules={modules} />
      <section
        id="garden-service-state"
        data-garden-service-state="true"
        className="border-y border-border bg-muted/20 px-4 py-3 sm:px-6 xl:hidden"
      >
        {hasMediaWork ? (
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {media?.processingCount ? (
              <span>
                {formatGardenWorkspaceTemplate(
                  copy.serviceState.media.processing,
                  { count: media.processingCount },
                )}
              </span>
            ) : null}
            {media?.failedCount ? (
              <span className="text-destructive">
                {formatGardenWorkspaceTemplate(
                  copy.serviceState.media.attention,
                  { count: media.failedCount },
                )}
              </span>
            ) : null}
          </div>
        ) : null}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground ${hasMediaWork ? "mt-3 border-t border-border pt-3" : ""}`}
        >
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-4" aria-hidden="true" />
            {copy.composer.privacyDefault}
          </span>
          <Link
            href={localizedPath(locale, "/privacy")}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {copy.serviceState.privacy}
          </Link>
        </div>
      </section>
    </>
  );
}

function buildContextModules({
  locale,
  nextAction,
  recent,
  inbox,
  media,
}: {
  locale: InterfaceLocale;
  nextAction: { href: string; label: string };
  recent: GardenWorkspaceRecentEntry[];
  inbox: GardenWorkspaceInboxSummary | null;
  media: GardenWorkspaceMediaSummary | null;
}) {
  const copy = getGardenWorkspaceCopy(locale);
  const mediaItems = [
    ...(media?.processingCount
      ? [
          {
            href: "/garden#garden-service-state",
            label: copy.serviceState.context.photosProcessing,
            meta: String(media.processingCount),
          },
        ]
      : []),
    ...(media?.failedCount
      ? [
          {
            href: "/garden#garden-service-state",
            label: copy.serviceState.context.photosNeedAttention,
            meta: String(media.failedCount),
          },
        ]
      : []),
  ];

  return [
    {
      key: "garden-next",
      title: copy.serviceState.context.nextAction,
      items: [{ href: nextAction.href, label: nextAction.label }],
    },
    {
      key: "garden-recent",
      title: copy.serviceState.context.recent,
      items: recent.slice(0, 3).map((entry) => ({
        href: entry.objectId
          ? `/garden/objects/${entry.objectId}`
          : `/garden#space-${entry.spaceId}`,
        label: entry.title,
        meta: formatGardenWorkspaceDate(locale, entry.entryDate, "short"),
      })),
      emptyLabel: copy.serviceState.context.noRecent,
    },
    ...(mediaItems.length > 0
      ? [
          {
            key: "garden-media",
            title: copy.serviceState.context.photosProcessing,
            items: mediaItems,
          },
        ]
      : []),
    {
      key: "garden-inbox",
      title: copy.serviceState.context.inbox,
      items: [
        {
          href: localizedPath(locale, "/notifications"),
          label: copy.serviceState.context.notifications,
          meta: inbox ? String(inbox.notificationCount) : "—",
        },
        {
          href: "/garden/lineage/claims",
          label: copy.serviceState.context.lineageClaims,
          meta: inbox ? String(inbox.claimCount) : "—",
        },
      ],
    },
    {
      key: "garden-privacy",
      title: copy.serviceState.context.privacy,
      items: [
        {
          href: localizedPath(locale, "/privacy"),
          label: copy.serviceState.context.privacyControls,
        },
      ],
    },
  ];
}

export function GardenWorkspaceServiceStateError({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  const copy = getGardenWorkspaceCopy(locale);
  return (
    <span className="flex items-center gap-1.5 text-xs text-destructive">
      <AlertCircle className="size-3.5" aria-hidden="true" />
      {copy.workspace.sectionError.description}
    </span>
  );
}
