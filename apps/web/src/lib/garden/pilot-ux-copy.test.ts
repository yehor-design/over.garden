import { describe, expect, it } from "vitest";

import {
  catalogIdentityLabel,
  catalogKindLabel,
  catalogSuggestionStatusLabel,
  entryPrivacyLabel,
  entryScopeLabel,
  journalSaveErrorMessage,
  journalSaveStateLabel,
  locationVisibilityHelpText,
  localDuplicateMessage,
  localSavedMessage,
  offlineSaveActionLabel,
  offlineSaveStatusLabel,
  offlineSaveStatusSentence,
  photoHelpText,
  publicCatalogStatusLabel,
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
      catalogKindLabel("plant_variety"),
      catalogKindLabel("species"),
      catalogKindLabel("breed"),
      catalogIdentityLabel("plant_variety"),
      catalogIdentityLabel("species"),
      catalogIdentityLabel("breed"),
      catalogSuggestionStatusLabel("seeded"),
      publicCatalogStatusLabel("seeded"),
      publicCatalogStatusLabel("confirmed"),
      entryScopeLabel("object"),
      entryPrivacyLabel({ visibility: "public", isArchived: false }),
      entryPrivacyLabel({ visibility: "private", isArchived: true }),
    ].join(" ");

    expect(copy).toContain("Matched to catalog");
    expect(copy).toContain("Saved with your catalog name");
    expect(copy).toContain("No catalog match yet");
    expect(copy).toContain("Plant variety");
    expect(copy).toContain("Plant species");
    expect(copy).toContain("Bee breed");
    expect(catalogIdentityLabel("plant_variety")).toBe("Plant variety");
    expect(catalogIdentityLabel("species")).toBe("Plant species");
    expect(catalogIdentityLabel("breed")).toBe("Bee breed");
    expect(publicCatalogStatusLabel("seeded")).toBe("Pilot catalog");
    expect(publicCatalogStatusLabel("confirmed")).toBe("Curated catalog");
    expect(copy).not.toMatch(
      /\b(selected|user_added|unknown|lifecycle|seeded|confirmed)\b/i,
    );
  });

  it("explains location visibility consequences at selection time", () => {
    const hidden = locationVisibilityHelpText("hidden");
    const region = locationVisibilityHelpText("region");
    const copy = `${hidden} ${region}`;

    expect(hidden).toContain("never show a location");
    expect(region).toContain("region can appear");
    expect(region).toContain("Exact location is never shown");
    expect(copy).not.toMatch(
      /\b(address|coordinates?|latitude|longitude|ip_address|user[_ -]?agent)\b/i,
    );
  });
});
