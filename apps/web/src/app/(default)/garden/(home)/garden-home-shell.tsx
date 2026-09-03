import type { ReactNode } from "react";

import {
  WorkspaceSectionSkeleton,
  WorkspaceShell,
} from "@/components/garden/workspace-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";

export const GARDEN_HOME_PATH = "/garden";

/**
 * The workspace home's shell, shared by the page and by `loading.tsx` so the
 * heading is in the same place before and after the data arrives (ADR-0023).
 *
 * The description is the neutral one on purpose. Choosing between "returning"
 * and "empty" needs the inventory count, and a header that waits for a count is
 * the thing this restructure exists to remove; the empty case is still answered
 * below, by the next-action block that streams in with the data.
 */
export function GardenHomeShell({
  locale,
  state,
  children,
}: {
  locale: InterfaceLocale;
  state?: "loading";
  children: ReactNode;
}) {
  const copy = getInterfaceCopy(locale);
  const workspaceCopy = getGardenWorkspaceCopy(locale);

  return (
    <WorkspaceShell
      surface="garden-home"
      locale={locale}
      state={state}
      bleed
      eyebrow={workspaceCopy.workspace.headerEyebrow}
      title={copy.workspace.title}
      description={copy.workspace.returningDescription}
    >
      {children}
    </WorkspaceShell>
  );
}

/**
 * The fallback for the streamed half of the home page. It mirrors what arrives:
 * the next-action block, the four-fact strip, then the inventory and recent
 * lists, so nothing above the fold moves when the read model lands.
 */
export function GardenHomeSectionsSkeleton({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  const copy = getGardenWorkspaceCopy(locale).workspace;

  return (
    <div data-garden-workspace="loading" className="flex flex-col">
      <div className="px-4 sm:px-6">
        <section className="border-b border-border py-6">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-8 w-2/3" />
          <Skeleton className="mt-3 h-4 w-full max-w-xl" />
        </section>
      </div>
      <div className="grid grid-cols-2 border-b border-border bg-foreground p-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="mx-2 h-12 bg-background/20" />
        ))}
      </div>
      <div className="flex flex-col gap-10 px-4 py-8 sm:px-6">
        <WorkspaceSectionSkeleton
          locale={locale}
          title={copy.inventory.title}
          rows={4}
        />
        <WorkspaceSectionSkeleton
          locale={locale}
          title={copy.recent.title}
          rows={3}
          media={false}
        />
      </div>
    </div>
  );
}
