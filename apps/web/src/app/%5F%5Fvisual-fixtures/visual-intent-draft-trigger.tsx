"use client";

import { useState } from "react";
import { ArrowUpRight, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
type VisualIntentDraftKind = "first_entry" | "follow_up_entry";

export function VisualIntentDraftTrigger({
  kind,
  ownerUserId,
  objectId,
  startPath,
}: {
  kind: VisualIntentDraftKind;
  ownerUserId: string;
  objectId?: string;
  startPath: string;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function start() {
    setPending(true);
    setFailed(false);
    try {
      const saved = await seedVisualIntentDraft({
        kind,
        ownerUserId,
        objectId,
      });
      if (!saved) throw new Error("Visual intent is unavailable.");
      window.location.assign(startPath);
    } catch {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <div className="grid gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={start}
        disabled={pending}
      >
        {pending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <ArrowUpRight aria-hidden="true" />
        )}
        {pending ? "Saving draft" : "Seed draft and start"}
      </Button>
      {failed ? (
        <span role="alert" className="text-xs text-destructive">
          The synthetic online draft intent is unavailable.
        </span>
      ) : null}
    </div>
  );
}

export async function seedVisualIntentDraft({
  kind: _kind,
  ownerUserId,
  objectId,
}: {
  kind: VisualIntentDraftKind;
  ownerUserId: string;
  objectId?: string;
}) {
  void ownerUserId;
  if (_kind === "follow_up_entry" && !objectId) {
    throw new Error("Fixture object id is required.");
  }
  // Server-gated fixture routes cannot own a real authenticated server draft.
  // Preserve only the navigation rehearsal; never seed browser persistence.
  return true;
}
