"use client";

import { useCallback, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  createDocumentMutationRequestHeaders,
  useOptionalDocumentMutationGeneration,
} from "@/components/auth/document-mutation-recovery";
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
  const documentMutation = useOptionalDocumentMutationGeneration();
  const [focal, setFocal] = useState<MediaFocalPoint>(
    normalizeFocalPoint(initialFocal),
  );
  const [revision, setRevision] = useState(expectedRevision);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  const save = useCallback(() => {
    startTransition(async () => {
      setStatus("idle");
      try {
        const response = await fetch(`/api/media/${mediaAssetId}/focal`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            ...createDocumentMutationRequestHeaders(
              documentMutation?.transport,
            ),
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
        };
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
        setStatus("saved");
        onSaved?.({
          focal: next,
          journalRevision:
            typeof payload.journalRevision === "number"
              ? payload.journalRevision
              : null,
        });
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
        {status === "error" ? (
          <p className="text-xs text-destructive" role="alert">
            {copy.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
