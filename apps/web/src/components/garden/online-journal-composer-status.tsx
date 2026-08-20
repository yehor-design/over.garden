"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Copy,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { GardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import type { OnlineJournalComposerState } from "@/lib/garden/use-online-journal-composer";
import type { InterfaceLocale } from "@/lib/interface-localization";

export function OnlineJournalComposerStatus({
  state,
  locale,
  copy,
  unsavedText,
  navigationHref,
  onRetry,
  onCancel,
}: {
  state: OnlineJournalComposerState;
  locale: InterfaceLocale;
  copy: GardenWorkspaceCopy;
  unsavedText: string;
  navigationHref: string;
  onRetry: () => Promise<unknown>;
  onCancel: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const retryRef = useRef<HTMLButtonElement | null>(null);
  const restoreRetryFocusRef = useRef(false);
  const online = copy.composer.online;
  const failed =
    state.status === "connection_required" || state.status === "conflict";
  const label = statusLabel(state, locale, copy);

  useEffect(() => {
    if (!restoreRetryFocusRef.current) return;
    if (failed && retryRef.current) {
      retryRef.current.focus();
      restoreRetryFocusRef.current = false;
      return;
    }
    if (["idle", "saved", "consumed"].includes(state.status)) {
      restoreRetryFocusRef.current = false;
    }
  }, [failed, state.status]);

  async function copyUnsavedText() {
    await navigator.clipboard.writeText(unsavedText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <div
      data-online-composer-state={state.status}
      className={
        failed
          ? "grid gap-3 border-y border-destructive/40 bg-destructive/5 py-3"
          : "flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      }
    >
      <p
        className={
          failed
            ? "flex items-start gap-2 text-sm text-destructive"
            : "flex items-center gap-1.5"
        }
        role="status"
        aria-live="polite"
      >
        {failed ? (
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        ) : state.status === "saved" ? (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        ) : (
          <Clock3 className="size-4" aria-hidden="true" />
        )}
        <span>{label}</span>
      </p>
      {failed ? (
        <div className="flex flex-wrap gap-2">
          <Button
            ref={retryRef}
            type="button"
            size="sm"
            data-online-composer-action="retry"
            onClick={() => {
              restoreRetryFocusRef.current = true;
              void onRetry().catch(() => undefined);
            }}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {online.retry}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-online-composer-action="copy"
            onClick={() => void copyUnsavedText()}
          >
            <Copy className="size-4" aria-hidden="true" />
            {copied ? online.copied : online.copyUnsaved}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-online-composer-action="cancel"
            onClick={onCancel}
          >
            {online.cancel}
          </Button>
          <Link
            href={navigationHref}
            data-online-composer-action="navigate"
            className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {online.navigate}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function statusLabel(
  state: OnlineJournalComposerState,
  locale: InterfaceLocale,
  copy: GardenWorkspaceCopy,
) {
  const online = copy.composer.online;
  switch (state.status) {
    case "awaiting_session":
    case "hydrating":
      return online.hydrating;
    case "idle":
      return online.ready;
    case "dirty":
      return online.notSaved;
    case "saving":
      return online.saving;
    case "saved":
      return state.savedAt
        ? online.savedAt.replace(
            "{time}",
            formatServerTime(state.savedAt, locale),
          )
        : online.saving;
    case "publishing":
      return online.publishing;
    case "consumed":
      return online.published;
    case "conflict":
      return online.conflict;
    case "connection_required":
      return online.connectionRequired;
  }
}

function formatServerTime(value: string, locale: InterfaceLocale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(
    locale === "uk" ? "uk-UA" : locale === "bg" ? "bg-BG" : "ru-RU",
    { hour: "2-digit", minute: "2-digit", second: "2-digit" },
  ).format(date);
}
