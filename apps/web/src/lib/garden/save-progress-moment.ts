import {
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
  selectGardenPluralForm,
} from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";

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

export function buildSaveProgressMomentCopy(
  input: {
    kind: SaveProgressMomentKind;
    objectName?: string | null;
    spaceName?: string | null;
    entryCount: number;
  },
  locale: InterfaceLocale,
): SaveProgressMomentCopy {
  const copy = getGardenWorkspaceCopy(locale).saveProgress;
  const entryCount = Math.max(1, Math.floor(input.entryCount));
  const objectName = normalizeLabel(input.objectName, copy.objectFallback);
  const spaceName = normalizeLabel(input.spaceName, copy.spaceFallback);
  const progressPercent = saveProgressPercent(entryCount);
  const progressValue = formatGardenWorkspaceTemplate(copy.progressValue, {
    count: Math.min(entryCount, 4),
  });

  if (input.kind === "first-entry") {
    return {
      eyebrow: copy.firstEntry.eyebrow,
      title: copy.firstEntry.title,
      body: formatGardenWorkspaceTemplate(copy.firstEntry.body, { objectName }),
      progressLabel: copy.firstEntry.progressLabel,
      progressValue,
      progressPercent,
    };
  }

  if (input.kind === "space-entry") {
    return {
      eyebrow: copy.spaceEntry.eyebrow,
      title: copy.spaceEntry.title,
      body: formatGardenWorkspaceTemplate(copy.spaceEntry.body, { spaceName }),
      progressLabel: copy.spaceEntry.progressLabel,
      progressValue,
      progressPercent,
    };
  }

  return {
    eyebrow: copy.followUp.eyebrow,
    title: copy.followUp.title,
    body: formatGardenWorkspaceTemplate(
      selectGardenPluralForm(locale, entryCount, {
        one: copy.followUp.bodyOne,
        few: copy.followUp.bodyFew,
        many: copy.followUp.bodyMany,
        other: copy.followUp.bodyOther,
      }),
      { objectName, count: entryCount },
    ),
    progressLabel: copy.followUp.progressLabel,
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
