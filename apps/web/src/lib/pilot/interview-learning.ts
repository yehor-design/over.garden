import type {
  PilotInterviewActivationResult,
  PilotInterviewMainObjection,
  PilotInterviewNextAction,
  PilotInterviewObservedValue,
  PilotInterviewReturnReason,
  PilotInterviewSegment,
} from "@/db/schema";
import {
  DEFAULT_PILOT_INVITE_COHORT,
  isPilotInviteCohort,
  type PilotInviteCohort,
} from "@/lib/garden/pilot-invite";
import {
  getPilotSegmentLabel,
  normalizePilotSegment,
  PILOT_SEGMENT_OPTIONS,
} from "@/lib/pilot/segments";

export const MAX_REDACTED_NOTE_LENGTH = 280;

export const PILOT_INTERVIEW_SEGMENT_OPTIONS = PILOT_SEGMENT_OPTIONS;

export const PILOT_INTERVIEW_ACTIVATION_RESULT_OPTIONS = [
  {
    value: "not_activated" as const,
    label: "Not activated — no first save",
  },
  {
    value: "activated_first_entry_only" as const,
    label: "Activated — first entry only",
  },
  {
    value: "activated_with_follow_up" as const,
    label: "Activated — first entry plus follow-up",
  },
  {
    value: "started_no_save" as const,
    label: "Started flow but did not save",
  },
  {
    value: "dropped_after_first" as const,
    label: "Dropped after first entry",
  },
  {
    value: "not_in_cohort" as const,
    label: "Not in closed cohort",
  },
  {
    value: "unknown" as const,
    label: "Unknown / not observed yet",
  },
] satisfies ReadonlyArray<{
  value: PilotInterviewActivationResult;
  label: string;
}>;

export const PILOT_INTERVIEW_RETURN_REASON_OPTIONS = [
  {
    value: "same_object_follow_up" as const,
    label: "Returned for same-object follow-up",
  },
  {
    value: "seasonal_return" as const,
    label: "Seasonal restart return",
  },
  {
    value: "never_returned" as const,
    label: "Never returned after activation",
  },
  {
    value: "returned_no_save" as const,
    label: "Returned but did not save again",
  },
  {
    value: "privacy_concern" as const,
    label: "Privacy or location concern",
  },
  {
    value: "composer_friction" as const,
    label: "Composer friction blocked return",
  },
  {
    value: "not_relevant_yet" as const,
    label: "Not relevant yet for this gardener",
  },
  {
    value: "unknown" as const,
    label: "Unknown / not discussed",
  },
] satisfies ReadonlyArray<{
  value: PilotInterviewReturnReason;
  label: string;
}>;

export const PILOT_INTERVIEW_MAIN_OBJECTION_OPTIONS = [
  {
    value: "no_journal_habit" as const,
    label: "No journal habit / does not track",
  },
  {
    value: "too_much_effort" as const,
    label: "Too much effort to capture",
  },
  {
    value: "privacy_location" as const,
    label: "Privacy or location worry",
  },
  {
    value: "no_clear_value" as const,
    label: "No clear value yet",
  },
  {
    value: "prefers_paper_or_social" as const,
    label: "Prefers paper notes or social channels",
  },
  {
    value: "product_too_early" as const,
    label: "Product feels too early",
  },
  {
    value: "not_gardener_fit" as const,
    label: "Not a gardener fit",
  },
  {
    value: "none_observed" as const,
    label: "No objection observed",
  },
  {
    value: "unknown" as const,
    label: "Unknown / not discussed",
  },
] satisfies ReadonlyArray<{
  value: PilotInterviewMainObjection;
  label: string;
}>;

export const PILOT_INTERVIEW_OBSERVED_VALUE_OPTIONS = [
  {
    value: "history_worth_keeping" as const,
    label: "Running history felt worth keeping",
  },
  {
    value: "photo_safe_capture" as const,
    label: "Photo capture felt safe",
  },
  {
    value: "catalog_helpful" as const,
    label: "Catalog or variety pick helped",
  },
  {
    value: "offline_queue_helpful" as const,
    label: "Offline queue helped",
  },
  {
    value: "progress_moment_helpful" as const,
    label: "Progress moment helped",
  },
  {
    value: "public_variety_hook" as const,
    label: "Public variety hook mattered",
  },
  {
    value: "no_clear_value_yet" as const,
    label: "No clear value observed yet",
  },
  {
    value: "unknown" as const,
    label: "Unknown / not discussed",
  },
] satisfies ReadonlyArray<{
  value: PilotInterviewObservedValue;
  label: string;
}>;

export const PILOT_INTERVIEW_NEXT_ACTION_OPTIONS = [
  {
    value: "continue_pilot" as const,
    label: "Continue pilot with this gardener",
  },
  {
    value: "iterate_composer" as const,
    label: "Iterate composer / capture flow",
  },
  {
    value: "iterate_onboarding" as const,
    label: "Iterate onboarding / activation",
  },
  {
    value: "iterate_privacy_copy" as const,
    label: "Iterate privacy copy",
  },
  {
    value: "schedule_follow_up" as const,
    label: "Schedule follow-up interview",
  },
  {
    value: "pause_recruiting" as const,
    label: "Pause recruiting this segment",
  },
  {
    value: "close_track" as const,
    label: "Close this cohort track",
  },
  {
    value: "none" as const,
    label: "No action yet",
  },
] satisfies ReadonlyArray<{
  value: PilotInterviewNextAction;
  label: string;
}>;

const FORBIDDEN_CAPTURE_FRAGMENTS = [
  "body",
  "title",
  "quarantine",
  "derivative",
  "original/",
  "email",
  "phone",
  "ipaddress",
  "user_agent",
  "useragent",
  "referrer",
  "transcript",
  "signedurl",
  "coordinate",
  "latitude",
  "longitude",
  "exif",
  "journal_entry",
  "media_asset",
  "http://",
  "https://",
];

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/;

export interface PilotInterviewLearningInput {
  segment: string;
  activationResult: string;
  returnReason: string;
  mainObjection: string;
  observedValue: string;
  nextAction: string;
  redactedNote?: string | null;
  subjectUserId?: string | null;
  pilotCohort?: string | null;
}

export interface NormalizedPilotInterviewLearningInput {
  segment: PilotInterviewSegment;
  activationResult: PilotInterviewActivationResult;
  returnReason: PilotInterviewReturnReason;
  mainObjection: PilotInterviewMainObjection;
  observedValue: PilotInterviewObservedValue;
  nextAction: PilotInterviewNextAction;
  redactedNote: string | null;
  subjectUserId: string | null;
  pilotCohort: PilotInviteCohort | null;
}

export function normalizePilotInterviewSegment(
  value: unknown,
): PilotInterviewSegment | null {
  return normalizePilotSegment(value);
}

export function normalizePilotInterviewActivationResult(
  value: unknown,
): PilotInterviewActivationResult | null {
  return (
    PILOT_INTERVIEW_ACTIVATION_RESULT_OPTIONS.find(
      (option) => option.value === value,
    )?.value ?? null
  );
}

export function normalizePilotInterviewReturnReason(
  value: unknown,
): PilotInterviewReturnReason | null {
  return (
    PILOT_INTERVIEW_RETURN_REASON_OPTIONS.find(
      (option) => option.value === value,
    )?.value ?? null
  );
}

export function normalizePilotInterviewMainObjection(
  value: unknown,
): PilotInterviewMainObjection | null {
  return (
    PILOT_INTERVIEW_MAIN_OBJECTION_OPTIONS.find(
      (option) => option.value === value,
    )?.value ?? null
  );
}

export function normalizePilotInterviewObservedValue(
  value: unknown,
): PilotInterviewObservedValue | null {
  return (
    PILOT_INTERVIEW_OBSERVED_VALUE_OPTIONS.find(
      (option) => option.value === value,
    )?.value ?? null
  );
}

export function normalizePilotInterviewNextAction(
  value: unknown,
): PilotInterviewNextAction | null {
  return (
    PILOT_INTERVIEW_NEXT_ACTION_OPTIONS.find((option) => option.value === value)
      ?.value ?? null
  );
}

export function normalizePilotInterviewLearningInput(
  input: PilotInterviewLearningInput,
):
  | { ok: true; value: NormalizedPilotInterviewLearningInput }
  | { ok: false; error: string } {
  const segment = normalizePilotInterviewSegment(input.segment);
  const activationResult = normalizePilotInterviewActivationResult(
    input.activationResult,
  );
  const returnReason = normalizePilotInterviewReturnReason(input.returnReason);
  const mainObjection = normalizePilotInterviewMainObjection(
    input.mainObjection,
  );
  const observedValue = normalizePilotInterviewObservedValue(
    input.observedValue,
  );
  const nextAction = normalizePilotInterviewNextAction(input.nextAction);

  if (!segment) return { ok: false, error: "Invalid interview segment." };
  if (!activationResult) {
    return { ok: false, error: "Invalid activation result." };
  }
  if (!returnReason) return { ok: false, error: "Invalid return reason." };
  if (!mainObjection) return { ok: false, error: "Invalid main objection." };
  if (!observedValue) return { ok: false, error: "Invalid observed value." };
  if (!nextAction) return { ok: false, error: "Invalid next action." };

  const redactedNote = normalizeRedactedNote(input.redactedNote);
  if (redactedNote.error) return { ok: false, error: redactedNote.error };

  const subjectUserId = normalizeOptionalUserId(input.subjectUserId);
  if (subjectUserId.error) return { ok: false, error: subjectUserId.error };

  const pilotCohort = normalizeOptionalPilotCohort(input.pilotCohort);
  if (pilotCohort.error) return { ok: false, error: pilotCohort.error };

  const forbidden = findForbiddenInterviewCaptureContent([
    redactedNote.value,
    input.segment,
    input.activationResult,
    input.returnReason,
    input.mainObjection,
    input.observedValue,
    input.nextAction,
    input.pilotCohort,
  ]);

  if (forbidden) {
    return {
      ok: false,
      error: `Interview capture rejected forbidden content (${forbidden}).`,
    };
  }

  return {
    ok: true,
    value: {
      segment,
      activationResult,
      returnReason,
      mainObjection,
      observedValue,
      nextAction,
      redactedNote: redactedNote.value,
      subjectUserId: subjectUserId.value,
      pilotCohort: pilotCohort.value,
    },
  };
}

export function findForbiddenInterviewCaptureContent(
  values: readonly (string | null | undefined)[],
): string | null {
  for (const value of values) {
    if (!value) continue;
    const normalized = value.trim();
    if (!normalized) continue;

    const lower = normalized.toLowerCase();
    for (const fragment of FORBIDDEN_CAPTURE_FRAGMENTS) {
      if (lower.includes(fragment)) return fragment;
    }

    if (EMAIL_PATTERN.test(normalized)) return "email";
    if (PHONE_PATTERN.test(normalized)) return "phone";
  }

  return null;
}

export function getPilotInterviewSegmentLabel(
  segment: PilotInterviewSegment | string,
) {
  return getPilotSegmentLabel(segment);
}

export function getPilotInterviewActivationResultLabel(
  value: PilotInterviewActivationResult | string,
) {
  return (
    PILOT_INTERVIEW_ACTIVATION_RESULT_OPTIONS.find(
      (option) => option.value === value,
    )?.label ?? value
  );
}

export function getPilotInterviewObservedValueLabel(
  value: PilotInterviewObservedValue | string,
) {
  return (
    PILOT_INTERVIEW_OBSERVED_VALUE_OPTIONS.find(
      (option) => option.value === value,
    )?.label ?? value
  );
}

export function getPilotInterviewNextActionLabel(
  value: PilotInterviewNextAction | string,
) {
  return (
    PILOT_INTERVIEW_NEXT_ACTION_OPTIONS.find((option) => option.value === value)
      ?.label ?? value
  );
}

function normalizeRedactedNote(value: string | null | undefined): {
  value: string | null;
  error?: string;
} {
  if (value == null) return { value: null };
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  if (trimmed.length > MAX_REDACTED_NOTE_LENGTH) {
    return {
      value: null,
      error: `Redacted note must be ${MAX_REDACTED_NOTE_LENGTH} characters or fewer.`,
    };
  }
  return { value: trimmed };
}

function normalizeOptionalUserId(value: string | null | undefined): {
  value: string | null;
  error?: string;
} {
  if (value == null) return { value: null };
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    return { value: null, error: "Invalid subject user id." };
  }
  return { value: trimmed };
}

function normalizeOptionalPilotCohort(value: string | null | undefined): {
  value: PilotInviteCohort | null;
  error?: string;
} {
  if (value == null) return { value: null };
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  if (!isPilotInviteCohort(trimmed)) {
    return { value: null, error: "Invalid pilot cohort." };
  }
  return { value: trimmed };
}

export const DEFAULT_PILOT_INTERVIEW_COHORT = DEFAULT_PILOT_INVITE_COHORT;
