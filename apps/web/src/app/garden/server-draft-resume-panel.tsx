"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { useOptionalDocumentMutationGeneration } from "@/components/auth/document-mutation-recovery";
import { useInterfaceLocaleChangeFormState } from "@/components/site-shell/interface-locale-change-boundary";
import { Button } from "@/components/ui/button";
import {
  formatGardenWorkspaceDate,
  getGardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import type { JournalEntryDraftReceiptV1 } from "@/lib/garden/entry-contracts";
import { createOnlineJournalDraftOwner } from "@/lib/garden/online-journal-draft";
import type { InterfaceLocale } from "@/lib/interface-localization";

export function ServerDraftResumePanel({
  drafts: initialDrafts,
  locale,
}: {
  drafts: JournalEntryDraftReceiptV1[];
  locale: InterfaceLocale;
}) {
  const copy = getGardenWorkspaceCopy(locale);
  const documentMutation = useOptionalDocumentMutationGeneration();
  const router = useRouter();
  const [drafts, setDrafts] = useState(initialDrafts);
  const [discardingKey, setDiscardingKey] = useState<string | null>(null);
  const [discardErrorKey, setDiscardErrorKey] = useState<string | null>(null);

  useInterfaceLocaleChangeFormState({
    id: "garden-server-draft-discard",
    dirty: false,
    pending: discardingKey !== null,
  });

  async function handleDiscard(draft: JournalEntryDraftReceiptV1) {
    const transport = documentMutation?.transport?.trim();
    if (!transport || discardingKey) {
      setDiscardErrorKey(draft.draftKey);
      return;
    }

    setDiscardingKey(draft.draftKey);
    setDiscardErrorKey(null);
    const owner = createOnlineJournalDraftOwner({
      draftKey: draft.draftKey,
      draftKind: draft.draftKind,
      context: draft.context,
      documentMutationGeneration: transport,
    });
    try {
      await owner.delete(draft);
      setDrafts((current) =>
        current.filter((item) => item.draftKey !== draft.draftKey),
      );
      router.refresh();
    } catch {
      setDiscardErrorKey(draft.draftKey);
    } finally {
      owner.abort();
      setDiscardingKey(null);
    }
  }

  if (drafts.length === 0) return null;

  return (
    <section
      id="server-drafts"
      data-garden-server-drafts="true"
      className="mx-4 mt-6 flex flex-col gap-3 rounded-lg border border-border p-4 sm:mx-6"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">
          {copy.draftResume.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {copy.draftResume.description}
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {drafts.map((draft) => {
          const summary = summarizeDraft(draft, locale, copy.draftResume);
          const pending = discardingKey === draft.draftKey;
          return (
            <li
              key={draft.draftKey}
              className="flex flex-col gap-3 rounded-lg border border-border p-3"
            >
              <div className="flex min-w-0 gap-2">
                <FileText
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
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
                  {copy.draftResume.resume}
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  disabled={discardingKey !== null}
                  aria-busy={pending || undefined}
                  onClick={() => void handleDiscard(draft)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {copy.draftResume.discard}
                </Button>
              </div>
              {discardErrorKey === draft.draftKey ? (
                <p className="text-xs text-destructive" role="alert">
                  {copy.draftResume.discardFailed}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function summarizeDraft(
  draft: JournalEntryDraftReceiptV1,
  locale: InterfaceLocale,
  copy: ReturnType<typeof getGardenWorkspaceCopy>["draftResume"],
) {
  const request = draft.payload.request;
  const title = request.title?.trim() || copy.untitled;
  const date = request.entryDate
    ? formatGardenWorkspaceDate(locale, request.entryDate, "short")
    : formatGardenWorkspaceDate(locale, draft.updatedAt, "short");

  switch (draft.draftKind) {
    case "first_entry":
      return {
        title,
        subtitle: `${copy.firstEntry} · ${date}`,
        href: "/garden#first-entry-composer",
      };
    case "follow_up": {
      const objectId =
        draft.context.plantObjectId ??
        ("plantObjectId" in request ? request.plantObjectId : null);
      return {
        title,
        subtitle: `${copy.followUp} · ${date}`,
        href: objectId
          ? `/garden/objects/${encodeURIComponent(objectId)}#follow-up-composer`
          : "/garden",
      };
    }
    case "space_entry": {
      const spaceId =
        draft.context.spaceId ??
        ("spaceId" in request ? request.spaceId : null);
      return {
        title,
        subtitle: `${copy.spaceEntry} · ${date}`,
        href: spaceId
          ? `/garden?space=${encodeURIComponent(spaceId)}#space-journal`
          : "/garden",
      };
    }
    case "edit_entry": {
      const entryId =
        draft.context.journalEntryId ??
        ("entryId" in request ? request.entryId : null);
      return {
        title,
        subtitle: `${copy.editEntry} · ${date}`,
        href: entryId
          ? `/garden/entries/${encodeURIComponent(entryId)}/edit`
          : "/garden",
      };
    }
  }
}
