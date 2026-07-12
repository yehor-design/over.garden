"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function GardenError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  void error;

  return (
    <main
      data-garden-workspace="unexpected-error"
      className="mx-auto flex w-full max-w-4xl flex-col px-4 py-8 sm:px-6"
    >
      <section className="border-y border-border py-8">
        <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-semibold text-foreground">
          Your garden could not be loaded
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          The shared product navigation is still available, and no garden data
          was changed. Retry the owner-scoped readback when you are ready.
        </p>
        <Button type="button" onClick={reset} className="mt-4">
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      </section>
    </main>
  );
}
