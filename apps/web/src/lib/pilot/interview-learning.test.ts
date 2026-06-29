import { describe, expect, it } from "vitest";

import {
  findForbiddenInterviewCaptureContent,
  normalizePilotInterviewLearningInput,
} from "@/lib/pilot/interview-learning";

describe("founder interview capture validation", () => {
  const baseInput = {
    segment: "casual_practical_beginner",
    activationResult: "activated_first_entry_only",
    returnReason: "never_returned",
    mainObjection: "no_clear_value",
    observedValue: "no_clear_value_yet",
    nextAction: "schedule_follow_up",
  };

  it("accepts bounded enum fields without forbidden content", () => {
    const result = normalizePilotInterviewLearningInput({
      ...baseInput,
      redactedNote: "Wants easier repeat capture next season.",
      subjectUserId: "00000000-0000-4000-8000-000000000001",
      pilotCohort: "closed_pilot",
    });

    expect(result.ok).toBe(true);
  });

  it("accepts founder rehearsal as a bounded pilot cohort", () => {
    const result = normalizePilotInterviewLearningInput({
      ...baseInput,
      pilotCohort: "founder_rehearsal",
    });

    expect(result.ok).toBe(true);
  });

  it("rejects journal body fragments in redacted notes", () => {
    const result = normalizePilotInterviewLearningInput({
      ...baseInput,
      redactedNote: "They said the journal body was too long.",
    });

    expect(result).toEqual({
      ok: false,
      error: "Interview capture rejected forbidden content (body).",
    });
  });

  it("rejects media keys in redacted notes", () => {
    const result = normalizePilotInterviewLearningInput({
      ...baseInput,
      redactedNote: "Mentioned quarantine/original upload worry.",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("quarantine");
  });

  it("rejects email addresses in redacted notes", () => {
    const result = normalizePilotInterviewLearningInput({
      ...baseInput,
      redactedNote: "Reach them at gardener@example.com later.",
    });

    expect(result).toEqual({
      ok: false,
      error: "Interview capture rejected forbidden content (email).",
    });
  });

  it("flags signed URLs and transcripts via forbidden fragment scan", () => {
    expect(
      findForbiddenInterviewCaptureContent(["https://signed.example/url"]),
    ).toBe("https://");
    expect(
      findForbiddenInterviewCaptureContent(["full transcript pasted here"]),
    ).toBe("transcript");
  });
});
