import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  normalizeFollowUpUsefulness,
  normalizeFollowUpUsefulnessReason,
  normalizeFollowUpValuePulseOutcome,
  type FollowUpUsefulness,
  type FollowUpUsefulnessReason,
  type FollowUpValuePulseOutcome,
} from "@/lib/garden/follow-up-value-pulse";
import {
  recordAnalyticsEventSafely,
  type AnalyticsEventProperties,
} from "@/server/analytics-events";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface FollowUpValuePulsePromptInput {
  plantObjectId: string;
  journalEntryId: string;
}

export interface FollowUpValuePulseResponseInput
  extends FollowUpValuePulsePromptInput {
  outcome: FollowUpValuePulseOutcome;
  usefulness?: FollowUpUsefulness | null;
  usefulnessReason?: FollowUpUsefulnessReason | null;
}

export interface FollowUpValuePulsePromptState {
  eligible: boolean;
}

export async function resolveFollowUpValuePulsePrompt(
  scope: RequestScope,
  input: FollowUpValuePulsePromptInput,
  executor: QueryExecutor = db,
): Promise<FollowUpValuePulsePromptState> {
  const plantObjectId = normalizeRequiredId(input.plantObjectId);
  const journalEntryId = normalizeRequiredId(input.journalEntryId);
  if (!plantObjectId || !journalEntryId) {
    return { eligible: false };
  }

  const entry = await executor
    .selectFrom("journal_entries")
    .select(["id", "plant_object_id", "created_at"])
    .where("id", "=", journalEntryId)
    .where("owner_user_id", "=", scope.userId)
    .where("plant_object_id", "=", plantObjectId)
    .executeTakeFirst();

  if (!entry) {
    return { eligible: false };
  }

  const priorEntry = await executor
    .selectFrom("journal_entries")
    .select("id")
    .where("owner_user_id", "=", scope.userId)
    .where("plant_object_id", "=", plantObjectId)
    .where("created_at", "<", entry.created_at)
    .limit(1)
    .executeTakeFirst();

  if (!priorEntry) {
    return { eligible: false };
  }

  const existingResponse = await executor
    .selectFrom("analytics_events")
    .select("id")
    .where("owner_user_id", "=", scope.userId)
    .where("event_name", "=", "follow_up_value_pulse")
    .where("journal_entry_id", "=", journalEntryId)
    .limit(1)
    .executeTakeFirst();

  return { eligible: !existingResponse };
}

export async function recordFollowUpValuePulseResponse(
  scope: RequestScope,
  input: FollowUpValuePulseResponseInput,
  executor: QueryExecutor = db,
): Promise<{ recorded: boolean; error?: string }> {
  const normalized = normalizeFollowUpValuePulseResponseInput(input);
  if ("error" in normalized) {
    return { recorded: false, error: normalized.error };
  }

  const prompt = await resolveFollowUpValuePulsePrompt(scope, normalized, executor);
  if (!prompt.eligible) {
    return {
      recorded: false,
      error: "This follow-up is not eligible for a value pulse response.",
    };
  }

  const properties: AnalyticsEventProperties = {
    pulse_outcome: normalized.outcome,
  };

  if (normalized.outcome === "submitted") {
    properties.usefulness = normalized.usefulness ?? undefined;
    if (normalized.usefulnessReason) {
      properties.usefulness_reason = normalized.usefulnessReason;
    }
  }

  const event = await recordAnalyticsEventSafely(scope, {
    eventName: "follow_up_value_pulse",
    properties,
    spaceId: null,
    plantObjectId: normalized.plantObjectId,
    journalEntryId: normalized.journalEntryId,
  });

  return { recorded: event !== null };
}

export function normalizeFollowUpValuePulseResponseInput(
  input: Partial<FollowUpValuePulseResponseInput>,
):
  | FollowUpValuePulseResponseInput
  | {
      error: string;
    } {
  const plantObjectId = normalizeRequiredId(input.plantObjectId);
  const journalEntryId = normalizeRequiredId(input.journalEntryId);
  const outcome = normalizeFollowUpValuePulseOutcome(input.outcome);

  if (!plantObjectId || !journalEntryId || !outcome) {
    return { error: "Value pulse response payload is invalid." };
  }

  if (outcome === "skipped") {
    return {
      plantObjectId,
      journalEntryId,
      outcome,
    };
  }

  const usefulness = normalizeFollowUpUsefulness(input.usefulness);
  if (!usefulness) {
    return { error: "Usefulness is required when submitting feedback." };
  }

  const usefulnessReason = normalizeFollowUpUsefulnessReason(
    input.usefulnessReason,
  );

  return {
    plantObjectId,
    journalEntryId,
    outcome,
    usefulness,
    usefulnessReason,
  };
}

export function buildFollowUpValuePulseEligibilityQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: FollowUpValuePulsePromptInput,
) {
  return executor
    .selectFrom("journal_entries as target_entry")
    .select(sql<number>`1`.as("eligible"))
    .where("target_entry.id", "=", input.journalEntryId)
    .where("target_entry.owner_user_id", "=", scope.userId)
    .where("target_entry.plant_object_id", "=", input.plantObjectId)
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("journal_entries as prior_entry")
          .select("prior_entry.id")
          .whereRef(
            "prior_entry.owner_user_id",
            "=",
            "target_entry.owner_user_id",
          )
          .whereRef(
            "prior_entry.plant_object_id",
            "=",
            "target_entry.plant_object_id",
          )
          .whereRef("prior_entry.created_at", "<", "target_entry.created_at"),
      ),
    )
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("analytics_events")
            .select("analytics_events.id")
            .whereRef(
              "analytics_events.journal_entry_id",
              "=",
              "target_entry.id",
            )
            .where("analytics_events.owner_user_id", "=", scope.userId)
            .where("analytics_events.event_name", "=", "follow_up_value_pulse"),
        ),
      ),
    );
}

function normalizeRequiredId(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
