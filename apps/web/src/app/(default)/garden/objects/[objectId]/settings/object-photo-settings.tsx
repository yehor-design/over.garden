"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { OwnedPhotoField } from "@/components/garden/owned-photo-field";
import { ownerScopeHeaders } from "@/lib/auth/session-signal";
import type { OwnedPhotoView } from "@/lib/garden/owned-photo";
import { useOwnedPhotoUpload } from "@/lib/garden/use-owned-photo-upload";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOwnedPhotoCopy } from "@/lib/owned-photo-copy";
import {
  formatOwnerObjectTemplate,
  getOwnerObjectCopy,
} from "@/lib/owner-object-copy";

type SaveState =
  | "idle"
  | "saving"
  | "saved"
  | "removed"
  | "failed"
  | "unavailable";

/**
 * A plant's or an animal's photo in its settings (OVE-524, ADR-0036 D1,
 * DESIGN.md §5.25): add one, replace it with the same editor, or remove it.
 * The photo is the passport's cover at once; removed, the cover is the first
 * entry photo again and the stored files are taken back. A new photo is saved
 * as soon as it has uploaded — the editor's «Готово» was the decision — and
 * the page is read again. It needs the editor, so without JavaScript the field
 * is not offered — it renders only once the page runs, last on the page so
 * nothing above it moves — and the rest of the settings still save.
 */
export function ObjectPhotoSettings({
  locale,
  object,
}: {
  locale: InterfaceLocale;
  object: { id: string; displayName: string; photo: OwnedPhotoView | null };
}) {
  const copy = getOwnerObjectCopy(locale).settingsPage;
  const photoCopy = getOwnedPhotoCopy(locale);
  const router = useRouter();
  const upload = useOwnedPhotoUpload();
  const [state, setState] = useState<SaveState>("idle");
  const saving = useRef(false);
  const path = `/api/garden/objects/${encodeURIComponent(object.id)}/photo`;
  const scripted = useSyncExternalStore(subscribeNever, () => true, () => false);

  useEffect(() => {
    if (upload.status !== "ready" || saving.current) return;
    saving.current = true;
    void (async () => {
      setState("saving");
      try {
        const photo = await upload.payload();
        const response = await fetch(path, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...ownerScopeHeaders(),
          },
          body: JSON.stringify({ photo }),
        });
        if (response.ok) {
          upload.committed();
          setState("saved");
          router.refresh();
          return;
        }
        upload.release();
        if (response.status === 409) {
          upload.clear();
          setState("unavailable");
        } else {
          setState("failed");
        }
      } catch {
        upload.release();
        setState("failed");
      } finally {
        saving.current = false;
      }
    })();
  }, [path, router, upload]);

  async function removeCurrent() {
    setState("saving");
    try {
      const response = await fetch(path, {
        method: "DELETE",
        headers: { ...ownerScopeHeaders() },
      });
      if (!response.ok) {
        setState("failed");
        return;
      }
      setState("removed");
      router.refresh();
    } catch {
      setState("failed");
    }
  }

  if (!scripted) return null;

  const message =
    state === "saving"
      ? copy.photoSaving
      : state === "saved"
        ? copy.photoSaved
        : state === "removed"
          ? copy.photoRemoved
          : state === "failed"
            ? copy.photoFailed
            : state === "unavailable"
              ? photoCopy.unavailable
              : "";

  return (
    <section
      data-object-photo-settings={state}
      className="grid min-w-0 gap-3 rounded-lg border border-border p-4"
    >
      <h2 className="text-h3 text-text-heading">{copy.photoTitle}</h2>
      <OwnedPhotoField
        upload={upload}
        copy={photoCopy}
        alt={formatOwnerObjectTemplate(copy.photoAlt, {
          name: object.displayName,
        })}
        current={state === "removed" ? null : object.photo}
        disabled={state === "saving"}
        onRemoveCurrent={() => void removeCurrent()}
      />
      <p
        aria-live="polite"
        className={
          state === "failed" || state === "unavailable"
            ? "text-body-sm text-danger-text"
            : "text-body-sm text-text-muted"
        }
      >
        {message}
      </p>
    </section>
  );
}

function subscribeNever() {
  return () => undefined;
}
