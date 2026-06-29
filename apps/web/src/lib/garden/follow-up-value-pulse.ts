export type FollowUpValuePulseOutcome = "submitted" | "skipped";

export type FollowUpUsefulness = "useful" | "not_sure" | "not_useful";

export type FollowUpUsefulnessReason =
  | "history_felt_worth_keeping"
  | "easy_to_add_update"
  | "prior_entries_helped"
  | "felt_redundant"
  | "hard_to_find_what_i_needed"
  | "not_sure_why";

export const FOLLOW_UP_USEFULNESS_OPTIONS = [
  {
    value: "useful" as const,
    label: "Yes, worth keeping",
  },
  {
    value: "not_sure" as const,
    label: "Not sure yet",
  },
  {
    value: "not_useful" as const,
    label: "Not really",
  },
] satisfies ReadonlyArray<{
  value: FollowUpUsefulness;
  label: string;
}>;

export const FOLLOW_UP_USEFULNESS_REASON_OPTIONS = [
  {
    value: "history_felt_worth_keeping" as const,
    label: "The running history feels worth keeping",
  },
  {
    value: "easy_to_add_update" as const,
    label: "It was easy to add this update",
  },
  {
    value: "prior_entries_helped" as const,
    label: "Earlier entries helped when I wrote this",
  },
  {
    value: "felt_redundant" as const,
    label: "It felt redundant or unnecessary",
  },
  {
    value: "hard_to_find_what_i_needed" as const,
    label: "Hard to find what I needed from earlier entries",
  },
  {
    value: "not_sure_why" as const,
    label: "Not sure why",
  },
] satisfies ReadonlyArray<{
  value: FollowUpUsefulnessReason;
  label: string;
}>;

export function normalizeFollowUpValuePulseOutcome(
  value: unknown,
): FollowUpValuePulseOutcome | null {
  return value === "submitted" || value === "skipped" ? value : null;
}

export function normalizeFollowUpUsefulness(
  value: unknown,
): FollowUpUsefulness | null {
  return value === "useful" ||
    value === "not_sure" ||
    value === "not_useful"
    ? value
    : null;
}

export function normalizeFollowUpUsefulnessReason(
  value: unknown,
): FollowUpUsefulnessReason | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;

  return FOLLOW_UP_USEFULNESS_REASON_OPTIONS.some(
    (option) => option.value === value,
  )
    ? (value as FollowUpUsefulnessReason)
    : null;
}

export function buildFollowUpValuePulseReadbackUrl(
  readbackUrl: string,
  journalEntryId: string,
) {
  const url = new URL(readbackUrl, "http://local.test");
  url.searchParams.set("valuePulse", "1");
  url.searchParams.set("entryId", journalEntryId);
  return `${url.pathname}${url.search}`;
}
