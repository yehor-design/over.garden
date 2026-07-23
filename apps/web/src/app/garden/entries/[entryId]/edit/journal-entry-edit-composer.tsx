"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { StructuredJournalComposer } from "@/components/garden/structured-journal-composer";
import type { StructuredJournalComposerHandle } from "@/components/garden/structured-journal-composer";
import { Button } from "@/components/ui/button";
import type { JournalDocumentV1 } from "@/lib/garden/journal-document";
import { extractJournalDocumentPlainText } from "@/lib/garden/journal-document";
import { createComposerPhotoIntent } from "@/lib/garden/composer-photo-selection";
import type { PublicLocale } from "@/lib/public-localization";
import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";

export function JournalEntryEditComposer({
  locale,
  entryId,
  title: initialTitle,
  entryDate: initialEntryDate,
  expectedRevision: initialRevision,
  initialDocument,
  documentUnavailable,
  imagePreviewUrls,
}: {
  locale: PublicLocale;
  entryId: string;
  title: string;
  entryDate: string;
  expectedRevision: number;
  initialDocument: JournalDocumentV1 | null;
  documentUnavailable: boolean;
  imagePreviewUrls: Record<string, string>;
}) {
  const router = useRouter();
  const composerRef = useRef<StructuredJournalComposerHandle | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [entryDate, setEntryDate] = useState(initialEntryDate);
  const [document, setDocument] = useState<JournalDocumentV1 | null>(
    initialDocument,
  );
  const [expectedRevision, setExpectedRevision] = useState(initialRevision);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const labels = getStructuredJournalComposerLabels(locale);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const flushed =
        (await composerRef.current?.flushLatest()) ?? document;
      if (!flushed) {
        setMessage(labels.failureBody);
        return;
      }
      const response = await fetch(`/api/garden/entries/${entryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          entryDate,
          contentDocument: flushed,
          body: extractJournalDocumentPlainText(flushed),
          expectedRevision,
          clientMutationId: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        currentRevision?: number;
        entry?: { journalRevision?: number };
      } | null;
      if (response.status === 409) {
        setMessage(payload?.error ?? "Conflict");
        if (payload?.currentRevision) {
          setExpectedRevision(payload.currentRevision);
        }
        return;
      }
      if (!response.ok) {
        setMessage(payload?.error ?? labels.failureBody);
        return;
      }
      if (payload?.entry?.journalRevision) {
        setExpectedRevision(payload.entry.journalRevision);
      }
      router.refresh();
      setMessage(labels.saveLabel);
    } finally {
      setSaving(false);
    }
  }

  if (documentUnavailable) {
    return (
      <section className="grid gap-3">
        <h1 className="text-2xl font-medium">{labels.unavailableTitle}</h1>
        <p className="text-muted-foreground">{labels.unavailableBody}</p>
      </section>
    );
  }

  return (
    <section className="grid gap-4" data-journal-entry-edit="true">
      <label className="grid gap-1">
        <span className="text-sm font-medium">{labels.titleLabel}</span>
        <input
          className="h-10 rounded-md border border-input px-3"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label={labels.titleLabel}
        />
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-medium">{labels.dateLabel}</span>
        <input
          type="date"
          className="h-10 rounded-md border border-input px-3"
          value={entryDate}
          onChange={(event) => setEntryDate(event.target.value)}
          aria-label={labels.dateLabel}
        />
      </label>
      <StructuredJournalComposer
        locale={locale}
        labels={labels}
        initialDocument={document}
        imagePreviewUrls={new Map(Object.entries(imagePreviewUrls))}
        composerRef={composerRef}
        onDocumentChange={setDocument}
        onSelectImageFile={async (file) => {
          await createComposerPhotoIntent(file);
          return { previewUrl: URL.createObjectURL(file) };
        }}
      />
      <div className="flex items-center gap-3">
        <Button type="button" disabled={saving} onClick={() => void save()}>
          {labels.saveLabel}
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </section>
  );
}
