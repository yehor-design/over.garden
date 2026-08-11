import { describe, expect, it } from "vitest";

import {
  ACTOR_CLASSES,
  AUTOMATED_BOT_ACTOR_CLASS,
  EDITORIAL_SEED_ACTOR_CLASS,
  isActorClass,
  isDecisionEligibleActorClass,
  isExcludedLearningActorClass,
  normalizeActorClass,
  REAL_SELF_SERVE_ACTOR_CLASS,
  SELF_SERVE_ACTOR_CLASS,
} from "./actor-class";

describe("actor class (OVE-200)", () => {
  it("keeps self-serve as the only real-user learning class", () => {
    expect(SELF_SERVE_ACTOR_CLASS).toBe(REAL_SELF_SERVE_ACTOR_CLASS);
    expect(ACTOR_CLASSES).toEqual([
      "real_self_serve",
      "production_smoke",
      "visual_fixture",
      "editorial_seed",
      "automated_bot",
    ]);
  });

  it("accepts only the bounded OVE-200 enum set", () => {
    expect(ACTOR_CLASSES).toContain("production_smoke");
    expect(ACTOR_CLASSES).toContain(EDITORIAL_SEED_ACTOR_CLASS);
    expect(ACTOR_CLASSES).toContain("visual_fixture");
    expect(ACTOR_CLASSES).toContain(AUTOMATED_BOT_ACTOR_CLASS);
    expect(isActorClass("real_self_serve")).toBe(true);
    expect(isActorClass("self_serve")).toBe(false);
    expect(isActorClass("invited_cohort")).toBe(false);
    expect(isActorClass("user-123")).toBe(false);
  });

  it("normalizes legacy aliases without inventing unclassified as real", () => {
    expect(normalizeActorClass("self_serve")).toBe(REAL_SELF_SERVE_ACTOR_CLASS);
    expect(normalizeActorClass("closed_pilot")).toBeNull();
    expect(normalizeActorClass("editorial")).toBe(EDITORIAL_SEED_ACTOR_CLASS);
    expect(normalizeActorClass(null)).toBeNull();
    expect(normalizeActorClass("mystery")).toBeNull();
  });

  it("separates decision-eligible from excluded learning classes", () => {
    expect(isDecisionEligibleActorClass("real_self_serve")).toBe(true);
    expect(isDecisionEligibleActorClass("self_serve")).toBe(true);
    expect(isDecisionEligibleActorClass("founder_rehearsal")).toBe(false);
    expect(isExcludedLearningActorClass("visual_fixture")).toBe(true);
    expect(isExcludedLearningActorClass("real_closed_pilot")).toBe(false);
  });
});
