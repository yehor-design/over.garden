"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { AtomicJournalCreateCopy } from "@/lib/garden/atomic-journal-create-copy";
import type { LocalJournalComposerState } from "@/lib/garden/use-local-journal-composer";

export function LocalJournalComposerStatus({
  state,
  copy,
  onCancelPublishing,
}: {
  state: LocalJournalComposerState;
  copy: AtomicJournalCreateCopy;
  onCancelPublishing(): void;
}) {
  const waiting =
    state.status === "freezing" ||
    state.status === "waiting_media" ||
    state.status === "publishing";
  const message =
    state.status === "freezing" || state.status === "waiting_media"
      ? copy.waitingMedia
      : state.status === "publishing"
        ? copy.publishing
        : state.status === "published"
          ? copy.published
          : state.status === "failed"
            ? copy.failed
            : copy.localOnly;

  return (
    <div className="grid gap-2" data-local-journal-composer-status={state.status}>
      <p
        className={
          state.status === "failed"
            ? "text-sm text-destructive"
            : "text-sm text-muted-foreground"
        }
        role={state.status === "failed" ? "alert" : "status"}
        aria-live="polite"
      >
        {message}
      </p>
      {waiting ? (
        <Button
          type="button"
          variant="ghost"
          className="justify-self-start"
          onClick={onCancelPublishing}
        >
          {copy.cancelPublishing}
        </Button>
      ) : null}
    </div>
  );
}

export function LocalJournalPublicationDisclosure({
  accepted,
  disabled,
  copy,
  onChange,
}: {
  accepted: boolean;
  disabled: boolean;
  copy: AtomicJournalCreateCopy;
  onChange(value: boolean): void;
}) {
  return (
    <div className="grid gap-1 border-y border-border py-3">
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="publicationDisclosureAccepted"
          required
          checked={accepted}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
          className="mt-0.5 size-4"
        />
        <span>{copy.disclosure}</span>
      </label>
      <Link
        href="/first-publication-disclosure"
        className="ml-6 justify-self-start text-xs text-muted-foreground underline"
        target="_blank"
      >
        {copy.disclosureLink}
      </Link>
    </div>
  );
}
