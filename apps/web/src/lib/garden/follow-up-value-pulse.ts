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
  "useful",
  "not_sure",
  "not_useful",
] as const satisfies ReadonlyArray<FollowUpUsefulness>;

export const FOLLOW_UP_USEFULNESS_REASON_OPTIONS = [
  "history_felt_worth_keeping",
  "easy_to_add_update",
  "prior_entries_helped",
  "felt_redundant",
  "hard_to_find_what_i_needed",
  "not_sure_why",
] as const satisfies ReadonlyArray<FollowUpUsefulnessReason>;

export function normalizeFollowUpValuePulseOutcome(
  value: unknown,
): FollowUpValuePulseOutcome | null {
  return value === "submitted" || value === "skipped" ? value : null;
}

export function normalizeFollowUpUsefulness(
  value: unknown,
): FollowUpUsefulness | null {
  return value === "useful" || value === "not_sure" || value === "not_useful"
    ? value
    : null;
}

export function normalizeFollowUpUsefulnessReason(
  value: unknown,
): FollowUpUsefulnessReason | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;

  return FOLLOW_UP_USEFULNESS_REASON_OPTIONS.some((option) => option === value)
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
