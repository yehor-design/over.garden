"use client";

import { useState } from "react";
import { ArrowUpRight, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FIRST_ENTRY_DRAFT_ID,
  followUpEntryDraftId,
  upsertOfflineDraft,
  type FirstEntryDraftPayload,
  type FollowUpEntryDraftPayload,
} from "@/lib/offline/drafts";

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
      if (!saved) throw new Error("IndexedDB is unavailable.");
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
          IndexedDB draft storage is unavailable in this browser.
        </span>
      ) : null}
    </div>
  );
}

export async function seedVisualIntentDraft({
  kind,
  ownerUserId,
  objectId,
}: {
  kind: VisualIntentDraftKind;
  ownerUserId: string;
  objectId?: string;
}) {
  if (kind === "follow_up_entry") {
    if (!objectId) throw new Error("Fixture object id is required.");
    const payload: FollowUpEntryDraftPayload = {
      clientMutationId: "ove174-fixture-follow-up-draft",
      plantObjectId: objectId,
      draft: {
        title: "Листя відновилося після спеки",
        body: "Зберігаю це спостереження як тестову чернетку перед повторним входом.",
        entryDate: "2026-07-10",
      },
      topicTagInput: "відновлення, спека",
      photoIntent: null,
    };
    return upsertOfflineDraft({
      ownerUserId,
      id: followUpEntryDraftId(objectId),
      kind,
      payload,
    });
  }

  const payload: FirstEntryDraftPayload = {
    clientMutationId: "ove174-fixture-first-entry-draft",
    draft: {
      spaceName: "Тестова теплиця",
      plantName: "Томат для перевірки входу",
      objectKind: "plant",
      title: "Перша зав'язь після прохолодної ночі",
      body: "Реалістична тестова чернетка має залишитися на цьому пристрої після входу.",
      entryDate: "2026-07-10",
      locationVisibility: "hidden",
      coarseRegionCode: "",
    },
    catalogQuery: "томат",
    selectedCatalogItem: null,
    userAddedCatalogName: "Тестовий ранній томат",
    activationSource: "direct_garden",
    topicTagInput: "розсада, спостереження",
    photoIntent: null,
  };
  return upsertOfflineDraft({
    ownerUserId,
    id: FIRST_ENTRY_DRAFT_ID,
    kind,
    payload,
  });
}
