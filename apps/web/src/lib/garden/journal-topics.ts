export const MAX_JOURNAL_TOPIC_TAGS = 5;
export const MAX_JOURNAL_TOPIC_TAG_LENGTH = 40;

const CONTACT_OR_LOCATION_PATTERNS = [
  /@/,
  /\bhttps?:\/\//i,
  /\bwww\./i,
  /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i,
  /\+?\d[\d\s().-]{6,}\d/,
  /\b-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\b/,
] as const;

const PRIVATE_MARKER_PATTERN =
  /\b(email|phone|телефон|пошта|address|адрес|адреса|ip|user[-_\s]?agent|token|cookie|media[-_\s]?key|quarantine|coordinate|координат|latitude|longitude|широта|довгота)\b/i;

export function normalizeJournalTopicTagLabels(input: unknown): string[] {
  const values = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const tag = normalizeJournalTopicTagLabel(value);
    if (!tag) continue;

    const key = tag.toLocaleLowerCase("en");
    if (seen.has(key)) continue;

    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_JOURNAL_TOPIC_TAGS) break;
  }

  return tags;
}

export function normalizeJournalTopicTagLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value
    .trim()
    .replace(/^#+/u, "")
    .replace(/\s+/gu, " ")
    .replace(/[_-]{2,}/gu, "-")
    .trim();

  if (
    normalized.length < 2 ||
    normalized.length > MAX_JOURNAL_TOPIC_TAG_LENGTH
  ) {
    return null;
  }

  if (!/^[\p{Letter}\p{Number}][\p{Letter}\p{Number} -]*$/u.test(normalized)) {
    return null;
  }

  if (
    PRIVATE_MARKER_PATTERN.test(normalized) ||
    CONTACT_OR_LOCATION_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return null;
  }

  return normalized;
}
