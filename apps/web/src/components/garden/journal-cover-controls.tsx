/**
 * Progressive journal cover controls (OVE-207).
 * Optional Cover section — never required on the shortest create path.
 */

"use client";

import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  OWNER_COMPOSER_COVER_UPLOAD_PARTICIPANT_ID,
  type JournalCoverMode,
} from "@/lib/garden/journal-cover-contract";
import {
  COMPOSER_PHOTO_ACCEPT,
  createComposerPhotoIntent,
} from "@/lib/garden/composer-photo-selection";
import { interfaceLocaleChangeCoordinator } from "@/lib/interface-locale-change-coordinator";
import type { OfflinePhotoIntent } from "@/lib/offline/queue";
import { cn } from "@/lib/utils";
import { SubjectAwareHtmlImage } from "@/components/media/subject-aware-media-image";

export interface JournalCoverControlsCopy {
  sectionLabel: string;
  sectionHint: string;
  automatic: string;
  useAsCover: string;
  uploadSeparate: string;
  replaceSeparate: string;
  removeCover: string;
  previewLabel: string;
  noCover: string;
  uploading: string;
  keepAsCover: string;
  removeEverywhere: string;
  cancelRemoval: string;
  removeInlinePrompt: string;
  eligibleInlineEmpty: string;
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
      photoIntent?: OfflinePhotoIntent | null;
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

export function JournalCoverControls({
  copy,
  selection,
  eligibleInline,
  disabled = false,
  className,
  onChange,
  pendingInlineRemoval = null,
  onResolveInlineRemoval,
}: JournalCoverControlsProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const previewUrl = resolveCoverPreviewUrl(selection, eligibleInline);

  async function onPickSeparate(file: File | null) {
    if (!file || disabled) return;
    setUploading(true);
    const unregisterInFlight = interfaceLocaleChangeCoordinator.register({
      id: OWNER_COMPOSER_COVER_UPLOAD_PARTICIPANT_ID,
      kind: "in-flight",
    });
    try {
      const intent = await createComposerPhotoIntent(file);
      const preview = URL.createObjectURL(file);
      onChange({
        mode: "separate",
        mediaAssetId: null,
        photoIntent: intent,
        previewUrl: preview,
      });
    } finally {
      setUploading(false);
      unregisterInFlight();
    }
  }

  const coverPreviewMode = "cover" as const;

  return (
    <section
      className={cn("grid gap-3 border-y border-border py-3", className)}
      data-journal-cover-controls="true"
      aria-labelledby={`${inputId}-label`}
    >
      <div className="grid gap-1">
        <h2
          id={`${inputId}-label`}
          className="text-sm font-medium text-foreground"
        >
          {copy.sectionLabel}
        </h2>
        <p className="text-xs text-muted-foreground">{copy.sectionHint}</p>
      </div>

      {previewUrl ? (
        <figure className="grid gap-1">
          <figcaption className="text-xs text-muted-foreground">
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
      ) : selection.mode === "none" ? (
        <p className="text-xs text-muted-foreground">{copy.noCover}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={selection.mode === "automatic" ? "default" : "outline"}
          size="sm"
          disabled={disabled || uploading}
          onClick={() => onChange({ mode: "automatic" })}
        >
          {copy.automatic}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading
            ? copy.uploading
            : selection.mode === "separate"
              ? copy.replaceSeparate
              : copy.uploadSeparate}
        </Button>
        {(selection.mode === "explicit_inline" ||
          selection.mode === "separate" ||
          selection.mode === "none") && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => onChange({ mode: "automatic" })}
          >
            {copy.removeCover}
          </Button>
        )}
        <Button
          type="button"
          variant={selection.mode === "none" ? "default" : "ghost"}
          size="sm"
          disabled={disabled || uploading}
          onClick={() => onChange({ mode: "none" })}
        >
          {copy.noCover}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept={COMPOSER_PHOTO_ACCEPT}
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = "";
          void onPickSeparate(file);
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
                  className={cn(
                    "flex w-full items-center gap-2 border border-border px-2 py-2 text-left text-sm",
                    selected && "border-foreground",
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
                    <span className="size-10 bg-muted" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {selected ? copy.useAsCover : item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {copy.eligibleInlineEmpty}
        </p>
      )}

      {pendingInlineRemoval && onResolveInlineRemoval ? (
        <div
          className="grid gap-2 border border-border p-3"
          role="alertdialog"
          aria-labelledby={`${inputId}-remove-prompt`}
          data-journal-cover-remove-prompt="true"
        >
          <p id={`${inputId}-remove-prompt`} className="text-sm">
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
              variant="outline"
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
        eligibleInline.find((item) => item.mediaAssetId === selection.mediaAssetId)
          ?.previewUrl ??
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
        // Separate intent still uploading — fall back to automatic until sync.
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

export function journalCoverSelectionToOfflinePayload(
  selection: JournalCoverSelectionState,
):
  | { mode: "automatic" }
  | { mode: "none" }
  | { mode: "explicit_inline"; mediaAssetId: string }
  | {
      mode: "separate";
      mediaAssetId?: string | null;
      photoIntent?: OfflinePhotoIntent | null;
    } {
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
    case "separate":
      return {
        mode: "separate",
        mediaAssetId: selection.mediaAssetId ?? null,
        photoIntent: selection.photoIntent ?? null,
      };
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
      return copy.useAsCover;
    case "separate":
      return copy.uploadSeparate;
    case "none":
      return copy.noCover;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}
