"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { INTERFACE_SERVER_ACTION_PENDING_VISUAL_FIXTURE_DELAY_MS } from "@/lib/localization/localization-visual-fixture";

interface InterfaceServerActionPendingFixtureProps {
  action: () => Promise<void>;
}

/** Visible only on the exact local visual-fixture route selected by the page. */
export function InterfaceServerActionPendingFixture({
  action,
}: InterfaceServerActionPendingFixtureProps) {
  return (
    <section
      data-interface-server-action-pending-fixture="true"
      data-interface-server-action-delay-ms={
        INTERFACE_SERVER_ACTION_PENDING_VISUAL_FIXTURE_DELAY_MS
      }
      className="fixed right-4 bottom-4 z-50 grid max-w-72 gap-2 rounded-lg border border-border bg-background p-3 text-sm text-foreground shadow-lg"
    >
      <form action={action} data-interface-locale-form="ignore">
        <FixtureSubmitState />
      </form>
    </section>
  );
}

function FixtureSubmitState() {
  const { pending } = useFormStatus();

  return (
    <div className="flex items-center gap-2">
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        data-interface-server-action-submit="true"
        data-pending={pending ? "true" : "false"}
      >
        {pending ? "Action pending" : "Start held action"}
      </Button>
      <span
        role="status"
        aria-live="polite"
        data-interface-server-action-status={pending ? "pending" : "ready"}
      >
        {pending ? "Pending" : "Ready"}
      </span>
    </div>
  );
}
