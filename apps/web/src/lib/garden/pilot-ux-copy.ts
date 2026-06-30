export type JournalSaveState =
  | "idle"
  | "queued"
  | "syncing"
  | "synced"
  | "failed";

export type OfflineSaveStatus = "queued" | "syncing" | "synced" | "failed";

export function journalSaveStateLabel(state: JournalSaveState) {
  switch (state) {
    case "queued":
      return "Saved on this device";
    case "syncing":
      return "Saving to garden";
    case "synced":
      return "Saved to garden";
    case "failed":
      return "Needs attention";
    default:
      return "Ready to save";
  }
}

export function offlineSaveStatusLabel(status: OfflineSaveStatus) {
  switch (status) {
    case "syncing":
      return "Sending to garden";
    case "synced":
      return "Saved to garden";
    case "failed":
      return "Needs retry";
    default:
      return "Saved on this device";
  }
}

export function offlineSaveActionLabel(status: OfflineSaveStatus) {
  return status === "failed" ? "Try again" : "Send now";
}

export function offlineSaveStatusSentence(status: OfflineSaveStatus) {
  switch (status) {
    case "syncing":
      return "Sending to your garden now";
    case "synced":
      return "Saved in your garden";
    case "failed":
      return "Could not send yet";
    default:
      return "Waiting on this device";
  }
}

export function photoHelpText({
  fileName,
  isOnline,
  photoError,
}: {
  fileName: string | null;
  isOnline: boolean;
  photoError: string | null;
}) {
  if (photoError) return photoError;

  if (!fileName) {
    return "Optional JPEG, PNG, or WebP. Photos are cleaned on the server before any public copy can appear.";
  }

  if (!isOnline) {
    return `${fileName} will stay on this device until your connection returns.`;
  }

  return `${fileName} will upload privately when you save. A cleaned public copy can appear only if you publish later.`;
}

export function localSavedMessage(kind: "entry" | "follow-up") {
  const label = kind === "entry" ? "entry" : "follow-up";
  return `Saved on this device. When connection returns, send the ${label} to your garden from below.`;
}

export function localDuplicateMessage(kind: "entry" | "follow-up") {
  const label = kind === "entry" ? "entry" : "follow-up";
  return `This ${label} is already saved on this device.`;
}

export function journalSaveErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/photo intent/i.test(message)) {
    if (/no longer has/i.test(message)) {
      return "This browser no longer has the selected photo. Choose it again, then try again.";
    }

    return "This photo could not be uploaded. Use a JPEG, PNG, or WebP photo.";
  }

  return (
    message || "Could not save yet. Try again when the connection is stable."
  );
}

export function varietyStateLabel(value: string | null | undefined) {
  switch (value) {
    case "selected":
      return "Matched to catalog";
    case "user_added":
      return "Saved with your catalog name";
    case "free_text":
      return "Saved without catalog match";
    case "unknown":
      return "No catalog match yet";
    default:
      return "Catalog match not set";
  }
}

export function catalogSuggestionStatusLabel(status: string) {
  switch (status) {
    case "confirmed":
      return "Confirmed catalog";
    case "seeded":
      return "Pilot catalog";
    default:
      return "Catalog option";
  }
}

export function catalogKindLabel(value: string | null | undefined) {
  switch (value) {
    case "breed":
      return "Bee breed";
    case "species":
      return "Plant species";
    case "plant_variety":
      return "Plant variety";
    default:
      return "Catalog match";
  }
}

export function catalogIdentityLabel(value: string | null | undefined) {
  switch (value) {
    case "breed":
      return "Bee breed";
    case "species":
      return "Plant species";
    case "plant_variety":
      return "Plant variety";
    default:
      return "Catalog";
  }
}

export function plantObjectKindLabel(value: string | null | undefined) {
  switch (value) {
    case "bee_colony":
      return "Bee colony";
    case "animal":
      return "Animal";
    default:
      return "Plant";
  }
}

export function entryScopeLabel(value: string) {
  return value === "space" ? "Space note" : "Object note";
}

export function entryPrivacyLabel({
  visibility,
  isArchived,
}: {
  visibility: string;
  isArchived: boolean;
}) {
  if (isArchived) return "Archived privately";
  return visibility === "public" ? "Public page" : "Private entry";
}
