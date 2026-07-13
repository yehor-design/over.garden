"use client";

import Link from "next/link";
import { CheckCircle2, Play, RotateCcw } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VisualJournalCreationControlsProps {
  scenarioId: string;
  startPath: string;
  postSavePath: string | null;
  expectedServerWrite: boolean;
}

type Action = "reset" | "run" | "verify";

export function VisualJournalCreationControls({
  scenarioId,
  startPath,
  postSavePath,
  expectedServerWrite,
}: VisualJournalCreationControlsProps) {
  const [pending, setPending] = useState<Action | null>(null);
  const [status, setStatus] = useState(
    expectedServerWrite
      ? "Reset before a clean run, or submit the real form."
      : "Submit the real form to create owner-scoped device state.",
  );

  async function execute(action: Action) {
    setPending(action);
    setStatus(`${actionLabel(action)} in progress...`);

    try {
      const response = await fetch("/api/__visual-fixtures/journal-creation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, scenarioId }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: unknown;
        duplicateStable?: unknown;
      } | null;
      if (!response.ok) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Scenario action failed.",
        );
      }

      setStatus(
        action === "run" && body?.duplicateStable === true
          ? "Canonical run complete; duplicate contract is stable."
          : `${actionLabel(action)} complete.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Scenario action failed.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-auto grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending !== null}
          onClick={() => void execute("reset")}
          title="Delete only this scenario's expected rows"
        >
          <RotateCcw aria-hidden="true" />
          Reset
        </Button>
        {expectedServerWrite ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => void execute("run")}
            title="Run the canonical journal repository path"
          >
            <Play aria-hidden="true" />
            Run
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending !== null}
          onClick={() => void execute("verify")}
          title="Verify exact scenario-owned rows and preconditions"
        >
          <CheckCircle2 aria-hidden="true" />
          Verify
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={startPath}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          Open form
        </Link>
        {postSavePath ? (
          <Link
            href={postSavePath}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Open result
          </Link>
        ) : null}
      </div>
      <p
        aria-live="polite"
        className={cn(
          "text-xs leading-5 text-muted-foreground",
          /failed|missing|unexpected|requires/i.test(status) &&
            "text-destructive",
        )}
      >
        {status}
      </p>
    </div>
  );
}

function actionLabel(action: Action) {
  return {
    reset: "Reset",
    run: "Canonical run",
    verify: "Verification",
  }[action];
}
