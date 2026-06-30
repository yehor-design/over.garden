import { describe, expect, it } from "vitest";

import {
  catalogSuggestionStatusLabel,
  entryPrivacyLabel,
  entryScopeLabel,
  journalSaveErrorMessage,
  journalSaveStateLabel,
  localDuplicateMessage,
  localSavedMessage,
  offlineSaveActionLabel,
  offlineSaveStatusLabel,
  offlineSaveStatusSentence,
  photoHelpText,
  varietyStateLabel,
} from "./pilot-ux-copy";

describe("pilot UX copy", () => {
  it("describes offline save states without internal queue or sync language", () => {
    const copy = [
      journalSaveStateLabel("queued"),
      journalSaveStateLabel("syncing"),
      journalSaveStateLabel("synced"),
      offlineSaveStatusLabel("queued"),
      offlineSaveStatusSentence("failed"),
      offlineSaveActionLabel("queued"),
      offlineSaveActionLabel("failed"),
      localSavedMessage("entry"),
      localDuplicateMessage("follow-up"),
    ].join(" ");

    expect(copy).toContain("Saved on this device");
    expect(copy).toContain("Send now");
    expect(copy).toContain("Try again");
    expect(copy).not.toMatch(/\b(local queue|queued|sync|synced)\b/i);
  });

  it("explains photo handling without exposing photo intent or derivative terms", () => {
    const copy = [
      photoHelpText({
        fileName: null,
        isOnline: true,
        photoError: null,
      }),
      photoHelpText({
        fileName: "tomato.webp",
        isOnline: false,
        photoError: null,
      }),
      photoHelpText({
        fileName: "tomato.webp",
        isOnline: true,
        photoError: null,
      }),
      journalSaveErrorMessage(
        new Error(
          "Photo intent is queued, but this browser no longer has the photo file.",
        ),
      ),
    ].join(" ");

    expect(copy).toContain("server");
    expect(copy).toContain("cleaned public copy");
    expect(copy).toContain("Choose it again");
    expect(copy).not.toMatch(/\b(photo intent|quarantine|derivative)\b/i);
  });

  it("maps catalog, timeline, and privacy states to user-facing labels", () => {
    const copy = [
      varietyStateLabel("selected"),
      varietyStateLabel("user_added"),
      varietyStateLabel("unknown"),
      catalogSuggestionStatusLabel("seeded"),
      entryScopeLabel("object"),
      entryPrivacyLabel({ visibility: "public", isArchived: false }),
      entryPrivacyLabel({ visibility: "private", isArchived: true }),
    ].join(" ");

    expect(copy).toContain("Matched to catalog");
    expect(copy).toContain("Saved with your catalog name");
    expect(copy).toContain("No catalog match yet");
    expect(copy).not.toMatch(/\b(selected|user_added|unknown|lifecycle)\b/i);
  });
});
