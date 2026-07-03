const MAX_TITLE_LENGTH = 140;
const BODY_SEGMENT_LENGTH = 82;
const LABEL_SEGMENT_LENGTH = 40;

export interface JournalTitleSuggestionInput {
  entryDate: string;
  objectLabel?: string | null;
  catalogLabel?: string | null;
  body?: string | null;
  hasPhoto?: boolean;
}

export interface NextJournalTitleValueInput {
  currentTitle: string;
  suggestion: string;
  titleEditedByUser: boolean;
}

export function suggestJournalEntryTitle(
  input: JournalTitleSuggestionInput,
): string {
  const entryDate = formatEntryDate(input.entryDate);
  const objectLabel = normalizeTitlePart(input.objectLabel);
  const catalogLabel = normalizeTitlePart(input.catalogLabel);
  const label = objectLabel || catalogLabel;
  const bodyLead = firstBodyLine(input.body);

  if (bodyLead) {
    return clampTitle(
      label
        ? `${truncatePart(bodyLead, BODY_SEGMENT_LENGTH)} - ${truncatePart(
            label,
            LABEL_SEGMENT_LENGTH,
          )}`
        : `${truncatePart(bodyLead, 110)} - ${entryDate}`,
    );
  }

  if (label) {
    return clampTitle(
      input.hasPhoto
        ? `${label} photo - ${entryDate}`
        : `${label} - ${entryDate}`,
    );
  }

  return input.hasPhoto ? `Garden photo - ${entryDate}` : "";
}

export function nextJournalTitleValue({
  currentTitle,
  suggestion,
  titleEditedByUser,
}: NextJournalTitleValueInput): string {
  return titleEditedByUser ? currentTitle : suggestion;
}

function firstBodyLine(value: string | null | undefined): string {
  const firstLine = value?.split(/\r?\n/, 1)[0] ?? "";
  return normalizeTitlePart(firstLine);
}

function normalizeTitlePart(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function formatEntryDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return normalizeTitlePart(value) || "today";

  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][monthIndex];

  return month ? `${month} ${day}` : normalizeTitlePart(value) || "today";
}

function clampTitle(value: string): string {
  return truncatePart(value, MAX_TITLE_LENGTH);
}

function truncatePart(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}
