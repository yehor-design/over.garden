"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FileText, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatGardenWorkspaceDate,
  getGardenWorkspaceCopy,
  type GardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  deleteOfflineDraft,
  FIRST_ENTRY_DRAFT_ID,
  listOfflineDrafts,
  OFFLINE_DRAFTS_CHANGED_EVENT,
  type FirstEntryDraftPayload,
  type FollowUpEntryDraftPayload,
  type JournalDraftRecord,
} from "@/lib/offline/drafts";

export function GardenDraftResumePanel({
  ownerUserId,
  locale,
}: {
  ownerUserId: string;
  locale: InterfaceLocale;
}) {
  const copy = getGardenWorkspaceCopy(locale);
  const [drafts, setDrafts] = useState<JournalDraftRecord[]>([]);

  const refreshDrafts = useCallback(async () => {
    try {
      setDrafts(
        await listOfflineDrafts(ownerUserId, [
          "first_entry",
          "follow_up_entry",
        ]),
      );
    } catch {
      setDrafts([]);
    }
  }, [ownerUserId]);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      void refreshDrafts();
    }, 0);

    window.addEventListener(OFFLINE_DRAFTS_CHANGED_EVENT, refreshDrafts);
    window.addEventListener("focus", refreshDrafts);

    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener(OFFLINE_DRAFTS_CHANGED_EVENT, refreshDrafts);
      window.removeEventListener("focus", refreshDrafts);
    };
  }, [refreshDrafts]);

  if (drafts.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">
          {copy.localState.drafts.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {copy.draftResume.description}
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {drafts.map((draft) => {
          const summary = summarizeDraft(draft, locale, copy);
          return (
            <li
              key={draft.id}
              className="flex flex-col gap-3 rounded-lg border border-border p-3"
            >
              <div className="flex min-w-0 gap-2">
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {summary.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {summary.subtitle}
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={summary.href}
                  className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {copy.localState.drafts.resume}
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void discardDraft(ownerUserId, draft.id, refreshDrafts)
                  }
                >
                  <Trash2 className="size-4" />
                  {copy.localState.drafts.discard}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function discardDraft(
  ownerUserId: string,
  id: string,
  refreshDrafts: () => Promise<void>,
) {
  await deleteOfflineDraft(ownerUserId, id);
  await refreshDrafts();
}

function summarizeDraft(
  draft: JournalDraftRecord,
  locale: InterfaceLocale,
  copy: GardenWorkspaceCopy,
) {
  if (draft.id === FIRST_ENTRY_DRAFT_ID && draft.kind === "first_entry") {
    const payload = draft.payload as FirstEntryDraftPayload;
    const title =
      firstNonEmpty(
        payload.draft.title,
        payload.draft.plantName,
        payload.selectedCatalogItem?.displayName,
        payload.userAddedCatalogName,
      ) ?? copy.localState.drafts.firstEntryDraft;
    const subtitle = [
      copy.localState.drafts.firstEntry,
      draftDate(payload.draft.entryDate, locale),
      payload.photoIntent ? copy.localState.drafts.photoAttached : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      title,
      subtitle,
      href: "/garden#first-entry-composer",
    };
  }

  const payload = draft.payload as FollowUpEntryDraftPayload;
  return {
    title:
      firstNonEmpty(payload.draft.title) ??
      copy.localState.drafts.followUpDraft,
    subtitle: [
      copy.localState.drafts.followUp,
      draftDate(payload.draft.entryDate, locale),
      photoLabel(payload, copy),
    ]
      .filter(Boolean)
      .join(" · "),
    href: `/garden/objects/${encodeURIComponent(payload.plantObjectId)}#follow-up-composer`,
  };
}

function photoLabel(
  payload: FollowUpEntryDraftPayload,
  copy: GardenWorkspaceCopy,
) {
  return payload.photoIntent ? copy.localState.drafts.photoAttached : null;
}

function draftDate(value: string | null | undefined, locale: InterfaceLocale) {
  return value ? formatGardenWorkspaceDate(locale, value, "short") : null;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.find((value) => (value ?? "").trim().length > 0)?.trim();
}
