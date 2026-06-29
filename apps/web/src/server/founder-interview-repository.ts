import "server-only";

import { type Insertable, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  normalizePilotInterviewLearningInput,
  type NormalizedPilotInterviewLearningInput,
  type PilotInterviewLearningInput,
} from "@/lib/pilot/interview-learning";
import type { RequestScope } from "@/server/request-scope";

const MAX_OPERATOR_INTERVIEW_LEARNINGS = 100;

type QueryExecutor = Kysely<Database> | Transaction<Database>;
type NewPilotInterviewLearningRow = Insertable<Database["pilot_interview_learnings"]>;

export interface FounderInterviewLearningReadModel {
  id: string;
  recordedByUserId: string;
  subjectUserId: string | null;
  pilotCohort: string | null;
  segment: string;
  activationResult: string;
  returnReason: string;
  mainObjection: string;
  observedValue: string;
  nextAction: string;
  redactedNote: string | null;
  recordedAt: Date | string;
}

export interface FounderInterviewLearningGroup {
  segment: string;
  records: FounderInterviewLearningReadModel[];
}

export async function createFounderInterviewLearning(
  scope: RequestScope,
  input: PilotInterviewLearningInput,
): Promise<FounderInterviewLearningReadModel> {
  const normalized = normalizePilotInterviewLearningInput(input);
  if (!normalized.ok) {
    throw new Error(normalized.error);
  }

  const now = new Date();
  const row = await buildInsertFounderInterviewLearningQuery(db, scope, {
    normalized: normalized.value,
    now,
  }).executeTakeFirstOrThrow();

  return mapFounderInterviewLearningRow(row);
}

export async function listFounderInterviewLearnings(input?: {
  segment?: string | null;
  activationResult?: string | null;
  limit?: number;
}): Promise<FounderInterviewLearningReadModel[]> {
  const rows = await buildListFounderInterviewLearningsQuery(
    db,
    input?.limit ?? MAX_OPERATOR_INTERVIEW_LEARNINGS,
    {
      segment: input?.segment ?? null,
      activationResult: input?.activationResult ?? null,
    },
  ).execute();

  return rows.map(mapFounderInterviewLearningRow);
}

export function groupFounderInterviewLearningsBySegment(
  records: FounderInterviewLearningReadModel[],
): FounderInterviewLearningGroup[] {
  const groups = new Map<string, FounderInterviewLearningReadModel[]>();

  for (const record of records) {
    const bucket = groups.get(record.segment) ?? [];
    bucket.push(record);
    groups.set(record.segment, bucket);
  }

  return [...groups.entries()]
    .map(([segment, segmentRecords]) => ({
      segment,
      records: segmentRecords.sort((left, right) =>
        compareRecordedAt(right.recordedAt, left.recordedAt),
      ),
    }))
    .sort((left, right) => left.segment.localeCompare(right.segment));
}

export function buildInsertFounderInterviewLearningQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    normalized: NormalizedPilotInterviewLearningInput;
    now: Date;
  },
) {
  const row: NewPilotInterviewLearningRow = {
    recorded_by_user_id: scope.userId,
    subject_user_id: input.normalized.subjectUserId,
    pilot_cohort: input.normalized.pilotCohort,
    segment: input.normalized.segment,
    activation_result: input.normalized.activationResult,
    return_reason: input.normalized.returnReason,
    main_objection: input.normalized.mainObjection,
    observed_value: input.normalized.observedValue,
    next_action: input.normalized.nextAction,
    redacted_note: input.normalized.redactedNote,
    recorded_at: input.now,
    created_at: input.now,
    updated_at: input.now,
  };

  return executor
    .insertInto("pilot_interview_learnings")
    .values(row)
    .returning([
      "id",
      "recorded_by_user_id as recordedByUserId",
      "subject_user_id as subjectUserId",
      "pilot_cohort as pilotCohort",
      "segment",
      "activation_result as activationResult",
      "return_reason as returnReason",
      "main_objection as mainObjection",
      "observed_value as observedValue",
      "next_action as nextAction",
      "redacted_note as redactedNote",
      "recorded_at as recordedAt",
    ]);
}

export function buildListFounderInterviewLearningsQuery(
  executor: QueryExecutor,
  limit = MAX_OPERATOR_INTERVIEW_LEARNINGS,
  filters: {
    segment: string | null;
    activationResult: string | null;
  },
) {
  const boundedLimit = Math.min(
    Math.max(Math.trunc(Number.isFinite(limit) ? limit : 25), 1),
    MAX_OPERATOR_INTERVIEW_LEARNINGS,
  );

  let query = executor
    .selectFrom("pilot_interview_learnings")
    .select([
      "id",
      "recorded_by_user_id as recordedByUserId",
      "subject_user_id as subjectUserId",
      "pilot_cohort as pilotCohort",
      "segment",
      "activation_result as activationResult",
      "return_reason as returnReason",
      "main_objection as mainObjection",
      "observed_value as observedValue",
      "next_action as nextAction",
      "redacted_note as redactedNote",
      "recorded_at as recordedAt",
    ]);

  if (filters.segment) {
    query = query.where("segment", "=", filters.segment);
  }

  if (filters.activationResult) {
    query = query.where("activation_result", "=", filters.activationResult);
  }

  return query.orderBy("recorded_at", "desc").limit(boundedLimit);
}

function mapFounderInterviewLearningRow(row: {
  id: string;
  recordedByUserId: string;
  subjectUserId: string | null;
  pilotCohort: string | null;
  segment: string;
  activationResult: string;
  returnReason: string;
  mainObjection: string;
  observedValue: string;
  nextAction: string;
  redactedNote: string | null;
  recordedAt: Date | string;
}): FounderInterviewLearningReadModel {
  return {
    id: row.id,
    recordedByUserId: row.recordedByUserId,
    subjectUserId: row.subjectUserId,
    pilotCohort: row.pilotCohort,
    segment: row.segment,
    activationResult: row.activationResult,
    returnReason: row.returnReason,
    mainObjection: row.mainObjection,
    observedValue: row.observedValue,
    nextAction: row.nextAction,
    redactedNote: row.redactedNote,
    recordedAt: row.recordedAt,
  };
}

function compareRecordedAt(left: Date | string, right: Date | string) {
  const leftMs =
    left instanceof Date ? left.getTime() : new Date(left).getTime();
  const rightMs =
    right instanceof Date ? right.getTime() : new Date(right).getTime();
  return leftMs - rightMs;
}
