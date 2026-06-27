import "server-only";

import { type Insertable, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  Database,
  ErasureRequestHandledStatus,
  ErasureRequestScope,
  ErasureRequestStatus,
} from "@/db/schema";
import { ERASURE_REQUEST_INTAKE_VERSION } from "@/lib/privacy/disclosures";
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

export async function listOperatorErasureRequests(
  limit = MAX_OPERATOR_ERASURE_REQUESTS,
): Promise<ErasureRequestReadModel[]> {
  const rows = await buildListOperatorErasureRequestsQuery(db, limit).execute();
  return rows.map(mapErasureRequestRow);
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
