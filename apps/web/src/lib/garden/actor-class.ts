// Bounded actor/evidence classes for OVE-200 trustworthy MVP learning.
// Enum-only — never invite links, emails, provider ids, referrers, or contacts.

export const REAL_SELF_SERVE_ACTOR_CLASS = "real_self_serve" as const;
export const PRODUCTION_SMOKE_ACTOR_CLASS = "production_smoke" as const;
export const VISUAL_FIXTURE_ACTOR_CLASS = "visual_fixture" as const;
export const EDITORIAL_SEED_ACTOR_CLASS = "editorial_seed" as const;
export const AUTOMATED_BOT_ACTOR_CLASS = "automated_bot" as const;

/** @deprecated Prefer REAL_SELF_SERVE_ACTOR_CLASS (OVE-200 rename). */
export const SELF_SERVE_ACTOR_CLASS = REAL_SELF_SERVE_ACTOR_CLASS;
/** @deprecated Prefer EDITORIAL_SEED_ACTOR_CLASS (OVE-200 rename). */
export const EDITORIAL_ACTOR_CLASS = EDITORIAL_SEED_ACTOR_CLASS;

export const ACTOR_CLASSES = [
  REAL_SELF_SERVE_ACTOR_CLASS,
  PRODUCTION_SMOKE_ACTOR_CLASS,
  VISUAL_FIXTURE_ACTOR_CLASS,
  EDITORIAL_SEED_ACTOR_CLASS,
  AUTOMATED_BOT_ACTOR_CLASS,
] as const;

export type ActorClass = (typeof ACTOR_CLASSES)[number];

/** Legacy property values still readable from historical analytics rows. */
export const LEGACY_ACTOR_CLASS_ALIASES = {
  self_serve: REAL_SELF_SERVE_ACTOR_CLASS,
  editorial: EDITORIAL_SEED_ACTOR_CLASS,
} as const;

export type LegacyActorClassAlias = keyof typeof LEGACY_ACTOR_CLASS_ALIASES;

export const DECISION_ELIGIBLE_ACTOR_CLASSES = [
  REAL_SELF_SERVE_ACTOR_CLASS,
] as const;

export type DecisionEligibleActorClass =
  (typeof DECISION_ELIGIBLE_ACTOR_CLASSES)[number];

export const EXCLUDED_LEARNING_ACTOR_CLASSES = [
  PRODUCTION_SMOKE_ACTOR_CLASS,
  VISUAL_FIXTURE_ACTOR_CLASS,
  EDITORIAL_SEED_ACTOR_CLASS,
  AUTOMATED_BOT_ACTOR_CLASS,
] as const;

export type ExcludedLearningActorClass =
  (typeof EXCLUDED_LEARNING_ACTOR_CLASSES)[number];

export const LEARNING_ACTOR_ATTRIBUTION_SOURCES = [
  "producer",
  "operator_plan",
  "self_serve_default",
] as const;

export type LearningActorAttributionSource =
  (typeof LEARNING_ACTOR_ATTRIBUTION_SOURCES)[number];

export function isActorClass(value: unknown): value is ActorClass {
  return (
    typeof value === "string" &&
    (ACTOR_CLASSES as readonly string[]).includes(value)
  );
}

export function isLegacyActorClassAlias(
  value: unknown,
): value is LegacyActorClassAlias {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(LEGACY_ACTOR_CLASS_ALIASES, value)
  );
}

/** Normalize canonical or legacy stored values; null when unclassified. */
export function normalizeActorClass(value: unknown): ActorClass | null {
  if (isActorClass(value)) return value;
  if (isLegacyActorClassAlias(value)) return LEGACY_ACTOR_CLASS_ALIASES[value];
  return null;
}

export function isDecisionEligibleActorClass(
  value: unknown,
): value is DecisionEligibleActorClass {
  const normalized = normalizeActorClass(value);
  return normalized === REAL_SELF_SERVE_ACTOR_CLASS;
}

export function isExcludedLearningActorClass(
  value: unknown,
): value is ExcludedLearningActorClass {
  const normalized = normalizeActorClass(value);
  return (
    normalized !== null &&
    (EXCLUDED_LEARNING_ACTOR_CLASSES as readonly string[]).includes(normalized)
  );
}

export function isLearningActorAttributionSource(
  value: unknown,
): value is LearningActorAttributionSource {
  return (
    typeof value === "string" &&
    (LEARNING_ACTOR_ATTRIBUTION_SOURCES as readonly string[]).includes(value)
  );
}
