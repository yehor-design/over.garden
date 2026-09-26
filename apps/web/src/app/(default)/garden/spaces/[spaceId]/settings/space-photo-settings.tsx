"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { OwnedPhotoField } from "@/components/garden/owned-photo-field";
import { ownerScopeHeaders } from "@/lib/auth/session-signal";
import type { OwnedPhotoView } from "@/lib/garden/owned-photo";
import { useOwnedPhotoUpload } from "@/lib/garden/use-owned-photo-upload";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOwnedPhotoCopy } from "@/lib/owned-photo-copy";
import {
  formatSpacePageTemplate as template,
  getSpacePageCopy,
} from "@/lib/space-page-copy";

type SaveState = "idle" | "saving" | "saved" | "removed" | "failed" | "unavailable";

/**
 * The space's photo in its settings (ADR-0036 D1, DESIGN.md §5.25): add one,
 * replace it with the same editor, or remove it. A new photo is saved as soon
 * as it has uploaded — the editor's «Готово» was the decision — and the page
 * is read again, so the space's page and its row in «Мій сад» show it.
 */
export function SpacePhotoSettings({
  locale,
  space,
}: {
  locale: InterfaceLocale;
  space: { id: string; displayName: string; photo: OwnedPhotoView | null };
}) {
  const copy = getSpacePageCopy(locale).settings;
  const photoCopy = getOwnedPhotoCopy(locale);
  const router = useRouter();
  const upload = useOwnedPhotoUpload();
  const [state, setState] = useState<SaveState>("idle");
  const saving = useRef(false);

  useEffect(() => {
    if (upload.status !== "ready" || saving.current) return;
    saving.current = true;
    void (async () => {
      setState("saving");
      try {
        const photo = await upload.payload();
        const response = await fetch(
          `/api/garden/spaces/${encodeURIComponent(space.id)}/photo`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...ownerScopeHeaders() },
            body: JSON.stringify({ photo }),
          },
        );
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
  }, [router, space.id, upload]);

  async function removeCurrent() {
    setState("saving");
    try {
      const response = await fetch(
        `/api/garden/spaces/${encodeURIComponent(space.id)}/photo`,
        { method: "DELETE", headers: { ...ownerScopeHeaders() } },
      );
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
    <div data-space-photo-settings={state} className="grid gap-3">
      <OwnedPhotoField
        upload={upload}
        copy={photoCopy}
        alt={template(getSpacePageCopy(locale).overview.photoAlt, {
          name: space.displayName,
        })}
        current={state === "removed" ? null : space.photo}
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
    </div>
  );
}
