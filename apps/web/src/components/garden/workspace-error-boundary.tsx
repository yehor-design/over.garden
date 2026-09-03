"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { useSiteShellLocale } from "@/components/site-shell/site-shell-locale-context";
import { Button } from "@/components/ui/button";
import {
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";

/**
 * The panel every `error.tsx` under `/garden/**` renders, and the exact place
 * ADR-0023's limit belongs.
 *
 * This boundary is real coverage for a client-side navigation and for a client
 * render error. It is **not** the mechanism for a hard load: under Cache
 * Components a Server Component that throws while a postponed response is
 * resumed leaves its Suspense boundary pending, no `$RX` instruction is
 * written, and this component is never mounted. That is why no workspace page
 * awaits a throwing read — the failure states people actually see are rendered
 * values, and this panel is the backstop for the paths where React can still
 * hand us the error.
 *
 * The digest is printed because it is the only string that ties what the reader
 * sees to the `onRequestError` line in the platform log.
 */
export function WorkspaceErrorPanel({
  error,
  retry,
  surface,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  surface: string;
}) {
  const locale = useSiteShellLocale();
  const copy = getGardenWorkspaceCopy(locale).workspace;

  return (
    <main
      lang={locale}
      data-workspace-surface={surface}
      data-garden-workspace="unexpected-error"
      className="mx-auto flex w-full max-w-4xl flex-col px-4 py-8 sm:px-6"
    >
      <section className="border-y border-border py-8">
        <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-semibold text-foreground">
          {copy.error.title}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {copy.error.description}
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {formatGardenWorkspaceTemplate(copy.sectionError.reference, {
              digest: error.digest,
            })}
          </p>
        ) : null}
        <Button type="button" onClick={() => retry()} className="mt-4">
          <RefreshCw aria-hidden="true" />
          {copy.error.retry}
        </Button>
      </section>
    </main>
  );
}
