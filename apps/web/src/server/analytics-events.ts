import "server-only";

import { sql, type Insertable, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  ActivationSource,
  ActivationSurfaceKind,
} from "@/lib/garden/entry-contracts";
import type {
  AnalyticsEvent,
  AnalyticsEventName,
  Database,
  EntryScope,
  EntrySyncStatus,
  JsonValue,
  LocationVisibility,
  VarietyState,
} from "@/db/schema";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;
type NewAnalyticsEventRow = Insertable<Database["analytics_events"]>;

export interface AnalyticsEventProperties {
  activation_source?: ActivationSource;
  entry_scope?: EntryScope;
  has_photo?: boolean;
  is_backdated?: boolean;
  location_visibility_level?: LocationVisibility;
  source_surface_kind?: ActivationSurfaceKind;
  sync_status?: EntrySyncStatus;
  variety_state?: VarietyState;
  followed_by_action?: boolean;
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

const ALLOWED_EVENT_NAMES = new Set<AnalyticsEventName>([
  "space_created",
  "object_created",
  "entry_logged",
  "entry_photo_attached",
  "offline_entry_queued",
  "offline_entry_synced",
  "progress_screen_shown",
  "own_record_revisited",
]);

const ALLOWED_PROPERTY_KEYS = new Set<keyof AnalyticsEventProperties>([
  "activation_source",
  "entry_scope",
  "has_photo",
  "is_backdated",
  "location_visibility_level",
  "source_surface_kind",
  "sync_status",
  "variety_state",
  "followed_by_action",
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
): Promise<AnalyticsEvent | null> {
  const recorder = options.recorder ?? recordAnalyticsEvent;
  const logger = options.logger ?? console;

  try {
    return await recorder(scope, input);
  } catch (error) {
    logger.error("Analytics event write failed.", {
      eventName: input.eventName,
      error: normalizeErrorForLog(error),
    });
    return null;
  }
}

export async function recordEntryLoggedEventSafely(
  scope: RequestScope,
  input: Omit<RecordAnalyticsEventInput, "eventName" | "relatedEventId">,
): Promise<AnalyticsEvent | null> {
  try {
    const linkableRevisit = await findLinkableOwnRecordRevisitEvent(
      scope,
      input.plantObjectId ?? null,
    );
    const event = await recordAnalyticsEvent(scope, {
      ...input,
      eventName: "entry_logged",
      relatedEventId: linkableRevisit?.id ?? null,
    });

    if (linkableRevisit) {
      await buildMarkOwnRecordRevisitFollowedByActionQuery(
        db,
        scope,
        linkableRevisit.id,
      ).executeTakeFirst();
    }

    return event;
  } catch (error) {
    console.error("Analytics event write failed.", {
      eventName: "entry_logged",
      error: normalizeErrorForLog(error),
    });
    return null;
  }
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
    case "entry_scope":
      if (value === "object") return value;
      break;
    case "has_photo":
    case "is_backdated":
    case "followed_by_action":
      if (typeof value === "boolean") return value;
      break;
    case "location_visibility_level":
      if (value === "region" || value === "hidden") return value;
      break;
    case "source_surface_kind":
      if (value === "homepage" || value === "variety" || value === "garden") {
        return value;
      }
      break;
    case "sync_status":
      if (
        value === "online" ||
        value === "offline_queued" ||
        value === "offline_synced"
      ) {
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
  }

  throw new Error(`Unsafe analytics event value for ${key}.`);
}

function normalizeOptionalText(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeErrorForLog(error: unknown) {
  return error instanceof Error ? error.message : "Unknown analytics error.";
}

function toDateKey(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}
