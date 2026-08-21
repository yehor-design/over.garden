import "server-only";

import { sql, type Insertable, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { ActorClass } from "@/lib/garden/actor-class";
import { normalizeActorClass } from "@/lib/garden/actor-class";
import type {
  ActivationSource,
  ActivationSurfaceKind,
} from "@/lib/garden/entry-contracts";
import type {
  FollowUpUsefulness,
  FollowUpUsefulnessReason,
  FollowUpValuePulseOutcome,
} from "@/lib/garden/follow-up-value-pulse";
import type { JournalCoverSource } from "@/lib/garden/journal-cover-contract";
import type {
  AnalyticsEvent,
  AnalyticsEventName,
  Database,
  EntryScope,
  JsonValue,
  LocationVisibility,
  PlantObjectKind,
  VarietyState,
} from "@/db/schema";
import type { RequestScope } from "@/server/request-scope";
import { assertNoPreciseLocationTextInValues } from "@/lib/privacy/precise-location-text";
import { analyticsDeliveryQuality } from "@/lib/public-projection-quality";

type QueryExecutor = Kysely<Database> | Transaction<Database>;
type NewAnalyticsEventRow = Insertable<Database["analytics_events"]>;

export type PhotoCountBucket =
  | "none"
  | "one"
  | "two_to_three"
  | "four_to_six"
  | "seven_to_ten";

export type BlockCountBucket =
  | "one"
  | "two_to_five"
  | "six_to_twenty"
  | "twenty_one_plus";

export type ComposerMutationOutcome =
  | "succeeded"
  | "conflict"
  | "failed"
  | "stale";

export type AnalyticsCoverSource = JournalCoverSource;

export interface AnalyticsEventProperties {
  activation_source?: ActivationSource;
  actor_class?: ActorClass;
  entry_scope?: EntryScope;
  has_photo?: boolean;
  is_backdated?: boolean;
  location_visibility_level?: LocationVisibility;
  object_kind?: PlantObjectKind;
  pulse_outcome?: FollowUpValuePulseOutcome;
  source_surface_kind?: ActivationSurfaceKind;
  usefulness?: FollowUpUsefulness;
  usefulness_reason?: FollowUpUsefulnessReason;
  variety_state?: VarietyState;
  followed_by_action?: boolean;
  photo_count_bucket?: PhotoCountBucket;
  cover_source?: AnalyticsCoverSource;
  block_count_bucket?: BlockCountBucket;
  has_formatting?: boolean;
  via_voice?: boolean;
  schema_version?: "v1";
  mutation_outcome?: ComposerMutationOutcome;
  latency_bucket?: "fast" | "normal" | "slow";
}

export interface RecordAnalyticsEventInput {
  eventName: AnalyticsEventName;
  properties?: AnalyticsEventProperties;
  sessionId?: string | null;
  spaceId?: string | null;
  plantObjectId?: string | null;
  journalEntryId?: string | null;
  relatedEventId?: string | null;
}

type AnalyticsEventRecorder = (
  scope: RequestScope,
  input: RecordAnalyticsEventInput,
) => Promise<AnalyticsEvent>;

export type AnalyticsDeliveryReceipt =
  | {
      status: "recorded_verified";
      event: AnalyticsEvent;
      qualityClass: "verified";
      qualityReasons: [];
    }
  | {
      status: "delivery_degraded";
      event: null;
      qualityClass: "unverified";
      qualityReasons: ["analytics_delivery_unavailable"];
    };

const ALLOWED_EVENT_NAMES = new Set<AnalyticsEventName>([
  "activation_started",
  "space_created",
  "object_created",
  "entry_logged",
  "entry_photo_attached",
  "progress_screen_shown",
  "own_record_revisited",
  "follow_up_value_pulse",
  "journal_blocks_reordered",
  "journal_cover_changed",
]);

const ALLOWED_PROPERTY_KEYS = new Set<keyof AnalyticsEventProperties>([
  "activation_source",
  "actor_class",
  "entry_scope",
  "has_photo",
  "is_backdated",
  "location_visibility_level",
  "object_kind",
  "source_surface_kind",
  "variety_state",
  "followed_by_action",
  "pulse_outcome",
  "usefulness",
  "usefulness_reason",
  "photo_count_bucket",
  "cover_source",
  "block_count_bucket",
  "has_formatting",
  "via_voice",
  "schema_version",
  "mutation_outcome",
  "latency_bucket",
]);

const FORBIDDEN_PROPERTY_FRAGMENTS = [
  "address",
  "body",
  "content",
  "coordinate",
  "derivative_key",
  "email",
  "exif",
  "file_name",
  "filename",
  "ip",
  "lat",
  "latitude",
  "lng",
  "lon",
  "longitude",
  "media_metadata",
  "metadata",
  "quarantine",
  "query",
  "raw",
  "referrer",
  "text",
  "title",
  "url",
  "user_agent",
];

export async function recordAnalyticsEvent(
  scope: RequestScope,
  input: RecordAnalyticsEventInput,
): Promise<AnalyticsEvent> {
  return buildInsertAnalyticsEventQuery(
    db,
    scope,
    input,
  ).executeTakeFirstOrThrow();
}

export async function recordAnalyticsEventSafely(
  scope: RequestScope,
  input: RecordAnalyticsEventInput,
  options: {
    recorder?: AnalyticsEventRecorder;
    logger?: Pick<Console, "error">;
  } = {},
): Promise<AnalyticsDeliveryReceipt> {
  const recorder = options.recorder ?? recordAnalyticsEvent;
  const logger = options.logger ?? console;

  // Contract violations are not delivery uncertainty. Reject them before the
  // best-effort recorder boundary so unsafe payloads cannot be relabelled as a
  // harmless degraded write.
  normalizeEventName(input.eventName);
  normalizeAnalyticsEventProperties(input.properties ?? {});

  try {
    return recordedAnalyticsDelivery(await recorder(scope, input));
  } catch {
    const receipt = degradedAnalyticsDelivery();
    logger.error("Analytics event write failed.", {
      eventName: input.eventName,
      status: receipt.status,
      qualityClass: receipt.qualityClass,
      qualityReasons: receipt.qualityReasons,
    });
    return receipt;
  }
}

export async function recordEntryLoggedEventSafely(
  scope: RequestScope,
  input: Omit<RecordAnalyticsEventInput, "eventName" | "relatedEventId">,
): Promise<AnalyticsDeliveryReceipt> {
  let linkableRevisit: AnalyticsEvent | null | undefined;
  try {
    linkableRevisit = await findLinkableOwnRecordRevisitEvent(
      scope,
      input.plantObjectId ?? null,
    );
  } catch {
    const receipt = degradedAnalyticsDelivery();
    console.error("Analytics event write failed.", {
      eventName: "entry_logged",
      status: receipt.status,
      qualityClass: receipt.qualityClass,
      qualityReasons: receipt.qualityReasons,
    });
    return receipt;
  }

  const delivery = await recordAnalyticsEventSafely(scope, {
    ...input,
    eventName: "entry_logged",
    relatedEventId: linkableRevisit?.id ?? null,
  });
  if (delivery.status === "delivery_degraded") return delivery;

  if (linkableRevisit) {
    try {
      await buildMarkOwnRecordRevisitFollowedByActionQuery(
        db,
        scope,
        linkableRevisit.id,
      ).executeTakeFirst();
    } catch {
      console.error("Analytics follow-up link write failed.", {
        eventName: "entry_logged",
        status: "delivery_degraded",
        qualityClass: "unverified",
        qualityReasons: ["analytics_delivery_unavailable"],
      });
    }
  }

  return delivery;
}

export function buildInsertAnalyticsEventQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: RecordAnalyticsEventInput,
) {
  const row: NewAnalyticsEventRow = {
    owner_user_id: scope.userId,
    session_id: normalizeOptionalText(input.sessionId ?? scope.sessionId),
    event_name: normalizeEventName(input.eventName),
    properties: normalizeAnalyticsEventProperties(input.properties ?? {}),
    space_id: normalizeOptionalText(input.spaceId),
    plant_object_id: normalizeOptionalText(input.plantObjectId),
    journal_entry_id: normalizeOptionalText(input.journalEntryId),
    related_event_id: normalizeOptionalText(input.relatedEventId),
  };

  return executor.insertInto("analytics_events").values(row).returningAll();
}

export function buildFindOpenOwnRecordRevisitEventQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    sessionId: string;
    plantObjectId: string;
  },
) {
  return executor
    .selectFrom("analytics_events")
    .selectAll("analytics_events")
    .where("owner_user_id", "=", scope.userId)
    .where("session_id", "=", input.sessionId)
    .where("plant_object_id", "=", input.plantObjectId)
    .where("event_name", "=", "own_record_revisited")
    .where(sql<boolean>`properties ->> 'followed_by_action' = 'false'`)
    .orderBy("created_at", "desc")
    .limit(1);
}

export function buildMarkOwnRecordRevisitFollowedByActionQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  eventId: string,
) {
  return executor
    .updateTable("analytics_events")
    .set({
      properties: sql<JsonValue>`jsonb_set(properties, '{followed_by_action}', 'true'::jsonb, true)`,
      updated_at: new Date(),
    })
    .where("id", "=", eventId)
    .where("owner_user_id", "=", scope.userId)
    .where("event_name", "=", "own_record_revisited")
    .returningAll();
}

export function normalizeAnalyticsEventProperties(
  properties: AnalyticsEventProperties,
): JsonValue {
  const normalized: Record<string, boolean | string> = {};

  for (const [key, value] of Object.entries(properties)) {
    assertAllowedPropertyKey(key);
    if (value === undefined || value === null) continue;

    normalized[key] = normalizeAnalyticsEventPropertyValue(
      key as keyof AnalyticsEventProperties,
      value,
    );
  }

  // OVE-234 defence in depth: analytics values are already an allowlisted,
  // bucketed vocabulary, so any precise-location string here is a contract
  // break and must fail closed rather than reach storage or a log line.
  assertNoPreciseLocationTextInValues(
    Object.values(normalized),
    "queue_payload",
  );

  return normalized;
}

export function isBackdatedEntryDate(
  value: Date | string,
  now = new Date(),
): boolean {
  return toDateKey(value) < toDateKey(now);
}

async function findLinkableOwnRecordRevisitEvent(
  scope: RequestScope,
  plantObjectId: string | null,
) {
  const sessionId = normalizeOptionalText(scope.sessionId);
  if (!sessionId || !plantObjectId) return null;

  return buildFindOpenOwnRecordRevisitEventQuery(db, scope, {
    sessionId,
    plantObjectId,
  }).executeTakeFirst();
}

function normalizeEventName(eventName: AnalyticsEventName) {
  if (!ALLOWED_EVENT_NAMES.has(eventName)) {
    throw new Error(`Unsupported analytics event: ${String(eventName)}.`);
  }

  return eventName;
}

function assertAllowedPropertyKey(
  key: string,
): asserts key is keyof AnalyticsEventProperties {
  const normalizedKey = key.toLowerCase();

  if (
    key !== "location_visibility_level" &&
    FORBIDDEN_PROPERTY_FRAGMENTS.some((fragment) =>
      normalizedKey.includes(fragment),
    )
  ) {
    throw new Error(`Forbidden analytics event property: ${key}.`);
  }

  if (!ALLOWED_PROPERTY_KEYS.has(key as keyof AnalyticsEventProperties)) {
    throw new Error(`Unsupported analytics event property: ${key}.`);
  }
}

function normalizeAnalyticsEventPropertyValue(
  key: keyof AnalyticsEventProperties,
  value: unknown,
) {
  switch (key) {
    case "activation_source":
      if (
        value === "homepage" ||
        value === "public_variety" ||
        value === "direct_garden"
      ) {
        return value;
      }
      break;
    case "actor_class": {
      const normalized = normalizeActorClass(value);
      if (normalized) return normalized;
      break;
    }
    case "entry_scope":
      if (value === "object" || value === "space") return value;
      break;
    case "has_photo":
    case "is_backdated":
    case "followed_by_action":
    case "has_formatting":
    case "via_voice":
      if (typeof value === "boolean") return value;
      break;
    case "location_visibility_level":
      if (value === "region" || value === "hidden") return value;
      break;
    case "object_kind":
      // Historical analytics rows may still store bee_colony; treat as animal on read.
      // New writes accept only plant | animal.
      if (value === "plant" || value === "animal") {
        return value;
      }
      if (
        typeof value === "string" &&
        value === (["bee", "colony"] as const).join("_")
      ) {
        return "animal";
      }
      break;
    case "source_surface_kind":
      if (value === "homepage" || value === "variety" || value === "garden") {
        return value;
      }
      break;
    case "variety_state":
      if (
        value === "selected" ||
        value === "unknown" ||
        value === "user_added" ||
        value === "free_text"
      ) {
        return value;
      }
      break;
    case "pulse_outcome":
      if (value === "submitted" || value === "skipped") return value;
      break;
    case "usefulness":
      if (
        value === "useful" ||
        value === "not_sure" ||
        value === "not_useful"
      ) {
        return value;
      }
      break;
    case "usefulness_reason":
      if (
        value === "history_felt_worth_keeping" ||
        value === "easy_to_add_update" ||
        value === "prior_entries_helped" ||
        value === "felt_redundant" ||
        value === "hard_to_find_what_i_needed" ||
        value === "not_sure_why"
      ) {
        return value;
      }
      break;
    case "photo_count_bucket":
      if (
        value === "none" ||
        value === "one" ||
        value === "two_to_three" ||
        value === "four_to_six" ||
        value === "seven_to_ten"
      ) {
        return value;
      }
      break;
    case "cover_source":
      if (
        value === "automatic_inline" ||
        value === "explicit_inline" ||
        value === "separate" ||
        value === "none"
      ) {
        return value;
      }
      break;
    case "block_count_bucket":
      if (
        value === "one" ||
        value === "two_to_five" ||
        value === "six_to_twenty" ||
        value === "twenty_one_plus"
      ) {
        return value;
      }
      break;
    case "schema_version":
      if (value === "v1") return value;
      break;
    case "mutation_outcome":
      if (
        value === "succeeded" ||
        value === "conflict" ||
        value === "failed" ||
        value === "stale"
      ) {
        return value;
      }
      break;
    case "latency_bucket":
      if (value === "fast" || value === "normal" || value === "slow") {
        return value;
      }
      break;
  }

  throw new Error(`Unsafe analytics event value for ${key}.`);
}

function normalizeOptionalText(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function recordedAnalyticsDelivery(
  event: AnalyticsEvent,
): AnalyticsDeliveryReceipt {
  const quality = analyticsDeliveryQuality(true);
  return {
    status: "recorded_verified",
    event,
    ...quality,
  };
}

function degradedAnalyticsDelivery(): AnalyticsDeliveryReceipt {
  const quality = analyticsDeliveryQuality(false);
  return {
    status: "delivery_degraded",
    event: null,
    ...quality,
  };
}

function toDateKey(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}
