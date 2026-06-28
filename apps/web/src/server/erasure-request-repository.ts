import "server-only";

import { type Insertable, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  Database,
  ErasureRequestHandledStatus,
  ErasureRequestScope,
  ErasureRequestStatus,
} from "@/db/schema";
import {
  ERASURE_REQUEST_HANDLED_STATUS_OPTIONS,
  ERASURE_REQUEST_INTAKE_VERSION,
} from "@/lib/privacy/disclosures";
import type { RequestScope } from "@/server/request-scope";

const MAX_OPERATOR_ERASURE_REQUESTS = 50;
const DEFAULT_REQUEST_SCOPE: ErasureRequestScope = "account_data_erasure";
const OPEN_REQUEST_STATUSES: ErasureRequestStatus[] = [
  "submitted",
  "reviewing",
];

type QueryExecutor = Kysely<Database> | Transaction<Database>;
type NewErasureRequestRow = Insertable<Database["erasure_requests"]>;

export interface ErasureRequestReadModel {
  id: string;
  requesterUserId: string;
  requestScope: ErasureRequestScope;
  status: ErasureRequestStatus;
  submittedAt: Date | string;
  handledAt: Date | string | null;
  handledStatus: ErasureRequestHandledStatus | null;
  intakeDisclosureVersion: string;
}

export async function submitErasureRequest(
  scope: RequestScope,
): Promise<ErasureRequestReadModel> {
  const existing = await buildOpenErasureRequestForUserQuery(
    db,
    scope.userId,
  ).executeTakeFirst();

  if (existing) {
    return mapErasureRequestRow(existing);
  }

  const now = new Date();
  const request = await buildInsertErasureRequestQuery(db, {
    requester_user_id: scope.userId,
    request_scope: DEFAULT_REQUEST_SCOPE,
    status: "submitted",
    submitted_at: now,
    intake_disclosure_version: ERASURE_REQUEST_INTAKE_VERSION,
    created_at: now,
    updated_at: now,
  }).executeTakeFirstOrThrow();

  return mapErasureRequestRow(request);
}

export async function getOpenErasureRequestForUser(
  scope: RequestScope,
): Promise<ErasureRequestReadModel | null> {
  const request = await buildOpenErasureRequestForUserQuery(
    db,
    scope.userId,
  ).executeTakeFirst();

  return request ? mapErasureRequestRow(request) : null;
}

export async function getLatestErasureRequestForUser(
  scope: RequestScope,
): Promise<ErasureRequestReadModel | null> {
  const request = await buildLatestErasureRequestForUserQuery(
    db,
    scope.userId,
  ).executeTakeFirst();

  return request ? mapErasureRequestRow(request) : null;
}

export async function listOperatorErasureRequests(
  limit = MAX_OPERATOR_ERASURE_REQUESTS,
): Promise<ErasureRequestReadModel[]> {
  const rows = await buildListOperatorErasureRequestsQuery(db, limit).execute();
  return rows.map(mapErasureRequestRow);
}

export async function markErasureRequestReviewing(input: {
  requestId: string;
}): Promise<ErasureRequestReadModel> {
  const requestId = normalizeErasureRequestId(input.requestId);
  const now = new Date();
  const request = await buildMarkErasureRequestReviewingQuery(db, {
    requestId,
    now,
  }).executeTakeFirstOrThrow();

  return mapErasureRequestRow(request);
}

export async function markErasureRequestHandled(
  scope: RequestScope,
  input: {
    requestId: string;
    handledStatus: string;
  },
): Promise<ErasureRequestReadModel> {
  const requestId = normalizeErasureRequestId(input.requestId);
  const handledStatus = parseHandledStatus(input.handledStatus);
  const now = new Date();
  const request = await buildMarkErasureRequestHandledQuery(db, scope, {
    requestId,
    handledStatus,
    now,
  }).executeTakeFirstOrThrow();

  return mapErasureRequestRow(request);
}

export function buildOpenErasureRequestForUserQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("erasure_requests")
    .select([
      "id",
      "requester_user_id as requesterUserId",
      "request_scope as requestScope",
      "status",
      "submitted_at as submittedAt",
      "handled_at as handledAt",
      "handled_status as handledStatus",
      "intake_disclosure_version as intakeDisclosureVersion",
    ])
    .where("requester_user_id", "=", requesterUserId)
    .where("status", "in", OPEN_REQUEST_STATUSES)
    .orderBy("submitted_at", "desc")
    .limit(1);
}

export function buildLatestErasureRequestForUserQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("erasure_requests")
    .select([
      "id",
      "requester_user_id as requesterUserId",
      "request_scope as requestScope",
      "status",
      "submitted_at as submittedAt",
      "handled_at as handledAt",
      "handled_status as handledStatus",
      "intake_disclosure_version as intakeDisclosureVersion",
    ])
    .where("requester_user_id", "=", requesterUserId)
    .orderBy("submitted_at", "desc")
    .limit(1);
}

export function buildInsertErasureRequestQuery(
  executor: QueryExecutor,
  row: NewErasureRequestRow,
) {
  return executor
    .insertInto("erasure_requests")
    .values(row)
    .returning([
      "id",
      "requester_user_id as requesterUserId",
      "request_scope as requestScope",
      "status",
      "submitted_at as submittedAt",
      "handled_at as handledAt",
      "handled_status as handledStatus",
      "intake_disclosure_version as intakeDisclosureVersion",
    ]);
}

export function buildListOperatorErasureRequestsQuery(
  executor: QueryExecutor,
  limit = MAX_OPERATOR_ERASURE_REQUESTS,
) {
  const boundedLimit = Math.min(
    Math.max(Math.trunc(Number.isFinite(limit) ? limit : 25), 1),
    MAX_OPERATOR_ERASURE_REQUESTS,
  );

  return executor
    .selectFrom("erasure_requests")
    .select([
      "id",
      "requester_user_id as requesterUserId",
      "request_scope as requestScope",
      "status",
      "submitted_at as submittedAt",
      "handled_at as handledAt",
      "handled_status as handledStatus",
      "intake_disclosure_version as intakeDisclosureVersion",
    ])
    .orderBy("submitted_at", "desc")
    .limit(boundedLimit);
}

export function buildMarkErasureRequestReviewingQuery(
  executor: QueryExecutor,
  input: {
    requestId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("erasure_requests")
    .set({
      status: "reviewing",
      updated_at: input.now,
    })
    .where("id", "=", input.requestId)
    .where("status", "=", "submitted")
    .returning([
      "id",
      "requester_user_id as requesterUserId",
      "request_scope as requestScope",
      "status",
      "submitted_at as submittedAt",
      "handled_at as handledAt",
      "handled_status as handledStatus",
      "intake_disclosure_version as intakeDisclosureVersion",
    ]);
}

export function buildMarkErasureRequestHandledQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    requestId: string;
    handledStatus: ErasureRequestHandledStatus;
    now: Date;
  },
) {
  return executor
    .updateTable("erasure_requests")
    .set({
      status: "handled",
      handled_at: input.now,
      handled_status: input.handledStatus,
      handled_by_user_id: scope.userId,
      updated_at: input.now,
    })
    .where("id", "=", input.requestId)
    .where("status", "in", OPEN_REQUEST_STATUSES)
    .returning([
      "id",
      "requester_user_id as requesterUserId",
      "request_scope as requestScope",
      "status",
      "submitted_at as submittedAt",
      "handled_at as handledAt",
      "handled_status as handledStatus",
      "intake_disclosure_version as intakeDisclosureVersion",
    ]);
}

function mapErasureRequestRow(row: {
  id: string;
  requesterUserId: string;
  requestScope: string;
  status: string;
  submittedAt: Date | string;
  handledAt: Date | string | null;
  handledStatus: string | null;
  intakeDisclosureVersion: string;
}): ErasureRequestReadModel {
  return {
    id: row.id,
    requesterUserId: row.requesterUserId,
    requestScope: row.requestScope as ErasureRequestScope,
    status: row.status as ErasureRequestStatus,
    submittedAt: row.submittedAt,
    handledAt: row.handledAt,
    handledStatus: row.handledStatus as ErasureRequestHandledStatus | null,
    intakeDisclosureVersion: row.intakeDisclosureVersion,
  };
}

function normalizeErasureRequestId(value: string) {
  const trimmed = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    throw new Error("Invalid erasure request id.");
  }

  return trimmed;
}

function parseHandledStatus(value: string): ErasureRequestHandledStatus {
  const status = ERASURE_REQUEST_HANDLED_STATUS_OPTIONS.find(
    (option) => option.value === value,
  )?.value;

  if (!status) {
    throw new Error("Invalid erasure handled status.");
  }

  return status;
}
