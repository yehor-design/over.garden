import "server-only";

import { createHash } from "node:crypto";

import { sql, type Kysely, type RawBuilder, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogKind,
  Database,
  LineageConsentState,
  PlantObjectKind,
  VarietyState,
} from "@/db/schema";
import { localizedPublicJournalEvidencePath } from "@/lib/garden/public-paths";
import {
  DEFAULT_PUBLIC_LOCALE,
  type PublicLocale,
} from "@/lib/public-localization";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const FOLLOWED_FEED_LIMIT = 30;
const NOTIFICATION_EVENT_LIMIT = 15;
const MAX_QUERY_LIMIT = 50;

export interface SocialObjectReadback {
  displayName: string;
  objectKind: PlantObjectKind;
  catalogKind: CatalogKind | null;
  varietyText: string | null;
  varietyState: VarietyState;
}

export interface FollowedFeedStory {
  key: string;
  href: string;
  ownerMention: `@${string}` | null;
  targetObject: SocialObjectReadback;
  entryDate: Date | string;
  publishedAt: Date | string | null;
}

export type NotificationEventKind =
  | "lineage_claim_request"
  | "lineage_claim_decision"
  | "lineage_question"
  | "lineage_follow";

export type NotificationActionKind =
  | "review_claims"
  | "open_lineage_questions"
  | "open_followed_feed";

export interface NotificationCenterEvent {
  key: string;
  kind: NotificationEventKind;
  createdAt: Date | string;
  summary: string;
  detail: string | null;
  primaryObject: SocialObjectReadback | null;
  secondaryObject: SocialObjectReadback | null;
  actorMention: `@${string}` | null;
  actionKind: NotificationActionKind | null;
}

export interface FollowedFeedStoryRow {
  followId: string;
  publicSlug: string | null;
  entryDate: Date | string;
  publishedAt: Date | string | null;
  ownerHandle: string | null;
  targetObjectDisplayName: string;
  targetObjectKind: string;
  targetCatalogKind: string | null;
  targetVarietyText: string | null;
  targetVarietyState: string;
}

export interface NotificationClaimRequestRow {
  edgeId: string;
  createdAt: Date | string;
  subjectObjectDisplayName: string;
  subjectObjectKind: string;
  subjectCatalogKind: string | null;
  subjectVarietyText: string | null;
  subjectVarietyState: string;
  sourceObjectDisplayName: string;
  sourceObjectKind: string;
  sourceCatalogKind: string | null;
  sourceVarietyText: string | null;
  sourceVarietyState: string;
}

export interface NotificationClaimDecisionRow {
  auditId: string;
  action: string;
  newConsentState: string;
  createdAt: Date | string;
  subjectObjectDisplayName: string;
  subjectObjectKind: string;
  subjectCatalogKind: string | null;
  subjectVarietyText: string | null;
  subjectVarietyState: string;
  sourceObjectDisplayName: string;
  sourceObjectKind: string;
  sourceCatalogKind: string | null;
  sourceVarietyText: string | null;
  sourceVarietyState: string;
}

export interface NotificationQuestionRow {
  questionId: string;
  questionText: string;
  createdAt: Date | string;
  targetObjectDisplayName: string;
  targetObjectKind: string;
  targetCatalogKind: string | null;
  targetVarietyText: string | null;
  targetVarietyState: string;
}

export interface NotificationFollowRow {
  followId: string;
  createdAt: Date | string;
  followerHandle: string | null;
  targetObjectDisplayName: string;
  targetObjectKind: string;
  targetCatalogKind: string | null;
  targetVarietyText: string | null;
  targetVarietyState: string;
}

export interface NotificationCenterRows {
  claimRequests: NotificationClaimRequestRow[];
  claimDecisions: NotificationClaimDecisionRow[];
  questions: NotificationQuestionRow[];
  follows: NotificationFollowRow[];
}

export async function listFollowedFeedStories(
  scope: RequestScope,
  limit = FOLLOWED_FEED_LIMIT,
  locale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
): Promise<FollowedFeedStory[]> {
  const rows = await buildFollowedFeedStoriesQuery(db, scope, limit).execute();
  return serializeFollowedFeedStories(rows, locale);
}

export async function listNotificationCenter(
  scope: RequestScope,
): Promise<NotificationCenterEvent[]> {
  const [claimRequests, claimDecisions, questions, follows] = await Promise.all(
    [
      buildNotificationClaimRequestEventsQuery(db, scope).execute(),
      buildNotificationClaimDecisionEventsQuery(db, scope).execute(),
      buildNotificationQuestionEventsQuery(db, scope).execute(),
      buildNotificationFollowEventsQuery(db, scope).execute(),
    ],
  );

  return serializeNotificationCenterRows({
    claimRequests,
    claimDecisions,
    questions,
    follows,
  });
}

export function buildFollowedFeedStoriesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit = FOLLOWED_FEED_LIMIT,
) {
  return executor
    .selectFrom("lineage_node_follows")
    .innerJoin("lineage_provenance_edges as followed_edges", (join) =>
      join.onRef(
        "followed_edges.id",
        "=",
        "lineage_node_follows.lineage_edge_id",
      ),
    )
    .innerJoin("plant_objects as target_objects", (join) =>
      join
        .onRef(
          "target_objects.id",
          "=",
          "lineage_node_follows.target_plant_object_id",
        )
        .onRef(
          "target_objects.owner_user_id",
          "=",
          "lineage_node_follows.target_owner_user_id",
        ),
    )
    .innerJoin("journal_entries as target_public_entries", (join) =>
      join
        .onRef(
          "target_public_entries.plant_object_id",
          "=",
          "target_objects.id",
        )
        .onRef(
          "target_public_entries.owner_user_id",
          "=",
          "target_objects.owner_user_id",
        )
        .on("target_public_entries.visibility", "=", "public")
        .on("target_public_entries.lifecycle_state", "=", "active")
        .on("target_public_entries.public_gone_at", "is", null)
        .on("target_public_entries.public_slug", "is not", null)
        .on(
          publicLaunchSurfacePredicates(
            sql.ref<string | null>("target_public_entries.content_class"),
          ),
        ),
    )
    .leftJoin("catalog_items as target_catalog_items", (join) =>
      join
        .onRef("target_catalog_items.id", "=", "target_objects.catalog_item_id")
        .on("target_catalog_items.created_by_user_id", "is", null),
    )
    .leftJoin("user_handle_registry as target_owner_handles", (join) =>
      join
        .onRef(
          "target_owner_handles.user_id",
          "=",
          "lineage_node_follows.target_owner_user_id",
        )
        .on("target_owner_handles.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_public_profiles as target_owner_profiles", (join) =>
      join
        .onRef(
          "target_owner_profiles.user_id",
          "=",
          "target_owner_handles.user_id",
        )
        .onRef(
          "target_owner_profiles.normalized_handle",
          "=",
          "target_owner_handles.normalized_handle",
        )
        .on("target_owner_profiles.profile_visibility", "=", "public")
        .on("target_owner_profiles.profile_lifecycle_state", "=", "active")
        .on("target_owner_profiles.removed_at", "is", null),
    )
    .select([
      "lineage_node_follows.id as followId",
      "target_public_entries.public_slug as publicSlug",
      "target_public_entries.entry_date as entryDate",
      "target_public_entries.published_at as publishedAt",
      "target_owner_profiles.handle as ownerHandle",
      "target_objects.display_name as targetObjectDisplayName",
      "target_objects.object_kind as targetObjectKind",
      "target_catalog_items.catalog_kind as targetCatalogKind",
      "target_objects.variety_text as targetVarietyText",
      "target_objects.variety_state as targetVarietyState",
    ])
    .where("lineage_node_follows.follower_user_id", "=", scope.userId)
    .where("lineage_node_follows.follow_state", "=", "active")
    .where("followed_edges.source_kind", "=", "own_object")
    .where("followed_edges.source_plant_object_id", "is not", null)
    .where("followed_edges.source_owner_user_id", "is not", null)
    .where("followed_edges.consent_state", "=", "confirmed")
    .where(
      "followed_edges.visibility_policy",
      "=",
      "owner_only_until_confirmed",
    )
    .where("followed_edges.erasure_state", "=", "active")
    .whereRef(
      "followed_edges.owner_user_id",
      "!=",
      "followed_edges.source_owner_user_id",
    )
    .where(
      noSocialReadbackBlockPredicate(
        scope.userId,
        "lineage_node_follows.target_owner_user_id",
      ),
    )
    .orderBy("target_public_entries.published_at", "desc")
    .orderBy("target_public_entries.entry_date", "desc")
    .orderBy("target_public_entries.id", "asc")
    .limit(normalizeQueryLimit(limit, FOLLOWED_FEED_LIMIT));
}

export function buildNotificationClaimRequestEventsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit = NOTIFICATION_EVENT_LIMIT,
) {
  return executor
    .selectFrom("lineage_provenance_edges")
    .innerJoin("plant_objects as source_objects", (join) =>
      join
        .onRef(
          "source_objects.id",
          "=",
          "lineage_provenance_edges.source_plant_object_id",
        )
        .onRef(
          "source_objects.owner_user_id",
          "=",
          "lineage_provenance_edges.source_owner_user_id",
        ),
    )
    .innerJoin("plant_objects as subject_objects", (join) =>
      join
        .onRef(
          "subject_objects.id",
          "=",
          "lineage_provenance_edges.subject_plant_object_id",
        )
        .onRef(
          "subject_objects.owner_user_id",
          "=",
          "lineage_provenance_edges.owner_user_id",
        ),
    )
    .leftJoin("catalog_items as source_catalog_items", (join) =>
      join
        .onRef("source_catalog_items.id", "=", "source_objects.catalog_item_id")
        .on("source_catalog_items.created_by_user_id", "is", null),
    )
    .leftJoin("catalog_items as subject_catalog_items", (join) =>
      join
        .onRef(
          "subject_catalog_items.id",
          "=",
          "subject_objects.catalog_item_id",
        )
        .on("subject_catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "lineage_provenance_edges.id as edgeId",
      "lineage_provenance_edges.created_at as createdAt",
      "subject_objects.display_name as subjectObjectDisplayName",
      "subject_objects.object_kind as subjectObjectKind",
      "subject_catalog_items.catalog_kind as subjectCatalogKind",
      "subject_objects.variety_text as subjectVarietyText",
      "subject_objects.variety_state as subjectVarietyState",
      "source_objects.display_name as sourceObjectDisplayName",
      "source_objects.object_kind as sourceObjectKind",
      "source_catalog_items.catalog_kind as sourceCatalogKind",
      "source_objects.variety_text as sourceVarietyText",
      "source_objects.variety_state as sourceVarietyState",
    ])
    .where("lineage_provenance_edges.source_owner_user_id", "=", scope.userId)
    .where("lineage_provenance_edges.owner_user_id", "!=", scope.userId)
    .where("lineage_provenance_edges.source_kind", "=", "own_object")
    .where("lineage_provenance_edges.consent_state", "=", "proposed")
    .where(
      "lineage_provenance_edges.visibility_policy",
      "=",
      "owner_only_until_confirmed",
    )
    .where("lineage_provenance_edges.erasure_state", "=", "active")
    .where(
      noSocialReadbackBlockPredicate(
        scope.userId,
        "lineage_provenance_edges.owner_user_id",
      ),
    )
    .orderBy("lineage_provenance_edges.created_at", "desc")
    .orderBy("lineage_provenance_edges.id", "asc")
    .limit(normalizeQueryLimit(limit, NOTIFICATION_EVENT_LIMIT));
}

export function buildNotificationClaimDecisionEventsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit = NOTIFICATION_EVENT_LIMIT,
) {
  return executor
    .selectFrom("lineage_provenance_edge_audit_events as audit_events")
    .innerJoin("lineage_provenance_edges as edges", (join) =>
      join.onRef("edges.id", "=", "audit_events.edge_id"),
    )
    .innerJoin("plant_objects as subject_objects", (join) =>
      join
        .onRef("subject_objects.id", "=", "edges.subject_plant_object_id")
        .onRef("subject_objects.owner_user_id", "=", "edges.owner_user_id"),
    )
    .innerJoin("plant_objects as source_objects", (join) =>
      join
        .onRef("source_objects.id", "=", "edges.source_plant_object_id")
        .onRef(
          "source_objects.owner_user_id",
          "=",
          "edges.source_owner_user_id",
        ),
    )
    .leftJoin("catalog_items as subject_catalog_items", (join) =>
      join
        .onRef(
          "subject_catalog_items.id",
          "=",
          "subject_objects.catalog_item_id",
        )
        .on("subject_catalog_items.created_by_user_id", "is", null),
    )
    .leftJoin("catalog_items as source_catalog_items", (join) =>
      join
        .onRef("source_catalog_items.id", "=", "source_objects.catalog_item_id")
        .on("source_catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "audit_events.id as auditId",
      "audit_events.action",
      "audit_events.new_consent_state as newConsentState",
      "audit_events.created_at as createdAt",
      "subject_objects.display_name as subjectObjectDisplayName",
      "subject_objects.object_kind as subjectObjectKind",
      "subject_catalog_items.catalog_kind as subjectCatalogKind",
      "subject_objects.variety_text as subjectVarietyText",
      "subject_objects.variety_state as subjectVarietyState",
      "source_objects.display_name as sourceObjectDisplayName",
      "source_objects.object_kind as sourceObjectKind",
      "source_catalog_items.catalog_kind as sourceCatalogKind",
      "source_objects.variety_text as sourceVarietyText",
      "source_objects.variety_state as sourceVarietyState",
    ])
    .where("edges.owner_user_id", "=", scope.userId)
    .where("edges.source_owner_user_id", "!=", scope.userId)
    .where("edges.source_kind", "=", "own_object")
    .where("edges.visibility_policy", "=", "owner_only_until_confirmed")
    .where("audit_events.new_consent_state", "in", ["confirmed", "declined"])
    .where(
      noSocialReadbackBlockPredicate(
        scope.userId,
        "edges.source_owner_user_id",
      ),
    )
    .orderBy("audit_events.created_at", "desc")
    .orderBy("audit_events.id", "asc")
    .limit(normalizeQueryLimit(limit, NOTIFICATION_EVENT_LIMIT));
}

export function buildNotificationQuestionEventsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit = NOTIFICATION_EVENT_LIMIT,
) {
  return executor
    .selectFrom("lineage_questions")
    .innerJoin("plant_objects as target_objects", (join) =>
      join
        .onRef(
          "target_objects.id",
          "=",
          "lineage_questions.target_plant_object_id",
        )
        .onRef(
          "target_objects.owner_user_id",
          "=",
          "lineage_questions.recipient_user_id",
        ),
    )
    .leftJoin("catalog_items as target_catalog_items", (join) =>
      join
        .onRef("target_catalog_items.id", "=", "target_objects.catalog_item_id")
        .on("target_catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "lineage_questions.id as questionId",
      "lineage_questions.question_text as questionText",
      "lineage_questions.created_at as createdAt",
      "target_objects.display_name as targetObjectDisplayName",
      "target_objects.object_kind as targetObjectKind",
      "target_catalog_items.catalog_kind as targetCatalogKind",
      "target_objects.variety_text as targetVarietyText",
      "target_objects.variety_state as targetVarietyState",
    ])
    .where("lineage_questions.recipient_user_id", "=", scope.userId)
    .where("lineage_questions.question_state", "=", "delivered")
    .where(
      noSocialReadbackBlockPredicate(
        scope.userId,
        "lineage_questions.asker_user_id",
      ),
    )
    .orderBy("lineage_questions.created_at", "desc")
    .orderBy("lineage_questions.id", "asc")
    .limit(normalizeQueryLimit(limit, NOTIFICATION_EVENT_LIMIT));
}

export function buildNotificationFollowEventsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit = NOTIFICATION_EVENT_LIMIT,
) {
  return executor
    .selectFrom("lineage_node_follows")
    .innerJoin("lineage_provenance_edges as followed_edges", (join) =>
      join.onRef(
        "followed_edges.id",
        "=",
        "lineage_node_follows.lineage_edge_id",
      ),
    )
    .innerJoin("plant_objects as target_objects", (join) =>
      join
        .onRef(
          "target_objects.id",
          "=",
          "lineage_node_follows.target_plant_object_id",
        )
        .onRef(
          "target_objects.owner_user_id",
          "=",
          "lineage_node_follows.target_owner_user_id",
        ),
    )
    .innerJoin("journal_entries as target_public_entries", (join) =>
      join
        .onRef(
          "target_public_entries.plant_object_id",
          "=",
          "target_objects.id",
        )
        .onRef(
          "target_public_entries.owner_user_id",
          "=",
          "target_objects.owner_user_id",
        )
        .on("target_public_entries.visibility", "=", "public")
        .on("target_public_entries.lifecycle_state", "=", "active")
        .on("target_public_entries.public_gone_at", "is", null)
        .on("target_public_entries.public_slug", "is not", null)
        .on(
          publicLaunchSurfacePredicates(
            sql.ref<string | null>("target_public_entries.content_class"),
          ),
        ),
    )
    .leftJoin("catalog_items as target_catalog_items", (join) =>
      join
        .onRef("target_catalog_items.id", "=", "target_objects.catalog_item_id")
        .on("target_catalog_items.created_by_user_id", "is", null),
    )
    .leftJoin("user_handle_registry as follower_handles", (join) =>
      join
        .onRef(
          "follower_handles.user_id",
          "=",
          "lineage_node_follows.follower_user_id",
        )
        .on("follower_handles.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_public_profiles as follower_profiles", (join) =>
      join
        .onRef("follower_profiles.user_id", "=", "follower_handles.user_id")
        .onRef(
          "follower_profiles.normalized_handle",
          "=",
          "follower_handles.normalized_handle",
        )
        .on("follower_profiles.profile_visibility", "=", "public")
        .on("follower_profiles.profile_lifecycle_state", "=", "active")
        .on("follower_profiles.removed_at", "is", null),
    )
    .select([
      "lineage_node_follows.id as followId",
      "lineage_node_follows.created_at as createdAt",
      "follower_profiles.handle as followerHandle",
      "target_objects.display_name as targetObjectDisplayName",
      "target_objects.object_kind as targetObjectKind",
      "target_catalog_items.catalog_kind as targetCatalogKind",
      "target_objects.variety_text as targetVarietyText",
      "target_objects.variety_state as targetVarietyState",
    ])
    .where("lineage_node_follows.target_owner_user_id", "=", scope.userId)
    .where("lineage_node_follows.follow_state", "=", "active")
    .where("followed_edges.source_kind", "=", "own_object")
    .where("followed_edges.source_plant_object_id", "is not", null)
    .where("followed_edges.source_owner_user_id", "is not", null)
    .where("followed_edges.consent_state", "=", "confirmed")
    .where(
      "followed_edges.visibility_policy",
      "=",
      "owner_only_until_confirmed",
    )
    .where("followed_edges.erasure_state", "=", "active")
    .whereRef(
      "followed_edges.owner_user_id",
      "!=",
      "followed_edges.source_owner_user_id",
    )
    .where(
      noSocialReadbackBlockPredicate(
        scope.userId,
        "lineage_node_follows.follower_user_id",
      ),
    )
    .groupBy([
      "lineage_node_follows.id",
      "lineage_node_follows.created_at",
      "follower_profiles.handle",
      "target_objects.display_name",
      "target_objects.object_kind",
      "target_catalog_items.catalog_kind",
      "target_objects.variety_text",
      "target_objects.variety_state",
    ])
    .orderBy("lineage_node_follows.created_at", "desc")
    .orderBy("lineage_node_follows.id", "asc")
    .limit(normalizeQueryLimit(limit, NOTIFICATION_EVENT_LIMIT));
}

export function serializeFollowedFeedStories(
  rows: FollowedFeedStoryRow[],
  locale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
): FollowedFeedStory[] {
  return rows.flatMap((row) => {
    if (!row.publicSlug) return [];

    return [
      {
        key: stableReadbackKey("followed-feed", row.followId),
        href: localizedPublicJournalEvidencePath(locale, row.publicSlug),
        ownerMention: row.ownerHandle ? `@${row.ownerHandle}` : null,
        targetObject: mapTargetObject(row),
        entryDate: row.entryDate,
        publishedAt: row.publishedAt,
      },
    ];
  });
}

export function serializeNotificationCenterRows({
  claimRequests,
  claimDecisions,
  questions,
  follows,
}: NotificationCenterRows): NotificationCenterEvent[] {
  const events: NotificationCenterEvent[] = [
    ...claimRequests.map(mapClaimRequestEvent),
    ...claimDecisions.map(mapClaimDecisionEvent),
    ...questions.map(mapQuestionEvent),
    ...follows.map(mapFollowEvent),
  ];

  return events.sort((left, right) => {
    const timeDelta =
      createdAtTimestamp(right.createdAt) - createdAtTimestamp(left.createdAt);

    return timeDelta === 0 ? left.key.localeCompare(right.key) : timeDelta;
  });
}

function mapClaimRequestEvent(
  row: NotificationClaimRequestRow,
): NotificationCenterEvent {
  const subjectObject = mapSubjectObject(row);
  const sourceObject = mapSourceObject(row);

  return {
    key: stableReadbackKey("claim-request", row.edgeId),
    kind: "lineage_claim_request",
    createdAt: row.createdAt,
    summary: "Lineage claim needs review",
    detail: `${subjectObject.displayName} claims provenance from ${sourceObject.displayName}.`,
    primaryObject: subjectObject,
    secondaryObject: sourceObject,
    actorMention: null,
    actionKind: "review_claims",
  };
}

function mapClaimDecisionEvent(
  row: NotificationClaimDecisionRow,
): NotificationCenterEvent {
  const subjectObject = mapSubjectObject(row);
  const sourceObject = mapSourceObject(row);
  const decision = normalizeClaimDecision(row.newConsentState, row.action);

  return {
    key: stableReadbackKey("claim-decision", row.auditId),
    kind: "lineage_claim_decision",
    createdAt: row.createdAt,
    summary:
      decision === "confirmed"
        ? "Lineage claim confirmed"
        : "Lineage claim declined",
    detail: `${subjectObject.displayName} provenance from ${sourceObject.displayName}.`,
    primaryObject: subjectObject,
    secondaryObject: sourceObject,
    actorMention: null,
    actionKind: null,
  };
}

function mapQuestionEvent(
  row: NotificationQuestionRow,
): NotificationCenterEvent {
  const targetObject = mapTargetObject(row);

  return {
    key: stableReadbackKey("lineage-question", row.questionId),
    kind: "lineage_question",
    createdAt: row.createdAt,
    summary: `Question about ${targetObject.displayName}`,
    detail: row.questionText,
    primaryObject: targetObject,
    secondaryObject: null,
    actorMention: null,
    actionKind: "open_lineage_questions",
  };
}

function mapFollowEvent(row: NotificationFollowRow): NotificationCenterEvent {
  const targetObject = mapTargetObject(row);
  const actorMention: `@${string}` | null = row.followerHandle
    ? `@${row.followerHandle}`
    : null;
  const actorLabel = actorMention ?? "A gardener";

  return {
    key: stableReadbackKey("lineage-follow", row.followId),
    kind: "lineage_follow",
    createdAt: row.createdAt,
    summary: `${actorLabel} followed ${targetObject.displayName}`,
    detail: null,
    primaryObject: targetObject,
    secondaryObject: null,
    actorMention,
    actionKind: "open_followed_feed",
  };
}

function mapTargetObject(row: {
  targetObjectDisplayName: string;
  targetObjectKind: string;
  targetCatalogKind: string | null;
  targetVarietyText: string | null;
  targetVarietyState: string;
}): SocialObjectReadback {
  return mapSocialObject({
    displayName: row.targetObjectDisplayName,
    objectKind: row.targetObjectKind,
    catalogKind: row.targetCatalogKind,
    varietyText: row.targetVarietyText,
    varietyState: row.targetVarietyState,
  });
}

function mapSubjectObject(row: {
  subjectObjectDisplayName: string;
  subjectObjectKind: string;
  subjectCatalogKind: string | null;
  subjectVarietyText: string | null;
  subjectVarietyState: string;
}): SocialObjectReadback {
  return mapSocialObject({
    displayName: row.subjectObjectDisplayName,
    objectKind: row.subjectObjectKind,
    catalogKind: row.subjectCatalogKind,
    varietyText: row.subjectVarietyText,
    varietyState: row.subjectVarietyState,
  });
}

function mapSourceObject(row: {
  sourceObjectDisplayName: string;
  sourceObjectKind: string;
  sourceCatalogKind: string | null;
  sourceVarietyText: string | null;
  sourceVarietyState: string;
}): SocialObjectReadback {
  return mapSocialObject({
    displayName: row.sourceObjectDisplayName,
    objectKind: row.sourceObjectKind,
    catalogKind: row.sourceCatalogKind,
    varietyText: row.sourceVarietyText,
    varietyState: row.sourceVarietyState,
  });
}

function mapSocialObject(row: {
  displayName: string;
  objectKind: string;
  catalogKind: string | null;
  varietyText: string | null;
  varietyState: string;
}): SocialObjectReadback {
  return {
    displayName: row.displayName,
    objectKind: row.objectKind as PlantObjectKind,
    catalogKind: row.catalogKind as CatalogKind | null,
    varietyText: row.varietyText,
    varietyState: row.varietyState as VarietyState,
  };
}

function normalizeClaimDecision(
  newConsentState: string,
  action: string,
): Extract<LineageConsentState, "confirmed" | "declined"> {
  if (newConsentState === "confirmed" || action === "confirm") {
    return "confirmed";
  }

  return "declined";
}

function stableReadbackKey(namespace: string, rawId: string) {
  const digest = createHash("sha256").update(rawId).digest("hex");
  return `${namespace}:${digest.slice(0, 16)}`;
}

function createdAtTimestamp(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function normalizeQueryLimit(limit: number, fallback: number) {
  if (!Number.isFinite(limit)) return fallback;
  return Math.min(MAX_QUERY_LIMIT, Math.max(1, Math.floor(limit)));
}

function noSocialReadbackBlockPredicate(
  viewerUserId: string,
  actorRef: string,
): RawBuilder<boolean> {
  return sql<boolean>`not exists (
    select 1
    from profile_blocks
    where profile_blocks.block_state = 'active'
      and (
        (
          profile_blocks.blocker_user_id = ${viewerUserId}
          and profile_blocks.blocked_user_id = ${sql.ref(actorRef)}
        )
        or (
          profile_blocks.blocker_user_id = ${sql.ref(actorRef)}
          and profile_blocks.blocked_user_id = ${viewerUserId}
        )
      )
  )`;
}
