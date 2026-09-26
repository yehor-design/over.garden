"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import type { OwnedPhotoView } from "@/lib/garden/owned-photo";
import type { OwnedPhotoUpload } from "@/lib/garden/use-owned-photo-upload";
import type { OwnedPhotoCopy } from "@/lib/owned-photo-copy";

// The editor is loaded when a photo is chosen, never with the page.
const PhotoCropEditor = dynamic(
  () => import("@/components/ui/photo-crop-editor"),
  {
    ssr: false,
  },
);

/** The cover's aspect (DESIGN.md §2, `--aspect-cover`): the crop's frame. */
export const OWNED_PHOTO_ASPECT = 16 / 9;

/**
 * The one photo of a space or a plant or animal (DESIGN.md §5.25): choose it
 * from the camera or the gallery, crop and turn it in the frame, and it
 * uploads at once — «Завантажуємо фото…», then the photo itself, with
 * «Замінити» and «Прибрати». The same field serves both steppers and both
 * settings pages; what happens to the staged photo is the owner's
 * (`OwnedPhotoUpload`).
 *
 * `current` is the photo the owner already has (settings): it shows until a
 * new one is chosen, and «Прибрати» asks `onRemoveCurrent` to take it away.
 */
export function OwnedPhotoField({
  upload,
  copy,
  alt,
  current = null,
  onRemoveCurrent,
  onEditingChange,
  disabled = false,
}: {
  upload: OwnedPhotoUpload;
  copy: OwnedPhotoCopy;
  /** What the photo shows, for its `alt`: «Фото простору «Балкон»». */
  alt: string;
  current?: OwnedPhotoView | null;
  onRemoveCurrent?: () => void;
  /** The editor opened or closed: a stepper holds its own buttons meanwhile. */
  onEditingChange?: (editing: boolean) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState<File | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const wasEditing = useRef(false);

  // The editor unmounts on «Готово» and «Скасувати»; focus goes back into the
  // field (the first control there: «Замінити», or the picker again) instead
  // of falling to the page, where Escape and Tab would start from nowhere.
  const editingChanged = useRef(onEditingChange);
  useEffect(() => {
    editingChanged.current = onEditingChange;
  });
  useEffect(() => {
    if (editing) {
      wasEditing.current = true;
      editingChanged.current?.(true);
      return;
    }
    if (!wasEditing.current) return;
    wasEditing.current = false;
    editingChanged.current?.(false);
    fieldRef.current
      ?.querySelector<HTMLElement>(
        "[data-owned-photo-replace], [data-owned-photo-input]",
      )
      ?.focus();
  }, [editing]);

  const choose = (files: File[]) => {
    const file = files.find((candidate) => candidate.type.startsWith("image/"));
    if (file) setEditing(file);
  };

  if (editing) {
    return (
      <div data-owned-photo-field="editing">
        <PhotoCropEditor
          file={editing}
          aspect={OWNED_PHOTO_ASPECT}
          copy={copy.editor}
          onCancel={() => setEditing(null)}
          onDone={(image) => {
            setEditing(null);
            upload.set(image);
          }}
        />
      </div>
    );
  }

  const shown =
    upload.status !== "empty"
      ? upload.previewUrl
        ? { src: upload.previewUrl, srcSet: null }
        : null
      : current
        ? { src: current.src, srcSet: current.srcSet }
        : null;
  const state =
    upload.status !== "empty" ? upload.status : current ? "current" : "empty";

  if (state === "empty") {
    return (
      <div ref={fieldRef} data-owned-photo-field="empty">
        <FileDrop
          presentation="zone"
          label={copy.add}
          hint={copy.hint}
          accept="image/*"
          disabled={disabled}
          data-owned-photo-input="true"
          onSelectFiles={choose}
        />
      </div>
    );
  }

  return (
    <div ref={fieldRef} data-owned-photo-field={state} className="grid gap-3">
      <div className="relative aspect-cover w-full overflow-hidden rounded-lg bg-surface-sunken">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local preview or the stored WebP with its own srcset
          <img
            src={shown.src}
            srcSet={shown.srcSet ?? undefined}
            sizes="(min-width: 40rem) 36rem, 100vw"
            alt={alt}
            data-owned-photo-preview="true"
            className={
              state === "uploading"
                ? "size-full object-cover opacity-60"
                : "size-full object-cover"
            }
          />
        ) : null}
      </div>
      <p
        aria-live="polite"
        data-owned-photo-status={state}
        className={
          state === "failed"
            ? "text-body-sm text-danger-text"
            : "text-body-sm text-text-muted"
        }
      >
        {state === "uploading"
          ? copy.uploading
          : state === "failed"
            ? copy.failed
            : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {state === "failed" ? (
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={upload.retry}
          >
            {copy.retry}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          data-owned-photo-replace="true"
          onClick={() => replaceRef.current?.click()}
        >
          {copy.replace}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          data-owned-photo-remove="true"
          onClick={() => {
            if (upload.status !== "empty") upload.clear();
            else onRemoveCurrent?.();
          }}
        >
          {copy.remove}
        </Button>
        <FileDrop
          ref={replaceRef}
          label={copy.replace}
          accept="image/*"
          tabIndex={-1}
          onSelectFiles={choose}
        />
      </div>
    </div>
  );
}
