/**
 * Progressive journal cover controls (OVE-207).
 * Optional Cover section — never required on the shortest create path, and
 * not on the screen at all until the entry has a photograph (`OVE-487`).
 *
 * `OVE-458` AC7 rewrote how the section states itself. Before, the choice lived
 * in a button's fill: the selected mode was the one rendered `primary`, which
 * is colour alone (WCAG 1.4.1), announced to nobody, and two of the four
 * buttons — "Автоматично" and "Повернути автоматичну" — dispatched the same
 * `{ mode: "automatic" }`. Now the section says its value in words, every
 * toggle carries `aria-pressed`, and the duplicate is gone.
 */

"use client";

import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { type JournalCoverMode } from "@/lib/garden/journal-cover-contract";
import {
  COMPOSER_PHOTO_ACCEPT,
  createComposerPhotoIntent,
  type OnlineComposerPhotoIntent,
} from "@/lib/garden/composer-photo-selection";
import { cn } from "@/lib/utils";
import { SubjectAwareHtmlImage } from "@/components/media/subject-aware-media-image";
import type { JournalImageUiState } from "./lexical-journal/journal-lexical-image-node";
import { FileDrop } from "@/components/ui/file-drop";

export interface JournalCoverControlsCopy {
  sectionLabel: string;
  sectionHint: string;
  automatic: string;
  useAsCover: string;
  uploadSeparate: string;
  replaceSeparate: string;
  previewLabel: string;
  noCover: string;
  uploading: string;
  keepAsCover: string;
  removeEverywhere: string;
  cancelRemoval: string;
  removeInlinePrompt: string;
  eligibleInlineEmpty: string;
  preparing: string;
  failed: string;
  retry: string;
  /** Prefixes the visible value, and badges the chosen photograph. */
  currentLabel: string;
  /** The value when a photograph from the story is the cover. */
  valueInline: string;
  /** The value when a photograph uploaded only for the cover is the cover. */
  valueSeparate: string;
  /**
   * A photograph in the story, by its position: "Фото 2". The thumbnails read
   * as names now rather than as instructions, so the label under one has to be
   * a name — `useAsCover` is the action, and it stays on the control.
   */
  photoOrdinal: string;
}

/** `photoOrdinal` with its one placeholder filled. */
export function journalCoverPhotoLabel(
  copy: JournalCoverControlsCopy,
  index: number,
): string {
  return copy.photoOrdinal.replaceAll("{index}", String(index + 1));
}

export type JournalCoverSelectionState =
  | { mode: "automatic" }
  | { mode: "none" }
  | {
      mode: "explicit_inline";
      mediaAssetId: string;
      previewUrl?: string | null;
    }
  | {
      mode: "separate";
      mediaAssetId?: string | null;
      photoIntent?: OnlineComposerPhotoIntent | null;
      previewUrl?: string | null;
    };

export interface JournalCoverEligibleInline {
  mediaAssetId: string;
  previewUrl: string | null;
  label: string;
}

export interface JournalCoverControlsProps {
  copy: JournalCoverControlsCopy;
  selection: JournalCoverSelectionState;
  eligibleInline: readonly JournalCoverEligibleInline[];
  disabled?: boolean;
  className?: string;
  onChange: (next: JournalCoverSelectionState) => void;
  onSelectSeparateFile?: (
    intent: OnlineComposerPhotoIntent,
    file: File,
  ) => Promise<{ mediaAssetId: string; previewUrl?: string | null }>;
  onSelectLocalSeparateFile?: (
    file: File,
  ) => Promise<{ mediaAssetId: string; previewUrl?: string | null }>;
  selectedLocalMediaState?: JournalImageUiState;
  onRetrySelectedLocal?: (mediaAssetId: string) => void;
  /**
   * When removing an explicit-inline image that is currently cover, ask before
   * clearing. Parent calls this when an image block is deleted.
   */
  pendingInlineRemoval?: {
    mediaAssetId: string;
  } | null;
  onResolveInlineRemoval?: (
    choice: "keep_as_cover" | "remove_everywhere" | "cancel",
  ) => void;
}

export function isJournalMediaWaitSafeControlDisabled(
  formDisabled: boolean,
): boolean {
  return formDisabled;
}

export function JournalCoverControls({
  copy,
  selection,
  eligibleInline,
  disabled = false,
  className,
  onChange,
  onSelectSeparateFile,
  onSelectLocalSeparateFile,
  selectedLocalMediaState,
  onRetrySelectedLocal,
  pendingInlineRemoval = null,
  onResolveInlineRemoval,
}: JournalCoverControlsProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const previewUrl = resolveCoverPreviewUrl(selection, eligibleInline);
  const valueText = describeCoverSelection(selection, eligibleInline, copy);

  // A cover is a choice between photographs, so there is nothing to choose
  // until the entry has one (`OVE-487` criterion 3): a plain note never meets
  // this section, and a first photograph brings it.
  if (
    !journalCoverHasSuitableMedia(
      selection,
      eligibleInline,
      pendingInlineRemoval,
      uploading,
    )
  ) {
    return null;
  }

  async function onPickSeparate(file: File | null) {
    if (!file || disabled) return;
    setUploading(true);
    try {
      const intent = onSelectLocalSeparateFile
        ? null
        : await createComposerPhotoIntent(file);
      const uploaded = onSelectLocalSeparateFile
        ? await onSelectLocalSeparateFile(file)
        : await onSelectSeparateFile?.(intent!, file);
      const preview =
        uploaded?.previewUrl ??
        (onSelectLocalSeparateFile ? null : URL.createObjectURL(file));
      onChange({
        mode: "separate",
        mediaAssetId: uploaded?.mediaAssetId ?? null,
        photoIntent: uploaded ? null : intent,
        previewUrl: preview,
      });
    } finally {
      setUploading(false);
    }
  }

  const coverPreviewMode = "cover" as const;

  return (
    <section
      className={cn("grid gap-3 border-y border-border py-3", className)}
      data-journal-cover-controls="true"
      data-journal-cover-mode={selection.mode}
      aria-labelledby={`${inputId}-label`}
    >
      <div className="grid gap-1">
        <h2 id={`${inputId}-label`} className="text-h4 text-text-heading">
          {copy.sectionLabel}
        </h2>
        <p className="text-caption text-text-muted">{copy.sectionHint}</p>
        {/* The value, in words. A fill is not a value: it says nothing to a
            screen reader, nothing in high contrast and nothing to anyone who
            cannot tell this green from that one (`OVE-458` AC7). */}
        <p
          data-journal-cover-value="true"
          className="text-body-sm text-text"
          aria-live="polite"
        >
          {copy.currentLabel}: {valueText}
        </p>
      </div>

      {previewUrl ? (
        <figure className="grid gap-1">
          <figcaption className="text-caption text-text-muted">
            {copy.previewLabel}
          </figcaption>
          <SubjectAwareHtmlImage
            src={previewUrl}
            alt=""
            presentationMode={coverPreviewMode}
            className="max-h-40 w-full"
            data-journal-cover-preview="true"
          />
        </figure>
      ) : null}

      {selectedLocalMediaState &&
      selectedLocalMediaState.status !== "ready" &&
      selectedLocalMediaState.status !== "failed" ? (
        <p className="text-caption text-text-muted" role="status">
          {copy.preparing}
        </p>
      ) : null}
      {selectedLocalMediaState?.status === "failed" ? (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="text-caption text-danger-text">{copy.failed}</p>
          {onRetrySelectedLocal &&
          (selection.mode === "explicit_inline" ||
            selection.mode === "separate") &&
          selection.mediaAssetId ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() => onRetrySelectedLocal(selection.mediaAssetId!)}
            >
              {copy.retry}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-labelledby={`${inputId}-label`}
      >
        <Button
          type="button"
          variant={selection.mode === "automatic" ? "primary" : "secondary"}
          size="sm"
          aria-pressed={selection.mode === "automatic"}
          disabled={disabled || uploading}
          onClick={() => onChange({ mode: "automatic" })}
        >
          {copy.automatic}
        </Button>
        <Button
          type="button"
          variant={selection.mode === "separate" ? "primary" : "secondary"}
          size="sm"
          aria-pressed={selection.mode === "separate"}
          disabled={disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading
            ? copy.uploading
            : selection.mode === "separate"
              ? copy.replaceSeparate
              : copy.uploadSeparate}
        </Button>
        <Button
          type="button"
          variant={selection.mode === "none" ? "primary" : "secondary"}
          size="sm"
          aria-pressed={selection.mode === "none"}
          disabled={isJournalMediaWaitSafeControlDisabled(disabled)}
          onClick={() => onChange({ mode: "none" })}
        >
          {copy.noCover}
        </Button>
      </div>

      <FileDrop
        ref={fileInputRef}
        id={inputId}
        accept={COMPOSER_PHOTO_ACCEPT}
        disabled={disabled || uploading}
        label={copy.uploadSeparate}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = "";
          void onPickSeparate(file).catch(() => undefined);
        }}
      />

      {eligibleInline.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {eligibleInline.map((item) => {
            const selected =
              selection.mode === "explicit_inline" &&
              selection.mediaAssetId === item.mediaAssetId;
            return (
              <li key={item.mediaAssetId}>
                <button
                  type="button"
                  disabled={disabled || uploading}
                  aria-pressed={selected}
                  aria-label={`${copy.useAsCover}: ${item.label}`}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left text-body-sm",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                    "disabled:cursor-not-allowed disabled:text-text-disabled",
                    selected
                      ? "border-action bg-action-subtle text-action-subtle-text"
                      : "border-border-control text-text hover:bg-surface-hover",
                  )}
                  onClick={() =>
                    onChange({
                      mode: "explicit_inline",
                      mediaAssetId: item.mediaAssetId,
                      previewUrl: item.previewUrl,
                    })
                  }
                >
                  {item.previewUrl ? (
                    <SubjectAwareHtmlImage
                      src={item.previewUrl}
                      alt=""
                      presentationMode={coverPreviewMode}
                      className="size-10"
                    />
                  ) : (
                    <span
                      className="size-10 rounded-sm bg-surface-sunken"
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {selected ? (
                    <span
                      data-journal-cover-selected="true"
                      className="shrink-0 text-caption font-medium"
                    >
                      {copy.currentLabel}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-caption text-text-muted">
          {copy.eligibleInlineEmpty}
        </p>
      )}

      {pendingInlineRemoval && onResolveInlineRemoval ? (
        <div
          className="grid gap-2 rounded-md border border-border p-3"
          role="alertdialog"
          aria-labelledby={`${inputId}-remove-prompt`}
          data-journal-cover-remove-prompt="true"
        >
          <p id={`${inputId}-remove-prompt`} className="text-body-sm text-text">
            {copy.removeInlinePrompt}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => onResolveInlineRemoval("keep_as_cover")}
            >
              {copy.keepAsCover}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onResolveInlineRemoval("remove_everywhere")}
            >
              {copy.removeEverywhere}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onResolveInlineRemoval("cancel")}
            >
              {copy.cancelRemoval}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Whether the cover section has anything to decide: a photograph in the
 * story, a cover photograph of its own, or a removal waiting for an answer.
 */
export function journalCoverHasSuitableMedia(
  selection: JournalCoverSelectionState,
  eligibleInline: readonly JournalCoverEligibleInline[],
  pendingInlineRemoval: { mediaAssetId: string } | null = null,
  uploading = false,
): boolean {
  return (
    eligibleInline.length > 0 ||
    selection.mode === "separate" ||
    selection.mode === "explicit_inline" ||
    pendingInlineRemoval !== null ||
    uploading
  );
}

export function resolveCoverPreviewUrl(
  selection: JournalCoverSelectionState,
  eligibleInline: readonly JournalCoverEligibleInline[],
): string | null {
  switch (selection.mode) {
    case "automatic": {
      const first = eligibleInline[0];
      return first?.previewUrl ?? null;
    }
    case "none":
      return null;
    case "explicit_inline":
      return (
        selection.previewUrl ??
        eligibleInline.find(
          (item) => item.mediaAssetId === selection.mediaAssetId,
        )?.previewUrl ??
        null
      );
    case "separate":
      return selection.previewUrl ?? null;
    default: {
      const _exhaustive: never = selection;
      return _exhaustive;
    }
  }
}

/**
 * The cover's value as a reader would say it (`OVE-458` AC7).
 *
 * A chosen photograph is named by its own label where the composer knows one —
 * "Обрано: Фото 2" is a value; "Обрано: Фото з історії" is a category, and only
 * the fallback.
 */
export function describeCoverSelection(
  selection: JournalCoverSelectionState,
  eligibleInline: readonly JournalCoverEligibleInline[],
  copy: JournalCoverControlsCopy,
): string {
  if (selection.mode === "explicit_inline") {
    const chosen = eligibleInline.find(
      (item) => item.mediaAssetId === selection.mediaAssetId,
    );
    return chosen?.label ?? copy.valueInline;
  }
  return inferCoverModeLabel(selection.mode, copy);
}

export function journalCoverSelectionToClaimInput(
  selection: JournalCoverSelectionState,
  options?: { separateMediaAssetId?: string | null },
):
  | { mode: "automatic" }
  | { mode: "none" }
  | { mode: "explicit_inline"; mediaAssetId: string }
  | { mode: "separate"; mediaAssetId: string }
  | { mode: "keep_as_cover"; mediaAssetId: string } {
  switch (selection.mode) {
    case "automatic":
      return { mode: "automatic" };
    case "none":
      return { mode: "none" };
    case "explicit_inline":
      return {
        mode: "explicit_inline",
        mediaAssetId: selection.mediaAssetId,
      };
    case "separate": {
      const mediaAssetId =
        options?.separateMediaAssetId ?? selection.mediaAssetId ?? null;
      if (!mediaAssetId) {
        // Separate image still uploading — fall back to automatic until ready.
        return { mode: "automatic" };
      }
      return { mode: "separate", mediaAssetId };
    }
    default: {
      const _exhaustive: never = selection;
      return _exhaustive;
    }
  }
}

export function inferCoverModeLabel(
  mode: JournalCoverMode,
  copy: JournalCoverControlsCopy,
): string {
  switch (mode) {
    case "automatic":
      return copy.automatic;
    case "explicit_inline":
      return copy.valueInline;
    case "separate":
      return copy.valueSeparate;
    case "none":
      return copy.noCover;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}
