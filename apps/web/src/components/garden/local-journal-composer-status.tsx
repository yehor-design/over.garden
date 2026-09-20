"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { LocalJournalMediaLease } from "@/lib/garden/local-journal-media-coordinator";
import type { AtomicJournalCreateCopy } from "@/lib/garden/atomic-journal-create-copy";
import type { LocalJournalComposerState } from "@/lib/garden/use-local-journal-composer";
import { Checkbox } from "@/components/ui/checkbox";

export interface LocalJournalComposerStatusCopy {
  localOnly: string;
  leaseAtRisk: string;
  waitingMedia: string;
  publishing: string;
  published: string;
  failed: string;
  cancelPublishing: string;
}

export function LocalJournalComposerStatus({
  state,
  lease = "held",
  copy,
  onCancelPublishing,
}: {
  state: LocalJournalComposerState;
  /** Whether the staging lease is still being renewed (`OVE-458` AC4). */
  lease?: LocalJournalMediaLease;
  copy: LocalJournalComposerStatusCopy;
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
    <div
      className="grid gap-2"
      data-local-journal-composer-status={state.status}
    >
      <p
        className={
          state.status === "failed"
            ? "text-body-sm text-danger-text"
            : "text-body-sm text-text-muted"
        }
        role={state.status === "failed" ? "alert" : "status"}
        aria-live="polite"
      >
        {message}
      </p>
      {/* A lease that cannot be renewed says so **before** the work is lost:
          the Worker holds staged photographs for two hours and the renewal
          runs every five minutes, so two failures in a row leave hours of
          margin and all of it usable (`OVE-458` AC4). */}
      {lease === "at_risk" ? (
        <Callout tone="warning" data-media-lease="at_risk">
          <p>{copy.leaseAtRisk}</p>
        </Callout>
      ) : null}
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
      <Checkbox
        name="publicationDisclosureAccepted"
        required
        checked={accepted}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        label={copy.disclosure}
      />
      <Link
        href="/first-publication-disclosure"
        className="ml-6 justify-self-start text-caption text-text-muted underline"
        target="_blank"
      >
        {copy.disclosureLink}
      </Link>
    </div>
  );
}
