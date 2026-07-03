"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FileText, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  deleteOfflineDraft,
  FIRST_ENTRY_DRAFT_ID,
  listOfflineDrafts,
  OFFLINE_DRAFTS_CHANGED_EVENT,
  type FirstEntryDraftPayload,
  type FollowUpEntryDraftPayload,
  type JournalDraftRecord,
} from "@/lib/offline/drafts";

export function GardenDraftResumePanel() {
  const [drafts, setDrafts] = useState<JournalDraftRecord[]>([]);

  const refreshDrafts = useCallback(async () => {
    setDrafts(await listOfflineDrafts(["first_entry", "follow_up_entry"]));
  }, []);

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
          Drafts on this device
        </h2>
        <p className="text-sm text-muted-foreground">
          Resume a note that has not reached your garden yet.
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {drafts.map((draft) => {
          const summary = summarizeDraft(draft);
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
                  Resume
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void discardDraft(draft.id, refreshDrafts)}
                >
                  <Trash2 className="size-4" />
                  Discard
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function discardDraft(id: string, refreshDrafts: () => Promise<void>) {
  await deleteOfflineDraft(id);
  await refreshDrafts();
}

function summarizeDraft(draft: JournalDraftRecord) {
  if (draft.id === FIRST_ENTRY_DRAFT_ID && draft.kind === "first_entry") {
    const payload = draft.payload as FirstEntryDraftPayload;
    const title =
      firstNonEmpty(
        payload.draft.title,
        payload.draft.plantName,
        payload.selectedCatalogItem?.displayName,
        payload.userAddedCatalogName,
      ) ?? "First entry draft";
    const subtitle = [
      "First entry",
      payload.draft.entryDate,
      payload.photoIntent ? "Photo attached" : null,
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
    title: firstNonEmpty(payload.draft.title) ?? "Follow-up draft",
    subtitle: ["Follow-up", payload.draft.entryDate, photoLabel(payload)]
      .filter(Boolean)
      .join(" · "),
    href: `/garden/objects/${encodeURIComponent(payload.plantObjectId)}#follow-up-composer`,
  };
}

function photoLabel(payload: FollowUpEntryDraftPayload) {
  return payload.photoIntent ? "Photo attached" : null;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.find((value) => (value ?? "").trim().length > 0)?.trim();
}
