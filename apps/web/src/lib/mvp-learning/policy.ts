export const MVP_LEARNING_POLICY_VERSION = "ove200.learning.v1" as const;

export const MVP_LEARNING_POLICY_DATE = "2026-07-24" as const;

export type MvpLearningPolicyVersion = typeof MVP_LEARNING_POLICY_VERSION;

export const MVP_LEARNING_DECISION_ELIGIBLE_CONTENT_CLASSES = [
  "real_ugc",
  "founder_first_hand",
] as const;

export type MvpLearningDecisionEligibleContentClass =
  (typeof MVP_LEARNING_DECISION_ELIGIBLE_CONTENT_CLASSES)[number];

export function isMvpLearningDecisionEligibleContentClass(
  value: unknown,
): value is MvpLearningDecisionEligibleContentClass {
  return (
    typeof value === "string" &&
    (MVP_LEARNING_DECISION_ELIGIBLE_CONTENT_CLASSES as readonly string[]).includes(
      value,
    )
  );
}
