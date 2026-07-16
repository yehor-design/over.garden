"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { useSiteShellLocale } from "@/components/site-shell/site-shell-locale-context";
import { Button } from "@/components/ui/button";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";

export default function GardenError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  void error;
  const locale = useSiteShellLocale();
  const copy = getGardenWorkspaceCopy(locale).workspace.error;

  return (
    <main
      lang={locale}
      data-garden-workspace="unexpected-error"
      className="mx-auto flex w-full max-w-4xl flex-col px-4 py-8 sm:px-6"
    >
      <section className="border-y border-border py-8">
        <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-semibold text-foreground">
          {copy.title}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
        <Button type="button" onClick={reset} className="mt-4">
          <RefreshCw aria-hidden="true" />
          {copy.retry}
        </Button>
      </section>
    </main>
  );
}
