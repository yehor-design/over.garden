"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, RotateCw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  WORKSPACE_LOADING_SCHEDULE,
  type WorkspaceLoadingStage,
} from "@/lib/garden/workspace-loading-thresholds";

/**
 * The retry a failed section offers.
 *
 * It is an anchor first and a handler second, on purpose. Before hydration —
 * and if the bundle never arrives at all, which is a live possibility on the
 * very request where the database just failed — the link is the only working
 * control on the panel. Once hydrated, the click is intercepted and becomes
 * `router.refresh()`, which re-requests the route without discarding client
 * state, so an open composer survives the attempt.
 */
export function WorkspaceSectionRetry({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const router = useRouter();

  return (
    <a
      href={href}
      data-workspace-retry="section"
      className={buttonVariants({
        variant: "outline",
        size: "sm",
        className: "mt-4",
      })}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        router.refresh();
      }}
    >
      <RefreshCw aria-hidden="true" />
      {label}
    </a>
  );
}

/**
 * Sits inside every skeleton. It says nothing for ten seconds, then
 * acknowledges the wait in a live region, then offers a reload at thirty. It
 * never reloads by itself: a page that reloads itself can destroy an unsaved
 * composer draft, and under ADR-0022 D3 a draft has nowhere else to live.
 */
export function WorkspaceLoadingWatchdog({
  stillLoadingLabel,
  reloadLabel,
}: {
  stillLoadingLabel: string;
  reloadLabel: string;
}) {
  const [stage, setStage] = useState<WorkspaceLoadingStage>("none");

  useEffect(() => {
    const timers = WORKSPACE_LOADING_SCHEDULE.map((step) =>
      setTimeout(() => setStage(step.stage), step.delayMs),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  return (
    <WorkspaceLoadingWatchdogView
      stage={stage}
      stillLoadingLabel={stillLoadingLabel}
      reloadLabel={reloadLabel}
    />
  );
}

/**
 * What each stage looks like. Separated from the timing so both halves can be
 * proven: the thresholds as values, the states as markup.
 */
export function WorkspaceLoadingWatchdogView({
  stage,
  stillLoadingLabel,
  reloadLabel,
}: {
  stage: WorkspaceLoadingStage;
  stillLoadingLabel: string;
  reloadLabel: string;
}) {
  return (
    <div
      data-workspace-watchdog={stage}
      aria-live="polite"
      className="mt-3 flex flex-wrap items-center gap-3"
    >
      {stage === "none" ? null : (
        <p className="text-sm text-muted-foreground">{stillLoadingLabel}</p>
      )}
      {stage === "reload" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
        >
          <RotateCw aria-hidden="true" />
          {reloadLabel}
        </Button>
      ) : null}
    </div>
  );
}
