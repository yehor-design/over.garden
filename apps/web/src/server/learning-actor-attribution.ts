import "server-only";

import { sql, type Insertable, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  actorClassFromPilotCohort,
  isActorClass,
  isLearningActorAttributionSource,
  REAL_SELF_SERVE_ACTOR_CLASS,
  type ActorClass,
  type LearningActorAttributionSource,
} from "@/lib/garden/actor-class";
import {
  getPilotInviteGrant,
} from "@/server/pilot-invite-repository";
import type { PilotInviteCohort } from "@/lib/garden/pilot-invite";
import type { PilotSegment } from "@/lib/pilot/segments";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface LearningActorAttributionRow {
  userId: string;
  actorClass: ActorClass;
  source: LearningActorAttributionSource;
  classifiedAt: Date;
}

type PilotGrantLike = {
  cohort: PilotInviteCohort;
  segment: PilotSegment;
} | null;

type NewLearningActorAttribution = Insertable<
  Database["learning_actor_attributions"]
>;

export async function getLearningActorAttribution(
  userId: string,
  executor: QueryExecutor = db,
): Promise<LearningActorAttributionRow | null> {
  const row = await executor
    .selectFrom("learning_actor_attributions")
    .select([
      "user_id as userId",
      "actor_class as actorClass",
      "source",
      "classified_at as classifiedAt",
    ])
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!row || !isActorClass(row.actorClass)) return null;
  if (!isLearningActorAttributionSource(row.source)) return null;

  return {
    userId: row.userId,
    actorClass: row.actorClass,
    source: row.source,
    classifiedAt: row.classifiedAt,
  };
}

export async function upsertLearningActorAttribution(
  input: {
    userId: string;
    actorClass: ActorClass;
    source: LearningActorAttributionSource;
    classifiedAt?: Date;
  },
  executor: QueryExecutor = db,
): Promise<LearningActorAttributionRow> {
  if (!isActorClass(input.actorClass)) {
    throw new Error("Unsupported learning actor class.");
  }
  if (!isLearningActorAttributionSource(input.source)) {
    throw new Error("Unsupported learning actor attribution source.");
  }

  const classifiedAt = input.classifiedAt ?? new Date();
  const values: NewLearningActorAttribution = {
    user_id: input.userId,
    actor_class: input.actorClass,
    source: input.source,
    classified_at: classifiedAt,
    updated_at: classifiedAt,
  };

  const row = await executor
    .insertInto("learning_actor_attributions")
    .values(values)
    .onConflict((oc) =>
      oc.column("user_id").doUpdateSet({
        actor_class: input.actorClass,
        source: input.source,
        classified_at: classifiedAt,
        updated_at: classifiedAt,
      }),
    )
    .returning([
      "user_id as userId",
      "actor_class as actorClass",
      "source",
      "classified_at as classifiedAt",
    ])
    .executeTakeFirstOrThrow();

  if (!isActorClass(row.actorClass)) {
    throw new Error("Learning actor attribution write returned unsafe class.");
  }
  if (!isLearningActorAttributionSource(row.source)) {
    throw new Error("Learning actor attribution write returned unsafe source.");
  }

  return {
    userId: row.userId,
    actorClass: row.actorClass,
    source: row.source,
    classifiedAt: row.classifiedAt,
  };
}

/**
 * Resolve durable actor class for analytics and decision eligibility.
 * Order: durable row → pilot grant → self_serve default (never invent smoke/bot).
 */
export async function resolveDurableActorClass(
  userId: string,
  options: {
    executor?: QueryExecutor;
    producerOverride?: ActorClass;
    getGrant?: (userId: string) => Promise<PilotGrantLike>;
    persistDefault?: boolean;
  } = {},
): Promise<ActorClass> {
  const executor = options.executor ?? db;

  if (options.producerOverride) {
    if (!isActorClass(options.producerOverride)) {
      throw new Error("Unsupported producer actor class override.");
    }
    await upsertLearningActorAttribution(
      {
        userId,
        actorClass: options.producerOverride,
        source: "producer",
      },
      executor,
    );
    return options.producerOverride;
  }

  const durable = await getLearningActorAttribution(userId, executor);
  if (durable) return durable.actorClass;

  const getGrant = options.getGrant ?? getPilotInviteGrant;
  const grant = await getGrant(userId);
  if (grant) {
    const actorClass = actorClassFromPilotCohort(grant.cohort);
    await upsertLearningActorAttribution(
      {
        userId,
        actorClass,
        source: "pilot_grant",
      },
      executor,
    );
    return actorClass;
  }

  if (options.persistDefault !== false) {
    await upsertLearningActorAttribution(
      {
        userId,
        actorClass: REAL_SELF_SERVE_ACTOR_CLASS,
        source: "self_serve_default",
      },
      executor,
    );
  }

  return REAL_SELF_SERVE_ACTOR_CLASS;
}

export async function deleteLearningActorAttribution(
  userId: string,
  executor: QueryExecutor = db,
): Promise<number> {
  const result = await executor
    .deleteFrom("learning_actor_attributions")
    .where("user_id", "=", userId)
    .executeTakeFirst();
  return Number(result.numDeletedRows ?? 0);
}

export function buildLearningActorClassCountsQuery(executor: QueryExecutor) {
  return executor
    .selectFrom("learning_actor_attributions")
    .select([
      "actor_class as actorClass",
      sql<number>`count(*)::int`.as("count"),
    ])
    .groupBy("actor_class")
    .orderBy("actor_class");
}
