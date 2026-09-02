"use client";

import { RotateCcw } from "lucide-react";

import { useSiteShellLocale } from "@/components/site-shell/site-shell-locale-context";
import { Button } from "@/components/ui/button";
import { getInterfaceCopy } from "@/lib/interface-localization";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useSiteShellLocale();
  const copy = getInterfaceCopy(locale);

  return (
    <main
      lang={locale}
      data-site-shell-state="error"
      className="mx-auto flex min-h-112 w-full max-w-3xl flex-col justify-center gap-5 px-5 py-12 sm:px-8"
    >
      <p className="text-sm font-medium text-muted-foreground">
        {copy.shell.errorEyebrow}
      </p>
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {copy.shell.errorTitle}
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          {copy.shell.errorDescription}
        </p>
      </div>
      <Button type="button" onClick={reset} className="w-fit">
        <RotateCcw data-icon="inline-start" aria-hidden="true" />
        {copy.shell.retry}
      </Button>
    </main>
  );
}
