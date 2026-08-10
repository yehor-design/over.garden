"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  createDocumentMutationRequestHeaders,
  useOptionalDocumentMutationGeneration,
} from "@/components/auth/document-mutation-recovery";
import {
  FOLLOW_UP_USEFULNESS_OPTIONS,
  FOLLOW_UP_USEFULNESS_REASON_OPTIONS,
  type FollowUpUsefulness,
  type FollowUpUsefulnessReason,
} from "@/lib/garden/follow-up-value-pulse";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getOwnerObjectCopy,
  type OwnerObjectCopy,
} from "@/lib/owner-object-copy";

interface FollowUpValuePulseProps {
  locale: InterfaceLocale;
  objectId: string;
  journalEntryId: string;
}

type PulsePhase = "prompt" | "reason" | "done";

export function FollowUpValuePulse({
  locale,
  objectId,
  journalEntryId,
}: FollowUpValuePulseProps) {
  const copy = getOwnerObjectCopy(locale).valuePulse;
  const router = useRouter();
  const documentMutation = useOptionalDocumentMutationGeneration();
  const [phase, setPhase] = useState<PulsePhase>("prompt");
  const [usefulness, setUsefulness] = useState<FollowUpUsefulness | null>(null);
  const [usefulnessReason, setUsefulnessReason] =
    useState<FollowUpUsefulnessReason | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        headers: {
          "Content-Type": "application/json",
          ...createDocumentMutationRequestHeaders(documentMutation?.transport),
        },
        body: JSON.stringify({
          plantObjectId: objectId,
          journalEntryId,
          outcome: input.outcome,
          usefulness: input.usefulness ?? undefined,
          usefulnessReason: input.usefulnessReason ?? undefined,
        }),
      });

      if (await documentMutation?.handleResponse(response)) return;
      if (!response.ok) {
        throw new Error(copy.error);
      }

      setPhase("done");
      router.replace(`/garden/objects/${objectId}`);
      router.refresh();
    } catch {
      setError(copy.error);
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
        <h2 className="text-lg font-semibold text-foreground">{copy.title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
      </div>

      {phase === "prompt" ? (
        <div className="flex flex-wrap gap-2">
          {FOLLOW_UP_USEFULNESS_OPTIONS.map((option) => (
            <Button
              key={option}
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleUsefulnessSelect(option)}
            >
              {usefulnessLabel(option, copy)}
            </Button>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-foreground">{copy.optionalPrompt}</p>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">{copy.reasonLabel}</span>
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
              <option value="">{copy.skipReason}</option>
              {FOLLOW_UP_USEFULNESS_REASON_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {reasonLabel(option, copy)}
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
              {copy.send}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setPhase("prompt")}
            >
              {copy.back}
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
          {copy.skip}
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

function usefulnessLabel(
  value: FollowUpUsefulness,
  copy: OwnerObjectCopy["valuePulse"],
) {
  if (value === "useful") return copy.usefulness.useful;
  if (value === "not_sure") return copy.usefulness.notSure;
  return copy.usefulness.notUseful;
}

function reasonLabel(
  value: FollowUpUsefulnessReason,
  copy: OwnerObjectCopy["valuePulse"],
) {
  switch (value) {
    case "history_felt_worth_keeping":
      return copy.reasons.historyWorthKeeping;
    case "easy_to_add_update":
      return copy.reasons.easyToAdd;
    case "prior_entries_helped":
      return copy.reasons.priorEntriesHelped;
    case "felt_redundant":
      return copy.reasons.feltRedundant;
    case "hard_to_find_what_i_needed":
      return copy.reasons.hardToFind;
    case "not_sure_why":
      return copy.reasons.notSureWhy;
  }
}
