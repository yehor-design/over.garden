// Bounded actor/evidence classes for OVE-193 self-serve attribution.
// Enum-only — never invite links, emails, provider ids, referrers, or contacts.

export const SELF_SERVE_ACTOR_CLASS = "self_serve" as const;
export const CLOSED_PILOT_ACTOR_CLASS = "closed_pilot" as const;
export const FOUNDER_REHEARSAL_ACTOR_CLASS = "founder_rehearsal" as const;
export const PRODUCTION_SMOKE_ACTOR_CLASS = "production_smoke" as const;
export const EDITORIAL_ACTOR_CLASS = "editorial" as const;
export const VISUAL_FIXTURE_ACTOR_CLASS = "visual_fixture" as const;

export const ACTOR_CLASSES = [
  SELF_SERVE_ACTOR_CLASS,
  CLOSED_PILOT_ACTOR_CLASS,
  FOUNDER_REHEARSAL_ACTOR_CLASS,
  PRODUCTION_SMOKE_ACTOR_CLASS,
  EDITORIAL_ACTOR_CLASS,
  VISUAL_FIXTURE_ACTOR_CLASS,
] as const;

export type ActorClass = (typeof ACTOR_CLASSES)[number];

export function isActorClass(value: unknown): value is ActorClass {
  return (
    typeof value === "string" &&
    (ACTOR_CLASSES as readonly string[]).includes(value)
  );
}

export function actorClassFromPilotCohort(
  cohort: "closed_pilot" | "founder_rehearsal" | null | undefined,
): ActorClass {
  if (cohort === "closed_pilot") return CLOSED_PILOT_ACTOR_CLASS;
  if (cohort === "founder_rehearsal") return FOUNDER_REHEARSAL_ACTOR_CLASS;
  return SELF_SERVE_ACTOR_CLASS;
}
