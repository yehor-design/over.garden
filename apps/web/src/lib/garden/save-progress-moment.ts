export type SaveProgressMomentKind =
  | "first-entry"
  | "follow-up"
  | "space-entry";

export const SAVE_PROGRESS_QUERY_PARAM = "saveProgress";

const SAVE_PROGRESS_MOMENT_KINDS = new Set<SaveProgressMomentKind>([
  "first-entry",
  "follow-up",
  "space-entry",
]);

export interface SaveProgressMomentCopy {
  eyebrow: string;
  title: string;
  body: string;
  progressLabel: string;
  progressValue: string;
  progressPercent: number;
}

export function normalizeSaveProgressMomentKind(
  value: string | string[] | undefined,
): SaveProgressMomentKind | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return SAVE_PROGRESS_MOMENT_KINDS.has(raw as SaveProgressMomentKind)
    ? (raw as SaveProgressMomentKind)
    : null;
}

export function buildSaveProgressReadbackUrl(
  readbackUrl: string,
  kind: SaveProgressMomentKind,
) {
  const url = new URL(readbackUrl, "http://local.test");
  url.searchParams.set(SAVE_PROGRESS_QUERY_PARAM, kind);
  return `${url.pathname}${url.search}`;
}

export function buildSaveProgressMomentCopy(input: {
  kind: SaveProgressMomentKind;
  objectName?: string | null;
  spaceName?: string | null;
  entryCount: number;
}): SaveProgressMomentCopy {
  const entryCount = Math.max(1, Math.floor(input.entryCount));
  const objectName = normalizeLabel(input.objectName, "this plant");
  const spaceName = normalizeLabel(input.spaceName, "this space");
  const progressPercent = saveProgressPercent(entryCount);
  const progressValue = `${Math.min(entryCount, 4)} / 4 starter notes`;

  if (input.kind === "first-entry") {
    return {
      eyebrow: "Saved locally",
      title: "Your garden record has started",
      body: `${objectName} now has its first dated note. Add the next change when it happens; there is no sharing step to finish.`,
      progressLabel: "Season trail started",
      progressValue,
      progressPercent,
    };
  }

  if (input.kind === "space-entry") {
    return {
      eyebrow: "Saved locally",
      title: "Space note added",
      body: `${spaceName} now has another dated note across the objects you selected. You can return to the timeline or keep logging while the context is fresh.`,
      progressLabel: "Garden trail",
      progressValue,
      progressPercent,
    };
  }

  return {
    eyebrow: "Progress added",
    title: "This record is getting useful",
    body: `${objectName} now has ${entryCount} dated ${entryCount === 1 ? "note" : "notes"} in one place. Keep the trail for yourself first; no outside reaction is required.`,
    progressLabel: "Season trail",
    progressValue,
    progressPercent,
  };
}

export function saveProgressPercent(entryCount: number) {
  const bounded = Math.min(Math.max(Math.floor(entryCount), 1), 4);
  return bounded * 25;
}

function normalizeLabel(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}
