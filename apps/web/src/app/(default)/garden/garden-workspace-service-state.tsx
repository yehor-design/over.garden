"use client";

import Link from "next/link";
import { WarningCircleIcon as AlertCircle } from "@/components/icons/WarningCircle";
import { ShieldCheckIcon as ShieldCheck } from "@/components/icons/ShieldCheck";

import { SiteShellContextRailRegistration } from "@/components/site-shell/site-shell-context-rail";
import { gardenCollectionItemHref } from "@/lib/garden/garden-collection";
import {
  formatGardenWorkspaceDate,
  getGardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { localizedPath } from "@/lib/public-localization";
import type {
  GardenWorkspaceInboxSummary,
  GardenWorkspaceRecentEntry,
} from "@/server/garden-workspace-repository";

interface GardenWorkspaceServiceStateProps {
  locale: InterfaceLocale;
  nextAction: { href: string; label: string };
  recent: GardenWorkspaceRecentEntry[];
  inbox: GardenWorkspaceInboxSummary | null;
  /**
   * The publication and privacy line under the header. It belongs beside a
   * composer; a collection with nothing to publish on it leaves it out
   * (`OVE-489`).
   */
  showPublicationNotice?: boolean;
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
  showPublicationNotice = true,
}: GardenWorkspaceServiceStateProps) {
  const copy = getGardenWorkspaceCopy(locale);
  const modules = buildContextModules({
    locale,
    nextAction,
    recent,
    inbox,
  });

  return (
    <>
      <SiteShellContextRailRegistration modules={modules} />
      {showPublicationNotice ? (
        <section
          id="garden-service-state"
          data-garden-service-state="true"
          className="border-y border-border bg-muted/20 px-4 py-3 sm:px-6 xl:hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4" aria-hidden="true" />
              {copy.composer.publicationNotice}
            </span>
            <Link
              href={localizedPath(locale, "/privacy")}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {copy.serviceState.privacy}
            </Link>
          </div>
        </section>
      ) : null}
    </>
  );
}

function buildContextModules({
  locale,
  nextAction,
  recent,
  inbox,
}: {
  locale: InterfaceLocale;
  nextAction: { href: string; label: string };
  recent: GardenWorkspaceRecentEntry[];
  inbox: GardenWorkspaceInboxSummary | null;
}) {
  const copy = getGardenWorkspaceCopy(locale);

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
        href: gardenCollectionItemHref(
          entry.objectId
            ? { kind: "object", id: entry.objectId }
            : { kind: "space", id: entry.spaceId },
        ),
        label: entry.title,
        meta: formatGardenWorkspaceDate(locale, entry.entryDate, "short"),
      })),
      emptyLabel: copy.serviceState.context.noRecent,
    },
    {
      key: "garden-inbox",
      title: copy.serviceState.context.inbox,
      items: [
        // An unread count is shown when there is one; a nought is omitted
        // and an unknown one is a dash (DESIGN.md §5.10).
        {
          href: localizedPath(locale, "/notifications"),
          label: copy.serviceState.context.notifications,
          meta: inboxCount(inbox?.notificationCount),
        },
        {
          href: "/garden/lineage/claims",
          label: copy.serviceState.context.lineageClaims,
          meta: inboxCount(inbox?.claimCount),
        },
      ],
    },
  ];
}

function inboxCount(count: number | undefined): string | undefined {
  if (count === undefined) return "—";
  return count > 0 ? String(count) : undefined;
}

export function GardenWorkspaceServiceStateError({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  const copy = getGardenWorkspaceCopy(locale);
  return (
    <span className="flex items-center gap-1.5 text-xs text-destructive">
      <AlertCircle className="size-4" aria-hidden="true" />
      {copy.workspace.sectionError.description}
    </span>
  );
}
