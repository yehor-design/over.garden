import { describe, expect, it } from "vitest";

import {
  ACTOR_CLASSES,
  actorClassFromPilotCohort,
  isActorClass,
  SELF_SERVE_ACTOR_CLASS,
} from "./actor-class";

describe("actor class (OVE-193)", () => {
  it("defaults missing cohort attribution to self_serve", () => {
    expect(actorClassFromPilotCohort(null)).toBe(SELF_SERVE_ACTOR_CLASS);
    expect(actorClassFromPilotCohort(undefined)).toBe(SELF_SERVE_ACTOR_CLASS);
  });

  it("maps pilot cohorts without inventing other classes", () => {
    expect(actorClassFromPilotCohort("closed_pilot")).toBe("closed_pilot");
    expect(actorClassFromPilotCohort("founder_rehearsal")).toBe(
      "founder_rehearsal",
    );
  });

  it("accepts only the bounded enum set", () => {
    expect(ACTOR_CLASSES).toContain("production_smoke");
    expect(ACTOR_CLASSES).toContain("editorial");
    expect(ACTOR_CLASSES).toContain("visual_fixture");
    expect(isActorClass("self_serve")).toBe(true);
    expect(isActorClass("invited_cohort")).toBe(false);
    expect(isActorClass("user-123")).toBe(false);
  });
});
