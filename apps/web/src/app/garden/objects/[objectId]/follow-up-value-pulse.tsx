"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  FOLLOW_UP_USEFULNESS_OPTIONS,
  FOLLOW_UP_USEFULNESS_REASON_OPTIONS,
  type FollowUpUsefulness,
  type FollowUpUsefulnessReason,
} from "@/lib/garden/follow-up-value-pulse";

interface FollowUpValuePulseProps {
  objectId: string;
  journalEntryId: string;
}

type PulsePhase = "prompt" | "reason" | "done";

export function FollowUpValuePulse({
  objectId,
  journalEntryId,
}: FollowUpValuePulseProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<PulsePhase>("prompt");
  const [usefulness, setUsefulness] = useState<FollowUpUsefulness | null>(
    null,
  );
  const [usefulnessReason, setUsefulnessReason] =
    useState<FollowUpUsefulnessReason | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonOptions = useMemo(
    () => FOLLOW_UP_USEFULNESS_REASON_OPTIONS,
    [],
  );

  async function submitResponse(input: {
    outcome: "submitted" | "skipped";
    usefulness?: FollowUpUsefulness | null;
    usefulnessReason?: FollowUpUsefulnessReason | null;
  }) {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/garden/value-pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantObjectId: objectId,
          journalEntryId,
          outcome: input.outcome,
          usefulness: input.usefulness ?? undefined,
          usefulnessReason: input.usefulnessReason ?? undefined,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Feedback could not be saved.",
        );
      }

      setPhase("done");
      router.replace(`/garden/objects/${objectId}`);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Feedback could not be saved.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleUsefulnessSelect(value: FollowUpUsefulness) {
    setUsefulness(value);
    setUsefulnessReason(null);
    setPhase("reason");
  }

  if (phase === "done") {
    return null;
  }

  return (
    <section
      aria-live="polite"
      className="grid gap-4 rounded-lg border border-border bg-muted/30 p-4"
    >
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          Quick private check-in
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          After adding this follow-up, does this plant record feel worth
          keeping? Your answer stays private and helps us improve the pilot.
        </p>
      </div>

      {phase === "prompt" ? (
        <div className="flex flex-wrap gap-2">
          {FOLLOW_UP_USEFULNESS_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleUsefulnessSelect(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-foreground">
            Optional: what mattered most?
          </p>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Reason (optional)</span>
            <select
              value={usefulnessReason ?? ""}
              disabled={isSubmitting}
              onChange={(event) =>
                setUsefulnessReason(
                  event.target.value
                    ? (event.target.value as FollowUpUsefulnessReason)
                    : null,
                )
              }
              className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
            >
              <option value="">Skip reason</option>
              {reasonOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={isSubmitting || !usefulness}
              onClick={() =>
                submitResponse({
                  outcome: "submitted",
                  usefulness,
                  usefulnessReason,
                })
              }
            >
              Send feedback
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setPhase("prompt")}
            >
              Back
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="ghost"
          disabled={isSubmitting}
          onClick={() => submitResponse({ outcome: "skipped" })}
        >
          Skip for now
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
