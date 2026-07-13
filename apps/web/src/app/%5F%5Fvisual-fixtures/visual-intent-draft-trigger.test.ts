import { beforeEach, describe, expect, it } from "vitest";

import {
  FIRST_ENTRY_DRAFT_ID,
  followUpEntryDraftId,
  getOfflineDraft,
  type FirstEntryDraftPayload,
  type FollowUpEntryDraftPayload,
} from "@/lib/offline/drafts";
import { offlineDb } from "@/lib/offline/queue";
import { seedVisualIntentDraft } from "./visual-intent-draft-trigger";

const OBJECT_ID = "18700003-0000-4000-8000-000000000001";
const OWNER_ID = "18700001-0000-4000-8000-000000000001";

describe("visual auth-intent draft trigger", () => {
  beforeEach(async () => {
    await offlineDb?.drafts.clear();
  });

  it("persists a realistic first-entry draft in IndexedDB", async () => {
    await seedVisualIntentDraft({
      kind: "first_entry",
      ownerUserId: OWNER_ID,
    });
    const saved = await getOfflineDraft<FirstEntryDraftPayload>(
      OWNER_ID,
      FIRST_ENTRY_DRAFT_ID,
    );

    expect(saved).toMatchObject({
      id: FIRST_ENTRY_DRAFT_ID,
      kind: "first_entry",
    });
    expect(saved?.payload.draft.title).toContain("Перша зав'язь");
    expect(saved?.payload.draft.body.length).toBeGreaterThan(40);
    expect(saved?.payload.photoIntent).toBeNull();
  });

  it("persists a realistic follow-up draft for the exact object", async () => {
    await seedVisualIntentDraft({
      kind: "follow_up_entry",
      ownerUserId: OWNER_ID,
      objectId: OBJECT_ID,
    });
    const saved = await getOfflineDraft<FollowUpEntryDraftPayload>(
      OWNER_ID,
      followUpEntryDraftId(OBJECT_ID),
    );

    expect(saved).toMatchObject({
      id: followUpEntryDraftId(OBJECT_ID),
      kind: "follow_up_entry",
    });
    expect(saved?.payload.plantObjectId).toBe(OBJECT_ID);
    expect(saved?.payload.draft.body.length).toBeGreaterThan(40);
  });
});
