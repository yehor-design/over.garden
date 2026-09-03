import "server-only";

import { createHash } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, JsonValue } from "@/db/schema";
import {
  EPPO_OBSERVED_DETAIL_ENDPOINT_CLASSES,
  type EppoObservedDetailEndpointClass,
} from "./eppo-api-constants";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const EPPO_CAPTURE_SCHEMA_VERSION = "ove254.eppoObservedCapture.v1";
export const EPPO_CAPTURE_REQUEST_SCHEMA_VERSION = "eppo.gd.v2.2026-08";
export const EPPO_CAPTURE_SOURCE_HOST = "api.eppo.int";
export const EPPO_CAPTURE_ENDPOINT_FAMILY = "gd/v2";
export const EPPO_CAPTURE_SOURCE_SLUG = "eppo-codes";
export const EPPO_CAPTURE_WRITER_LOCK_KEY = `ove254:${EPPO_CAPTURE_SOURCE_SLUG}`;
const EPPO_CAPTURE_QUEUE_BATCH_CODES = 400;
export const EPPO_DETAIL_ENDPOINT_CLASSES =
  EPPO_OBSERVED_DETAIL_ENDPOINT_CLASSES;
export type EppoDetailEndpointClass = EppoObservedDetailEndpointClass;

export const EPPO_CAPTURE_RIGHTS = [
  "source_public",
  "source_only",
  "forbidden",
  "unknown",
] as const;

export type EppoCaptureRight = (typeof EPPO_CAPTURE_RIGHTS)[number];
export type EppoCaptureTerminalUnitState =
  | "captured"
  | "source_only"
  | "forbidden";

const PUBLIC_FIELD_NAMES = new Set([
  "acceptedname",
  "author",
  "authority",
  "code",
  "commonname",
  "country_iso",
  "datatype",
  "eppocode",
  "fullname",
  "is_active",
  "iso_language_code",
  "lang_iso",
  "language",
  "name",
  "level",
  "preferred",
  "prefname",
  "rank",
  "replacedby",
  "scientificname",
  "taxon",
  "taxonid",
  "type",
]);

const SOURCE_ONLY_FIELD_NAMES = new Set([
  "datecreate",
  "dateupdate",
  "id",
  "lastupdate",
  "links",
  "metadata",
  "name_id",
]);

const FORBIDDEN_FIELD_PATTERN =
  /(?:^|_)(?:altitude|coordinate|coordinates|exif|gps|image|image_url|latitude|location|longitude|media|occurrence|photo|photograph|rights_holder|specimen)(?:$|_)/iu;

type InventoryPageExpectation = {
  offset: number;
  limit: number;
};

export type ParsedEppoInventoryPage = {
  total: number;
  codes: string[];
  identifiers: Array<{ eppoCode: string; isActive: boolean }>;
};

export type EppoFieldClassification = {
  fieldRights: Record<string, EppoCaptureRight>;
  rightsCounts: Record<EppoCaptureRight, number>;
  unitState: EppoCaptureTerminalUnitState;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function assertEppoCode(value: unknown): string {
  // The list surface contains retired identifiers that pre-date the current
  // 5-6 character OpenAPI constraint. They remain bounded source evidence and
  // are never interpolated into a detail URL. The observed legacy alphabet is
  // deliberately narrower than arbitrary printable text.
  if (typeof value !== "string" || !/^[0-9A-Z.!:/]{1,10}$/u.test(value)) {
    throw new Error("invalid_eppo_code");
  }
  return value;
}

function isDocumentedEppoCode(value: string): boolean {
  return /^[0-9A-Z]{5,6}$/u.test(value);
}

export function parseEppoInventoryPage(
  payload: unknown,
  expected: InventoryPageExpectation,
): ParsedEppoInventoryPage {
  const envelope = asObject(payload);
  const pagination = asObject(envelope?.pagination);
  const data = envelope?.data;

  if (
    !pagination ||
    pagination.offset !== expected.offset ||
    pagination.limit !== expected.limit ||
    !isNonNegativeSafeInteger(pagination.count) ||
    !isPositiveSafeInteger(pagination.total) ||
    !Array.isArray(data) ||
    pagination.count !== data.length ||
    data.length > expected.limit
  ) {
    throw new Error("inventory_schema_mismatch");
  }

  const identifiers = data.map((value) => {
    const row = asObject(value);
    const eppoCode = assertEppoCode(row?.eppocode);
    if (typeof row?.is_active !== "boolean") {
      throw new Error("inventory_active_state_mismatch");
    }
    if (!isDocumentedEppoCode(eppoCode) && row?.is_active !== false) {
      throw new Error("active_legacy_eppo_code_refused");
    }
    return { eppoCode, isActive: row.is_active };
  });
  const codes = identifiers.map((identifier) => identifier.eppoCode);
  if (new Set(codes).size !== codes.length) {
    throw new Error("duplicate_eppo_code");
  }

  // The request pins the provider's documented eppocode ordering. Preserve
  // those bytes exactly: historical identifiers containing punctuation use a
  // provider collation that does not equal JavaScript/Unicode collation. Full
  // start/end sequence digests and exact page replay enforce deterministic
  // closure without silently re-sorting upstream evidence.

  return { total: pagination.total, codes, identifiers };
}

function classifyFieldName(fieldName: string): EppoCaptureRight {
  const normalized = fieldName.toLowerCase();
  if (FORBIDDEN_FIELD_PATTERN.test(normalized)) return "forbidden";
  if (PUBLIC_FIELD_NAMES.has(normalized)) return "source_public";
  if (SOURCE_ONLY_FIELD_NAMES.has(normalized)) return "source_only";
  return "unknown";
}

export function classifyEppoResponseFields(
  payload: unknown,
): EppoFieldClassification {
  if (!asObject(payload) && !Array.isArray(payload)) {
    throw new Error("response_schema_mismatch");
  }

  const fieldRights: Record<string, EppoCaptureRight> = {};
  const rightsCounts: Record<EppoCaptureRight, number> = {
    source_public: 0,
    source_only: 0,
    forbidden: 0,
    unknown: 0,
  };

  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, `${path}[]`);
      return;
    }
    const object = asObject(value);
    if (!object) return;
    for (const fieldName of Object.keys(object).sort()) {
      const fieldPath = path ? `${path}.${fieldName}` : fieldName;
      const fieldValue = object[fieldName];
      if (Array.isArray(fieldValue) || asObject(fieldValue)) {
        visit(fieldValue, fieldPath);
        continue;
      }
      if (fieldRights[fieldPath]) continue;
      const right = classifyFieldName(fieldName);
      fieldRights[fieldPath] = right;
      rightsCounts[right] += 1;
    }
  };

  visit(payload, "");

  const sortedFieldRights = Object.fromEntries(
    Object.entries(fieldRights).sort(([left], [right]) =>
      left.localeCompare(right, "en"),
    ),
  );

  if (Object.keys(sortedFieldRights).length === 0 && !Array.isArray(payload)) {
    throw new Error("response_schema_mismatch");
  }

  const unitState =
    rightsCounts.forbidden > 0
      ? "forbidden"
      : rightsCounts.unknown > 0 || rightsCounts.source_only > 0
        ? "source_only"
        : "captured";

  return { fieldRights: sortedFieldRights, rightsCounts, unitState };
}

function projectRightsClass(
  value: unknown,
  path: string,
  fieldRights: Record<string, EppoCaptureRight>,
  target: "source_public" | "source_only",
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      projectRightsClass(item, `${path}[]`, fieldRights, target),
    );
  }
  const object = asObject(value);
  if (!object) return undefined;
  const projected: Record<string, unknown> = {};
  for (const fieldName of Object.keys(object).sort()) {
    const fieldPath = path ? `${path}.${fieldName}` : fieldName;
    const fieldValue = object[fieldName];
    if (Array.isArray(fieldValue) || asObject(fieldValue)) {
      const child = projectRightsClass(
        fieldValue,
        fieldPath,
        fieldRights,
        target,
      );
      if (
        Array.isArray(child) ||
        (asObject(child) && Object.keys(asObject(child)!).length > 0)
      ) {
        projected[fieldName] = child;
      }
      continue;
    }
    if (fieldRights[fieldPath] === target) projected[fieldName] = fieldValue;
  }
  return projected;
}

export function splitEppoResponseByRights(
  payload: JsonValue,
  fieldRights: Record<string, EppoCaptureRight>,
): { allowedProjection: JsonValue; sourceOnlyFields: JsonValue } {
  return {
    allowedProjection: projectRightsClass(
      payload,
      "",
      fieldRights,
      "source_public",
    ) as JsonValue,
    sourceOnlyFields: projectRightsClass(
      payload,
      "",
      fieldRights,
      "source_only",
    ) as JsonValue,
  };
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  const object = asObject(value);
  if (!object) return value;
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .map((key) => [key, canonicalizeJson(object[key])]),
  );
}

export function digestCanonicalJson(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalizeJson(value)), "utf8")
    .digest("hex");
}

function jsonbParam(value: JsonValue) {
  return sql<JsonValue>`${JSON.stringify(value)}::jsonb`;
}

type CreateEppoCaptureInput = {
  id: string;
  captureToolRevision: string;
  openApiSha256: string;
  licenseSha256: string;
  observedStartedAt: Date;
  preflightReceipt: JsonValue;
  zeroProductBaseline: JsonValue;
};

export function buildCreateEppoCaptureQuery(
  executor: QueryExecutor,
  input: CreateEppoCaptureInput,
) {
  return executor
    .insertInto("catalog_source_capture_runs")
    .values({
      id: input.id,
      source_slug: EPPO_CAPTURE_SOURCE_SLUG,
      capture_schema_version: EPPO_CAPTURE_SCHEMA_VERSION,
      capture_tool_revision: input.captureToolRevision,
      upstream_authority_class: "observed_capture",
      state: "planned",
      source_host: EPPO_CAPTURE_SOURCE_HOST,
      endpoint_family: EPPO_CAPTURE_ENDPOINT_FAMILY,
      request_schema_version: EPPO_CAPTURE_REQUEST_SCHEMA_VERSION,
      openapi_sha256: input.openApiSha256,
      license_sha256: input.licenseSha256,
      observed_started_at: input.observedStartedAt,
      preflight_receipt: jsonbParam(input.preflightReceipt),
      zero_product_baseline: jsonbParam(input.zeroProductBaseline),
    })
    .returning(["id", "state"]);
}

type InsertEppoInventoryPageInput = {
  captureId: string;
  offset: number;
  limit: number;
  payload: JsonValue;
  observedAt: Date;
};

export function buildInsertEppoInventoryPageQuery(
  executor: QueryExecutor,
  input: InsertEppoInventoryPageInput,
) {
  const classification = classifyEppoResponseFields(input.payload);
  return executor
    .insertInto("catalog_source_capture_units")
    .values({
      capture_id: input.captureId,
      unit_kind: "inventory_page",
      unit_key: `page:${input.offset}`,
      eppo_code: null,
      identifier_class: "not_applicable",
      endpoint_class: "taxon_list",
      inventory_offset: input.offset,
      inventory_limit: input.limit,
      inventory_ordinal: null,
      state: classification.unitState,
      request_schema_version: EPPO_CAPTURE_REQUEST_SCHEMA_VERSION,
      attempt_count: 1,
      claim_token: null,
      claimed_at: null,
      observed_at: input.observedAt,
      http_status_class: "2xx",
      response_sha256: digestCanonicalJson(input.payload),
      raw_payload: jsonbParam(input.payload),
      allowed_projection: jsonbParam({}),
      source_only_fields: jsonbParam({}),
      field_rights: jsonbParam(classification.fieldRights),
      rights_counts: jsonbParam(classification.rightsCounts),
      last_error_class: null,
    })
    .onConflict((conflict) =>
      conflict
        .columns(["capture_id", "endpoint_class", "unit_key"])
        .doNothing(),
    )
    .returning(["id", "response_sha256"]);
}

type QueueEppoEndpointUnitsInput = {
  captureId: string;
  inventoryOrdinalStart: number;
  identifiers: Array<{ eppoCode: string; isActive: boolean }>;
};

export function buildQueueEppoEndpointUnitsQuery(
  executor: QueryExecutor,
  input: QueueEppoEndpointUnitsInput,
) {
  if (input.identifiers.length === 0) {
    throw new Error("empty_endpoint_queue_batch");
  }

  const observedAt = new Date();
  const values = input.identifiers.flatMap((identifier, codeOffset) => {
    if (typeof identifier.isActive !== "boolean") {
      throw new Error("inventory_active_state_mismatch");
    }
    const safeCode = assertEppoCode(identifier.eppoCode);
    const documented = isDocumentedEppoCode(safeCode);
    if (!documented && identifier.isActive) {
      throw new Error("active_legacy_eppo_code_refused");
    }
    const identifierClass = !documented
      ? "legacy_schema_exception"
      : identifier.isActive
        ? "documented_eppo_code"
        : "inactive_eppo_identifier";
    const requestable = identifierClass === "documented_eppo_code";
    const notRequestedPayload = { classification: identifierClass };
    const notRequestedPayloadSha256 = digestCanonicalJson(notRequestedPayload);
    return EPPO_DETAIL_ENDPOINT_CLASSES.map((endpointClass) => ({
      capture_id: input.captureId,
      unit_kind: "taxon_endpoint",
      unit_key: safeCode,
      eppo_code: safeCode,
      identifier_class: identifierClass,
      endpoint_class: endpointClass,
      inventory_offset: null,
      inventory_limit: null,
      inventory_ordinal: input.inventoryOrdinalStart + codeOffset,
      state: requestable ? "pending" : "not_applicable",
      request_schema_version: EPPO_CAPTURE_REQUEST_SCHEMA_VERSION,
      attempt_count: 0,
      claim_token: null,
      claimed_at: null,
      observed_at: requestable ? null : observedAt,
      http_status_class: requestable ? null : "not_requested",
      response_sha256: requestable ? null : notRequestedPayloadSha256,
      raw_payload: requestable ? null : jsonbParam(notRequestedPayload),
      allowed_projection: jsonbParam({}),
      source_only_fields: jsonbParam({}),
      field_rights: requestable
        ? jsonbParam({})
        : jsonbParam({ eppocode: "source_only" }),
      rights_counts: requestable
        ? jsonbParam({})
        : jsonbParam({
            source_public: 0,
            source_only: 1,
            forbidden: 0,
            unknown: 0,
          }),
      last_error_class: null,
      updated_at: observedAt,
    }));
  });

  return executor
    .insertInto("catalog_source_capture_units")
    .values(values)
    .onConflict((conflict) =>
      conflict
        .columns(["capture_id", "eppo_code", "endpoint_class"])
        .doNothing(),
    )
    .returning("id");
}

type ClaimNextEppoCaptureUnitInput = {
  captureId: string;
  claimToken: string;
  claimedAt: Date;
  maxAttempts: number;
};

export function buildClaimNextEppoCaptureUnitQuery(
  executor: QueryExecutor,
  input: ClaimNextEppoCaptureUnitInput,
) {
  return executor
    .with("claimable", (query) =>
      query
        .selectFrom("catalog_source_capture_units as claim_unit")
        .select("claim_unit.id")
        .where("claim_unit.capture_id", "=", input.captureId)
        .where("claim_unit.unit_kind", "=", "taxon_endpoint")
        .where("claim_unit.state", "in", ["pending", "failed"])
        .where("claim_unit.attempt_count", "<", input.maxAttempts)
        .where((expression) =>
          expression.exists(
            expression
              .selectFrom("catalog_source_capture_runs as active_capture")
              .select(sql<number>`1`.as("one"))
              .whereRef("active_capture.id", "=", "claim_unit.capture_id")
              .where("active_capture.state", "=", "hydrating"),
          ),
        )
        .orderBy("claim_unit.inventory_ordinal", "asc")
        .orderBy("claim_unit.endpoint_class", "asc")
        .forUpdate()
        .skipLocked()
        .limit(1),
    )
    .updateTable("catalog_source_capture_units as units")
    .set((expression) => ({
      state: "in_progress",
      claim_token: input.claimToken,
      claimed_at: input.claimedAt,
      attempt_count: expression("units.attempt_count", "+", 1),
      last_error_class: null,
      updated_at: input.claimedAt,
    }))
    .from("claimable")
    .whereRef("units.id", "=", "claimable.id")
    .returning([
      "units.id",
      "units.eppo_code",
      "units.endpoint_class",
      "units.attempt_count",
      "units.claim_token",
    ]);
}

/**
 * Failure classes that left no evidence behind.
 *
 * A unit in one of these states was never observed: the request never reached
 * a documented response, so nothing about the provider's answer is known and
 * nothing has been written. Re-attempting one in a later invocation cannot
 * overwrite evidence, which is what separates it from a digest, schema, or
 * authorization failure. Those stay terminal and fail the capture closed.
 */
export const EPPO_RECOVERABLE_TRANSPORT_ERROR_CLASSES = [
  "request_timeout",
  "rate_limited",
  "api_unavailable",
  "network_failure",
  "stale_claim_attempts_exhausted",
] as const;

export type EppoRecoverableTransportErrorClass =
  (typeof EPPO_RECOVERABLE_TRANSPORT_ERROR_CLASSES)[number];

type ReclaimTransportFailedEppoCaptureUnitsInput = {
  captureId: string;
};

/**
 * Returns transport-failed units to the pending queue with a fresh attempt
 * budget.
 *
 * The attempt budget is an operator control over one invocation, not a
 * lifetime quota for an identifier. A capture spanning hundreds of thousands
 * of serial requests will meet transient network trouble; spending the whole
 * corpus because one unit met it twice within a second is not fail-closed
 * behaviour, it is lost evidence. Terminal units are never touched here, so a
 * reclaim can only ever re-observe something that was never observed.
 */
export function buildReclaimTransportFailedEppoCaptureUnitsQuery(
  executor: QueryExecutor,
  input: ReclaimTransportFailedEppoCaptureUnitsInput,
) {
  return executor
    .updateTable("catalog_source_capture_units")
    .set({
      state: "pending",
      attempt_count: 0,
      claim_token: null,
      claimed_at: null,
      last_error_class: null,
      updated_at: new Date(),
    })
    .where("capture_id", "=", input.captureId)
    .where("unit_kind", "=", "taxon_endpoint")
    .where("state", "=", "failed")
    .where("last_error_class", "in", [
      ...EPPO_RECOVERABLE_TRANSPORT_ERROR_CLASSES,
    ])
    .returning("id");
}

/**
 * Counts failed units and how many of them carry a recoverable transport
 * class.
 *
 * The caller uses the two numbers to tell an interrupted run apart from a
 * refused one: equal counts mean every open unit can be re-observed, so the
 * capture pauses; any difference means at least one unit was refused on its
 * own evidence and the capture fails closed.
 */
export function buildEppoCaptureFailureRecoverabilityQuery(
  executor: QueryExecutor,
  captureId: string,
) {
  return executor
    .selectFrom("catalog_source_capture_units")
    .select([
      sql<number>`count(*)::int`.as("failedUnitCount"),
      sql<number>`count(*) filter (where ${sql.ref("last_error_class")} = any(${sql.val([...EPPO_RECOVERABLE_TRANSPORT_ERROR_CLASSES])}))::int`.as(
        "recoverableFailedUnitCount",
      ),
    ])
    .where("capture_id", "=", captureId)
    .where("unit_kind", "=", "taxon_endpoint")
    .where("state", "=", "failed");
}

type RecoverStaleEppoClaimsInput = {
  captureId: string;
  staleBefore: Date;
  maxAttempts: number;
};

export function buildRecoverStaleEppoClaimsQuery(
  executor: QueryExecutor,
  input: RecoverStaleEppoClaimsInput,
) {
  return executor
    .updateTable("catalog_source_capture_units")
    .set({
      state: "pending",
      claim_token: null,
      claimed_at: null,
      last_error_class: null,
      updated_at: new Date(),
    })
    .where("capture_id", "=", input.captureId)
    .where("state", "=", "in_progress")
    .where("claimed_at", "<", input.staleBefore)
    .where("attempt_count", "<", input.maxAttempts)
    .returning("id");
}

type ReleaseCancelledEppoClaimInput = {
  captureId: string;
  unitId: string;
  claimToken: string;
  releasedAt: Date;
};

export function buildReleaseCancelledEppoClaimQuery(
  executor: QueryExecutor,
  input: ReleaseCancelledEppoClaimInput,
) {
  return executor
    .updateTable("catalog_source_capture_units as units")
    .set((expression) => ({
      state: "pending",
      claim_token: null,
      claimed_at: null,
      attempt_count: sql<number>`greatest(${expression.ref("units.attempt_count")} - 1, 0)`,
      last_error_class: null,
      updated_at: input.releasedAt,
    }))
    .where("units.id", "=", input.unitId)
    .where("units.capture_id", "=", input.captureId)
    .where("units.state", "=", "in_progress")
    .where("units.claim_token", "=", input.claimToken)
    .where((expression) =>
      expression.exists(
        expression
          .selectFrom("catalog_source_capture_runs as active_capture")
          .select(sql<number>`1`.as("one"))
          .whereRef("active_capture.id", "=", "units.capture_id")
          .where("active_capture.state", "=", "hydrating"),
      ),
    )
    .returning("units.id");
}

export function buildEppoCaptureSafeStatusQuery(
  executor: QueryExecutor,
  captureId: string,
) {
  return executor
    .selectFrom("catalog_source_capture_runs as runs")
    .leftJoin(
      "catalog_source_capture_units as units",
      "units.capture_id",
      "runs.id",
    )
    .select([
      "runs.id as captureId",
      "runs.state as captureState",
      "runs.capture_tool_revision as captureToolRevision",
      "runs.openapi_sha256 as openApiSha256",
      "runs.license_sha256 as licenseSha256",
      "runs.observed_started_at as observedStartedAt",
      "runs.observed_ended_at as observedEndedAt",
      "runs.inventory_start_total as inventoryStartTotal",
      "runs.inventory_end_total as inventoryEndTotal",
      "runs.inventory_unique_codes as inventoryUniqueCodes",
      "runs.manifest_sha256 as manifestSha256",
      sql<number>`count(${sql.ref("units.id")})::int`.as("unitCount"),
      sql<number>`count(*) filter (where ${sql.ref("units.state")} in ('captured', 'source_only', 'forbidden', 'not_applicable'))::int`.as(
        "terminalUnitCount",
      ),
      sql<number>`count(*) filter (where ${sql.ref("units.state")} = 'pending')::int`.as(
        "pendingUnitCount",
      ),
      sql<number>`count(*) filter (where ${sql.ref("units.state")} = 'in_progress')::int`.as(
        "inProgressUnitCount",
      ),
      sql<number>`count(*) filter (where ${sql.ref("units.state")} = 'failed')::int`.as(
        "failedUnitCount",
      ),
    ])
    .where("runs.id", "=", captureId)
    .groupBy("runs.id");
}

export function buildEppoZeroProductFingerprintQuery(executor: QueryExecutor) {
  const fingerprint = (table: string) =>
    sql<string>`(
      select count(*)::text || ':' || encode(digest(convert_to(
        coalesce(string_agg(
          encode(digest(convert_to(row_to_json(candidate)::text, 'utf8'), 'sha256'), 'hex'),
          ',' order by candidate.id
        ), ''),
        'utf8'
      ), 'sha256'), 'hex')
      from ${sql.table(table)} as candidate
    )`;

  return executor.selectNoFrom([
    fingerprint("catalog_items").as("catalogItems"),
    fingerprint("catalog_item_names").as("catalogItemNames"),
    fingerprint("catalog_source_links").as("catalogSourceLinks"),
    fingerprint("job_queue").as("jobQueue"),
    fingerprint("plant_objects").as("plantObjects"),
    fingerprint("journal_entries").as("journalEntries"),
  ]);
}

type CompleteEppoCaptureUnitInput = {
  captureId: string;
  unitId: string;
  claimToken: string;
  observedAt: Date;
  httpStatusClass: "2xx" | "4xx" | "5xx";
  payload: JsonValue;
  state?: EppoCaptureTerminalUnitState | "not_applicable";
};

export function buildCompleteEppoCaptureUnitQuery(
  executor: QueryExecutor,
  input: CompleteEppoCaptureUnitInput,
) {
  const classification = classifyEppoResponseFields(input.payload);
  const terminalState = input.state ?? classification.unitState;
  const split = splitEppoResponseByRights(
    input.payload,
    classification.fieldRights,
  );

  return executor
    .updateTable("catalog_source_capture_units as units")
    .set({
      state: terminalState,
      claim_token: null,
      claimed_at: null,
      observed_at: input.observedAt,
      http_status_class: input.httpStatusClass,
      response_sha256: digestCanonicalJson(input.payload),
      raw_payload: jsonbParam(input.payload),
      allowed_projection: jsonbParam(split.allowedProjection),
      source_only_fields: jsonbParam(split.sourceOnlyFields),
      field_rights: jsonbParam(classification.fieldRights),
      rights_counts: jsonbParam(classification.rightsCounts),
      last_error_class: null,
      updated_at: input.observedAt,
    })
    .where("units.id", "=", input.unitId)
    .where("units.capture_id", "=", input.captureId)
    .where("units.state", "=", "in_progress")
    .where("units.claim_token", "=", input.claimToken)
    .where((expression) =>
      expression.exists(
        expression
          .selectFrom("catalog_source_capture_runs as active_capture")
          .select(sql<number>`1`.as("one"))
          .whereRef("active_capture.id", "=", "units.capture_id")
          .where("active_capture.state", "=", "hydrating"),
      ),
    )
    .returning(["units.id", "units.state", "units.response_sha256"]);
}

type FailEppoCaptureUnitInput = {
  captureId: string;
  unitId: string;
  claimToken: string;
  errorClass: string;
  failedAt: Date;
};

export function buildFailEppoCaptureUnitQuery(
  executor: QueryExecutor,
  input: FailEppoCaptureUnitInput,
) {
  return executor
    .updateTable("catalog_source_capture_units as units")
    .set({
      state: "failed",
      claim_token: null,
      claimed_at: null,
      last_error_class: input.errorClass,
      updated_at: input.failedAt,
    })
    .where("units.id", "=", input.unitId)
    .where("units.capture_id", "=", input.captureId)
    .where("units.state", "=", "in_progress")
    .where("units.claim_token", "=", input.claimToken)
    .where((expression) =>
      expression.exists(
        expression
          .selectFrom("catalog_source_capture_runs as active_capture")
          .select(sql<number>`1`.as("one"))
          .whereRef("active_capture.id", "=", "units.capture_id")
          .where("active_capture.state", "=", "hydrating"),
      ),
    )
    .returning(["units.id", "units.state", "units.attempt_count"]);
}

export type EppoCaptureRunState =
  | "planned"
  | "inventorying"
  | "hydrating"
  | "verifying"
  | "completed"
  | "paused"
  | "failed"
  | "superseded_by_new_capture";

type TransitionEppoCaptureInput = {
  captureId: string;
  fromStates: EppoCaptureRunState[];
  toState: EppoCaptureRunState;
  updates?: {
    inventoryStartTotal?: number;
    inventoryEndTotal?: number;
    inventoryUniqueCodes?: number;
    inventoryPageCount?: number;
    inventoryStartSha256?: string;
    inventoryEndSha256?: string;
    observedEndedAt?: Date;
    lastErrorClass?: string | null;
  };
};

export function buildTransitionEppoCaptureQuery(
  executor: QueryExecutor,
  input: TransitionEppoCaptureInput,
) {
  if (input.fromStates.length === 0) throw new Error("empty_from_states");
  return executor
    .updateTable("catalog_source_capture_runs")
    .set({
      state: input.toState,
      ...(input.updates?.inventoryStartTotal !== undefined
        ? { inventory_start_total: input.updates.inventoryStartTotal }
        : {}),
      ...(input.updates?.inventoryEndTotal !== undefined
        ? { inventory_end_total: input.updates.inventoryEndTotal }
        : {}),
      ...(input.updates?.inventoryUniqueCodes !== undefined
        ? { inventory_unique_codes: input.updates.inventoryUniqueCodes }
        : {}),
      ...(input.updates?.inventoryPageCount !== undefined
        ? { inventory_page_count: input.updates.inventoryPageCount }
        : {}),
      ...(input.updates?.inventoryStartSha256
        ? { inventory_start_sha256: input.updates.inventoryStartSha256 }
        : {}),
      ...(input.updates?.inventoryEndSha256
        ? { inventory_end_sha256: input.updates.inventoryEndSha256 }
        : {}),
      ...(input.updates?.observedEndedAt
        ? { observed_ended_at: input.updates.observedEndedAt }
        : {}),
      ...(input.updates && "lastErrorClass" in input.updates
        ? { last_error_class: input.updates.lastErrorClass ?? null }
        : {}),
      updated_at: new Date(),
    })
    .where("id", "=", input.captureId)
    .where("state", "in", input.fromStates)
    .returning(["id", "state"]);
}

type InsertEppoObservedSnapshotInput = {
  captureId: string;
  manifestSha256: string;
  fetchedAt: Date;
  verifiedAt: Date;
};

export function buildInsertEppoObservedSnapshotQuery(
  executor: QueryExecutor,
  input: InsertEppoObservedSnapshotInput,
) {
  return executor
    .insertInto("catalog_source_snapshots")
    .values({
      source_slug: EPPO_CAPTURE_SOURCE_SLUG,
      source_name: "EPPO Codes observed API capture",
      source_category: "taxonomic source evidence",
      source_version: `observed-capture-${input.captureId}`,
      source_url: "https://data.eppo.int/",
      license: "EPPO Codes Open Data Licence",
      license_url: "https://data.eppo.int/data/Open_Licence.pdf",
      attribution_required: true,
      attribution_text: "EPPO Codes, EPPO Codes Open Data Licence.",
      allowed_usage: jsonbParam([
        "source_capture",
        "internal_identity_evidence",
      ]),
      parser_version: EPPO_CAPTURE_SCHEMA_VERSION,
      payload_sha256: input.manifestSha256,
      fetched_at: input.fetchedAt,
      verified_at: input.verifiedAt,
      status: "rejected",
    })
    .returning("id");
}

/**
 * The capture-unit states in which a unit's `raw_payload` is guaranteed present
 * by `catalog_source_capture_units_terminal_shape_check` and frozen by
 * `catalog_source_capture_units_immutable_terminal`. A payload may only be
 * treated as durably stored one join away while its unit is in one of these.
 */
export const EPPO_TERMINAL_CAPTURE_UNIT_STATES = [
  "captured",
  "source_only",
  "forbidden",
  "not_applicable",
] as const;

/** Where a `catalog_source_records` row keeps the only copy of its payload. */
export type SourcePayloadHome = "inline" | "capture_units";

/**
 * The single definition of what an EPPO source record's raw payload is.
 *
 * The digest a record is created with, the digest a deduplication compares
 * against before dropping a copy, and the payload a rollback restores all read
 * from here. Two definitions would let a record be checked against a different
 * reading of its own bytes than the one that produced it, and that mismatch
 * would be indistinguishable from real corruption.
 *
 * Every caller must expose the capture units under the alias `units`.
 */
function aggregatedEppoRawPayload() {
  return sql<JsonValue>`jsonb_object_agg(${sql.ref("units.endpoint_class")}, ${sql.ref("units.raw_payload")} order by ${sql.ref("units.endpoint_class")})`;
}

function aggregatedEppoRawPayloadDigest() {
  return sql<string>`encode(digest(convert_to((${aggregatedEppoRawPayload()})::text, 'utf8'), 'sha256'), 'hex')`;
}

type MaterializeEppoSourceRecordsInput = {
  captureId: string;
  sourceSnapshotId: string;
};

export function buildMaterializeEppoSourceRecordsQuery(
  executor: QueryExecutor,
  input: MaterializeEppoSourceRecordsInput,
) {
  return executor
    .insertInto("catalog_source_records")
    .columns([
      "source_snapshot_id",
      "source_record_id",
      "raw_payload_home",
      "raw_payload_sha256",
      "source_only_fields",
      "allowed_projection",
      "projection_status",
    ])
    .expression(
      executor
        .selectFrom("catalog_source_capture_units as units")
        .select([
          sql<string>`${input.sourceSnapshotId}::uuid`.as("source_snapshot_id"),
          "units.eppo_code as source_record_id",
          // The units already hold these bytes, immutably and digest-covered.
          // Writing them a second time here is what made this table cost
          // ~16 KB per taxon for provenance nobody reads.
          sql<string>`${"capture_units"}`.as("raw_payload_home"),
          aggregatedEppoRawPayloadDigest().as("raw_payload_sha256"),
          sql<JsonValue>`jsonb_build_object(
            'payloads', jsonb_object_agg(${sql.ref("units.endpoint_class")}, ${sql.ref("units.source_only_fields")} order by ${sql.ref("units.endpoint_class")}),
            'field_rights', jsonb_object_agg(${sql.ref("units.endpoint_class")}, ${sql.ref("units.field_rights")} order by ${sql.ref("units.endpoint_class")}),
            'rights_counts', jsonb_object_agg(${sql.ref("units.endpoint_class")}, ${sql.ref("units.rights_counts")} order by ${sql.ref("units.endpoint_class")}),
            'identifier_class', max(${sql.ref("units.identifier_class")})
          )`.as("source_only_fields"),
          sql<JsonValue>`jsonb_object_agg(
            ${sql.ref("units.endpoint_class")},
            ${sql.ref("units.allowed_projection")}
            order by ${sql.ref("units.endpoint_class")}
          )`.as("allowed_projection"),
          sql<string>`${"quarantined"}`.as("projection_status"),
        ])
        .where("units.capture_id", "=", input.captureId)
        .where("units.unit_kind", "=", "taxon_endpoint")
        .where("units.state", "in", EPPO_TERMINAL_CAPTURE_UNIT_STATES)
        .groupBy("units.eppo_code")
        .having(
          sql<number>`count(distinct ${sql.ref("units.endpoint_class")})`,
          "=",
          EPPO_DETAIL_ENDPOINT_CLASSES.length,
        ),
    );
}

/**
 * Rebuilds one source record's raw payload from the capture units that produced
 * it, together with the digest those units reproduce.
 *
 * This is the reader for anything that needs the aggregated body of a record
 * whose payload lives in its units. It is also the safety check: a caller that
 * compares the returned digest against the record's stored
 * `raw_payload_sha256` learns whether the surviving copy still reproduces the
 * bytes the record was created with.
 */
export function buildReconstructEppoSourceRecordPayloadQuery(
  executor: QueryExecutor,
  input: { sourceSnapshotId: string; sourceRecordId: string },
) {
  return executor
    .selectFrom("catalog_source_capture_units as units")
    .innerJoin(
      "catalog_source_capture_runs as runs",
      "runs.id",
      "units.capture_id",
    )
    .select([
      aggregatedEppoRawPayload().as("raw_payload"),
      aggregatedEppoRawPayloadDigest().as("raw_payload_sha256"),
    ])
    .where("runs.source_snapshot_id", "=", input.sourceSnapshotId)
    .where("units.eppo_code", "=", input.sourceRecordId)
    .where("units.unit_kind", "=", "taxon_endpoint")
    .where("units.state", "in", EPPO_TERMINAL_CAPTURE_UNIT_STATES)
    .groupBy("units.eppo_code")
    .having(
      sql<number>`count(distinct ${sql.ref("units.endpoint_class")})`,
      "=",
      EPPO_DETAIL_ENDPOINT_CLASSES.length,
    );
}

/**
 * Takes one bounded batch of records at the given payload home.
 *
 * `for update skip locked` is what makes two runs safe together: each takes a
 * disjoint set and neither waits on the other, so a second run never observes a
 * record mid-transition.
 */
export function buildClaimEppoSourceRecordBatchQuery(
  executor: QueryExecutor,
  input: {
    sourceSnapshotId: string;
    payloadHome: SourcePayloadHome;
    batchSize: number;
  },
) {
  return executor
    .selectFrom("catalog_source_records")
    .select(["id", "source_record_id", "raw_payload_sha256"])
    .where("source_snapshot_id", "=", input.sourceSnapshotId)
    .where("raw_payload_home", "=", input.payloadHome)
    .orderBy("id", "asc")
    .forUpdate()
    .skipLocked()
    .limit(input.batchSize);
}

/**
 * Drops the reproducible copy for exactly those claimed records whose capture
 * units reproduce their stored digest.
 *
 * The comparison and the write are one statement, so a record can never be
 * emptied on the strength of a digest that was true a moment earlier. A record
 * whose units are missing, incomplete, or no longer reproduce its digest simply
 * does not appear in the CTE, keeps its payload, and is reported as held.
 */
export function buildDeduplicateEppoSourceRecordPayloadsQuery(
  executor: QueryExecutor,
  input: { recordIds: readonly string[] },
) {
  return executor
    .with("reconstructed", (query) =>
      query
        .selectFrom("catalog_source_records as records")
        .innerJoin(
          "catalog_source_capture_runs as runs",
          "runs.source_snapshot_id",
          "records.source_snapshot_id",
        )
        .innerJoin("catalog_source_capture_units as units", (join) =>
          join
            .onRef("units.capture_id", "=", "runs.id")
            .onRef("units.eppo_code", "=", "records.source_record_id")
            .on("units.unit_kind", "=", "taxon_endpoint")
            .on("units.state", "in", EPPO_TERMINAL_CAPTURE_UNIT_STATES),
        )
        .select([
          "records.id as record_id",
          "records.raw_payload_sha256 as stored_digest",
          aggregatedEppoRawPayloadDigest().as("unit_digest"),
        ])
        .where("records.id", "in", input.recordIds)
        .where("records.raw_payload_home", "=", "inline")
        .groupBy(["records.id", "records.raw_payload_sha256"])
        .having(
          sql<number>`count(distinct ${sql.ref("units.endpoint_class")})`,
          "=",
          EPPO_DETAIL_ENDPOINT_CLASSES.length,
        ),
    )
    .updateTable("catalog_source_records as target")
    .set({
      raw_payload: null,
      raw_payload_home: "capture_units",
      updated_at: sql<Date>`now()`,
    })
    .from("reconstructed")
    .whereRef("target.id", "=", "reconstructed.record_id")
    .whereRef("reconstructed.unit_digest", "=", "reconstructed.stored_digest")
    .returning("target.id");
}

/**
 * Restores the inline payload for claimed records, from the same aggregate
 * expression that produced their digest.
 *
 * This is the bounded recovery for the whole slice: nothing was deleted, so
 * rolling a record forward is a rebuild rather than a data recovery.
 */
export function buildRestoreEppoSourceRecordPayloadsQuery(
  executor: QueryExecutor,
  input: { recordIds: readonly string[] },
) {
  return executor
    .with("rebuilt", (query) =>
      query
        .selectFrom("catalog_source_records as records")
        .innerJoin(
          "catalog_source_capture_runs as runs",
          "runs.source_snapshot_id",
          "records.source_snapshot_id",
        )
        .innerJoin("catalog_source_capture_units as units", (join) =>
          join
            .onRef("units.capture_id", "=", "runs.id")
            .onRef("units.eppo_code", "=", "records.source_record_id")
            .on("units.unit_kind", "=", "taxon_endpoint")
            .on("units.state", "in", EPPO_TERMINAL_CAPTURE_UNIT_STATES),
        )
        .select([
          "records.id as record_id",
          aggregatedEppoRawPayload().as("payload"),
        ])
        .where("records.id", "in", input.recordIds)
        .where("records.raw_payload_home", "=", "capture_units")
        .groupBy("records.id")
        .having(
          sql<number>`count(distinct ${sql.ref("units.endpoint_class")})`,
          "=",
          EPPO_DETAIL_ENDPOINT_CLASSES.length,
        ),
    )
    .updateTable("catalog_source_records as target")
    .set({
      raw_payload: sql<JsonValue>`${sql.ref("rebuilt.payload")}`,
      raw_payload_home: "inline",
      updated_at: sql<Date>`now()`,
    })
    .from("rebuilt")
    .whereRef("target.id", "=", "rebuilt.record_id")
    .returning("target.id");
}

/**
 * Lists the snapshots an observed capture actually produced.
 *
 * Only these snapshots have capture units, so only their records can ever have
 * a second home; every other source family keeps its single inline copy.
 */
export function buildListEppoCapturedSnapshotsQuery(executor: QueryExecutor) {
  return executor
    .selectFrom("catalog_source_capture_runs")
    .select("source_snapshot_id")
    .where("source_snapshot_id", "is not", null)
    .where("state", "=", "completed")
    .orderBy("source_snapshot_id", "asc");
}

export type EppoZeroProductFingerprint = {
  catalogItems: string;
  catalogItemNames: string;
  catalogSourceLinks: string;
  jobQueue: string;
  plantObjects: string;
  journalEntries: string;
};

export type EppoCapturedInventory = {
  total: number;
  pageCount: number;
  codes: string[];
  sha256: string;
};

export type ClaimedEppoCaptureUnit = {
  id: string;
  eppoCode: string;
  endpointClass: EppoDetailEndpointClass;
  attemptCount: number;
  claimToken: string;
};

export type EppoCaptureSafeStatus = {
  captureId: string;
  captureState: EppoCaptureRunState;
  captureToolRevision: string;
  openApiSha256: string;
  licenseSha256: string;
  observedStartedAt: Date;
  observedEndedAt: Date | null;
  inventoryStartTotal: number | null;
  inventoryEndTotal: number | null;
  inventoryUniqueCodes: number | null;
  manifestSha256: string | null;
  unitCount: number;
  terminalUnitCount: number;
  pendingUnitCount: number;
  inProgressUnitCount: number;
  failedUnitCount: number;
};

export type EppoCaptureFinalReceipt = {
  class: "observed_capture";
  captureId: string;
  authority: "overgarden_observed_capture";
  state: "completed";
  manifestSha256: string;
  inventoryTotal: number;
  inventorySha256: string;
  endpointUnits: number;
  terminalCounts: Record<string, number>;
  rightsCounts: Record<EppoCaptureRight, number>;
  normalizedSourceRecords: number;
  productMutationCount: 0;
  searchMutationCount: 0;
  zeroProductEffect: "verified";
  observedStartedAt: string;
  observedEndedAt: string;
};

function asNumber(value: string | number | bigint | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error("unsafe_database_count");
  }
  return number;
}

function assertOneEffect(
  row: { id: string } | undefined,
  errorClass: string,
): asserts row is { id: string } {
  if (!row) throw new Error(errorClass);
}

export async function readEppoZeroProductFingerprint(
  executor: QueryExecutor = db,
): Promise<EppoZeroProductFingerprint> {
  const row =
    await buildEppoZeroProductFingerprintQuery(
      executor,
    ).executeTakeFirstOrThrow();
  return {
    catalogItems: String(row.catalogItems),
    catalogItemNames: String(row.catalogItemNames),
    catalogSourceLinks: String(row.catalogSourceLinks),
    jobQueue: String(row.jobQueue),
    plantObjects: String(row.plantObjects),
    journalEntries: String(row.journalEntries),
  };
}

export async function createEppoCapture(
  input: CreateEppoCaptureInput,
  executor: QueryExecutor = db,
): Promise<{ id: string; state: EppoCaptureRunState }> {
  const row = await buildCreateEppoCaptureQuery(
    executor,
    input,
  ).executeTakeFirstOrThrow();
  return { id: row.id, state: row.state as EppoCaptureRunState };
}

export async function transitionEppoCapture(
  input: TransitionEppoCaptureInput,
  executor: QueryExecutor = db,
): Promise<EppoCaptureRunState> {
  const row = await buildTransitionEppoCaptureQuery(
    executor,
    input,
  ).executeTakeFirst();
  assertOneEffect(row, "capture_state_transition_rejected");
  return row.state as EppoCaptureRunState;
}

export async function recordEppoInventoryPage(
  input: InsertEppoInventoryPageInput,
  executor: Kysely<Database> = db,
): Promise<ParsedEppoInventoryPage & { responseSha256: string }> {
  const parsed = parseEppoInventoryPage(input.payload, {
    offset: input.offset,
    limit: input.limit,
  });
  const responseSha256 = digestCanonicalJson(input.payload);

  await executor.transaction().execute(async (transaction) => {
    const run = await transaction
      .selectFrom("catalog_source_capture_runs")
      .select(["state", "inventory_start_total"])
      .where("id", "=", input.captureId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (
      run.state !== "inventorying" &&
      !(run.state === "paused" && run.inventory_start_total === null)
    ) {
      throw new Error("inventory_capture_state_rejected");
    }

    await buildInsertEppoInventoryPageQuery(transaction, input).execute();
    const persisted = await transaction
      .selectFrom("catalog_source_capture_units")
      .select("response_sha256")
      .where("capture_id", "=", input.captureId)
      .where("endpoint_class", "=", "taxon_list")
      .where("unit_key", "=", `page:${input.offset}`)
      .executeTakeFirstOrThrow();

    if (persisted.response_sha256 !== responseSha256) {
      throw new Error("inventory_replay_digest_mismatch");
    }

    for (
      let batchOffset = 0;
      batchOffset < parsed.codes.length;
      batchOffset += EPPO_CAPTURE_QUEUE_BATCH_CODES
    ) {
      await buildQueueEppoEndpointUnitsQuery(transaction, {
        captureId: input.captureId,
        inventoryOrdinalStart: input.offset + batchOffset,
        identifiers: parsed.identifiers.slice(
          batchOffset,
          batchOffset + EPPO_CAPTURE_QUEUE_BATCH_CODES,
        ),
      }).execute();
    }
  });

  return { ...parsed, responseSha256 };
}

export async function readEppoCapturedInventory(
  captureId: string,
  executor: QueryExecutor = db,
): Promise<EppoCapturedInventory> {
  const pages = await executor
    .selectFrom("catalog_source_capture_units")
    .select(["inventory_offset", "inventory_limit", "raw_payload"])
    .where("capture_id", "=", captureId)
    .where("unit_kind", "=", "inventory_page")
    .where("state", "in", [
      "captured",
      "source_only",
      "forbidden",
      "not_applicable",
    ])
    .orderBy("inventory_offset", "asc")
    .execute();

  if (pages.length === 0) throw new Error("inventory_missing");
  const allCodes: string[] = [];
  let total: number | null = null;
  let expectedOffset = 0;

  for (const page of pages) {
    if (
      page.inventory_offset === null ||
      page.inventory_limit === null ||
      page.raw_payload === null ||
      page.inventory_offset !== expectedOffset
    ) {
      throw new Error("inventory_page_gap");
    }
    const parsed = parseEppoInventoryPage(page.raw_payload, {
      offset: page.inventory_offset,
      limit: page.inventory_limit,
    });
    total ??= parsed.total;
    if (parsed.total !== total) throw new Error("inventory_total_drift");
    allCodes.push(...parsed.codes);
    expectedOffset += page.inventory_limit;
  }

  if (total !== allCodes.length || new Set(allCodes).size !== allCodes.length) {
    throw new Error("inventory_closure_mismatch");
  }
  return {
    total,
    pageCount: pages.length,
    codes: allCodes,
    sha256: digestCanonicalJson(allCodes),
  };
}

export async function claimNextEppoCaptureUnit(
  input: ClaimNextEppoCaptureUnitInput,
  executor: QueryExecutor = db,
): Promise<ClaimedEppoCaptureUnit | null> {
  const row = await buildClaimNextEppoCaptureUnitQuery(
    executor,
    input,
  ).executeTakeFirst();
  if (!row) return null;
  if (
    !row.eppo_code ||
    !EPPO_DETAIL_ENDPOINT_CLASSES.includes(
      row.endpoint_class as EppoDetailEndpointClass,
    ) ||
    row.claim_token !== input.claimToken
  ) {
    throw new Error("claimed_unit_shape_mismatch");
  }
  return {
    id: row.id,
    eppoCode: row.eppo_code,
    endpointClass: row.endpoint_class as EppoDetailEndpointClass,
    attemptCount: row.attempt_count,
    claimToken: row.claim_token,
  };
}

export async function completeEppoCaptureUnit(
  input: CompleteEppoCaptureUnitInput,
  executor: QueryExecutor = db,
): Promise<{ id: string; state: string; responseSha256: string }> {
  const row = await buildCompleteEppoCaptureUnitQuery(
    executor,
    input,
  ).executeTakeFirst();
  if (!row || !row.response_sha256) {
    throw new Error("late_or_stale_capture_unit_completion");
  }
  return {
    id: row.id,
    state: row.state,
    responseSha256: row.response_sha256,
  };
}

export async function failEppoCaptureUnit(
  input: FailEppoCaptureUnitInput,
  executor: QueryExecutor = db,
): Promise<{ id: string; attemptCount: number }> {
  const row = await buildFailEppoCaptureUnitQuery(
    executor,
    input,
  ).executeTakeFirst();
  if (!row) throw new Error("late_or_stale_capture_unit_failure");
  return { id: row.id, attemptCount: row.attempt_count };
}

export async function releaseCancelledEppoCaptureClaim(
  input: ReleaseCancelledEppoClaimInput,
  executor: QueryExecutor = db,
): Promise<void> {
  const row = await buildReleaseCancelledEppoClaimQuery(
    executor,
    input,
  ).executeTakeFirst();
  if (!row) throw new Error("late_or_stale_cancelled_claim_release");
}

export async function recoverStaleEppoCaptureClaims(
  input: RecoverStaleEppoClaimsInput,
  executor: QueryExecutor = db,
): Promise<{ recovered: number; exhausted: number }> {
  const recovered = await buildRecoverStaleEppoClaimsQuery(
    executor,
    input,
  ).execute();
  const exhausted = await executor
    .updateTable("catalog_source_capture_units")
    .set({
      state: "failed",
      claim_token: null,
      claimed_at: null,
      last_error_class: "stale_claim_attempts_exhausted",
      updated_at: new Date(),
    })
    .where("capture_id", "=", input.captureId)
    .where("state", "=", "in_progress")
    .where("claimed_at", "<", input.staleBefore)
    .where("attempt_count", ">=", input.maxAttempts)
    .returning("id")
    .execute();
  return { recovered: recovered.length, exhausted: exhausted.length };
}

export async function reclaimTransportFailedEppoCaptureUnits(
  input: ReclaimTransportFailedEppoCaptureUnitsInput,
  executor: QueryExecutor = db,
): Promise<{ reclaimed: number }> {
  const rows = await buildReclaimTransportFailedEppoCaptureUnitsQuery(
    executor,
    input,
  ).execute();
  return { reclaimed: rows.length };
}

export async function readEppoCaptureFailureRecoverability(
  captureId: string,
  executor: QueryExecutor = db,
): Promise<{ failedUnitCount: number; recoverableFailedUnitCount: number }> {
  const row = await buildEppoCaptureFailureRecoverabilityQuery(
    executor,
    captureId,
  ).executeTakeFirstOrThrow();
  return {
    failedUnitCount: row.failedUnitCount,
    recoverableFailedUnitCount: row.recoverableFailedUnitCount,
  };
}

export async function readEppoCaptureSafeStatus(
  captureId: string,
  executor: QueryExecutor = db,
): Promise<EppoCaptureSafeStatus> {
  const row = await buildEppoCaptureSafeStatusQuery(
    executor,
    captureId,
  ).executeTakeFirstOrThrow();
  return {
    captureId: row.captureId,
    captureState: row.captureState as EppoCaptureRunState,
    captureToolRevision: row.captureToolRevision,
    openApiSha256: row.openApiSha256,
    licenseSha256: row.licenseSha256,
    observedStartedAt: row.observedStartedAt,
    observedEndedAt: row.observedEndedAt,
    inventoryStartTotal: asNumber(row.inventoryStartTotal),
    inventoryEndTotal: asNumber(row.inventoryEndTotal),
    inventoryUniqueCodes: asNumber(row.inventoryUniqueCodes),
    manifestSha256: row.manifestSha256,
    unitCount: row.unitCount,
    terminalUnitCount: row.terminalUnitCount,
    pendingUnitCount: row.pendingUnitCount,
    inProgressUnitCount: row.inProgressUnitCount,
    failedUnitCount: row.failedUnitCount,
  };
}

export async function readLatestResumableEppoCaptureId(
  executor: QueryExecutor = db,
): Promise<string | null> {
  const row = await executor
    .selectFrom("catalog_source_capture_runs")
    .select("id")
    .where("source_slug", "=", EPPO_CAPTURE_SOURCE_SLUG)
    .where("state", "in", [
      "planned",
      "inventorying",
      "hydrating",
      "verifying",
      "paused",
    ])
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  return row?.id ?? null;
}

export async function readLatestCompletedEppoCaptureId(
  executor: QueryExecutor = db,
): Promise<string | null> {
  const row = await executor
    .selectFrom("catalog_source_capture_runs")
    .select("id")
    .where("source_slug", "=", EPPO_CAPTURE_SOURCE_SLUG)
    .where("state", "=", "completed")
    .orderBy("observed_ended_at", "desc")
    .executeTakeFirst();
  return row?.id ?? null;
}

export async function verifyCompletedEppoCapture(
  captureId: string,
  executor: QueryExecutor = db,
): Promise<EppoCaptureFinalReceipt> {
  const run = await executor
    .selectFrom("catalog_source_capture_runs")
    .selectAll()
    .where("id", "=", captureId)
    .where("state", "=", "completed")
    .executeTakeFirstOrThrow();
  if (
    !run.source_snapshot_id ||
    !run.manifest_sha256 ||
    !run.inventory_start_sha256 ||
    !run.observed_ended_at
  ) {
    throw new Error("completed_capture_shape_mismatch");
  }
  const inventory = await readEppoCapturedInventory(captureId, executor);
  if (
    inventory.sha256 !== run.inventory_start_sha256 ||
    inventory.sha256 !== run.inventory_end_sha256 ||
    inventory.total !== asNumber(run.inventory_start_total) ||
    inventory.total !== asNumber(run.inventory_end_total) ||
    inventory.total !== asNumber(run.inventory_unique_codes)
  ) {
    throw new Error("completed_inventory_readback_mismatch");
  }
  const normalized = await executor
    .selectFrom("catalog_source_records")
    .select(sql<number>`count(*)::int`.as("count"))
    .where("source_snapshot_id", "=", run.source_snapshot_id)
    .where("projection_status", "=", "quarantined")
    .executeTakeFirstOrThrow();
  if (normalized.count !== inventory.total) {
    throw new Error("completed_source_record_readback_mismatch");
  }
  const currentProduct = await readEppoZeroProductFingerprint(executor);
  if (
    digestCanonicalJson(currentProduct) !==
    digestCanonicalJson(run.zero_product_baseline)
  ) {
    throw new Error("completed_zero_product_readback_mismatch");
  }

  const storedTerminalCounts = run.terminal_counts as Record<string, unknown>;
  const storedRightsCounts = run.rights_counts as Record<string, unknown>;
  const terminalCounts = Object.fromEntries(
    Object.entries(storedTerminalCounts).map(([key, value]) => [
      key,
      Number(value),
    ]),
  );
  const rightsCounts = Object.fromEntries(
    EPPO_CAPTURE_RIGHTS.map((right) => [
      right,
      Number(storedRightsCounts[right] ?? 0),
    ]),
  ) as Record<EppoCaptureRight, number>;
  if (
    Object.values(terminalCounts).some(
      (value) => !Number.isSafeInteger(value) || value < 0,
    ) ||
    Object.values(rightsCounts).some(
      (value) => !Number.isSafeInteger(value) || value < 0,
    )
  ) {
    throw new Error("completed_aggregate_readback_mismatch");
  }

  return {
    class: "observed_capture",
    captureId,
    authority: "overgarden_observed_capture",
    state: "completed",
    manifestSha256: run.manifest_sha256,
    inventoryTotal: inventory.total,
    inventorySha256: inventory.sha256,
    endpointUnits: inventory.total * EPPO_DETAIL_ENDPOINT_CLASSES.length,
    terminalCounts,
    rightsCounts,
    normalizedSourceRecords: normalized.count,
    productMutationCount: 0,
    searchMutationCount: 0,
    zeroProductEffect: "verified",
    observedStartedAt: run.observed_started_at.toISOString(),
    observedEndedAt: run.observed_ended_at.toISOString(),
  };
}

export async function withEppoCaptureWriterLock<T>(
  callback: (executor: Kysely<Database>) => Promise<T>,
  executor: Kysely<Database> = db,
): Promise<T> {
  return executor.connection().execute(async (connection) => {
    const result = await sql<{ locked: boolean }>`
      select pg_try_advisory_lock(
        hashtextextended(${EPPO_CAPTURE_WRITER_LOCK_KEY}, 0)
      ) as locked
    `.execute(connection);
    if (!result.rows[0]?.locked) throw new Error("capture_writer_locked");
    try {
      return await callback(connection);
    } finally {
      await sql`
        select pg_advisory_unlock(
          hashtextextended(${EPPO_CAPTURE_WRITER_LOCK_KEY}, 0)
        )
      `.execute(connection);
    }
  });
}

type FinalizeEppoCaptureInput = {
  captureId: string;
  endingInventory: EppoCapturedInventory;
  observedEndedAt: Date;
};

export async function finalizeEppoCapture(
  input: FinalizeEppoCaptureInput,
  executor: Kysely<Database> = db,
): Promise<EppoCaptureFinalReceipt> {
  return executor.transaction().execute(async (transaction) => {
    const run = await transaction
      .selectFrom("catalog_source_capture_runs")
      .selectAll()
      .where("id", "=", input.captureId)
      .where("state", "=", "verifying")
      .forUpdate()
      .executeTakeFirstOrThrow();
    const startTotal = asNumber(run.inventory_start_total);
    const uniqueCodes = asNumber(run.inventory_unique_codes);
    if (
      startTotal === null ||
      uniqueCodes === null ||
      startTotal !== input.endingInventory.total ||
      uniqueCodes !== input.endingInventory.total ||
      run.inventory_start_sha256 !== input.endingInventory.sha256
    ) {
      throw new Error("inventory_drift");
    }

    const terminal = await transaction
      .selectFrom("catalog_source_capture_units")
      .select([
        "state",
        sql<number>`count(*)::int`.as("count"),
        sql<number>`coalesce(sum(greatest(${sql.ref("attempt_count")} - 1, 0)), 0)::int`.as(
          "retries",
        ),
        sql<number>`coalesce(sum((${sql.ref("rights_counts")} ->> 'source_public')::int), 0)::int`.as(
          "sourcePublic",
        ),
        sql<number>`coalesce(sum((${sql.ref("rights_counts")} ->> 'source_only')::int), 0)::int`.as(
          "sourceOnly",
        ),
        sql<number>`coalesce(sum((${sql.ref("rights_counts")} ->> 'forbidden')::int), 0)::int`.as(
          "forbidden",
        ),
        sql<number>`coalesce(sum((${sql.ref("rights_counts")} ->> 'unknown')::int), 0)::int`.as(
          "unknown",
        ),
      ])
      .where("capture_id", "=", input.captureId)
      .where("unit_kind", "=", "taxon_endpoint")
      .groupBy("state")
      .execute();

    const terminalCounts: Record<string, number> = {
      captured: 0,
      source_only: 0,
      forbidden: 0,
      not_applicable: 0,
      failed: 0,
      pending: 0,
      in_progress: 0,
    };
    const rightsCounts: Record<EppoCaptureRight, number> = {
      source_public: 0,
      source_only: 0,
      forbidden: 0,
      unknown: 0,
    };
    let retryCount = 0;
    for (const row of terminal) {
      terminalCounts[row.state] = row.count;
      retryCount += row.retries;
      rightsCounts.source_public += row.sourcePublic;
      rightsCounts.source_only += row.sourceOnly;
      rightsCounts.forbidden += row.forbidden;
      rightsCounts.unknown += row.unknown;
    }

    const endpointUnits =
      input.endingInventory.total * EPPO_DETAIL_ENDPOINT_CLASSES.length;
    const completedUnits =
      terminalCounts.captured +
      terminalCounts.source_only +
      terminalCounts.forbidden +
      terminalCounts.not_applicable;
    if (
      completedUnits !== endpointUnits ||
      terminalCounts.failed > 0 ||
      terminalCounts.pending > 0 ||
      terminalCounts.in_progress > 0
    ) {
      throw new Error("endpoint_closure_mismatch");
    }

    const zeroProductAfter = await readEppoZeroProductFingerprint(transaction);
    const baseline = run.zero_product_baseline as EppoZeroProductFingerprint;
    if (
      digestCanonicalJson(baseline) !== digestCanonicalJson(zeroProductAfter)
    ) {
      throw new Error("zero_product_effect_mismatch");
    }
    const zeroProductReceipt = {
      status: "verified",
      fingerprintSha256: digestCanonicalJson(zeroProductAfter),
      productMutationCount: 0,
      searchMutationCount: 0,
    } as const;

    const manifest = {
      captureSchemaVersion: EPPO_CAPTURE_SCHEMA_VERSION,
      captureId: input.captureId,
      authority: "overgarden_observed_capture",
      sourceSlug: EPPO_CAPTURE_SOURCE_SLUG,
      observedStartedAt: run.observed_started_at.toISOString(),
      observedEndedAt: input.observedEndedAt.toISOString(),
      inventory: {
        startTotal,
        endTotal: input.endingInventory.total,
        uniqueCodes,
        pageCount: run.inventory_page_count,
        startSha256: run.inventory_start_sha256,
        endSha256: input.endingInventory.sha256,
      },
      endpointUnits,
      terminalCounts,
      rightsCounts,
      retryCount,
      zeroProductReceipt,
    };
    const manifestSha256 = digestCanonicalJson(manifest);
    const snapshot = await buildInsertEppoObservedSnapshotQuery(transaction, {
      captureId: input.captureId,
      manifestSha256,
      fetchedAt: run.observed_started_at,
      verifiedAt: input.observedEndedAt,
    }).executeTakeFirstOrThrow();

    await buildMaterializeEppoSourceRecordsQuery(transaction, {
      captureId: input.captureId,
      sourceSnapshotId: snapshot.id,
    }).execute();
    const normalized = await transaction
      .selectFrom("catalog_source_records")
      .select(sql<number>`count(*)::int`.as("count"))
      .where("source_snapshot_id", "=", snapshot.id)
      .executeTakeFirstOrThrow();
    if (normalized.count !== input.endingInventory.total) {
      throw new Error("normalized_source_record_closure_mismatch");
    }

    await transaction
      .updateTable("catalog_source_snapshots")
      .set({ status: "imported", updated_at: input.observedEndedAt })
      .where("id", "=", snapshot.id)
      .where("status", "=", "rejected")
      .executeTakeFirstOrThrow();

    const completed = await transaction
      .updateTable("catalog_source_capture_runs")
      .set({
        source_snapshot_id: snapshot.id,
        state: "completed",
        observed_ended_at: input.observedEndedAt,
        inventory_end_total: input.endingInventory.total,
        inventory_end_sha256: input.endingInventory.sha256,
        manifest_sha256: manifestSha256,
        terminal_counts: jsonbParam({
          ...terminalCounts,
          endpoint_units: endpointUnits,
          normalized_source_records: normalized.count,
          incomplete: 0,
        }),
        rights_counts: jsonbParam(rightsCounts),
        retry_count: retryCount,
        last_error_class: null,
        zero_product_receipt: jsonbParam(zeroProductReceipt),
        updated_at: input.observedEndedAt,
      })
      .where("id", "=", input.captureId)
      .where("state", "=", "verifying")
      .returning("id")
      .executeTakeFirst();
    assertOneEffect(completed, "capture_completion_rejected");

    return {
      class: "observed_capture",
      captureId: input.captureId,
      authority: "overgarden_observed_capture",
      state: "completed",
      manifestSha256,
      inventoryTotal: input.endingInventory.total,
      inventorySha256: input.endingInventory.sha256,
      endpointUnits,
      terminalCounts,
      rightsCounts,
      normalizedSourceRecords: normalized.count,
      productMutationCount: 0,
      searchMutationCount: 0,
      zeroProductEffect: "verified",
      observedStartedAt: run.observed_started_at.toISOString(),
      observedEndedAt: input.observedEndedAt.toISOString(),
    };
  });
}
