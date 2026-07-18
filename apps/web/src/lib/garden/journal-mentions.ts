import type { CatalogKind } from "@/db/schema";

export type JournalMentionTargetKind =
  | "own_object"
  | "public_object"
  | "public_handle"
  | "catalog_item";

export interface JournalMentionSelection {
  kind: JournalMentionTargetKind;
  id: string;
  label: string;
}

export interface JournalMentionSuggestion extends JournalMentionSelection {
  insertText: `@${string}`;
  detail: string;
  disambiguationLabel: string;
  catalogKind?: CatalogKind | null;
}

const MAX_MENTION_SELECTIONS = 12;
const MAX_MENTION_ID_LENGTH = 120;
const MAX_MENTION_LABEL_LENGTH = 120;
const PUBLIC_HANDLE_MENTION_SELECTION_ID_PATTERN =
  /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function normalizeJournalMentionSelections(
  value: unknown,
): JournalMentionSelection[] {
  if (!Array.isArray(value)) return [];

  const selections: JournalMentionSelection[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (selections.length >= MAX_MENTION_SELECTIONS) break;
    if (!item || typeof item !== "object") continue;

    const candidate = item as Partial<JournalMentionSelection>;
    if (!isJournalMentionTargetKind(candidate.kind)) continue;

    const id = normalizeMentionText(candidate.id, MAX_MENTION_ID_LENGTH);
    const label = normalizeMentionText(
      candidate.label,
      MAX_MENTION_LABEL_LENGTH,
    );
    if (!id || !label) continue;
    if (
      candidate.kind === "public_handle" &&
      !isOpaquePublicHandleMentionSelectionId(id)
    ) {
      continue;
    }

    const key = `${candidate.kind}:${id}`;
    if (seen.has(key)) continue;

    seen.add(key);
    selections.push({
      kind: candidate.kind,
      id,
      label,
    });
  }

  return selections;
}

export function isOpaquePublicHandleMentionSelectionId(value: unknown) {
  return (
    typeof value === "string" &&
    value.length <= MAX_MENTION_ID_LENGTH &&
    PUBLIC_HANDLE_MENTION_SELECTION_ID_PATTERN.test(value)
  );
}

export function isJournalMentionTargetKind(
  value: unknown,
): value is JournalMentionTargetKind {
  return (
    value === "own_object" ||
    value === "public_object" ||
    value === "public_handle" ||
    value === "catalog_item"
  );
}

function normalizeMentionText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 1 || normalized.length > maxLength) return null;

  return normalized;
}
