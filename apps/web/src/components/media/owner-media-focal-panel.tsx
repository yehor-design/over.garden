"use client";

import { useCallback, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useOptionalOwnerScope } from "@/components/auth/owner-scope";
import {
  FocalPointControl,
  type FocalPointControlCopy,
} from "@/components/media/focal-point-control";
import {
  normalizeFocalPoint,
  type MediaFocalPoint,
} from "@/lib/media/presentation-contract";

export interface OwnerMediaFocalPanelCopy extends FocalPointControlCopy {
  save: string;
  saving: string;
  saved: string;
  clamped: string;
  error: string;
}

export interface OwnerMediaFocalPanelProps {
  mediaAssetId: string;
  imageUrl: string;
  initialFocal?: MediaFocalPoint | null;
  expectedRevision: number;
  copy: OwnerMediaFocalPanelCopy;
  disabled?: boolean;
  onSaved?: (next: {
    focal: MediaFocalPoint;
    journalRevision: number | null;
    serveClass: "exact";
  }) => void;
}

export function OwnerMediaFocalPanel({
  mediaAssetId,
  imageUrl,
  initialFocal,
  expectedRevision,
  copy,
  disabled = false,
  onSaved,
}: OwnerMediaFocalPanelProps) {
  const documentMutation = useOptionalOwnerScope();
  const [focal, setFocal] = useState<MediaFocalPoint>(
    normalizeFocalPoint(initialFocal),
  );
  const [revision, setRevision] = useState(expectedRevision);
  const [status, setStatus] = useState<"idle" | "saved" | "clamped" | "error">(
    "idle",
  );
  const [pending, startTransition] = useTransition();

  const save = useCallback(() => {
    startTransition(async () => {
      setStatus("idle");
      try {
        const response = await fetch(`/api/media/${mediaAssetId}/focal`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            ...(documentMutation?.headers() ?? {}),
          },
          body: JSON.stringify({
            focalX: focal.x,
            focalY: focal.y,
            expectedRevision: revision,
          }),
        });
        if (await documentMutation?.handleResponse(response)) {
          setStatus("error");
          return;
        }
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const payload = (await response.json()) as {
          mediaAsset?: { focalX?: number; focalY?: number };
          journalRevision?: number | null;
          serveClass?: unknown;
        };
        const serveClass = payload.serveClass ?? "exact";
        if (serveClass !== "exact" && serveClass !== "clamped") {
          setStatus("error");
          return;
        }
        const next = normalizeFocalPoint({
          x: payload.mediaAsset?.focalX,
          y: payload.mediaAsset?.focalY,
        });
        setFocal(next);
        if (
          typeof payload.journalRevision === "number" &&
          Number.isFinite(payload.journalRevision)
        ) {
          setRevision(payload.journalRevision);
        }
        if (serveClass === "clamped") {
          setStatus("clamped");
        } else {
          setStatus("saved");
          onSaved?.({
            focal: next,
            journalRevision:
              typeof payload.journalRevision === "number"
                ? payload.journalRevision
                : null,
            serveClass: "exact",
          });
        }
      } catch {
        setStatus("error");
      }
    });
  }, [documentMutation, focal.x, focal.y, mediaAssetId, onSaved, revision]);

  return (
    <div className="grid gap-3" data-owner-media-focal-panel="true">
      <FocalPointControl
        imageUrl={imageUrl}
        focal={focal}
        disabled={disabled || pending}
        copy={copy}
        onChange={(next) => {
          setStatus("idle");
          setFocal(next);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || pending}
          onClick={save}
        >
          {pending ? copy.saving : copy.save}
        </Button>
        {status === "saved" ? (
          <p className="text-xs text-muted-foreground" role="status">
            {copy.saved}
          </p>
        ) : null}
        {status === "clamped" ? (
          <p className="text-xs text-muted-foreground" role="status">
            {copy.clamped}
          </p>
        ) : null}
        {status === "error" ? (
          <p className="text-xs text-destructive" role="alert">
            {copy.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
